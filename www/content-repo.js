// content-repo.js
// Uygulama içeriğinin tek çalışma zamanı kaynağı Supabase'dir. app.js'in geri
// kalanı değişmesin diye her fonksiyon, eski statik sözleşmeyle aynı şekli
// döndürür; istemci paketinden soru/cevap JSON'u okunmaz.
//
// Eşleme mantığı: her topics/card_decks satırı, geldiği orijinal dosya yolunu
// `source_file` sütununda taşır (ör. 'sorular/questions-657.json'). app.js hâlâ
// bu yol string'lerini kullanıyor (ör. questionFile); biz de bu string'i
// anahtar olarak kullanıp Supabase'den karşılığını
// buluyoruz. Admin panelinde içerik id üzerinden düzenlenir, bu dosya yolları
// sadece app.js'in eski arayüzüyle uyumluluk için var.

const ContentRepo = (() => {
  const client = supabaseClient;

  function mapQuestionRow(row) {
    // topicId eklendi: "Madde Madde Çalış" ekranı (openSectionQuiz / app.js) sorularını
    // alt konunun (section) topic_id'sine göre filtreliyor. Bu alan olmadan hangi
    // sorunun hangi alt konuya ait olduğu app.js tarafında hiç bilinemiyordu.
    return { id: row.id, prompt: row.prompt, options: row.options, answerIndex: row.answer_index, topicId: row.topic_id };
  }

  // ---- Katalog karşılığı -------------------------------------------------
  // show_in_catalog=false olan topics satırları (ör. sadece deneme sınavı
  // taslağı için var olan, kullanıcıya konu olarak gösterilmemesi gereken
  // kayıtlar) burada filtrelenir. fetchExamTaxonomy/fetchExamBlueprint gibi
  // diğer fonksiyonlar bu filtreyi uygulamaz; onlar hâlâ tüm topics satırlarına
  // erişebilir, yani deneme sınavı akışı bu filtreden etkilenmez.
  async function fetchCatalogue() {
    const [{ data: categories, error: catErr }, { data: topics, error: topicErr }, { data: liveCounts, error: countErr }] = await Promise.all([
      client.from('categories').select('*').order('sort_order'),
      client.from('topics').select('*').eq('show_in_catalog', true).order('sort_order'),
      client.from('topic_question_counts').select('topic_id, toplam_soru')
    ]);
    if (catErr) throw new Error(`Kategoriler yüklenemedi: ${catErr.message}`);
    if (topicErr) throw new Error(`Konular yüklenemedi: ${topicErr.message}`);
    if (!Array.isArray(categories)) throw new Error('Kategoriler beklenmeyen formatta döndü.');
    if (!Array.isArray(topics)) throw new Error('Konular beklenmeyen formatta döndü.');
    // NOT (2026-08-19 düzeltme): topics.question_count sütunu 151 konudan
    // sadece 7'sinde doluydu ve gerçek soru sayısıyla senkron değildi — bu
    // yüzden Kartlar ekranında (getCardCatalogue, app.js) "Genel Mevzuat"
    // dışındaki hiçbir kategoride kart görünmüyordu. topic_question_counts
    // view'ı (zaten DB'de var, alt konuları da dahil ederek gerçek zamanlı
    // hesaplıyor) burada devreye alınıyor; countErr varsa (view erişilemezse)
    // sessizce eski sütuna düşülüyor, katalog hiç kırılmasın diye.
    const liveCountMap = new Map();
    if (!countErr && Array.isArray(liveCounts)) {
      liveCounts.forEach(row => liveCountMap.set(row.topic_id, row.toplam_soru));
    } else if (countErr) {
      console.warn('topic_question_counts okunamadı, eski question_count sütununa düşülüyor:', countErr.message);
    }

    const byParent = new Map();
    topics.forEach(t => {
      const key = t.parent_id || `root:${t.category_id}`;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(t);
    });

  // article_range "1-8", "9-27" gibi bir aralığı ifade eder. Bazı üst konularda
  // (özellikle alt bölümlere ayrılmış kanunlarda) kendi article_count alanı hiç
  // girilmemiş olabilir; bu durumda toplam madde sayısını doğrudan çocuk
  // bölümlerin article_range toplamından hesaplıyoruz, aksi halde ekranda
  // gerçekte madde verisi olmasına rağmen "- madde" görünüyordu.
  function parseArticleRangeCount(range) {
    if (!range) return 0;
    const match = String(range).match(/(\d+)\s*[-–—]\s*(\d+)/);
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return end - start + 1;
    }
    return /^\d+$/.test(String(range).trim()) ? 1 : 0;
  }

  function computeArticleCountFromChildren(children) {
    const total = children.reduce((sum, child) => sum + parseArticleRangeCount(child.articleRange), 0);
    return total > 0 ? total : null;
  }

  function buildNode(row) {
    const node = { id: row.id, type: row.type, title: row.title };
    if (row.document_number) node.documentNumber = row.document_number;
    // NOT (2026-08-17 düzeltme): article_range bazı satırlarda boş yerine
    // literal "0" string'i olarak kaydedilmiş olabiliyor (admin panelinde
    // varsayılan değer). "0" JS'te truthy olduğundan bu, maddesi olmayan
    // alt konularda (Sözcük Bilgisi, Fiil Bilgisi vb.) gerçek soru sayısı
    // yerine sabit "0" yazısının görünmesine yol açıyordu — hem burada
    // articleRange olarak set ediliyor hem de app.js'teki
    // refreshSectionQuestionCounts bu alanı "var" sayıp o bölümü soru
    // sayısı yenileme hedeflerinden dışlıyordu. "0"ı boş değer gibi ele alıyoruz.
    if (row.article_range && String(row.article_range).trim() !== '0') node.articleRange = row.article_range;
    if (row.article_count != null) node.articleCount = row.article_count;
    if (row.question_count != null) node.questionCount = row.question_count;
    const liveCount = liveCountMap.get(row.id);
    if (liveCount != null) node.questionCount = liveCount;
    if (row.kadrolar?.length) node.kadrolar = row.kadrolar;
    if (row.source_file) node.questionFile = row.source_file;
    if (row.summary) node.summary = row.summary;
    if (row.key_points?.length) node.keyPoints = row.key_points;
    const children = byParent.get(row.id);
    if (children?.length) {
      node.children = children.map(buildNode);
      // Madde sayısını sadece kanun/mevzuat (document) tipindeki konularda
      // alt bölümlerden hesapla; genel konu başlıklarında (topic) bu mantık
      // geçerli değil (alt konular madde değil, konu başlığı).
      if (node.articleCount == null && row.type === 'document') {
        const computed = computeArticleCountFromChildren(node.children);
        if (computed != null) node.articleCount = computed;
      }
    }
    return node;
  }

    const result = {};
    categories.forEach(cat => {
      const topLevel = byParent.get(`root:${cat.id}`) || [];
      result[cat.id] = {
        title: cat.title,
        subtitle: cat.subtitle,
        icon: cat.icon,
        iconClass: cat.icon_class,
        topics: topLevel.map(buildNode)
      };
    });
    return result;
  }

  // ---- sorular/*.json ve taxonomy'nin 'sorular'/'cards' (quiz) kaynakları --
  // documentItem.questionFile ya da (kart pratiği) topic.questionFile ile
  // çağrılır; hangi tablodan geldiğine bakmaksızın aynı {questions:[...]} şeklini döner.
  //
  // NOT: Bir konunun alt konuları (children) olabilir ve sorular admin panelinde
  // doğrudan alt konunun topic_id'sine kaydedilmiş olabilir (tıpkı admin.js'teki
  // collectDescendantTopicIds ile toplanan liste gibi). Bu yüzden burada da sadece
  // üst konunun id'sine değil, tüm alt konu id'lerine de bakmamız gerekiyor;
  // aksi halde alt konusu olan konularda (örn. Atatürk İlkeleri ve İnkılap Tarihi)
  // panelde görünen sorular sitede hiç listelenmiyordu.
  async function collectDescendantTopicIds(rootId) {
    const ids = [rootId];
    const { data: children, error } = await client.from('topics').select('id, parent_id');
    if (error) throw error;
    const byParent = new Map();
    children.forEach(t => {
      if (!t.parent_id) return;
      if (!byParent.has(t.parent_id)) byParent.set(t.parent_id, []);
      byParent.get(t.parent_id).push(t.id);
    });
    const stack = [rootId];
    while (stack.length) {
      const cur = stack.pop();
      (byParent.get(cur) || []).forEach(childId => { ids.push(childId); stack.push(childId); });
    }
    return ids;
  }

  // NOT: `questions`/`card_questions` tabloları production'da RLS ile zaten
  // korunuyor (`questions_premium_read` / `card_questions_premium_read`
  // politikaları `is_premium()` kontrolü yapıyor — anon/free kullanıcı
  // answer_index'e hiç erişemez). Bu yüzden burada RPC'ye gerek yok;
  // doğrudan seçim RLS tarafından zaten güvenli.
  async function fetchQuestionsByPath(path) {
    const { data: topic } = await client.from('topics').select('id, title').eq('source_file', path).maybeSingle();
    if (topic) {
      const topicIds = await collectDescendantTopicIds(topic.id);
      const { data, error } = await client.from('questions').select('*').in('topic_id', topicIds).order('sort_order');
      if (error) throw error;
      return { topicId: topic.id, title: topic.title, questions: data.map(mapQuestionRow) };
    }
    const { data: deck } = await client.from('card_decks').select('id, title').eq('source_file', path).eq('deck_type', 'quiz').maybeSingle();
    if (deck) {
      const { data, error } = await client.from('card_questions').select('*').eq('deck_id', deck.id).order('sort_order');
      if (error) throw error;
      return { topicId: deck.id, title: deck.title, questions: data.map(mapQuestionRow) };
    }
    throw new Error(`Soru kaynağı bulunamadı: ${path}`);
  }

  // ---- Sınav motoru (Ek-2 blueprint) için KESİN eşleşmeli soru çekimi -----
  // NOT (2026-08-15 düzeltme): fetchQuestionsByPath, collectDescendantTopicIds
  // ile alt konuların sorularını da havuza katıyor (kart/quiz ekranı için doğru
  // davranış). Ama sınav blueprint'i her topicId için AYRI bir soru sayısı
  // öngörüyor (örn. "222-kanun": 4 soru) — alt konuları da katarsak blueprint'in
  // beklemediği kadar büyük/karışık bir havuzdan seçim yapılıyor ve alt konu
  // başka bir blueprint girdisinde de kullanılıyorsa aynı soru sınavda iki kez
  // çıkabiliyor. Bu yüzden sınav havuzu ÖNCELİKLE o konunun kendi topic_id'sine
  // kayıtlı soruları kullanır.
  //
  // NOT (2026-08-17 düzeltme): "222 Sayılı Kanun", "1739 Sayılı Kanun", "5580
  // Sayılı Kanun", "T.C. Anayasası", "657 Sayılı Kanun" gibi bölümlere ayrılmış
  // mevzuatta sorular admin panelinde HER ZAMAN alt bölümün (section) topic_id'sine
  // kaydediliyor — üst/dosya (document) düğümünün kendi topic_id'sinde hiçbir
  // zaman soru bulunmuyor. Bu yüzden yukarıdaki "sadece kendi topic_id'si" kuralı
  // bu belgeler için havuzu hep boş bırakıyor, blueprint'te 65 soru planlansa
  // bile sınavda çok daha az soru çıkmasına yol açıyordu (örn. Şube Müdürü
  // gerçek sınav formatı: 65 planlı → sadece 24 soru çıkıyordu). Blueprint bu
  // belgeler için (bugüne kadar hiç) alt bölümü AYRI bir girdi olarak
  // kullanmadığından, kendi topic_id'sinde soru bulunamayan bir konuda alt
  // bölümlere inip soruları oradan toplamak çift sayım riskine girmeden güvenli.
  async function fetchQuestionsByPathExact(path) {
    const { data: topic, error: topicError } = await client.from('topics').select('id, title').eq('source_file', path).maybeSingle();
    if (topicError) throw topicError;
    if (topic) {
      const { data, error } = await client.from('questions').select('*').eq('topic_id', topic.id).order('sort_order');
      if (error) throw error;
      if (data && data.length) {
        return { topicId: topic.id, title: topic.title, questions: data.map(mapQuestionRow) };
      }
      // Kendi topic_id'sinde soru yok — alt bölümleri (varsa) dene.
      const descendantIds = await collectDescendantTopicIds(topic.id);
      if (descendantIds.length > 1) {
        const { data: childData, error: childError } = await client.from('questions').select('*').in('topic_id', descendantIds).order('sort_order');
        if (childError) throw childError;
        return { topicId: topic.id, title: topic.title, questions: (childData || []).map(mapQuestionRow) };
      }
      return { topicId: topic.id, title: topic.title, questions: [] };
    }
    const { data: deck, error: deckError } = await client.from('card_decks').select('id, title').eq('source_file', path).eq('deck_type', 'quiz').maybeSingle();
    if (deckError) throw deckError;
    if (deck) {
      const { data, error } = await client.from('card_questions').select('*').eq('deck_id', deck.id).order('sort_order');
      if (error) throw error;
      return { topicId: deck.id, title: deck.title, questions: (data || []).map(mapQuestionRow) };
    }
    throw new Error(`Soru kaynağı bulunamadı: ${path}`);
  }

  // ---- Katalogda gösterilen "X soru" sayısı (içerik değil, sadece sayı) ----
  // questions tablosu premium'a kilitli olsa da, "kaç soru var" bilgisi herkese
  // açık bir RPC üzerinden geliyor — hiçbir soru satırı dönmüyor, sadece count.
  async function fetchQuestionCount(path) {
    const { data: topic, error: topicError } = await client.from('topics').select('id').eq('source_file', path).maybeSingle();
    if (topicError) throw topicError;
    if (!topic) return 0;
    const topicIds = await collectDescendantTopicIds(topic.id);
    const { data, error } = await client.rpc('get_topic_question_count', { p_topic_ids: topicIds });
    if (error) throw error;
    return data || 0;
  }

  // ---- Madde Madde Çalış bölüm listesi için soru sayısı ---------------------
  // Maddesi olmayan alt konularda (section) source_file/questionFile hiç
  // set edilmemiş olabiliyor, bu yüzden fetchQuestionCount (source_file'a göre
  // arıyor) burada işe yaramıyor. topic.id zaten elimizde olduğundan doğrudan
  // topicId ile aynı RPC'yi çağırıyoruz.
  async function fetchQuestionCountByTopicId(topicId) {
    const topicIds = await collectDescendantTopicIds(topicId);
    const { data, error } = await client.rpc('get_topic_question_count', { p_topic_ids: topicIds });
    if (error) throw error;
    return data || 0;
  }

  // ---- "Rastgele Test" modunun tek giriş kapısı ----------------------------
  // Eskiden openRandomQuiz (app.js) fetchQuestionsByPath ile TÜM konu bankasını
  // indirip tarayıcıda shuffle+slice(0,20) yapıyordu — bu da tarayıcıya (Network
  // sekmesinden görülebilecek şekilde) her zaman tam bankanın inmesi demekti.
  // Artık rastgele seçim VE ücretsiz hak sayacı sunucudaki get_random_test_questions()
  // RPC'sinde: premium ise sınırsız rastgele 20, değilse konu başına 2 hakla
  // sınırlı rastgele 10 soru döner. Hak bittiyse RPC hata döner, biz bunu
  // FREE_LIMIT_REACHED koduyla üst katmana (app.js) iletiyoruz.
  //
  // NOT (2026-08-12 güvenlik düzeltmesi): RPC artık tek parametre alıyor
  // (p_root_topic_id). Alt konu id listesini biz burada hesaplamıyoruz —
  // sunucu, kök id'den kendi hesaplıyor. Eski imzada ayrı bir p_topic_key
  // gönderiyorduk; bu, hak sayacının anahtarını sorulacak konudan
  // ayırabildiği için istismar edilebiliyordu (bkz. migration 20260812000006).
  async function fetchRandomTestQuestions(path) {
    const { data: topic, error: topicError } = await client.from('topics').select('id, title').eq('source_file', path).maybeSingle();
    if (topicError) throw topicError;
    if (!topic) throw new Error(`Soru kaynağı bulunamadı: ${path}`);
    const { data, error } = await client.rpc('get_random_test_questions', {
      p_root_topic_id: topic.id
    });
    if (error) {
      if (error.code === 'P0001' || /FREE_LIMIT_REACHED/.test(error.message || '')) {
        const limitError = new Error('FREE_LIMIT_REACHED');
        limitError.code = 'FREE_LIMIT_REACHED';
        throw limitError;
      }
      throw error;
    }
    return (data || []).map(mapQuestionRow);
  }

  // ---- cards/*.json (flip flashcard) karşılığı ----------------------------
  // loadCardDeck(doc) -> doc.cardFile ile çağrılır; {cards:[{question,answer}]} döner.
  // NOT: id kolonu bilinçli olarak seçiliyor — flip-card modu şu an sadece oturum
  // içi index kullanıyor, ama id burada olmazsa ileride kalıcı "öğrendim" işaretlemesi
  // (aralıklı tekrar) eklenmek istendiğinde dizi indeksine bağlı kalınır ve içeriğe
  // yeni kart eklendiğinde tüm kullanıcıların ilerlemesi kayar.
  async function fetchFlashcardsByPath(path) {
    const { data: deck, error: deckErr } = await client.from('card_decks').select('id').eq('source_file', path).eq('deck_type', 'flashcard').maybeSingle();
    if (deckErr) throw deckErr;
    if (!deck) throw new Error(`Kart destesi bulunamadı: ${path}`);
    const [{ data, error }, { data: totalCount, error: countErr }] = await Promise.all([
      client.from('flashcards').select('id, question, answer').eq('deck_id', deck.id).order('sort_order'),
      client.rpc('get_flashcard_count', { p_deck_id: deck.id })
    ]);
    if (error) throw error;
    if (countErr) throw countErr;
    return { cards: data, totalCount: totalCount ?? data.length };
  }

  // ---- Bağımsız flashcard desteleri (card_decks: deck_type='flashcard') ----
  // Bunlar quiz soru bankasından TÜRETİLMEMİŞ, ayrıca yazılmış soru-cevap
  // kartları (cards/*.json'dan seed edildi). fetchCardsByTopicId'nin aksine
  // questions tablosuna dokunmadığı için premium quiz içeriğinin cevabını
  // ifşa etmez — bu yüzden ücretsiz kategori olarak gösterilebilir.
  async function fetchFlashcardDecks() {
    const { data, error } = await client
      .from('card_decks')
      .select('id, title, category_id, source_file')
      .eq('deck_type', 'flashcard')
      .order('sort_order');
    if (error) throw error;
    return (data || [])
      .filter(row => row.category_id && row.source_file)
      .map(row => ({ id: row.id, title: row.title, categoryId: row.category_id, cardFile: row.source_file }));
  }

  // ---- Kart modu: topic_id'ye göre soruları kart formatına çevirir ----------
  // Çoktan seçmeli soruyu flip-card formatına dönüştürür:
  //   question → prompt metni
  //   answer   → doğru şıkkın metni
  async function fetchCardsByTopicId(topicId) {
    // NOT (2026-08-19 düzeltme): eskiden questions tablosundan doğrudan
    // seçim yapılıyordu — RLS (questions_premium_read) admin/premium
    // olmayanı tamamen engellediği için bu kartlar hep "direkt premium"a
    // düşüyordu, Genel Mevzuat'taki kart destelerinin aksine hiç 5 kartlık
    // ücretsiz önizleme yoktu. get_topic_card_preview RPC'si aynı "ilk 5
    // ücretsiz" davranışını burada da uyguluyor; gerçek toplam sayı da
    // (total_count) upsell mesajı için ayrıca dönüyor.
    const topicIds = await collectDescendantTopicIds(topicId);
    const { data, error } = await client.rpc('get_topic_card_preview', { p_topic_ids: topicIds });
    if (error) throw error;
    const rows = data || [];
    const cards = rows
      .filter(row => row.prompt && Array.isArray(row.options) && row.options[row.answer_index] != null)
      .map(row => ({ question: row.prompt, answer: row.options[row.answer_index] }));
    const totalCount = rows.length ? rows[0].total_count : 0;
    return { cards, totalCount };
  }

  // ---- exam-blueprint/topics-taxonomy.json karşılığı -----------------------
  async function fetchExamTaxonomy() {
    const { data: examTopics, error } = await client
      .from('exam_topics')
      .select('topic_id, title, category_id, status, question_source, linked_topic_id, card_deck_id, topics!exam_topics_linked_topic_id_fkey(source_file), card_decks!exam_topics_card_deck_id_fkey(source_file)')
      .order('sort_order');
    if (error) throw error;
    const topics = {};
    examTopics.forEach(t => {
      const questionFile = t.question_source === 'cards' ? t.card_decks?.source_file : t.topics?.source_file;
      topics[t.topic_id] = {
        title: t.title,
        category: t.category_id,
        questionFile,
        status: t.status
      };
    });
    return { topics };
  }

  // ---- exam-blueprint/exam-blueprint.json karşılığı ------------------------
  async function fetchExamBlueprint() {
    const [{ data: kadrolar, error: kErr }, { data: items, error: iErr }] = await Promise.all([
      client.from('exam_kadrolar').select('*'),
      client.from('exam_blueprint_items').select('*').order('sort_order')
    ]);
    if (kErr) throw new Error(`Kadrolar yüklenemedi: ${kErr.message}`);
    if (iErr) throw new Error(`Sınav taslağı yüklenemedi: ${iErr.message}`);
    if (!Array.isArray(kadrolar) || !Array.isArray(items)) throw new Error('Sınav taslağı beklenmeyen formatta döndü.');
    const byKadro = new Map();
    items.forEach(item => {
      if (!byKadro.has(item.kadro)) byKadro.set(item.kadro, []);
      byKadro.get(item.kadro).push({ topicId: item.topic_id, count: item.question_count });
    });
    const result = {};
    kadrolar.forEach(k => {
      result[k.kadro] = { durationMinutes: k.duration_minutes, topics: byKadro.get(k.kadro) || [] };
    });
    return result;
  }

  return { fetchCatalogue, fetchQuestionsByPath, fetchQuestionsByPathExact, fetchFlashcardsByPath, fetchFlashcardDecks, fetchCardsByTopicId, fetchExamTaxonomy, fetchExamBlueprint, fetchRandomTestQuestions, fetchQuestionCount, fetchQuestionCountByTopicId };
})();