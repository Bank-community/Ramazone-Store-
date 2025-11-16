// --- GLOBAL STATE ---
let allProductsCache = [];
let allLocationsCache = {}; // <-- MODIFIED: Changed to object for 3-tier structure
let filteredProductsCache = []; // <-- Products filtered by location
let allCategoriesCache = []; // <-- Cache for category suggestions
let database;
let deferredInstallPrompt = null;
let festiveCountdownInterval = null; 
let goToCartNotificationTimer = null;

// **INFINITE SCROLL STATE FOR DEALS**
let dealsOfTheDayProducts = []; 
let currentlyDisplayedDeals = 0; 
const dealsPerPage = 10; 
let isLoadingDeals = false; 
let dealsObserver = null; 

// --- NEW LOCATION STATE (MODIFIED FOR "Choose Location") ---
const DEFAULT_LOCATION_KEY = "ALL_AREAS"; // Special key for no location
const CHOOSE_LOCATION_TEXT = "Choose Location";
const CART_ICON_SVG = "https://www.svgrepo.com/show/533042/cart-plus.svg";
let currentSelectedState = null;
let currentSelectedDistrict = null;


// --- PWA LOGIC ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
    }
});

function setupInstallButton() {
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            installBtn.classList.add('hidden');
            if (!deferredInstallPrompt) {
                showToast('Installation is not available right now.', 'error');
                return;
            }
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
        });
    }
}

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) {
        installBtn.classList.add('hidden');
    }
    deferredInstallPrompt = null;
    showToast('Ramazone installed successfully!');
});


// --- CART FUNCTIONS ---
function getCart() { try { const cart = localStorage.getItem('ramazoneCart'); return cart ? JSON.parse(cart) : []; } catch (e) { return []; } }
function saveCart(cart) { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); }

function addToCart(productId, quantityToAdd = 1) {
    const cart = getCart();
    const product = allProductsCache.find(p => p && p.id === productId); 
    if (!product) { showToast('Could not add item to cart.', 'error'); return; }
    let selectedVariants = {};
    if (product.variants && Array.isArray(product.variants)) {
        product.variants.forEach(variant => {
            if (variant.type && Array.isArray(variant.options) && variant.options.length > 0) {
                selectedVariants[variant.type] = variant.options[0].name;
            }
        });
    }
    const existingItemIndex = cart.findIndex(item => item.id === productId && JSON.stringify(item.variants || {}) === JSON.stringify(selectedVariants));
    if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += quantityToAdd;
    } else {
        cart.push({ id: productId, quantity: quantityToAdd, variants: selectedVariants });
    }
    saveCart(cart);

    showHomeGoToCartNotification();
    updateCartIcon();
}

function showHomeGoToCartNotification() {
    const notification = document.getElementById('home-go-to-cart-notification');
    const summaryEl = document.getElementById('home-notification-summary');
    if (!notification || !summaryEl) return;
    clearTimeout(goToCartNotificationTimer);
    const totalQuantity = getTotalCartQuantity();
    summaryEl.textContent = `${totalQuantity} item${totalQuantity > 1 ? 's' : ''} in your cart`;
    notification.classList.add('visible');
    goToCartNotificationTimer = setTimeout(() => {
        notification.classList.remove('visible');
    }, 4000);
}

function getTotalCartQuantity() { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); }
function updateCartIcon() { const totalQuantity = getTotalCartQuantity(); const cartCountElement = document.getElementById('cart-item-count'); if (cartCountElement) { cartCountElement.textContent = totalQuantity > 0 ? totalQuantity : ''; } }
function showToast(message, type = "info") { const toast = document.getElementById("toast-notification"); toast.textContent = message; toast.className = `show ${type}`; setTimeout(() => toast.classList.remove("show"), 3000); }

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    try {
        await loadCoreComponents();

        // Hardcoded config for simplicity as per original file
        const config = {
            apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
            authDomain: "re-store-8e5b3.firebaseapp.com",
            databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
        };

        if (config && config.apiKey) {
            firebase.initializeApp(config);
            database = firebase.database();
            loadAllData();
        } else {
            throw new Error("Invalid or missing Firebase config received from API.");
        }
    } catch (error) {
        console.error("Initialization Error:", error);
        document.getElementById('main-content-area').innerHTML = `<div class="text-center p-8"><p class="font-bold text-red-600">Application Failed to Start</p><p class="text-gray-600 mt-2">Could not connect to the database. Please check your internet connection or contact support.</p><p class="text-xs text-gray-400 mt-4">${error.message}</p></div>`;
    }
}


async function loadCoreComponents() {
    try {
        const searchContainer = document.getElementById('search-bar-container');
        if (searchContainer) {
            const response = await fetch('sections/search-bar.html');
            if (!response.ok) throw new Error('Search bar section not found');
            searchContainer.innerHTML = await response.text();
        }
    } catch (error) {
        console.error("Core component load error:", error);
    }
}

function loadAllData() {
    const dbRef = database.ref('ramazone');
    dbRef.on('value', async (snapshot) => {
        const data = snapshot.val() || {};
        window.ramazoneData = data; // <-- Store full data snapshot
        let products = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
        allProductsCache = products.filter(p => p && p.isVisible !== false);

        const homepageData = data.homepage || {};
        if (homepageData.normalCategories) {
            allCategoriesCache = homepageData.normalCategories.filter(cat => cat && cat.name && cat.size !== 'double');
        }

        allLocationsCache = data.locations || {};
        console.log("Locations data loaded:", allLocationsCache);

        // --- LOCATION LOGIC ---
        setupLocationSelectionsFromStorage(); // 1. Set up current state/district
        setupLocationSystem(); // 2. Set up event listeners for popup

        filterProductsByLocation(); // 3. Filter products based on location FIRST

        await loadPageStructure(); // 4. Load page structure

        renderAllSections(data); // 5. Render all sections using filtered data

    }, (error) => {
        console.error("Firebase Read Error:", error);
        document.getElementById('main-content-area').innerHTML = `<p class="text-center p-8">Could not load data. Check your connection.</p>`;
    });
}

