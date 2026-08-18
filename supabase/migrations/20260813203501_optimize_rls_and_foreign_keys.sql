-- Canlıda 2026-08-13 tarihinde uygulanan performans sertleştirmesi.
-- Yabancı anahtar indeksleri ve SELECT ile çakışmayan yönetici RLS politikaları.
begin;

create index if not exists card_decks_category_id_idx on public.card_decks(category_id);
create index if not exists exam_blueprint_items_topic_id_idx on public.exam_blueprint_items(topic_id);
create index if not exists exam_topics_card_deck_id_idx on public.exam_topics(card_deck_id);
create index if not exists exam_topics_category_id_idx on public.exam_topics(category_id);
create index if not exists exam_topics_linked_topic_id_idx on public.exam_topics(linked_topic_id);

alter policy "topic_free_attempts_own_read" on public.topic_free_attempts
  using (((select auth.uid()) = user_id));

drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_insert" on public.categories for insert to authenticated with check ((select public.is_admin()));
create policy "categories_admin_update" on public.categories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "categories_admin_delete" on public.categories for delete to authenticated using ((select public.is_admin()));

drop policy if exists "topics_admin_write" on public.topics;
create policy "topics_admin_insert" on public.topics for insert to authenticated with check ((select public.is_admin()));
create policy "topics_admin_update" on public.topics for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "topics_admin_delete" on public.topics for delete to authenticated using ((select public.is_admin()));

drop policy if exists "questions_admin_write" on public.questions;
create policy "questions_admin_insert" on public.questions for insert to authenticated with check ((select public.is_admin()));
create policy "questions_admin_update" on public.questions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "questions_admin_delete" on public.questions for delete to authenticated using ((select public.is_admin()));

drop policy if exists "card_decks_admin_write" on public.card_decks;
create policy "card_decks_admin_insert" on public.card_decks for insert to authenticated with check ((select public.is_admin()));
create policy "card_decks_admin_update" on public.card_decks for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "card_decks_admin_delete" on public.card_decks for delete to authenticated using ((select public.is_admin()));

drop policy if exists "card_questions_admin_write" on public.card_questions;
create policy "card_questions_admin_insert" on public.card_questions for insert to authenticated with check ((select public.is_admin()));
create policy "card_questions_admin_update" on public.card_questions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "card_questions_admin_delete" on public.card_questions for delete to authenticated using ((select public.is_admin()));

drop policy if exists "flashcards_admin_write" on public.flashcards;
create policy "flashcards_admin_insert" on public.flashcards for insert to authenticated with check ((select public.is_admin()));
create policy "flashcards_admin_update" on public.flashcards for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "flashcards_admin_delete" on public.flashcards for delete to authenticated using ((select public.is_admin()));

drop policy if exists "exam_topics_admin_write" on public.exam_topics;
create policy "exam_topics_admin_insert" on public.exam_topics for insert to authenticated with check ((select public.is_admin()));
create policy "exam_topics_admin_update" on public.exam_topics for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "exam_topics_admin_delete" on public.exam_topics for delete to authenticated using ((select public.is_admin()));

drop policy if exists "exam_kadrolar_admin_write" on public.exam_kadrolar;
create policy "exam_kadrolar_admin_insert" on public.exam_kadrolar for insert to authenticated with check ((select public.is_admin()));
create policy "exam_kadrolar_admin_update" on public.exam_kadrolar for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "exam_kadrolar_admin_delete" on public.exam_kadrolar for delete to authenticated using ((select public.is_admin()));

drop policy if exists "exam_blueprint_items_admin_write" on public.exam_blueprint_items;
create policy "exam_blueprint_items_admin_insert" on public.exam_blueprint_items for insert to authenticated with check ((select public.is_admin()));
create policy "exam_blueprint_items_admin_update" on public.exam_blueprint_items for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "exam_blueprint_items_admin_delete" on public.exam_blueprint_items for delete to authenticated using ((select public.is_admin()));

drop policy if exists "denemeler_admin_write" on public.denemeler;
create policy "denemeler_admin_insert" on public.denemeler for insert to authenticated with check ((select public.is_admin()));
create policy "denemeler_admin_update" on public.denemeler for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "denemeler_admin_delete" on public.denemeler for delete to authenticated using ((select public.is_admin()));

drop policy if exists "deneme_questions_admin_write" on public.deneme_questions;
create policy "deneme_questions_admin_insert" on public.deneme_questions for insert to authenticated with check ((select public.is_admin()));
create policy "deneme_questions_admin_update" on public.deneme_questions for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "deneme_questions_admin_delete" on public.deneme_questions for delete to authenticated using ((select public.is_admin()));

commit;
