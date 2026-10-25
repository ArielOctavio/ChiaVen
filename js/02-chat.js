// === REAL CHAT VIA SUPABASE ===
var activeMsgCarId = null;
var activeMsgBuyerId = null;
var msgPollInterval = null;
var currentChatCarId = null;

// ══ UNIFIED CHAT THREADS ══
// Supabase "messages" keeps the existing schema. Each conversation is uniquely
// identified by vehicle + buyer + seller, and the ID is embedded in new messages.
var CHAT_PREFIX = '[CHIAVEN_CHAT]';
var CHAT_ARCHIVE_PREFIX = '[CHIAVEN_CHAT_ARCHIVE]';

function encodeChatArchive(car) {
  return CHAT_ARCHIVE_PREFIX + JSON.stringify({
    car_id: car.id,
    car_name: ((car.marca || '') + ' ' + (car.modelo || '') + ' ' + (car.anio || '')).trim(),
    precio: car.precio || 0,
    car_img: (Array.isArray(car.images) && car.images.length) ? car.images[0] : (car.image_url || null),
    archived_at: new Date().toISOString()
  });
}

function decodeChatArchive(raw) {
  if (!raw || raw.indexOf(CHAT_ARCHIVE_PREFIX) !== 0) return null;
  try { return JSON.parse(raw.slice(CHAT_ARCHIVE_PREFIX.length)); } catch(e) { return null; }
}

function getArchivedCar(carId) {
  try {
    var all = JSON.parse(localStorage.getItem('chiaven_archived_cars') || '{}');
    return all[carId] || null;
  } catch(e) { return null; }
}

function saveArchivedCar(car) {
  if (!car || !car.id) return;
  try {
    var all = JSON.parse(localStorage.getItem('chiaven_archived_cars') || '{}');
    all[car.id] = {
      id: car.id,
      marca: car.marca || '',
      modelo: car.modelo || '',
      anio: car.anio || '',
      precio: car.precio || 0,
      image_url: car.image_url || null,
      images: Array.isArray(car.images) ? car.images.slice(0,1) : []
    };
    localStorage.setItem('chiaven_archived_cars', JSON.stringify(all));
  } catch(e) {}
}

function archiveCarChats(car, callback) {
  if (!currentUser || !car || !car.id) { if (callback) callback(); return; }
  getSB().from('messages').select('*').eq('car_id', car.id).then(function(r) {
    if (r && r.error) {
      console.error('No se pudieron leer chats para archivar:', r.error);
      if (callback) callback();
      return;
    }
    var rows = r.data || [];
    var participants = {};
    rows.forEach(function(m) {
      if ((m.message || '').indexOf(REMOTE_EVENT_PREFIX) === 0 || (m.message || '').indexOf(CHAT_ARCHIVE_PREFIX) === 0) return;
      if ((m.message || '').indexOf(CHAT_ARCHIVE_PREFIX) === 0) return;
      if (m.from_user && m.from_user !== currentUser.id) participants[m.from_user] = true;
      if (m.to_user && m.to_user !== currentUser.id) participants[m.to_user] = true;
    });

    var ids = Object.keys(participants);
    if (!ids.length) { saveArchivedCar(car); if (callback) callback(); return; }

    var pending = ids.length;
    ids.forEach(function(otherId) {
      getSB().from('messages').insert({
        from_user: currentUser.id,
        to_user: otherId,
        car_id: car.id,
        message: encodeChatArchive(car)
      }).then(function(res) {
        if (res && res.error) console.error('No se pudo archivar hilo:', res.error);
        pending--;
        if (!pending) {
          saveArchivedCar(car);
          if (callback) callback();
        }
      });
    });
  }).catch(function(e) {
    console.error('Error archivando chats:', e);
    if (callback) callback();
  });
}



function getChatThreadId(carId, buyerId, sellerId) {
  var users = [String(buyerId || ''), String(sellerId || '')].sort();
  return String(carId || '') + '::' + users[0] + '::' + users[1];
}