async function loadPageStructure() {
    const mainArea = document.getElementById('main-content-area');
    if (mainArea.childElementCount > 0) return; // Only load once
    const sections = ['categories.html', 'recently-viewed.html', 'videos.html', 'festive-collection.html', 'info-marquee.html', 'flip-card.html', 'just-for-you.html', 'deals-of-the-day.html'];
    try {
        const responses = await Promise.all(sections.map(s => fetch(`sections/${s}`)));
        const htmls = await Promise.all(responses.map(res => res.text()));
        mainArea.innerHTML = htmls.join('');
    } catch (error) {
        console.error("Page Structure Load Error:", error);
        mainArea.innerHTML = `<p class="text-center p-8">Error loading page content.</p>`;
    }
}

// --- RENDER ALL SECTIONS ---
function renderAllSections(data) {
    const homepageData = data.homepage || {};
    renderSlider(homepageData.slider);
    renderSearch(homepageData.search);
    renderNormalCategories(homepageData.normalCategories);
    renderRecentlyViewed();
    renderVideosSection(homepageData.videos);
    renderFestiveCollection(homepageData.festiveCollection);
    renderInfoMarquee(homepageData.infoMarquee);
    renderFlipCardSection(homepageData.flipCard);
    renderJustForYouSection(homepageData.justForYou);
    renderHighlightedProducts();
    renderFooter(homepageData.footer);
    document.getElementById('copyright-year').textContent = new Date().getFullYear();

    setupGlobalEventListeners();
    setupSideMenu();
    setupInstallButton();
    updateCartIcon();
    setupScrollAnimations();
    setupHeaderScrollEffect();
    setupHomepageSearch(); 
}

// --- NEW: LOCATION HELPER FUNCTIONS (MODIFIED) ---
function formatLocation(pathString) {
    if (!pathString || pathString === DEFAULT_LOCATION_KEY) {
        return CHOOSE_LOCATION_TEXT; // "Choose Location"
    }
    if (!pathString.includes('/')) return pathString;
    const parts = pathString.split('/');
    if (parts.length === 3) return `${parts[2]}, ${parts[1]}`; // Suja, Begusarai
    if (parts.length === 2) return `${parts[1]}, ${parts[0]}`; // Begusarai, Bihar
    return pathString;
}

function setupLocationSelectionsFromStorage() {
    // Get saved location path, or use default
    const savedLoc = localStorage.getItem('userLocation');
    if (!savedLoc) {
        // Agar kuch bhi save nahi hai, to default set karo
        localStorage.setItem('userLocation', DEFAULT_LOCATION_KEY);
        currentSelectedState = null;
        currentSelectedDistrict = null;
        return;
    }

    if (savedLoc === DEFAULT_LOCATION_KEY) {
        currentSelectedState = null;
        currentSelectedDistrict = null;
    } else {
        const parts = savedLoc.split('/');
        if (parts.length >= 2) {
            currentSelectedState = parts[0];
            currentSelectedDistrict = parts[1];
        } else {
            // Bad data, reset to default
            localStorage.setItem('userLocation', DEFAULT_LOCATION_KEY);
            currentSelectedState = null;
            currentSelectedDistrict = null;
        }
    }
}

// --- NEW: LOCATION FILTERING FUNCTION (MODIFIED) ---
function filterProductsByLocation() {
    const currentLoc = localStorage.getItem('userLocation');

    if (currentLoc === DEFAULT_LOCATION_KEY) {
        // --- "Choose Location" LOGIC ---
        // Sirf "All Area" wale products dikhao
        filteredProductsCache = allProductsCache.filter(product => {
            // Jo products "All Area" hain (yaani jinka availableAreas array ya to hai nahi, ya khaali hai)
            return !product.availableAreas || !Array.isArray(product.availableAreas) || product.availableAreas.length === 0;
        });
        console.log(`Filtered for "All Areas": ${filteredProductsCache.length} items.`);

    } else {
        // --- SPECIFIC LOCATION LOGIC ---
        // Sirf uss specific area wale products dikhao
        filteredProductsCache = allProductsCache.filter(product => {
            // Product ko "All Area" bhi available hona chahiye YA specific location list mein hona chahiye
            const isAllArea = !product.availableAreas || !Array.isArray(product.availableAreas) || product.availableAreas.length === 0;
            const isAtLocation = product.availableAreas && product.availableAreas.includes(currentLoc);
            
            return isAllArea || isAtLocation;
        });
        console.log(`Filtered for "${currentLoc}": ${filteredProductsCache.length} items.`);
    }
}

// --- RERENDER ALL PRODUCT SECTIONS ---
function rerenderProductSections() {
    const fullData = window.ramazoneData || { homepage: {} };
    console.log('Location changed. Re-rendering product sections...');
    renderRecentlyViewed();
    renderFestiveCollection(fullData.homepage.festiveCollection);
    renderJustForYouSection(fullData.homepage.justForYou);
    renderHighlightedProducts(); // This will re-trigger infinite scroll
    setupHomepageSearch();
}


// --- LOCATION SYSTEM LOGIC (MODIFIED for 3-Tier) ---
function setupLocationSystem() {
    const areaSearchInput = document.getElementById('loc-area-search-input');
    if (areaSearchInput) {
        areaSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (currentSelectedState && currentSelectedDistrict) {
                renderAreaList(currentSelectedState, currentSelectedDistrict, query);
            }
        });
    }
}

// --- NEW: 3-TIER RENDER FUNCTIONS ---
function renderStateTabs() {
    const container = document.getElementById('loc-state-tabs');
    if (!container) return;
    const states = Object.keys(allLocationsCache).filter(stateName => allLocationsCache[stateName].isActive);
    if (states.length === 0) {
        container.innerHTML = '<p class="loc-tab-placeholder">No active locations available.</p>';
        return;
    }
    container.innerHTML = states.map(stateName => `
        <button class="loc-tab-btn ${stateName === currentSelectedState ? 'active' : ''}" data-state="${stateName}">
            ${stateName}
        </button>
    `).join('');
    if (currentSelectedState) {
        renderDistrictTabs(currentSelectedState);
    } else {
        document.getElementById('loc-district-tier').classList.add('hidden');
        document.getElementById('loc-area-tier').classList.add('hidden');
    }
}

