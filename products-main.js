// --- GLOBAL STATE ---
let allProducts = [];
let allCategories = [];
let currentCategory = 'All';
let database;
let searchScrollingTexts = [];

// --- CART FUNCTIONS ---
function getCart() { try { const cart = localStorage.getItem('ramazoneCart'); return cart ? JSON.parse(cart) : []; } catch (e) { return []; } }
function saveCart(cart) { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); }

function addToCart(productId, quantityToAdd = 1) {
    const cart = getCart();
    const product = allProducts.find(p => p && p.id === productId);

    if (!product) {
        console.error(`Product with ID ${productId} not found.`);
        showToast('Could not add item to cart.', 'error');
        return;
    }

    let selectedVariants = {};
    let hasVariants = false;

    if (product.variants && Array.isArray(product.variants)) {
        product.variants.forEach(variant => {
            if (variant.type && Array.isArray(variant.options) && variant.options.length > 0) {
                selectedVariants[variant.type] = variant.options[0].name;
                hasVariants = true;
            }
        });
    }

    if (!hasVariants) {
        selectedVariants = {};
    }

    const existingItemIndex = cart.findIndex(item => {
        if (item.id !== productId) return false;
        const variantsMatch = JSON.stringify(item.variants || {}) === JSON.stringify(selectedVariants);
        return variantsMatch;
    });

    if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += quantityToAdd;
    } else {
        const newItem = {
            id: productId,
            quantity: quantityToAdd,
            variants: selectedVariants
        };
        cart.push(newItem);
    }

    saveCart(cart);
    showToast(`${product.name} added to cart!`);
    updateCartIcon();
}

function getTotalCartQuantity() { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); }
function updateCartIcon() { const totalQuantity = getTotalCartQuantity(); const cartCountElement = document.getElementById('cart-item-count'); if (cartCountElement) { if (totalQuantity > 0) { cartCountElement.textContent = totalQuantity; cartCountElement.classList.remove('hidden'); } else { cartCountElement.textContent = ''; cartCountElement.classList.add('hidden'); } } }
function showToast(message, type = "info") { const toast=document.getElementById("toast-notification");toast.textContent=message;toast.style.backgroundColor="error"===type?"#ef4444":"#333";toast.style.opacity = 1; setTimeout(()=> { toast.style.opacity = 0; }, 2500)}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeApp);

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

async function loadPageData() {
    try {
        await fetchAllData(database);
        const urlParams = new URLSearchParams(window.location.search);
        currentCategory = urlParams.get('category') || 'All';
        displayCategories();
        filterAndDisplayProducts();
        setupSearch();
        setupGlobalEventListeners();
        updateCartIcon();
        setupDynamicPlaceholder();
        setupScrollBehavior();
        document.getElementById('loading-indicator').style.display = 'none';
        if (urlParams.get('focus') === 'true') {
            document.getElementById('search-input').focus();
        }
    } catch (error) {
        console.error("Initialization or data fetch failed:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Data load nahi ho saka.</p>';
    }
}

// --- UPDATED FUNCTION ---
async function fetchAllData(db) {
    const dbRef = db.ref('ramazone');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const homepageData = data.homepage || {};
        if (homepageData.search && homepageData.search.scrollingTexts) {
            searchScrollingTexts = homepageData.search.scrollingTexts;
        }

        // ** YAHAN BADLAV KIYA GAYA HAI **
        // Pehle sabhi products ko filter karo jo visible hain
        const visibleProducts = (data.products || []).filter(p => p && p.isVisible !== false);

        const festiveProductIds = homepageData.festiveCollection?.productIds || [];
        const jfyMainProductId = homepageData.justForYou?.topDeals?.mainProductId;
        const jfySubProductIds = homepageData.justForYou?.topDeals?.subProductIds || [];

        const allReferencedIds = new Set([...festiveProductIds, jfyMainProductId, ...jfySubProductIds].filter(Boolean));

        // Referenced products bhi visible products me se hi lo
        const referencedProducts = visibleProducts.filter(p => allReferencedIds.has(p.id));

        const combinedProducts = [...visibleProducts, ...referencedProducts];

        // Final list se duplicate hata do
        allProducts = combinedProducts.filter((p, index, self) =>
            p && p.id && index === self.findIndex((t) => t.id === p.id)
        );

        allCategories = (homepageData.normalCategories || [])
            .filter(cat => cat && cat.name && cat.size !== 'double')
            .filter((cat, index, self) => 
                index === self.findIndex(c => c.name === cat.name)
        );
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

function displayCategories() {
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
    let filteredProducts = allProducts; // allProducts ab pehle se hi filtered hai
    if (currentCategory !== 'All') {
        filteredProducts = filteredProducts.filter(prod => prod && prod.category === currentCategory);
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

function createProductCardHTML(prod) {
    if (!prod) return '';

    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';

    const ratingTag = prod.rating 
        ? `<div class="card-rating-tag-new">
             ${prod.rating} <i class="fas fa-star" style="color: #008E00;"></i>
           </div>` 
        : '';


    let priceLine = '';
    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        const discountHTML = discount > 0 ? `<span class="text-green-700 font-bold text-sm whitespace-nowrap">↓${discount}%</span>` : '';
        const originalPriceHTML = `<span class="line-through text-gray-400 text-xs whitespace-nowrap">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</span>`;
        const displayPriceHTML = `<span class="font-bold text-gray-900 text-base whitespace-nowrap">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</span>`;

        priceLine = `<div class="flex items-baseline gap-x-2 mt-2">${discountHTML} ${originalPriceHTML} ${displayPriceHTML}</div>`;
    } else {
        priceLine = `<div class="flex items-baseline gap-x-2 mt-2"><span class="font-bold text-gray-900 text-base whitespace-nowrap">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</span></div>`;
    }

    const titleHTML = `
        <h2 class="text-base font-semibold text-gray-800 truncate">${prod.brand || prod.name}</h2>
        ${prod.brand ? `<p class="text-gray-500 text-xs truncate -mt-1">${prod.name}</p>` : ''}
    `;

    return `
        <a href="./product-details.html?id=${prod.id}" class="product-card-link">
            <div class="relative">
                <img src="${imageUrl}" class="w-full object-cover aspect-square" alt="${prod.name || 'Product'}" loading="lazy">
                ${ratingTag}
            </div>
            <div class="p-3 pt-4">
                ${titleHTML}
                ${priceLine}
            </div>
        </a>`;
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
        } 
        else if (currentScrollY < lastScrollY) {
            header.classList.remove('header-hidden');
            document.body.classList.remove('header-is-hidden');
        }

        lastScrollY = currentScrollY;
    }, { passive: true });
}

function setupGlobalEventListeners() {
    // Is function ko abhi khali rakha gaya hai
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
        filterAndDisplayProducts();
        const query = searchInput.value.toLowerCase();
        if (query.length < 1) {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.classList.add('hidden');
            return;
        }
        const suggestions = allProducts.filter(p => p.name.toLowerCase().includes(query)).slice(0, 5); // allProducts ab filtered hai
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions.map(prod => `
                <a href="./product-details.html?id=${prod.id}" class="suggestion-item">
                    <img src="${(prod.images && prod.images[0]) || 'https://placehold.co/100x100/e2e8f0/64748b?text=?'}" alt="${prod.name}">
                    <span class="text-sm text-gray-700">${prod.name}</span>
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
    searchInput.addEventListener('blur', () => { setTimeout(deactivateSearchMode, 150); });
}

