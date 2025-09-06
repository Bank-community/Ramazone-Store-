// --- GLOBAL STATE ---
let allProducts = [];
let allCategories = []; // Yeh ab poora object store karega (subcategories ke saath)
let currentCategory = 'All';
let currentSubcategory = 'All'; // NEW: Subcategory ke liye state
let database;
let searchScrollingTexts = [];

// --- CART FUNCTIONS (No changes here) ---
function getCart() { try { const cart = localStorage.getItem('ramazoneCart'); return cart ? JSON.parse(cart) : []; } catch (e) { return []; } }
function saveCart(cart) { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); }
function addToCart(productId, quantityToAdd = 1) { /* ... No changes ... */ }
function getTotalCartQuantity() { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); }
function updateCartIcon() { const totalQuantity = getTotalCartQuantity(); const cartCountElement = document.getElementById('cart-item-count'); if (cartCountElement) { if (totalQuantity > 0) { cartCountElement.textContent = totalQuantity; cartCountElement.classList.remove('hidden'); } else { cartCountElement.textContent = ''; cartCountElement.classList.add('hidden'); } } }
function showToast(message, type = "info") { const toast=document.getElementById("toast-notification");toast.textContent=message;toast.style.backgroundColor="error"===type?"#ef4444":"#333";toast.style.opacity = 1; setTimeout(()=> { toast.style.opacity = 0; }, 2500)}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeApp);

// IMPORTANT: Firebase scripts ko dynamically load kiya jaa raha hai.
function loadFirebaseScripts() {
    return new Promise((resolve, reject) => {
        const appScript = document.createElement('script');
        appScript.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js';
        appScript.onload = () => {
            const dbScript = document.createElement('script');
            dbScript.src = 'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js';
            dbScript.onload = resolve;
            dbScript.onerror = reject;
            document.head.appendChild(dbScript);
        };
        appScript.onerror = reject;
        document.head.appendChild(appScript);
    });
}

async function initializeApp() {
    try {
        await loadFirebaseScripts(); // Scripts load hone ka wait karein
        // NOTE: Ab config file server se fetch ki jayegi. Is function mein koi badlav nahi karna hai.
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


async function loadPageData() {
    try {
        await fetchAllData(database);
        const urlParams = new URLSearchParams(window.location.search);
        const categoryFromUrl = urlParams.get('category') || 'All';

        displayCategories(); // Hamesha categories display karein

        // Agar URL se category aayi hai, to use select karein
        if(categoryFromUrl !== 'All') {
            const catButton = document.querySelector(`.category-btn[data-category="${categoryFromUrl}"]`);
            if(catButton) {
                // Manually trigger a click to handle subcategory display and filtering
                catButton.click();
            } else {
                currentCategory = 'All';
                filterAndDisplayProducts();
            }
        } else {
            currentCategory = 'All';
            filterAndDisplayProducts();
        }

        setupSearch();
        updateCartIcon();
        setupDynamicPlaceholder();
        setupScrollBehavior();
        document.getElementById('loading-indicator').style.display = 'none';

    } catch (error) {
        console.error("Initialization or data fetch failed:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Data load nahi ho saka.</p>';
    }
}

async function fetchAllData(db) {
    const dbRef = db.ref('ramazone');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const homepageData = data.homepage || {};
        if (homepageData.search && homepageData.search.scrollingTexts) {
            searchScrollingTexts = homepageData.search.scrollingTexts;
        }
        allProducts = (data.products || []).filter(p => p && p.isVisible !== false);

        // --- UPDATED: Ab humein subcategories ke saath poora data chahiye ---
        allCategories = (homepageData.normalCategories || [])
            .filter(cat => cat && cat.name && cat.size !== 'double'); // Double size wali category ko chhod do
    }
}

function setupDynamicPlaceholder() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput || !searchScrollingTexts || searchScrollingTexts.length === 0) {
        searchInput.placeholder = "Search for products...";
        return;
    }
    let currentIndex = 0;
    const updatePlaceholder = () => {
        searchInput.placeholder = `Search for ${searchScrollingTexts[currentIndex]}...`;
        currentIndex = (currentIndex + 1) % searchScrollingTexts.length;
    };
    updatePlaceholder();
    setInterval(updatePlaceholder, 3000);
}