function renderDistrictTabs(stateName) {
    const container = document.getElementById('loc-district-tabs');
    const tier = document.getElementById('loc-district-tier');
    if (!container || !tier) return;
    const stateData = allLocationsCache[stateName];
    if (!stateData || !stateData.districts) {
        tier.classList.add('hidden');
        return;
    }
    const districts = Object.keys(stateData.districts).filter(distName => stateData.districts[distName].isActive);
    if (districts.length === 0) {
        container.innerHTML = '<p class="loc-tab-placeholder">No active districts in this state.</p>';
        tier.classList.remove('hidden');
        document.getElementById('loc-area-tier').classList.add('hidden');
        return;
    }
    container.innerHTML = districts.map(distName => `
        <button class="loc-tab-btn ${distName === currentSelectedDistrict ? 'active' : ''}" data-state="${stateName}" data-district="${distName}">
            ${distName}
        </button>
    `).join('');
    tier.classList.remove('hidden');
    if (currentSelectedDistrict) {
        renderAreaList(stateName, currentSelectedDistrict);
    } else {
        document.getElementById('loc-area-tier').classList.add('hidden');
    }
}

function renderAreaList(stateName, districtName, searchQuery = '') {
    const container = document.getElementById('loc-area-list-container');
    const tier = document.getElementById('loc-area-tier');
    if (!container || !tier) return;
    const districtData = allLocationsCache[stateName]?.districts[districtName];
    if (!districtData || !Array.isArray(districtData.areas)) {
        tier.classList.add('hidden');
        return;
    }
    const currentLoc = localStorage.getItem('userLocation');
    let areas = districtData.areas;
    if (searchQuery) {
        areas = areas.filter(areaName => areaName.toLowerCase().includes(searchQuery));
    }
    if (areas.length === 0) {
        container.innerHTML = `<p class="p-4 text-center text-gray-500">${searchQuery ? 'No areas found matching search.' : 'No areas added to this district.'}</p>`;
        tier.classList.remove('hidden');
        return;
    }
    container.innerHTML = areas.map(areaName => {
        const fullPath = `${stateName}/${districtName}/${areaName}`;
        const isActive = fullPath === currentLoc;
        return `
            <div class="location-item ${isActive ? 'active' : ''}" data-path="${fullPath}">
                <i class="fas fa-map-marker-alt"></i>
                <span>${areaName}</span>
                <i class="fas fa-check location-item-check"></i>
            </div>
        `;
    }).join('');
    tier.classList.remove('hidden');
}

function openLocationPopup() {
    const overlay = document.getElementById('location-overlay');
    const panel = document.getElementById('location-selector-panel');
    const body = document.body;
    if (overlay && panel) {
        setupLocationSelectionsFromStorage(); // Current selection ko load karo
        renderStateTabs(); // States render karo
        overlay.classList.add('visible');
        panel.classList.add('open');
        body.classList.add('location-open');
    }
}

function closeLocationPopup() {
    const overlay = document.getElementById('location-overlay');
    const panel = document.getElementById('location-selector-panel');
    const body = document.body;
    if (overlay && panel) {
        overlay.classList.remove('visible');
        panel.classList.remove('open');
        body.classList.remove('location-open');
    }
}

// --- HOMEPAGE LIVE SEARCH LOGIC (MODIFIED FOR KEYWORDS) ---
function setupHomepageSearch() {
    const searchInput = document.getElementById('home-search-input');
    if (!searchInput) return;

    const savedLoc = localStorage.getItem('userLocation');
    const headerLocText = document.getElementById('header-location-text');
    if (headerLocText) headerLocText.textContent = formatLocation(savedLoc); 

    const suggestionsContainer = document.getElementById('home-search-suggestions');
    const categorySuggestionsContainer = document.getElementById('home-category-suggestions');
    const searchOverlay = document.getElementById('search-overlay');
    const headerSearchTrigger = document.getElementById('header-search-trigger');

    categorySuggestionsContainer.innerHTML = allCategoriesCache.map(cat => `<span class="suggestion-tag" data-category="${cat.name}">${cat.name}</span>`).join('');
    categorySuggestionsContainer.addEventListener('click', e => {
        if (e.target.classList.contains('suggestion-tag')) {
            const categoryName = e.target.dataset.category;
            window.location.href = `./products.html?category=${encodeURIComponent(categoryName)}`;
        }
    });

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        if (query.length < 1) {
            suggestionsContainer.classList.add('hidden');
            return;
        }

        // --- === YAHAN BADLAAV KIYA GAYA HAI (SEARCH LOGIC) === ---
        const suggestions = filteredProductsCache.filter(p => {
            const nameMatch = p.name.toLowerCase().includes(query);
            
            // Keyword search logic
            let keywordMatch = false;
            if (p.product_of_keyword && Array.isArray(p.product_of_keyword)) {
                // Check if any keyword in the array *starts with* the query
                keywordMatch = p.product_of_keyword.some(k => k.toLowerCase().startsWith(query));
            }
            
            return nameMatch || keywordMatch;
        }).slice(0, 5);
        // --- === BADLAAV END === ---

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

    const activateSearchMode = () => { document.body.classList.add('search-active'); };
    const deactivateSearchMode = () => { document.body.classList.remove('search-active'); categorySuggestionsContainer.classList.add('hidden'); suggestionsContainer.classList.add('hidden'); };
    searchInput.addEventListener('focus', activateSearchMode);
    searchOverlay.addEventListener('click', () => searchInput.blur());
    searchInput.addEventListener('blur', () => { setTimeout(deactivateSearchMode, 150); });
    if (headerSearchTrigger) {
        headerSearchTrigger.addEventListener('click', () => {
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => searchInput.focus(), 300);
        });
    }
}

