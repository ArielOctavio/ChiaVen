// ══════════════════════════════════════════════
// COMPARATOR
// ══════════════════════════════════════════════
var compareList = [];

function toggleCompare(carId, event) {
  if (event) event.stopPropagation();
  var idx = compareList.indexOf(carId);
  if (idx >= 0) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= 3) { toast('Máximo 3 autos para comparar', 'info'); return; }
    compareList.push(carId);
    toast('Auto agregado al comparador', 'info');
  }
  updateCompareBtn();
}

function updateCompareBtn() {
  var btn = document.getElementById('compare-btn');
  var cnt = document.getElementById('compare-count');
  if (!btn) return;
  if (compareList.length >= 2) {
    btn.style.display = 'flex';
    cnt.textContent = compareList.length;
  } else {
    btn.style.display = 'none';
  }
}

function openComparator() {
  var cars = compareList.map(function(id) { return carCache[id]; }).filter(Boolean);
  if (cars.length < 2) { toast('Seleccioná al menos 2 autos', 'info'); return; }
  var fields = [
    { label: 'Foto', key: 'img' },
    { label: 'Marca / Modelo', key: 'name' },
    { label: 'Año', key: 'anio' },
    { label: 'Kilómetros', key: 'km' },
    { label: 'Color', key: 'color' },
    { label: 'Precio', key: 'precio' },
    { label: 'Precio info', key: 'precio_info' },
    { label: 'Condición', key: 'condicion' },
    { label: 'Localidad', key: 'localidad' },
  ];
  var prices = cars.map(function(c) { return c.precio || 0; });
  var kms = cars.map(function(c) { return c.km || 0; });
  var minPrice = Math.min.apply(null, prices);
  var minKm = Math.min.apply(null, kms);

  var html2 = '<div style="overflow-x:auto"><table class="compare-table"><thead><tr><th>Característica</th>';
  cars.forEach(function(c) { html2 += '<th>' + esc(c.marca) + ' ' + esc(c.modelo) + '</th>'; });
  html2 += '</tr></thead><tbody>';

  fields.forEach(function(f) {
    html2 += '<tr><td style="color:var(--text3);font-weight:500">' + f.label + '</td>';
    cars.forEach(function(c, i) {
      var val = '';
      var cls = '';
      if (f.key === 'img') {
        var imgs = Array.isArray(c.images) && c.images.length ? c.images : (c.image_url ? [c.image_url] : []);
        val = imgs.length ? '<img src="' + imgs[0] + '" style="width:100%;height:80px;object-fit:cover;border-radius:8px">' : '<div style="height:80px;background:var(--navy5);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:28px">🚗</div>';
      } else if (f.key === 'name') {
        val = '<strong>' + esc(c.marca) + ' ' + esc(c.modelo) + '</strong>';
      } else if (f.key === 'precio') {
        val = fmtPrice(c.precio);
        cls = c.precio === minPrice ? 'better' : (c.precio > minPrice * 1.1 ? 'worse' : '');
      } else if (f.key === 'km') {
        val = fmtKm(c.km);
        cls = c.km === minKm ? 'better' : (c.km > minKm * 1.2 ? 'worse' : '');
      } else {
        val = esc(String(c[f.key] || '—'));
      }
      html2 += '<td class="' + cls + '">' + val + '</td>';
    });
    html2 += '</tr>';
  });

  html2 += '</tbody></table></div>';
  html2 += '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">';
  cars.forEach(function(c) {
    html2 += '<button type="button" class="btn-sm danger" onclick="removeFromCompare(\'' + c.id + '\')">✕ Quitar ' + esc(c.marca) + ' ' + esc(c.modelo) + '</button>';
  });
  html2 += '</div>';

  document.getElementById('comparator-content').innerHTML = html2;
  document.getElementById('comparator-modal').classList.remove('hidden');
}

function removeFromCompare(id) {
  compareList = compareList.filter(function(x) { return x !== id; });
  updateCompareBtn();
  if (compareList.length < 2) {
    document.getElementById('comparator-modal').classList.add('hidden');
    toast('Agregá más autos para comparar', 'info');
  } else {
    openComparator();
  }
}

// ══════════════════════════════════════════════
// RATINGS
// ══════════════════════════════════════════════
var RATINGS_KEY = 'chiaven_ratings';
var currentRating = 0;
var ratingTargetId = null;

