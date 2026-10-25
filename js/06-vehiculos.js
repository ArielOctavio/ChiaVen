// ══ MATCH ══
function calcularMatch(auto, req) {
  var score = 0;
  var P = { marca: 30, modelo: 25, precio: 20, anio: 15, km: 10 };
  if (req.condicion && req.condicion !== '' && auto.condicion && req.condicion !== auto.condicion) return 0;
  if (req.marca && auto.marca) { if ((auto.marca || '').toLowerCase().indexOf((req.marca || '').toLowerCase()) >= 0) score += P.marca; } else score += P.marca * 0.5;
  if (req.modelo && auto.modelo) { if ((auto.modelo || '').toLowerCase().indexOf((req.modelo || '').toLowerCase()) >= 0) score += P.modelo; } else score += P.modelo * 0.5;
  if (req.presupuesto && auto.precio) {
    var d = Math.abs(auto.precio - req.presupuesto) / req.presupuesto;
    score += auto.precio <= req.presupuesto ? P.precio * Math.max(0.5, 1 - d * 0.5) : P.precio * Math.max(0, 1 - d * 2);
  } else score += P.precio * 0.5;
  if (req.anio && auto.anio) {
    var da = Math.abs(Number(auto.anio) - Number(req.anio));
    score += da === 0 ? P.anio : da <= 2 ? P.anio * 0.85 : da <= 3 ? P.anio * 0.70 : da <= 5 ? P.anio * 0.40 : 0;
  } else score += P.anio * 0.5;
  if (req.km_max && auto.km) {
    var dk = auto.km - req.km_max;
    score += dk <= 0 ? P.km : dk < 10000 ? P.km * 0.8 : dk < 30000 ? P.km * 0.4 : 0;
  } else score += P.km * 0.5;
  if (req.texto) {
    var words = req.texto.toLowerCase().split(/\s+/).filter(function(w) { return w.length > 3; });
    var ct = ((auto.marca || '') + ' ' + (auto.modelo || '') + ' ' + (auto.color || '') + ' ' + (auto.anio || '')).toLowerCase();
    var hits = words.filter(function(w) { return ct.indexOf(w) >= 0; }).length;
    if (words.length > 0) score += (hits / words.length) * 5;
  }
  return Math.min(100, Math.round(score));
}

// ══ CAR CARD ══
function closeProposalsModal() {
  var el = document.getElementById('chiaven-proposals-modal');
  if (el) el.remove();
}

function openCarProposals(carId) {
  if (!currentUser || !carId) return;
  var car = carCache[carId] || {};
  if (car.owner_id !== currentUser.id) {
    toast('Solo la agencia propietaria puede ver las propuestas', 'info');
    return;
  }

  closeProposalsModal();
  var modal = document.createElement('div');
  modal.id = 'chiaven-proposals-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:12000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML =
    '<div style="width:min(760px,100%);max-height:90vh;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden">' +
      '<div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
        '<div><div style="font-size:1.05rem;font-weight:700;color:var(--text)">💰 Propuestas</div><div style="font-size:.78rem;color:var(--text3);margin-top:4px">' + esc((car.marca || '') + ' ' + (car.modelo || '')) + ' · ordenadas por lo que recibe la agencia</div></div>' +
        '<button type="button" onclick="closeProposalsModal()" style="border:0;background:var(--bg);border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:18px">×</button>' +
      '</div>' +
      '<div id="chiaven-proposals-body" style="overflow:auto;padding:14px 18px;flex:1"><div style="padding:30px;text-align:center;color:var(--text3)">Cargando propuestas...</div></div>' +
    '</div>';
  document.body.appendChild(modal);

  getSB().from('messages').select('*').eq('car_id', carId).then(function(r) {
    var body = document.getElementById('chiaven-proposals-body');
    if (!body) return;
    if (r && r.error) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--red)">No se pudieron cargar las propuestas.</div>';
      return;
    }

    var latestByThread = {};
    (r.data || []).forEach(function(m) {
      var d = decodeChatMessage(m.message || '');
      if (d.type !== 'proposal' || !d.proposal) return;
      var p = d.proposal;
      var thread = d.thread_id || getChatThreadId(carId,
        m.from_user === car.owner_id ? m.to_user : m.from_user,
        car.owner_id);
      var item = {
        id: m.id,
        threadId: thread,
        operationId: d.operation_id,
        buyerId: m.from_user === currentUser.id ? m.to_user : m.from_user,
        sellerAmount: Number(p.price || 0),
        buyerTotal: Number(p.buyerPrice || p.finalPrice || p.price || 0),
        commission: Number(p.commission || 0),
        note: p.note || '',
        proposal: p,
        ts: m.created_at || d.ts || ''
      };
      if (!latestByThread[thread] || new Date(item.ts || 0) > new Date(latestByThread[thread].ts || 0)) latestByThread[thread] = item;
    });

    var items = Object.values(latestByThread).sort(function(a,b) {
      return b.sellerAmount - a.sellerAmount || new Date(b.ts || 0) - new Date(a.ts || 0);
    });

    if (!items.length) {
      body.innerHTML = '<div style="padding:38px;text-align:center;color:var(--text3)"><div style="font-size:32px;margin-bottom:10px">💰</div><strong>No hay propuestas todavía</strong><div style="font-size:.8rem;margin-top:5px">Cuando un comprador haga una propuesta aparecerá acá.</div></div>';
      return;
    }

    body.innerHTML =
      '<div style="font-size:.74rem;color:var(--text3);margin:0 2px 10px">Se muestra la mejor propuesta de cada comprador.</div>' +
      items.map(function(p, idx) {
        return '<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:' + (idx === 0 ? 'var(--accent-light)' : '#fff') + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
            '<div><div style="font-size:.82rem;font-weight:700;color:var(--text)">#' + (idx+1) + ' · ' + esc(getUserAlias(p.buyerId)) + '</div><div style="font-size:.68rem;color:var(--text3);margin-top:3px">Hilo ' + esc(getThreadAlias(p.threadId)) + ' · ' + (p.ts ? new Date(p.ts).toLocaleString('es-AR') : '') + '</div></div>' +
            '<div style="text-align:right"><div style="font-size:.68rem;color:var(--text3)">Vos recibís</div><div style="font-size:1.18rem;font-weight:800;color:var(--green)">' + fmtPrice(p.sellerAmount) + '</div></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">' +
            '<div style="background:var(--bg);border-radius:8px;padding:9px"><div style="font-size:.65rem;color:var(--text3)">Paga comprador</div><div style="font-weight:700;font-size:.88rem">' + fmtPrice(p.buyerTotal) + '</div></div>' +
            '<div style="background:var(--bg);border-radius:8px;padding:9px"><div style="font-size:.65rem;color:var(--text3)">Comisión CHIAVEN</div><div style="font-weight:700;font-size:.88rem">' + fmtPrice(p.commission) + '</div></div>' +
          '</div>' +
          tradeInSummaryHTML(p.proposal) +
          (p.note ? '<div style="margin-top:9px;font-size:.78rem;color:var(--text2)">💬 ' + esc(p.note) + '</div>' : '') +
          (p.operationId ? '<div style="display:flex;gap:8px;margin-top:11px"><button type="button" class="btn-sm primary" style="flex:1" onclick="closeProposalsModal();openProposalFromMessage(\'' + esc(p.operationId) + '\')">💬 Abrir negociación</button></div>' : '') +
        '</div>';
      }).join('');
  });
}

