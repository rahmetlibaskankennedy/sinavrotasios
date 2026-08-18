// ================= SınavRotası — Native (Capacitor) UX katmanı =================
// Bu dosya web'de (tarayıcıda) TAMAMEN ZARARSIZDIR: window.Capacitor yoksa veya
// ilgili plugin henüz projeye eklenmemişse her fonksiyon sessizce hiçbir şey yapmaz.
// Capacitor iskeleti kurulduğunda (bkz. Yol Haritası 1.Öncelik #7) ve aşağıdaki
// paketler npm ile kurulup `npx cap sync` çalıştırıldığında ek bir kod değişikliği
// GEREKMEDEN devreye girer:
//   @capacitor/core, @capacitor/app, @capacitor/haptics,
//   @capacitor/status-bar, @capacitor/splash-screen, @capacitor/keyboard
// Bu proje bundler kullanmadığı için (bkz. Yol Haritası P1 #3) bu paketlerin
// kendi "dist/plugin.js" (UMD/IIFE) çıktısı, capacitor.config.json'daki webDir
// altına vendor/ olarak kopyalanıp <script> etiketiyle eklenmeli — her biri kendini
// otomatik olarak window.Capacitor.Plugins altına kaydeder (registerPlugin).
//
// index.html / login.html / signup.html tarafından app.js / login.js / signup.js'den
// ÖNCE yüklenir.

