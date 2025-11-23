// product-details-main.js
// SUPERSONIC V3.1 - Split Bottom Bar & Price Update Logic

// --- GLOBAL STATE ---
let currentProductData = null, currentProductId = null;
let allProductsCache = [];
let currentProductGroup = []; 
let selectedVariants = {}; 
let selectedPack = null; 
let database;
let goToCartNotificationTimer = null; 

const CACHE_KEY_DATA = "RAMAZONE_DATA_V2";

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    currentProductId = params.get('id');
    if (!currentProductId) { window.location.href = 'index.html'; return; }

    loadFromCache(currentProductId);
    initializeFirebase();
    updateCartIcon();
    setupHeaderScrollEffect();
});

// --- CACHE LOADER ---
function loadFromCache(pid) {
    try {
        const cachedData = localStorage.getItem(CACHE_KEY_DATA);
        if (cachedData) {
            const data = JSON.parse(cachedData);
            let products = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
            allProductsCache = products.filter(p => p && p.isVisible !== false);
            
            const product = allProductsCache.find(p => p.id == pid);
            if (product) loadProductPage(product);
        }
    } catch (e) { console.error(e); }
}

// --- FIREBASE ---
function initializeFirebase() {
    if (window.firebase && !firebase.apps.length) {
        firebase.initializeApp({
            apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
            authDomain: "re-store-8e5b3.firebaseapp.com",
            databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
        });
        database = firebase.database();
        fetchFreshData();
    } else if (window.firebase) {
        database = firebase.database();
        fetchFreshData();
    } else { setTimeout(initializeFirebase, 50); }
}

function fetchFreshData() {
    database.ref('ramazone').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
            let products = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
            allProductsCache = products.filter(p => p && p.isVisible !== false);
            if (!currentProductData) {
                const product = allProductsCache.find(p => p.id == currentProductId);
                if (product) loadProductPage(product);
            }
        }
    });
}

// --- RENDER TRIGGER ---
function loadProductPage(data) {
    currentProductData = data;
    currentProductGroup = data.groupId ? allProductsCache.filter(p => p.groupId === data.groupId) : [data];
    
    populateDataAndAttachListeners(data);
    
    document.getElementById('loading-indicator').style.display = 'none';
    document.getElementById('product-content').style.display = 'block';
}

function populateDataAndAttachListeners(data) {
    currentProductData = data;
    currentProductId = data.id;
    document.title = data.name;
    
    let displayTitle = data.name;
    if (data.netQuantity && data.unitType) displayTitle += ` ${data.netQuantity} ${data.unitType}`;
    document.getElementById("product-title").textContent = displayTitle;

    if (data.brand) {
        document.getElementById('brand-name-text').textContent = data.brand;
        document.getElementById('visit-store-link').href = `visit-store.html?brand=${encodeURIComponent(data.brand)}`;
        document.getElementById('brand-info-container').classList.remove('hidden');
    }

    window.renderMediaGallery(data);
    
    if (data.rating) {
        document.getElementById("rating-section").style.display = "flex";
        window.renderStars(data.rating, document.getElementById("product-rating-stars"));
        document.getElementById("product-review-count").textContent = `(${data.reviewCount || 0} reviews)`;
    }

    selectedVariants = {};
    const getAttrs = (p) => (p.attributes || (p.variantType ? [{type: p.variantType, value: p.variantValue}] : []));
    getAttrs(data).forEach(a => selectedVariants[a.type] = a.value);
    selectedPack = null;

    window.updatePriceDisplay(data, selectedPack, { final: "price-final", original: "price-original", discount: "price-percentage-discount" });
    window.renderVariantSelectors(data, currentProductGroup);
    window.renderComboPacks(data);
    window.renderProductBundles(data, allProductsCache);
    window.renderTechSpecs(data.techSpecs);
    window.renderAdvancedHighlights(data.specHighlights);
    window.renderDescription(data);

    updateStickyActionBar(); // Update Bottom Bar Price
    
    // Similar Products
    loadHandpickedSimilarProducts(data.category, data.subcategory, data.id);
    initMergedCategoryGrid(data.category); 
    setupInfiniteScroll();
    updateRecentlyViewed(data.id);
    updateCartIcon();
}

