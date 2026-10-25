// ══ FINANCIACION ══
function initFinanciacion() {
  renderFinTable('a', 0);
  renderFinTable('b', 0);
}
function renderFinTable(tipo, monto) {
  var coefs = tipo === 'a' ? COEF_A : COEF_B;
  var tbody = document.getElementById('fin-body-' + tipo);
  if (!tbody) return;
  tbody.innerHTML = coefs.map(function(row) {
    var cuota = '—';
    var isHigh = false;
    if (monto > 0) {
      var val = (monto / 1000) * row.coef;
      cuota = '$' + Math.round(val).toLocaleString('es-AR');
      isHigh = val < monto * 0.12;
    }
    return '<tr><td><strong>' + row.cuotas + '</strong></td><td style="color:var(--text2)">' + row.coef.toFixed(2) + '</td><td class="cuota-val ' + (isHigh ? 'highlight' : '') + '">' + cuota + '</td></tr>';
  }).join('');
}
function calcFinanciacion(tipo) {
  var monto = parseFloat(document.getElementById('fin-monto-' + tipo).value) || 0;
  renderFinTable(tipo, monto);
}

// ══ NEWS ══
function loadNews() {
  var grid = document.getElementById('news-grid');
  if (!grid) return;
  grid.innerHTML = NEWS_SOURCES.map(function(n, i) {
    return '<div class="news-card" onclick="openNewsPreview(' + i + ')">' +
      '<div class="news-card-img"><img src="' + n.img + '" alt="' + esc(n.title) + '" loading="lazy" onerror="this.parentElement.innerHTML=\'🚗\'"></div>' +
      '<div class="news-card-body"><div class="news-card-source">' + esc(n.source) + '</div><div class="news-card-title">' + esc(n.title) + '</div><div class="news-card-date">🕒 ' + n.date + '</div></div></div>';
  }).join('');
}
function openNewsPreview(idx) {
  var n = NEWS_SOURCES[idx];
  document.getElementById('news-preview-img').src = n.img;
  document.getElementById('news-preview-source').textContent = n.source;
  document.getElementById('news-preview-title').textContent = n.title;
  document.getElementById('news-preview-date').textContent = '🕒 ' + n.date;
  document.getElementById('news-preview-text').textContent = n.preview;
  document.getElementById('news-preview-link').href = n.url;
  document.getElementById('news-preview-modal').classList.remove('hidden');
}

// ══ CURRENCY ══
function loadCurrencyRates() {
  fetchT('https://dolarapi.com/v1/dolares/blue', {}, 8000).then(function(r) {
    return r.json().then(function(d) {
      window.USD_RATE = Math.round(d.venta);
      document.getElementById('top-usd').textContent = '$' + Math.round(d.venta).toLocaleString('es-AR');
      document.getElementById('top-usd-label').textContent = 'Blue';
    });
  }).catch(function() {
    fetchT('https://api.exchangerate-api.com/v4/latest/USD', {}, 8000).then(function(r) {
      return r.json().then(function(d) { window.USD_RATE = Math.round(d.rates.ARS); document.getElementById('top-usd').textContent = '$' + Math.round(d.rates.ARS).toLocaleString('es-AR'); });
    }).catch(function() {});
  });
  fetchT('https://dolarapi.com/v1/cotizaciones/eur', {}, 8000).then(function(r) {
    return r.json().then(function(d) { document.getElementById('top-eur').textContent = '$' + Math.round(d.venta).toLocaleString('es-AR'); });
  }).catch(function() {});
}
function startTopbarClock() {
  var el = document.getElementById('top-time');
  if (!el) return;
  var tick = function() { el.textContent = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); };
  tick();
  setInterval(tick, 30000);
}

