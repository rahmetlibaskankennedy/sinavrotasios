-- ============================================================================
-- app.js şu an içerikleri statik dosya YOLLARIYLA (ör. 'sorular/questions-657.json',
-- 'cards/anayasa.json') çağırıyor. Geçiş sürecinde app.js'i minimum değişiklikle
-- Supabase'e bağlayabilmek için, orijinal dosya yolunu her topics/card_decks
-- satırında saklıyoruz. content-repo.js bu sütun üzerinden eşleme yapıyor.
-- İleride app.js tamamen id tabanlı çağrılara geçtiğinde bu sütunlar kaldırılabilir.
-- ============================================================================

alter table public.topics add column if not exists source_file text;
alter table public.card_decks add column if not exists source_file text;

create unique index if not exists topics_source_file_key on public.topics(source_file) where source_file is not null;
create unique index if not exists card_decks_source_file_key on public.card_decks(source_file) where source_file is not null;
