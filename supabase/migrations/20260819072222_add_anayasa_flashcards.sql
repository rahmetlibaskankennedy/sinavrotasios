INSERT INTO flashcards (deck_id, question, answer, sort_order)
SELECT deck_id, question, answer, sort_order
FROM jsonb_to_recordset($cards$[
{"deck_id":"anayasa","question":"TBMM, Anayasa'da başkaca hüküm yoksa hangi çoğunlukla toplanır (Toplantı Yeter Sayısı)?","answer":"Üye tamsayısının 1/3'ü (200)","sort_order":41},
{"deck_id":"anayasa","question":"Usulüne göre yürürlüğe konulmuş milletlerarası andlaşmalar ne hükmündedir?","answer":"Kanun hükmündedir","sort_order":42},
{"deck_id":"anayasa","question":"Vergi ödevi maddesine göre herkes neye göre vergi ödemekle yükümlüdür?","answer":"Mali gücüne göre","sort_order":43},
{"deck_id":"anayasa","question":"Mahalli idarelerin hesap ve işlemlerinin denetimi kim tarafından yapılır?","answer":"Sayıştay","sort_order":44},
{"deck_id":"anayasa","question":"Mahalli idare organlarının görevle ilgili suç sebebiyle geçici olarak görevden uzaklaştırılması yetkisi kime aittir?","answer":"İçişleri Bakanına","sort_order":45},
{"deck_id":"anayasa","question":"Cumhurbaşkanı yardımcıları ve bakanlar kime karşı sorumludur?","answer":"Cumhurbaşkanına","sort_order":46},
{"deck_id":"anayasa","question":"Devlet Denetleme Kurulu kime bağlıdır?","answer":"Cumhurbaşkanlığına","sort_order":47},
{"deck_id":"anayasa","question":"Devlet Denetleme Kurulu'nun görev alanı dışında kalan organ hangisidir?","answer":"Yargı organları","sort_order":48},
{"deck_id":"anayasa","question":"Olağanüstü hallerde çıkarılan Cumhurbaşkanlığı kararnameleri TBMM'de ne kadar süre içinde karara bağlanmalıdır?","answer":"3 ay","sort_order":49},
{"deck_id":"anayasa","question":"Vergi ve mali yükümlülükler hakkında Danıştay ile Sayıştay kararları çatışırsa hangisi esas alınır?","answer":"Danıştay","sort_order":50}
]$cards$::jsonb) AS x(deck_id text, question text, answer text, sort_order int);
