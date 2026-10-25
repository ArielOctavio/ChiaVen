// ══ SUPABASE ══
var SESSION_KEY = 'sb_session';
var _sb = null;

function fetchT(url, opts, ms) {
  ms = ms || 15000;
  return new Promise(function(resolve, reject) {
    var done = false;
    var timer = setTimeout(function() {
      if (!done) { done = true; reject(new Error('Tiempo agotado. Verificá tu internet.')); }
    }, ms);
    fetch(url, opts || {}).then(function(r) {
      if (!done) { done = true; clearTimeout(timer); resolve(r); }
    }).catch(function(e) {
      if (!done) { done = true; clearTimeout(timer); reject(e); }
    });
  });
}

function loadSession() {
  try { var r = localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch(e) { return null; }
}
function saveSession(s) {
  _session = s;
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch(e) {}
  _listeners.forEach(function(cb) { cb(s ? 'SIGNED_IN' : 'SIGNED_OUT', s); });
}

var _session = loadSession();
var _listeners = [];

function makeHeaders(extra) {
  var h = { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (_session && _session.access_token) h['Authorization'] = 'Bearer ' + _session.access_token;
  if (extra) Object.keys(extra).forEach(function(k) { h[k] = extra[k]; });
  return h;
}

function parseAuthErr(d) {
  var m = (d && (d.error_description || d.msg || d.message || d.error)) || '';
  var l = m.toLowerCase();
  if (l.indexOf('invalid') >= 0 || l.indexOf('wrong') >= 0) return 'Email o contraseña incorrectos.';
  if (l.indexOf('confirmed') >= 0) return 'Confirmá tu email antes de ingresar.';
  if (l.indexOf('too many') >= 0) return 'Demasiados intentos. Esperá unos minutos.';
  return m || 'Error de conexión. Verificá tu internet.';
}

function authPost(path, body) {
  return fetchT(SUPABASE_URL + '/auth/v1' + path, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r) {
    return r.json().then(function(d) {
      if (!r.ok) return { data: null, error: { message: parseAuthErr(d) } };
      return { data: d, error: null };
    });
  }).catch(function(e) { return { data: null, error: { message: e.message || 'Error de conexión.' } }; });
}

function oauthProviderName(p) { return { google: 'Google', facebook: 'Facebook' }[p] || p; }

function oauthAuthorizeUrl(provider) {
  return SUPABASE_URL + '/auth/v1/authorize?provider=' + encodeURIComponent(provider) +
    '&redirect_to=' + encodeURIComponent(location.origin + location.pathname);
}

function oauthErrorMessage(desc) {
  var l = String(desc || '').toLowerCase();
  if (l.indexOf('not enabled') >= 0 || l.indexOf('unsupported provider') >= 0) return 'Ese método de ingreso todavía no está activado. Por ahora ingresá con email y contraseña.';
  if (l.indexOf('access_denied') >= 0 || l.indexOf('denied') >= 0 || l.indexOf('cancel') >= 0) return 'Se canceló el ingreso. Podés intentarlo de nuevo.';
  if (l.indexOf('email') >= 0 && l.indexOf('provid') >= 0) return 'Tu cuenta de la red social no compartió un email. Habilitá el permiso de email o ingresá con email y contraseña.';
  return 'No se pudo ingresar con la red social: ' + desc;
}

// Quita los tokens o errores de la dirección para que no queden en el historial
function cleanAuthUrl() {
  try { history.replaceState(null, '', location.origin + location.pathname); } catch(e) {}
}

function qb(table) {
  var path = '/rest/v1/' + table;
  var method = 'GET', body = null, filters = [], sel = '*', ord = null, lim = null, single = false, prefer = 'return=representation';
  var b = {
    select: function(c) { sel = c || '*'; return b; },
    eq: function(c, v) { filters.push(c + '=eq.' + encodeURIComponent(v)); return b; },
    neq: function(c, v) { filters.push(c + '=neq.' + encodeURIComponent(v)); return b; },
    or: function(f) { filters.push('or=(' + f + ')'); return b; },
    order: function(c, o) { ord = c + ((o && o.ascending === false) ? '.desc' : '.asc'); return b; },
    limit: function(n) { lim = n; return b; },
    single: function() { single = true; return b; },
    insert: function(d) { method = 'POST'; body = Array.isArray(d) ? d : [d]; return b; },
    upsert: function(d, o) { method = 'POST'; body = Array.isArray(d) ? d : [d]; prefer = 'resolution=' + ((o && o.ignoreDuplicates) ? 'ignore' : 'merge') + '-duplicates,return=representation'; return b; },
    update: function(d) { method = 'PATCH'; body = d; return b; },
    delete: function() { method = 'DELETE'; return b; },
    // Devuelve una Promise real para poder encadenar .then() sobre el resultado
    then: function(onOk, onErr) {
      return new Promise(function(resolve) {
      var qs = 'select=' + sel;
      if (filters.length) qs += '&' + filters.join('&');
      if (ord) qs += '&order=' + ord;
      if (lim) qs += '&limit=' + lim;
      var xh = { 'Prefer': prefer };
      if (single) xh['Accept'] = 'application/vnd.pgrst.object+json';
      fetchT(SUPABASE_URL + path + '?' + qs, { method: method, headers: makeHeaders(xh), body: body ? JSON.stringify(body) : undefined })
        .then(function(r) {
          return r.text().then(function(t) {
            var d = null; try { d = JSON.parse(t); } catch(e) { d = t; }
            if (!r.ok) { resolve({ data: null, error: d }); return; }
            if (single && Array.isArray(d)) d = d[0] || null;
            resolve({ data: d, error: null });
          });
        }).catch(function(e) { resolve({ data: null, error: { message: e.message } }); });
      }).then(onOk, onErr);
    }
  };
  return b;
}

function getSB() {
  if (_sb) return _sb;
  _sb = {
    from: function(t) { return qb(t); },
    rpc: function(fn, args) {
      return fetchT(SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: makeHeaders(), body: JSON.stringify(args || {}) })
        .then(function(r) {
          return r.text().then(function(t) {
            var d = null; try { d = JSON.parse(t); } catch(e) { d = t; }
            return r.ok ? { data: d, error: null } : { data: null, error: d };
          });
        }).catch(function(e) { return { data: null, error: { message: e.message } }; });
    },
    get _session() { return _session; },
    auth: {
      getSession: function() {
        if (!_session) return Promise.resolve({ data: { session: null }, error: null });
        var now = Math.floor(Date.now() / 1000);
        if (_session.expires_at && now > _session.expires_at - 60) {
          return authPost('/token?grant_type=refresh_token', { refresh_token: _session.refresh_token }).then(function(r) {
            if (r.error || !r.data || !r.data.access_token) { saveSession(null); return { data: { session: null }, error: null }; }
            r.data.expires_at = Math.floor(Date.now() / 1000) + (r.data.expires_in || 3600);
            saveSession(r.data); return { data: { session: r.data }, error: null };
          });
        }
        return Promise.resolve({ data: { session: _session }, error: null });
      },
      signInWithPassword: function(c) {
        return authPost('/token?grant_type=password', { email: c.email, password: c.password }).then(function(r) {
          if (r.error) return r;
          r.data.expires_at = Math.floor(Date.now() / 1000) + (r.data.expires_in || 3600);
          saveSession(r.data); return { data: { session: r.data, user: r.data.user }, error: null };
        });
      },
      signUp: function(o) {
        var b2 = { email: o.email, password: o.password };
        if (o.options && o.options.data) b2.data = o.options.data;
        return authPost('/signup', b2).then(function(r) {
          if (r.error) return r;
          if (r.data && r.data.access_token) { r.data.expires_at = Math.floor(Date.now()/1000)+(r.data.expires_in||3600); saveSession(r.data); }
          return { data: r.data, error: null };
        });
      },
      signOut: function() {
        var t = _session && _session.access_token ? _session.access_token : '';
        saveSession(null);
        try { fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + t } }); } catch(e) {}
        return Promise.resolve({ error: null });
      },
      // Ingreso con Google / Facebook (flujo implícito: Supabase vuelve con los tokens en el hash).
      // Antes de salir se consulta /settings para avisar si el proveedor no está activado,
      // porque si no Supabase muestra su propia página de error y el usuario no vuelve al sitio.
      signInWithOAuth: function(provider) {
        return fetchT(SUPABASE_URL + '/auth/v1/settings', { headers: { 'apikey': SUPABASE_KEY } })
          .then(function(r) { return r.ok ? r.json() : null; })
          .catch(function() { return null; })
          .then(function(settings) {
            if (settings && settings.external && settings.external[provider] === false) {
              return { error: { message: oauthProviderName(provider) + ' todavía no está activado como método de ingreso. Por ahora ingresá con email y contraseña.' } };
            }
            location.href = oauthAuthorizeUrl(provider);
            return { error: null };
          });
      },
      // Si la URL trae la vuelta de Google/Facebook, arma la sesión y limpia la dirección.
      // Devuelve { session } si ingresó, { error } si el proveedor devolvió un error, o {} si no había nada.
      sessionFromUrl: function() {
        var hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
        var query = new URLSearchParams(location.search || '');
        var errDesc = hash.get('error_description') || query.get('error_description') || hash.get('error') || query.get('error');
        if (errDesc) {
          cleanAuthUrl();
          return Promise.resolve({ error: { message: oauthErrorMessage(errDesc) } });
        }
        var token = hash.get('access_token');
        if (!token) return Promise.resolve({});
        var expiresIn = parseInt(hash.get('expires_in'), 10) || 3600;
        var s = {
          access_token: token,
          refresh_token: hash.get('refresh_token') || '',
          token_type: hash.get('token_type') || 'bearer',
          expires_in: expiresIn,
          expires_at: parseInt(hash.get('expires_at'), 10) || Math.floor(Date.now() / 1000) + expiresIn
        };
        cleanAuthUrl();
        return fetchT(SUPABASE_URL + '/auth/v1/user', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + token } })
          .then(function(r) { return r.json().then(function(d) { return r.ok ? d : Promise.reject(new Error(parseAuthErr(d))); }); })
          .then(function(user) { s.user = user; saveSession(s); return { session: s }; })
          .catch(function(e) { return { error: { message: 'No se pudo completar el ingreso: ' + (e.message || 'error') } }; });
      },
      resetPasswordForEmail: function(email) { return authPost('/recover', { email: email }); },
      updatePassword: function(pw) {
        if (!_session || !_session.access_token) return Promise.resolve({ error: { message: 'No hay sesión activa.' } });
        return fetchT(SUPABASE_URL + '/auth/v1/user', { method: 'PUT', headers: makeHeaders(), body: JSON.stringify({ password: pw }) })
          .then(function(r) { return r.json().then(function(d) { return r.ok ? { error: null } : { error: { message: (d && d.message) || 'Error.' } }; }); })
          .catch(function(e) { return { error: { message: e.message } }; });
      },
      onAuthStateChange: function(cb) {
        _listeners.push(cb);
        return { data: { subscription: { unsubscribe: function() { _listeners = _listeners.filter(function(l) { return l !== cb; }); } } } };
      }
    }
  };
  return _sb;
}
