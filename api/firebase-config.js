// api/firebase-config.js

// Yeh Vercel ke liye ek serverless function hai.
// Yeh function environment variables se aapki Firebase keys ko lega
// aur unhe JSON format mein frontend ko bhejega.

export default function handler(request, response) {
  // Environment variables ko process.env se access karein
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  };

  // Config ko 200 OK status ke saath JSON response mein bhejein
  response.status(200).json(firebaseConfig);
}

