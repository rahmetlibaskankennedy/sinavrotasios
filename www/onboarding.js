// ================= SınavRotası — Onboarding (ilk açılış tanıtımı) =================
// Sadece bu ekranın kendi içindeki slayt geçişini yönetir. "Görüldü" bayrağını
// burada set ediyoruz; app-guard.js ilk açılışta oturum yoksa bu bayrağa bakıp
// login.html yerine bu sayfaya yönlendiriyor.
(function () {
  // Bu sayfa native ilk açılışta (Capacitor splash sonrası) gösterilen ilk
  // ekran olabileceği için splash'i burada da kapatmak gerekiyor — aksi halde
  // login.html/signup.html'e hiç gelinmeden splash sonsuza kadar açık kalır.
  window.NativeUX?.init({ statusBarStyle: 'LIGHT' });
  window.NativeUX?.hideSplash();

  const SEEN_KEY = 'sinavrotasi-onboarding-seen-v1';
  const track = document.getElementById('obTrack');
  const dots = Array.from(document.querySelectorAll('.ob-dot'));
  const nextBtn = document.getElementById('obNext');
  const skipBtn = document.getElementById('obSkip');
  const slideCount = document.querySelectorAll('.ob-slide').length;
  let index = 0;

  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* gizli modda sorun değil */ }
  }

  function render() {
    track.style.transform = `translateX(-${index * (100 / slideCount)}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
    const isLast = index === slideCount - 1;
    nextBtn.textContent = isLast ? 'Hemen Başla' : 'Devam Et';
  }

  function goNext() {
    if (index < slideCount - 1) {
      index += 1;
      render();
    } else {
      markSeen();
      window.location.href = 'signup.html';
    }
  }

  nextBtn.addEventListener('click', goNext);

  skipBtn.addEventListener('click', () => {
    markSeen();
    window.location.href = 'login.html';
  });

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { index = i; render(); });
  });

  // Basit dokunmatik kaydırma (sağa/sola swipe)
  let touchStartX = null;
  track.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && index < slideCount - 1) { index += 1; render(); }
      else if (dx > 0 && index > 0) { index -= 1; render(); }
    }
    touchStartX = null;
  }, { passive: true });

  // Bu sayfaya ikinci kez düşen biri (ör. geri tuşu) olursa akışı bozmadan devam etsin diye
  // burada yönlendirme yapmıyoruz — yönlendirme kararı tamamen app-guard.js'de.

  render();
})();