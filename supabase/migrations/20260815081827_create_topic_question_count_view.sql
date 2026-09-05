
CREATE OR REPLACE VIEW topic_question_counts AS
SELECT 
    t.id as topic_id,
    t.title,
    t.type,
    t.parent_id,
    -- Direkt sorular
    (SELECT COUNT(*) FROM questions WHERE topic_id = t.id) as direkt_soru,
    -- Alt konuların soruları
    (SELECT COUNT(*) FROM questions WHERE topic_id IN (
        SELECT id FROM topics WHERE parent_id = t.id
    )) as alt_konu_soru,
    -- Toplam
    (SELECT COUNT(*) FROM questions WHERE topic_id = t.id) +
    (SELECT COUNT(*) FROM questions WHERE topic_id IN (
        SELECT id FROM topics WHERE parent_id = t.id
    )) as toplam_soru
FROM topics t;