function carCardHTML(car, isMine, matchPct) {
  carCache[car.id] = car;
  var imgs = Array.isArray(car.images) && car.images.length ? car.images : (car.image_url ? [car.image_url] : []);
  var isOport = car.es_oportunidad && !car.es_super_oportunidad;
  var isSuperOport = !!car.es_super_oportunidad;
  var isNuevo = car.condicion === 'nuevo';
  var isDestacat = !!car.destacado;

  var imgHTML = imgs.length ? '<img src="' + imgs[0] + '" alt="' + esc(car.marca) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '<div class="car-img-placeholder">🚗</div>';
  var badgeTop = car.status === 'vendido' ? '<div class="badge-top badge-sold">Vendido</div>' : isMine ? '<div class="badge-top badge-mine">Mi auto</div>' : '';
  var badgeCond = isNuevo ? '<div class="badge-nuevo-car">✨ 0KM</div>' : isSuperOport ? '<div class="badge-super-oport">🔥🔥 SUPER</div>' : isOport ? '<div class="badge-oport">🔥 OFERTA</div>' : '';
  var fireBadge = isSuperOport ? '<div class="fire-badge">🔥🔥</div>' : isOport ? '<div class="fire-badge">🔥</div>' : '';
  var imgCnt = imgs.length > 1 ? '<div class="img-counter">📷 ' + imgs.length + '</div>' : '';
  var locationStr = car.localidad ? '<div class="car-location">📍 ' + esc(car.localidad) + (car.provincia ? ', ' + esc(car.provincia) : '') + '</div>' : '';
  var matchHTML = matchPct != null ? '<div class="match-pill ' + matchClass(matchPct) + '">🎯 Match ' + matchPct + '%</div><div class="match-bar-wrap"><div class="match-bar" style="width:' + matchPct + '%;background:' + matchColor(matchPct) + '"></div></div>' : '';
  var isSold = car.status === 'vendido';
  var soldInfo = isSold ? '<div class="car-sold-info">✓ Vendido' + (car.sold_at ? ' el ' + new Date(car.sold_at).toLocaleDateString('es-AR') : '') + (car.precio_venta ? ' · ' + fmtPrice(car.precio_venta) : '') + '</div>' : '';
  var actions = isMine && isSold ? '<div class="car-actions"><button type="button" class="btn-sm" onclick="markCarAvailable(\'' + car.id + '\',event)">↩ Volver a publicar</button><button type="button" class="btn-sm danger" onclick="deleteCar(\'' + car.id + '\',event)">Eliminar</button></div>' : isMine ? '<div class="car-actions"><button type="button" class="btn-sm" onclick="openEditCar(event,\'' + car.id + '\')">&#9999;&#65039; Editar</button><button type="button" class="btn-sm primary" onclick="event.stopPropagation();openCarProposals(\'' + car.id + '\')">💰 Propuestas</button><button type="button" class="btn-sm" onclick="event.stopPropagation();openCarSellerChats(\'' + car.id + '\')">&#128172; Consultas</button><button type="button" class="btn-sm" onclick="markCarSold(\'' + car.id + '\',event)" style="color:var(--green)">✓ Vendido</button><button type="button" class="btn-sm danger" onclick="deleteCar(\'' + car.id + '\',event)">Eliminar</button></div>' : '';
  var precioInfoHTML = car.precio_info ? '<div class="car-price-info">' + (isMine ? '' : '<span style="color:var(--text3)">Precio de info:</span> ') + esc(car.precio_info) + '</div>' : '';
  var cardClass = 'car-card' + (car.status === 'vendido' ? ' sold' : '') + (isDestacat ? ' destacado' : isSuperOport ? ' super-oportunidad' : isOport ? ' oportunidad' : isNuevo ? ' nuevo' : '');

  return '<div class="' + cardClass + '" onclick="openCarDetailById(event,\'' + car.id + '\')">' +
    fireBadge +
    '<div class="car-imgs">' + imgHTML + badgeTop + badgeCond + imgCnt + '</div>' +
    '<button type="button" class="fav-btn" data-carid="' + car.id + '" onclick="toggleFavorite(\'' + car.id + '\',event)" style="position:absolute;top:188px;right:10px;z-index:10;background:rgba(255,255,255,0.9);border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow)">' + (isFavorite(car.id)?'&#x2764;':'&#x2661;') + '</button>' +
  '<div class="car-info">' + matchHTML +
    '<div class="car-name">' + esc(car.marca) + ' ' + esc(car.modelo) + '</div>' +
    '<div class="car-meta">' + (car.anio || '') + ' · ' + fmtKm(car.km) + ' · ' + esc(car.color || '') + '</div>' +
    locationStr +
    '<div class="car-price">' + fmtPrice(car.precio) + (car.moneda === 'USD' && car.precio_usd ? '<span class="car-price-usd">' + fmtUsd(car.precio_usd) + '</span>' : '') + '</div>' +
  // commission hidden from cards - price already includes it
    precioInfoHTML + soldInfo + actions +
    '</div></div>';
}

