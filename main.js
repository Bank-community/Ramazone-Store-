// --- GLOBAL STATE ---
let allProductsCache = [];
let allLocationsCache = {}; 
let filteredProductsCache = []; 
let allCategoriesCache = []; 
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

// --- LOCATION STATE ---
const DEFAULT_LOCATION_KEY = "ALL_AREAS"; 
const CHOOSE_LOCATION_TEXT = "Choose Location";
let currentSelectedState = null;
let currentSelectedDistrict = null;

// --- PWA LOGIC ---
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) installBtn.classList.remove('hidden');
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
    if (installBtn) installBtn.classList.add('hidden');
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
        // Initialize Firebase
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
        window.ramazoneData = data; 
        let products = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
        allProductsCache = products.filter(p => p && p.isVisible !== false);

        const homepageData = data.homepage || {};
        if (homepageData.normalCategories) {
            allCategoriesCache = homepageData.normalCategories.filter(cat => cat && cat.name && cat.size !== 'double');
        }

        allLocationsCache = data.locations || {};
        
        // Setup Sequence
        setupLocationSelectionsFromStorage(); 
        setupLocationSystem(); 
        filterProductsByLocation(); 
        await loadPageStructure(); 
        renderAllSections(data); 

    }, (error) => {
        console.error("Firebase Read Error:", error);
        document.getElementById('main-content-area').innerHTML = `<p class="text-center p-8">Could not load data. Check your connection.</p>`;
    });
}

async function loadPageStructure() {
    const mainArea = document.getElementById('main-content-area');
    if (mainArea.childElementCount > 0) return; 
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

// --- RENDER DISPATCHER ---
// Calls functions from render-utils.js
function renderAllSections(data) {
    const homepageData = data.homepage || {};
    
    // Slider
    renderSlider(homepageData.slider);
    if (homepageData.slider && homepageData.slider.length > 0) {
        initializeSlider(homepageData.slider.length);
    }

    // Search
    renderSearch(homepageData.search); // Kept local as it has interval logic

    // Categories
    renderNormalCategories(homepageData.normalCategories);

    // Recently Viewed
    renderRecentlyViewed(); // Kept local

    // Videos
    renderVideosSection(homepageData.videos);

    // Festive
    renderFestiveCollection(homepageData.festiveCollection); // Logic in main, HTML in utils

    // Marquee & FlipCard
    renderInfoMarquee(homepageData.infoMarquee);
    renderFlipCardSection(homepageData.flipCard);

    // Just For You
    const posterCount = renderJustForYouSection(homepageData.justForYou, allProductsCache);
    if (posterCount > 0) initializeJfySlider(posterCount);

    // Deals of the Day
    renderHighlightedProducts(); // Logic in main, HTML in utils

    // Footer
    renderFooter(homepageData.footer);
    const yr = document.getElementById('copyright-year');
    if(yr) yr.textContent = new Date().getFullYear();

    setupGlobalEventListeners();
    setupSideMenu();
    setupInstallButton();
    updateCartIcon();
    setupScrollAnimations();
    setupHeaderScrollEffect();
    setupHomepageSearch(); 
}

// --- HELPER FUNCTIONS ---
function formatLocation(pathString) {
    if (!pathString || pathString === DEFAULT_LOCATION_KEY) return CHOOSE_LOCATION_TEXT;
    if (!pathString.includes('/')) return pathString;
    const parts = pathString.split('/');
    if (parts.length === 3) return `${parts[2]}, ${parts[1]}`; 
    if (parts.length === 2) return `${parts[1]}, ${parts[0]}`; 
    return pathString;
}

function setupLocationSelectionsFromStorage() {
    const savedLoc = localStorage.getItem('userLocation');
    if (!savedLoc) {
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
            localStorage.setItem('userLocation', DEFAULT_LOCATION_KEY);
            currentSelectedState = null;
            currentSelectedDistrict = null;
        }
    }
}

function filterProductsByLocation() {
    const currentLoc = localStorage.getItem('userLocation');
    if (currentLoc === DEFAULT_LOCATION_KEY) {
        filteredProductsCache = allProductsCache.filter(product => !product.availableAreas || !Array.isArray(product.availableAreas) || product.availableAreas.length === 0);
    } else {
        filteredProductsCache = allProductsCache.filter(product => {
            const isAllArea = !product.availableAreas || !Array.isArray(product.availableAreas) || product.availableAreas.length === 0;
            const isAtLocation = product.availableAreas && product.availableAreas.includes(currentLoc);
            return isAllArea || isAtLocation;
        });
    }
}