// --- HEADER SCROLL EFFECT LOGIC ---
function setupHeaderScrollEffect() {
    const header = document.getElementById('page-header');
    if (!header) return;
    const scrollThreshold = 50;
    window.addEventListener('scroll', () => {
        if (window.scrollY > scrollThreshold) {
            header.classList.add('header-scrolled');
        } else {
            header.classList.remove('header-scrolled');
        }
    }, { passive: true });
}

// --- RECENTLY VIEWED SECTION LOGIC ---
function renderRecentlyViewed() {
    const section = document.getElementById('recently-viewed-section');
    const container = document.getElementById('recently-viewed-container');
    if (!section || !container) { return; }
    try {
        const viewedIds = JSON.parse(localStorage.getItem("ramazoneRecentlyViewed")) || [];
        if (viewedIds.length === 0) { section.style.display = 'none'; return; }
        let cardsHTML = '';
        let productsFound = 0;
        viewedIds.forEach(id => {
            const product = filteredProductsCache.find(p => p && p.id === id);
            if (product) {
                const imageUrl = (product.images && product.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';
                cardsHTML += `<a href="./product-details.html?id=${product.id}" class="rv-card"><img src="${imageUrl}" alt="${product.name || 'Product'}" loading="lazy"><p>${product.name || 'Product Name'}</p></a>`;
                productsFound++;
            }
        });
        if (productsFound > 0) { container.innerHTML = cardsHTML; section.style.display = 'block'; } else { section.style.display = 'none'; }
    } catch (error) { console.error("Error rendering recently viewed products:", error); section.style.display = 'none'; }
}

// --- FESTIVE COLLECTION SPECIFIC LOGIC ---
function startCountdownTimer(endTimeString, elementId) {
    if (festiveCountdownInterval) clearInterval(festiveCountdownInterval);
    const el = document.getElementById(elementId);
    if (!el) return;
    const endTime = new Date(endTimeString).getTime();
    if (isNaN(endTime)) { el.innerHTML = "Deal Ended"; return; }
    const update = () => {
        const now = new Date().getTime();
        const dist = endTime - now;
        if (dist < 0) { clearInterval(festiveCountdownInterval); el.innerHTML = "Deal Ended"; return; }
        const h = String(Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))).padStart(2, '0');
        const m = String(Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, '0');
        const s = String(Math.floor((dist % (1000 * 60)) / 1000)).padStart(2, '0');
        el.innerHTML = `<i class="far fa-clock"></i>&nbsp;<span>${h}</span>:<span>${m}</span>:<span>${s}</span>`;
    };
    update();
    festiveCountdownInterval = setInterval(update, 1000);
}

// --- UNIVERSAL HELPER FUNCTIONS (MODIFIED FOR "BUY" BUTTON) ---

function createFestiveCardHTML(prod, options = {}) {
    if (!prod) return '';
    const { soldPercentage } = options;
    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';
    const ratingTag = prod.rating ? `<div class="card-rating-tag rating-tag-bottom-left">${prod.rating} <i class="fas fa-star"></i></div>` : '';
    const offerTag = prod.offerText ? `<div class="product-offer-tag offer-tag-top-left" style="color:${prod.offerTextColor||'white'}; background-color:${prod.offerBackgroundColor||'#4F46E5'}">${prod.offerText}</div>` : '';

    let priceHTML = `<p class="display-price">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</p>`;
    let originalPriceHTML = '';
    let discountHTML = '';
    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        originalPriceHTML = `<p class="original-price">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</p>`;
        if (discount > 0) discountHTML = `<p class="product-discount">${discount}% OFF</p>`;
    }

    let progressBarHTML = '';
    if (typeof soldPercentage === 'number' && soldPercentage >= 0) {
        progressBarHTML = `<div class="progress-bar-container mb-1"><div class="progress-bar-inner" style="width: ${soldPercentage}%"></div><span class="progress-bar-text">${soldPercentage}% Sold</span></div>`;
    }

    return `
    <div class="product-card carousel-item h-full block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 flex flex-col">
        <div class="relative">
            <a href="./product-details.html?id=${prod.id}" class="block relative">
                <img src="${imageUrl}" class="w-full object-cover aspect-square" alt="${prod.name || 'Product'}" loading="lazy">
                ${ratingTag}
                ${offerTag}
            </a>
        </div>
        <div class="p-3 flex flex-col justify-between flex-grow">
            <div>
                <a href="./product-details.html?id=${prod.id}" class="block">
                    <h4 class="text-sm font-semibold text-gray-800 mb-1">${prod.name || 'Product Name'}</h4>
                    <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <div class="flex items-baseline gap-2">
                            ${priceHTML}
                            ${originalPriceHTML}
                        </div>
                        ${discountHTML}
                    </div>
                </a>
                ${progressBarHTML}
            </div>
            <!-- === YAHAN BADLAAV KIYA GAYA HAI === -->
            <div class="product-card-actions">
                <button class="cart-btn add-btn" data-id="${prod.id}">
                    <img class="cart-icon-svg" src="${CART_ICON_SVG}" alt="Add to Cart">
                    <i class="fas fa-check cart-added-icon" style="display: none;"></i>
                </button>
                <button class="buy-text-btn" data-id="${prod.id}">Buy</button>
            </div>
            <!-- === BADLAAV END === -->
        </div>
    </div>`;
}

