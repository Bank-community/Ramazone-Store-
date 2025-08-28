// Service Worker for Ramazone PWA

// --- STEP 1: UPDATE THE CACHE VERSION ---
// Change this version number every time you deploy new updates.
// For example, 'v2', 'v3', etc.
const CACHE_NAME = 'ramazone-cache-v4'; 

// List of files to cache. Start with the essentials.
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  'https://i.ibb.co/CpBR4gjN/20250708-142020.png' // Logo
];

// Install event: fires when the new service worker is installed.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching new assets');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event: serves assets from cache or network.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response from cache
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request); 
      })
  );
});

// --- STEP 2: ADD LOGIC TO DELETE OLD CACHES ---
// Activate event: fires when the new service worker is activated.
// This is where we clean up old, unused caches.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; // The only cache we want to keep

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // If a cache is found that is not in our whitelist...
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            // ...delete it!
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

