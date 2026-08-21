const STORAGE_KEY = 'sinavrotasi-study-progress-v2';
const EXAM_KINDS = ['mock', 'kadro-exam'];
const DEFAULT_DAILY_GOAL = 20;
const DAILY_GOAL_MIN = 1;
const DAILY_GOAL_MAX = 500;
const QUESTION_TIME_LIMIT = 60;
const PROGRESS_DEVICE_ID_STORAGE_KEY = 'sinavrotasi-progress-device-id-v1';

// ---- Zamanlama sabitleri (önceden dosya içinde dağınık "magic number" olarak vardı) ----
const TOAST_DURATION_MS = 2400;          // Toast bildiriminin ekranda kalma süresi
const CLOUD_SYNC_DEBOUNCE_MS = 1500;     // Progress değişikliğinden sonra Supabase'e yazana kadar bekleme (debounce)
const SEARCH_FOCUS_DELAY_MS = 300;       // Arama input'una modal açıldıktan sonra odaklanma gecikmesi

const ROLES = [
  { key: 'memur', label: 'Memur' },
  { key: 'sef', label: 'Şef' },
  { key: 'sayman', label: 'Sayman' },
  { key: 'sube-mudur', label: 'Şube Müdürü' }
];

const ROLE_ICONS = { memur: 'idcard', sef: 'clipboard', sayman: 'calculator', 'sube-mudur': 'landmark' };

// --- BİLGİ KARTLARI KATALOĞU ---
const CARD_CATEGORY_ORDER = ['general-legislation', 'meb-legislation', 'general-culture'];

// Kart kataloğu artık statik değil — state.catalogue'dan (Supabase) dinamik üretilir.
// getCardCatalogue() her zaman güncel veriyi döndürür.
function getCardCatalogue() {
  if (!state.catalogue) return {};
  const result = {};
  CARD_CATEGORY_ORDER.forEach(key => {
    const cat = state.catalogue[key];
    if (!cat) return;
    const meta = categoryCardMeta(key);
    // Standart: TÜM kart kaynakları (flashcard destesi ya da soru bankasından
    // türetilen) Genel Mevzuat'takiyle aynı "ilk 5 kart ücretsiz, sonrası
    // premium" davranışını izler. quiz-derived kartlar artık
    // get_topic_card_preview RPC'siyle çekiliyor (bkz. content-repo.js) —
    // bu RPC sunucu tarafında zaten free kullanıcıya 5 satırla sınırlıyor,
    // bu yüzden burada "free: false" ile önden tamamen kapatmaya gerek yok.
    const flashcardDecks = (state.flashcardDecks || [])
      .filter(d => d.categoryId === key)
      .map(d => ({ id: d.id, title: d.title, cardFile: d.cardFile, free: true }));
    // Aynı başlık için flashcard destesi zaten varsa quiz-derived kopyasını
    // eklemiyoruz — aksi halde aynı konu listede iki kez görünüyordu.
    const normalizeTitle = (title) => (title || '').trim().toLocaleLowerCase('tr-TR');
    const flashcardTitles = new Set(flashcardDecks.map(d => normalizeTitle(d.title)));
    const quizDerived = (cat.topics || [])
      .filter(t => (t.questionCount || 0) > 0 && !flashcardTitles.has(normalizeTitle(t.title)))
      .map(t => ({ id: t.id, title: t.title, topicId: t.id, free: true }));
    result[key] = {
      title: cat.title,
      description: cat.subtitle || meta.description,
      icon: meta.icon,
      iconClass: meta.iconClass,
      documents: [...flashcardDecks, ...quizDerived]
    };
  });
  return result;
}

const cardDecks = new Map();

const state = {
  view: 'home',
  catalogue: null,
  catalogueError: '',
  flashcardDecks: null,
  activeCategoryKey: null,
  activeDocument: null,
  navStack: [],
  questionBanks: new Map(),
  quiz: null,
  cardStudy: null,
  expandedMistakeGroup: null,
  denemeler: null,
  denemelerError: '',
  denemelerRoleKey: null,
  totalDueFlashcards: 0
};

// Rota Ayarları State'i
const routeSettings = {
  mode: 'Sana Özel Karma',
  questions: 20,
  time: 'Süreli'
};

// Native (Capacitor) katmanı — ana uygulama koyu header'a sahip olduğu için
// durum çubuğu açık/beyaz ikonlarla başlatılır. Web'de tamamen etkisizdir.
window.NativeUX?.init({ statusBarStyle: 'DARK' });

const app = document.getElementById('app');
const scrollArea = document.getElementById('scroll-area');
const toast = document.getElementById('toast');
const navButtons = [...document.querySelectorAll('[data-nav]')];

// Konu Paneli (Topic Sheet) Elementleri
const topicSheet = document.getElementById('topicSheet');
const topicBackdrop = document.getElementById('topicBackdrop');
const closeTopicSheetButton = document.getElementById('closeTopicSheet');
const topicSheetTitle = document.getElementById('topicSheetTitle');
const topicSheetSubtitle = document.getElementById('topicSheetSubtitle');
const topicEyebrow = document.getElementById('topicEyebrow');
const topicHeadingIcon = document.getElementById('topicHeadingIcon');
const topicList = document.getElementById('topicList');
const topicProgressText = document.getElementById('topicProgressText');
const topicProgressBar = document.getElementById('topicProgressBar');
const topicBreadcrumbWrap = document.getElementById('topicBreadcrumbWrap');

// Rota Paneli (Route Sheet) Elementleri
const routeSheet = document.getElementById('routeSheet');
const closeRouteSheetButton = document.getElementById('closeRouteSheet');
const startRouteButton = document.getElementById('startRouteButton');
const summaryMode = document.getElementById('summaryMode');
const summaryDuration = document.getElementById('summaryDuration');

// Arama Paneli Elementleri
const openSearchButton = document.getElementById('openSearchButton');
const searchSheet = document.getElementById('searchSheet');
const closeSearchSheetButton = document.getElementById('closeSearchSheet');
const searchInput = document.getElementById('searchInput');
const searchResultsList = document.getElementById('searchResultsList');

let timerInterval = null;
let searchFocusTimer = null;
let searchScrollTop = null;
if (!window.SRProgressSync) throw new Error('İlerleme senkronizasyon modülü yüklenemedi.');
let progress = loadProgress();

const iconPaths = {
  alertX: '<circle cx="12" cy="12" r="9"/><path d="m9.5 9.5 5 5m0-5-5 5"/>',
  scale: '<path d="M12 3v18"/><path d="M6 6h12"/><path d="m6 6-4 7h8L6 6Z"/><path d="m18 6-4 7h8l-4-7Z"/><path d="M8 21h8"/>',
  landmark: '<path d="m3 10 9-6 9 6"/><path d="M5 10h14"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/><path d="M4 18h16M3 22h18"/>',
  schoolbook: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M8 4v16"/><path d="M12 8h4M12 12h4"/><path d="m14 15 .7 1.4 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2L14 15Z"/>',
  gavel: '<path d="m14 13-7.5 7.5a1 1 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6 4 4-6 6-4-4Z"/>',
  arrow: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 2 5-6"/>',
  refresh: '<path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  statTopics: '<rect x="4.5" y="4.5" width="15" height="15" rx="4"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  statQuestions: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.7 2.7 5.3-5.7"/>',
  statTrials: '<path d="M12 3.2 13.7 5l2.5-.5.6 2.5 2.4.9-.9 2.4 1.7 1.9-1.7 1.9.9 2.4-2.4.9-.6 2.5-2.5-.5-1.7 1.8-1.7-1.8-2.5.5-.6-2.5-2.4-.9.9-2.4L4 12.2l1.7-1.9-.9-2.4 2.4-.9.6-2.5 2.5.5Z"/><path d="M9 13.5 12.5 21l1-4"/><path d="m15 13.5-1.8 3.7"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 15.5c.7-1 2-1.5 3-1.5s2.3.5 3 1.5"/><path d="M15 9h3M15 12h3M15 15h3"/>',
  clipboard: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z"/><path d="m9.5 11 1.5 1.5L14.5 9M9.5 15 11 16.5 14.5 13"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/><path d="M8 19h8"/>',
  squareCheck: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 2.5 2.5L16 9"/>',
  circleCheckBig: '<circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 12.9 17 21.5l-5-3-5 3 1.5-8.6"/>',
};

function svg(name, className = 'ui-icon') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('show'), TOAST_DURATION_MS);
}

// NOT: Yapay zeka ile açıklama özelliği kaldırıldı (maliyet/gizlilik denetimi
// sonrası). `mistakeItemHTML` artık açıklama butonu göstermiyor.
function mistakeItemHTML(question, idx) {
  return `<article class="quiz-result-item" data-explain-item="${idx}">
    <p>${escapeHtml(question.prompt)}</p>
    <small>Doğru cevap: ${escapeHtml(question.options[question.answerIndex])}</small>
  </article>`;
}

function haptic(duration = 18) {
  if (window.NativeUX && window.NativeUX.isNative) {
    window.NativeUX.haptic(duration);
    return;
  }
  if ('vibrate' in navigator) navigator.vibrate(duration);
}

function defaultProgress() {
  return { userId: null, answers: 0, correctAnswers: 0, dailyAnswers: {}, counterShards: {}, completedSections: {}, completedTests: [], flaggedQuestions: {}, reportedQuestions: {}, selectedRole: null, purchasedRoles: [], wrongQuestions: {}, dailyGoal: DEFAULT_DAILY_GOAL, docStats: {}, lastActivity: null };
}

function sanitizeProgress(saved, fallbackUserId = null) {
  if (!saved || typeof saved !== 'object') return defaultProgress();
  const parsedGoal = Number(saved.dailyGoal);
  const safeGoal = Number.isFinite(parsedGoal) && parsedGoal >= DAILY_GOAL_MIN && parsedGoal <= DAILY_GOAL_MAX ? Math.round(parsedGoal) : DEFAULT_DAILY_GOAL;
  const sanitized = {
    ...defaultProgress(), ...saved,
    userId: saved.userId || fallbackUserId || null,
    dailyAnswers: saved.dailyAnswers || {},
    counterShards: (saved.counterShards && typeof saved.counterShards === 'object') ? saved.counterShards : {},
    completedSections: saved.completedSections || {},
    completedTests: Array.isArray(saved.completedTests) ? saved.completedTests : [],
    flaggedQuestions: saved.flaggedQuestions || {},
    reportedQuestions: saved.reportedQuestions || {},
    purchasedRoles: Array.isArray(saved.purchasedRoles) ? saved.purchasedRoles : [],
    wrongQuestions: saved.wrongQuestions || {},
    dailyGoal: safeGoal,
    docStats: (saved.docStats && typeof saved.docStats === 'object') ? saved.docStats : {},
    lastActivity: (saved.lastActivity && typeof saved.lastActivity === 'object') ? saved.lastActivity : null
  };
  return window.SRProgressSync.normalizeProgressCounters(sanitized, fallbackUserId);
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return sanitizeProgress(saved);
  } catch (error) {
    return defaultProgress();
  }
}

let cloudSyncTimer = null;
let cloudSyncInFlight = false;
let cloudSyncPending = false;
// M-04 düzeltmesi: sunucudan en son çekilen progress_version. Push sırasında
// bu değer WHERE koşuluna eklenir (optimistic lock) — araya başka bir cihaz
// yazmışsa update 0 satır etkiler, kör üzerine yazma yerine merge devreye girer.
let knownProgressVersion = 0;

function scheduleCloudSync() {
  if (!window.currentUser?.id) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(pushProgressToCloud, CLOUD_SYNC_DEBOUNCE_MS);
}

function getProgressDeviceId() {
  const existing = localStorage.getItem(PROGRESS_DEVICE_ID_STORAGE_KEY);
  if (existing && /^[a-zA-Z0-9_.:-]{1,160}$/.test(existing)) return existing;
  const generated = window.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  localStorage.setItem(PROGRESS_DEVICE_ID_STORAGE_KEY, generated);
  return generated;
}

// İki cihazdaki sayaçlar cihaz-bazlı CRDT parçalarıyla birleşir. Böylece iki
// cihazda farklı çözülen soruların toplamı `max()` nedeniyle kaybolmaz; yalnız
// aynı cihazın tekrar senkronize edilen eski kopyası idempotent kalır.
function mergeProgress(local, server) {
  if (!server) return local;
  if (!local) return server;
  const base = local.answers >= server.answers ? local : server;
  const other = base === local ? server : local;
  const merged = { ...base };

  merged.completedSections = { ...other.completedSections, ...base.completedSections };
  merged.flaggedQuestions = { ...other.flaggedQuestions, ...base.flaggedQuestions };
  merged.reportedQuestions = { ...other.reportedQuestions, ...base.reportedQuestions };
  merged.wrongQuestions = { ...other.wrongQuestions, ...base.wrongQuestions };
  merged.purchasedRoles = Array.from(new Set([...(other.purchasedRoles || []), ...(base.purchasedRoles || [])]));
  window.SRProgressSync.mergeProgressCounters(merged, local, server, merged.userId || local.userId || server.userId);

  const testIds = new Set();
  merged.completedTests = [...(base.completedTests || []), ...(other.completedTests || [])].filter(test => {
    const key = test.id || `${test.kind}-${test.completedAt || ''}`;
    if (testIds.has(key)) return false;
    testIds.add(key);
    return true;
  });

  return merged;
}

async function pushProgressToCloud() {
  const userId = window.currentUser?.id;
  if (!userId) return;
  if (cloudSyncInFlight) { cloudSyncPending = true; return; }
  cloudSyncInFlight = true;
  try {
    // H-05 düzeltmesi: eşleşen satır sayısını kontrol ediyoruz. profiles satırı
    // (örn. handle_new_user trigger'ı henüz çalışmadıysa) yoksa update sessizce
    // 0 satır etkiler ve kullanıcı ilerlemesinin kaydedildiğini sanır.
    const { data: updatedRows, error } = await supabaseClient
      .from('profiles')
      .update({ progress })
      .eq('id', userId)
      .eq('progress_version', knownProgressVersion)
      .select('id, progress_version');
    if (error) {
      console.error('İlerleme sunucuya kaydedilemedi:', error);
    } else if (!updatedRows || updatedRows.length === 0) {
      // M-04: 0 satır etkilendi — ya profil satırı yok ya da başka bir cihaz
      // araya girip version'ı ilerletti. Sunucudaki son hali çekip merge edip
      // tekrar deniyoruz; körce üzerine yazmıyoruz.
      const { data: serverRow, error: fetchError } = await supabaseClient
        .from('profiles')
        .select('id, progress, progress_version')
        .eq('id', userId)
        .maybeSingle();
      if (fetchError || !serverRow) {
        console.error('İlerleme kaydedilemedi: profil satırı bulunamadı (id=' + userId + ').');
        showToast('İlerleme buluta kaydedilemedi. Lütfen tekrar giriş yapmayı deneyin.');
      } else {
        const serverProgress = sanitizeProgress(serverRow.progress);
        progress = mergeProgress(progress, serverProgress);
        knownProgressVersion = serverRow.progress_version;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        cloudSyncPending = true; // birleşmiş hali bir sonraki turda tekrar gönder
      }
    } else {
      knownProgressVersion = updatedRows[0].progress_version;
    }
  } catch (err) {
    console.error('İlerleme senkronizasyonu başarısız:', err);
  } finally {
    cloudSyncInFlight = false;
    if (cloudSyncPending) {
      cloudSyncPending = false;
      pushProgressToCloud();
    }
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  scheduleCloudSync();
  updateHeader();
  if (state.view === 'home' || state.view === 'profile' || state.view === 'mistakes') render();
}

// Bekleyen (debounce'lanmış) senkronizasyonu hemen tetikler. Sekme kapatılırken/gizlenirken
// veya çıkış yapılırken 1500ms'lik bekleme süresi içinde kalan son değişikliğin sunucuya
// hiç ulaşmadan kaybolmasını önler.
function flushProgressSync() {
  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
    return pushProgressToCloud();
  }
  return Promise.resolve();
}

// --- WEB KLAVYE ALGILAMA (visualViewport) ---
// native-ux.js'teki Capacitor Keyboard eklentisi yalnızca native (Android/iOS
// paketlenmiş) uygulamada çalışır. Tarayıcıda test ederken (veya native
// eklenti henüz kurulu değilken) --keyboard-height / .keyboard-open hiç
// güncellenmiyordu; bu da açık bir bottom-sheet'in (ör. arama paneli) klavye
// açılınca ekranın altında, klavyenin arkasında kalıp görünmez olmasına yol
// açıyordu. visualViewport API'si tarayıcıda klavye yüksekliğini tespit etmemizi
// sağlar; aynı CSS değişkeni/class'ı besleyerek native ile aynı mekanizmayı
// web'de de çalıştırırız. window.visualViewport yoksa (eski tarayıcı) sessizce
// hiçbir şey yapılmaz.
if (window.visualViewport) {
  const vv = window.visualViewport;
  let lastKeyboardHeight = 0;
  const updateKeyboardHeight = () => {
    // Adres çubuğu/araç çubuğu kaynaklı küçük farkları klavye sanmamak için
    // eşik uyguluyoruz (150px altı fark klavye değildir).
    const heightDiff = window.innerHeight - vv.height - vv.offsetTop;
    const keyboardHeight = heightDiff > 150 ? Math.round(heightDiff) : 0;
    if (keyboardHeight === lastKeyboardHeight) return;
    lastKeyboardHeight = keyboardHeight;
    document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    document.body.classList.toggle('keyboard-open', keyboardHeight > 0);
  };
  vv.addEventListener('resize', updateKeyboardHeight);
  vv.addEventListener('scroll', updateKeyboardHeight);
}

// Sekme arka plana alındığında / kapatılmak üzereyken bekleyen senkronizasyonu zorla.
// 'pagehide' 'beforeunload'a göre daha güvenilir tetiklenir (bfcache dahil).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushProgressSync();
});
window.addEventListener('pagehide', () => { flushProgressSync(); });

// Native uygulama arka plana alındığında/öne döndüğünde (native-ux.js üzerinden).
// Arka plana alınca: bekleyen ilerleme senkronunu zorla + açık bir süreli sınav
// varsa arka plana alınma anını kaydet (setInterval arka planda native tarafından
// durdurulabilir/gecikebilir; süreyi gerçek zamana göre düzeltmek için gerekli).
document.addEventListener('nativeux:pause', () => {
  flushProgressSync();
  if (state.quiz && state.quiz.isTimed) {
    state.quiz.backgroundedAt = Date.now();
  }
});

