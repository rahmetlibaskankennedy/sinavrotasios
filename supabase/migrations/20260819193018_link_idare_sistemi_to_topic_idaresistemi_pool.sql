-- topics.id='topic-idaresistemi' artık gerçek 30 soruluk bir havuza sahip
-- (questions.topic_id='topic-idaresistemi'), ama source_file hâlâ eski
-- kartlar dosyasını gösteriyordu; gerçek soru kaynağına çeviriyoruz
-- (657 Kanunu deseninde olduğu gibi, dosya fiilen okunmaz, sadece anahtar).
update topics
set source_file = 'sorular/questions-idaresistemi.json'
where id = 'topic-idaresistemi';

-- exam_topics'i, genel-kultur-diger'de uyguladığımız aynı desende
-- topic-idaresistemi'ye bağlıyoruz. exam_blueprint_items ve questions
-- tablolarına hiç dokunulmuyor.
update exam_topics
set linked_topic_id = 'topic-idaresistemi',
    question_source = 'sorular',
    card_deck_id = null,
    status = 'real'
where topic_id = 'idare-sistemi';
