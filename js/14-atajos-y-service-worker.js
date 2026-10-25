// ══ ESC + TOUCH ══
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  closeMatchModal(); closeGallery(); closeCarDetail(); closeEditCar(); closeEditReq();
  closeUnlockModal(); closeForgotPassword(); closePayment(); closeNotifications();
  ['premium-modal','credit-modal','news-preview-modal','comparator-modal','rating-modal','alerts-modal','negotiation-modal','reservation-modal','post-reservation-modal'].forEach(function(id) { var el = document.getElementById(id); if (el) el.classList.add('hidden'); });
});

var gOverlay = document.getElementById('gallery-overlay');
if (gOverlay) {
  gOverlay.addEventListener('touchstart', function(e) { _tsx = e.touches[0].clientX; }, { passive: true });
  gOverlay.addEventListener('touchend', function(e) { var dx = e.changedTouches[0].clientX - _tsx; if (Math.abs(dx) > 50) galleryNav(dx < 0 ? 1 : -1); }, { passive: true });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}
