/* ═══════════════════════════════════════════════════════════════
   Service Worker — منصة الأستاذ محمد عيسى
   ═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'manassa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/signup.html',
  '/admin.html',
  '/auth.css',
  '/admin.css',
  '/student.css',
  '/auth.js',
  '/admin.js',
  '/student.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

/* التثبيت */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

/* التنشيط */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* الجلب */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // ما نخزنش Supabase API
  if (url.hostname.includes('supabase.co')) return;

  // ما نخزنش Google Fonts dynamic
  if (url.hostname.includes('fonts.gstatic.com')) return;

  // HTML → Network first
  if (req.destination === 'document') {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('/login.html')))
    );
    return;
  }

  // باقي الملفات → Cache first
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && req.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});