// ══ PUBLISH ══
function setPubCondicion(val, el) {
  document.querySelectorAll('#page-publish .cond-tabs .cond-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('pub-condicion').value = val;
  var kmEl = document.getElementById('pub-km');
  if (val === 'nuevo') { kmEl.value = '0'; kmEl.disabled = true; }
  else { kmEl.disabled = false; }
}

function resetPublishForm() {
  fillMarcaSelect('pub-marca', 'pub-modelo');
  fillProvinciaSelect('pub-provincia', 'pub-localidad');
  fillExtraFields('pub', {});
  fillCarPrice('pub', {});
  ['pub-anio','pub-km','pub-color','pub-precio','pub-precio-info-text'].forEach(function(id) {
    var el = document.getElementById(id); if (el) { el.value = ''; el.disabled = false; }
  });
  document.getElementById('pub-condicion').value = 'usado';
  document.querySelectorAll('#page-publish .cond-tabs .cond-tab').forEach(function(t, i) { t.classList.toggle('active', i === 0); });
  document.getElementById('pub-destacado').checked = false;
  document.getElementById('oportunidad-alert').style.display = 'none';
  document.getElementById('map-preview-wrap').innerHTML = '<span>📍 Ingresá la localidad para ver el mapa</span>';
  publishedPhotos = [];
  publishedBlobs = [];
  renderPhotoGrid();
}

function checkOportunidad() {
  var precio = carPriceFromForm('pub').precio || 0;
  var infoText = document.getElementById('pub-precio-info-text').value.replace(/\./g, '');
  var m = infoText.match(/\d+/);
  var precioInfo = m ? parseFloat(m[0]) : 0;
  var alert = document.getElementById('oportunidad-alert');
  if (precioInfo > precio && precio > 0) {
    var margen = (precioInfo - precio) / precioInfo;
    alert.style.display = 'block';
    if (margen > 0.05) {
      alert.innerHTML = '🔥🔥 Margen > 5% — se marcará como <strong>SUPER OPORTUNIDAD</strong>';
      alert.style.background = 'linear-gradient(135deg,rgba(245,158,11,0.15),rgba(239,68,68,0.1))';
      alert.style.borderColor = 'rgba(239,68,68,0.4)';
      alert.style.color = 'var(--red)';
    } else {
      alert.innerHTML = '🔥 Precio menor al precio info — se marcará como <strong>OPORTUNIDAD</strong>';
      alert.style.background = 'var(--amber-glow)';
      alert.style.borderColor = 'rgba(245,158,11,0.4)';
      alert.style.color = 'var(--amber)';
    }
  } else { alert.style.display = 'none'; }
}

function updateMapPreview() {
  var localidad = document.getElementById('pub-localidad').value.trim();
  var provincia = document.getElementById('pub-provincia').value.trim();
  var wrap = document.getElementById('map-preview-wrap');
  if (!localidad) { wrap.innerHTML = '<span>📍 Ingresá la localidad para ver el mapa</span>'; return; }
  var q = encodeURIComponent(localidad + (provincia ? ', ' + provincia : '') + ', Argentina');
  wrap.innerHTML = '<iframe src="https://maps.google.com/maps?q=' + q + '&z=13&output=embed" allowfullscreen></iframe>';
}

function compressImage(file, maxPx, quality) {
  maxPx = maxPx || 1200; quality = quality || 0.80;
  return new Promise(function(resolve) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob) { resolve({ blob: blob, dataUrl: canvas.toDataURL('image/jpeg', quality) }); }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function handlePhotos(input) {
  var files = Array.from(input.files);
  var rem = 10 - publishedPhotos.length;
  if (!rem) { toast('Máximo 10 fotos', 'info'); return; }
  var toLoad = files.slice(0, rem);
  toast('Procesando ' + toLoad.length + ' foto' + (toLoad.length > 1 ? 's' : '') + '...', 'info');
  var p = Promise.resolve();
  toLoad.forEach(function(file) {
    p = p.then(function() {
      return compressImage(file).then(function(result) {
        publishedPhotos.push(result.dataUrl);
        publishedBlobs.push(result.blob);
      });
    });
  });
  p.then(function() { renderPhotoGrid(); });
  input.value = '';
}

function renderPhotoGrid() {
  var g = document.getElementById('photo-grid');
  var html = publishedPhotos.map(function(src, i) {
    return '<div class="photo-thumb" draggable="true" data-idx="' + i + '" ondragstart="photoDragStart(event,' + i + ')" ondragover="photoDragOver(event)" ondragleave="photoDragLeave(event)" ondrop="photoDrop(event,' + i + ')" ondragend="photoDragEnd(event)">' +
      '<img src="' + src + '" alt="foto ' + (i+1) + '">' +
      '<div class="photo-order ' + (i === 0 ? 'first' : '') + '">' + (i+1) + '</div>' +
      '<button type="button" class="del-photo" onclick="removePhoto(' + i + ',event)">✕</button></div>';
  }).join('');
  if (publishedPhotos.length < 10) html += '<div class="add-photo-btn" onclick="document.getElementById(\'pub-img-input\').click()"><span style="font-size:20px">📷</span><span>Agregar</span></div>';
  g.innerHTML = html;
}

function removePhoto(i, event) { if (event) event.stopPropagation(); publishedPhotos.splice(i,1); publishedBlobs.splice(i,1); renderPhotoGrid(); }

function photoDragStart(event, idx) { dragSrcIdx = idx; event.dataTransfer.effectAllowed = 'move'; event.currentTarget.classList.add('dragging'); }
function photoDragOver(event) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; event.currentTarget.classList.add('drag-over'); }
function photoDragLeave(event) { event.currentTarget.classList.remove('drag-over'); }
function photoDrop(event, targetIdx) {
  event.preventDefault(); event.currentTarget.classList.remove('drag-over');
  if (dragSrcIdx === null || dragSrcIdx === targetIdx) return;
  var mp = publishedPhotos.splice(dragSrcIdx, 1)[0]; publishedPhotos.splice(targetIdx, 0, mp);
  var mb = publishedBlobs.splice(dragSrcIdx, 1)[0]; publishedBlobs.splice(targetIdx, 0, mb);
  dragSrcIdx = null; renderPhotoGrid(); toast('Orden actualizado', 'info');
}
function photoDragEnd(event) { event.currentTarget.classList.remove('dragging'); dragSrcIdx = null; }

function handleDestacado(checkbox) {
  if (checkbox.checked) {
    checkbox.checked = false;
    var sub = getSubscription();
    
    document.getElementById('premium-modal').classList.remove('hidden');
  }
}


function handleUseTokens() {
  document.getElementById('premium-modal').classList.add('hidden');
  document.getElementById('pub-destacado').checked = true;
  toast('✅ Destacado activado', 'success');
}

function uploadPhotoToStorage(blob, carId, idx) {
  var fileName = 'cars/' + carId + '/foto_' + idx + '_' + Date.now() + '.jpg';
  return blob.arrayBuffer().then(function(ab) {
    return fetchT(SUPABASE_URL + '/storage/v1/object/car-images/' + fileName, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + ((_session && _session.access_token) || SUPABASE_KEY), 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: ab
    });
  }).then(function(res) {
    if (!res.ok) return null;
    return SUPABASE_URL + '/storage/v1/object/public/car-images/' + fileName;
  }).catch(function() { return null; });
}

