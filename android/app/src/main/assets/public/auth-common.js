// ================= SınavRotası — Giriş/Kayıt sayfaları ortak kodu =================
// login.html ve signup.html tarafından ortak kullanılır. app.js ile ilgisi yoktur,
// bu yüzden panel elemanları bulunamadığında (örn. bu sayfalarda olmayan id'ler) çökme olmaz.

function friendlyAuthError(message = '') {
  if (/Invalid login credentials/i.test(message)) return 'E-posta veya şifre hatalı.';
  if (/User already registered/i.test(message)) return 'Bu e-posta ile zaten bir hesap var.';
  if (/Password should be at least|password.*(weak|requirement)/i.test(message)) return 'Şifre en az 12 karakter olmalı; büyük harf, küçük harf, rakam ve sembol içermeli.';
  if (/Email not confirmed/i.test(message)) return 'Lütfen e-postana gelen doğrulama bağlantısına tıkla.';
  if (/provider is not enabled/i.test(message)) return 'Bu giriş yöntemi şu anda kullanılamıyor. Lütfen e-posta ile devam et.';
  if (/redirect_to.*not allowed|requested path is invalid/i.test(message)) return 'Bu giriş yöntemi henüz yapılandırılmadı.';
  return message || 'Bir şeyler ters gitti, tekrar dene.';
}

function setFormBusy(button, busy, idleLabel) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? 'Bekleyin…' : idleLabel;
}

function passwordRequirementError(password) {
  if (typeof password !== 'string' || password.length < 12) {
    return 'Şifre en az 12 karakter olmalı.';
  }
  if (!/[a-zçğıöşü]/.test(password)) return 'Şifre en az bir küçük harf içermeli.';
  if (!/[A-ZÇĞİÖŞÜ]/.test(password)) return 'Şifre en az bir büyük harf içermeli.';
  if (!/\d/.test(password)) return 'Şifre en az bir rakam içermeli.';
  if (!/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(password)) return 'Şifre en az bir sembol içermeli.';
  return '';
}

// Recovery durumu bir JS değişkeninde değil sessionStorage'da tutulur, çünkü
// tam sayfa navigasyonu (window.location.replace) JS state'ini sıfırlar ama
// sessionStorage sayfa geçişlerinde kalıcıdır. Anahtar: 'sr_pending_recovery'.
const RECOVERY_FLAG_KEY = 'sr_pending_recovery';

// login.html'de "Giriş Yap" kartını gizleyip "Yeni Şifre Belirle" kartını
// gösterir. signup.html gibi bu elemanların bulunmadığı sayfalarda no-op'tur.
function showPasswordRecoveryForm() {
  document.getElementById('loginCard')?.setAttribute('hidden', '');
  document.getElementById('recoveryCard')?.removeAttribute('hidden');
}

// auth-common.js index.html'de de yüklendiği için zaten uygulama kabuğundaysak
// yeniden aynı URL'e yönlenmeyiz. Bu, cold-start deep link'te PKCE oturumu
// oluştuğunda index.html -> index.html sonsuz yenileme döngüsünü önler; aynı
// anda app-guard.js oturum olayını alıp uygulamayı başlatmaya devam eder.
function isAppShellPage() {
  return /(?:\/index\.html)?\/$/i.test(window.location.pathname)
    || /\/index\.html$/i.test(window.location.pathname);
}

function redirectToApp() {
  if (!isAppShellPage()) window.location.replace('index.html');
}

// Native (Capacitor) build'de auth dönüş adresi olarak özel URL scheme kullanılır
// (AndroidManifest.xml'deki sinavrotasi://auth-callback intent-filter'ı ile eşleşir).
// Web'de eskisi gibi aynı sayfaya (login.html/index.html) dönülür.
// `page` parametresi sadece web fallback'i için kullanılır; native'de her zaman
// tek bir callback URL'i kullanılır çünkü Supabase Redirect URLs listesinde
// yalnızca bu adresin kayıtlı olması yeterli.
function nativeAuthRedirectUrl(webFallbackPage) {
  if (window.NativeUX && window.NativeUX.isNative) {
    return 'sinavrotasi://auth-callback';
  }
  return new URL(webFallbackPage, window.location.href).href;
}

// PKCE'de callback URL'i ?code=... taşır. Native'de URL tarayıcı adres çubuğuna
// değil appUrlOpen event'ine geldiği için kodu burada exchangeCodeForSession()
// ile değiştiririz. Geçiş döneminde eski implicit-link'ler için tokenlı kol da
// korunur; yeni akış tokenları URL fragmentinde taşımaz.
async function handleAuthCallbackUrl(url) {
  try {
    const parsed = new URL(url);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const query = parsed.searchParams;

    const errorDescription = fragment.get('error_description') || query.get('error_description');
    if (errorDescription) {
      alert(friendlyAuthError(decodeURIComponent(errorDescription)));
      return;
    }

    const code = query.get('code');
    const flowId = query.get('sb_flow_id');
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    const type = fragment.get('type') || query.get('type'); // 'recovery' | 'signup' | 'magiclink' | vb.

    if (!code && (!accessToken || !refreshToken)) return;

    // Bayrağı oturum değişiminden ÖNCE yazıyoruz: exchangeCodeForSession()
    // veya setSession() kendi onAuthStateChange event'ini tetikleyebilir ve o
    // dinleyici bu bayrağı kontrol eder — sırası ters olursa index.html'e
    // istenmeyen bir yönlendirme yarış durumu oluşabilir.
    if (type === 'recovery') {
      sessionStorage.setItem(RECOVERY_FLAG_KEY, '1');
    }

    let error;
    if (code) {
      ({ error } = await supabaseClient.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined
      ));
    } else {
      // Eski implicit callback bağlantıları için geriye dönük uyumluluk.
      ({ error } = await supabaseClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      }));
    }

    if (error) {
      sessionStorage.removeItem(RECOVERY_FLAG_KEY);
      alert(friendlyAuthError(error.message));
      return;
    }

    if (type === 'recovery') {
      // Şifre sıfırlama bağlantısından geldi: oturum açıldı ama kullanıcı önce
      // yeni şifresini belirlemeli. index.html'e ATLAMIYORUZ — kullanıcı yeni
      // şifresini belirleyene kadar login.html'deki "Yeni Şifre Belirle"
      // formunda kalır.
      if (!/\/login\.html$/.test(window.location.pathname)) {
        window.location.replace('login.html');
      } else {
        showPasswordRecoveryForm();
      }
      return;
    }
    redirectToApp();
  } catch (err) {
    console.warn('[Auth] Deep link işlenemedi:', err);
  }
}

