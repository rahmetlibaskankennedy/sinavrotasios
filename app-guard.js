// ================= SınavRotası — Uygulama erişim koruması =================
// index.html'de app.js'den ÖNCE yüklenir. Oturum yoksa login.html'e yönlendirir;
// oturum varsa app.js'in beklediği 'sinavrotasi:authenticated' event'ini tetikler.
// (E-posta doğrulama bağlantısındaki #access_token da burada, sayfa yüklenirken
// supabase-js tarafından otomatik okunup temizlenir.)
let appStarted = false;
function startApp(session) {
  if (appStarted) return;
  appStarted = true;
  const user = session.user;
  const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
  const firstName = fullName.split(' ')[0];
  const firstNameEl = document.getElementById('userFirstName');
  if (firstNameEl) firstNameEl.textContent = firstName;
  window.currentUser = user;
  // Sunucudaki kayıtlı kadroyu ve premium durumunu paralel çek — tarama verisi
  // silinse bile kaybolmasın. is_premium() RPC'si zaten paywall mantığının
  // sunucu tarafında kullandığı fonksiyon; burada sadece arayüzün "premium
  // gerekiyor" mesajını doğru zamanda gösterebilmesi için tekrar okunuyor.
  Promise.all([
    supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabaseClient.rpc('is_premium')
  ]).then(([{ data, error }, { data: premiumData, error: premiumError }]) => {
      if (error) console.error('Profil rolü okunamadı:', error);
      if (premiumError) console.error('Premium durumu okunamadı:', premiumError);
      window.currentUserRole = data?.role || null;
      // RPC hata verirse (ör. ağ sorunu) bilinmiyor durumunda bırak (null) —
      // app.js bunu "premium değil" ile karıştırıp yanlışlıkla kilitlemesin.
      window.currentUserIsPremium = premiumError ? null : Boolean(premiumData);
      // ÖNEMLİ: window.currentUser rol sorgusundan ÖNCE senkron olarak set edildi.
      // app.js bu yüzden window.currentUser'a değil, sadece rol bilgisi de dahil
      // her şey hazır olduğunda true olan bu bayrağa bakmalı — aksi halde app.js
      // rol verisi gelmeden handleAuthenticated()'i tetikleyip kadro ekranını
      // yanlışlıkla açabilir.
      window.currentUserAuthReady = true;
      document.dispatchEvent(new CustomEvent('sinavrotasi:authenticated', { detail: { user } }));
    });
}
window.signOut = async function signOut() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
};
supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session) {
    startApp(session);
  } else if (appStarted) {
    // Oturum başka bir sekmede/aygıtta kapatıldı — giriş sayfasına dön.
    window.location.href = 'login.html';
  }
});
supabaseClient.auth.getSession().then(async ({ data }) => {
  if (!data.session) {
    window.location.href = 'login.html';
    return;
  }
  // Oturum var görünüyor ama kullanıcı gerçekten Supabase'de duruyor mu, sunucudan doğrula
  const { data: userData, error } = await supabaseClient.auth.getUser();
  if (error || !userData?.user) {
    // Kullanıcı silinmiş / geçersiz — oturumu temizle, giriş sayfasına dön
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
    return;
  }
  startApp(data.session);
});

// NOT: SUPABASE_URL, SUPABASE_ANON_KEY ve supabaseClient burada TEKRAR tanımlanmıyor —
// bunlar zaten supabaseClient.js dosyasında tanımlı ve bu dosya app-guard.js'den ÖNCE
// yükleniyor (index.html'deki script sırasına bakın). Burada tekrar `const` ile
// tanımlamak "Identifier has already been declared" SyntaxError'una yol açar ve bu
// hata dosyanın tamamının (window.signOut dahil) çalışmasını engeller.
