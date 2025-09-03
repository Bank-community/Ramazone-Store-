// /api/get-vendor-firebase.js
// YEH NAYE NAAM WALI FILE KA SAHI CODE HAI

export default function handler(request, response) {
  
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  };

  // Check karein ki Vercel se saari keys mil rahi hain ya nahi
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.databaseURL) {
    return response.status(500).json({ 
      error: "Server par Firebase environment variables poori tarah se set nahi hain." 
    });
  }

  // Sahi config ko bhejein
  response.status(200).json(firebaseConfig);
}

