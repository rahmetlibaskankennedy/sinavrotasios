-- topics.id='topic-idaresistemi' zaten mevcut ama source_file kartlara
-- (cards/idare-sistemi.json) işaret ediyordu. Artık gerçek soru havuzu var
-- (questions.topic_id='topic-idaresistemi', 30 soru) — 657/genel-kültür
-- deseniyle aynı şekilde 'sorular' kaynağına çeviriyoruz.
update topics
set source_file = 'sorular/questions-idaresistemi.json'
where id = 'topic-idaresistemi';

-- exam_topics'i, diğer gerçek konularla birebir aynı desende bu düğüme bağla.
-- exam_blueprint_items ve questions tablolarına hiç dokunulmuyor.
update exam_topics
set linked_topic_id = 'topic-idaresistemi',
    question_source = 'sorular',
    card_deck_id = null,
    status = 'real'
where topic_id = 'idare-sistemi';