// native-ux.js appUrlOpen'ı yakalayıp bu event'i fırlatır (bkz. Plugins.App.addListener).
document.addEventListener('nativeux:url', event => {
  const url = event?.detail?.url;
  if (url && url.startsWith('sinavrotasi://auth-callback')) {
    handleAuthCallbackUrl(url);
  }
});

// Şifre alanlarındaki göz ikonuna tıklayınca şifreyi göster/gizle.
document.querySelectorAll('.eye[data-toggle-for]').forEach(icon => {
  icon.addEventListener('click', () => {
    const input = document.getElementById(icon.dataset.toggleFor);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// Google / Apple / Microsoft butonları — gerçek Supabase OAuth çağrısı.
// NOT: İlgili sağlayıcı Supabase Dashboard > Authentication > Providers altında
// açılıp kendi Client ID / Secret bilgileriyle yapılandırılmadan bu butonlar çalışmaz;
// Supabase o zaman "provider is not enabled" hatası döner (bu artık kullanıcıya
// düzgün bir mesaj olarak gösterilir, sayfa çökmez).
document.querySelectorAll('.social-box[data-provider]').forEach(button => {
  button.addEventListener('click', async () => {
    const provider = button.dataset.provider;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: nativeAuthRedirectUrl('index.html') }
      });
      if (error) {
        alert(friendlyAuthError(error.message));
        button.disabled = false;
      }
      // Hata yoksa tarayıcı sağlayıcının giriş ekranına yönlendirilir.
    } catch (err) {
      alert(friendlyAuthError(err?.message));
      button.disabled = false;
    }
  });
});

// Web PKCE callback'i client oluşturulurken otomatik işlenmeye başlayabilir.
// Recovery türünü olay dinleyicisinden önce kaydetmek, oturum oluşur oluşmaz
// kullanıcıyı yanlışlıkla index.html'e yönlendiren yarış durumunu önler.
try {
  if (new URL(window.location.href).searchParams.get('type') === 'recovery') {
    sessionStorage.setItem(RECOVERY_FLAG_KEY, '1');
  }
} catch (_) {}

// Bu sayfaya oturumu zaten açık biri gelirse — ör. e-posta doğrulama bağlantısındaki
// PKCE kodu işlendiğinde ya da sekmeyi geri açtığında — doğrudan uygulamaya
// yönlendir. Recovery'de önce yeni şifre formu gösterilir.
// İSTİSNA: recovery linkiyle geldiyse (web'de supabase-js bunu otomatik algılayıp
// PASSWORD_RECOVERY event'i fırlatır) uygulamaya atlamıyoruz — önce yeni şifre formu.
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    sessionStorage.setItem(RECOVERY_FLAG_KEY, '1');
    showPasswordRecoveryForm();
    return;
  }
  if (session && !sessionStorage.getItem(RECOVERY_FLAG_KEY)) {
    redirectToApp();
  }
});
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session && !sessionStorage.getItem(RECOVERY_FLAG_KEY)) {
    redirectToApp();
  }
});

// Sayfa yeniden yüklendiğinde (ör. native'de login.html'e yönlendirme sonrası)
// bekleyen bir recovery varsa formu hemen göster — event'i beklemeye gerek yok.
if (sessionStorage.getItem(RECOVERY_FLAG_KEY)) {
  showPasswordRecoveryForm();
}

// "Yeni Şifre Belirle" formu — recovery oturumunda supabase.auth.updateUser ile
// şifreyi günceller. Bu sayfada olmayan formlarda (signup.html) no-op'tur.
document.getElementById('recoveryForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const recoveryError = document.getElementById('recoveryError');
  recoveryError.textContent = '';
  const password = document.getElementById('recoveryPassword').value;
  const confirm = document.getElementById('recoveryPasswordConfirm').value;
  const submitButton = document.getElementById('recoverySubmit');

  const passwordError = passwordRequirementError(password);
  if (passwordError) {
    recoveryError.textContent = passwordError;
    return;
  }
  if (password !== confirm) {
    recoveryError.textContent = 'Şifreler eşleşmiyor.';
    return;
  }

  setFormBusy(submitButton, true, 'Şifreyi Güncelle');
  const { error } = await supabaseClient.auth.updateUser({ password });
  setFormBusy(submitButton, false, 'Şifreyi Güncelle');

  if (error) {
    recoveryError.textContent = friendlyAuthError(error.message);
    return;
  }
  sessionStorage.removeItem(RECOVERY_FLAG_KEY);
  window.location.replace('index.html');
});
