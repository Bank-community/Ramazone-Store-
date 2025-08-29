// Service Worker for Ramazone PWA

// --- हर नए अपडेट पर इस वर्जन नंबर को बदलें (v6 से v7, v7 से v8, आदि) ---
const CACHE_NAME = 'ramazone-cache-v7'; 

// ये वो ज़रूरी फाइलें हैं जो ऐप को चलाने के लिए सबसे पहले चाहिए।
const urlsToCache = [
  '/',
  '/index.html',
  '/products.html',
  '/order.html',
  '/style.css',
  '/main.js',
  'https://i.ibb.co/CpBR4gjN/20250708-142020.png', // Logo
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css' // Font Awesome
];

// 1. Install Event: जब सर्विस वर्कर पहली बार इंस्टॉल होता है
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // ज़रूरी फाइलों को कैश में डालो
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Activate Event: जब नया सर्विस वर्कर एक्टिवेट होता है
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; 
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // अगर कोई पुराना कैश है, तो उसे डिलीट कर दो
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. Fetch Event: जब भी ऐप कोई फाइल (image, html, js) मांगती है
// यह सबसे ज़रूरी हिस्सा है
self.addEventListener('fetch', event => {
  event.respondWith(
    // सबसे पहले नेटवर्क से लाने की कोशिश करो
    fetch(event.request)
      .then(networkResponse => {
        // अगर नेटवर्क से फाइल मिल गई
        return caches.open(CACHE_NAME).then(cache => {
          // तो उसे कैश में भी सेव कर लो (ताकि अगली बार ऑफलाइन चले)
          cache.put(event.request, networkResponse.clone());
          // और नई फाइल को ऐप में दिखाओ
          return networkResponse;
        });
      })
      .catch(() => {
        // अगर नेटवर्क फेल हो गया (यानि इंटरनेट बंद है)
        // तो कैश में से पुरानी फाइल ढूंढकर दिखाओ
        return caches.match(event.request);
      })
  );
});

