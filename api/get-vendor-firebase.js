// /api/get-vendor-firebase.js
// YEH FINAL VERSION HAI NAYE ENVIRONMENT VARIABLE NAAM KE SAATH

export default function handler(request, response) {
  
  // Vercel se naye naam wale variables ko access karein
  const firebaseConfig = {
    apiKey: process.env.VENDOR_FIREBASE_API_KEY,         // <-- NAAM BADAL GAYA HAI
    authDomain: process.env.VENDOR_FIREBASE_AUTH_DOMAIN,   // <-- NAAM BADAL GAYA HAI
    databaseURL: process.env.VENDOR_FIREBASE_DATABASE_URL, // <-- NAAM BADAL GAYA HAI
  };

  // Check karein ki Vercel se saari keys mil rahi hain ya nahi
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.databaseURL) {
    return response.status(500).json({ 
      error: "Server par VENDOR_FIREBASE... naam ke environment variables set nahi hain." 
    });
  }

  // Sahi config ko bhejein
  response.status(200).json(firebaseConfig);
}


