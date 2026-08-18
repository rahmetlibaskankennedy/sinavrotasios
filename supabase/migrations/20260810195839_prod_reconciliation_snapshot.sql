-- ============================================================================
-- H-02 MUTABAKAT (RECONCILIATION) MİGRASYONU — 2026-08-10
--
-- Bu dosya, production Supabase projesinde (zrlsllbgqrllwgjyqbfv) zaman
-- içinde Studio/MCP üzerinden elle uygulanmış ama repoya hiç yansımamış
-- değişiklikleri geri yazar. Production'daki gerçek migration geçmişi
-- (bkz. `supabase migration list`) şu adları içeriyor ve bunların SQL
-- gövdeleri Management API üzerinden tek tek geri alınamıyor:
--   add_show_in_catalog_to_topics, protect_profiles_admin_role_columns,
--   add_missing_performance_indexes, add_profiles_admin_policies,
--   create_question_feedback_table, remove_3071_deck_not_meb_gys_topic,
--   lock_profiles_sensitive_columns, protect_privileged_profile_columns,
--   fix_set_updated_at_search_path, gate_denemeler_behind_premium,
--   fix_denemeler_admin_visibility, drop_stale_protect_admin_trigger,
--   limit_free_flashcard_preview
--
-- Bu yüzden ayrı ayrı yeniden üretmek yerine, canlı veritabanının GERÇEK
-- NİHAİ HALİ (introspection ile doğrulanmış) tek bir idempotent migration
-- olarak buraya yazılıyor. Böylece temiz bir ortamda `supabase db reset`
-- çalıştırıldığında production ile AYNI şema ve güvenlik kuralları oluşur.
-- Bu migration production'a TEKRAR uygulanmayacak (zaten uygulanmış durumda);
-- sadece repo/CLI/yeni ortamlar için yazıldı.
-- ============================================================================

-- ---------- 1) profiles: eksik sütunlar -------------------------------------
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists target_exam text default 'MEB GYS';
alter table public.profiles add column if not exists daily_goal integer default 20;

-- ---------- 2) topics: eksik sütunlar (özet/anahtar noktalar, katalog filtresi)
alter table public.topics add column if not exists show_in_catalog boolean not null default true;
alter table public.topics add column if not exists summary text;
alter table public.topics add column if not exists key_points text[];

-- ---------- 3) topic_free_attempts: ücretsiz "rastgele test" hak sayacı ----
create table if not exists public.topic_free_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  attempts_used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);
alter table public.topic_free_attempts enable row level security;
create policy "topic_free_attempts_own_read" on public.topic_free_attempts
  for select using (auth.uid() = user_id);

-- ---------- 4) question_feedback: "soru bildir" akışının kalıcı kaydı ------
create table if not exists public.question_feedback (
  id bigint generated always as identity primary key,
  question_id text references public.questions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  message text,
  status text not null default 'open' check (status in ('open', 'retracted', 'resolved')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists question_feedback_question_id_idx on public.question_feedback(question_id);
create index if not exists question_feedback_user_id_idx on public.question_feedback(user_id);
create index if not exists question_feedback_status_idx on public.question_feedback(status);
alter table public.question_feedback enable row level security;
-- Oluşturma yalnız report-question Edge Function'ı (service_role) ile yapılır;
-- istemci için INSERT politikası yoktur.

-- ---------- 5) performans indexleri -----------------------------------------
create index if not exists questions_topic_sort_idx on public.questions(topic_id, sort_order);

-- ---------- 6) is_premium(): süre + admin bypass ----------------------------
create or replace function public.is_premium()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() or coalesce(
    (select is_premium and (premium_until is null or premium_until > now())
     from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------- 7) handle_new_user(): profil satırını full_name ile oluştur ----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 7.1) yönetim ve yalnız-sayı RPC'leri ---------------------------
