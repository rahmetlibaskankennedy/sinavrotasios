alter table public.deneme_questions
  add column if not exists topic_id text references public.topics(id) on delete set null;

create index if not exists deneme_questions_topic_id_idx
  on public.deneme_questions(topic_id);

comment on column public.deneme_questions.topic_id is
  'Sorunun ait oldugu konu (questions.topic_id ile ayni referans). Otomatik secimde sinav planindaki konu sirasini uygulamak icin kullanilir.';

-- Kaynak soru biliniyorsa (source_question_id) konu bilgisini oradan geriye donuk doldur.
update public.deneme_questions dq
set topic_id = q.topic_id
from public.questions q
where dq.source_question_id = q.id and dq.topic_id is null;