// Öne dönünce: arka planda geçen gerçek süreyi sınav sayacından düş. Süre bu
// sırada tükenmişse sınavı otomatik bitir; hâlâ vakit varsa sayacı gerçek
// kalan süreyle yeniden başlat.
document.addEventListener('nativeux:resume', () => {
  const quiz = state.quiz;
  if (!quiz || !quiz.isTimed || !quiz.backgroundedAt) return;
  const elapsedSeconds = Math.floor((Date.now() - quiz.backgroundedAt) / 1000);
  quiz.backgroundedAt = null;
  if (elapsedSeconds <= 0) return;
  quiz.timeLeft = Math.max(0, quiz.timeLeft - elapsedSeconds);
  if (quiz.timeLeft <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    showToast('Arka plandayken sınavın süresi doldu.');
    renderQuizResult();
  } else if (!quiz.completionRecorded) {
    renderQuiz();
    startQuizTimer();
  }
});

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStreak() {
  let streak = 0;
  const cursor = new Date();
  while (progress.dailyAnswers[dateKey(cursor)] > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getDailyGoal() {
  const value = Number(progress.dailyGoal);
  return Number.isFinite(value) && value >= DAILY_GOAL_MIN && value <= DAILY_GOAL_MAX ? value : DEFAULT_DAILY_GOAL;
}

function setDailyGoal(rawValue) {
  const parsed = Math.round(Number(rawValue));
  if (!Number.isFinite(parsed) || parsed < DAILY_GOAL_MIN || parsed > DAILY_GOAL_MAX) {
    showToast(`Lütfen ${DAILY_GOAL_MIN} ile ${DAILY_GOAL_MAX} arasında bir sayı gir.`);
    return false;
  }
  progress.dailyGoal = parsed;
  saveProgress();
  showToast(`Günlük hedef ${parsed} soru olarak güncellendi.`);
  return true;
}

function getStats() {
  const completedSections = Object.keys(progress.completedSections).length;
  const completedMocks = progress.completedTests.filter(test => EXAM_KINDS.includes(test.kind)).length;
  const todayAnswers = Number(progress.dailyAnswers[dateKey()] || 0);
  const dailyGoal = getDailyGoal();
  return {
    completedSections,
    solvedQuestions: Number(progress.answers || 0),
    completedMocks,
    streak: getStreak(),
    todayAnswers,
    dailyGoal,
    dailyPercentage: Math.min(100, Math.round((todayAnswers / dailyGoal) * 100)),
    accuracy: progress.answers ? Math.round((progress.correctAnswers / progress.answers) * 100) : 0
  };
}

function setNav(name) {
  navButtons.forEach(button => button.classList.toggle('active', button.dataset.nav === name));
}

// --- SHEET DURUM YÖNETİMİ ---
// Aynı anda yalnızca bir sheet açık kalabilir. Böylece arama açıldığında arkada
// eski bir kategori paneli görünmez ve hem X hem Android geri tuşu aynı temiz
// kapanış yolunu kullanır.
const allSheets = [routeSheet, topicSheet, searchSheet];

function setSheetOpen(sheet, isOpen) {
  if (!sheet) return;
  sheet.classList.toggle('open', isOpen);
  sheet.setAttribute('aria-hidden', String(!isOpen));
  sheet.inert = !isOpen;
}

function restoreSearchScrollPosition() {
  if (searchScrollTop === null) return;
  const top = searchScrollTop;
  searchScrollTop = null;
  const restore = () => { scrollArea.scrollTop = top; };

  // Android klavyesi kapanırken tarayıcı kaydırma konumunu bir kez daha
  // değiştirebilir. Aynı konumu sonraki karede de geri yüklemek, ana ekranın
  // başlığının/kategorilerinin kaybolmasını önler.
  restore();
  window.requestAnimationFrame(restore);
  window.setTimeout(restore, 240);
}

function clearSearchState({ dismissKeyboard = true, restoreScroll = true } = {}) {
  window.clearTimeout(searchFocusTimer);
  searchFocusTimer = null;
  searchInput.value = '';
  searchResultsList.innerHTML = '';
  searchInput.blur();
  if (dismissKeyboard) {
    document.body.classList.remove('keyboard-open');
    document.documentElement.style.setProperty('--keyboard-height', '0px');
    window.NativeUX?.hideKeyboard?.();
  }
  if (restoreScroll) restoreSearchScrollPosition();
}

function closeAllSheets(exceptSheet = null) {
  allSheets.forEach(sheet => setSheetOpen(sheet, sheet === exceptSheet));
  if (exceptSheet !== searchSheet) clearSearchState();
  topicBackdrop.classList.toggle('open', Boolean(exceptSheet));
}

window.go = function go(view) {
  closeAllSheets();
  state.view = view;
  setNav(view);
  render();
  scrollArea.scrollTop = 0;
  if (view === 'bank') loadDenemeler();
};

function getCategories() {
  return state.catalogue ? Object.entries(state.catalogue) : [];
}

function slugify(value) {
  return String(value).toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function looksLikeDocument(title) {
  return /sayılı|kanunu|yönetmeliği|kararnamesi|khk/i.test(title);
}

function normalizeItem(item) {
  if (typeof item !== 'string') return item;
  return { id: slugify(item), title: item, type: looksLikeDocument(item) ? 'document' : 'topic', contentStatus: 'planned', questionCount: 0, articleCount: 0, children: [] };
}

function getCategory(categoryKey) {
  return state.catalogue && state.catalogue[categoryKey];
}

function getCategoryItems(categoryKey) {
  const category = getCategory(categoryKey);
  const role = progress.selectedRole;
  return category ? (category.topics || []).map(normalizeItem).filter(item => !role || !item.kadrolar || item.kadrolar.includes(role)) : [];
}

function isRolePurchased(role = progress.selectedRole) {
  // Kadro erişimi yalnızca sunucunun doğruladığı premium durumuna dayanır.
  // Eski cihazlarda kalmış purchasedRoles değeri yetki kanıtı değildir.
  return !role || window.currentUserIsPremium === true;
}

function getDocumentProgress(documentItem) {
  const sections = documentItem.children || [];
  if (!sections.length) return 0;
  const completed = sections.filter(section => progress.completedSections[section.id]).length;
  return Math.round((completed / sections.length) * 100);
}

function getCategoryProgress(categoryKey) {
  const items = getCategoryItems(categoryKey).filter(item => item.type === 'document' && item.children && item.children.length);
  if (!items.length) return 0;
  const values = items.map(getDocumentProgress);
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function getActiveDocuments() {
  const purchased = isRolePurchased();
  return getCategories().flatMap(([categoryKey]) => getCategoryItems(categoryKey)
    .map((item, index) => ({ item, categoryKey, index }))
    .filter(entry => (entry.item.type === 'document' || entry.item.type === 'topic') && entry.item.questionFile && (purchased || entry.index === 0)));
}

function categoryCardMeta(categoryKey) {
  const presets = {
    'general-legislation': { title: 'Mevzuat', description: 'Kanunlar, yönetmelikler ve resmi düzenlemeler.', icon: 'scale', iconClass: '' },
    'general-culture': { title: 'Ortak Alan Bilgisi', description: 'Türkçe, Genel Kültür gibi mevzuatta yer almayan konular.', icon: 'landmark', iconClass: 'blue' },
    'meb-legislation': { title: 'MEB Mevzuatı', description: 'Millî Eğitim Bakanlığı mevzuat ve yönergeleri.', icon: 'schoolbook', iconClass: 'red' }
  };
  return presets[categoryKey] || { title: getCategory(categoryKey)?.title || 'Konu', description: getCategory(categoryKey)?.subtitle || '', icon: 'book', iconClass: '' };
}

function loadingView() {
  return `<section class="screen neutral-screen"><div class="empty-state"><span class="empty-state-icon">${svg('refresh')}</span><h3>İçerikler hazırlanıyor</h3><p>Konu ve soru bankası yükleniyor.</p></div></section>`;
}

function errorView() {
  return `<section class="screen neutral-screen"><div class="empty-state empty-state-error"><span class="empty-state-icon">${svg('book')}</span><h3>İçerikler yüklenemedi</h3><p>${escapeHtml(state.catalogueError || 'Sunucuya bağlanılamadı, internet bağlantını kontrol et.')}</p><button class="reader-primary" id="retryLoadButton" type="button">Tekrar Dene</button></div></section>`;
}

function statCard(icon, colorClass, number, label, target) {
  return `<button class="stat stat-button" data-stat-target="${target}" type="button"><span class="stat-icon ${colorClass}">${svg(icon)}</span><strong>${number}</strong><span>${label}</span></button>`;
}

function homeView() {
  if (!state.catalogue) return state.catalogueError ? errorView() : loadingView();
  const stats = getStats();
  const categories = getCategories().filter(([key]) => getCategoryItems(key).length > 0).map(([key]) => {
    const meta = categoryCardMeta(key);
    const topics = getCategoryItems(key);
    const activePackages = topics.filter(item => item.questionFile).length;
    const metaText = activePackages ? `${topics.length} başlık • ${activePackages} aktif paket` : `${topics.length} başlık • içerik planlanıyor`;
    return `<article class="category" role="button" tabindex="0" data-open-category="${key}">
      <div class="cat-icon ${meta.iconClass}">${svg(meta.icon)}</div>
      <div class="cat-copy"><h4>${escapeHtml(meta.title)}</h4><p>${escapeHtml(meta.description)}</p><small>${metaText}</small></div>
      <div class="chevron">${svg('arrow')}</div>
    </article>`;
  }).join('');

  return `<section class="screen home-screen">
    <div class="stats">
      ${statCard('squareCheck', '', stats.completedSections, 'Konu<br>Tamamlandı', 'profile')}
      ${statCard('circleCheckBig', 'accent', stats.solvedQuestions, 'Soru<br>Çözüldü', 'profile')}
      ${statCard('award', 'amber', stats.completedMocks, 'Deneme<br>Tamamlandı', 'bank')}
      ${statCard('flame', 'accent', stats.streak, 'Günlük<br>Seri', 'profile')}
    </div>
    <div class="section-head"><h3>Test Kategorileri</h3></div>
    <section class="categories">${categories}</section>
    
    <!-- BUGÜNKÜ ROTA BUTONU -->
    <button class="cta-btn" id="openRouteSheetButton" type="button">
      <div class="cta-icon">${svg('target')}</div><div><strong>Bugünkü Rota</strong><span>Önerilen planı gör veya özelleştir</span></div><span class="chevron-w">${svg('arrow')}</span>
    </button>
    ${state.totalDueFlashcards > 0 ? `
    <button class="cta-btn cta-btn-flashcards" id="openDueFlashcardsButton" type="button">
      <div class="cta-icon">${svg('gavel')}</div><div><strong>Bugün ${state.totalDueFlashcards} kart tekrar seni bekliyor</strong><span>Leitner kutu sistemine göre öncelikli</span></div><span class="chevron-w">${svg('arrow')}</span>
    </button>` : ''}
  </section>`;
}

function bankView() {
  const stats = getStats();
  const roleKey = progress.selectedRole;
  const roleLabel = ROLES.find(r => r.key === roleKey)?.label || '';

  let listHtml;
  if (state.denemelerError) {
    listHtml = `<div class="empty-state empty-state-error"><h3>Denemeler yüklenemedi</h3><p>${escapeHtml(state.denemelerError)}</p><button class="reader-primary" id="retryDenemelerButton" type="button">Tekrar Dene</button></div>`;
  } else if (!state.denemeler || state.denemelerRoleKey !== roleKey) {
    listHtml = `<div class="empty-state"><p>Denemeler yükleniyor…</p></div>`;
  } else if (!state.denemeler.length) {
    listHtml = window.currentUserIsPremium === false
      ? `<div class="empty-state"><p>Deneme sınavları premium üyelere özel. Devam etmek için premium üyeliğe geç.</p></div>`
      : `<div class="empty-state"><p>${escapeHtml(roleLabel)} kadrosu için henüz yayınlanmış deneme yok.</p></div>`;
  } else {
    listHtml = `<div class="deneme-list">${state.denemeler.map(d => `
      <article class="deneme-card">
        <div class="deneme-card-info">
          <h3>${escapeHtml(d.title)}</h3>
          <p>${d.duration_minutes ? `${d.duration_minutes} dk` : 'Süresiz'} • ${d.questionCount} soru</p>
        </div>
        <button class="reader-primary" data-start-deneme="${d.id}" type="button">Başla</button>
      </article>`).join('')}</div>`;
  }

  return `<section class="screen content-screen">
    <div class="page-heading"><h2>Deneme Sınavları</h2><p>Aktif soru bankalarından oluşan denemelerle performansını ölç.</p></div>
    <div class="metric-strip"><div><strong>${stats.completedMocks}</strong><span>Tamamlanan deneme</span></div><div><strong>%${stats.accuracy}</strong><span>Genel doğruluk</span></div></div>
    <article class="practice-card">
      <div class="practice-card-icon">${svg('target')}</div>
      <div><h3>Kadro Bazlı Gerçek Sınav</h3><p>Seçtiğin kadronun konu ağırlıklarına göre otomatik deneme oluştur.</p></div>
      <button class="reader-primary" id="startKadroExamButton" type="button">Başlat</button>
    </article>
    <div class="section-head"><h3>${escapeHtml(roleLabel)} Denemeleri</h3></div>
    ${listHtml}
  </section>`;
}

function getWrongQuestionsGrouped() {
  const map = new Map();
  Object.values(progress.wrongQuestions).forEach(q => {
    const catKey = q.categoryKey || 'other';
    const docKey = q.documentId || 'other-doc';
    if (!map.has(catKey)) map.set(catKey, new Map());
    const docMap = map.get(catKey);
    if (!docMap.has(docKey)) docMap.set(docKey, { documentId: docKey, documentTitle: q.documentTitle || 'Diğer Sorular', questions: [] });
    docMap.get(docKey).questions.push(q);
  });
  return map;
}

function getMistakeDocuments(categoryKey) {
  const grouped = getWrongQuestionsGrouped();
  const docMap = grouped.get(categoryKey);
  if (!docMap) return [];
  let list = [...docMap.values()];
  if (categoryKey !== 'other' && getCategory(categoryKey)) {
    const allowedIds = new Set(getCategoryItems(categoryKey).map(item => item.id));
    list = list.filter(doc => allowedIds.has(doc.documentId));
  }
  return list.sort((a, b) => b.questions.length - a.questions.length);
}

function mistakeCategoryMeta(categoryKey) {
  if (categoryKey === 'other' || !getCategory(categoryKey)) return { title: 'Diğer Sorular', icon: 'book', iconClass: '' };
  return categoryCardMeta(categoryKey);
}

function getMistakeCategories() {
  const grouped = getWrongQuestionsGrouped();
  return [...grouped.keys()].map(key => {
    const docs = getMistakeDocuments(key);
    const count = docs.reduce((sum, d) => sum + d.questions.length, 0);
    if (!count) return null;
    const meta = mistakeCategoryMeta(key);
    return { key, title: meta.title, icon: meta.icon, iconClass: meta.iconClass, count };
  }).filter(Boolean).sort((a, b) => b.count - a.count);
}

function mistakesView() {
  const totalCount = Object.keys(progress.wrongQuestions).length;
  if (!totalCount) {
    return `<section class="screen content-screen">
      <div class="page-heading"><h2>Yanlışlarım</h2><p>Daha önce yanlış yaptığın tüm sorular burada birikir.</p></div>
      <div class="empty-inline">Henüz yanlış yaptığın bir soru yok.</div>
    </section>`;
  }
  const categories = getMistakeCategories();
  return `<section class="screen content-screen">
    <div class="page-heading"><span>TEKRAR HAVUZU</span><h2>Yanlışlarım</h2><p>Daha önce yanlış yaptığın tüm sorular burada birikir.</p></div>
    <article class="practice-card">
      <div class="practice-card-icon">${svg('flame')}</div>
      <div><span>TEKRAR HAVUZU</span><h3>${totalCount} soru</h3><p>Tüm yanlış sorularını sırasıyla tekrar çöz.</p></div>
      <button class="reader-primary" id="startWrongPoolButton" type="button">Başlat</button>
    </article>
    <div class="section-head" style="margin-top:18px"><h3>Yanlışlarım</h3></div>
    <section class="categories">
      ${categories.map(cat => `<article class="category" role="button" tabindex="0" data-open-mistake-category="${cat.key}">
        <div class="cat-icon ${cat.iconClass}">${svg(cat.icon)}</div>
        <div class="cat-copy"><h4>${escapeHtml(cat.title)}</h4><small>${cat.count} soru</small></div>
        <div class="chevron">${svg('arrow')}</div>
      </article>`).join('')}
    </section>
  </section>`;
}

function openMistakeCategorySheet(categoryKey) {
  clearInterval(timerInterval);
  timerInterval = null;
  closeAllSheets(topicSheet);
  topicSheet.classList.add('open');
  topicSheet.setAttribute('aria-hidden', 'false');
  topicBackdrop.classList.add('open');
  renderMistakeCategoryLevel(categoryKey);
}

function renderMistakeCategoryLevel(categoryKey) {
  resetSheetClasses();
  const meta = mistakeCategoryMeta(categoryKey);
  const docs = getMistakeDocuments(categoryKey);
  const total = docs.reduce((sum, d) => sum + d.questions.length, 0);
  applySheetHeader({ title: meta.title, subtitle: `${total} yanlış soru`, eyebrow: 'YANLIŞLARIM', icon: meta.icon, iconClass: meta.iconClass });
  topicBreadcrumbWrap.innerHTML = '';
  setSheetProgress(`${docs.length} konu`, 0);
  if (!docs.length) {
    topicList.innerHTML = `<div class="empty-inline">Bu kategoride yanlış sorun yok.</div>`;
    topicSheet.scrollTop = 0;
    return;
  }
  topicList.innerHTML = docs.map((doc, index) => `
    <article class="topic-item" data-mistake-doc-index="${index}" role="button" tabindex="0">
      <div class="topic-number">${String(index + 1).padStart(2, '0')}</div>
      <div class="topic-copy"><h4>${escapeHtml(doc.documentTitle)}</h4><p>${doc.questions.length} yanlış soru</p></div>
      <div class="topic-arrow">${svg('arrow')}</div>
    </article>`).join('');
  topicList.querySelectorAll('[data-mistake-doc-index]').forEach(element => {
    const open = () => renderMistakeDocument(categoryKey, docs[Number(element.dataset.mistakeDocIndex)]);
    element.addEventListener('click', open);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
  topicSheet.scrollTop = 0;
}

function renderMistakeDocument(categoryKey, doc) {
  topicSheet.classList.add('document-flow');
  const meta = mistakeCategoryMeta(categoryKey);
  applySheetHeader({ title: doc.documentTitle, subtitle: `${doc.questions.length} yanlış soru`, eyebrow: 'YANLIŞLARIM', icon: 'book', iconClass: meta.iconClass });
  renderBreadcrumb(meta.title, () => renderMistakeCategoryLevel(categoryKey));
  setSheetProgress(`${doc.questions.length} soru`, 0);
  topicList.innerHTML = `
    <button class="reader-primary" id="startMistakeDocButton" type="button" style="width:100%;margin-bottom:14px">Bu konudaki ${doc.questions.length} soruyu çöz</button>
    <div class="quiz-result-list">
      ${doc.questions.map((q, idx) => mistakeItemHTML(q, idx)).join('')}
    </div>`;
  document.getElementById('startMistakeDocButton').addEventListener('click', () => startMistakeDocumentQuiz(categoryKey, doc));
  topicSheet.scrollTop = 0;
}

function startMistakeDocumentQuiz(categoryKey, doc) {
  if (!doc.questions.length) return showToast('Bu konuda tekrar edilecek soru yok.');
  startQuiz({
    questions: doc.questions,
    kind: 'wrong-group',
    title: doc.documentTitle,
    subtitle: `${doc.questions.length} soru • tekrar`,
    returnView: () => renderMistakeCategoryLevel(categoryKey)
  });
}

function startWrongPool() {
  const questions = Object.values(progress.wrongQuestions);
  if (!questions.length) return showToast('Tekrar edilecek soru yok.');
  closeAllSheets(topicSheet);
  topicSheet.classList.add('open');
  topicSheet.setAttribute('aria-hidden', 'false');
  topicBackdrop.classList.add('open');
  startQuiz({
    questions,
    kind: 'wrong-pool',
    title: 'Yanlışlarım',
    subtitle: `${questions.length} soru • tekrar havuzu`,
    returnView: closeTopicSheet
  });
}

// --- BİLGİ KARTLARI (KARTLARIM) EKRANLARI ---
function cardsView() {
  return `<section class="screen content-screen">
    <div class="page-heading"><span>KARTLARIM</span><h2>Bilgi Kartları</h2><p>Kategorini seç, soru-cevap kartlarıyla hızlı tekrar yap.</p></div>
    <section class="categories">
      ${CARD_CATEGORY_ORDER.map(key => {
        const meta = getCardCatalogue()[key];
        const activeCount = meta.documents.filter(d => d.cardFile).length;
        const metaText = meta.documents.length ? `${meta.documents.length} kaynak • ${activeCount} aktif set` : 'İçerik yakında eklenecek';
        return `<article class="category" role="button" tabindex="0" data-open-card-category="${key}">
          <div class="cat-icon ${meta.iconClass}">${svg(meta.icon)}</div>
          <div class="cat-copy"><h4>${escapeHtml(meta.title)}</h4><p>${escapeHtml(meta.description)}</p><small>${metaText}</small></div>
          <div class="chevron">${svg('arrow')}</div>
        </article>`;
      }).join('')}
    </section>
  </section>`;
}

function openCardCategorySheet(categoryKey) {
  const category = getCardCatalogue()[categoryKey];
  if (!category) return showToast('Kategori bulunamadı.');
  clearInterval(timerInterval);
  timerInterval = null;
  closeAllSheets(topicSheet);
  topicSheet.classList.add('open');
  topicSheet.setAttribute('aria-hidden', 'false');
  topicBackdrop.classList.add('open');
  renderCardCategoryLevel(categoryKey);
}

function renderCardCategoryLevel(categoryKey) {
  const category = getCardCatalogue()[categoryKey];
  resetSheetClasses();
  applySheetHeader({ title: category.title, subtitle: 'Çalışmak istediğin kaynağı seç.', eyebrow: 'BİLGİ KARTLARI', icon: category.icon, iconClass: category.iconClass });
  topicBreadcrumbWrap.innerHTML = '';
  setSheetProgress('Bir kaynak seç', 0);
  if (!category.documents.length) {
    topicList.innerHTML = `<section class="empty-state content-plan"><span class="empty-state-icon">${svg('book')}</span><h3>Bu kategori için kart seti hazırlanıyor</h3><p>Kaynaklar eklendiğinde burada otomatik olarak görünecek.</p></section>`;
    topicSheet.scrollTop = 0;
    return;
  }
  topicList.innerHTML = category.documents.map((doc, index) => {
    const active = doc.topicId || doc.cardFile;
    const info = active ? 'Aktif kart seti' : 'Yakında eklenecek';
    return `<article class="topic-item ${active ? '' : 'is-disabled'}" data-card-doc-index="${index}" role="button" tabindex="0">
      <div class="topic-number">${String(index + 1).padStart(2, '0')}</div>
      <div class="topic-copy"><h4>${escapeHtml(doc.title)}</h4><p class="topic-due-info">${info}</p></div>
      <div class="topic-arrow">${svg('arrow')}</div>
    </article>`;
  }).join('');
  topicList.querySelectorAll('[data-card-doc-index]').forEach(element => {
    const open = () => {
      const doc = category.documents[Number(element.dataset.cardDocIndex)];
      if (!doc.topicId && !doc.cardFile) return showToast('Bu kaynak için kart seti henüz eklenmedi.');
      openCardDeck(doc, categoryKey);
    };
    element.addEventListener('click', open);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
  topicSheet.scrollTop = 0;

  // Faz 4: her gerçek flashcard destesi (cardFile) için "bugün N kart tekrar"
  // rozetini asenkron doldur — deste listesi kendisi senkron render edildi,
  // rozetler geldiğinde ilgili satırın alt metnini günceller.
  const flashcardDocs = category.documents
    .map((doc, index) => ({ doc, index }))
    .filter(({ doc }) => doc.cardFile);
  if (flashcardDocs.length && window.currentUser) {
    ContentRepo.fetchDueFlashcardCounts(flashcardDocs.map(({ doc }) => doc.id))
      .then(counts => {
        flashcardDocs.forEach(({ doc, index }) => {
          const due = counts[doc.id] || 0;
          if (!due) return;
          const el = topicList.querySelector(`[data-card-doc-index="${index}"] .topic-due-info`);
          if (el) el.textContent = `Bugün tekrar: ${due} kart`;
        });
      })
      .catch(() => {}); // sessizce geç — rozet süsleme, kritik değil
  }
}

async function loadCardDeck(doc) {
  if (cardDecks.has(doc.id)) return cardDecks.get(doc.id);
  let cards;
  let totalCount;
  let progressMap = {};
  let isRealFlashcardDeck = false;
  if (doc.topicId) {
    const data = await ContentRepo.fetchCardsByTopicId(doc.topicId);
    cards = Array.isArray(data.cards) ? data.cards : [];
    // totalCount RPC'den (get_topic_card_preview) geliyor — free kullanıcı
    // için satır sayısıyla (5) aynı olmayabilir, "X kart daha var" upsell'i
    // bu farktan tetiklenir (flashcard destelerindeki mantığın aynısı).
    totalCount = typeof data.totalCount === 'number' ? data.totalCount : cards.length;
  } else if (doc.cardFile) {
    isRealFlashcardDeck = true;
    const data = await ContentRepo.fetchFlashcardsByPath(doc.cardFile);
    cards = Array.isArray(data.cards) ? data.cards : [];
    // RLS ücretsiz kullanıcıya sadece ilk 5 kartı döner; totalCount gerçek
    // deste boyutunu (get_flashcard_count RPC'siyle) taşır — aradaki fark
    // varsa "X kart daha premium'da" mesajı göstereceğiz.
    totalCount = typeof data.totalCount === 'number' ? data.totalCount : cards.length;
    // Leitner tekrar takibi: sadece gerçek flashcards.id'si olan (questions'tan
    // türetilmemiş) kartlarda mümkün. Giriş yapmamış kullanıcı için boş kalır,
    // bu durumda kartlar normal karışık sırayla gösterilir (aşağıya bakınız).
    try {
      progressMap = await ContentRepo.fetchFlashcardProgress(doc.id);
    } catch (error) {
      progressMap = {}; // ilerleme çekilemezse sessizce normal moda düş
    }
  } else {
    throw new Error('Bu kaynak için kart seti henüz eklenmedi.');
  }
  const result = { cards, totalCount, progressMap, isRealFlashcardDeck };
  cardDecks.set(doc.id, result);
  return result;
}

async function openCardDeck(doc, categoryKey) {
  // Standart: tüm kart kaynakları (flashcard destesi ya da soru bankasından
  // türetilen) artık doc.free === true — sunucu tarafı (RLS / RPC) zaten
  // ücretsiz kullanıcıya sadece ilk 5 kartı döndürüyor, gerisi için
  // "Premium'a Geç" kartı ekleniyor. Bu satır yine de bir güvenlik ağı: doc.free
  // yanlışlıkla false gelirse önden keser.
  if (!doc.free && !requirePremiumOrWarn()) return;
  try {
    showToast('Kartlar hazırlanıyor…');
    const { cards, totalCount, progressMap, isRealFlashcardDeck } = await loadCardDeck(doc);
    if (!cards.length) return showToast('Bu kaynak için henüz kart bulunmuyor.');
    let ordered;
    if (isRealFlashcardDeck && Object.keys(progressMap).length) {
      // Leitner: tekrarı gelmiş (next_review_at geçmişte/şimdi) kartlar önce,
      // sonra hiç görülmemiş kartlar, sonra henüz tekrar zamanı gelmemişler.
      const now = Date.now();
      const withMeta = cards.map(card => {
        const progress = progressMap[card.id];
        const dueTime = progress ? new Date(progress.next_review_at).getTime() : -1; // hiç görülmemiş = en öncelikli
        return { card, dueTime, seen: !!progress };
      });
      withMeta.sort((a, b) => {
        const aDue = !a.seen || a.dueTime <= now;
        const bDue = !b.seen || b.dueTime <= now;
        if (aDue !== bDue) return aDue ? -1 : 1;
        return a.dueTime - b.dueTime;
      });
      ordered = withMeta.map(x => x.card);
    } else {
      ordered = shuffle(cards);
    }
    if (totalCount > cards.length) {
      ordered.push({ upsell: true, remaining: totalCount - cards.length });
    }
    state.cardStudy = { doc, categoryKey, cards: ordered, index: 0, flipped: false, progressMap: progressMap || {}, isRealFlashcardDeck };
    renderCardStudy();
  } catch (error) {
    showToast(error.message || 'Kartlar yüklenemedi.');
  }
}

function renderCardStudy() {
  const study = state.cardStudy;
  if (!study) return;
  topicSheet.classList.add('document-flow', 'card-study-active');
  topicSheet.classList.remove('quiz-active');
  const category = getCardCatalogue()[study.categoryKey];
  const current = study.cards[study.index];

  if (current.upsell) {
    applySheetHeader({ title: study.doc.title, subtitle: 'Premium içerik', eyebrow: 'BİLGİ KARTLARI', icon: 'gavel', iconClass: category.iconClass });
    renderBreadcrumb(category.title, () => { state.cardStudy = null; topicSheet.classList.remove('card-study-active'); renderCardCategoryLevel(study.categoryKey); });
    setSheetProgress('', 100);
    topicList.innerHTML = `
      <div class="card-study-wrap">
        <div class="empty-state content-plan" style="padding:32px 20px">
          <span class="empty-state-icon">${svg('lock')}</span>
          <h3>${current.remaining} kart daha var</h3>
          <p>Bu destenin ilk 5 kartı ücretsiz. Kalan ${current.remaining} kartı görmek için premium üyeliğe geç.</p>
          <div class="premium-purchase-options" style="display:flex; flex-direction:column; gap:10px; margin-top:16px">
            <button class="premium-buy-btn" type="button" data-product-id="premium_1ay" data-label="1 Ay" data-fallback-price="249₺">
              <span class="premium-btn-label">1 Ay</span>
              <span class="premium-btn-price">249₺</span>
            </button>
            <button class="premium-buy-btn" type="button" data-product-id="premium_2ay" data-label="2 Ay" data-fallback-price="449₺">
              <span class="premium-btn-label">2 Ay</span>
              <span class="premium-btn-price">449₺</span>
            </button>
            <button class="premium-buy-btn featured" type="button" data-product-id="premium_3ay" data-label="3 Ay" data-fallback-price="599₺">
              <span class="premium-btn-label">3 Ay <span class="premium-btn-badge">En avantajlı</span></span>
              <span class="premium-btn-price">599₺</span>
            </button>
          </div>
        </div>
        <div class="card-study-nav">
          <button class="card-nav-btn" id="cardPrevButton" type="button">${svg('arrowLeft')}</button>
          <span class="card-nav-count">${study.index + 1} / ${study.cards.length}</span>
          <button class="card-nav-btn" id="cardNextButton" type="button" disabled>${svg('arrowRight')}</button>
        </div>
      </div>`;
    document.querySelectorAll('.premium-buy-btn').forEach((btn) => {
      btn.addEventListener('click', () => purchasePremiumProduct(btn.dataset.productId, btn));
    });
    updatePremiumButtonPrices();
    document.getElementById('cardPrevButton')?.addEventListener('click', () => {
      if (study.index > 0) { study.index -= 1; study.flipped = false; renderCardStudy(); }
    });
    topicSheet.scrollTop = 0;
    return;
  }

  applySheetHeader({ title: study.doc.title, subtitle: `${study.index + 1} / ${study.cards.length}`, eyebrow: 'BİLGİ KARTLARI', icon: 'gavel', iconClass: category.iconClass });
  renderBreadcrumb(category.title, () => { state.cardStudy = null; topicSheet.classList.remove('card-study-active'); renderCardCategoryLevel(study.categoryKey); });
  setSheetProgress('', Math.round(((study.index + 1) / study.cards.length) * 100));
  // Leitner puanlama butonları: sadece gerçek flashcard destesinde, kullanıcı
  // giriş yapmışsa ve kart geri çevrilmişse gösterilir. topicId'den (quiz-derived)
  // gelen kartlarda stabil bir flashcards.id olmadığı için gösterilmez.
  const canRate = study.isRealFlashcardDeck && window.currentUser && current.id != null;
  const ratingHtml = (study.flipped && canRate) ? `
      <div class="card-rating-row" role="group" aria-label="Bu kartı ne kadar bildin?">
        <button class="card-rating-btn card-rating-zor" type="button" data-rating="zor">Zor</button>
        <button class="card-rating-btn card-rating-orta" type="button" data-rating="orta">Orta</button>
        <button class="card-rating-btn card-rating-kolay" type="button" data-rating="kolay">Kolay</button>
      </div>` : '';
  topicList.innerHTML = `
    <div class="card-study-wrap">
      <div class="flip-card ${study.flipped ? 'flipped' : ''}" id="flipCard">
        <div class="flip-card-inner">
          <div class="flip-card-face flip-card-front">
            <span class="flip-card-label">${escapeHtml(category.title)}</span>
            <span class="flip-card-q-mark">?</span>
            <p class="flip-card-text">${escapeHtml(current.question)}</p>
            <span class="flip-card-hint">Kartı çevirmek için tıkla</span>
          </div>
          <div class="flip-card-face flip-card-back">
            <p class="flip-card-text">${escapeHtml(current.answer)}</p>
            <span class="flip-card-hint">${canRate ? 'Ne kadar bildiğini işaretle' : 'Kartı geri çevirmek için tıkla'}</span>
          </div>
        </div>
      </div>
      ${ratingHtml}
      <div class="card-study-nav">
        <button class="card-nav-btn" id="cardPrevButton" type="button" ${study.index === 0 ? 'disabled' : ''}>${svg('arrowLeft')}</button>
        <span class="card-nav-count">${study.index + 1} / ${study.cards.length}</span>
        <button class="card-nav-btn" id="cardNextButton" type="button" ${study.index === study.cards.length - 1 ? 'disabled' : ''}>${svg('arrowRight')}</button>
      </div>
    </div>`;
  document.getElementById('flipCard').addEventListener('click', () => {
    study.flipped = !study.flipped;
    haptic(12);
    renderCardStudy();
  });
  document.getElementById('cardPrevButton')?.addEventListener('click', () => {
    if (study.index > 0) { study.index -= 1; study.flipped = false; renderCardStudy(); }
  });
  document.getElementById('cardNextButton')?.addEventListener('click', () => {
    if (study.index < study.cards.length - 1) { study.index += 1; study.flipped = false; renderCardStudy(); }
  });
  document.querySelectorAll('.card-rating-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rating = btn.dataset.rating;
      const priorProgress = study.progressMap[current.id];
      haptic(16);
      try {
        const updated = await ContentRepo.rateFlashcard(current.id, study.doc.id, rating, priorProgress);
        if (updated) study.progressMap[current.id] = updated;
      } catch (error) {
        showToast('Tekrar durumu kaydedilemedi, ama devam edebilirsin.');
      }
      if (study.index < study.cards.length - 1) {
        study.index += 1;
        study.flipped = false;
        renderCardStudy();
      } else {
        showToast('Bu desteyi bitirdin! 🎉');
        state.cardStudy = null;
        topicSheet.classList.remove('card-study-active');
        renderCardCategoryLevel(study.categoryKey);
      }
    });
  });
  topicSheet.scrollTop = 0;
}

function profileView() {
  const stats = getStats();
  const user = window.currentUser;
  const fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Aday';
  const email = user?.email || '';
  const initial = fullName.trim().charAt(0).toUpperCase() || '?';
  return `<section class="screen content-screen"><article class="profile-summary"><div class="profile-summary-avatar">${escapeHtml(initial)}</div><div><strong>${escapeHtml(fullName)}</strong><span>${escapeHtml(email)}</span></div></article>
  <section class="profile-goal-card">
    <div class="profile-goal-head"><span>GÜNLÜK ÇALIŞMA HEDEFİ</span><strong>${stats.dailyGoal} soru / gün</strong></div>
    <p class="profile-goal-desc">Her gün çözmek istediğin soru sayısını belirle, ana sayfadaki ilerleme halkası buna göre hesaplanır.</p>
    <div class="profile-goal-edit">
      <input type="number" id="profileDailyGoalInput" class="goal-edit-input" min="${DAILY_GOAL_MIN}" max="${DAILY_GOAL_MAX}" step="1" inputmode="numeric" value="${stats.dailyGoal}" aria-label="Günlük hedef soru sayısı">
      <button class="reader-primary" id="profileDailyGoalSaveButton" type="button">Kaydet</button>
    </div>
  </section>
  <section class="profile-goal-card">
    <div class="profile-goal-head"><span>ÇALIŞMALARIM</span><strong>İlerlemen</strong></div>
    <p class="profile-goal-desc">Bu değerler cevapların ve tamamladığın testlerle otomatik güncellenir.</p>
    <div class="study-grid">
      <article><span>Çözülen soru</span><strong>${stats.solvedQuestions}</strong></article>
      <article><span>Doğruluk oranı</span><strong>%${stats.accuracy}</strong></article>
      <article><span>Tamamlanan bölüm</span><strong>${stats.completedSections}</strong></article>
      <article><span>Günlük seri</span><strong>${stats.streak} gün</strong></article>
    </div>
  </section>
  <div class="profile-notice">İstatistiklerin hesabına otomatik olarak senkronize ediliyor; başka bir cihazdan giriş yaptığında da seninle gelir.</div><section class="profile-account-actions"><button class="reset-progress" id="resetProgressButton" type="button">${svg('refresh')}<span>İlerleme verisini sıfırla</span></button><button class="signout-btn" id="signOutButton" type="button">${svg('lock')}<span>Çıkış Yap</span></button></section></section>`;
}

function render() {
  const views = { home: homeView, bank: bankView, mistakes: mistakesView, cards: cardsView, profile: profileView };
  app.innerHTML = (views[state.view] || homeView)();
  bindViewEvents();
  updateHeader();
}

function bindViewEvents() {
  if (state.catalogueError) document.getElementById('retryLoadButton')?.addEventListener('click', loadCatalogue);
  app.querySelectorAll('[data-open-category]').forEach(element => {
    element.addEventListener('click', () => openTopicSheet(element.dataset.openCategory));
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openTopicSheet(element.dataset.openCategory); });
  });
  app.querySelectorAll('[data-open-card-category]').forEach(element => {
    element.addEventListener('click', () => openCardCategorySheet(element.dataset.openCardCategory));
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openCardCategorySheet(element.dataset.openCardCategory); });
  });
  app.querySelectorAll('[data-stat-target]').forEach(element => element.addEventListener('click', () => window.go(element.dataset.statTarget)));
  
  // Rota panelini açma butonu
  document.getElementById('openRouteSheetButton')?.addEventListener('click', openRouteSheet);
  document.getElementById('openDueFlashcardsButton')?.addEventListener('click', () => window.go('cards'));
  
  document.getElementById('startWrongPoolButton')?.addEventListener('click', startWrongPool);
  app.querySelectorAll('[data-open-mistake-category]').forEach(element => {
  element.addEventListener('click', () => openMistakeCategorySheet(element.dataset.openMistakeCategory));
  element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openMistakeCategorySheet(element.dataset.openMistakeCategory); });
    });
  document.getElementById('retryDenemelerButton')?.addEventListener('click', () => loadDenemeler(true));
  document.getElementById('startKadroExamButton')?.addEventListener('click', startKadroExam);
  app.querySelectorAll('[data-start-deneme]').forEach(button => {
    button.addEventListener('click', () => startDenemeSinavi(Number(button.dataset.startDeneme)));
  });
  document.getElementById('resetProgressButton')?.addEventListener('click', resetProgress);
  document.getElementById('signOutButton')?.addEventListener('click', async () => {
    await flushProgressSync();
    window.signOut();
  });

  const profileGoalInput = document.getElementById('profileDailyGoalInput');
  const profileGoalSaveButton = document.getElementById('profileDailyGoalSaveButton');
  profileGoalSaveButton?.addEventListener('click', () => { if (profileGoalInput) setDailyGoal(profileGoalInput.value); });
  profileGoalInput?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); profileGoalSaveButton?.click(); } });
}

