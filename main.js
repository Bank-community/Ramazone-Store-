<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ramazone - Aapki Apni Dukaan</title>
    <link rel="apple-touch-icon" href="https://i.ibb.co/WvTg0bc5/20240813-084352.png">

    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-color: #4F46E5;
            --secondary-color: #F59E0B;
            --text-dark: #111827;
            --text-light: #6B7280;
            --bg-light: #F9FAFB;
            --bg-white: #FFFFFF;
            --border-color: #E5E7EB;
            --slider-interval-duration: 5s; /* Slider timer duration */
        }
        body { font-family: 'Inter', sans-serif; background-color: var(--bg-white); color: var(--text-dark); }
        .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.6s ease-out, transform 0.6s ease-out; }
        .reveal.visible { opacity: 1; transform: translateY(0); }
        .section-title { font-size: 1.4rem; font-weight: 800; text-align: left; margin-bottom: 1rem; letter-spacing: -0.5px; padding: 0 1rem; }
        @media (min-width: 768px) { .section-title { font-size: 1.6rem; } }
        .section-container { padding: 1.5rem 0; }
        @media (min-width: 1024px) { .section-container { padding: 2rem 0; } }
        header { position: sticky; top: 0; z-index: 50; transition: background-color 0.3s, box-shadow 0.3s; }
        
        /* Search Bar Styles */
        #search-container { background-color: var(--bg-white); padding: 0.5rem 1rem; }
        #search-link { display: flex; align-items: center; width: 100%; padding: 0.75rem 1rem; background-color: var(--bg-light); border-radius: 8px; border: 1px solid var(--border-color); text-decoration: none; color: var(--text-light); }
        #search-link:hover { border-color: var(--primary-color); }
        #search-link .search-icon { color: var(--text-dark); margin-right: 0.75rem; }

        /* Slider Styles */
        .slider-wrapper { padding: 0 1rem; margin-top: 0.5rem; }
        .slider-container { position: relative; width: 100%; overflow: hidden; aspect-ratio: 16 / 8.5; max-height: 400px; border-radius: 12px; }
        .slider { display: flex; height: 100%; }
        .slider.transitioning { transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1); }
        .slide { width: 100%; height: 100%; flex-shrink: 0; position: relative; }
        .slide video, .slide picture, .slide img { width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0; z-index: 1; border-radius: 12px; }
        
        .slider-dots { display: flex; justify-content: center; gap: 8px; z-index: 10; padding-top: 0.5rem; }
        .slider-dots .dot { width: 8px; height: 4px; background: rgba(0, 0, 0, 0.15); border-radius: 50px; cursor: pointer; transition: all 0.4s ease; overflow: hidden; }
        .slider-dots .dot.active { background: rgba(0, 0, 0, 0.3); width: 32px; }
        .slider-dots .dot .timer { width: 0%; height: 100%; background: var(--text-dark); border-radius: 50px; }
        .slider-dots .dot.active .timer { width: 100%; transition: width var(--slider-interval-duration) linear; }

        /* Optimized Category Styles */
        #normal-category-section { padding: 0.5rem 0; }
        .category-master-scroller { overflow-x: auto; scroll-behavior: smooth; scrollbar-width: none; -ms-overflow-style: none; padding: 0 1rem; }
        .category-master-scroller::-webkit-scrollbar { display: none; }
        .category-rows-container { display: inline-flex; flex-direction: column; gap: 0.5rem; padding: 0.25rem 0; }
        .category-row { display: flex; gap: 0.75rem; }
        .category-card { flex-shrink: 0; width: 60px; text-align: center; text-decoration: none; color: var(--text-dark); display: flex; flex-direction: column; }
        .category-card--double { width: 132px; }
        .category-card .img-wrapper { background-color: var(--bg-light); border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); width: 100%; height: 60px; }
        .category-card .img-wrapper img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; }
        .category-card:hover .img-wrapper img { transform: scale(1.05); }
        .category-name { font-size: 0.62rem; font-weight: 600; color: var(--text-dark); line-height: 1.3; margin-top: 0.3rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }

        /* Festive Collection & Deals Section */
        .festive-collection { padding: 1rem 0 0.5rem 0; margin-top: 0.5rem; position: relative; overflow: hidden; }
        #highlighted-products-section { padding-top: 1rem; }
        .festival-headline { font-size: 1.5rem; font-weight: 800; text-align: left; margin-bottom: 1rem; letter-spacing: -0.5px; padding: 0 1rem; }
        .product-slider { display: flex; gap: 1rem; overflow-x: auto; scroll-behavior: smooth; padding: 0.5rem 1rem; scrollbar-width: none; -ms-overflow-style: none; }
        .product-slider::-webkit-scrollbar { display: none; }
        
        /* Updated Product Card Styles */
        .product-card { background-color: var(--bg-white); border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); border: 1px solid #E5E7EB; transition: transform 0.3s ease, box-shadow 0.3s ease; display: block; text-decoration: none; overflow: hidden; }
        .product-card:hover { transform: translateY(-5px); box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); }
        .product-media-container { position: relative; width: 100%; padding-top: 100%; background-color: #f3f4f6; }
        .product-media-container img { position: absolute; top:0; left:0; width: 100%; height: 100%; object-fit: cover; }
        .product-details { padding: 0.75rem; text-align: center; }
        .product-name { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.25rem; color: var(--text-dark); }
        .product-price { display: flex; align-items: baseline; gap: 0.5rem; justify-content: center; }
        .display-price { font-weight: 700; color: var(--text-dark); font-size: 1.1rem; }
        .original-price { font-size: 0.85rem; text-decoration: line-through; color: var(--text-light); }
        .product-discount { color: #16a34a; font-size: 0.875rem; font-weight: 600; margin-top: 0.25rem; }
        
        .product-rating-tag { position: absolute; top: 0.5rem; right: 0.5rem; background-color: #16a34a; color: white; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.2rem; border: 1px solid rgba(255, 255, 255, 0.5); z-index: 5; }
        .product-rating-tag .fa-star { font-size: 0.65rem; }
        .product-offer-tag { position: absolute; bottom: 0.5rem; left: 0.5rem; padding: 2px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 500; z-index: 5; }

        .product-slider .product-card { flex: 0 0 calc(50% - 10px); max-width: 200px; }
        @media (min-width: 640px) { .product-slider .product-card { flex-basis: calc(33.33% - 12px); } }
        @media (min-width: 1024px) { .product-slider .product-card { flex-basis: calc(20% - 13px); } }

        #highlighted-products-wrapper { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; padding: 0 1rem; }
        @media (min-width: 768px) { #highlighted-products-wrapper { grid-template-columns: repeat(3, 1fr); } }
        
        /* Marquee Styles */
        #info-marquee-section { margin: 1rem 0; padding: 0.75rem 0; }
        .marquee-viewport { overflow: hidden; }
        .marquee-text { white-space: nowrap; display: inline-block; padding-left: 100%; animation: marquee-scroll 20s linear infinite; will-change: transform; }
        @keyframes marquee-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }

        /* Flip Card */
        #flipcard-section { padding-top: 0.5rem; }
        .flip-card-container { perspective: 1000px; padding: 0 1rem; }
        .flip-card-inner { position: relative; width: 100%; height: 100%; transition: transform 0.8s; transform-style: preserve-3d; }
        .flip-card-inner.flipping { animation: auto-flip 10s infinite ease-in-out; }
        .flip-card-front, .flip-card-back { position: absolute; width: 100%; height: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 1rem; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .flip-card-back { transform: rotateY(180deg); }
        .flip-card-front img, .flip-card-back img { width: 100%; height: 100%; object-fit: cover; }
        @keyframes auto-flip { 0%, 45% { transform: rotateY(0deg); } 50%, 95% { transform: rotateY(180deg); } 100% { transform: rotateY(0deg); } }
        
        /* === FINAL "JUST FOR YOU" SECTION STYLES === */
        #just-for-you-section { padding: 1.5rem 1rem; }
        .jfy-main-container { border-radius: 1rem; padding: 1rem; background-color: var(--bg-light); display: flex; flex-direction: column; aspect-ratio: 1080 / 1002; }
        .jfy-main-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem; flex-shrink: 0; }
        .jfy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; flex-grow: 1; min-height: 0; }
        
        .jfy-poster-card { border-radius: 1rem; overflow: hidden; position: relative; }
        .jfy-poster-slider-container { position: relative; width: 100%; height: 100%; }
        .jfy-poster-slider { display: flex; height: 100%; transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1); }
        .jfy-poster-slide { width: 100%; height: 100%; flex-shrink: 0; }
        .jfy-poster-slide img { width: 100%; height: 100%; object-fit: cover; }
        .jfy-slider-dots { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 10; }
        .jfy-slider-dots .dot { width: 6px; height: 6px; background: rgba(255, 255, 255, 0.5); border-radius: 50%; cursor: pointer; transition: all 0.3s ease; }
        .jfy-slider-dots .dot.active { background: white; transform: scale(1.2); }
        
        .jfy-deals-card { display: flex; flex-direction: column; gap: 0.75rem; }
        .jfy-main-product { background-color: white; border-radius: 0.75rem; overflow: hidden; position: relative; padding-top: 100%; }
        .jfy-main-product img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
        .jfy-sub-products { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; flex-grow: 1; }
        
        .jfy-sub-product-item { background-color: white; border-radius: 0.75rem; overflow: hidden; display: flex; flex-direction: column; text-decoration: none; }
        .jfy-sub-product-item .img-wrapper { width: 100%; aspect-ratio: 1 / 1; overflow: hidden; }
        .jfy-sub-product-item .img-wrapper img { width: 100%; height: 100%; object-fit: cover; }
        .jfy-sub-product-item .details { padding: 0.5rem; text-align: center; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
        .jfy-sub-product-item .name { font-size: 0.7rem; font-weight: 500; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .jfy-sub-product-item .discount { font-size: 0.75rem; font-weight: 600; color: #16a34a; margin-top: 0.125rem; }
        /* === END OF "JUST FOR YOU" SECTION STYLES === */

        .sponsor-card { border-radius: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.06); overflow: hidden; margin: 1.5rem; }
        
        /* Footer */
        #footer { position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); width: calc(100% - 2rem); max-width: 400px; background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15); border-radius: 50px; display: flex; justify-content: space-around; padding: 0.5rem; z-index: 100; }
        @media (min-width: 768px) { #footer { display: none; } }
        #footer a { flex: 1; display: flex; flex-direction: column; align-items: center; color: var(--text-light); padding: 0.5rem; border-radius: 50px; transition: color 0.3s, background-color 0.3s; text-decoration: none; }
        #footer a:hover, #footer a.active { color: var(--primary-color); background-color: rgba(79, 70, 229, 0.1); }
        #footer img { width: 24px; height: 24px; margin-bottom: 2px; }
        #footer span { font-size: 0.7rem; font-weight: 500; }
        #desktop-footer { display: none; }
        @media (min-width: 768px) { #desktop-footer { display: block; background-color: var(--bg-white); color: var(--text-light); padding: 3rem 2rem; border-top: 1px solid var(--border-color); } }
        .footer-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; }
        @media (min-width: 1024px) { .footer-grid { grid-template-columns: repeat(4, 1fr); } }
        .footer-column h3 { font-weight: 600; color: var(--text-dark); margin-bottom: 1rem; }
        .footer-column a { display: block; margin-bottom: 0.5rem; transition: color 0.3s; }
        .footer-column a:hover { color: var(--primary-color); }
        .footer-bottom { margin-top: 2rem; padding-top: 2rem; border-top: 1px solid var(--border-color); text-align: center; font-size: 0.9rem; }
        .social-media-links { position: fixed; bottom: 6rem; right: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; z-index: 99; transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55), opacity 0.3s ease; transform: translateY(20px) scale(0.9); opacity: 0; pointer-events: none; }
        .social-media-links.active { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }
        .social-link { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; color: white; box-shadow: 0 4px 14px rgba(0,0,0,0.15); transition: transform 0.3s ease; text-decoration: none; }
        .social-link:hover { transform: scale(1.1); }
        .social-link img { width: 28px; height: 28px; }
    </style>
</head>
<body class="bg-white">

    <header id="page-header" class="bg-white/80 backdrop-blur-sm shadow-sm py-1">
        <div class="container mx-auto flex justify-center items-center px-4">
            <img src="https://i.ibb.co/CpBR4gjN/20250708-142020.png" alt="Ramazone Logo" style="max-height: 40px;">
        </div>
    </header>

    <div id="search-container">
         <a id="search-link" href="./products.html?focus=true">
            <svg class="search-icon w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <span class="text-gray-500">Search for&nbsp;&nbsp;<span id="categoryText" class="text-gray-800 font-medium">Products...</span></span>
        </a>
    </div>

    <div class="slider-wrapper">
        <div class="slider-container">
            <div class="slider" id="main-slider"></div>
        </div>
        <div class="slider-dots" id="slider-dots-container"></div>
    </div>
    
    <main class="mb-28 md:mb-0">
        <section class="section-container reveal" id="normal-category-section">
            <!-- Content will be injected by renderNormalCategories JS function -->
        </section>

        <section class="festive-collection reveal" id="festive-collection-container">
            <h1 class="festival-headline" id="festive-headline">The Festive Collection</h1>
            <div class="product-slider" id="festive-product-slider"></div>
        </section>

        <div class="bg-yellow-400 text-center shadow-md reveal" id="info-marquee-section">
            <div class="marquee-viewport">
                <p class="font-bold text-gray-800 marquee-text" id="info-marquee-text">Loading announcement...</p>
            </div>
        </div>

        <section class="section-container reveal" id="flipcard-section">
             <div class="flip-card-container w-full aspect-[16/7]">
                <div class="flip-card-inner" id="flip-card-inner-content">
                    <!-- Flip card content injected by JS -->
                </div>
            </div>
        </section>

        <section class="reveal" id="just-for-you-section">
            <!-- "Just for you" content will be injected by JS -->
        </section>
        
        <section class="section-container reveal" id="highlighted-products-section">
            <h2 class="section-title">Deals of the Day</h2>
            <div id="highlighted-products-wrapper">
                <!-- Products injected by JavaScript -->
            </div>
        </section>

        <div class="sponsor-card reveal" id="dynamic-section-2"></div>

    </main>

    <div id="footer">
        <a href="./index.html" class="active">
            <img src="https://www.svgrepo.com/show/521156/home-4.svg" alt="Home"><span>Home</span>
        </a>
        <a href="./products.html" id="footer-shop-link">
            <img src="https://www.svgrepo.com/show/521847/shopping-cart.svg" alt="Shop"><span>Shop</span>
        </a>
        <a href="#" id="footer-play-link" target="_blank">
            <img src="https://www.svgrepo.com/show/391122/video-play.svg" alt="Play"><span>Play</span>
        </a>
        <a href="#" id="footer-profile-link" target="_blank">
            <img src="https://www.svgrepo.com/show/491787/cashback-ui-web.svg" alt="Profile"><span>Cashback</span>
        </a>
        <a href="#" onclick="toggleSocialMedia(event)">
            <img src="https://cdn-icons-png.flaticon.com/128/2326/2326024.png" alt="Follow"><span>Follow</span>
        </a>
    </div>
    
    <div class="social-media-links" id="social-links-container"></div>

    <footer id="desktop-footer">
        <div class="container mx-auto">
            <div class="footer-grid">
                <div class="footer-column">
                    <img src="https://i.ibb.co/CpBR4gjN/20250708-142020.png" alt="Ramazone Logo" class="h-10 mb-4">
                    <p>India's favorite online shopping destination.</p>
                </div>
                <div class="footer-column"><h3>Quick Links</h3><a href="#">About Us</a><a href="#">Contact Us</a></div>
                <div class="footer-column"><h3>Help</h3><a href="#">Payments</a><a href="#">Shipping</a><a href="#">FAQ</a></div>
                <div class="footer-column"><h3>Follow Us</h3><div id="desktop-social-links" class="flex gap-4"></div></div>
            </div>
            <div class="footer-bottom">&copy; <span id="copyright-year">2025</span> Ramazone. All Rights Reserved.</div>
        </div>
    </footer>

    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>

    <script>
        const firebaseConfig = {
            apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
            authDomain: "re-store-8e5b3.firebaseapp.com",
            databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "re-store-8e5b3",
            storageBucket: "re-store-8e5b3.appspot.com",
            messagingSenderId: "747691299697",
            appId: "1:747691299697:web:20dda42f47c7b39d495cd0"
        };
        
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                const database = firebase.database();
                loadDataFromFirebase(database);
            } catch (error) {
                console.error("Firebase initialization failed:", error);
                document.body.innerHTML = '<div style="text-align: center; padding: 50px;">Could not load page data.</div>';
            }
        });

        function loadDataFromFirebase(database) {
            const homepageRef = database.ref('ramazone/homepage');
            homepageRef.on('value', (snapshot) => {
                const data = snapshot.val() || {};
                const festiveProducts = (data.festiveCollection?.products || []).map((p, i) => ({...p, id: `festive-${i}`}));
                const highlightedProducts = (data.highlightedProducts || []).map((p, i) => ({...p, id: `highlighted-${i}`}));
                
                const allAvailableProducts = [...festiveProducts, ...highlightedProducts]
                    .filter((p, index, self) => p && p.id && index === self.findIndex((t) => t.id === p.id));

                renderSlider(data.slider);
                renderSearch(data.search);
                renderNormalCategories(data.normalCategories);
                renderFestiveCollection(data.festiveCollection);
                renderInfoMarquee(data.infoMarquee);
                renderFlipCardSection(data.flipCard);
                renderJustForYouSection(data.justForYou, allAvailableProducts);
                
                const dealsProducts = getDealsOfTheDayProducts(data.highlightedProducts, data.normalCategories, allAvailableProducts);
                renderHighlightedProducts(dealsProducts);

                renderDynamicSection('#dynamic-section-2', data.dynamicSection2);
                renderFooter(data.footer);
                document.getElementById('copyright-year').textContent = new Date().getFullYear();
            }, (error) => {
                 console.error("Firebase read failed: " + error.name);
            });
            setupScrollAnimations();
        }
        
        // Universal product card renderer
        function createProductCardHTML(prod) {
            if (!prod) return '';

            const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image';
            const ratingTag = prod.rating ? `<div class="product-rating-tag">${prod.rating} <i class="fas fa-star"></i></div>` : '';
            const offerTag = prod.offerText ? `<span class="product-offer-tag" style="color:${prod.offerTextColor || 'white'}; background-color:${prod.offerBackgroundColor || '#4F46E5'}">${prod.offerText}</span>` : '';

            let priceHTML = `<div class="product-price"><span class="display-price">₹${Number(prod.displayPrice).toLocaleString('en-IN')}</span></div>`;
            let discountHTML = '';

            if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
                const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
                priceHTML = `
                    <div class="product-price">
                        <span class="display-price">₹${Number(prod.displayPrice).toLocaleString('en-IN')}</span>
                        <span class="original-price">₹${Number(prod.originalPrice).toLocaleString('en-IN')}</span>
                    </div>`;
                discountHTML = `<p class="product-discount">${discount}% OFF</p>`;
            }

            return `
                <a href="./product-details.html?id=${prod.id}" class="product-card">
                    <div class="product-media-container">
                        <img src="${imageUrl}" alt="${prod.name || 'Product'}" loading="lazy">
                        ${ratingTag}
                        ${offerTag}
                    </div>
                    <div class="product-details">
                        <p class="product-name truncate">${prod.name || 'Product Name'}</p>
                        ${priceHTML}
                        ${discountHTML}
                    </div>
                </a>`;
        }

        function renderFestiveCollection(collectionData) {
            const container = document.getElementById('festive-collection-container');
            if (!container || !collectionData || !collectionData.products) { if(container) container.style.display = 'none'; return; }
            container.style.display = 'block';
            
            container.style.backgroundColor = collectionData.backgroundColor || 'var(--bg-light)';
            const headline = document.getElementById('festive-headline');
            headline.innerText = collectionData.title || 'Special Offers';
            headline.style.color = collectionData.headlineColor || 'var(--text-dark)';
            
            const slider = document.getElementById('festive-product-slider');
            slider.innerHTML = '';
            
            const productList = Array.isArray(collectionData.products) ? collectionData.products : Object.values(collectionData.products);
            slider.innerHTML = productList.map(createProductCardHTML).join('');
        }

        function renderHighlightedProducts(productsData) {
            const wrapper = document.getElementById('highlighted-products-wrapper');
            const section = document.getElementById('highlighted-products-section');
            if (!wrapper || !productsData || productsData.length === 0) {
                if(section) section.style.display = 'none';
                return;
            }
            section.style.display = 'block';
            wrapper.innerHTML = productsData.map(createProductCardHTML).join('');
        }

        function renderJustForYouSection(jfyData, allProducts) {
            const section = document.getElementById('just-for-you-section');
            if (!section || !jfyData) { if (section) section.style.display = 'none'; return; }

            const poster = jfyData.poster;
            const deals = jfyData.topDeals;

            const posterHTML = poster && poster.images && poster.images.length >= 3 ? `
                <a href="${poster.linkUrl || '#'}" class="jfy-poster-card">
                    <div class="jfy-poster-slider-container">
                         <div class="jfy-poster-slider">
                            ${poster.images.map(img => `<div class="jfy-poster-slide"><img src="${img}" alt="Poster Image"></div>`).join('')}
                         </div>
                         <div class="jfy-slider-dots"></div>
                    </div>
                </a>
            ` : '';
            
            const mainProduct = allProducts.find(p => p.id === deals?.mainProductId);
            const subProduct1 = allProducts.find(p => p.id === deals?.subProductIds?.[0]);
            const subProduct2 = allProducts.find(p => p.id === deals?.subProductIds?.[1]);

            let subProduct1Discount = '';
            if (subProduct1 && subProduct1.originalPrice && Number(subProduct1.originalPrice) > Number(subProduct1.displayPrice)) {
                subProduct1Discount = `<p class="discount">${Math.round(((subProduct1.originalPrice - subProduct1.displayPrice) / subProduct1.originalPrice) * 100)}% OFF</p>`;
            }
            let subProduct2Discount = '';
            if (subProduct2 && subProduct2.originalPrice && Number(subProduct2.originalPrice) > Number(subProduct2.displayPrice)) {
                subProduct2Discount = `<p class="discount">${Math.round(((subProduct2.originalPrice - subProduct2.displayPrice) / subProduct2.originalPrice) * 100)}% OFF</p>`;
            }

            const dealsHTML = deals && mainProduct && subProduct1 && subProduct2 ? `
                <div class="jfy-deals-card">
                    <a href="./product-details.html?id=${mainProduct.id}" class="jfy-main-product">
                        <img src="${(mainProduct.images && mainProduct.images[0]) || ''}" alt="${mainProduct.name}">
                    </a>
                    <div class="jfy-sub-products">
                        <a href="./product-details.html?id=${subProduct1.id}" class="jfy-sub-product-item">
                            <div class="img-wrapper"><img src="${(subProduct1.images && subProduct1.images[0]) || ''}" alt="${subProduct1.name}"></div>
                            <div class="details">
                                <p class="name">${subProduct1.name}</p>
                                ${subProduct1Discount}
                            </div>
                        </a>
                        <a href="./product-details.html?id=${subProduct2.id}" class="jfy-sub-product-item">
                           <div class="img-wrapper"><img src="${(subProduct2.images && subProduct2.images[0]) || ''}" alt="${subProduct2.name}"></div>
                           <div class="details">
                                <p class="name">${subProduct2.name}</p>
                                ${subProduct2Discount}
                            </div>
                        </a>
                    </div>
                </div>
            ` : '';
            
            if(posterHTML && dealsHTML) {
                section.innerHTML = `
                    <div class="jfy-main-container" style="background-color: ${jfyData.backgroundColor || 'var(--bg-light)'};">
                        <h2 class="jfy-main-title">${jfyData.title || 'Just for you'}</h2>
                        <div class="jfy-grid">
                            ${posterHTML}
                            ${dealsHTML}
                        </div>
                    </div>`;
                section.style.display = 'block';
                initializeJfySlider(poster.images.length);
            } else {
                section.style.display = 'none';
            }
        }

        function renderFooter(footerData) {
            if (!footerData) return;
            document.getElementById('footer-shop-link').href = './products.html';
            document.getElementById('footer-play-link').href = footerData.playLink || '#';
            document.getElementById('footer-profile-link').href = footerData.profileLink || '#';

            const followLinks = footerData.followLinks;
            if (followLinks && typeof followLinks === 'object') {
                const mobileLinksContainer = document.getElementById('social-links-container');
                const desktopLinksContainer = document.getElementById('desktop-social-links');
                mobileLinksContainer.innerHTML = '';
                desktopLinksContainer.innerHTML = '';
                const socialPlatforms = {
                    youtube: { icon: 'https://www.svgrepo.com/show/416500/youtube-circle-logo.svg', color: '#FF1111' },
                    instagram: { icon: 'https://www.svgrepo.com/show/452229/instagram-1.svg', color: '#E4405F' },
                    facebook: { icon: 'https://www.svgrepo.com/show/448224/facebook.svg', color: '#1877F2' },
                    whatsapp: { icon: 'https://www.svgrepo.com/show/452133/whatsapp.svg', color: '#25D366' }
                };
                Object.keys(socialPlatforms).forEach(key => {
                    const platform = socialPlatforms[key];
                    const url = followLinks[key];
                    if (url) {
                        const mobileLink = `<a href="${url}" target="_blank" class="social-link" style="background-color: ${platform.color};" title="${key.charAt(0).toUpperCase() + key.slice(1)}"><img src="${platform.icon}" alt="${key}"></a>`;
                        const desktopLink = `<a href="${url}" target="_blank" class="text-gray-500 hover:text-indigo-600 transition-colors" title="${key.charAt(0).toUpperCase() + key.slice(1)}"><img src="${platform.icon}" class="w-7 h-7" alt="${key}"></a>`;
                        mobileLinksContainer.innerHTML += mobileLink;
                        desktopLinksContainer.innerHTML += desktopLink;
                    }
                });
            }
        }

        function renderSlider(sliderData) {
            const slider = document.getElementById('main-slider');
            if (!slider || !sliderData) return;
            slider.innerHTML = sliderData.map(slide => `
                <a href="${slide.linkUrl || '#'}" class="slide" target="_blank">
                    ${slide.videoUrl 
                        ? `<video src="${slide.videoUrl}" autoplay muted loop playsinline></video>` 
                        : `<picture>
                                <source media="(min-width: 768px)" srcset="${slide.imageUrlDesktop || slide.imageUrlMobile || ''}">
                                <img src="${slide.imageUrlMobile || slide.imageUrlDesktop || ''}" alt="Promotional banner" loading="lazy">
                           </picture>`
                    }
                </a>
            `).join('');
            initializeSlider(sliderData.length);
        }
        
        function renderNormalCategories(categories) {
            const section = document.getElementById('normal-category-section');
            if (!section || !Array.isArray(categories)) return;

            section.innerHTML = `
                <div class="category-master-scroller">
                    <div class="category-rows-container">
                        <div id="top-category-row" class="category-row"></div>
                        <div id="bottom-category-row" class="category-row"></div>
                    </div>
                </div>
            `;

            const topWrapper = document.getElementById('top-category-row');
            const bottomWrapper = document.getElementById('bottom-category-row');

            const topCategories = categories.filter(cat => cat && cat.row === 'top');
            const bottomCategories = categories.filter(cat => cat && cat.row !== 'top');

            const renderCategoryHTML = (cat) => {
                const cardClass = cat.size === 'double' ? 'category-card--double' : '';
                const href = (cat.size === 'double' && cat.linkUrl) 
                    ? cat.linkUrl 
                    : `./products.html?category=${encodeURIComponent(cat.name)}`;
                const target = (cat.size === 'double' && cat.linkUrl) ? '_blank' : '';

                return `
                    <a href="${href}" target="${target}" class="category-card ${cardClass}">
                        <div class="img-wrapper">
                            <img src="${cat.imageUrl}" alt="${cat.name}" loading="lazy">
                        </div>
                        <p class="category-name">${cat.name}</p>
                    </a>
                `;
            };

            topWrapper.innerHTML = topCategories.map(renderCategoryHTML).join('');
            bottomWrapper.innerHTML = bottomCategories.map(renderCategoryHTML).join('');
        }
        
        function renderFlipCardSection(flipCardData) {
            const section = document.getElementById('flip-card-inner-content');
            if (!section || !flipCardData || !flipCardData.front || !flipCardData.back) {
                document.getElementById('flipcard-section').style.display = 'none';
                return;
            }
            document.getElementById('flipcard-section').style.display = 'block';
            section.innerHTML = `
                <a href="${flipCardData.front.linkUrl || '#'}" target="_blank" class="flip-card-front">
                    <img src="${flipCardData.front.imageUrl}" alt="Front of card" loading="lazy">
                </a>
                <a href="${flipCardData.back.linkUrl || '#'}" target="_blank" class="flip-card-back">
                    <img src="${flipCardData.back.imageUrl}" alt="Back of card" loading="lazy">
                </a>
            `;
            section.classList.add('flipping');
        }
        
        function getDealsOfTheDayProducts(highlightedFromDB, categories, allProducts) {
            const MAX_PRODUCTS = 18;
            let deals = [];
            const usedProductIds = new Set();

            const getScore = (p) => {
                const discount = (parseFloat(p.originalPrice) || parseFloat(p.displayPrice)) - (parseFloat(p.displayPrice) || 0);
                const rating = parseFloat(p.rating) || 0;
                const hasOffer = p.offerText ? 50 : 0;
                return (discount * 0.7) + (rating * 10) + hasOffer;
            };

            if (categories && Array.isArray(categories)) {
                for (const category of categories) {
                    const productsInCategory = allProducts.filter(p => p.category === category.name);
                    if (productsInCategory.length > 0) {
                        productsInCategory.sort((a, b) => getScore(b) - getScore(a));
                        const bestProduct = productsInCategory[0];
                        if (bestProduct && !usedProductIds.has(bestProduct.id)) {
                            deals.push(bestProduct);
                            usedProductIds.add(bestProduct.id);
                        }
                    }
                }
            }

            if (deals.length < MAX_PRODUCTS) {
                const remainingProducts = allProducts.filter(p => !usedProductIds.has(p.id));
                remainingProducts.sort((a, b) => getScore(b) - getScore(a));
                const needed = MAX_PRODUCTS - deals.length;
                deals.push(...remainingProducts.slice(0, needed));
            }

            return deals.slice(0, MAX_PRODUCTS);
        }

        function renderDynamicSection(selector, data) {
            const container = document.querySelector(selector);
            if (!container || !data || !data.imageUrl) { if (container) container.style.display = 'none'; return; }
            container.style.display = 'block';
            container.innerHTML = `<a href="${data.linkUrl||'#'}" target="_blank"><img src="${data.imageUrl}" alt="${data.title||'Dynamic Content'}" loading="lazy"></a>`;
        }
        function renderInfoMarquee(text) {
            const section = document.getElementById('info-marquee-section');
            if (!text) { 
                if(section) section.style.display = 'none'; 
                return; 
            }
            section.style.display = 'block';
            section.querySelector('#info-marquee-text').innerHTML = text;
        }
        function renderSearch(searchData) {
            if (!searchData || !searchData.scrollingTexts) return;
            const texts = searchData.scrollingTexts;
            if (texts.length > 0) {
                let i = 0;
                const element = document.getElementById("categoryText");
                if (window.searchInterval) clearInterval(window.searchInterval);
                window.searchInterval = setInterval(() => { 
                    if (element) {
                        element.style.opacity = 0;
                        setTimeout(() => {
                            element.innerText = texts[i];
                            element.style.opacity = 1;
                            i = (i + 1) % texts.length;
                        }, 300);
                    }
                }, 2500);
            }
        }

        // --- SLIDER LOGIC ---
        let currentSlide = 1, totalSlides = 0, sliderInterval, isTransitioning = false;
        const SLIDER_INTERVAL_MS = 5000;
        
        function initializeSlider(count) {
            const slider = document.getElementById('main-slider');
            const dotsContainer = document.getElementById('slider-dots-container');
            totalSlides = count;
            if (totalSlides <= 1) { if(dotsContainer) dotsContainer.style.display = 'none'; return; };
            const firstClone = slider.children[0].cloneNode(true);
            const lastClone = slider.children[totalSlides - 1].cloneNode(true);
            slider.appendChild(firstClone);
            slider.insertBefore(lastClone, slider.children[0]);
            slider.style.transform = `translateX(-${currentSlide * 100}%)`;
            slider.addEventListener('transitionend', () => {
                isTransitioning = false;
                if (currentSlide === 0) { slider.classList.remove('transitioning'); currentSlide = totalSlides; slider.style.transform = `translateX(-${currentSlide * 100}%)`; }
                if (currentSlide === totalSlides + 1) { slider.classList.remove('transitioning'); currentSlide = 1; slider.style.transform = `translateX(-${currentSlide * 100}%)`; }
            });
            dotsContainer.innerHTML = '';
            for (let i = 0; i < totalSlides; i++) { dotsContainer.innerHTML += `<div class="dot" data-slide="${i+1}"><div class="timer"></div></div>`; }
            dotsContainer.addEventListener('click', e => { if(e.target.closest('.dot')) { goToSlide(e.target.closest('.dot').dataset.slide); } });
            updateDots();
            resetSliderInterval();
        }
        function moveSlide(direction) { if (isTransitioning) return; isTransitioning = true; document.getElementById('main-slider').classList.add('transitioning'); currentSlide += direction; document.getElementById('main-slider').style.transform = `translateX(-${currentSlide * 100}%)`; updateDots(); resetSliderInterval(); }
        function goToSlide(slideNumber) { if (isTransitioning || currentSlide == slideNumber) return; isTransitioning = true; document.getElementById('main-slider').classList.add('transitioning'); currentSlide = parseInt(slideNumber); document.getElementById('main-slider').style.transform = `translateX(-${currentSlide * 100}%)`; updateDots(); resetSliderInterval(); }
        function updateDots() {
            const dots = document.querySelectorAll('.slider-dots .dot');
            dots.forEach(dot => { dot.classList.remove('active'); dot.querySelector('.timer').style.transition = 'none'; dot.querySelector('.timer').style.width = '0%'; });
            let activeDotIndex = currentSlide - 1;
            if (currentSlide === 0) activeDotIndex = totalSlides - 1;
            if (currentSlide === totalSlides + 1) activeDotIndex = 0;
            const activeDot = dots[activeDotIndex];
            if(activeDot) { activeDot.classList.add('active'); void activeDot.querySelector('.timer').offsetWidth; activeDot.querySelector('.timer').style.transition = `width var(--slider-interval-duration) linear`; activeDot.querySelector('.timer').style.width = '100%'; }
        }
        function nextSlide() { moveSlide(1); }
        function resetSliderInterval() { clearInterval(sliderInterval); sliderInterval = setInterval(nextSlide, SLIDER_INTERVAL_MS); }

        // --- JFY SLIDER LOGIC ---
        let jfyCurrentSlide = 0, jfyTotalSlides = 0, jfySliderInterval;
        function initializeJfySlider(count) {
            jfyTotalSlides = count;
            if (jfyTotalSlides <= 1) return;
            const dotsContainer = document.querySelector('.jfy-slider-dots');
            dotsContainer.innerHTML = '';
            for (let i = 0; i < jfyTotalSlides; i++) {
                dotsContainer.innerHTML += `<div class="dot" data-slide="${i}"></div>`;
            }
            updateJfyDots();
            resetJfySliderInterval();
        }
        function updateJfyDots() {
            const dots = document.querySelectorAll('.jfy-slider-dots .dot');
            dots.forEach(dot => dot.classList.remove('active'));
            if(dots[jfyCurrentSlide]) dots[jfyCurrentSlide].classList.add('active');
        }
        function nextJfySlide() {
            jfyCurrentSlide = (jfyCurrentSlide + 1) % jfyTotalSlides;
            const slider = document.querySelector('.jfy-poster-slider');
            if(slider) slider.style.transform = `translateX(-${jfyCurrentSlide * 100}%)`;
            updateJfyDots();
        }
        function resetJfySliderInterval() {
            clearInterval(jfySliderInterval);
            jfySliderInterval = setInterval(nextJfySlide, 4000);
        }

        // --- GENERAL ---
        function toggleSocialMedia(event) { event.preventDefault(); document.getElementById('social-links-container').classList.toggle('active'); }
        function setupScrollAnimations() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
        }
    </script>
</body>
</html>

