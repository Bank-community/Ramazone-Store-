// product-search.js - Header Cart, Compact Layout, Firebase Fallback, Limit History to 3

let allProducts = [];
let displayedCount = 0;
let currentResults = [];
let BATCH_SIZE = 10;
const CACHE_KEY = "RAMAZONE_DATA_V2"; // Use same key as main app
const HISTORY_KEY = "RAMAZONE_SEARCH_HISTORY";
const DEFAULT_LOCATION = "ALL_AREAS"; 

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('main-search-input');
    const clearBtn = document.getElementById('clear-search-btn'); 
    
    setTimeout(() => { input.focus(); }, 100); 

    // Initialize logic
    initFirebaseAndLoad();

    renderSearchHistory();
    updateHeaderCart(); // Check cart on load

    input.addEventListener('input', (e) => {
        const val = e.target.value;
        clearBtn.style.display = val.length > 0 ? 'block' : 'none';
        handleSearch(val);
    });
    
    clearBtn.addEventListener('click', () => {
        input.value = ''; 
        clearBtn.style.display = 'none'; 
        handleSearch(''); 
        input.focus(); 
    });
    
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addToHistory(input.value);
            input.blur(); 
        }
    });
});

// --- FIREBASE & DATA LOADING LOGIC ---

async function initFirebaseAndLoad() {
    // 1. Check Local Cache First
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        console.log("Loading from Cache...");
        parseAndLoadData(cached);
    } else {
        // 2. Fallback: Fetch from Firebase directly
        console.log("Cache miss. Fetching from Firebase...");
        fetchFromFirebase();
    }
}

function fetchFromFirebase() {
    // Show Full Screen Loader
    const loader = document.getElementById('initial-loader');
    if(loader) loader.classList.remove('hidden');

    const config = {
        apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
        authDomain: "re-store-8e5b3.firebaseapp.com",
        databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(config);
    }
    const database = firebase.database();

    // Fetch Products
    database.ref('ramazone/products').once('value')
        .then((snapshot) => {
            const products = snapshot.val() || {};
            
            const dataToSave = {
                products: products,
                timestamp: new Date().getTime()
            };

            // Update Global Variable
            localStorage.setItem(CACHE_KEY, JSON.stringify(dataToSave));
            
            parseAndLoadData(JSON.stringify(dataToSave));
            
            if(loader) loader.classList.add('hidden');
        })
        .catch((error) => {
            console.error("Firebase Fetch Error:", error);
            if(loader) {
                loader.innerHTML = '<p class="text-red-500">Failed to load data. Please refresh.</p>';
            }
        });
}

function parseAndLoadData(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        let rawProducts = [];

        // Handle different data structures (array vs object)
        if (data.products) {
            rawProducts = Array.isArray(data.products) ? data.products : Object.values(data.products);
        } else if (Array.isArray(data)) {
            // Fallback if raw array was saved
            rawProducts = data;
        }

        const userLoc = localStorage.getItem('userLocation') || DEFAULT_LOCATION;

        allProducts = rawProducts.filter(p => {
            if (!p) return false;
            if (p.isVisible === false) return false;
            // Location Filter
            if (p.availableAreas && Array.isArray(p.availableAreas) && p.availableAreas.length > 0) {
                if (!p.availableAreas.includes(userLoc)) return false;
            }
            return true;
        });

        console.log(`Loaded ${allProducts.length} products.`);
        renderTrendingProducts();
        renderCategoryChips(); // New Function
        
    } catch (e) { console.error("Data Parse Error", e); }
}

function renderTrendingProducts() {
    const container = document.getElementById('trending-products-container');
    const section = document.getElementById('trending-section');
    if (!container || allProducts.length === 0) return;

    section.classList.remove('hidden');
    // Randomize and take 8
    const trending = [...allProducts].sort(() => 0.5 - Math.random()).slice(0, 8);
    
    container.innerHTML = trending.map(p => `
        <div onclick="location.href='product-details.html?id=${p.id}'" class="min-w-[120px] bg-white border border-gray-100 rounded p-2 flex flex-col items-center cursor-pointer">
            <img src="${p.images?.[0] || 'placeholder.jpg'}" class="w-20 h-20 object-contain mb-2">
            <p class="text-xs text-center text-gray-700 font-medium line-clamp-2">${p.name}</p>
        </div>
    `).join('');
}

// --- RENDER CATEGORY CHIPS ---
function renderCategoryChips() {
    const container = document.getElementById('category-chips-container');
    const section = document.getElementById('discover-more-section');
    
    if (!container || allProducts.length === 0) return;

    // Extract Unique Categories
    const categories = new Set();
    allProducts.forEach(p => {
        if (p.category) categories.add(p.category);
    });

    if (categories.size === 0) return;

    section.classList.remove('hidden');
    
    const colors = ['bg-blue-50 text-blue-700', 'bg-green-50 text-green-700', 'bg-purple-50 text-purple-700', 'bg-orange-50 text-orange-700', 'bg-pink-50 text-pink-700'];
    
    let html = '';
    let i = 0;
    categories.forEach(cat => {
        const colorClass = colors[i % colors.length];
        html += `<div onclick="executeSearch('${cat}')" class="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border border-transparent hover:border-gray-200 transition-colors ${colorClass}">
            ${cat}
        </div>`;
        i++;
    });

    container.innerHTML = html;
}