// ══ DETAIL MODAL ══
function openCarDetailById(event, carId) {
  if (event && event.target && event.target.closest && event.target.closest('button')) return;
  var car = carCache[carId];
  if (!car) return;
  detailCar = car;
  detailImgs = Array.isArray(car.images) && car.images.length ? car.images : (car.image_url ? [car.image_url] : []);
  detailImgIdx = 0;
  renderDetailImgs();
  var isMine = currentUser && car.owner_id === currentUser.id;
  var badges = [];
  if (car.condicion === 'nuevo') badges.push('<span class="badge-nuevo-car" style="position:static;font-size:0.76rem;padding:4px 10px">✨ 0KM</span>');
  if (car.es_super_oportunidad) badges.push('<span class="badge-super-oport" style="position:static;font-size:0.76rem;padding:4px 10px">🔥🔥 SUPER OFERTA</span>');
  else if (car.es_oportunidad) badges.push('<span class="badge-oport" style="position:static;font-size:0.76rem;padding:4px 10px">🔥 OFERTA</span>');
  if (car.destacado) badges.push('<span style="background:var(--accent-glow);color:var(--accent2);border:1px solid rgba(59,130,246,0.3);font-size:0.76rem;padding:4px 10px;border-radius:5px;font-weight:600">⭐ DESTACADO</span>');
  if (isMine) badges.push('<span class="badge-top badge-mine" style="position:static;font-size:0.76rem;padding:4px 10px">Mi auto</span>');
  document.getElementById('detail-badges').innerHTML = badges.join('');
  document.getElementById('detail-title').textContent = (car.marca || '—') + ' ' + (car.modelo || '');
  var metas = [];
  if (car.anio) metas.push('<span>📅 ' + car.anio + '</span>');
  if (car.km) metas.push('<span>🛣️ ' + fmtKm(car.km) + '</span>');
  if (car.color) metas.push('<span>🎨 ' + esc(car.color) + '</span>');
  if (car.condicion) metas.push('<span>' + (car.condicion === 'nuevo' ? '✨ 0KM' : '🔧 Usado') + '</span>');
  document.getElementById('detail-meta').innerHTML = metas.map(function(m) { return '<div class="detail-meta-item">' + m + '</div>'; }).join('');
  document.getElementById('detail-price').textContent = fmtPrice(car.precio) + (car.moneda === 'USD' && car.precio_usd ? ' · ' + fmtUsd(car.precio_usd) : '');
  document.getElementById('detail-price-info').innerHTML = car.precio_info ? '<span style="color:var(--text3)">Precio de info:</span> ' + esc(car.precio_info) : '';
  var extraEl = document.getElementById('detail-extra');
  if (extraEl) extraEl.innerHTML = carExtraDetailHTML(car);
  document.getElementById('detail-location').textContent = car.localidad ? '📍 ' + esc(car.localidad) + (car.provincia ? ', ' + esc(car.provincia) : '') : '';
  if (car.status === 'vendido') badges.unshift('<span class="badge-sold" style="font-size:0.76rem;padding:4px 10px;border-radius:5px;font-weight:600">✓ VENDIDO' + (car.sold_at ? ' · ' + new Date(car.sold_at).toLocaleDateString('es-AR') : '') + '</span>');
  document.getElementById('detail-badges').innerHTML = badges.join('');
  document.getElementById('detail-actions').innerHTML = isMine && car.status === 'vendido' ? '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap"><button type="button" class="btn-sm" onclick="closeCarDetail();markCarAvailable(\'' + car.id + '\')">↩ Volver a publicar</button></div>' : isMine ? '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap"><button type="button" class="btn-sm" onclick="openEditCar(event,\'' + car.id + '\')">✏️ Editar</button><button type="button" class="btn-sm primary" onclick="closeCarDetail();openCarProposals(\'' + car.id + '\')">💰 Propuestas</button><button type="button" class="btn-sm" onclick="markCarSold(\'' + car.id + '\',event)" style="color:var(--green)">✓ Vendido</button><button type="button" class="btn-sm danger" onclick="deleteCarFromDetail(\'' + car.id + '\')">🗑️ Eliminar</button></div>' : '';
  renderDetailContact(car, isMine);
  document.getElementById('car-detail-modal').classList.remove('hidden');
}

function renderDetailImgs() {
  var wrap = document.getElementById('detail-imgs');
  if (!detailImgs.length) { wrap.innerHTML = '<div class="detail-imgs-placeholder">🚗</div>'; return; }
  var nav = detailImgs.length > 1 ? '<button type="button" class="detail-img-nav prev" onclick="detailImgNav(-1,event)">‹</button><button type="button" class="detail-img-nav next" onclick="detailImgNav(1,event)">›</button>' : '';
  var dots = detailImgs.length > 1 ? '<div class="detail-img-dots">' + detailImgs.map(function(_, i) { return '<div class="detail-img-dot ' + (i === detailImgIdx ? 'active' : '') + '" onclick="detailImgNav(' + (i - detailImgIdx) + ',event)"></div>'; }).join('') + '</div>' : '';
  var counter = detailImgs.length > 1 ? '<div class="detail-img-counter">' + (detailImgIdx + 1) + ' / ' + detailImgs.length + '</div>' : '';
  wrap.innerHTML = '<img src="' + detailImgs[detailImgIdx] + '" style="width:100%;height:100%;object-fit:cover" loading="lazy">' + nav + dots + counter;
}

function detailImgNav(dir, event) {
  if (event) event.stopPropagation();
  detailImgIdx = (detailImgIdx + dir + detailImgs.length) % detailImgs.length;
  renderDetailImgs();
}

