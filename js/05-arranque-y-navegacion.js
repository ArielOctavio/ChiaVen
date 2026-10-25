// ══ LOADER ══
function hideLoader() {
  var l = document.getElementById('loader');
  if (!l) return;
  l.classList.add('hide');
  setTimeout(function() { l.style.display = 'none'; }, 500);
}

// ══ TOAST ══
function toast(msg, type) {
  type = type || 'info';
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = '<div class="toast-dot"></div><span>' + msg + '</span>';
  c.appendChild(t);
  setTimeout(function() {
    t.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, 3500);
}

// ══ INIT ══
document.addEventListener('DOMContentLoaded', function() {
  initFinanciacion();
  var _t = setTimeout(hideLoader, 4000);
  (function() {
    return initApp().then(function() {
      clearTimeout(_t);
      setTimeout(hideLoader, 800);
    }).catch(function(e) {
      console.error('initApp error:', e);
      showAuth();
      clearTimeout(_t);
      setTimeout(hideLoader, 800);
    });
  })();
});

var _oauthError = null;

function initApp() {
  // Primero, la vuelta de Google/Facebook (tokens o error en la dirección)
  return getSB().auth.sessionFromUrl().then(function(oauth) {
    if (oauth && oauth.error) _oauthError = oauth.error.message;
    return getSB().auth.getSession();
  }).then(function(result) {
    if (result.error) {
      console.warn('getSession error:', result.error);
      showAuth();
      return;
    }
    var session = result.data && result.data.session;
    if (session && session.user) {
      currentUser = session.user;
      showApp();
    } else {
      showAuth();
    }
    getSB().auth.onAuthStateChange(function(_e, s) {
      if (s && s.user) { currentUser = s.user; showApp(); }
      else { currentUser = null; showAuth(); }
    });
  }).catch(function(e) {
    console.error('initApp failed:', e);
    showAuth();
  });
}

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  if (_oauthError) {
    showOAuthError(_oauthError);
    _oauthError = null;
  }
  document.getElementById('app-screen').classList.remove('visible');
  var topbar = document.getElementById('topbar');
  if (topbar) topbar.style.display = 'none';
}

function showApp() {
  // iOS Safari: double-check session is valid before rendering
  if (!currentUser || !currentUser.id) {
    showAuth();
    return;
  }
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('visible');
  var email = (currentUser && currentUser.email) || '';
  var ini = email[0] ? email[0].toUpperCase() : '?';
  var avatarInit = document.getElementById('user-avatar-initials');
  if (avatarInit) avatarInit.textContent = ini;
  var avatarTop = document.getElementById('user-avatar-topbar');
  if (avatarTop) avatarTop.textContent = ini;
  var emailDisp = document.getElementById('user-email-display');
  if (emailDisp) emailDisp.textContent = email;
  var profEmail = document.getElementById('profile-email-display');
  if (profEmail) profEmail.textContent = email;
  var profId = document.getElementById('profile-id');
  if (profId) profId.textContent = currentUser ? currentUser.id : '—';
  var topName = document.getElementById('user-topbar-name');
  if (topName) topName.textContent = email.split('@')[0] || 'Mi Agencia';
  document.getElementById('topbar').style.display = 'flex';
  loadProfile().then(function() { loadHomeData(); checkProfileComplete(); });
  loadCurrencyRates();
  setInterval(loadCurrencyRates, 300000);
  startTopbarClock();
  updateSubUI();
  loadSubscription().then(checkSubNotifications);
  updateNotifBadge();
  loadNotifications();
  loadFavorites().then(updateFavBtns);
  initChatSystem();
  syncRemoteNegotiations();
  setTimeout(function() { checkForNewMatches(); checkForDeals(); }, 3000);
  setInterval(function() { checkForNewMatches(); checkForDeals(); }, 120000);
  if (remoteNegotiationSyncInterval) clearInterval(remoteNegotiationSyncInterval);
  remoteNegotiationSyncInterval = setInterval(syncRemoteNegotiations, 10000);
  navigate('home');
}