-- Production'da daha önce Studio üzerinden eklenmiş bu fonksiyonlar içerik
-- uygulamasının yönetim ve katalog sayaç sözleşmesinin parçasıdır. Temiz
-- ortamda aynı sözleşmenin oluşması için burada yeniden tanımlanırlar.
create or replace function public.admin_search_users(p_query text default '')
returns table(id uuid, email text, is_admin boolean, is_premium boolean, premium_until timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  return query
    select u.id, u.email::text, coalesce(p.is_admin, false), coalesce(p.is_premium, false), p.premium_until
    from auth.users u left join public.profiles p on p.id = u.id
    where p_query is null or p_query = '' or u.email ilike '%' || p_query || '%'
    order by u.email limit 30;
end;
$$;

create or replace function public.admin_set_premium(p_user_id uuid, p_is_premium boolean, p_premium_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  update public.profiles
  set is_premium = p_is_premium,
      premium_until = case when p_is_premium then p_premium_until else null end
  where id = p_user_id;
  if not found then raise exception 'Kullanıcı profili bulunamadı (id: %)', p_user_id; end if;
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if p_user_id is null then raise exception 'Silinecek kullanıcı belirtilmedi.'; end if;
  if auth.uid() is null or not public.is_admin() then raise exception 'Bu işlem için yönetici yetkisi gerekir.'; end if;
  if p_user_id = auth.uid() then raise exception 'Kendi yönetici hesabınızı bu panelden silemezsiniz.'; end if;
  delete from auth.users where id = p_user_id;
  if not found then raise exception 'Kullanıcı bulunamadı veya daha önce silinmiş.'; end if;
end;
$$;

create or replace function public.get_flashcard_count(p_deck_id text)
returns integer
language sql
stable security definer
set search_path = public, pg_temp
as $$ select count(*)::int from public.flashcards where deck_id = p_deck_id; $$;

create or replace function public.get_topic_question_count(p_topic_ids text[])
returns integer
language sql
stable security definer
set search_path = public, pg_temp
as $$ select count(*)::int from public.questions where topic_id = any(p_topic_ids); $$;

-- ---------- 8) set_updated_at(): search_path sabitlendi ---------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- 9) get_random_test_questions(): kalıcı sayaç + satır kilidi ----
-- (Eski repo tasarımı `profiles.progress` içinde JSON sayaç tutuyordu; canlı
-- ortamda bunun yerine ayrı `topic_free_attempts` tablosu ve `for update`
-- satır kilidi kullanılıyor — eşzamanlı çift istekle hak sayacının atlanmasını
-- engelliyor. Repo bu daha sağlam tasarıma güncellendi.)
create or replace function public.get_random_test_questions(p_topic_ids text[], p_topic_key text)
returns setof public.questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  if public.is_premium() then
    return query
      select * from public.questions
      where topic_id = any(p_topic_ids)
      order by random()
      limit 20;
    return;
  end if;

  select attempts_used into v_used
  from public.topic_free_attempts
  where user_id = auth.uid() and topic_id = p_topic_key
  for update;

  if v_used is null then
    insert into public.topic_free_attempts (user_id, topic_id, attempts_used)
    values (auth.uid(), p_topic_key, 1);
  elsif v_used >= 2 then
    raise exception 'FREE_LIMIT_REACHED' using errcode = 'P0001';
  else
    update public.topic_free_attempts
    set attempts_used = attempts_used + 1, updated_at = now()
    where user_id = auth.uid() and topic_id = p_topic_key;
  end if;

  return query
    select * from public.questions
    where topic_id = any(p_topic_ids)
    order by random()
    limit 10;
end;
$$;

-- ---------- 10) C-02: questions/card_questions doğrudan SELECT'e KAPALI ----
-- Anon/authenticated artık bu tablolara asla doğrudan erişemiyor; okuma
-- yalnızca is_premium()/is_admin() kontrolü yapan RPC'ler veya aşağıdaki
-- "_premium_read" politikaları üzerinden mümkün.
drop policy if exists "questions_public_read" on public.questions;
drop policy if exists "questions_premium_read" on public.questions;
create policy "questions_premium_read" on public.questions
  for select using (public.is_premium());

drop policy if exists "card_questions_public_read" on public.card_questions;
drop policy if exists "card_questions_premium_read" on public.card_questions;
create policy "card_questions_premium_read" on public.card_questions
  for select using (public.is_premium());

-- ---------- 11) denemeler / deneme_questions: yayınlanmış + premium --------
drop policy if exists "denemeler_read" on public.denemeler;
create policy "denemeler_read" on public.denemeler
  for select using (public.is_admin() or (is_published and public.is_premium()));

drop policy if exists "deneme_questions_read" on public.deneme_questions;
create policy "deneme_questions_read" on public.deneme_questions
  for select using (
    public.is_admin() or exists (
      select 1 from public.denemeler d
      where d.id = deneme_questions.deneme_id
        and d.is_published
        and public.is_premium()
    )
  );

-- ---------- 12) flashcards: ilk 5 kart ücretsiz önizleme --------------------
drop policy if exists "flashcards_public_read" on public.flashcards;
drop policy if exists "flashcards_free_preview_read" on public.flashcards;
create policy "flashcards_free_preview_read" on public.flashcards
  for select using (public.is_premium() or sort_order <= 5);

-- ---------- 13) profiles: nihai RLS politika kümesi -------------------------
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "Kullanıcı kendi profilini görebilir" on public.profiles;
create policy "Kullanıcı kendi profilini görebilir" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "Kullanıcı kendi profilini güncelleyebilir" on public.profiles;
create policy "Kullanıcı kendi profilini güncelleyebilir" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;

drop policy if exists "profiles_admin_read_all" on public.profiles;
create policy "profiles_admin_read_all" on public.profiles
  for select using (public.is_admin());

drop policy if exists "profiles_admin_write_all" on public.profiles;
create policy "profiles_admin_write_all" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

comment on table public.topic_free_attempts is 'Ücretsiz kullanıcının konu başına rastgele test hakkı (2 hak). Yalnız get_random_test_questions() erişir.';
comment on table public.question_feedback is '"Soru bildir" akışının kalıcı kaydı. Yalnız report-question Edge Function (service_role) yazar.';