function rerenderProductSections() {
    const fullData = window.ramazoneData || { homepage: {} };
    renderRecentlyViewed();
    renderFestiveCollection(fullData.homepage.festiveCollection);
    // Just for you re-render might need re-fetching products if logic depends on it
    renderJustForYouSection(fullData.homepage.justForYou, allProductsCache);
    renderHighlightedProducts(); 
    setupHomepageSearch();
}

// --- LOCATION SYSTEM LOGIC ---
function setupLocationSystem() {
    const areaSearchInput = document.getElementById('loc-area-search-input');
    if (areaSearchInput) {
        areaSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (currentSelectedState && currentSelectedDistrict) {
                // Calling renderAreaList from render-utils.js
                renderAreaList(currentSelectedState, currentSelectedDistrict, query, allLocationsCache, localStorage.getItem('userLocation'));
            }
        });
    }
}

function openLocationPopup() {
    const overlay = document.getElementById('location-overlay');
    const panel = document.getElementById('location-selector-panel');
    const body = document.body;
    if (overlay && panel) {
        setupLocationSelectionsFromStorage(); 
        // Calling renderStateTabs from render-utils.js
        renderStateTabs(allLocationsCache, currentSelectedState); 
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

// --- SEARCH LOGIC ---
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
            window.location.href = `./products.html?category=${encodeURIComponent(e.target.dataset.category)}`;
        }
    });

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        if (query.length < 1) {
            suggestionsContainer.classList.add('hidden');
            return;
        }
        const suggestions = filteredProductsCache.filter(p => {
            const nameMatch = p.name.toLowerCase().includes(query);
            let keywordMatch = false;
            if (p.product_of_keyword && Array.isArray(p.product_of_keyword)) {
                keywordMatch = p.product_of_keyword.some(k => k.toLowerCase().startsWith(query));
            }
            return nameMatch || keywordMatch;
        }).slice(0, 5);

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

function renderSearch(searchData) { 
    const searchInput = document.getElementById('home-search-input'); 
    if (!searchInput || !searchData?.scrollingTexts?.length) { 
        if(searchInput) searchInput.placeholder = "Search for products..."; 
        return; 
    } 
    const texts = searchData.scrollingTexts; 
    let i = 0; 
    if (window.searchInterval) clearInterval(window.searchInterval); 
    const updatePlaceholder = () => { 
        if (searchInput && document.activeElement !== searchInput) { 
            searchInput.placeholder = `Search for ${texts[i]}...`; 
            i = (i + 1) % texts.length; 
        } 
    }; 
    updatePlaceholder(); 
    window.searchInterval = setInterval(updatePlaceholder, 3000); 
}

// --- HEADER SCROLL ---
function setupHeaderScrollEffect() {
    const header = document.getElementById('page-header');
    if (!header) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('header-scrolled');
        } else {
            header.classList.remove('header-scrolled');
        }
    }, { passive: true });
}

// --- RECENTLY VIEWED ---
function renderRecentlyViewed() {
    const section = document.getElementById('recently-viewed-section');
    const container = document.getElementById('recently-viewed-container');
    if (!section || !container) return;
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
    } catch (error) { section.style.display = 'none'; }
}

// --- FESTIVE COLLECTION LOGIC ---
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
            // Using render-utils function
            productsHTML += createFestiveCardHTML(product, { soldPercentage: metadata[id]?.soldPercentage });
            productsFound++;
        }
    });
    if(productsFound === 0) { container.style.display = 'none'; return; }
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

// --- DEALS OF THE DAY (INFINITE SCROLL) ---
function getDealsOfTheDayProducts() {
    if (!filteredProductsCache || filteredProductsCache.length === 0) return [];
    return [...filteredProductsCache].sort((a, b) => {
        const discountA = (a.originalPrice || 0) - (a.displayPrice || 0);
        const discountB = (b.originalPrice || 0) - (b.displayPrice || 0);
        return (discountB - discountA) || ((b.rating || 0) - (a.rating || 0));
    });
}

function renderHighlightedProducts() {
    const wrapper = document.getElementById('highlighted-products-wrapper');
    const section = document.getElementById('highlighted-products-section');
    if (!wrapper || !section) { if (section) section.style.display = 'none'; return; }

    dealsOfTheDayProducts = getDealsOfTheDayProducts(); 

    if (dealsOfTheDayProducts.length === 0) {
        section.style.display = 'block'; 
        wrapper.innerHTML = `<p class="text-center text-gray-500 col-span-full py-10">No deals available right now.</p>`; 
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
        wrapper.innerHTML = `<p class="text-center text-gray-500 col-span-full py-10">No deals found.</p>`;
        return; 
    }
    isLoadingDeals = true;
    setTimeout(() => {
        // Calling createProductCardHTML from render-utils.js
        const productsHTML = productsToLoad.map(p => createProductCardHTML(p)).join('');
        wrapper.insertAdjacentHTML('beforeend', productsHTML);
        currentlyDisplayedDeals += productsToLoad.length;
        isLoadingDeals = false;
        if (currentlyDisplayedDeals >= dealsOfTheDayProducts.length) { 
            loader.style.display = 'none'; 
            if (dealsObserver) dealsObserver.disconnect(); 
        }
    }, 500);
}

