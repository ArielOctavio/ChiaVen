// ══════════════════════════════════════════════
// CHAT FINANCING CALCULATOR
// ══════════════════════════════════════════════
function showChatFinancing() {
  if (!activeChatCarId) return;
  var car = carCache[activeChatCarId];
  if (!car || !car.precio) { toast('Sin precio disponible', 'info'); return; }
  var precio = car.precio;
  var fin70 = Math.round(precio * 0.7);
  var rows = [
    { cuotas: 12, coef: 129.80 },
    { cuotas: 24, coef: 86.87 },
    { cuotas: 36, coef: 72.77 },
    { cuotas: 48, coef: 66.74 },
    { cuotas: 60, coef: 64.85 },
  ];
  var tableHTML = '<div class="chat-fin-card">' +
    '<div style="font-size:0.75rem;font-weight:600;color:var(--accent2);margin-bottom:8px">🏦 Cuotas BNA para ' + car.marca + ' ' + car.modelo + '</div>' +
    '<div style="font-size:0.72rem;color:var(--text3);margin-bottom:8px">Financiando el 70%: <strong>' + fmtPrice(fin70) + '</strong></div>';
  rows.forEach(function(r) {
    var cuota = Math.round((fin70 / 1000) * r.coef);
    tableHTML += '<div class="chat-fin-row"><span>' + r.cuotas + ' cuotas</span><span style="font-weight:600;color:var(--accent2)">' + fmtPrice(cuota) + '/mes</span></div>';
  });
  tableHTML += '</div>';

  // Add as bot message
  if (!chatSessions[activeChatCarId]) chatSessions[activeChatCarId] = [];
  chatSessions[activeChatCarId].push({
    role: 'bot',
    text: '🏦 Calculé las cuotas BNA para este vehículo:' + tableHTML + '<div style="font-size:0.72rem;color:var(--text3);margin-top:6px">Tasa 45% TNA · Hasta 60 cuotas · Requiere aprobación crediticia</div>',
    ts: new Date().toISOString()
  });
  saveChatSessions();
  renderChatMessages();
}

// ══════════════════════════════════════════════
// DEAL CHECKLIST
// ══════════════════════════════════════════════
function renderDealChecklist(carId) {
  var car = carCache[carId];
  if (!car) return;
  var items = [
    { label: 'Precio acordado: ' + fmtPrice(car.precio), done: true },
    { label: 'Forma de pago definida', done: false },
    { label: 'Papeles verificados', done: false },
    { label: 'Fecha de entrega coordinada', done: false },
  ];
  var el = document.getElementById('deal-checklist');
  if (!el) return;
  el.innerHTML = items.map(function(item) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.8rem">' +
      '<span style="color:' + (item.done ? 'var(--green)' : 'var(--text3)') + '">' + (item.done ? '✅' : '○') + '</span>' +
      '<span style="color:' + (item.done ? 'var(--text)' : 'var(--text2)') + '">' + item.label + '</span></div>';
  }).join('');
}

// ══════════════════════════════════════════════
// HOOK ALERTS INTO loadAllVehicles
// ══════════════════════════════════════════════
var _origLoadAll = loadAllVehicles;
loadAllVehicles = function() {
  var lastCheck = localStorage.getItem('last_alert_check') || '2000-01-01';
  _origLoadAll();
  // After load, check alerts against new cars
  setTimeout(function() {
    var newCars = allCarsCache.filter(function(c) {
      return c.created_at > lastCheck && c.owner_id !== (currentUser && currentUser.id);
    });
    if (newCars.length) {
      checkAlerts(newCars);
      localStorage.setItem('last_alert_check', new Date().toISOString());
    }
  }, 2000);
};