function renderDetailContact(car, isMine) {
  var block = document.getElementById('detail-contact-block');
  if (!block) return;
  if (isMine) { block.innerHTML = ''; return; }
  var sub = getSubscription();
  var hasPremium = isSubActive() && sub.plan !== 'trial';
  var chatStarted = !!(chatSessions && chatSessions[car.id]);
  var contactUnlocked = !!unlockedContacts[car.id];

  if (contactUnlocked) {
    // Trato cerrado - mostrar contacto completo
    var prof = contactCache[car.id];
    if (prof === undefined) {
      contactCache[car.id] = null; // evita pedidos duplicados mientras carga
      getSB().rpc('get_car_contact', { p_car_id: String(car.id) }).then(function(r) {
        if (r.error) { delete contactCache[car.id]; return; }
        contactCache[car.id] = (r.data && r.data[0]) || {};
        if (detailCar && detailCar.id === car.id) renderDetailContact(detailCar, false);
      });
    }
    prof = prof || {};
    var tel = prof.telefono || '—';
    var emailStr = car.owner_email || '—';
    var igStr = prof.ig ? '<a href="https://instagram.com/' + prof.ig.replace('@','') + '" target="_blank" style="color:var(--accent2);text-decoration:none">' + esc(prof.ig) + '</a>' : '—';
    block.innerHTML = '<div class="detail-contact-unlocked">' +
      '<div style="font-size:0.72rem;color:var(--green);font-weight:700;margin-bottom:14px">✅ TRATO CERRADO — CONTACTO HABILITADO</div>' +
      '<div style="display:grid;gap:10px">' +
      '<div style="display:flex;align-items:center;gap:10px"><span style="width:32px;height:32px;border-radius:8px;background:var(--navy5);display:flex;align-items:center;justify-content:center;flex-shrink:0">📞</span><div><div style="font-size:0.68rem;color:var(--text3)">TELÉFONO</div><div style="font-weight:600">' + esc(tel) + '</div></div></div>' +
      '<div style="display:flex;align-items:center;gap:10px"><span style="width:32px;height:32px;border-radius:8px;background:var(--navy5);display:flex;align-items:center;justify-content:center;flex-shrink:0">📧</span><div><div style="font-size:0.68rem;color:var(--text3)">EMAIL</div><div style="font-weight:600">' + esc(emailStr) + '</div></div></div>' +
      (prof.ig ? '<div style="display:flex;align-items:center;gap:10px"><span style="width:32px;height:32px;border-radius:8px;background:var(--navy5);display:flex;align-items:center;justify-content:center;flex-shrink:0">📸</span><div><div style="font-size:0.68rem;color:var(--text3)">INSTAGRAM</div><div style="font-weight:600">' + igStr + '</div></div></div>' : '') +
      '</div>' +
      (tel !== '—' ? '<a href="https://wa.me/' + tel.replace(/[^0-9]/g,'') + '" target="_blank" style="display:block;margin-top:14px;text-align:center;padding:10px;border-radius:var(--radius);background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.4);color:#25D366;font-weight:600;font-size:0.85rem;text-decoration:none">💬 Contactar por WhatsApp</a>' : '') +
      '<button type="button" onclick="openChat(\'' + car.id + '\')" style="margin-top:8px;width:100%;padding:10px;border-radius:var(--radius);background:var(--accent-glow);color:var(--accent2);border:1px solid rgba(59,130,246,0.3);cursor:pointer;font-weight:600;font-size:0.84rem">💬 Ver historial del chat</button>' +
      '</div>';
  } else if (chatStarted) {
    // Chat abierto — mostrar botones de continuar y cerrar trato
    block.innerHTML = '<div style="background:var(--green-glow);border:1px solid rgba(16,185,129,0.3);border-radius:var(--radius-lg);padding:18px;text-align:center">' +
      '<div style="font-size:0.72rem;color:var(--green);font-weight:700;margin-bottom:10px">💬 CHAT ACTIVO CON LA AGENCIA</div>' +
      '<div style="font-size:0.8rem;color:var(--text2);margin-bottom:14px">Seguí negociando y cuando estés listo cerrá el trato para obtener el contacto directo.</div>' +
      '<button type="button" onclick="openChat(\'' + car.id + '\')" style="width:100%;padding:12px;border-radius:var(--radius);background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:600;font-size:0.9rem;margin-bottom:8px">💬 Continuar conversación</button>' +
      '<button type="button" onclick="showDealFlow(\'' + car.id + '\')" style="width:100%;padding:10px;border-radius:var(--radius);background:var(--green);color:#fff;border:none;cursor:pointer;font-weight:600;font-size:0.84rem">🤝 Cerrar trato → habilitar contacto</button>' +
      '</div>';
  } else {
    // No iniciado — mostrar botón de iniciar chat
    block.innerHTML = '<div class="detail-contact-locked">' +
      '<div style="font-size:36px;margin-bottom:10px">💬</div>' +
      '<div style="font-size:0.95rem;font-weight:700;margin-bottom:6px">Iniciá la conversación</div>' +
      '<div style="font-size:0.8rem;color:var(--text2);line-height:1.6;margin-bottom:12px">Chateá con la agencia, negociá el precio y consultá sobre financiación BNA. Al cerrar el trato se habilita el contacto directo.</div>' +
      '<div style="font-size:0.78rem;color:var(--amber);margin-bottom:16px">' + (hasPremium ? '<span style="color:var(--green)">Plan PRO activo</span>' : 'Contacto gratuito') + '</div>' +
      '<button type="button" onclick="startNegotiation(\'' + car.id + '\')" style="width:100%;padding:13px;border-radius:var(--radius);background:var(--accent);color:#fff;border:none;cursor:pointer;font-weight:600;font-size:0.9rem;margin-bottom:8px">🤝 Negociar este vehículo</button>' +
      '<button type="button" onclick="openCarChat(\'' + car.id + '\')" style="width:100%;padding:10px;border-radius:var(--radius);background:var(--bg);color:var(--text2);border:1px solid var(--border);cursor:pointer;font-weight:500;font-size:0.84rem;margin-bottom:8px">💬 Solo chatear</button>' +
      (hasPremium ? '' : '<button type="button" onclick="closeCarDetail();navigate(\'suscripcion\')" style="width:100%;padding:9px;border-radius:var(--radius);background:transparent;color:var(--text3);border:1px solid var(--card-border);cursor:pointer;font-size:0.78rem">⭐ Premium — chats ilimitados</button>') +
      '</div>';
  }
}

function closeCarDetail() { document.getElementById('car-detail-modal').classList.add('hidden'); detailCar = null; }

