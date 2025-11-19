// --- GLOBAL STATE ---
let mediaItems = [], currentMediaIndex = 0, currentProductData = null, currentProductId = null;
let allProductsCache = [];
let selectedVariants = {}; // Ab yeh sirf current product ke variant ko store karega
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

// variantsMatch ab zaroori nahi hai kyunki har variant ek alag product ID hai
const variantsMatch = (v1, v2) => {
    const keys1 = Object.keys(v1 || {});
    const keys2 = Object.keys(v2 || {});
    if (keys1.length === 0 && keys2.length === 0) return true;
    if (keys1.length !== 1 || keys2.length !== 1) return false; 
    return v1[keys1[0]] === v2[keys2[0]];
};


const packsMatch = (p1, p2) => {
    if (!p1 && !p2) return true;
    if (!p1 || !p2) return false;
    return p1.name === p2.name;
};

const getCartItem = (productId, variants, pack) => {
    const cart = getCart();
    // Har product variant ki ab apni unique ID hai, isliye hum sirf ID aur Pack se match karenge
    return cart.find(item => !item.isBundle && item.id === productId && packsMatch(item.pack, pack));
};

function addToCart(productId, quantity, variants, pack, showToastMsg = true) {
    const cart = getCart();
    const product = allProductsCache.find(p => p && p.id === productId);
    if (!product) return;

    let existingItemIndex = cart.findIndex(item => !item.isBundle && item.id === productId && packsMatch(item.pack, pack));

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
    const itemIndex = cart.findIndex(item => item.id === productId && packsMatch(item.pack, pack));
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
        const allProds = Array.isArray(data.products) ? data.products : Object.values(data.products || {});
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

    selectedVariants = (data.variantType && data.variantValue) ? { [data.variantType]: data.variantValue } : {};
    selectedPack = null; 

    updatePriceDisplay();

    renderVariantSelectors(data); 
    renderComboPacks(data);       
    renderProductBundles(data);   
    renderTechSpecs(data.techSpecs); 

    setupBundleModal();
    renderAdvancedHighlights(data.specHighlights);
    renderDescription(data);
    setupActionControls();

    updateRecentlyViewed(data.id);
    loadHandpickedSimilarProducts(data.category, data.subcategory, data.id);
    loadCategoryBasedProducts(data.category);
    loadOtherProducts(data.category);
    updateCartIcon();
    updateStickyActionBar();

    document.getElementById('similar-products-container-wrapper').addEventListener('click', handleQuickAdd);
    document.getElementById('media-gallery-container').addEventListener('click', handleOptionsClick);
    document.getElementById('product-main-info-container').addEventListener('click', handleOptionsClick);

    setupHeaderScrollEffect();
}

function handleOptionsClick(event) {
    const bundleCard = event.target.closest('.product-bundle-card');
    const bundleAddBtn = event.target.closest('.final-bundle-plus-btn[data-bundle="true"]');
    const comboCard = event.target.closest('.combo-pack-card');
    const imageVariantBtn = event.target.closest('.image-variant-btn');

    if (imageVariantBtn) return;
    const textVariantBtn = event.target.closest('.variant-option-btn');
    if (textVariantBtn) return;

    if (bundleAddBtn) {
        event.preventDefault(); event.stopPropagation();
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
        return;
    }

    if (comboCard) {
        const container = comboCard.closest('.combo-pack-grid');
        const isAlreadySelected = comboCard.classList.contains('selected');

        container.querySelectorAll('.combo-pack-card').forEach(c => c.classList.remove('selected'));

        if (isAlreadySelected) {
            selectedPack = null;
            updatePriceDisplay(); 
        } else {
            comboCard.classList.add('selected');
            const selectedValue = comboCard.dataset.value;
            const selectedPrice = comboCard.dataset.price;
            selectedPack = { name: selectedValue, price: selectedPrice };
            updatePriceDisplay(selectedPrice); 
        }
        updateStickyActionBar();
        return;
    }
}

