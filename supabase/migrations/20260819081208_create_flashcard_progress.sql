create table public.flashcard_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  flashcard_id bigint not null references public.flashcards(id) on delete cascade,
  deck_id text not null references public.card_decks(id) on delete cascade,
  box_level int not null default 0,
  next_review_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  last_rating text check (last_rating in ('zor','orta','kolay')),
  review_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, flashcard_id)
);

create index flashcard_progress_due_idx on public.flashcard_progress (user_id, deck_id, next_review_at);

alter table public.flashcard_progress enable row level security;

create policy flashcard_progress_own_read on public.flashcard_progress
  for select using (auth.uid() = user_id);

create policy flashcard_progress_own_write on public.flashcard_progress
  for insert with check (auth.uid() = user_id);

create policy flashcard_progress_own_update on public.flashcard_progress
  for update using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger flashcard_progress_set_updated_at
  before update on public.flashcard_progress
  for each row execute function public.set_updated_at();
