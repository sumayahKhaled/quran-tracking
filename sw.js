const CACHE_NAME = 'quran-tracker-v6';

const APP_SHELL = [
    './',
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/vue/3.5.42/vue.global.prod.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .catch(() => {})
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => {
                        try { cache.put(request, networkResponse.clone()); } catch (err) {}
                    });
                    return networkResponse;
                })
                .catch(() => caches.match(request).then((cached) => cached || caches.match('./')))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request)
                .then((networkResponse) => {
                    caches.open(CACHE_NAME).then((cache) => {
                        try { cache.put(request, networkResponse.clone()); } catch (err) {}
                    });
                    return networkResponse;
                })
                .catch(() => undefined);
        })
    );
});