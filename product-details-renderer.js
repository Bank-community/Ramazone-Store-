// product-details-renderer.js
// Handles all HTML generation, UI updates, and Animations

// --- DOM ELEMENTS ---
let slider, sliderWrapper;
let mediaItems = [], currentMediaIndex = 0;
let isDragging = false, startPos = 0, currentTranslate = 0, prevTranslate = 0, animationID;

// --- 1. MEDIA GALLERY RENDERER (Infinite Slide & Video Overlay) ---
function renderMediaGallery(data) { 
    slider = document.getElementById('media-slider');
    sliderWrapper = document.getElementById('main-media-wrapper');
    const gallery = document.getElementById("thumbnail-gallery");

    if (!slider || !gallery) return;

    gallery.innerHTML = "";
    slider.innerHTML = "";

    // Prepare Media Items
    mediaItems = (data.images?.map(src => ({ type: "image", src })) || []).concat(data.videoUrl ? [{ type: "video", src: data.videoUrl, thumbnail: data.images?.[0] }] : []);

    mediaItems.forEach((item, index) => {
        // A. Main Slider Item
        const e = document.createElement("div");
        e.className = "media-item"; // CSS handles 3:4 aspect ratio
        
        if (item.type === "image") {
            e.innerHTML = `<img src="${item.src}" alt="Product image ${index+1}" draggable="false">`;
        } else {
            // VIDEO OVERLAY (Solution for stuck slider)
            const embedUrl = getYoutubeEmbedUrl(item.src);
            e.innerHTML = `
                <div class="video-wrapper" onclick="playVideoInPlace(this, '${embedUrl}')">
                    <img src="${item.thumbnail}" class="video-thumb" draggable="false" style="width:100%; height:100%; object-fit:contain; opacity: 0.8;">
                    <div class="video-play-btn-large">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
            `;
        }
        slider.appendChild(e);

        // B. Thumbnail Item
        const t = document.createElement("div");
        t.className = "aspect-square thumbnail";
        const l = document.createElement("img");
        l.src = item.type === "image" ? item.src : item.thumbnail;
        t.appendChild(l);

        // Video Icon (Small)
        if (item.type === "video") {
            const n = document.createElement("div");
            n.className = "play-icon-overlay"; 
            n.innerHTML = '<img src="https://www.svgrepo.com/show/523617/play-circle.svg" alt="Play Video">';
            t.appendChild(n);
        }

        t.addEventListener("click", () => showMedia(index));
        gallery.appendChild(t);
    });

    if (mediaItems.length > 0) showMedia(0);
    
    setupSliderControls();
    setupImageModal();
}