(function () {
  const Capacitor = window.Capacitor;
  const isNative = !!(Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  const platform = isNative && typeof Capacitor.getPlatform === 'function' ? Capacitor.getPlatform() : 'web';
  const Plugins = (Capacitor && Capacitor.Plugins) || {};

  // Bir plugin metodunu güvenle çağırır: plugin ya da metod yoksa (henüz kurulmamış
  // native build, web ortamı, vs.) sessizce null döner — hiçbir yerde çökme olmaz.
  function safeCall(pluginName, method, args) {
    try {
      const target = Plugins[pluginName];
      if (!target || typeof target[method] !== 'function') return null;
      return target[method](args);
    } catch (err) {
      console.warn(`[NativeUX] ${pluginName}.${method} başarısız:`, err);
      return null;
    }
  }

  // ---- HAPTİK GERİ BİLDİRİM ----
  // app.js'teki mevcut haptic(duration) çağrılarıyla birebir uyumlu:
  //  - tek sayı (ör. 14, 18)  → hafif/orta native "impact" (genel dokunma tepkisi)
  //  - dizi (ör. [12,40,12], şu an sadece yanlış cevapta kullanılıyor) → belirgin
  //    native "hata" bildirimi (iOS'ta Taptic Engine'in gerçek buzz-buzz paterni)
  // navigator.vibrate() iOS'ta hiç çalışmıyor ve Android'de tarayıcıya göre
  // tutarsız; native Haptics eklentisi ikisinde de düzgün çalışır.
  function haptic(duration) {
    if (!Plugins.Haptics) return;
    if (Array.isArray(duration)) {
      if (!safeCall('Haptics', 'notification', { type: 'ERROR' })) {
        safeCall('Haptics', 'impact', { style: 'HEAVY' });
      }
      return;
    }
    const style = Number(duration) >= 30 ? 'MEDIUM' : 'LIGHT';
    safeCall('Haptics', 'impact', { style });
  }

  // ---- DURUM ÇUBUĞU (Status Bar) ----
  // style: 'DARK' (koyu arkaplan → açık/beyaz ikonlar, ör. ana uygulama header'ı)
  //      | 'LIGHT' (açık arkaplan → koyu ikonlar, ör. giriş/kayıt ekranları)
  // Uygulama zaten env(safe-area-inset-top) ile kendi güvenli alan boşluğunu
  // ayarladığı için (style.css) durum çubuğu her zaman "overlay" (saydam,
  // içerik arkasında) modda tutulur — tasarımla birebir uyumlu.
  function initStatusBar(style) {
    // Capacitor 8+ / Android 15+ için yeni SystemBars API'si (@capacitor/core
    // içine dahil) önce denenir; yoksa eski @capacitor/status-bar eklentisine
    // düşülür. Hangisi kuruluysa o kullanılır, ikisi de yoksa sessizce atlanır.
    if (Plugins.SystemBars) {
      safeCall('SystemBars', 'setStyle', { style });
      return;
    }
    if (!Plugins.StatusBar) return;
    safeCall('StatusBar', 'setOverlaysWebView', { overlay: true });
    safeCall('StatusBar', 'setStyle', { style });
  }

  // ---- AÇILIŞ EKRANI (Splash Screen) ----
  let splashHidden = false;
  function hideSplash() {
    if (splashHidden) return;
    splashHidden = true;
    safeCall('SplashScreen', 'hide');
  }
  // Güvenlik ağı: bir hata/ağ sorunu yüzünden uygulama hideSplash()'ı hiç
  // çağıramazsa kullanıcı native açılış ekranında sonsuza kadar takılı kalmasın.
  setTimeout(hideSplash, 6000);

  // ---- KLAVYE ----
  function initKeyboard() {
    if (!Plugins.Keyboard) return;
    // setResizeMode yalnızca iOS'ta etkilidir; Android tarafında resize modu
    // capacitor.config.json > plugins.Keyboard.resize ile ayarlanmalı (önerilen: "none",
    // çünkü uygulama .phone kabını sabit ekrana göre, overflow:hidden ile
    // kuruyor — webview'in kendisinin küçülmesi mevcut layout'u bozar).
    safeCall('Keyboard', 'setResizeMode', { mode: 'none' });
    try {
      Plugins.Keyboard.addListener('keyboardWillShow', info => {
        document.body.classList.add('keyboard-open');
        document.documentElement.style.setProperty('--keyboard-height', `${(info && info.keyboardHeight) || 0}px`);
        const active = document.activeElement;
        const isSheetInput = active?.closest?.('.bottom-sheet, .topic-sheet, .quiz-nav-overlay');
        // Sheet içindeki bir alanı scrollIntoView() ile kaydırmak, alttaki ana
        // ekranın scroll-area'sını da kaydırabiliyor. Bu alanlar zaten panelin
        // içinde olduğundan otomatik sayfa kaydırmasına ihtiyaç duymaz.
        if (active && !isSheetInput && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          setTimeout(() => active.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
        }
      });
      Plugins.Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-open');
        document.documentElement.style.setProperty('--keyboard-height', '0px');
      });
    } catch (err) {
      console.warn('[NativeUX] Keyboard listener kurulamadı:', err);
    }
  }

  function hideKeyboard() {
    // Web'de etkisiz; Android/iOS'ta görünür klavyeyi kapatır. Arama sheet'i
    // kapanırken input odağı da app.js tarafından kaldırılır.
    safeCall('Keyboard', 'hide');
  }

  // ---- UYGULAMA YAŞAM DÖNGÜSÜ + ANDROID GERİ TUŞU ----
  // Diğer dosyalarla (app.js) sıkı bağ kurmamak için burada sadece iki genel
  // DOM event'i yayınlanır: 'nativeux:pause' / 'nativeux:resume' ve
  // 'nativeux:backbutton'. app.js kendi ekran/sheet durumuna göre bu event'leri
  // dinler; 'nativeux:backbutton' için event.preventDefault() çağırırsa (yani
  // geri tuşunu uygulama içi bir kapanış/dönüş için kullandıysa) burada hiçbir
  // ek işlem yapılmaz. Hiçbir taraf tüketmezse (örn. ana ekrandayken) çift
  // basışla çıkış davranışı burada uygulanır — böylece kullanıcı yanlışlıkla
  // tek basışta uygulamadan atılmaz.
  let lastBackPressAt = 0;
  function defaultBackHandler() {
    const now = Date.now();
    if (now - lastBackPressAt < 2000) {
      safeCall('App', 'exitApp');
      return;
    }
    lastBackPressAt = now;
    if (typeof window.showToast === 'function') {
      window.showToast('Çıkmak için tekrar geri tuşuna bas');
    }
  }

  function initAppLifecycle() {
    if (!Plugins.App) return;
    try {
      Plugins.App.addListener('appStateChange', info => {
        document.dispatchEvent(new CustomEvent(info && info.isActive ? 'nativeux:resume' : 'nativeux:pause'));
      });
      Plugins.App.addListener('backButton', () => {
        const event = new CustomEvent('nativeux:backbutton', { cancelable: true });
        document.dispatchEvent(event);
        if (!event.defaultPrevented) defaultBackHandler();
      });
      // Uygulama sinavrotasi://auth-callback... gibi bir deep link ile açıldığında
      // (OAuth dönüşü, e-posta doğrulama, şifre sıfırlama) tetiklenir. Soğuk
      // başlangıçta da (uygulama kapalıyken link'e tıklanırsa) Capacitor bu event'i
      // ilk yüklemede fırlatır. auth-common.js bu event'i dinleyip token'ları işler.
      Plugins.App.addListener('appUrlOpen', data => {
        const url = data && data.url;
        if (!url) return;
        document.dispatchEvent(new CustomEvent('nativeux:url', { detail: { url } }));
      });
    } catch (err) {
      console.warn('[NativeUX] App listener kurulamadı:', err);
    }
  }

  function init(options) {
    const opts = options || {};
    initStatusBar(opts.statusBarStyle || 'DARK');
    initKeyboard();
    initAppLifecycle();
  }

  window.NativeUX = { isNative, platform, init, haptic, hideSplash, hideKeyboard };
})();
