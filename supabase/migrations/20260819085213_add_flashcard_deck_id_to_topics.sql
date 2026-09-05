alter table public.topics
  add column flashcard_deck_id text references public.card_decks(id);

create index topics_flashcard_deck_id_idx on public.topics (flashcard_deck_id);

update public.topics t
set flashcard_deck_id = cd.id
from public.card_decks cd
where cd.deck_type = 'flashcard'
  and lower(trim(t.title)) = lower(trim(cd.title));
