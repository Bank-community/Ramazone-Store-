// product-details-main.js
// VERSION: SUPERSONIC V2 (Instant Load + Background Sync)

// --- GLOBAL STATE ---
let currentProductData = null, currentProductId = null;
let allProductsCache = [];
let currentProductGroup = []; // Stores all variants
let selectedVariants = {}; 
let selectedPack = null; 
let database;
let goToCartNotificationTimer = null; 

// --- GLOBAL VARIABLES FOR INFINITE SCROLL ---
let allSameCategoryProducts = []; 
let displayedProductCount = 0;
let isLoadingMore = false; 

// --- CONFIG ---
const CACHE_KEY_DATA = "RAMAZONE_DATA_V2"; // Shared Cache Key with Products Page

// --- 1. SUPERSONIC INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // A. First: Try to load immediately from Cache
    const loadedFromCache = loadFromCache();
    
    // B. Second: Initialize Firebase (Network) to refresh data
    initializeApp(loadedFromCache);
});

function loadFromCache() {
    try {
        const cachedData = localStorage.getItem(CACHE_KEY_DATA);
        if (cachedData) {
            console.log("🚀 Supersonic: Details Loaded from Cache");
            const data = JSON.parse(cachedData);
            
            // Process Cached Data
            processGlobalData(data);
            
            // Attempt to Render Product immediately
            if (performProductLookup()) {
                return true; // Successfully rendered from cache
            }
        }
    } catch (e) {
        console.error("Cache Read Error", e);
    }
    return false;
}

// --- 2. FIREBASE & NETWORK SYNC ---
async function initializeApp(hasLoadedFromCache) {
    try {
        // Show loader ONLY if cache failed
        if (!hasLoadedFromCache) {
            document.getElementById('loading-indicator').style.display = 'block';
        }

        const firebaseConfig = {
            apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
            authDomain: "re-store-8e5b3.firebaseapp.com",
            databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
        };

        if (window.firebase && firebaseConfig.apiKey) {
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            database = firebase.database();
            
            // Fetch Fresh Data & Update Cache
            fetchFreshData();
        } else {
             // Fallback if firebase lib not loaded yet (rare race condition)
             setTimeout(() => initializeApp(hasLoadedFromCache), 500);
        }
    } catch (error) {
        console.error("Init Failed:", error);
        if(!hasLoadedFromCache) {
            document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Connection Failed.</p>';
        }
    }
}

function fetchFreshData() {
    // Using .on() for realtime updates or .get() for one-time
    database.ref('ramazone').get().then((snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            
            // 1. Silent Update: Save to Cache for next time
            localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
            
            // 2. Process Fresh Data
            processGlobalData(data);
            
            // 3. Re-Render (Only if critical data changed, mostly silent refresh)
            performProductLookup(true); // true forceUpdate
        }
    }).catch(err => console.error("Network Fetch Error:", err));
}

// Helper: Process raw firebase data into global variables
function processGlobalData(data) {
    const appThemeColor = data.config?.themeColor || '#4F46E5';
    document.documentElement.style.setProperty('--primary-color', appThemeColor);
    
    const allProds = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
    allProductsCache = allProds.filter(p => p && p.isVisible !== false);
}

// Helper: Find Product & Trigger UI Render
function performProductLookup(isRefresh = false) {
    currentProductId = new URLSearchParams(window.location.search).get('id')?.trim();
    
    if (!currentProductId) { 
        if(!isRefresh) document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product ID not found.</p>'; 
        return false; 
    }
    
    const product = allProductsCache.find(p => p && p.id == currentProductId);
    
    if (product) {
        currentProductData = product;
        currentProductGroup = product.groupId ? allProductsCache.filter(p => p.groupId === product.groupId) : [product];
        
        // If refreshing, we only update if user isn't interacting deeply (simple check)
        // For now, we just update everything to ensure price/stock is fresh
        loadProductPage(product);
        return true;
    } else {
        if(!isRefresh) document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product not found.</p>';
        return false;
    }
}

