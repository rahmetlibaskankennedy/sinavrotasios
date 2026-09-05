
-- 1) Repair the 3 "(N)" artifact questions — strip trailing " (N)"
UPDATE questions SET prompt = regexp_replace(prompt, '\s\(\d{1,3}\)\s*$', '')
WHERE id IN ('t-on-inceleme-ve-sorusturma-izni-y23dt-msxioxlt-53-66ma','t-son-hukumler-y32zl-msxipu21-4-yifn','t-son-hukumler-y32zl-msxipu21-5-84gz');

-- 2) Replace the 2 deneme_questions rows pointing to amendment-history questions with clean substitutes
UPDATE deneme_questions
SET prompt = src.prompt, options = src.options, answer_index = src.answer_index, source_question_id = src.id
FROM (SELECT id, prompt, options, answer_index FROM questions WHERE id = 't-turk-milli-egitim-sisteminin-genel-yapis-hnyjv-cld1739-033-9cac') src
WHERE deneme_questions.id = 984;

UPDATE deneme_questions
SET prompt = src.prompt, options = src.options, answer_index = src.answer_index, source_question_id = src.id
FROM (SELECT id, prompt, options, answer_index FROM questions WHERE id = 't-genel-esaslar-hlmrn-cld1739-018-ea36') src
WHERE deneme_questions.id = 989;

-- 3) Delete the 26 amendment-history-only questions from master
DELETE FROM questions WHERE id IN (
  '652-khk-cld652-026-g26q','652-khk-cld652-038-yj7m','652-khk-cld652-045-v3oe','652-khk-cld652-052-fytl',
  't-amac-kapsam-ve-tanimlar-yomgh-cld5580-035-d82c',
  't-baslangic-x0svf-mswxlu99-23-7w03',
  't-bolum-madde-amac-kapsam-ve-tanimlar-1-2--yoxkh-cld5580-036-f89c',
  't-denetim-reklam-mali-hukumler-ve-ucretler-ypj14-cld5580-044-a089',
  't-denetim-reklam-mali-hukumler-ve-ucretler-ypj14-cld5580-045-8db6',
  't-gecici-ve-son-hukumler-yptub-cld5580-006-839b',
  't-gecici-ve-son-hukumler-yptub-cld5580-042-af5a',
  't-gecici-ve-son-hukumler-yptub-cld5580-050-4059',
  't-gecici-ve-son-hukumler-yptub-cld5580-061-d78b',
  't-gecici-ve-son-hukumler-yptub-cld5580-063-401b',
  't-gecici-ve-son-hukumler-yptub-cld5580-068-4b9d',
  't-genel-esaslar-hlmrn-cld1739-001-9311',
  't-kapsam-hl3d0-cld1739-007-7ad8',
  't-ogretmenlik-meslegi-hpn03-cld1739-027-6dbc',
  't-okul-binalari-ve-tesisleri-hq9ij-cld1739-014-366f',
  't-son-hukumler-hrhmi-cld1739-012-40aa',
  't-son-hukumler-hrhmi-cld1739-019-706a',
  't-son-hukumler-hrhmi-cld1739-021-5def',
  't-turk-milli-egitim-sisteminin-genel-yapis-hnyjv-cld1739-015-7ee4',
  't-turk-milli-egitim-sisteminin-genel-yapis-hnyjv-cld1739-023-fbe5',
  't-turk-milli-egitiminin-temel-ilkeleri-hmro2-cld1739-001-0caa',
  't-turk-milli-egitiminin-temel-ilkeleri-hmro2-cld1739-017-72f4'
);

-- 4) Delete the 13 answer-length-bias questions
DELETE FROM questions WHERE id IN (
  SELECT q.id FROM questions q
  WHERE length(q.options->>q.answer_index) > (SELECT avg(length(t.o)) FROM jsonb_array_elements_text(q.options) WITH ORDINALITY AS t(o,idx) WHERE idx-1 <> q.answer_index) * 1.5
    AND length(q.options->>q.answer_index) - (SELECT avg(length(t.o)) FROM jsonb_array_elements_text(q.options) WITH ORDINALITY AS t(o,idx) WHERE idx-1 <> q.answer_index) > 15
);

-- 5) Delete 2 of the 3 exact-duplicate rows, keep one
DELETE FROM questions WHERE id IN ('law-657-section-istihdam-sekilleri-msvraqim-2-pmlx','law-657-section-istihdam-sekilleri-msvraqim-3-7e2p');