function renderFestiveCollection(collectionData) {
    const container = document.getElementById('festive-collection-container');
    if (!container || !collectionData || !collectionData.productIds?.length) { if (container) container.style.display = 'none'; return; }
    const metadata = collectionData.productMetadata || {};
    const limit = collectionData.productsToShow || collectionData.productIds.length;
    let productsHTML = '';
    let productsFound = 0;
    collectionData.productIds.slice(0, limit).forEach(id => {
        const product = filteredProductsCache.find(p => p && p.id === id); 
        if (product) {
            productsHTML += createFestiveCardHTML(product, { soldPercentage: metadata[id]?.soldPercentage });
            productsFound++;
        }
    });
    if(productsFound === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    container.style.backgroundColor = collectionData.backgroundColor || 'var(--bg-light)';
    const headline = document.getElementById('festive-headline');
    const timerEl = document.getElementById('festive-countdown-timer');
    const arrowEl = document.getElementById('festive-view-all-link');
    if (arrowEl) { arrowEl.href = 'festive-products.html'; }
    if (headline) { const headlineColor = collectionData.headlineColor || 'var(--text-dark)'; headline.innerText = collectionData.title || 'Special Offers'; headline.style.color = headlineColor; if (timerEl) timerEl.style.color = headlineColor; if (arrowEl) arrowEl.style.color = headlineColor; }
    if (collectionData.endTime) { startCountdownTimer(collectionData.endTime, 'festive-countdown-timer'); }
    const slider = document.getElementById('festive-product-slider');
    productsHTML += `<a href="festive-products.html" class="view-all-card"><div class="view-all-circle"><i class="fas fa-arrow-right"></i></div><span>View All</span></a>`;
    slider.innerHTML = productsHTML;
}

function createProductCardHTML(prod, cardClass = '') {
    if (!prod) return '';
    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';
    const ratingTag = prod.rating ? `<div class="card-rating-tag rating-tag-bottom-left">${prod.rating} <i class="fas fa-star"></i></div>` : '';
    const offerTag = prod.offerText ? `<div class="product-offer-tag offer-tag-top-left" style="color:${prod.offerTextColor||'white'}; background-color:${prod.offerBackgroundColor||'#4F46E5'}">${prod.offerText}</div>` : '';

    let priceHTML = `<p class="display-price">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</p>`;
    let originalPriceHTML = '';
    let discountHTML = '';
    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        originalPriceHTML = `<p class="original-price">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</p>`;
        if (discount > 0) discountHTML = `<p class="product-discount">${discount}% OFF</p>`;
    }

    return `
    <div class="product-card ${cardClass} h-full block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 flex flex-col">
        <div class="relative">
            <a href="./product-details.html?id=${prod.id}" class="block relative">
                <img src="${imageUrl}" class="w-full object-cover aspect-square" alt="${prod.name || 'Product'}" loading="lazy">
                ${ratingTag}
                ${offerTag}
            </a>
        </div>
        <div class="p-3 flex flex-col justify-between flex-grow">
            <div>
                <a href="./product-details.html?id=${prod.id}" class="block">
                    <h4 class="text-sm font-semibold text-gray-800 mb-1">${prod.name || 'Product Name'}</h4>
                    <div class="flex items-center justify-between gap-2 flex-wrap mb-2">
                        <div class="flex items-baseline gap-2">
                            ${priceHTML}
                            ${originalPriceHTML}
                        </div>
                        ${discountHTML}
                    </div>
                </a>
            </div>
            <!-- === YAHAN BADLAAV KIYA GAYA HAI === -->
            <div class="product-card-actions">
                <button class="cart-btn add-btn" data-id="${prod.id}">
                    <img class="cart-icon-svg" src="${CART_ICON_SVG}" alt="Add to Cart">
                    <i class="fas fa-check cart-added-icon" style="display: none;"></i>
                </button>
                <button class="buy-text-btn" data-id="${prod.id}">Buy</button>
            </div>
            <!-- === BADLAAV END === -->
        </div>
    </div>`;
}


function getDealsOfTheDayProducts() {
    if (!filteredProductsCache || filteredProductsCache.length === 0) return [];
    return [...filteredProductsCache].sort((a, b) => {
        const discountA = (a.originalPrice || 0) - (a.displayPrice || 0);
        const discountB = (b.originalPrice || 0) - (b.displayPrice || 0);
        return (discountB - discountA) || ((b.rating || 0) - (a.rating || 0));
    });
}

function setupGlobalEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    document.body.addEventListener('click', function (event) {
        
        // --- === YAHAN BADLAAV KIYA GAYA HAI ("Buy" Button Logic) === ---
        const buyButton = event.target.closest('.buy-text-btn');
        if (buyButton) {
            event.preventDefault();
            const productId = buyButton.dataset.id;
            if (productId) {
                // 1. Cart mein add karo
                addToCart(productId); 
                // 2. Turant cart page par bhejo
                window.location.href = 'order.html';
            }
            return; // Processing roko
        }
        // --- === BADLAAV END === ---

        // --- 1. Handle Add to Cart Buttons (MODIFIED) ---
        const addButton = event.target.closest('.add-btn');
        if (addButton) {
            event.preventDefault();
            const productId = addButton.dataset.id;
            if (productId) {
                addToCart(productId);
                
                if (addButton.classList.contains('cart-btn')) {
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
            return; // Stop processing
        }

        // --- 2. LOCATION POPUP EVENT HANDLERS (MODIFIED) ---
        const locationTrigger = event.target.closest('#location-trigger');
        if (locationTrigger) {
            openLocationPopup();
            return;
        }

        const closeLocBtn = event.target.closest('#close-location-btn');
        if (closeLocBtn) {
            closeLocationPopup();
            return;
        }

        const locOverlay = document.getElementById('location-overlay');
        if (event.target === locOverlay) {
            closeLocationPopup();
            return;
        }

        const stateTab = event.target.closest('.loc-tab-btn[data-state]');
        if (stateTab && !stateTab.dataset.district) {
            currentSelectedState = stateTab.dataset.state;
            currentSelectedDistrict = null; // Reset district
            document.getElementById('loc-area-search-input').value = '';
            renderStateTabs(); 
            return;
        }

        const districtTab = event.target.closest('.loc-tab-btn[data-district]');
        if (districtTab) {
            currentSelectedDistrict = districtTab.dataset.district;
            document.getElementById('loc-area-search-input').value = '';
            renderDistrictTabs(currentSelectedState); 
            return;
        }

        const locItem = event.target.closest('.location-item');
        if (locItem) {
            const selectedLocPath = locItem.dataset.path; // "Bihar/Begusarai/Suja"
            const currentLoc = localStorage.getItem('userLocation');

            if (selectedLocPath === currentLoc) {
                closeLocationPopup(); 
                return;
            }

            localStorage.setItem('userLocation', selectedLocPath);
            setupLocationSelectionsFromStorage(); // Update global state variables

            const headerText = document.getElementById('header-location-text');
            if (headerText) headerText.textContent = formatLocation(selectedLocPath);

            renderAreaList(currentSelectedState, currentSelectedDistrict); 

            filterProductsByLocation();
            rerenderProductSections(); 
            
            setTimeout(closeLocationPopup, 200);
            return;
        }
    });
}

function setupScrollAnimations() {
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// --- DEALS OF THE DAY - INFINITE SCROLL LOGIC ---
function renderHighlightedProducts() {
    const wrapper = document.getElementById('highlighted-products-wrapper');
    const section = document.getElementById('highlighted-products-section');
    if (!wrapper || !section) { if (section) section.style.display = 'none'; return; }

    dealsOfTheDayProducts = getDealsOfTheDayProducts(); 

    if (dealsOfTheDayProducts.length === 0) {
        section.style.display = 'block'; 
        wrapper.innerHTML = `<p class="text-center text-gray-500 col-span-full py-10">No deals available for this location right now. Please check back later!</p>`; 
        document.getElementById('deals-loader').style.display = 'none';
        if (dealsObserver) dealsObserver.disconnect();
        return;
    }

    section.style.display = 'block';
    wrapper.innerHTML = ''; 
    currentlyDisplayedDeals = 0;
    if (dealsObserver) dealsObserver.disconnect();
    loadMoreDeals(); 
    const loader = document.getElementById('deals-loader');
    if (loader) {
        dealsObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !isLoadingDeals) { loadMoreDeals(); }
        }, { threshold: 1.0 });
        dealsObserver.observe(loader);
    }
}

