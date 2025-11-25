// products-main.js
// VERSION: FILTER FIX (Fixed Click Target & Case Sensitivity)

// --- GLOBAL VARIABLES ---
let allProductsCache = []; 
let filteredProductsCache = []; 
let displayedCount = 0; 
let allCategories = []; 
let allSubCategoriesCache = {}; 
let currentCategory = 'All';
let currentSelectedSubcategories = []; 
let currentSortOrder = 'popularity'; 
let database;
let isLoadingMore = false;

// Config
const BATCH_SIZE_INITIAL = 10;
const BATCH_SIZE_NEXT = 6;
const CACHE_KEY_PRODUCTS = "ramazone_all_products_cache"; 
const CACHE_KEY_CONFIG = "ramazone_config_cache";
const DEFAULT_LOCATION_KEY = "ALL_AREAS"; 

// Inline SVG
const CART_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: auto;"><path d="M21 5L19 12H7.37671M20 16H8L6 3H3M16 5.5H13.5M13.5 5.5H11M13.5 5.5V8M13.5 5.5V3M9 20C9 20.5523 8.55228 21 8 21C7.44772 21 7 20.5523 7 20C7 19.4477 7.44772 19 8 19C8.55228 19 9 19.4477 9 20ZM20 20C20 20.5523 19.5523 21 19 21C18.4477 21 18 20.5523 18 20C18 19.4477 18.4477 19 19 19C19.5523 19 20 19.4477 20 20Z" stroke="#000000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

// --- 1. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    try {
        updateCartIcon();
        toggleMainLoader(true);

        await loadFirebaseScripts(); 
        
        const firebaseConfig = { 
            apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw", 
            authDomain: "re-store-8e5b3.firebaseapp.com", 
            databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app" 
        };
        
        if (firebaseConfig.apiKey) { 
            firebase.initializeApp(firebaseConfig); 
            database = firebase.database(); 
            
            // Cache First Strategy
            const hasCache = loadFromCache();

            if (!hasCache) {
                document.getElementById('loading-indicator').style.display = 'block';
            }

            // Fetch fresh data in background
            fetchFreshData(!hasCache);
            
        } else { throw new Error("Config missing"); }
    } catch (error) { 
        console.error(error); 
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">App Error.</p>'; 
    }
}

function loadFirebaseScripts() {
    return new Promise((resolve, reject) => {
        if(window.firebase) { resolve(); return; }
        const appScript = document.createElement('script');
        appScript.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';
        appScript.onload = () => {
            const dbScript = document.createElement('script');
            dbScript.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js';
            dbScript.onload = resolve;
            dbScript.onerror = reject;
            document.head.appendChild(dbScript);
        };
        document.head.appendChild(appScript);
    });
}

// --- 2. DATA FETCHING ---
function loadFromCache() {
    let pLoaded = false;
    
    // Products Cache
    const rawP = localStorage.getItem(CACHE_KEY_PRODUCTS);
    if (rawP) {
        try {
            const parsed = JSON.parse(rawP);
            const products = parsed.products || parsed; 
            if (Array.isArray(products) && products.length > 0) {
                allProductsCache = products;
                pLoaded = true;
            }
        } catch(e) { console.warn("Cache P Error"); }
    }

    // Config Cache
    const rawC = localStorage.getItem(CACHE_KEY_CONFIG);
    if (rawC) {
        try {
            const config = JSON.parse(rawC);
            if (config.categories) {
                allCategories = config.categories;
                allSubCategoriesCache = config.subCategories || {};
                displayCategoryTabs();
            }
        } catch(e) { console.warn("Cache C Error"); }
    }

    if (pLoaded) {
        checkUrlParams(); 
        return true;
    }
    return false;
}

