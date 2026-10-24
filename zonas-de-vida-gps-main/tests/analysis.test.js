'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Geo = require('../www/js/geo.js');
const Climate = require('../www/js/climate.js');
const A = require('../www/js/analysis.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` esperado ${b} ± ${tol}, obtenido ${a}`);

/* ---------- Estimación de temperatura por altitud ---------- */
test('estimateT: valores de referencia aproximados de ciudades colombianas', () => {
  // Referencias aproximadas (temperatura media anual conocida, de memoria): sirven como chequeo
  // de cordura, no como validación contra una base de datos.
  const cities = [
    ['Bogotá', 4.61, -74.08, 2640, 14.0], ['Medellín', 6.25, -75.57, 1495, 22.0], ['Cali', 3.45, -76.53, 1000, 24.5],
    ['Barranquilla', 10.96, -74.80, 20, 27.5], ['Bucaramanga', 7.12, -73.12, 959, 23.5], ['Tunja', 5.53, -73.36, 2820, 13.0]
  ];
  cities.forEach(([n, lat, lon, alt, ref]) => {
    const e = Climate.estimateT(lat, alt);
    near(e, ref, 2.5, n);
  });
  assert.equal(Climate.estimateT(4.6, null), null);
  assert.ok(Climate.estimateT(4.6, 0) > Climate.estimateT(4.6, 3000));
  near(Climate.estimateT(4.6, 1000) - Climate.estimateT(4.6, 2000), 5.33, 1e-9);   // gradiente
});

/* ---------- Resolución del clima por prioridad ---------- */
test('resolve: manual > internet > memoria > estimada', () => {
  const mem = new Climate.Memory();
  mem.add([{ lat: 4.61, lon: -74.08, alt: 2600, T: 14, P: 1000, src: 'paquete' }]);
  const base = { lat: 4.6, lon: -74.1, alt: 2600 };
  let r = Climate.resolve(Object.assign({ tManual: 10, pManual: 500 }, base), { memory: mem });
  assert.deepEqual([r.T, r.TSrc, r.P, r.PSrc], [10, 'manual', 500, 'manual']);
  r = Climate.resolve(Object.assign({ online: { T: 15, P: 900, elevCell: 2600 } }, base), { memory: mem });
  assert.deepEqual([r.TSrc, r.PSrc], ['online', 'online']);
  r = Climate.resolve(Object.assign({ online: { T: 15, P: 900, monthlyT: Array(12).fill(15), monthlyP: Array(12).fill(75), elevCell: 2600 } }, base), { memory: mem });
  assert.deepEqual([r.monthlyT.length, r.monthlyP.length], [12, 12]);
  r = Climate.resolve(base, { memory: mem });
  assert.deepEqual([r.TSrc, r.PSrc], ['memoria', 'memoria']);
  near(r.T, 14, 0.01); near(r.P, 1000, 1e-6);
  r = Climate.resolve(base, {});
  assert.equal(r.TSrc, 'estimada'); assert.equal(r.P, null);       // la lluvia nunca se inventa
  r = Climate.resolve({ lat: 4.6, lon: -74.1 }, {});
  assert.equal(r.T, null);
});
test('resolve: la temperatura de internet se corrige por la diferencia de altitud con la celda', () => {
  const r = Climate.resolve({ lat: 4.6, lon: -74.1, alt: 2600, online: { T: 20, P: 900, elevCell: 1000 } }, {});
  near(r.T, 20 - Climate.LAPSE * 1600, 1e-9);
  const s = Climate.resolve({ lat: 4.6, lon: -74.1, alt: null, online: { T: 20, P: 900, elevCell: 1000 } }, {});
  assert.equal(s.T, 20);
  assert.ok(s.notes.some(n => /SIN corregir/.test(n)));
});
test('resolve: conserva las fuentes históricas y estimadas de Open-Meteo', () => {
  const r = Climate.resolve({
    lat: 4.6, lon: -74.1, alt: 1500,
    online: { T: 19, P: 1200, TSrc: 'historica', PSrc: 'estimada', provider: 'Open-Meteo Historical Weather', year: 2025 }
  }, {});
  assert.equal(r.TSrc, 'historica');
  assert.equal(r.PSrc, 'estimada');
  assert.ok(r.notes.some(n => /Open-Meteo para 2025/.test(n)));
  assert.equal(require('../www/js/analysis.js').analyze({
    points: [{ lat: 4.6, lon: -74.1, alt: 1500 }],
    climate: { online: { T: 19, P: 1200, TSrc: 'historica', PSrc: 'estimada', provider: 'Open-Meteo Historical Weather', year: 2025 } }
  }).climate.PSrc, 'estimada');
});

/* ---------- Importación de CSV ---------- */
test('parseCSV: coma, punto y coma con coma decimal, alias y bio1 en décimas', () => {
  let r = Climate.parseCSV('lat,lon,alt,temp,prec,nombre\n4.61,-74.08,2640,14.1,1013,Bogotá\n6.2,-75.5,1500,22,1600,Medellín\n');
  assert.equal(r.records.length, 2); assert.equal(r.records[0].T, 14.1); assert.equal(r.records[1].name, 'Medellín');
  r = Climate.parseCSV('Latitud;Longitud;Temperatura;Precipitación\n4,61;-74,08;14,1;1013\n');
  assert.deepEqual([r.records[0].lat, r.records[0].lon, r.records[0].T, r.records[0].P], [4.61, -74.08, 14.1, 1013]);
  r = Climate.parseCSV('lat,lon,bio1,bio12\n4.6,-74.1,141,1013\n5.0,-74.0,200,900\n');
  assert.equal(r.records[0].T, 14.1); assert.ok(r.notes.some(n => /décimas/.test(n)));
  r = Climate.parseCSV('a,b\n1,2\n'); assert.ok(r.errors.length && !r.records.length);
  r = Climate.parseCSV('lat,lon,temp\n95,10,5\n4,-74,NA\n'); assert.equal(r.records.length, 0);
});

/* ---------- NASA POWER (forma documentada de la respuesta; NO se probó contra el servicio real) ---------- */
test('parsePower: convierte mm/día a mm/año con los días de cada mes', () => {
  const T2M = { JAN: 13, FEB: 13.5, MAR: 14, APR: 14.2, MAY: 14.3, JUN: 14, JUL: 13.5, AUG: 13.6, SEP: 13.8, OCT: 14, NOV: 14, DEC: 13.4, ANN: 13.8 };
  const PR = { JAN: 1, FEB: 1.5, MAR: 2.5, APR: 4, MAY: 3.5, JUN: 2, JUL: 1.5, AUG: 1.8, SEP: 2.5, OCT: 4, NOV: 3.5, DEC: 1.5, ANN: 2.5 };
  const j = { geometry: { coordinates: [-74.08, 4.61, 2540.5] }, properties: { parameter: { T2M, PRECTOTCORR: PR } } };
  const r = Climate.parsePower(j);
  near(r.T, 13.8, 1e-9); near(r.elevCell, 2540.5, 1e-9); assert.equal(r.monthlyT.length, 12);
  assert.equal(r.monthlyP.length, 12);
  near(r.monthlyP[0], 31, 1e-9);
  near(r.P, r.monthlyP.reduce((a, v) => a + v, 0), 1e-9);
  const days = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const exp = Object.values(PR).slice(0, 12).reduce((a, v, i) => a + v * days[i], 0);
  near(r.P, exp, 1e-9);
  assert.throws(() => Climate.parsePower({}), /inesperada/);
  const bad = JSON.parse(JSON.stringify(j)); Object.keys(bad.properties.parameter.T2M).forEach(k => bad.properties.parameter.T2M[k] = -999);
  Object.keys(bad.properties.parameter.PRECTOTCORR).forEach(k => bad.properties.parameter.PRECTOTCORR[k] = -999);
  assert.throws(() => Climate.parsePower(bad), /no devolvió/);
});
test('parseArchive: calcula temperatura media y precipitación anual y mensual del último año completo', () => {
  const year = 2025;
  const dates = [], temps = [], rain = [];
  for (let month = 1; month <= 12; month++) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= days; day++) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      temps.push(month);
      rain.push(2);
    }
  }
  const parsed = Climate.parseArchive({ daily: { time: dates, temperature_2m_mean: temps, precipitation_sum: rain } }, year);
  near(parsed.T, 6.526027397260274, 1e-12);
  assert.equal(parsed.P, 730);
  assert.deepEqual(parsed.monthlyP, Array(12).fill(2).map((v, i) => v * new Date(Date.UTC(year, i + 1, 0)).getUTCDate()));
  assert.equal(parsed.monthlyT[0], 1);
  assert.equal(parsed.monthlyT[11], 12);
  assert.equal(parsed.PSrc, 'estimada');
  assert.equal(parsed.year, year);
  assert.throws(() => Climate.parseArchive({ daily: { time: dates.slice(0, -1), temperature_2m_mean: temps.slice(0, -1), precipitation_sum: rain.slice(0, -1) } }, year), /año histórico completo/);
  const shuffled = dates.slice(); shuffled[1] = shuffled[2];
  assert.throws(() => Climate.parseArchive({ daily: { time: shuffled, temperature_2m_mean: temps, precipitation_sum: rain } }, year), /fechas incompletas o desordenadas/);
});
test('fetchOnline: una parte puede fallar sin tumbar la otra', async () => {
  const T2M = {}; const PR = {};
  ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','ANN'].forEach(m => { T2M[m] = 20; PR[m] = 3; });
  const fake = async (url) => {
    if (url.includes('/v1/elevation') || url.includes('/v1/archive')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, json: async () => ({ geometry: { coordinates: [-75, 6, 1500] }, properties: { parameter: { T2M, PRECTOTCORR: PR } } }) };
  };
  const r = await Climate.fetchOnline(6.2, -75.5, fake, { timeoutMs: 1000 });
  assert.equal(r.elevation, null); assert.equal(r.errors.length, 1); assert.ok(/Altitud/.test(r.errors[0]));
  near(r.climate.T, 20, 1e-9);
  const dead = async () => { throw new Error('sin red'); };
  const r2 = await Climate.fetchOnline(6.2, -75.5, dead, { timeoutMs: 1000 });
  assert.equal(r2.errors.length, 3); assert.equal(r2.climate, null);
});
test('fetchOnline: indica claramente cuando NASA POWER devuelve temperatura pero no precipitación', async () => {
  const T2M = {};
  ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','ANN'].forEach(m => { T2M[m] = 20; });
  const fake = async (url) => {
    if (url.includes('/v1/elevation')) return { ok: true, json: async () => ({ elevation: [1500] }) };
    if (url.includes('/v1/archive')) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ properties: { parameter: { T2M } } }) };
  };
  const r = await Climate.fetchOnline(6.2, -75.5, fake, { timeoutMs: 1000 });
  assert.equal(r.climate.T, 20);
  assert.equal(r.climate.P, null);
  assert.ok(r.errors.some(e => /no devolvió precipitación anual válida/.test(e)));
});
test('fetchOnline: utiliza el primer proveedor que devuelve precipitación completa', async () => {
  const year = 2025, dates = [], temps = [], rain = [];
  for (let month = 1; month <= 12; month++) {
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= days; day++) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      temps.push(15);
      rain.push(1);
    }
  }
  const T2M = {}; const PR = {};
  ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','ANN'].forEach(m => { T2M[m] = 20; PR[m] = 3; });
  const fake = async (url) => {
    if (url.includes('/v1/elevation')) return { ok: true, json: async () => ({ elevation: [1500] }) };
    if (url.includes('/v1/archive')) return { ok: true, json: async () => ({ daily: { time: dates, temperature_2m_mean: temps, precipitation_sum: rain } }) };
    await new Promise(resolve => setTimeout(resolve, 20));
    return { ok: true, json: async () => ({ properties: { parameter: { T2M, PRECTOTCORR: PR } } }) };
  };
  const result = await Climate.fetchOnline(6.2, -75.5, fake, { timeoutMs: 1000, archiveYear: year });
  assert.equal(result.climate.provider, 'Open-Meteo Historical Weather');
  assert.equal(result.climate.P, 365);
  assert.equal(result.climate.PSrc, 'estimada');
  assert.equal(result.climate.year, year);
});