// ADD compare button to each car card (patch carCardHTML)
var _origCarCard = carCardHTML;
carCardHTML = function(car, isMine, matchPct) {
  var html3 = _origCarCard(car, isMine, matchPct);
  if (!isMine) {
    var compareActive = compareList.indexOf(car.id) >= 0;
    var compareBtn = '<button type="button" class="btn-sm ' + (compareActive ? 'primary' : '') + '" onclick="toggleCompare(\'' + car.id + '\',event)" style="margin-top:6px;width:100%">' + (compareActive ? '✓ En comparador' : '⚖️ Comparar') + '</button>';
    // Insert before closing </div></div>
    html3 = html3.replace('</div></div>', compareBtn + '</div></div>');
  }
  return html3;
};

// ADD rating to car detail
var _origOpenDetail = openCarDetailById;
openCarDetailById = function(event, carId) {
  _origOpenDetail(event, carId);
  // Add rating button to detail actions if not mine
  var car = carCache[carId];
  if (!car) return;
  var isMine = currentUser && car.owner_id === currentUser.id;
  if (!isMine) {
    var actionsEl = document.getElementById('detail-actions');
    if (actionsEl) {
      var r = getAgencyRating(car.owner_id);
      var ratingHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
        (r ? '<span class="rating-badge">⭐ ' + r.avg + ' (' + r.count + ' calif.)</span>' : '<span style="font-size:0.78rem;color:var(--text3)">Sin calificaciones aún</span>') +
        '<button type="button" class="btn-sm" onclick="openRatingModal(\'' + car.owner_id + '\', \'' + (car.owner_email || 'Agencia').replace(/'/g,'') + '\')">⭐ Calificar agencia</button>' +
        '</div>';
      actionsEl.innerHTML = ratingHTML + actionsEl.innerHTML;
    }
  }
};

// PATCH showDealFlow to render checklist
var _origShowDeal = showDealFlow;
showDealFlow = function(carId) {
  _origShowDeal(carId);
  renderDealChecklist(carId || activeChatCarId);
};


function loadHomeMatchList() {
  if (!currentUser) return;
  var listEl = document.getElementById('home-match-list');
  if (!listEl) return;
  getSB().from('requests').select('*').eq('user_id', currentUser.id).limit(3).then(function(r) {
    var reqs = r.data || [];
    if (!reqs.length || !allCarsCache.length) { listEl.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-sub">Publicá un pedido para ver matches</div></div>'; return; }
    var allMatches = [];
    reqs.forEach(function(req) {
      allCarsCache.filter(function(c){return c.owner_id!==currentUser.id;}).forEach(function(c) {
        var pct = calcularMatch(c, req);
        if (pct >= 60) allMatches.push(Object.assign({}, c, {match: pct}));
      });
    });
    allMatches.sort(function(a,b){return b.match-a.match;});
    var top = allMatches.slice(0,4);
    var actMatches = document.getElementById('act-matches'); if(actMatches) actMatches.textContent = allMatches.length;
    if (!top.length) { listEl.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-sub">Sin matches por ahora</div></div>'; return; }
    listEl.innerHTML = top.map(function(c) {
      var imgs = Array.isArray(c.images)&&c.images.length?c.images:(c.image_url?[c.image_url]:[]);
      return '<div class="match-list-item" onclick="openCarDetailById(event,\'' + c.id + '\')">' +
        '<div class="match-list-thumb">' + (imgs.length?'<img src="'+imgs[0]+'" alt="">':'🚗') + '</div>' +
        '<div class="match-list-info"><div class="match-list-name">' + esc(c.marca) + ' ' + esc(c.modelo) + ' ' + (c.anio||'') + '</div>' +
        '<div class="match-list-meta">' + fmtKm(c.km) + ' · ' + esc(c.localidad||'') + '</div></div>' +
        '<div><div class="match-list-price">' + fmtPrice(c.precio) + '</div>' +
        '<div class="match-list-pct ' + matchClass(c.match) + '" style="margin-top:4px">' + c.match + '%</div></div>' +
        '<button type="button" class="match-chat-btn" onclick="event.stopPropagation();openInitChat(\'' + c.id + '\')">💬</button>' +
        '</div>';
    }).join('');
  });
}
