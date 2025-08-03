// api/cashback-config.js

// Yeh Vercel ke liye ek DUSRA serverless function hai.
// Yeh function cashback system ke liye environment variables ko lega.

export default function handler(request, response) {
  // NAYE environment variables ko process.env se access karein
  const firebaseConfig = {
    apiKey: process.env.CASHBACK_FIREBASE_API_KEY,
    authDomain: process.env.CASHBACK_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.CASHBACK_FIREBASE_DATABASE_URL,
    projectId: process.env.CASHBACK_FIREBASE_PROJECT_ID,
    storageBucket: process.env.CASHBACK_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.CASHBACK_FIREBASE_SENDER_ID,
    appId: process.env.CASHBACK_FIREBASE_APP_ID
  };

  // Config ko 200 OK status ke saath JSON response mein bhejein
  response.status(200).json(firebaseConfig);
}

