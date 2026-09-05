INSERT INTO flashcards (deck_id, question, answer, sort_order)
SELECT deck_id, question, answer, sort_order
FROM jsonb_to_recordset($cards$[
{"deck_id":"657-sayili-kanun","question":"Uluslararası kuruluşlarda görev alacak memurlara memuriyeti süresince en çok kaç yıla kadar aylıksız izin verilebilir?","answer":"21 yıl","sort_order":31},
{"deck_id":"657-sayili-kanun","question":"Aday memurun adaylık süresi hangi sınırlar arasında olmalıdır?","answer":"1 yıldan az, 2 yıldan çok olamaz","sort_order":32},
{"deck_id":"657-sayili-kanun","question":"Memurlara aylıklarının ödenme zamanı ile ilgili kural nedir?","answer":"Her ayın başında peşin ödenir","sort_order":33},
{"deck_id":"657-sayili-kanun","question":"Görevden uzaklaştırma tedbirinin hukuki niteliği nedir?","answer":"İhtiyati bir tedbirdir","sort_order":34},
{"deck_id":"657-sayili-kanun","question":"Disiplin amirleri tarafından verilen uyarma, kınama ve aylıktan kesme cezalarına karşı kararın tebliğinden itibaren kaç gün içinde itiraz edilebilir?","answer":"7 gün","sort_order":35},
{"deck_id":"657-sayili-kanun","question":"Bir göreve vekaleten atanan memurlara kural olarak vekalet aylığı, kadronun birinci kademesinin ne kadarı olarak verilir?","answer":"Üçte biri","sort_order":36},
{"deck_id":"657-sayili-kanun","question":"Bir göreve açıktan vekil olarak atananlara verilecek vekalet aylığı oranı nedir?","answer":"Birinci kademenin üçte ikisi","sort_order":37},
{"deck_id":"657-sayili-kanun","question":"Görevden uzaklaştırılan veya tutuklanan memurlara bu süre içinde aylıklarının ne kadarı ödenir?","answer":"Üçte ikisi","sort_order":38},
{"deck_id":"657-sayili-kanun","question":"Bir ceza kovuşturması nedeniyle görevden uzaklaştırmada yetkili amir ilgilinin durumunu kaç ayda bir incelemek zorundadır?","answer":"Her iki ayda bir","sort_order":39},
{"deck_id":"657-sayili-kanun","question":"Memurlara yabancı memleketlerin resmi kurumlarında görev almaları halinde ilgili Bakanın onayı ile en çok kaç yıla kadar aylıksız izin verilebilir?","answer":"10 yıl","sort_order":40},
{"deck_id":"657-sayili-kanun","question":"Adaylık devresinde başarısızlık veya disiplin cezası nedeniyle ilişiği kesilenler (sağlık hariç) kaç yıl Devlet memurluğuna alınmaz?","answer":"3 yıl","sort_order":41},
{"deck_id":"657-sayili-kanun","question":"Memura eşinin doğum yapması halinde isteği üzerine kaç gün babalık izni verilir?","answer":"10 gün","sort_order":42},
{"deck_id":"657-sayili-kanun","question":"Doğum veya evlat edinme sonrası yarım zamanlı çalışan memurların derece yükselmesi ve kademe ilerlemesi süreleri nasıl dikkate alınır?","answer":"Yarım olarak dikkate alınır","sort_order":43},
{"deck_id":"657-sayili-kanun","question":"Kurumlar arası geçici süreli görevlendirmede memur aylık ve mali haklarını nereden alır?","answer":"Asıl kurumundan","sort_order":44},
{"deck_id":"657-sayili-kanun","question":"Mezuniyetsiz veya mazeretsiz olarak görevin kesintisiz kaç gün terk edilmesi halinde memur çekilmiş (müstafi) sayılır?","answer":"10 gün","sort_order":45},
{"deck_id":"657-sayili-kanun","question":"Avukatlık stajını memuriyette iken tamamlayanlara kaç kademe ilerlemesi uygulanır?","answer":"1 kademe","sort_order":46},
{"deck_id":"657-sayili-kanun","question":"Mecburi hizmetle yükümlü olanlar staj/eğitim bitiminden itibaren en çok kaç ay içinde kurumlarına başvurmalıdır?","answer":"2 ay","sort_order":47},
{"deck_id":"657-sayili-kanun","question":"Memurun menfaat karşılığı çalışmayan eşi için ödenecek aile yardımı ödeneği gösterge rakamı kaçtır?","answer":"1500","sort_order":48},
{"deck_id":"657-sayili-kanun","question":"Yurtdışında görevlendirilen güvenlik görevlileri için geçici görevlendirme süresi en çok kaç yıldır?","answer":"2 yıl (gerekirse bir kat uzatılabilir)","sort_order":49},
{"deck_id":"657-sayili-kanun","question":"İlçelerde ilçe idare şube başkanları hakkında görevden uzaklaştırma tedbiri alırken kimin muvafakati şarttır?","answer":"Valinin","sort_order":50}
]$cards$::jsonb) AS x(deck_id text, question text, answer text, sort_order int);
