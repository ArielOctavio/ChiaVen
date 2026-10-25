// ══ UNLOCK ══
function openUnlockModal(carId) {
  pendingUnlockCarId = carId;
  if (isSubActive() && getSubscription().plan !== 'trial') {
    unlockContact(carId);
    if (detailCar && detailCar.id === carId) renderDetailContact(detailCar, false);
    toast('✅ Contacto desbloqueado con Premium', 'success');
    return;
  }
  var sub = getSubscription();
  
  document.getElementById('unlock-modal').classList.remove('hidden');
}
function closeUnlockModal() { document.getElementById('unlock-modal').classList.add('hidden'); pendingUnlockCarId = null; }
function handleUnlockSub() { closeUnlockModal(); navigate('suscripcion'); }

function handleUnlockToken() {
  closeUnlockModal();
  if (pendingUnlockCarId) {
    unlockContact(pendingUnlockCarId);
    toast('✅ Contacto habilitado', 'success');
    if (detailCar && detailCar.id === pendingUnlockCarId) renderDetailContact(detailCar, false);
  }
}

// ══ SUBSCRIPTION ══
// La suscripción vive en Supabase (tabla subscriptions, solo lectura para la agencia).
var subscriptionCache = { plan: 'free', expiry: null };
function getSubscription() { return subscriptionCache; }
function loadSubscription() {
  if (!currentUser) return Promise.resolve();
  try { localStorage.removeItem(SUB_KEY); } catch(e) {}
  return getSB().from('subscriptions').select('plan,expiry,activated_at').eq('user_id', currentUser.id).limit(1).then(function(r) {
    var row = r.data && r.data[0];
    subscriptionCache = row ? { plan: row.plan, expiry: row.expiry, activatedAt: row.activated_at } : { plan: 'free', expiry: null };
    updateSubUI();
  });
}
function isSubActive() { var sub = getSubscription(); if (sub.plan === 'free' || !sub.expiry) return false; return new Date(sub.expiry) > new Date(); }

function updateSubUI() {
  var sub = getSubscription();
  var active = isSubActive();
  var badge = document.getElementById('top-sub-badge');
  var statusLabel = document.getElementById('sub-status-label');
  var expiryLabel = document.getElementById('sub-expiry-label');
  var countdownBar = document.getElementById('sub-countdown-bar');
  var countdownFill = document.getElementById('sub-countdown-fill');
  var commDisp = document.getElementById('sub-commission-display');
  if (commDisp) commDisp.textContent = fmtCommissionLabel(getCommissionRate());
  var homePlan = document.getElementById('home-plan-badge');
  if (homePlan) homePlan.textContent = isSubActive() ? 'Plan PRO ⭐' : 'Plan Gratis';
  var homeComm = document.getElementById('home-commission-rate');
  if (homeComm) homeComm.textContent = 'Comision: ' + fmtCommissionLabel(getCommissionRate());
  
  
  if (badge) {
    if (sub.plan === 'free') badge.innerHTML = '<span class="sub-badge free">Plan Gratis</span>';
    else if (active) { var plan = PLANS[sub.plan] || {}; badge.innerHTML = '<span class="sub-badge ' + (sub.plan === 'trial' ? 'trial' : 'premium') + '">' + (plan.icon || '⭐') + ' ' + (plan.name || '') + '</span>'; }
    else badge.innerHTML = '<span class="sub-badge expired">⚠️ Vencida</span>';
    badge.style.display = 'inline-flex';
  }
  if (statusLabel) {
    if (sub.plan === 'free') { statusLabel.textContent = 'Sin suscripción activa'; statusLabel.style.color = 'var(--text2)'; }
    else if (active) { var pl = PLANS[sub.plan] || {}; statusLabel.textContent = (pl.icon || '') + ' ' + (pl.name || '') + ' — ACTIVO'; statusLabel.style.color = 'var(--green)'; }
    else { statusLabel.textContent = '⚠️ Suscripción vencida'; statusLabel.style.color = 'var(--red)'; }
  }
  if (sub.expiry && expiryLabel) {
    var exp = new Date(sub.expiry);
    var diffDays = Math.max(0, Math.ceil((exp - new Date()) / 86400000));
    expiryLabel.textContent = active ? 'Vence el ' + exp.toLocaleDateString('es-AR') + ' (' + diffDays + ' días)' : 'Venció el ' + exp.toLocaleDateString('es-AR');
    if (sub.plan && PLANS[sub.plan] && countdownBar) {
      var totalDays = PLANS[sub.plan].days || 30;
      var pct = Math.min(100, Math.round((diffDays / totalDays) * 100));
      countdownBar.style.display = 'block';
      countdownFill.style.width = pct + '%';
      countdownFill.style.background = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--amber)' : 'var(--red)';
    }
  }
}