function loadMoreDeals() {
    const wrapper = document.getElementById('highlighted-products-wrapper');
    const loader = document.getElementById('deals-loader');
    if (isLoadingDeals || !wrapper || !loader) return;
    if (currentlyDisplayedDeals >= dealsOfTheDayProducts.length && currentlyDisplayedDeals > 0) { 
        loader.style.display = 'none'; 
        if (dealsObserver) dealsObserver.disconnect(); 
        return; 
    }
    loader.style.display = 'flex'; 
    const productsToLoad = dealsOfTheDayProducts.slice(currentlyDisplayedDeals, currentlyDisplayedDeals + (currentlyDisplayedDeals === 0 ? 20 : dealsPerPage));
    if (productsToLoad.length === 0 && currentlyDisplayedDeals === 0) { 
        loader.style.display = 'none'; 
        if (dealsObserver) dealsObserver.disconnect();
        wrapper.innerHTML = `<p class="text-center text-gray-500 col-span-full py-10">No deals found for this location.</p>`;
        return; 
    }
    isLoadingDeals = true;
    setTimeout(() => {
        const productsHTML = productsToLoad.map(p => createProductCardHTML(p, 'grid-item')).join('');
        wrapper.insertAdjacentHTML('beforeend', productsHTML);
        currentlyDisplayedDeals += productsToLoad.length;
        isLoadingDeals = false;
        if (currentlyDisplayedDeals >= dealsOfTheDayProducts.length) { 
            loader.style.display = 'none'; 
            if (dealsObserver) dealsObserver.disconnect(); 
        }
    }, 500);
}