function publishCar() {
  if (!currentUser) { showAuth(); return; }
  if (_session && _session.expires_at && Math.floor(Date.now()/1000) >= _session.expires_at - 120) {
    getSB().auth.getSession().then(function(res) { if (res.data && res.data.session) { _session = res.data.session; currentUser = _session.user; } });
  }
  var marca = document.getElementById('pub-marca').value.trim();
  var modelo = document.getElementById('pub-modelo').value.trim();
  var anio = parseInt(document.getElementById('pub-anio').value) || null;
  var km = parseInt(document.getElementById('pub-km').value) || 0;
  var color = document.getElementById('pub-color').value.trim();
  var precioForm = carPriceFromForm('pub');
  if (precioForm.sinCotizacion) { toast('Todavía no se cargó la cotización del dólar. Probá de nuevo en unos segundos.', 'error'); return; }
  var precio = precioForm.precio;
  var precio_info = document.getElementById('pub-precio-info-text').value.trim();
  var condicion = document.getElementById('pub-condicion').value;
  var localidad = document.getElementById('pub-localidad').value.trim();
  var provincia = document.getElementById('pub-provincia').value.trim();
  var destacado = document.getElementById('pub-destacado').checked;
  var extra = readExtraFields('pub');
  extra.moneda = precioForm.moneda;
  extra.precio_usd = precioForm.precio_usd;
  if (!marca || !modelo || !precio) { toast('Elegí marca y modelo de la lista y completá el precio', 'error'); return; }
  if (localidad) {
    var locOficial = localidadEnCatalogo(provincia, localidad);
    if (!locOficial) { toast('La localidad "' + localidad + '" no está en la lista de ' + provincia + '. Elegila de las sugerencias.', 'error'); return; }
    localidad = locOficial;
  }
  var infoNum = precio_info.replace(/\./g,'').match(/\d+/);
  var precioInfoNum = infoNum ? parseFloat(infoNum[0]) : 0;
  var es_oportunidad = precioInfoNum > 0 && precio > 0 && precioInfoNum > precio;
  var margen = es_oportunidad ? (precioInfoNum - precio) / precioInfoNum : 0;
  var es_super_oportunidad = margen > 0.05;
  var btn = document.getElementById('btn-publish');
  btn.disabled = true;
  var tempId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
  var imageUrls = [];
  var uploadChain = Promise.resolve();
  if (publishedBlobs.length > 0) {
    publishedBlobs.forEach(function(blob, i) {
      uploadChain = uploadChain.then(function() {
        btn.textContent = 'Subiendo fotos ' + (i+1) + '/' + publishedBlobs.length + '...';
        return uploadPhotoToStorage(blob, tempId, i).then(function(url) { if (url) imageUrls.push(url); });
      });
    });
  }
  uploadChain.then(function() {
    btn.textContent = 'Guardando...';
    return saveCarRow('insert', Object.assign({
      id: tempId, marca: marca, modelo: modelo, anio: anio, km: km, color: color,
      precio: precio, precio_info: precio_info, owner_id: currentUser.id, owner_email: currentUser.email,
      images: imageUrls.length > 1 ? imageUrls : null,
      image_url: imageUrls[0] || publishedPhotos[0] || null,
      es_oportunidad: es_oportunidad, es_super_oportunidad: es_super_oportunidad,
      destacado: destacado, condicion: condicion, localidad: localidad, provincia: provincia
    }, extra));
  }).then(function(result) {
    btn.disabled = false; btn.textContent = 'Publicar vehículo';
    if (result.error) { toast('Error: ' + result.error.message, 'error'); return; }
    toast('¡Vehículo publicado con ' + (imageUrls.length || publishedPhotos.length) + ' fotos!', 'success');
    resetPublishForm();
    navigate('profile');
  }).catch(function(e) {
    btn.disabled = false; btn.textContent = 'Publicar vehículo';
    toast('Error: ' + e.message, 'error');
  });
}