function getUserAlias(userId) {
  var raw = String(userId || '');
  var hash = 0;
  for (var i = 0; i < raw.length; i++) hash = ((hash << 5) - hash) + raw.charCodeAt(i) | 0;
  return 'Usuario #' + String(Math.abs(hash) % 10000).padStart(4, '0');
}

function getThreadAlias(threadId) {
  var raw = String(threadId || '');
  var hash = 0;
  for (var i = 0; i < raw.length; i++) hash = ((hash << 5) - hash) + raw.charCodeAt(i) | 0;
  return 'Hilo #' + String(Math.abs(hash) % 1000000).padStart(6, '0');
}

function encodeChatMessage(type, payload) {
  return CHAT_PREFIX + JSON.stringify({
    type: type || 'text',
    thread_id: payload.thread_id || '',
    text: payload.text || '',
    operation_id: payload.operation_id || null,
    proposal: payload.proposal || null,
    ts: payload.ts || new Date().toISOString()
  });
}

function decodeChatMessage(raw) {
  raw = raw || '';
  if (raw.indexOf(CHAT_PREFIX) !== 0) {
    return { type:'text', text:raw, thread_id:null, operation_id:null, proposal:null };
  }
  try {
    return JSON.parse(raw.slice(CHAT_PREFIX.length));
  } catch (e) {
    return { type:'text', text:raw, thread_id:null, operation_id:null, proposal:null };
  }
}

function chatMessageText(raw) {
  var d = decodeChatMessage(raw);
  if (d.type === 'proposal' && d.proposal) {
    var p = d.proposal;
    var trade = typeof tradeInSummaryText === 'function' ? tradeInSummaryText(p) : '';
    return '💰 Propuesta: ' + fmtPrice(p.buyerPrice || p.finalPrice || p.price || 0) + (trade ? ' · ' + trade : '') + (p.note ? ' · ' + p.note : '');
  }
  return d.text || '';
}

function buildChatRow(carId, buyerId, sellerId, type, payload) {
  return {
    from_user: currentUser.id,
    to_user: payload.to_user,
    car_id: carId,
    message: encodeChatMessage(type, {
      thread_id: getChatThreadId(carId, buyerId, sellerId),
      text: payload.text || '',
      operation_id: payload.operation_id || null,
      proposal: payload.proposal || null,
      ts: payload.ts || new Date().toISOString()
    })
  };
}

function syncCardChatFromRemote(carId, callback) {
  if (!currentUser || !carId) { if (callback) callback(); return; }
  var car = carCache[carId];
  if (!car || !car.owner_id) { if (callback) callback(); return; }

  getSB().from('messages').select('*').eq('car_id', carId)
    .order('created_at', { ascending: true })
    .then(function(r) {
      if (r && r.error) {
        console.error('Error sincronizando chat de tarjeta:', r.error);
        if (callback) callback();
        return;
      }

      var rows = (r.data || []).filter(function(m) {
        return (m.from_user === currentUser.id && m.to_user === car.owner_id) ||
               (m.to_user === currentUser.id && m.from_user === car.owner_id);
      });

      var bots = (chatSessions[carId] || []).filter(function(m) { return m.role === 'bot'; });
      var remote = rows.map(function(m) {
        var decoded = decodeChatMessage(m.message || '');
        if ((m.message || '').indexOf(REMOTE_EVENT_PREFIX) === 0 || (m.message || '').indexOf(CHAT_ARCHIVE_PREFIX) === 0) return null;
        if (decoded.type === 'proposal' && decoded.proposal) {
          var p = decoded.proposal;
          return {
            role: m.from_user === currentUser.id ? 'sent' : 'received',
            text: '💰 Propuesta: ' + fmtPrice(p.buyerPrice || p.finalPrice || p.price || 0) + (proposalTradeIns(p).length ? ' · ' + esc(tradeInSummaryText(p)) : '') + (p.note ? ' · ' + esc(p.note) : ''),
            ts: m.created_at || decoded.ts,
            remote_id: m.id,
            thread_id: decoded.thread_id,
            kind: 'proposal'
          };
        }
        return {
          role: m.from_user === currentUser.id ? 'sent' : 'received',
          text: decoded.text || '',
          ts: m.created_at || decoded.ts,
          remote_id: m.id,
          thread_id: decoded.thread_id
        };
      }).filter(Boolean);

      chatSessions[carId] = bots.concat(remote);
      chatSessions[carId].sort(function(a,b) {
        return new Date(a.ts || 0) - new Date(b.ts || 0);
      });
      saveChatSessions();

      if (activeChatCarId === carId) renderChatMessages();
      if (callback) callback();
    })
    .catch(function(err) {
      console.error('Error sincronizando chat de tarjeta:', err);
      if (callback) callback();
    });
}