function checkSubNotifications() {
  var sub = getSubscription();
  if (!sub.expiry) return;
  var diffDays = Math.ceil((new Date(sub.expiry) - new Date()) / 86400000);
  if (diffDays <= 0) toast('⚠️ Tu suscripción venció. Renovála en Suscripción.', 'error');
  else if (diffDays <= 3) toast('⏰ Tu suscripción vence en ' + diffDays + ' día' + (diffDays > 1 ? 's' : '') + '.', 'info');
}

// ══ PAYMENT ══
function openPayment(planKey) {
  currentPayPlan = planKey;
  var plan = PLANS[planKey];
  if (!plan) return;
  document.getElementById('pay-icon').textContent = plan.icon;
  document.getElementById('pay-title').textContent = plan.name;
  document.getElementById('pay-desc').textContent = plan.days + ' días de acceso';
  document.getElementById('pay-amount').textContent = plan.price === 0 ? 'GRATIS' : '$' + plan.price.toLocaleString('es-AR');
  document.getElementById('btn-pay').textContent = plan.price === 0 ? 'Activar prueba gratis' : 'Confirmar pago (Demo)';
  selectPayMethod('mp');
  document.getElementById('payment-modal').classList.remove('hidden');
}
function closePayment() { document.getElementById('payment-modal').classList.add('hidden'); currentPayPlan = null; }
function selectPayMethod(m) {
  selectedPayMethod = m;
  document.getElementById('pm-mp').classList.toggle('selected', m === 'mp');
  document.getElementById('pm-transfer').classList.toggle('selected', m === 'transfer');
  document.getElementById('pay-transfer-info').style.display = m === 'transfer' ? 'block' : 'none';
}
function confirmPayment() {
  if (!currentPayPlan || !currentUser) return;
  var plan = PLANS[currentPayPlan];
  var btn = document.getElementById('btn-pay');
  btn.disabled = true;
  // El plan no se activa desde el navegador: queda un pedido que se aprueba al confirmar el pago.
  getSB().from('subscription_requests').insert({ user_id: currentUser.id, plan: currentPayPlan, pay_method: selectedPayMethod }).then(function(r) {
    btn.disabled = false;
    if (r.error) { toast('No se pudo enviar el pedido: ' + (r.error.message || 'error'), 'error'); return; }
    closePayment();
    toast('📨 Pedido de ' + plan.name + ' enviado. Se activa cuando confirmemos el pago.', 'success');
    navigate('suscripcion');
  });
}

