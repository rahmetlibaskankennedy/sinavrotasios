UPDATE topics
SET kadrolar = array_remove(kadrolar, 'memur')
WHERE id IN ('yonetim-liderlik', 'yonetimde-etik', 'yonetim-insan-iliskileri');
