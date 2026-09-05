# manual_deneme_pool — arşiv yedeği (2026-09-04)

Bu klasör, `manual_deneme_pool` tablosu düşürülmeden hemen önce alınan tam
bir anlık görüntüdür (108 satır). Tablo düşürüldü çünkü:

- 42 satır (topic_id'si geçerli, questions'ta karşılığı olmayan) zaten
  `questions` tablosuna taşındı (bkz.
  `supabase/migrations/20260904192952_merge_unique_manual_deneme_pool_questions_into_questions.sql`,
  id'leri `manual-pool-` önekli).
- 10 satır zaten `questions`'ta birebir aynı prompt ile mevcuttu.
- 56 satırın topic_id'si yoktu; çoğu farklı "Deneme"lerde tekrar eden genel
  kültür sorularıydı (ör. "Türkiye'nin en yüksek dağı hangisidir?" 3 ayrı
  denemede aynen geçiyor). Konu ataması yapılmadan questions'a girmesi
  şema kısıtı (topic_id NOT NULL) yüzünden zaten mümkün değildi;
  sınıflandırılmadan kalıcı olarak silindi.

Bu dosya, o silinen içeriğin tam metnini (108 satırın tamamı, sadece 56'sı
değil) kalıcı olarak saklar.
