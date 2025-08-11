// --- GLOBAL STATE ---
let allProducts = [];
let allCategories = [];
let currentCategory = 'All';
let database;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * Fetches Firebase config securely, initializes Firebase, and starts the application.
 */
async function initializeApp() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        
        const firebaseConfig = await response.json();

        if (firebaseConfig.apiKey) {
            firebase.initializeApp(firebaseConfig);
            database = firebase.database();
            loadPageData();
        } else {
            throw new Error("Firebase config is missing or invalid.");
        }
    } catch (error) {
        console.error("Could not initialize Firebase:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Could not initialize application.</p>';
    }
}

/**
 * Loads all necessary data and then sets up the page.
 */
async function loadPageData() {
    try {
        await fetchAllData(database);
        
        const urlParams = new URLSearchParams(window.location.search);
        currentCategory = urlParams.get('category') || 'All';

        displayCategories();
        filterAndDisplayProducts();
        setupSearch();
        document.getElementById('loading-indicator').style.display = 'none';
        
        if (urlParams.get('focus') === 'true') {
            document.getElementById('search-input').focus();
        }

    } catch (error) {
        console.error("Initialization or data fetch failed:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Data load nahi ho saka.</p>';
    }
}

/**
 * Fetches and combines all product and category data from Firebase.
 * @param {object} db - The initialized Firebase database instance.
 */
async function fetchAllData(db) {
    const dbRef = db.ref('ramazone');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const homepageData = data.homepage || {};
        
        const mainProducts = data.products || [];
        
        const festiveProductIds = homepageData.festiveCollection?.productIds || [];
        const jfyMainProductId = homepageData.justForYou?.topDeals?.mainProductId;
        const jfySubProductIds = homepageData.justForYou?.topDeals?.subProductIds || [];
        
        const allReferencedIds = new Set([
            ...festiveProductIds,
            jfyMainProductId,
            ...jfySubProductIds
        ].filter(Boolean));

        const referencedProducts = mainProducts.filter(p => allReferencedIds.has(p.id));
        const combinedProducts = [...mainProducts, ...referencedProducts];

        allProducts = combinedProducts.filter((p, index, self) =>
            p && p.id && index === self.findIndex((t) => t.id === p.id)
        );
        
        allCategories = (homepageData.normalCategories || []).filter((cat, index, self) => 
            cat && cat.name && index === self.findIndex(c => c.name === cat.name)
        );
    }
}

function displayCategories() {
    const categoryBar = document.getElementById('category-filter-bar');
    categoryBar.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'category-btn rounded-full';
    allBtn.textContent = 'All';
    allBtn.dataset.category = 'All';
    if (currentCategory === 'All') allBtn.classList.add('active');
    categoryBar.appendChild(allBtn);

    allCategories.forEach(cat => {
        if (cat && cat.name) {
            const catBtn = document.createElement('button');
            catBtn.className = 'category-btn rounded-full';
            catBtn.textContent = cat.name;
            catBtn.dataset.category = cat.name;
            if (currentCategory === cat.name) catBtn.classList.add('active');
            categoryBar.appendChild(catBtn);
        }
    });

    categoryBar.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentCategory = e.target.dataset.category;
            document.getElementById('search-input').value = ''; 
            categoryBar.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            filterAndDisplayProducts();
        }
    });
}

function filterAndDisplayProducts() {
    const grid = document.getElementById('products-grid');
    const noProductsMsg = document.getElementById('no-products-message');
    const searchInput = document.getElementById('search-input').value.toLowerCase();
    grid.innerHTML = '';
    noProductsMsg.classList.add('hidden');

    let filteredProducts = allProducts;
    if (currentCategory !== 'All') {
        filteredProducts = filteredProducts.filter(prod => prod && prod.category === currentCategory);
    }
    if (searchInput) {
        filteredProducts = filteredProducts.filter(prod => prod.name.toLowerCase().includes(searchInput));
    }

    if (filteredProducts.length > 0) {
        filteredProducts.forEach(prod => {
            grid.insertAdjacentHTML('beforeend', createProductCardHTML(prod));
        });
    } else {
        noProductsMsg.classList.remove('hidden');
    }
}

function createProductCardHTML(prod) {
    if (!prod) return '';
    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';
    const ratingTag = prod.rating ? `<div class="product-rating-tag">${prod.rating} <i class="fas fa-star"></i></div>` : '';
    const offerTag = prod.offerText ? `<span class="product-offer-tag" style="color:${prod.offerTextColor||'white'}; background-color:${prod.offerBackgroundColor||'#4F46E5'}">${prod.offerText}</span>` : '';
    let priceHTML = `<p class="text-lg font-bold text-gray-800">₹${Number(prod.displayPrice).toLocaleString('en-IN')}</p>`;
    let discountHTML = '';

    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        priceHTML = `<div class="flex items-baseline gap-2 justify-center"><p class="text-lg font-bold text-gray-800">₹${Number(prod.displayPrice).toLocaleString('en-IN')}</p><p class="text-sm text-gray-400 line-through">₹${Number(prod.originalPrice).toLocaleString('en-IN')}</p></div>`;
        if (discount > 0) discountHTML = `<p class="product-discount">${discount}% OFF</p>`;
    }

    return `<a href="./product-details.html?id=${prod.id}" class="product-card">
                <div class="product-image-container"><img src="${imageUrl}" alt="${prod.name || 'Product'}">${ratingTag}${offerTag}</div>
                <div class="product-details"><p class="product-name truncate">${prod.name || 'Product Name'}</p>${priceHTML}${discountHTML}</div>
            </a>`;
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const categorySuggestionsContainer = document.getElementById('category-suggestions');
    const searchOverlay = document.getElementById('search-overlay');
    const closeSearchBtn = document.getElementById('close-search-btn');

    categorySuggestionsContainer.innerHTML = allCategories.map(cat => `<span class="suggestion-tag" data-category="${cat.name}">${cat.name}</span>`).join('');
    
    categorySuggestionsContainer.addEventListener('click', e => {
        if(e.target.classList.contains('suggestion-tag')) {
            const categoryName = e.target.dataset.category;
            document.querySelector(`#category-filter-bar .category-btn[data-category="${categoryName}"]`).click();
            searchInput.blur();
        }
    });

    searchInput.addEventListener('input', () => {
        filterAndDisplayProducts();
        const query = searchInput.value.toLowerCase();
        if (query.length < 2) {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.classList.add('hidden');
            return;
        }
        const suggestions = allProducts.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions.map(prod => `
                <a href="./product-details.html?id=${prod.id}" class="suggestion-item">
                    <img src="${(prod.images && prod.images[0]) || ''}" alt="${prod.name}">
                    <span>${prod.name}</span>
                </a>`).join('');
            suggestionsContainer.classList.remove('hidden');
        } else {
            suggestionsContainer.classList.add('hidden');
        }
    });

    const activateSearchMode = () => { document.body.classList.add('search-active'); categorySuggestionsContainer.classList.remove('hidden'); };
    const deactivateSearchMode = () => { document.body.classList.remove('search-active'); categorySuggestionsContainer.classList.add('hidden'); suggestionsContainer.classList.add('hidden'); };

    searchInput.addEventListener('focus', activateSearchMode);
    searchOverlay.addEventListener('click', () => searchInput.blur());
    closeSearchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if(searchInput.value) { searchInput.value = ''; filterAndDisplayProducts(); } 
        else { window.location.href = './index.html'; }
    });
    searchInput.addEventListener('blur', () => { setTimeout(deactivateSearchMode, 150); });
}
