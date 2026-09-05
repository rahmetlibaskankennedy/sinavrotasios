-- Bu migration CANLIYA ZATEN UYGULANDI (Supabase MCP ile, 2026-09-04).
-- Bu dosya sadece repo geçmişini production ile senkron tutmak için eklendi.
--
-- manual_deneme_pool'daki, questions tablosunda karsiligi olmayan VE gecerli
-- topic_id'si olan sorulari questions'a tasir. Amac: bankView() ekranindaki
-- "{kadro} Denemeleri" listesi (denemeler/deneme_questions tablolarina
-- dayaniyordu, ikisi de bos) kaldirilip tek deneme yolu olarak
-- buildKadroExamPool/startKadroExam (Ek-2 agirlik tablosuna gore, canli
-- questions havuzundan sinav ureten, zaten calisan sistem) birakilacak.
-- manual_deneme_pool'daki 108 sorudan 98'i questions'ta hic yok; bu adim,
-- topic_id'si zaten gecerli olan 42'sini kalici olarak questions'a kazandirir
-- (kalan 56'sinin topic_id'si yok, ayrica siniflandirma gerektirir; onlar
-- icin manual_deneme_pool'a simdilik dokunulmuyor).
-- Geri alma: delete from public.questions where id like 'manual-pool-%';
begin;

insert into public.questions (id, topic_id, prompt, options, answer_index, explanation, sort_order)
select
  'manual-pool-' || m.id::text,
  m.topic_id,
  m.prompt,
  m.options,
  m.answer_index,
  m.explanation,
  coalesce((select max(q.sort_order) from public.questions q where q.topic_id = m.topic_id), 0)
    + row_number() over (partition by m.topic_id order by m.id)
from public.manual_deneme_pool m
where m.topic_id is not null
  and exists (select 1 from public.topics t where t.id = m.topic_id)
  and not exists (select 1 from public.questions q where q.prompt = m.prompt);

commit;
