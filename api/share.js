export default async function handler(req, res) {
    const { id } = req.query;

    if (!id) {
        return res.status(400).send("Product ID is missing.");
    }

    try {
        const dbUrl = "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app";
        const response = await fetch(`${dbUrl}/ramazone/products.json`);
        const data = await response.json();

        let product = null;
        if (Array.isArray(data)) {
            product = data.find(p => p && p.id == id);
        } else if (data) {
            product = Object.values(data).find(p => p && p.id == id);
        }

        // Default Data (Fallback)
        const title = product ? product.name : "Ramazone Product";
        const description = product 
            ? `Buy ${product.name} at best price on Ramazone. ${product.shortDescription || ''}` 
            : "Check out this amazing product on Ramazone!";
        const image = (product && product.images && product.images.length > 0) 
            ? product.images[0] 
            : "https://i.ibb.co/2RySQ5K/20240813-084352.png"; // Default Logo Image
        
        // Final Redirect URL
        const redirectUrl = `https://www.ramazone.in/product-details.html?id=${id}`;

        const html = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                
                <!-- Open Graph / Facebook / WhatsApp -->
                <meta property="og:type" content="product" />
                <meta property="og:url" content="https://www.ramazone.in/api/share?id=${id}" />
                <meta property="og:title" content="${title}" />
                <meta property="og:description" content="${description}" />
                <meta property="og:image" content="${image}" />
                <meta property="og:image:width" content="800" />
                <meta property="og:image:height" content="800" />
                <meta property="og:site_name" content="Ramazone" />

                <!-- Twitter -->
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="${title}" />
                <meta name="twitter:description" content="${description}" />
                <meta name="twitter:image" content="${image}" />
                
                <!-- ItemProp (Google/Other Bots) -->
                <meta itemprop="name" content="${title}">
                <meta itemprop="description" content="${description}">
                <meta itemprop="image" content="${image}">

                <!-- Client-side Redirect -->
                <script>
                    window.location.href = "${redirectUrl}";
                </script>
            </head>
            <body>
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    <p>Redirecting to product...</p>
                    <img src="${image}" style="max-width: 200px; border-radius: 8px;">
                </div>
            </body>
            </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        // Cache control taaki WhatsApp purana image na dikhaye agar product update ho
        res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate'); 
        res.status(200).send(html);

    } catch (error) {
        console.error("API Error:", error);
        res.redirect('/');
    }
}

