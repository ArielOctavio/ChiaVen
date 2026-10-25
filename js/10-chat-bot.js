// ══════════════════════════════════════════════
// CHAT SYSTEM
// ══════════════════════════════════════════════
var chatSessions = {}; // carId -> [{role,text,ts}]


// ── SMART BOT ENGINE ──
var BOT_RESPONSES = {
  permuta: [
    '🔄 ¡Sí, aceptamos permutas! Para darte una valuación necesito saber: <strong>¿qué marca, modelo, año y km tiene tu auto?</strong>',
    '🔄 Claro que sí. Trabajamos con permuta total o parcial. Mandame los datos de tu vehículo (marca, modelo, año, km) y te damos una valuación.',
  ],
  pago: [
    '💳 Aceptamos estas formas de pago:<br>• <strong>Efectivo</strong> (con descuento especial)<br>• <strong>Transferencia bancaria</strong><br>• <strong>Financiación BNA</strong> hasta 60 cuotas<br>• <strong>Cheque certificado</strong><br><br>¿Cuál te conviene más?',
    '💳 Para pago en efectivo podemos hablar de un descuento adicional. Para financiación BNA calculamos la cuota ahí mismo. ¿Qué forma preferís?',
  ],
  financiacion: [
    '🏦 Te cuento cómo funciona el crédito BNA:<br>• Hasta <strong>70% del valor InfoAuto</strong><br>• Máximo <strong>$55.000.000</strong><br>• Plazo: hasta <strong>60 cuotas</strong><br>• Tasa: <strong>45% TNA</strong><br><br>¿Querés que calcule la cuota para este vehículo?',
    '🏦 Con BNA podés financiar hasta el 70% del valor. ¿Cuánto necesitás financiar? Te calculo la cuota mensual estimada.',
  ],
  papeles: [
    '📋 El vehículo tiene toda la documentación al día:<br>• ✅ Título original<br>• ✅ VTV vigente<br>• ✅ Libre deuda de patentes<br>• ✅ Informe de dominio limpio<br>• ✅ Seguro al día<br><br>Al momento de la transferencia te entregamos todo.',
    '📋 Sí, todos los papeles están en orden. Podés pedir el informe de dominio en el Registro del Automotor para verificarlo antes de firmar.',
  ],
  precio: [
    '💰 El precio publicado es de referencia y <strong>es negociable</strong> según la forma de pago. Pagando al contado podemos conversar un descuento. ¿Tenés alguna oferta en mente?',
    '💰 Podemos hablar del precio. ¿Estás pensando en pagar al contado, financiado o con permuta? Así te doy el mejor precio según tu caso.',
  ],
  entrega: [
    '🚗 La entrega se coordina una vez confirmada la seña. Podemos:<br>• Entrega en nuestra agencia<br>• Coordinamos día y horario a tu conveniencia<br><br>¿Tenés alguna fecha tentativa en mente?',
    '🚗 Perfecto. Una vez que cerremos el trato te contactamos para coordinar día, lugar y hora de entrega. ¿Estás en la misma localidad o necesitás envío?',
  ],
  garantia: [
    '🛡️ Ofrecemos <strong>3 meses de garantía mecánica</strong> sobre motor y caja incluida en el precio. También tenés la opción de contratar garantía extendida de hasta 12 meses. ¿Te interesa la cobertura extendida?',
    '🛡️ La garantía incluye motor, caja y tren delantero por 3 meses. Para garantía extendida (hasta 1 año) hay un costo adicional. ¿Querés los detalles?',
  ],
  saludo: [
    '¡Hola! 👋 Bienvenido al chat de Chiaven. Estoy acá para ayudarte con todo lo que necesites sobre este vehículo. ¿Por dónde empezamos?',
  ],
  oferta: [
    '💡 ¡Interesante! Mandame tu oferta y la evaluamos. Tené en cuenta que el precio puede variar según forma de pago. ¿Cuánto tenés pensado ofrecer?',
    '💡 Podemos negociar. ¿Estás hablando de pago al contado o con financiación? Así sabemos cuánto margen tenemos.',
  ],
  calcular: [
    '🏦 Para calcular la cuota necesito saber: ¿cuánto vas a financiar? Por ejemplo, si financiás $20.000.000 a 36 cuotas serían aproximadamente <strong>$1.455.400/mes</strong> (coef. 72,77).',
  ],
  default: [
    'Entendido. Un asesor de la agencia va a revisar tu consulta. Mientras tanto podés usar los botones rápidos de abajo para consultas frecuentes.',
    'Buena pregunta. Estamos verificando la información para darte una respuesta precisa. ¿Hay algo más en lo que pueda ayudarte?',
    'Recibimos tu consulta. También podés preguntarme sobre financiación BNA, formas de pago, papeles o permuta usando los botones.',
  ],
};