function openCarChat(carId) {
  if (!currentUser) { showAuth(); return; }
  var car = carCache[carId];

  function goToMessages(c) {
    if (!c || !c.owner_id || c.owner_id === currentUser.id) {
      toast('No se pudo abrir el chat', 'error');
      return;
    }
    var detailModal = document.getElementById('car-detail-modal');
    if (detailModal) detailModal.classList.add('hidden');

    // Un único chat por vehículo + comprador + agencia.
    getSB().from('messages').select('id')
      .eq('car_id', carId)
      .eq('from_user', currentUser.id)
      .eq('to_user', c.owner_id)
      .then(function(r) {
        var p = Promise.resolve();
        if (!(r.data && r.data.length)) {
          p = getSB().from('messages').insert(buildChatRow(carId, currentUser.id, c.owner_id, 'text', {
            to_user: c.owner_id,
            text: '👋 Inicié una consulta sobre este vehículo.'
          }));
        }
        return p;
      })
      .then(function() {
        navigate('messages');
        setTimeout(function() {
          loadMessagesPage();
          setTimeout(function() { openMsgChat(carId, currentUser.id); }, 250);
        }, 250);
      })
      .catch(function(err) {
        console.error('Error abriendo chat:', err);
        toast('No se pudo abrir la conversación', 'error');
      });
  }

  if (car) {
    goToMessages(car);
  } else {
    getSB().from('cars').select('*').eq('id', carId).then(function(r) {
      if (r.data && r.data[0]) {
        carCache[carId] = r.data[0];
        goToMessages(r.data[0]);
      } else {
        toast('No se pudo cargar el vehículo', 'error');
      }
    });
  }
}
function openCarSellerChats(carId) {
  navigate('messages');
  setTimeout(function() {
    loadMessagesPage();
    getSB().from('messages').select('*').eq('car_id', carId).then(function(r) {
      var buyers = {};
      (r.data||[]).forEach(function(m) {
        if ((m.message || '').indexOf(REMOTE_EVENT_PREFIX) === 0) return;
        var b = m.from_user === currentUser.id ? m.to_user : m.from_user;
        if (b !== currentUser.id) buyers[b] = true;
      });
      var ids = Object.keys(buyers);
      if (ids.length) openMsgChat(carId, ids[0]);
    });
  }, 400);
}

