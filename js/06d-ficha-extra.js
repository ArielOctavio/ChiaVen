// ══ FICHA AMPLIADA DEL AUTO ══
// Versión, combustible, transmisión, VTV, descripción, permuta y único dueño.
// Los mismos campos se usan al publicar (prefijo "pub") y al editar (prefijo "edit").
var CAR_COMBUSTIBLES = ['Nafta', 'Diésel', 'GNC', 'Nafta/GNC', 'Híbrido', 'Eléctrico'];
var CAR_TRANSMISIONES = ['Manual', 'Automática'];
var CAR_VTV = [['al_dia', 'Al día'], ['vencida', 'Vencida'], ['no_corresponde', 'No corresponde (0KM)']];
var CAR_EXTRA_KEYS = ['version', 'combustible', 'transmision', 'vtv', 'descripcion', 'acepta_permuta', 'unico_dueno'];

function carVtvLabel(v) {
  var f = CAR_VTV.filter(function(x) { return x[0] === v; })[0];
  return f ? f[1] : '';
}

function extraSelectHTML(id, label, opts, emptyLabel) {
  return '<div class="form-field"><label class="form-label">' + label + '</label><select class="form-select" id="' + id + '">' +
    '<option value="">' + emptyLabel + '</option>' +
    opts.map(function(o) { if (typeof o === 'string') o = [o, o]; return '<option value="' + escapeAttr(o[0]) + '">' + escapeAttr(o[1]) + '</option>'; }).join('') +
    '</select></div>';
}

function extraToggleHTML(id, label) {
  return '<div class="form-field"><div class="toggle-row"><label class="toggle-switch"><input type="checkbox" id="' + id + '"><span class="toggle-slider"></span></label><span style="font-size:0.84rem">' + label + '</span></div></div>';
}

function extraFieldsHTML(p) {
  return '<div class="form-field"><label class="form-label">Versión</label><input class="form-input" id="' + p + '-version" placeholder="Ej: 1.6 Highline"></div>' +
    extraSelectHTML(p + '-combustible', 'Combustible', CAR_COMBUSTIBLES, 'Elegí') +
    extraSelectHTML(p + '-transmision', 'Transmisión', CAR_TRANSMISIONES, 'Elegí') +
    extraSelectHTML(p + '-vtv', 'VTV', CAR_VTV, 'Sin informar') +
    extraToggleHTML(p + '-acepta-permuta', '🔄 Acepta permuta') +
    extraToggleHTML(p + '-unico-dueno', '👤 Único dueño') +
    '<div class="form-field full"><label class="form-label">Descripción</label><textarea class="form-input" id="' + p + '-descripcion" rows="3" maxlength="1500" placeholder="Estado, equipamiento, service oficiales, detalles a tener en cuenta..."></textarea></div>';
}

function readExtraFields(p) {
  function v(id) { var el = document.getElementById(p + '-' + id); return el ? el.value.trim() : ''; }
  function c(id) { var el = document.getElementById(p + '-' + id); return !!(el && el.checked); }
  return {
    version: v('version') || null,
    combustible: v('combustible') || null,
    transmision: v('transmision') || null,
    vtv: v('vtv') || null,
    descripcion: v('descripcion') || null,
    acepta_permuta: c('acepta-permuta'),
    unico_dueno: c('unico-dueno')
  };
}