async function fetchFreshData(showLoaderUI = false) {
    try {
        const p1 = database.ref('ramazone/products').get();
        const p2 = database.ref('ramazone/homepage/normalCategories').get();
        const p3 = database.ref('ramazone/subCategories').get();

        const [prodSnap, catSnap, subSnap] = await Promise.all([p1, p2, p3]);

        if (prodSnap.exists()) {
            const dataMap = prodSnap.val();
            const freshProducts = Object.values(dataMap).filter(p => p && p.isVisible !== false).map(p => ({
                ...p,
                id: String(p.id),
                displayPrice: Number(p.displayPrice || 0),
                originalPrice: Number(p.originalPrice || 0),
                createdAt: p.createdAt || '2020-01-01'
            }));
            
            allProductsCache = freshProducts;
            
            localStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify({
                timestamp: Date.now(),
                products: freshProducts
            }));
        }

        if (catSnap.exists()) {
            allCategories = catSnap.val().filter(cat => cat && cat.name && cat.size !== 'double');
            allSubCategoriesCache = subSnap.exists() ? subSnap.val() : {};
            
            localStorage.setItem(CACHE_KEY_CONFIG, JSON.stringify({
                categories: allCategories,
                subCategories: allSubCategoriesCache
            }));
            
            displayCategoryTabs();
        }

        checkUrlParams(); 
        
        if(showLoaderUI) toggleMainLoader(false);

    } catch (error) { 
        console.error(error); 
        if(showLoaderUI) document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Check Internet.</p>';
    }
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const categoryFromUrl = urlParams.get('category');
    
    if(categoryFromUrl && categoryFromUrl !== 'All') {
        currentCategory = categoryFromUrl;
        setTimeout(() => {
            const tabs = document.querySelectorAll('.category-btn');
            let found = false;
            tabs.forEach(btn => {
                if(btn.dataset.category.toLowerCase() === currentCategory.toLowerCase()) {
                    btn.classList.add('active');
                    found = true;
                } else btn.classList.remove('active');
            });
            if(!found) {
                const allBtn = document.querySelector('.category-btn[data-category="All"]');
                if(allBtn) allBtn.classList.add('active');
            }
        }, 50);
    }
    
    applyFilters();
    setupUIListeners();
}

// --- 3. FILTERING ---
function applyFilters() {
    console.log("Applying filters...", currentCategory); // Debug log
    const currentLoc = localStorage.getItem('userLocation') || DEFAULT_LOCATION_KEY;
    let temp = [];

    // Location
    if (currentLoc === DEFAULT_LOCATION_KEY) {
        temp = allProductsCache.filter(p => !p.availableAreas || !Array.isArray(p.availableAreas) || p.availableAreas.length === 0);
    } else {
        temp = allProductsCache.filter(p => {
            const isAll = !p.availableAreas || p.availableAreas.length === 0;
            const isMatch = p.availableAreas && p.availableAreas.includes(currentLoc);
            return isAll || isMatch;
        });
    }

    // Category (ROBUST MATCHING)
    if (currentCategory !== 'All') {
        const target = currentCategory.toLowerCase().trim();
        temp = temp.filter(p => {
            const cat = (p.category || "").toLowerCase().trim();
            // Fuzzy match: exact match OR check if one contains the other (optional, mostly exact is better)
            return cat === target;
        });
    }

    // Subcategory
    if (currentSelectedSubcategories.length > 0) {
        temp = temp.filter(p => currentSelectedSubcategories.includes(p.subcategory));
    }

    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value) {
        const q = searchInput.value.toLowerCase();
        temp = temp.filter(p => 
            (p.name && p.name.toLowerCase().includes(q)) || 
            (p.product_of_keyword && p.product_of_keyword.some(k => k.toLowerCase().includes(q)))
        );
    }

    // Sort
    switch (currentSortOrder) {
        case 'popularity': temp.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
        case 'price-asc': temp.sort((a, b) => a.displayPrice - b.displayPrice); break;
        case 'price-desc': temp.sort((a, b) => b.displayPrice - a.displayPrice); break;
        case 'newest': temp.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    }

    filteredProductsCache = temp;
    
    // Render
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '';
    document.getElementById('no-products-message').classList.add('hidden');
    displayedCount = 0;
    
    toggleMainLoader(false);

    if (filteredProductsCache.length === 0) {
        if(allProductsCache.length > 0) {
            document.getElementById('no-products-message').classList.remove('hidden');
        } else {
            toggleMainLoader(true); // Still loading initial data
        }
    } else {
        loadNextBatch(BATCH_SIZE_INITIAL);
        setupInfiniteScrollObserver();
    }
}

// --- 4. BATCH RENDERING ---
function loadNextBatch(count) {
    const grid = document.getElementById('products-grid');
    const loader = document.getElementById('loading-indicator');
    
    const nextBatch = filteredProductsCache.slice(displayedCount, displayedCount + count);
    
    if (nextBatch.length === 0) {
        if(loader) loader.style.display = 'none';
        return;
    }

    const html = nextBatch.map(prod => createProductCardHTML(prod)).join('');
    grid.insertAdjacentHTML('beforeend', html);

    displayedCount += nextBatch.length;
    isLoadingMore = false;

    if (displayedCount >= filteredProductsCache.length) {
        if(loader) loader.style.display = 'none';
    } else {
        if(loader) loader.style.display = 'block';
    }
}

function setupInfiniteScrollObserver() {
    window.onscroll = () => {
        if (isLoadingMore || displayedCount >= filteredProductsCache.length) return;
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 400) {
            isLoadingMore = true;
            setTimeout(() => { loadNextBatch(BATCH_SIZE_NEXT); }, 300);
        }
    };
}

// --- 5. UI COMPONENTS ---
function toggleMainLoader(show) {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.style.display = show ? 'block' : 'none';
}