function loadProductPage(data) {
    try {
        populateDataAndAttachListeners(data);
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('product-content').style.display = 'block';
    } catch (error) {
        console.error("Error loading page:", error);
    }
}

// --- ORCHESTRATION: Connecting Data to UI ---
function populateDataAndAttachListeners(data) {
    currentProductData = data;
    currentProductId = data.id;

    // Basic Info
    document.title = `${data.name} - Ramazone`;
    let displayTitle = data.name;
    if (data.netQuantity && data.unitType) {
        displayTitle += ` ${data.netQuantity} ${data.unitType}`;
    }
    document.getElementById("product-title").textContent = displayTitle;

    // Brand Info
    if (data.brand) {
        document.getElementById('brand-name-text').textContent = data.brand;
        document.getElementById('visit-store-link').href = `visit-store.html?brand=${encodeURIComponent(data.brand)}`;
        document.getElementById('brand-info-container').classList.remove('hidden');
    }

    // CALLING UI RENDERERS
    window.renderMediaGallery(data);
    
    if (data.rating) {
        document.getElementById("rating-section").style.display = "flex";
        window.renderStars(data.rating, document.getElementById("product-rating-stars"));
        document.getElementById("product-review-count").textContent = `(${data.reviewCount || 0} reviews)`;
    }
    
    if (data.sellerName) {
        const sellerEl = document.getElementById("seller-info");
        sellerEl.textContent = `Seller by: ${data.sellerName}`;
        sellerEl.style.display = "block";
    }

    // Variants
    selectedVariants = {};
    const getAttrs = (p) => (p.attributes || (p.variantType ? [{type: p.variantType, value: p.variantValue}] : []));
    getAttrs(data).forEach(a => selectedVariants[a.type] = a.value);
    selectedPack = null;

    // Update Price & Variants UI
    window.updatePriceDisplay(data, selectedPack, { final: "price-final", original: "price-original", discount: "price-percentage-discount" });
    window.renderVariantSelectors(data, currentProductGroup);
    window.renderComboPacks(data);
    window.renderProductBundles(data, allProductsCache);
    window.renderTechSpecs(data.techSpecs);
    window.renderAdvancedHighlights(data.specHighlights);
    window.renderDescription(data);

    setupActionControls();
    updateStickyActionBar();
    loadHandpickedSimilarProducts(data.category, data.subcategory, data.id);
    initMergedCategoryGrid(data.category); 
    setupInfiniteScroll(); 
    updateRecentlyViewed(data.id);
    updateCartIcon();
    setupHeaderScrollEffect();
}

// --- CART FUNCTIONS (Standard) ---
const getCart = () => { try { const cart = localStorage.getItem('ramazoneCart'); return cart ? JSON.parse(cart) : []; } catch (e) { return []; } };
const saveCart = (cart) => { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); };

const packsMatch = (p1, p2) => {
    if (!p1 && !p2) return true;
    if (!p1 || !p2) return false;
    return p1.name === p2.name;
};

const getCartItem = (productId, variants, pack) => {
    const cart = getCart();
    return cart.find(item => !item.isBundle && item.id === productId && packsMatch(item.pack, pack));
};

function addToCart(productId, quantity, variants, pack, showToastMsg = true) {
    const cart = getCart();
    const product = allProductsCache.find(p => p && p.id === productId);
    if (!product) return;

    let existingItemIndex = cart.findIndex(item => !item.isBundle && item.id === productId && packsMatch(item.pack, pack));

    if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += quantity;
    } else {
        cart.push({ id: productId, quantity: quantity, variants: variants || {}, pack: pack || null });
    }
    saveCart(cart);
    if(showToastMsg) {
        window.showToast(`${product.name} ${pack ? `(${pack.name})` : ''} added to cart!`, 'success');
        showGoToCartNotification();
    }
    updateCartIcon();
}

