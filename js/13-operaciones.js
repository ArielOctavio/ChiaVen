// ════════════════════════════════════════════════════════
// OPERATIONS SYSTEM — Negociación, Reserva, Comisión
// ════════════════════════════════════════════════════════

var OPERATIONS_KEY = 'chiaven_operations';
var activeOperation = null;
var remoteNegotiationSyncInterval = null;
var REMOTE_EVENT_PREFIX = '[CHIAVEN_EVENT]';

// ── Helpers ──
// Las operaciones viven en Supabase (tabla operations). Acá se mantiene una copia en memoria
// para que el resto de la app pueda leerlas sin esperar a la red.
var operationsCache = [];
var _opsSavedJson = {};   // id -> última versión guardada en la base
var _opsSaving = {};      // id -> cantidad de guardados en curso
function cloneOp(o) { return JSON.parse(JSON.stringify(o)); }
function getOperations() { return operationsCache.map(cloneOp); }
function saveOperations(ops) {
  operationsCache = ops.map(cloneOp);
  var pending = operationsCache.filter(function(op) { return JSON.stringify(op) !== _opsSavedJson[op.id]; });
  return Promise.all(pending.map(persistOperation));
}
function operationRow(op) {
  return { id: op.id, car_id: String(op.car_id), buyer_id: op.buyer_id, seller_id: op.seller_id, status: op.status || 'negociacion', data: op };
}
function persistOperation(op) {
  var json = JSON.stringify(op);
  _opsSaving[op.id] = (_opsSaving[op.id] || 0) + 1;
  return getSB().from('operations').upsert(operationRow(op)).then(function(r) {
    _opsSaving[op.id]--;
    if (r.error) {
      console.error('No se pudo guardar la operación:', r.error);
      toast('No se pudo guardar la operación: ' + (r.error.message || 'error'), 'error');
    } else {
      _opsSavedJson[op.id] = json;
    }
    return r;
  });
}
function loadOperations() {
  if (!currentUser) return Promise.resolve();
  var uid = currentUser.id;
  return getSB().from('operations').select('data').order('updated_at', { ascending: false }).then(function(r) {
    if (r.error) { console.error('Error leyendo operaciones:', r.error); return; }
    var byId = {};
    operationsCache.forEach(function(o) { byId[o.id] = o; });
    (r.data || []).forEach(function(row) {
      var op = row.data;
      if (!op || !op.id || _opsSaving[op.id]) return; // no pisar un cambio local que se está guardando
      byId[op.id] = op;
      _opsSavedJson[op.id] = JSON.stringify(op);
    });
    // Migración única: subir lo que había quedado guardado solo en este navegador
    var legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(OPERATIONS_KEY) || '[]'); } catch(e) {}
    var toMigrate = legacy.filter(function(o) { return o && o.id && !byId[o.id] && o.buyer_id === uid; });
    toMigrate.forEach(function(o) { byId[o.id] = o; });
    operationsCache = Object.keys(byId).map(function(k) { return byId[k]; });
    if (!legacy.length) return;
    return Promise.all(toMigrate.map(persistOperation)).then(function() {
      try { localStorage.removeItem(OPERATIONS_KEY); } catch(e) {}
    });
  });
}
function hasAgreedOperation(carId) {
  return operationsCache.some(function(o) {
    return String(o.car_id) === String(carId) && currentUser && o.buyer_id === currentUser.id &&
      ['precio_acordado','reserva_pendiente','reserva_pagada','completada'].indexOf(o.status) >= 0;
  });
}
function genId() {
  return 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
}

// ── Commission display HTML ──
function commissionBlockHTML(price, rate) {
  var c = calcCommission(price, rate);
  return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:14px;font-size:0.84rem">' +
    '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">' +
      '<span style="color:var(--text2)">Precio vendedor</span>' +
      '<span style="font-weight:600">' + fmtPrice(price) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">' +
      '<span style="color:var(--red)">Comisión Chiaven (' + fmtCommissionLabel(rate) + ')</span>' +
      '<span style="font-weight:600;color:var(--red)">+' + fmtPrice(c.commission) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:5px 0;font-weight:700;font-size:0.9rem">' +
      '<span>Total a pagar</span>' +
      '<span style="color:var(--accent)">' + fmtPrice(c.finalPrice) + '</span></div>' +
  '</div>';
}

// ── Start negotiation from car detail ──
function startNegotiation(carId) {
  var car = carCache[carId];
  if (!car) { toast('Error cargando vehículo', 'error'); return; }
  if (!currentUser) { showAuth(); return; }
  if (car.owner_id === currentUser.id) { toast('No podés negociar un vehículo propio', 'info'); return; }

  // Check if operation already exists
  var ops = getOperations();
  var existing = ops.find(function(o) { return o.car_id === carId && o.buyer_id === currentUser.id && o.status !== 'cancelada' && o.status !== 'completada'; });
  if (existing) {
    activeOperation = existing;
    openNegotiationModal(existing);
    return;
  }

  var rate = getCommissionRate();
  var c = calcCommission(car.precio || 0, rate);

  var op = {
    id: genId(),
    car_id: carId,
    car_name: car.marca + ' ' + car.modelo + ' ' + (car.anio || ''),
    car_img: (Array.isArray(car.images) && car.images.length) ? car.images[0] : (car.image_url || null),
    seller_id: car.owner_id,
    seller_email: car.owner_email || '',
    buyer_id: currentUser.id,
    buyer_email: currentUser.email || '',
    initial_price: car.precio || 0,
    agreed_price: null,
    current_offer: car.precio || 0,
    commission_rate: rate,
    chiaven_commission: c.commission,
    final_price: c.finalPrice,
    reservation_amount: RESERVATION_AMOUNT,
    payment_status: 'pendiente',
    status: 'negociacion',
    history: [{
      type: 'system',
      text: 'Negociación iniciada',
      price: car.precio || 0,
      ts: new Date().toISOString()
    }],
    messages: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  ops.push(op);
  saveOperations(ops);
  activeOperation = op;
  closeCarDetail();
  openNegotiationModal(op);
  addNotification('🤝', 'Negociación iniciada', car.marca + ' ' + car.modelo, 'green', 'operation:' + op.id);

  // Crear el hilo de chat inmediatamente. Así "Negociar" también aparece en Mensajes
  // aunque todavía no se haya enviado una propuesta.
  getSB().from('messages').insert(buildChatRow(op.car_id, op.buyer_id, op.seller_id, 'text', {
    to_user: op.seller_id,
    text: '🤝 Inició una negociación sobre este vehículo.',
    operation_id: op.id
  })).then(function(res) {
    if (res && res.error) console.error('No se pudo crear el hilo de chat:', res.error);
    loadMessagesPage();
  });

  // Avisar al vendedor aunque no esté dentro de la negociación.
  sendRemoteNegotiationEvent('negotiation_started', op, op.seller_id).then(function(res) {
    if (res && res.error) console.error('No se pudo notificar el inicio de negociación:', res.error);
  });
}

// ── Open negotiation modal ──
function openNegotiationModal(op) {
  activeOperation = op;
  var car = carCache[op.car_id] || {};
  var isBuyer = currentUser && op.buyer_id === currentUser.id;
  var isSeller = currentUser && op.seller_id === currentUser.id;

  var modal = document.getElementById('negotiation-modal');
  if (!modal) return;

  // Header
  var imgHTML = op.car_img ? '<img src="' + op.car_img + '" style="width:100%;height:100%;object-fit:cover">' : '🚗';
  document.getElementById('neg-car-img').innerHTML = imgHTML;
  document.getElementById('neg-car-name').textContent = op.car_name;
  document.getElementById('neg-status-badge').textContent = statusLabel(op.status);
  document.getElementById('neg-status-badge').className = 'status-badge status-' + op.status;

  // Commission block
  var rate = op.commission_rate || getCommissionRate();
  var price = op.agreed_price || op.current_offer || op.initial_price;
  var isBuyerView = op.buyer_id === (currentUser && currentUser.id);
  document.getElementById('neg-commission-block').innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">' +
      '<span style="font-size:0.82rem;color:var(--text2)">' + (isBuyerView ? 'Precio publicado' : 'Tu precio de venta') + '</span>' +
      '<span style="font-size:1.1rem;font-weight:700;color:var(--text)">' + fmtPrice(price) + '</span>' +
    '</div>' + agreedTradeInHTML(op);

  // History
  renderNegHistory(op);

  // Action area
  renderNegActions(op, isBuyer, isSeller);

  modal.classList.remove('hidden');
  modal.style.zIndex = '9200';
}

function statusLabel(s) {
  var labels = {
    'negociacion': '💬 Negociación',
    'precio_acordado': '✅ Precio acordado',
    'reserva_pendiente': '⏳ Reserva pendiente',
    'reserva_pagada': '💚 Reserva pagada',
    'en_proceso': '🔄 En proceso',
    'completada': '🎉 Completada',
    'cancelada': '❌ Cancelada'
  };
  return labels[s] || s;
}

function renderNegHistory(op) {
  var histEl = document.getElementById('neg-history');
  if (!histEl) return;
  var history = op.history || [];
  var msgs = op.messages || [];
  var all = history.concat(msgs).sort(function(a,b){ return new Date(a.ts) - new Date(b.ts); });

  histEl.innerHTML = all.map(function(item) {
    var isMe = currentUser && item.sender_id === currentUser.id;
    var isSystem = item.type === 'system';
    var isProposal = item.type === 'proposal';
    var isAccepted = item.type === 'accepted';

    if (isSystem) {
      return '<div style="text-align:center;padding:8px 0"><span style="background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:4px 14px;font-size:0.74rem;color:var(--text3)">' + item.text + '</span></div>';
    }
    if (isProposal) {
      var isBuyer = op.buyer_id === (currentUser && currentUser.id);
      var displayPrice = isBuyer ? (item.buyerPrice || item.finalPrice || item.price) : item.price;
      var displayLabel = isBuyer ? 'Precio total que pagás' : 'Precio que recibís';
      var labelSender = isMe ? (isBuyer ? 'Tu oferta' : 'Tu contraoferta') : (isBuyer ? 'Contraoferta del vendedor' : 'Oferta del comprador');
      return '<div style="margin:8px 0"><div style="background:' + (isMe ? 'var(--accent-light)' : 'var(--bg)') + ';border:1px solid var(--border);border-radius:var(--radius);padding:14px;max-width:85%;' + (isMe?'margin-left:auto':'') + '">' +
        '<div style="font-size:0.72rem;font-weight:600;color:var(--text3);margin-bottom:8px">' + labelSender + ' · ' + new Date(item.ts).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) + '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">' +
          '<span style="color:var(--text2);font-size:0.84rem">' + displayLabel + '</span>' +
          '<span style="font-weight:700;font-size:1.1rem;color:var(--accent)">' + fmtPrice(displayPrice) + '</span>' +
        '</div>' +
        tradeInSummaryHTML(item) +
        (item.note ? '<div style="font-size:0.8rem;color:var(--text2);margin-top:8px;font-style:italic;border-top:1px solid var(--border);padding-top:8px">"' + esc(item.note) + '"</div>' : '') +
        '</div></div>';
    }
    if (isAccepted) {
      return '<div style="text-align:center;padding:12px"><div style="display:inline-block;background:var(--green-light);border:2px solid var(--green);border-radius:var(--radius);padding:12px 24px;text-align:left"><div style="color:var(--green);font-weight:700;font-size:0.95rem;text-align:center">✅ Precio acordado</div><div style="font-size:0.82rem;color:var(--text2);margin-top:4px;text-align:center">' + fmtPrice(item.price) + ' + ' + fmtPrice(item.commission) + ' comisión = ' + fmtPrice(item.finalPrice) + '</div>' + tradeInSummaryHTML(item) + '</div></div>';
    }
    // Regular message
    return '<div style="display:flex;flex-direction:column;' + (isMe?'align-items:flex-end':'align-items:flex-start') + ';margin:6px 0">' +
      '<div style="background:' + (isMe?'var(--accent)':'#fff') + ';color:' + (isMe?'#fff':'var(--text)') + ';border:1px solid var(--border);border-radius:12px;padding:10px 14px;max-width:75%;font-size:0.85rem">' + esc(item.text) + '</div>' +
      '<div style="font-size:0.65rem;color:var(--text3);margin-top:3px">' + new Date(item.ts).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) + '</div></div>';
  }).join('');
  setTimeout(function(){ histEl.scrollTop = histEl.scrollHeight; }, 80);
}