/* ---------- Memoria ---------- */
test('Memory.near: orden por distancia y radio', () => {
  const m = new Climate.Memory();
  m.add([{ lat: 4.6, lon: -74.1, T: 14 }, { lat: 4.7, lon: -74.1, T: 15 }, { lat: 9, lon: -74, T: 28 }, { lat: 'x', lon: 1, T: 1 }]);
  assert.equal(m.count, 3);
  const n = m.near(4.61, -74.1, 30);
  assert.equal(n.length, 2); assert.equal(n[0].rec.T, 14);
  assert.equal(m.near(4.61, -74.1, 0.5).length, 0);
});

/* ---------- Análisis completo ---------- */
function square(lat, lon, side, alt, altSrc) {
  const fr = Geo.localFrame([{ lat, lon }]);
  return [[0, 0], [side, 0], [side, side], [0, side]].map(([x, y], i) => Object.assign(Geo.fromXY(fr, { x, y }), { name: 'P' + (i + 1), alt, altSrc }));
}
test('analyze: finca de 1 ha a 2600 m con datos manuales (sabana de Bogotá)', () => {
  const pts = square(4.7, -74.05, 100, 2600, 'gps');
  const a = A.analyze({ points: pts, climate: { tManual: 14, pManual: 1000 } });
  near(a.areaM2, 10000, 6); near(a.perimeter, 400, 0.5);
  assert.equal(a.result.zone.symbol, 'bh-MB');
  assert.equal(a.alt.src, 'gps'); near(a.alt.value, 2600, 1e-9);
  assert.equal(a.quality, 3);
  assert.equal(a.selfIntersects, false);
});
test('analyze: solo con GPS (sin lluvia) estima la temperatura pero no inventa la precipitación', () => {
  const a = A.analyze({ points: [{ lat: 4.7, lon: -74.05, alt: 2600, altSrc: 'gps' }], climate: {} });
  assert.equal(a.climate.TSrc, 'estimada'); near(a.climate.T, Climate.estimateT(4.7, 2600), 1e-9);
  assert.equal(a.climate.P, null); assert.equal(a.needs, 'precipitacion');
  assert.equal(a.result.ok, false); assert.equal(a.result.partial, true);
  assert.equal(a.result.region, 'Templada cálida');     // ≈14 °C, entre 12 y 17
});
test('analyze: sin altitud no hay temperatura estimada; escribir la altitud o internet lo resuelve', () => {
  let a = A.analyze({ points: [{ lat: 4.7, lon: -74.05 }], climate: {} });
  assert.equal(a.result, null); assert.equal(a.needs, 'altitud');
  a = A.analyze({ points: [{ lat: 4.7, lon: -74.05 }], climate: { altOverride: 2600, pManual: 1000 } });
  assert.equal(a.alt.src, 'manual'); assert.ok(a.result.ok);
  a = A.analyze({ points: [{ lat: 4.7, lon: -74.05 }], climate: { pManual: 1000, online: { elevation: 2550 } } });
  assert.equal(a.alt.src, 'internet'); near(a.alt.value, 2550, 1e-9);
});
test('analyze: la altitud corregida a mano gana a la del GPS', () => {
  const pts = [{ lat: 4.7, lon: -74.05, alt: 2600, altSrc: 'gps' }];
  const a = A.analyze({ points: pts, climate: { altOverride: 1000, pManual: 1500 } });
  assert.equal(a.alt.value, 1000); assert.equal(a.alt.src, 'manual');
  assert.ok(Math.abs(a.climate.T - Climate.estimateT(4.7, 1000)) < 1e-9);
});
test('analyze: zonas vecinas dentro del margen de error y calidad según el origen', () => {
  // T estimada a 1000 m ≈ 22,7 °C: cerca del límite de 24 °C con margen de 2 °C
  const a = A.analyze({ points: [{ lat: 4.7, lon: -74.05, alt: 1000, altSrc: 'gps' }], climate: { pManual: 1600 } });
  assert.equal(a.quality, 1);
  assert.ok(a.alternatives.length >= 1, 'debería haber una zona vecina posible');
  assert.ok(!a.alternatives.some(z => z.symbol === a.result.zone.symbol));
  const b = A.analyze({ points: [{ lat: 4.7, lon: -74.05, alt: 1000, altSrc: 'gps' }], climate: { tManual: 22.7, pManual: 1600 } });
  assert.equal(b.quality, 3); assert.ok(b.alternatives.length <= a.alternatives.length);
});
test('analyze: terreno con desnivel toca varias zonas', () => {
  const sq = square(4.7, -74.05, 800, 0);
  sq[0].alt = 1500; sq[1].alt = 1600; sq[2].alt = 2300; sq[3].alt = 2400;
  sq.forEach(p => p.altSrc = 'gps');
  const a = A.analyze({ points: sq, climate: { pManual: 1500 } });
  assert.ok(a.vertexZones.length === 4);
  assert.ok(a.distinctZones.length >= 2, JSON.stringify(a.distinctZones));
  assert.ok(a.warnings.some(w => /pisos térmicos/.test(w)));
});
test('analyze: polígono con lados cruzados avisa', () => {
  const sq = square(4.7, -74.05, 100, 2600, 'gps');
  const bow = [sq[0], sq[2], sq[1], sq[3]];
  const a = A.analyze({ points: bow, climate: { pManual: 1000 } });
  assert.equal(a.selfIntersects, true); assert.ok(a.warnings.some(w => /se cruzan/.test(w)));
});
test('analyze: sin puntos y puntos inválidos', () => {
  assert.equal(A.analyze({ points: [] }).empty, true);
  assert.equal(A.analyze({ points: [{ lat: 'x', lon: 1 }, { lat: 100, lon: 0 }] }).empty, true);
});

