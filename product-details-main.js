// --- GLOBAL STATE ---
let mediaItems = [], currentMediaIndex = 0, productQuantity = 1, currentProductData = null, currentProductId = null;
let allProductsCache = [], validCoupons = [];
let selectedDeliveryType = 'Self';
let selectedVariants = {};
let ramazoneDeliveryCharge = 10;
let appThemeColor = '#4F46E5';
let database;

const slider = document.getElementById('media-slider');
const sliderWrapper = document.getElementById('main-media-wrapper');
let isDragging = false, startPos = 0, currentTranslate = 0, prevTranslate = 0, animationID;

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
        console.error("Initialization or data fetch failed:", error);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Could not initialize application.</p>';
    }
}

async function loadPageData() {
    await fetchAllData(database);
    fetchProductData();
}

// FIX 1: DATA FORMAT HANDLING
async function fetchAllData(db) {
    const dbRef = db.ref('ramazone');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const config = data.config || {};
        ramazoneDeliveryCharge = config.deliveryCharge || 10;
        appThemeColor = config.themeColor || '#4F46E5';
        applyTheme(appThemeColor);
        const homepageData = data.homepage || {};

        const productsObject = data.products || {};
        const mainProducts = Object.values(productsObject); // Convert object to array

        const festiveProductIds = homepageData.festiveCollection?.productIds || [];
        const jfyMainProductId = homepageData.justForYou?.topDeals?.mainProductId;
        const jfySubProductIds = homepageData.justForYou?.topDeals?.subProductIds || [];
        const allReferencedIds = new Set([...festiveProductIds, jfyMainProductId, ...jfySubProductIds].filter(Boolean));
        const referencedProducts = mainProducts.filter(p => allReferencedIds.has(p.id));
        const combinedProducts = [...mainProducts, ...referencedProducts];
        allProductsCache = combinedProducts.filter((p, index, self) => p && p.id && index === self.findIndex((t) => t.id === p.id));
        validCoupons = (homepageData.coupons || []).filter(c => c.status === 'active');
    }
}


function applyTheme(color) {
    document.documentElement.style.setProperty('--primary-color', color);
}

function fetchProductData() {
    const params = new URLSearchParams(window.location.search);
    let idFromUrl = params.get('id');

    if (idFromUrl) {
        currentProductId = idFromUrl.trim(); // Trim any extra spaces
    }

    if (!currentProductId) {
        document.getElementById('loading-indicator').innerHTML = '<p class="text-center text-red-500 font-bold">Koi product ID nahi mila.</p>';
        return;
    }
    if (allProductsCache.length === 0) {
        document.getElementById('loading-indicator').innerHTML = '<p class="text-center text-red-500 font-bold">Product catalog load nahi hua. Refresh karke try karein.</p>';
        return;
    }
    const product = allProductsCache.find(p => p.id == currentProductId);
    if (product) {
        currentProductData = product;
        loadProduct(currentProductData);
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('product-content').style.display = 'block';
    } else {
        console.error(`Product with ID "${currentProductId}" not found in cache.`);
        document.getElementById('loading-indicator').innerHTML = '<p class="text-center text-red-500 font-bold">Maaf kijiye, yeh product nahi mil saka.</p>';
    }
}

