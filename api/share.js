export default async function handler(request, response) {
    // 1. URL से Product ID निकालें
    const { id } = request.query;

    if (!id) {
        return response.status(400).send("Product ID missing");
    }

    try {
        // 2. Firebase से डेटा लाएं (REST API का उपयोग करके, जो बहुत तेज़ है)
        // नोट: यहाँ हम सीधे Database URL use कर रहे हैं जो env variable में होना चाहिए
        // या आप इसे hardcode भी कर सकते हैं अगर security rules read के लिए public हैं।
        
        // आपके provided code से Database URL:
        const dbUrl = process.env.FIREBASE_DATABASE_URL || "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app";
        
        // Ramazone products fetch करें
        const fetchRes = await fetch(`${dbUrl}/ramazone/products.json`);
        const productsData = await fetchRes.json();

        // 3. सही प्रोडक्ट ढूँढें
        // (Note: अगर आपका डेटा array है या object, यह कोड दोनों को handle करेगा)
        let product = null;
        if (Array.isArray(productsData)) {
            product = productsData.find(p => p && p.id == id);
        } else if (productsData) {
            product = Object.values(productsData).find(p => p && p.id == id);
        }

        if (!product) {
            // अगर प्रोडक्ट नहीं मिला तो होमपेज पर भेज दें
            return response.redirect("/");
        }

        // 4. प्रोडक्ट की डिटेल्स निकालें
        const title = product.name || "Ramazone Product";
        const description = product.description || `Check out this amazing product on Ramazone. Price: ₹${product.displayPrice}`;
        // Image: पहली इमेज लें, या डिफ़ॉल्ट इमेज
        const image = (product.images && product.images.length > 0) ? product.images[0] : "https://i.ibb.co/WvTg0bc5/20240813-084352.png";
        
        // 5. असली पेज का लिंक (जहाँ यूजर को भेजना है)
        // ध्यान दें: आपको अपनी वेबसाइट का डोमेन यहाँ डालना होगा या request host use करना होगा
        const redirectUrl = `/product-details.html?id=${id}`;

        // 6. HTML तैयार करें (Meta Tags के साथ)
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                
                <title>${title}</title>
                <meta name="description" content="${description}">
                
                <meta property="og:type" content="website" />
                <meta property="og:title" content="${title}" />
                <meta property="og:description" content="${description}" />
                <meta property="og:image" content="${image}" />
                <meta property="og:image:width" content="600" />
                <meta property="og:image:height" content="600" />
                <meta property="og:url" content="https://ramazone.vercel.app/api/share?id=${id}" />
                
                <meta name="twitter:card" content="summary_large_image">
                <meta name="twitter:title" content="${title}">
                <meta name="twitter:description" content="${description}">
                <meta name="twitter:image" content="${image}">

                <script>
                    window.location.href = "${redirectUrl}";
                </script>
            </head>
            <body>
                <p>Redirecting to product details...</p>
            </body>
            </html>
        `;

        // 7. Response भेजें
        response.setHeader('Content-Type', 'text/html');
        return response.send(html);

    } catch (error) {
        console.error("API Error:", error);
        return response.redirect("/");
    }
}