function renderTechSpecs(techSpecs) {
    const container = document.getElementById('tech-specs-container');
    const section = document.getElementById('tech-specs-section');
    if (!container || !section) return;

    if (!techSpecs || !Array.isArray(techSpecs) || techSpecs.length === 0) {
        section.style.display = 'none';
        return;
    }

    container.innerHTML = '';
    let hasContent = false;
    techSpecs.forEach(spec => {
        if (spec.name && spec.value) {
            const iconSvg = spec.svg || '<i class="fas fa-microchip" style="font-size: 20px;"></i>';
            container.innerHTML += `
                <div class="tech-spec-row">
                    <div class="tech-spec-icon">
                        ${iconSvg}
                    </div>
                    <div class="tech-spec-details">
                        <div class="tech-spec-name">${spec.name}</div>
                        <div class="tech-spec-value">${spec.value}</div>
                    </div>
                </div>
            `;
            hasContent = true;
        }
    });

    if (hasContent) {
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

function renderVariantSelectors(data) {
    const imageContainer = document.getElementById('image-variant-selectors-container'); 
    const textContainer = document.getElementById('variant-selectors-container'); 

    if (!imageContainer || !textContainer) return;

    const groupId = data.groupId;
    if (!groupId) {
        imageContainer.innerHTML = ''; textContainer.innerHTML = ''; return;
    }

    const allVariantProducts = allProductsCache.filter(p => p && p.groupId === groupId);
    if (allVariantProducts.length <= 1) {
        imageContainer.innerHTML = ''; textContainer.innerHTML = ''; return;
    }

    const variantTypes = new Map();
    allVariantProducts.forEach(p => {
        if (p.variantType && p.variantValue) {
            if (!variantTypes.has(p.variantType)) {
                variantTypes.set(p.variantType, []);
            }
            variantTypes.get(p.variantType).push({ product: p, value: p.variantValue });
        }
    });

    let imageHtml = '';
    let textHtml = '';

    for (const [type, options] of variantTypes.entries()) {
        let currentProductValue = (data.variantType === type) ? data.variantValue : "N/A";
        if(data.variantType === type) currentProductValue = data.variantValue;

        if (type.toLowerCase() === 'color') {
            imageHtml += `<div class="variant-group">`;
            imageHtml += `<h3 class="variant-group-title">${type}: <span id="selected-variant-${type}">${currentProductValue}</span></h3>`;
            imageHtml += `<div class="variant-options-grid">`;

            options.forEach(opt => {
                const isSelected = (opt.product.id === data.id);
                const imgUrl = opt.product.images[0] || 'https://placehold.co/60x60';
                imageHtml += `
                    <a href="?id=${opt.product.id}" 
                       class="image-variant-btn ${isSelected ? 'selected' : ''}" 
                       title="${opt.value}">
                       <img src="${imgUrl}" alt="${opt.value}">
                       <span class="variant-name">${opt.value}</span>
                    </a>
                `;
            });
            imageHtml += `</div></div>`;

        } else {
            textHtml += `<div class="variant-group">`;
            textHtml += `<h3 class="variant-group-title">${type}: <span id="selected-variant-${type}">${currentProductValue}</span></h3>`;
            textHtml += `<div class="variant-options-grid">`;

            options.forEach(opt => {
                const isSelected = (opt.product.id === data.id);
                textHtml += `
                    <a href="?id=${opt.product.id}" 
                       class="variant-option-btn ${isSelected ? 'selected' : ''}"
                       data-variant-type="${type}" 
                       data-value="${opt.value}">
                       ${opt.value}
                    </a>
                `;
            });
            textHtml += `</div></div>`;
        }
    }

    imageContainer.innerHTML = imageHtml;
    textContainer.innerHTML = textHtml;
}

function renderComboPacks(data) {
    const container = document.getElementById('combo-pack-container');
    if (!container) return;

    const packs = data.combos && data.combos.quantityPacks ? data.combos.quantityPacks.map(p => ({ name: p.name, price: p.price })) : [];

    if (packs.length === 0) {
        container.innerHTML = '';
        return;
    }

    const comboHTML = createComboPackGrid(data, packs);
    container.innerHTML = `
        <div class="combo-pack-container mt-4">
            <h3 class="text-md font-bold text-gray-800 mb-2">Available Packs</h3>
            <div class="combo-pack-grid">${comboHTML}</div>
        </div>
    `;
}

async function renderProductBundles(data) {
    const container = document.getElementById('bundle-offer-container');
    if (!container || !data.combos || !data.combos.productBundle || !data.combos.productBundle.linkedProductIds) {
        return;
    }

    const bundle = data.combos.productBundle;
    const linkedProducts = bundle.linkedProductIds.map(id => allProductsCache.find(p => p.id === id)).filter(Boolean);

    if (linkedProducts.length === bundle.linkedProductIds.length) {
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

            container.innerHTML = templateHTML;
        } catch (error) {
            console.error("Failed to load or process bundle template:", error);
        }
    }
}


function createComboPackGrid(productData, options) {
    const singleItemOriginalPrice = Number(productData.originalPrice) > Number(productData.displayPrice) ? Number(productData.originalPrice) : Number(productData.displayPrice);
    let bestValueIndex = -1;
    let maxSavings = -1;

    const calculatedOptions = options.map((opt, index) => {
        const quantity = parseInt(opt.name.split(' ')[0]) || 1;
        const packMrp = singleItemOriginalPrice * quantity;
        const packPrice = Number(opt.price);
        let savings = 0;
        let discount = 0;

        if (packMrp > packPrice) {
            savings = packMrp - packPrice;
            discount = Math.round((savings / packMrp) * 100);
        }

        if (savings > maxSavings) {
            maxSavings = savings;
            bestValueIndex = index;
        }
        return { ...opt, packMrp, discount, savings };
    });

    const cardImage = productData.images[0] || 'https://placehold.co/60x60';

    const cardsHTML = calculatedOptions.map((opt, index) => {
        const isBestValue = index === bestValueIndex && maxSavings > 0;

        return `
            <div class="combo-pack-card" data-value="${opt.name}" data-price="${opt.price || ''}">
                ${isBestValue ? '<div class="best-value-tag">Best Value</div>' : ''}
                <img src="${cardImage}" alt="pack">
                <div class="pack-details">
                    <p class="pack-name">${opt.name}</p>
                    <p class="pack-price">₹${Number(opt.price).toLocaleString('en-IN')}</p>
                    ${opt.discount > 0 ? `
                        <div class="combo-pack-savings">
                            <span class="line-through text-gray-400">₹${opt.packMrp.toLocaleString('en-IN')}</span>
                            <span class="font-semibold text-green-600">${opt.discount}% OFF</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    return cardsHTML;
}

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

function handleQuickAdd(event) {
    const quickAddButton = event.target.closest('.quick-add-btn');
    if (quickAddButton && !quickAddButton.dataset.bundle) {
        event.preventDefault();
        const productId = quickAddButton.dataset.id;
        const product = allProductsCache.find(p => p && p.id === productId);
        if (product) {
            let defaultVariants = (product.variantType && product.variantValue) ? { [product.variantType]: product.variantValue } : {};
            addToCart(productId, 1, defaultVariants, null); 
            quickAddButton.innerHTML = '<i class="fas fa-check"></i>';
            quickAddButton.classList.add('added');
            setTimeout(() => {
                quickAddButton.innerHTML = '+';
                quickAddButton.classList.remove('added');
            }, 1500);
        }
    }
}
function setupActionControls() { document.getElementById('add-to-cart-btn').addEventListener('click', () => { addToCart(currentProductId, 1, selectedVariants, selectedPack); }); document.getElementById('increase-quantity').addEventListener('click', () => { const item = getCartItem(currentProductId, selectedVariants, selectedPack); if (item) updateCartItemQuantity(currentProductId, item.quantity + 1, selectedVariants, selectedPack); }); document.getElementById('decrease-quantity').addEventListener('click', () => { const item = getCartItem(currentProductId, selectedVariants, selectedPack); if (item) updateCartItemQuantity(currentProductId, item.quantity - 1, selectedVariants, selectedPack); }); setupShareButton(); }

function updatePriceDisplay(newPrice) { const finalPriceEl = document.getElementById("price-final"); const originalPriceEl = document.getElementById("price-original"); const percentageDiscountEl = document.getElementById("price-percentage-discount"); const displayPrice = newPrice ? Number(newPrice) : (selectedPack ? Number(selectedPack.price) : Number(currentProductData.displayPrice)); const originalPrice = Number(currentProductData.originalPrice); finalPriceEl.textContent = `₹${displayPrice.toLocaleString("en-IN")}`; let discount = 0; let packOriginalPrice = originalPrice; if (selectedPack) { const quantity = parseInt(selectedPack.name.split(' ')[0]) || 1; packOriginalPrice = originalPrice > displayPrice ? originalPrice * quantity : 0; } if (packOriginalPrice > displayPrice) { discount = Math.round(100 * (packOriginalPrice - displayPrice) / packOriginalPrice); } else if (originalPrice > displayPrice && !selectedPack) { discount = Math.round(100 * (originalPrice - displayPrice) / originalPrice); } if (discount > 0) { percentageDiscountEl.innerHTML = `<i class="fas fa-arrow-down mr-1"></i>${discount}%`; originalPriceEl.textContent = `₹${(selectedPack ? packOriginalPrice : originalPrice).toLocaleString("en-IN")}`; percentageDiscountEl.style.display = "flex"; originalPriceEl.style.display = "inline"; } else { percentageDiscountEl.style.display = "none"; originalPriceEl.style.display = "none"; } }

async function loadHandpickedSimilarProducts(category, subcategory, currentProductId) {
    const section = document.getElementById("handpicked-similar-section");
    const container = document.getElementById("handpicked-similar-container");
    if (!container || !section) return;

    if (!subcategory) {
        section.style.display = "none";
        return;
    }

    const similarProducts = allProductsCache.filter(p => 
        p && 
        p.category === category && 
        p.subcategory === subcategory && 
        p.id !== currentProductId
    ).slice(0, 10); 

    if (similarProducts.length === 0) {
        section.style.display = "none";
        return;
    }

    container.innerHTML = "";
    let hasContent = false;

    try {
        const response = await fetch('product-details-sections/you-might-like-card.html');
        if (!response.ok) throw new Error('YML card template not found');
        const templateHTML = await response.text();

        similarProducts.forEach(product => {
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
        });

        if (hasContent) {
            section.style.display = "block";
        } else {
            section.style.display = "none";
        }

    } catch (error) {
        console.error("Error loading handpicked products:", error);
        section.style.display = "none";
    }
}


function createCarouselCard(product) { const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : ""; const originalPriceNum = Number(product.originalPrice); const displayPriceNum = Number(product.displayPrice); const discount = originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0; const addButton = `<button class="quick-add-btn" data-id="${product.id}">+</button>`; return `<a href="?id=${product.id}" class="carousel-item block bg-white rounded-lg shadow overflow-hidden"><div class="relative"><img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full object-cover aspect-square" alt="${product.name}">${ratingTag}${addButton}</div><div class="p-2"><h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4><div class="flex items-baseline gap-2"><p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}</div>${discount > 0 ? `<p class="text-xs font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}</div></a>`; }

function createRecentlyViewedCard(product) { 
    return ` <a href="?id=${product.id}" class="recently-viewed-item block bg-white"> <div class="relative"> <img src="${product.images?.[0] || 'https://placehold.co/400x400/f0f0f0/333?text=Ramazone'}" class="w-full object-cover aspect-square" alt="${product.name}"> </div> <div class="p-2 text-center"> <h4 class="text-sm font-medium text-gray-700 truncate">${product.name}</h4> </div> </a> `; 
}

function createGridCard(product) { const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : ""; const originalPriceNum = Number(product.originalPrice); const displayPriceNum = Number(product.displayPrice); const discount = originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0; const showAddButton = displayPriceNum < 500 || product.category === 'grocery'; const addButton = showAddButton ? `<button class="quick-add-btn" data-id="${product.id}">+</button>` : ""; return `<a href="?id=${product.id}" class="block bg-white rounded-lg shadow overflow-hidden"><div class="relative"><img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full h-auto object-cover aspect-square" alt="${product.name}">${ratingTag}${addButton}</div><div class="p-2 sm:p-3"><h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4><div class="flex items-baseline gap-2"><p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}</div>${discount > 0 ? `<p class="text-sm font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}</div></a>`; }

function renderDescription(data) { 
    const descriptionContainer = document.getElementById("product-description"); 
    const descriptionSection = document.getElementById("description-section"); 
    const returnPolicyEl = document.getElementById("return-policy-info"); 
    let hasContent = false; 
    descriptionContainer.innerHTML = ""; 
    if (returnPolicyEl) returnPolicyEl.style.display = "none"; 

    if (data.longDescription) { 
        descriptionContainer.innerHTML = `<p class="text-base text-gray-600 leading-relaxed">${data.longDescription.replace(/\n/g, '<br>')}</p>`; 
        hasContent = true; 
    } else if (data.description && Array.isArray(data.description) && data.description.length > 0) { 
        let descriptionHtml = '<ul class="space-y-3 list-inside">'; 
        data.description.forEach(block => { 
            if (block.details) { 
                descriptionHtml += `<li class="text-base text-gray-600 leading-relaxed">${block.details}</li>`; 
                hasContent = true; 
            } 
        }); 
        descriptionHtml += '</ul>'; 
        descriptionContainer.innerHTML = descriptionHtml; 
    } 

    if (data.returnPolicy && data.returnPolicy.type) { 
        let policyText = ''; 
        switch (data.returnPolicy.type) { 
            case 'days': policyText = `${data.returnPolicy.value} Days Return Available`; break; 
            case 'no_return': policyText = 'No Return Available'; break; 
            case 'custom': policyText = data.returnPolicy.value; break; 
        } 
        if (policyText && returnPolicyEl) { 
            returnPolicyEl.innerHTML = `<i class="fas fa-undo-alt w-5 text-center"></i> <span>${policyText}</span>`; 
            returnPolicyEl.style.display = "flex"; 
            hasContent = true; 
        } 
    } 

    if (hasContent) { 
        descriptionSection.style.display = "block"; 
    } else { 
        descriptionSection.style.display = "none"; 
    } 
}
function renderAdvancedHighlights(specData) { const container = document.getElementById("advanced-highlights-section"); if (!specData || !specData.blocks || specData.blocks.length === 0) { container.style.display = "none"; return; } let html = `<div class="p-4 sm:p-6 lg:p-8 border-t border-b border-gray-200 my-4"><h2 class="text-xl font-bold text-gray-900 mb-4">Highlights</h2>`; if (specData.specScore || specData.specTag) { html += '<div class="flex items-center gap-3 mb-6">'; if (specData.specScore) { html += `<div class="spec-score font-bold">${specData.specScore}</div>`; } if (specData.specTag) { html += `<div class="spec-tag">${specData.specTag}</div>`; } html += '</div>'; } html += '<div class="space-y-6">'; specData.blocks.forEach(block => { const subtitleStyle = "color: #B8860B; font-weight: 500;"; html += `<div class="flex items-start gap-4"><div class="flex-shrink-0 w-8 h-8 text-gray-600 pt-1">${block.icon || ""}</div><div class="flex-grow"><p class="text-sm text-gray-500">${block.category || ""}</p><h4 class="text-md font-semibold text-gray-800 mt-1">${block.title || ""}</h4><p class="text-sm mt-1" style="${subtitleStyle}">${block.subtitle || ""}</p></div></div>`; }); html += '</div></div>'; container.innerHTML = html; container.style.display = "block"; }

function renderMediaGallery() { 
    const gallery=document.getElementById("thumbnail-gallery");
    gallery.innerHTML="";
    slider.innerHTML="";
    mediaItems.forEach((item,index)=>{
        const e=document.createElement("div");
        e.className="media-item";
        "image"===item.type ? e.innerHTML=`<img src="${item.src}" alt="Product image ${index+1}" draggable="false">` : getYoutubeEmbedUrl(item.src)&&(e.innerHTML=`<iframe src="${getYoutubeEmbedUrl(item.src)}" class="w-full h-auto object-cover aspect-square" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`);
        slider.appendChild(e);

        const t=document.createElement("div");
        t.className="aspect-square thumbnail";
        const l=document.createElement("img");
        l.src="image"===item.type?item.src:item.thumbnail;
        t.appendChild(l);

        if ("video"===item.type) {
            const n=document.createElement("div");
            n.className="play-icon";
            n.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
            t.appendChild(n);
        }

        t.addEventListener("click",()=>showMedia(index));
        gallery.appendChild(t)
    });
    mediaItems.length>0&&showMedia(0)
}

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

function setupShareButton() {
    document.getElementById("share-button").addEventListener("click", async () => {
        if (!currentProductData) return;
        const productName = currentProductData.name.replace(/\*/g, "").trim();
        const productPrice = `₹${Number(currentProductData.displayPrice).toLocaleString("en-IN")}`;
        
        // UPDATE: URL ab 'api/share?id=...' banega
        // window.location.origin ka matlab hai 'https://www.ramazone.in'
        const shareUrl = `${window.location.origin}/api/share?id=${currentProductId}`;
        
        const baseMessage = `*${productName}*\nPrice: *${productPrice}*\n\n✨ Discover more at Ramazone! ✨`;
        const clipboardMessage = `${baseMessage}\n${shareUrl}`;
        const shareData = { title: productName, text: baseMessage, url: shareUrl, };
        
        try {
            if (navigator.share) { await navigator.share(shareData); } 
            else if (navigator.clipboard) { await navigator.clipboard.writeText(clipboardMessage); showToast("Link and details copied!"); } 
            else { const textArea = document.createElement('textarea'); textArea.value = shareUrl; document.body.appendChild(textArea); textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea); showToast("Link Copied!"); }
        } catch (err) { console.error("Error sharing:", err); if (err.name !== 'AbortError') { showToast("Sharing failed.", "error"); } }
    });
}

function showToast(message, type = "info") { const toast=document.getElementById("toast-notification");toast.textContent=message,toast.style.backgroundColor="error"===type?"#ef4444":"#333",toast.classList.add("show"),setTimeout(()=>toast.classList.remove("show"),2500)}

function updateRecentlyViewed(newId) { let viewedIds = JSON.parse(localStorage.getItem("ramazoneRecentlyViewed")) || []; viewedIds = viewedIds.filter(e => e !== newId); viewedIds.unshift(newId); viewedIds = viewedIds.slice(0, 10); localStorage.setItem("ramazoneRecentlyViewed", JSON.stringify(viewedIds)); loadRecentlyViewed(viewedIds); }
function loadRecentlyViewed(viewedIds) { const container=document.getElementById("recently-viewed-container"),section=document.getElementById("recently-viewed-section");if(container&&section&&(container.innerHTML="",viewedIds&&viewedIds.length>1)){let t=0;viewedIds.filter(e=>e!=currentProductId).forEach(e=>{const n=allProductsCache.find(t=>t.id==e); if (n) { container.innerHTML += createRecentlyViewedCard(n); t++; } }),t>0?section.style.display="block":section.style.display="none"}else section.style.display="none"}

function loadCategoryBasedProducts(category) { const section=document.getElementById("similar-products-section"),container=document.getElementById("similar-products-container");if(!category||!allProductsCache)return void(section.style.display="none");container.innerHTML="";let cardCount=0;allProductsCache.forEach(product=>{product&&product.category===category&&product.id!=currentProductId&&(container.innerHTML+=createCarouselCard(product),cardCount++)}),cardCount>0?section.style.display="block":section.style.display="none"}
function loadOtherProducts(currentCategory) { const otherProducts = allProductsCache.filter(p => p.category !== currentCategory && p.id != currentProductId).map(p => { const discount = Number(p.originalPrice) > Number(p.displayPrice) ? 100 * ((Number(p.originalPrice) - Number(p.displayPrice)) / Number(p.originalPrice)) : 0, rating = p.rating || 0, score = 5 * rating + .5 * discount; return { ...p, score: score } }).sort((a, b) => b.score - a.score).slice(0, 20), container = document.getElementById("other-products-container"); if (!container) return; container.innerHTML = "", otherProducts.length > 0 && (otherProducts.forEach(product => { container.innerHTML += createGridCard(product) }), document.getElementById("other-products-section").style.display = "block") }

