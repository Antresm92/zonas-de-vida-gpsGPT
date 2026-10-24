/* report.js — informe de zona de vida: texto plano y página HTML autocontenida (con el diagrama). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fmt.js'), require('./geo.js'), require('./diagram.js'), require('./walter-lieth.js'));
  else root.Report = factory(root.Fmt, root.Geo, root.Diagram, root.WalterLieth);
})(typeof self !== 'undefined' ? self : this, function (Fmt, Geo, Diagram, WalterLieth) {
  'use strict';

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  var SRC_T = { manual: 'ingresada por el usuario', online: 'de internet (NASA POWER, ajustada por altitud)', memoria: 'de datos guardados en el equipo', estimada: 'estimada con latitud y altitud', historica: 'media diaria histórica de Open-Meteo' };
  var SRC_P = { manual: 'ingresada por el usuario', online: 'de internet (NASA POWER, rejilla de ~50 km)', memoria: 'de datos guardados en el equipo', estimada: 'estimada con precipitación histórica de Open-Meteo' };
  var QUALITY = {
    0: 'Incompleto: falta la precipitación.',
    1: 'Orientativa: la temperatura se estimó con latitud y altitud.',
    2: 'Aproximada: usa datos de internet o guardados, no medidos en el sitio.',
    3: 'Con datos ingresados por el usuario (su calidad depende de la fuente que usó).'
  };
  var DISCLAIMER = 'Clasificación bioclimática orientativa según el sistema de Holdridge. No reemplaza un estudio de campo ni datos de una estación meteorológica cercana.';

  // Filas de datos clave: [etiqueta, valor]
  function rows(project, a) {
    var out = [];
    var r = a.result, c = a.climate || {};
    if (a.alt && isNum(a.alt.value)) out.push(['Altitud', Fmt.num(a.alt.value, 0) + ' m (' + a.alt.srcLabel + (a.alt.n > 1 ? ', ' + a.alt.n + ' puntos' : '') + ')']);
    if (isNum(c.T)) out.push(['Temperatura media anual', Fmt.num(c.T, 1) + ' °C (' + (SRC_T[c.TSrc] || c.TSrc) + ')']);
    if (r && isNum(r.bt)) out.push(['Biotemperatura', Fmt.num(r.bt, 1) + ' °C']);
    if (isNum(c.P)) out.push(['Precipitación anual', Fmt.num(c.P, 0) + ' mm (' + (SRC_P[c.PSrc] || c.PSrc) + ')']);
    if (r && isNum(r.pet)) out.push(['Evapotranspiración potencial', Fmt.num(r.pet, 0) + ' mm/año']);
    if (r && isNum(r.per)) out.push(['Relación ETP / precipitación', Fmt.num(r.per, 2)]);
    return out;
  }

  function missingData(a) {
    var missing = [];
    var c = a && a.climate || {};
    if (!isNum(c.T)) missing.push('temperatura media anual');
    if (!isNum(c.P)) missing.push('precipitación anual');
    return missing;
  }

  function incompleteNotice(a) {
    var missing = missingData(a);
    if (!missing.length) return '';
    var list = missing.length > 1 ? missing.slice(0, -1).join(', ') + ' y ' + missing[missing.length - 1] : missing[0];
    return 'Informe parcial con los datos disponibles. Falta ' + list +
      '; por eso no se puede determinar la zona de vida ni generar el diagrama de Holdridge.';
  }

  function qualityText(a) {
    if (a && a.quality === 0) {
      var missing = missingData(a);
      if (missing.length) return 'Incompleto: falta ' + missing.join(' y ') + '.';
    }
    if (a && a.quality === 1) {
      var reasons = [];
      if (a.climate && a.climate.TSrc === 'estimada') reasons.push('la temperatura se estimó con latitud y altitud');
      if (a.climate && a.climate.TSrc === 'historica') reasons.push('la temperatura procede de un año de datos históricos');
      if (a.climate && a.climate.PSrc === 'estimada') reasons.push('la precipitación procede de un solo año histórico y no de una normal climática');
      if (reasons.length) return 'Orientativa: ' + reasons.join('; ') + '.';
    }
    return a && a.quality !== undefined ? QUALITY[a.quality] :
      'No evaluable: falta la temperatura media anual para completar el análisis.';
  }

  function text(project, a, o) {
    o = o || {};
    var L = [];
    L.push('INFORME DE ZONA DE VIDA (HOLDRIDGE)');
    L.push(project.name + ' · ' + Fmt.date(o.date || Date.now()));
    L.push('');
    var r = a.result;
    if (r && r.ok) {
      L.push('Zona de vida: ' + r.zone.name + ' (' + r.zone.symbol + ')');
      L.push('Región latitudinal: ' + r.region);
      L.push('Piso altitudinal: ' + r.belt);
      if (r.humidity) L.push('Provincia de humedad: ' + r.humidity.name);
    } else if (r && r.partial) {
      L.push(incompleteNotice(a));
      L.push('Región latitudinal: ' + r.region + ' · Piso altitudinal: ' + r.belt);
    } else {
      L.push(incompleteNotice(a) || 'Resultado incompleto: no se pudo calcular la clasificación.');
    }
    L.push('');
    rows(project, a).forEach(function (x) { L.push(x[0] + ': ' + x[1]); });
    if (a.area) { L.push('Área: ' + Fmt.area(a.area, 'ha') + ' = ' + Fmt.area(a.area, 'm2') + ' = ' + Fmt.area(a.area, 'fanegadas')); }
    if (a.n >= 2) L.push('Perímetro: ' + Fmt.dist(a.perimeter));
    if (a.center) L.push('Centro: ' + Fmt.latlon(a.center.lat, a.center.lon));
    if (a.alternatives && a.alternatives.length) {
      L.push('');
      L.push('Con el margen de error de los datos también podría ser: ' + a.alternatives.map(function (z) { return z.name + ' (' + z.symbol + ')'; }).join('; '));
    }
    if (a.vertexZones && a.vertexZones.length && a.distinctZones && a.distinctZones.length > 1) {
      L.push('');
      L.push('Por altitud de cada punto:');
      a.vertexZones.forEach(function (v) { L.push('  ' + v.name + ' (' + Fmt.num(v.alt, 0) + ' m): ' + v.zone + ' (' + v.symbol + ')'); });
    }
    L.push('');
    L.push('Puntos:');
    project.points.forEach(function (p, i) {
      L.push('  ' + (p.name || 'P' + (i + 1)) + ': ' + Fmt.latlon(p.lat, p.lon) + (isNum(p.alt) ? ', ' + Fmt.num(p.alt, 0) + ' m' : ''));
    });
    if (a.quality !== undefined || !r || !r.ok) { L.push(''); L.push('Calidad de los datos: ' + qualityText(a)); }
    ((a.climate && a.climate.notes) || []).forEach(function (n) { L.push('Aviso: ' + n); });
    (a.warnings || []).forEach(function (w) { L.push('Aviso: ' + w); });
    L.push('');
    L.push(DISCLAIMER);
    return L.join('\n');
  }

  var CSS = 'body{font:16px/1.5 system-ui,-apple-system,Roboto,Segoe UI,sans-serif;color:#14301F;background:#fff;margin:0;padding:24px;max-width:1180px;margin-inline:auto}' +
    'h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;border-bottom:2px solid #2F8F4E;padding-bottom:4px}.sub{color:#5B6F61;margin:0 0 16px}' +
    '.zone{display:flex;gap:16px;align-items:center;margin:12px 0}.hex{width:92px;height:104px;flex:none}.zn{font-size:24px;font-weight:700;line-height:1.2}.zs{color:#5B6F61}' +
    'table{border-collapse:collapse;width:100%;max-width:760px}td,th{padding:6px 10px;border-bottom:1px solid #D6DED8;text-align:left;vertical-align:top}th{color:#5B6F61;font-weight:500;width:42%}' +
    '.note{background:#F2F5EF;border-left:4px solid #D8353C;padding:8px 12px;margin:8px 0}.small{color:#5B6F61;font-size:14px}svg{max-width:100%;height:auto}' +
    '@media print{body{padding:0}h2{break-after:avoid}.diag{break-before:page}}';

  function hexBadge(sym) {
    return '<svg class="hex" viewBox="0 0 92 104" role="img" aria-label="' + esc(sym) + '"><polygon points="46,2 90,27 90,77 46,102 2,77 2,27" fill="rgba(47,143,78,.18)" stroke="#2F8F4E" stroke-width="4"/>' +
      '<text x="46" y="60" text-anchor="middle" font-size="26" font-weight="700" fill="#14301F" font-family="system-ui,sans-serif">' + esc(sym) + '</text></svg>';
  }

  function html(project, a, o) {
    o = o || {};
    var r = a.result;
    var h = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe de zona de vida · ' + esc(project.name) + '</title><style>' + CSS + '</style></head><body>';
    h += '<h1>Informe de zona de vida</h1><p class="sub">' + esc(project.name) + ' · ' + esc(Fmt.date(o.date || Date.now())) + '</p>';
    if (r && r.ok) {
      h += '<div class="zone">' + hexBadge(r.zone.symbol) + '<div><div class="zn">' + esc(r.zone.name) + '</div><div class="zs">Región latitudinal: ' + esc(r.region) + ' · Piso altitudinal: ' + esc(r.belt) + (r.humidity ? ' · Provincia de humedad: ' + esc(r.humidity.name) : '') + '</div></div></div>';
    } else {
      h += '<div class="note">' + esc(incompleteNotice(a) || 'Informe parcial: no se pudo calcular la clasificación con los datos disponibles.') + '</div>';
    }
    h += '<h2>Datos del clima</h2><table>';
    rows(project, a).forEach(function (x) { h += '<tr><th>' + esc(x[0]) + '</th><td>' + esc(x[1]) + '</td></tr>'; });
    h += '</table>';
    if (a.alternatives && a.alternatives.length) {
      h += '<p class="small">Con el margen de error de los datos (±' + Fmt.num(a.margins.t, 1) + ' °C y ±' + Fmt.num(a.margins.p * 100, 0) + ' % en precipitación, supuestos) el punto también podría caer en: ' +
        a.alternatives.map(function (z) { return esc(z.name) + ' (' + esc(z.symbol) + ')'; }).join('; ') + '.</p>';
    }
    if (a.n) {
      h += '<h2>Terreno</h2><table>';
      if (a.area) h += '<tr><th>Área</th><td>' + esc(Fmt.area(a.area, 'ha')) + ' · ' + esc(Fmt.area(a.area, 'm2')) + ' · ' + esc(Fmt.area(a.area, 'fanegadas')) + '</td></tr>';
      if (a.n >= 2) h += '<tr><th>Perímetro</th><td>' + esc(Fmt.dist(a.perimeter)) + '</td></tr>';
      h += '<tr><th>Centro</th><td>' + esc(Fmt.latlon(a.center.lat, a.center.lon)) + '</td></tr></table>';
      h += '<h2>Puntos</h2><table>';
      project.points.forEach(function (p, i) {
        h += '<tr><th>' + esc(p.name || 'P' + (i + 1)) + '</th><td>' + esc(Fmt.latlon(p.lat, p.lon)) + (isNum(p.alt) ? ' · ' + esc(Fmt.num(p.alt, 0)) + ' m' : '') + '</td></tr>';
      });
      h += '</table>';
      if (a.n >= 2) h += '<div style="max-width:560px;margin-top:12px">' + Diagram.polygonSVG(project.points, { width: 560, height: 380, center: a.center, bad: a.selfIntersects }) + '</div>';
    }
    if (a.vertexZones && a.vertexZones.length && a.distinctZones && a.distinctZones.length > 1) {
      h += '<h2>Zonas según la altitud de cada punto</h2><table>';
      a.vertexZones.forEach(function (v) { h += '<tr><th>' + esc(v.name) + ' (' + esc(Fmt.num(v.alt, 0)) + ' m)</th><td>' + esc(v.zone) + ' (' + esc(v.symbol) + ')</td></tr>'; });
      h += '</table><p class="small">Se usa la misma precipitación para todos los puntos; la temperatura se ajusta con la altitud.</p>';
    }
    if (a.climate && a.climate.monthlyT && a.climate.monthlyP) {
      h += '<h2>Diagrama ombrotérmico de Walter-Lieth</h2>' +
        WalterLieth.svg(a.climate.monthlyT, a.climate.monthlyP, { width: 900, height: 500 }) +
        '<p class="small">Datos mensuales de ' + esc(a.climate.monthlySource || 'la fuente climática guardada') +
        (a.climate.year ? ' (' + esc(a.climate.year) + ')' : '') +
        '. Escala común: 1 °C = 2 mm; naranja: déficit hídrico (P &lt; 2T); azul: superávit (P &gt; 2T).</p>';
    }
    if (a.quality !== undefined || (a.warnings && a.warnings.length) ||
        (a.climate && a.climate.notes && a.climate.notes.length) || !r || !r.ok) {
      h += '<h2>Calidad de los datos</h2>';
      h += '<p>' + esc(qualityText(a)) + '</p>';
      (a.warnings || []).forEach(function (w) { h += '<div class="note">' + esc(w) + '</div>'; });
      ((a.climate && a.climate.notes) || []).forEach(function (n) { h += '<p class="small">' + esc(n) + '</p>'; });
    }
    if (r && r.ok) {
      h += '<h2 class="diag">Diagrama de Holdridge</h2>' + Diagram.staticSVG({ hex: r.hex, point: r.point, vertices: (a.vertexZones || []).map(function (v) { return { point: v.point, name: v.name }; }), width: 1100 });
      h += '<p class="small">El anillo rojo marca la posición del punto de análisis; el hexágono resaltado es su zona de vida.</p>';
    }
    h += '<p class="small" style="margin-top:28px">' + esc(DISCLAIMER) + '</p></body></html>';
    return h;
  }

  return { text: text, html: html, rows: rows, missingData: missingData, incompleteNotice: incompleteNotice,
    QUALITY: QUALITY, DISCLAIMER: DISCLAIMER, SRC_T: SRC_T, SRC_P: SRC_P };
});
