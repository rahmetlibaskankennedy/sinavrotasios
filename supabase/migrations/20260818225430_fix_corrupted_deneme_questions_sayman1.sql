
UPDATE deneme_questions
SET prompt = src.prompt, options = src.options, answer_index = src.answer_index, source_question_id = src.id
FROM (SELECT id, prompt, options, answer_index FROM questions WHERE id = 't-ihale-sureci-tfyj5-msvtxpcv-101-cxit') src
WHERE deneme_questions.id = 1093;

UPDATE deneme_questions
SET prompt = src.prompt, options = src.options, answer_index = src.answer_index, source_question_id = src.id
FROM (SELECT id, prompt, options, answer_index FROM questions WHERE id = 't-ihale-sureci-tfyj5-msvtxpcw-247-to82') src
WHERE deneme_questions.id = 1094;

UPDATE deneme_questions
SET prompt = src.prompt, options = src.options, answer_index = src.answer_index, source_question_id = src.id
FROM (SELECT id, prompt, options, answer_index FROM questions WHERE id = 't-yasaklar-ve-sorumluluklar-w6094-mswvxni0-87-egng') src
WHERE deneme_questions.id = 1098;