// ══ NOTIFICATIONS ══
// Viven en Supabase (tabla notifications) para verse desde cualquier dispositivo. Si la tabla
// todavía no existe (falta correr supabase/003_tanda1.sql) se siguen guardando en el navegador.
var notificationsCache = null;   // null = todavía no se cargaron de la base
var notificationsRemote = false;
function localNotifications() { try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch(e) { return []; } }
function getNotifications() { return notificationsCache ? notificationsCache.slice() : localNotifications(); }
function saveNotifications(n) {
  n = n.slice(0, 50);
  if (notificationsRemote) notificationsCache = n;
  else localStorage.setItem(NOTIF_KEY, JSON.stringify(n));
}
function notifRow(n) {
  return { id: String(n.id), user_id: currentUser.id, icon: n.icon || null, text: String(n.text || ''), sub: n.sub || null, type: n.type || null, action: n.action || null, read: !!n.read, ts: n.ts || new Date().toISOString() };
}
function loadNotifications() {
  if (!currentUser) return Promise.resolve();
  return getSB().from('notifications').select('*').eq('user_id', currentUser.id).order('ts', { ascending: false }).limit(50).then(function(r) {
    if (r.error) { notificationsRemote = false; notificationsCache = null; updateNotifBadge(); return; }
    notificationsRemote = true;
    notificationsCache = r.data || [];
    // Migración única: subir lo que estaba guardado solo en este navegador
    var local = localNotifications();
    var known = {};
    notificationsCache.forEach(function(n) { known[String(n.id)] = true; });
    var pending = local.filter(function(n) { return n && n.id && !known[String(n.id)]; });
    if (pending.length) {
      notificationsCache = notificationsCache.concat(pending.map(notifRow))
        .sort(function(a, b) { return new Date(b.ts) - new Date(a.ts); }).slice(0, 50);
      getSB().from('notifications').upsert(pending.map(notifRow), { ignoreDuplicates: true }).then(function(w) {
        if (!w.error) { try { localStorage.removeItem(NOTIF_KEY); } catch(e) {} }
      });
    } else if (local.length) {
      try { localStorage.removeItem(NOTIF_KEY); } catch(e) {}
    }
    updateNotifBadge();
  });
}
function addNotification(icon, text, sub, type, action) {
  var item = { id: String(Date.now()) + Math.random().toString(36).slice(2, 6), icon: icon, text: text, sub: sub || '', type: type || 'default', action: action || null, read: false, ts: new Date().toISOString() };
  var n = getNotifications();
  n.unshift(item);
  saveNotifications(n); updateNotifBadge();
  if (notificationsRemote && currentUser) {
    getSB().from('notifications').insert(notifRow(item)).then(function(r) {
      if (r.error) console.error('No se pudo guardar la notificación:', r.error);
    });
  }
}
function updateNotifBadge() {
  var unread = getNotifications().filter(function(n) { return !n.read; }).length;
  var count = document.getElementById('notif-count');
  var bell = document.getElementById('notif-bell');
  if (!count) return;
  if (unread > 0) { count.style.display = 'flex'; count.textContent = unread > 9 ? '9+' : String(unread); if (bell) bell.style.opacity = '1'; }
  else { count.style.display = 'none'; if (bell) bell.style.opacity = '0.7'; }
}
function openNotifications() {
  var notifs = getNotifications();
  var list = document.getElementById('notif-list');
  if (!list) return;
  if (!notifs.length) { list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3);font-size:0.85rem">Sin notificaciones</div>'; }
  else {
    list.innerHTML = notifs.map(function(n) {
      var cls = n.read ? 'notif-item' : (n.type === 'amber' ? 'notif-item unread-amber' : n.type === 'green' ? 'notif-item unread-green' : 'notif-item unread');
      var time = n.ts ? new Date(n.ts).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      return '<div class="' + cls + '" onclick="clickNotif(\'' + esc(String(n.id)) + '\')"><div class="notif-icon">' + (n.icon || '🔔') + '</div><div style="flex:1"><div class="notif-text">' + n.text + '</div>' + (n.sub ? '<div class="notif-sub">' + n.sub + '</div>' : '') + '<div class="notif-sub" style="margin-top:4px">' + time + '</div></div></div>';
    }).join('');
  }
  var hadUnread = notifs.some(function(n) { return !n.read; });
  notifs.forEach(function(n) { n.read = true; }); saveNotifications(notifs); updateNotifBadge();
  if (hadUnread && notificationsRemote && currentUser) {
    getSB().from('notifications').update({ read: true }).eq('user_id', currentUser.id).eq('read', false).then(function(r) {
      if (r.error) console.error('No se pudieron marcar como leídas:', r.error);
    });
  }
  document.getElementById('notif-modal').classList.remove('hidden');
}
function clickNotif(id) {
  var n = getNotifications().filter(function(x) { return String(x.id) === String(id); })[0];
  closeNotifications();
  closeChat();
  if (n && n.action) setTimeout(function() {
    if (String(n.action).indexOf('operation:') === 0) {
      var opId = String(n.action).split(':')[1];
      var op = getOperations().find(function(o) { return o.id === opId; });
      if (op) {
        activeOperation = op;
        openNegotiationModal(op);
        return;
      }
    }
    navigate(n.action);
  }, 200);
}
function closeNotifications() { var m = document.getElementById('notif-modal'); if (m) m.classList.add('hidden'); }
function clearAllNotifications() {
  saveNotifications([]);
  if (notificationsRemote && currentUser) {
    getSB().from('notifications').delete().eq('user_id', currentUser.id).then(function(r) {
      if (r.error) toast('No se pudieron borrar las notificaciones', 'error');
    });
  }
  openNotifications();
}

