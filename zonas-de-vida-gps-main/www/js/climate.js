/* climate.js — de dónde sale la temperatura y la precipitación de cada punto.
 *
 * Prioridad (de mayor a menor confianza):
 *   1. valor manual del usuario
 *   2. datos descargados con internet (NASA POWER + elevación Open-Meteo), guardados en el punto
 *   3. memoria offline: paquete CSV importado / datos de consultas anteriores (interpolación por distancia)
 *   4. temperatura estimada por altitud (solo temperatura; la precipitación nunca se inventa)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geo.js'));
  else root.Climate = factory(root.Geo);
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  'use strict';

  // Ajuste con temperaturas medias anuales de ciudades colombianas entre 0 y 2800 m
  // (error típico ≈ 1 °C, máximo ≈ 2 °C). Fuera del trópico es solo una aproximación.
  var T0_EQUATOR = 28.2;     // °C a nivel del mar en el ecuador
  var LAPSE = 0.00533;       // °C por metro de ascenso
  var DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  function seaLevelTemp(lat) {
    var a = Math.abs(lat);
    if (a <= 40) return T0_EQUATOR - 0.0090 * a * a;
    return T0_EQUATOR - 0.0090 * 1600 - 0.62 * (a - 40);
  }

  // Temperatura media anual estimada (°C) o null si falta la altitud
  function estimateT(lat, alt) {
    if (!isNum(lat) || !isNum(alt)) return null;
    return seaLevelTemp(lat) - LAPSE * Math.max(alt, -100);
  }

  function estimateUncertainty(lat) { return Math.abs(lat) <= 15 ? 2 : 4; }

  /* ---------- Memoria offline (puntos de clima conocidos) ---------- */
  function Memory() { this.cells = {}; this.count = 0; }
  var CELL = 0.1;            // grados (~11 km)
  Memory.prototype._key = function (i, j) { return i + ',' + j; };
  Memory.prototype.add = function (recs) {
    var self = this;
    (recs || []).forEach(function (r) {
      if (!isNum(r.lat) || !isNum(r.lon)) return;
      if (!isNum(r.T) && !isNum(r.P)) return;
      var k = self._key(Math.floor(r.lat / CELL), Math.floor(r.lon / CELL));
      (self.cells[k] = self.cells[k] || []).push(r);
      self.count++;
    });
  };
  Memory.prototype.clear = function () { this.cells = {}; this.count = 0; };
  Memory.prototype.all = function () {
    var out = [];
    for (var k in this.cells) out = out.concat(this.cells[k]);
    return out;
  };
  // Registros dentro de radiusKm, ordenados por distancia
  Memory.prototype.near = function (lat, lon, radiusKm) {
    var res = [];
    var dLat = radiusKm / 111;
    var dLon = radiusKm / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    var i0 = Math.floor((lat - dLat) / CELL), i1 = Math.floor((lat + dLat) / CELL);
    var j0 = Math.floor((lon - dLon) / CELL), j1 = Math.floor((lon + dLon) / CELL);
    for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) {
      var list = this.cells[this._key(i, j)];
      if (!list) continue;
      for (var n = 0; n < list.length; n++) {
        var d = Geo.haversine(lat, lon, list[n].lat, list[n].lon) / 1000;
        if (d <= radiusKm) res.push({ rec: list[n], km: d });
      }
    }
    res.sort(function (a, b) { return a.km - b.km; });
    return res;
  };

  // Interpolación por inverso de la distancia al cuadrado con los k más cercanos
  function idw(items, getter, k) {
    var s = 0, w = 0, n = 0, used = [];
    for (var i = 0; i < items.length && n < k; i++) {
      var v = getter(items[i]);
      if (!isNum(v)) continue;
      var wt = 1 / Math.pow(Math.max(items[i].km, 0.1), 2);
      s += v * wt; w += wt; n++; used.push(items[i]);
    }
    return n ? { value: s / w, n: n, nearestKm: used[0].km, farthestKm: used[used.length - 1].km } : null;
  }

  /* ---------- Resolución por punto ---------- */
  // p: { lat, lon, alt, tManual, pManual, online:{T,P,monthlyT,monthlyP,elevCell,date,source} }
  // opts: { memory, radiusKm }
  function resolve(p, opts) {
    opts = opts || {};
    var radius = opts.radiusKm || 25;
    var out = { alt: isNum(p.alt) ? p.alt : null, T: null, TSrc: null, P: null, PSrc: null,
      monthlyT: null, monthlyP: null, monthlySource: null, notes: [] };
    var corr = 0;
    if (p.online && isNum(p.online.elevCell) && isNum(p.alt)) corr = -LAPSE * (p.alt - p.online.elevCell);
    if (p.online && Array.isArray(p.online.monthlyT) && p.online.monthlyT.length === 12 && p.online.monthlyT.every(isNum)) {
      out.monthlyT = p.online.monthlyT.map(function (t) { return t + corr; });
    }
    if (p.online && Array.isArray(p.online.monthlyP) && p.online.monthlyP.length === 12 && p.online.monthlyP.every(function (v) { return isNum(v) && v >= 0; })) {
      out.monthlyP = p.online.monthlyP.slice();
    }
    if (p.online && out.monthlyT && out.monthlyP) out.monthlySource = p.online.provider || 'NASA POWER';

    // ---- Temperatura
    if (isNum(p.tManual)) {
      out.T = p.tManual; out.TSrc = 'manual';
    } else if (p.online && isNum(p.online.T)) {
      var corrected = isNum(p.online.elevCell) && isNum(p.alt);
      out.T = p.online.T + corr; out.TSrc = p.online.TSrc || 'online';
      if (out.TSrc === 'historica') {
        out.notes.push('Temperatura media estimada con datos diarios históricos de Open-Meteo para ' + p.online.year + '.');
      } else if (corrected) out.notes.push('Temperatura de internet corregida por la diferencia de altitud con la celda de ~50 km (' + Math.round(p.online.elevCell) + ' m).');
      else out.notes.push('Temperatura de internet SIN corregir por altitud (falta la altitud del punto o de la celda): en montaña puede errar varios grados.');
    }
    var near = null;
    if (opts.memory && opts.memory.count && (out.T === null || !isNum(p.pManual) && !(p.online && isNum(p.online.P)))) {
      near = opts.memory.near(p.lat, p.lon, radius);
    }
    if (out.T === null && near && near.length) {
      var tAdj = idw(near, function (it) {
        if (!isNum(it.rec.T)) return null;
        if (isNum(it.rec.alt) && isNum(p.alt)) return it.rec.T - LAPSE * (p.alt - it.rec.alt);
        return it.rec.T;
      }, 4);
      if (tAdj) {
        out.T = tAdj.value; out.TSrc = 'memoria';
        out.notes.push('Temperatura tomada de ' + tAdj.n + ' dato(s) guardado(s) a ' + tAdj.nearestKm.toFixed(1) + ' km' +
          (isNum(p.alt) ? ' (ajustada por altitud).' : ' (sin ajuste por altitud: falta la altitud del punto).'));
      }
    }
    if (out.T === null) {
      var est = estimateT(p.lat, p.alt);
      if (est !== null) {
        out.T = est; out.TSrc = 'estimada';
        out.notes.push('Temperatura estimada solo con latitud y altitud (±' + estimateUncertainty(p.lat) + ' °C). Si tienes un dato medido, escríbelo.');
      } else {
        out.notes.push('Falta la altitud: sin ella no se puede estimar la temperatura. Escríbela, toma el GPS o completa con internet.');
      }
    }

    // ---- Precipitación
    if (isNum(p.pManual)) {
      out.P = p.pManual; out.PSrc = 'manual';
    } else if (p.online && isNum(p.online.P)) {
      out.P = p.online.P; out.PSrc = p.online.PSrc || 'online';
      if (out.PSrc === 'estimada') {
        out.notes.push('Precipitación anual estimada sumando datos diarios históricos de Open-Meteo para ' + p.online.year + '. Un solo año puede diferir del promedio climático de largo plazo.');
      } else {
        out.notes.push('Precipitación de internet (rejilla de ~50 km): en zonas de montaña o con lluvia muy local puede diferir mucho de la real.');
      }
    } else if (near && near.length) {
      var pm = idw(near, function (it) { return it.rec.P; }, 4);
      if (pm) {
        out.P = pm.value; out.PSrc = 'memoria';
        out.notes.push('Precipitación interpolada de ' + pm.n + ' dato(s) guardado(s) a ' + pm.nearestKm.toFixed(1) + (pm.n > 1 ? '–' + pm.farthestKm.toFixed(1) : '') + ' km.' +
          (pm.nearestKm > 10 ? ' Es lejos: la lluvia cambia mucho con el relieve, verifícala.' : ''));
      }
    }
    if (out.P === null) out.notes.push('Falta la precipitación anual: escríbela o importa un paquete de datos / completa con internet.');
    return out;
  }

  /* ---------- Importación de paquetes CSV ---------- */
  var ALIASES = {
    lat: ['lat', 'latitud', 'latitude', 'y'],
    lon: ['lon', 'lng', 'long', 'longitud', 'longitude', 'x'],
    alt: ['alt', 'altitud', 'altura', 'elev', 'elevacion', 'elevación', 'elevation', 'z', 'msnm'],
    T: ['t', 'temp', 'temperatura', 'tmean', 'tmedia', 't_media', 'temperatura_media', 'bio1', 'tmed'],
    P: ['p', 'prec', 'precip', 'precipitacion', 'precipitación', 'precipitation', 'lluvia', 'ppt', 'bio12', 'pmm'],
    name: ['name', 'nombre', 'estacion', 'estación', 'station', 'id', 'codigo', 'código']
  };

  function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

  function detectDelimiter(line) {
    var c = { ',': 0, ';': 0, '\t': 0 };
    for (var i = 0; i < line.length; i++) if (c.hasOwnProperty(line[i])) c[line[i]]++;
    var best = ',', n = -1;
    Object.keys(c).forEach(function (d) { if (c[d] > n) { n = c[d]; best = d; } });
    return best;
  }

  function parseCSV(text) {
    var out = { records: [], errors: [], notes: [] };
    var lines = stripBom(String(text || '')).split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) { out.errors.push('El archivo está vacío o solo tiene encabezado.'); return out; }
    var delim = detectDelimiter(lines[0]);
    var head = lines[0].split(delim).map(function (h) { return h.trim().toLowerCase().replace(/^"|"$/g, ''); });
    var col = {};
    Object.keys(ALIASES).forEach(function (k) {
      for (var i = 0; i < head.length; i++) if (ALIASES[k].indexOf(head[i]) >= 0) { col[k] = i; break; }
    });
    if (col.lat === undefined || col.lon === undefined) {
      out.errors.push('No encontré las columnas de latitud y longitud (usa lat y lon). Encabezados leídos: ' + head.join(', '));
      return out;
    }
    if (col.T === undefined && col.P === undefined) {
      out.errors.push('No hay columna de temperatura ni de precipitación (usa temp y prec).');
      return out;
    }
    var decimalComma = delim === ';' || delim === '\t';
    function num(s) {
      if (s === undefined) return null;
      s = String(s).trim().replace(/^"|"$/g, '');
      if (s === '' || /^(na|nan|null|-9999|-999)$/i.test(s)) return null;
      var v = parseFloat(decimalComma ? s.replace(',', '.') : s);
      return isFinite(v) ? v : null;
    }
    var tIsBio1 = col.T !== undefined && head[col.T] === 'bio1';
    for (var i = 1; i < lines.length; i++) {
      var cells = lines[i].split(delim);
      var lat = num(cells[col.lat]), lon = num(cells[col.lon]);
      if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        if (out.errors.length < 10) out.errors.push('Línea ' + (i + 1) + ': coordenadas no válidas.');
        continue;
      }
      var rec = { lat: lat, lon: lon, src: 'paquete' };
      if (col.alt !== undefined) rec.alt = num(cells[col.alt]);
      if (col.T !== undefined) rec.T = num(cells[col.T]);
      if (col.P !== undefined) rec.P = num(cells[col.P]);
      if (col.name !== undefined) rec.name = (cells[col.name] || '').trim();
      if (!isNum(rec.T) && !isNum(rec.P)) continue;
      out.records.push(rec);
    }
    if (tIsBio1) {
      var mx = 0;
      out.records.forEach(function (r) { if (isNum(r.T)) mx = Math.max(mx, Math.abs(r.T)); });
      if (mx > 60) {
        out.records.forEach(function (r) { if (isNum(r.T)) r.T = r.T / 10; });
        out.notes.push('La columna bio1 venía en décimas de °C (WorldClim 1.4); la dividí entre 10.');
      }
    }
    var badT = out.records.filter(function (r) { return isNum(r.T) && (r.T < -40 || r.T > 45); }).length;
    var badP = out.records.filter(function (r) { return isNum(r.P) && (r.P < 0 || r.P > 15000); }).length;
    if (badT) out.notes.push(badT + ' fila(s) con temperatura fuera de -40…45 °C: revisa las unidades.');
    if (badP) out.notes.push(badP + ' fila(s) con precipitación fuera de 0…15000 mm: revisa las unidades (mm por año).');
    return out;
  }

  /* ---------- Descarga con internet (NASA POWER + Open-Meteo) ---------- */
  // NASA POWER, climatología mensual: T2M (°C) y PRECTOTCORR (mm/día) por mes y ANN.
  function parsePower(json) {
    var par = json && json.properties && json.properties.parameter;
    if (!par || !par.T2M) throw new Error('Respuesta inesperada de NASA POWER');
    var valid = function (v) { return isNum(v) && v > -900; };
    var monthlyT = MONTHS.map(function (m) { return par.T2M[m]; });
    var tOk = monthlyT.every(valid);
    var out = { T: null, monthlyT: null, P: null, monthlyP: null, elevCell: null,
      provider: 'NASA POWER', TSrc: 'online', PSrc: 'online' };
    if (tOk) {
      out.monthlyT = monthlyT;
      out.T = valid(par.T2M.ANN) ? par.T2M.ANN : monthlyT.reduce(function (a, b) { return a + b; }, 0) / 12;
    } else if (valid(par.T2M.ANN)) {
      out.T = par.T2M.ANN;
    }
    if (par.PRECTOTCORR) {
      var pm = MONTHS.map(function (m) { return par.PRECTOTCORR[m]; });
      var pmOk = pm.every(function (v) { return valid(v) && v >= 0; });
      if (pmOk) {
        out.monthlyP = pm.map(function (v, i) { return v * DAYS[i]; });
        out.P = out.monthlyP.reduce(function (a, v) { return a + v; }, 0);
      } else if (valid(par.PRECTOTCORR.ANN) && par.PRECTOTCORR.ANN >= 0) {
        out.P = par.PRECTOTCORR.ANN * 365.25;
      }
    }
    var c = json.geometry && json.geometry.coordinates;
    if (c && c.length >= 3 && valid(c[2])) out.elevCell = c[2];
    if (out.T === null && out.P === null) throw new Error('NASA POWER no devolvió datos para este punto');
    return out;
  }

  function parseArchive(json, year) {
    year = year || new Date().getFullYear() - 1;
    var daily = json && json.daily;
    if (!daily || !Array.isArray(daily.time) || !Array.isArray(daily.temperature_2m_mean) ||
        !Array.isArray(daily.precipitation_sum)) {
      throw new Error('Open-Meteo no devolvió las series diarias de temperatura y precipitación esperadas.');
    }
    var expectedDays = new Date(Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
    if (daily.time.length !== expectedDays || daily.temperature_2m_mean.length !== expectedDays ||
        daily.precipitation_sum.length !== expectedDays ||
        daily.time[0] !== year + '-01-01' || daily.time[expectedDays - 1] !== year + '-12-31') {
      throw new Error('Open-Meteo no entregó el año histórico completo de ' + year + '.');
    }
    var monthlyTsum = Array(12).fill(0), monthlyTcount = Array(12).fill(0);
    var monthlyP = Array(12).fill(0), tSum = 0;
    for (var i = 0; i < expectedDays; i++) {
      var t = daily.temperature_2m_mean[i], p = daily.precipitation_sum[i];
      var expectedDate = new Date(Date.UTC(year, 0, i + 1)).toISOString().slice(0, 10);
      if (daily.time[i] !== expectedDate) throw new Error('Open-Meteo devolvió fechas incompletas o desordenadas para ' + year + '.');
      if (!isNum(t) || !isNum(p) || p < 0) {
        throw new Error('Open-Meteo devolvió días sin temperatura o precipitación para ' + year + '; no se usó un total anual incompleto.');
      }
      var month = Number(daily.time[i].slice(5, 7)) - 1;
      if (month < 0 || month > 11) throw new Error('Open-Meteo devolvió una fecha diaria inválida.');
      tSum += t;
      monthlyTsum[month] += t;
      monthlyTcount[month]++;
      monthlyP[month] += p;
    }
    return {
      T: tSum / expectedDays,
      P: monthlyP.reduce(function (sum, value) { return sum + value; }, 0),
      monthlyT: monthlyTsum.map(function (sum, i) { return sum / monthlyTcount[i]; }),
      monthlyP: monthlyP,
      elevCell: null,
      provider: 'Open-Meteo Historical Weather',
      year: year,
      TSrc: 'historica',
      PSrc: 'estimada'
    };
  }

  function withTimeout(fetchFn, url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return fetchFn(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  // Devuelve { elevation, pointElevations, climate, errors[] }; cada parte puede fallar sin tumbar la otra.
  // opts.points: [{lat, lon}] para traer también la altitud de cada punto (una sola consulta, hasta 99 puntos).
  function fetchOnline(lat, lon, fetchFn, opts) {
    opts = opts || {};
    var f = fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var ms = opts.timeoutMs || 20000;
    var res = { elevation: null, pointElevations: null, climate: null, errors: [] };
    if (!f) { res.errors.push('Este dispositivo no puede hacer consultas de red.'); return Promise.resolve(res); }
    var pts = (opts.points || []).slice(0, 99);
    var la = [lat].concat(pts.map(function (p) { return p.lat; })).map(function (v) { return v.toFixed(5); }).join(',');
    var lo = [lon].concat(pts.map(function (p) { return p.lon; })).map(function (v) { return v.toFixed(5); }).join(',');
    var pElev = withTimeout(f, 'https://api.open-meteo.com/v1/elevation?latitude=' + la + '&longitude=' + lo, ms)
      .then(function (j) {
        var e = j && j.elevation;
        if (!Array.isArray(e) || !isNum(e[0])) throw new Error('sin dato de elevación');
        res.elevation = e[0];
        res.pointElevations = e.slice(1).map(function (v) { return isNum(v) ? v : null; });
      }).catch(function (e) { res.errors.push('Altitud: ' + (e && e.message || e)); });
    var year = opts.archiveYear || new Date().getFullYear() - 1;
    var archiveUrl = 'https://archive-api.open-meteo.com/v1/archive?latitude=' + lat.toFixed(5) +
      '&longitude=' + lon.toFixed(5) + '&start_date=' + year + '-01-01&end_date=' + year +
      '-12-31&daily=temperature_2m_mean,precipitation_sum&timezone=auto';
    var nasaUrl = 'https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,PRECTOTCORR&community=AG&longitude=' +
      lon.toFixed(5) + '&latitude=' + lat.toFixed(5) + '&format=JSON';
    var pNasa = withTimeout(f, nasaUrl, ms).then(function (j) {
      var climate = parsePower(j);
      return { climate: climate, error: isNum(climate.P) ? null : 'NASA POWER no devolvió precipitación anual válida.' };
    }).catch(function (e) { return { climate: null, error: 'NASA POWER: ' + (e && e.message || e) }; });
    var pArchive = withTimeout(f, archiveUrl, ms).then(function (j) {
      return { climate: parseArchive(j, year), error: null };
    }).catch(function (e) { return { climate: null, error: 'Open-Meteo histórico: ' + (e && e.message || e) }; });

    var pClimate = new Promise(function (resolve) {
      var pending = 2, fallback = null, errors = [];
      function finish(item) {
        if (item.climate && isNum(item.climate.P)) {
          resolve({ climate: item.climate, errors: [] });
          return;
        }
        if (item.climate && isNum(item.climate.T) && !fallback) fallback = item.climate;
        if (item.error) errors.push(item.error);
        pending--;
        if (!pending) {
          if (fallback) {
            if (!isNum(fallback.P)) errors.push('No se obtuvo precipitación anual; el informe quedará parcial.');
            resolve({ climate: fallback, errors: errors });
          } else {
            resolve({ climate: null, errors: errors });
          }
        }
      }
      pNasa.then(finish);
      pArchive.then(finish);
    }).then(function (result) {
      res.climate = result.climate;
      res.errors.push.apply(res.errors, result.errors);
    });
    return Promise.all([pElev, pClimate]).then(function () { return res; });
  }

  return {
    LAPSE: LAPSE, T0_EQUATOR: T0_EQUATOR,
    seaLevelTemp: seaLevelTemp, estimateT: estimateT, estimateUncertainty: estimateUncertainty,
    Memory: Memory, resolve: resolve, parseCSV: parseCSV, parsePower: parsePower, parseArchive: parseArchive,
    fetchOnline: fetchOnline
  };
});
