// product-details-main.js
// Handles Data Fetching, Cart Logic, and State Management

// --- GLOBAL STATE ---
let currentProductData = null, currentProductId = null;
let allProductsCache = [];
let currentProductGroup = []; // Stores all variants
let selectedVariants = {}; 
let selectedPack = null; 
let database;
let goToCartNotificationTimer = null; 

// --- CART FUNCTIONS ---
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
    if (productId === currentProductId) {
        updateStickyActionBar();
    }
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

function updateCartItemQuantity(productId, newQuantity, variants, pack) {
    let cart = getCart();
    const itemIndex = cart.findIndex(item => item.id === productId && packsMatch(item.pack, pack));
    if (itemIndex > -1) {
        if (newQuantity > 0) cart[itemIndex].quantity = newQuantity;
        else cart.splice(itemIndex, 1);
        saveCart(cart);
        updateCartIcon();
        updateStickyActionBar();
    }
}

const getTotalCartQuantity = () => { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); };

function updateCartIcon() {
    const totalQuantity = getTotalCartQuantity();
    const cartCountElement = document.getElementById('cart-item-count');
    if (cartCountElement) cartCountElement.textContent = totalQuantity > 0 ? totalQuantity : '';
}

function showGoToCartNotification() {
    const notification = document.getElementById('go-to-cart-notification');
    const summaryEl = document.getElementById('notification-cart-summary');
    if (!notification || !summaryEl) return;
    clearTimeout(goToCartNotificationTimer);
    const totalQuantity = getTotalCartQuantity();
    summaryEl.textContent = `${totalQuantity} item${totalQuantity > 1 ? 's' : ''} in cart`;
    notification.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
    notification.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    goToCartNotificationTimer = setTimeout(() => {
        notification.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        notification.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }, 3000);
}

function updateStickyActionBar() {
    if (!currentProductId) return;
    const cartItem = getCartItem(currentProductId, selectedVariants, selectedPack);
    const qtyWrapper = document.getElementById('quantity-selector-wrapper');
    const qtyDisplay = document.getElementById('quantity-display');
    const decreaseBtn = document.getElementById('decrease-quantity');
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    const goToCartBtn = document.getElementById('go-to-cart-btn');
    const mainActionContainer = document.getElementById('main-action-container');
    if (cartItem) {
        qtyDisplay.textContent = cartItem.quantity;
        decreaseBtn.disabled = cartItem.quantity <= 1;
        qtyWrapper.classList.remove('hidden');
        mainActionContainer.classList.remove('col-start-1', 'col-span-2');
        mainActionContainer.classList.add('col-start-2');
        addToCartBtn.classList.add('hidden');
        goToCartBtn.classList.remove('hidden');
    } else {
        qtyWrapper.classList.add('hidden');
        mainActionContainer.classList.add('col-start-1', 'col-span-2');
        mainActionContainer.classList.remove('col-start-2');
        addToCartBtn.classList.remove('hidden');
        goToCartBtn.classList.add('hidden');
    }
}

function setupHeaderScrollEffect() {
    const defaultHeader = document.getElementById('default-header-content');
    const searchHeader = document.getElementById('search-header-content');
    if (!defaultHeader || !searchHeader) return;
    const SCROLL_THRESHOLD = 50;
    window.addEventListener('scroll', () => {
        if (window.scrollY > SCROLL_THRESHOLD) {
            if (!defaultHeader.classList.contains('header-hidden')) {
                defaultHeader.classList.add('header-hidden');
                searchHeader.classList.remove('hidden');
                searchHeader.classList.remove('header-hidden');
            }
        } else {
            if (defaultHeader.classList.contains('header-hidden')) {
                defaultHeader.classList.remove('header-hidden');
                searchHeader.classList.add('header-hidden');
                setTimeout(() => { if (window.scrollY <= SCROLL_THRESHOLD) searchHeader.classList.add('hidden'); }, 300);
            }
        }
    }, { passive: true });
}

// --- FIREBASE & INIT ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    try {
        const firebaseConfig = {
            apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
            authDomain: "re-store-8e5b3.firebaseapp.com",
            databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
        };

        if (firebaseConfig.apiKey) {
            firebase.initializeApp(firebaseConfig);
            database = firebase.database();
            await fetchAllData();
            fetchProductData();
        } else { throw new Error("Firebase config invalid."); }
    } catch (error) {
        console.error("Init Failed:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Could not initialize.</p>';
    }
}

