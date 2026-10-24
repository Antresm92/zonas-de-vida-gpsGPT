'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Gis = require('../www/js/gis.js');
const Store = require('../www/js/store.js');
const Diagram = require('../www/js/diagram.js');

const points = [
  { name: 'A & "uno"', lat: 4.6, lon: -74.1, alt: 2600, style: '#ff0000' },
  { name: 'B', lat: 4.6, lon: -74.09, alt: 2610 },
  { name: 'C', lat: 4.61, lon: -74.09 }
];

test('KML exports escaped names, altitude and closed styled polygon; imports it back', () => {
  const kml = Gis.exportKML(points, 'Finca & lote');
  assert.match(kml, /<PolyStyle><color>664e8f2f<\/color>/);
  assert.match(kml, /Finca &amp; lote/);
  assert.match(kml, /A &amp; &quot;uno&quot;/);
  assert.match(kml, /-74\.1,4\.6,2600 -74\.09,4\.6,2610 -74\.09,4\.61 -74\.1,4\.6,2600/);
  const parsed = Gis.parseKML(kml);
  assert.equal(parsed.points.length, 3);
  assert.equal(parsed.points[0].alt, 2600);
  assert.equal(parsed.points[0].lat, 4.6);
  assert.equal(parsed.points[0].name, 'A & "uno"');
  assert.equal(parsed.points[0].style, '#ff0000');
});

test('GeoJSON FeatureCollection exports polygon and vertex metadata in WGS84 and imports it', () => {
  const data = JSON.parse(Gis.exportGeoJSON(points, 'finca'));
  assert.equal(data.type, 'FeatureCollection');
  assert.equal(data.features[0].geometry.type, 'Polygon');
  assert.deepEqual(data.features[0].geometry.coordinates[0][0], [-74.1, 4.6, 2600]);
  assert.equal(data.features[1].properties.altitude, 2600);
  assert.equal(data.features[1].properties.style, '#ff0000');
  const parsed = Gis.parseGeoJSON(data);
  assert.deepEqual(parsed.points.map(p => [p.lat, p.lon, p.alt, p.name]), [
    [4.6, -74.1, 2600, 'A & "uno"'], [4.6, -74.09, 2610, 'B'], [4.61, -74.09, null, 'C']
  ]);
});

test('GPX exports named waypoints and track with elevations', () => {
  const gpx = Gis.exportGPX(points, 'Finca');
  assert.match(gpx, /<wpt lat="4\.6" lon="-74\.1"><ele>2600<\/ele><name>A &amp; &quot;uno&quot;<\/name><\/wpt>/);
  assert.match(gpx, /<trk><name>Finca<\/name><trkseg>/);
  assert.match(gpx, /<trkpt lat="4\.6" lon="-74\.1"><ele>2600<\/ele><\/trkpt>/);
  assert.match(gpx, /<trkpt lat="4\.6" lon="-74\.1"><ele>2600<\/ele><\/trkpt><\/trkseg>/);
});

test('CSV includes bearings and next-side distances and safely quotes names', () => {
  const csv = Gis.exportCSV(points).replace(/^\uFEFF/, '');
  const rows = csv.split(/\r?\n/);
  assert.match(rows[0], /Punto,Latitud,Longitud,Altitud/);
  assert.match(rows[1], /^"A & ""uno""",4\.6,-74\.1,2600,\d+,\d+(\.\d+)?$/);
  assert.match(rows[3], /^C,4\.61,-74\.09,,\d+,\d+(\.\d+)?$/);
});

test('importers reject invalid, open and unsafe geometries without producing partial points', () => {
  assert.throws(() => Gis.parseGeoJSON('{bad json'), /JSON válido/);
  assert.throws(() => Gis.parseGeoJSON({ type: 'FeatureCollection', features: [] }), /Polygon/);
  assert.throws(() => Gis.parseGeoJSON({ type: 'Feature', properties: {}, geometry: {
    type: 'Polygon', coordinates: [[[-74, 4], [-73, 4], [-73, 5], [-72, 5]]]
  } }), /cerrado/);
  assert.throws(() => Gis.parseKML('<!DOCTYPE kml [<!ENTITY x "evil">]><kml/>'), /no es válido/);
  assert.throws(() => Gis.parseKML('<kml><Placemark><Polygon><coordinates>1,,3 2,4 3,5 1,,3</coordinates></Polygon></Placemark></kml>'), /coordenadas no válidas/);
});

test('croquis applies safe per-point colors', () => {
  const svg = Diagram.polygonSVG(points);
  assert.match(svg, /fill="#ff0000"/);
  const unsafe = Diagram.polygonSVG([{ lat: 4.6, lon: -74.1, name: 'X', style: 'red" onload="alert(1)' }]);
  assert.doesNotMatch(unsafe, /onload/);
});

test('backup round-trips projects and climate memory; invalid backups do not overwrite stored data', () => {
  const values = new Map();
  Store.setBackend({
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  });
  const state = Store.defaultState();
  const photo = 'data:image/jpeg;base64,/9j/2Q==';
  state.projects[0].points.push({ id: 'p1', lat: 4.6, lon: -74, name: 'P1', style: '#D8353C', photo });
  const climateMemory = [{ lat: 4.6, lon: -74, T: 14, P: 1000 }];
  const backup = Store.createBackup(state, climateMemory);
  const inspected = Store.inspectBackup(backup);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.data.state.projects[0].points[0].style, '#D8353C');
  assert.equal(inspected.data.state.projects[0].points[0].photo, photo);
  assert.equal(Store.restoreBackup(backup).ok, true);
  assert.deepEqual(Store.loadMemory(), climateMemory);
  assert.deepEqual(Store.loadState().projects[0].points[0], state.projects[0].points[0]);
  const before = values.get('zvg.v1.state');
  const invalid = JSON.parse(backup);
  invalid.state.projects[0].points[0].lat = 95;
  assert.equal(Store.restoreBackup(invalid).ok, false);
  assert.equal(values.get('zvg.v1.state'), before);
  const invalidPhoto = JSON.parse(backup);
  invalidPhoto.state.projects[0].points[0].photo = 'data:text/html;base64,PHNjcmlwdD4=';
  assert.equal(Store.restoreBackup(invalidPhoto).ok, false);
  assert.equal(values.get('zvg.v1.state'), before);
  const oversizedPhoto = JSON.parse(backup);
  oversizedPhoto.state.projects[0].points[0].photo = 'data:image/jpeg;base64,' + 'A'.repeat(350000);
  assert.equal(Store.restoreBackup(oversizedPhoto).ok, false);
  assert.equal(values.get('zvg.v1.state'), before);
});
