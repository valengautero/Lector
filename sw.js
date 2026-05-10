// sw.js — Service Worker para modo offline
const CACHE = 'lector-v1';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/db.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Always network-first for Google Fonts and PDF.js CDN
  if (e.request.url.includes('fonts.googleapis') ||
      e.request.url.includes('fonts.gstatic') ||
      e.request.url.includes('cdnjs.cloudflare')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for local assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
