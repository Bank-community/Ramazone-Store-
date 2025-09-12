// --- GLOBAL STATE ---
let mediaItems = [], currentMediaIndex = 0, currentProductData = null, currentProductId = null;
let allProductsCache = [];
let selectedVariants = {};
let selectedPack = null; 
let appThemeColor = '#4F46E5';
let database;
let goToCartNotificationTimer = null; // Notification ke liye timer

// --- DOM ELEMENTS ---
let slider, sliderWrapper;

// --- SLIDER STATE ---
let isDragging = false, startPos = 0, currentTranslate = 0, prevTranslate = 0, animationID;

// --- CART FUNCTIONS ---
const getCart = () => { try { const cart = localStorage.getItem('ramazoneCart'); return cart ? JSON.parse(cart) : []; } catch (e) { return []; } };
const saveCart = (cart) => { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); };

const variantsMatch = (v1, v2) => {
    const keys1 = Object.keys(v1 || {});
    const keys2 = Object.keys(v2 || {});
    if (keys1.length !== keys2.length) return false;
    for (let key of keys1) {
        if (v1[key] !== v2[key]) return false;
    }
    return true;
};

const packsMatch = (p1, p2) => {
    if (!p1 && !p2) return true;
    if (!p1 || !p2) return false;
    return p1.name === p2.name;
};

const getCartItem = (productId, variants, pack) => {
    const cart = getCart();
    return cart.find(item => !item.isBundle && item.id === productId && variantsMatch(item.variants, variants) && packsMatch(item.pack, pack));
};

function addToCart(productId, quantity, variants, pack, showToastMsg = true) {
    const cart = getCart();
    const product = allProductsCache.find(p => p && p.id === productId);
    if (!product) return;

    let existingItemIndex = cart.findIndex(item => !item.isBundle && item.id === productId && variantsMatch(item.variants, variants) && packsMatch(item.pack, pack));

    if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += quantity;
    } else {
        cart.push({ id: productId, quantity: quantity, variants: variants || {}, pack: pack || null });
    }
    saveCart(cart);
    if(showToastMsg) {
        showToast(`${product.name} ${pack ? `(${pack.name})` : ''} added to cart!`, 'success');
        showGoToCartNotification();
    }
    updateCartIcon();
    if (productId === currentProductId) {
        updateStickyActionBar();
    }
}

function addBundleToCart(productIds, bundlePrice) {
    const cart = getCart();
    const bundleProducts = productIds.map(id => allProductsCache.find(p => p.id === id)).filter(Boolean);
    if (bundleProducts.length !== productIds.length) {
        showToast('One of the bundle products is unavailable.', 'error');
        return;
    }
    const bundleId = `BUNDLE_${productIds.sort().join('_')}`;
    const existingBundleIndex = cart.findIndex(item => item.isBundle && item.bundleId === bundleId);
    if (existingBundleIndex > -1) {
        cart[existingBundleIndex].quantity += 1;
    } else {
        const bundleObject = {
            isBundle: true,
            bundleId: bundleId,
            bundleName: bundleProducts.map(p => p.name).join(' + '),
            quantity: 1,
            bundlePrice: Number(bundlePrice),
            items: bundleProducts.map(p => ({
                id: p.id,
                name: p.name,
                image: p.images?.[0] || ''
            }))
        };
        cart.push(bundleObject);
    }
    saveCart(cart);
    showToast('Bundle added to cart!', 'success');
    showGoToCartNotification();
    updateCartIcon();
}

function updateCartItemQuantity(productId, newQuantity, variants, pack) {
    let cart = getCart();
    const itemIndex = cart.findIndex(item => item.id === productId && variantsMatch(item.variants, variants) && packsMatch(item.pack, pack));
    if (itemIndex > -1) {
        if (newQuantity > 0) {
            cart[itemIndex].quantity = newQuantity;
        } else {
            cart.splice(itemIndex, 1);
        }
        saveCart(cart);
        updateCartIcon();
        updateStickyActionBar();
    }
}

const getTotalCartQuantity = () => { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); };

function updateCartIcon() {
    const totalQuantity = getTotalCartQuantity();
    const cartCountElement = document.getElementById('cart-item-count');
    if (cartCountElement) {
        cartCountElement.textContent = totalQuantity > 0 ? totalQuantity : '';
    }
}

function showGoToCartNotification() {
    const notification = document.getElementById('go-to-cart-notification');
    const summaryEl = document.getElementById('notification-cart-summary');
    if (!notification || !summaryEl) return;
    clearTimeout(goToCartNotificationTimer);
    const totalQuantity = getTotalCartQuantity();
    summaryEl.textContent = `${totalQuantity} item${totalQuantity > 1 ? 's' : ''} in cart`;
    notification.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
    notification.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    goToCartNotificationTimer = setTimeout(() => {
        notification.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
        notification.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }, 3000);
}

