# Production içerik anlık görüntüsü

Bu klasör, 13 Ağustos 2026 tarihinde canlı Supabase projesinden alınan yalnızca içerik tablolarının sürümlü anlık görüntüsüdür. `scripts/generate_seed.py`, `supabase/seed.sql` dosyasını bu kaynaklardan üretir.

Kapsam dışı bırakılan kullanıcıya ait veriler: `profiles`, `topic_free_attempts`, `question_feedback` ve Auth kayıtları.

Yeni içerik yayını sonrasında bu klasör aynı dışa aktarma akışıyla güncellenmeli ve `python3 scripts/generate_seed.py` yeniden çalıştırılmalıdır.
