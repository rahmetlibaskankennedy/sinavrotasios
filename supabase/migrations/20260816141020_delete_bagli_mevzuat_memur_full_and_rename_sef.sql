DELETE FROM questions WHERE topic_id = 'bagli-mevzuat-memur';
DELETE FROM exam_topics WHERE linked_topic_id = 'bagli-mevzuat-memur';
DELETE FROM topics WHERE id = 'bagli-mevzuat-memur';
UPDATE topics SET title = 'MEB Yönetmelikleri' WHERE id = 'bagli-mevzuat-sef';