function getRatings() { try { return JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}'); } catch(e) { return {}; } }
function saveRatings(r) { localStorage.setItem(RATINGS_KEY, JSON.stringify(r)); }

function getAgencyRating(ownerId) {
  var ratings = getRatings();
  var list = ratings[ownerId] || [];
  if (!list.length) return null;
  var avg = list.reduce(function(s, r) { return s + r.stars; }, 0) / list.length;
  return { avg: Math.round(avg * 10) / 10, count: list.length };
}

function openRatingModal(ownerId, agencyName) {
  ratingTargetId = ownerId;
  currentRating = 0;
  document.getElementById('rating-agency-name').textContent = agencyName || 'Agencia';
  document.getElementById('rating-comment').value = '';
  document.getElementById('rating-error').style.display = 'none';
  updateStarUI(0);
  document.getElementById('rating-modal').classList.remove('hidden');
}

function setRating(n) {
  currentRating = n;
  updateStarUI(n);
}

function updateStarUI(n) {
  var stars = document.querySelectorAll('#stars-row .star');
  stars.forEach(function(s, i) {
    s.classList.toggle('active', i < n);
  });
}

function submitRating() {
  if (!currentRating) {
    document.getElementById('rating-error').textContent = 'Seleccioná una puntuación.';
    document.getElementById('rating-error').style.display = 'block';
    return;
  }
  var comment = document.getElementById('rating-comment').value.trim();
  var ratings = getRatings();
  if (!ratings[ratingTargetId]) ratings[ratingTargetId] = [];
  ratings[ratingTargetId].push({
    stars: currentRating,
    comment: comment,
    userId: currentUser ? currentUser.id : 'anon',
    ts: new Date().toISOString()
  });
  saveRatings(ratings);
  document.getElementById('rating-modal').classList.add('hidden');
  toast('¡Calificación enviada! ⭐'.repeat(currentRating), 'success');
}

function ratingBadgeHTML(ownerId) {
  var r = getAgencyRating(ownerId);
  if (!r) return '';
  return '<span class="rating-badge">⭐ ' + r.avg + ' (' + r.count + ')</span>';
}

// ══════════════════════════════════════════════
// ALERTS SYSTEM
// ══════════════════════════════════════════════
var ALERTS_KEY = 'chiaven_alerts';

function getAlerts() { try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]'); } catch(e) { return []; } }
function saveAlertsData(a) { localStorage.setItem(ALERTS_KEY, JSON.stringify(a)); }

function openAlerts() {
  renderAlertsList();
  document.getElementById('alerts-modal').classList.remove('hidden');
}

function saveAlert() {
  var marca = document.getElementById('alert-marca').value.trim();
  var modelo = document.getElementById('alert-modelo').value.trim();
  var precio = parseFloat(document.getElementById('alert-precio').value) || null;
  var km = parseInt(document.getElementById('alert-km').value) || null;
  if (!marca && !modelo) { toast('Ingresá al menos marca o modelo', 'error'); return; }
  var alerts = getAlerts();
  alerts.push({
    id: Date.now(),
    marca: marca, modelo: modelo, precio: precio, km: km,
    active: true, created: new Date().toISOString()
  });
  saveAlertsData(alerts);
  fillMarcaSelect('alert-marca', 'alert-modelo');
  document.getElementById('alert-precio').value = '';
  document.getElementById('alert-km').value = '';
  toast('✅ Alerta creada. Te avisamos cuando llegue.', 'success');
  renderAlertsList();
}

function renderAlertsList() {
  var list = document.getElementById('alerts-list');
  if (!list) return;
  var alerts = getAlerts();
  if (!alerts.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-sub">No tenés alertas activas</div></div>';
    return;
  }
  list.innerHTML = alerts.map(function(a) {
    var label = [a.marca, a.modelo].filter(Boolean).join(' ');
    if (a.precio) label += ' · hasta ' + fmtPrice(a.precio);
    if (a.km) label += ' · hasta ' + fmtKm(a.km);
    return '<div class="alert-card">' +
      '<div class="alert-dot ' + (a.active ? '' : 'inactive') + '"></div>' +
      '<div style="flex:1"><div style="font-size:0.84rem;font-weight:500">' + esc(label) + '</div>' +
      '<div style="font-size:0.7rem;color:var(--text3)">' + new Date(a.created).toLocaleDateString('es-AR') + '</div></div>' +
      '<button type="button" class="btn-sm danger" onclick="deleteAlert(' + a.id + ')">✕</button></div>';
  }).join('');
}

function deleteAlert(id) {
  var alerts = getAlerts().filter(function(a) { return a.id !== id; });
  saveAlertsData(alerts);
  renderAlertsList();
  toast('Alerta eliminada', 'info');
}

function checkAlerts(newCars) {
  var alerts = getAlerts().filter(function(a) { return a.active; });
  if (!alerts.length || !newCars || !newCars.length) return;
  alerts.forEach(function(alert) {
    newCars.forEach(function(car) {
      var match = true;
      if (alert.marca && (car.marca || '').toLowerCase().indexOf(alert.marca.toLowerCase()) < 0) match = false;
      if (alert.modelo && (car.modelo || '').toLowerCase().indexOf(alert.modelo.toLowerCase()) < 0) match = false;
      if (alert.precio && car.precio > alert.precio) match = false;
      if (alert.km && car.km > alert.km) match = false;
      if (match) {
        addNotification('🔔',
          'Alerta: llegó un ' + (alert.marca || '') + ' ' + (alert.modelo || ''),
          fmtPrice(car.precio) + ' · ' + fmtKm(car.km) + (car.localidad ? ' · ' + car.localidad : ''),
          'green', 'vehicles'
        );
        toast('🔔 Alerta: encontramos un ' + (alert.marca||'') + ' ' + (alert.modelo||'') + '!', 'success');
      }
    });
  });
}