// --- === MAJOR UPDATE TO CATEGORY AND SUBCATEGORY LOGIC === ---

function displayCategories() {
    const categoryBar = document.getElementById('category-filter-bar');
    categoryBar.innerHTML = '';

    // "All" Button
    const allBtn = document.createElement('button');
    allBtn.className = 'category-btn rounded-full px-4 py-2 text-sm';
    allBtn.textContent = 'All';
    allBtn.dataset.category = 'All';
    if (currentCategory === 'All') allBtn.classList.add('active');
    categoryBar.appendChild(allBtn);

    // Other Category Buttons
    allCategories.forEach(cat => {
        if (cat && cat.name) {
            const catBtn = document.createElement('button');
            catBtn.className = 'category-btn rounded-full px-4 py-2 text-sm';
            catBtn.textContent = cat.name;
            catBtn.dataset.category = cat.name;
            if (currentCategory === cat.name) catBtn.classList.add('active');
            categoryBar.appendChild(catBtn);
        }
    });

    categoryBar.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;

        const selectedCategoryName = e.target.dataset.category;

        // Update main category state
        currentCategory = selectedCategoryName;
        currentSubcategory = 'All'; // Reset subcategory whenever main category changes
        document.getElementById('search-input').value = ''; 

        // Update active class for main categories
        categoryBar.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        // Find subcategories and display them
        const categoryData = allCategories.find(c => c.name === selectedCategoryName);
        if (categoryData && categoryData.subcategories && categoryData.subcategories.length > 0) {
            displaySubcategories(categoryData.subcategories);
        } else {
            // Hide subcategory bar if there are no subcategories or "All" is selected
            document.getElementById('subcategory-filter-container').classList.add('hidden');
        }

        filterAndDisplayProducts();
    });
}

function displaySubcategories(subcategories) {
    const subcategoryContainer = document.getElementById('subcategory-filter-container');
    const subcategoryBar = document.getElementById('subcategory-filter-bar');
    subcategoryBar.innerHTML = '';

    // "All" button for subcategories
    const allSubBtn = document.createElement('button');
    allSubBtn.className = 'subcategory-btn rounded-full px-3 py-1 text-xs active';
    allSubBtn.textContent = 'All';
    allSubBtn.dataset.subcategory = 'All';
    subcategoryBar.appendChild(allSubBtn);

    // Other subcategory buttons
    subcategories.forEach(sub => {
        if (sub && sub.name) {
            const subBtn = document.createElement('button');
            subBtn.className = 'subcategory-btn rounded-full px-3 py-1 text-xs';
            subBtn.textContent = sub.name;
            subBtn.dataset.subcategory = sub.name;
            subcategoryBar.appendChild(subBtn);
        }
    });

    // Show the container
    subcategoryContainer.classList.remove('hidden');

    // Add event listener to the subcategory bar
    subcategoryBar.addEventListener('click', (e) => {
        if(e.target.tagName !== 'BUTTON') return;

        currentSubcategory = e.target.dataset.subcategory;
        document.getElementById('search-input').value = '';

        subcategoryBar.querySelectorAll('.subcategory-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        filterAndDisplayProducts();
    });
}


function filterAndDisplayProducts() {
    const grid = document.getElementById('products-grid');
    const noProductsMsg = document.getElementById('no-products-message');
    const searchInput = document.getElementById('search-input').value.toLowerCase();
    grid.innerHTML = '';
    noProductsMsg.classList.add('hidden');

    let filteredProducts = allProducts;

    // 1. Filter by Main Category
    if (currentCategory !== 'All') {
        filteredProducts = filteredProducts.filter(prod => prod && prod.category === currentCategory);
    }

    // 2. Filter by Subcategory
    if (currentSubcategory !== 'All') {
        filteredProducts = filteredProducts.filter(prod => prod && prod.subcategory === currentSubcategory);
    }

    // 3. Filter by Search Query
    if (searchInput) {
        filteredProducts = filteredProducts.filter(prod => prod && prod.name && prod.name.toLowerCase().includes(searchInput));
    }

    if (filteredProducts.length > 0) {
        filteredProducts.forEach(prod => {
            grid.insertAdjacentHTML('beforeend', createProductCardHTML(prod));
        });
    } else {
        noProductsMsg.classList.remove('hidden');
    }
}

// --- UNCHANGED HELPER FUNCTIONS ---

function createProductCardHTML(prod) {
    if (!prod) return '';
    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';
    const ratingTag = prod.rating ? `<div class="card-rating-tag-new">${prod.rating} <i class="fas fa-star" style="color: #008E00;"></i></div>` : '';
    let priceLine = '';
    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        const discountHTML = discount > 0 ? `<span class="text-green-700 font-bold text-sm whitespace-nowrap">↓${discount}%</span>` : '';
        priceLine = `<div class="flex items-baseline gap-x-2 mt-2">${discountHTML} <span class="line-through text-gray-400 text-xs">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</span> <span class="font-bold text-gray-900 text-base">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</span></div>`;
    } else {
        priceLine = `<div class="flex items-baseline gap-x-2 mt-2"><span class="font-bold text-gray-900 text-base">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</span></div>`;
    }
    const titleHTML = `<h2 class="text-base font-semibold text-gray-800 truncate">${prod.brand || prod.name}</h2>${prod.brand ? `<p class="text-gray-500 text-xs truncate -mt-1">${prod.name}</p>` : ''}`;
    return `<a href="./product-details.html?id=${prod.id}" class="product-card-link"><div class="relative"><img src="${imageUrl}" class="w-full object-cover aspect-square" alt="${prod.name || 'Product'}" loading="lazy">${ratingTag}</div><div class="p-3 pt-4">${titleHTML}${priceLine}</div></a>`;
}