function deleteCarFromDetail(id) {
  if (!confirm('¿Eliminar este vehículo? Los chats y propuestas también se eliminarán. Si se vendió, usá “Marcar vendido”.')) return;
  deleteCarData(id, false, function() {
    toast('Vehículo eliminado y chats eliminados', 'success');
    closeCarDetail();
    loadMyCars(); loadHomeData();
  });
}

function deleteCarData(id, sold, callback) {
  var car = carCache[id];
  if (!car) { if (callback) callback(); return; }
  if (sold) {
    // Conservamos mensajes/propuestas en Supabase y guardamos una ficha local del vehículo.
    archiveCarChats(car, function() {
      getSB().from('cars').delete().eq('id', id).eq('owner_id', currentUser.id).then(function(res) {
        if (res && res.error) { toast('No se pudo marcar como vendido', 'error'); return; }
        if (callback) callback();
      });
    });
  } else {
    // Eliminación real: borrar también todos los hilos del vehículo.
    getSB().from('messages').delete().eq('car_id', id).then(function() {
      getSB().from('cars').delete().eq('id', id).eq('owner_id', currentUser.id).then(function(res) {
        if (res && res.error) { toast('No se pudo eliminar el vehículo', 'error'); return; }
        try {
          var archived = JSON.parse(localStorage.getItem('chiaven_archived_cars') || '{}');
          delete archived[id];
          localStorage.setItem('chiaven_archived_cars', JSON.stringify(archived));
        } catch(e) {}
        if (callback) callback();
      });
    });
  }
}

function markCarSold(id, event) {
  if (event) event.stopPropagation();
  var car = carCache[id];
  if (!car) return;
  var input = prompt('Precio final de venta (podés dejarlo vacío):', car.precio ? String(car.precio) : '');
  if (input === null) return;
  var precioVenta = parseFloat(String(input).replace(/\./g, '').replace(',', '.')) || null;
  // Queda en la base como vendido (historial y estadísticas) y deja de verse en la red
  getSB().from('cars').update({ status: 'vendido', sold_at: new Date().toISOString(), precio_venta: precioVenta })
    .eq('id', id).eq('owner_id', currentUser.id).then(function(res) {
      if (res && res.error) {
        // Base sin las columnas nuevas (falta correr supabase/003_tanda1.sql): comportamiento anterior
        console.warn('Sin columna status, se usa el borrado anterior:', res.error);
        deleteCarData(id, true, function() {
          toast('✓ Vendido. Chats y propuestas conservados como historial.', 'success');
          loadMyCars(); loadHomeData();
        });
        return;
      }
      car.status = 'vendido';
      closeCarDetail();
      toast('✓ Marcado como vendido. Ya no aparece en la red; lo ves en Mis publicados → Vendidos.', 'success');
      loadMyCars(); loadHomeData();
    });
}

function markCarAvailable(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('¿Volver a publicar este vehículo en la red?')) return;
  getSB().from('cars').update({ status: 'disponible', sold_at: null, precio_venta: null })
    .eq('id', id).eq('owner_id', currentUser.id).then(function(res) {
      if (res && res.error) { toast('No se pudo volver a publicar', 'error'); return; }
      toast('Publicado nuevamente', 'success');
      loadMyCars(); loadHomeData();
    });
}

// ══ GALLERY ══
function openGallery(images, idx) {
  if (!images || !images.length) return;
  galleryImages = images; galleryIndex = idx;
  document.getElementById('gallery-img').src = images[idx];
  renderGalleryDots();
  document.getElementById('gallery-overlay').classList.remove('hidden');
}
function closeGallery() { document.getElementById('gallery-overlay').classList.add('hidden'); }
function galleryNav(dir) {
  galleryIndex = (galleryIndex + dir + galleryImages.length) % galleryImages.length;
  document.getElementById('gallery-img').src = galleryImages[galleryIndex];
  renderGalleryDots();
}
function renderGalleryDots() {
  var d = document.getElementById('gallery-dots');
  d.innerHTML = galleryImages.map(function(_, i) {
    return '<div class="gallery-dot ' + (i === galleryIndex ? 'active' : '') + '" onclick="galleryNav(' + (i - galleryIndex) + ')"></div>';
  }).join('');
}

// ══ HOME ══
function loadHomeData() {
  if (!currentUser) return;
  showSkeletons('home-recent-cars', 4);
  Promise.all([
    getSB().from('cars').select('*').order('destacado', { ascending: false }).limit(20),
    getSB().from('cars').select('*').eq('owner_id', currentUser.id),
    getSB().from('requests').select('id')
  ]).then(function(results) {
    var all = availableCars(results[0].data);
    var mine = availableCars(results[1].data);
    var reqs = results[2].data || [];
    allCarsCache = all;
    var oport = all.filter(function(c) { return c.es_oportunidad || c.es_super_oportunidad; });
    var h = new Date().getHours();
    var nombre = profileData.nombre || (currentUser.email && currentUser.email.split('@')[0]) || '';
    var greet = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('home-greeting').textContent = greet + ', ' + (nombre || 'Agencia') + '!';
    document.getElementById('metric-my-cars').textContent = mine.length;
    document.getElementById('metric-total-cars').textContent = all.length;
    document.getElementById('metric-requests').textContent = reqs.length;
    document.getElementById('metric-oport').textContent = oport.length;
    // Activity sidebar
    var actCars = document.getElementById('act-cars'); if(actCars) actCars.textContent = mine.length;
    var actReqs = document.getElementById('act-requests'); if(actReqs) actReqs.textContent = reqs.length;
    var actOport = document.getElementById('act-oport'); if(actOport) actOport.textContent = oport.length;
    var sub = getSubscription();
            // Match list
    loadHomeMatchList();
    // Topbar name
    var topName = document.getElementById('user-topbar-name');
    if (topName && nombre) topName.textContent = nombre;
    renderStatsChart(mine);
    var recent = all.slice(0, 6);
    var g = document.getElementById('home-recent-cars');
    g.innerHTML = recent.length ? recent.map(function(c) { return carCardHTML(c, c.owner_id === currentUser.id, null); }).join('') : '<div class="empty-state"><div class="empty-icon">🚗</div><div class="empty-text">Sin vehículos aún</div></div>';
  });
}

