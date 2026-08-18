-- topic_question_counts SECURITY DEFINER olduğu için questions tablosundaki
-- premium RLS'ini (questions_premium_read) bypass ediyordu. anon dahil
-- herkese açık olması, giriş yapmadan premium konuların soru sayılarının
-- görülmesine izin veriyordu. Erişimi authenticated ile sınırlıyor ve view
-- üzerindeki anlamsız INSERT/UPDATE/DELETE/TRUNCATE yetkilerini kaldırıyoruz.
-- 2026-08-15 tarihinde canlıya uygulandı.
begin;

revoke all on public.topic_question_counts from public, anon;
revoke insert, update, delete, truncate, trigger, references on public.topic_question_counts from authenticated;
grant select on public.topic_question_counts to authenticated;

comment on view public.topic_question_counts is
  'Konu bazlı soru sayısı önizlemesi. SECURITY DEFINER: premium RLS''ini kasıtlı olarak bypass eder ama yalnızca authenticated role''e açıktır (anon erişimi 2026-08-15''te kaldırıldı).';

commit;