function renderNegActions(op, isBuyer, isSeller) {
  var actEl = document.getElementById('neg-actions');
  if (!actEl) return;

  if (op.status === 'negociacion') {
    var lastProposal = (op.history || []).filter(function(h){ return h.type==='proposal'; });
    var lastP = lastProposal.length ? lastProposal[lastProposal.length-1] : null;
    var canAccept = lastP && lastP.sender_id !== (currentUser && currentUser.id);

    actEl.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
        (canAccept ? '<button type="button" class="btn-sm primary" onclick="acceptProposal()" style="flex:1;padding:10px">✅ Aceptar propuesta</button>' : '') +
        '<button type="button" class="btn-sm" onclick="showMakeProposal()" style="flex:1;padding:10px">💰 Hacer propuesta</button>' +
      '</div>' +
      '<div id="make-proposal-form" style="display:none;background:var(--bg);border-radius:var(--radius);padding:14px;margin-bottom:10px">' +
        '<div id="proposal-price-wrap">' +
          '<div style="font-size:0.78rem;color:var(--text2);margin-bottom:8px">' + (isBuyer ? 'Tu oferta (precio total que vas a pagar):' : 'Tu contraoferta (precio total que paga el comprador):') + '</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:8px">' +
            '<input type="number" id="proposal-price" class="form-input" placeholder="Ej: 18500000" style="flex:1" oninput="previewProposal()">' +
          '</div>' +
        '</div>' +
        '<div id="proposal-trade-rows"></div>' +
        '<button type="button" class="btn-sm" onclick="addTradeInRow()" style="width:100%;margin-bottom:8px">🚗 Agregar auto en parte de pago</button>' +
        '<div id="proposal-cash-block" style="display:none;margin-bottom:8px">' +
          '<div style="font-size:0.78rem;color:var(--text2);margin-bottom:6px">Diferencia en dinero:</div>' +
          '<div style="display:flex;gap:8px">' +
            '<select id="proposal-cash-dir" class="form-select" style="flex:1" onchange="previewProposal()"><option value="comprador_agrega">El comprador agrega</option><option value="vendedor_devuelve">La agencia vendedora devuelve</option></select>' +
            '<input type="number" id="proposal-cash" class="form-input" min="0" placeholder="$ 0 = permuta pura" style="flex:1" oninput="previewProposal()">' +
          '</div>' +
        '</div>' +
        '<div id="proposal-preview" style="margin-bottom:10px"></div>' +
        '<input type="text" id="proposal-note" class="form-input" placeholder="Nota opcional..." style="margin-bottom:8px">' +
        '<button type="button" class="btn-sm primary" onclick="sendProposal()" style="width:100%">Enviar propuesta</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<input type="text" id="neg-msg-input" class="chat-input" placeholder="Mensaje..." style="flex:1">' +
        '<button type="button" class="chat-send-btn" onclick="sendNegMessage()">Enviar</button>' +
      '</div>';

  } else if (op.status === 'precio_acordado') {
    actEl.innerHTML =
      '<div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--radius);padding:16px;margin-bottom:12px;text-align:center">' +
        '<div style="font-weight:700;color:var(--green);margin-bottom:4px">✅ Precio acordado</div>' +
        '<div style="font-size:0.82rem;color:var(--text2)">Reservá el vehículo para continuar</div>' +
      '</div>' +
      (isBuyer ? '<button type="button" class="form-submit" onclick="showReservationModal()" style="width:100%">📋 Reservar vehículo</button>' : '<div style="text-align:center;color:var(--text3);font-size:0.84rem">Esperando que el comprador realice la reserva</div>');

  } else if (op.status === 'reserva_pendiente') {
    actEl.innerHTML =
      '<div style="background:var(--amber-light);border:1px solid var(--amber);border-radius:var(--radius);padding:16px;text-align:center">' +
        '<div style="font-weight:700;color:var(--amber);margin-bottom:4px">⏳ Reserva pendiente de pago</div>' +
        '<div style="font-size:0.82rem;color:var(--text2);margin-bottom:12px">Pagá la seña para confirmar el vehículo</div>' +
        (isBuyer ? '<button type="button" class="form-submit" onclick="showReservationModal()" style="width:100%">💳 Pagar reserva</button>' : '<div style="color:var(--text3);font-size:0.84rem">El comprador debe pagar la reserva</div>') +
      '</div>';

  } else if (op.status === 'reserva_pagada') {
    actEl.innerHTML =
      '<div style="background:var(--green-light);border:2px solid var(--green);border-radius:var(--radius);padding:16px;text-align:center">' +
        '<div style="font-size:1.2rem;margin-bottom:8px">💳</div>' +
        '<div style="font-weight:700;color:var(--green);margin-bottom:4px">Reserva informada</div>' +
        '<div style="font-size:0.82rem;color:var(--text2);margin-bottom:12px">' +
          (isSeller ? 'El comprador informó el pago de la seña. Verificá el ingreso y luego confirmá la venta.' : 'La agencia debe verificar la seña y confirmar la operación. Después podrán coordinar documentación, saldo y entrega.') +
        '</div>' +
        (isSeller ? '<button type="button" class="form-submit" onclick="openPostReservationPanel(activeOperation)" style="width:100%">⚙️ Gestionar operación</button>' : '<button type="button" class="btn-sm primary" onclick="openPostReservationPanel(activeOperation)" style="width:100%;padding:10px">⚙️ Gestionar operación</button>') +
      '</div>';
  } else if (op.status === 'completada') {
    actEl.innerHTML =
      '<div style="background:var(--green-light);border:2px solid var(--green);border-radius:var(--radius);padding:16px;text-align:center">' +
        '<div style="font-size:1.2rem;margin-bottom:8px">🎉</div>' +
        '<div style="font-weight:700;color:var(--green);margin-bottom:4px">¡Venta completada!</div>' +
        '<div style="font-size:0.82rem;color:var(--text2)">La operación quedó registrada. Coordiná documentación, saldo y entrega con la agencia.</div>' +
      '</div>';
  }
}

function showMakeProposal() {
  var form = document.getElementById('make-proposal-form');
  if (!form) return;
  var opening = form.style.display === 'none';
  form.style.display = opening ? 'block' : 'none';
  if (opening) { prefillProposalForm(); loadTradeInCandidates(); }
}

// ── Permuta: autos en parte de pago dentro de la propuesta ──
// Una propuesta puede traer trade_ins (autos que entrega el comprador), cash_amount y
// cash_direction ('comprador_agrega' | 'vendedor_devuelve'). El valor total ofrecido es
// la suma de los autos más/menos el dinero, y la comisión se calcula sobre ese total.
function proposalTradeIns(p) { return (p && Array.isArray(p.trade_ins)) ? p.trade_ins : []; }

function tradeInLabel(t) {
  return [t.marca, t.modelo, t.anio].filter(Boolean).join(' ') + (t.km ? ' · ' + fmtKm(t.km) : '');
}

function tradeInCashLine(p) {
  var cash = Number(p.cash_amount || 0);
  if (!cash) return 'Sin diferencia en dinero (permuta pura)';
  return (p.cash_direction === 'vendedor_devuelve' ? 'La agencia devuelve ' : 'El comprador agrega ') + fmtPrice(cash);
}

// Texto corto para notificaciones y vista previa de chats
function tradeInSummaryText(p) {
  var list = proposalTradeIns(p);
  if (!list.length) return '';
  var cash = Number(p.cash_amount || 0);
  return '🚗 ' + list.map(function(t) { return [t.marca, t.modelo, t.anio].filter(Boolean).join(' '); }).join(' + ') +
    (cash ? (p.cash_direction === 'vendedor_devuelve' ? ' − ' : ' + ') + fmtPrice(cash) : '');
}

// Bloque legible con los autos ofrecidos y el dinero
function tradeInSummaryHTML(p) {
  var list = proposalTradeIns(p);
  if (!list.length) return '';
  return '<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;font-size:0.78rem">' +
    '<div style="font-weight:600;color:var(--text2);margin-bottom:4px">🚗 Autos en parte de pago</div>' +
    list.map(function(t) {
      var thumb = t.image ? '<img src="' + esc(t.image) + '" alt="" style="width:46px;height:34px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex:none">' : '';
      var link = t.car_id ? ' <a href="#" onclick="openTradeInCar(\'' + esc(String(t.car_id)) + '\');return false" style="color:var(--accent);white-space:nowrap">Ver ficha</a>' : '';
      return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:3px 0"><span style="display:flex;align-items:center;gap:8px">' + thumb + '<span>' + esc(tradeInLabel(t)) + (t.detalle ? ' <span style="color:var(--text3)">(' + esc(t.detalle) + ')</span>' : '') + link + '</span></span><strong style="white-space:nowrap">' + fmtPrice(t.valor || 0) + '</strong></div>';
    }).join('') +
    '<div style="padding:4px 0 0;color:var(--text2)">💵 ' + tradeInCashLine(p) + '</div>' +
  '</div>';
}

// Resumen de la permuta acordada, para la operación (vacío en operaciones sin permuta)
function agreedTradeInHTML(op) {
  if (!op || !Array.isArray(op.agreed_trade_ins) || !op.agreed_trade_ins.length) return '';
  return '<div style="background:var(--green-light);border:1px solid var(--green);border-radius:var(--radius);padding:4px 12px 10px;margin:6px 0">' +
    tradeInSummaryHTML({ trade_ins: op.agreed_trade_ins, cash_amount: op.agreed_cash_amount, cash_direction: op.agreed_cash_direction }).replace('Autos en parte de pago', 'Permuta acordada') +
  '</div>';
}

function tradeInYearOptions(selected) {
  var html = '<option value="">Año</option>';
  for (var y = new Date().getFullYear(); y >= 1980; y--) html += '<option' + (String(y) === String(selected) ? ' selected' : '') + '>' + y + '</option>';
  return html;
}

function tradeInModelOptions(marca, selected) {
  var modelos = (CATALOGO_VEHICULOS[marca] || []).slice();
  if (selected && modelos.indexOf(selected) === -1) modelos.unshift(selected);
  return catalogoOption('', marca ? 'Modelo' : 'Elegí marca', !selected) + modelos.map(function(m) { return catalogoOption(m, m, m === selected); }).join('');
}

// Abre la ficha de un auto publicado que se ofreció en permuta (lo busca si no está en memoria)
function openTradeInCar(carId) {
  function show() {
    openCarDetailById(null, carId);
    // Por encima de la negociación y del panel de la operación
    document.getElementById('car-detail-modal').style.zIndex = '13000';
  }
  if (carCache[carId]) { show(); return; }
  getSB().from('cars').select('*').eq('id', carId).single().then(function(r) {
    if (!r || !r.data) { toast('Ese auto ya no está publicado', 'info'); return; }
    carCache[carId] = r.data;
    show();
  });
}

// Autos publicados por el comprador (los autos de la permuta siempre son suyos, proponga quien proponga)
var tradeInCandidates = { opId: null, cars: [] };
function loadTradeInCandidates() {
  var op = activeOperation;
  if (!op) return;
  if (tradeInCandidates.opId === op.id) { refreshTradeInSourceOptions(); return; }
  tradeInCandidates = { opId: op.id, cars: [] };
  getSB().from('cars').select('*').eq('owner_id', op.buyer_id).then(function(r) {
    if (!r || r.error || tradeInCandidates.opId !== op.id) return;
    tradeInCandidates.cars = availableCars(r.data).filter(function(c) { return String(c.id) !== String(op.car_id); });
    tradeInCandidates.cars.forEach(function(c) { carCache[c.id] = c; });
    refreshTradeInSourceOptions();
  });
}