function setupScrollBehavior() {
    const header = document.getElementById('main-header');
    if (!header) return;
    let lastScrollY = window.scrollY;
    const headerHeight = header.offsetHeight;
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        if (currentScrollY > lastScrollY && currentScrollY > headerHeight) {
            header.classList.add('header-hidden');
            document.body.classList.add('header-is-hidden');
        } else if (currentScrollY < lastScrollY) {
            header.classList.remove('header-hidden');
            document.body.classList.remove('header-is-hidden');
        }
        lastScrollY = currentScrollY;
    }, { passive: true });
}

function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');
    const categorySuggestionsContainer = document.getElementById('category-suggestions');
    const searchOverlay = document.getElementById('search-overlay');
    categorySuggestionsContainer.innerHTML = allCategories.map(cat => `<span class="suggestion-tag" data-category="${cat.name}">${cat.name}</span>`).join('');
    categorySuggestionsContainer.addEventListener('click', e => {
        if(e.target.classList.contains('suggestion-tag')) {
            const categoryName = e.target.dataset.category;
            const categoryButton = document.querySelector(`#category-filter-bar .category-btn[data-category="${categoryName}"]`);
            if (categoryButton) categoryButton.click();
            searchInput.blur();
        }
    });
    searchInput.addEventListener('input', () => {
        currentCategory = 'All'; currentSubcategory = 'All'; // Reset filters on search
        document.querySelectorAll('.category-btn.active, .subcategory-btn.active').forEach(b=>b.classList.remove('active'));
        document.querySelector('.category-btn[data-category="All"]').classList.add('active');
        document.getElementById('subcategory-filter-container').classList.add('hidden');
        filterAndDisplayProducts();
        const query = searchInput.value.toLowerCase();
        if (query.length < 1) { suggestionsContainer.classList.add('hidden'); return; }
        const suggestions = allProducts.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions.map(prod => `<a href="./product-details.html?id=${prod.id}" class="suggestion-item"><img src="${(prod.images && prod.images[0]) || 'https://placehold.co/100x100/e2e8f0/64748b?text=?'}" alt="${prod.name}"><span class="text-sm text-gray-700">${prod.name}</span></a>`).join('');
            suggestionsContainer.classList.remove('hidden');
        } else { suggestionsContainer.classList.add('hidden'); }
    });
    const activateSearchMode = () => { document.body.classList.add('search-active'); categorySuggestionsContainer.classList.remove('hidden'); };
    const deactivateSearchMode = () => { document.body.classList.remove('search-active'); categorySuggestionsContainer.classList.add('hidden'); suggestionsContainer.classList.add('hidden'); };
    searchInput.addEventListener('focus', activateSearchMode);
    searchOverlay.addEventListener('click', () => searchInput.blur());
    searchInput.addEventListener('blur', () => { setTimeout(deactivateSearchMode, 150); });
}