function fillExtraFields(p, car) {
  car = car || {};
  function setSel(id, val) {
    var el = document.getElementById(p + '-' + id);
    if (!el) return;
    if (val && !el.querySelector('option[value="' + String(val).replace(/"/g, '\\"') + '"]')) el.appendChild(new Option(val, val));
    el.value = val || '';
  }
  var ver = document.getElementById(p + '-version'); if (ver) ver.value = car.version || '';
  setSel('combustible', car.combustible);
  setSel('transmision', car.transmision);
  setSel('vtv', car.vtv);
  var d = document.getElementById(p + '-descripcion'); if (d) d.value = car.descripcion || '';
  var ap = document.getElementById(p + '-acepta-permuta'); if (ap) ap.checked = !!car.acepta_permuta;
  var ud = document.getElementById(p + '-unico-dueno'); if (ud) ud.checked = !!car.unico_dueno;
}

// Bloque para la ficha del auto
function carExtraDetailHTML(car) {
  var chips = [];
  if (car.version) chips.push('🏷️ ' + esc(car.version));
  if (car.combustible) chips.push('⛽ ' + esc(car.combustible));
  if (car.transmision) chips.push('⚙️ ' + esc(car.transmision));
  if (car.vtv) chips.push('📋 VTV: ' + esc(carVtvLabel(car.vtv) || car.vtv));
  if (car.acepta_permuta) chips.push('🔄 Acepta permuta');
  if (car.unico_dueno) chips.push('👤 Único dueño');
  if (!chips.length && !car.descripcion) return '';
  return '<div class="detail-extra">' +
    (chips.length ? '<div class="detail-extra-chips">' + chips.map(function(c) { return '<span>' + c + '</span>'; }).join('') + '</div>' : '') +
    (car.descripcion ? '<div class="detail-extra-desc">' + esc(car.descripcion) + '</div>' : '') +
  '</div>';
}

// Inserta/actualiza el auto; si la base todavía no tiene las columnas nuevas
// (falta correr supabase/003_tanda1.sql), reintenta sin ellas para no bloquear la publicación.
var CAR_NEW_COLUMNS = ['combustible', 'transmision', 'vtv', 'descripcion', 'acepta_permuta', 'unico_dueno', 'moneda', 'precio_usd'];
function isMissingColumnError(err) {
  var m = String((err && (err.message || err.details || err.hint)) || '').toLowerCase();
  return m.indexOf('column') >= 0 || m.indexOf('schema cache') >= 0;
}
function withoutNewColumns(row) {
  var r = Object.assign({}, row);
  CAR_NEW_COLUMNS.forEach(function(k) { delete r[k]; });
  return r;
}
function saveCarRow(kind, row, id) {
  function run(r) {
    return kind === 'insert'
      ? getSB().from('cars').insert(r)
      : getSB().from('cars').update(r).eq('id', id).eq('owner_id', currentUser.id);
  }
  return run(row).then(function(res) {
    if (!res.error || !isMissingColumnError(res.error)) return res;
    console.warn('La base no tiene las columnas nuevas; se guarda sin ellas:', res.error);
    return run(withoutNewColumns(row)).then(function(res2) {
      if (!res2.error) toast('Se guardó sin combustible, transmisión y demás datos nuevos: falta actualizar la base (supabase/003_tanda1.sql).', 'info');
      return res2;
    });
  });
}

// ══ PRECIOS: separador de miles y carga en dólares ══
function parseMoney(v) { var d = String(v == null ? '' : v).replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : 0; }
function fmtMoneyPlain(n) { return n ? Number(n).toLocaleString('es-AR') : ''; }
function fmtUsd(n) { return 'US$ ' + Number(n || 0).toLocaleString('es-AR'); }

// Formatea el campo mientras se escribe, manteniendo el cursor en su lugar
function formatMoneyInput(el) {
  var before = el.value;
  var caret = el.selectionStart == null ? before.length : el.selectionStart;
  var digitsBeforeCaret = before.slice(0, caret).replace(/[^\d]/g, '').length;
  var formatted = fmtMoneyPlain(parseMoney(before));
  el.value = formatted;
  var pos = 0, seen = 0;
  while (pos < formatted.length && seen < digitsBeforeCaret) { if (/\d/.test(formatted[pos])) seen++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch(e) {}
}

// Precio en pesos de un formulario de auto (prefijo "pub" o "edit"), convirtiendo si se cargó en dólares
function carPriceFromForm(p) {
  var monedaEl = document.getElementById(p + '-moneda');
  var moneda = monedaEl ? monedaEl.value : 'ARS';
  var raw = parseMoney(document.getElementById(p + '-precio').value);
  if (moneda !== 'USD') return { moneda: 'ARS', precio: raw || null, precio_usd: null };
  var rate = window.USD_RATE || 0;
  return { moneda: 'USD', precio: raw && rate ? Math.round(raw * rate) : null, precio_usd: raw || null, sinCotizacion: !!raw && !rate };
}

function updatePriceHint(p) {
  var hint = document.getElementById(p + '-precio-hint');
  if (!hint) return;
  var r = carPriceFromForm(p);
  if (r.moneda === 'USD') {
    hint.innerHTML = r.sinCotizacion ? '⚠️ Todavía no se cargó la cotización del dólar. Probá de nuevo en unos segundos.'
      : r.precio ? '≈ ' + fmtPrice(r.precio) + ' (dólar blue ' + fmtPrice(window.USD_RATE) + '). Se publica en pesos y se muestra también en dólares.' : 'Ingresá el precio en dólares.';
  } else {
    hint.innerHTML = r.precio && window.USD_RATE ? '≈ ' + fmtUsd(Math.round(r.precio / window.USD_RATE)) + ' al dólar blue' : '';
  }
}

function onCarPriceInput(p, el) {
  if (el) formatMoneyInput(el);
  updatePriceHint(p);
  if (p === 'pub' && typeof checkOportunidad === 'function') checkOportunidad();
}

// Completa el precio al editar: si se publicó en dólares se muestra en dólares
function fillCarPrice(p, car) {
  var monedaEl = document.getElementById(p + '-moneda');
  var usd = car && car.moneda === 'USD' && car.precio_usd;
  if (monedaEl) monedaEl.value = usd ? 'USD' : 'ARS';
  document.getElementById(p + '-precio').value = fmtMoneyPlain(usd ? car.precio_usd : (car && car.precio));
  updatePriceHint(p);
}

document.addEventListener('DOMContentLoaded', function() {
  ['pub', 'edit'].forEach(function(p) {
    var box = document.getElementById(p + '-extra-fields');
    if (box) box.innerHTML = extraFieldsHTML(p);
  });
});
