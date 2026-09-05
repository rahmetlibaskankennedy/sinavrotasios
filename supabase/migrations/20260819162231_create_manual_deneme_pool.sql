
CREATE TABLE manual_deneme_pool (
  id bigint generated always as identity primary key,
  topic_id text,
  kadro text,
  prompt text NOT NULL,
  options jsonb NOT NULL,
  answer_index integer NOT NULL,
  explanation text,
  origin_deneme_id bigint,
  origin_deneme_title text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE manual_deneme_pool IS 'Elle yazılmış, questions havuzunda karşılığı olmayan manuel deneme soruları (eski deneme_questions.source_question_id IS NULL kayıtlarından taşındı). origin_deneme_id/title, sorunun ilk hangi denemede yazıldığını gösterir, referans amaçlıdır.';
