-- FIX: questions / card_questions / flashcards SELECT politikaları yalnızca
-- is_premium() kontrolü yapıyordu, is_admin() bypass'ı yoktu. Sonuç: admin
-- hesabının profiles.is_premium=false olduğu her durumda admin panelinde
-- "0 soru" görünüyordu (RLS satırları sessizce eliyor, veri kaybı YOK —
-- yalnızca görünürlük sorunu). denemeler_read / deneme_questions_read zaten
-- doğru yazılmıştı (public.is_admin() or ...); aynı desen burada da uygulandı.
begin;

drop policy if exists "questions_premium_read" on public.questions;
create policy "questions_premium_read" on public.questions
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_premium()));

drop policy if exists "card_questions_premium_read" on public.card_questions;
create policy "card_questions_premium_read" on public.card_questions
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_premium()));

drop policy if exists "flashcards_free_preview_read" on public.flashcards;
create policy "flashcards_free_preview_read" on public.flashcards
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_premium()) or sort_order <= 5);

commit;
