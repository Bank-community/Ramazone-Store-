// /api/test-api.js
// Yeh ek bahut hi simple test function hai.
// Iska kaam sirf ek success message bhejna hai.
// Isse environment variables ka koi lena-dena nahi hai.

export default function handler(request, response) {
  // Bas ek simple JSON message bhejein
  response.status(200).json({ status: "Connection OK! API is working." });
}

