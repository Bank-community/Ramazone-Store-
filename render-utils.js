// --- RENDER UTILITIES (SUPERSONIC VERSION) ---

// 1. OPTIMIZED INLINE SVG (No Network Request)
const CART_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: auto;"><path d="M21 5L19 12H7.37671M20 16H8L6 3H3M16 5.5H13.5M13.5 5.5H11M13.5 5.5V8M13.5 5.5V3M9 20C9 20.5523 8.55228 21 8 21C7.44772 21 7 20.5523 7 20C7 19.4477 7.44772 19 8 19C8.55228 19 9 19.4477 9 20ZM20 20C20 20.5523 19.5523 21 19 21C18.4477 21 18 20.5523 18 20C18 19.4477 18.4477 19 19 19C19.5523 19 20 19.4477 20 20Z" stroke="#000000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

// --- PRODUCT CARD RENDERER ---
function createProductCardHTML(prod, extraClass = '') {
    if (!prod) return '';
    
    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image';
    const ratingTag = prod.rating ? `<div class="card-rating-tag">${prod.rating} <i class="fas fa-star"></i></div>` : '';
    const offerTag = prod.offerText ? `<div class="product-offer-tag" style="background-color:${prod.offerBackgroundColor||'var(--primary-color)'}; color:${prod.offerTextColor||'white'}">${prod.offerText}</div>` : '';

    const displayPrice = Number(prod.displayPrice).toLocaleString("en-IN");
    let priceHTML = `<p class="display-price">₹${displayPrice}</p>`;
    let originalPriceHTML = '';
    let discountHTML = '';

    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        originalPriceHTML = `<p class="original-price">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</p>`;
        if (discount > 0) {
            discountHTML = `<p class="product-discount"><span>↓</span> ${discount}%</p>`;
        }
    }

    return `
    <div class="product-card ${extraClass}">
        <div class="product-media-container">
            <a href="./product-details.html?id=${prod.id}" class="block absolute inset-0">
                <img src="${imageUrl}" alt="${prod.name || 'Product'}" loading="lazy" decoding="async">
            </a>
            ${ratingTag}
            ${offerTag}
        </div>
        <div class="product-card-info">
            <a href="./product-details.html?id=${prod.id}" class="block">
                <h2 class="product-name">${prod.name || 'Product Name'}</h2>
                <div class="price-container">
                    ${priceHTML}
                    ${originalPriceHTML}
                    ${discountHTML}
                </div>
            </a>
            <div class="product-card-actions" style="display: flex; gap: 8px; align-items: center;">
                <button class="cart-btn add-btn" data-id="${prod.id}" style="display: flex; align-items: center; justify-content: center; padding: 0; width: 40px; height: 38px; border-radius: 8px;">
                    ${CART_ICON_SVG}
                    <i class="fas fa-check cart-added-icon" style="display: none; font-size: 1.2rem;"></i>
                </button>
                <button class="buy-text-btn" data-id="${prod.id}" style="flex-grow: 1;">Buy</button>
            </div>
        </div>
    </div>`;
}

function createFestiveCardHTML(prod, options = {}) {
    if (!prod) return '';
    const { soldPercentage } = options;
    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=No+Image';
    const ratingTag = prod.rating ? `<div class="card-rating-tag">${prod.rating} <i class="fas fa-star"></i></div>` : '';
    const offerTag = prod.offerText ? `<div class="product-offer-tag" style="background-color:${prod.offerBackgroundColor||'var(--primary-color)'}; color:${prod.offerTextColor||'white'}">${prod.offerText}</div>` : '';

    const displayPrice = Number(prod.displayPrice).toLocaleString("en-IN");
    let priceHTML = `<p class="display-price">₹${displayPrice}</p>`;
    let originalPriceHTML = '';
    let discountHTML = '';

    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        originalPriceHTML = `<p class="original-price">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</p>`;
        if (discount > 0) discountHTML = `<p class="product-discount"><span>↓</span> ${discount}%</p>`;
    }

    let progressBarHTML = '';
    if (typeof soldPercentage === 'number' && soldPercentage >= 0) {
        progressBarHTML = `
        <div class="w-full bg-gray-200 rounded-full h-1.5 mb-2 mt-1 overflow-hidden">
            <div class="bg-red-500 h-1.5 rounded-full" style="width: ${soldPercentage}%"></div>
        </div>
        <div class="text-xs text-gray-500 mb-2 flex justify-between"><span>Sold</span> <span>${soldPercentage}%</span></div>`;
    }

    return `
    <div class="product-card carousel-item h-full block">
        <div class="product-media-container">
            <a href="./product-details.html?id=${prod.id}" class="block absolute inset-0">
                <img src="${imageUrl}" alt="${prod.name || 'Product'}" loading="lazy" decoding="async">
            </a>
            ${ratingTag}
            ${offerTag}
        </div>
        <div class="product-card-info">
            <a href="./product-details.html?id=${prod.id}" class="block">
                <h2 class="product-name">${prod.name || 'Product Name'}</h2>
                <div class="price-container">
                    ${priceHTML}
                    ${originalPriceHTML}
                    ${discountHTML}
                </div>
            </a>
            ${progressBarHTML}
            <div class="product-card-actions" style="display: flex; gap: 8px; align-items: center;">
                <button class="cart-btn add-btn" data-id="${prod.id}" style="display: flex; align-items: center; justify-content: center; padding: 0; width: 40px; height: 38px; border-radius: 8px;">
                    ${CART_ICON_SVG}
                    <i class="fas fa-check cart-added-icon" style="display: none; font-size: 1.2rem;"></i>
                </button>
                <button class="buy-text-btn" data-id="${prod.id}" style="flex-grow: 1;">Buy</button>
            </div>
        </div>
    </div>`;
}