function openMsgChat(carId, buyerId) {
  if (!currentUser || !carId || !buyerId) return;
  activeMsgCarId = carId;
  activeMsgBuyerId = buyerId;
  if (msgPollInterval) clearInterval(msgPollInterval);

  getSB().from('cars').select('*').eq('id', carId).then(function(r) {
    if (r.error || !r.data || !r.data[0]) {
      toast('No se pudo abrir esta conversación', 'error');
      return;
    }

    var car = r.data[0];
    carCache[carId] = car;
    var isSeller = car.owner_id === currentUser.id;
    var imgs = Array.isArray(car.images) && car.images.length ? car.images : (car.image_url ? [car.image_url] : []);
    var hdr = document.getElementById('active-chat-header');

    if (hdr) {
      hdr.innerHTML =
        (imgs.length ? '<img src="' + esc(imgs[0]) + '" style="width:44px;height:36px;border-radius:7px;object-fit:cover">' :
          '<div style="width:44px;height:36px;border-radius:7px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:20px">&#128663;</div>') +
        '<div style="flex:1"><div style="font-weight:600;font-size:0.9rem">' +
          esc((car.marca || '') + ' ' + (car.modelo || '') + ' ' + (car.anio || '')) +
        '</div><div style="font-size:0.72rem;color:var(--text3)">' +
          (isSeller ? ('Consulta de comprador · ' + getUserAlias(buyerId) + ' · ' + getThreadAlias(getChatThreadId(carId, buyerId, car.owner_id))) : ('Tu consulta · ' + getThreadAlias(getChatThreadId(carId, currentUser.id, car.owner_id)))) +
        '</div></div>' +
        '<strong style="color:var(--accent)">' + fmtPrice(car.precio) + '</strong>';
    }

    var wrap = document.getElementById('active-chat-input-wrap');
    if (wrap) wrap.style.display = 'flex';

    _loadAndRenderMsgs(carId, buyerId);
    msgPollInterval = setInterval(function() {
      if (activeMsgCarId === carId && activeMsgBuyerId === buyerId) {
        _loadAndRenderMsgs(carId, buyerId);
      }
    }, 3000);

    document.querySelectorAll('.chat-list-item').forEach(function(el) { el.classList.remove('active'); });
    var items = document.querySelectorAll('.chat-list-item');
    items.forEach(function(el) {
      if (el.dataset.carid === String(carId) && el.dataset.buyerid === String(buyerId)) el.classList.add('active');
    });

    var input = document.getElementById('active-chat-input');
    if (input) setTimeout(function(){ input.focus(); }, 50);
  });
}
function _loadAndRenderMsgs(carId, buyerId) {
  if (!currentUser || !carId || !buyerId) return;
  getSB().from('messages').select('*').eq('car_id', carId)
    .order('created_at', { ascending: true })
    .then(function(r) {
      if (r && r.error) {
        console.error('Error cargando conversación:', r.error);
        _renderMsgs([]);
        return;
      }

      var isSeller = false;
      var car = carCache[carId];
      if (car && car.owner_id) isSeller = car.owner_id === currentUser.id;

      var rows = (r.data || []).filter(function(m) {
        var raw = m.message || '';
        if (raw.indexOf(REMOTE_EVENT_PREFIX) === 0 || raw.indexOf(CHAT_ARCHIVE_PREFIX) === 0) return false;

        // Chat normal entre comprador y agencia.
        var pair = (m.from_user === currentUser.id && m.to_user === buyerId) ||
                   (m.to_user === currentUser.id && m.from_user === buyerId);

        // El asistente responde al propio comprador (from=to). Antes estos mensajes
        // quedaban afuera y por eso la conversación parecía vacía.
        var ownBot = !isSeller && m.from_user === currentUser.id && m.to_user === currentUser.id &&
                     raw.indexOf('[BOT] ') === 0;

        return pair || ownBot;
      });
      _renderMsgs(rows);
    });
}

