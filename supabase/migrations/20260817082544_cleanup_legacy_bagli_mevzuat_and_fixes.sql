-- 1) Eski, artık boş olan aggregate "MEB Yönetmelikleri" kaydını sil
DELETE FROM questions WHERE topic_id = 'bagli-mevzuat-sef';
DELETE FROM exam_topics WHERE linked_topic_id = 'bagli-mevzuat-sef';
DELETE FROM topics WHERE id = 'bagli-mevzuat-sef';

-- 2) Tür tutarsızlığını düzelt: Öğretmen Atama Yönetmeliği de "document" olsun
UPDATE topics SET type = 'document'
WHERE id = 't-meb-ogretmenlerin-atama-ve-yer-degistirm-vkz4i';

-- 3) 4982'nin kadrolar alanını diğerleriyle tutarlı hale getir
UPDATE topics SET kadrolar = ARRAY['memur','sef','sayman','sube-mudur']
WHERE id = '4982-kanun';