// FIXED: Better Click Handling
function displayCategoryTabs() {
    const bar = document.getElementById('category-filter-bar');
    if(!bar) return;
    
    let html = `<button class="category-btn rounded-full px-4 py-2 text-sm ${currentCategory === 'All' ? 'active' : ''}" data-category="All">All</button>`;
    const activeCats = new Set(allProductsCache.map(p => (p.category||"").trim()));
    
    allCategories.forEach(cat => {
        if (cat.name && (activeCats.has(cat.name) || allCategories.length < 20)) { 
            const isActive = currentCategory.toLowerCase() === cat.name.toLowerCase() ? 'active' : '';
            html += `<button class="category-btn rounded-full px-4 py-2 text-sm ${isActive}" data-category="${cat.name}">${cat.name}</button>`;
        }
    });
    bar.innerHTML = html;

    bar.onclick = (e) => {
        // FIX: Use closest() to handle clicks on text/spans inside button
        const btn = e.target.closest('.category-btn');
        if (!btn) return;

        // UI Updates
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Data Update
        currentCategory = btn.dataset.category;
        
        // Reset Search & Filter UI
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
        
        const filterBtn = document.getElementById('open-filter-modal-btn');
        if(filterBtn) filterBtn.disabled = (currentCategory === 'All');
        
        // Apply
        applyFilters();
    };
}

function createProductCardHTML(prod) {
    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';
    const ratingTag = prod.rating ? `<div class="card-rating-tag">${prod.rating} <i class="fas fa-star"></i></div>` : '';
    
    let priceHTML = `<p class="display-price">₹${prod.displayPrice.toLocaleString("en-IN")}</p>`;
    let originalPriceHTML = '', discountHTML = '';
    
    if (prod.originalPrice > prod.displayPrice) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        originalPriceHTML = `<p class="original-price">₹${prod.originalPrice.toLocaleString("en-IN")}</p>`;
        if (discount > 0) discountHTML = `<p class="product-discount"><span>↓</span> ${discount}%</p>`;
    }

    return `
    <div class="product-card">
        <div class="product-media-container">
            <a href="./product-details.html?id=${prod.id}" class="block absolute inset-0">
                <img src="${imageUrl}" alt="${prod.name}" loading="lazy" decoding="async">
            </a>
            ${ratingTag}
        </div>
        <div class="product-card-info">
            <a href="./product-details.html?id=${prod.id}">
                <h2 class="product-name">${prod.name}</h2>
                <div class="price-container">${priceHTML}${originalPriceHTML}${discountHTML}</div>
            </a>
            <div class="product-card-actions">
                <button class="cart-btn add-btn" data-id="${prod.id}" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px; background-color: #f3f4f6; border: 1px solid #e5e7eb;">
                    ${CART_ICON_SVG}
                    <i class="fas fa-check cart-added-icon" style="display: none; font-size: 1.2rem; color: #16a34a;"></i>
                </button>
                <button class="buy-text-btn" data-id="${prod.id}">Buy</button>
            </div>
        </div>
    </div>`;
}

// --- 6. CART FUNCTIONS ---
function getCart() { 
    try { 
        const cart = localStorage.getItem('ramazoneCart'); 
        return cart ? JSON.parse(cart) : []; 
    } catch { return []; } 
}

function saveCart(cart) { 
    localStorage.setItem('ramazoneCart', JSON.stringify(cart)); 
    updateCartIcon(); 
}

function getTotalCartQuantity() { 
    const cart = getCart(); 
    return cart.reduce((total, item) => {
        const qty = parseInt(item.quantity) || 0; 
        return total + qty;
    }, 0); 
}

function updateCartIcon() { 
    const total = getTotalCartQuantity(); 
    const el = document.getElementById('cart-item-count'); 
    if (el) { 
        el.textContent = total > 0 ? total : ''; 
        if (total > 0) {
            el.classList.remove('hidden');
            el.style.display = 'flex'; 
        } else {
            el.classList.add('hidden');
            el.style.display = 'none';
        }
    } 
}

function addToCart(productId, qty = 1) {
    const cart = getCart();
    let product = allProductsCache.find(p => p.id == productId);
    if (!product) product = { id: productId, variants: [] };

    let selectedVariants = {};
    if (product.variants && product.variants.length > 0) {
        product.variants.forEach(v => {
            if (v.options && v.options.length > 0) selectedVariants[v.type] = v.options[0].name;
        });
    }

    const idx = cart.findIndex(item => item.id == productId && JSON.stringify(item.variants) === JSON.stringify(selectedVariants));
    if (idx > -1) {
        cart[idx].quantity = (parseInt(cart[idx].quantity) || 0) + qty;
    } else {
        cart.push({ id: productId, quantity: qty, variants: selectedVariants });
    }
    
    saveCart(cart);
    updateCartIcon();
}

