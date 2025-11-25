// product-search.js - Group ID Logic & Star Ratings

let allProducts = [];
let displayedCount = 0;
let currentResults = [];
let BATCH_SIZE = 10;
const CACHE_KEY = "RAMAZONE_DATA_V2";
const HISTORY_KEY = "RAMAZONE_SEARCH_HISTORY";
const DEFAULT_LOCATION = "ALL_AREAS"; 

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('main-search-input');
    const clearBtn = document.getElementById('clear-search-btn'); 
    
    setTimeout(() => { input.focus(); }, 100); 

    loadData();
    renderSearchHistory();

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

function loadData() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        const userLoc = localStorage.getItem('userLocation') || DEFAULT_LOCATION;

        if (cached) {
            const data = JSON.parse(cached);
            let rawProducts = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
            
            allProducts = rawProducts.filter(p => {
                if (p.isVisible === false) return false;
                if (p.availableAreas && Array.isArray(p.availableAreas) && p.availableAreas.length > 0) {
                    if (!p.availableAreas.includes(userLoc)) return false;
                }
                return true;
            });
            
            renderTrendingProducts();
        }
    } catch (e) { console.error("Data Load Error", e); }
}

function renderTrendingProducts() {
    const container = document.getElementById('trending-products-container');
    const section = document.getElementById('trending-section');
    if (!container || allProducts.length === 0) return;

    section.classList.remove('hidden');
    const trending = [...allProducts].sort(() => 0.5 - Math.random()).slice(0, 8);
    
    container.innerHTML = trending.map(p => `
        <div onclick="location.href='product-details.html?id=${p.id}'" class="min-w-[120px] bg-white border border-gray-100 rounded p-2 flex flex-col items-center">
            <img src="${p.images?.[0] || 'placeholder.jpg'}" class="w-20 h-20 object-contain mb-2">
            <p class="text-xs text-center text-gray-700 font-medium line-clamp-2">${p.name}</p>
        </div>
    `).join('');
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
    
    // 1. Star Rating (New Style)
    const ratingHtml = getStarRatingHTML(p.rating);

    // 2. Variant Logic (Group ID Check)
    // Find how many products share this group ID
    let variantCount = 0;
    if (p.groupId) {
        variantCount = allProducts.filter(prod => prod.groupId === p.groupId).length;
    }

    let variantTag = '';
    // If more than 1 item in group, show tag
    if (variantCount > 1) {
        variantTag = `<div class="variant-tag" onclick="event.stopPropagation(); openVariantModal('${p.id}', '${p.groupId}')">
            ${variantCount} Variants
        </div>`;
    } else if (p.variants && p.variants.length > 1) {
        // Fallback for legacy array structure
        variantTag = `<div class="variant-tag" onclick="event.stopPropagation(); openVariantModal('${p.id}', null)">
            ${p.variants.length} Variants
        </div>`;
    }

    // 3. Grocery Check
    const isGrocery = isGroceryCategory(p.category || "");
    const addToCartBtn = isGrocery 
        ? `<button class="add-cart-btn" onclick="event.stopPropagation(); addToCartSimple('${p.id}')">Add to Cart</button>`
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

function addToCartSimple(productId) {
    try {
        let cart = JSON.parse(localStorage.getItem('ramazoneCart')) || [];
        const existing = cart.find(item => item.id === productId);
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({ id: productId, quantity: 1, variants: {} });
        }
        localStorage.setItem('ramazoneCart', JSON.stringify(cart));
        
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

// --- UPDATED VARIANT POPUP LOGIC ---

function openVariantModal(currentProductId, groupId) {
    const overlay = document.getElementById('variant-overlay');
    const sheet = document.getElementById('variant-sheet');
    const list = document.getElementById('variant-list-container');
    
    let variants = [];

    // Strategy 1: Search by Group ID (New & Preferred)
    if (groupId) {
        variants = allProducts.filter(p => p.groupId === groupId);
    } 
    // Strategy 2: Search by Legacy Array (Fallback)
    else {
        const product = allProducts.find(p => p.id === currentProductId);
        if (product && product.variants) {
             // Mocking legacy variants to look like full products for display
             variants = product.variants.map((v, idx) => ({
                 id: currentProductId, // Note: Legacy variants might not have unique IDs
                 name: product.name,
                 displayPrice: v.price || product.displayPrice,
                 images: product.images,
                 variantValue: v.name || v.options?.[0]?.name || `Option ${idx+1}`,
                 variantType: "Option"
             }));
        }
    }

    if (variants.length === 0) return;

    // Generate List HTML
    let variantsHtml = variants.map(v => {
        const isSelected = v.id === currentProductId;
        // Display Logic: Use variantValue (e.g., "White", "1kg") if available, else Name
        const displayTitle = (v.variantValue && v.variantType) 
            ? `${v.variantValue}` 
            : v.name;
        
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

// History Functions
function renderSearchHistory() {
    const container = document.getElementById('recent-searches-container');
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    if (history.length === 0) { container.innerHTML = ''; return; }
    
    let html = `<div class="p-3 border-b border-gray-100 flex justify-between items-center"><span class="text-sm font-bold text-gray-600">Recent Searches</span><button onclick="localStorage.removeItem('${HISTORY_KEY}'); renderSearchHistory()" class="text-xs text-blue-600 font-bold">CLEAR</button></div>`;
    
    history.slice(0, 5).forEach(term => { 
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
    if (history.length > 8) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

window.executeSearch = (term) => {
    document.getElementById('main-search-input').value = term;
    document.getElementById('clear-search-btn').style.display = 'block';
    addToHistory(term);
    handleSearch(term);
}

