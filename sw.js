// Service Worker for Ramazone PWA

// --- हर नए अपडेट पर इस वर्जन नंबर को बदलें (v2 से v3, v3 से v4, आदि) ---
const CACHE_NAME = 'ramazone-cache-v6'; 

const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  'https://i.ibb.co/CpBR4gjN/20250708-142020.png' // Logo
];

// ... बाकी का कोड जैसा मैंने पहले दिया था ...

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; 
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
