export default async function handler(req, res) {
    // 1. URL se Product ID nikalo (e.g., ?id=123)
    const { id } = req.query;

    if (!id) {
        return res.status(400).send("Product ID is missing.");
    }

    try {
        // 2. Firebase Database URL (Aapke index.js se liya gaya hai)
        const dbUrl = "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app";
        
        // 3. Product Data Fetch karo
        // Hum saare products la rahe hain aur filter kar rahe hain taaki array/object dono handle ho sake
        const response = await fetch(`${dbUrl}/ramazone/products.json`);
        const data = await response.json();

        // 4. Sahi product dhundo
        let product = null;
        if (Array.isArray(data)) {
            product = data.find(p => p && p.id == id);
        } else if (data) {
            product = Object.values(data).find(p => p && p.id == id);
        }

        // Agar product nahi mila, to Home Page par bhej do
        if (!product) {
            return res.redirect('/');
        }

        // 5. Meta Tags ke liye details tayyar karo
        const title = product.name || "Ramazone Product";
        const price = product.displayPrice ? `₹${Number(product.displayPrice).toLocaleString("en-IN")}` : "";
        const description = `Check out this amazing product on Ramazone! Price: ${price}. Limited stock available.`;
        const image = (product.images && product.images.length > 0) ? product.images[0] : "https://i.ibb.co/WvTg0bc5/20240813-084352.png";
        
        // Asli Product Page ka link (Redirect ke liye)
        // 'https://www.ramazone.in' aapka domain hai
        const redirectUrl = `https://www.ramazone.in/product-details.html?id=${id}`;

        // 6. HTML Generate karo (WhatsApp Bot ke liye)
        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                
                <!-- Social Media Meta Tags (Ye WhatsApp padhega) -->
                <title>${title}</title>
                <meta name="description" content="${description}">
                
                <meta property="og:type" content="website" />
                <meta property="og:title" content="${title}" />
                <meta property="og:description" content="${description}" />
                <meta property="og:image" content="${image}" />
                <meta property="og:image:width" content="600" />
                <meta property="og:image:height" content="600" />
                <meta property="og:url" content="https://www.ramazone.in/api/share?id=${id}" />
                <meta property="og:site_name" content="Ramazone" />
                
                <!-- Twitter Cards -->
                <meta name="twitter:card" content="summary_large_image">
                <meta name="twitter:title" content="${title}">
                <meta name="twitter:description" content="${description}">
                <meta name="twitter:image" content="${image}">

                <!-- 7. Redirect Logic (Insaan ke liye) -->
                <script>
                    // Jaise hi page khule, user ko asli product page par bhej do
                    window.location.href = "${redirectUrl}";
                </script>
            </head>
            <body>
                <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; flex-direction: column;">
                    <img src="${image}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 10px; margin-bottom: 20px;">
                    <p>Redirecting to Ramazone...</p>
                </div>
            </body>
            </html>
        `;

        // HTML wapas bhejo
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(html);

    } catch (error) {
        console.error("Share API Error:", error);
        res.redirect('/');
    }
}