async function fetchAllData() {
    const snapshot = await database.ref('ramazone').get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const appThemeColor = data.config?.themeColor || '#4F46E5';
        document.documentElement.style.setProperty('--primary-color', appThemeColor);
        const allProds = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
        allProductsCache = allProds.filter(p => p && p.isVisible !== false);
    }
}

function fetchProductData() {
    currentProductId = new URLSearchParams(window.location.search).get('id')?.trim();
    if (!currentProductId) { document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product ID not found.</p>'; return; }
    
    const product = allProductsCache.find(p => p && p.id == currentProductId);
    if (product) {
        currentProductData = product;
        currentProductGroup = product.groupId ? allProductsCache.filter(p => p.groupId === product.groupId) : [product];
        loadProductPage(product);
    } else {
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product not found.</p>';
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

    // Basic Info (Simple Text Updates)
    document.title = `${data.name} - Ramazone`;
    document.getElementById("product-title").textContent = data.name;
    
    // Brand Info
    if (data.brand) {
        document.getElementById('brand-name-text').textContent = data.brand;
        document.getElementById('visit-store-link').href = `visit-store.html?brand=${encodeURIComponent(data.brand)}`;
        document.getElementById('brand-info-container').classList.remove('hidden');
    }

    // CALLING UI RENDERERS (From renderer.js)
    window.renderMediaGallery(data); // Handles Images & Video Icon
    
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
    
    // Load Similar (Existing logic, can be moved to renderer if needed but okay here for now)
    loadHandpickedSimilarProducts(data.category, data.subcategory, data.id);
    loadCategoryBasedProducts(data.category);
    loadOtherProducts(data.category);
    updateRecentlyViewed(data.id);
    updateCartIcon();

    setupHeaderScrollEffect();
}

// --- EVENT LISTENERS ---
function setupActionControls() { 
    document.getElementById('add-to-cart-btn').onclick = () => addToCart(currentProductId, 1, selectedVariants, selectedPack); 
    document.getElementById('increase-quantity').onclick = () => { const item = getCartItem(currentProductId, selectedVariants, selectedPack); if (item) updateCartItemQuantity(currentProductId, item.quantity + 1, selectedVariants, selectedPack); }; 
    document.getElementById('decrease-quantity').onclick = () => { const item = getCartItem(currentProductId, selectedVariants, selectedPack); if (item) updateCartItemQuantity(currentProductId, item.quantity - 1, selectedVariants, selectedPack); }; 
    
    // Setup Share Button with improved handling
    setupShareButton(); 
    
    // Delegate clicks for dynamic elements
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

// SPA Variant Switch
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
        }, 400);
    } else {
        if (overlay) overlay.classList.add('hidden');
        window.showToast('Variant not found', 'error');
    }
};

window.addEventListener('popstate', fetchProductData);

// --- FIXED: SHARE BUTTON LOGIC ---
function setupShareButton() {
    const shareBtn = document.getElementById("share-button");
    if(!shareBtn) return;
    
    // 1. Clone button to clear all old listeners (clean slate)
    const newBtn = shareBtn.cloneNode(true);
    shareBtn.parentNode.replaceChild(newBtn, shareBtn);
    
    // 2. Prevent Slider Conflict: Stop propagation for ALL interaction events
    ['touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach(evt => {
        newBtn.addEventListener(evt, (e) => {
            e.stopPropagation(); // This shields the button from the Slider
        }, { passive: false });
    });

    // 3. Add Click Logic
    newBtn.addEventListener("click", async (e) => {
        e.preventDefault(); 
        
        if (!currentProductData) return;
        const shareUrl = `${window.location.origin}/product-details.html?id=${currentProductId}`;
        const shareData = { 
            title: currentProductData.name, 
            text: `Check out ${currentProductData.name} on Ramazone!`, 
            url: shareUrl 
        };
        
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                // Fallback for desktop / unsupported browsers
                await navigator.clipboard.writeText(shareUrl);
                window.showToast("Link copied to clipboard!", "success");
            }
        } catch (err) { 
            console.error("Share failed:", err);
            // Fallback if share dialog is closed or fails
            try {
                await navigator.clipboard.writeText(shareUrl);
                window.showToast("Link copied to clipboard!", "success");
            } catch (clipboardErr) {
                window.showToast("Could not share.", "error");
            }
        }
    });
}

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