function _renderMsgs(msgs) {
  var el = document.getElementById('active-chat-messages');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3);font-size:0.84rem">Sin mensajes aun.</div>';
    return;
  }
  var wasAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
  el.innerHTML = msgs.map(function(m) {
    var decoded = decodeChatMessage(m.message || '');
    var isMe = m.from_user === currentUser.id;
    var isBot = (m.message||'').indexOf('[BOT] ') === 0;
    var time = m.created_at ? new Date(m.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '';

    if (isBot) return '<div style="align-self:flex-start;max-width:82%">' +
      '<div style="font-size:0.65rem;color:var(--accent);font-weight:600;margin-bottom:3px">Asistente Chiaven</div>' +
      '<div style="background:#fff;border:1px solid var(--border);border-radius:12px 12px 12px 4px;padding:10px 14px;font-size:0.84rem;color:var(--text2)">' + esc((m.message||'').replace('[BOT] ','')) + '</div>' +
      '<div style="font-size:0.65rem;color:var(--text3);margin-top:3px">' + time + '</div></div>';

    if (decoded.type === 'proposal' && decoded.proposal) {
      var p = decoded.proposal;
      var shown = p.buyerPrice || p.finalPrice || p.price || 0;
      var note = p.note ? '<div style="font-size:0.76rem;margin-top:6px;opacity:.8">' + esc(p.note) + '</div>' : '';
      return '<div style="display:flex;flex-direction:column;' + (isMe?'align-items:flex-end;align-self:flex-end':'align-items:flex-start;align-self:flex-start') + ';max-width:82%">' +
        '<div style="background:' + (isMe?'var(--accent-light)':'#fff') + ';border:1px solid ' + (isMe?'var(--accent)':'var(--border)') + ';border-radius:12px;padding:12px 14px;min-width:210px">' +
        '<div style="font-size:0.68rem;color:var(--text3);font-weight:600;margin-bottom:4px">' + (isMe?'Tu propuesta':'Propuesta recibida') + '</div>' +
        '<div style="font-size:1.05rem;font-weight:700;color:var(--accent)">💰 ' + fmtPrice(shown) + '</div>' + tradeInSummaryHTML(p) + note +
        (decoded.operation_id ? '<button type="button" onclick="openProposalFromMessage(\'' + esc(decoded.operation_id) + '\')" style="margin-top:9px;padding:6px 10px;border:1px solid var(--accent);border-radius:7px;background:#fff;color:var(--accent);font-size:0.72rem;cursor:pointer">↩ Responder / contraofertar</button>' : '') +
        '</div><div style="font-size:0.65rem;color:var(--text3);margin-top:3px">' + time + '</div></div>';
    }

    var text = decoded.text || '';
    return '<div style="display:flex;flex-direction:column;' + (isMe?'align-items:flex-end;align-self:flex-end':'align-items:flex-start;align-self:flex-start') + ';max-width:78%">' +
      '<div style="background:' + (isMe?'var(--accent)':'#fff') + ';color:' + (isMe?'#fff':'var(--text)') + ';border:1px solid var(--border);border-radius:' + (isMe?'12px 12px 4px 12px':'12px 12px 12px 4px') + ';padding:10px 14px;font-size:0.85rem">' + esc(text) + '</div>' +
      '<div style="font-size:0.65rem;color:var(--text3);margin-top:3px">' + time + '</div></div>';
  }).join('');
  if (wasAtBottom) el.scrollTop = el.scrollHeight;
}


function openProposalFromMessage(operationId) {
  if (!operationId) return;
  var op = getOperations().find(function(o){ return o.id === operationId; });
  if (op) {
    activeOperation = op;
    openNegotiationModal(op);
    return;
  }
  // El evento de negociación puede estar llegando en paralelo al mensaje.
  syncRemoteNegotiations();
  setTimeout(function() {
    var fresh = getOperations().find(function(o){ return o.id === operationId; });
    if (fresh) {
      activeOperation = fresh;
      openNegotiationModal(fresh);
    } else {
      toast('La negociación todavía se está sincronizando. Probá nuevamente en unos segundos.', 'info');
    }
  }, 700);
}

