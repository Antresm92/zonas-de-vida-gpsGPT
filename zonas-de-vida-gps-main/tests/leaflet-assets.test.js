'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const leaflet = path.join(root, 'www', 'lib', 'leaflet');

test('Leaflet runtime and images are local, licensed, loaded by the app and cached offline', () => {
  ['leaflet.js', 'leaflet.css', 'LICENSE', 'images/layers.png', 'images/layers-2x.png',
    'images/marker-icon.png', 'images/marker-icon-2x.png', 'images/marker-shadow.png'].forEach(file => {
    assert.ok(fs.statSync(path.join(leaflet, file)).isFile(), `missing local Leaflet asset ${file}`);
  });
  const html = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');
  assert.match(html, /href="lib\/leaflet\/leaflet\.css"/);
  assert.match(html, /src="lib\/leaflet\/leaflet\.js"/);
  const sw = fs.readFileSync(path.join(root, 'www', 'sw.js'), 'utf8');
  ['lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css', 'lib/leaflet/images/marker-icon.png'].forEach(asset => {
    assert.ok(sw.includes("'" + asset + "'"), `service worker does not cache ${asset}`);
  });
});