// --- SECTIONS RENDERERS ---
function renderSlider(sliderData) {
    const slider = document.getElementById('main-slider');
    const section = document.querySelector('.slider-wrapper');
    if (!slider || !Array.isArray(sliderData) || sliderData.length === 0) { if (section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    
    slider.innerHTML = sliderData.map((slide, index) => {
        const loadingAttr = index === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
        return `<a href="${slide.linkUrl || '#'}" class="slide" target="_blank" draggable="false">
            ${slide.videoUrl 
                ? `<video src="${slide.videoUrl}" autoplay muted loop playsinline draggable="false"></video>` 
                : `<picture>
                    <source media="(min-width: 768px)" srcset="${slide.imageUrlDesktop || slide.imageUrlMobile || ''}">
                    <img src="${slide.imageUrlMobile || slide.imageUrlDesktop || ''}" alt="Promotional banner" draggable="false" ${loadingAttr}>
                   </picture>`
            }
        </a>`;
    }).join('');
}

function renderNormalCategories(categories) {
    const section = document.getElementById('normal-category-section');
    if (!section || !Array.isArray(categories) || categories.length === 0) { if (section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    section.innerHTML = `<div class="category-master-scroller"><div class="category-rows-container"><div id="top-category-row" class="category-row"></div><div id="bottom-category-row" class="category-row"></div></div></div>`;
    const topWrapper = document.getElementById('top-category-row');
    const bottomWrapper = document.getElementById('bottom-category-row');
    const renderCategoryHTML = cat => `<a href="${(cat.size === 'double' && cat.linkUrl) ? cat.linkUrl : `./products.html?category=${encodeURIComponent(cat.name)}`}" target="${(cat.size === 'double' && cat.linkUrl) ? '_blank' : ''}" class="category-card ${cat.size === 'double' ? 'category-card--double' : ''}"><div class="img-wrapper"><img src="${cat.imageUrl}" alt="${cat.name}" loading="lazy" decoding="async"></div><p class="category-name">${cat.name}</p></a>`;
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

function renderJustForYouSection(jfyData, allProductsCache) {
    const section = document.getElementById('just-for-you-section');
    if (!section || !jfyData) { if (section) section.style.display = 'none'; return; }
    
    const { poster, topDeals } = jfyData;
    const mainProduct = allProductsCache.find(p => p.id === topDeals?.mainProductId);
    const subProduct1 = allProductsCache.find(p => p.id === topDeals?.subProductIds?.[0]);
    const subProduct2 = allProductsCache.find(p => p.id === topDeals?.subProductIds?.[1]);
    
    if (!poster || !topDeals || !mainProduct || !subProduct1 || !subProduct2) { section.style.display = 'none'; return; }
    
    const isDesktop = window.innerWidth >= 768;
    let mainProductImage = mainProduct.images?.[0] || 'https://placehold.co/600x600/e2e8f0/64748b?text=Image';
    if (isDesktop && topDeals.mainProductImageUrl) { mainProductImage = topDeals.mainProductImageUrl; }
    
    const getDiscount = p => p && p.originalPrice > p.displayPrice ? `<p class="discount">${Math.round(((p.originalPrice - p.displayPrice) / p.originalPrice) * 100)}% OFF</p>` : '';
    const jfyContent = document.getElementById('jfy-content');
    
    if (jfyContent) { 
        jfyContent.innerHTML = `<div class="jfy-main-container" style="background-color: ${jfyData.backgroundColor || 'var(--bg-light)'};"><h2 class="jfy-main-title" style="color: ${jfyData.titleColor || 'var(--text-dark)'};">${jfyData.title || 'Just for You'}</h2><div class="jfy-grid"><a href="${poster.linkUrl || '#'}" class="jfy-poster-card"><div class="jfy-poster-slider-container"><div class="jfy-poster-slider">${poster.images.map(img => `<div class="jfy-poster-slide"><img src="${img}" alt="Poster Image" loading="lazy"></div>`).join('')}</div><div class="jfy-slider-dots"></div></div></a><div class="jfy-deals-card"><div class="relative jfy-main-product"><a href="./product-details.html?id=${mainProduct.id}"><img src="${mainProductImage}" alt="${mainProduct.name}" loading="lazy"></a></div><div class="jfy-sub-products"><div class="relative jfy-sub-product-item"><a href="./product-details.html?id=${subProduct1.id}"><div class="img-wrapper"><img src="${subProduct1.images?.[0] || ''}" alt="${subProduct1.name}" loading="lazy"></div><div class="details"><p class="name">${subProduct1.name}</p>${getDiscount(subProduct1)}</div></a></div><div class="relative jfy-sub-product-item"><a href="./product-details.html?id=${subProduct2.id}"><div class="img-wrapper"><img src="${subProduct2.images?.[0] || ''}" alt="${subProduct2.name}" loading="lazy"></div><div class="details"><p class="name">${subProduct2.name}</p>${getDiscount(subProduct2)}</div></a></div></div></div></div></div>`; 
    }
    section.style.display = 'block';
    return poster.images?.length || 0; 
}

function renderSingleBanner(bannerData) {
    const section = document.getElementById('single-banner-section');
    if (!section) return;
    if (!bannerData || bannerData.isActive === false || !bannerData.imageUrl) { section.classList.add('hidden'); return; }
    const linkEl = document.getElementById('single-banner-link');
    const imgEl = document.getElementById('single-banner-img');
    const titleOverlay = document.getElementById('single-banner-title-overlay');
    const titleEl = document.getElementById('single-banner-title');
    imgEl.src = bannerData.imageUrl;
    imgEl.setAttribute('loading', 'lazy');
    let targetLink = '#';
    if (bannerData.linkType === 'product' && bannerData.linkValue) { targetLink = `./product-details.html?id=${bannerData.linkValue}`; } 
    else if (bannerData.linkType === 'custom' && bannerData.linkValue) { targetLink = bannerData.linkValue; }
    linkEl.href = targetLink;
    if (bannerData.title) { titleEl.textContent = bannerData.title; titleOverlay.classList.remove('hidden'); } else { titleOverlay.classList.add('hidden'); }
    section.classList.remove('hidden');
}

function renderInfoMarquee(text) { const section = document.getElementById('info-marquee-section'); if (!text) { if (section) section.style.display = 'none'; return; } section.style.display = 'block'; section.querySelector('#info-marquee-text').innerHTML = text; }
function renderFlipCardSection(data) { const section = document.getElementById('flipcard-section'); const content = document.getElementById('flip-card-inner-content'); if (!data?.front || !data.back) { if (section) section.style.display = 'none'; return; } section.style.display = 'block'; content.innerHTML = `<a href="${data.front.linkUrl||'#'}" target="_blank" class="flip-card-front"><img src="${data.front.imageUrl}" loading="lazy"></a><a href="${data.back.linkUrl||'#'}" target="_blank" class="flip-card-back"><img src="${data.back.imageUrl}" loading="lazy"></a>`; content.classList.add('flipping');}
function renderFooter(data) { if (!data) return; document.getElementById('menu-play-link').href = data.playLink || '#'; document.getElementById('menu-cashback-link').href = data.profileLink || '#'; const links = data.followLinks; if (links) { const submenuContainer = document.getElementById('follow-submenu'); const desktopContainer = document.getElementById('desktop-social-links'); submenuContainer.innerHTML = ''; desktopContainer.innerHTML = ''; const platforms = { youtube: { icon: 'https://www.svgrepo.com/show/416500/youtube-circle-logo.svg', name: 'YouTube' }, instagram: { icon: 'https://www.svgrepo.com/show/452229/instagram-1.svg', name: 'Instagram' }, facebook: { icon: 'https://www.svgrepo.com/show/448224/facebook.svg', name: 'Facebook' }, whatsapp: { icon: 'https://www.svgrepo.com/show/452133/whatsapp.svg', name: 'WhatsApp' } }; Object.keys(platforms).forEach(key => { if (links[key]) { const p = platforms[key]; submenuContainer.innerHTML += `<a href="${links[key]}" target="_blank" class="submenu-item"><img src="${p.icon}" alt="${key}"><span>${p.name}</span></a>`; desktopContainer.innerHTML += `<a href="${links[key]}" target="_blank"><img src="${p.icon}" class="w-7 h-7" alt="${key}"></a>`; } }); } }
function renderSearch(searchData) { const searchInput = document.getElementById('home-search-input'); if (!searchInput || !searchData?.scrollingTexts?.length) { if(searchInput) searchInput.placeholder = "Search for products..."; return; } const texts = searchData.scrollingTexts; let i = 0; if (window.searchInterval) clearInterval(window.searchInterval); const updatePlaceholder = () => { if (searchInput && document.activeElement !== searchInput) { searchInput.placeholder = `Search for ${texts[i]}...`; i = (i + 1) % texts.length; } }; updatePlaceholder(); window.searchInterval = setInterval(updatePlaceholder, 3000); }

// --- LOCATION RENDERERS ---
function renderStateTabs(allLocationsCache, currentSelectedState) {
    const container = document.getElementById('loc-state-tabs');
    if (!container) return;
    const tier2 = document.getElementById('loc-district-tier');
    const tier3 = document.getElementById('loc-area-tier');
    if (tier2) tier2.classList.add('hidden');
    if (tier3) tier3.classList.add('hidden');
    const states = Object.keys(allLocationsCache).filter(stateName => allLocationsCache[stateName].isActive);
    if (states.length === 0) { container.innerHTML = '<p class="loc-tab-placeholder">No active locations available.</p>'; return; }
    container.innerHTML = states.map(stateName => `<button class="loc-tab-btn ${stateName === currentSelectedState ? 'active' : ''}" data-state="${stateName}">${stateName}</button>`).join('');
}

function renderDistrictTabs(stateName, allLocationsCache, currentSelectedDistrict) {
    const container = document.getElementById('loc-district-tabs');
    const tier2 = document.getElementById('loc-district-tier');
    const tier3 = document.getElementById('loc-area-tier');
    if (!container || !tier2) return;
    tier2.classList.remove('hidden');
    if (tier3) tier3.classList.add('hidden');
    const stateData = allLocationsCache[stateName];
    if (!stateData || !stateData.districts) { container.innerHTML = '<p class="loc-tab-placeholder">No districts available.</p>'; return; }
    const districts = Object.keys(stateData.districts).filter(distName => stateData.districts[distName].isActive);
    if (districts.length === 0) { container.innerHTML = '<p class="loc-tab-placeholder">No active districts in this state.</p>'; return; }
    container.innerHTML = districts.map(distName => `<button class="loc-tab-btn ${distName === currentSelectedDistrict ? 'active' : ''}" data-state="${stateName}" data-district="${distName}">${distName}</button>`).join('');
}

function renderAreaList(stateName, districtName, searchQuery = '', allLocationsCache, currentLoc) {
    const container = document.getElementById('loc-area-list-container');
    const tier3 = document.getElementById('loc-area-tier');
    if (!container || !tier3) return;
    tier3.classList.remove('hidden');
    const districtData = allLocationsCache[stateName]?.districts[districtName];
    if (!districtData || !Array.isArray(districtData.areas)) { container.innerHTML = '<p class="p-4 text-center text-gray-500">No areas found.</p>'; return; }
    let areas = districtData.areas;
    if (searchQuery) { areas = areas.filter(areaName => areaName.toLowerCase().includes(searchQuery)); }
    if (areas.length === 0) { container.innerHTML = `<p class="p-4 text-center text-gray-500">${searchQuery ? 'No areas found.' : 'No areas added.'}</p>`; return; }
    container.innerHTML = areas.map(areaName => { const fullPath = `${stateName}/${districtName}/${areaName}`; const isActive = fullPath === currentLoc; return `<div class="location-item ${isActive ? 'active' : ''}" data-path="${fullPath}"><i class="fas fa-map-marker-alt"></i><span>${areaName}</span><i class="fas fa-check location-item-check"></i></div>`; }).join('');
}

