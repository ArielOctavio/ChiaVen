// ══ CATÁLOGO MARCAS / MODELOS ══
// Lista cerrada para publicar y editar vehículos. Para sumar una marca o un modelo, agregarlo acá.
var CATALOGO_VEHICULOS = {
  'Alfa Romeo': ['Giulia', 'Giulietta', 'Mito', 'Stelvio', 'Tonale'],
  'Audi': ['A1', 'A3', 'A4', 'A5', 'A6', 'Q2', 'Q3', 'Q5', 'Q7', 'Q8', 'TT'],
  'BAIC': ['BJ40', 'X35', 'X55'],
  'BMW': ['Serie 1', 'Serie 2', 'Serie 3', 'Serie 4', 'Serie 5', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'Z4'],
  'BYD': ['Dolphin', 'Dolphin Mini', 'Seal', 'Song Plus', 'Yuan Plus'],
  'Chery': ['Arrizo 5', 'QQ', 'Tiggo 2', 'Tiggo 3', 'Tiggo 4', 'Tiggo 7', 'Tiggo 8'],
  'Chevrolet': ['Agile', 'Aveo', 'Camaro', 'Captiva', 'Classic', 'Cobalt', 'Corsa', 'Cruze', 'Equinox', 'Montana', 'Onix', 'Onix Plus', 'Prisma', 'S10', 'Sonic', 'Spin', 'Tracker', 'Trailblazer'],
  'Citroën': ['Berlingo', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C4 Lounge', 'C5 Aircross', 'C-Elysée', 'Jumper', 'Xsara Picasso'],
  'DS': ['DS3', 'DS4', 'DS7'],
  'Dodge': ['Journey', 'Ram 1500'],
  'Fiat': ['500', 'Argo', 'Cronos', 'Doblo', 'Fastback', 'Fiorino', 'Grand Siena', 'Idea', 'Mobi', 'Palio', 'Pulse', 'Punto', 'Siena', 'Strada', 'Toro', 'Uno', 'Ducato'],
  'Ford': ['Bronco', 'EcoSport', 'Escape', 'F-150', 'Fiesta', 'Focus', 'Ka', 'Kuga', 'Maverick', 'Mondeo', 'Mustang', 'Ranger', 'Territory', 'Transit'],
  'Haval': ['H6', 'Jolion'],
  'Honda': ['Accord', 'City', 'Civic', 'CR-V', 'Fit', 'HR-V', 'WR-V'],
  'Hyundai': ['Creta', 'Elantra', 'H-1', 'i10', 'i30', 'Santa Fe', 'Tucson', 'Veloster'],
  'Jeep': ['Cherokee', 'Commander', 'Compass', 'Gladiator', 'Grand Cherokee', 'Renegade', 'Wrangler'],
  'Kia': ['Carnival', 'Cerato', 'Picanto', 'Rio', 'Seltos', 'Sorento', 'Soul', 'Sportage'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Evoque', 'Range Rover Sport', 'Range Rover Velar'],
  'Mercedes-Benz': ['Clase A', 'Clase C', 'Clase E', 'Clase GLA', 'Clase GLC', 'Clase GLE', 'Sprinter', 'Vito'],
  'Mini': ['Cooper', 'Countryman'],
  'Mitsubishi': ['ASX', 'L200', 'Lancer', 'Montero', 'Outlander'],
  'Nissan': ['Frontier', 'Kicks', 'March', 'Note', 'Sentra', 'Tiida', 'Versa', 'X-Trail'],
  'Peugeot': ['107', '206', '207', '208', '2008', '3008', '301', '307', '308', '408', '5008', 'Expert', 'Partner'],
  'Porsche': ['911', 'Cayenne', 'Macan', 'Panamera'],
  'RAM': ['700', '1000', '1500', '2500'],
  'Renault': ['Alaskan', 'Arkana', 'Captur', 'Clio', 'Duster', 'Duster Oroch', 'Fluence', 'Kangoo', 'Kardian', 'Koleos', 'Kwid', 'Logan', 'Megane', 'Sandero', 'Sandero Stepway', 'Symbol'],
  'Subaru': ['Forester', 'Impreza', 'Outback', 'XV'],
  'Suzuki': ['Baleno', 'Fun', 'Grand Vitara', 'Jimny', 'Swift', 'Vitara'],
  'Toyota': ['Corolla', 'Corolla Cross', 'Etios', 'Hilux', 'Hilux SW4', 'Land Cruiser', 'Prius', 'RAV4', 'Yaris'],
  'Volkswagen': ['Amarok', 'Bora', 'Fox', 'Gol', 'Gol Trend', 'Golf', 'Nivus', 'Passat', 'Polo', 'Saveiro', 'Suran', 'Taos', 'T-Cross', 'Tiguan', 'Up!', 'Vento', 'Virtus', 'Voyage'],
  'Volvo': ['C40', 'S60', 'XC40', 'XC60', 'XC90']
};

function catalogoOption(value, label, selected) {
  return '<option value="' + escapeAttr(value) + '"' + (selected ? ' selected' : '') + '>' + escapeAttr(label) + '</option>';
}
function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Llena el select de marcas. Si el valor actual no está en el catálogo (autos viejos), se agrega igual para no perderlo.
function fillMarcaSelect(marcaId, modeloId, marca, modelo) {
  var sel = document.getElementById(marcaId);
  if (!sel) return;
  var marcas = Object.keys(CATALOGO_VEHICULOS).sort(function(a, b) { return a.localeCompare(b, 'es'); });
  if (marca && marcas.indexOf(marca) === -1) marcas.unshift(marca);
  sel.innerHTML = catalogoOption('', 'Elegí la marca', !marca) + marcas.map(function(m) { return catalogoOption(m, m, m === marca); }).join('');
  fillModeloSelect(marcaId, modeloId, modelo);
}

function fillModeloSelect(marcaId, modeloId, modelo) {
  var sel = document.getElementById(modeloId);
  if (!sel) return;
  var marca = document.getElementById(marcaId).value;
  var modelos = (CATALOGO_VEHICULOS[marca] || []).slice().sort(function(a, b) { return a.localeCompare(b, 'es', { numeric: true }); });
  if (modelo && modelos.indexOf(modelo) === -1) modelos.unshift(modelo);
  sel.disabled = !marca;
  sel.innerHTML = catalogoOption('', marca ? 'Elegí el modelo' : 'Primero elegí la marca', !modelo) + modelos.map(function(m) { return catalogoOption(m, m, m === modelo); }).join('');
}

document.addEventListener('DOMContentLoaded', function() {
  fillMarcaSelect('pub-marca', 'pub-modelo');
  fillMarcaSelect('edit-marca', 'edit-modelo');
  fillMarcaSelect('req-marca', 'req-modelo');
  fillMarcaSelect('edit-req-marca', 'edit-req-modelo');
  fillMarcaSelect('alert-marca', 'alert-modelo');
  fillMarcaSelect('cr-marca', 'cr-modelo');
});
