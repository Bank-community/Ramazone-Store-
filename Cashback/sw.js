// कैश का नाम और वर्जन। जब भी आप ऐप में बड़ा बदलाव करें, तो v1 को v2, v3, आदि में बदल दें।
const CACHE_NAME = 'rmz-pay-cache-v2';

// वे सभी फाइलें जो ऐप को ऑफलाइन चलाने के लिए ज़रूरी हैं।
// ध्यान दें: सभी पाथ '/' से शुरू हो रहे हैं, जो डोमेन का रूट है।
const urlsToCache = [
  // Core App Files
  '/Cashback/', // यह /Cashback/index.html को कैश करेगा
  '/Cashback/index.html', // स्पष्टता के लिए इसे भी जोड़ रहे हैं
  '/Cashback/manifest.json',

  // Logos and Icons (HTML में इस्तेमाल किए गए)
  'https://i.ibb.co/Jj0f3QQz/20250708-182433.png', // Main Logo
  'https://www.svgrepo.com/show/491787/cashback-ui-web.svg',
  'https://www.svgrepo.com/show/503562/scan-qrcode.svg',
  'https://www.svgrepo.com/show/228705/collaboration-team.svg',
  'https://www.svgrepo.com/show/452133/whatsapp.svg',
  'https://www.svgrepo.com/show/513295/credit-card.svg',
  'https://www.svgrepo.com/show/279392/coins-money.svg',

  // External Libraries (JS)
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js',
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',

  // Firebase SDKs
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js',

  // Google Fonts
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  'https://fonts.gstatic.com/s/poppins/v21/pxiByp8kv8JHgFVrLBT5Z1xlFd2JQEk.woff2' // Font file (often fetched by the CSS)
];

// इंस्टॉल इवेंट: जब सर्विस वर्कर पहली बार रजिस्टर होता है
self.addEventListener('install', event => {
  console.log('Service Worker: Install event in progress.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching essential assets.');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Failed to cache assets during install:', error);
      })
  );
});

// एक्टिवेट इवेंट: पुराने कैश को हटाने के लिए
self.addEventListener('activate', event => {
  console.log('Service Worker: Activate event in progress.');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          // अगर कैश का नाम हमारे मौजूदा कैश के नाम से अलग है, तो उसे डिलीट कर दो
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// फेच इवेंट: जब भी ऐप कोई फाइल या डेटा मांगता है (जैसे इमेज, स्क्रिप्ट, आदि)
self.addEventListener('fetch', event => {
  // हम सिर्फ GET रिक्वेस्ट का जवाब देते हैं
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // अगर अनुरोध की गई फाइल कैश में है, तो उसे सीधे कैश से लौटा दो
        if (cachedResponse) {
          // console.log('Service Worker: Returning from cache:', event.request.url);
          return cachedResponse;
        }

        // अगर फाइल कैश में नहीं है, तो इंटरनेट से उसे लाने की कोशिश करो
        // console.log('Service Worker: Fetching from network:', event.request.url);
        return fetch(event.request);
      })
      .catch(error => {
        // अगर नेटवर्क से भी लाने में कोई एरर आता है
        console.error('Fetch error:', error);
        // आप यहां एक ऑफलाइन फॉलबैक पेज भी दिखा सकते हैं
      })
  );
});

