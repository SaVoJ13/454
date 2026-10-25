/* Версію береться з js/version.js (єдине джерело). Піднімай її при кожному деплої — так користувачі
   отримають оновлення: зміна version.js змінює і sw.js (importScripts), і назву кешу. */
importScripts('./js/version.js');
const VERSION = self.APP_VERSION;
const CACHE = `salary-${VERSION}`;

const CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/calc.js',
  './js/i18n.js',
  './js/firebase.js',
  './js/utils.js',
  './js/monthcache.js',
  './js/pit.js',
  './js/stats.js',
  './js/charts.js',
  './js/version.js',
  './js/sw-register.js',
  // Великі іконки (512) навмисно не в прекеші: браузер бере їх сам під час встановлення PWA, а в CORE вони змусили б
  // кожне оновлення заново качати сотні КБ (прекеш іде з cache: 'reload').
  './android-chrome-192x192.png',
  './maskable-192.png'
];

// Прекеш у обхід HTTP-кешу браузера: новий service worker має отримати справді нові файли.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Stale-while-revalidate для власних файлів і Firebase JS з gstatic;
   запити до Firestore/Auth API не чіпаємо. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseCdn = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!sameOrigin && !firebaseCdn) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: sameOrigin });
      const network = fetch(req)
        .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    })
  );
});