// --- EVENT LISTENERS ---
function setupGlobalEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    document.body.addEventListener('click', function (event) {
        // Buy Button
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
        // Add to Cart Button
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
            return; 
        }

        // Location Logic
        const locationTrigger = event.target.closest('#location-trigger');
        if (locationTrigger) { openLocationPopup(); return; }

        const closeLocBtn = event.target.closest('#close-location-btn');
        if (closeLocBtn) { closeLocationPopup(); return; }

        const locOverlay = document.getElementById('location-overlay');
        if (event.target === locOverlay) { closeLocationPopup(); return; }

        const stateTab = event.target.closest('.loc-tab-btn[data-state]');
        if (stateTab && !stateTab.dataset.district) {
            currentSelectedState = stateTab.dataset.state;
            currentSelectedDistrict = null; 
            document.getElementById('loc-area-search-input').value = '';
            // Call util function
            renderStateTabs(allLocationsCache, currentSelectedState); 
            return;
        }

        const districtTab = event.target.closest('.loc-tab-btn[data-district]');
        if (districtTab) {
            currentSelectedDistrict = districtTab.dataset.district;
            document.getElementById('loc-area-search-input').value = '';
            // Call util function
            renderDistrictTabs(currentSelectedState, allLocationsCache, currentSelectedDistrict); 
            return;
        }

        const locItem = event.target.closest('.location-item');
        if (locItem) {
            const selectedLocPath = locItem.dataset.path; 
            const currentLoc = localStorage.getItem('userLocation');

            if (selectedLocPath === currentLoc) {
                closeLocationPopup(); 
                return;
            }
            localStorage.setItem('userLocation', selectedLocPath);
            setupLocationSelectionsFromStorage(); 
            const headerText = document.getElementById('header-location-text');
            if (headerText) headerText.textContent = formatLocation(selectedLocPath);

            renderAreaList(currentSelectedState, currentSelectedDistrict, '', allLocationsCache, selectedLocPath); 
            filterProductsByLocation();
            rerenderProductSections(); 
            setTimeout(closeLocationPopup, 200);
            return;
        }
    });
}

function setupSideMenu() { const menuToggleBtn = document.getElementById('menu-toggle-btn'); const sideMenu = document.getElementById('side-menu'); const menuOverlay = document.getElementById('menu-overlay'); const followItem = document.getElementById('menu-follow-item'); const followSubmenu = document.getElementById('follow-submenu'); if (menuToggleBtn && sideMenu && menuOverlay) { menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('menu-open')); menuOverlay.addEventListener('click', () => document.body.classList.remove('menu-open')); } if (followItem && followSubmenu) { followItem.addEventListener('click', (e) => { e.preventDefault(); followItem.classList.toggle('open'); followSubmenu.classList.toggle('open'); }); } }

