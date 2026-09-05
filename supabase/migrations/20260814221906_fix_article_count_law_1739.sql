
-- 1739 sayılı kanun: article_range = '1-64' ama article_count = 62 (yanlış)
-- Doğru değer: 64
UPDATE topics
SET article_count = 64, updated_at = now()
WHERE id = 'law-1739'
  AND article_range = '1-64'
  AND article_count != 64;
