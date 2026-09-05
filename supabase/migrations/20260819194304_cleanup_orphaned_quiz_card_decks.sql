-- genel-kultur-diger ve idare-sistemi artık gerçek havuza (topic-guncel /
-- topic-idaresistemi) bağlı; bu iki quiz-tipi card_deck ('genel-kultur',
-- 'idare-sistemi') hiçbir exam_topics, topics.source_file, deneme_questions
-- veya question_feedback kaydından referans almıyor (doğrulandı). Yetim.
delete from card_questions where deck_id in ('genel-kultur','idare-sistemi');
delete from card_decks where id in ('genel-kultur','idare-sistemi');