function updateHeader() {
  const stats = getStats();
  const roleBadge = document.getElementById('userRoleBadge');
  if (roleBadge) roleBadge.textContent = ROLES.find(r => r.key === progress.selectedRole)?.label || '';
  const ring = document.getElementById('dailyGoalCircle');
  const percent = document.getElementById('dailyGoalPercent');
  const solved = document.getElementById('dailySolvedCount');
  const total = document.getElementById('dailyGoalTotal');
  const progressFill = document.getElementById('dailyProgressFill');
  const message = document.getElementById('dailyGoalMessage');
  if (!ring || !percent || !solved || !total || !progressFill || !message) return;
  ring.setAttribute('stroke-dasharray', `${stats.dailyPercentage}, 100`);
  percent.textContent = `%${stats.dailyPercentage}`;
  solved.textContent = stats.todayAnswers;
  total.textContent = stats.dailyGoal;
  progressFill.style.width = `${stats.dailyPercentage}%`;
  message.textContent = stats.dailyPercentage >= 100 ? 'Günlük hedefini tamamladın. Harika iş!' : stats.todayAnswers ? 'Hedefine düzenli biçimde yaklaşıyorsun.' : 'İlk soruyla günlük hedefini başlat.';
}

function resetProgress() {
  if (!window.confirm('Tüm yerel çalışma ilerlemesi sıfırlansın mı?')) return;
  const userId = progress.userId;
  progress = defaultProgress();
  progress.userId = userId;
  saveProgress();
  showToast('İlerleme verisi sıfırlandı.');
}