function checkForNewMatches() {
  if (!currentUser) return;
  getSB().from('requests').select('*').eq('user_id', currentUser.id).then(function(r1) {
    getSB().from('cars').select('*').neq('owner_id', currentUser.id).then(function(r2) {
      var reqs = r1.data || []; var cars = availableCars(r2.data);
      if (!reqs.length || !cars.length) return;
      var lastCheck = localStorage.getItem('last_match_check') || '2000-01-01';
      var newCars = cars.filter(function(c) { return c.created_at > lastCheck; });
      if (!newCars.length) return;
      reqs.forEach(function(req) {
        var matches = newCars.map(function(c) { return Object.assign({}, c, { match: calcularMatch(c, req) }); }).filter(function(c) { return c.match >= 70; }).sort(function(a,b) { return b.match-a.match; });
        if (matches.length > 0) { var top = matches[0]; addNotification('🎯', 'Nuevo match ' + top.match + '% para tu pedido', (top.marca||'') + ' ' + (top.modelo||'') + ' ' + (top.anio||''), 'green', 'requests'); }
      });
      localStorage.setItem('last_match_check', new Date().toISOString());
    });
  });
}
function checkForDeals() {
  if (!currentUser) return;
  getSB().from('cars').select('*').eq('es_super_oportunidad', true).order('created_at', { ascending: false }).limit(5).then(function(res) {
    var cars = availableCars(res.data);
    var lastCheck = localStorage.getItem('last_deal_check') || '2000-01-01';
    var newDeals = cars.filter(function(c) { return c.created_at > lastCheck && c.owner_id !== currentUser.id; });
    newDeals.forEach(function(c) { addNotification('🔥🔥', 'Super Oportunidad: ' + (c.marca||'') + ' ' + (c.modelo||''), (c.localidad||'') + (c.precio ? ' · ' + fmtPrice(c.precio) : ''), 'amber', 'vehicles'); });
    if (newDeals.length) localStorage.setItem('last_deal_check', new Date().toISOString());
  });
}

// ══ SIDEBAR TOGGLE ══
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  var btn = document.getElementById('sidebar-toggle-btn');
  var arrow = document.getElementById('toggle-arrow');
  var mainEl = document.getElementById('main');
  var topbarEl = document.getElementById('topbar');
  if (btn) btn.style.left = sidebarCollapsed ? '46px' : 'calc(var(--sidebar-w) - 13px)';
  if (arrow) arrow.style.transform = sidebarCollapsed ? 'rotate(180deg)' : '';
  if (mainEl) mainEl.style.marginLeft = sidebarCollapsed ? '60px' : 'var(--sidebar-w)';
  if (topbarEl) topbarEl.style.left = sidebarCollapsed ? '60px' : 'var(--sidebar-w)';
}

// ══ CREDIT FORM ══
function handleCreditFile(input, areaId, dataId, label) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById(dataId).value = e.target.result;
    var area = document.getElementById(areaId);
    area.textContent = '✅ ' + label + ' cargada';
    area.classList.add('has-file');
  };
  reader.readAsDataURL(input.files[0]);
  input.value = '';
}