function renderStatsChart(mine) {
  var chart = document.getElementById('stats-bar-chart');
  if (!mine.length) { chart.innerHTML = '<div style="color:var(--text3);font-size:0.82rem">Publicá autos para ver estadísticas</div>'; return; }
  var byMarca = {};
  mine.forEach(function(c) { byMarca[c.marca] = (byMarca[c.marca] || 0) + 1; });
  var sorted = Object.keys(byMarca).map(function(k) { return [k, byMarca[k]]; }).sort(function(a,b) { return b[1]-a[1]; }).slice(0, 8);
  var maxVal = sorted[0][1];
  var colors = ['var(--accent)','var(--green)','var(--amber)','#8b5cf6','#ec4899','var(--accent2)','#06b6d4','#f97316'];
  chart.innerHTML = sorted.map(function(item, i) {
    var pct = Math.round((item[1] / maxVal) * 100);
    return '<div class="bar-wrap"><div class="bar-val">' + item[1] + '</div><div class="bar" style="height:' + pct + 'px;background:' + colors[i % colors.length] + '" title="' + item[0] + ': ' + item[1] + '"></div><div class="bar-label">' + item[0] + '</div></div>';
  }).join('');
}

// ══ ALL VEHICLES ══
function loadAllVehicles() {
  if (!currentUser) return;
  showSkeletons('all-cars-grid', 6);
  restoreVehicleFilters();
  getSB().from('cars').select('*').order('destacado', { ascending: false }).then(function(result) {
    allCarsCache = availableCars(result.data);
    fillVehicleBrandOptions();
    filterVehicles();
  });
}

var VEHICLE_FILTER_IDS = ['v-search','v-marca','v-modelo','v-anio-min','v-anio-max','v-price-min','v-price-max','v-km-max','v-combustible','v-transmision','v-permuta','v-fotos','v-provincia','v-location','v-sort'];
var VEHICLE_FILTERS_KEY = 'chiaven_vehicle_filters';
var VEHICLES_PAGE_SIZE = 24;
var vehiclesShown = VEHICLES_PAGE_SIZE;
var _vehicleFilterTimer = null;

// Sin acentos ni mayúsculas, para que "citroen" encuentre "Citroën"
function normTxt(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

// Los autos vendidos quedan en la base (historial) pero no se muestran en la red
function availableCars(list) { return (list || []).filter(function(c) { return c.status !== 'vendido'; }); }

function networkCars() { return (allCarsCache || []).filter(function(c) { return !currentUser || c.owner_id !== currentUser.id; }); }

function fillSelect(id, values, emptyLabel, keep) {
  var el = document.getElementById(id);
  if (!el) return;
  var current = keep !== undefined ? keep : el.value;
  el.innerHTML = '<option value="">' + emptyLabel + '</option>' + values.map(function(v) {
    return '<option value="' + esc(v[0]) + '">' + esc(v[0]) + (v[1] ? ' (' + v[1] + ')' : '') + '</option>';
  }).join('');
  // Si el valor guardado ya no existe en la red, se vuelve a "Todas"
  el.value = values.some(function(v) { return v[0] === current; }) ? current : '';
}

function countBy(cars, field) {
  var counts = {}, label = {};
  cars.forEach(function(c) {
    var raw = String(c[field] || '').trim();
    if (!raw) return;
    var k = normTxt(raw);
    counts[k] = (counts[k] || 0) + 1;
    if (!label[k]) label[k] = raw;
  });
  return Object.keys(counts).map(function(k) { return [label[k], counts[k]]; })
    .sort(function(a, b) { return a[0].localeCompare(b[0], 'es'); });
}

// Suma al conteo de la red los nombres del catálogo que todavía no tienen autos (con 0)
function withCatalog(values, names) {
  var seen = {};
  values.forEach(function(v) { seen[normTxt(v[0])] = true; });
  names.forEach(function(n) { if (!seen[normTxt(n)]) values.push([n, 0]); });
  return values.sort(function(a, b) { return a[0].localeCompare(b[0], 'es', { numeric: true }); });
}

function fillVehicleBrandOptions() {
  var saved = loadVehicleFilterState();
  var marcaEl = document.getElementById('v-marca');
  fillSelect('v-marca', withCatalog(countBy(networkCars(), 'marca'), Object.keys(CATALOGO_VEHICULOS)), 'Todas', marcaEl.value || saved['v-marca'] || '');
  fillVehicleModelOptions(document.getElementById('v-modelo').value || saved['v-modelo'] || '');
}

function fillVehicleModelOptions(keep) {
  var marcaRaw = document.getElementById('v-marca').value;
  var marca = normTxt(marcaRaw);
  var cars = networkCars().filter(function(c) { return !marca || normTxt(c.marca) === marca; });
  var catalogo = [];
  if (marca) Object.keys(CATALOGO_VEHICULOS).forEach(function(m) { if (normTxt(m) === marca) catalogo = CATALOGO_VEHICULOS[m]; });
  var modeloEl = document.getElementById('v-modelo');
  if (!marca) {
    modeloEl.innerHTML = '<option value="">Elegí una marca</option>';
    modeloEl.disabled = true;
    return;
  }
  modeloEl.disabled = false;
  fillSelect('v-modelo', withCatalog(countBy(cars, 'modelo'), catalogo), 'Todos', keep);
}

// Opciones fijas de los filtros de rango (año, precio, km)
function fillVehicleRangeOptions() {
  var anios = [];
  for (var y = new Date().getFullYear(); y >= 1990; y--) anios.push(String(y));
  var precios = [2, 5, 8, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150].map(function(m) { return [String(m * 1000000), '$' + m + ' M']; });
  var kms = [0, 10000, 30000, 50000, 80000, 100000, 150000, 200000].map(function(k) { return [String(k || 1), k ? k.toLocaleString('es-AR') + ' km' : '0 km']; });
  function fill(id, emptyLabel, opts) {
    var el = document.getElementById(id);
    if (!el || el.tagName !== 'SELECT') return;
    var current = el.value;
    el.innerHTML = '<option value="">' + emptyLabel + '</option>' + opts.map(function(o) {
      if (typeof o === 'string') o = [o, o];
      return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>';
    }).join('');
    el.value = current;
  }
  fill('v-anio-min', 'Cualquiera', anios);
  fill('v-anio-max', 'Cualquiera', anios);
  fill('v-price-min', 'Sin mínimo', precios);
  fill('v-price-max', 'Sin límite', precios);
  fill('v-km-max', 'Sin límite', kms);
  fill('v-combustible', 'Todos', CAR_COMBUSTIBLES);
  fill('v-transmision', 'Todas', CAR_TRANSMISIONES);
}
document.addEventListener('DOMContentLoaded', function() { fillVehicleRangeOptions(); fillVehicleBrandOptions(); });

function onVehicleMarcaChange() {
  fillVehicleModelOptions('');
  filterVehicles();
}

function filterVehiclesSoon() {
  clearTimeout(_vehicleFilterTimer);
  _vehicleFilterTimer = setTimeout(filterVehicles, 200);
}

function loadVehicleFilterState() {
  try { return JSON.parse(localStorage.getItem(VEHICLE_FILTERS_KEY) || '{}'); } catch(e) { return {}; }
}

function saveVehicleFilters() {
  var state = { cond: vehicleCondFilter };
  VEHICLE_FILTER_IDS.forEach(function(id) { var el = document.getElementById(id); if (el && el.value) state[id] = el.value; });
  try { localStorage.setItem(VEHICLE_FILTERS_KEY, JSON.stringify(state)); } catch(e) {}
}

function restoreVehicleFilters() {
  var state = loadVehicleFilterState();
  VEHICLE_FILTER_IDS.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el || state[id] === undefined) return;
    if (el.tagName === 'SELECT' && !el.querySelector('option[value="' + String(state[id]).replace(/"/g, '\\"') + '"]')) {
      el.appendChild(new Option(state[id], state[id])); // se reemplaza al cargar las opciones reales
    }
    el.value = state[id];
  });
  fillLocalidadList('v-provincia', 'v-location', state['v-location'] || '');
  vehicleCondFilter = state.cond || 'all';
  var conds = ['all', 'usado', 'nuevo'];
  document.querySelectorAll('#page-vehicles .cond-tab').forEach(function(t, i) { t.classList.toggle('active', conds[i] === vehicleCondFilter); });
}

