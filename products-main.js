// --- GLOBAL STATE ---
let allProducts = []; // Master list from DB
let filteredProducts = []; // List filtered by LOCATION
let allCategories = []; 
let allSubCategoriesCache = {}; // <-- YAHAN NAYA BADLAAV KIYA GAYA HAI
let currentCategory = 'All';
let currentSelectedSubcategories = []; // <-- YAHAN NAYA BADLAAV KIYA GAYA HAI (पुराना currentSubcategory हटा दिया)
let database;
let searchScrollingTexts = [];
let currentSortOrder = 'popularity'; 

// --- NEW CONSTANTS (Added from main.js) ---
const DEFAULT_LOCATION_KEY = "ALL_AREAS"; // Special key for no location
const CHOOSE_LOCATION_TEXT = "Choose Location";
const CART_ICON_SVG = "https://www.svgrepo.com/show/533042/cart-plus.svg";

// --- CART FUNCTIONS (No Change) ---
function getCart() { 
    try { 
        const cart = localStorage.getItem('ramazoneCart'); 
        return cart ? JSON.parse(cart) : []; 
    } catch (e) { 
        return []; 
    } 
}
function saveCart(cart) { 
    localStorage.setItem('ramazoneCart', JSON.stringify(cart)); 
}
function addToCart(productId, quantityToAdd = 1) {
    const cart = getCart();
    const product = allProducts.find(p => p && p.id === productId);
    if (!product) { 
        console.error('Product not found in cache:', productId);
        showToast('Could not add item to cart.', 'error'); 
        return; 
    }
    let selectedVariants = {};
    if (product.variants && Array.isArray(product.variants)) {
        product.variants.forEach(variant => {
            if (variant.type && Array.isArray(variant.options) && variant.options.length > 0) {
                selectedVariants[variant.type] = variant.options[0].name;
            }
        });
    }
    const existingItemIndex = cart.findIndex(item => 
        item.id === productId && 
        JSON.stringify(item.variants || {}) === JSON.stringify(selectedVariants)
    );
    if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += quantityToAdd;
    } else {
        cart.push({ id: productId, quantity: quantityToAdd, variants: selectedVariants });
    }
    saveCart(cart);
    updateCartIcon();
}
function getTotalCartQuantity() { 
    const cart = getCart(); 
    return cart.reduce((total, item) => total + item.quantity, 0); 
}
function updateCartIcon() { 
    const totalQuantity = getTotalCartQuantity(); 
    const cartCountElement = document.getElementById('cart-item-count'); 
    if (cartCountElement) { 
        if (totalQuantity > 0) { 
            cartCountElement.textContent = totalQuantity; 
            cartCountElement.classList.remove('hidden'); 
        } else { 
            cartCountElement.textContent = ''; 
            cartCountElement.classList.add('hidden'); 
        } 
    } 
}
function showToast(message, type = "info") { 
    const toast = document.getElementById("toast-notification");
    toast.textContent = message;
    toast.style.backgroundColor = "error" === type ? "#ef4444" : "success" === type ? "#16a34a" : "#333";
    toast.style.opacity = 1; 
    setTimeout(() => { toast.style.opacity = 0; }, 2500);
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeApp);

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
        await loadFirebaseScripts(); 
        const firebaseConfig = {
            apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
            authDomain: "re-store-8e5b3.firebaseapp.com",
            databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
        };
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
        
        filterProductsByLocation(); 

        const urlParams = new URLSearchParams(window.location.search);
        const categoryFromUrl = urlParams.get('category') || 'All';
        
        displayCategories(); 
        
        if(categoryFromUrl !== 'All') {
            const catButton = document.querySelector(`.category-btn[data-category="${categoryFromUrl}"]`);
            if(catButton) {
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
        setupProductCardEventListeners(); 
        setupSortModal(); 
        setupFilterModal(); // <-- YAHAN NAYA BADLAAV KIYA GAYA HAI
        
        document.getElementById('loading-indicator').style.display = 'none';

    } catch (error) {
        console.error("Initialization or data fetch failed:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Data load nahi ho saka.</p>';
    }
}

function filterProductsByLocation() {
    const currentLoc = localStorage.getItem('userLocation') || DEFAULT_LOCATION_KEY;

    if (currentLoc === DEFAULT_LOCATION_KEY) {
        filteredProducts = allProducts.filter(product => {
            return !product.availableAreas || !Array.isArray(product.availableAreas) || product.availableAreas.length === 0;
        });
        console.log(`Products Page: Filtered for "All Areas": ${filteredProducts.length} items.`);
    } else {
        filteredProducts = allProducts.filter(product => {
            const isAllArea = !product.availableAreas || !Array.isArray(product.availableAreas) || product.availableAreas.length === 0;
            const isAtLocation = product.availableAreas && product.availableAreas.includes(currentLoc);
            return isAllArea || isAtLocation;
        });
        console.log(`Products Page: Filtered for "${currentLoc}": ${filteredProducts.length} items.`);
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
        allProducts = (data.products || []).filter(p => p && p.isVisible !== false)
            .map(p => ({ ...p, createdAt: p.createdAt || '2020-01-01T00:00:00.000Z' })); 
        allCategories = (homepageData.normalCategories || [])
            .filter(cat => cat && cat.name && cat.size !== 'double');
        
        // --- YAHAN NAYA BADLAAV KIYA GAYA HAI ---
        // subCategories data ko load karo
        allSubCategoriesCache = data.subCategories || {};
        // --- BADLAAV END ---
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

// --- CATEGORY & SUBCATEGORY LOGIC (MODIFIED FOR FILTER BUTTON) ---
function displayCategories() {
    const categoryBar = document.getElementById('category-filter-bar');
    const filterBtn = document.getElementById('open-filter-modal-btn'); // Filter button ko select karo
    categoryBar.innerHTML = '';
    
    const allBtn = document.createElement('button');
    allBtn.className = 'category-btn rounded-full px-4 py-2 text-sm';
    allBtn.textContent = 'All';
    allBtn.dataset.category = 'All';
    if (currentCategory === 'All') allBtn.classList.add('active');
    categoryBar.appendChild(allBtn);
    
    const availableCategories = new Set(filteredProducts.map(p => p.category));
    
    allCategories.forEach(cat => {
        if (cat && cat.name && availableCategories.has(cat.name)) { 
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
        currentCategory = selectedCategoryName;
        currentSelectedSubcategories = []; // <-- YAHAN NAYA BADLAAV KIYA GAYA HAI (Subcategory filter reset karo)
        document.getElementById('search-input').value = ''; 
        categoryBar.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        // --- YAHAN NAYA BADLAAV KIYA GAYA HAI (FILTER BUTTON ENABLE/DISABLE) ---
        // Category key ko sanitize karo (jaisa admin panel mein hai)
        const catKey = currentCategory.replace(/[.#$/\[\]]/g, "_");
        
        if (currentCategory !== 'All' && allSubCategoriesCache[catKey] && allSubCategoriesCache[catKey].length > 0) {
            filterBtn.disabled = false;
        } else {
            filterBtn.disabled = true;
        }
        // --- BADLAAV END ---

        // Purana subcategory bar logic HATA DIYA GAYA
        document.getElementById('subcategory-filter-container').classList.add('hidden');
        
        filterAndDisplayProducts();
    });
}
// --- displaySubcategories() function ko poori tarah HATA DIYA GAYA ---


// --- FILTER & DISPLAY (MODIFIED for SUB-CATEGORY FILTER) ---
function filterAndDisplayProducts() {
    const grid = document.getElementById('products-grid');
    const noProductsMsg = document.getElementById('no-products-message');
    const searchInput = document.getElementById('search-input').value.toLowerCase();
    grid.innerHTML = '';
    noProductsMsg.classList.add('hidden');
    
    let productsToDisplay = filteredProducts;

    if (currentCategory !== 'All') {
        productsToDisplay = productsToDisplay.filter(prod => prod && prod.category === currentCategory);
    }
    
    // --- YAHAN NAYA BADLAAV KIYA GAYA HAI (SUB-CATEGORY FILTER) ---
    if (currentSelectedSubcategories.length > 0) {
        productsToDisplay = productsToDisplay.filter(prod => 
            prod && currentSelectedSubcategories.includes(prod.subcategory)
        );
    }
    // --- BADLAAV END ---
    
    if (searchInput) {
        productsToDisplay = productsToDisplay.filter(prod => {
            if (!prod) return false;
            const nameMatch = prod.name && prod.name.toLowerCase().includes(searchInput);
            let keywordMatch = false;
            if (prod.product_of_keyword && Array.isArray(prod.product_of_keyword)) {
                keywordMatch = prod.product_of_keyword.some(k => k.toLowerCase().includes(searchInput));
            }
            return nameMatch || keywordMatch;
        });
    }

    switch (currentSortOrder) {
        case 'popularity':
            productsToDisplay.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            break;
        case 'price-asc':
            productsToDisplay.sort((a, b) => (a.displayPrice || 0) - (b.displayPrice || 0));
            break;
        case 'price-desc':
            productsToDisplay.sort((a, b) => (b.displayPrice || 0) - (a.displayPrice || 0));
            break;
        case 'newest':
            productsToDisplay.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        default:
            productsToDisplay.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    if (productsToDisplay.length > 0) {
        grid.innerHTML = productsToDisplay.map(prod => createProductCardHTML(prod)).join('');
    } else {
        noProductsMsg.classList.remove('hidden');
    }
}

// --- PRODUCT CARD HTML (No Change) ---
function createProductCardHTML(prod) {
    if (!prod) return '';
    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';
    const ratingTag = prod.rating ? `<div class="card-rating-tag">${prod.rating} <i class="fas fa-star"></i></div>` : '';
    let priceHTML = '';
    let originalPriceHTML = '';
    let discountHTML = '';
    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        originalPriceHTML = `<p class="original-price">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</p>`;
        if (discount > 0) discountHTML = `<p class="product-discount">${discount}% OFF</p>`;
    }
    priceHTML = `<p class="display-price">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</p>`;
    const titleHTML = `<h2 class="product-name">${prod.name}</h2>`;

    return `
    <div class="product-card">
        <div class="product-media-container">
            <a href="./product-details.html?id=${prod.id}" class="block absolute inset-0">
                <img src="${imageUrl}" alt="${prod.name || 'Product'}" loading="lazy">
            </a>
            ${ratingTag}
        </div>
        <div class="product-card-info">
            <a href="./product-details.html?id=${prod.id}">
                ${titleHTML}
                <div class="price-container">
                    ${priceHTML}
                    ${originalPriceHTML}
                    ${discountHTML}
                </div>
            </a>
            <div class="product-card-actions">
                <button class="cart-btn add-btn" data-id="${prod.id}">
                    <img class="cart-icon-svg" src="${CART_ICON_SVG}" alt="Add to Cart">
                    <i class="fas fa-check cart-added-icon" style="display: none;"></i>
                </button>
                <button class="buy-text-btn" data-id="${prod.id}">Buy</button>
            </div>
        </div>
    </div>`;
}

// --- SCROLL BEHAVIOR (MODIFIED FOR STICKY BAR) ---
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

// --- SEARCH FUNCTION (MODIFIED FOR FILTER) ---
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const searchForm = document.getElementById('search-form'); 
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

    if (searchForm) {
        searchForm.addEventListener('submit', (event) => {
            event.preventDefault(); 
            filterAndDisplayProducts(); 
            searchInput.blur();     
        });
    }

    searchInput.addEventListener('input', () => {
        currentCategory = 'All'; 
        currentSelectedSubcategories = []; // <-- YAHAN NAYA BADLAAV KIYA GAYA HAI
        document.getElementById('open-filter-modal-btn').disabled = true; // <-- YAHAN NAYA BADLAAV KIYA GAYA HAI
        document.querySelectorAll('.category-btn.active').forEach(b=>b.classList.remove('active'));
        document.querySelector('.category-btn[data-category="All"]').classList.add('active');
        
        filterAndDisplayProducts(); // Live results dikhayein
        
        const query = searchInput.value.toLowerCase();
        if (query.length < 1) { 
            suggestionsContainer.classList.add('hidden'); 
            return; 
        }
        
        const suggestions = allProducts.filter(p => { 
            const nameMatch = p.name.toLowerCase().includes(query);
            let keywordMatch = false;
            if (p.product_of_keyword && Array.isArray(p.product_of_keyword)) {
                keywordMatch = p.product_of_keyword.some(k => k.toLowerCase().startsWith(query));
            }
            return nameMatch || keywordMatch;
        }).slice(0, 5);
        
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions.map(prod => `<a href="./product-details.html?id=${prod.id}" class="suggestion-item"><img src="${(prod.images && prod.images[0]) || 'https://placehold.co/100x100/e2e8f0/64748b?text=?'}" alt="${prod.name}"><span class="text-sm text-gray-700">${prod.name}</span></a>`).join('');
            suggestionsContainer.classList.remove('hidden');
        } else { 
            suggestionsContainer.classList.add('hidden'); 
        }
    });
    
    const activateSearchMode = () => { document.body.classList.add('search-active'); categorySuggestionsContainer.classList.remove('hidden'); };
    const deactivateSearchMode = () => { document.body.classList.remove('search-active'); categorySuggestionsContainer.classList.add('hidden'); suggestionsContainer.classList.add('hidden'); };
    
    searchInput.addEventListener('focus', activateSearchMode);
    searchOverlay.addEventListener('click', () => searchInput.blur());
    searchInput.addEventListener('blur', () => { setTimeout(deactivateSearchMode, 150); });
}


// --- SORT MODAL (No Change) ---
function setupSortModal() {
    const openBtn = document.getElementById('open-sort-modal-btn');
    const closeBtn = document.getElementById('sort-modal-close-btn');
    const overlay = document.getElementById('sort-modal-overlay');
    const options = document.querySelector('.sort-options-container');

    if (!openBtn || !closeBtn || !overlay || !options) {
        console.error('Sort modal elements not found!');
        return;
    }

    const openModal = () => {
        const currentRadio = document.querySelector(`input[name="sort-option"][value="${currentSortOrder}"]`);
        if (currentRadio) {
            currentRadio.checked = true;
        }
        overlay.classList.add('visible');
    };

    const closeModal = () => {
        overlay.classList.remove('visible');
    };

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { 
            closeModal();
        }
    });

    options.addEventListener('change', (e) => {
        if (e.target.name === 'sort-option') {
            currentSortOrder = e.target.value;
            filterAndDisplayProducts(); 
            setTimeout(closeModal, 200); 
        }
    });
}

// --- === YAHAN NAYA FUNCTION JODA GAYA HAI (FILTER MODAL) === ---
function setupFilterModal() {
    const openBtn = document.getElementById('open-filter-modal-btn');
    const closeBtn = document.getElementById('filter-modal-close-btn');
    const overlay = document.getElementById('filter-modal-overlay');
    const container = document.getElementById('filter-options-container');
    const clearBtn = document.getElementById('filter-clear-btn');
    const applyBtn = document.getElementById('filter-apply-btn');

    if (!openBtn || !closeBtn || !overlay || !container || !clearBtn || !applyBtn) {
        console.error('Filter modal elements not found!');
        return;
    }
    
    const openModal = () => {
        populateFilterModal();
        overlay.classList.add('visible');
    };

    const closeModal = () => {
        overlay.classList.remove('visible');
    };
    
    // Naya function: Popup ko sub-categories se bharo
    const populateFilterModal = () => {
        const catKey = currentCategory.replace(/[.#$/\[\]]/g, "_");
        const subs = allSubCategoriesCache[catKey] || [];
        
        if (subs.length === 0) {
            container.innerHTML = `<p class="p-4 text-center text-gray-500" id="filter-loading-msg">No sub-categories found for ${currentCategory}.</p>`;
            return;
        }
        
        container.innerHTML = subs.map(subName => {
            const isChecked = currentSelectedSubcategories.includes(subName);
            return `
                <div class="filter-option-item">
                    <label for="sub-${subName}">${subName}</label>
                    <input type="checkbox" id="sub-${subName}" name="sub-category" value="${subName}" ${isChecked ? 'checked' : ''}>
                </div>
            `;
        }).join('');
    };
    
    // "Clear" button par click
    clearBtn.addEventListener('click', () => {
        currentSelectedSubcategories = []; // Selection reset karo
        filterAndDisplayProducts(); // Products ko re-filter karo
        closeModal();
    });
    
    // "Apply" button par click
    applyBtn.addEventListener('click', () => {
        const selected = [];
        container.querySelectorAll('input[name="sub-category"]:checked').forEach(checkbox => {
            selected.push(checkbox.value);
        });
        currentSelectedSubcategories = selected; // Naya selection save karo
        filterAndDisplayProducts(); // Products ko re-filter karo
        closeModal();
    });

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { 
            closeModal();
        }
    });
}
// --- === NAYA FUNCTION END === ---

// --- PRODUCT CARD EVENT LISTENER (No Change) ---
function setupProductCardEventListeners() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    grid.addEventListener('click', function(event) {
        
        const buyButton = event.target.closest('.buy-text-btn');
        if (buyButton) {
            event.preventDefault();
            const productId = buyButton.dataset.id;
            if (productId) {
                addToCart(productId);
                window.location.href = 'order.html'; 
            }
            return; 
        }

        const addButton = event.target.closest('.cart-btn.add-btn');
        if (addButton) {
            event.preventDefault(); 
            const productId = addButton.dataset.id;
            
            if (productId && !addButton.classList.contains('added')) {
                addToCart(productId);
                showToast('Successfully added to cart!', 'success'); 
                
                const cartIcon = addButton.querySelector('.cart-icon-svg');
                const checkIcon = addButton.querySelector('.cart-added-icon');

                addButton.classList.add('added');
                if (cartIcon) cartIcon.style.display = 'none';
                if (checkIcon) checkIcon.style.display = 'inline-block';
                
                setTimeout(() => {
                    addButton.classList.remove('added');
                    if (cartIcon) cartIcon.style.display = 'inline-block';
                    if (checkIcon) checkIcon.style.display = 'none';
                }, 1500);
            }
        }
    });
}


