
INSERT INTO topics (id, category_id, parent_id, type, title, document_number, article_range, article_count, question_count, kadrolar, sort_order, created_at, updated_at, source_file, summary, key_points, show_in_catalog, flashcard_deck_id)
SELECT 'topic-insanhaklari', category_id, parent_id, type, title, document_number, article_range, article_count, question_count, kadrolar, sort_order, created_at, now(), NULL, summary, key_points, show_in_catalog, flashcard_deck_id
FROM topics WHERE id = 'topic-cografya';

UPDATE questions SET topic_id = 'topic-insanhaklari' WHERE topic_id = 'topic-cografya';

DELETE FROM topics WHERE id = 'topic-cografya';

UPDATE topics SET source_file = 'sorular/questions-cografya.json' WHERE id = 'topic-insanhaklari';

UPDATE exam_topics SET question_source = 'sorular', linked_topic_id = 'topic-turkce', card_deck_id = NULL WHERE topic_id = 'turkce';
UPDATE exam_topics SET question_source = 'sorular', linked_topic_id = 'topic-insanhaklari', card_deck_id = NULL WHERE topic_id = 'insan-haklari';
UPDATE exam_topics SET question_source = 'sorular', linked_topic_id = 't-protokol-kurallari-807r5', card_deck_id = NULL WHERE topic_id = 'protokol';
UPDATE exam_topics SET question_source = 'sorular', linked_topic_id = 'topic-inkilap', card_deck_id = NULL WHERE topic_id = 'ataturk';
