# Production migration history

`production-migrations.json`, 14 Ağustos 2026 tarihinde doğrulanan production
projesinin migration dosya adlarını kaynakta sabitler. `scripts/check-migration-manifest.js`
bu liste ile `supabase/migrations` dizisinin tam eşleşmesini CI'da denetler.

Production'da kaynak yönetimine geçilmeden önce Studio/MCP ile uygulanmış sekiz
erken migration'ın SQL gövdesi Management API'den indirilemedi. Bu sürümde:

- production geçmişindeki sürüm adları, bire bir sıralı no-op history marker
  dosyalarıyla korunur;
- temiz bir veritabanının kurulumuna yetecek şema/RLS/fonksiyonların idempotent
  nihai hali `20260810195839_prod_reconciliation_snapshot.sql` içinde bulunur;
- önceki V7 yerel migration dosyaları izlenebilirlik için
  `legacy-v7-migrations/` altında saklanır ve aktif grafiğe dahil değildir.

Bu düzenlemeden sonra yeni bir şema değişikliği için yalnızca yeni, zaman damgalı
bir dosya ekleyin; production'da uygulamadan önce manifesti güncellemek yerine
önce remote migration geçmişini alın ve farkı inceleyin.