// --- CART ---
const getCart = () => { try { return JSON.parse(localStorage.getItem('ramazoneCart')) || []; } catch { return []; } };
const saveCart = (cart) => localStorage.setItem('ramazoneCart', JSON.stringify(cart));
const packsMatch = (p1, p2) => {
    if (!p1 && !p2) return true;
    if (!p1 || !p2) return false;
    return p1.name === p2.name;
};

function addToCart(productId, quantity, variants, pack, showToastMsg = true) {
    const cart = getCart();
    const product = allProductsCache.find(p => p && p.id === productId);
    if (!product) return;

    let existing = cart.findIndex(item => !item.isBundle && item.id === productId && packsMatch(item.pack, pack));
    if (existing > -1) cart[existing].quantity += quantity;
    else cart.push({ id: productId, quantity, variants: variants || {}, pack: pack || null });
    
    saveCart(cart);
    if(showToastMsg) {
        window.showToast(`${product.name} added!`, 'success');
        showGoToCartNotification();
    }
    updateCartIcon();
}

function addBundleToCart(productIds, bundlePrice) {
    const cart = getCart();
    const bundleProducts = productIds.map(id => allProductsCache.find(p => p.id === id)).filter(Boolean);
    if (bundleProducts.length !== productIds.length) { window.showToast('Unavailable.', 'error'); return; }
    
    const bundleId = `BUNDLE_${productIds.sort().join('_')}`;
    const existing = cart.findIndex(item => item.isBundle && item.bundleId === bundleId);
    
    if (existing > -1) cart[existing].quantity += 1;
    else cart.push({
        isBundle: true, bundleId, bundleName: bundleProducts.map(p => p.name).join(' + '),
        quantity: 1, bundlePrice: Number(bundlePrice),
        items: bundleProducts.map(p => ({ id: p.id, name: p.name, image: p.images?.[0] || '' }))
    });
    
    saveCart(cart);
    window.showToast('Bundle added!', 'success');
    showGoToCartNotification();
    updateCartIcon();
}

function updateCartIcon() {
    const cart = getCart();
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    const el = document.getElementById('cart-item-count');
    if (el) {
        el.textContent = total > 0 ? total : '';
        if(total > 0) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }
}

function showGoToCartNotification() {
    const n = document.getElementById('go-to-cart-notification');
    const s = document.getElementById('notification-cart-summary');
    if (!n || !s) return;
    clearTimeout(goToCartNotificationTimer);
    const total = getCart().reduce((sum, item) => sum + item.quantity, 0);
    s.textContent = `${total} item${total>1?'s':''} in cart`;
    n.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
    n.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    goToCartNotificationTimer = setTimeout(() => {
        n.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        n.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }, 3000);
}

// --- STICKY BAR LOGIC ---
function updateStickyActionBar() {
    if (!currentProductId || !currentProductData) return;
    
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    const buyNowBtn = document.getElementById('buy-now-btn');
    const stickyPriceText = document.getElementById('sticky-price-text');

    // Update Price dynamically based on Pack/Variant
    const currentPrice = selectedPack ? selectedPack.price : currentProductData.displayPrice;
    if (stickyPriceText) {
        stickyPriceText.textContent = `at ₹${Number(currentPrice).toLocaleString('en-IN')}`;
    }

    // Handlers
    addToCartBtn.onclick = (e) => {
        e.preventDefault();
        addToCartBtn.innerHTML = '<i class="fas fa-check text-green-600"></i>';
        setTimeout(() => addToCartBtn.innerHTML = '<i class="fas fa-shopping-cart"></i>', 1500);
        addToCart(currentProductId, 1, selectedVariants, selectedPack);
    };

    buyNowBtn.onclick = (e) => {
        e.preventDefault();
        addToCart(currentProductId, 1, selectedVariants, selectedPack, false);
        window.location.href = 'order.html';
    };
}

function setupShareButton() {
    const btn = document.getElementById("share-button");
    if(btn) btn.onclick = async () => {
        const shareData = { title: currentProductData?.name, url: window.location.href };
        try { await navigator.share(shareData); } catch(e) { navigator.clipboard.writeText(window.location.href); window.showToast("Link copied!", "success"); }
    };
}

function setupHeaderScrollEffect() {
    const def = document.getElementById('default-header-content');
    const search = document.getElementById('search-header-content');
    if(!def || !search) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            def.classList.add('header-hidden');
            search.classList.remove('hidden', 'header-hidden');
        } else {
            def.classList.remove('header-hidden');
            search.classList.add('header-hidden');
        }
    }, { passive: true });
}