// --- ROTA PANELİ YÖNETİMİ ---
function openRouteSheet() {
  closeAllSheets(routeSheet);
  routeSheet.classList.add('open');
  topicBackdrop.classList.add('open');
}

function closeRouteSheet() {
  // GÜVENLİK KİLİDİ: Artık kendi başına yarım iş yapmıyor (sadece routeSheet +
  // şartlı backdrop), searchSheet'in durumunu hiç kontrol etmediği için
  // arkada arama açıkken backdrop'u yanlışlıkla kapatabiliyordu. closeAllSheets()
  // tüm panelleri ve backdrop'u tek seferde, birbirine göre tutarlı kapatır.
  closeAllSheets();
}

function updateRouteSummary() {
  startRouteButton.textContent = `${routeSettings.questions} Soruluk Rotayı Başlat`;
  if (routeSettings.time === 'Süresiz') {
    summaryDuration.textContent = 'Süresiz';
  } else {
    summaryDuration.textContent = `${routeSettings.questions} dakika`; // artık soru sayısı = dakika
  }
}

function bindRouteSheetEvents() {
  document.querySelectorAll('#modeGrid .mode-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modeGrid .mode-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      routeSettings.mode = btn.dataset.mode;
      summaryMode.textContent = routeSettings.mode;
    });
  });

  document.querySelectorAll('#questionChoices .choice').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#questionChoices .choice').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      routeSettings.questions = Number(btn.dataset.questions);
      updateRouteSummary();
    });
  });

  document.querySelectorAll('#timeChoices .choice').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#timeChoices .choice').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      routeSettings.time = btn.dataset.time;
      updateRouteSummary();
    });
  });

  closeRouteSheetButton?.addEventListener('click', closeRouteSheet);
  
  startRouteButton?.addEventListener('click', () => {
    closeAllSheets();
    startSmartPractice();
  });
}

// --- ARAMA PANELİ YÖNETİMİ ---
function openSearchSheet() {
  searchScrollTop = scrollArea.scrollTop;
  closeAllSheets(searchSheet);
  clearSearchState({ dismissKeyboard: false, restoreScroll: false });
  // Not: input'a otomatik focus() ARTIK yapılmıyor, bu yüzden panel açılırken
  // klavye kendiliğinden açılmıyor. Kullanıcı input'a dokununca klavye normal
  // şekilde açılır.
  runSearch('');
}

function closeSearchSheet() {
  // X ve Android geri tuşu: açık tüm katmanları ve klavyeyi tek seferde kapatır.
  closeAllSheets();
}

function collectSearchIndex() {
  const index = [];
  getCategories().forEach(([categoryKey, category]) => {
    getCategoryItems(categoryKey).forEach(item => {
      index.push({ type: item.type, title: item.title, categoryKey, categoryTitle: category.title, item, icon: item.type === 'document' ? 'gavel' : 'book' });
      (item.children || []).forEach(section => {
        index.push({ type: 'section', title: section.title, categoryKey, categoryTitle: category.title, item, section, icon: 'gavel', context: item.title });
        (section.children || []).forEach(article => {
          const label = article.summary || article.title || '';
          if (label) index.push({ type: 'article', title: label, categoryKey, categoryTitle: category.title, item, section, article, icon: 'book', context: `${item.title} • ${section.title}` });
        });
      });
    });
  });
  return index;
}