// ══ AUTH ══
function switchTab(tab, el) {
  document.querySelectorAll('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.auth-form').forEach(function(f) { f.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('form-' + tab).classList.add('active');
}

function handleLogin() {
  var email = document.getElementById('login-email').value.trim();
  var pass = document.getElementById('login-pass').value;
  var errEl = document.getElementById('login-error');
  var btn = document.getElementById('btn-login');
  errEl.style.display = 'none';
  if (!email || !pass) { errEl.textContent = 'Completá todos los campos.'; errEl.style.display = 'block'; return; }
  if (email.indexOf('@') < 0) { errEl.textContent = 'Ingresá un email válido.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Ingresando...';
  getSB().auth.signInWithPassword({ email: email, password: pass }).then(function(result) {
    btn.disabled = false; btn.textContent = 'Ingresar';
    if (result.error) { errEl.textContent = result.error.message || 'Email o contraseña incorrectos.'; errEl.style.display = 'block'; }
    else toast('¡Bienvenido a Chiaven!', 'success');
  }).catch(function(e) {
    btn.disabled = false; btn.textContent = 'Ingresar';
    errEl.textContent = e.message || 'Error de conexión.'; errEl.style.display = 'block';
  });
}

function handleRegister() {
  var email = document.getElementById('reg-email').value.trim();
  var pass = document.getElementById('reg-pass').value;
  var nombre = document.getElementById('reg-nombre').value.trim();
  var cuit = document.getElementById('reg-cuit').value.trim();
  var telefono = document.getElementById('reg-telefono').value.trim();
  var direccion = document.getElementById('reg-direccion').value.trim();
  var errEl = document.getElementById('reg-error');
  var btn = document.getElementById('btn-register');
  errEl.style.display = 'none';
  if (!email || !pass) { errEl.textContent = 'Email y contraseña obligatorios.'; errEl.style.display = 'block'; return; }
  if (email.indexOf('@') < 0) { errEl.textContent = 'Email inválido.'; errEl.style.display = 'block'; return; }
  if (pass.length < 6) { errEl.textContent = 'Mínimo 6 caracteres.'; errEl.style.display = 'block'; return; }
  if (!nombre) { errEl.textContent = 'Ingresá el nombre de tu agencia.'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Creando...';
  getSB().auth.signUp({ email: email, password: pass, options: { data: { nombre: nombre, cuit: cuit, telefono: telefono, direccion: direccion } } }).then(function(result) {
    btn.disabled = false; btn.textContent = 'Crear cuenta';
    if (result.error) { errEl.textContent = result.error.message; errEl.style.display = 'block'; }
    else {
      toast('¡Cuenta creada! Revisá tu email.', 'success');
    }
  }).catch(function(e) {
    btn.disabled = false; btn.textContent = 'Crear cuenta';
    errEl.textContent = e.message; errEl.style.display = 'block';
  });
}

function handleOAuth(provider, btn) {
  var buttons = document.querySelectorAll('.oauth-btn');
  buttons.forEach(function(b) { b.disabled = true; });
  if (btn) {
    btn.dataset.label = btn.querySelector('span').textContent;
    btn.querySelector('span').textContent = 'Conectando...';
  }
  getSB().auth.signInWithOAuth(provider).then(function(r) {
    if (!r.error) return; // se está redirigiendo
    buttons.forEach(function(b) { b.disabled = false; });
    if (btn) btn.querySelector('span').textContent = btn.dataset.label;
    showOAuthError(r.error.message);
  });
}

// Muestra el error en el formulario que esté visible (ingreso o registro)
function showOAuthError(msg) {
  var reg = document.getElementById('form-register');
  var errEl = document.getElementById(reg && reg.classList.contains('active') ? 'reg-error' : 'login-error');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.style.display = 'block';
}

// Quien entra por primera vez con Google/Facebook no tiene datos de agencia: lo llevamos a completarlos.
function checkProfileComplete() {
  if (!currentUser || (profileData && String(profileData.nombre || '').trim())) return;
  var meta = currentUser.user_metadata || {};
  var sugerido = meta.full_name || meta.name || '';
  navigate('profile');
  var el = document.getElementById('profile-nombre');
  if (el && !el.value && sugerido) { el.value = sugerido; }
  var page = document.getElementById('page-profile');
  if (page && !document.getElementById('profile-incomplete-alert')) {
    var box = document.createElement('div');
    box.id = 'profile-incomplete-alert';
    box.style.cssText = 'background:var(--amber-glow);border:1px solid rgba(245,158,11,0.4);border-radius:var(--radius);padding:12px 14px;margin-bottom:14px;font-size:0.84rem;color:var(--text)';
    box.innerHTML = '👋 <strong>Completá los datos de tu agencia</strong> (nombre, CUIT y teléfono) y tocá Guardar. Así las otras agencias saben con quién negocian.' +
      (sugerido ? '<div style="font-size:0.76rem;color:var(--text2);margin-top:4px">Te sugerimos "' + esc(sugerido) + '" como nombre; cambialo por el de tu agencia si no corresponde.</div>' : '');
    var header = page.querySelector('.page-header');
    if (header && header.nextSibling) page.insertBefore(box, header.nextSibling); else page.insertBefore(box, page.firstChild);
  }
}

function handleLogout() {
  getSB().auth.signOut().then(function() { toast('Sesión cerrada', 'info'); });
}

// ══ SIDEBAR ══
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  var btn = document.getElementById('sidebar-toggle-btn');
  var arrow = document.getElementById('toggle-arrow');
  btn.style.left = sidebarCollapsed ? '50px' : 'calc(var(--sidebar-w) - 14px)';
  arrow.style.transform = sidebarCollapsed ? 'rotate(180deg)' : '';
}
function collapseSidebar() { if (!sidebarCollapsed) toggleSidebar(); }

// ══ NAVIGATE ══
function navigate(page) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.querySelectorAll('.bn-item').forEach(function(n) { n.classList.remove('active'); });
  var pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(function(n) {
    var oc = n.getAttribute('onclick') || '';
    if (oc.indexOf("'" + page + "'") >= 0) n.classList.add('active');
  });
  var bn = document.getElementById('bn-' + page);
  if (bn) bn.classList.add('active');
  collapseSidebar();
  if (page === 'home')        loadHomeData();
  if (page === 'vehicles')    loadAllVehicles();
  if (page === 'requests')    loadRequests();
  if (page === 'profile')     { loadProfile(); loadMyCars(); loadMyRequests(); }
  if (page === 'noticias')    loadNews();
  if (page === 'messages') { stopSubscription(); loadMessagesPage(); }
  if (page === 'operations')  loadMyOperations();
  if (page === 'operations')  loadMyOperations();
  if (page === 'suscripcion') updateSubUI();
  if (page === 'publish')     resetPublishForm();
}

// ══ HELPERS ══
function fmtPrice(p) { return p ? '$' + Number(p).toLocaleString('es-AR') : '—'; }
function fmtKm(k) { return k ? Number(k).toLocaleString('es-AR') + ' km' : '—'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('es-AR', { day:'2-digit', month:'short', year:'numeric' }) : ''; }
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function matchClass(p) { return p >= 80 ? 'high' : p >= 60 ? 'mid' : 'low'; }
function matchColor(p) { return p >= 80 ? 'var(--green)' : p >= 60 ? 'var(--amber)' : 'var(--red)'; }

function showSkeletons(id, n) {
  var g = document.getElementById(id);
  if (!g) return;
  var html = '';
  for (var i = 0; i < n; i++) {
    html += '<div class="skel-card"><div class="skel-img skeleton"></div><div class="skel-line skeleton"></div><div class="skel-line short skeleton"></div><div class="skel-line price skeleton"></div></div>';
  }
  g.innerHTML = html;
}