function submitCreditRequest() {
  var fields = ['cr-dni','cr-nombre','cr-ingresos','cr-profesion','cr-direccion','cr-localidad','cr-telefono','cr-email','cr-marca','cr-modelo','cr-anio'];
  var errEl = document.getElementById('cr-error');
  var okEl = document.getElementById('cr-ok');
  var btn = document.getElementById('btn-credit');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  for (var fi = 0; fi < fields.length; fi++) {
    var el = document.getElementById(fields[fi]);
    if (!el || !el.value.trim()) { errEl.textContent = 'Completá todos los campos obligatorios.'; errEl.style.display = 'block'; if (el) el.focus(); return; }
  }
  btn.disabled = true; btn.textContent = 'Enviando...';
  var d = {
    nombre: document.getElementById('cr-nombre').value,
    dni: document.getElementById('cr-dni').value,
    ingresos: Number(document.getElementById('cr-ingresos').value).toLocaleString('es-AR'),
    profesion: document.getElementById('cr-profesion').value,
    direccion: document.getElementById('cr-direccion').value,
    localidad: document.getElementById('cr-localidad').value,
    telefono: document.getElementById('cr-telefono').value,
    email: document.getElementById('cr-email').value,
    marca: document.getElementById('cr-marca').value,
    modelo: document.getElementById('cr-modelo').value,
    anio: document.getElementById('cr-anio').value,
    combustible: document.getElementById('cr-combustible').value,
    gnc: document.getElementById('cr-gnc').checked ? 'Sí' : 'No'
  };
  fetchT('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ access_key: '44aeae16-bc0d-46bc-937e-47f9c5d2d8c8', subject: '🚗 Solicitud crédito - ' + d.nombre + ' | Chiaven', from_name: 'Chiaven Platform', nombre: d.nombre, dni: d.dni, ingresos: '$' + d.ingresos, profesion: d.profesion, direccion: d.direccion + ', ' + d.localidad, telefono: d.telefono, email_cliente: d.email, vehiculo: d.marca + ' ' + d.modelo + ' ' + d.anio, combustible: d.combustible, gnc: d.gnc, dni_foto: document.getElementById('cr-dni-data').value ? 'Adjuntada' : 'No adjuntada', tarjeta_verde: document.getElementById('cr-tv-data').value ? 'Adjuntada' : 'No adjuntada' })
  }, 15000).then(function(res) {
    return res.json().then(function(json) {
      btn.disabled = false; btn.textContent = 'Enviar solicitud';
      if (json.success === true) {
        okEl.textContent = '✅ Solicitud enviada. Te contactamos en 24hs.';
        okEl.style.display = 'block';
        toast('Solicitud enviada correctamente', 'success');
        fields.forEach(function(id) { var e = document.getElementById(id); if(e) e.value=''; });
        var gnc = document.getElementById('cr-gnc'); if (gnc) gnc.checked = false;
        var a1 = document.getElementById('cr-dni-area'); if (a1) { a1.classList.remove('has-file'); a1.textContent='📄 Subir foto del DNI'; }
        var a2 = document.getElementById('cr-tv-area'); if (a2) { a2.classList.remove('has-file'); a2.textContent='🚗 Subir tarjeta verde'; }
      } else {
        var mb = 'SOLICITUD DE CREDITO\n\nNombre: '+d.nombre+'\nDNI: '+d.dni+'\nIngresos: $'+d.ingresos+'\nProfesion: '+d.profesion+'\nDireccion: '+d.direccion+', '+d.localidad+'\nTelefono: '+d.telefono+'\nEmail: '+d.email+'\nVehiculo: '+d.marca+' '+d.modelo+' '+d.anio+'\nCombustible: '+d.combustible+'\nGNC: '+d.gnc;
        var ml = document.createElement('a');
        ml.href = 'mailto:marcochiavassa96@gmail.com?subject='+encodeURIComponent('Solicitud credito - '+d.nombre)+'&body='+encodeURIComponent(mb);
        ml.style.display = 'none'; document.body.appendChild(ml); ml.click();
        setTimeout(function() { if (ml.parentNode) ml.parentNode.removeChild(ml); }, 1000);
        okEl.textContent = 'Solicitud procesada. Revisá tu cliente de correo.';
        okEl.style.display = 'block';
        toast('Solicitud procesada', 'success');
      }
    });
  }).catch(function(e) {
    btn.disabled = false; btn.textContent = 'Enviar solicitud';
    errEl.textContent = 'Error al enviar. Intentá de nuevo.'; errEl.style.display = 'block';
  });
}
