
DELETE FROM card_questions WHERE deck_id IN ('ataturk','turkce','insan-haklari','protokol');
DELETE FROM card_decks WHERE id IN ('ataturk','turkce','insan-haklari','protokol') AND deck_type='quiz';
