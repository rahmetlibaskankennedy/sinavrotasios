-- Bu migration CANLIYA ZATEN UYGULANDI (Supabase MCP ile, 2026-09-05).
-- Bu dosya sadece repo geçmişini production ile senkron tutmak için eklendi.
--
-- Kartlar (flashcard destesi) simdiye kadar kadro bazli filtrelenmiyordu -
-- questions/topics tarafinda zaten var olan 'kadrolar' kolonunun ayni
-- muadili card_decks'e de ekleniyor. Deger, ayni kanunun topics tablosundaki
-- kaydiyla BASLIK eslesmesi (harfe duyarsiz) uzerinden kopyalandi - 24
-- destenin 24'u de eslesti, dogrulandi.
alter table public.card_decks add column kadrolar text[];

update public.card_decks cd
set kadrolar = t.kadrolar
from public.topics t
where t.parent_id is null
  and lower(t.title) = lower(cd.title)
  and t.kadrolar is not null
  and array_length(t.kadrolar, 1) > 0;
