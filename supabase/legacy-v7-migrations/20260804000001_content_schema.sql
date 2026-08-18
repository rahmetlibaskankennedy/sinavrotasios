-- ============================================================================
-- MEBGYS içerik şeması: kategoriler, konular, sorular, kartlar, sınav planı,
-- denemeler. Statik JSON dosyalarının yerini alır.
-- ============================================================================

-- ---------- 0) profiles -----------------------------------------------------
-- Temiz `supabase db reset` ortamlarında auth.users vardır ancak uygulama
-- profili henüz yoktur. Önce temel tabloyu kur, sonra sonraki mutabakat
-- migration'larının ek sütunları idempotent biçimde eklemesine izin ver.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text,
  progress jsonb not null default '{}'::jsonb,
  is_premium boolean not null default false,
  premium_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 0.1) profiles.is_admin -----------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Admin kontrolü için yardımcı fonksiyon (RLS politikalarında kullanılacak).
-- security definer: profiles tablosuna RLS engeline takılmadan bakabilsin.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------- 1) categories ----------------------------------------------------
create table if not exists public.categories (
  id text primary key,
  title text not null,
  subtitle text,
  icon text,
  icon_class text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 2) topics (kategori ağacı: topic / document / section) ---------
-- categorytopics.json'daki tüm düğümler (üst konular, kanunlar ve alt bölümler)
-- ve sadece exam-blueprint/topics-taxonomy.json'da geçen ek konular burada yaşar.
create table if not exists public.topics (
  id text primary key,
  category_id text references public.categories(id) on delete cascade,
  parent_id text references public.topics(id) on delete cascade,
  type text not null check (type in ('topic', 'document', 'section', 'exam_topic')),
  title text not null,
  document_number text,
  article_range text,
  article_count int,
  question_count int,
  kadrolar text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists topics_category_id_idx on public.topics(category_id);
create index if not exists topics_parent_id_idx on public.topics(parent_id);

-- ---------- 3) questions (sorular/*.json ana soru bankası) ------------------
create table if not exists public.questions (
  id text primary key,
  topic_id text not null references public.topics(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  answer_index int not null,
  explanation text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists questions_topic_id_idx on public.questions(topic_id);

-- ---------- 4) card_decks (cards/*.json) -------------------------------------
-- İki farklı "kart" türünü barındırır:
--   'quiz'      -> card_questions (çoktan seçmeli pratik kartları, taxonomy'den)
--   'flashcard' -> flashcards (soru/cevap çevirme kartları, CARD_CATALOGUE'dan)
create table if not exists public.card_decks (
  id text primary key,
  title text,
  deck_type text not null default 'quiz' check (deck_type in ('quiz', 'flashcard')),
  category_id text references public.categories(id),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.card_questions (
  id text primary key,
  deck_id text not null references public.card_decks(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  answer_index int not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists card_questions_deck_id_idx on public.card_questions(deck_id);

create table if not exists public.flashcards (
  id bigint generated always as identity primary key,
  deck_id text not null references public.card_decks(id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flashcards_deck_id_idx on public.flashcards(deck_id);
create unique index if not exists flashcards_deck_sort_key on public.flashcards(deck_id, sort_order);

-- ---------- 5) exam_topics (topics-taxonomy.json) ---------------------------
-- Sınav planında ağırlıklandırılan konu listesi. Her biri ya `topics` (sorular
-- bankası) ya da `card_decks` (kart bankası) tablosundan birine bağlanır.
create table if not exists public.exam_topics (
  topic_id text primary key,
  title text not null,
  category_id text references public.categories(id),
  status text not null default 'demo' check (status in ('demo', 'real')),
  question_source text not null check (question_source in ('sorular', 'cards')),
  linked_topic_id text references public.topics(id),
  card_deck_id text references public.card_decks(id),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_topics_source_link_chk check (
    (question_source = 'sorular' and linked_topic_id is not null and card_deck_id is null) or
    (question_source = 'cards' and card_deck_id is not null and linked_topic_id is null)
  )
);

-- ---------- 6) exam_kadrolar + exam_blueprint_items (exam-blueprint.json) --
create table if not exists public.exam_kadrolar (
  kadro text primary key,
  duration_minutes int not null
);

create table if not exists public.exam_blueprint_items (
  id bigint generated always as identity primary key,
  kadro text not null references public.exam_kadrolar(kadro) on delete cascade,
  topic_id text not null references public.exam_topics(topic_id) on delete cascade,
  question_count int not null,
  sort_order int not null default 0,
  unique (kadro, topic_id)
);

-- ---------- 7) denemeler (yeni: admin'in elle oluşturduğu numaralı sınavlar) -
create table if not exists public.denemeler (
  id bigint generated always as identity primary key,
  title text not null,
  kadro text references public.exam_kadrolar(kadro),
  duration_minutes int,
  is_published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deneme_questions (
  id bigint generated always as identity primary key,
  deneme_id bigint not null references public.denemeler(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  answer_index int not null,
  sort_order int not null default 0
);
create index if not exists deneme_questions_deneme_id_idx on public.deneme_questions(deneme_id);

-- ---------- 8) updated_at otomatik güncelleme -------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['categories','topics','questions','card_decks','card_questions','flashcards','exam_topics','denemeler']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;
