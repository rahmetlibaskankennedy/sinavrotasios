
-- article_range = '0' olan topic kayıtlarını temizle (madde mantığı olmayan konular)
UPDATE topics
SET article_range = NULL
WHERE type = 'topic'
  AND article_range = '0';
