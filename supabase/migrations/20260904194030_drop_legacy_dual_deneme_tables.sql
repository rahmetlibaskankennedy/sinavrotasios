-- Bu migration CANLIYA ZATEN UYGULANDI (Supabase MCP ile, 2026-09-04).
-- Bu dosya sadece repo geçmişini production ile senkron tutmak için eklendi.
--
-- Iki paralel "deneme sinavi" sisteminden artik hicbir istemci kodundan
-- okunmayan eski tarafi kaldirir. Tek deneme yolu artik
-- buildKadroExamPool/startKadroExam (Ek-2 agirlik tablosuna gore, canli
-- questions havuzundan sinav ureten sistem).
--
-- Once (ayni oturumda) manual_deneme_pool'daki 108 satirin TAMAMI
-- supabase/export/manual_deneme_pool_backup/manual_deneme_pool_snapshot_2026-09-04.json
-- olarak repo'ya yedeklendi; 42'si zaten questions'a tasindi
-- (bkz. 20260904192952_merge_unique_manual_deneme_pool_questions_into_questions.sql).
--
-- denemeler ve deneme_questions zaten 0 satirdi (icerik daha once
-- manual_deneme_pool'a tasinmisti).
--
-- ONEMLI: question_feedback.deneme_question_id kolonu de burada dusuyor.
-- supabase/functions/report-question/index.ts BU MIGRATION'LA BIRLIKTE
-- guncellenip yeniden deploy edildi (deneme_question_id destegi kaldirildi) -
-- aksi halde her soru bildirimi "column does not exist" hatasi verirdi.
begin;

alter table public.question_feedback drop column if exists deneme_question_id;

drop table if exists public.deneme_questions;
drop table if exists public.denemeler;
drop table if exists public.manual_deneme_pool;

commit;
