const express = require('express');
const app = express();
const port = 5000;

// यह आपकी html, css, js फाइलों को serve करेगा
app.use(express.static('.'));

// यह आपकी API बनाएगा जो Firebase की Keys देगी
app.get('/api/firebase-config', (req, res) => {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    // अगर और keys हैं तो यहाँ जोड़ें
  };
  res.json(firebaseConfig);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}!`);
});
