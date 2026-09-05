alter table public.deneme_questions
  add column if not exists kadro text;

create index if not exists deneme_questions_kadro_idx
  on public.deneme_questions(kadro);

comment on column public.deneme_questions.kadro is
  'Sorunun otomatik secildigi kadro (denemeler.kadro ile ayni deger kumesi). Filtreleme/raporlama icin denormalize kopya.';
