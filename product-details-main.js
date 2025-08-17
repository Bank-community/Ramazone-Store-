// --- GLOBAL STATE ---
let mediaItems = [], currentMediaIndex = 0, currentProductData = null, currentProductId = null;
let allProductsCache = [];
let selectedVariants = {};
let appThemeColor = '#4F46E5';
let database;

// --- DOM ELEMENTS ---
let slider, sliderWrapper;

// --- SLIDER STATE ---
let isDragging = false, startPos = 0, currentTranslate = 0, prevTranslate = 0, animationID;

// --- CART FUNCTIONS ---
const getCart = () => { try { const cart = localStorage.getItem('ramazoneCart'); return cart ? JSON.parse(cart) : []; } catch (e) { return []; } };
const saveCart = (cart) => { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); };

function addToCart(productId, quantity, variants) {
    const cart = getCart();
    const product = allProductsCache.find(p => p && p.id === productId);
    if (!product) return;

    // For items without variants, we can merge them if they are already in the cart.
    const hasVariants = product.variants && product.variants.length > 0;
    let existingItemIndex = -1;
    if (hasVariants) {
        // For items with variants, we treat each combination as unique for now.
        // A more complex logic could merge if variants are identical.
        existingItemIndex = -1; 
    } else {
        existingItemIndex = cart.findIndex(item => item.id === productId);
    }

    if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += quantity;
    } else {
        cart.push({ id: productId, quantity: quantity, variants: variants || {} });
    }
    saveCart(cart);
    showToast(`${product.name} added to cart!`, 'success');
    updateCartIcon();
    // If the action is on the current product page, update its sticky bar
    if (productId === currentProductId) {
        updateStickyActionBar();
    }
}

function updateCartItemQuantity(productId, newQuantity) {
    let cart = getCart();
    const itemIndex = cart.findIndex(item => item.id === productId);
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

const getCartItem = (productId) => { const cart = getCart(); return cart.find(item => item.id === productId) || null; };
const getTotalCartQuantity = () => { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); };

function updateCartIcon() {
    const totalQuantity = getTotalCartQuantity();
    const cartCountElement = document.getElementById('cart-item-count');
    if (cartCountElement) {
        cartCountElement.textContent = totalQuantity > 0 ? totalQuantity : '';
    }
}

function updateStickyActionBar() {
    if (!currentProductId) return;
    const cartItem = getCartItem(currentProductId);
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


// --- INITIALIZATION ---
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
        allProductsCache = Object.values(data.products || {});
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
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product not found.</p>';
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
    renderComboPacks(data.combos); // <<< NEW FUNCTION CALL
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

    renderVariantSelectors(data.variants);
    updatePriceDisplay();
    setupVariantModal();
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
}

function handleQuickAdd(event) {
    const quickAddButton = event.target.closest('.quick-add-btn');
    if (quickAddButton) {
        event.preventDefault();
        const productId = quickAddButton.dataset.id;
        if (productId) {
            addToCart(productId, 1, {}); // Add with quantity 1 and no variants
            quickAddButton.innerHTML = '<i class="fas fa-check"></i>';
            quickAddButton.classList.add('added');
            setTimeout(() => {
                quickAddButton.innerHTML = '+';
                quickAddButton.classList.remove('added');
            }, 1500);
        }
    }
}


function setupActionControls() {
    document.getElementById('add-to-cart-btn').addEventListener('click', () => {
        const variantTypes = (currentProductData.variants || []).map(v => v.type);
        const allVariantsSelected = variantTypes.every(type => selectedVariants[type]);
        if (variantTypes.length > 0 && !allVariantsSelected) {
            showToast('Please select all options', 'error');
            return;
        }
        addToCart(currentProductId, 1, selectedVariants);
    });
    document.getElementById('increase-quantity').addEventListener('click', () => {
        const item = getCartItem(currentProductId);
        if (item) updateCartItemQuantity(currentProductId, item.quantity + 1);
    });
    document.getElementById('decrease-quantity').addEventListener('click', () => {
        const item = getCartItem(currentProductId);
        if (item) updateCartItemQuantity(currentProductId, item.quantity - 1);
    });
    setupShareButton();
}

function renderVariantSelectors(variants) {
    const container = document.getElementById("variant-buttons-container");
    const section = document.getElementById("variant-selection-section");
    container.innerHTML = "";
    selectedVariants = {};

    if (!variants || !Array.isArray(variants) || variants.length === 0) {
        section.style.display = "none";
        return;
    }
    section.style.display = "block";

    variants.forEach(variant => {
        if (variant && variant.type && variant.options && variant.options.length > 0) {
            const button = document.createElement("button");
            button.className = "variant-btn w-full p-3 rounded-lg flex justify-between items-center";
            button.innerHTML = `<span>${variant.type}</span> <i class="fas fa-chevron-down text-xs"></i>`;
            button.addEventListener("click", () => openVariantModal(variant));
            container.appendChild(button);

            const firstOptionName = variant.options[0].name;
            selectedVariants[variant.type] = firstOptionName;
            updateVariantButtonDisplay(variant.type, firstOptionName);
        }
    });
}

