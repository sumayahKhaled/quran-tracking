// Service Worker for Offline Quran Tracker (Tibyan)
const CACHE_NAME = 'tibyan-quran-cache-v4';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './assets/icon.svg',
  './js/quran-data.js',
  './js/firebase-service.js',
  './js/audio-recorder.js',
  './js/app.js',
  './js/libs/firebase-app-compat.js',
  './js/libs/firebase-firestore-compat.js',
  './assets/fonts/ibm-plex-arabic-400.ttf',
  './assets/fonts/ibm-plex-arabic-500.ttf',
  './assets/fonts/ibm-plex-arabic-600.ttf',
  './assets/fonts/ibm-plex-arabic-700.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin) && !event.request.url.includes('gstatic.com/firebasejs')) return;
  // Cache first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((res) => {
        // تخزين مكتبة المصادقة (gstatic) لتعمل دون إنترنت بعد أول تحميل
        if (res && (res.ok || res.type === 'opaque') && event.request.url.includes('gstatic.com/firebasejs')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => {
        // Offline fallback if needed
        return caches.match('./index.html');
      });
    })
  );
});