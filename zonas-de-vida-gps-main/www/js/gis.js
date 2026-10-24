/* gis.js — interoperabilidad GIS sin dependencias. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./geo.js'));
  else root.Gis = factory(root.Geo);
})(typeof self !== 'undefined' ? self : this, function (Geo) {
  'use strict';

  function escXml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function escCsv(value) {
    var s = String(value === null || value === undefined ? '' : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function num(value) { return typeof value === 'number' && isFinite(value); }
  function validPoint(p) {
    return p && num(p.lat) && num(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  }
  function pointsOnly(points) {
    if (!Array.isArray(points)) throw new Error('Se esperaba una lista de puntos.');
    if (points.some(function (p) { return !validPoint(p); })) throw new Error('Hay coordenadas no válidas.');
    return points;
  }
  function coords(p) { return p.lon + ',' + p.lat + (num(p.alt) ? ',' + p.alt : ''); }
  function geoCoords(p) { return [p.lon, p.lat].concat(num(p.alt) ? [p.alt] : []); }

  function exportKML(points, name) {
    points = pointsOnly(points);
    var placemarks = points.map(function (p, i) {
      return '<Placemark><name>' + escXml(p.name || ('P' + (i + 1))) + '</name><ExtendedData><Data name="style"><value>' + escXml(p.style || '') + '</value></Data></ExtendedData>' +
        '<description>' + escXml('Altitud: ' + (num(p.alt) ? p.alt + ' m' : 'sin dato')) + '</description>' +
        '<Point><coordinates>' + coords(p) + '</coordinates></Point></Placemark>';
    }).join('');
    var polygon = points.length >= 3 ?
      '<Placemark><name>' + escXml(name || 'Límite') + '</name><styleUrl>#limite</styleUrl><Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' +
      points.concat([points[0]]).map(coords).join(' ') +
      '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>' : '';
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>' + escXml(name || 'Levantamiento') +
      '</name><Style id="limite"><LineStyle><color>ff4e8f2f</color><width>2</width></LineStyle><PolyStyle><color>664e8f2f</color><fill>1</fill><outline>1</outline></PolyStyle></Style>' +
      polygon + placemarks + '</Document></kml>';
  }

  function exportGeoJSON(points, name) {
    points = pointsOnly(points);
    var features = [];
    if (points.length >= 3) {
      features.push({ type: 'Feature', properties: { name: name || 'Límite' },
        geometry: { type: 'Polygon', coordinates: [points.concat([points[0]]).map(geoCoords)] } });
    }
    points.forEach(function (p, i) {
      var props = { name: p.name || ('P' + (i + 1)), altitude: num(p.alt) ? p.alt : null };
      if (p.style) props.style = p.style;
      features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: geoCoords(p) } });
    });
    return JSON.stringify({ type: 'FeatureCollection', name: name || 'Levantamiento', features: features }, null, 2);
  }

  function exportGPX(points, name) {
    points = pointsOnly(points);
    var wpts = points.map(function (p, i) {
      return '<wpt lat="' + p.lat + '" lon="' + p.lon + '">' + (num(p.alt) ? '<ele>' + p.alt + '</ele>' : '') +
        '<name>' + escXml(p.name || ('P' + (i + 1))) + '</name></wpt>';
    }).join('');
    var track = points.length ? '<trk><name>' + escXml(name || 'Levantamiento') + '</name><trkseg>' +
      points.map(function (p) { return '<trkpt lat="' + p.lat + '" lon="' + p.lon + '">' + (num(p.alt) ? '<ele>' + p.alt + '</ele>' : '') + '</trkpt>'; }).join('') +
      (points.length >= 3 ? '<trkpt lat="' + points[0].lat + '" lon="' + points[0].lon + '">' + (num(points[0].alt) ? '<ele>' + points[0].alt + '</ele>' : '') + '</trkpt>' : '') +
      '</trkseg></trk>' : '';
    return '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Zonas de Vida" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>' +
      escXml(name || 'Levantamiento') + '</name></metadata>' + wpts + track + '</gpx>';
  }

  function exportCSV(points) {
    points = pointsOnly(points);
    var lines = [['Punto', 'Latitud', 'Longitud', 'Altitud (m)', 'Rumbo (°)', 'Distancia al vértice siguiente (m)']];
    points.forEach(function (p, i) {
      var next = i + 1 < points.length ? points[i + 1] : (points.length >= 3 ? points[0] : null);
      lines.push([
        p.name || ('P' + (i + 1)), p.lat, p.lon, num(p.alt) ? p.alt : '',
        next ? Math.round(Geo.bearing(p.lat, p.lon, next.lat, next.lon)) : '',
        next ? Math.round(Geo.distance(p.lat, p.lon, next.lat, next.lon) * 100) / 100 : ''
      ]);
    });
    return '\uFEFF' + lines.map(function (row) { return row.map(escCsv).join(','); }).join('\r\n');
  }

  function parseGeoJSON(text) {
    var data;
    try { data = typeof text === 'string' ? JSON.parse(text) : text; }
    catch (e) { throw new Error('El archivo GeoJSON no contiene JSON válido.'); }
    if (!data || !['FeatureCollection', 'Feature'].includes(data.type)) throw new Error('GeoJSON debe ser FeatureCollection o Feature.');
    var features = data.type === 'Feature' ? [data] : data.features;
    if (!Array.isArray(features)) throw new Error('FeatureCollection debe contener una lista features.');
    var polygons = [];
    features.forEach(function (f) {
      if (!f || !f.geometry) throw new Error('GeoJSON contiene una entidad sin geometría.');
      var g = f.geometry;
      if (g.type === 'Polygon') polygons.push({ rings: g.coordinates, properties: f.properties || {} });
      if (g.type === 'MultiPolygon') (g.coordinates || []).forEach(function (rings) { polygons.push({ rings: rings, properties: f.properties || {} }); });
    });
    if (!polygons.length) throw new Error('No se encontró ninguna geometría Polygon en el GeoJSON.');
    if (polygons.length !== 1) throw new Error('Importa un polígono por archivo; las geometrías múltiples deben separarse antes de importarlas.');
    var result = [];
    polygons.forEach(function (poly, pi) {
      var ring = poly.rings && poly.rings[0];
      if (!Array.isArray(ring) || ring.length < 4) throw new Error('El polígono debe tener al menos tres vértices y estar cerrado.');
      var seen = {};
      var vertexMeta = {};
      features.forEach(function (f) {
        if (f.geometry && f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
          var pc = f.geometry.coordinates, pp = f.properties || {};
          vertexMeta[pc[0] + ',' + pc[1]] = { name: pp.name, altitude: num(pp.altitude) ? pp.altitude : num(pc[2]) ? pc[2] : null, style: pp.style };
        }
      });
      ring.forEach(function (c, i) {
        if (!Array.isArray(c) || c.length < 2 || !num(c[0]) || !num(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90 || (c.length > 2 && c[2] !== null && !num(c[2]))) {
          throw new Error('El polígono GeoJSON contiene coordenadas no válidas.');
        }
        var key = c[0] + ',' + c[1];
        var closing = i === ring.length - 1 && key === ring[0][0] + ',' + ring[0][1];
        if (!closing && seen[key]) throw new Error('El anillo del GeoJSON repite un vértice antes del cierre.');
        if (!closing) {
          seen[key] = true;
          var meta = vertexMeta[key] || {};
          result.push({ lat: c[1], lon: c[0], alt: num(c[2]) ? c[2] : meta.altitude,
            name: meta.name || 'Importado ' + (pi + 1) + '-' + (result.length + 1), style: meta.style });
        }
      });
      var first = ring[0], last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) throw new Error('El anillo GeoJSON no está cerrado.');
    });
    if (result.length < 3) throw new Error('El polígono debe contener al menos tres vértices.');
    return { name: data.name || polygons[0].properties.name || null, points: result };
  }

  function decodeXml(s) {
    return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function parseKML(text) {
    var xml = String(text || '');
    if (!/<kml(?:\s|>)/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('El archivo KML no es válido o contiene declaraciones no permitidas.');
    var polygons = [], vertexMeta = {}, placemarkRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi, pm;
    while ((pm = placemarkRe.exec(xml))) {
      var block = pm[1], nameMatch = /<name\b[^>]*>([\s\S]*?)<\/name>/i.exec(block);
      var coordRe = /<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>/gi, cm;
      while ((cm = coordRe.exec(block))) {
        var raw = cm[1].trim().split(/\s+/).filter(Boolean);
        var coordinates = raw.map(function (item) {
          var parts = item.split(',');
          if (parts.length < 2 || parts.length > 3 || parts.some(function (v) { return v.trim() === '' || !isFinite(Number(v)); })) throw new Error('El KML contiene coordenadas no válidas.');
          var values = parts.map(Number);
          if (Math.abs(values[0]) > 180 || Math.abs(values[1]) > 90) throw new Error('El KML contiene coordenadas no válidas.');
          return values;
        });
        if (/<Polygon\b/i.test(block) && coordinates.length >= 4) polygons.push({ name: nameMatch && decodeXml(nameMatch[1].replace(/<[^>]*>/g, '').trim()), coordinates: coordinates });
        else if (/<Point\b/i.test(block) && coordinates.length === 1) {
          var styleMatch = /<Data\b[^>]*name=["']style["'][^>]*>\s*<value\b[^>]*>([\s\S]*?)<\/value>/i.exec(block);
          vertexMeta[coordinates[0][0] + ',' + coordinates[0][1]] = {
            name: nameMatch && decodeXml(nameMatch[1].replace(/<[^>]*>/g, '').trim()),
            style: styleMatch ? decodeXml(styleMatch[1].trim()) : null
          };
        }
      }
    }
    if (!polygons.length) throw new Error('No se encontró ningún polígono KML con coordenadas.');
    if (polygons.length !== 1) throw new Error('Importa un polígono por archivo; las geometrías múltiples deben separarse antes de importarlas.');
    var poly = polygons[0], ring = poly.coordinates, first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) throw new Error('El anillo KML no está cerrado.');
    ring.pop();
    if (ring.length < 3) throw new Error('El polígono debe tener al menos tres vértices.');
    return { name: poly.name || null, points: ring.map(function (c, i) {
      var meta = vertexMeta[c[0] + ',' + c[1]] || {};
      return { lat: c[1], lon: c[0], alt: num(c[2]) ? c[2] : null, name: meta.name || 'Importado ' + (i + 1), style: meta.style };
    }) };
  }

  return { exportKML: exportKML, exportGeoJSON: exportGeoJSON, exportGPX: exportGPX, exportCSV: exportCSV,
    parseGeoJSON: parseGeoJSON, parseKML: parseKML };
});