var CHAT_REMINDERS = [
  '💡 <strong>Tip:</strong> Pagando al contado podés conseguir hasta un 5% de descuento adicional.',
  '🏦 <strong>Financiación BNA:</strong> Hasta 60 cuotas al 45% TNA. Calculá tu cuota en la sección Financiación.',
  '📋 <strong>Antes de cerrar:</strong> Pedí el informe de dominio en el Registro del Automotor.',
  '🔄 <strong>¿Tenés auto?</strong> Aceptamos permutas totales o parciales.',
  '✅ <strong>Al cerrar el trato</strong> se habilita el contacto directo para coordinar papeles y entrega.',
  '🛡️ <strong>Garantía:</strong> Todos los vehículos incluyen 3 meses de garantía mecánica.',
  '🚗 <strong>Entrega:</strong> Coordinamos el día y lugar que mejor te quede.',
];

function getBotResponse(text, car) {
  var low = (text || '').toLowerCase();
  var responses;
  if (low.match(/hola|buen|saludos/)) responses = BOT_RESPONSES.saludo;
  else if (low.match(/permut|cambio|tengo auto|mi auto/)) responses = BOT_RESPONSES.permuta;
  else if (low.match(/pago|efectivo|transfer|cheque|cómo pag|como pag/)) responses = BOT_RESPONSES.pago;
  else if (low.match(/financ|cuota|bna|banco|crédito|credito/)) responses = BOT_RESPONSES.financiacion;
  else if (low.match(/calcul|cuánto sería|cuanto seria|por mes/)) responses = BOT_RESPONSES.calcular;
  else if (low.match(/papel|vtv|título|titulo|dominio|document|seguro/)) responses = BOT_RESPONSES.papeles;
  else if (low.match(/precio|cuesta|valor|descuento|ofrezco|oferta|rebaj/)) responses = BOT_RESPONSES.precio;
  else if (low.match(/ofrezco|oferta|te doy|te ofrezco|\d{6,}/)) responses = BOT_RESPONSES.oferta;
  else if (low.match(/entrega|retiro|cuando|fecha|dónde|donde/)) responses = BOT_RESPONSES.entrega;
  else if (low.match(/garantía|garantia|cobertura|falla|roto/)) responses = BOT_RESPONSES.garantia;
  else responses = BOT_RESPONSES.default;

  var r = responses[Math.floor(Math.random() * responses.length)];

  // Personalize with car data if available
  if (car && r.indexOf('este vehículo') >= 0) {
    r = r.replace('este vehículo', car.marca + ' ' + car.modelo);
  }
  // If calculating financiacion and car has price, add estimate
  if (responses === BOT_RESPONSES.calcular && car && car.precio) {
    var financ70 = Math.round(car.precio * 0.7);
    var cuota36 = Math.round((financ70 / 1000) * 72.77);
    r += '<br><br>Para este ' + car.marca + ' ' + car.modelo + ' el 70% sería <strong>$' + financ70.toLocaleString('es-AR') + '</strong>, a 36 cuotas = <strong>$' + cuota36.toLocaleString('es-AR') + '/mes</strong>.';
  }
  return r;
}

