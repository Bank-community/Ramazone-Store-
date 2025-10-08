const CACHE_NAME = 'rmz-pay-cache-v1';
const urlsToCache = [
  '.',
  'cashback.html',
  'manifest.json',
  'https://i.ibb.co/CpxWpNfN/20251008-194445.png', // App Icon
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap' // Google Font
];

// इंस्टॉल इवेंट: जब सर्विस वर्कर पहली बार रजिस्टर होता है
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching essential assets');
        return cache.addAll(urlsToCache);
      })
  );
});

// फेच इवेंट: जब भी ऐप कोई फाइल या डेटा मांगता है
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // अगर कैश में फाइल है, तो उसे दिखाओ, वरना इंटरनेट से लाओ
        return response || fetch(event.request);
      })
  );
});
