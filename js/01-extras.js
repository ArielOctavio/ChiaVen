// ════════════════════════════════════════════
// CHIAVEN EXTRA FEATURES
// ════════════════════════════════════════════

// ── QUICK REPLY SUGGESTIONS ──
var QUICK_REPLIES_BUYER = [
  'Aceptan permuta?',
  'Tienen financiacion BNA?',
  'Papeles al dia?',
  'Cual es el precio final?',
  'Puedo verlo hoy?'
];
var QUICK_REPLIES_SELLER = [
  'Si, aceptamos permuta',
  'Si, trabajamos con BNA',
  'Toda la documentacion al dia',
  'El precio es negociable',
  'Cuando pueden venir a verlo?'
];

function showQuickReplies() {
  var car = carCache[activeMsgCarId] || {};
  var isSeller = car.owner_id === (currentUser && currentUser.id);
  var replies = isSeller ? QUICK_REPLIES_SELLER : QUICK_REPLIES_BUYER;
  var el = document.getElementById('quick-replies');
  if (!el) return;
  el.innerHTML = replies.map(function(r) {
    return '<button type="button" class="quick-reply-btn" onclick="useQuickReply(this.textContent)">' + r + '</button>';
  }).join('');
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

function useQuickReply(text) {
  var input = document.getElementById('active-chat-input');
  if (input) { input.value = text; input.focus(); }
  var el = document.getElementById('quick-replies');
  if (el) el.style.display = 'none';
}

// ── VEHICLE FAVORITES ──
// Viven en Supabase (tabla favorites) para verse desde cualquier dispositivo. Si la tabla
// todavía no existe (falta correr supabase/003_tanda1.sql) se siguen guardando en el navegador.
var FAV_KEY = 'chiaven_favorites';
var favoritesCache = null;   // null = todavía no se cargaron de la base
var favoritesRemote = false; // true cuando la tabla responde
function localFavorites() { try { return JSON.parse(localStorage.getItem(FAV_KEY)||'[]').map(String); } catch(e){return[];} }
function getFavorites() { return favoritesCache ? favoritesCache.slice() : localFavorites(); }
function loadFavorites() {
  if (!currentUser) return Promise.resolve();
  return getSB().from('favorites').select('car_id').eq('user_id', currentUser.id).then(function(r) {
    if (r.error) { favoritesRemote = false; favoritesCache = null; return; }
    favoritesRemote = true;
    favoritesCache = (r.data || []).map(function(f) { return String(f.car_id); });
    // Migración única: subir lo que estaba guardado solo en este navegador
    var pending = localFavorites().filter(function(id) { return favoritesCache.indexOf(id) < 0; });
    if (!pending.length) { try { localStorage.removeItem(FAV_KEY); } catch(e) {} updateFavBtns(); return; }
    favoritesCache = favoritesCache.concat(pending);
    return getSB().from('favorites').upsert(pending.map(function(id) { return { user_id: currentUser.id, car_id: id }; }), { ignoreDuplicates: true }).then(function(w) {
      if (!w.error) { try { localStorage.removeItem(FAV_KEY); } catch(e) {} }
      updateFavBtns();
    });
  });
}
function toggleFavorite(carId, event) {
  if (event) event.stopPropagation();
  carId = String(carId);
  var favs = getFavorites();
  var idx = favs.indexOf(carId);
  var adding = idx < 0;
  if (adding) favs.push(carId); else favs.splice(idx, 1);
  toast(adding ? 'Agregado a favoritos' : 'Eliminado de favoritos', adding ? 'success' : 'info');
  if (favoritesRemote && currentUser) {
    favoritesCache = favs;
    var req = adding
      ? getSB().from('favorites').upsert({ user_id: currentUser.id, car_id: carId }, { ignoreDuplicates: true })
      : getSB().from('favorites').delete().eq('user_id', currentUser.id).eq('car_id', carId);
    req.then(function(r) { if (r.error) toast('No se pudo guardar el favorito: ' + (r.error.message || 'error'), 'error'); });
  } else {
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  }
  updateFavBtns();
}
function isFavorite(carId) { return getFavorites().indexOf(String(carId)) >= 0; }
function updateFavBtns() {
  document.querySelectorAll('.fav-btn').forEach(function(btn) {
    var id = btn.dataset.carid;
    btn.innerHTML = isFavorite(id) ? '&#x2764;' : '&#x2661;';
    btn.style.color = isFavorite(id) ? 'var(--red)' : 'var(--text3)';
  });
}

// ── SHARE CAR LINK ──
function shareCarLink(carId, event) {
  if (event) event.stopPropagation();
  var url = window.location.origin + '?car=' + carId;
  if (navigator.share) {
    navigator.share({ title: 'Chiaven - Ver vehiculo', url: url });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() {
      toast('Link copiado al portapapeles', 'success');
    });
  } else {
    toast('Link: ' + url, 'info');
  }
}

// ── DEEP LINK - open car from URL param ──
document.addEventListener('DOMContentLoaded', function() {
  var params = new URLSearchParams(window.location.search);
  var carId = params.get('car');
  if (carId) {
    setTimeout(function() {
      getSB().from('cars').select('*').eq('id', carId).then(function(r) {
        if (r.data && r.data[0]) {
          carCache[carId] = r.data[0];
          openCarDetailById(null, carId);
        }
      });
    }, 1500);
  }
});

// ── VIEW COUNTER ──
function trackCarView(carId) {
  if (!carId) return;
  var key = 'chiaven_views_' + carId;
  var views = parseInt(localStorage.getItem(key)||'0') + 1;
  localStorage.setItem(key, views.toString());
}
function getCarViews(carId) {
  return parseInt(localStorage.getItem('chiaven_views_' + carId)||'0');
}
