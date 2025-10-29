// --- GLOBAL STATE ---
let allProducts = [];
let allCategories = []; 
let currentCategory = 'All';
let currentSubcategory = 'All';
let database;
let searchScrollingTexts = [];

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
    showToast('Successfully added to cart!', 'success'); 
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

// --- INITIALIZATION (No Change) ---
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
    // (No Change)
    try {
        await fetchAllData(database);
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
        document.getElementById('loading-indicator').style.display = 'none';
    } catch (error) {
        console.error("Initialization or data fetch failed:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Data load nahi ho saka.</p>';
    }
}

async function fetchAllData(db) {
    // (No Change)
    const dbRef = db.ref('ramazone');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const homepageData = data.homepage || {};
        if (homepageData.search && homepageData.search.scrollingTexts) {
            searchScrollingTexts = homepageData.search.scrollingTexts;
        }
        allProducts = (data.products || []).filter(p => p && p.isVisible !== false);
        allCategories = (homepageData.normalCategories || [])
            .filter(cat => cat && cat.name && cat.size !== 'double');
    }
}

function setupDynamicPlaceholder() {
    // (No Change)
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

// --- CATEGORY & SUBCATEGORY LOGIC (No Change) ---
function displayCategories() {
    // (No Change)
    const categoryBar = document.getElementById('category-filter-bar');
    categoryBar.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'category-btn rounded-full px-4 py-2 text-sm';
    allBtn.textContent = 'All';
    allBtn.dataset.category = 'All';
    if (currentCategory === 'All') allBtn.classList.add('active');
    categoryBar.appendChild(allBtn);
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
        currentCategory = selectedCategoryName;
        currentSubcategory = 'All'; 
        document.getElementById('search-input').value = ''; 
        categoryBar.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        const categoryData = allCategories.find(c => c.name === selectedCategoryName);
        if (categoryData && categoryData.subcategories && categoryData.subcategories.length > 0) {
            displaySubcategories(categoryData.subcategories);
        } else {
            document.getElementById('subcategory-filter-container').classList.add('hidden');
        }
        filterAndDisplayProducts();
    });
}
function displaySubcategories(subcategories) {
    // (No Change)
    const subcategoryContainer = document.getElementById('subcategory-filter-container');
    const subcategoryBar = document.getElementById('subcategory-filter-bar');
    subcategoryBar.innerHTML = '';
    const allSubBtn = document.createElement('button');
    allSubBtn.className = 'subcategory-btn rounded-full px-3 py-1 text-xs active';
    allSubBtn.textContent = 'All';
    allSubBtn.dataset.subcategory = 'All';
    subcategoryBar.appendChild(allSubBtn);
    subcategories.forEach(sub => {
        if (sub && sub.name) {
            const subBtn = document.createElement('button');
            subBtn.className = 'subcategory-btn rounded-full px-3 py-1 text-xs';
            subBtn.textContent = sub.name;
            subBtn.dataset.subcategory = sub.name;
            subcategoryBar.appendChild(subBtn);
        }
    });
    subcategoryContainer.classList.remove('hidden');
    subcategoryBar.addEventListener('click', (e) => {
        if(e.target.tagName !== 'BUTTON') return;
        currentSubcategory = e.target.dataset.subcategory;
        document.getElementById('search-input').value = '';
        subcategoryBar.querySelectorAll('.subcategory-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        filterAndDisplayProducts();
    });
}

// --- FILTER & DISPLAY (No Change) ---
function filterAndDisplayProducts() {
    // (No Change)
    const grid = document.getElementById('products-grid');
    const noProductsMsg = document.getElementById('no-products-message');
    const searchInput = document.getElementById('search-input').value.toLowerCase();
    grid.innerHTML = '';
    noProductsMsg.classList.add('hidden');
    let filteredProducts = allProducts;
    if (currentCategory !== 'All') {
        filteredProducts = filteredProducts.filter(prod => prod && prod.category === currentCategory);
    }
    if (currentSubcategory !== 'All') {
        filteredProducts = filteredProducts.filter(prod => prod && prod.subcategory === currentSubcategory);
    }
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
    const productPageUrl = `${window.location.origin}/product-details.html?id=${prod.id}`;
    const whatsappMessage = `Hello! I am interested in this product:\n\n*Name:* ${prod.name}\n*Price:* ₹${Number(prod.displayPrice).toLocaleString("en-IN")}\n*Link:* ${productPageUrl}\n\nPlease provide more details.`;
    const whatsappLink = `https://wa.me/917903698180?text=${encodeURIComponent(whatsappMessage)}`; 
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
                <a href="${whatsappLink}" target="_blank" class="whatsapp-btn">
                    <img src="https://www.svgrepo.com/show/452133/whatsapp.svg" alt="WhatsApp">
                </a>
                <button class="add-text-btn add-btn" data-id="${prod.id}">Add</button>
            </div>
        </div>
    </div>`;
}

// --- SCROLL BEHAVIOR (No Change) ---
function setupScrollBehavior() {
    // (No Change)
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

/**
 * === SEARCH FUNCTION (UPDATED) ===
 * Ab 'search-form' ke submit event ko handle karta hai.
 */
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const searchForm = document.getElementById('search-form'); // NEW: Form ko select karein
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

    // --- NEW: Submit Event Listener ---
    // Jab user keyboard par 'Search' / 'Enter' dabata hai
    if (searchForm) {
        searchForm.addEventListener('submit', (event) => {
            event.preventDefault(); // Page ko reload hone se rokein
            searchInput.blur();     // Keyboard ko hide karein
        });
    }
    // --- END OF NEW LISTENER ---

    // Live search (jaise type karein)
    searchInput.addEventListener('input', () => {
        currentCategory = 'All'; currentSubcategory = 'All'; 
        document.querySelectorAll('.category-btn.active, .subcategory-btn.active').forEach(b=>b.classList.remove('active'));
        document.querySelector('.category-btn[data-category="All"]').classList.add('active');
        document.getElementById('subcategory-filter-container').classList.add('hidden');
        
        filterAndDisplayProducts(); // Live results dikhayein
        
        const query = searchInput.value.toLowerCase();
        if (query.length < 1) { 
            suggestionsContainer.classList.add('hidden'); 
            return; 
        }
        const suggestions = allProducts.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5);
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions.map(prod => `<a href="./product-details.html?id=${prod.id}" class="suggestion-item"><img src="${(prod.images && prod.images[0]) || 'https://placehold.co/100x100/e2e8f0/64748b?text=?'}" alt="${prod.name}"><span class="text-sm text-gray-700">${prod.name}</span></a>`).join('');
            suggestionsContainer.classList.remove('hidden');
        } else { 
            suggestionsContainer.classList.add('hidden'); 
        }
    });
    
    // Search UI ko activate/deactivate karna (No Change)
    const activateSearchMode = () => { document.body.classList.add('search-active'); categorySuggestionsContainer.classList.remove('hidden'); };
    const deactivateSearchMode = () => { document.body.classList.remove('search-active'); categorySuggestionsContainer.classList.add('hidden'); suggestionsContainer.classList.add('hidden'); };
    
    searchInput.addEventListener('focus', activateSearchMode);
    searchOverlay.addEventListener('click', () => searchInput.blur());
    searchInput.addEventListener('blur', () => { setTimeout(deactivateSearchMode, 150); });
}


// --- PRODUCT CARD EVENT LISTENER (No Change) ---
function setupProductCardEventListeners() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    grid.addEventListener('click', function(event) {
        const addButton = event.target.closest('.add-btn');
        if (addButton) {
            event.preventDefault(); 
            const productId = addButton.dataset.id;
            
            if (productId && !addButton.classList.contains('added')) {
                addToCart(productId);
                addButton.classList.add('added');
                addButton.textContent = 'Added ✓';
                setTimeout(() => {
                    addButton.classList.remove('added');
                    addButton.textContent = 'Add';
                }, 1500);
            }
        }
    });
}