function updateStickyActionBar() {
    if (!currentProductId) return;
    const cartItem = getCartItem(currentProductId, selectedVariants, selectedPack);
    const qtyWrapper = document.getElementById('quantity-selector-wrapper');
    const qtyDisplay = document.getElementById('quantity-display');
    const decreaseBtn = document.getElementById('decrease-quantity');
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    const goToCartBtn = document.getElementById('go-to-cart-btn');
    const mainActionContainer = document.getElementById('main-action-container');
    if (cartItem) {
        qtyDisplay.textContent = cartItem.quantity;
        decreaseBtn.disabled = cartItem.quantity <= 1;
        qtyWrapper.classList.remove('hidden');
        mainActionContainer.classList.remove('col-start-1', 'col-span-2');
        mainActionContainer.classList.add('col-start-2');
        addToCartBtn.classList.add('hidden');
        goToCartBtn.classList.remove('hidden');
    } else {
        qtyWrapper.classList.add('hidden');
        mainActionContainer.classList.add('col-start-1', 'col-span-2');
        mainActionContainer.classList.remove('col-start-2');
        addToCartBtn.classList.remove('hidden');
        goToCartBtn.classList.add('hidden');
    }
}

function setupHeaderScrollEffect() {
    const defaultHeader = document.getElementById('default-header-content');
    const searchHeader = document.getElementById('search-header-content');
    if (!defaultHeader || !searchHeader) return;
    const SCROLL_THRESHOLD = 50;
    window.addEventListener('scroll', () => {
        if (window.scrollY > SCROLL_THRESHOLD) {
            if (!defaultHeader.classList.contains('header-hidden')) {
                defaultHeader.classList.add('header-hidden');
                searchHeader.classList.remove('hidden');
                searchHeader.classList.remove('header-hidden');
            }
        } else {
            if (defaultHeader.classList.contains('header-hidden')) {
                defaultHeader.classList.remove('header-hidden');
                searchHeader.classList.add('header-hidden');
                setTimeout(() => { if (window.scrollY <= SCROLL_THRESHOLD) searchHeader.classList.add('hidden'); }, 300);
            }
        }
    }, { passive: true });
}

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        const firebaseConfig = await response.json();
        if (firebaseConfig.apiKey) {
            firebase.initializeApp(firebaseConfig);
            database = firebase.database();
            await fetchAllData();
            fetchProductData();
        } else {
            throw new Error("Firebase config invalid.");
        }
    } catch (error) {
        console.error("Initialization Failed:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Could not initialize.</p>';
    }
}

async function fetchAllData() {
    const snapshot = await database.ref('ramazone').get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        appThemeColor = data.config?.themeColor || '#4F46E5';
        document.documentElement.style.setProperty('--primary-color', appThemeColor);
        const allProds = Object.values(data.products || {});
        allProductsCache = allProds.filter(p => p && p.isVisible !== false);
    }
}

function fetchProductData() {
    currentProductId = new URLSearchParams(window.location.search).get('id')?.trim();
    if (!currentProductId) {
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product ID not found.</p>';
        return;
    }
    const product = allProductsCache.find(p => p && p.id == currentProductId);
    if (product) {
        currentProductData = product;
        loadPageSectionsAndData(product);
    } else {
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product not found or is currently unavailable.</p>';
    }
}