// --- NEW FUNCTION TO RENDER COMBO PACKS ---
function renderComboPacks(combos) {
    const section = document.getElementById('combo-offers-section');
    const container = document.getElementById('combo-offers-container');

    // Check if valid combo data exists
    if (!combos || !combos.quantityPacks || !Array.isArray(combos.quantityPacks) || combos.quantityPacks.length === 0) {
        section.style.display = 'none';
        return;
    }

    container.innerHTML = ''; // Clear previous content
    combos.quantityPacks.forEach(pack => {
        const card = document.createElement('div');
        card.className = 'combo-pack-card';
        card.innerHTML = `
            <p class="combo-name">${pack.name}</p>
            <p class="combo-price">₹${pack.price.toLocaleString("en-IN")}</p>
        `;
        // TODO: Add click listener to handle price update and selection state
        container.appendChild(card);
    });

    section.style.display = 'block'; // Show the section
}


// UPDATED: Card creation functions to include quick-add button
function createHandpickedCard(product) {
    const displayPrice = Number(product.displayPrice);
    const originalPriceNum = Number(product.originalPrice);
    const discount = originalPriceNum > displayPrice ? Math.round(100 * ((originalPriceNum - displayPrice) / originalPriceNum)) : 0;
    const priceHTML = `<div class="mt-2"><p class="text-lg font-bold text-gray-900">₹${displayPrice.toLocaleString("en-IN")}</p>${originalPriceNum > displayPrice ? `<div class="flex items-center gap-2 text-sm mt-1"><span class="text-gray-500 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</span><span class="font-semibold text-green-600">${discount}% OFF</span></div>` : ""}` + "</div>";
    const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : "";
    const addButton = (displayPrice < 500 || product.category === 'grocery') && (!product.variants || product.variants.length === 0)
        ? `<button class="quick-add-btn" data-id="${product.id}">+</button>`
        : "";

    return `<div class="h-full block bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <a href="?id=${product.id}">
                    <div class="relative">
                        <img src="${product.images?.[0] || 'https://placehold.co/400x400/f0f0f0/333?text=Ramazone'}" class="w-full object-cover aspect-square" alt="${product.name}">
                        ${ratingTag}
                        ${addButton}
                    </div>
                    <div class="p-3">
                        <h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4>
                        ${priceHTML}
                    </div>
                </a>
            </div>`;
}

