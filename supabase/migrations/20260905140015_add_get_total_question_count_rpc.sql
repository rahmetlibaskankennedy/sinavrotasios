-- Bu migration CANLIYA ZATEN UYGULANDI (Supabase MCP ile, 2026-09-05).
-- Bu dosya sadece repo geçmişini production ile senkron tutmak için eklendi.
--
-- Ana sayfadaki "Genel Ilerleme %" widget'i icin toplam soru bankasi
-- buyuklugunu doner. questions RLS ile korunuyor (questions_premium_read)
-- ama bu sadece bir SAYI dondurdugu icin (soru icerigi degil) is_premium()
-- olmayan kullanicilar icin de guvenli - security definer ile bu kisitlamayi
-- bilerek atliyoruz (tek amac: "N sorudan X'ini cozdun" gostergesi).
create or replace function public.get_total_question_count()
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.questions;
$$;

revoke all on function public.get_total_question_count() from public;
grant execute on function public.get_total_question_count() to authenticated;