// --- HELPERS FOR SIMILAR PRODUCTS ---
function updateRecentlyViewed(newId) { 
    let viewedIds = JSON.parse(localStorage.getItem("ramazoneRecentlyViewed")) || []; 
    viewedIds = viewedIds.filter(e => e !== newId); 
    viewedIds.unshift(newId); 
    localStorage.setItem("ramazoneRecentlyViewed", JSON.stringify(viewedIds.slice(0, 10))); 
    loadRecentlyViewed(viewedIds); 
}

function createCardHTML(product, type) {
    const price = Number(product.displayPrice).toLocaleString("en-IN");
    const discount = Number(product.originalPrice) > Number(product.displayPrice) ? Math.round(((Number(product.originalPrice) - Number(product.displayPrice)) / Number(product.originalPrice)) * 100) : 0;
    const btn = `<button class="quick-add-btn" data-id="${product.id}">+</button>`;
    
    if (type === 'grid') {
        return `<div class="block bg-white rounded-lg shadow overflow-hidden relative"><div class="relative"><a href="?id=${product.id}" class="block"><img src="${product.images?.[0]}" class="w-full h-auto aspect-square object-cover"></a>${btn}</div><div class="p-2"><h4 class="text-sm font-semibold truncate">${product.name}</h4><div class="flex items-baseline gap-2"><p class="font-bold">₹${price}</p>${discount > 0 ? `<p class="text-xs text-green-600">${discount}% OFF</p>` : ''}</div></div></div>`;
    }
    return `<div class="carousel-item block bg-white rounded-lg shadow overflow-hidden relative"><div class="relative"><a href="?id=${product.id}" class="block"><img src="${product.images?.[0]}" class="w-full aspect-square object-cover"></a>${btn}</div><div class="p-2"><h4 class="text-sm font-semibold truncate">${product.name}</h4><div class="flex items-baseline gap-2"><p class="font-bold">₹${price}</p></div></div></div>`;
}

function loadRecentlyViewed(viewedIds) { 
    const container = document.getElementById("recently-viewed-container");
    if(!container) return;
    container.innerHTML = "";
    let count = 0;
    viewedIds.forEach(id => {
        if(id == currentProductId) return;
        const p = allProductsCache.find(x => x.id == id);
        if(p) { container.innerHTML += ` <a href="?id=${p.id}" class="recently-viewed-item block bg-white"> <div class="relative"> <img src="${p.images?.[0]}" class="w-full object-cover aspect-square"> </div> <div class="p-2 text-center"> <h4 class="text-sm font-medium truncate">${p.name}</h4> </div> </a> `; count++; }
    });
    document.getElementById("recently-viewed-section").style.display = count > 0 ? "block" : "none";
}

function loadHandpickedSimilarProducts(cat, subcat, pid) {
    const container = document.getElementById("handpicked-similar-container");
    if(!container) return;
    container.innerHTML = "";
    const sims = allProductsCache.filter(p => p.category === cat && p.subcategory === subcat && p.id !== pid).slice(0, 10);
    if(sims.length === 0) { document.getElementById("handpicked-similar-section").style.display="none"; return; }
    sims.forEach(p => {
        const price = Number(p.displayPrice).toLocaleString("en-IN");
        container.innerHTML += `<div class="ramazone-final-yml-wrapper"><div class="ramazone-final-yml-card"><a href="?id=${p.id}" class="card-link-area"><div class="image-container"><img src="${p.images[0]}"></div><div class="details-container"><h4 class="product-name">${p.name}</h4><div class="price-container"><span class="final-price">₹${price}</span></div></div></a><div class="button-container"><button class="yml-add-button quick-add-btn" data-id="${p.id}">Add</button></div></div></div>`;
    });
    document.getElementById("handpicked-similar-section").style.display = "block";
}

function loadCategoryBasedProducts(cat) {
    const container = document.getElementById("similar-products-container");
    if(!container) return;
    container.innerHTML = "";
    let count = 0;
    allProductsCache.forEach(p => { if(p.category === cat && p.id != currentProductId) { container.innerHTML += createCardHTML(p, 'carousel'); count++; } });
    document.getElementById("similar-products-section").style.display = count > 0 ? "block" : "none";
}

function loadOtherProducts(cat) {
    const container = document.getElementById("other-products-container");
    if(!container) return;
    container.innerHTML = "";
    const others = allProductsCache.filter(p => p.category !== cat && p.id != currentProductId).slice(0, 20);
    others.forEach(p => container.innerHTML += createCardHTML(p, 'grid'));
    document.getElementById("other-products-section").style.display = others.length > 0 ? "block" : "none";
}