// Helper: Replace Thumbnail with Iframe
window.playVideoInPlace = function(wrapper, embedUrl) {
    if (!embedUrl) return;
    wrapper.innerHTML = `<iframe src="${embedUrl}?autoplay=1" class="w-full h-full object-contain" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    wrapper.onclick = null; // Remove click handler
}

// --- 2. VARIANT RENDERER ---
function renderVariantSelectors(data, currentProductGroup) {
    const imageContainer = document.getElementById('image-variant-selectors-container'); 
    const textContainer = document.getElementById('variant-selectors-container'); 

    if (!imageContainer || !textContainer) return;

    const getProductAttributes = (p) => {
        if (p.attributes && Array.isArray(p.attributes)) return p.attributes;
        if (p.variantType && p.variantValue) return [{ type: p.variantType, value: p.variantValue }];
        return [];
    };

    const allTypes = new Set();
    currentProductGroup.forEach(p => {
        getProductAttributes(p).forEach(a => allTypes.add(a.type));
    });

    let imageHtml = '';
    let textHtml = '';
    const currentAttrs = getProductAttributes(data);

    allTypes.forEach(type => {
        const currentAttr = currentAttrs.find(a => a.type === type);
        const currentValue = currentAttr ? currentAttr.value : "";

        const uniqueValues = new Set();
        currentProductGroup.forEach(p => {
            const attrs = getProductAttributes(p);
            const matchingAttr = attrs.find(a => a.type === type);
            if(matchingAttr) uniqueValues.add(matchingAttr.value);
        });

        if (uniqueValues.size === 0) return;

        const isColor = type.toLowerCase() === 'color';
        let groupHtml = `<div class="variant-group">`;
        groupHtml += `<h3 class="variant-group-title">${type}: <span>${currentValue}</span></h3>`;
        
        if (isColor) {
            groupHtml += `<div class="image-variant-selectors-container" style="display:flex; flex-wrap:wrap; gap:0.5rem;">`;
        } else {
            groupHtml += `<div class="variant-scroll-container">`;
        }

        uniqueValues.forEach(val => {
            const targetProduct = findBestMatchProduct(currentProductGroup, data, type, val, getProductAttributes);
            const targetId = targetProduct ? targetProduct.id : data.id;
            const isSelected = currentAttrs.some(a => a.type === type && a.value === val);
            
            if (isColor) {
                const imgUrl = targetProduct?.images?.[0] || data.images?.[0] || 'https://placehold.co/60x60';
                groupHtml += `
                    <div class="image-variant-btn ${isSelected ? 'selected' : ''}" 
                       onclick="handleVariantChange('${targetId}')"
                       title="${val}">
                       <img src="${imgUrl}" alt="${val}">
                    </div>
                `;
            } else {
                let cardPrice = "N/A";
                let cardDiscount = "";
                let cardOrigPrice = "";
                const variantImg = targetProduct?.images?.[0] || data.images?.[0] || 'https://placehold.co/60x60';
                
                if (targetProduct) {
                    const pFinal = Number(targetProduct.displayPrice);
                    const pOrig = Number(targetProduct.originalPrice);
                    cardPrice = `₹${pFinal.toLocaleString("en-IN")}`;
                    if (pOrig > pFinal) {
                        const disc = Math.round(((pOrig - pFinal) / pOrig) * 100);
                        cardDiscount = `<span class="var-discount">↓${disc}%</span>`;
                        cardOrigPrice = `<span class="var-orig-price">${pOrig.toLocaleString("en-IN")}</span>`;
                    }
                }

                groupHtml += `
                    <div class="variant-rich-card ${isSelected ? 'selected' : ''}" 
                         onclick="handleVariantChange('${targetId}')">
                        <div class="variant-card-content">
                            <img src="${variantImg}" alt="${val}" class="variant-mini-img">
                            <div class="variant-text-info">
                                <div class="var-name">${val}</div>
                                <div class="var-price-row">
                                    ${cardDiscount}
                                    ${cardOrigPrice}
                                </div>
                                <div class="var-final-price">${cardPrice}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        groupHtml += `</div></div>`;
        if (isColor) imageHtml += groupHtml; else textHtml += groupHtml;
    });

    imageContainer.innerHTML = imageHtml;
    textContainer.innerHTML = textHtml;
}

function findBestMatchProduct(groupProducts, currentProduct, targetType, targetValue, getAttributesFn) {
    const currentAttrs = getAttributesFn(currentProduct);
    const candidates = groupProducts.filter(p => {
        const attrs = getAttributesFn(p);
        return attrs.some(a => a.type === targetType && a.value === targetValue);
    });

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    let bestMatch = candidates[0];
    let maxMatches = -1;

    candidates.forEach(cand => {
        let matches = 0;
        const candAttrs = getAttributesFn(cand);
        currentAttrs.forEach(currA => {
            if (currA.type !== targetType) { 
                const hasMatch = candAttrs.some(ca => ca.type === currA.type && ca.value === currA.value);
                if (hasMatch) matches++;
            }
        });
        if (matches > maxMatches) {
            maxMatches = matches;
            bestMatch = cand;
        }
    });
    return bestMatch;
}

