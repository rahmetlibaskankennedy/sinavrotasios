-- search_path ayarlanmamıştı (linter WARN). Fonksiyon SECURITY INVOKER
-- olduğu için RLS zaten çağıranın rolüne göre uygulanıyor, ancak PUBLIC/anon'a
-- açık EXECUTE yetkisi de gereksiz; topic_question_counts ile tutarlı olacak
-- şekilde yalnızca authenticated'e bırakıyoruz.
-- 2026-08-15 tarihinde canlıya uygulandı.
begin;

alter function public.get_question_counts() set search_path = public, pg_temp;

revoke all on function public.get_question_counts() from public, anon;
grant execute on function public.get_question_counts() to authenticated;

commit;
