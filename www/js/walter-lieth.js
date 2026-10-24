/* walter-lieth.js — gráfico ombrotérmico mensual con escala P = 2T. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WalterLieth = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function calculate(monthlyT, monthlyP) {
    if (!Array.isArray(monthlyT) || monthlyT.length !== 12 || !monthlyT.every(isNum)) throw new Error('Se requieren 12 medias mensuales de temperatura válidas.');
    if (!Array.isArray(monthlyP) || monthlyP.length !== 12 || !monthlyP.every(function (p) { return isNum(p) && p >= 0; })) throw new Error('Se requieren 12 valores mensuales de precipitación no negativos.');
    var scaleMax = Math.max(5, Math.ceil(Math.max.apply(null, monthlyT.concat(monthlyP.map(function (p) { return p / 2; }))) / 5) * 5);
    var scaleMin = Math.min(0, Math.floor(Math.min.apply(null, monthlyT) / 5) * 5);
    var segments = { dry: [], wet: [] };
    for (var i = 0; i < 11; i++) {
      var a = { month: i, T: monthlyT[i], P: monthlyP[i], diff: monthlyP[i] - 2 * monthlyT[i] };
      var b = { month: i + 1, T: monthlyT[i + 1], P: monthlyP[i + 1], diff: monthlyP[i + 1] - 2 * monthlyT[i + 1] };
      if (a.diff === 0 && b.diff === 0) continue;
      var cuts = [a];
      if (a.diff * b.diff < 0) {
        var f = -a.diff / (b.diff - a.diff);
        cuts.push({ month: a.month + f, T: a.T + (b.T - a.T) * f, P: a.P + (b.P - a.P) * f, diff: 0 });
      }
      cuts.push(b);
      for (var j = 0; j < cuts.length - 1; j++) {
        var left = cuts[j], right = cuts[j + 1], midDiff = (left.diff + right.diff) / 2;
        var target = midDiff < 0 ? segments.dry : segments.wet;
        target.push({ from: left, to: right });
      }
    }
    return { months: MONTHS.slice(), monthlyT: monthlyT.slice(), monthlyP: monthlyP.slice(),
      scaleMin: scaleMin, scaleMax: scaleMax, dry: segments.dry, wet: segments.wet };
  }

  function svg(monthlyT, monthlyP, options) {
    options = options || {};
    var data = calculate(monthlyT, monthlyP);
    var width = options.width || 760, height = options.height || 430;
    var margin = { top: 38, right: 62, bottom: 62, left: 58 };
    var plotW = width - margin.left - margin.right, plotH = height - margin.top - margin.bottom;
    var bottom = margin.top + plotH, top = margin.top, max = data.scaleMax, min = data.scaleMin;
    function x(month) { return margin.left + month * plotW / 11; }
    function y(value) { return bottom - (value - min) / (max - min) * plotH; }
    function path(points) { return points.map(function (p, i) { return (i ? 'L' : 'M') + x(p.month).toFixed(2) + ' ' + y(p.value).toFixed(2); }).join(' '); }
    function area(segment, kind) {
      var temperature = [{ month: segment.from.month, value: segment.from.T }, { month: segment.to.month, value: segment.to.T }];
      var rain = [{ month: segment.from.month, value: segment.from.P / 2 }, { month: segment.to.month, value: segment.to.P / 2 }];
      var upper = kind === 'dry' ? temperature : rain, lower = kind === 'dry' ? rain : temperature;
      return '<path d="' + path(upper) + ' ' + path(lower.slice().reverse()).replace(/^M/, 'L') + ' Z" fill="' +
        (kind === 'dry' ? '#f2a65a' : '#70b7e6') + '" fill-opacity="0.42" stroke="none"/>';
    }
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Diagrama ombrotérmico Walter-Lieth. Escala de 1 grado Celsius por 2 milímetros de lluvia">';
    out += '<rect width="100%" height="100%" fill="#fff"/><text x="' + (width / 2) + '" y="22" text-anchor="middle" font-size="16" font-weight="700" fill="#14301F">' + esc(options.title || 'Diagrama ombrotérmico de Walter-Lieth') + '</text>';
    var tickStep = Math.max(5, Math.ceil((max - min) / 6 / 5) * 5);
    var firstTick = Math.ceil(min / tickStep) * tickStep;
    for (var tick = firstTick; tick <= max; tick += tickStep) {
      var yy = y(tick);
      out += '<line x1="' + margin.left + '" x2="' + (width - margin.right) + '" y1="' + yy + '" y2="' + yy + '" stroke="#d7dfd8" stroke-width="1"/>' +
        '<text x="' + (margin.left - 9) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="#14301F">' + tick + '</text>';
      if (tick >= 0) out += '<text x="' + (width - margin.right + 9) + '" y="' + (yy + 4) + '" text-anchor="start" font-size="11" fill="#14301F">' + (tick * 2) + '</text>';
    }
    data.dry.forEach(function (s) { out += area(s, 'dry'); });
    data.wet.forEach(function (s) { out += area(s, 'wet'); });
    var tempPath = monthlyT.map(function (v, i) { return { month: i, value: v }; });
    var rainPath = monthlyP.map(function (v, i) { return { month: i, value: v / 2 }; });
    out += '<path d="' + path(tempPath) + '" fill="none" stroke="#d8353c" stroke-width="2.7" stroke-linejoin="round"/>' +
      '<path d="' + path(rainPath) + '" fill="none" stroke="#1f65a8" stroke-width="2.7" stroke-linejoin="round"/>';
    monthlyT.forEach(function (v, i) {
      out += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="#d8353c"/>' +
        '<circle cx="' + x(i) + '" cy="' + y(monthlyP[i] / 2) + '" r="3" fill="#1f65a8"/>' +
        '<text x="' + x(i) + '" y="' + (bottom + 21) + '" text-anchor="middle" font-size="11" fill="#14301F">' + MONTHS[i] + '</text>';
    });
    out += '<line x1="' + margin.left + '" x2="' + (width - margin.right) + '" y1="' + bottom + '" y2="' + bottom + '" stroke="#14301F"/>' +
      '<text x="15" y="' + (top + plotH / 2) + '" transform="rotate(-90 15 ' + (top + plotH / 2) + ')" text-anchor="middle" font-size="12" fill="#d8353c">Temperatura (°C)</text>' +
      '<text x="' + (width - 12) + '" y="' + (top + plotH / 2) + '" transform="rotate(90 ' + (width - 12) + ' ' + (top + plotH / 2) + ')" text-anchor="middle" font-size="12" fill="#1f65a8">Precipitación (mm)</text>' +
      '<g font-size="11" fill="#14301F"><line x1="' + (margin.left + 6) + '" x2="' + (margin.left + 26) + '" y1="' + (height - 14) + '" y2="' + (height - 14) + '" stroke="#d8353c" stroke-width="3"/><text x="' + (margin.left + 31) + '" y="' + (height - 10) + '">Temperatura</text>' +
      '<line x1="' + (margin.left + 135) + '" x2="' + (margin.left + 155) + '" y1="' + (height - 14) + '" y2="' + (height - 14) + '" stroke="#1f65a8" stroke-width="3"/><text x="' + (margin.left + 160) + '" y="' + (height - 10) + '">Precipitación</text>' +
      '<rect x="' + (margin.left + 270) + '" y="' + (height - 22) + '" width="14" height="12" fill="#f2a65a" fill-opacity=".6"/><text x="' + (margin.left + 289) + '" y="' + (height - 10) + '">Déficit (P &lt; 2T)</text>' +
      '<rect x="' + (margin.left + 415) + '" y="' + (height - 22) + '" width="14" height="12" fill="#70b7e6" fill-opacity=".6"/><text x="' + (margin.left + 434) + '" y="' + (height - 10) + '">Superávit (P &gt; 2T)</text></g></svg>';
    return out;
  }

  return { MONTHS: MONTHS, calculate: calculate, svg: svg };
});