// --- 7. LISTENERS ---
function setupUIListeners() {
    updateCartIcon();
    setupScrollBehavior();
    setupProductCardEventListeners();
    setupSortModal();
    setupFilterModal();
    setupSearch();
}

function setupProductCardEventListeners() {
    const grid = document.getElementById('products-grid'); 
    if (!grid) return;
    
    grid.onclick = function(event) {
        const buyButton = event.target.closest('.buy-text-btn');
        if (buyButton) { 
            event.preventDefault(); 
            addToCart(buyButton.dataset.id); 
            window.location.href = 'order.html'; 
            return; 
        }
        
        const addButton = event.target.closest('.cart-btn.add-btn');
        if (addButton && !addButton.classList.contains('added')) {
            event.preventDefault(); 
            addToCart(addButton.dataset.id); 
            showToast('Added to cart!', 'success');
            
            addButton.classList.add('added');
            const svg = addButton.querySelector('svg');
            const check = addButton.querySelector('.cart-added-icon');
            if(svg) svg.style.display = 'none';
            if(check) check.style.display = 'block';
            
            setTimeout(() => { 
                addButton.classList.remove('added'); 
                if(svg) svg.style.display = 'block';
                if(check) check.style.display = 'none';
            }, 1500);
        }
    };
}

function showToast(msg, type="info") {
    const t = document.getElementById("toast-notification");
    t.textContent = msg;
    t.style.backgroundColor = type === "error" ? "#ef4444" : "#333";
    t.style.opacity = 1;
    setTimeout(() => t.style.opacity = 0, 2500);
}

function setupScrollBehavior() {
    const header = document.getElementById('main-header');
    let lastScroll = window.scrollY;
    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        if (currentScroll > lastScroll && currentScroll > 60) {
            header.classList.add('header-hidden');
            document.body.classList.add('header-is-hidden');
        } else if (currentScroll < lastScroll) {
            header.classList.remove('header-hidden');
            document.body.classList.remove('header-is-hidden');
        }
        lastScroll = currentScroll;
    }, { passive: true });
}

function setupSearch() {
    const input = document.getElementById('search-input');
    if(!input) return;
    input.addEventListener('input', () => {
        if(currentCategory !== 'All') {
            currentCategory = 'All';
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            const allBtn = document.querySelector('.category-btn[data-category="All"]');
            if(allBtn) allBtn.classList.add('active');
        }
        applyFilters(); 
    });
}

// Modals
function setupSortModal() {
    const btn = document.getElementById('open-sort-modal-btn');
    const overlay = document.getElementById('sort-modal-overlay');
    const close = document.getElementById('sort-modal-close-btn');
    const options = document.querySelector('.sort-options-container');
    if(!btn) return;
    btn.onclick = () => overlay.classList.add('visible');
    close.onclick = () => overlay.classList.remove('visible');
    overlay.onclick = (e) => { if(e.target===overlay) overlay.classList.remove('visible'); };
    options.onchange = (e) => {
        if(e.target.name === 'sort-option') {
            currentSortOrder = e.target.value;
            applyFilters();
            setTimeout(() => overlay.classList.remove('visible'), 200);
        }
    };
}

function setupFilterModal() {
    const btn = document.getElementById('open-filter-modal-btn');
    const overlay = document.getElementById('filter-modal-overlay');
    const close = document.getElementById('filter-modal-close-btn');
    const container = document.getElementById('filter-options-container');
    const applyBtn = document.getElementById('filter-apply-btn');
    const clearBtn = document.getElementById('filter-clear-btn');

    if(!btn) return;
    
    btn.onclick = () => {
        const catKey = currentCategory.replace(/[.#$/\[\]]/g, "_");
        const subs = allSubCategoriesCache[catKey] || [];
        if (subs.length === 0) {
            container.innerHTML = `<p class="p-4 text-center text-gray-500">No sub-categories available.</p>`;
        } else {
            container.innerHTML = subs.map(s => `
                <div class="filter-option-item"><label for="sub-${s}">${s}</label>
                <input type="checkbox" id="sub-${s}" name="sub-category" value="${s}" ${currentSelectedSubcategories.includes(s)?'checked':''}></div>`).join('');
        }
        overlay.classList.add('visible');
    };
    close.onclick = () => overlay.classList.remove('visible');
    overlay.onclick = (e) => { if(e.target===overlay) overlay.classList.remove('visible'); };
    clearBtn.onclick = () => { currentSelectedSubcategories = []; applyFilters(); overlay.classList.remove('visible'); };
    applyBtn.onclick = () => {
        const checkboxes = container.querySelectorAll('input[name="sub-category"]:checked');
        currentSelectedSubcategories = Array.from(checkboxes).map(c => c.value);
        applyFilters(); overlay.classList.remove('visible');
    };
}