test('fetchOnline: pide la altitud del centro y de cada punto en una sola consulta', async () => {
  const urls = [];
  const T2M = {}, PR = {};
  ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','ANN'].forEach(m => { T2M[m] = 20; PR[m] = 3; });
  const fake = async (url) => {
    urls.push(url);
    if (url.includes('/v1/elevation')) return { ok: true, json: async () => ({ elevation: [1500, 1490, 1510, null] }) };
    if (url.includes('/v1/archive')) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ geometry: { coordinates: [-75, 6, 1400] }, properties: { parameter: { T2M, PRECTOTCORR: PR } } }) };
  };
  const r = await Climate.fetchOnline(6.2, -75.5, fake, { points: [{ lat: 6.19, lon: -75.51 }, { lat: 6.21, lon: -75.49 }, { lat: 6.2, lon: -75.5 }] });
  assert.equal(r.elevation, 1500); assert.deepEqual(r.pointElevations, [1490, 1510, null]);
  const e = urls.find(u => u.includes('/v1/elevation'));
  assert.ok(e.includes('latitude=6.20000,6.19000,6.21000,6.20000'), e);
  assert.ok(e.includes('longitude=-75.50000,-75.51000,-75.49000,-75.50000'), e);
  assert.equal(urls.filter(u => u.includes('/v1/elevation')).length, 1);
  assert.equal(urls.filter(u => u.includes('/v1/archive')).length, 1);
});