function createCarouselCard(product) {
    const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : "";
    const originalPriceNum = Number(product.originalPrice);
    const displayPriceNum = Number(product.displayPrice);
    const discount = originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0;
    const addButton = (displayPriceNum < 500 || product.category === 'grocery') && (!product.variants || product.variants.length === 0)
        ? `<button class="quick-add-btn" data-id="${product.id}">+</button>`
        : "";

    return `<a href="?id=${product.id}" class="carousel-item block bg-white rounded-lg shadow overflow-hidden">
                <div class="relative">
                    <img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full object-cover aspect-square" alt="${product.name}">
                    ${ratingTag}
                    ${addButton}
                </div>
                <div class="p-2">
                    <h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4>
                    <div class="flex items-baseline gap-2">
                        <p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>
                        ${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}
                    </div>
                    ${discount > 0 ? `<p class="text-xs font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}
                </div>
            </a>`;
}

function createGridCard(product) {
    const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : "";
    const originalPriceNum = Number(product.originalPrice);
    const displayPriceNum = Number(product.displayPrice);
    const discount = originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0;
    const addButton = (displayPriceNum < 500 || product.category === 'grocery') && (!product.variants || product.variants.length === 0)
        ? `<button class="quick-add-btn" data-id="${product.id}">+</button>`
        : "";

    return `<a href="?id=${product.id}" class="block bg-white rounded-lg shadow overflow-hidden">
                <div class="relative">
                    <img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full h-auto object-cover aspect-square" alt="${product.name}">
                    ${ratingTag}
                    ${addButton}
                </div>
                <div class="p-2 sm:p-3">
                    <h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4>
                    <div class="flex items-baseline gap-2">
                        <p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>
                        ${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}
                    </div>
                    ${discount > 0 ? `<p class="text-sm font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}
                </div>
            </a>`;
}


// --- ALL OTHER HELPER FUNCTIONS (UNCHANGED) ---
function renderDescription(data) { const descriptionContainer = document.getElementById("product-description"), descriptionSection = document.getElementById("description-section"); let hasContent = false; descriptionContainer.innerHTML = ""; if (data.description && Array.isArray(data.description) && data.description.length > 0) { data.description.forEach(block => { if (block.title || block.details) { descriptionContainer.innerHTML += `<div><h3 class="text-lg font-semibold text-gray-800 mb-2">${block.title}</h3><p class="text-base text-gray-600 leading-relaxed">${block.details}</p></div>`; hasContent = true; } }); } if (data.returnPolicyDays) { const returnPolicyEl = document.getElementById("return-policy-info"); returnPolicyEl.innerHTML = `<i class="fas fa-undo-alt w-5 text-center"></i> <span>${data.returnPolicyDays} Days Return & Exchange Policy</span>`; returnPolicyEl.style.display = "flex"; hasContent = true; } if (hasContent) { descriptionSection.style.display = "block"; } }
function renderAdvancedHighlights(specData) { const container = document.getElementById("advanced-highlights-section"); if (!specData || !specData.blocks || specData.blocks.length === 0) { container.style.display = "none"; return; } let html = `<div class="p-4 sm:p-6 lg:p-8 border-t border-b border-gray-200 my-4"><h2 class="text-xl font-bold text-gray-900 mb-4">Highlights</h2>`; if (specData.specScore || specData.specTag) { html += '<div class="flex items-center gap-3 mb-6">'; if (specData.specScore) { html += `<div class="spec-score font-bold">${specData.specScore}</div>`; } if (specData.specTag) { html += `<div class="spec-tag">${specData.specTag}</div>`; } html += '</div>'; } html += '<div class="space-y-6">'; specData.blocks.forEach(block => { const subtitleStyle = "color: #B8860B; font-weight: 500;"; html += `<div class="flex items-start gap-4"><div class="flex-shrink-0 w-8 h-8 text-gray-600 pt-1">${block.icon || ""}</div><div class="flex-grow"><p class="text-sm text-gray-500">${block.category || ""}</p><h4 class="text-md font-semibold text-gray-800 mt-1">${block.title || ""}</h4><p class="text-sm mt-1" style="${subtitleStyle}">${block.subtitle || ""}</p></div></div>`; }); html += '</div></div>'; container.innerHTML = html; container.style.display = "block"; }
function renderMediaGallery() { const gallery=document.getElementById("thumbnail-gallery");gallery.innerHTML="",slider.innerHTML="",mediaItems.forEach((item,index)=>{const e=document.createElement("div");e.className="media-item","image"===item.type?e.innerHTML=`<img src="${item.src}" alt="Product image ${index+1}" draggable="false">`:getYoutubeEmbedUrl(item.src)&&(e.innerHTML=`<iframe src="${getYoutubeEmbedUrl(item.src)}" class="w-full h-auto object-cover aspect-square" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`),slider.appendChild(e);const t=document.createElement("div");t.className="aspect-square thumbnail";const l=document.createElement("img");l.src="image"===item.type?item.src:item.thumbnail,t.appendChild(l),"video"===item.type&&((n=document.createElement("div")).className="play-icon",n.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="50%" height="50%"><path d="M8 5v14l11-7z"/></svg>',t.appendChild(n));var n;t.addEventListener("click",()=>showMedia(index)),gallery.appendChild(t)}),mediaItems.length>0&&showMedia(0)}
function renderStars(rating, container) { container.innerHTML = ""; const fullStars = Math.floor(rating), halfStar = rating % 1 >= .5, emptyStars = 5 - fullStars - (halfStar ? 1 : 0); for (let i = 0; i < fullStars; i++)container.innerHTML += '<i class="fas fa-star"></i>'; halfStar && (container.innerHTML += '<i class="fas fa-star-half-alt"></i>'); for (let i = 0; i < emptyStars; i++)container.innerHTML += '<i class="far fa-star"></i>' }
function updatePriceDisplay() { const basePrice=Number(currentProductData.displayPrice),originalPrice=Number(currentProductData.originalPrice);document.getElementById("price-final").textContent=`₹${basePrice.toLocaleString("en-IN")}`;const percentageDiscountEl=document.getElementById("price-percentage-discount"),originalPriceEl=document.getElementById("price-original"),lowestPriceTag=document.getElementById("lowest-price-tag-container");originalPrice>basePrice?(percentageDiscountEl.innerHTML=`<i class="fas fa-arrow-down mr-1"></i>${Math.round(100*(originalPrice-basePrice)/originalPrice)}%`,originalPriceEl.textContent=`₹${originalPrice.toLocaleString("en-IN")}`,percentageDiscountEl.style.display="flex",originalPriceEl.style.display="inline",lowestPriceTag.style.display="block"):(percentageDiscountEl.style.display="none",originalPriceEl.style.display="none",lowestPriceTag.style.display="none")}
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
function openVariantModal(variant) { const overlay=document.getElementById("variant-modal-overlay"),titleEl=document.getElementById("variant-modal-title"),bodyEl=document.getElementById("variant-modal-body");titleEl.textContent=`Select ${variant.type}`,bodyEl.innerHTML="",variant.options.forEach(option=>{const e=selectedVariants[variant.type]===option.name,t=document.createElement("div");t.className=`variant-option ${e?"selected":""}`;let n="";n="color"===variant.type.toLowerCase()&&option.value?`<div class="color-swatch" style="background-color: ${option.value};"></div> <span class="flex-grow">${option.name}</span>`:`<span>${option.name}</span>`,t.innerHTML=n,t.addEventListener("click",()=>{selectedVariants[variant.type]=option.name,updateVariantButtonDisplay(variant.type,option.name),closeVariantModal()}),bodyEl.appendChild(t)}),overlay.classList.remove("hidden"),setTimeout(()=>overlay.classList.add("active"),10)}
function closeVariantModal() { const overlay=document.getElementById("variant-modal-overlay");overlay.classList.remove("active"),setTimeout(()=>overlay.classList.add("hidden"),300)}
function updateVariantButtonDisplay(type, value) { document.getElementById("variant-buttons-container").querySelectorAll("button").forEach(e=>{e.textContent.includes(type)&&(e.innerHTML=`<span>${type}: <span class="value">${value}</span></span> <i class="fas fa-chevron-down text-xs"></i>`)})}
function setupVariantModal() { const overlay=document.getElementById("variant-modal-overlay");document.getElementById("variant-modal-close").addEventListener("click",closeVariantModal),overlay.addEventListener("click",e=>{e.target===overlay&&closeVariantModal()})}
function updateRecentlyViewed(newId) { let viewedIds=JSON.parse(sessionStorage.getItem("ramazoneRecentlyViewed"))||[];viewedIds=viewedIds.filter(e=>e!==newId),viewedIds.unshift(newId),viewedIds=viewedIds.slice(0,10),sessionStorage.setItem("ramazoneRecentlyViewed",JSON.stringify(viewedIds)),loadRecentlyViewed(viewedIds)}
function loadHandpickedSimilarProducts(similarIds) { const section = document.getElementById("handpicked-similar-section"), container = document.getElementById("handpicked-similar-container"); if (!similarIds || similarIds.length === 0) return void (section.style.display = "none"); container.innerHTML = ""; let hasContent = !1; similarIds.forEach(id => { const product = allProductsCache.find(p => p && p.id === id); product && (container.innerHTML += createHandpickedCard(product), hasContent = !0) }), hasContent && (section.style.display = "block")}
function loadRecentlyViewed(viewedIds) { const container=document.getElementById("recently-viewed-container"),section=document.getElementById("recently-viewed-section");if(container&&section&&(container.innerHTML="",viewedIds&&viewedIds.length>1)){let t=0;viewedIds.filter(e=>e!=currentProductId).forEach(e=>{const n=allProductsCache.find(t=>t.id==e);n&&(container.innerHTML+=createCarouselCard(n),t++)}),t>0?section.style.display="block":section.style.display="none"}else section.style.display="none"}
function loadCategoryBasedProducts(category) { const section=document.getElementById("similar-products-section"),container=document.getElementById("similar-products-container");if(!category||!allProductsCache)return void(section.style.display="none");container.innerHTML="";let cardCount=0;allProductsCache.forEach(product=>{product&&product.category===category&&product.id!=currentProductId&&(container.innerHTML+=createCarouselCard(product),cardCount++)}),cardCount>0?section.style.display="block":section.style.display="none"}
function loadOtherProducts(currentCategory) { const otherProducts = allProductsCache.filter(p => p.category !== currentCategory && p.id != currentProductId).map(p => { const discount = Number(p.originalPrice) > Number(p.displayPrice) ? 100 * ((Number(p.originalPrice) - Number(p.displayPrice)) / Number(p.originalPrice)) : 0, rating = p.rating || 0, score = 5 * rating + .5 * discount; return { ...p, score: score } }).sort((a, b) => b.score - a.score).slice(0, 20), container = document.getElementById("other-products-container"); if (!container) return; container.innerHTML = "", otherProducts.length > 0 && (otherProducts.forEach(product => { container.innerHTML += createGridCard(product) }), document.getElementById("other-products-section").style.display = "block") }