function addBundleToCart(productIds, bundlePrice) {
    const cart = getCart();
    const bundleProducts = productIds.map(id => allProductsCache.find(p => p.id === id)).filter(Boolean);
    if (bundleProducts.length !== productIds.length) {
        window.showToast('One of the bundle products is unavailable.', 'error');
        return;
    }
    const bundleId = `BUNDLE_${productIds.sort().join('_')}`;
    const existingBundleIndex = cart.findIndex(item => item.isBundle && item.bundleId === bundleId);
    if (existingBundleIndex > -1) {
        cart[existingBundleIndex].quantity += 1;
    } else {
        cart.push({
            isBundle: true,
            bundleId: bundleId,
            bundleName: bundleProducts.map(p => p.name).join(' + '),
            quantity: 1,
            bundlePrice: Number(bundlePrice),
            items: bundleProducts.map(p => ({ id: p.id, name: p.name, image: p.images?.[0] || '' }))
        });
    }
    saveCart(cart);
    window.showToast('Bundle added to cart!', 'success');
    showGoToCartNotification();
    updateCartIcon();
}

function updateCartIcon() {
    const totalQuantity = (() => { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); })();
    const cartCountElement = document.getElementById('cart-item-count');
    if (cartCountElement) cartCountElement.textContent = totalQuantity > 0 ? totalQuantity : '';
}

function showGoToCartNotification() {
    const notification = document.getElementById('go-to-cart-notification');
    const summaryEl = document.getElementById('notification-cart-summary');
    if (!notification || !summaryEl) return;
    clearTimeout(goToCartNotificationTimer);
    const totalQuantity = (() => { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); })();
    summaryEl.textContent = `${totalQuantity} item${totalQuantity > 1 ? 's' : ''} in cart`;
    notification.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
    notification.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    goToCartNotificationTimer = setTimeout(() => {
        notification.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        notification.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }, 3000);
}

// --- UI EVENT LISTENERS & HELPERS ---
function setupActionControls() { 
    setupShareButton(); 
    document.getElementById('options-container').onclick = handleOptionsClick;
    document.getElementById('similar-products-container-wrapper').onclick = handleQuickAdd;
}

function handleOptionsClick(event) {
    const bundleAddBtn = event.target.closest('.final-bundle-plus-btn');
    const comboCard = event.target.closest('.combo-pack-card');

    if (bundleAddBtn) {
        const card = bundleAddBtn.closest('.product-bundle-card');
        addBundleToCart(card.dataset.productIds.split(','), card.dataset.price);
        return;
    }

    if (comboCard) {
        const container = comboCard.closest('.combo-pack-grid');
        const isSelected = comboCard.classList.contains('selected');
        container.querySelectorAll('.combo-pack-card').forEach(c => c.classList.remove('selected'));
        
        if (isSelected) {
            selectedPack = null;
        } else {
            comboCard.classList.add('selected');
            selectedPack = { name: comboCard.dataset.value, price: comboCard.dataset.price };
        }
        window.updatePriceDisplay(currentProductData, selectedPack, { final: "price-final", original: "price-original", discount: "price-percentage-discount" });
        updateStickyActionBar();
    }
}

function updateStickyActionBar() {
    if (!currentProductId || !currentProductData) return;
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    const buyNowBtn = document.getElementById('buy-now-btn');
    const stickyPriceText = document.getElementById('sticky-price-text');

    const currentPrice = selectedPack ? selectedPack.price : currentProductData.displayPrice;
    if (stickyPriceText) stickyPriceText.textContent = `at ₹${Number(currentPrice).toLocaleString('en-IN')}`;

    addToCartBtn.onclick = (e) => {
        e.preventDefault();
        addToCartBtn.innerHTML = '<i class="fas fa-check text-green-600"></i>';
        setTimeout(() => addToCartBtn.innerHTML = '<i class="fas fa-cart-plus"></i>', 1500);
        addToCart(currentProductId, 1, selectedVariants, selectedPack);
    };

    buyNowBtn.onclick = (e) => {
        e.preventDefault();
        addToCart(currentProductId, 1, selectedVariants, selectedPack, false); 
        window.location.href = 'order.html';
    };
}

