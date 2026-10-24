/* Service worker: guarda la app para que abra sin conexión (solo se usa en la versión web instalable). */
const CACHE = 'zonas-de-vida-v12';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/leaflet/leaflet.js', 'lib/leaflet/leaflet.css', 'lib/leaflet/images/layers.png', 'lib/leaflet/images/layers-2x.png',
  'lib/leaflet/images/marker-icon.png', 'lib/leaflet/images/marker-icon-2x.png', 'lib/leaflet/images/marker-shadow.png',
  'js/geo.js', 'js/gis.js', 'js/holdridge.js', 'js/climate.js', 'js/analysis.js', 'js/fmt.js', 'js/gps.js', 'js/store.js', 'js/diagram.js', 'js/walter-lieth.js', 'js/report.js', 'js/app.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;            // las consultas a internet (clima, altitud) no se guardan
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