function tradeInCarImage(c) {
  return (Array.isArray(c.images) && c.images.length) ? c.images[0] : (c.image_url || null);
}

// Rearma los selectores "De mis publicados": un auto ya elegido en otra fila queda deshabilitado
function refreshTradeInSourceOptions() {
  var rows = document.querySelectorAll('#proposal-trade-rows .trade-row');
  var taken = {};
  rows.forEach(function(row) { if (row.dataset.carId) taken[row.dataset.carId] = true; });
  var isBuyer = currentUser && activeOperation && activeOperation.buyer_id === currentUser.id;
  rows.forEach(function(row) {
    var sel = row.querySelector('.tr-source');
    var own = row.dataset.carId || '';
    var cars = tradeInCandidates.cars;
    sel.parentNode.style.display = (cars.length || own) ? '' : 'none';
    sel.innerHTML = '<option value="">✏️ Cargar otro auto a mano</option>' +
      (cars.length ? '<optgroup label="' + (isBuyer ? 'De mis publicados' : 'Publicados por el comprador') + '">' + cars.map(function(c) {
        var id = String(c.id);
        return '<option value="' + escapeAttr(id) + '"' + (id === own ? ' selected' : '') + (taken[id] && id !== own ? ' disabled' : '') + '>' +
          escapeAttr([c.marca, c.modelo, c.version, c.anio].filter(Boolean).join(' ') + ' · ' + fmtKm(c.km || 0) + ' · ' + fmtPrice(c.precio || 0)) + '</option>';
      }).join('') + '</optgroup>' : '');
  });
}

