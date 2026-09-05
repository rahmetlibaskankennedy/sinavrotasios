DELETE FROM card_questions WHERE deck_id IN (SELECT id FROM card_decks WHERE deck_type='quiz');
DELETE FROM card_decks WHERE deck_type='quiz';