// Fixed Share Logic (HTTP Compatible)
function setupShareButton() {
    const oldBtn = document.getElementById("share-button");
    if(!oldBtn) return;
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    
    ['touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach(evt => {
        newBtn.addEventListener(evt, (e) => { e.stopPropagation(); }, { passive: false });
    });

    newBtn.addEventListener("click", async (e) => {
        e.preventDefault(); 
        if (!currentProductData) return;
        const shareUrl = window.location.href; 
        const shareData = { title: currentProductData.name, text: `Check out ${currentProductData.name}`, url: shareUrl };
        
        try { if (navigator.share) { await navigator.share(shareData); return; } } catch (err) {}
        try { await navigator.clipboard.writeText(shareUrl); window.showToast("Link copied!", "success"); } 
        catch (err) { 
            try { unsecuredCopyToClipboard(shareUrl); } catch(fErr) { window.showToast("Share failed.", "error"); }
        }
    });
}
function unsecuredCopyToClipboard(text) { const t = document.createElement("textarea"); t.value = text; t.style.position="fixed"; t.style.left="-9999px"; document.body.appendChild(t); t.focus(); t.select(); try { document.execCommand('copy'); window.showToast("Link copied!", "success"); } catch(e){} document.body.removeChild(t); }

// --- HEADER SCROLL & OTHERS ---
function setupHeaderScrollEffect() {
    const defaultHeader = document.getElementById('default-header-content');
    const searchHeader = document.getElementById('search-header-content');
    if (!defaultHeader || !searchHeader) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            if (!defaultHeader.classList.contains('header-hidden')) {
                defaultHeader.classList.add('header-hidden');
                searchHeader.classList.remove('hidden'); searchHeader.classList.remove('header-hidden');
            }
        } else {
            if (defaultHeader.classList.contains('header-hidden')) {
                defaultHeader.classList.remove('header-hidden');
                searchHeader.classList.add('header-hidden');
                setTimeout(() => { if (window.scrollY <= 50) searchHeader.classList.add('hidden'); }, 300);
            }
        }
    }, { passive: true });
}