function setupScrollAnimations() {
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// --- SLIDER BEHAVIOR (LOGIC) ---
// Init functions remain in main.js as they handle intervals and events
let currentSlide = 1, totalSlides = 0, sliderInterval, isTransitioning = false;
function initializeSlider(count) { const slider = document.getElementById("main-slider"); const dots = document.getElementById("slider-dots-container"); totalSlides = count; if (totalSlides <= 1) { if (dots) dots.style.display = "none"; return; } slider.appendChild(slider.children[0].cloneNode(true)); slider.insertBefore(slider.children[totalSlides - 1].cloneNode(true), slider.children[0]); slider.style.transform = `translateX(-${100 * currentSlide}%)`; dots.innerHTML = Array.from({ length: totalSlides }, (_, i) => `<div class="dot" data-slide="${i + 1}"><div class="timer"></div></div>`).join(''); dots.addEventListener("click", e => { const dot = e.target.closest(".dot"); if (dot) goToSlide(parseInt(dot.dataset.slide)); }); let startPos = 0; const swipeThreshold = 50; const getPositionX = e => e.type.includes("mouse") ? e.pageX : e.touches[0].clientX; const swipeStart = e => { startPos = getPositionX(e); clearInterval(sliderInterval); }; const swipeEnd = e => { const endPos = e.type.includes("touch") ? e.changedTouches[0].clientX : e.pageX; if (Math.abs(endPos - startPos) > swipeThreshold) { moveSlide(endPos < startPos ? 1 : -1); } resetSliderInterval(); }; slider.addEventListener("mousedown", swipeStart); slider.addEventListener("touchstart", swipeStart, { passive: true }); slider.addEventListener("mouseup", swipeEnd); slider.addEventListener("touchend", swipeEnd); slider.addEventListener("transitionend", () => { isTransitioning = false; if (currentSlide === 0 || currentSlide === totalSlides + 1) { slider.classList.remove("transitioning"); currentSlide = (currentSlide === 0) ? totalSlides : 1; slider.style.transform = `translateX(-${100 * currentSlide}%)`; } }); updateDots(); resetSliderInterval(); }
function moveSlide(dir) { if (isTransitioning) return; isTransitioning = true; const slider = document.getElementById("main-slider"); slider.classList.add("transitioning"); currentSlide += dir; slider.style.transform = `translateX(-${100 * currentSlide}%)`; updateDots(); }
function goToSlide(num) { if (isTransitioning || currentSlide === num) return; moveSlide(num - currentSlide); resetSliderInterval(); }
function updateDots() { const dots = document.querySelectorAll(".slider-dots .dot"); dots.forEach(d => { d.classList.remove("active"); const timer = d.querySelector(".timer"); if (timer) { timer.style.transition = "none"; timer.style.width = "0%"; } }); let activeDotIndex = (currentSlide - 1 + totalSlides) % totalSlides; const activeDot = dots[activeDotIndex]; if (activeDot) { activeDot.classList.add("active"); const timer = activeDot.querySelector(".timer"); if (timer) { void timer.offsetWidth; timer.style.transition = "width 5000ms linear"; timer.style.width = "100%"; } } }
function resetSliderInterval() { clearInterval(sliderInterval); sliderInterval = setInterval(() => moveSlide(1), 5000); }

let jfyCurrentSlide = 1, jfyTotalSlides = 0, jfySliderInterval, jfyIsTransitioning = false;
function initializeJfySlider(count) { const slider = document.querySelector(".jfy-poster-slider"), dots = document.querySelector(".jfy-slider-dots"); if (!slider) return; if ((jfyTotalSlides = count) <= 1) return void (dots && (dots.style.display = "none")); slider.appendChild(slider.children[0].cloneNode(!0)), slider.insertBefore(slider.children[jfyTotalSlides - 1].cloneNode(!0), slider.children[0]), slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`, slider.addEventListener("transitionend", () => { jfyIsTransitioning = !1, 0 === jfyCurrentSlide && (slider.classList.remove("transitioning"), jfyCurrentSlide = jfyTotalSlides, slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`), jfyCurrentSlide === jfyTotalSlides + 1 && (slider.classList.remove("transitioning"), jfyCurrentSlide = 1, slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`) }), dots.innerHTML = ""; for (let i = 0; i < jfyTotalSlides; i++)dots.innerHTML += '<div class=\"dot\" data-slide=\"'.concat(i + 1, '\"></div>'); dots.addEventListener("click", e => { e.target.closest(".dot") && goToJfySlide(e.target.closest(".dot").dataset.slide) }), updateJfyDots(), resetJfySliderInterval() }
function moveJfySlide(dir) { if (jfyIsTransitioning) return; const slider = document.querySelector(".jfy-poster-slider"); slider && (jfyIsTransitioning = !0, slider.classList.add("transitioning"), jfyCurrentSlide += dir, slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`, updateJfyDots(), resetJfySliderInterval()) }
function goToJfySlide(num) { if (jfyIsTransitioning || jfyCurrentSlide == num) return; const slider = document.querySelector(".jfy-poster-slider"); slider && (jfyIsTransitioning = !0, slider.classList.add("transitioning"), jfyCurrentSlide = parseInt(num), slider.style.transform = `translateX(-${100 * jfyCurrentSlide}%)`, updateJfyDots(), resetJfySliderInterval()) }
function updateJfyDots() { const dots = document.querySelectorAll(".jfy-slider-dots .dot"); dots.forEach(d => d.classList.remove("active")); let activeDotIndex = jfyCurrentSlide - 1; 0 === jfyCurrentSlide && (activeDotIndex = jfyTotalSlides - 1), jfyCurrentSlide === jfyTotalSlides + 1 && (activeDotIndex = 0); const activeDot = dots[activeDotIndex]; activeDot && activeDot.classList.add("active") }
function resetJfySliderInterval() { clearInterval(jfySliderInterval), jfySliderInterval = setInterval(() => moveJfySlide(1), 4000) }
