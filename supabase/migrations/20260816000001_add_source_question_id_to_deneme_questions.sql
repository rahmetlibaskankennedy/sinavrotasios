alter table public.deneme_questions
  add column if not exists source_question_id text references public.questions(id) on delete set null;

create index if not exists deneme_questions_source_question_id_idx
  on public.deneme_questions(source_question_id);

comment on column public.deneme_questions.source_question_id is
  'Bu deneme sorusunun otomatik secim sirasinda kopyalandigi havuz sorusu (questions.id). Izlenebilirlik icindir; deneme_questions kendi icerigini bagimsiz tutar.';
