export default function handler(request, response) {
  
  const firebaseConfig = {
    apiKey: process.env.VENDOR_FIREBASE_API_KEY,
    authDomain: process.env.VENDOR_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.VENDOR_FIREBASE_DATABASE_URL,
  };

  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.databaseURL) {
    return response.status(500).json({ 
      error: "Server par VENDOR_FIREBASE... naam ke environment variables set nahi hain." 
    });
  }

  response.status(200).json(firebaseConfig);
}


