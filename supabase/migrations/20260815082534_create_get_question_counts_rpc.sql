
CREATE OR REPLACE FUNCTION get_question_counts()
RETURNS TABLE(topic_id text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT topic_id, COUNT(*) as count
  FROM questions
  GROUP BY topic_id;
$$;
