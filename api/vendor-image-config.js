// /api/vendor-image-config.js

// Yeh Vercel ke liye ek serverless function hai jo image upload API key dega.
// Ismein hum aapke kehne par ek alag environment variable ka naam istemal kar rahe hain.

export default function handler(request, response) {
  // Vercel Environment Variable se API Key access karein
  // **YAAD RAKHEIN:** Vercel mein is variable ka naam 'VENDOR_IMGBB_API_KEY' hona chahiye.
  const imgbbApiKey = process.env.VENDOR_IMGBB_API_KEY;

  // Key ko JSON response mein bhejein
  response.status(200).json({ apiKey: imgbbApiKey });
}

