-- ============================================================================
-- RLS: içerik tabloları herkese (anon dahil) okunabilir, sadece is_admin=true
-- olan kullanıcılar yazabilir. denemeler/deneme_questions için yayınlanmamış
-- (is_published=false) kayıtlar sadece admin'e görünür.
-- ============================================================================

alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.topics enable row level security;
alter table public.questions enable row level security;
alter table public.card_decks enable row level security;
alter table public.card_questions enable row level security;
alter table public.flashcards enable row level security;
alter table public.exam_topics enable row level security;
alter table public.exam_kadrolar enable row level security;
alter table public.exam_blueprint_items enable row level security;
alter table public.denemeler enable row level security;
alter table public.deneme_questions enable row level security;

-- ---- herkese açık okunabilen tablolar --------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories','topics','questions','card_decks','card_questions','flashcards',
    'exam_topics','exam_kadrolar','exam_blueprint_items'
  ]
  loop
    execute format('drop policy if exists "%1$s_public_read" on public.%1$s;', t);
    execute format('create policy "%1$s_public_read" on public.%1$s for select using (true);', t);

    execute format('drop policy if exists "%1$s_admin_write" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_admin_write" on public.%1$s for all using (public.is_admin()) with check (public.is_admin());',
      t
    );
  end loop;
end $$;

-- ---- denemeler: sadece yayınlananlar herkese, taslaklar sadece admin'e ----
drop policy if exists "denemeler_read" on public.denemeler;
create policy "denemeler_read" on public.denemeler
  for select using (is_published or public.is_admin());

drop policy if exists "denemeler_admin_write" on public.denemeler;
create policy "denemeler_admin_write" on public.denemeler
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "deneme_questions_read" on public.deneme_questions;
create policy "deneme_questions_read" on public.deneme_questions
  for select using (
    exists (
      select 1 from public.denemeler d
      where d.id = deneme_questions.deneme_id
        and (d.is_published or public.is_admin())
    )
  );

drop policy if exists "deneme_questions_admin_write" on public.deneme_questions;
create policy "deneme_questions_admin_write" on public.deneme_questions
  for all using (public.is_admin()) with check (public.is_admin());
