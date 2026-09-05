alter table public.question_feedback
  add column if not exists deneme_question_id bigint references public.deneme_questions(id) on delete set null;

create index if not exists question_feedback_deneme_question_id_idx
  on public.question_feedback(deneme_question_id);

comment on column public.question_feedback.deneme_question_id is
  'Bildirim bir deneme sinavi sorusuna aitse deneme_questions.id burada tutulur; normal soru bankasi sorulari icin question_id kullanilir, ikisi ayni satirda birlikte dolu olmaz.';