window.handleVariantChange = (newProductId) => {
    if (newProductId === currentProductId) return;
    const overlay = document.getElementById('variant-loading-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const newProductData = currentProductGroup.find(p => p.id === newProductId);
    if (newProductData) {
        setTimeout(() => {
            const newUrl = `${window.location.pathname}?id=${newProductId}`;
            window.history.pushState({ path: newUrl }, '', newUrl);
            populateDataAndAttachListeners(newProductData);
            if (overlay) overlay.classList.add('hidden');
        }, 300);
    }
};
window.addEventListener('popstate', performProductLookup);

function handleQuickAdd(event) {
    const btn = event.target.closest('.quick-add-btn');
    if (btn) {
        event.preventDefault();
        const pid = btn.dataset.id;
        addToCart(pid, 1, {}, null);
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.classList.add('added');
        setTimeout(() => { btn.innerHTML = '+'; btn.classList.remove('added'); }, 1500);
    }
}

// --- Recently Viewed & Infinite Scroll UI Generators ---
function updateRecentlyViewed(newId) { 
    let viewedIds = JSON.parse(localStorage.getItem("ramazoneRecentlyViewed")) || []; 
    viewedIds = viewedIds.filter(e => e !== newId); 
    viewedIds.unshift(newId); 
    localStorage.setItem("ramazoneRecentlyViewed", JSON.stringify(viewedIds.slice(0, 10))); 
    loadRecentlyViewed(viewedIds); 
}

function createCardHTML(product, type, showFloatingBtn = true) {
    const price = Number(product.displayPrice).toLocaleString("en-IN");
    const discount = Number(product.originalPrice) > Number(product.displayPrice) ? Math.round(((Number(product.originalPrice) - Number(product.displayPrice)) / Number(product.originalPrice)) * 100) : 0;
    const isBestSeller = (product.rating && product.rating >= 4.5);
    const badgeHTML = isBestSeller ? '<div class="best-seller-badge">Best Seller</div>' : '';
    const btnHTML = showFloatingBtn ? `<button class="quick-add-btn" data-id="${product.id}">+</button>` : '';
    
    if (type === 'grid') {
        return `<div class="block bg-white rounded-lg shadow overflow-hidden relative transform transition hover:scale-[1.02]">
            ${badgeHTML}
            <div class="portrait-img-container"><a href="?id=${product.id}" class="block"><img src="${product.images?.[0]}"></a>${btnHTML}</div><div class="p-2"><h4 class="text-sm font-semibold truncate">${product.name}</h4><div class="flex items-baseline gap-2"><p class="font-bold">₹${price}</p>${discount > 0 ? `<p class="text-xs text-green-600">${discount}% OFF</p>` : ''}</div></div></div>`;
    }
    return `<div class="carousel-item block bg-white rounded-lg shadow overflow-hidden relative">${badgeHTML}<div class="portrait-img-container"><a href="?id=${product.id}" class="block"><img src="${product.images?.[0]}"></a>${btnHTML}</div><div class="p-2"><h4 class="text-sm font-semibold truncate">${product.name}</h4><div class="flex items-baseline gap-2"><p class="font-bold">₹${price}</p></div></div></div>`;
}

function loadRecentlyViewed(viewedIds) { 
    const container = document.getElementById("recently-viewed-container");
    if(!container) return;
    container.innerHTML = "";
    let count = 0;
    viewedIds.forEach(id => {
        if(id == currentProductId) return;
        const p = allProductsCache.find(x => x.id == id);
        if(p) { container.innerHTML += createCardHTML(p, 'carousel', true); count++; }
    });
    document.getElementById("recently-viewed-section").style.display = count > 0 ? "block" : "none";
}

function loadHandpickedSimilarProducts(cat, subcat, pid) {
    const container = document.getElementById("handpicked-similar-container");
    if(!container) return;
    container.innerHTML = "";
    const sims = allProductsCache.filter(p => p.category === cat && p.subcategory === subcat && p.id !== pid).slice(0, 6);
    if(sims.length === 0) { document.getElementById("handpicked-similar-section").style.display="none"; return; }
    sims.forEach(p => {
        const price = Number(p.displayPrice).toLocaleString("en-IN");
        container.innerHTML += `<div class="ramazone-final-yml-wrapper"><div class="ramazone-final-yml-card"><a href="?id=${p.id}" class="card-link-area"><div class="image-container"><img src="${p.images[0]}"></div><div class="details-container"><h4 class="product-name">${p.name}</h4><div class="price-container"><span class="price-highlight">₹${price}</span></div></div></a><div class="button-container"><button class="yml-add-button quick-add-btn" data-id="${p.id}">Add</button></div></div></div>`;
    });
    document.getElementById("handpicked-similar-section").style.display = "block";
}

function initMergedCategoryGrid(cat) {
    const container = document.getElementById("other-products-container");
    if(!container) return;
    container.innerHTML = ""; 
    allSameCategoryProducts = allProductsCache.filter(p => p.category === cat && p.id != currentProductId);
    displayedProductCount = 0;
    loadNextBatch(8); 
    document.getElementById("other-products-section").style.display = allSameCategoryProducts.length > 0 ? "block" : "none";
}

function loadNextBatch(count) {
    const container = document.getElementById("other-products-container");
    const loader = document.getElementById("infinite-scroll-loader");
    const nextBatch = allSameCategoryProducts.slice(displayedProductCount, displayedProductCount + count);
    if (nextBatch.length === 0) { if(loader) loader.style.display = 'none'; return; }
    nextBatch.forEach(p => { const showBtn = Number(p.displayPrice) < 50; container.insertAdjacentHTML('beforeend', createCardHTML(p, 'grid', showBtn)); });
    displayedProductCount += nextBatch.length;
    isLoadingMore = false; 
    if(loader) loader.style.display = 'none';
}

function setupInfiniteScroll() {
    const section = document.getElementById("other-products-section");
    const loader = document.getElementById("infinite-scroll-loader");
    if(!section) return;
    window.addEventListener('scroll', () => {
        if (isLoadingMore || displayedProductCount >= allSameCategoryProducts.length) return;
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 400) {
            isLoadingMore = true;
            if(loader) loader.style.display = 'block'; 
            setTimeout(() => { loadNextBatch(6); }, 1000);
        }
    }, { passive: true });
}