// ══ FORGOT / CHANGE PASSWORD ══
function openForgotPassword() {
  var loginEmail = document.getElementById('login-email').value.trim();
  if (loginEmail) document.getElementById('forgot-email').value = loginEmail;
  document.getElementById('forgot-error').style.display = 'none';
  document.getElementById('forgot-ok').style.display = 'none';
  document.getElementById('btn-forgot').disabled = false;
  document.getElementById('btn-forgot').textContent = 'Enviar link';
  document.getElementById('forgot-modal').classList.remove('hidden');
}
function closeForgotPassword() { document.getElementById('forgot-modal').classList.add('hidden'); }
function handleForgotPassword() {
  var email = document.getElementById('forgot-email').value.trim();
  var errEl = document.getElementById('forgot-error');
  var okEl = document.getElementById('forgot-ok');
  var btn = document.getElementById('btn-forgot');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if (!email || email.indexOf('@') < 0) { errEl.textContent = 'Ingresá un email válido.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Enviando...';
  getSB().auth.resetPasswordForEmail(email).then(function(result) {
    btn.disabled = false; btn.textContent = 'Enviar link';
    if (result.error) { errEl.textContent = result.error.message; errEl.style.display = 'block'; }
    else { okEl.style.display = 'block'; setTimeout(closeForgotPassword, 4000); }
  }).catch(function(e) { btn.disabled = false; btn.textContent = 'Enviar link'; errEl.textContent = e.message; errEl.style.display = 'block'; });
}
function handleChangePassword() {
  var np = document.getElementById('new-pass').value;
  var cp = document.getElementById('confirm-pass').value;
  var errEl = document.getElementById('change-pass-error');
  var okEl = document.getElementById('change-pass-ok');
  var btn = document.getElementById('btn-change-pass');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if (!np) { errEl.textContent = 'Ingresá la nueva contraseña.'; errEl.style.display = 'block'; return; }
  if (np.length < 6) { errEl.textContent = 'Mínimo 6 caracteres.'; errEl.style.display = 'block'; return; }
  if (np !== cp) { errEl.textContent = 'Las contraseñas no coinciden.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Actualizando...';
  getSB().auth.updatePassword(np).then(function(result) {
    btn.disabled = false; btn.textContent = 'Actualizar contraseña';
    if (result.error) { errEl.textContent = result.error.message; errEl.style.display = 'block'; }
    else { okEl.style.display = 'block'; document.getElementById('new-pass').value = ''; document.getElementById('confirm-pass').value = ''; toast('Contraseña actualizada ✅', 'success'); }
  });
}

// ══ PROFILE ══
// El perfil vive en Supabase (tabla profiles). Lo guardado antes en este navegador se migra una vez.
var PROFILE_FIELDS = ['nombre','cuit','direccion','telefono','ig','web','localidad'];
function loadProfile() {
  if (!currentUser) return Promise.resolve();
  var uid = currentUser.id;
  var legacyKey = 'chiaven_profile_' + uid;
  var legacy = {};
  try { legacy = JSON.parse(localStorage.getItem(legacyKey) || '{}'); } catch(e) {}
  var meta = (currentUser.user_metadata) || {};
  return getSB().from('profiles').select('*').eq('id', uid).limit(1).then(function(r) {
    var row = r.data && r.data[0];
    if (row) {
      var clean = {};
      Object.keys(row).forEach(function(k) { if (row[k] !== null) clean[k] = row[k]; });
      profileData = Object.assign({}, meta, clean);
      try { localStorage.removeItem(legacyKey); localStorage.removeItem('chiaven_profile_pending'); } catch(e) {}
    } else {
      profileData = Object.assign({}, meta, legacy);
      if (!r.error) persistProfile().then(function(w) {
        if (!w.error) { try { localStorage.removeItem(legacyKey); localStorage.removeItem('chiaven_profile_pending'); } catch(e) {} }
      });
    }
    PROFILE_FIELDS.forEach(function(f) {
      var el = document.getElementById('profile-' + f);
      if (el && profileData[f]) el.value = profileData[f];
    });
    if (profileData.photo) updateProfilePhotoUI(profileData.photo);
  });
}
function persistProfile() {
  var row = { id: currentUser.id, updated_at: new Date().toISOString() };
  PROFILE_FIELDS.concat(['photo']).forEach(function(f) { row[f] = profileData[f] || null; });
  return getSB().from('profiles').upsert(row);
}
function saveProfile() {
  if (!currentUser) return;
  PROFILE_FIELDS.forEach(function(f) {
    var el = document.getElementById('profile-' + f);
    if (el) profileData[f] = el.value;
  });
  persistProfile().then(function(r) {
    if (r.error) toast('No se pudo guardar el perfil: ' + (r.error.message || 'error'), 'error');
    else {
      toast('¡Perfil guardado!', 'success');
      var alertEl = document.getElementById('profile-incomplete-alert');
      if (alertEl && String(profileData.nombre || '').trim()) alertEl.remove();
    }
  });
}
function handleProfilePhoto(input) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var SIZE = 300;
      var canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      var ctx = canvas.getContext('2d');
      var min = Math.min(img.width, img.height);
      var sx = (img.width - min) / 2, sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      profileData.photo = dataUrl;
      updateProfilePhotoUI(dataUrl);
      persistProfile().then(function(r) {
        if (r.error) toast('No se pudo guardar la foto: ' + (r.error.message || 'error'), 'error');
        else toast('Foto actualizada', 'success');
      });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
  input.value = '';
}
function updateProfilePhotoUI(dataUrl) {
  var big = document.getElementById('profile-avatar');
  if (big) big.innerHTML = dataUrl ? '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:18px">' : '?';
  var small = document.getElementById('user-avatar-initials');
  if (small) small.innerHTML = dataUrl ? '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px">' : '?';
}