function runSearch(query) {
  if (!state.catalogue) {
    searchResultsList.innerHTML = '<div class="empty-inline">İçerikler henüz yüklenmedi.</div>';
    return;
  }
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    searchResultsList.innerHTML = '<div class="empty-inline">Aramak için en az 2 karakter yaz.</div>';
    return;
  }
  const needle = trimmed.toLocaleLowerCase('tr-TR');
  const results = collectSearchIndex().filter(entry => entry.title.toLocaleLowerCase('tr-TR').includes(needle)).slice(0, 30);
  searchResultsList.innerHTML = results.length ? results.map((result, index) => `
    <article class="topic-item" data-search-index="${index}" role="button" tabindex="0">
      <div class="topic-number">${svg(result.icon)}</div>
      <div class="topic-copy"><h4>${escapeHtml(result.title)}</h4><p>${escapeHtml(result.context || result.categoryTitle)}</p></div>
      <div class="topic-arrow">${svg('arrow')}</div>
    </article>`).join('') : '<div class="empty-inline">Sonuç bulunamadı.</div>';
  searchResultsList.querySelectorAll('[data-search-index]').forEach(element => {
    const open = () => openSearchResult(results[Number(element.dataset.searchIndex)]);
    element.addEventListener('click', open);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
}

function openSearchResult(result) {
  closeAllSheets(topicSheet);
  if (result.type === 'section' || result.type === 'article') {
    renderSummary(result.item, result.categoryKey);
  } else if (result.item.type === 'document') {
    renderDocumentHub(result.item, result.categoryKey);
  } else {
    renderTopicPlan(result.item, result.categoryKey);
  }
}

openSearchButton?.addEventListener('click', openSearchSheet);
closeSearchSheetButton?.addEventListener('click', closeSearchSheet);
searchInput?.addEventListener('input', () => runSearch(searchInput.value));

function resetSheetClasses() {
  topicSheet.classList.remove('document-flow', 'quiz-active', 'card-study-active');
}

function openTopicSheet(categoryKey) {
  const category = getCategory(categoryKey);
  if (!category) return showToast('Kategori bulunamadı.');
  clearInterval(timerInterval);
  timerInterval = null;
  closeAllSheets(topicSheet);
  state.activeCategoryKey = categoryKey;
  state.activeDocument = null;
  state.navStack = [{ kind: 'category', categoryKey }];
  topicSheet.classList.add('open');
  topicSheet.setAttribute('aria-hidden', 'false');
  topicBackdrop.classList.add('open');
  renderCategoryLevel(categoryKey);
}

function closeTopicSheet() {
  clearInterval(timerInterval);
  timerInterval = null;
  state.quiz = null;
  state.cardStudy = null;
  resetSheetClasses();
  // GÜVENLİK KİLİDİ: Eskiden burada backdrop sadece routeSheet'e bakılarak
  // kapatılıyordu; searchSheet açıkken bile backdrop kapanabiliyordu. Bu da
  // arama panelinin arkasındaki tıklama-engelleme katmanını kaybetmesine,
  // dokunuşların alttaki kategori kartlarına "sızmasına" ve topicSheet'in
  // durmadan yeniden açılmasına yol açıyordu. closeAllSheets() her şeyi
  // (routeSheet, searchSheet, backdrop dahil) tek seferde tutarlı kapatır.
  closeAllSheets();
}


function applySheetHeader({ title, subtitle, eyebrow, icon = 'book', iconClass = '' }) {
  topicSheetTitle.textContent = title;
  topicSheetSubtitle.textContent = subtitle;
  topicEyebrow.textContent = eyebrow;
  topicHeadingIcon.className = `topic-heading-icon ${iconClass}`.trim();
  topicHeadingIcon.innerHTML = svg(icon);
}

function renderBreadcrumb(label, onClick) {
  topicBreadcrumbWrap.innerHTML = `<div class="topic-breadcrumb-wrap">
      <button class="topic-breadcrumb-back" id="sheetBackButton" type="button" aria-label="Geri dön">${svg('back')}</button>
      <span class="topic-breadcrumb-pill">${escapeHtml(label)}</span>
    </div>`;
  document.getElementById('sheetBackButton').addEventListener('click', () => { haptic(14); onClick(); });
}

function setSheetProgress(label, percentage, completedLabel = 'tamamlandı') {
  topicProgressText.textContent = percentage ? `%${percentage} ${completedLabel}` : label;
  topicProgressBar.style.width = `${percentage}%`;
}

function renderCategoryLevel(categoryKey) {
  const category = getCategory(categoryKey);
  if (!category) return;
  resetSheetClasses();
  const meta = categoryCardMeta(categoryKey);
  applySheetHeader({ title: category.title, subtitle: category.subtitle, eyebrow: 'KONU KATEGORİSİ', icon: meta.icon, iconClass: meta.iconClass });
  topicBreadcrumbWrap.innerHTML = '';
  const progressPercent = getCategoryProgress(categoryKey);
  setSheetProgress('Henüz çalışılmadı', progressPercent);
  const items = getCategoryItems(categoryKey);
  topicList.innerHTML = items.map((item, index) => {
    const isDocument = item.type === 'document';
    const isComplete = isDocument && getDocumentProgress(item) === 100;
    const info = statLine(item);
    return `<article class="topic-item ${isComplete ? 'completed' : ''}" data-topic-index="${index}" role="button" tabindex="0"><div class="topic-number">${String(index + 1).padStart(2, '0')}</div><div class="topic-copy"><h4>${escapeHtml(item.title)}</h4><p>${info}</p></div>${isDocument && item.articleCount && item.contentStatus === 'sample' ? `<span class="article-range">ÖRNEK SET</span>` : ''}<div class="topic-arrow">${svg('arrow')}</div></article>`;
  }).join('');
  topicList.querySelectorAll('[data-topic-index]').forEach(element => {
    const open = () => {
      const item = items[Number(element.dataset.topicIndex)];
      if (item.type === 'document') renderDocumentHub(item, categoryKey);
      else renderTopicPlan(item, categoryKey);
    };
    element.addEventListener('click', open);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
  topicSheet.scrollTop = 0;
  refreshVisibleQuestionCounts(items, () => { if (state.activeCategoryKey === categoryKey && !state.activeDocument) renderCategoryLevel(categoryKey); });
}

function statValue(value) {
  return (value === null || value === undefined) ? '-' : value;
}

function statLine(item) {
  const sectionCount = (item.children || []).length;
  const sectionPart = sectionCount > 0 ? `${sectionCount} bölüm • ` : '';
  const articlePart = (item.articleCount !== null && item.articleCount !== undefined && item.articleCount !== 0)
    ? `${item.articleCount} madde • ` : '';
  return `${sectionPart}${articlePart}${statValue(item.questionCount)} soru`;
}

function statSpans(item, extraSpans = '') {
  const sectionCount = (item.children || []).length;
  const sectionSpan = sectionCount > 0 ? `<span><strong>${sectionCount}</strong> bölüm</span>` : '';
  const articleSpan = (item.articleCount !== null && item.articleCount !== undefined && item.articleCount !== 0)
    ? `<span><strong>${item.articleCount}</strong> madde</span>` : '';
  return `${sectionSpan}${articleSpan}<span><strong>${statValue(item.questionCount)}</strong> soru</span>${extraSpans}`;
}

function statusLabel(documentItem) {
  if (documentItem.contentStatus === 'sample') return 'ÖRNEK İÇERİK AKTİF';
  if (documentItem.questionFile) return 'İÇERİK PAKETİ AKTİF';
  return 'İÇERİK PLANLANIYOR';
}

function renderDocumentHub(documentItem, categoryKey) {
  state.activeDocument = documentItem;
  state.activeCategoryKey = categoryKey;
  topicSheet.classList.add('document-flow');
  topicSheet.classList.remove('quiz-active', 'card-study-active');
  applySheetHeader({ title: documentItem.title, subtitle: documentItem.questionFile ? statLine(documentItem) : 'İçerik yapısı hazır, kaynak paketi bekleniyor', eyebrow: 'MEVZUAT ÇALIŞMA MERKEZİ', icon: 'gavel', iconClass: categoryCardMeta(categoryKey).iconClass });
  renderBreadcrumb(getCategory(categoryKey).title, () => renderCategoryLevel(categoryKey));
  const documentProgress = getDocumentProgress(documentItem);
  setSheetProgress('Henüz çalışılmadı', documentProgress);
  const isActive = Boolean(documentItem.questionFile);
  const sectionsReady = Boolean(documentItem.children && documentItem.children.length);
  topicList.innerHTML = `<section class="document-overview-card">
      <div class="document-overview-top"><span class="document-number">${escapeHtml(documentItem.documentNumber || 'KONU')}</span><span class="document-status ${isActive ? '' : 'is-pending'}">${statusLabel(documentItem)}</span></div>
      <h4>${escapeHtml(documentItem.title)}</h4><p>${isActive ? 'Bölüm bazında çalışabilir, rastgele test çözebilir ve kritik notlarla hızlı tekrar yapabilirsin.' : 'Bu başlık için akış hazır. Bölüm ve soru verisi eklendiğinde kartlar otomatik olarak aktifleşir.'}</p>
      <div class="document-stats">${statSpans(documentItem, `<span><strong>%${documentProgress}</strong> ilerleme</span>`)}</div>
    </section>
    <div class="document-mode-grid">
      ${modeCard('sections', 'book', 'Madde Madde Çalış', 'Bölüm ve madde listesinden istediğin yere git.', sectionsReady)}
      ${modeCard('random', 'target', 'Rastgele 20 Soru', 'Kanunun tamamından rastgele sorular çöz.', isActive)}
      ${modeCard('truefalse', 'check', 'Doğru / Yanlış', 'Soruları doğru/yanlış olarak değerlendir.', isActive)}
      ${modeCard('summary', 'trophy', 'Özet ve Kritik Noktalar', 'Sınavda öne çıkan maddeleri hızlı tekrar et.', sectionsReady)}
    </div>`;
  topicList.querySelectorAll('[data-document-mode]').forEach(button => button.addEventListener('click', () => {
    if (button.disabled) return showToast('Bu mod, ilgili içerik paketi eklendiğinde açılacak.');
    haptic(18);
    const mode = button.dataset.documentMode;
    if (mode === 'sections') renderSections(documentItem, categoryKey);
    if (mode === 'random') openRandomQuiz(documentItem, categoryKey);
    if (mode === 'summary') renderSummary(documentItem, categoryKey);
    if (mode === 'truefalse') openTrueFalseMode(documentItem, categoryKey);
  }));
  topicSheet.scrollTop = 0;
  refreshVisibleQuestionCounts([documentItem], () => { if (state.activeDocument === documentItem) renderDocumentHub(documentItem, categoryKey); });
}

function modeCard(mode, icon, title, description, enabled) {
  return `<button class="document-mode-card ${enabled ? '' : 'is-disabled'}" data-document-mode="${mode}" type="button" ${enabled ? '' : 'disabled'}><span class="document-mode-icon">${svg(icon)}</span><strong>${title}</strong><small>${description}</small></button>`;
}

function renderTopicPlan(item, categoryKey) {
  state.activeDocument = item;
  state.activeCategoryKey = categoryKey;
  topicSheet.classList.add('document-flow');
  topicSheet.classList.remove('quiz-active', 'card-study-active');
  const isActive = Boolean(item.questionFile);
  const sectionsReady = Boolean(item.children && item.children.length);
  applySheetHeader({
    title: item.title,
    subtitle: isActive ? statLine(item) : 'İçerik yapısı hazır, kaynak paketi bekleniyor',
    eyebrow: 'KONU ÇALIŞMA MERKEZİ',
    icon: 'book',
    iconClass: categoryCardMeta(categoryKey).iconClass
  });
  renderBreadcrumb(getCategory(categoryKey).title, () => renderCategoryLevel(categoryKey));
  const topicProgress = progress.completedSections[item.id] ? 100 : 0;
  setSheetProgress('Henüz çalışılmadı', topicProgress);

  topicList.innerHTML = `<section class="document-overview-card">
      <div class="document-overview-top"><span class="document-number">KONU</span><span class="document-status ${isActive ? '' : 'is-pending'}">${statusLabel(item)}</span></div>
      <h4>${escapeHtml(item.title)}</h4><p>${isActive ? 'Bölüm bazında çalışabilir, rastgele test çözebilir ve kritik notlarla hızlı tekrar yapabilirsin.' : 'Bu başlık için akış hazır. Bölüm ve soru verisi eklendiğinde kartlar otomatik olarak aktifleşir.'}</p>
      <div class="document-stats">${statSpans(item, `<span><strong>%${topicProgress}</strong> ilerleme</span>`)}</div>
    </section>
    <div class="document-mode-grid">
      ${modeCard('sections', 'book', 'Madde Madde Çalış', 'Bölüm ve madde listesinden istediğin yere git.', sectionsReady)}
      ${modeCard('random', 'target', 'Rastgele 20 Soru', 'Konunun tamamından rastgele sorular çöz.', isActive)}
      ${modeCard('truefalse', 'check', 'Doğru / Yanlış', 'Soruları doğru/yanlış olarak değerlendir.', isActive)}
      ${modeCard('summary', 'trophy', 'Özet ve Kritik Noktalar', 'Sınavda öne çıkan maddeleri hızlı tekrar et.', sectionsReady)}
    </div>`;

  topicList.querySelectorAll('[data-document-mode]').forEach(button => button.addEventListener('click', () => {
    if (button.disabled) return showToast('Bu mod, ilgili içerik paketi eklendiğinde açılacak.');
    haptic(18);
    const mode = button.dataset.documentMode;
    if (mode === 'sections') renderSections(item, categoryKey);
    if (mode === 'random') openRandomQuiz(item, categoryKey);
    if (mode === 'summary') renderSummary(item, categoryKey);
    if (mode === 'truefalse') openTrueFalseMode(item, categoryKey);
  }));

  topicSheet.scrollTop = 0;
  refreshVisibleQuestionCounts([item], () => { if (state.activeDocument === item) renderTopicPlan(item, categoryKey); });
}

function renderSections(documentItem, categoryKey) {
  topicSheet.classList.add('document-flow');
  applySheetHeader({ title: 'Bölüm Seçimi', subtitle: 'Bir bölüme dokunarak karma sorularla başla.', eyebrow: 'MADDE MADDE ÇALIŞ', icon: 'gavel', iconClass: categoryCardMeta(categoryKey).iconClass });
  renderBreadcrumb(documentItem.title, () => renderDocumentHub(documentItem, categoryKey));
  setSheetProgress('Henüz çalışılmadı', getDocumentProgress(documentItem));
  const sections = documentItem.children || [];
  topicList.innerHTML = `<div class="document-section-head"><span>BÖLÜM TESTLERİ</span><strong>Bölüme tıkla, test başlasın</strong></div><div class="document-section-list">${sections.map((section, index) => {
    const completed = progress.completedSections[section.id];
    const childCount = (section.children || []).length;
    // "0" (madde aralığı literal string'i olarak) de boş değer sayılır — aksi
    // halde maddesi olmayan bölümlerde satırda kalıcı olarak "0" görünür.
    const hasArticleRange = Boolean(section.articleRange) && String(section.articleRange).trim() !== '0';
    const sectionMeta = hasArticleRange
      ? section.articleRange
      : (childCount > 0 ? `${childCount} madde` : `${statValue(section.questionCount)} soru`);
    return `<article class="document-section-item ${completed ? 'completed' : ''}" data-section-index="${index}" role="button" tabindex="0"><span class="document-section-number">${completed ? svg('check') : String(index + 1).padStart(2, '0')}</span><div><h4>${escapeHtml(section.title)}</h4><p>${escapeHtml(sectionMeta)}</p></div><span class="document-section-arrow">›</span></article>`;
  }).join('')}</div>`;
  topicList.querySelectorAll('[data-section-index]').forEach(element => {
    const open = () => openSectionQuiz(documentItem, sections[Number(element.dataset.sectionIndex)], categoryKey);
    element.addEventListener('click', open);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
  topicSheet.scrollTop = 0;
  refreshSectionQuestionCounts(sections);
}

// Madde Madde Çalış bölüm listesindeki maddesi olmayan alt konularda
// (articleRange yok, children yok) daha önce sabit "0" yazıyordu; burada
// gerçek soru sayısını topic_id üzerinden çekip ilgili satırı yerinde güncelliyoruz.
//
// NOT (2026-08-17 düzeltme): article_range sütunu bazı satırlarda boş yerine
// literal "0" string'i olarak kaydedilmiş olabiliyor (DB'de düzeltildi, ama
// admin panelinden yeniden aynı şekilde girilebilir). "0" JS'te truthy olduğu
// için `!section.articleRange` bu satırları hatalıca "maddesi var" sayıp
// yenileme hedeflerinin dışında bırakıyor, satır sonsuza kadar "0" göstermeye
// devam ediyordu. "0"ı da boş değer gibi ele alıyoruz.
async function refreshSectionQuestionCounts(sections) {
  const hasArticleRange = section => Boolean(section.articleRange) && String(section.articleRange).trim() !== '0';
  const targets = (sections || []).filter(section => !hasArticleRange(section) && !(section.children || []).length);
  if (!targets.length) return;
  const results = await Promise.allSettled(targets.map(async section => {
    const count = await ContentRepo.fetchQuestionCountByTopicId(section.id);
    return { section, count };
  }));
  results.forEach(result => {
    if (result.status !== 'fulfilled') { console.warn('Bölüm soru sayısı alınamadı:', result.reason); return; }
    const { section, count } = result.value;
    section.questionCount = count;
    const index = sections.indexOf(section);
    const row = topicList.querySelector(`[data-section-index="${index}"] p`);
    if (row) row.textContent = `${count} soru`;
  });
}

function renderSummary(documentItem, categoryKey) {
  topicSheet.classList.add('document-flow');
  applySheetHeader({ title: 'Özet ve Kritik Noktalar', subtitle: documentItem.title, eyebrow: 'HIZLI TEKRAR', icon: 'trophy', iconClass: categoryCardMeta(categoryKey).iconClass });
  renderBreadcrumb(documentItem.title, () => renderDocumentHub(documentItem, categoryKey));
  setSheetProgress('Henüz çalışılmadı', getDocumentProgress(documentItem));
  const sections = documentItem.children || [];
  topicList.innerHTML = `<div class="summary-list">${sections.map(section => {
    const hasOwnSummary = Boolean(section.summary || (section.keyPoints || []).length);
    const ownBlock = hasOwnSummary ? `${section.summary ? `<p class="summary-text">${escapeHtml(section.summary)}</p>` : ''}${(section.keyPoints || []).length ? `<ul>${section.keyPoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}` : '';
    const articleBlocks = (section.children || []).map(article => `<article class="summary-item"><span>${escapeHtml(article.articleLabel || 'Madde')}</span><h5>${escapeHtml(article.summary || article.title || '')}</h5>${(article.keyPoints || []).length ? `<ul>${article.keyPoints.slice(0, 3).map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}</article>`).join('');
    if (!ownBlock && !articleBlocks) return '';
    return `<section class="summary-section"><h4>${escapeHtml(section.title)}</h4>${ownBlock || articleBlocks}</section>`;
  }).join('')}</div>`;
  topicSheet.scrollTop = 0;
}

async function loadQuestionBank(documentItem) {
  if (state.questionBanks.has(documentItem.id)) return state.questionBanks.get(documentItem.id);
  
  try {
    // Önce JSON dosyasından dene (geriye uyumluluk için)
    if (documentItem.questionFile) {
      try {
        const data = await ContentRepo.fetchQuestionsByPath(documentItem.questionFile);
        const questions = Array.isArray(data.questions) ? data.questions : [];
        state.questionBanks.set(documentItem.id, questions);
        return questions;
      } catch (jsonError) {
        console.warn(`JSON dosyası yüklenemedi: ${documentItem.questionFile}`);
      }
    }

    // Veritabanından yükle. NOT: `questions` tablosu RLS ile korunuyor
    // (questions_premium_read → is_premium()), bu yüzden doğrudan seçim
    // güvenli — free/anon kullanıcı answer_index'e erişemez, boş sonuç alır.
    // (M-01 düzeltmesi): şemada `section_id` diye bir sütun yok; sorular
    // doğrudan `topic_id` ile bölüme/alt-konuya bağlanıyor. Bölüm testi filtresi
    // zaten `question.topicId === section.id` kullandığından sectionId'yi
    // topic_id'den türetiyoruz.
    const { data, error } = await supabaseClient
      .from('questions')
      .select('id,prompt,options,answer_index,topic_id')
      .eq('topic_id', documentItem.id)
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    
    const questions = (data || []).map(q => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      answerIndex: q.answer_index,
      topicId: q.topic_id,
      sectionId: q.topic_id
    }));
    
    state.questionBanks.set(documentItem.id, questions);
    return questions;
  } catch (error) {
    documentItem.questionFile = null;
    documentItem.contentStatus = 'planned';
    throw error;
  }
}

async function refreshVisibleQuestionCounts(items, onUpdate) {
  const targets = (items || []).filter(item => item && item.questionFile);
  if (!targets.length) return;
  // NOT: Burada artık loadQuestionBank() (tüm soru içeriğini indiren, premium'a
  // kilitli fonksiyon) DEĞİL, sadece sayı dönen ContentRepo.fetchQuestionCount()
  // kullanılıyor — hem ücretsiz kullanıcıda doğru sayıyı gösterir hem de premium
  // kullanıcıda gereksiz yere tüm soru bankasını indirmez.
  const results = await Promise.allSettled(targets.map(async item => {
    const count = await ContentRepo.fetchQuestionCount(item.questionFile);
    return { item, count };
  }));
  let changed = false;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { item, count } = result.value;
      if (item.questionCount !== count) {
        item.questionCount = count;
        changed = true;
      }
    } else {
      // Sayı alma hatası içeriğin bulunmadığı anlamına gelmez. Önceden burada
      // yeniden çizim tetikleniyor ve içerik yanlışlıkla pasif görünüyordu.
      console.warn('Soru sayısı alınamadı:', result.reason);
    }
  });
  if (changed) onUpdate();
}

function shuffle(list) {
  const items = list.slice();
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function tagQuestions(bank, documentItem, categoryKey) {
  return bank.map(question => ({
    ...question,
    documentId: documentItem.id,
    documentTitle: documentItem.title,
    categoryKey: categoryKey || null
  }));
}

// Premium gerektiren bir moda girmeden önce çağrılır. window.currentUserIsPremium
// app-guard.js tarafından oturum açılışında is_premium() RPC'siyle set edilir.
// false ise kullanıcıyı hiç sunucuya sormadan net bir mesajla durdurur — daha
// önce bu durumda sorgu sessizce 0 satır dönüyor ve "içerik yok" gibi
// yanıltıcı bir mesaj gösteriliyordu.
function requirePremiumOrWarn() {
  if (window.currentUserIsPremium === false) {
    openPremiumModal();
    return false;
  }
  return true;
}

function openPremiumModal() {
  const overlay = document.getElementById('premiumModalOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  updatePremiumButtonPrices();
}

function initPremiumModal() {
  const overlay = document.getElementById('premiumModalOverlay');
  if (!overlay) return;
  document.getElementById('premiumModalClose')?.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (event) => {
    if (event.target.id === 'premiumModalOverlay') overlay.classList.remove('open');
  });
  overlay.querySelectorAll('.premium-buy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const result = await purchasePremiumProduct(btn.dataset.productId, btn);
      if (result) overlay.classList.remove('open');
    });
  });
}

async function openSectionQuiz(documentItem, section, categoryKey) {
  if (!requirePremiumOrWarn()) return;
  try {
    showToast('Sorular hazırlanıyor…');
    const bank = tagQuestions(await loadQuestionBank(documentItem), documentItem, categoryKey);
    const questions = bank.filter(question => question.topicId === section.id);
    if (!questions.length) return showToast('Bu bölüm için henüz soru bulunmuyor.');
    startQuiz({
      questions,
      documentItem,
      section,
      kind: 'section',
      title: section.title,
      subtitle: `${documentItem.title} • ${section.articleRange || 'Karma sorular'}`,
      returnView: () => renderSections(documentItem, categoryKey)
    });
  } catch (error) {
    showToast(error.message || 'Sorular yüklenemedi.');
  }
}

async function openRandomQuiz(documentItem, categoryKey) {
  try {
    showToast('Rastgele test hazırlanıyor…');
    // NOT: Artık loadQuestionBank() (tüm bankayı indiren fonksiyon) kullanılmıyor.
    // Rastgele seçim VE ücretsiz hak sayacı (konu başına 2 deneme) sunucuda
    // (get_random_test_questions RPC) uygulanıyor — tarayıcıya asla hakkından
    // fazla soru inmiyor.
    const questions = tagQuestions(
      await ContentRepo.fetchRandomTestQuestions(documentItem.questionFile),
      documentItem,
      categoryKey
    );
    if (!questions.length) return showToast('Bu başlık için henüz soru bulunmuyor.');
    startQuiz({
      questions,
      documentItem,
      kind: 'random',
      title: documentItem.title,
      subtitle: `Rastgele ${questions.length} soru`,
      returnView: () => renderDocumentHub(documentItem, categoryKey)
    });
  } catch (error) {
    if (error.code === 'FREE_LIMIT_REACHED') {
      openPremiumModal();
      return showToast('Bu konu için 2 ücretsiz rastgele test hakkınızı kullandınız. Devam etmek için premium üyelik gerekiyor.');
    }
    showToast(error.message || 'Sorular yüklenemedi.');
  }
}

// "Aşağıdakilerden hangisi..." kalıbındaki sorular (Türkçe'de çok yaygın bir
// çoktan seçmeli kurgusu) D/Y moduna uygun değil: bu kalıp öğrenciye "şu
// listeden birini seç" der, ama D/Y'de tek bir aday cevap gösteriliyor —
// referans verdiği "aşağıdaki" liste hiç görünmüyor, soru anlamsızlaşıyor.
// Bu fonksiyon Türkçe karakterleri normalize ederek ("İ"/"I" -> "i" gibi)
// prompt'ta "aşağıd..." + "hangi..." birlikteliğini arar.
function isChooseFromListPrompt(prompt) {
  if (!prompt) return false;
  const normalized = prompt
    .toLocaleLowerCase('tr-TR')
    .replace(/i̇/g, 'i'); // TR-TR küçük harfe çevirince "İ" çoğu zaman "i̇" (nokta + i) olur
  return normalized.includes('aşağıd') && normalized.includes('hangi');
}

// ---- DOĞRU / YANLIŞ MODU ----------------------------------------
async function openTrueFalseMode(documentItem, categoryKey) {
  if (!requirePremiumOrWarn()) return;
  try {
    showToast('Doğru/Yanlış modu hazırlanıyor…');
    const bank = tagQuestions(await loadQuestionBank(documentItem), documentItem, categoryKey);
    if (!bank.length) return showToast('Bu başlık için henüz soru bulunmuyor.');

    // (1) Daha önce D/Y'ye SESSİZCE dahil edilen, hiç yanlış şıkkı olmayan
    // (bozuk/tek-şıklı) sorular artık bankaya hiç girmiyor. Eskiden bu
    // sorular "her zaman doğru cevap göster"e sessizce düşüyordu — bu,
    // bir veri kalitesi sorununu kullanıcıdan gizliyordu. Şimdi böyle
    // sorular D/Y havuzunun dışında tutuluyor (ÇS modunda hâlâ görünürler,
    // sadece D/Y'de kullanılmıyorlar).
    // Ayrıca "Aşağıdakilerden hangisi..." kalıbındaki sorular da aynı
    // sebeple (yukarıdaki not) D/Y havuzunun dışında tutuluyor.
    const usableBank = bank.filter(q =>
      q.options.filter((_, i) => i !== q.answerIndex).length > 0 &&
      !isChooseFromListPrompt(q.prompt)
    );
    if (!usableBank.length) return showToast('Bu başlık için Doğru/Yanlış moduna uygun soru bulunmuyor.');

    // (2) Aynı konuda art arda "Tekrar Dene"ye basıldığında ya da modüle
    // tekrar girildiğinde, mümkünse bir önceki turda görülen sorular hariç
    // tutulur — bank yeterince büyükse kullanıcı sürekli aynı 20 soruyla
    // karşılaşmaz. Bank küçükse (tekrar hariç tutunca 20'nin altına
    // düşüyorsa) tekrar dahil edilir, boş ekran görünmesindense tekrar
    // tercih edilir.
    const seenKey = documentItem.id;
    const recentlySeen = state.tfRecentlySeen?.get(seenKey) || new Set();
    const fresh = usableBank.filter(q => !recentlySeen.has(q.id));
    const pool = fresh.length >= Math.min(20, usableBank.length) ? fresh : usableBank;

    // Her soruyu D/Y kartına dönüştür:
    // %50 ihtimalle doğru şıkkı göster (cevap: DOĞRU)
    // %50 ihtimalle yanlış bir şıkkı göster (cevap: YANLIŞ)
    const selected = shuffle(pool).slice(0, Math.min(20, pool.length));
    const tfQuestions = selected.map(q => {
      const correctAnswer = q.options[q.answerIndex];
      const wrongOptions = q.options.filter((_, i) => i !== q.answerIndex);
      const showCorrect = Math.random() < 0.5;
      // (1) Distractor artık tamamen rastgele seçilmiyor — doğru cevaba
      // uzunluk (karakter sayısı) olarak en yakın olan yanlış şık(lar)
      // önceliklendiriliyor. Amaç: hem "bariz alakasız/çok kısa" şıkların
      // soruyu anlamsızca kolaylaştırmasını azaltmak, hem de prompt+cevap
      // birleşiminin daha doğal bir D/Y cümlesi gibi okunmasını sağlamak
      // (çok farklı uzunluktaki şıklar genelde gramer olarak da uyumsuz
      // düşüyor). Küçük bir rastgelelik payı (en yakın 2 aday arasından
      // seçim) tekdüzeliği önlüyor.
      let displayAnswer = correctAnswer;
      if (!showCorrect) {
        const byCloseness = wrongOptions
          .map(opt => ({ opt, diff: Math.abs(opt.length - correctAnswer.length) }))
          .sort((a, b) => a.diff - b.diff);
        const candidates = byCloseness.slice(0, Math.min(2, byCloseness.length));
        displayAnswer = candidates[Math.floor(Math.random() * candidates.length)].opt;
      }
      return {
        id: q.id,
        prompt: q.prompt,
        displayAnswer,
        isCorrectShown: showCorrect,
        correctAnswer,
        categoryKey: q.categoryKey,
        sourceQuestion: q,
      };
    });

    // (2) Bu turda gösterilen soruları "son görülenler" olarak işaretle.
    if (!state.tfRecentlySeen) state.tfRecentlySeen = new Map();
    state.tfRecentlySeen.set(seenKey, new Set(tfQuestions.map(q => q.id)));

    state.tfQuiz = {
      questions: tfQuestions,
      index: 0,
      score: 0,
      answers: [], // { correct: bool }[]
      documentItem,
      categoryKey,
      returnView: () => renderDocumentHub(documentItem, categoryKey),
    };

    topicSheet.classList.add('quiz-active');
    topicSheet.classList.remove('document-flow', 'card-study-active');
    renderTrueFalse();
  } catch (err) {
    showToast(err.message || 'Sorular yüklenemedi.');
  }
}