async function loadPageSectionsAndData(data) {
    try {
        const [mediaHtml, infoHtml, similarHtml] = await Promise.all([
            fetch('product-details-sections/media-gallery.html').then(res => res.text()),
            fetch('product-details-sections/product-main-info.html').then(res => res.text()),
            fetch('product-details-sections/similar-products.html').then(res => res.text())
        ]);
        document.getElementById('media-gallery-container').innerHTML = mediaHtml;
        document.getElementById('product-main-info-container').innerHTML = infoHtml;
        document.getElementById('similar-products-container-wrapper').innerHTML = similarHtml;
        populateDataAndAttachListeners(data);
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('product-content').style.display = 'block';
    } catch (error) {
        console.error("Error loading page sections:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Could not load sections.</p>';
    }
}

function populateDataAndAttachListeners(data) {
    document.title = `${data.name || "Product"} - Ramazone`;
    document.querySelector('meta[property="og:title"]').setAttribute("content", data.name);
    document.querySelector('meta[property="og:image"]').setAttribute("content", data.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png");
    document.getElementById("product-title").textContent = data.name;
    slider = document.getElementById('media-slider');
    sliderWrapper = document.getElementById('main-media-wrapper');
    mediaItems = (data.images?.map(src => ({ type: "image", src })) || []).concat(data.videoUrl ? [{ type: "video", src: data.videoUrl, thumbnail: data.images?.[0] }] : []);
    renderMediaGallery();
    showMedia(0);
    setupSliderControls();
    setupImageModal();
    if (data.rating && data.reviewCount) {
        document.getElementById("rating-section").style.display = "flex";
        renderStars(data.rating, document.getElementById("product-rating-stars"));
        document.getElementById("product-review-count").textContent = `(${data.reviewCount} reviews)`;
    }
    if (data.sellerName) {
        document.getElementById("seller-info").textContent = `Seller by: ${data.sellerName}`;
        document.getElementById("seller-info").style.display = "block";
    }
    updatePriceDisplay();
    renderProductOptions(data); 
    setupVariantModal();
    setupBundleModal();
    renderAdvancedHighlights(data.specHighlights);
    renderDescription(data);
    setupActionControls();
    updateRecentlyViewed(data.id);
    loadHandpickedSimilarProducts(data.similarProductIds);
    loadCategoryBasedProducts(data.category);
    loadOtherProducts(data.category);
    updateCartIcon();
    updateStickyActionBar();
    document.getElementById('similar-products-container-wrapper').addEventListener('click', handleQuickAdd);
    document.getElementById('options-container').addEventListener('click', handleOptionsClick);
    setupHeaderScrollEffect();
}


function handleOptionsClick(event) {
    const bundleCard = event.target.closest('.product-bundle-card');
    const bundleAddBtn = event.target.closest('.final-bundle-plus-btn[data-bundle="true"]');

    if (bundleAddBtn) {
        event.preventDefault();
        event.stopPropagation();
        const bundleCardEl = bundleAddBtn.closest('.product-bundle-card');
        const productIds = bundleCardEl.dataset.productIds.split(',');
        const bundlePrice = bundleCardEl.dataset.price;
        addBundleToCart(productIds, bundlePrice);
        return;
    }

    if (bundleCard) {
        event.preventDefault();
        const productIds = bundleCard.dataset.productIds.split(',');
        const bundlePrice = bundleCard.dataset.price;
        openBundleModal(productIds, bundlePrice);
    }
}

function renderProductOptions(data) {
    const container = document.getElementById('options-container');
    if (!container) return;
    container.innerHTML = '';
    selectedVariants = {};
    selectedPack = null;

    if (data.variants && Array.isArray(data.variants)) {
        data.variants.forEach(variant => {
            if (variant.options && variant.options.length > 0) {
                selectedVariants[variant.type] = variant.options[0].name;
                const variantButtonHTML = createVariantButton(variant);
                container.insertAdjacentHTML('beforeend', variantButtonHTML);
            }
        });
    }

    if (data.combos && data.combos.quantityPacks && Array.isArray(data.combos.quantityPacks)) {
        const packs = data.combos.quantityPacks.map(p => ({ name: p.name, price: p.price }));
        const singleItemOption = { name: 'Single Item', price: data.displayPrice };
        const allOptions = [singleItemOption, ...packs];
        selectedPack = null;
        const comboHTML = createComboPackGrid(allOptions, data);
        container.insertAdjacentHTML('beforeend', comboHTML);
        attachComboPackListeners(container.lastElementChild);
    }

    if (data.combos && data.combos.productBundle && data.combos.productBundle.linkedProductIds) {
        const bundle = data.combos.productBundle;
        const linkedProducts = bundle.linkedProductIds.map(id => allProductsCache.find(p => p.id === id)).filter(Boolean);

        if (linkedProducts.length === bundle.linkedProductIds.length) {
            (async () => {
                try {
                    const response = await fetch('product-details-sections/product-bundle.html');
                    if (!response.ok) throw new Error('Bundle template not found');
                    let templateHTML = await response.text();
                    const allBundleProducts = [data, ...linkedProducts];
                    const bundlePrice = Number(bundle.bundlePrice);
                    const productIds = allBundleProducts.map(p => p.id).join(',');
                    const imagesHTML = allBundleProducts.map(p => `<img src="${p.images?.[0] || ''}" alt="${p.name}">`).join('');
                    const namesHTML = allBundleProducts.map(p => p.name).join(' + ');
                    const originalTotal = allBundleProducts.reduce((sum, p) => sum + Number(p.displayPrice), 0);
                    let originalPriceHTML = '';
                    if (originalTotal > bundlePrice) {
                        originalPriceHTML = `<span class="original-price">₹${originalTotal.toLocaleString('en-IN')}</span>`;
                    }
                    templateHTML = templateHTML
                        .replace('{{productIds}}', productIds)
                        .replace('{{bundlePrice}}', bundlePrice)
                        .replace('{{bundleImages}}', imagesHTML)
                        .replace('{{bundleNames}}', namesHTML)
                        .replace('{{bundlePriceFormatted}}', bundlePrice.toLocaleString('en-IN'))
                        .replace('{{originalPriceHTML}}', originalPriceHTML);
                    container.insertAdjacentHTML('beforeend', templateHTML);
                } catch (error) {
                    console.error("Failed to load or process bundle template:", error);
                }
            })();
        }
    }
}


function createComboPackGrid(options, productData) { const singleItemOriginalPrice = Number(productData.originalPrice) > Number(productData.displayPrice) ? Number(productData.originalPrice) : Number(productData.displayPrice); let bestValueIndex = -1; let maxSavings = -1; const calculatedOptions = options.map((opt, index) => { const quantity = parseInt(opt.name.split(' ')[0]) || 1; const packMrp = singleItemOriginalPrice * quantity; const packPrice = Number(opt.price); let savings = 0; let discount = 0; if (packMrp > packPrice) { savings = packMrp - packPrice; discount = Math.round((savings / packMrp) * 100); } if (savings > maxSavings) { maxSavings = savings; bestValueIndex = index; } return { ...opt, packMrp, discount, savings }; }); const cardsHTML = calculatedOptions.map((opt, index) => { const isBestValue = index === bestValueIndex && maxSavings > 0; const isSelected = index === 0; return ` <div class="combo-pack-card ${isSelected ? 'selected' : ''}" data-value="${opt.name}" data-price="${opt.price || ''}"> ${isBestValue ? '<div class="best-value-tag">Best Value</div>' : ''} <div class="flex items-center"> <img src="${productData.images[0]}" class="combo-pack-icon" alt="product icon"> <div class="flex-grow"> <p class="font-bold text-gray-800">${opt.name}</p> <p class="text-xl font-extrabold" style="color: var(--primary-color);">₹${Number(opt.price).toLocaleString('en-IN')}</p> </div> </div> ${opt.discount > 0 ? ` <div class="combo-pack-savings"> <span class="line-through text-gray-400">₹${opt.packMrp.toLocaleString('en-IN')}</span> <span class="font-semibold text-green-600">${opt.discount}% OFF</span> <span class="font-bold text-green-700">(Save ₹${opt.savings.toLocaleString('en-IN')})</span> </div> ` : ''} </div> `; }).join(''); return ` <div class="combo-pack-container mt-4"> <h3 class="text-md font-bold text-gray-800 mb-2">Available Combo Packs</h3> <div class="combo-pack-grid">${cardsHTML}</div> </div> `; }
function attachComboPackListeners(container) { const cards = container.querySelectorAll('.combo-pack-card'); cards.forEach(card => { card.addEventListener('click', (e) => { cards.forEach(c => c.classList.remove('selected')); card.classList.add('selected'); const selectedValue = card.dataset.value; const selectedPrice = card.dataset.price; if (selectedValue === 'Single Item') { selectedPack = null; } else { selectedPack = { name: selectedValue, price: selectedPrice }; } updatePriceDisplay(selectedPrice); updateStickyActionBar(); }); }); }
function createVariantButton(variant) { const firstOptionName = variant.options[0].name; return ` <button class="variant-btn" data-variant-type="${variant.type}"> <span>${variant.type}: <span class="value">${firstOptionName}</span></span> <i class="fas fa-chevron-down text-xs"></i> </button> `; }

function openBundleModal(productIds, bundlePrice) {
    const products = productIds.map(id => allProductsCache.find(p => p.id === id)).filter(Boolean);
    if (products.length !== productIds.length) return;
    const originalTotal = products.reduce((sum, p) => sum + Number(p.displayPrice), 0);
    const savings = originalTotal - bundlePrice;
    const discountPercent = Math.round((savings / originalTotal) * 100);
    const modalBody = document.getElementById('bundle-modal-body');
    const imagesHTML = products.map(p => `<img src="${p.images[0]}" alt="${p.name}">`).join('<span class="plus-icon">+</span>');
    const namesHTML = products.map(p => p.name).join(' + ');
    modalBody.innerHTML = `
        <div class="bundle-modal-products">${imagesHTML}</div>
        <div class="bundle-modal-details">
            <p class="product-names">${namesHTML}</p>
            <div class="bundle-price-summary">
                <p class="text-sm text-gray-500">Bundle Price</p>
                <p class="final-price">₹${Number(bundlePrice).toLocaleString('en-IN')}</p>
                <p class="original-price-info">Original Total: <span class="line-through">₹${originalTotal.toLocaleString('en-IN')}</span></p>
                <div class="savings-badge">You save ₹${savings.toLocaleString('en-IN')} (${discountPercent}%) ✨</div>
            </div>
        </div>
    `;
    const modalFooter = document.getElementById('bundle-modal-footer');
    modalFooter.innerHTML = `<button id="add-bundle-to-cart-btn" class="w-full text-white font-bold py-3 px-4 rounded-xl text-lg" style="background-color: var(--primary-color);">Add Bundle to Cart</button>`;
    document.getElementById('add-bundle-to-cart-btn').onclick = () => {
        addBundleToCart(productIds, bundlePrice);
        closeBundleModal();
    };
    const overlay = document.getElementById('bundle-modal-overlay');
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('active'), 10);
}

function closeBundleModal() { const overlay = document.getElementById('bundle-modal-overlay'); overlay.classList.remove('active'); setTimeout(() => overlay.classList.add('hidden'), 300); }
function setupBundleModal() { const overlay = document.getElementById('bundle-modal-overlay'); document.getElementById('bundle-modal-close').addEventListener('click', closeBundleModal); overlay.addEventListener('click', e => { if (e.target === overlay) closeBundleModal(); }); }

// === YAHAN BADLAV KIYA GAYA HAI: Button ko wapas '+' karne ka logic joda gaya hai ===
function handleQuickAdd(event) {
    const quickAddButton = event.target.closest('.quick-add-btn');
    if (quickAddButton && !quickAddButton.dataset.bundle) {
        event.preventDefault();
        const productId = quickAddButton.dataset.id;
        const product = allProductsCache.find(p => p && p.id === productId);
        if (product) {
            let defaultVariants = {};
            if (product.variants && Array.isArray(product.variants)) {
                product.variants.forEach(variant => {
                    if (variant.type && Array.isArray(variant.options) && variant.options.length > 0) {
                        defaultVariants[variant.type] = variant.options[0].name;
                    }
                });
            }
            addToCart(productId, 1, defaultVariants, null);
            quickAddButton.innerHTML = '<i class="fas fa-check"></i>'; // 'Added' ke bajaye checkmark
            quickAddButton.classList.add('added');

            // 1.5 second baad button ko wapas normal karne ke liye
            setTimeout(() => {
                quickAddButton.innerHTML = '+'; // Wapas '+'
                quickAddButton.classList.remove('added');
            }, 1500);
        }
    }
}
function setupActionControls() { document.getElementById('add-to-cart-btn').addEventListener('click', () => { addToCart(currentProductId, 1, selectedVariants, selectedPack); }); document.getElementById('increase-quantity').addEventListener('click', () => { const item = getCartItem(currentProductId, selectedVariants, selectedPack); if (item) updateCartItemQuantity(currentProductId, item.quantity + 1, selectedVariants, selectedPack); }); document.getElementById('decrease-quantity').addEventListener('click', () => { const item = getCartItem(currentProductId, selectedVariants, selectedPack); if (item) updateCartItemQuantity(currentProductId, item.quantity - 1, selectedVariants, selectedPack); }); setupShareButton(); }
function openVariantModal(variantType) { const variant = currentProductData.variants.find(v => v.type === variantType); if (!variant) return; const overlay = document.getElementById("variant-modal-overlay"); const titleEl = document.getElementById("variant-modal-title"); const bodyEl = document.getElementById("variant-modal-body"); titleEl.textContent = `Select ${variant.type}`; bodyEl.innerHTML = ""; variant.options.forEach(option => { const isSelected = selectedVariants[variant.type] === option.name; const optionEl = document.createElement("div"); optionEl.className = `variant-option ${isSelected ? "selected" : ""}`; let contentHTML = (variant.type.toLowerCase() === 'color' && option.value) ? `<div class="color-swatch" style="background-color: ${option.value};"></div> <span class="flex-grow">${option.name}</span>` : `<span>${option.name}</span>`; optionEl.innerHTML = contentHTML; optionEl.addEventListener("click", () => { selectedVariants[variant.type] = option.name; updateVariantButtonDisplay(variant.type, option.name); updateStickyActionBar(); closeVariantModal(); }); bodyEl.appendChild(optionEl); }); overlay.classList.remove("hidden"); setTimeout(() => overlay.classList.add("active"), 10); }
function closeVariantModal() { const overlay = document.getElementById("variant-modal-overlay"); overlay.classList.remove("active"); setTimeout(() => overlay.classList.add("hidden"), 300); }
function updateVariantButtonDisplay(type, value) { const btn = document.querySelector(`.variant-btn[data-variant-type="${type}"] .value`); if (btn) btn.textContent = value; }
function setupVariantModal() { const overlay = document.getElementById("variant-modal-overlay"); document.getElementById("variant-modal-close").addEventListener("click", closeVariantModal); overlay.addEventListener("click", e => { if (e.target === overlay) closeVariantModal(); }); document.getElementById('options-container').addEventListener('click', e => { const btn = e.target.closest('.variant-btn'); if (btn) { openVariantModal(btn.dataset.variantType); } }); }
function updatePriceDisplay(newPrice) { const finalPriceEl = document.getElementById("price-final"); const originalPriceEl = document.getElementById("price-original"); const percentageDiscountEl = document.getElementById("price-percentage-discount"); const displayPrice = newPrice ? Number(newPrice) : (selectedPack ? Number(selectedPack.price) : Number(currentProductData.displayPrice)); const originalPrice = Number(currentProductData.originalPrice); finalPriceEl.textContent = `₹${displayPrice.toLocaleString("en-IN")}`; let discount = 0; let packOriginalPrice = originalPrice; if (selectedPack) { const quantity = parseInt(selectedPack.name.split(' ')[0]) || 1; packOriginalPrice = originalPrice * quantity; } if (packOriginalPrice > displayPrice) { discount = Math.round(100 * (packOriginalPrice - displayPrice) / packOriginalPrice); } if (discount > 0) { percentageDiscountEl.innerHTML = `<i class="fas fa-arrow-down mr-1"></i>${discount}%`; originalPriceEl.textContent = `₹${packOriginalPrice.toLocaleString("en-IN")}`; percentageDiscountEl.style.display = "flex"; originalPriceEl.style.display = "inline"; } else { percentageDiscountEl.style.display = "none"; originalPriceEl.style.display = "none"; } }

async function loadHandpickedSimilarProducts(similarIds) {
    const section = document.getElementById("handpicked-similar-section");
    const container = document.getElementById("handpicked-similar-container");

    if (!similarIds || similarIds.length === 0) {
        if(section) section.style.display = "none";
        return;
    }

    if(!container || !section) return;

    container.innerHTML = "";
    let hasContent = false;

    try {
        const response = await fetch('product-details-sections/you-might-like-card.html');
        if (!response.ok) throw new Error('YML card template not found');
        const templateHTML = await response.text();

        similarIds.forEach(id => {
            const product = allProductsCache.find(p => p && p.id === id);
            if (product) {
                const displayPrice = Number(product.displayPrice);
                const originalPriceNum = Number(product.originalPrice);

                let priceHTML = `<span class="display-price">₹${displayPrice.toLocaleString("en-IN")}</span>`;
                if (originalPriceNum > displayPrice) {
                    priceHTML += `<span class="original-price">₹${originalPriceNum.toLocaleString("en-IN")}</span>`;
                }

                const ratingTagHTML = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : "";

                const populatedHTML = templateHTML
                    .replace(/\{\{productId\}\}/g, product.id)
                    .replace(/\{\{productName\}\}/g, product.name)
                    .replace('{{productImage}}', product.images?.[0] || 'https://placehold.co/300x300/f0f0f0/333?text=Ramazone')
                    .replace('{{ratingTagHTML}}', ratingTagHTML)
                    .replace('{{productPriceHTML}}', priceHTML);

                container.innerHTML += populatedHTML;
                hasContent = true;
            }
        });

        if (hasContent) {
            section.style.display = "block";
        } else {
            section.style.display = "none";
        }

    } catch (error) {
        console.error("Error loading handpicked products:", error);
        if(section) section.style.display = "none";
    }
}


function createCarouselCard(product) { const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : ""; const originalPriceNum = Number(product.originalPrice); const displayPriceNum = Number(product.displayPrice); const discount = originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0; const addButton = `<button class="quick-add-btn" data-id="${product.id}">+</button>`; return `<a href="?id=${product.id}" class="carousel-item block bg-white rounded-lg shadow overflow-hidden"><div class="relative"><img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full object-cover aspect-square" alt="${product.name}">${ratingTag}${addButton}</div><div class="p-2"><h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4><div class="flex items-baseline gap-2"><p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}</div>${discount > 0 ? `<p class="text-xs font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}</div></a>`; }
function createRecentlyViewedCard(product) { return ` <a href="?id=${product.id}" class="recently-viewed-item block bg-white"> <div class="relative"> <img src="${product.images?.[0] || 'https://placehold.co/400x400/f0f0f0/333?text=Ramazone'}" class="w-full object-cover aspect-square" alt="${product.name}"> </div> <div class="p-2 text-center"> <h4 class="text-sm font-medium text-gray-700 truncate">${product.name}</h4> </div> </a> `; }
function createGridCard(product) { const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : ""; const originalPriceNum = Number(product.originalPrice); const displayPriceNum = Number(product.displayPrice); const discount = originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0; const showAddButton = displayPriceNum < 500 || product.category === 'grocery'; const addButton = showAddButton ? `<button class="quick-add-btn" data-id="${product.id}">+</button>` : ""; return `<a href="?id=${product.id}" class="block bg-white rounded-lg shadow overflow-hidden"><div class="relative"><img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full h-auto object-cover aspect-square" alt="${product.name}">${ratingTag}${addButton}</div><div class="p-2 sm:p-3"><h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4><div class="flex items-baseline gap-2"><p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}</div>${discount > 0 ? `<p class="text-sm font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}</div></a>`; }
function renderDescription(data) { const descriptionContainer = document.getElementById("product-description"); const descriptionSection = document.getElementById("description-section"); const returnPolicyEl = document.getElementById("return-policy-info"); let hasContent = false; descriptionContainer.innerHTML = ""; returnPolicyEl.style.display = "none"; if (data.description && Array.isArray(data.description) && data.description.length > 0) { let descriptionHtml = '<ul class="space-y-3 list-inside">'; data.description.forEach(block => { if (block.details) { descriptionHtml += `<li class="text-base text-gray-600 leading-relaxed">${block.details}</li>`; hasContent = true; } }); descriptionHtml += '</ul>'; descriptionContainer.innerHTML = descriptionHtml; } if (data.returnPolicy && data.returnPolicy.type) { let policyText = ''; switch (data.returnPolicy.type) { case 'days': policyText = `${data.returnPolicy.value} Days Return Available`; break; case 'no_return': policyText = 'No Return Available'; break; case 'custom': policyText = data.returnPolicy.value; break; } if (policyText) { returnPolicyEl.innerHTML = `<i class="fas fa-undo-alt w-5 text-center"></i> <span>${policyText}</span>`; returnPolicyEl.style.display = "flex"; hasContent = true; } } if (hasContent) { descriptionSection.style.display = "block"; } else { descriptionSection.style.display = "none"; } }
function renderAdvancedHighlights(specData) { const container = document.getElementById("advanced-highlights-section"); if (!specData || !specData.blocks || specData.blocks.length === 0) { container.style.display = "none"; return; } let html = `<div class="p-4 sm:p-6 lg:p-8 border-t border-b border-gray-200 my-4"><h2 class="text-xl font-bold text-gray-900 mb-4">Highlights</h2>`; if (specData.specScore || specData.specTag) { html += '<div class="flex items-center gap-3 mb-6">'; if (specData.specScore) { html += `<div class="spec-score font-bold">${specData.specScore}</div>`; } if (specData.specTag) { html += `<div class="spec-tag">${specData.specTag}</div>`; } html += '</div>'; } html += '<div class="space-y-6">'; specData.blocks.forEach(block => { const subtitleStyle = "color: #B8860B; font-weight: 500;"; html += `<div class="flex items-start gap-4"><div class="flex-shrink-0 w-8 h-8 text-gray-600 pt-1">${block.icon || ""}</div><div class="flex-grow"><p class="text-sm text-gray-500">${block.category || ""}</p><h4 class="text-md font-semibold text-gray-800 mt-1">${block.title || ""}</h4><p class="text-sm mt-1" style="${subtitleStyle}">${block.subtitle || ""}</p></div></div>`; }); html += '</div></div>'; container.innerHTML = html; container.style.display = "block"; }
function renderMediaGallery() { const gallery=document.getElementById("thumbnail-gallery");gallery.innerHTML="",slider.innerHTML="",mediaItems.forEach((item,index)=>{const e=document.createElement("div");e.className="media-item","image"===item.type?e.innerHTML=`<img src="${item.src}" alt="Product image ${index+1}" draggable="false">`:getYoutubeEmbedUrl(item.src)&&(e.innerHTML=`<iframe src="${getYoutubeEmbedUrl(item.src)}" class="w-full h-auto object-cover aspect-square" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`),slider.appendChild(e);const t=document.createElement("div");t.className="aspect-square thumbnail";const l=document.createElement("img");l.src="image"===item.type?item.src:item.thumbnail,t.appendChild(l),"video"===item.type&&((n=document.createElement("div")).className="play-icon",n.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="50%" height="50%"><path d="M8 5v14l11-7z"/></svg>',t.appendChild(n));var n;t.addEventListener("click",()=>showMedia(index)),gallery.appendChild(t)}),mediaItems.length>0&&showMedia(0)}
function renderStars(rating, container) { container.innerHTML = ""; const fullStars = Math.floor(rating), halfStar = rating % 1 >= .5, emptyStars = 5 - fullStars - (halfStar ? 1 : 0); for (let i = 0; i < fullStars; i++)container.innerHTML += '<i class="fas fa-star"></i>'; halfStar && (container.innerHTML += '<i class="fas fa-star-half-alt"></i>'); for (let i = 0; i < emptyStars; i++)container.innerHTML += '<i class="far fa-star"></i>' }
function getYoutubeEmbedUrl(url) { if(!url)return null;let videoId=null;try{const urlObj=new URL(url);if("www.youtube.com"===urlObj.hostname||"youtube.com"===urlObj.hostname)videoId=urlObj.searchParams.get("v");else if("youtu.be"===urlObj.hostname)videoId=urlObj.pathname.slice(1);return videoId?`https://www.youtube.com/embed/${videoId}?controls=1&rel=0&modestbranding=1`:null}catch(e){return console.error("Invalid video URL:",url,e),null}}
function showMedia(index) { if(!(index<0||index>=mediaItems.length))slider.style.transition="transform 0.3s ease-out",currentMediaIndex=index,currentTranslate=index*-sliderWrapper.offsetWidth,prevTranslate=currentTranslate,setSliderPosition(),document.querySelectorAll(".thumbnail").forEach((t,e)=>t.classList.toggle("active",e===index))}
function setupSliderControls() { sliderWrapper.addEventListener("touchstart",touchStart,{passive:!0}),sliderWrapper.addEventListener("touchend",touchEnd),sliderWrapper.addEventListener("touchmove",touchMove,{passive:!0}),sliderWrapper.addEventListener("mousedown",touchStart),sliderWrapper.addEventListener("mouseup",touchEnd),sliderWrapper.addEventListener("mouseleave",touchEnd),sliderWrapper.addEventListener("mousemove",touchMove)}
function touchStart(event) { startPos=getPositionX(event),isDragging=!0,animationID=requestAnimationFrame(animation),slider.style.transition="none"}
function touchMove(event) { if(isDragging){const e=getPositionX(event);currentTranslate=prevTranslate+e-startPos}}
function touchEnd(event) { if(isDragging){isDragging=!1,cancelAnimationFrame(animationID);const e=currentTranslate-prevTranslate;e<-50&&currentMediaIndex<mediaItems.length-1&&currentMediaIndex++,e>50&&currentMediaIndex>0&&currentMediaIndex--,showMedia(currentMediaIndex)}}
function getPositionX(event) { return event.type.includes("mouse")?event.pageX:event.touches[0].clientX}
function animation() { setSliderPosition(),isDragging&&requestAnimationFrame(animation)}
function setSliderPosition() { slider.style.transform=`translateX(${currentTranslate}px)`}
function setupImageModal() { const modal=document.getElementById("image-modal"),modalImg=document.getElementById("modal-image-content"),closeBtn=document.querySelector("#image-modal .close"),prevBtn=document.querySelector("#image-modal .prev"),nextBtn=document.querySelector("#image-modal .next");sliderWrapper.onclick=e=>{if(isDragging||currentTranslate-prevTranslate!=0)return;"image"===mediaItems[currentMediaIndex].type&&(modal.style.display="flex",modalImg.src=mediaItems[currentMediaIndex].src)},closeBtn.onclick=()=>modal.style.display="none";const showModalImage=direction=>{let e=mediaItems.map((e,t)=>({...e,originalIndex:t})).filter(e=>"image"===e.type);if(0!==e.length){const t=e.findIndex(e=>e.originalIndex===currentMediaIndex);let n=(t+direction+e.length)%e.length;const r=e[n];modalImg.src=r.src,showMedia(r.originalIndex)}};prevBtn.onclick=e=>{e.stopPropagation(),showModalImage(-1)},nextBtn.onclick=e=>{e.stopPropagation(),showModalImage(1)}}
function setupShareButton() { document.getElementById("share-button").addEventListener("click",async()=>{const e=currentProductData.name.replace(/\*/g,"").trim(),t=`*${e}*\nPrice: *₹${Number(currentProductData.displayPrice).toLocaleString("en-IN")}*\n\n✨ Discover more at Ramazone! ✨\n${window.location.href}`;navigator.share?await navigator.share({text:t}):navigator.clipboard.writeText(window.location.href).then(()=>showToast("Link Copied!"))})}
function showToast(message, type = "info") { const toast=document.getElementById("toast-notification");toast.textContent=message,toast.style.backgroundColor="error"===type?"#ef4444":"#333",toast.classList.add("show"),setTimeout(()=>toast.classList.remove("show"),2500)}
function updateRecentlyViewed(newId) { let viewedIds = JSON.parse(localStorage.getItem("ramazoneRecentlyViewed")) || []; viewedIds = viewedIds.filter(e => e !== newId); viewedIds.unshift(newId); viewedIds = viewedIds.slice(0, 10); localStorage.setItem("ramazoneRecentlyViewed", JSON.stringify(viewedIds)); loadRecentlyViewed(viewedIds); }
function loadRecentlyViewed(viewedIds) { const container=document.getElementById("recently-viewed-container"),section=document.getElementById("recently-viewed-section");if(container&&section&&(container.innerHTML="",viewedIds&&viewedIds.length>1)){let t=0;viewedIds.filter(e=>e!=currentProductId).forEach(e=>{const n=allProductsCache.find(t=>t.id==e); if (n) { container.innerHTML += createRecentlyViewedCard(n); t++; } }),t>0?section.style.display="block":section.style.display="none"}else section.style.display="none"}
function loadCategoryBasedProducts(category) { const section=document.getElementById("similar-products-section"),container=document.getElementById("similar-products-container");if(!category||!allProductsCache)return void(section.style.display="none");container.innerHTML="";let cardCount=0;allProductsCache.forEach(product=>{product&&product.category===category&&product.id!=currentProductId&&(container.innerHTML+=createCarouselCard(product),cardCount++)}),cardCount>0?section.style.display="block":section.style.display="none"}
function loadOtherProducts(currentCategory) { const otherProducts = allProductsCache.filter(p => p.category !== currentCategory && p.id != currentProductId).map(p => { const discount = Number(p.originalPrice) > Number(p.displayPrice) ? 100 * ((Number(p.originalPrice) - Number(p.displayPrice)) / Number(p.originalPrice)) : 0, rating = p.rating || 0, score = 5 * rating + .5 * discount; return { ...p, score: score } }).sort((a, b) => b.score - a.score).slice(0, 20), container = document.getElementById("other-products-container"); if (!container) return; container.innerHTML = "", otherProducts.length > 0 && (otherProducts.forEach(product => { container.innerHTML += createGridCard(product) }), document.getElementById("other-products-section").style.display = "block") }

