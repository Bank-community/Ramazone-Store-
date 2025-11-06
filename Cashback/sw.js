const CACHE_NAME = 'rmz-pay-cache-v3'; // v2 se v3 kiya
const urlsToCache = [
  '.',
  'index.html', // (FIXED) 'cashback.html' ko 'index.html' kiya
  'manifest.json',
  'app.js', // (ADDED) Offline ke liye add kiya
  'payments.js', // (ADDED) Offline ke liye add kiya
  'https://i.ibb.co/0VzN1b3h/20251008-194847.png', // App Icon
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap' // Google Font
];

// Install event: Nayi files ko cache karein
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching essential assets');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Naye service worker ko turant activate karein
});

// Activate event: Purane cache (v2) ko delete karein
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Turant control lein
});

// Fetch event: Jab bhi app koi file ya data maangta hai (Cache-first strategy)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 1. Agar cache mein hai, toh wahaan se do
        if (response) {
          return response;
        }

        // 2. Agar cache mein nahi hai, toh network se lao
        return fetch(event.request).then(
          networkResponse => {
            
            // Response ko clone karo
            const responseToCache = networkResponse.clone();

            // Naye response ko cache mein daal do
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            // Original response ko return karo
            return networkResponse;
          }
        );
      })
  );
});