var chatReminderIdx = 0;
var chatReminderInterval = null;

function getBotResponse(text) {
  var low = text.toLowerCase();
  if (low.indexOf('permut') >= 0 || low.indexOf('cambio') >= 0) return BOT_RESPONSES.permuta;
  if (low.indexOf('pago') >= 0 || low.indexOf('efectivo') >= 0 || low.indexOf('transfer') >= 0) return BOT_RESPONSES.pago;
  if (low.indexOf('financ') >= 0 || low.indexOf('cuota') >= 0 || low.indexOf('bna') >= 0) return BOT_RESPONSES.financiacion;
  if (low.indexOf('papel') >= 0 || low.indexOf('vtv') >= 0 || low.indexOf('document') >= 0 || low.indexOf('titulo') >= 0) return BOT_RESPONSES.papeles;
  if (low.indexOf('precio') >= 0 || low.indexOf('vale') >= 0 || low.indexOf('cost') >= 0 || low.indexOf('negoci') >= 0) return BOT_RESPONSES.precio;
  if (low.indexOf('entrega') >= 0 || low.indexOf('retiro') >= 0 || low.indexOf('cuando') >= 0) return BOT_RESPONSES.entrega;
  if (low.indexOf('garantia') >= 0 || low.indexOf('garantía') >= 0) return BOT_RESPONSES.garantia;
  return BOT_RESPONSES.default;
}

function openInitChat(carId) { openCarChat(carId); }
function _oldOpenInitChat(carId) {
  var car = carCache[carId];
  if (!car) return;
  activeChatCarId = carId;
  var sub = getSubscription();
  var hasPremium = isSubActive() && sub.plan !== 'trial';
  document.getElementById('init-chat-car-name').textContent = car.marca + ' ' + car.modelo + ' ' + (car.anio || '');
  // Close car detail first so init modal appears on top
  document.getElementById('car-detail-modal').classList.add('hidden');
  if (hasPremium) {
    startChatFree(carId);
  } else {
    document.getElementById('init-chat-modal').classList.remove('hidden');
  }
}

function startChatWithToken() { openCarChat(currentChatCarId || activeChatCarId); }

function startChatWithPremium() {
  document.getElementById('init-chat-modal').classList.add('hidden');
  if (isSubActive() && getSubscription().plan !== 'trial') {
    startChatFree(activeChatCarId);
  } else {
    navigate('suscripcion');
    toast('Activá Premium para chats ilimitados', 'info');
  }
}

function startChatFree(carId) {
  if (!chatSessions[carId]) {
    chatSessions[carId] = [];
    // Save to localStorage
    saveChatSessions();
  }
  openChat(carId);
}

function saveChatSessions() {
  try { localStorage.setItem('chiaven_chats_' + (currentUser && currentUser.id), JSON.stringify(chatSessions)); } catch(e) {}
}

function loadChatSessions() {
  try {
    var raw = localStorage.getItem('chiaven_chats_' + (currentUser && currentUser.id));
    if (raw) chatSessions = JSON.parse(raw);
  } catch(e) {}
}