function renderTrueFalse() {
  const tf = state.tfQuiz;
  if (!tf) return;

  const q = tf.questions[tf.index];
  const total = tf.questions.length;
  const progressPct = Math.round((tf.index / total) * 100);
  const tagMeta = categoryCardMeta(tf.categoryKey);
  const tagLabel = tf.documentItem?.title || tagMeta.title;
  const bookmarked = !!progress.flaggedQuestions[q.id];

  topicList.innerHTML = `
    <div class="tf-shell">
      <div class="tf-header">
        <div class="tf-header-row">
          <button type="button" class="tf-icon-btn" id="tfClose" aria-label="Geri dön">${svg('back')}</button>
          <h2 class="tf-header-title"><span class="tf-title-correct">Doğru</span> <span class="tf-title-slash">/</span> <span class="tf-title-wrong">Yanlış</span></h2>
          <span class="tf-icon-btn" aria-hidden="true" style="visibility:hidden"></span>
        </div>
        <div class="tf-progress-row">
          <div class="tf-progress-track"><div class="tf-progress-fill" style="width:${progressPct}%"></div></div>
          <span class="tf-progress-label">${tf.index + 1} / ${total}</span>
        </div>
      </div>
      <div class="tf-body">
        <div class="tf-card">
          <div class="tf-content-box">
            <div class="tf-card-top">
              <span class="tf-topic-tag"><span class="tf-topic-icon">${svg(tagMeta.icon)}</span>${escapeHtml(tagLabel)}</span>
              <button type="button" class="tf-icon-btn tf-bookmark-inline${bookmarked ? ' is-active' : ''}" id="tfBookmark" aria-label="Soruyu kaydet" aria-pressed="${bookmarked}">${svg('bookmark')}</button>
            </div>
            <span class="tf-prompt-label">SORU</span>
            <p class="tf-prompt">${escapeHtml(q.prompt)}</p>
            <span class="tf-answer-label">GÖSTERİLEN CEVAP</span>
            <div class="tf-answer-chip">${escapeHtml(q.displayAnswer)}</div>
          </div>
          <p class="tf-question-cue">Bu cevap doğru mu?</p>
          <div class="tf-buttons">
            <button type="button" class="tf-btn tf-btn-neutral" id="tfWrong" aria-label="Bu ifade yanlış">
              <span class="tf-btn-glow" aria-hidden="true"></span>
              <span class="tf-btn-icon">${svg('alertX')}</span>Yanlış
            </button>
            <button type="button" class="tf-btn tf-btn-neutral" id="tfCorrect" aria-label="Bu ifade doğru">
              <span class="tf-btn-glow" aria-hidden="true"></span>
              <span class="tf-btn-icon">${svg('check')}</span>Doğru
            </button>
          </div>
          <div class="tf-result" id="tfResult" aria-live="polite" hidden></div>
        </div>
      </div>
      <div class="tf-sticky-footer" id="tfStickyFooter" hidden>
        <button type="button" class="tf-next-btn" id="tfNext">Sonraki Soru${svg('arrowRight')}</button>
      </div>
    </div>`;

  const exit = () => {
    state.tfQuiz = null;
    topicSheet.classList.remove('quiz-active');
    tf.returnView();
  };
  document.getElementById('tfClose').onclick = exit;

  document.getElementById('tfBookmark').onclick = () => {
    const nowBookmarked = !progress.flaggedQuestions[q.id];
    if (nowBookmarked) progress.flaggedQuestions[q.id] = true;
    else delete progress.flaggedQuestions[q.id];
    saveProgress();
    const btn = document.getElementById('tfBookmark');
    btn.classList.toggle('is-active', nowBookmarked);
    btn.setAttribute('aria-pressed', String(nowBookmarked));
    showToast(nowBookmarked ? 'Soru kaydedildi' : 'Kaydedilenlerden çıkarıldı');
  };

  const wrongBtn = document.getElementById('tfWrong');
  const correctBtn = document.getElementById('tfCorrect');

  const answer = (userSaidCorrect) => {
    const wasRight = userSaidCorrect === q.isCorrectShown;
    tf.answers.push({ correct: wasRight });
    if (wasRight) tf.score++;
    // Doğru/Yanlış modu, ana quiz ile aynı kalıcı ilerleme ve yanlış havuzuna
    // SADECE kartta doğru cevap gösterildiğinde (q.isCorrectShown) yazar.
    // Neden: kartta yanlış bir şık gösterilip kullanıcı onu yanlışlıkla
    // "doğru" işaretlerse, bu kullanıcının konuyu bilmediğini değil, sadece
    // o tek distractor'ı doğru cevapla karıştırdığını gösterir — ÇS quiz'deki
    // "yanlış şık işaretleme" ile aynı güvenilirlikte bir sinyal değildir.
    // Bu yüzden sadece doğru-cevap-gösterilen kartlardaki performans kalıcı
    // "wrongQuestions" / Zayıf Konular havuzuna yansıtılır; oturum içi D/Y
    // skoru (tf.score) her iki durumda da normal şekilde tutulmaya devam eder.
    if (q.sourceQuestion && q.isCorrectShown) {
      recordAnswer({ ...q.sourceQuestion, answerRecorded: false }, wasRight ? q.sourceQuestion.answerIndex : -1);
    }

    // Renkler (kırmızı/yeşil) sadece cevap verildikten SONRA uygulanır —
    // cevap verilmeden önce butonlar nötr (gri) kalır, böylece renk kullanıcıyı
    // önceden yönlendirmez. Seçilen buton kendi rengini (doğru/yanlış'a göre),
    // diğer buton soluklaşmış nötr halini alır.
    wrongBtn.classList.remove('tf-btn-neutral');
    correctBtn.classList.remove('tf-btn-neutral');
    wrongBtn.classList.add('tf-btn-wrong');
    correctBtn.classList.add('tf-btn-correct');
    const selectedBtn = userSaidCorrect ? correctBtn : wrongBtn;
    const otherBtn = userSaidCorrect ? wrongBtn : correctBtn;
    selectedBtn.classList.add('is-selected');
    otherBtn.classList.add('is-muted');
    wrongBtn.disabled = true;
    correctBtn.disabled = true;

    // Seçilen butonda kısa bir "parlama" (glow) efekti + hafif titreşim —
    // önceki tam ekran overlay denemesi (tik/çarpı + 1.2 sn bekleme) yerine
    // geldi. Overlay hem gereksiz tekrar (renk zaten aynı bilgiyi veriyor)
    // hem de her soruda 1+ saniyelik gecikme yaratıyordu; bu yöntemde hiç
    // bekleme yok, glow ile sonuç paneli aynı anda görünür.
    const glow = selectedBtn.querySelector('.tf-btn-glow');
    if (glow) {
      glow.classList.remove('correct', 'wrong', 'play');
      void glow.offsetWidth; // animasyonu sıfırlayıp yeniden tetiklemek için reflow
      glow.classList.add(wasRight ? 'correct' : 'wrong', 'play');
    }
    // Doğru/yanlış için farklı titreşim şiddeti: yanlışta DİZİ veriliyor,
    // çünkü native-ux.js'deki haptic() fonksiyonu sadece dizi geldiğinde
    // belirgin bir "hata" bildirimi (Taptic Engine'in buzz-buzz paterni)
    // tetikliyor. Önceki haliyle her iki durumda da tek sayı veriliyordu,
    // ikisi de aynı hafif "impact" kategorisine düşüp ayırt edilemiyordu —
    // kullanıcı yanlışta hiçbir titreşim hissetmiyordu.
    haptic(wasRight ? 14 : [12, 40, 12]);

    // Sonuç panelini doldur ve göster.
    // Önceki sürümde burada hem "Doğru cevap: Yanlış/Doğru" (D/Y oyunundaki
    // cevabı tekrarlıyordu — başlık zaten bunu ikon+renkle veriyordu) hem de
    // "Açıklama" başlıklı uzun bir cümle vardı. İkisi de gereksiz tekrar/uzunluk
    // yaratıyordu; artık tek, kısa bir satırda doğrudan doğru bilgi gösteriliyor.
    const resultBox = document.getElementById('tfResult');
    resultBox.hidden = false;
    resultBox.innerHTML = `
      <div class="tf-result-panel ${wasRight ? 'is-correct' : 'is-wrong'}">
        <div class="tf-result-head">
          <span class="tf-result-icon">${svg(wasRight ? 'check' : 'alertX')}</span>
          <strong class="tf-result-title">${wasRight ? 'Doğru cevap' : 'Cevabınız yanlış'}</strong>
        </div>
        <p class="tf-result-oneline">Doğru cevap: “${escapeHtml(q.correctAnswer)}”</p>
      </div>`;

    // "Sonraki Soru" butonu artık sonuç panelinin içinde değil, ekranın
    // altına sabitlenmiş (sticky) ayrı bir footer'da — uzun soru/açıklama
    // içeriğinde kullanıcı butona ulaşmak için kaydırmak zorunda kalmasın
    // diye. Buton cevap verilene kadar gizli, cevap sonrası gösteriliyor.
    const stickyFooter = document.getElementById('tfStickyFooter');
    stickyFooter.hidden = false;
    document.getElementById('tfNext').onclick = () => {
      tf.index++;
      if (tf.index >= total) {
        renderTrueFalseResult();
      } else {
        renderTrueFalse();
      }
    };
  };

  correctBtn.onclick = () => answer(true);
  wrongBtn.onclick = () => answer(false);
}