// --- CORE SEARCH LOGIC ---
function handleSearch(query) {
    const defaultView = document.getElementById('default-search-view');
    const resultsWrapper = document.getElementById('search-results-wrapper');
    const container = document.getElementById('search-results-container');
    const noRes = document.getElementById('no-results-msg');
    const termDisplay = document.getElementById('search-term-display');

    query = query.trim().toLowerCase();

    if (query.length === 0) {
        defaultView.style.display = 'block';
        resultsWrapper.classList.add('hidden');
        renderSearchHistory(); 
        return;
    }

    defaultView.style.display = 'none';
    resultsWrapper.classList.remove('hidden');
    termDisplay.textContent = query;

    currentResults = allProducts.filter(p => {
        const name = p.name ? p.name.toLowerCase() : "";
        const cat = p.category ? p.category.toLowerCase() : "";
        
        if (name.includes(query)) return true;
        if (cat.includes(query)) return true;
        if (p.tags && p.tags.some(t => t.toLowerCase().includes(query))) return true;
        if (p.product_of_keyword && p.product_of_keyword.some(k => k.toLowerCase().includes(query))) return true;
        return false;
    });

    displayedCount = 0;
    container.innerHTML = ''; 

    if (currentResults.length === 0) {
        noRes.classList.remove('hidden');
    } else {
        noRes.classList.add('hidden');
        loadMore(); 
    }
}

function loadMore() {
    const container = document.getElementById('search-results-container');
    const batch = currentResults.slice(displayedCount, displayedCount + BATCH_SIZE);
    
    let html = "";
    batch.forEach(p => {
        html += createResultCard(p);
    });
    container.insertAdjacentHTML('beforeend', html);
    displayedCount += batch.length;
}

// --- HELPER: Generate Star Rating HTML ---
function getStarRatingHTML(rating) {
    if (!rating) return '';
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (rating >= i) {
            stars += '<i class="fas fa-star star-filled"></i>';
        } else if (rating >= i - 0.5) {
             stars += '<i class="fas fa-star-half-alt star-filled"></i>';
        } else {
             stars += '<i class="fas fa-star star-empty"></i>';
        }
    }
    return `<div class="star-rating-row">${stars}</div>`;
}

// --- FLIPKART STYLE CARD RENDERER ---
function createResultCard(p) {
    const price = `₹${Number(p.displayPrice).toLocaleString()}`;
    const oldPrice = p.originalPrice > p.displayPrice ? `₹${Number(p.originalPrice).toLocaleString()}` : '';
    const discount = p.originalPrice > p.displayPrice ? Math.round(((p.originalPrice - p.displayPrice)/p.originalPrice)*100) + '% off' : '';
    
    const ratingHtml = getStarRatingHTML(p.rating);

    let variantCount = 0;
    if (p.groupId) {
        variantCount = allProducts.filter(prod => prod.groupId === p.groupId).length;
    }

    let variantTag = '';
    if (variantCount > 1) {
        variantTag = `<div class="variant-tag" onclick="event.stopPropagation(); openVariantModal('${p.id}', '${p.groupId}')">
            ${variantCount} Variants
        </div>`;
    } else if (p.variants && p.variants.length > 1) {
        variantTag = `<div class="variant-tag" onclick="event.stopPropagation(); openVariantModal('${p.id}', null)">
            ${p.variants.length} Variants
        </div>`;
    }

    const isGrocery = isGroceryCategory(p.category || "");
    const addToCartBtn = isGrocery 
        ? `<button class="add-cart-btn" onclick="event.stopPropagation(); addToCartSimple('${p.id}', ${p.displayPrice})">Add to Cart</button>`
        : '';

    return `
    <div class="prod-card" onclick="location.href='product-details.html?id=${p.id}'">
        <div class="img-container">
            <i class="far fa-heart wishlist-icon"></i>
            <img src="${p.images?.[0] || 'placeholder.jpg'}" alt="${p.name}" loading="lazy">
            ${variantTag}
        </div>
        <div class="info-container">
            <h3 class="prod-name">${p.name}</h3>
            ${ratingHtml}
            <div class="price-row">
                <span class="current-price">${price}</span>
                <span class="mrp-price">${oldPrice}</span>
                <span class="discount-off">${discount}</span>
            </div>
            ${addToCartBtn}
        </div>
    </div>`;
}

// --- HELPER FUNCTIONS ---

function isGroceryCategory(cat) {
    const groceryKeywords = ['grocery', 'kirana', 'food', 'dal', 'rice', 'oil', 'masala', 'kitchen', 'daily', 'dry fruit', 'snacks', 'staples', 'vegetable'];
    return groceryKeywords.some(k => cat.toLowerCase().includes(k));
}

// --- CART LOGIC WITH HEADER BUTTON ---

