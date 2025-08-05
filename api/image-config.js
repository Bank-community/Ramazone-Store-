// api/image-config.js
// Yeh Vercel ke liye ek serverless function hai jo image upload API key dega.

export default function handler(request, response) {
  // Vercel Environment Variable se API Key access karein
  const imgbbApiKey = process.env.IMGBB_API_KEY;

  // Key ko JSON response mein bhejein
  response.status(200).json({ apiKey: imgbbApiKey });
}