function onTradeInSourceChange(sel) {
  var row = sel.closest('.trade-row');
  var c = tradeInCandidates.cars.find(function(x) { return String(x.id) === sel.value; });
  if (!c) {
    delete row.dataset.carId; delete row.dataset.image;
  } else {
    row.dataset.carId = String(c.id);
    if (tradeInCarImage(c)) row.dataset.image = tradeInCarImage(c); else delete row.dataset.image;
    var marca = row.querySelector('.tr-marca');
    if (!marca.querySelector('option[value="' + String(c.marca || '').replace(/"/g, '\\"') + '"]')) marca.appendChild(new Option(c.marca, c.marca));
    marca.value = c.marca || '';
    row.querySelector('.tr-modelo').innerHTML = tradeInModelOptions(c.marca || '', c.modelo || '');
    var anio = row.querySelector('.tr-anio');
    if (c.anio && !anio.querySelector('option[value="' + c.anio + '"]')) anio.appendChild(new Option(c.anio, c.anio));
    anio.value = c.anio || '';
    row.querySelector('.tr-km').value = c.km || '';
    row.querySelector('.tr-valor').value = c.precio || '';
    row.querySelector('.tr-detalle').value = [c.version, c.color].filter(Boolean).join(' · ');
  }
  refreshTradeInSourceOptions();
  previewProposal();
}

function addTradeInRow(t) {
  var wrap = document.getElementById('proposal-trade-rows');
  if (!wrap) return;
  t = t || {};
  var marcas = Object.keys(CATALOGO_VEHICULOS).sort(function(a, b) { return a.localeCompare(b, 'es'); });
  if (t.marca && marcas.indexOf(t.marca) === -1) marcas.unshift(t.marca);
  var row = document.createElement('div');
  row.className = 'trade-row';
  row.style.cssText = 'border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;background:#fff';
  row.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:0.74rem;font-weight:600;color:var(--text2)">🚗 Auto en parte de pago</span>' +
      '<button type="button" class="btn-sm danger" onclick="this.closest(\'.trade-row\').remove();refreshTradeInSourceOptions();previewProposal()" style="padding:3px 8px">Quitar</button></div>' +
    '<div style="margin-bottom:6px"><select class="form-select tr-source" style="width:100%" onchange="onTradeInSourceChange(this)"></select></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">' +
      '<select class="form-select tr-marca" onchange="this.closest(\'.trade-row\').querySelector(\'.tr-modelo\').innerHTML=tradeInModelOptions(this.value);previewProposal()">' +
        catalogoOption('', 'Marca', !t.marca) + marcas.map(function(m) { return catalogoOption(m, m, m === t.marca); }).join('') + '</select>' +
      '<select class="form-select tr-modelo" onchange="previewProposal()">' + tradeInModelOptions(t.marca || '', t.modelo || '') + '</select>' +
      '<select class="form-select tr-anio" onchange="previewProposal()">' + tradeInYearOptions(t.anio) + '</select>' +
      '<input type="number" class="form-input tr-km" min="0" placeholder="Km" value="' + (t.km || '') + '">' +
      '<input type="number" class="form-input tr-valor" min="0" placeholder="Valor de toma ($)" value="' + (t.valor || '') + '" oninput="previewProposal()" style="grid-column:1/-1">' +
      '<input type="text" class="form-input tr-detalle" placeholder="Detalle opcional (estado, versión...)" value="' + escapeAttr(t.detalle || '') + '" style="grid-column:1/-1">' +
    '</div>';
  if (t.car_id) row.dataset.carId = String(t.car_id);
  if (t.image) row.dataset.image = t.image;
  wrap.appendChild(row);
  refreshTradeInSourceOptions();
  previewProposal();
}

function readTradeInRows() {
  return Array.prototype.map.call(document.querySelectorAll('#proposal-trade-rows .trade-row'), function(row) {
    function v(cls) { var el = row.querySelector(cls); return el ? el.value.trim() : ''; }
    var t = { marca: v('.tr-marca'), modelo: v('.tr-modelo'), anio: parseInt(v('.tr-anio'), 10) || null, km: parseInt(v('.tr-km'), 10) || 0, valor: parseFloat(v('.tr-valor')) || 0, detalle: v('.tr-detalle') };
    if (row.dataset.carId) t.car_id = row.dataset.carId;
    if (row.dataset.image) t.image = row.dataset.image;
    return t;
  });
}

// Lee el formulario y devuelve el valor total ofrecido (lo que paga el comprador, comisión incluida)
function readProposalForm() {
  var trade = readTradeInRows();
  var res = { trade_ins: trade, buyerPrice: 0 };
  if (!trade.length) {
    res.buyerPrice = parseFloat(document.getElementById('proposal-price').value) || 0;
    return res;
  }
  res.cash_amount = Math.max(0, parseFloat(document.getElementById('proposal-cash').value) || 0);
  res.cash_direction = document.getElementById('proposal-cash-dir').value;
  res.trade_total = trade.reduce(function(s, t) { return s + t.valor; }, 0);
  res.buyerPrice = res.trade_total + (res.cash_direction === 'vendedor_devuelve' ? -res.cash_amount : res.cash_amount);
  return res;
}

// Precarga el formulario con la última propuesta, para contraofertar ajustando valores
function prefillProposalForm() {
  if (!activeOperation) return;
  var last = (activeOperation.history || []).filter(function(h) { return h.type === 'proposal'; }).pop();
  var wrap = document.getElementById('proposal-trade-rows');
  if (!wrap || wrap.children.length || !last) { previewProposal(); return; }
  var trade = proposalTradeIns(last);
  if (trade.length) {
    trade.forEach(function(t) { addTradeInRow(t); });
    document.getElementById('proposal-cash-dir').value = last.cash_direction || 'comprador_agrega';
    document.getElementById('proposal-cash').value = last.cash_amount || '';
  } else {
    document.getElementById('proposal-price').value = last.buyerPrice || last.finalPrice || last.price || '';
  }
  previewProposal();
}

function previewProposal() {
  var prev = document.getElementById('proposal-preview');
  if (!prev) return;
  var f = readProposalForm();
  var hasTrade = f.trade_ins.length > 0;
  document.getElementById('proposal-price-wrap').style.display = hasTrade ? 'none' : '';
  document.getElementById('proposal-cash-block').style.display = hasTrade ? 'block' : 'none';
  var price = f.buyerPrice;
  if ((price > 0 || hasTrade) && activeOperation) {
    var rate = activeOperation.commission_rate || getCommissionRate();
    var sellerReceives = Math.round(price / (1 + rate));
    var commission = price - sellerReceives;
    var rows = '';
    if (hasTrade) {
      rows += '<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--text2)">Autos entregados (' + f.trade_ins.length + ')</span><span style="font-weight:600">' + fmtPrice(f.trade_total) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--text2)">' + (f.cash_direction === 'vendedor_devuelve' ? 'Devuelve la agencia' : 'Agrega el comprador') + '</span><span style="font-weight:600">' + (f.cash_direction === 'vendedor_devuelve' ? '−' : '+') + fmtPrice(f.cash_amount) + '</span></div>';
    }
    prev.innerHTML = '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;font-size:0.84rem">' + rows +
      '<div style="display:flex;justify-content:space-between;padding:4px 0' + (hasTrade ? ';border-top:1px solid var(--border)' : '') + '"><span style="color:var(--text2)">' + (hasTrade ? 'Valor total ofrecido' : 'Tu oferta (pagas)') + '</span><span style="font-weight:700;color:' + (price > 0 ? 'var(--accent)' : 'var(--red)') + '">' + fmtPrice(price) + '</span></div>' +
      (price > 0 ? '<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:var(--text3);font-size:0.76rem">Comisión Chiaven incluida</span><span style="font-size:0.76rem;color:var(--text3)">-' + fmtPrice(commission) + '</span></div>' : '<div style="font-size:0.74rem;color:var(--red)">El valor total tiene que ser mayor a 0.</div>') +
      '</div>';
  } else {
    prev.innerHTML = '';
  }
}

function sendProposal() {
  var form = readProposalForm();
  var buyerPrice = form.buyerPrice;
  var note = document.getElementById('proposal-note').value.trim();
  var badRow = form.trade_ins.find(function(t) { return !t.marca || !t.modelo || !t.anio || !(t.valor > 0); });
  if (badRow) { toast('Completá marca, modelo, año y valor de toma de cada auto', 'error'); return; }
  var seenCars = {};
  var dupCar = form.trade_ins.find(function(t) {
    if (!t.car_id) return false;
    if (activeOperation && String(t.car_id) === String(activeOperation.car_id)) return true;
    if (seenCars[t.car_id]) return true;
    seenCars[t.car_id] = true;
    return false;
  });
  if (dupCar) { toast('No podés ofrecer dos veces el mismo auto publicado, ni el auto que se está negociando', 'error'); return; }
  if (!buyerPrice || buyerPrice <= 0) { toast(form.trade_ins.length ? 'El valor total ofrecido tiene que ser mayor a 0' : 'Ingresá un precio válido', 'error'); return; }
  if (!activeOperation) return;
  var rate = activeOperation.commission_rate || getCommissionRate();
  // Buyer enters total they pay; seller sees what they receive
  var sellerReceives = Math.round(buyerPrice / (1 + rate));
  var commission = buyerPrice - sellerReceives;
  var proposal = {
    type: 'proposal',
    sender_id: currentUser.id,
    price: sellerReceives,      // what seller receives
    buyerPrice: buyerPrice,     // what buyer pays (total)
    commission: commission,
    finalPrice: buyerPrice,
    note: note,
    ts: new Date().toISOString()
  };
  if (form.trade_ins.length) {
    proposal.trade_ins = form.trade_ins;
    proposal.cash_amount = form.cash_amount;
    proposal.cash_direction = form.cash_direction;
  }
  activeOperation.history = activeOperation.history || [];
  activeOperation.history.push(proposal);
  // La oferta pasa a ser el último precio negociado.
  activeOperation.current_offer = sellerReceives;
  activeOperation.chiaven_commission = commission;
  activeOperation.final_price = buyerPrice;
  activeOperation.updated_at = new Date().toISOString();
  updateOperation(activeOperation);

  // Persistir el evento en Supabase para que el otro usuario lo reciba.
  var recipientId = activeOperation.buyer_id === currentUser.id
    ? activeOperation.seller_id
    : activeOperation.buyer_id;
  getSB().from('messages').insert(buildChatRow(activeOperation.car_id,
    activeOperation.buyer_id, activeOperation.seller_id, 'proposal', {
      to_user: recipientId,
      operation_id: activeOperation.id,
      proposal: {
        price: sellerReceives,
        buyerPrice: buyerPrice,
        commission: commission,
        finalPrice: buyerPrice,
        note: note,
        trade_ins: proposal.trade_ins,
        cash_amount: proposal.cash_amount,
        cash_direction: proposal.cash_direction
      }
    })).then(function(chatRes) {
      if (chatRes && chatRes.error) console.error('Error guardando propuesta en chat:', chatRes.error);
    });

  sendRemoteNegotiationEvent('proposal', activeOperation, recipientId).then(function(res) {
    if (res && res.error) {
      toast('La propuesta quedó guardada, pero no se pudo notificar al otro usuario', 'error');
    }
  });

  document.getElementById('proposal-price').value = '';
  document.getElementById('proposal-note').value = '';
  document.getElementById('proposal-trade-rows').innerHTML = '';
  document.getElementById('make-proposal-form').style.display = 'none';
  openNegotiationModal(activeOperation);
  toast('Propuesta enviada', 'success');
}

function acceptProposal() {
  if (!activeOperation) return;
  var lastP = (activeOperation.history||[]).filter(function(h){return h.type==='proposal';});
  var last = lastP.length ? lastP[lastP.length-1] : null;
  if (!last) return;
  var c = calcCommission(last.price, activeOperation.commission_rate);
  activeOperation.agreed_price = last.price;
  activeOperation.chiaven_commission = c.commission;
  activeOperation.final_price = c.finalPrice;
  activeOperation.status = 'precio_acordado';
  var acceptedTrade = proposalTradeIns(last);
  activeOperation.agreed_trade_ins = acceptedTrade.length ? acceptedTrade : null;
  activeOperation.agreed_cash_amount = acceptedTrade.length ? Number(last.cash_amount || 0) : null;
  activeOperation.agreed_cash_direction = acceptedTrade.length ? (last.cash_direction || 'comprador_agrega') : null;
  var acceptedItem = {
    type: 'accepted',
    price: last.price,
    commission: c.commission,
    finalPrice: c.finalPrice,
    ts: new Date().toISOString()
  };
  if (acceptedTrade.length) {
    acceptedItem.trade_ins = acceptedTrade;
    acceptedItem.cash_amount = activeOperation.agreed_cash_amount;
    acceptedItem.cash_direction = activeOperation.agreed_cash_direction;
  }
  activeOperation.history.push(acceptedItem);
  activeOperation.updated_at = new Date().toISOString();
  updateOperation(activeOperation);

  var recipientId = activeOperation.buyer_id === currentUser.id
    ? activeOperation.seller_id : activeOperation.buyer_id;
  getSB().from('messages').insert(buildChatRow(activeOperation.car_id,
    activeOperation.buyer_id, activeOperation.seller_id, 'text', {
      to_user: recipientId,
      text: '✅ Precio acordado: ' + fmtPrice(last.price) + '.' + (acceptedTrade.length ? ' Incluye permuta: ' + tradeInSummaryText(last) + '.' : ''),
      operation_id: activeOperation.id
    })).then(function(res) {
      if (res && res.error) console.error('No se pudo registrar la aceptación en el chat:', res.error);
      loadMessagesPage();
    });
  sendRemoteNegotiationEvent('proposal_accepted', activeOperation, recipientId);

  openNegotiationModal(activeOperation);
  toast('✅ ¡Precio acordado! Podés proceder con la reserva.', 'success');
  addNotification('✅', 'Precio acordado', activeOperation.car_name + ' — ' + fmtPrice(last.price), 'green', null);
}

function sendNegMessage() {
  var input = document.getElementById('neg-msg-input');
  var text = (input ? input.value : '').trim();
  if (!text || !activeOperation || !currentUser) return;
  input.value = '';

  var recipientId = activeOperation.buyer_id === currentUser.id
    ? activeOperation.seller_id : activeOperation.buyer_id;

  activeOperation.messages = activeOperation.messages || [];
  activeOperation.messages.push({
    type: 'message',
    sender_id: currentUser.id,
    text: text,
    ts: new Date().toISOString()
  });
  activeOperation.updated_at = new Date().toISOString();
  updateOperation(activeOperation);
  openNegotiationModal(activeOperation);

  getSB().from('messages').insert(buildChatRow(activeOperation.car_id,
    activeOperation.buyer_id, activeOperation.seller_id, 'text', {
      to_user: recipientId,
      text: text
    })).then(function(res) {
      if (res && res.error) {
        console.error('Error guardando mensaje de negociación:', res.error);
        toast('No se pudo enviar el mensaje', 'error');
      }
      loadMessagesPage();
    });
}

function updateOperation(op) {
  var ops = getOperations();
  var idx = ops.findIndex(function(o){ return o.id === op.id; });
  if (idx >= 0) ops[idx] = op; else ops.push(op);
  saveOperations(ops);
}

function sendRemoteNegotiationEvent(eventType, op, recipientId) {
  if (!currentUser || !recipientId || recipientId === currentUser.id || !op) {
    return Promise.resolve({ error: null });
  }
  var payload = {
    event: eventType,
    operation: op,
    sent_at: new Date().toISOString()
  };
  return new Promise(function(resolve) {
    getSB().from('messages').insert({
      from_user: currentUser.id,
      to_user: recipientId,
      car_id: op.car_id,
      message: REMOTE_EVENT_PREFIX + JSON.stringify(payload)
    }).then(function(res) {
      if (res && res.error) {
        console.error('Error sincronizando negociación:', res.error);
        resolve(res);
      } else {
        resolve({ data: res ? res.data : null, error: null });
      }
    }).catch(function(err) {
      console.error('Error sincronizando negociación:', err);
      resolve({ data: null, error: { message: err.message || String(err) } });
    });
  });
}

function syncRemoteNegotiations() {
  if (!currentUser || !currentUser.id) return;

  try {
    loadOperations().then(function() { loadMyOperations(); return getSB().from('messages').select('*')
    .eq('to_user', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(100); })
    .then(function(res) {
      if (res && res.error) {
        console.error('Error leyendo eventos de negociación:', res.error);
        return;
      }

      var rows = res.data || [];
      var processed = {};
      try { processed = JSON.parse(localStorage.getItem('chiaven_remote_events_' + currentUser.id) || '{}'); } catch(e) {}

      var changed = false;
      rows.forEach(function(row) {
        var raw = row.message || '';
        if (processed[row.id]) return;

        // Mensaje de chat normal: también genera aviso para el receptor.
        if (raw.indexOf(REMOTE_EVENT_PREFIX) !== 0) {
          if (row.from_user && row.from_user !== currentUser.id) {
            var chatCar = carCache[row.car_id] || {};
            var chatLabel = ((chatCar.marca || '') + ' ' + (chatCar.modelo || '')).trim() || 'Vehículo';
            addNotification('💬', 'Nuevo mensaje', chatLabel, 'green', 'messages');
          }
          processed[row.id] = true;
          changed = true;
          return;
        }

        var payload;
        try {
          payload = JSON.parse(raw.slice(REMOTE_EVENT_PREFIX.length));
        } catch(e) {
          processed[row.id] = true;
          changed = true;
          return;
        }

        var op = payload.operation;
        if (!op || !op.id) {
          processed[row.id] = true;
          changed = true;
          return;
        }

        // Solo procesamos eventos dirigidos a esta cuenta.
        if (op.buyer_id !== currentUser.id && op.seller_id !== currentUser.id) {
          processed[row.id] = true;
          changed = true;
          return;
        }

        // La versión válida es la de la base, no la que viene dentro del mensaje.
        var stored = operationsCache.find(function(o) { return o.id === op.id; });
        if (stored) op = cloneOp(stored);

        // Si la operación está abierta en pantalla, actualizamos el panel
        // inmediatamente para que el siguiente paso aparezca sin recargar.
        if (activeOperation && activeOperation.id === op.id) {
          activeOperation = op;
          if (payload.event === 'workflow_updated') {
            var workflowModal = document.getElementById('post-reservation-modal');
            if (workflowModal) openPostReservationPanel(op);
          }
        }

        var lastProposal = (op.history || []).filter(function(h) { return h.type === 'proposal'; }).pop();
        var senderIsBuyer = row.from_user === op.buyer_id;
        var carLabel = op.car_name || 'Vehículo';
        var action = 'operation:' + op.id;

        if (payload.event === 'proposal' && lastProposal) {
          var shownPrice = lastProposal.buyerPrice || lastProposal.finalPrice || lastProposal.price;
          var title = senderIsBuyer ? '💰 Nueva oferta de comprador' : '↩️ Nueva contraoferta';
          addNotification(title.split(' ')[0], title.substring(title.indexOf(' ') + 1), carLabel + ' · ' + fmtPrice(shownPrice) + (proposalTradeIns(lastProposal).length ? ' · ' + tradeInSummaryText(lastProposal) : ''), 'green', action);
        } else if (payload.event === 'negotiation_started') {
          addNotification('🤝', 'Nueva negociación', carLabel, 'green', action);
        } else if (payload.event === 'proposal_accepted') {
          addNotification('✅', 'Propuesta aceptada', carLabel, 'green', action);
        } else if (payload.event === 'reservation_paid') {
          addNotification('💳', 'Reserva confirmada', carLabel + ' · El comprador informó el pago de la seña.', 'green', action);
        } else if (payload.event === 'workflow_updated') {
          addNotification('📋', 'Actualización de operación', carLabel, 'green', action);
        } else if (payload.event === 'sale_completed') {
          addNotification('🎉', 'Venta completada', carLabel, 'green', action);
        }

        processed[row.id] = true;
        changed = true;
      });

      if (changed) {
        // Conservamos una ventana acotada para no llenar localStorage.
        var keys = Object.keys(processed);
        if (keys.length > 500) {
          keys.sort(function(a,b) { return Number(a) - Number(b); });
          keys.slice(0, keys.length - 500).forEach(function(k) { delete processed[k]; });
        }
        localStorage.setItem('chiaven_remote_events_' + currentUser.id, JSON.stringify(processed));
        loadMyOperations();
      }
    })
    .catch(function(err) {
      console.error('Error sincronizando notificaciones de negociación:', err);
    });
  } catch (err) {
    console.error('Error iniciando sincronización de notificaciones:', err);
  }
}

// ── RESERVATION ──
function showReservationModal() {
  if (!activeOperation) return;
  var op = activeOperation;
  var price = op.agreed_price || op.current_offer || op.initial_price;
  var c = calcCommission(price, op.commission_rate);
  var saldo = c.finalPrice - op.reservation_amount;

  var el = document.getElementById('reservation-modal');
  if (!el) return;

  document.getElementById('res-car-name').textContent = op.car_name;
  document.getElementById('res-summary').innerHTML =
    commissionBlockHTML(price, op.commission_rate) +
    '<div style="background:var(--accent-light);border:1px solid var(--accent-light2);border-radius:var(--radius);padding:14px;margin-top:12px;font-size:0.84rem">' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">' +
        '<span style="color:var(--text2)">Seña / Reserva</span>' +
        '<span style="font-weight:700;color:var(--accent)">-' + fmtPrice(op.reservation_amount) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:700">' +
        '<span>Saldo a pagar al retirar</span>' +
        '<span>' + fmtPrice(saldo) + '</span></div>' +
    '</div>';

  // CBU/transfer info for Chiaven commission
  document.getElementById('res-chiaven-info').innerHTML =
    '<div style="background:var(--amber-light);border:1px solid #fde68a;border-radius:var(--radius);padding:14px;font-size:0.82rem">' +
      '<div style="font-weight:600;color:var(--amber);margin-bottom:8px">💳 Pago de seña + comisión Chiaven</div>' +
      '<div style="color:var(--text2);margin-bottom:10px">Transferí <strong>' + fmtPrice(op.reservation_amount) + '</strong> a Chiaven como seña. La comisión de <strong>' + fmtPrice(c.commission) + '</strong> se descuenta del saldo final.</div>' +
      '<div style="background:#fff;border-radius:8px;padding:12px;font-family:monospace;font-size:0.82rem">' +
        '<div style="margin-bottom:6px"><span style="color:var(--text3)">CBU:</span> <strong>' + CHIAVEN_CBU + '</strong></div>' +
        '<div style="margin-bottom:6px"><span style="color:var(--text3)">Alias:</span> <strong>' + CHIAVEN_ALIAS + '</strong></div>' +
        '<div><span style="color:var(--text3)">Titular:</span> <strong>' + CHIAVEN_TITULAR + '</strong></div>' +
      '</div>' +
      '<div style="margin-top:10px;font-size:0.75rem;color:var(--text3)">Una vez confirmado el pago, el vehículo queda reservado a tu nombre.</div>' +
    '</div>';

  document.getElementById('res-op-ref').textContent = op.id;
  el.classList.remove('hidden');
  el.style.zIndex = '9300';
}

function openPostReservationPanel(op) {
  if (!op || !currentUser) return;
  activeOperation = op;
  var isBuyer = op.buyer_id === currentUser.id;
  var isSeller = op.seller_id === currentUser.id;
  var w = op.workflow || {};
  w.steps = w.steps || {};
  var existing = document.getElementById('post-reservation-modal');
  if (existing) existing.remove();

  function stepStatus(key) {
    return w.steps[key] && w.steps[key].status || 'pending';
  }
  function stepBadge(key) {
    var st = stepStatus(key);
    if (st === 'completed') return '<span style="color:var(--green);font-weight:700">✓ Completado</span>';
    if (st === 'waiting' || st === 'reported') return '<span style="color:var(--amber);font-weight:700">⏳ ' + (st === 'reported' ? 'Esperando verificación' : 'Esperando') + '</span>';
    return '<span style="color:var(--text3)">Pendiente</span>';
  }
  function ownerLabel(owner) {
    return owner === 'buyer' ? 'Comprador' : owner === 'seller' ? 'Agencia' : 'Ambos';
  }
  function stepCard(num, key, icon, title, desc, owner, actionHtml) {
    var st=stepStatus(key);
    var bg=st==='completed'?'var(--green-light)':st==='waiting'?'var(--amber-light)':'var(--bg)';
    return '<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:'+bg+'">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">' +
        '<div style="display:flex;gap:10px"><div style="font-size:21px">'+icon+'</div><div><div style="font-weight:700;font-size:.88rem">'+num+'. '+title+'</div><div style="font-size:.72rem;color:var(--text3);margin-top:3px">Responsable: '+ownerLabel(owner)+'</div></div></div>' +
        '<div style="font-size:.72rem;white-space:nowrap">'+stepBadge(key)+'</div>' +
      '</div>' +
      '<div style="font-size:.78rem;color:var(--text2);margin:9px 0 0 31px">'+desc+'</div>' +
      (actionHtml ? '<div style="margin:11px 0 0 31px">'+actionHtml+'</div>' : '') +
    '</div>';
  }

  var payment=w.payment_method||'';
  if(payment==='financiacion') payment='cash_credit';
  else if(payment==='transferencia'||payment==='efectivo'||payment==='mercadopago') payment='cash_transfer';
  var finance=w.financing||null;
  var tradeIn=w.trade_in||{};
  var needsFinance=payment==='cash_credit'||payment==='finance_tradein';
  var needsTradeIn=payment==='cash_tradein'||payment==='finance_tradein';
  var paymentLabels={
    cash_transfer:'💵 Efectivo / transferencia',
    cash_credit:'💵 Efectivo + crédito',
    cash_tradein:'🚗 Efectivo + usado',
    finance_tradein:'📊 Financiación + usado'
  };
  var stepKeys=['reservation','payment','financing'];
  if(needsTradeIn) stepKeys.push('tradein');
  stepKeys=stepKeys.concat(['documents','delivery','balance','sale']);
  var completedCount=stepKeys.filter(function(k){return stepStatus(k)==='completed';}).length;
  var progress=Math.round((completedCount/stepKeys.length)*100);
  var currentStep=stepKeys.find(function(k){return stepStatus(k)!=='completed';})||'balance';
  var currentLabels={reservation:'Verificación de reserva',payment:'Forma de pago',financing:'Financiación',tradein:'Vehículo usado en parte de pago',documents:'Documentación',delivery:'Entrega',balance:'Saldo final',sale:'Confirmación de venta'};
  var progressHtml='<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:13px 14px;margin-bottom:14px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">'+
      '<div><div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Progreso de la operación</div><div style="font-weight:700;margin-top:2px">'+(progress===100?'🎉 Operación lista para completar':'Siguiente paso: '+currentLabels[currentStep])+'</div></div>'+
      '<div style="font-size:1.05rem;font-weight:800;color:var(--accent)">'+progress+'%</div>'+
    '</div>'+
    '<div style="height:7px;background:#e5e7eb;border-radius:99px;overflow:hidden"><div style="height:100%;width:'+progress+'%;background:var(--accent);border-radius:99px;transition:width .25s"></div></div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:7px;font-size:.66rem;color:var(--text3)"><span>'+completedCount+' de '+stepKeys.length+' pasos completados</span><span>Ref. '+esc(op.id||'')+'</span></div>'+
  '</div>';

  var stepsHtml='';

  stepsHtml += stepCard(1,'reservation','💳','Verificar reserva',
    isSeller ? 'El comprador informó la transferencia de la seña. Verificá el ingreso para liberar el siguiente paso.' : 'Esperando que la agencia verifique la transferencia de la seña.',
    'seller',
    isSeller && stepStatus('reservation')!=='completed'
      ? '<button type="button" class="btn-sm primary" onclick="verifyWorkflowReservation()">✓ Confirmar reserva recibida</button>' : '');

  var paymentAction='';
  if(payment) {
    paymentAction='<div style="font-size:.78rem;font-weight:600;margin-bottom:8px">'+paymentLabels[payment]+'</div>'+
      (isBuyer?'<button type="button" class="btn-sm" onclick="changeWorkflowPayment()">Cambiar forma de pago</button>':'');
  } else if(isBuyer) {
    paymentAction='<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">'+
      Object.keys(paymentLabels).map(function(v){return '<button type="button" class="btn-sm" onclick="setWorkflowPayment(\''+v+'\')">'+paymentLabels[v]+'</button>';}).join('')+
      '</div><div style="font-size:.72rem;color:var(--text3);margin-top:7px">Elegí la modalidad. Se habilitarán los apartados de financiación y/o usado que correspondan.</div>';
  } else paymentAction='<div style="font-size:.76rem;color:var(--text3)">Esperando que el comprador indique cómo pagará.</div>';
  if(op.agreed_trade_ins&&op.agreed_trade_ins.length&&!needsTradeIn) {
    paymentAction=agreedTradeInHTML(op)+'<div style="font-size:.74rem;color:var(--amber);margin-bottom:8px">En la negociación se acordó una permuta: elegí "Efectivo + usado" o "Financiación + usado" para cargar los autos.</div>'+paymentAction;
  }
  stepsHtml += stepCard(2,'payment','💰','Forma de pago','Definí cómo se completará el precio acordado.','buyer',paymentAction);

  var financeAction='';
  if(!payment || !needsFinance) {
    financeAction='<div style="font-size:.76rem;color:var(--text3)">'+(!payment?'Primero elegí la forma de pago.':'No se requiere financiación con esta modalidad.')+'</div>';
  } else {
    if(finance) financeAction='<div style="font-size:.76rem;color:var(--text2);margin-bottom:8px">Anticipo: <strong>'+fmtPrice(finance.down_payment||0)+'</strong> · Plazo: <strong>'+esc(finance.term||'')+'</strong></div>';
    if(isBuyer && stepStatus('financing')!=='completed') {
      financeAction+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:7px"><input id="wf-down" class="form-input" type="number" min="0" placeholder="Anticipo" value="'+(finance&&finance.down_payment||'')+'"><select id="wf-term" class="form-input"><option value="">Plazo</option><option>12 meses</option><option>18 meses</option><option>24 meses</option><option>36 meses</option><option>48 meses</option><option>60 meses</option></select></div><button type="button" class="btn-sm primary" onclick="saveWorkflowFinance()">Enviar solicitud de financiación</button>';
    }
    if(isSeller && finance && stepStatus('financing')!=='completed') financeAction+='<button type="button" class="btn-sm primary" onclick="confirmWorkflowFinancing()">✓ Confirmar financiación</button>';
    if(stepStatus('financing')==='reported' && isBuyer) financeAction+='<div style="font-size:.74rem;color:var(--amber);margin-top:7px">Solicitud enviada. Esperando respuesta de la agencia.</div>';
  }
  stepsHtml += stepCard(3,'financing','📊','Financiación','Si corresponde, la solicitud queda registrada para que la agencia la gestione.','both',financeAction);

  var docsAction='';
  var docItems=[
    {key:'form08',label:'08 firmado por vendedor',icon:'📝'},
    {key:'police',label:'Verificación policial al día',icon:'🔎'},
    {key:'vtv',label:'VTV al día',icon:'🚗'},
    {key:'domain',label:'Informe de dominio y multas al día',icon:'📋'},
    {key:'debt',label:'Libre de deuda automotor',icon:'💰'},
    {key:'manuals',label:'Manuales',icon:'📘'},
    {key:'duplicate_key',label:'Llave duplicado',icon:'🔑'}
  ];
  var docState=w.documents_checklist||{};
  var docsDone=docItems.filter(function(d){return docState[d.key]===true;}).length;
  if(isSeller) {
    var docsList='<div style="margin-top:10px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff">';
    docItems.forEach(function(d){
      var checked=docState[d.key]===true;
      docsList+='<button type="button" onclick="toggleWorkflowDocument(\''+d.key+'\')" style="width:100%;display:flex;align-items:center;gap:10px;padding:10px 11px;border:0;border-bottom:1px solid var(--border);background:'+(checked?'var(--green-light)':'#fff')+';cursor:pointer;text-align:left">'+
        '<span style="width:22px;height:22px;border:2px solid '+(checked?'var(--green)':'#cbd5e1')+';border-radius:6px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--green);font-weight:800">'+(checked?'✓':'')+'</span>'+
        '<span style="font-size:15px">'+d.icon+'</span><span style="font-size:.77rem;font-weight:'+(checked?'700':'500')+';color:var(--text)">'+d.label+'</span>'+
        (checked?'<span style="margin-left:auto;font-size:.66rem;color:var(--green);font-weight:700">VERIFICADO</span>':'')+'</button>';
    });
    docsList+='</div><div style="font-size:.69rem;color:var(--text3);margin-top:7px">'+docsDone+' de '+docItems.length+' documentos verificados · Solo visible para la agencia.</div>';
    docsAction=docsList;
    if(docsDone===docItems.length && stepStatus('documents')!=='completed') docsAction+='<div style="margin-top:9px"><button type="button" class="btn-sm primary" onclick="confirmWorkflowStep(\'documents\')">✓ Confirmar documentación completa</button></div>';
  } else {
    docsAction='<div style="font-size:.78rem;color:var(--text2);padding:10px 0">La agencia está verificando la documentación del vehículo.</div>'+
      '<div style="font-size:.72rem;color:var(--text3)">'+docsDone+' de '+docItems.length+' documentos verificados.</div>'+
      '<div style="margin-top:9px"><button type="button" class="btn-sm" onclick="addWorkflowQuestion(\'documentacion\')">📄 Consultar por la documentación</button></div>';
  }
  if(stepStatus('documents')==='waiting') docsAction+='<div style="font-size:.74rem;color:var(--amber);margin-top:7px">Solicitud enviada. Esperando respuesta de la agencia.</div>';

  if(needsTradeIn) {
    var tradeInAction='';
    var tiVehicles=workflowTradeInVehicles(op);
    if(isBuyer) {
      tradeInAction=agreedTradeInHTML(op)+
        '<div style="font-size:.76rem;color:var(--text2);margin-bottom:8px">Informá los vehículos que entregás como parte de pago. Podés adjuntar hasta 5 fotos.</div>'+
        '<div id="wf-tradein-list">'+(tiVehicles.length?tiVehicles:[{}]).map(workflowTradeInItemHTML).join('')+'</div>'+
        '<button type="button" class="btn-sm" onclick="addWorkflowTradeInItem()" style="margin-bottom:8px">+ Agregar otro auto</button>'+
        '<label style="display:block;font-size:.75rem;font-weight:600;margin:4px 0 6px">Fotos del vehículo (hasta 5, máximo 5 MB cada una)</label>'+
        '<input id="wf-tradein-photos" type="file" accept="image/*" multiple class="form-input" style="width:100%;margin-bottom:8px">'+
        (tradeIn.photos&&tradeIn.photos.length?'<div style="display:flex;gap:7px;flex-wrap:wrap;margin:8px 0">'+tradeIn.photos.map(function(url){return '<a href="'+esc(url)+'" target="_blank" rel="noopener"><img src="'+esc(url)+'" alt="Foto del usado" style="width:74px;height:58px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></a>';}).join('')+'</div>':'')+
        (tradeIn.seller_offer?'<div style="margin:10px 0;background:var(--accent-light);border-radius:10px;padding:11px"><div style="font-size:.76rem;color:var(--text2)">Propuesta de toma de la agencia: <strong>'+fmtPrice(tradeIn.seller_offer)+'</strong></div><div style="font-size:.76rem;color:var(--text2);margin-top:4px">Diferencia estimada a pagar: <strong>'+fmtPrice(Math.max(0,Number(op.agreed_price||op.current_offer||op.initial_price||0)-Number(tradeIn.seller_offer||0)))+'</strong></div></div>':'')+
        '<button type="button" class="btn-sm primary" onclick="saveTradeInDetails()">Enviar datos y fotos a la agencia</button>';
    } else {
      tradeInAction=agreedTradeInHTML(op)+
        '<div style="font-size:.76rem;color:var(--text2);margin-bottom:8px">'+(tradeIn.submitted_at?'Datos enviados por el comprador.':'El comprador todavía no confirmó los datos'+(tiVehicles.length?' (abajo, lo acordado en la negociación).':'.'))+'</div>'+
        (tiVehicles.length?tiVehicles.map(function(v){
          return '<div style="border:1px solid var(--border);border-radius:10px;padding:9px 11px;margin-bottom:7px;background:#fff">'+
            '<div style="font-weight:700;margin-bottom:4px">'+esc(v.vehicle||'Vehículo sin nombre')+'</div>'+
            '<div style="font-size:.78rem">Kilómetros: '+esc(String(v.km||'No informado'))+' · Precio de referencia: <strong>'+fmtPrice(v.reference_price||0)+'</strong></div>'+
            (v.details?'<div style="font-size:.76rem;white-space:pre-wrap;margin-top:5px;color:var(--text2)">'+esc(v.details)+'</div>':'')+
          '</div>';
        }).join(''):'<div style="color:var(--text3)">Todavía no se cargaron los datos del usado.</div>')+
        (tradeIn.photos&&tradeIn.photos.length?'<div style="display:flex;gap:7px;flex-wrap:wrap;margin:8px 0">'+tradeIn.photos.map(function(url){return '<a href="'+esc(url)+'" target="_blank" rel="noopener"><img src="'+esc(url)+'" alt="Foto del usado" style="width:84px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></a>';}).join('')+'</div>':'<div style="font-size:.72rem;color:var(--text3)">Todavía no adjuntó fotos.</div>')+
        '<label style="display:block;font-size:.75rem;font-weight:600;margin:12px 0 6px">Tu propuesta de toma ($)'+(tiVehicles.length>1?' — total por los '+tiVehicles.length+' autos':'')+'</label>'+
        '<input id="wf-tradein-offer" class="form-input" type="number" min="0" placeholder="Valor que ofrece la agencia" value="'+(tradeIn.seller_offer||'')+'" style="width:100%;margin-bottom:8px">'+
        '<button type="button" class="btn-sm primary" onclick="sendTradeInOffer()">Enviar propuesta de toma</button>';
      if(tradeIn.seller_offer) {
        var carPrice=Number(op.agreed_price||op.current_offer||op.initial_price||0);
        tradeInAction+='<div style="margin-top:12px;background:var(--accent-light);border-radius:10px;padding:11px"><div style="font-size:.74rem;color:var(--text2)">Valor de toma propuesto: <strong>'+fmtPrice(tradeIn.seller_offer)+'</strong></div><div style="font-size:.74rem;color:var(--text2);margin-top:4px">Diferencia estimada a pagar: <strong>'+fmtPrice(Math.max(0,carPrice-Number(tradeIn.seller_offer||0)))+'</strong></div></div>';
      }
    }
    stepsHtml+=stepCard(4,'tradein','🚗','Vehículo usado en parte de pago','El comprador informa su vehículo y la agencia propone el valor de toma.','both',tradeInAction);
  }

  stepsHtml += stepCard(needsTradeIn?5:4,'documents','📄','Documentación','Checklist de papeles y elementos necesarios para completar la operación.','seller',docsAction);

  var deliveryAction='';
  if(isBuyer && stepStatus('delivery')!=='completed') deliveryAction='<button type="button" class="btn-sm" onclick="addWorkflowQuestion(\'entrega\')">📅 Solicitar coordinación de entrega</button>';
  if(isSeller && stepStatus('delivery')!=='completed') deliveryAction='<button type="button" class="btn-sm primary" onclick="confirmWorkflowStep(\'delivery\')">✓ Entrega coordinada</button>';
  if(isBuyer && stepStatus('delivery')==='waiting') deliveryAction+='<div style="font-size:.74rem;color:var(--amber);margin-top:7px">Solicitud enviada. Esperando respuesta de la agencia.</div>';
  stepsHtml += stepCard(needsTradeIn?6:5,'delivery','🚗','Entrega','Coordiná fecha, lugar y entrega del vehículo.','seller',deliveryAction);

  var balanceAction='';
  if(isBuyer && stepStatus('balance')!=='reported' && stepStatus('balance')!=='completed') {
    if(stepStatus('payment')==='completed') balanceAction='<button type="button" class="btn-sm primary" onclick="confirmWorkflowBalance()">💳 Informar saldo pagado</button>';
    else balanceAction='<div style="font-size:.76rem;color:var(--text3)">Primero completá la forma de pago.</div>';
  }
  if(stepStatus('balance')==='reported' && isSeller) balanceAction='<button type="button" class="btn-sm primary" onclick="verifyWorkflowBalance()">✓ Verificar saldo recibido</button>';
  if(stepStatus('balance')==='completed' && isSeller && stepStatus('sale')!=='completed') balanceAction='<button type="button" class="btn-sm primary" onclick="confirmSale()">🎉 Confirmar venta y completar</button>';
  stepsHtml += stepCard(needsTradeIn?7:6,'balance','🏦','Saldo final','Cuando corresponda, registrá el pago del saldo. La agencia deberá verificarlo antes de completar la venta.','both',balanceAction);

  var saleAction='';
  if(stepStatus('balance')!=='completed') saleAction='<div style="font-size:.76rem;color:var(--text3)">Primero debe verificarse el saldo final.</div>';
  else if(stepStatus('sale')==='completed') saleAction='<div style="font-size:.78rem;color:var(--green);font-weight:700">✓ La venta quedó registrada y la operación está completada.</div>';
  else if(isSeller) saleAction='<button type="button" class="btn-sm primary" onclick="confirmSale()">🎉 Confirmar venta y completar operación</button>';
  else saleAction='<div style="font-size:.76rem;color:var(--text3)">Esperando la confirmación final de la agencia.</div>';
  stepsHtml += stepCard(needsTradeIn?8:7,'sale','🎉','Confirmación de venta','La agencia confirma que recibió el saldo y que la operación queda finalizada.','seller',saleAction);

  var coordNote=(w.coordination_note||'');
  stepsHtml += '<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">'+
    '<div style="font-weight:700;font-size:.84rem;margin-bottom:6px">📝 Datos para coordinar</div>'+
    '<div style="font-size:.72rem;color:var(--text3);margin-bottom:8px">Podés dejar una indicación para la otra parte: horario, lugar, documentación o cualquier detalle de la operación.</div>'+
    '<textarea id="wf-note" class="form-input" rows="3" placeholder="Ej.: puedo retirar el vehículo el viernes por la tarde...">'+esc(coordNote)+'</textarea>'+
    '<button type="button" class="btn-sm primary" style="margin-top:8px" onclick="saveWorkflowNote()">Guardar indicación</button>'+
  '</div>'+
  '<div style="margin-top:14px;padding:12px;border-top:1px solid var(--border);font-size:.75rem;color:var(--text3)">Ref. operación: <strong>'+esc(op.id||'')+'</strong> · Última actualización: '+(op.updated_at?new Date(op.updated_at).toLocaleString('es-AR'):'—')+'</div>';

  var modal=document.createElement('div');
  modal.id='post-reservation-modal';
  modal.className='modal-overlay';
  modal.style.zIndex='12500';
  modal.innerHTML='<div class="modal-box" style="max-width:680px;max-height:92vh;overflow:auto">'+
    '<button type="button" class="modal-close" onclick="closePostReservationPanel()">✕</button>'+
    '<div style="font-size:34px;margin-bottom:6px">📋</div>'+
    '<div class="modal-title">Gestión de la operación</div>'+
    '<div class="modal-sub">'+esc(op.car_name||'Vehículo')+' · '+(isBuyer?'Comprador':'Agencia')+'</div>'+
    '<div style="margin:16px 0 14px;padding:12px 14px;border-radius:12px;background:var(--accent-light);font-size:.8rem;color:var(--text2)">Cada paso tiene un responsable. Cuando una parte completa un paso, la otra recibe la actualización automáticamente.</div>'+
    progressHtml+
    stepsHtml+
  '</div>';
  document.body.appendChild(modal);
  if(finance&&finance.term){var sel=document.getElementById('wf-term');if(sel)sel.value=finance.term;}
}

function closePostReservationPanel() {
  var m=document.getElementById('post-reservation-modal'); if(m) m.remove();
}

function persistWorkflow() {
  if (!activeOperation || !currentUser) return;
  activeOperation.workflow = activeOperation.workflow || {};
  activeOperation.updated_at = new Date().toISOString();
  updateOperation(activeOperation);
  var recipient = activeOperation.buyer_id === currentUser.id ? activeOperation.seller_id : activeOperation.buyer_id;
  sendRemoteNegotiationEvent('workflow_updated', activeOperation, recipient);
}

function setWorkflowStep(key,status,extra) {
  if(!activeOperation) return;
  activeOperation.workflow=activeOperation.workflow||{};
  activeOperation.workflow.steps=activeOperation.workflow.steps||{};
  activeOperation.workflow.steps[key]=Object.assign({status:status,by:currentUser.id,ts:new Date().toISOString()},extra||{});
  persistWorkflow();
}

function verifyWorkflowReservation() {
  if(!activeOperation || activeOperation.seller_id!==currentUser.id) return;
  setWorkflowStep('reservation','completed');
  activeOperation.payment_status='verificada';
  activeOperation.history=activeOperation.history||[];
  activeOperation.history.push({type:'system',text:'La agencia verificó la recepción de la reserva.',ts:new Date().toISOString()});

  // Si el comprador ya había elegido la forma de pago, la verificación
  // de la reserva habilita y confirma automáticamente el paso 2.
  activeOperation.workflow = activeOperation.workflow || {};
  activeOperation.workflow.steps = activeOperation.workflow.steps || {};
  if (activeOperation.workflow.payment_method &&
      activeOperation.workflow.steps.payment && activeOperation.workflow.steps.payment.status !== 'completed') {
    activeOperation.workflow.steps.payment = {
      status:'completed',
      by:activeOperation.buyer_id,
      ts:new Date().toISOString()
    };
    if (activeOperation.workflow.payment_method !== 'cash_credit' && activeOperation.workflow.payment_method !== 'finance_tradein' &&
        (!activeOperation.workflow.steps.financing || activeOperation.workflow.steps.financing.status !== 'completed')) {
      activeOperation.workflow.steps.financing = {
        status:'completed',
        not_required:true,
        by:activeOperation.buyer_id,
        ts:new Date().toISOString()
      };
    }
  }
  persistWorkflow();
  openPostReservationPanel(activeOperation);
  toast('Reserva verificada. El siguiente paso quedó habilitado.', 'success');
}

function completeWorkflowPayment() {
  if(!activeOperation || !currentUser || activeOperation.buyer_id!==currentUser.id) return;
  if(!activeOperation.workflow || !activeOperation.workflow.payment_method) {
    toast('Primero elegí una forma de pago.', 'info');
    return;
  }
  activeOperation.workflow.steps=activeOperation.workflow.steps||{};
  activeOperation.workflow.steps.payment={status:'completed',by:currentUser.id,ts:new Date().toISOString()};
  if(activeOperation.workflow.payment_method!=='cash_credit' && activeOperation.workflow.payment_method!=='finance_tradein') {
    activeOperation.workflow.steps.financing={status:'completed',not_required:true,by:currentUser.id,ts:new Date().toISOString()};
  } else if(!activeOperation.workflow.steps.financing) {
    activeOperation.workflow.steps.financing={status:'pending',by:currentUser.id,ts:new Date().toISOString()};
  }
  persistWorkflow();
  openPostReservationPanel(activeOperation);
  toast('Forma de pago confirmada. El siguiente paso quedó habilitado.', 'success');
}

function confirmWorkflowFinancing() {
  if(!activeOperation || activeOperation.seller_id!==currentUser.id) return;
  setWorkflowStep('financing','completed',{approved_at:new Date().toISOString()});
  openPostReservationPanel(activeOperation);
  toast('Financiación confirmada por la agencia.', 'success');
}

function toggleWorkflowDocument(key) {
  if (!activeOperation || !currentUser || activeOperation.seller_id !== currentUser.id) {
    toast('La verificación de documentación corresponde a la agencia.', 'info');
    return;
  }
  activeOperation.workflow=activeOperation.workflow||{};
  activeOperation.workflow.documents_checklist=activeOperation.workflow.documents_checklist||{};
  activeOperation.workflow.documents_checklist[key]=activeOperation.workflow.documents_checklist[key] !== true;
  var docs=activeOperation.workflow.documents_checklist;
  var required=['form08','police','vtv','domain','debt','manuals','duplicate_key'];
  var all=required.every(function(k){return docs[k]===true;});
  if(all) {
    activeOperation.workflow.steps=activeOperation.workflow.steps||{};
    activeOperation.workflow.steps.documents={
      status:'completed',
      by:currentUser.id,
      ts:new Date().toISOString(),
      completed_at:new Date().toISOString()
    };
  } else if(activeOperation.workflow.steps && activeOperation.workflow.steps.documents && activeOperation.workflow.steps.documents.status==='completed') {
    activeOperation.workflow.steps.documents={status:'pending',by:currentUser.id,ts:new Date().toISOString()};
  }
  persistWorkflow();
  openPostReservationPanel(activeOperation);
  toast(activeOperation.workflow.documents_checklist[key] ? 'Documento verificado.' : 'Documento marcado como pendiente.', 'success');
}

function confirmWorkflowStep(key) {
  if(!activeOperation || !currentUser || activeOperation.seller_id!==currentUser.id) {
    toast('Este paso debe confirmarlo la agencia.', 'info');
    return;
  }
  setWorkflowStep(key,'completed');
  activeOperation.workflow.steps[key].completed_at=new Date().toISOString();
  openPostReservationPanel(activeOperation);
  toast('Paso actualizado.', 'success');
}

function confirmWorkflowBalance() {
  if(!activeOperation || activeOperation.buyer_id!==currentUser.id) return;
  setWorkflowStep('balance','reported',{reported_at:new Date().toISOString()});
  var recipient=activeOperation.seller_id;
  getSB().from('messages').insert(buildChatRow(activeOperation.car_id,activeOperation.buyer_id,activeOperation.seller_id,'text',{
    to_user:recipient,operation_id:activeOperation.id,text:'💳 Informé que pagué el saldo final. Queda pendiente la verificación de la agencia.'
  }));
  persistWorkflow();
  openPostReservationPanel(activeOperation);
  toast('Saldo informado. Esperando verificación de la agencia.', 'success');
}

function verifyWorkflowBalance() {
  if(!activeOperation || activeOperation.seller_id!==currentUser.id) return;
  if(!activeOperation.workflow || !activeOperation.workflow.steps || activeOperation.workflow.steps.balance.status!=='reported') return;
  setWorkflowStep('balance','completed',{verified_at:new Date().toISOString()});
  activeOperation.history=activeOperation.history||[];
  activeOperation.history.push({type:'system',text:'La agencia verificó la recepción del saldo final.',ts:new Date().toISOString()});
  var recipient=activeOperation.buyer_id;
  getSB().from('messages').insert(buildChatRow(activeOperation.car_id,activeOperation.buyer_id,activeOperation.seller_id,'text',{
    to_user:recipient,operation_id:activeOperation.id,text:'✓ La agencia verificó el pago del saldo final. Ya puede completar la venta.'
  }));
  openPostReservationPanel(activeOperation);
  toast('Saldo verificado. La venta puede completarse.', 'success');
}

function saveWorkflowNote() {
  if (!activeOperation) return;
  var el=document.getElementById('wf-note');
  activeOperation.workflow=activeOperation.workflow||{};
  activeOperation.workflow.coordination_note=(el&&el.value||'').trim();
  activeOperation.workflow.coordination_note_at=new Date().toISOString();
  persistWorkflow();
  openPostReservationPanel(activeOperation);
  toast('Indicación guardada y enviada a la otra parte.', 'success');
}

function setWorkflowPayment(method) {
  if (!activeOperation || activeOperation.buyer_id !== currentUser.id) return;
  activeOperation.workflow = activeOperation.workflow || {};
  activeOperation.workflow.steps = activeOperation.workflow.steps || {};
  activeOperation.workflow.payment_method = method;
  activeOperation.workflow.payment_selected_at = new Date().toISOString();

  // Elegir la forma de pago completa inmediatamente el paso 2.
  // La verificación de la reserva sigue siendo un paso propio de la agencia,
  // pero no bloquea al comprador para cargar el resto de la operación.
  activeOperation.workflow.steps.payment = {
    status:'completed',
    by:currentUser.id,
    ts:new Date().toISOString()
  };

  var needsFinance=method==='cash_credit'||method==='finance_tradein';
  var needsTradeIn=method==='cash_tradein'||method==='finance_tradein';
  activeOperation.workflow.steps.financing=needsFinance?{status:'pending',requested:false,by:currentUser.id,ts:new Date().toISOString()}:{status:'completed',not_required:true,by:currentUser.id,ts:new Date().toISOString()};
  activeOperation.workflow.steps.tradein=needsTradeIn?{status:'pending',requested:false,by:currentUser.id,ts:new Date().toISOString()}:{status:'completed',not_required:true,by:currentUser.id,ts:new Date().toISOString()};

  persistWorkflow();
  openPostReservationPanel(activeOperation);
  toast(method === 'financiacion' ? 'Forma de pago guardada. Ahora completá la financiación.' : 'Forma de pago guardada. Avanzamos al siguiente paso.', 'success');
}

function saveWorkflowFinance() {
  if (!activeOperation || activeOperation.buyer_id !== currentUser.id) return;
  var down=parseFloat(document.getElementById('wf-down').value)||0;
  var term=document.getElementById('wf-term').value||'';
  if (!term) {
    toast('Elegí un plazo de financiación.', 'info');
    return;
  }

  activeOperation.workflow=activeOperation.workflow||{};
  activeOperation.workflow.steps=activeOperation.workflow.steps||{};
  activeOperation.workflow.financing={down_payment:down,term:term,requested:true,requested_at:new Date().toISOString()};

  // El comprador completó su parte del paso 3. La agencia queda como
  // responsable de aprobar/verificar la financiación.
  activeOperation.workflow.steps.financing={
    status:'reported',
    requested:true,
    by:currentUser.id,
    ts:new Date().toISOString()
  };

  persistWorkflow();
  openPostReservationPanel(activeOperation);
  toast('Solicitud de financiación enviada. Esperando respuesta de la agencia.', 'success');
}

function changeWorkflowPayment() {
  if(!activeOperation||!currentUser||activeOperation.buyer_id!==currentUser.id)return;
  activeOperation.workflow=activeOperation.workflow||{};
  activeOperation.workflow.payment_method='';
  activeOperation.workflow.steps=activeOperation.workflow.steps||{};
  activeOperation.workflow.steps.payment={status:'pending',by:currentUser.id,ts:new Date().toISOString()};
  persistWorkflow();openPostReservationPanel(activeOperation);
}

function uploadTradeInPhoto(file,index) {
  return file.arrayBuffer().then(function(ab){
    var name=(file.name||('foto_'+index+'.jpg')).replace(/[^a-zA-Z0-9._-]/g,'_');
    var path='trade-ins/'+String(activeOperation.id).replace(/[^a-zA-Z0-9_-]/g,'_')+'/'+String(currentUser.id).replace(/[^a-zA-Z0-9_-]/g,'_')+'/'+Date.now()+'_'+index+'_'+name;
    return fetch(SUPABASE_URL+'/storage/v1/object/car-images/'+path,{method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+((_session&&_session.access_token)||SUPABASE_KEY),'Content-Type':file.type||'image/jpeg','x-upsert':'false'},body:ab}).then(function(res){
      if(!res.ok)throw new Error('Storage rechazó la foto ('+res.status+').');
      return SUPABASE_URL+'/storage/v1/object/public/car-images/'+path;
    });
  });
}

// Autos del paso "usado en parte de pago". Soporta varios (trade_in.vehicles); las operaciones
// viejas tienen un solo auto en trade_in.vehicle, y si todavía no se cargó nada se precarga con
// la permuta acordada en la negociación.
function workflowTradeInVehicles(op) {
  var ti=(op.workflow&&op.workflow.trade_in)||{};
  if(Array.isArray(ti.vehicles)&&ti.vehicles.length) return ti.vehicles;
  if(ti.vehicle) return [{vehicle:ti.vehicle,km:ti.km,reference_price:ti.reference_price,details:ti.details}];
  return (op.agreed_trade_ins||[]).map(function(t){
    return {vehicle:[t.marca,t.modelo,t.anio].filter(Boolean).join(' '),km:t.km||'',reference_price:t.valor||'',details:t.detalle||''};
  });
}

function workflowTradeInItemHTML(v) {
  v=v||{};
  return '<div class="wf-tradein-item" style="border:1px solid var(--border);border-radius:10px;padding:9px;margin-bottom:8px;background:#fff">'+
    '<div style="display:flex;gap:8px;margin-bottom:8px"><input class="form-input wf-ti-name" placeholder="Marca, modelo, versión y año" value="'+esc(v.vehicle||'')+'" style="flex:1">'+
      '<button type="button" class="btn-sm danger" onclick="var l=document.querySelectorAll(\'.wf-tradein-item\');if(l.length>1)this.closest(\'.wf-tradein-item\').remove();else toast(\'Tiene que quedar al menos un auto.\',\'info\')">Quitar</button></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px"><input class="form-input wf-ti-km" type="number" min="0" placeholder="Kilómetros" value="'+(v.km||'')+'"><input class="form-input wf-ti-price" type="number" min="0" placeholder="Precio de referencia ($)" value="'+(v.reference_price||'')+'"></div>'+
    '<textarea class="form-input wf-ti-details" rows="2" placeholder="Estado, versión, motor, detalles, deudas..." style="width:100%">'+esc(v.details||'')+'</textarea>'+
  '</div>';
}

function addWorkflowTradeInItem() {
  var list=document.getElementById('wf-tradein-list');
  if(list) list.insertAdjacentHTML('beforeend',workflowTradeInItemHTML({}));
}

function saveTradeInDetails() {
  if(!activeOperation||!currentUser||activeOperation.buyer_id!==currentUser.id)return;
  var vehicles=Array.prototype.map.call(document.querySelectorAll('#wf-tradein-list .wf-tradein-item'),function(el){
    return {
      vehicle:(el.querySelector('.wf-ti-name').value||'').trim(),
      km:parseInt(el.querySelector('.wf-ti-km').value,10)||0,
      reference_price:parseFloat(el.querySelector('.wf-ti-price').value)||0,
      details:(el.querySelector('.wf-ti-details').value||'').trim()
    };
  });
  var input=document.getElementById('wf-tradein-photos');
  var files=Array.prototype.slice.call((input&&input.files)||[]);
  if(!vehicles.length||vehicles.some(function(v){return !v.vehicle;})){toast('Indicá marca, modelo y año de cada usado.','info');return;}
  var existingPhotos=(activeOperation.workflow.trade_in&&activeOperation.workflow.trade_in.photos)||[];
  if(existingPhotos.length+files.length>5){toast('Podés tener hasta 5 fotos en total.','info');return;}
  for(var i=0;i<files.length;i++)if(!/^image\//.test(files[i].type)||files[i].size>5*1024*1024){toast('Cada foto debe ser una imagen de hasta 5 MB.','info');return;}
  var btn=document.querySelector('#post-reservation-modal button[onclick="saveTradeInDetails()"]');
  if(btn){btn.disabled=true;btn.textContent='Subiendo fotos...';}
  var existing=(activeOperation.workflow.trade_in&&activeOperation.workflow.trade_in.photos)||[];
  Promise.all(files.map(function(file,i){return uploadTradeInPhoto(file,i+1);})).then(function(urls){
    var w=activeOperation.workflow=activeOperation.workflow||{};
    w.trade_in=w.trade_in||{};
    w.trade_in.vehicles=vehicles;
    // Campos de un solo auto, para que versiones anteriores sigan mostrando algo coherente
    w.trade_in.vehicle=vehicles.map(function(v){return v.vehicle;}).join(' + ');
    w.trade_in.km=vehicles[0].km;
    w.trade_in.reference_price=vehicles.reduce(function(s,v){return s+v.reference_price;},0);
    w.trade_in.details=vehicles.map(function(v){return v.details;}).filter(Boolean).join('\n');
    w.trade_in.photos=existing.concat(urls).slice(0,5);w.trade_in.submitted_at=new Date().toISOString();
    w.steps=w.steps||{};w.steps.tradein={status:'reported',by:currentUser.id,ts:new Date().toISOString()};
    persistWorkflow();openPostReservationPanel(activeOperation);toast('Datos y fotos del usado enviados a la agencia.','success');
  }).catch(function(err){
    console.error('Error subiendo fotos del usado:',err);
    if(btn){btn.disabled=false;btn.textContent='Enviar datos y fotos a la agencia';}
    toast('No se pudieron subir las fotos. Verificá los permisos de Supabase Storage.','error');
  });
}

function sendTradeInOffer() {
  if(!activeOperation||!currentUser||activeOperation.seller_id!==currentUser.id)return;
  var val=parseFloat(document.getElementById('wf-tradein-offer').value)||0;
  if(val<=0){toast('Ingresá el valor de toma propuesto por la agencia.','info');return;}
  var w=activeOperation.workflow=activeOperation.workflow||{};
  w.trade_in=w.trade_in||{};w.trade_in.seller_offer=val;w.trade_in.seller_offer_at=new Date().toISOString();
  w.steps=w.steps||{};w.steps.tradein={status:'reported',by:currentUser.id,ts:new Date().toISOString(),seller_offer:val};
  persistWorkflow();
  getSB().from('messages').insert(buildChatRow(activeOperation.car_id,activeOperation.buyer_id,activeOperation.seller_id,'text',{to_user:activeOperation.buyer_id,operation_id:activeOperation.id,text:'🚗 La agencia propuso tomar tu usado en '+fmtPrice(val)+'. Diferencia estimada a pagar: '+fmtPrice(Math.max(0,Number(activeOperation.agreed_price||activeOperation.current_offer||activeOperation.initial_price||0)-val))+'.'}));
  openPostReservationPanel(activeOperation);toast('Propuesta de toma enviada al comprador.','success');
}

function addWorkflowQuestion(kind) {
  if (!activeOperation || !currentUser) return;
  activeOperation.workflow=activeOperation.workflow||{};
  activeOperation.workflow.steps=activeOperation.workflow.steps||{};
  activeOperation.workflow.questions=activeOperation.workflow.questions||[];
  activeOperation.workflow.questions.push({type:kind,from:currentUser.id,ts:new Date().toISOString()});
  var stepKey=kind==='documentacion'?'documents':kind==='entrega'?'delivery':null;
  if(stepKey) activeOperation.workflow.steps[stepKey]={status:'waiting',requested_by:currentUser.id,ts:new Date().toISOString()};
  var recipient=activeOperation.buyer_id===currentUser.id?activeOperation.seller_id:activeOperation.buyer_id;
  var labels={documentacion:'📄 Solicité información sobre la documentación.',entrega:'📅 Quiero coordinar la fecha/lugar de entrega.',transferencia:'🔑 Quiero coordinar la transferencia.',saldo:'💰 Quiero coordinar el pago del saldo.'};
  getSB().from('messages').insert(buildChatRow(activeOperation.car_id,activeOperation.buyer_id,activeOperation.seller_id,'text',{to_user:recipient,operation_id:activeOperation.id,text:labels[kind]})).then(function(r){if(r&&r.error)console.error('No se pudo enviar solicitud de operación:',r.error);});
  persistWorkflow();
  openPostReservationPanel(activeOperation);
  toast('Solicitud enviada a la otra parte', 'success');
}

function confirmReservationPaid() {
  if (!activeOperation || !currentUser) return;
  var op = activeOperation;
  op.status = 'reserva_pagada';
  op.payment_status = 'pagada_manual';
  op.paid_at = new Date().toISOString();
  op.history = op.history || [];
  op.history.push({
    type: 'system',
    text: 'El comprador informó que realizó la transferencia de la seña. Pendiente de verificación por la agencia.',
    ts: new Date().toISOString()
  });
  op.updated_at = new Date().toISOString();
  updateOperation(op);

  var sellerId = op.seller_id;
  sendRemoteNegotiationEvent('reservation_paid', op, sellerId).then(function(res) {
    if (res && res.error) console.error('No se pudo notificar la reserva al vendedor:', res.error);
  });

  // También queda registrado en el hilo de chat.
  getSB().from('messages').insert(buildChatRow(op.car_id, op.buyer_id, op.seller_id, 'text', {
    to_user: sellerId,
    operation_id: op.id,
    text: '💳 Informé el pago de la seña. Quedo a la espera de la confirmación de la agencia para coordinar la operación.'
  })).then(function(res) {
    if (res && res.error) console.error('No se pudo registrar el pago de reserva en el chat:', res.error);
  });

  document.getElementById('reservation-modal').classList.add('hidden');
  openPostReservationPanel(op);
  toast('🎉 Reserva informada. Ahora podés gestionar la operación.', 'success');
  addNotification('💳', 'Reserva informada', op.car_name + ' · Esperando confirmación de la agencia', 'green', 'operation:' + op.id);
}

function confirmSale() {
  if (!activeOperation || !currentUser || activeOperation.seller_id !== currentUser.id) return;
  if (!activeOperation.workflow || !activeOperation.workflow.steps || activeOperation.workflow.steps.balance.status !== 'completed') { toast('Primero verificá el pago del saldo.', 'info'); return; }
  var op = activeOperation;
  if (!op.workflow) op.workflow = {};
  op.workflow.steps = op.workflow.steps || {};
  op.workflow.steps.sale = {status:'completed', by:currentUser.id, ts:new Date().toISOString()};
  op.status = 'completada';
  op.sale_completed_at = new Date().toISOString();
  op.history = op.history || [];
  op.history.push({
    type: 'system',
    text: 'Venta confirmada por la agencia. Operación completada.',
    ts: new Date().toISOString()
  });
  op.updated_at = new Date().toISOString();
  updateOperation(op);

  var recipientId = op.buyer_id;
  sendRemoteNegotiationEvent('sale_completed', op, recipientId);
  getSB().from('messages').insert(buildChatRow(op.car_id, op.buyer_id, op.seller_id, 'text', {
    to_user: recipientId,
    operation_id: op.id,
    text: '🎉 La agencia confirmó la venta. La operación quedó completada. Coordiná con la agencia la documentación y entrega.'
  }));

  openNegotiationModal(op);
  toast('🎉 Venta completada', 'success');
}

function closeNegotiationModal() {
  document.getElementById('negotiation-modal').classList.add('hidden');
  activeOperation = null;
}

// ── MY OPERATIONS ──
function loadMyOperations() {
  var ops = getOperations();
  var myOps = ops.filter(function(o) {
    return currentUser && (o.buyer_id === currentUser.id || o.seller_id === currentUser.id);
  });
  var el = document.getElementById('my-operations-list');
  if (!el) return;
  if (!myOps.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Sin operaciones aún</div><div class="empty-sub">Negociá un vehículo para ver tus operaciones</div></div>';
    return;
  }
  myOps.sort(function(a,b){ return new Date(b.updated_at) - new Date(a.updated_at); });
  el.innerHTML = myOps.map(function(op) {
    var isBuyer = currentUser && op.buyer_id === currentUser.id;
    var price = op.agreed_price || op.current_offer || op.initial_price;
    var c = calcCommission(price, op.commission_rate);
    return '<div style="background:#fff;border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;cursor:pointer;box-shadow:var(--shadow)" data-oid="' + op.id + '" onclick="reopenOperation(this.dataset.oid)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
        '<div><div style="font-weight:600;font-size:0.95rem;color:var(--text)">' + esc(op.car_name) + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text3);margin-top:3px">' + (isBuyer ? 'Comprando' : 'Vendiendo') + ' · ' + new Date(op.created_at).toLocaleDateString('es-AR') + '</div></div>' +
        '<span class="status-badge status-' + op.status + '">' + statusLabel(op.status) + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:0.8rem">' +
        '<div><div style="color:var(--text3);margin-bottom:2px">Precio acordado</div><div style="font-weight:600">' + (op.agreed_price ? fmtPrice(op.agreed_price) : '—') + '</div></div>' +
        '<div><div style="color:var(--red);margin-bottom:2px">Comisión Chiaven</div><div style="font-weight:600;color:var(--red)">' + fmtPrice(c.commission) + '</div></div>' +
        '<div><div style="color:var(--text3);margin-bottom:2px">Total</div><div style="font-weight:700;color:var(--accent)">' + fmtPrice(c.finalPrice) + '</div></div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function reopenOperation(opId) {
  var ops = getOperations();
  var op = ops.find(function(o){ return o.id === opId; });
  if (!op) return;
  activeOperation = op;
  openNegotiationModal(op);
}