window.handleVariantChange = (id) => { window.location.href = `?id=${id}`; };

// Infinite Scroll Logic (Same as before)
let allSameCategoryProducts = [], displayedProductCount = 0, isLoadingMore = false;
function loadHandpickedSimilarProducts(cat, subcat, pid) {
    const container = document.getElementById("handpicked-similar-container");
    if(!container) return;
    container.innerHTML = "";
    const sims = allProductsCache.filter(p => p.category === cat && p.id !== pid).slice(0, 6);
    if(sims.length === 0) { document.getElementById("handpicked-similar-section").style.display="none"; return; }
    sims.forEach(p => {
        const price = Number(p.displayPrice).toLocaleString("en-IN");
        container.innerHTML += `<div class="ramazone-final-yml-wrapper"><div class="ramazone-final-yml-card"><a href="?id=${p.id}" class="card-link-area"><div class="image-container"><img src="${p.images[0]}" loading="lazy"></div><div class="details-container"><h4 class="product-name">${p.name}</h4><div class="price-container"><span class="price-highlight">₹${price}</span></div></div></a><div class="button-container"><button class="yml-add-button quick-add-btn" data-id="${p.id}">Add</button></div></div></div>`;
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
    nextBatch.forEach(p => {
        const price = Number(p.displayPrice).toLocaleString("en-IN");
        container.insertAdjacentHTML('beforeend', `<div class="block bg-white rounded-lg shadow overflow-hidden relative transform transition hover:scale-[1.02]"><div class="portrait-img-container"><a href="?id=${p.id}" class="block"><img src="${p.images[0]}" loading="lazy"></a><button class="quick-add-btn" data-id="${p.id}">+</button></div><div class="p-2"><h4 class="text-sm font-semibold truncate">${p.name}</h4><p class="font-bold">₹${price}</p></div></div>`);
    });
    displayedProductCount += nextBatch.length;
    if(loader) loader.style.display = 'none';
}
function setupInfiniteScroll() {
    const section = document.getElementById("other-products-section");
    if(!section) return;
    window.addEventListener('scroll', () => {
        if (isLoadingMore || displayedProductCount >= allSameCategoryProducts.length) return;
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 400) {
            isLoadingMore = true;
            document.getElementById("infinite-scroll-loader").style.display = 'block';
            setTimeout(() => { loadNextBatch(6); isLoadingMore = false; }, 500);
        }
    }, { passive: true });
}
function updateRecentlyViewed(newId) { 
    let viewedIds = JSON.parse(localStorage.getItem("ramazoneRecentlyViewed")) || []; 
    viewedIds = viewedIds.filter(e => e !== newId); 
    viewedIds.unshift(newId); 
    localStorage.setItem("ramazoneRecentlyViewed", JSON.stringify(viewedIds.slice(0, 10))); 
    const container = document.getElementById("recently-viewed-container");
    if(!container) return;
    container.innerHTML = "";
    const recent = viewedIds.map(id => allProductsCache.find(p => p.id == id)).filter(Boolean).filter(p => p.id != currentProductId);
    if(recent.length === 0) { document.getElementById("recently-viewed-section").style.display="none"; return; }
    recent.forEach(p => {
        container.innerHTML += `<div class="carousel-item block bg-white rounded-lg shadow overflow-hidden relative"><div class="portrait-img-container"><a href="?id=${p.id}" class="block"><img src="${p.images[0]}" loading="lazy"></a></div><div class="p-2"><h4 class="text-sm font-semibold truncate">${p.name}</h4><p class="font-bold">₹${Number(p.displayPrice).toLocaleString("en-IN")}</p></div></div>`;
    });
    document.getElementById("recently-viewed-section").style.display = "block";
}
function handleQuickAdd(event) {
    const btn = event.target.closest('.quick-add-btn');
    if (btn) {
        event.preventDefault();
        addToCart(btn.dataset.id, 1, {}, null);
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => btn.innerHTML = '+', 1500);
    }
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
        if (isSelected) selectedPack = null; else { comboCard.classList.add('selected'); selectedPack = { name: comboCard.dataset.value, price: comboCard.dataset.price }; }
        window.updatePriceDisplay(currentProductData, selectedPack, { final: "price-final", original: "price-original", discount: "price-percentage-discount" });
        updateStickyActionBar();
    }
}