function openChat(carId) {
  var car = carCache[carId];
  if (!car) return;
  activeChatCarId = carId;
  if (!chatSessions[carId]) chatSessions[carId] = [];

  // Set header
  var imgs = Array.isArray(car.images) && car.images.length ? car.images : (car.image_url ? [car.image_url] : []);
  var thumb = document.getElementById('chat-car-thumb');
  if (thumb) thumb.innerHTML = imgs.length ? '<img src="' + imgs[0] + '" alt="">' : '🚗';
  var titleEl = document.getElementById('chat-car-title');
  if (titleEl) titleEl.textContent = car.marca + ' ' + car.modelo + ' ' + (car.anio || '');
  var priceEl = document.getElementById('chat-car-price');
  if (priceEl) priceEl.textContent = fmtPrice(car.precio);

  // Close ALL other modals first, then open chat on top
  document.getElementById('car-detail-modal').classList.add('hidden');
  document.getElementById('init-chat-modal').classList.add('hidden');
  document.getElementById('deal-modal').classList.add('hidden');
  renderChatMessages();
  var chatModal = document.getElementById('chat-modal');
  chatModal.classList.remove('hidden');
  chatModal.style.zIndex = '9000';

  // Send welcome bot message if first time
  if (chatSessions[carId].length === 0) {
    setTimeout(function() {
      addBotMessage(carId, '¡Hola! Soy el asistente de Chiaven 🤖 Estoy acá para ayudarte con consultas sobre el <strong>' + car.marca + ' ' + car.modelo + ' ' + (car.anio||'') + '</strong>. Podés preguntarme sobre precio, financiación, papeles, formas de pago o permuta. También podés usar los botones rápidos de abajo. ¡Arranquemos!');
    }, 600);
    // Schedule reminders
    if (chatReminderInterval) clearInterval(chatReminderInterval);
    chatReminderInterval = setInterval(function() {
      if (!activeChatCarId || document.getElementById('chat-modal').classList.contains('hidden')) return;
      var reminder = CHAT_REMINDERS[chatReminderIdx % CHAT_REMINDERS.length];
      addBotMessage(activeChatCarId, reminder);
      chatReminderIdx++;
    }, 45000); // every 45s
  }

  setTimeout(function() {
    var msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 100);
}

function closeChat() {
  document.getElementById('chat-modal').classList.add('hidden');
  if (chatReminderInterval) { clearInterval(chatReminderInterval); chatReminderInterval = null; }
  activeChatCarId = null;
}

function addBotMessage(carId, text) {
  if (!chatSessions[carId]) chatSessions[carId] = [];
  chatSessions[carId].push({ role: 'bot', text: text, ts: new Date().toISOString() });
  saveChatSessions();
  if (activeChatCarId === carId) {
    renderChatMessages();
    var msgs = document.getElementById('chat-messages');
    if (msgs) setTimeout(function() { msgs.scrollTop = msgs.scrollHeight; }, 80);
  }
}

function renderChatMessages() {
  var msgs = document.getElementById('chat-messages');
  if (!msgs || !activeChatCarId) return;
  var session = chatSessions[activeChatCarId] || [];
  if (!session.length) { msgs.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3);font-size:0.84rem">Iniciando chat...</div>'; return; }
  msgs.innerHTML = session.map(function(m) {
    var time = m.ts ? new Date(m.ts).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' }) : '';
    if (m.role === 'bot') {
      return '<div class="chat-bubble-wrap bot">' +
        '<div class="chat-bot-badge">🤖 Asistente Chiaven</div>' +
        '<div class="chat-bubble">' + m.text + '</div>' +
        '<div class="chat-bubble-time">' + time + '</div></div>';
    } else if (m.role === 'sent') {
      return '<div class="chat-bubble-wrap sent">' +
        '<div class="chat-bubble">' + esc(m.text) + '</div>' +
        '<div class="chat-bubble-time">' + time + '</div></div>';
    } else {
      return '<div class="chat-bubble-wrap received">' +
        '<div class="chat-bubble">' + esc(m.text) + '</div>' +
        '<div class="chat-bubble-time">' + time + '</div></div>';
    }
  }).join('');
  setTimeout(function() { msgs.scrollTop = msgs.scrollHeight; }, 50);
}

function sendChatMessage() {
  var input = document.getElementById('chat-input');
  var text = (input.value || '').trim();
  if (!text || !activeChatCarId) return;
  var carId = activeChatCarId;
  var car = carCache[carId];
  input.value = '';

  // Guardar localmente y enviar también a la agencia propietaria.
  if (!chatSessions[carId]) chatSessions[carId] = [];
  chatSessions[carId].push({ role: 'sent', text: text, ts: new Date().toISOString() });
  saveChatSessions();
  renderChatMessages();

  // El chat de la tarjeta ahora usa el mismo canal remoto que "Mensajes".
  if (currentUser && car && car.owner_id && car.owner_id !== currentUser.id) {
    getSB().from('messages').insert(buildChatRow(carId, currentUser.id, car.owner_id, 'text', {
      to_user: car.owner_id,
      text: text
    })).then(function(res) {
      if (res && res.error) {
        console.error('Error enviando mensaje desde tarjeta:', res.error);
        toast('No se pudo enviar el mensaje a la agencia', 'error');
        return;
      }
      // La misma conversación queda disponible en "Mensajes".
      syncCardChatFromRemote(carId);
      loadMessagesPage();
    }).catch(function(err) {
      console.error('Error enviando mensaje desde tarjeta:', err);
      toast('No se pudo enviar el mensaje a la agencia', 'error');
    });
  }

  // Mantener el asistente automático para no romper la experiencia actual.
  setTimeout(function() {
    var liveCar = activeChatCarId ? carCache[activeChatCarId] : car;
    var responses = getBotResponse(text, liveCar);
    var response = Array.isArray(responses) ? responses[Math.floor(Math.random() * responses.length)] : responses;
    addBotMessage(carId, response);
    var session = chatSessions[carId] || [];
    var userMsgs = session.filter(function(m) { return m.role === 'sent'; }).length;
    if (userMsgs === 3) {
      setTimeout(function() {
        addBotMessage(carId, '🤝 ¿Ya tenés suficiente información? Si estás listo podés <strong>cerrar el trato</strong> tocando el botón de abajo. Esto habilitará el contacto directo con la agencia para coordinar la entrega.');
      }, 1500);
    }
  }, 1200 + Math.random() * 800);
}

function sendQuickMsg(text) {
  var input = document.getElementById('chat-input');
  if (input) input.value = text;
  sendChatMessage();
}

function showDealFlow(carId) {
  carId = carId || activeChatCarId;
  if (!carId) return;
  var car = carCache[carId];
  if (!car) return;
  // Close chat, open deal modal on highest z-index
  document.getElementById('chat-modal').classList.add('hidden');
  document.getElementById('deal-modal-title').textContent = 'Cerrar trato — ' + car.marca + ' ' + car.modelo;
  document.getElementById('deal-modal-car').textContent = fmtPrice(car.precio) + (car.localidad ? ' · ' + car.localidad : '');
  var actionBlock = document.getElementById('deal-action-block');
  actionBlock.innerHTML =
    '<div style="background:var(--amber-glow);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius);padding:12px 14px;font-size:0.8rem;color:var(--amber);margin-bottom:16px">' +
    '⚠️ Al confirmar el trato se habilitará el contacto directo con la agencia para coordinar papeles, pago y entrega.</div>' +
    '<button type="button" onclick="confirmDeal(\'' + carId + '\')" style="width:100%;padding:14px;border-radius:var(--radius);background:var(--green);color:#fff;border:none;cursor:pointer;font-weight:700;font-size:1rem;margin-bottom:10px">✅ Confirmar trato — habilitar contacto</button>' +
    '<button type="button" onclick="document.getElementById(\'deal-modal\').classList.add(\'hidden\')" style="width:100%;padding:10px;border-radius:var(--radius);background:transparent;color:var(--text3);border:1px solid var(--card-border);cursor:pointer;font-size:0.84rem">Seguir negociando</button>';
  document.getElementById('deal-modal').classList.remove('hidden');
}

function confirmDeal(carId) {
  // El contacto se habilita con Premium o con una operación con precio acordado (lo valida también la base)
  var premium = isSubActive() && getSubscription().plan !== 'trial';
  if (!premium && !hasAgreedOperation(carId)) {
    document.getElementById('deal-modal').classList.add('hidden');
    toast('Para habilitar el contacto, primero acordá el precio en la negociación.', 'info');
    startNegotiation(carId);
    return;
  }
  unlockContact(carId);
  document.getElementById('deal-modal').classList.add('hidden');
  closeChat();
  // Add confirmation bot message to chat
  if (chatSessions[carId]) {
    chatSessions[carId].push({ role: 'bot', text: '🎉 ¡Trato confirmado! Los datos de contacto de la agencia ya están disponibles. Coordiná la fecha de entrega, revisá los papeles y acordá la forma de pago final. ¡Éxitos con tu compra!', ts: new Date().toISOString() });
    saveChatSessions();
  }
  // Show success notification
  addNotification('🎉', '¡Trato confirmado!', 'Contacto desbloqueado. Coordiná la entrega con la agencia.', 'green', null);
  toast('🎉 ¡Trato cerrado! Contacto habilitado.', 'success');
  // Reopen car detail to show unlocked contact
  setTimeout(function() {
    var fakeEvent = { target: { closest: function() { return null; } } };
    openCarDetailById(fakeEvent, carId);
  }, 500);
  // Mark deal steps as done
  setTimeout(function() {
    ['deal-step-2-num','deal-step-3-num','deal-step-4-num'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.textContent = '✓'; el.classList.add('done'); }
    });
  }, 200);
}

