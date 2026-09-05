UPDATE topics
SET key_points = ARRAY[
  'Ortak (Memur + Şef): MEB Personelin Görevde Yükselme, Unvan Değişikliği ve Yer Değiştirme Suretiyle Atanması Hakkında Yönetmelik',
  'Ortak (Memur + Şef): MEB Aday Memurların Yetiştirilmelerine İlişkin Yönetmelik',
  'Ortak (Memur + Şef): MEB Öğretmenlerin Atama ve Yer Değiştirme Yönetmeliği',
  'Sadece Memur: MEB Personelin İzin Yönergesi',
  'Sadece Şef: MEB Disiplin Amirleri Yönetmeliği',
  'Sadece Şef: MEB Merkez Teşkilatı İmza Yetkileri Yönergesi'
]
WHERE id = 'bagli-mevzuat-sef';
