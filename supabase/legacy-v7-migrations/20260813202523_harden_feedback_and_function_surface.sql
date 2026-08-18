-- Canlıda 2026-08-13 tarihinde uygulanan güvenlik sertleştirmesi.
-- Edge Function sürüm 5 önce yayımlandığı için user_display kaldırılırken
-- çalışan istemci/fonksiyon artık bu kolona yazmaz.
begin;

alter table public.question_feedback drop column if exists user_display;

drop policy if exists "question_feedback_admin_all" on public.question_feedback;
drop policy if exists "question_feedback_own_insert" on public.question_feedback;
drop policy if exists "question_feedback_own_select" on public.question_feedback;
create policy "question_feedback_select_own_or_admin" on public.question_feedback
  for select to authenticated
  using (((select auth.uid()) = user_id) or (select public.is_admin()));
create policy "question_feedback_admin_update" on public.question_feedback
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "question_feedback_admin_delete" on public.question_feedback
  for delete to authenticated
  using ((select public.is_admin()));
comment on table public.question_feedback is
  'Soru bildirimi kaydı. Oluşturma yalnız report-question Edge Function ile yapılır; kullanıcı gösterim bilgisi saklanmaz.';

drop policy if exists "Kullanıcı kendi profilini görebilir" on public.profiles;
drop policy if exists "Kullanıcı kendi profilini güncelleyebilir" on public.profiles;
drop policy if exists "profiles_admin_read_all" on public.profiles;
drop policy if exists "profiles_admin_write_all" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (((select auth.uid()) = id) or (select public.is_admin()));
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (((select auth.uid()) = id) or (select public.is_admin()))
  with check (((select auth.uid()) = id) or (select public.is_admin()));

alter policy "categories_admin_write" on public.categories to authenticated;
alter policy "categories_public_read" on public.categories to authenticated;
alter policy "topics_admin_write" on public.topics to authenticated;
alter policy "topics_public_read" on public.topics to authenticated;
alter policy "questions_admin_write" on public.questions to authenticated;
alter policy "questions_premium_read" on public.questions to authenticated;
alter policy "card_decks_admin_write" on public.card_decks to authenticated;
alter policy "card_decks_public_read" on public.card_decks to authenticated;
alter policy "card_questions_admin_write" on public.card_questions to authenticated;
alter policy "card_questions_premium_read" on public.card_questions to authenticated;
alter policy "flashcards_admin_write" on public.flashcards to authenticated;
alter policy "flashcards_free_preview_read" on public.flashcards to authenticated;
alter policy "exam_topics_admin_write" on public.exam_topics to authenticated;
alter policy "exam_topics_public_read" on public.exam_topics to authenticated;
alter policy "exam_kadrolar_admin_write" on public.exam_kadrolar to authenticated;
alter policy "exam_kadrolar_public_read" on public.exam_kadrolar to authenticated;
alter policy "exam_blueprint_items_admin_write" on public.exam_blueprint_items to authenticated;
alter policy "exam_blueprint_items_public_read" on public.exam_blueprint_items to authenticated;
alter policy "denemeler_admin_write" on public.denemeler to authenticated;
alter policy "denemeler_read" on public.denemeler to authenticated;
alter policy "deneme_questions_admin_write" on public.deneme_questions to authenticated;
alter policy "deneme_questions_read" on public.deneme_questions to authenticated;
alter policy "topic_free_attempts_own_read" on public.topic_free_attempts to authenticated;

create unique index if not exists flashcards_deck_sort_key on public.flashcards(deck_id, sort_order);

alter function public.admin_delete_user(uuid) set search_path = public, auth, pg_temp;
alter function public.admin_search_users(text) set search_path = public, pg_temp;
alter function public.admin_set_premium(uuid, boolean, timestamp with time zone) set search_path = public, pg_temp;
alter function public.bump_progress_version() set search_path = public, pg_temp;
alter function public.get_flashcard_count(text) set search_path = public, pg_temp;
alter function public.get_random_test_questions(text) set search_path = public, pg_temp;
alter function public.get_topic_question_count(text[]) set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_premium() set search_path = public, pg_temp;
alter function public.protect_privileged_profile_columns() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;

revoke all on function public.admin_delete_user(uuid) from public, anon, authenticated;
revoke all on function public.admin_search_users(text) from public, anon, authenticated;
revoke all on function public.admin_set_premium(uuid, boolean, timestamp with time zone) from public, anon, authenticated;
revoke all on function public.get_flashcard_count(text) from public, anon, authenticated;
revoke all on function public.get_random_test_questions(text) from public, anon, authenticated;
revoke all on function public.get_topic_question_count(text[]) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.is_premium() from public, anon, authenticated;
revoke all on function public.protect_privileged_profile_columns() from public, anon, authenticated;

grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_search_users(text) to authenticated;
grant execute on function public.admin_set_premium(uuid, boolean, timestamp with time zone) to authenticated;
grant execute on function public.get_flashcard_count(text) to authenticated;
grant execute on function public.get_random_test_questions(text) to authenticated;
grant execute on function public.get_topic_question_count(text[]) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_premium() to authenticated;

commit;