// Load chat sessions on startup
function initChatSystem() {
  loadChatSessions();
  loadUnlockedContacts();
}

// ══ CONTACTOS DESBLOQUEADOS (Supabase: contact_unlocks) ══
var contactCache = {};
function unlockContact(carId) {
  unlockedContacts[carId] = true;
  if (!currentUser) return Promise.resolve();
  return getSB().from('contact_unlocks').upsert({ user_id: currentUser.id, car_id: String(carId) }, { ignoreDuplicates: true }).then(function(r) {
    if (r.error) { toast('No se pudo guardar el contacto habilitado: ' + (r.error.message || 'error'), 'error'); return; }
    // El contacto solo se puede leer una vez guardado el desbloqueo
    delete contactCache[carId];
    if (detailCar && detailCar.id === carId) renderDetailContact(detailCar, false);
  });
}
function loadUnlockedContacts() {
  if (!currentUser) return Promise.resolve();
  contactCache = {};
  var legacy = {};
  try { legacy = JSON.parse(localStorage.getItem('chiaven_unlocked') || '{}'); } catch(e) {}
  var legacyIds = Object.keys(legacy).filter(function(id) { return legacy[id]; });
  var migrate = legacyIds.length
    ? getSB().from('contact_unlocks').upsert(legacyIds.map(function(id) { return { user_id: currentUser.id, car_id: id }; }), { ignoreDuplicates: true })
        .then(function(r) {
          // Se descarta lo local si se guardó o si la base lo rechazó (desbloqueo sin trato); solo se reintenta ante fallas de red
          if (!r.error || r.error.code) { try { localStorage.removeItem('chiaven_unlocked'); } catch(e) {} }
        })
    : Promise.resolve();
  return migrate.then(function() {
    return getSB().from('contact_unlocks').select('car_id').eq('user_id', currentUser.id);
  }).then(function(r) {
    var map = {};
    (r.data || []).forEach(function(row) { map[row.car_id] = true; });
    if (r.error) legacyIds.forEach(function(id) { map[id] = true; });
    unlockedContacts = map;
    if (detailCar) renderDetailContact(detailCar, detailCar.owner_id === currentUser.id);
  });
}

// Enter key in chat input
document.addEventListener('DOMContentLoaded', function() {
  var chatInput = document.getElementById('chat-input');
  if (chatInput) {
    chatInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); }
    });
  }
});
