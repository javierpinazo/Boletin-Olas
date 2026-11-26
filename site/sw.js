// Service worker: la app abre al instante y también sin conexión (p. ej. con poca señal en la playa).
// - Archivos de la app (HTML, CSS, JS, íconos): se sirven de la caché y se renuevan en segundo plano.
//   Tras un despliegue, la versión nueva se ve a la siguiente apertura.
// - Datos del servidor (/data/*.json, config.json, playas.json): primero la red; sin conexión, la última copia guardada.
//   El aviso del DHN (alertas de tsunami) nunca se sirve viejo si hay red.
// - /api/actualizar y Open-Meteo no pasan por aquí (Open-Meteo lo guarda la app 30 min en su caché).
const VERSION = 'olas-v4';
const APP = [
  './', './index.html', './style.css', './manifest.json', './icon.svg', './config.json', './playas.json', './clima-mar.json',
  './fonts/inter-latin.woff2', './fonts/space-grotesk-latin.woff2',
  './js/app.js', './js/tema.js', './js/mar.js', './js/score.js', './js/salidas.js', './js/lugares.js',
  './js/luna.js', './js/compartir.js', './js/cache.js',
  './js/catalogo.js', './js/mis-playas.js', './js/selector.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function primeroRed(req) {
  const cache = await caches.open(VERSION);
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (r.ok) cache.put(req, r.clone());
    return r;
  } catch (e) {
    const guardada = await cache.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    throw e;
  }
}

async function cacheYRenovar(req, evento) {
  const cache = await caches.open(VERSION);
  const guardada = await cache.match(req, { ignoreSearch: true });
  const renovar = fetch(req, { cache: 'no-cache' })
    .then((r) => { if (r.ok) cache.put(req, r.clone()); return r; })
    .catch(() => null);
  if (guardada) {
    evento.waitUntil(renovar);
    return guardada;
  }
  return (await renovar) ?? Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const ruta = url.pathname;
  if (ruta.startsWith('/data/') || ruta.endsWith('/config.json') || ruta.endsWith('/playas.json')) {
    e.respondWith(primeroRed(req));
  } else if (req.mode === 'navigate') {
    e.respondWith(cacheYRenovar(new Request('./index.html'), e));
  } else {
    e.respondWith(cacheYRenovar(req, e));
  }
});
