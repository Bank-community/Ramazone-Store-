// product-search.js
// Handles Search, History, Suggestions, and Smart Layouts

let allProducts = [];
let displayedCount = 0;
let currentResults = [];
let BATCH_SIZE = 10;
const CACHE_KEY = "RAMAZONE_DATA_V2";
const HISTORY_KEY = "RAMAZONE_SEARCH_HISTORY";
const DEFAULT_LOCATION = "ALL_AREAS"; 

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('main-search-input');
    const clearBtn = document.getElementById('clear-search-btn'); // Get Clear Button
    
    // Auto Focus
    setTimeout(() => { input.focus(); }, 100); 

    loadData();
    renderSearchHistory();

    // Input Event (Show/Hide Clear Button)
    input.addEventListener('input', (e) => {
        const val = e.target.value;
        // Toggle Clear Button
        clearBtn.style.display = val.length > 0 ? 'block' : 'none';
        handleSearch(val);
    });
    
    // Clear Button Click Event
    clearBtn.addEventListener('click', () => {
        input.value = ''; // Clear text
        clearBtn.style.display = 'none'; // Hide button
        handleSearch(''); // Reset search logic (Show default view)
        input.focus(); // Keep keyboard open
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
            
            // Strict Filtering
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

// ... (Rest of the functions: History, Categories, Trending, Search Logic remain same) ...

function renderSearchHistory() {
    const container = document.getElementById('recent-searches-container');
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    if (history.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    let html = '';
    history.slice(0, 3).forEach(term => { 
        html += `<div class="history-item" onclick="executeSearch('${term}')"><i class="fas fa-history history-icon"></i><span class="history-text">${term}</span><i class="fas fa-arrow-left history-arrow" style="transform: rotate(45deg);"></i></div>`;
    });
    container.innerHTML = html;
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
    categories.forEach(c => uniqueCats.add(c.name));
    allProducts.forEach(p => { if(p.category) uniqueCats.add(p.category); });
    let html = '';
    uniqueCats.forEach(cat => { html += `<span class="cat-chip" onclick="executeSearch('${cat}')">${cat}</span>`; });
    container.innerHTML = html;
}

function renderTrendingProducts() {
    const container = document.getElementById('trending-products-container');
    if(allProducts.length === 0) { container.innerHTML = '<p class="p-4 text-xs text-gray-400">No products available.</p>'; return; }
    const trending = allProducts.sort(() => 0.5 - Math.random()).slice(0, 6);
    let html = "";
    trending.forEach(p => { html += createListCard(p); });
    container.innerHTML = html;
}

window.executeSearch = (term) => {
    const input = document.getElementById('main-search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    input.value = term;
    clearBtn.style.display = 'block'; // Show clear button on click search
    addToHistory(term);
    handleSearch(term);
}

function handleSearch(query) {
    const defaultView = document.getElementById('default-search-view');
    const resultsWrapper = document.getElementById('search-results-wrapper');
    const container = document.getElementById('search-results-container');
    const noRes = document.getElementById('no-results-msg');

    query = query.trim().toLowerCase();

    if (query.length === 0) {
        defaultView.style.display = 'block';
        resultsWrapper.classList.add('hidden');
        renderSearchHistory(); 
        return;
    }

    defaultView.style.display = 'none';
    resultsWrapper.classList.remove('hidden');

    currentResults = allProducts.filter(p => {
        return (p.name && p.name.toLowerCase().includes(query)) ||
               (p.category && p.category.toLowerCase().includes(query)) ||
               (p.tags && p.tags.some(t => t.toLowerCase().includes(query)));
    });

    displayedCount = 0;
    container.innerHTML = ''; 

    if (currentResults.length === 0) {
        noRes.classList.remove('hidden');
    } else {
        noRes.classList.add('hidden');
        const primaryCat = currentResults[0].category || "";
        const isGrocery = isGroceryCategory(primaryCat);
        if (!isGrocery) container.className = "grid-container pb-10";
        else container.className = "pb-10";
        loadMore(isGrocery);
    }
}

function isGroceryCategory(cat) {
    const groceryKeywords = ['grocery', 'kirana', 'food', 'dal', 'rice', 'oil', 'masala', 'kitchen', 'daily', 'dry fruit', 'snacks'];
    return groceryKeywords.some(k => cat.toLowerCase().includes(k));
}

function loadMore(forceLayoutType) {
    if (displayedCount >= currentResults.length) return;
    const container = document.getElementById('search-results-container');
    const batch = currentResults.slice(displayedCount, displayedCount + BATCH_SIZE);
    const isGrocery = (forceLayoutType !== undefined) ? forceLayoutType : isGroceryCategory(currentResults[0]?.category || "");
    let html = "";
    batch.forEach(p => {
        if (isGrocery) html += createListCard(p);
        else html += createGridCard(p);
    });
    container.insertAdjacentHTML('beforeend', html);
    displayedCount += batch.length;
}

function createListCard(p) {
    const price = `₹${Number(p.displayPrice).toLocaleString()}`;
    const oldPrice = p.originalPrice > p.displayPrice ? `₹${Number(p.originalPrice).toLocaleString()}` : '';
    const discount = p.originalPrice > p.displayPrice ? Math.round(((p.originalPrice - p.displayPrice)/p.originalPrice)*100) + '% OFF' : '';
    return `<div class="prod-card-list" onclick="location.href='product-details.html?id=${p.id}'"><div class="list-img-box"><img src="${p.images?.[0] || 'placeholder.jpg'}" alt="${p.name}"></div><div class="list-info-box"><h3 class="list-title">${p.name}</h3><div class="flex items-center gap-2 mt-1"><span class="list-price">${price}</span><span class="list-old-price">${oldPrice}</span><span class="text-xs text-green-600 font-bold">${discount}</span></div></div></div>`;
}

function createGridCard(p) {
    const price = `₹${Number(p.displayPrice).toLocaleString()}`;
    const oldPrice = p.originalPrice > p.displayPrice ? `₹${Number(p.originalPrice).toLocaleString()}` : '';
    const rating = p.rating ? `<div class="bg-green-600 text-white text-[10px] px-1.5 rounded inline-flex items-center gap-1">${p.rating} <i class="fas fa-star text-[8px]"></i></div>` : '';
    return `<div class="prod-card-grid" onclick="location.href='product-details.html?id=${p.id}'"><div class="grid-img-box"><img src="${p.images?.[0] || 'placeholder.jpg'}" alt="${p.name}"></div><div class="flex flex-col"><h3 class="grid-title">${p.name}</h3><div class="mt-1">${rating}</div><div class="grid-price">${price} <span class="text-xs text-gray-400 font-normal line-through ml-1">${oldPrice}</span></div></div></div>`;
}

