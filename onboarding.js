// ================= SınavRotası — Giriş Tanıtımı (Onboarding) =================
// Uygulamanın hizmet ve özelliklerini ilk açılışta tanıtan, kaydırılabilir
// slayt akışı. Kullanıcıya soru sormaz / puanlamaz; sadece anlatır ve
// kaydırma/dokunma ile keşfedilebilir kılar. Bir kere görüldükten sonra
// localStorage bayrağıyla tekrar gösterilmez (bkz. sonundaki SEEN_KEY).

(function () {
  var SEEN_KEY = 'sr_onboarding_seen_v1';

  var shell = document.getElementById('obShell');
  var track = document.getElementById('obTrack');
  var slides = Array.prototype.slice.call(track.querySelectorAll('.ob-slide'));
  var routeNav = document.getElementById('obRoute');
  var skipBtn = document.getElementById('obSkip');
  var nextBtn = document.getElementById('obNext');
  var footer = document.getElementById('obFooter');
  var startBtn = document.getElementById('obStart');
  var count = slides.length;
  var current = 0;
  var slideWidth = 0;

  // ---------- Rota göstergesini oluştur (nokta + bağlantı çizgisi) ----------
  var nodes = [];
  var segs = [];
  slides.forEach(function (_, i) {
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'ob-route-node';
    node.setAttribute('aria-label', 'Bölüm ' + (i + 1));
    node.addEventListener('click', function () { goTo(i); });
    routeNav.appendChild(node);
    nodes.push(node);
    if (i < count - 1) {
      var seg = document.createElement('span');
      seg.className = 'ob-route-seg';
      var fill = document.createElement('i');
      seg.appendChild(fill);
      routeNav.appendChild(seg);
      segs.push(seg);
    }
  });

  function updateRoute() {
    nodes.forEach(function (node, i) {
      node.classList.toggle('is-active', i === current);
      node.classList.toggle('is-done', i < current);
    });
    segs.forEach(function (seg, i) {
      seg.classList.toggle('is-done', i < current);
    });
  }

  // ---------- Slayt temaları (koyu/açık) ----------
  function updateTheme() {
    var isDark = slides[current].classList.contains('ob-slide--dark');
    shell.classList.toggle('is-dark', isDark);
  }

  // ---------- Giriş animasyonlarını tetikle ----------
  function updateActiveClass() {
    slides.forEach(function (slide, i) {
      if (i === current) {
        // yeniden tetiklemek için önce kaldırıp reflow sonrası ekle
        slide.classList.remove('is-active');
        void slide.offsetWidth;
        slide.classList.add('is-active');
      } else {
        slide.classList.remove('is-active');
      }
    });
  }

  function updateFooterVisibility() {
    var isLast = current === count - 1;
    footer.classList.toggle('is-hidden', isLast);
    skipBtn.classList.toggle('is-hidden', isLast);
  }

  function measure() {
    slideWidth = track.parentElement.getBoundingClientRect().width;
  }

  function render(withTransition) {
    track.classList.toggle('is-dragging', !withTransition);
    track.style.transform = 'translateX(' + (-current * slideWidth) + 'px)';
    updateRoute();
    updateTheme();
    updateFooterVisibility();
    updateActiveClass();
  }

  function goTo(index) {
    current = Math.max(0, Math.min(count - 1, index));
    render(true);
  }

  function finishOnboarding() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
    window.location.href = 'login.html';
  }

  skipBtn.addEventListener('click', finishOnboarding);
  startBtn.addEventListener('click', finishOnboarding);
  nextBtn.addEventListener('click', function () {
    if (current < count - 1) goTo(current + 1);
    else finishOnboarding();
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') goTo(current + 1);
    if (e.key === 'ArrowLeft') goTo(current - 1);
  });

  // ---------- Sürükle / kaydır ----------
  var pointerId = null;
  var startX = 0;
  var dragX = 0;
  var isDragging = false;

  function onPointerDown(e) {
    if (e.target.closest('button')) return; // buton üstünde sürüklemeyi başlatma
    pointerId = e.pointerId;
    startX = e.clientX;
    dragX = 0;
    isDragging = true;
    track.classList.add('is-dragging');
    track.setPointerCapture && e.target.setPointerCapture && (function(){ try { e.target.setPointerCapture(pointerId); } catch(_){} })();
  }
  function onPointerMove(e) {
    if (!isDragging || e.pointerId !== pointerId) return;
    dragX = e.clientX - startX;
    // sınırlarda hafif direnç (rubber-band)
    var resist = (current === 0 && dragX > 0) || (current === count - 1 && dragX < 0) ? 0.35 : 1;
    var offset = -current * slideWidth + dragX * resist;
    track.style.transform = 'translateX(' + offset + 'px)';
  }
  function onPointerUp(e) {
    if (!isDragging || e.pointerId !== pointerId) return;
    isDragging = false;
    var threshold = Math.max(40, slideWidth * 0.16);
    if (dragX < -threshold && current < count - 1) current += 1;
    else if (dragX > threshold && current > 0) current -= 1;
    render(true);
  }

  track.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  window.addEventListener('resize', function () {
    measure();
    render(false);
  });

  // ---------- Sınava geri sayım örneği: yaklaşan bir tarihi gösterir ----------
  (function setCountdownPreview() {
    var el = document.getElementById('obCountdownNum');
    if (!el) return;
    // Gerçek sınav tarihi girişten sonra profil/ayarlardan belirlenir; burada
    // sadece tanıtım amaçlı akıcı bir örnek sayı gösteriyoruz.
    el.textContent = '14';
  })();

  // ---------- Başlat ----------
  measure();
  render(false);
})();
