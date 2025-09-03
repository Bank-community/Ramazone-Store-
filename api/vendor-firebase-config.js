// /api/vendor-firebase-config.js
// FINAL AND CORRECTED VERSION

// Yeh Vercel ke liye serverless function hai.
// Yeh Vercel Environment Variables se aapki Firebase keys ko lega
// aur unhe JSON format mein frontend ko bhejega.

export default function handler(request, response) {
  
  // Environment variables ko process.env se access karein
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  };

  // Yeh check karega ki Vercel se saari keys mil rahi hain ya nahi
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.databaseURL) {
    // Agar koi bhi key nahi milti hai, to server 500 error dega
    return response.status(500).json({ 
      error: "Server par Firebase environment variables poori tarah se set nahi hain. Kripya Vercel settings check karein." 
    });
  }

  // Agar sab theek hai, to config ko 200 OK status ke saath bhejein
  response.status(200).json(firebaseConfig);
}