function addToCartSimple(productId, price) {
    try {
        let cart = JSON.parse(localStorage.getItem('ramazoneCart')) || [];
        const existing = cart.find(item => item.id === productId);
        
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({ id: productId, quantity: 1, variants: {} });
        }
        localStorage.setItem('ramazoneCart', JSON.stringify(cart));
        
        // Update Header Button
        updateHeaderCart();

        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = "Added";
        btn.style.backgroundColor = "#2874f0";
        btn.style.color = "white";
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.backgroundColor = "white";
            btn.style.color = "#2874f0";
        }, 1500);
    } catch(e) { console.error(e); }
}

function updateHeaderCart() {
    const cartBtn = document.getElementById('header-cart-btn');
    const countEl = document.getElementById('h-cart-count');
    const priceEl = document.getElementById('h-cart-price');
    
    let cart = JSON.parse(localStorage.getItem('ramazoneCart')) || [];
    
    if (cart.length === 0) {
        cartBtn.style.display = 'none';
        return;
    }

    let totalItems = 0;
    let totalPrice = 0;

    cart.forEach(item => {
        totalItems += item.quantity;
        const product = allProducts.find(p => p.id === item.id);
        if (product) {
            totalPrice += (Number(product.displayPrice) * item.quantity);
        }
    });

    if (totalItems > 0) {
        countEl.textContent = `${totalItems} Items`;
        priceEl.textContent = `₹${totalPrice.toLocaleString()}`;
        cartBtn.style.display = 'flex'; // Show in Header
    } else {
        cartBtn.style.display = 'none';
    }
}

// --- VARIANT POPUP LOGIC ---

function openVariantModal(currentProductId, groupId) {
    const overlay = document.getElementById('variant-overlay');
    const sheet = document.getElementById('variant-sheet');
    const list = document.getElementById('variant-list-container');
    
    let variants = [];

    if (groupId) {
        variants = allProducts.filter(p => p.groupId === groupId);
    } 
    else {
        const product = allProducts.find(p => p.id === currentProductId);
        if (product && product.variants) {
             variants = product.variants.map((v, idx) => ({
                 id: currentProductId,
                 name: product.name,
                 displayPrice: v.price || product.displayPrice,
                 images: product.images,
                 variantValue: v.name || v.options?.[0]?.name || `Option ${idx+1}`,
                 variantType: "Option"
             }));
        }
    }

    if (variants.length === 0) return;

    let variantsHtml = variants.map(v => {
        const isSelected = v.id === currentProductId;
        const displayTitle = (v.variantValue && v.variantType) ? `${v.variantValue}` : v.name;
        const displayType = v.variantType || 'Variant';

        return `
        <div class="variant-item ${isSelected ? 'selected' : ''}" onclick="location.href='product-details.html?id=${v.id}'">
            <img src="${v.images?.[0] || 'placeholder.jpg'}" class="v-img">
            <div class="v-info">
                <div class="flex items-center">
                    <p class="v-name">${displayTitle}</p>
                    ${v.variantValue ? `<span class="v-attr">${displayType}</span>` : ''}
                </div>
                <div>
                    <span class="v-price">₹${Number(v.displayPrice).toLocaleString()}</span>
                </div>
            </div>
            ${isSelected ? '<i class="fas fa-check-circle text-green-600"></i>' : '<i class="fas fa-chevron-right text-gray-400"></i>'}
        </div>`;
    }).join('');

    list.innerHTML = variantsHtml;
    overlay.classList.add('active');
    sheet.classList.add('active');
}

function closeVariantModal() {
    document.getElementById('variant-overlay').classList.remove('active');
    document.getElementById('variant-sheet').classList.remove('active');
}

// History Functions (UPDATED LIMITS HERE)
function renderSearchHistory() {
    const container = document.getElementById('recent-searches-container');
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    if (history.length === 0) { container.innerHTML = ''; return; }
    
    let html = `<div class="p-3 border-b border-gray-100 flex justify-between items-center"><span class="text-sm font-bold text-gray-600">Recent Searches</span><button onclick="localStorage.removeItem('${HISTORY_KEY}'); renderSearchHistory()" class="text-xs text-blue-600 font-bold">CLEAR</button></div>`;
    
    // LIMIT CHANGED TO 3
    history.slice(0, 3).forEach(term => { 
        html += `
        <div class="flex items-center p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50" onclick="executeSearch('${term}')">
            <i class="fas fa-clock text-gray-400 mr-3"></i>
            <span class="flex-grow text-sm text-gray-700">${term}</span>
            <i class="fas fa-arrow-left -rotate-45 text-gray-300"></i>
        </div>`;
    });
    container.innerHTML = html;
}

function addToHistory(term) {
    if(!term || term.trim() === '') return;
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    history = history.filter(h => h.toLowerCase() !== term.toLowerCase());
    history.unshift(term);
    // LIMIT CHANGED TO 3
    if (history.length > 3) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

window.executeSearch = (term) => {
    document.getElementById('main-search-input').value = term;
    document.getElementById('clear-search-btn').style.display = 'block';
    addToHistory(term);
    handleSearch(term);
}

