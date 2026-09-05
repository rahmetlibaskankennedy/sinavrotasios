-- NOT (Ağu 2026 kod incelemesi): Bu dosyanın adı yanıltıcıdır — "profiles
-- admin role columns koruması" der, ama aşağıdaki içerik bununla alakasız;
-- topics/card_decks tablolarına source_file sütunu ekler. Gerçek profil
-- ayrıcalık-sütunu koruması iki migration sonra,
-- 20260809081148_protect_privileged_profile_columns.sql içindedir.
-- Uygulanmış migration dosyası olduğu için yeniden adlandırılmadı
-- (manifest/checksum riski); bu not açıklık için eklendi.
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
