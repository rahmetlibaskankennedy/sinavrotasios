-- Linter security_invoker onerisini BILEREK uygulamiyoruz.
-- Bu view SECURITY DEFINER (varsayilan) kaldigi icin free/non-premium kullanicilar da
-- konu basina soru SAYISINI gorebiliyor, halbuki questions tablosunun SELECT RLS'i
-- (is_premium() OR is_admin()) bu sayimi normalde engelliyordu.
-- security_invoker=true yapilirsa direkt_soru/alt_konu_soru/toplam_soru sutunlari
-- free kullanicilar icin RLS nedeniyle SIFIRA duser (test edilip dogrulandi) ve
-- konu listesi ekrani bozulur. Bu yuzden mevcut davranis KORUNUYOR.
comment on view public.topic_question_counts is
  'Bilerek SECURITY DEFINER (invoker degil): free kullanicilara da konu basina soru '
  'sayisini gostermek icin questions tablosunun premium RLS''ini bilerek bypass eder. '
  'security_invoker''a cevirmeyin - free kullanicilar icin sayaclari sifirlar.';