// --- 3. PRICE DISPLAY UPDATER ---
function updatePriceDisplay(currentData, selectedPack, priceElementIds) { 
    const finalPriceEl = document.getElementById(priceElementIds.final); 
    const originalPriceEl = document.getElementById(priceElementIds.original); 
    const percentageDiscountEl = document.getElementById(priceElementIds.discount); 
    const lowestPriceTagContainer = document.getElementById("lowest-price-tag-container"); 
    const dynamicBadge = document.getElementById("dynamic-deal-badge");
    
    // Badge removed as it is now in the title
    const quantityUnitEl = document.getElementById("quantity-unit-text");
    if (quantityUnitEl) {
         quantityUnitEl.style.display = "none";
    }

    const displayPrice = selectedPack ? Number(selectedPack.price) : Number(currentData.displayPrice); 
    const originalPrice = Number(currentData.originalPrice); 
    
    finalPriceEl.textContent = `₹${displayPrice.toLocaleString("en-IN")}`; 
    
    let discount = 0; 
    let packOriginalPrice = originalPrice; 
    if (selectedPack) { 
        const quantity = parseInt(selectedPack.name.split(' ')[0]) || 1; 
        packOriginalPrice = originalPrice > displayPrice ? originalPrice * quantity : 0; 
    } 
    
    if (packOriginalPrice > displayPrice) { 
        discount = Math.round(100 * (packOriginalPrice - displayPrice) / packOriginalPrice); 
    } else if (originalPrice > displayPrice && !selectedPack) { 
        discount = Math.round(100 * (originalPrice - displayPrice) / originalPrice); 
    } 
    
    if (discount > 0) { 
        percentageDiscountEl.innerHTML = `<i class="fas fa-arrow-down mr-0.5 text-sm"></i>${discount}%`; 
        originalPriceEl.textContent = `₹${(selectedPack ? packOriginalPrice : originalPrice).toLocaleString("en-IN")}`; 
        
        percentageDiscountEl.style.display = "flex"; 
        originalPriceEl.style.display = "inline"; 
        
        let badgeText = "";
        if (discount >= 50) badgeText = "Super Saver Deal";
        else if (discount >= 40) badgeText = "Price of the Year";
        else if (discount >= 30) badgeText = "Deal of the Month";
        else if (discount >= 25) badgeText = "Offer Price";
        else if (discount >= 20) badgeText = "Special Offer";

        if (badgeText) {
            dynamicBadge.textContent = badgeText;
            lowestPriceTagContainer.style.display = "block";
        } else {
            lowestPriceTagContainer.style.display = "none";
        }

    } else { 
        percentageDiscountEl.style.display = "none"; 
        originalPriceEl.style.display = "none"; 
        if(lowestPriceTagContainer) lowestPriceTagContainer.style.display = "none";
    } 
}

// --- 4. UI HELPER FUNCTIONS ---
function renderStars(rating, container) { container.innerHTML = ""; const fullStars = Math.floor(rating), halfStar = rating % 1 >= .5, emptyStars = 5 - fullStars - (halfStar ? 1 : 0); for (let i = 0; i < fullStars; i++)container.innerHTML += '<i class="fas fa-star"></i>'; halfStar && (container.innerHTML += '<i class="fas fa-star-half-alt"></i>'); for (let i = 0; i < emptyStars; i++)container.innerHTML += '<i class="far fa-star"></i>' }
function getYoutubeEmbedUrl(url) { if(!url)return null;let videoId=null;try{const urlObj=new URL(url);if("www.youtube.com"===urlObj.hostname||"youtube.com"===urlObj.hostname)videoId=urlObj.searchParams.get("v");else if("youtu.be"===urlObj.hostname)videoId=urlObj.pathname.slice(1);return videoId?`https://www.youtube.com/embed/${videoId}?controls=1&rel=0&modestbranding=1`:null}catch(e){return console.error("Invalid video URL:",url,e),null}}

// Slider Logic (UPDATED: Infinite Wrapping)
function showMedia(index) { 
    // No bounds check here, handled in logic
    slider.style.transition = "transform 0.3s ease-out";
    currentMediaIndex = index;
    currentTranslate = index * -sliderWrapper.offsetWidth;
    prevTranslate = currentTranslate;
    setSliderPosition();
    document.querySelectorAll(".thumbnail").forEach((t,e)=>t.classList.toggle("active",e===index));
}

