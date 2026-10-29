// Service Worker for Offline Quran Tracker (Tibyan)
const CACHE_NAME = 'seraj-quran-cache-v52';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './assets/icon.svg',
  './data/ayahinfo_1405.json',
  './js/quran-data.js',
  './js/firebase-service.js',
  './js/audio-recorder.js',
  './js/app.js',
  './js/mushaf.js',
  './js/libs/firebase-app-compat.js',
  './js/libs/firebase-auth-compat.js',
  './js/libs/firebase-firestore-compat.js',
  './assets/fonts/ibm-plex-arabic-400.ttf',
  './assets/fonts/ibm-plex-arabic-500.ttf',
  './assets/fonts/ibm-plex-arabic-600.ttf',
  './assets/fonts/ibm-plex-arabic-700.ttf'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          // Keep current app cache, audio cache, tafsir cache, and new 1405 mushaf cache; delete everything else
          if (key !== CACHE_NAME && !key.startsWith('tibyan-audio') && key !== 'tibyan-mushaf-1405-v1' && !key.startsWith('tibyan-tafsir')) {
            console.log('[SW] Deleting legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('gstatic.com/firebasejs'))) return;
  
  // Network first for app assets to guarantee instant updates when connected
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
      }
      return networkResponse;
    }).catch(() => {
      // Offline fallback to cache
      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        // Only return index.html for page navigation requests, never for scripts/styles
        if (event.request.mode === 'navigate' || event.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 408, statusText: 'Offline Asset Not Cached' });
      });
    })
  );
});