function setVehicleCondTab(cond, el) {
  document.querySelectorAll('#page-vehicles .cond-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  vehicleCondFilter = cond;
  filterVehicles();
}

var VEHICLE_SORTS = {
  destacados:  null, // orden que trae la base (destacados primero)
  recientes:   function(a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); },
  precio_asc:  function(a, b) { return (a.precio || Infinity) - (b.precio || Infinity); },
  precio_desc: function(a, b) { return (b.precio || 0) - (a.precio || 0); },
  anio_desc:   function(a, b) { return (b.anio || 0) - (a.anio || 0); },
  km_asc:      function(a, b) { return (a.km == null ? Infinity : a.km) - (b.km == null ? Infinity : b.km); }
};

function filterVehicles(keepPage) {
  if (!keepPage) vehiclesShown = VEHICLES_PAGE_SIZE;
  var words = normTxt(document.getElementById('v-search').value).split(/\s+/).filter(Boolean);
  var marca = normTxt(document.getElementById('v-marca').value);
  var modelo = normTxt(document.getElementById('v-modelo').value);
  var anioMin = parseInt(document.getElementById('v-anio-min').value) || 0;
  var anioMax = parseInt(document.getElementById('v-anio-max').value) || 9999;
  var priceMin = parseFloat(document.getElementById('v-price-min').value) || 0;
  var priceMax = parseFloat(document.getElementById('v-price-max').value) || Infinity;
  var kmMax = parseFloat(document.getElementById('v-km-max').value) || Infinity;
  var combustible = document.getElementById('v-combustible').value;
  var transmision = document.getElementById('v-transmision').value;
  var soloPermuta = document.getElementById('v-permuta').value === 'si';
  var soloFotos = document.getElementById('v-fotos').value === 'si';
  var prov = normTxt(document.getElementById('v-provincia').value);
  var loc = normTxt(document.getElementById('v-location').value);
  var filtered = networkCars();
  if (vehicleCondFilter !== 'all') filtered = filtered.filter(function(c) { return c.condicion === vehicleCondFilter; });
  // Cada palabra tiene que aparecer en algún dato del auto: "ford ka rojo" funciona
  if (words.length) filtered = filtered.filter(function(c) {
    var hay = normTxt([c.marca, c.modelo, c.version, c.color, c.combustible, c.transmision, c.localidad, c.provincia, c.anio].join(' '));
    return words.every(function(w) { return hay.indexOf(w) >= 0; });
  });
  if (marca) filtered = filtered.filter(function(c) { return normTxt(c.marca) === marca; });
  if (modelo) filtered = filtered.filter(function(c) { return normTxt(c.modelo) === modelo; });
  if (anioMin > 0) filtered = filtered.filter(function(c) { return (c.anio || 0) >= anioMin; });
  if (anioMax < 9999) filtered = filtered.filter(function(c) { return (c.anio || 9999) <= anioMax; });
  if (priceMin > 0) filtered = filtered.filter(function(c) { return (c.precio || 0) >= priceMin; });
  if (priceMax < Infinity) filtered = filtered.filter(function(c) { return (c.precio || 0) <= priceMax; });
  if (kmMax < Infinity) filtered = filtered.filter(function(c) { return (c.km || 0) <= kmMax; });
  if (combustible) filtered = filtered.filter(function(c) { return c.combustible === combustible; });
  if (transmision) filtered = filtered.filter(function(c) { return c.transmision === transmision; });
  if (soloPermuta) filtered = filtered.filter(function(c) { return !!c.acepta_permuta; });
  if (soloFotos) filtered = filtered.filter(function(c) { return (Array.isArray(c.images) && c.images.length) || !!c.image_url; });
  if (prov) filtered = filtered.filter(function(c) { return normTxt(c.provincia) === prov; });
  if (loc) filtered = filtered.filter(function(c) { return normTxt(c.localidad).indexOf(loc) >= 0; });
  var sortFn = VEHICLE_SORTS[document.getElementById('v-sort').value];
  if (sortFn) filtered = filtered.slice().sort(sortFn);
  saveVehicleFilters();
  updateVehicleFiltersToggle();
  document.getElementById('vehicles-count-label').textContent = filtered.length + (filtered.length === 1 ? ' vehículo' : ' vehículos');
  var g = document.getElementById('all-cars-grid');
  var page = filtered.slice(0, vehiclesShown);
  g.innerHTML = page.length ? page.map(function(c) { return carCardHTML(c, false, null); }).join('') : '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">Sin resultados</div><div class="empty-sub">Probá con otros filtros o <a href="#" onclick="clearVehicleFilters();return false" style="color:var(--accent)">limpiá la búsqueda</a></div></div>';
  var more = document.getElementById('v-more');
  if (more) {
    var rest = filtered.length - page.length;
    more.style.display = rest > 0 ? 'inline-block' : 'none';
    more.textContent = 'Ver más (' + rest + ')';
  }
}

