
INSERT INTO exam_topics (topic_id, title, category_id, status, question_source, linked_topic_id, sort_order)
VALUES
('t-sozcuk-bilgisi-2w1wg',      'Sözcük Bilgisi',      'general-culture', 'real', 'sorular', 'topic-turkce', 11),
('t-fiil-bilgisi-2wgov',        'Fiil Bilgisi',        'general-culture', 'real', 'sorular', 'topic-turkce', 12),
('t-tamlamalar-2woav',          'Tamlamalar',          'general-culture', 'real', 'sorular', 'topic-turkce', 13),
('t-cumle-bilgisi-2wxpb',       'Cümle Bilgisi',       'general-culture', 'real', 'sorular', 'topic-turkce', 14),
('t-ses-bilgisi-2x3e8',         'Ses Bilgisi',         'general-culture', 'real', 'sorular', 'topic-turkce', 15),
('t-yazim-ve-noktalama-2xbz3',  'Yazım ve Noktalama',  'general-culture', 'real', 'sorular', 'topic-turkce', 16)
ON CONFLICT (topic_id) DO NOTHING;

INSERT INTO exam_blueprint_items (kadro, topic_id, question_count, sort_order) VALUES
('memur', 't-sozcuk-bilgisi-2w1wg',     1, 1),
('memur', 't-fiil-bilgisi-2wgov',        1, 2),
('memur', 't-tamlamalar-2woav',          1, 3),
('memur', 't-cumle-bilgisi-2wxpb',       1, 4),
('memur', 't-ses-bilgisi-2x3e8',         0, 5),
('memur', 't-yazim-ve-noktalama-2xbz3',  2, 6),
('sef', 't-sozcuk-bilgisi-2w1wg',        1, 1),
('sef', 't-fiil-bilgisi-2wgov',          1, 2),
('sef', 't-tamlamalar-2woav',            1, 3),
('sef', 't-cumle-bilgisi-2wxpb',         1, 4),
('sef', 't-ses-bilgisi-2x3e8',           0, 5),
('sef', 't-yazim-ve-noktalama-2xbz3',    2, 6),
('sayman', 't-sozcuk-bilgisi-2w1wg',     1, 1),
('sayman', 't-fiil-bilgisi-2wgov',       0, 2),
('sayman', 't-tamlamalar-2woav',         1, 3),
('sayman', 't-cumle-bilgisi-2wxpb',      1, 4),
('sayman', 't-ses-bilgisi-2x3e8',        1, 5),
('sayman', 't-yazim-ve-noktalama-2xbz3', 1, 6),
('sube-mudur', 't-sozcuk-bilgisi-2w1wg',     1, 1),
('sube-mudur', 't-fiil-bilgisi-2wgov',       0, 2),
('sube-mudur', 't-tamlamalar-2woav',         1, 3),
('sube-mudur', 't-cumle-bilgisi-2wxpb',      1, 4),
('sube-mudur', 't-ses-bilgisi-2x3e8',        1, 5),
('sube-mudur', 't-yazim-ve-noktalama-2xbz3', 1, 6);