function sendActiveMessage() {
  var input = document.getElementById('active-chat-input');
  var text = (input ? input.value : '').trim();
  if (!text || !activeMsgCarId || !activeMsgBuyerId) return;
  input.value = '';

  function _doSend(car) {
    var isSeller = car.owner_id === (currentUser && currentUser.id);
    var toUser = isSeller ? activeMsgBuyerId : car.owner_id;
    if (!toUser || toUser === (currentUser && currentUser.id)) {
      toast('No se pudo determinar el destinatario', 'error');
      return;
    }
    getSB().from('messages').insert(buildChatRow(activeMsgCarId,
      isSeller ? activeMsgBuyerId : currentUser.id,
      isSeller ? currentUser.id : toUser,
      'text', { to_user: toUser, text: text })).then(function(res) {
      if (res && res.error) {
        console.error('Chat error:', res.error);
        toast('Error al enviar', 'error');
        return;
      }
      _loadAndRenderMsgs(activeMsgCarId, activeMsgBuyerId);
      loadMessagesPage();
      if (!isSeller) {
        setTimeout(function() {
          var responses = getBotResponse(text, car);
          var resp = Array.isArray(responses) ? responses[Math.floor(Math.random()*responses.length)] : responses;
          getSB().from('messages').insert({
            from_user: currentUser.id, to_user: currentUser.id,
            car_id: activeMsgCarId,
            message: '[BOT] ' + resp.replace(/<[^>]+>/g,'')
          }).then(function(botRes) {
            if (botRes && botRes.error) console.error('Error respuesta asistente:', botRes.error);
            _loadAndRenderMsgs(activeMsgCarId, activeMsgBuyerId);
            loadMessagesPage();
          });
        }, 1500 + Math.random()*800);
      }
    });
  }

  var car = carCache[activeMsgCarId];
  if (car && car.owner_id) {
    _doSend(car);
  } else {
    getSB().from('cars').select('*').eq('id', activeMsgCarId).then(function(r) {
      var c2 = (r.data && r.data[0]) || {};
      carCache[activeMsgCarId] = c2;
      _doSend(c2);
    });
  }
}

