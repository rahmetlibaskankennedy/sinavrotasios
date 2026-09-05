
DELETE FROM questions
WHERE id IN (
  SELECT DISTINCT q.id
  FROM questions q, jsonb_array_elements_text(q.options) AS opt
  WHERE (opt ~ '[a-zçğıöşü]\d{1,3}$' AND length(opt) > 15)
     OR opt ~ ', [a-zçğıöşü]$'
);