function setupSliderControls() { if(!sliderWrapper) return; sliderWrapper.addEventListener("touchstart",touchStart,{passive:!0}),sliderWrapper.addEventListener("touchend",touchEnd),sliderWrapper.addEventListener("touchmove",touchMove,{passive:!0}),sliderWrapper.addEventListener("mousedown",touchStart),sliderWrapper.addEventListener("mouseup",touchEnd),sliderWrapper.addEventListener("mouseleave",touchEnd),sliderWrapper.addEventListener("mousemove",touchMove)}

function touchStart(event) { 
    startPos = getPositionX(event);
    isDragging = true;
    animationID = requestAnimationFrame(animation);
    slider.style.transition = "none";
}

function touchMove(event) { 
    if(isDragging){
        const currentPosition = getPositionX(event);
        currentTranslate = prevTranslate + currentPosition - startPos;
    }
}

function touchEnd(event) { 
    if(isDragging){
        isDragging = false;
        cancelAnimationFrame(animationID);
        const movedBy = currentTranslate - prevTranslate;
        
        // Logic for Infinite Loop
        if(movedBy < -50) { // Swipe Left (Next)
            currentMediaIndex++;
            if (currentMediaIndex >= mediaItems.length) currentMediaIndex = 0; // Loop Back to Start
        }
        
        if(movedBy > 50) { // Swipe Right (Prev)
            currentMediaIndex--;
            if (currentMediaIndex < 0) currentMediaIndex = mediaItems.length - 1; // Loop to End
        }
        
        showMedia(currentMediaIndex);
    }
}

function getPositionX(event) { return event.type.includes("mouse")?event.pageX:event.touches[0].clientX}
function animation() { setSliderPosition(),isDragging&&requestAnimationFrame(animation)}
function setSliderPosition() { slider.style.transform=`translateX(${currentTranslate}px)`}

// Modal Logic
function setupImageModal() { const modal=document.getElementById("image-modal"),modalImg=document.getElementById("modal-image-content"),closeBtn=document.querySelector("#image-modal .close"),prevBtn=document.querySelector("#image-modal .prev"),nextBtn=document.querySelector("#image-modal .next");sliderWrapper.onclick=e=>{if(isDragging||currentTranslate-prevTranslate!=0)return;"image"===mediaItems[currentMediaIndex].type&&(modal.style.display="flex",modalImg.src=mediaItems[currentMediaIndex].src)},closeBtn.onclick=()=>modal.style.display="none";const showModalImage=direction=>{let e=mediaItems.map((e,t)=>({...e,originalIndex:t})).filter(e=>"image"===e.type);if(0!==e.length){const t=e.findIndex(e=>e.originalIndex===currentMediaIndex);let n=(t+direction+e.length)%e.length;const r=e[n];modalImg.src=r.src,showMedia(r.originalIndex)}};prevBtn.onclick=e=>{e.stopPropagation(),showModalImage(-1)},nextBtn.onclick=e=>{e.stopPropagation(),showModalImage(1)}}

// Tech Specs (NANO)
function renderTechSpecs(techSpecs) {
    const container = document.getElementById('tech-specs-container');
    const section = document.getElementById('tech-specs-section');
    if (!container || !section) return;
    if (!techSpecs || !Array.isArray(techSpecs) || techSpecs.length === 0) { section.style.display = 'none'; return; }
    container.innerHTML = '';
    let hasContent = false;
    techSpecs.forEach(spec => {
        if (spec.name && spec.value) {
            const iconSvg = spec.svg || '<i class="fas fa-microchip"></i>'; 
            container.innerHTML += `<div class="tech-spec-row"><div class="tech-spec-icon">${iconSvg}</div><div class="tech-spec-details"><div class="tech-spec-name">${spec.name}</div><div class="tech-spec-value">${spec.value}</div></div></div>`;
            hasContent = true;
        }
    });
    section.style.display = hasContent ? 'block' : 'none';
}

