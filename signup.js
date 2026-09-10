// ================= SınavRotası — Kayıt sayfası =================

// Bu sayfanın arkaplanı açık renkli olduğu için durum çubuğu koyu ikonlarla
// başlatılır (bkz. native-ux.js). Sayfa statik olduğundan içerik zaten hazır —
// açılış ekranı hemen kapatılabilir.
window.NativeUX?.init({ statusBarStyle: 'LIGHT' });
window.NativeUX?.hideSplash();

document.getElementById('signupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const signupError = document.getElementById('signupError');
  const signupInfo = document.getElementById('signupInfo');
  signupError.textContent = '';
  signupInfo.textContent = '';

  const fullName = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
  const termsAccepted = document.getElementById('signupTerms')?.checked;

  const passwordError = passwordRequirementError(password);
  if (passwordError) {
    signupError.textContent = passwordError;
    return;
  }
  if (password !== passwordConfirm) {
    signupError.textContent = 'Şifreler eşleşmiyor.';
    return;
  }
  if (!termsAccepted) {
    signupError.textContent = 'Devam etmek için Kullanım Koşulları ve Gizlilik Politikası\'nı kabul etmelisin.';
    return;
  }

  const submitButton = document.getElementById('signupSubmit');
  setFormBusy(submitButton, true, 'Kayıt Ol');
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      // E-postadaki doğrulama bağlantısı tıklandığında kullanıcı doğrudan
      // uygulamaya (index.html) dönsün. Bu URL'nin Supabase Dashboard >
      // Authentication > URL Configuration > Redirect URLs listesinde
      // kayıtlı olması gerekir, yoksa Supabase bağlantıyı reddeder.
      emailRedirectTo: nativeAuthRedirectUrl('index.html')
    }
  });
  setFormBusy(submitButton, false, 'Kayıt Ol');

  if (error) {
    signupError.textContent = friendlyAuthError(error.message);
    return;
  }
  if (data.session) {
    // Proje ayarlarında e-posta doğrulaması kapalıysa oturum hemen açılır.
    window.location.href = 'index.html';
    return;
  }
  signupInfo.textContent = 'Hesabın oluşturuldu! Devam etmek için e-postana gelen bağlantıya tıkla.';
  document.getElementById('signupForm').reset();
});
