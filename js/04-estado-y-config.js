// ══ STATE ══
var currentUser = null;
var publishedPhotos = [];
var publishedBlobs = [];
var allCarsCache = [];
var vehicleCondFilter = 'all';
var profileData = {};
var galleryImages = [], galleryIndex = 0;
var detailCar = null, detailImgIdx = 0, detailImgs = [];
var unlockedContacts = {};
var chatSessions = {};
var carCache = {};
var pendingUnlockCarId = null;
var currentPayPlan = null;
var selectedPayMethod = 'mp';
var sidebarCollapsed = false;
var dragSrcIdx = null;
var _touchDragIdx = null, _touchClone = null, _touchOffX = 0, _touchOffY = 0;
var _tsx = 0;
var currentNewsIdx = null;

// ══ COEF BNA ══
var COEF_A = [
  { cuotas: 12, coef: 129.80 }, { cuotas: 18, coef: 109.60 },
  { cuotas: 24, coef: 86.87 },  { cuotas: 36, coef: 72.77 },
  { cuotas: 48, coef: 66.74 },  { cuotas: 60, coef: 64.85 }
];
var COEF_B = [
  { cuotas: 12, coef: 104.06 }, { cuotas: 18, coef: 74.46 },
  { cuotas: 24, coef: 60.79 },  { cuotas: 36, coef: 47.54 },
  { cuotas: 48, coef: 41.33 }
];

// ══ SUBSCRIPTION ══
var SUB_KEY = 'chiaven_subscription';
// ── COMMISSION CONFIG ──
var FREE_COMMISSION_RATE = 0.02;   // 2% plan gratis
var PRO_COMMISSION_RATE  = 0.015;  // 1.5% plan pro
var CHIAVEN_CBU   = '0000000000000000000000'; // CBU Chiaven (configurar)
var CHIAVEN_ALIAS = 'CHIAVEN.COMISIONES';
var CHIAVEN_TITULAR = 'Chiaven SRL';
var RESERVATION_AMOUNT = 500000; // $500.000 por defecto (configurable)

var PLANS = {
  free:    { name: 'Plan Gratis',   price: 0,      commission: FREE_COMMISSION_RATE, icon: '🆓' },
  monthly: { name: 'Chiaven PRO',    price: 50000,  commission: PRO_COMMISSION_RATE,  icon: '⭐', days: 30 },
  annual:  { name: 'Chiaven PRO Anual', price: 480000, commission: PRO_COMMISSION_RATE, icon: '🏆', days: 365 }
};

function getCommissionRate() {
  var sub = getSubscription();
  if (sub.plan === 'monthly' || sub.plan === 'annual') return PRO_COMMISSION_RATE;
  return FREE_COMMISSION_RATE;
}

function calcCommission(price, rate) {
  rate = rate || getCommissionRate();
  var commission = Math.round(price * rate);
  return { commission: commission, finalPrice: price + commission, rate: rate };
}

function fmtCommissionLabel(rate) {
  return (rate * 100).toFixed(1).replace('.0','') + '%';
}
var NOTIF_KEY = 'chiaven_notifications';

// ══ NEWS ══
var NEWS_SOURCES = [
  { title: 'Toyota presentó la nueva Hilux 2026: más potente y conectada', source: 'AutoBlog Argentina', date: 'hace 2 días', img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=70', url: 'https://autoblog.com.ar', preview: 'Toyota presentó en Buenos Aires la nueva Hilux 2026 con motor 2.8 TDI de 215 CV, caja automática de 6 velocidades y pantalla de 12.3 pulgadas. Los precios arrancan desde $45.000.000 para la SR hasta $72.000.000 para la Gr-S.' },
  { title: 'BNA lanzó nuevas líneas de crédito automotor al 45% TNA', source: 'Infobae Autos', date: 'hace 3 días', img: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&q=70', url: 'https://infobae.com', preview: 'El Banco Nación habilitó financiamiento para vehículos 0KM y usados con hasta 13 años de antigüedad al 45% TNA. Monto máximo $55.000.000 hasta el 70% del valor InfoAuto. Plazos de 12 a 60 cuotas. Trámite 100% digital desde BNA+.' },
  { title: 'El mercado de autos usados creció 18% en el primer trimestre', source: 'La Nación Autos', date: 'hace 4 días', img: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400&q=70', url: 'https://lanacion.com.ar', preview: 'Las transferencias superaron 380.000 unidades, un 18% más que el año anterior. Las SUVs medianas lideran la demanda. Los expertos atribuyen el crecimiento a mayor estabilidad cambiaria y acceso al crédito.' },
  { title: 'Ford Maverick Hybrid llegó a Argentina: precios y versiones', source: 'El Cronista', date: 'hace 5 días', img: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400&q=70', url: 'https://cronista.com', preview: 'La Maverick Hybrid llega en dos versiones: XL por $38.500.000 y XLT por $44.200.000. Motor híbrido 2.5 de 191 CV, tracción delantera y consumo de 9.2 L/100km en ciudad.' },
  { title: 'Cómo financiar un auto 0KM en 2026: la guía completa', source: 'iProUP', date: 'hace 6 días', img: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&q=70', url: 'https://iproup.com', preview: 'Comparamos créditos bancarios (BNA, Santander, Galicia), planes de ahorro y financiamiento de concesionarias. Para un vehículo de $25.000.000 a 36 cuotas, la diferencia entre la mejor y peor opción puede superar los $8.000.000.' },
  { title: 'Volkswagen Taos: la SUV más vendida de Argentina en abril', source: 'InfoAuto', date: 'hace 1 semana', img: 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=400&q=70', url: 'https://infoauto.com.ar', preview: 'La Taos lideró con 3.847 unidades patentadas en abril, superando a la Hilux y el 208. Acumula 6 meses consecutivos entre los tres más vendidos. La versión Highline 1.4 TSI automática va de $38M a $42M.' },
  { title: 'Plan de ahorro vs crédito bancario: qué conviene en 2026', source: 'Perfil Economía', date: 'hace 1 semana', img: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&q=70', url: 'https://perfil.com', preview: 'Con inflación bajando al 3% mensual y tasas bancarias al 45% TNA, los especialistas inclinan la balanza hacia el crédito bancario para autos hasta $30.000.000. Los planes siguen siendo ventajosos para alta gama.' },
  { title: 'El dólar blue y su impacto en el precio de los autos', source: 'Ámbito Financiero', date: 'hace 2 semanas', img: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&q=70', url: 'https://ambito.com', preview: 'Cada 10% de devaluación impacta entre 6% y 8% en el precio final. Los concesionarios recomiendan no demorar la compra si ya contás con el financiamiento aprobado.' }
];
