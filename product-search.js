// product-search.js
// Restored to "10:53 AM" Version (Modern UI Logic)

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
    
    // Auto Focus with slight delay for mobile keyboards
    setTimeout(() => { input.focus(); }, 150); 

    loadData();
    renderSearchHistory();

    // Input Event
    input.addEventListener('input', (e) => {
        const val = e.target.value;
        clearBtn.style.display = val.length > 0 ? 'block' : 'none';
        handleSearch(val);
    });
    
    // Clear Button
    clearBtn.addEventListener('click', () => {
        input.value = ''; 
        clearBtn.style.display = 'none'; 
        handleSearch(''); 
        input.focus(); 
    });
    
    // Enter Key
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
            
            // Location & Visibility Filtering
            allProducts = rawProducts.filter(p => {
                if (p.isVisible === false) return false;
                if (p.availableAreas && Array.isArray(p.availableAreas) && p.availableAreas.length > 0) {
                    if (!p.availableAreas.includes(userLoc)) return false;
                }
                return true;
            });
            
            renderCategoryChips(data.homepage?.normalCategories || []);
            renderTrendingProducts();
        }
    } catch (e) { console.error("Data Load Error", e); }
}

function renderSearchHistory() {
    const container = document.getElementById('recent-searches-container');
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    
    if (history.length === 0) { container.innerHTML = ''; return; }
    
    let html = `<div class="section-header"><span>Recent Searches</span><button onclick="clearHistory()" class="text-xs text-red-500 font-medium">Clear</button></div>`;
    
    history.slice(0, 3).forEach(term => { 
        html += `
        <div class="history-item" onclick="executeSearch('${term}')">
            <div class="history-icon"><i class="fas fa-history"></i></div>
            <span class="history-text">${term}</span>
            <i class="fas fa-arrow-left history-arrow"></i>
        </div>`;
    });
    container.innerHTML = html;
}

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderSearchHistory();
}

function addToHistory(term) {
    if(!term || term.trim() === '') return;
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    history = history.filter(h => h.toLowerCase() !== term.toLowerCase());
    history.unshift(term);
    if (history.length > 5) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function renderCategoryChips(categories) {
    const container = document.getElementById('category-suggestions');
    if (!categories) return;
    const uniqueCats = new Set();
    
    // Collect categories from Homepage config + Products
    categories.forEach(c => uniqueCats.add(c.name));
    allProducts.forEach(p => { if(p.category) uniqueCats.add(p.category); });
    
    let html = '';
    uniqueCats.forEach(cat => { html += `<span class="cat-chip" onclick="executeSearch('${cat}')">${cat}</span>`; });
    container.innerHTML = html;
}

function renderTrendingProducts() {
    const container = document.getElementById('trending-products-container');
    const section = document.getElementById('trending-section');
    
    if(allProducts.length === 0) { section.classList.add('hidden'); return; }
    
    section.classList.remove('hidden');
    // Randomize for "Trending" feel
    const trending = [...allProducts].sort(() => 0.5 - Math.random()).slice(0, 8);
    
    let html = "";
    trending.forEach(p => { 
        html += createTrendingCard(p); 
    });
    container.innerHTML = html;
}

// NEW: Horizontal Scroll Card
function createTrendingCard(p) {
    const price = `₹${Number(p.displayPrice).toLocaleString()}`;
    const oldPrice = p.originalPrice > p.displayPrice ? `₹${Number(p.originalPrice).toLocaleString()}` : '';
    
    return `
    <div class="trending-card" onclick="location.href='product-details.html?id=${p.id}'">
        <div class="trending-img-box">
            <img src="${p.images?.[0] || 'placeholder.jpg'}" alt="${p.name}">
        </div>
        <div class="trending-info">
            <h3 class="trending-title">${p.name}</h3>
            <div>
                <span class="trending-price">${price}</span>
                <span class="trending-old-price">${oldPrice}</span>
            </div>
        </div>
    </div>`;
}

window.executeSearch = (term) => {
    const input = document.getElementById('main-search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    input.value = term;
    clearBtn.style.display = 'block'; 
    addToHistory(term);
    handleSearch(term);
}

// --- CORE SEARCH LOGIC UPDATE ---
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
        // Safe lowercasing
        const name = p.name ? p.name.toLowerCase() : "";
        const cat = p.category ? p.category.toLowerCase() : "";
        
        // 1. Check Name
        if (name.includes(query)) return true;
        
        // 2. Check Category
        if (cat.includes(query)) return true;
        
        // 3. Check Tags (Array)
        if (p.tags && Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(query))) return true;

        // 4. NEW: Check product_of_keyword (Array)
        if (p.product_of_keyword && Array.isArray(p.product_of_keyword)) {
            if (p.product_of_keyword.some(k => k.toLowerCase().includes(query))) return true;
        }

        return false;
    });

    displayedCount = 0;
    container.innerHTML = ''; 

    if (currentResults.length === 0) {
        noRes.classList.remove('hidden');
        document.getElementById('results-count-header').classList.add('hidden');
    } else {
        noRes.classList.add('hidden');
        document.getElementById('results-count-header').classList.remove('hidden');
        loadMore();
    }
}

function loadMore() {
    if (displayedCount >= currentResults.length) return;
    const container = document.getElementById('search-results-container');
    const batch = currentResults.slice(displayedCount, displayedCount + BATCH_SIZE);
    
    let html = "";
    batch.forEach(p => {
        html += createResultCard(p);
    });
    container.insertAdjacentHTML('beforeend', html);
    displayedCount += batch.length;
}

// NEW: Grid Result Card
function createResultCard(p) {
    const price = `₹${Number(p.displayPrice).toLocaleString()}`;
    // Rating Badge
    const ratingHtml = p.rating 
        ? `<div class="absolute bottom-2 left-2 bg-white/90 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm border border-gray-100 flex items-center gap-1">${p.rating} <i class="fas fa-star text-green-600 text-[8px]"></i></div>` 
        : '';

    return `
    <div class="result-card relative" onclick="location.href='product-details.html?id=${p.id}'">
        <div class="relative w-full aspect-square bg-white">
            <img src="${p.images?.[0] || 'placeholder.jpg'}" class="absolute inset-0 w-full h-full object-contain p-4" alt="${p.name}">
            ${ratingHtml}
        </div>
        <div class="result-details">
            <h3 class="result-title">${p.name}</h3>
            <div class="result-price">${price}</div>
        </div>
    </div>`;
}


