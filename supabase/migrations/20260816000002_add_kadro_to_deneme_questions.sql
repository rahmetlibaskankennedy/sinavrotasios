alter table public.deneme_questions
  add column if not exists kadro text;

create index if not exists deneme_questions_kadro_idx
  on public.deneme_questions(kadro);

comment on column public.deneme_questions.kadro is
  'Sorunun otomatik secildigi kadro (denemeler.kadro ile ayni deger kumesi). Filtreleme/raporlama icin denormalize kopya.';

-- Mevcut satirlari denemeler.kadro'dan geriye donuk doldur.
update public.deneme_questions dq
set kadro = d.kadro
from public.denemeler d
where dq.deneme_id = d.id and dq.kadro is null;