function renderTrueFalseResult() {
  const tf = state.tfQuiz;
  const total = tf.questions.length;
  const pct = Math.round((tf.score / total) * 100);

  topicList.innerHTML = `
    <div class="tf-shell">
      <div class="tf-header">
        <div class="tf-header-row">
          <button type="button" class="tf-icon-btn" id="tfResultClose" aria-label="Geri dön">${svg('back')}</button>
          <h2 class="tf-header-title">Sonuç</h2>
          <span class="tf-icon-btn" aria-hidden="true" style="visibility:hidden"></span>
        </div>
      </div>
      <div class="tf-body">
        <div class="tf-result-card">
          <strong class="tf-result-score">${tf.score} / ${total}</strong>
          <span class="tf-result-pct">%${pct} başarı</span>
          <div class="quiz-result-actions" style="margin-top:24px">
            <button class="reader-secondary" id="tfRetry" type="button">Tekrar Dene</button>
            <button class="reader-primary" id="tfReturn" type="button">Listeye Dön</button>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('tfResultClose').onclick = () => {
    state.tfQuiz = null;
    topicSheet.classList.remove('quiz-active');
    tf.returnView();
  };
  document.getElementById('tfReturn').onclick = () => {
    state.tfQuiz = null;
    topicSheet.classList.remove('quiz-active');
    tf.returnView();
  };
  document.getElementById('tfRetry').onclick = () => openTrueFalseMode(tf.documentItem, tf.categoryKey);
}
// ---- DOĞRU / YANLIŞ MODU SONU ----------------------------------

function dedupeQuestionsById(list) {
  const seen = new Set();
  const out = [];
  for (const q of list) {
    if (q.id) { if (seen.has(q.id)) continue; seen.add(q.id); }
    out.push(q);
  }
  return out;
}

async function loadBanksForEntries(entries) {
  const results = await Promise.allSettled(entries.map(async entry =>
    tagQuestions(await loadQuestionBank(entry.item), entry.item, entry.categoryKey)
  ));
  return results.filter(r => r.status === 'fulfilled').map(r => r.value).flat();
}

function getDocAccuracy(documentId) {
  const stats = progress.docStats[documentId];
  if (!stats || stats.attempts < 3) return null; // yeterli veri yok
  return stats.correct / stats.attempts;
}

function getWeakEntries(entries, limit = 5) {
  return entries
    .map(entry => ({ entry, accuracy: getDocAccuracy(entry.item.id) }))
    .filter(x => x.accuracy !== null)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit)
    .map(x => x.entry);
}

function getUnseenEntries(entries, exclude = []) {
  return entries.filter(entry =>
    (!progress.docStats[entry.item.id] || progress.docStats[entry.item.id].attempts === 0) &&
    !exclude.includes(entry)
  );
}

function findLastActivityEntry(entries) {
  const last = progress.lastActivity;
  if (!last || !last.documentId) return null;
  return entries.find(entry => entry.item.id === last.documentId) || null;
}

// RASTGELE KARMA: tüm aktif konulardan karışık havuz
async function buildRandomPool(entries) {
  return await loadBanksForEntries(shuffle(entries));
}

// ZAYIF KONULAR: en düşük doğruluklu konular + hâlâ yanlış bilinen sorular
async function buildWeakPool(entries) {
  const weakEntries = getWeakEntries(entries);
  const wrongPool = Object.values(progress.wrongQuestions);
  if (!weakEntries.length && !wrongPool.length) return null;
  const weakBank = weakEntries.length ? await loadBanksForEntries(weakEntries) : [];
  const combined = dedupeQuestionsById([...shuffle(wrongPool), ...shuffle(weakBank)]);
  return combined.length ? combined : null;
}

// SON ÇALIŞILAN KONU: en son bırakılan konudan devam, gerekirse aynı kategoriden tamamla
async function buildLastActivityPool(entries) {
  const lastEntry = findLastActivityEntry(entries);
  if (!lastEntry) return null;
  let bank;
  try { bank = tagQuestions(await loadQuestionBank(lastEntry.item), lastEntry.item, lastEntry.categoryKey); }
  catch { return null; }
  if (!bank.length) return null;
  const sameCategoryEntries = entries.filter(e => e.categoryKey === lastEntry.categoryKey && e.item.id !== lastEntry.item.id);
  const extra = sameCategoryEntries.length ? await loadBanksForEntries(shuffle(sameCategoryEntries)) : [];
  return dedupeQuestionsById([...shuffle(bank), ...shuffle(extra)]);
}

// SANA ÖZEL KARMA: zayıf + son çalışılan + hiç görülmemiş konuları harmanla
async function buildPersonalPool(entries) {
  const weakEntries = getWeakEntries(entries, 4);
  const lastEntry = findLastActivityEntry(entries);
  const unseenEntries = getUnseenEntries(entries, lastEntry ? [lastEntry] : []);

  const wrongPool = shuffle(Object.values(progress.wrongQuestions));
  const weakBank = weakEntries.length ? shuffle(await loadBanksForEntries(weakEntries)) : [];
  let lastBank = [];
  if (lastEntry) {
    try { lastBank = shuffle(tagQuestions(await loadQuestionBank(lastEntry.item), lastEntry.item, lastEntry.categoryKey)); }
    catch { lastBank = []; }
  }
  const unseenBank = unseenEntries.length ? shuffle(await loadBanksForEntries(unseenEntries)) : [];

  const combined = dedupeQuestionsById([...wrongPool, ...weakBank, ...lastBank, ...unseenBank]);
  return combined.length ? combined : null;
}

async function startSmartPractice() {
  if (!requirePremiumOrWarn()) return;
  const entries = getActiveDocuments();
  if (!entries.length) {
    closeRouteSheet();
    return showToast('Henüz aktif soru paketi bulunmuyor.');
  }

  showToast('Rota hazırlanıyor…');

  let pool = null;
  try {
    if (routeSettings.mode === 'Zayıf Konular') {
      pool = await buildWeakPool(entries);
      if (!pool) showToast('Henüz yeterli zayıf konu verisi yok, karma sorular getiriliyor.');
    } else if (routeSettings.mode === 'Son Çalışılan Konu') {
      pool = await buildLastActivityPool(entries);
      if (!pool) showToast('Daha önce çalışılan bir konu bulunamadı, karma sorular getiriliyor.');
    } else if (routeSettings.mode === 'Sana Özel Karma') {
      pool = await buildPersonalPool(entries);
    }
    if (!pool || !pool.length) pool = await buildRandomPool(entries);
  } catch (error) {
    pool = null;
  }

  if (!pool || !pool.length) {
    closeRouteSheet();
    return showToast('Şu an hazır bir soru paketi bulunamadı, lütfen tekrar dene.');
  }

  const questions = shuffle(dedupeQuestionsById(pool)).slice(0, Math.min(routeSettings.questions, pool.length));

  closeAllSheets(topicSheet);
  topicSheet.classList.add('open');
  topicSheet.setAttribute('aria-hidden', 'false');
  topicBackdrop.classList.add('open');

  startQuiz({
    questions,
    kind: 'route',
    title: 'Bugünkü Rota',
    subtitle: `${routeSettings.mode} • ${routeSettings.questions} Soru`,
    returnView: closeTopicSheet
  });
}

function startQuiz({ questions, documentItem = null, section = null, kind, title, subtitle, returnView, customTimeSeconds = null }) {
  clearInterval(timerInterval);
  timerInterval = null;

  const isTimed = customTimeSeconds !== null ? true : (routeSettings.time === 'Süreli' || kind !== 'route');
  const totalTime = customTimeSeconds !== null ? customTimeSeconds : (isTimed ? questions.length * QUESTION_TIME_LIMIT : 9999);

  // NOT (2026-08-18 sıralama düzeltmesi): kind === 'kadro-exam' VE
  // kind === 'mock' için sıra korunmalı. kadro-exam'de buildKadroExamPool,
  // mock'ta ise deneme_questions.sort_order (bkz. startDenemeSinavi) sorular
  // arasını zaten doğru sıraya (konu konu / madde madde) diziyor; ikisi de
  // panelde kürate edilmiş bir sıra taşıyor. 2026-08-15'teki düzeltme yalnızca
  // kadro-exam'i kapsamış, mock (deneme sınavları) "diğer" kovasına düşüp
  // yanlışlıkla karışmaya devam etmişti. Rastgele test, konu tekrarı gibi
  // gerçekten rastgele sıra istenen türlerde shuffle devam ediyor.
  const orderedQuestions = (kind === 'kadro-exam' || kind === 'mock') ? questions : shuffle(questions);

  state.quiz = {
    questions: orderedQuestions.map(question => ({ ...question, userSelected: null, answerRecorded: false })),
    sourceQuestions: questions,
    documentItem, section, kind, title, subtitle, isTimed, timeLeft: totalTime, returnView,
    index: 0, completionRecorded: false
  };

  // YENİ: son çalışılan konuyu işaretle
  if (documentItem && ['section', 'random', 'topic'].includes(kind)) {
    const categoryKeyGuess = state.quiz.questions[0]?.categoryKey || null;
    progress.lastActivity = { documentId: documentItem.id, categoryKey: categoryKeyGuess, timestamp: new Date().toISOString() };
    saveProgress();
  }

  renderQuiz();
  if (state.quiz.isTimed) startQuizTimer();
}

function recordAnswer(question, selected) {
  if (question.answerRecorded) return;
  question.answerRecorded = true;
  const isCorrect = selected === question.answerIndex;
  if (isCorrect) {
    delete progress.wrongQuestions[question.id];
  } else {
    progress.wrongQuestions[question.id] = {
      id: question.id, prompt: question.prompt, options: question.options, answerIndex: question.answerIndex,
      sectionId: question.topicId || null, documentId: question.documentId || null,
      documentTitle: question.documentTitle || null, categoryKey: question.categoryKey || null
    };
  }
  window.SRProgressSync.recordAnswer(
    progress,
    getProgressDeviceId(),
    isCorrect,
    dateKey(),
    question.documentId || null,
    progress.userId
  );
  saveProgress();
}
function quizScore(quiz) {
  return quiz.questions.filter(question => question.userSelected === question.answerIndex).length;
}


function renderQuiz() {
  const quiz = state.quiz;
  if (!quiz) return;
  topicSheet.classList.add('quiz-active');
  const current = quiz.questions[quiz.index];
  const total = quiz.questions.length;
  const letters = ['A', 'B', 'C', 'D', 'E'];

  const timerDisplay = quiz.isTimed ?
    `<div class="quiz-premium-timer" id="quizTimer">${svg('clock')} ${String(Math.floor(quiz.timeLeft / 60)).padStart(2, '0')}:${String(quiz.timeLeft % 60).padStart(2, '0')}</div>` :
    `<div class="quiz-premium-timer" style="color:var(--green);background:var(--green2);">Süresiz</div>`;

  topicList.innerHTML = `
    <div class="quiz-premium-layout">
      <div class="quiz-premium-header">
        <div class="quiz-premium-topbar">
          <button id="quizBackButton" type="button" aria-label="Geri">${svg('back')}</button>
          <div class="quiz-premium-titles">
            <h2>${escapeHtml(quiz.title)}</h2>
          </div>
          <div class="quiz-premium-top-actions">
            <button type="button" class="topbar-action ${progress.reportedQuestions[current.id] ? 'active' : ''}" id="quizReportButton" aria-label="${progress.reportedQuestions[current.id] ? 'Bildirimi Geri Al' : 'Soruyu Bildir'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
            </button>
          </div>
        </div>

        <div class="quiz-premium-progress">
          <span class="progress-text"><strong>${quiz.index + 1}</strong> / ${total}</span>
          <div class="progress-track">
            <div class="progress-fill" style="width:${Math.round(((quiz.index + 1) / total) * 100)}%"></div>
            <div class="progress-handle" style="left:${Math.round(((quiz.index + 1) / total) * 100)}%"></div>
          </div>
          ${timerDisplay}
        </div>
      </div>

      <div class="quiz-premium-card-wrapper">
        <div class="quiz-premium-card">
          <h3 class="quiz-question-text">${escapeHtml(current.prompt)}</h3>

          <div class="quiz-options">
            ${current.options.map((option, index) => {
              let className = 'quiz-option';
              let iconHtml = '';
              const answered = current.userSelected !== null;
              if (answered && index === current.answerIndex) {
                className += ' correct';
                iconHtml = `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
              } else if (current.userSelected === index) {
                className += ' wrong';
                iconHtml = `<svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
              } else if (current.userSelected === index) {
                className += ' selected';
              }
              return `
              <button class="${className}" data-answer-index="${index}" type="button" ${answered ? 'disabled' : ''}>
                <span class="quiz-option-letter">${letters[index] || index + 1}</span>
                <span class="quiz-option-text">${escapeHtml(option)}</span>
                ${iconHtml}
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="quiz-premium-footer">
        <button class="footer-btn btn-prev" id="quizPrevButton" type="button" ${quiz.index === 0 ? 'disabled' : ''}>
          ${svg('arrowLeft')} Önceki
        </button>
        <button class="footer-btn btn-grid" id="quizGridButton" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          Sorular
        </button>
        <button class="footer-btn btn-next" id="quizNextButton" type="button">
          ${quiz.index === total - 1 ? 'Sonucu Gör' : 'Sonraki Soru'} ${svg('arrowRight')}
        </button>
      </div>
      <div class="quiz-nav-overlay" id="quizNavOverlay">
        <div class="quiz-nav-sheet">
          <div class="quiz-nav-head"><strong>Sorular</strong><button type="button" id="quizNavClose" aria-label="Kapat">×</button></div>
          <div class="quiz-nav-grid" id="quizNavGrid"></div>
        </div>
      </div>
      <div class="quiz-nav-overlay" id="reportModalOverlay">
        <div class="quiz-nav-sheet report-modal-sheet">
          <div class="quiz-nav-head">
            <strong>Soruyu Bildir</strong>
            <button type="button" id="reportModalClose" aria-label="Kapat">×</button>
          </div>
          <div id="reportModalNewContent">
            <p class="report-modal-desc">Soruyla ilgili hata veya yorumunu yaz.</p>
            <textarea id="reportModalNote" class="report-modal-textarea" placeholder="Notunu buraya yaz… (isteğe bağlı)" rows="4"></textarea>
            <button type="button" class="report-modal-send" id="reportModalSend">Gönder</button>
          </div>
          <div id="reportModalUndoContent" style="display:none">
            <p class="report-modal-desc">Bu soruyu daha önce bildirdin. Bildirimi geri almak istiyor musun?</p>
            <button type="button" class="report-modal-send report-modal-undo" id="reportModalUndo">Bildirimi Geri Al</button>
          </div>
        </div>
      </div>
    </div>`;
  
  topicSheet.scrollTop = 0;
  bindQuizEvents();
  
  // Timer durmuşsa tekrar başlat
  if (state.quiz && state.quiz.isTimed && !timerInterval) {
    startQuizTimer();
  }
}

function startQuizTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  const quiz = state.quiz;
  if (!quiz || quiz.timeLeft <= 0) return;
  timerInterval = window.setInterval(() => {
    const timer = document.getElementById('quizTimer');
    if (!timer || !state.quiz || state.quiz !== quiz) {
      clearInterval(timerInterval);
      timerInterval = null;
      return;
    }
    if (quiz.timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      return;
    }
    quiz.timeLeft -= 1;
    const m = String(Math.floor(quiz.timeLeft / 60)).padStart(2, '0');
    const s = String(quiz.timeLeft % 60).padStart(2, '0');
    timer.innerHTML = `${svg('clock')} ${m}:${s}`;
    if (quiz.timeLeft === 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      showToast('Sınavın süresi doldu.');
      renderQuizResult();
    }
  }, 1000);
}

function toggleQuestionFlag(question) {
  if (progress.flaggedQuestions[question.id]) {
    delete progress.flaggedQuestions[question.id];
    showToast('İşaret kaldırıldı.');
  } else {
    progress.flaggedQuestions[question.id] = true;
    showToast('Soru işaretlendi.');
  }
  haptic(14);
  saveProgress();
  renderQuiz();
}

async function sendQuestionReport(payload) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error('Oturum bulunamadı.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/report-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Bildirim gönderilemedi.');
  return data;
}

// Play Billing: native plugin'den gelen { productId, purchaseToken } bilgisini
// verify-play-purchase Edge Function'a gönderip sunucu tarafında doğrulatır.
// is_premium bu çağrının sonucuna göre SUNUCUDA set edilir, istemci hiçbir
// zaman doğrudan yazmaz.
async function verifyPlayPurchase(productId, purchaseToken) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error('Oturum bulunamadı.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-play-purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ product_id: productId, purchase_token: purchaseToken })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Satın alma doğrulanamadı.');
  return data;
}

async function purchasePremiumProduct(productId, buttonEl) {
  const billing = window.Capacitor?.Plugins?.PlayBilling;
  if (!billing) {
    showToast('Satın alma yalnızca Android uygulamasında kullanılabilir.');
    return;
  }
  const priceEl = buttonEl?.querySelector('.premium-btn-price');
  const originalPriceText = priceEl?.textContent;
  if (buttonEl) buttonEl.disabled = true;
  if (priceEl) priceEl.textContent = 'İşleniyor…';
  try {
    const purchase = await billing.purchase({ productId });
    const result = await verifyPlayPurchase(purchase.productId || productId, purchase.purchaseToken);
    showToast('Premium aktif edildi!');
    if (window.currentUserIsPremium !== undefined) window.currentUserIsPremium = true;
    return result;
  } catch (error) {
    if (error?.code === 'USER_CANCELED') return;
    console.error('Satın alma hatası:', error);
    showToast(error?.message || 'Satın alma tamamlanamadı.');
  } finally {
    if (buttonEl) buttonEl.disabled = false;
    if (priceEl && originalPriceText) priceEl.textContent = originalPriceText;
  }
}

// Paywall butonlarındaki fiyatları Google Play'den canlı çeker. Play
// Console'da fiyat değiştiğinde kod değişikliği gerekmeden buton metni
// otomatik güncellenir. Plugin yoksa (web/tarayıcı) veya sorgu başarısız
// olursa buton, HTML'e gömülü sabit yedek fiyatta kalır.
async function updatePremiumButtonPrices() {
  const billing = window.Capacitor?.Plugins?.PlayBilling;
  const buttons = Array.from(document.querySelectorAll('.premium-buy-btn'));
  if (!billing || buttons.length === 0) return;
  try {
    const { products } = await billing.getProductDetails({ productIds: buttons.map((b) => b.dataset.productId) });
    const priceByProductId = Object.fromEntries((products || []).map((p) => [p.productId, p.formattedPrice]));
    buttons.forEach((btn) => {
      const livePrice = priceByProductId[btn.dataset.productId];
      const priceEl = btn.querySelector('.premium-btn-price');
      if (livePrice && priceEl) priceEl.textContent = livePrice;
    });
  } catch (error) {
    console.error('Fiyat bilgisi alınamadı, yedek fiyatlar kullanılıyor:', error);
  }
}

// Uygulama açılışında yarım kalmış (doğrulanmamış) satın almaları tamamlamayı
// dener. Kullanıcı ödemeyi yaptı ama uygulama kapandıysa vb. durumlar için.
async function restoreUnverifiedPurchases() {
  const billing = window.Capacitor?.Plugins?.PlayBilling;
  if (!billing) return;
  try {
    const { purchases } = await billing.restorePurchases();
    for (const purchase of purchases || []) {
      try { await verifyPlayPurchase(purchase.productId, purchase.purchaseToken); } catch (_) { /* sessiz geç, bir sonraki açılışta tekrar denenir */ }
    }
  } catch (_) { /* Play Billing kullanılamıyorsa (ör. web) sessizce geç */ }
}

function reportQuestion(question) {
  const overlay = document.getElementById('reportModalOverlay');
  if (!overlay) return;

  const isReported = Boolean(progress.reportedQuestions[question.id]);
  document.getElementById('reportModalNewContent').style.display = isReported ? 'none' : 'block';
  document.getElementById('reportModalUndoContent').style.display = isReported ? 'block' : 'none';
  if (!isReported) document.getElementById('reportModalNote').value = '';

  overlay.classList.add('open');

  const closeModal = () => overlay.classList.remove('open');
  const feedbackQuestionId = Object.prototype.hasOwnProperty.call(question, 'feedbackQuestionId')
    ? question.feedbackQuestionId
    : question.id;
  const feedbackDenemeQuestionId = Object.prototype.hasOwnProperty.call(question, 'feedbackDenemeQuestionId')
    ? question.feedbackDenemeQuestionId
    : null;
  document.getElementById('reportModalClose').onclick = closeModal;
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };

  // Geri al
  document.getElementById('reportModalUndo').onclick = async () => {
    const previousReportState = progress.reportedQuestions[question.id];
    delete progress.reportedQuestions[question.id];
    haptic(14);
    saveProgress();
    closeModal();
    renderQuiz();

    try {
      await sendQuestionReport({
        action: 'undo',
        question_id: feedbackQuestionId,
        deneme_question_id: feedbackDenemeQuestionId
      });
    } catch (err) {
      progress.reportedQuestions[question.id] = previousReportState || true;
      saveProgress();
      renderQuiz();
      showToast('Bildirim geri alınamadı, tekrar dene.');
      return;
    }
    showToast('Bildirim geri alındı.');
  };

  // Gönder
  document.getElementById('reportModalSend').onclick = async () => {
    const note = document.getElementById('reportModalNote').value.trim();
    closeModal();
    progress.reportedQuestions[question.id] = true;
    haptic(14);
    saveProgress();
    renderQuiz();

    try {
      await sendQuestionReport({
        action: 'report',
        question_id: feedbackQuestionId,
        deneme_question_id: feedbackDenemeQuestionId,
        note
      });
      showToast('Bildirimin alındı, teşekkürler.');
    } catch (err) {
      delete progress.reportedQuestions[question.id];
      saveProgress();
      renderQuiz();
      showToast('Bildirim gönderilemedi, tekrar dene.');
    }
  };
}

function openQuizNav() {
  const quiz = state.quiz;
  const overlay = document.getElementById('quizNavOverlay');
  const grid = document.getElementById('quizNavGrid');
  if (!overlay || !grid) return;
  grid.innerHTML = quiz.questions.map((question, index) => {
    let className = 'quiz-nav-cell';
    if (index === quiz.index) className += ' current';
    else if (question.userSelected !== null) className += question.userSelected === question.answerIndex ? ' answered-correct' : ' answered-wrong';
    if (progress.flaggedQuestions[question.id]) className += ' flagged';
    return `<button class="${className}" data-jump-index="${index}" type="button">${index + 1}</button>`;
  }).join('');
  grid.querySelectorAll('[data-jump-index]').forEach(button => button.addEventListener('click', () => {
    quiz.index = Number(button.dataset.jumpIndex);
    overlay.classList.remove('open');
    renderQuiz();
  }));
  overlay.classList.add('open');
}

// Aktif sınavı kapatıp quiz.returnView() ile önceki konu listesine döner.
// Görünür geri butonu (#quizBackButton) VE donanım geri tuşu (Android) aynı
// işlevi kullanır, böylece ikisi arasında davranış farkı olmaz.
function exitQuizToReturnView() {
  clearInterval(timerInterval);
  timerInterval = null;
  const quiz = state.quiz;
  if (!quiz) return;
  const returnView = quiz.returnView;
  state.quiz = null;
  topicSheet.classList.remove('quiz-active');
  returnView();
}

function bindQuizEvents() {
  const quiz = state.quiz;
  if (!quiz) return;
  
  const quizBackButton = document.getElementById('quizBackButton');
  if (quizBackButton) {
    quizBackButton.addEventListener('click', exitQuizToReturnView);
  }
  
  topicList.querySelectorAll('[data-answer-index]').forEach(button => {
    button.addEventListener('click', () => {
      const current = quiz.questions[quiz.index];
      if (current.userSelected !== null) return;
      const selected = Number(button.dataset.answerIndex);
      current.userSelected = selected;
      recordAnswer(current, selected);
      haptic(selected === current.answerIndex ? 16 : [12, 40, 12]);
      renderQuiz();
    });
  });
  
  document.getElementById('quizPrevButton')?.addEventListener('click', () => {
    if (quiz.index < 1) return;
    quiz.index -= 1;
    renderQuiz();
  });
  
  document.getElementById('quizNextButton')?.addEventListener('click', () => {
    if (quiz.index < quiz.questions.length - 1) {
      quiz.index += 1;
      renderQuiz();
    } else {
      renderQuizResult();
    }
  });
  
  document.getElementById('quizReportButton')?.addEventListener('click', () => reportQuestion(quiz.questions[quiz.index]));
  document.getElementById('quizGridButton')?.addEventListener('click', openQuizNav);
  document.getElementById('quizNavClose')?.addEventListener('click', () => {
    const overlay = document.getElementById('quizNavOverlay');
    if (overlay) overlay.classList.remove('open');
  });
  
  document.getElementById('quizNavOverlay')?.addEventListener('click', event => {
    if (event.target.id === 'quizNavOverlay') event.currentTarget.classList.remove('open');
  });
}

function recordQuizCompletion(quiz) {
  if (quiz.completionRecorded) return;
  quiz.completionRecorded = true;
  const score = quizScore(quiz);
  progress.completedTests.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: quiz.title,
    kind: quiz.kind,
    documentId: quiz.documentItem?.id || null,
    sectionId: quiz.section?.id || null,
    score,
    total: quiz.questions.length,
    completedAt: new Date().toISOString()
  });
  if (quiz.section?.id) progress.completedSections[quiz.section.id] = new Date().toISOString();
  saveProgress();
}