function renderComboPacks(data) {
    const container = document.getElementById('combo-pack-container');
    if (!container) return;
    const packs = data.combos && data.combos.quantityPacks ? data.combos.quantityPacks.map(p => ({ name: p.name, price: p.price })) : [];
    if (packs.length === 0) { container.innerHTML = ''; return; }
    
    const createComboPackGrid = (productData, options) => {
        const singleItemOriginalPrice = Number(productData.originalPrice) > Number(productData.displayPrice) ? Number(productData.originalPrice) : Number(productData.displayPrice);
        let bestValueIndex = -1, maxSavings = -1;
        const calculatedOptions = options.map((opt, index) => {
            const quantity = parseInt(opt.name.split(' ')[0]) || 1;
            const packMrp = singleItemOriginalPrice * quantity;
            const packPrice = Number(opt.price);
            let savings = 0, discount = 0;
            if (packMrp > packPrice) { savings = packMrp - packPrice; discount = Math.round((savings / packMrp) * 100); }
            if (savings > maxSavings) { maxSavings = savings; bestValueIndex = index; }
            return { ...opt, packMrp, discount, savings };
        });
        const cardImage = productData.images[0] || 'https://placehold.co/60x60';
        return calculatedOptions.map((opt, index) => {
            const isBestValue = index === bestValueIndex && maxSavings > 0;
            return `<div class="combo-pack-card" data-value="${opt.name}" data-price="${opt.price || ''}">${isBestValue ? '<div class="best-value-tag">Best Value</div>' : ''}<img src="${cardImage}" alt="pack"><div class="pack-details"><p class="pack-name">${opt.name}</p><p class="pack-price">₹${Number(opt.price).toLocaleString('en-IN')}</p>${opt.discount > 0 ? `<div class="combo-pack-savings"><span class="line-through text-gray-400">₹${opt.packMrp.toLocaleString('en-IN')}</span><span class="font-semibold text-green-600">${opt.discount}% OFF</span></div>` : ''}</div></div>`;
        }).join('');
    };

    const comboHTML = createComboPackGrid(data, packs);
    container.innerHTML = `<div class="combo-pack-container mt-2"><h3 class="text-sm font-bold text-gray-800 mb-1">Available Packs</h3><div class="combo-pack-grid">${comboHTML}</div></div>`;
}

function renderProductBundles(data, allProductsCache) {
    const container = document.getElementById('bundle-offer-container');
    if (!container || !data.combos || !data.combos.productBundle || !data.combos.productBundle.linkedProductIds) return;
    const bundle = data.combos.productBundle;
    const linkedProducts = bundle.linkedProductIds.map(id => allProductsCache.find(p => p.id === id)).filter(Boolean);
    if (linkedProducts.length === bundle.linkedProductIds.length) {
        const allBundleProducts = [data, ...linkedProducts];
        const bundlePrice = Number(bundle.bundlePrice);
        const productIds = allBundleProducts.map(p => p.id).join(',');
        const imagesHTML = allBundleProducts.map(p => `<img src="${p.images?.[0] || ''}" alt="${p.name}">`).join('');
        const namesHTML = allBundleProducts.map(p => p.name).join(' + ');
        const originalTotal = allBundleProducts.reduce((sum, p) => sum + Number(p.displayPrice), 0);
        let originalPriceHTML = '';
        if (originalTotal > bundlePrice) { originalPriceHTML = `<span class="original-price">₹${originalTotal.toLocaleString('en-IN')}</span>`; }
        const bundleHTML = `<div class="ramazone-simple-bundle-card product-bundle-card" data-product-ids="${productIds}" data-price="${bundlePrice}"><div class="bundle-images">${imagesHTML}</div><div class="bundle-details"><p class="product-names">${namesHTML}</p><div class="price-info"><span class="final-price">₹${bundlePrice.toLocaleString('en-IN')}</span>${originalPriceHTML}</div></div><button class="final-bundle-plus-btn" data-bundle="true" title="Add Bundle to Cart">+</button></div>`;
        container.innerHTML = bundleHTML;
    }
}