function toggleVehicleFilters() {
  var bar = document.getElementById('v-filters-bar');
  var open = bar.classList.toggle('open');
  document.getElementById('v-filters-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
}

// En celular los filtros van plegados; el botón muestra cuántos hay activos
function updateVehicleFiltersToggle() {
  var btn = document.getElementById('v-filters-toggle');
  if (!btn) return;
  var n = VEHICLE_FILTER_IDS.filter(function(id) {
    if (id === 'v-search' || id === 'v-sort') return false;
    var el = document.getElementById(id); return el && el.value;
  }).length;
  btn.textContent = '⚙️ Filtros' + (n ? ' (' + n + ')' : '');
}

function showMoreVehicles() {
  vehiclesShown += VEHICLES_PAGE_SIZE;
  filterVehicles(true);
}

function clearVehicleFilters() {
  VEHICLE_FILTER_IDS.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = id === 'v-sort' ? 'destacados' : ''; });
  vehicleCondFilter = 'all';
  document.querySelectorAll('#page-vehicles .cond-tab').forEach(function(t, i) { t.classList.toggle('active', i === 0); });
  fillVehicleModelOptions('');
  fillLocalidadList('v-provincia', 'v-location', '');
  filterVehicles();
}

// ══ MY CARS ══
function loadMyCars() {
  if (!currentUser) return;
  showSkeletons('my-cars-grid', 3);
  getSB().from('cars').select('*').eq('owner_id', currentUser.id).order('created_at', { ascending: false }).then(function(result) {
    myCarsCache = result.data || [];
    renderMyCars();
  });
}

var myCarsCache = [];
var myCarsFilter = 'disponibles';
function setMyCarsFilter(f, el) {
  myCarsFilter = f;
  document.querySelectorAll('#my-cars-tabs .cond-tab').forEach(function(t) { t.classList.toggle('active', t === el); });
  renderMyCars();
}
function renderMyCars() {
  var g = document.getElementById('my-cars-grid');
  if (!g) return;
  var vendidos = myCarsCache.filter(function(c) { return c.status === 'vendido'; });
  var disponibles = myCarsCache.filter(function(c) { return c.status !== 'vendido'; });
  var counts = { disponibles: disponibles.length, vendidos: vendidos.length, todos: myCarsCache.length };
  document.querySelectorAll('#my-cars-tabs .cond-tab').forEach(function(t) {
    var k = t.getAttribute('data-f'); var c = t.querySelector('.tab-count'); if (c) c.textContent = counts[k];
  });
  var data = myCarsFilter === 'vendidos' ? vendidos : myCarsFilter === 'todos' ? myCarsCache : disponibles;
  var empty = myCarsFilter === 'vendidos' ? 'Todavía no marcaste autos como vendidos' : 'No tenés autos publicados';
  g.innerHTML = data.length ? data.map(function(c) { return carCardHTML(c, true, null); }).join('') : '<div class="empty-state"><div class="empty-icon">🚗</div><div class="empty-text">' + empty + '</div></div>';
}

function deleteCar(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('¿Eliminar este vehículo? Los chats y propuestas también se eliminarán. Si se vendió, usá “Vendido”.')) return;
  deleteCarData(id, false, function() {
    toast('Vehículo eliminado y chats eliminados', 'success');
    loadMyCars(); loadHomeData();
  });
}

// ══ MY REQUESTS ══
function loadMyRequests() {
  if (!currentUser) return;
  var rl = document.getElementById('my-requests-list');
  if (!rl) return;
  getSB().from('requests').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).then(function(result) {
    var reqs = result.data || [];
    if (!reqs.length) { rl.innerHTML = '<div class="empty-state"><div class="empty-icon">📢</div><div class="empty-text">No tenés pedidos publicados</div></div>'; return; }
    rl.innerHTML = reqs.map(function(req) {
      var rj = JSON.stringify(req).replace(/"/g,'&quot;');
      return '<div style="background:var(--navy3);border:1px solid var(--card-border);border-left:3px solid var(--accent);border-radius:var(--radius-lg);padding:16px 18px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px;flex-wrap:wrap"><div style="font-size:0.85rem;line-height:1.5;color:var(--text2);flex:1">' + esc(req.texto) + '</div><div style="font-size:1rem;font-weight:700;color:var(--green);white-space:nowrap">' + (req.presupuesto ? fmtPrice(req.presupuesto) : '') + '</div></div>' +
        (req.marca ? '<div style="font-size:0.75rem;color:var(--text3);margin-bottom:8px">Busca: <strong style="color:var(--text2)">' + esc(req.marca) + ' ' + esc(req.modelo || '') + '</strong></div>' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn-sm" onclick=\'openEditReq(event,' + rj + ')\'>✏️ Editar</button><button type="button" class="btn-sm danger" onclick="deleteRequest(\'' + req.id + '\',event)">Eliminar</button><button type="button" class="btn-sm primary" onclick=\'openMatchModal(' + rj + ')\'>🎯 Ver matches</button></div>' +
        '<div style="font-size:0.7rem;color:var(--text3);margin-top:8px">' + fmtDate(req.created_at) + '</div></div>';
    }).join('');
  });
}

function deleteRequest(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('¿Eliminar este pedido?')) return;
  getSB().from('requests').delete().eq('id', id).eq('user_id', currentUser.id).then(function() {
    toast('Pedido eliminado', 'success');
    loadMyRequests();
  });
}