function renderQuizResult() {
  clearInterval(timerInterval);
  timerInterval = null;
  const quiz = state.quiz;
  if (!quiz) return;
  recordQuizCompletion(quiz);
  topicSheet.classList.remove('quiz-active');
  topicSheet.classList.add('document-flow');
  const score = quizScore(quiz);
  const total = quiz.questions.length;
  const percentage = total ? Math.round((score / total) * 100) : 0;
  applySheetHeader({ title: quiz.title, subtitle: 'Test tamamlandı', eyebrow: 'SONUÇ', icon: 'trophy', iconClass: 'red' });
  topicBreadcrumbWrap.innerHTML = '';
  setSheetProgress('Henüz yanıtlanmış soru yok', percentage, 'başarı');
  const wrongAnswers = quiz.questions.filter(question => question.userSelected !== null && question.userSelected !== question.answerIndex);
  topicList.innerHTML = `<section class="quiz-result-card"><strong>${score} / ${total}</strong><span>Doğru cevap • %${percentage} başarı</span></section>${wrongAnswers.length ? `<div class="quiz-result-list"><span class="quiz-result-list-title">YANLIŞ YAPILAN SORULAR</span>${wrongAnswers.map((question, idx) => mistakeItemHTML(question, idx)).join('')}</div>` : '<p class="quiz-result-perfect">Tebrikler, yanıtladığın soruların tamamı doğru!</p>'}<div class="quiz-result-actions"><button class="reader-secondary" id="quizRetryButton" type="button">Tekrar Dene</button><button class="reader-primary" id="quizReturnButton" type="button">Listeye Dön</button></div>`;
  document.getElementById('quizRetryButton').addEventListener('click', () => {
    const retry = { ...quiz, questions: quiz.sourceQuestions };
    startQuiz({ questions: retry.questions, documentItem: retry.documentItem, section: retry.section, kind: retry.kind, title: retry.title, subtitle: retry.subtitle, returnView: retry.returnView });
  });
  document.getElementById('quizReturnButton').addEventListener('click', () => {
    const returnView = quiz.returnView;
    state.quiz = null;
    returnView();
  });
  topicSheet.scrollTop = 0;
}

navButtons.forEach(button => button.addEventListener('click', () => window.go(button.dataset.nav)));
closeTopicSheetButton.addEventListener('click', closeTopicSheet);
topicBackdrop.addEventListener('click', () => closeAllSheets());

// ================= ANDROID DONANIM GERİ TUŞU =================
// native-ux.js, App plugin'in 'backButton' event'ini burada dinlenebilecek genel
// bir 'nativeux:backbutton' DOM event'ine çevirir (bkz. native-ux.js). Bu dinleyici
// açık olan en üstteki ekranı/paneli kapatır; hiçbiri açık değilse (ana ekrandayız)
// event'i tüketmeden bırakır — bu durumda native-ux.js'in kendi "çıkmak için tekrar
// bas" davranışı devreye girer. Amaç: quiz sırasında ya da bir panel açıkken
// yanlışlıkla uygulamadan çıkılmasını önlemek.
function handleHardwareBack() {
  const quizNavOverlay = document.getElementById('quizNavOverlay');
  if (quizNavOverlay && quizNavOverlay.classList.contains('open')) {
    quizNavOverlay.classList.remove('open');
    return true;
  }
  if (searchSheet.classList.contains('open')) { closeSearchSheet(); return true; }
  if (topicSheet.classList.contains('open')) {
    // Gerçek (zamanlı/notlu) bir sınav hâlâ sürüyorsa yanlışlıkla çıkışı
    // engellemek için onay iste. Pratik testlerde (route/section/random) ve
    // sonuç ekranında ekstra sürtünme yok — görünür geri tuşuyla aynı davranış.
    if (state.quiz && EXAM_KINDS.includes(state.quiz.kind) && !state.quiz.completionRecorded) {
      if (!window.confirm('Sınavdan çıkmak istediğine emin misin? İlerlemen kaydedilmeyecek.')) return true;
    }
    if (state.quiz) { exitQuizToReturnView(); return true; }
    const sheetBackButton = document.getElementById('sheetBackButton');
    if (sheetBackButton) { sheetBackButton.click(); return true; }
    closeTopicSheet();
    return true;
  }
  if (routeSheet.classList.contains('open')) { closeRouteSheet(); return true; }
  if (state.view !== 'home') { go('home'); return true; }
  return false;
}
document.addEventListener('nativeux:backbutton', event => {
  if (handleHardwareBack()) event.preventDefault();
});

async function loadCatalogue() {
  state.catalogueError = '';
  state.catalogue = null;
  render();
  try {
    const [data, flashcardDecks] = await Promise.all([
      ContentRepo.fetchCatalogue(),
      // Flashcard desteleri çekilemese bile (ör. ağ hatası) katalog ekranı
      // çalışmaya devam etsin — bu yüzden hata burada yutulup boş dizi dönüyor.
      ContentRepo.fetchFlashcardDecks().catch(error => {
        console.error('Flashcard desteleri yüklenemedi:', error);
        return [];
      })
    ]);
    if (!data || typeof data !== 'object') throw new Error('Konu verisi geçerli değil.');
    state.catalogue = data;
    state.flashcardDecks = flashcardDecks;
    render();
    // Faz 4: ana ekrandaki "bugünkü tekrarlar" widget'ı için toplam gecikmiş
    // kart sayısı — katalog render edildikten SONRA arka planda çekiliyor,
    // ana ekranın açılışını bloke etmesin diye ayrı bir render() ile gelir.
    if (window.currentUser && flashcardDecks.length) {
      ContentRepo.fetchDueFlashcardCounts(flashcardDecks.map(d => d.id))
        .then(counts => {
          state.totalDueFlashcards = Object.values(counts).reduce((sum, n) => sum + n, 0);
          if (state.view === 'home') render();
        })
        .catch(() => {}); // widget süsleme, sessizce geç
    }
  } catch (error) {
    state.catalogueError = error.message || 'Konu verisi yüklenemedi.';
    render();
  }
}

bindRouteSheetEvents();

// --- KADRO SEÇİM KAPISI ---
const roleGate = document.getElementById('roleGate');
const roleGateList = document.getElementById('roleGateList');
const roleGateContinue = document.getElementById('roleGateContinue');
let pendingRoleSelection = null;

function renderRoleGate() {
  roleGateList.innerHTML = ROLES.map(role => `
    <button class="role-gate-item" data-role-key="${role.key}" type="button">
      <span class="role-gate-item-icon">${svg(ROLE_ICONS[role.key] || 'book')}</span>
      <strong>${escapeHtml(role.label)}</strong>
      <span class="role-gate-item-arrow">${svg('arrow')}</span>
    </button>`).join('');
  roleGateList.querySelectorAll('[data-role-key]').forEach(button => {
    button.addEventListener('click', () => {
      pendingRoleSelection = button.dataset.roleKey;
      roleGateList.querySelectorAll('.role-gate-item').forEach(el => el.classList.toggle('selected', el === button));
      roleGateContinue.disabled = false;
      roleGateContinue.classList.add('enabled');
      haptic(14);
    });
  });
}

function openRoleGate() {
  pendingRoleSelection = null;
  renderRoleGate();
  roleGateContinue.disabled = true;
  roleGateContinue.classList.remove('enabled');
  roleGate.setAttribute('aria-hidden', 'false');
}

function closeRoleGate() {
  roleGate.setAttribute('aria-hidden', 'true');
}

roleGateContinue?.addEventListener('click', async () => {
  if (!pendingRoleSelection) return;
  progress.selectedRole = pendingRoleSelection;
  saveProgress();

  const { data: updatedRows, error } = await supabaseClient
    .from('profiles')
    .update({ role: pendingRoleSelection })
    .eq('id', window.currentUser.id)
    .select('id');
  if (error) {
    console.error('Kadro sunucuya kaydedilemedi:', error);
    showToast('Kadro seçimi kaydedilemedi. Lütfen tekrar deneyin.');
  } else if (!updatedRows || updatedRows.length === 0) {
    console.error('Kadro kaydedilemedi: profil satırı bulunamadı (id=' + window.currentUser.id + ').');
    showToast('Kadro seçimi kaydedilemedi. Lütfen tekrar giriş yapmayı deneyin.');
  }

  closeRoleGate();
  initializeApp();
});

let appInitialized = false;
function initializeApp() {
  if (appInitialized) return;
  appInitialized = true;
  render();
  loadCatalogue();
}

let authHandledOnce = false;
async function handleAuthenticated() {
  if (authHandledOnce) return;
  authHandledOnce = true;

  const currentUserId = window.currentUser?.id || null;
  if (progress.userId !== currentUserId) {
    progress = defaultProgress();
    progress.userId = currentUserId;
  }

  restoreUnverifiedPurchases();
  initPremiumModal();

  // Yerel ve bulut ilerlemesini birleştir. Sunucunun körlemesine cihazdaki
  // verinin üstüne yazılması, çevrimdışı çözümlerin ilk girişte kaybolmasına
  // neden oluyordu.
  if (currentUserId) {
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('progress, progress_version')
        .eq('id', currentUserId)
        .maybeSingle();
      if (error) {
        console.error('İlerleme sunucudan okunamadı:', error);
      } else if (data?.progress) {
        progress = mergeProgress(progress, sanitizeProgress(data.progress, currentUserId));
        progress.userId = currentUserId;
        knownProgressVersion = data.progress_version || 0;
      }
    } catch (err) {
      console.error('İlerleme senkronizasyonu başarısız:', err);
    }
  }

  if (window.currentUserRole && !progress.selectedRole) {
    progress.selectedRole = window.currentUserRole;
  }
  saveProgress();

  if (!progress.selectedRole) {
    openRoleGate();
  } else {
    initializeApp();
  }
  // Kadro kapısı ya da ana uygulama artık ekranda — native açılış ekranını kapat.
  window.NativeUX?.hideSplash();
}

document.addEventListener('sinavrotasi:authenticated', handleAuthenticated);
if (window.currentUserAuthReady) handleAuthenticated();

// ================= ADMIN'İN OLUŞTURDUĞU DENEMELER (Supabase: denemeler) =================
async function loadDenemeler(force = false) {
  const roleKey = progress.selectedRole;
  if (!roleKey) { state.denemeler = []; state.denemelerRoleKey = roleKey; state.denemelerError = ''; return; }
  if (!force && state.denemeler && state.denemelerRoleKey === roleKey) return;

  state.denemelerError = '';
  state.denemeler = null;
  state.denemelerRoleKey = roleKey;
  if (state.view === 'bank') render();

  try {
    const { data, error } = await supabaseClient
      .from('denemeler')
      .select('id,title,kadro,duration_minutes,sort_order,deneme_questions(count)')
      .eq('kadro', roleKey)
      .eq('is_published', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    state.denemeler = (data || []).map(d => ({ ...d, questionCount: d.deneme_questions?.[0]?.count ?? 0 }));
  } catch (error) {
    state.denemelerError = error.message || 'Denemeler yüklenemedi.';
    state.denemeler = null;
  }
  if (state.view === 'bank') render();
}

async function startDenemeSinavi(denemeId) {
  if (!requirePremiumOrWarn()) return;
  const meta = state.denemeler?.find(d => d.id === denemeId);
  showToast('Deneme hazırlanıyor…');
  try {
    // NOT: deneme_questions RLS ile korunuyor (deneme_questions_read →
    // yayınlanmış + is_premium()); doğrudan seçim bu yüzden güvenli.
    const { data, error } = await supabaseClient
      .from('deneme_questions')
      .select('id,prompt,options,answer_index,sort_order')
      .eq('deneme_id', denemeId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    if (!data || !data.length) return showToast('Bu denemede henüz soru eklenmemiş.');

    const questions = data.map(q => ({
      id: `deneme-${denemeId}-${q.id}`,
      // Deneme soruları ana questions tablosuna bağlı değildir; geri bildirim
      // kaydında question_id yerine deneme_question_id gönderilir (bkz.
      // question_feedback.deneme_question_id → deneme_questions FK).
      feedbackQuestionId: null,
      feedbackDenemeQuestionId: q.id,
      prompt: q.prompt,
      options: q.options,
      answerIndex: q.answer_index,
      documentId: `deneme-${denemeId}`,
      documentTitle: meta?.title || 'Deneme Sınavı'
    }));

    const customTimeSeconds = meta?.duration_minutes ? meta.duration_minutes * 60 : null;
    closeAllSheets(topicSheet);
    topicSheet.classList.add('open');
    topicSheet.setAttribute('aria-hidden', 'false');
    topicBackdrop.classList.add('open');
    startQuiz({
      questions,
      kind: 'mock',
      title: meta?.title || 'Deneme Sınavı',
      subtitle: `${questions.length} soru`,
      returnView: closeTopicSheet,
      customTimeSeconds
    });
  } catch (error) {
    showToast(error.message || 'Deneme başlatılamadı.');
  }
}

// ================= KADRO BAZLI GERÇEK SINAV DENEMESİ =================
// Ek-2 (Konu Başlıkları, Ağırlık Yüzdeleri ve Soru Sayılarını Gösteren
// Tablo) kaynaklı resmi soru dağılımına göre kadroya özel deneme üretir.
let examTopicRegistry = null;
let examBlueprints = null;

async function loadExamConfig() {
  if (examTopicRegistry && examBlueprints) return;
  const [topicsData, blueprintData] = await Promise.all([
    ContentRepo.fetchExamTaxonomy(),
    ContentRepo.fetchExamBlueprint()
  ]);
  examTopicRegistry = topicsData.topics || {};
  examBlueprints = blueprintData;
}

async function loadExamTopicBank(topicId) {
  const topic = examTopicRegistry?.[topicId];
  if (!topic) return [];
  
  const cacheKey = `exam-topic:${topicId}`;
  if (state.questionBanks.has(cacheKey)) return state.questionBanks.get(cacheKey);
  
  try {
    // Önce JSON dosyasından dene
    if (topic.questionFile) {
      try {
        // NOT: fetchQuestionsByPathExact kullanılıyor (fetchQuestionsByPath DEĞİL) —
        // sınav havuzu alt konuların sorularını katmamalı, aksi halde blueprint'in
        // beklediği sayı yerine çok daha büyük/karışık bir havuzdan seçim yapılır
        // ve alt konu başka bir blueprint girdisinde de varsa aynı soru sınavda
        // iki kez çıkabilir (bkz. 2026-08-15 kadro sınavı soru sayısı hatası).
        const data = await ContentRepo.fetchQuestionsByPathExact(topic.questionFile);
        const questions = Array.isArray(data.questions) ? data.questions : [];
        state.questionBanks.set(cacheKey, questions);
        return questions;
      } catch (jsonError) {
        console.warn(`Sınav JSON dosyası yüklenemedi: ${topic.questionFile}`);
      }
    }

    // Veritabanından yükle. NOT: questions tablosu RLS ile korunuyor
    // (questions_premium_read → is_premium()); doğrudan seçim güvenli.
    const { data, error } = await supabaseClient
      .from('questions')
      .select('id,prompt,options,answer_index')
      .eq('topic_id', topicId)
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    
    const questions = (data || []).map(q => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      answerIndex: q.answer_index
    }));
    
    state.questionBanks.set(cacheKey, questions);
    return questions;
  } catch (error) {
    console.error(`Sınav konusu yüklenemedi (${topicId}):`, error);
    state.questionBanks.set(cacheKey, []);
    return [];
  }
}

// Tekli konu ({topicId, count}) ve grup / "bağlı mevzuat" ({topics:[...], count})
// girdilerini düz bir [{topicId, count}] listesine açar. Grup içindeki toplam
// soru sayısı, konular arasında olabildiğince eşit dağıtılır.
function expandBlueprintEntries(entries) {
  const flat = [];
  entries.forEach(entry => {
    if (entry.topics && entry.topics.length) {
      const base = Math.floor(entry.count / entry.topics.length);
      let remainder = entry.count - base * entry.topics.length;
      entry.topics.forEach(topicId => {
        const extra = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder -= 1;
        flat.push({ topicId, count: base + extra });
      });
    } else {
      flat.push({ topicId: entry.topicId, count: entry.count });
    }
  });
  return flat;
}

async function buildKadroExamPool(roleKey) {
  await loadExamConfig();
  const blueprint = examBlueprints?.[roleKey];
  if (!blueprint) throw new Error('Bu kadro için sınav planı tanımlı değil.');
  const flatEntries = expandBlueprintEntries(blueprint.topics);
  const missingTopics = [];
  const pool = [];
  // NOT (2026-08-15 performans düzeltmesi): önceden bu döngü sıralıydı
  // (her `await loadExamTopicBank` bir öncekini bekliyordu) — sube-mudur gibi
  // 20+ konulu blueprint'lerde 20+ ardışık ağ isteği birikip "Başlat" düğmesini
  // birkaç saniye geciktiriyordu. Konular birbirinden bağımsız olduğu için
  // hepsini paralel çekiyoruz.
  const banks = await Promise.all(flatEntries.map(({ topicId }) => loadExamTopicBank(topicId)));
  flatEntries.forEach(({ topicId, count }, i) => {
    const topicMeta = examTopicRegistry[topicId];
    const bank = banks[i];
    if (!bank.length) { missingTopics.push(topicMeta?.title || topicId); return; }
    const picked = shuffle(bank).slice(0, count).map(q => ({
      ...q,
      documentId: topicId,
      documentTitle: topicMeta?.title || topicId,
      categoryKey: topicMeta?.category || null
    }));
    pool.push(...picked);
    if (picked.length < count) missingTopics.push(`${topicMeta?.title || topicId} (${picked.length}/${count})`);
  });
  // NOT (2026-08-15 sıralama düzeltmesi): eskiden pool sonunda tamamen
  // shuffle ediliyordu — bu, blueprint'in (resmi Ek-2 tablosunun) konu sırasını
  // (Türkçe → İnsan Hakları → ... → bağlı mevzuat) tamamen bozuyordu. Artık
  // konular BLUEPRINT SIRASIYLA ekleniyor; her konunun kendi soruları rastgele
  // seçiliyor (shuffle(bank).slice) ama konular arası sıra korunuyor.
  return { pool, missingTopics, blueprint };
}

async function startKadroExam() {
  if (!requirePremiumOrWarn()) return;
  const roleKey = progress.selectedRole;
  if (!roleKey) return showToast('Önce kadronu seçmelisin.');
  showToast('Gerçek sınav formatı hazırlanıyor…');
  try {
    const { pool, missingTopics, blueprint } = await buildKadroExamPool(roleKey);
    if (!pool.length) return showToast('Bu kadro için henüz soru bankası eklenmedi.');
    if (missingTopics.length) {
      showToast(`Bazı konularda içerik eksik: ${missingTopics.slice(0, 2).join(', ')}${missingTopics.length > 2 ? '…' : ''}`);
    }
    closeAllSheets(topicSheet);
    topicSheet.classList.add('open');
    topicSheet.setAttribute('aria-hidden', 'false');
    topicBackdrop.classList.add('open');
    const roleLabel = ROLES.find(r => r.key === roleKey)?.label || '';
    const customTimeSeconds = blueprint.durationMinutes ? blueprint.durationMinutes * 60 : null;
    startQuiz({
      questions: pool,
      kind: 'kadro-exam',
      title: `${roleLabel} - Gerçek Sınav Formatı`,
      subtitle: `${pool.length} soru • resmi ağırlık dağılımı`,
      returnView: closeTopicSheet,
      customTimeSeconds
    });
  } catch (error) {
    showToast(error.message || 'Sınav hazırlanamadı.');
  }
}