function renderDescription(data) { 
    const descriptionContainer = document.getElementById("product-description"); 
    const descriptionSection = document.getElementById("description-section"); 
    const returnPolicyEl = document.getElementById("return-policy-info"); 
    let hasContent = false; 
    descriptionContainer.innerHTML = ""; 
    if (returnPolicyEl) returnPolicyEl.style.display = "none"; 
    if (data.longDescription) { descriptionContainer.innerHTML = `<p class="text-xs text-gray-600 leading-relaxed">${data.longDescription.replace(/\n/g, '<br>')}</p>`; hasContent = true; } else if (data.description && Array.isArray(data.description) && data.description.length > 0) { let descriptionHtml = '<ul class="space-y-2 list-inside">'; data.description.forEach(block => { if (block.details) { descriptionHtml += `<li class="text-xs text-gray-600 leading-relaxed">${block.details}</li>`; hasContent = true; } }); descriptionHtml += '</ul>'; descriptionContainer.innerHTML = descriptionHtml; } 
    if (data.returnPolicy && data.returnPolicy.type) { let policyText = ''; switch (data.returnPolicy.type) { case 'days': policyText = `${data.returnPolicy.value} Days Return Available`; break; case 'no_return': policyText = 'No Return Available'; break; case 'custom': policyText = data.returnPolicy.value; break; } if (policyText && returnPolicyEl) { returnPolicyEl.innerHTML = `<i class="fas fa-undo-alt w-4 text-center"></i> <span>${policyText}</span>`; returnPolicyEl.style.display = "flex"; hasContent = true; } } 
    descriptionSection.style.display = hasContent ? "block" : "none"; 
}

function renderAdvancedHighlights(specData) { const container = document.getElementById("advanced-highlights-section"); if (!specData || !specData.blocks || specData.blocks.length === 0) { container.style.display = "none"; return; } let html = `<div class="p-3 sm:p-4 lg:p-6 border-t border-b border-gray-200 my-2"><h2 class="text-sm font-bold text-gray-900 mb-3">Highlights</h2>`; if (specData.specScore || specData.specTag) { html += '<div class="flex items-center gap-2 mb-3">'; if (specData.specScore) { html += `<div class="spec-score font-bold">${specData.specScore}</div>`; } if (specData.specTag) { html += `<div class="spec-tag">${specData.specTag}</div>`; } html += '</div>'; } html += '<div class="space-y-3">'; specData.blocks.forEach(block => { const subtitleStyle = "color: #B8860B; font-weight: 500;"; html += `<div class="flex items-start gap-3"><div class="flex-shrink-0 w-6 h-6 text-gray-600 pt-0.5">${block.icon || ""}</div><div class="flex-grow"><p class="text-xs text-gray-500">${block.category || ""}</p><h4 class="text-sm font-semibold text-gray-800 mt-0.5">${block.title || ""}</h4><p class="text-xs mt-0.5" style="${subtitleStyle}">${block.subtitle || ""}</p></div></div>`; }); html += '</div></div>'; container.innerHTML = html; container.style.display = "block"; }

function showToast(message, type = "info") { const toast=document.getElementById("toast-notification");toast.textContent=message,toast.style.backgroundColor="error"===type?"#ef4444":"#333",toast.classList.add("show"),setTimeout(()=>toast.classList.remove("show"),2500)}

// --- Export functions to Global Scope for Main JS ---
window.renderMediaGallery = renderMediaGallery;
window.renderVariantSelectors = renderVariantSelectors;
window.updatePriceDisplay = updatePriceDisplay;
window.renderStars = renderStars;
window.renderTechSpecs = renderTechSpecs;
window.renderComboPacks = renderComboPacks;
window.renderProductBundles = renderProductBundles;
window.renderDescription = renderDescription;
window.renderAdvancedHighlights = renderAdvancedHighlights;
window.showToast = showToast;