// ══ REQUESTS ══
function loadRequests() {
  if (!currentUser) return;
  Promise.all([
    getSB().from('requests').select('*').order('created_at', { ascending: false }),
    getSB().from('cars').select('*')
  ]).then(function(results) {
    var data = results[0].data || [];
    allCarsCache = availableCars(results[1].data);
    var wall = document.getElementById('requests-wall');
    if (!data.length) { wall.innerHTML = '<div class="empty-state"><div class="empty-icon">📢</div><div class="empty-text">Sin pedidos activos</div></div>'; return; }
    wall.innerHTML = data.map(function(req) {
      var isMine = req.user_id === currentUser.id;
      var matches = computeTopMatches(req, allCarsCache, 1);
      var topPct = matches.length > 0 ? matches[0].match : 0;
      var rj = JSON.stringify(req).replace(/"/g,'&quot;');
      return '<div class="request-card ' + (isMine ? 'mine' : '') + '">' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">' +
        '<div style="font-size:0.74rem;color:var(--accent2);font-weight:500">📌 ' + esc((req.user_email || 'Agencia').split('@')[0]) + (isMine ? ' (vos)' : '') + '</div>' +
        '<div style="font-size:0.96rem;font-weight:700;color:var(--green)">' + (req.presupuesto ? fmtPrice(req.presupuesto) : '') + '</div></div>' +
        '<div style="font-size:0.84rem;color:var(--text2);line-height:1.5;margin-bottom:12px">' + esc(req.texto) + '</div>' +
        (req.marca ? '<div style="font-size:0.75rem;color:var(--text3);margin-bottom:8px">Busca: <strong style="color:var(--text2)">' + esc(req.marca) + ' ' + esc(req.modelo || '') + '</strong></div>' : '') +
        (topPct > 0 ? '<div class="match-pill ' + matchClass(topPct) + '">🎯 Mejor match: ' + topPct + '%</div>' : '') +
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" class="btn-sm primary" onclick=\'openMatchModal(' + rj + ')\'>Ver matches</button>' +
        (isMine ? '<button type="button" class="btn-sm" onclick=\'openEditReq(event,' + rj + ')\'>✏️ Editar</button>' : '') +
        '</div><div style="font-size:0.7rem;color:var(--text3);margin-top:8px">' + fmtDate(req.created_at) + '</div></div>';
    }).join('');
  });
}

function publishRequest() {
  if (!currentUser) return;
  var texto = document.getElementById('req-texto').value.trim();
  var marca = document.getElementById('req-marca').value.trim();
  var modelo = document.getElementById('req-modelo').value.trim();
  var anio = parseInt(document.getElementById('req-anio').value) || null;
  var km_max = parseInt(document.getElementById('req-km').value) || null;
  var presupuesto = parseFloat(document.getElementById('req-presupuesto').value) || null;
  var condicion = document.getElementById('req-condicion').value;
  if (!texto) { toast('Describí el pedido', 'error'); return; }
  getSB().from('requests').insert({ texto: texto, marca: marca, modelo: modelo, anio: anio, km_max: km_max, presupuesto: presupuesto, condicion: condicion, user_id: currentUser.id, user_email: currentUser.email }).then(function(result) {
    if (result.error) { toast('Error: ' + result.error.message, 'error'); return; }
    ['req-texto','req-anio','req-km','req-presupuesto'].forEach(function(id) { document.getElementById(id).value = ''; });
    fillMarcaSelect('req-marca', 'req-modelo');
    document.getElementById('req-condicion').value = '';
    toast('¡Pedido publicado!', 'success');
    getSB().from('cars').select('*').then(function(r) {
      allCarsCache = availableCars(r.data);
      showMatchModalForReq({ texto: texto, marca: marca, modelo: modelo, anio: anio, km_max: km_max, presupuesto: presupuesto, condicion: condicion });
    });
    loadRequests();
  });
}

function computeTopMatches(req, cars, limit) {
  return cars.filter(function(c) { return c.owner_id !== currentUser.id; })
    .map(function(c) { return Object.assign({}, c, { match: calcularMatch(c, req) }); })
    .filter(function(c) { return c.match > 0; })
    .sort(function(a, b) { return b.match - a.match; })
    .slice(0, limit || 999);
}

function showMatchModalForReq(req) {
  var matches = computeTopMatches(req, allCarsCache, 10);
  document.getElementById('match-modal-sub').textContent = matches.length + ' autos compatibles';
  document.getElementById('match-modal-results').innerHTML = matches.length ? '<div class="cars-grid" style="margin-top:14px">' + matches.map(function(c) { return carCardHTML(c, false, c.match); }).join('') + '</div>' : '<div class="empty-state"><div class="empty-text">Sin autos compatibles aún</div></div>';
  document.getElementById('match-modal').classList.remove('hidden');
}

function openMatchModal(req) {
  var matches = computeTopMatches(req, allCarsCache).filter(function(c) { return c.match >= 50; });
  document.getElementById('match-modal-sub').textContent = matches.length + ' autos con 50%+ de compatibilidad';
  document.getElementById('match-modal-results').innerHTML = matches.length ? '<div class="cars-grid" style="margin-top:14px">' + matches.map(function(c) { return carCardHTML(c, false, c.match); }).join('') + '</div>' : '<div class="empty-state"><div class="empty-text">Sin autos con 50%+ de match</div></div>';
  document.getElementById('match-modal').classList.remove('hidden');
}
function closeMatchModal() { document.getElementById('match-modal').classList.add('hidden'); }

// ══ EDIT CAR ══
function openEditCar(event, carId) {
  event.stopPropagation();
  closeCarDetail();
  getSB().from('cars').select('*').eq('id', carId).single().then(function(result) {
    var data = result.data;
    if (!data) { toast('Error cargando vehículo', 'error'); return; }
    document.getElementById('edit-car-id').value = carId;
    fillMarcaSelect('edit-marca', 'edit-modelo', data.marca || '', data.modelo || '');
    document.getElementById('edit-anio').value = data.anio || '';
    document.getElementById('edit-km').value = data.km || '';
    document.getElementById('edit-color').value = data.color || '';
    fillCarPrice('edit', data);
    document.getElementById('edit-precio-info').value = data.precio_info || '';
    fillProvinciaSelect('edit-provincia', 'edit-localidad', data.provincia || '', data.localidad || '');
    document.getElementById('edit-condicion').value = data.condicion || 'usado';
    fillExtraFields('edit', data);
    document.getElementById('edit-car-modal').classList.remove('hidden');
  });
}
function closeEditCar() { document.getElementById('edit-car-modal').classList.add('hidden'); }
function saveEditCar() {
  var id = document.getElementById('edit-car-id').value;
  var precioForm = carPriceFromForm('edit');
  if (precioForm.sinCotizacion) { toast('Todavía no se cargó la cotización del dólar. Probá de nuevo en unos segundos.', 'error'); return; }
  var precio = precioForm.precio;
  var precioInfo = document.getElementById('edit-precio-info').value.trim();
  var pin = precioInfo.replace(/\./g,'').match(/\d+/);
  var pinVal = pin ? parseFloat(pin[0]) : 0;
  var es_oportunidad = pinVal > 0 && precio > 0 && pinVal > precio;
  var margen = es_oportunidad ? (pinVal - precio) / pinVal : 0;
  var es_super_oportunidad = margen > 0.05;
  saveCarRow('update', Object.assign({ marca: document.getElementById('edit-marca').value.trim(), modelo: document.getElementById('edit-modelo').value.trim(), anio: parseInt(document.getElementById('edit-anio').value) || null, km: parseInt(document.getElementById('edit-km').value) || 0, color: document.getElementById('edit-color').value.trim(), precio: precio, precio_info: precioInfo, es_oportunidad: es_oportunidad, es_super_oportunidad: es_super_oportunidad, localidad: document.getElementById('edit-localidad').value.trim(), provincia: document.getElementById('edit-provincia').value.trim(), condicion: document.getElementById('edit-condicion').value, moneda: precioForm.moneda, precio_usd: precioForm.precio_usd }, readExtraFields('edit')), id).then(function(result) {
    if (result.error) { toast('Error: ' + result.error.message, 'error'); return; }
    toast('¡Actualizado!', 'success');
    closeEditCar();
    loadMyCars(); loadHomeData();
  });
}

// ══ EDIT REQ ══
function openEditReq(event, req) {
  event.stopPropagation();
  document.getElementById('edit-req-id').value = req.id;
  document.getElementById('edit-req-texto').value = req.texto || '';
  fillMarcaSelect('edit-req-marca', 'edit-req-modelo', req.marca || '', req.modelo || '');
  document.getElementById('edit-req-anio').value = req.anio || '';
  document.getElementById('edit-req-km').value = req.km_max || '';
  document.getElementById('edit-req-presupuesto').value = req.presupuesto || '';
  document.getElementById('edit-req-condicion').value = req.condicion || '';
  document.getElementById('edit-req-modal').classList.remove('hidden');
}
function closeEditReq() { document.getElementById('edit-req-modal').classList.add('hidden'); }
function saveEditReq() {
  var id = document.getElementById('edit-req-id').value;
  var texto = document.getElementById('edit-req-texto').value.trim();
  if (!texto) { toast('La descripción no puede estar vacía', 'error'); return; }
  getSB().from('requests').update({ texto: texto, marca: document.getElementById('edit-req-marca').value.trim(), modelo: document.getElementById('edit-req-modelo').value.trim(), anio: parseInt(document.getElementById('edit-req-anio').value) || null, km_max: parseInt(document.getElementById('edit-req-km').value) || null, presupuesto: parseFloat(document.getElementById('edit-req-presupuesto').value) || null, condicion: document.getElementById('edit-req-condicion').value }).eq('id', id).eq('user_id', currentUser.id).then(function(result) {
    if (result.error) { toast('Error: ' + result.error.message, 'error'); return; }
    toast('¡Pedido actualizado!', 'success');
    closeEditReq();
    loadRequests(); loadMyRequests();
  });
}
