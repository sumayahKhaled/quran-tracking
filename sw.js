// Service Worker for Offline Quran Tracker (Tibyan)
const CACHE_NAME = 'seraj-quran-cache-v194';
const AUDIO_CACHE_NAME = 'seraj-audio-cache-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './assets/icon.svg',
  './assets/logo.png',
  './data/ayahinfo_1405.json',
  './data/gharib.json',
  './data/quran_text.json',
  './js/quran-data.js',
  './js/mutashabihat-data.js',
  './js/firebase-service.js',
  './js/audio-recorder.js',
  './js/quarter-consolidation.js',
  './js/cumulative-repetition.js',
  './js/onboarding-wizard.js',
  './js/surprise-test.js',
  './js/app.js',
  './js/mushaf.js',
  './js/libs/firebase-app-compat.js',
  './js/libs/firebase-auth-compat.js',
  './js/libs/firebase-firestore-compat.js',
  './js/libs/html-to-image.min.js',
  './js/libs/html2pdf.bundle.min.js',
  './assets/fonts/ibm-plex-arabic-400.ttf',
  './assets/fonts/ibm-plex-arabic-500.ttf',
  './assets/fonts/ibm-plex-arabic-600.ttf',
  './assets/fonts/ibm-plex-arabic-700.ttf'
];

// تجميع كافة مسارات صفحات وخطوط المصحف الـ 604 المدمجة مسبقاً
const MUSHAF_PRECACHE_ASSETS = [];
for (let p = 1; p <= 604; p++) {
  MUSHAF_PRECACHE_ASSETS.push(`./data/pages/${p}.json`);
  MUSHAF_PRECACHE_ASSETS.push(`./assets/qcf/p${p}.woff2`);
}
MUSHAF_PRECACHE_ASSETS.push('./assets/qcf/surah-name-v4.woff2');
MUSHAF_PRECACHE_ASSETS.push('./assets/qcf/QCF_SurahHeader_COLOR-Regular.woff2');

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // تثبيت ملفات التطبيق الأساسية فوراً لضمان التشغيل الفوري دون انتظار
      for (const url of CORE_ASSETS) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('[SW] Core asset cache skip/error:', url, err);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          // Keep current app cache, high-bitrate audio cache, tafsir cache, and QCF mushaf cache; delete old low-bitrate and obsolete caches
          if (key !== CACHE_NAME && key !== AUDIO_CACHE_NAME && key !== 'tibyan-mushaf-1405-v1' && !key.startsWith('tibyan-tafsir') && !key.startsWith('tibyan-qcf')) {
            console.log('[SW] Deleting legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()).then(() => {
      // تخزين ملفات المصحف والخطوط المدمجة في الخلفية تدريجياً دون تعطيل التطبيق
      caches.open(CACHE_NAME).then(async (cache) => {
        const batchSize = 30;
        for (let i = 0; i < MUSHAF_PRECACHE_ASSETS.length; i += batchSize) {
          const batch = MUSHAF_PRECACHE_ASSETS.slice(i, i + batchSize);
          await Promise.allSettled(batch.map((url) => cache.add(url)));
          await new Promise(r => setTimeout(r, 60));
        }
      }).catch(() => { });
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('gstatic.com/firebasejs'))) return;

  const reqUrl = new URL(event.request.url);

  // ملفات المصحف وخطوطه المدمجة محلياً: Cache First للاستجابة الفورية الصامتة (0ms)
  if (reqUrl.pathname.includes('/assets/qcf/') || reqUrl.pathname.includes('/data/pages/')) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((netRes) => {
          if (netRes && netRes.ok) {
            const clone = netRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return netRes;
        }).catch(() => new Response('', { status: 404, statusText: 'Mushaf Asset Missing' }));
      })
    );
    return;
  }

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
      return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        // Only return index.html for page navigation requests, never for scripts/styles
        if (event.request.mode === 'navigate' || event.request.destination === 'document') {
          return caches.match('./index.html').then(res => res || caches.match('/index.html') || caches.match('./'));
        }
        return new Response('', { status: 408, statusText: 'Offline Asset Not Cached' });
      });
    })
  );
});