// FIX 2: CODE STRUCTURE
function loadProduct(data) {
    // Basic Product Info
    mediaItems = [], data.images && Array.isArray(data.images) && mediaItems.push(...data.images.map(src => ({ type: "image", src: src }))), data.videoUrl && mediaItems.push({ type: "video", src: data.videoUrl, thumbnail: data.images && data.images[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png" });
    document.title = `${data.name || "Product"} - Ramazone`;
    document.querySelector('meta[property="og:title"]').setAttribute("content", data.name);
    document.querySelector('meta[property="og:image"]').setAttribute("content", data.images && data.images[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png");
    document.getElementById("product-title").textContent = data.name;

    // Rating
    if (data.rating && data.reviewCount) {
        document.getElementById("rating-section").style.display = "flex";
        renderStars(data.rating, document.getElementById("product-rating-stars"));
        document.getElementById("product-review-count").textContent = `(${data.reviewCount} ratings)`;
    }

    // Description
    const descriptionContainer = document.getElementById("product-description");
    descriptionContainer.innerHTML = "";
    if (data.description && Array.isArray(data.description)) {
        document.getElementById("description-section").style.display = "block";
        data.description.forEach(block => {
            const blockDiv = document.createElement("div");
            blockDiv.className = "desc-block";
            let blockHTML = "";
            if (block.title) blockHTML += `<h3 class="desc-block-title">${block.title}</h3>`;
            if (block.details) blockHTML += `<p class="desc-block-details">${block.details}</p>`;
            if (block.highlights && Array.isArray(block.highlights) && block.highlights.length > 0) {
                blockHTML += `<ul class="desc-block-highlights">${block.highlights.map(h => `<li>${h}</li>`).join("")}</ul>`;
            }
            blockDiv.innerHTML = blockHTML;
            descriptionContainer.appendChild(blockDiv);
        });
    }

    // Media Gallery and Thumbnails (Moved inside the function)
    const gallery = document.getElementById("thumbnail-gallery");
    gallery.innerHTML = "";
    slider.innerHTML = "";
    mediaItems.forEach((item, index) => {
        const slide = document.createElement("div");
        slide.className = "media-item";
        if (item.type === "image") {
            slide.innerHTML = `<img src="${item.src}" alt="Product image ${index + 1}" draggable="false">`;
        } else if (getYoutubeEmbedUrl(item.src)) {
            slide.innerHTML = `<iframe src="${getYoutubeEmbedUrl(item.src)}" class="w-full h-auto object-cover aspect-square" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        }
        slider.appendChild(slide);

        const thumbWrapper = document.createElement("div");
        thumbWrapper.className = "aspect-square thumbnail";
        const img = document.createElement("img");
        img.src = item.type === "image" ? item.src : item.thumbnail;
        thumbWrapper.appendChild(img);

        if (item.type === "video") {
            const playIcon = document.createElement("div");
            playIcon.className = "play-icon";
            playIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="50%" height="50%"><path d="M8 5v14l11-7z"/></svg>';
            thumbWrapper.appendChild(playIcon);
        }
        thumbWrapper.addEventListener("click", () => showMedia(index));
        gallery.appendChild(thumbWrapper);
    });

    // Setup all functionalities (Moved inside the function)
    showMedia(0);
    renderVariantSelectors(data.variants);
    setupSliderControls();
    setupQuantityControls();
    setupImageModal();
    setupShareButton();
    setupDeliveryOptions();
    setupVariantModal();
    updatePriceDisplay();
    loadSimilarProducts(data.category);
    loadOtherProducts(data.category);
}


function renderStars(rating, container) { container.innerHTML = ""; const fullStars = Math.floor(rating), halfStar = rating % 1 >= .5, emptyStars = 5 - fullStars - (halfStar ? 1 : 0); for (let i = 0; i < fullStars; i++)container.innerHTML += '<i class="fas fa-star"></i>'; halfStar && (container.innerHTML += '<i class="fas fa-star-half-alt"></i>'); for (let i = 0; i < emptyStars; i++)container.innerHTML += '<i class="far fa-star"></i>' }
function updatePriceDisplay() { const basePrice = Number(currentProductData.displayPrice), originalPrice = Number(currentProductData.originalPrice), deliveryCharge = "Ramazone" === selectedDeliveryType ? ramazoneDeliveryCharge : 0, finalPrice = basePrice; document.getElementById("price-final").textContent = `₹${finalPrice.toLocaleString("en-IN")}`; const percentageDiscountEl = document.getElementById("price-percentage-discount"), originalPriceEl = document.getElementById("price-original"), lowestPriceTag = document.getElementById("lowest-price-tag-container"); if (originalPrice > basePrice) { const discount = Math.round(100 * ((originalPrice - basePrice) / originalPrice)); percentageDiscountEl.innerHTML = `<i class="fas fa-arrow-down mr-1"></i>${discount}%`, originalPriceEl.textContent = `₹${originalPrice.toLocaleString("en-IN")}`, percentageDiscountEl.style.display = "flex", originalPriceEl.style.display = "inline", lowestPriceTag.style.display = "block" } else percentageDiscountEl.style.display = "none", originalPriceEl.style.display = "none", lowestPriceTag.style.display = "none"; document.getElementById("price-coupon-row").style.display = "none", document.getElementById("price-delivery-charge").textContent = deliveryCharge > 0 ? `+ ₹${deliveryCharge.toLocaleString("en-IN")}` : "Free", updateOrderLink() }
function getYoutubeEmbedUrl(url) { if (!url) return null; let videoId = null; try { const urlObj = new URL(url); return "www.youtube.com" === urlObj.hostname || "youtu.be" === urlObj.hostname ? videoId = "youtu.be" === urlObj.hostname ? urlObj.pathname.slice(1) : urlObj.searchParams.get("v") : null, videoId ? `https://www.youtube.com/embed/${videoId}?controls=1&rel=0&modestbranding=1` : null } catch (e) { return console.error("Invalid video URL:", url, e), null } }
function showMedia(index) { if (index < 0 || index >= mediaItems.length) return; slider.style.transition = "transform 0.3s ease-out", currentMediaIndex = index, currentTranslate = index * -sliderWrapper.offsetWidth, prevTranslate = currentTranslate, setSliderPosition(), document.querySelectorAll(".thumbnail").forEach((thumb, i) => thumb.classList.toggle("active", i === index)) }
function setupSliderControls() { sliderWrapper.addEventListener("touchstart", touchStart, { passive: !0 }), sliderWrapper.addEventListener("touchend", touchEnd), sliderWrapper.addEventListener("touchmove", touchMove, { passive: !0 }), sliderWrapper.addEventListener("mousedown", touchStart), sliderWrapper.addEventListener("mouseup", touchEnd), sliderWrapper.addEventListener("mouseleave", touchEnd), sliderWrapper.addEventListener("mousemove", touchMove) }
function touchStart(event) { startPos = getPositionX(event), isDragging = !0, animationID = requestAnimationFrame(animation), slider.style.transition = "none" }
function touchMove(event) { if (isDragging) { const currentPosition = getPositionX(event); currentTranslate = prevTranslate + currentPosition - startPos } }
function touchEnd(event) { if (isDragging) { isDragging = !1, cancelAnimationFrame(animationID); const movedBy = currentTranslate - prevTranslate; movedBy < -50 && currentMediaIndex < mediaItems.length - 1 && currentMediaIndex++, movedBy > 50 && currentMediaIndex > 0 && currentMediaIndex--, showMedia(currentMediaIndex) } }
function getPositionX(event) { return event.type.includes("mouse") ? event.pageX : event.touches[0].clientX }
function animation() { setSliderPosition(), isDragging && requestAnimationFrame(animation) }
function setSliderPosition() { slider.style.transform = `translateX(${currentTranslate}px)` }
function setupQuantityControls() { document.getElementById("increase-quantity").addEventListener("click", () => { productQuantity++, updateOrderLink() }), document.getElementById("decrease-quantity").addEventListener("click", () => { productQuantity > 1 && (productQuantity--, updateOrderLink()) }), updateOrderLink() }
function updateOrderLink() { document.getElementById("quantity-display").textContent = productQuantity; document.getElementById('decrease-quantity').disabled = productQuantity <= 1; const orderLink = document.getElementById('order-now-link'); if (orderLink) { const variantsQueryString = encodeURIComponent(JSON.stringify(selectedVariants)); orderLink.href = `order.html?id=${currentProductId}&quantity=${productQuantity}&variants=${variantsQueryString}` } }
function setupDeliveryOptions() { document.getElementById("ramazone-delivery-label").textContent = `Ramazone Delivery (+₹${ramazoneDeliveryCharge})`; const deliveryRadios = document.querySelectorAll('input[name="delivery"]'); deliveryRadios.forEach(radio => { radio.addEventListener("change", e => { selectedDeliveryType = e.target.value, document.querySelectorAll(".delivery-option").forEach(opt => opt.classList.remove("selected")), e.target.closest(".delivery-option").classList.add("selected"), updatePriceDisplay() }) }), document.querySelector(".delivery-option").classList.add("selected") } function setupImageModal() { const modal = document.getElementById("image-modal"), modalImg = document.getElementById("modal-image-content"), closeBtn = document.querySelector("#image-modal .close"), prevBtn = document.querySelector("#image-modal .prev"), nextBtn = document.querySelector("#image-modal .next"); sliderWrapper.onclick = e => { if (isDragging || currentTranslate - prevTranslate != 0) return; "image" === mediaItems[currentMediaIndex].type && (modal.style.display = "flex", modalImg.src = mediaItems[currentMediaIndex].src) }, closeBtn.onclick = () => modal.style.display = "none"; const showModalImage = direction => { let imageItems = mediaItems.map((item, i) => ({ ...item, originalIndex: i })).filter(item => "image" === item.type); if (0 !== imageItems.length) { const currentImageInFilteredArray = imageItems.findIndex(item => item.originalIndex === currentMediaIndex); let nextImageInFilteredArray = (currentImageInFilteredArray + direction + imageItems.length) % imageItems.length; const nextImageItem = imageItems[nextImageInFilteredArray]; modalImg.src = nextImageItem.src, showMedia(nextImageItem.originalIndex) } }; prevBtn.onclick = e => { e.stopPropagation(), showModalImage(-1) }, nextBtn.onclick = e => { e.stopPropagation(), showModalImage(1) } } function setupShareButton() { document.getElementById("share-button").addEventListener("click", async () => { const productName = currentProductData.name.replace(/\*/g, "").trim(), shareText = `*${productName}*\nPrice: *₹${Number(currentProductData.displayPrice).toLocaleString("en-IN")}*\n\n✨ Discover more at Ramazone! ✨\n${window.location.href}`; navigator.share ? await navigator.share({ text: shareText }) : navigator.clipboard.writeText(window.location.href).then(() => showToast("Link Copied!")) }) } function showToast(message, type = "info") { const toast = document.getElementById("toast-notification"); toast.textContent = message, toast.style.backgroundColor = "error" === type ? "#ef4444" : "#333", toast.classList.add("show"), setTimeout(() => toast.classList.remove("show"), 2500) } function renderVariantSelectors(variants) { const container = document.getElementById("variant-buttons-container"), section = document.getElementById("variant-selection-section"); if (container.innerHTML = "", selectedVariants = {}, !variants || !Array.isArray(variants) || 0 === variants.length) return void (section.style.display = "none"); section.style.display = "block", variants.forEach(variant => { if (variant && variant.type && variant.options) { const button = document.createElement("button"); button.className = "variant-btn w-full p-3 rounded-lg flex justify-between items-center", button.innerHTML = `<span>${variant.type}</span> <i class="fas fa-chevron-down text-xs"></i>`, button.addEventListener("click", () => openVariantModal(variant)), container.appendChild(button) } }) } function openVariantModal(variant) { const overlay = document.getElementById("variant-modal-overlay"), titleEl = document.getElementById("variant-modal-title"), bodyEl = document.getElementById("variant-modal-body"); titleEl.textContent = `Select ${variant.type}`, bodyEl.innerHTML = "", variant.options.forEach(option => { const isSelected = selectedVariants[variant.type] === option.name, optionEl = document.createElement("div"); optionEl.className = `variant-option ${isSelected ? "selected" : ""}`; let content = ""; content = "color" === variant.type.toLowerCase() && option.value ? `<div class="color-swatch" style="background-color: ${option.value};"></div> <span class="flex-grow">${option.name}</span>` : `<span>${option.name}</span>`, optionEl.innerHTML = content, optionEl.addEventListener("click", () => { selectedVariants[variant.type] = option.name, updateVariantButtonDisplay(variant.type, option.name), updateOrderLink(), closeVariantModal() }), bodyEl.appendChild(optionEl) }), overlay.classList.remove("hidden"), setTimeout(() => overlay.classList.add("active"), 10) } function closeVariantModal() { const overlay = document.getElementById("variant-modal-overlay"); overlay.classList.remove("active"), setTimeout(() => overlay.classList.add("hidden"), 300) } function updateVariantButtonDisplay(type, value) { const container = document.getElementById("variant-buttons-container"); container.querySelectorAll("button").forEach(button => { button.textContent.includes(type) && (button.innerHTML = `<span>${type}: <span class="value">${value}</span></span> <i class="fas fa-chevron-down text-xs"></i>`) }) } function setupVariantModal() { const overlay = document.getElementById("variant-modal-overlay"); document.getElementById("variant-modal-close").addEventListener("click", closeVariantModal), overlay.addEventListener("click", e => { e.target === overlay && closeVariantModal() }) } function createCarouselCard(product) { const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : "", originalPriceNum = Number(product.originalPrice), displayPriceNum = Number(product.displayPrice), discount = originalPriceNum && originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0; return `\n                <a href="?id=${product.id}" class="carousel-item block bg-white rounded-lg shadow overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">\n                    <div class="relative">\n                        <img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full object-cover aspect-square" alt="${product.name}">\n                        ${ratingTag}\n                    </div>\n                    <div class="p-2">\n                        <h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4>\n                        <div class="flex items-baseline gap-2">\n                            <p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>\n                            ${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}\n                        </div>\n                        ${discount > 0 ? `<p class="text-xs font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}\n                    </div>\n                </a>` } function createGridCard(product) { const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : "", originalPriceNum = Number(product.originalPrice), displayPriceNum = Number(product.displayPrice), discount = originalPriceNum && originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0; return `\n                <a href="?id=${product.id}" class="block bg-white rounded-lg shadow overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">\n                    <div class="relative">\n                        <img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full h-auto object-cover aspect-square" alt="${product.name}">\n                        ${ratingTag}\n                    </div>\n                    <div class="p-2 sm:p-3">\n                        <h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4>\n                        <div class="flex items-baseline gap-2">\n                            <p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>\n                            ${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}\n                        </div>\n                        ${discount > 0 ? `<p class="text-sm font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}\n                    </div>\n                </a>` }
function updateRecentlyViewed(newId) { let viewedIds = JSON.parse(sessionStorage.getItem("recentlyViewed")) || []; viewedIds = viewedIds.filter(id => id !== newId), viewedIds.unshift(newId), viewedIds = viewedIds.slice(0, 10), sessionStorage.setItem("recentlyViewed", JSON.stringify(viewedIds)), loadRecentlyViewed(viewedIds) }
function loadRecentlyViewed(viewedIds) { if (viewedIds && !(viewedIds.length <= 1)) { const container = document.getElementById("recently-viewed-container"); container.innerHTML = ""; let cardCount = 0; viewedIds.filter(id => id != currentProductId).forEach(id => { const product = allProductsCache.find(p => p.id == id); product && (container.innerHTML += createCarouselCard(product), cardCount++) }), cardCount > 0 && (document.getElementById("recently-viewed-section").style.display = "block") } }
function loadSimilarProducts(category) { if (category && allProductsCache) { const container = document.getElementById("similar-products-container"); container.innerHTML = ""; let cardCount = 0; allProductsCache.forEach(product => { product && product.category === category && product.id != currentProductId && (container.innerHTML += createCarouselCard(product), cardCount++) }), cardCount > 0 && (document.getElementById("similar-products-section").style.display = "block") } }
function loadOtherProducts(currentCategory) { const otherProducts = allProductsCache.filter(p => p.category !== currentCategory && p.id != currentProductId).map(p => { const discount = Number(p.originalPrice) > Number(p.displayPrice) ? 100 * ((Number(p.originalPrice) - Number(p.displayPrice)) / Number(p.originalPrice)) : 0, rating = p.rating || 0, score = 5 * rating + .5 * discount; return { ...p, score: score } }).sort((a, b) => b.score - a.score).slice(0, 20), container = document.getElementById("other-products-container"); container.innerHTML = "", otherProducts.length > 0 && (otherProducts.forEach(product => { container.innerHTML += createGridCard(product) }), document.getElementById("other-products-section").style.display = "block") }
