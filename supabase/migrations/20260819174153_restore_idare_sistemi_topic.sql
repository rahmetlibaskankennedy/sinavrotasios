
INSERT INTO topics (id, category_id, parent_id, type, title, article_range, source_file, show_in_catalog, sort_order)
VALUES ('topic-idaresistemi', 'general-culture', null, 'topic', 'Türk İdare Sistemi', 'genel', 'cards/idare-sistemi.json', true, 10);

INSERT INTO card_decks (id, title, deck_type, category_id, sort_order) VALUES
('idare-sistemi-fc', 'Türk İdare Sistemi', 'flashcard', 'general-culture', 14);

UPDATE topics SET flashcard_deck_id = 'idare-sistemi-fc' WHERE id = 'topic-idaresistemi';

-- quiz destesinin adını eski haline (doğru haline) döndür
UPDATE card_decks SET title = 'Türk İdare Sistemi' WHERE id = 'idare-sistemi';