// --- OTHER RENDER FUNCTIONS ---
function renderSlider(sliderData) {
    const slider = document.getElementById('main-slider');
    const section = document.querySelector('.slider-wrapper');
    if (!slider || !Array.isArray(sliderData) || sliderData.length === 0) { if (section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    slider.innerHTML = sliderData.map(slide => `<a href="${slide.linkUrl || '#'}" class="slide" target="_blank" draggable="false">${slide.videoUrl ? `<video src="${slide.videoUrl}" autoplay muted loop playsinline draggable="false"></video>` : `<picture><source media="(min-width: 768px)" srcset="${slide.imageUrlDesktop || slide.imageUrlMobile || ''}"><img src="${slide.imageUrlMobile || slide.imageUrlDesktop || ''}" alt="Promotional banner" draggable="false"></picture>`}</a>`).join('');
    initializeSlider(sliderData.length);
}

function renderNormalCategories(categories) {
    const section = document.getElementById('normal-category-section');
    if (!section || !Array.isArray(categories) || categories.length === 0) { if (section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    section.innerHTML = `<div class="category-master-scroller"><div class="category-rows-container"><div id="top-category-row" class="category-row"></div><div id="bottom-category-row" class="category-row"></div></div></div>`;
    const topWrapper = document.getElementById('top-category-row');
    const bottomWrapper = document.getElementById('bottom-category-row');
    const renderCategoryHTML = cat => `<a href="${(cat.size === 'double' && cat.linkUrl) ? cat.linkUrl : `./products.html?category=${encodeURIComponent(cat.name)}`}" target="${(cat.size === 'double' && cat.linkUrl) ? '_blank' : ''}" class="category-card ${cat.size === 'double' ? 'category-card--double' : ''}"><div class="img-wrapper"><img src="${cat.imageUrl}" alt="${cat.name}" loading="lazy"></div><p class="category-name">${cat.name}</p></a>`;
    topWrapper.innerHTML = categories.filter(c => c && c.row === 'top').map(renderCategoryHTML).join('');
    bottomWrapper.innerHTML = categories.filter(c => c && c.row !== 'top').map(renderCategoryHTML).join('');
}

function renderVideosSection(videoData) {
    const section = document.getElementById('video-section');
    const slider = document.getElementById('video-slider');
    if (!section || !Array.isArray(videoData) || videoData.length === 0) { if (section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    slider.innerHTML = videoData.map(video => `<a href="${video.youtubeUrl || '#'}" target="_blank" class="video-card"><img src="${video.imageUrl || 'https://placehold.co/600x400/black/white?text=Video'}" alt="${video.title}" loading="lazy"><i class="fas fa-play-circle play-icon"></i><div class="video-card-overlay"><h3 class="video-card-title">${video.title}</h3><p class="video-card-desc">${video.description || ''}</p></div></a>`).join('');
}

function renderJustForYouSection(jfyData) {
    const section = document.getElementById('just-for-you-section');
    if (!section || !jfyData) { if (section) section.style.display = 'none'; return; }
    const { poster, topDeals } = jfyData;
    const mainProduct = filteredProductsCache.find(p => p.id === topDeals?.mainProductId);
    const subProduct1 = filteredProductsCache.find(p => p.id === topDeals?.subProductIds?.[0]);
    const subProduct2 = filteredProductsCache.find(p => p.id === topDeals?.subProductIds?.[1]);
    if (!poster || !topDeals || !mainProduct || !subProduct1 || !subProduct2) { 
        section.style.display = 'none'; 
        return; 
    }
    const isDesktop = window.innerWidth >= 768;
    let mainProductImage = mainProduct.images?.[0] || 'https://placehold.co/600x600/e2e8f0/64748b?text=Image';
    if (isDesktop && topDeals.mainProductImageUrl) { mainProductImage = topDeals.mainProductImageUrl; }
    const getDiscount = p => p && p.originalPrice > p.displayPrice ? `<p class="discount">${Math.round(((p.originalPrice - p.displayPrice) / p.originalPrice) * 100)}% OFF</p>` : '';
    const jfyContent = document.getElementById('jfy-content');
    if (jfyContent) { jfyContent.innerHTML = `<div class="jfy-main-container" style="background-color: ${jfyData.backgroundColor || 'var(--bg-light)'};"><h2 class="jfy-main-title" style="color: ${jfyData.titleColor || 'var(--text-dark)'};">${jfyData.title || 'Just for You'}</h2><div class="jfy-grid"><a href="${poster.linkUrl || '#'}" class="jfy-poster-card"><div class="jfy-poster-slider-container"><div class="jfy-poster-slider">${poster.images.map(img => `<div class="jfy-poster-slide"><img src="${img}" alt="Poster Image"></div>`).join('')}</div><div class="jfy-slider-dots"></div></div></a><div class="jfy-deals-card"><div class="relative jfy-main-product"><a href="./product-details.html?id=${mainProduct.id}"><img src="${mainProductImage}" alt="${mainProduct.name}"></a></div><div class="jfy-sub-products"><div class="relative jfy-sub-product-item"><a href="./product-details.html?id=${subProduct1.id}"><div class="img-wrapper"><img src="${subProduct1.images?.[0] || ''}" alt="${subProduct1.name}"></div><div class="details"><p class="name">${subProduct1.name}</p>${getDiscount(subProduct1)}</div></a></div><div class="relative jfy-sub-product-item"><a href="./product-details.html?id=${subProduct2.id}"><div class="img-wrapper"><img src="${subProduct2.images?.[0] || ''}" alt="${subProduct2.name}"></div><div class="details"><p class="name">${subProduct2.name}</p>${getDiscount(subProduct2)}</div></a></div></div></div></div></div>`; }
    section.style.display = 'block';
    if (poster.images && poster.images.length > 0) initializeJfySlider(poster.images.length);
}

function renderSearch(searchData) { const searchInput = document.getElementById('home-search-input'); if (!searchInput || !searchData?.scrollingTexts?.length) { if(searchInput) searchInput.placeholder = "Search for products..."; return; } const texts = searchData.scrollingTexts; let i = 0; if (window.searchInterval) clearInterval(window.searchInterval); const updatePlaceholder = () => { if (searchInput && document.activeElement !== searchInput) { searchInput.placeholder = `Search for ${texts[i]}...`; i = (i + 1) % texts.length; } }; updatePlaceholder(); window.searchInterval = setInterval(updatePlaceholder, 3000); }
function renderInfoMarquee(text) { const section = document.getElementById('info-marquee-section'); if (!text) { if (section) section.style.display = 'none'; return; } section.style.display = 'block'; section.querySelector('#info-marquee-text').innerHTML = text; }
function renderFlipCardSection(data) { const section = document.getElementById('flipcard-section'); const content = document.getElementById('flip-card-inner-content'); if (!data?.front || !data.back) { if (section) section.style.display = 'none'; return; } section.style.display = 'block'; content.innerHTML = `<a href="${data.front.linkUrl||'#'}" target="_blank" class="flip-card-front"><img src="${data.front.imageUrl}" loading="lazy"></a><a href="${data.back.linkUrl||'#'}" target="_blank" class="flip-card-back"><img src="${data.back.imageUrl}" loading="lazy"></a>`; content.classList.add('flipping');}
function renderFooter(data) { if (!data) return; document.getElementById('menu-play-link').href = data.playLink || '#'; document.getElementById('menu-cashback-link').href = data.profileLink || '#'; const links = data.followLinks; if (links) { const submenuContainer = document.getElementById('follow-submenu'); const desktopContainer = document.getElementById('desktop-social-links'); submenuContainer.innerHTML = ''; desktopContainer.innerHTML = ''; const platforms = { youtube: { icon: 'https.www.svgrepo.com/show/416500/youtube-circle-logo.svg', name: 'YouTube' }, instagram: { icon: 'https.www.svgrepo.com/show/452229/instagram-1.svg', name: 'Instagram' }, facebook: { icon: 'https.www.svgrepo.com/show/448224/facebook.svg', name: 'Facebook' }, whatsapp: { icon: 'https.www.svgrepo.com/show/452133/whatsapp.svg', name: 'WhatsApp' } }; Object.keys(platforms).forEach(key => { if (links[key]) { const p = platforms[key]; submenuContainer.innerHTML += `<a href="${links[key]}" target="_blank" class="submenu-item"><img src="${p.icon}" alt="${key}"><span>${p.name}</span></a>`; desktopContainer.innerHTML += `<a href="${links[key]}" target="_blank"><img src="${p.icon}" class="w-7 h-7" alt="${key}"></a>`; } }); } }
function setupSideMenu() { const menuToggleBtn = document.getElementById('menu-toggle-btn'); const sideMenu = document.getElementById('side-menu'); const menuOverlay = document.getElementById('menu-overlay'); const followItem = document.getElementById('menu-follow-item'); const followSubmenu = document.getElementById('follow-submenu'); if (menuToggleBtn && sideMenu && menuOverlay) { menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('menu-open')); menuOverlay.addEventListener('click', () => document.body.classList.remove('menu-open')); } if (followItem && followSubmenu) { followItem.addEventListener('click', (e) => { e.preventDefault(); followItem.classList.toggle('open'); followSubmenu.classList.toggle('open'); }); } }

// --- SLIDER LOGIC ---
let currentSlide = 1, totalSlides = 0, sliderInterval, isTransitioning = false;
function initializeSlider(count) { const slider = document.getElementById("main-slider"); const dots = document.getElementById("slider-dots-container"); totalSlides = count; if (totalSlides <= 1) { if (dots) dots.style.display = "none"; return; } slider.appendChild(slider.children[0].cloneNode(true)); slider.insertBefore(slider.children[totalSlides - 1].cloneNode(true), slider.children[0]); slider.style.transform = `translateX(-${100 * currentSlide}%)`; dots.innerHTML = Array.from({ length: totalSlides }, (_, i) => `<div class="dot" data-slide="${i + 1}"><div class="timer"></div></div>`).join(''); dots.addEventListener("click", e => { const dot = e.target.closest(".dot"); if (dot) goToSlide(parseInt(dot.dataset.slide)); }); let startPos = 0; const swipeThreshold = 50; const getPositionX = e => e.type.includes("mouse") ? e.pageX : e.touches[0].clientX; const swipeStart = e => { startPos = getPositionX(e); clearInterval(sliderInterval); }; const swipeEnd = e => { const endPos = e.type.includes("touch") ? e.changedTouches[0].clientX : e.pageX; if (Math.abs(endPos - startPos) > swipeThreshold) { moveSlide(endPos < startPos ? 1 : -1); } resetSliderInterval(); }; slider.addEventListener("mousedown", swipeStart); slider.addEventListener("touchstart", swipeStart, { passive: true }); slider.addEventListener("mouseup", swipeEnd); slider.addEventListener("touchend", swipeEnd); slider.addEventListener("transitionend", () => { isTransitioning = false; if (currentSlide === 0 || currentSlide === totalSlides + 1) { slider.classList.remove("transitioning"); currentSlide = (currentSlide === 0) ? totalSlides : 1; slider.style.transform = `translateX(-${100 * currentSlide}%)`; } }); updateDots(); resetSliderInterval(); }
function moveSlide(dir) { if (isTransitioning) return; isTransitioning = true; const slider = document.getElementById("main-slider"); slider.classList.add("transitioning"); currentSlide += dir; slider.style.transform = `translateX(-${100 * currentSlide}%)`; updateDots(); }
function goToSlide(num) { if (isTransitioning || currentSlide === num) return; moveSlide(num - currentSlide); resetSliderInterval(); }
function updateDots() { const dots = document.querySelectorAll(".slider-dots .dot"); dots.forEach(d => { d.classList.remove("active"); const timer = d.querySelector(".timer"); if (timer) { timer.style.transition = "none"; timer.style.width = "0%"; } }); let activeDotIndex = (currentSlide - 1 + totalSlides) % totalSlides; const activeDot = dots[activeDotIndex]; if (activeDot) { activeDot.classList.add("active"); const timer = activeDot.querySelector(".timer"); if (timer) { void timer.offsetWidth; timer.style.transition = "width 5000ms linear"; timer.style.width = "100%"; } } }
function resetSliderInterval() { clearInterval(sliderInterval); sliderInterval = setInterval(() => moveSlide(1), 5000); }

// --- JFY SLIDER LOGIC ---
let jfyCurrentSlide = 1, jfyTotalSlides = 0, jfySliderInterval, jfyIsTransitioning = false;
function initializeJfySlider(count) { const slider = document.querySelector(".jfy-poster-slider"), dots = document.querySelector(".jfy-slider-dots"); if (!slider) return; if ((jfyTotalSlides = count) <= 1) return void (dots && (dots.style.display = "none")); slider.appendChild(slider.children[0].cloneNode(!0)), slider.insertBefore(slider.children[jfyTotalSlides - 1].cloneNode(!0), slider.children[0]), slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`, slider.addEventListener("transitionend", () => { jfyIsTransitioning = !1, 0 === jfyCurrentSlide && (slider.classList.remove("transitioning"), jfyCurrentSlide = jfyTotalSlides, slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`), jfyCurrentSlide === jfyTotalSlides + 1 && (slider.classList.remove("transitioning"), jfyCurrentSlide = 1, slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`) }), dots.innerHTML = ""; for (let i = 0; i < jfyTotalSlides; i++)dots.innerHTML += '<div class="dot" data-slide="'.concat(i + 1, '"></div>'); dots.addEventListener("click", e => { e.target.closest(".dot") && goToJfySlide(e.target.closest(".dot").dataset.slide) }), updateJfyDots(), resetJfySliderInterval() }
function moveJfySlide(dir) { if (jfyIsTransitioning) return; const slider = document.querySelector(".jfy-poster-slider"); slider && (jfyIsTransitioning = !0, slider.classList.add("transitioning"), jfyCurrentSlide += dir, slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`, updateJfyDots(), resetJfySliderInterval()) }
function goToJfySlide(num) { if (jfyIsTransitioning || jfyCurrentSlide == num) return; const slider = document.querySelector(".jfy-poster-slider"); slider && (jfyIsTransitioning = !0, slider.classList.add("transitioning"), jfyCurrentSlide = parseInt(num), slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`, updateJfyDots(), resetJfySliderInterval()) }
function updateJfyDots() { const dots = document.querySelectorAll(".jfy-slider-dots .dot"); dots.forEach(d => d.classList.remove("active")); let activeDotIndex = jfyCurrentSlide - 1; 0 === jfyCurrentSlide && (activeDotIndex = jfyTotalSlides - 1), jfyCurrentSlide === jfyTotalSlides + 1 && (activeDotIndex = 0); const activeDot = dots[activeDotIndex]; activeDot && activeDot.classList.add("active") }
function resetJfySliderInterval() { clearInterval(jfySliderInterval), jfySliderInterval = setInterval(() => moveJfySlide(1), 4000) }