function loadMessagesPage() {
  if (!currentUser) return;
  var listEl = document.getElementById('chat-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:0.82rem">Cargando...</div>';

  var uid = currentUser.id;
  var sentQ = getSB().from('messages').select('*').eq('from_user', uid).order('created_at', { ascending: false });
  var receivedQ = getSB().from('messages').select('*').eq('to_user', uid).order('created_at', { ascending: false });

  Promise.all([sentQ, receivedQ]).then(function(pr) {
    if ((pr[0] && pr[0].error) || (pr[1] && pr[1].error)) {
      console.error('Error cargando conversaciones:', pr[0] && pr[0].error, pr[1] && pr[1].error);
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--red);font-size:0.84rem">No se pudieron cargar los mensajes.</div>';
      return;
    }

    var allRawMsgs = (pr[0].data || []).concat(pr[1].data || []);
    var archivedMap = {};
    allRawMsgs.forEach(function(m) {
      var archived = decodeChatArchive(m.message || '');
      if (archived && archived.car_id) archivedMap[archived.car_id] = archived;
    });

    var allMsgs = [];
    var seen = {};
    allRawMsgs.forEach(function(m) {
      if ((m.message || '').indexOf(REMOTE_EVENT_PREFIX) === 0 || (m.message || '').indexOf(CHAT_ARCHIVE_PREFIX) === 0) return;
      if (!seen[m.id]) { seen[m.id] = true; allMsgs.push(m); }
    });

    if (!allMsgs.length) {
      listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:0.84rem">Sin conversaciones aún.<br><br>Abrí un auto y tocá <strong>Chatear con la agencia</strong>.</div>';
      return;
    }

    getSB().from('cars').select('id,marca,modelo,anio,images,image_url,owner_id,precio').then(function(r2) {
      if (r2.error) {
        console.error('Error cargando autos del chat:', r2.error);
        listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--red);font-size:0.84rem">No se pudieron cargar las conversaciones.</div>';
        return;
      }

      var carMap = {};
      (r2.data || []).forEach(function(car) {
        carMap[car.id] = car;
        carCache[car.id] = car;
      });

      var convMap = {};
      allMsgs.forEach(function(m) {
        if (!m.car_id) return;
        var car = carMap[m.car_id] || carCache[m.car_id] || archivedMap[m.car_id] || getArchivedCar(m.car_id) || null;
        var otherId = null;

        if (car && car.owner_id) {
          otherId = car.owner_id === uid ? m.from_user : car.owner_id;
        } else {
          otherId = m.from_user === uid ? m.to_user : m.from_user;
        }

        if (!otherId || otherId === uid) return;

        var buyerId = (car && car.owner_id === uid) ? otherId : uid;
        var sellerId = (car && car.owner_id) ? car.owner_id : (m.from_user === uid ? m.to_user : m.from_user);
        var threadId = getChatThreadId(m.car_id, buyerId, sellerId);
        var key = threadId;
        if (!convMap[key] || new Date(m.created_at || 0) > new Date(convMap[key].ts || 0)) {
          convMap[key] = {
            carId: m.car_id,
            otherId: otherId,
            buyerId: buyerId,
            sellerId: sellerId,
            threadId: threadId,
            lastMsg: m.message || '',
            ts: m.created_at || ''
          };
        }
      });

      var convs = Object.values(convMap).sort(function(a,b) {
        return new Date(b.ts || 0) - new Date(a.ts || 0);
      });

      if (!convs.length) {
        listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:0.84rem">Sin conversaciones aún.</div>';
        return;
      }

      listEl.innerHTML = convs.map(function(cv) {
        var car = carMap[cv.carId] || carCache[cv.carId] || archivedMap[cv.carId] || getArchivedCar(cv.carId) || {};
        var isSeller = car.owner_id ? car.owner_id === uid : false;
        var chatBuyerId = isSeller ? cv.otherId : uid;
        var imgs = Array.isArray(car.images) && car.images.length ? car.images : (car.image_url ? [car.image_url] : []);
        var thumb = imgs.length
          ? '<img src="' + esc(imgs[0]) + '" style="width:100%;height:100%;object-fit:cover">'
          : '&#128663;';
        var title = (car.marca || 'Auto') + ' ' + (car.modelo || '') + (car.anio ? ' ' + car.anio : '');
        var lastText = chatMessageText(cv.lastMsg || '').replace('[BOT] ', '').substring(0, 45);
        var time = cv.ts ? new Date(cv.ts).toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}) : '';
        var isActive = cv.carId === activeMsgCarId && chatBuyerId === activeMsgBuyerId;

        return '<div class="chat-list-item' + (isActive ? ' active' : '') + '" ' +
          'data-carid="' + esc(String(cv.carId)) + '" data-buyerid="' + esc(String(chatBuyerId)) + '" ' +
          'onclick="openMsgChat(this.dataset.carid,this.dataset.buyerid)">' +
          '<div style="width:44px;height:36px;border-radius:8px;overflow:hidden;background:var(--bg);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px">' + thumb + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(title) + '</div>' +
            '<div style="font-size:0.7rem;color:var(--text3)">' + (isSeller ? ('Vendiendo · ' + getUserAlias(cv.otherId) + ' · ' + getThreadAlias(cv.threadId)) : ('Comprando · ' + getThreadAlias(cv.threadId))) + '</div>' +
            '<div style="font-size:0.74rem;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(lastText) + '</div>' +
          '</div>' +
          '<div style="font-size:0.65rem;color:var(--text3);flex-shrink:0">' + time + '</div>' +
        '</div>';
      }).join('');
    });
  }).catch(function(err) {
    console.error('Error cargando conversaciones:', err);
    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--red);font-size:0.84rem">No se pudieron cargar los mensajes.</div>';
  });
}
function stopSubscription() { if (msgPollInterval) { clearInterval(msgPollInterval); msgPollInterval = null; } }

document.addEventListener('DOMContentLoaded', function() {
  var inp = document.getElementById('active-chat-input');
  if (inp) inp.addEventListener('keypress', function(e) { if (e.key==='Enter') sendActiveMessage(); });
});



// iOS Safari: detect file:// and warn
if (window.location.protocol === 'file:') {
  document.getElementById('loader').innerHTML = '<div style="text-align:center;padding:40px;color:#e8eaf2;font-family:sans-serif"><div style="font-size:2rem;margin-bottom:16px">Chiaven</div><div style="font-size:0.9rem;color:#9ba3b8;line-height:1.6">Esta app debe abrirse desde una URL HTTPS.<br><br>Accedé desde:<br><strong style="color:#60a5fa">chiaven20.vercel.app</strong></div></div>';
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('loader').style.alignItems = 'center';
  document.getElementById('loader').style.justifyContent = 'center';
  throw new Error('file:// not supported');
}
