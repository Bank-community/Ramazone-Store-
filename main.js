// --- GLOBAL STATE ---
let allProductsCache = [];
let database;

// --- CART FUNCTIONS ---
function getCart() { try { const cart = localStorage.getItem('ramazoneCart'); return cart ? JSON.parse(cart) : []; } catch (e) { return []; } }
function saveCart(cart) { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); }

function addToCart(productId, quantityToAdd = 1) {
    const cart = getCart();
    const product = allProductsCache.find(p => p && p.id === productId);

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
function updateCartIcon() { const totalQuantity = getTotalCartQuantity(); const cartCountElement = document.getElementById('cart-item-count'); if (cartCountElement) { if (totalQuantity > 0) { cartCountElement.textContent = totalQuantity; } else { cartCountElement.textContent = ''; } } }
function showToast(message, type = "info") { const toast=document.getElementById("toast-notification");toast.textContent=message,toast.style.backgroundColor="error"===type?"#ef4444":"#333",toast.classList.add("show"),setTimeout(()=>toast.classList.remove("show"),2500)}


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
            loadAllData();
        } else {
            throw new Error("Firebase config is missing or invalid.");
        }
    } catch (error) {
        console.error("Could not initialize Firebase:", error);
        document.getElementById('main-content-area').innerHTML = 
            '<div style="text-align: center; padding: 50px;">Could not initialize application. Please try again later.</div>';
    }
}

function loadAllData() {
    const dbRef = database.ref('ramazone');
    dbRef.on('value', async (snapshot) => {
        const data = snapshot.val() || {};
        const productsObject = data.products || {};
        allProductsCache = Array.isArray(productsObject) ? productsObject : Object.values(productsObject);

        await loadPageStructure();
        renderAllSections(data);

    }, (error) => {
         console.error("Firebase read failed: " + error.code);
         document.getElementById('main-content-area').innerHTML = 
            '<div style="text-align: center; padding: 50px;">Could not load page data. Please check your connection.</div>';
    });
}

async function loadPageStructure() {
    const mainContentArea = document.getElementById('main-content-area');
    if (mainContentArea.childElementCount > 0) return;

    const sections = [
        'categories.html',
        'videos.html',
        'festive-collection.html',
        'info-marquee.html',
        'flip-card.html',
        'just-for-you.html',
        'deals-of-the-day.html'
    ];

    try {
        const responses = await Promise.all(sections.map(s => fetch(`sections/${s}`)));
        const htmlSnippets = await Promise.all(responses.map(res => res.text()));
        mainContentArea.innerHTML = htmlSnippets.join('');
    } catch (error) {
        console.error("Error loading page structure:", error);
        mainContentArea.innerHTML = '<div style="text-align: center; padding: 50px;">Error loading page content.</div>';
    }
}

function renderAllSections(data) {
    const homepageData = data.homepage || {};

    renderSlider(homepageData.slider);
    renderSearch(homepageData.search);
    renderNormalCategories(homepageData.normalCategories);
    renderVideosSection(homepageData.videos);
    renderFestiveCollection(homepageData.festiveCollection);
    renderInfoMarquee(homepageData.infoMarquee);
    renderFlipCardSection(homepageData.flipCard);
    renderJustForYouSection(homepageData.justForYou);
    renderHighlightedProducts(); 
    renderFooter(homepageData.footer);
    document.getElementById('copyright-year').textContent = new Date().getFullYear();

    setupGlobalEventListeners();
    updateCartIcon();
    setupScrollAnimations();
}


// --- HELPER FUNCTIONS ---
function createProductCardHTML(prod, cardClass = '') {
    if (!prod) return '';

    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/400x400/e2e8f0/64748b?text=Image';
    const ratingTag = prod.rating ? `<div class="card-rating-tag">${prod.rating} <i class="fas fa-star"></i></div>` : '';
    const offerTag = prod.offerText ? `<div class="product-offer-tag" style="color:${prod.offerTextColor||'white'}; background-color:${prod.offerBackgroundColor||'#4F46E5'}">${prod.offerText}</div>` : '';

    let priceHTML = `<p class="text-base font-bold" style="color: var(--primary-color)">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</p>`;
    let originalPriceHTML = '';
    let discountHTML = '';

    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        originalPriceHTML = `<p class="text-xs text-gray-400 line-through">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</p>`;
        if(discount > 0) discountHTML = `<p class="text-xs font-semibold text-green-600 mt-1">${discount}% OFF</p>`;
    }

    const displayPriceNum = Number(prod.displayPrice);
    const showAddButton = displayPriceNum < 500 || prod.category === 'grocery';
    const addButtonHTML = showAddButton ? `<button class="add-btn standard-card-add-btn" data-id="${prod.id}">+</button>` : "";

    return `
        <div class="product-card ${cardClass} h-full block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">
            <div class="relative">
                <a href="./product-details.html?id=${prod.id}">
                    <img src="${imageUrl}" class="w-full object-cover aspect-square" alt="${prod.name || 'Product'}" loading="lazy">
                </a>
                ${ratingTag}
                ${offerTag}
                ${addButtonHTML}
            </div>
            <div class="p-2">
                <a href="./product-details.html?id=${prod.id}">
                    <h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${prod.name || 'Product Name'}</h4>
                    <div class="flex items-baseline gap-2">
                        ${priceHTML}
                        ${originalPriceHTML}
                    </div>
                    ${discountHTML}
                </a>
            </div>
        </div>`;
}


function getDealsOfTheDayProducts(maxCount) {
    if (!allProductsCache || allProductsCache.length === 0) return [];
    return [...allProductsCache].sort((a, b) => {
        const discountA = (a.originalPrice || 0) - (a.displayPrice || 0);
        const discountB = (b.originalPrice || 0) - (b.displayPrice || 0);
        if (discountB > discountA) return 1;
        if (discountA > discountB) return -1;
        return (b.rating || 0) - (a.rating || 0);
    }).slice(0, maxCount);
}

function toggleSocialMedia(event) {
    event.preventDefault();
    document.getElementById('social-links-container').classList.toggle('active');
}

function setupGlobalEventListeners() {
    document.body.addEventListener('click', function(event) {
        const addButton = event.target.closest('.add-btn');
        if (addButton) {
            event.preventDefault();
            const productId = addButton.dataset.id;
            if (productId) {
                addToCart(productId);
                addButton.classList.add('added');
                addButton.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    addButton.classList.remove('added');
                    addButton.innerHTML = '+';
                }, 1500);
            }
        }
    });
}


function setupScrollAnimations() {
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}


// --- RENDER FUNCTIONS ---
function renderSlider(sliderData) {
    const slider = document.getElementById('main-slider');
    const section = document.querySelector('.slider-wrapper');
    if (!slider || !Array.isArray(sliderData) || sliderData.length === 0) { if(section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    slider.innerHTML = sliderData.map(slide => `
        <a href="${slide.linkUrl || '#'}" class="slide" target="_blank" draggable="false">
            ${slide.videoUrl 
                ? `<video src="${slide.videoUrl}" autoplay muted loop playsinline draggable="false"></video>` 
                : `<picture>
                        <source media="(min-width: 768px)" srcset="${slide.imageUrlDesktop || slide.imageUrlMobile || ''}">
                        <img src="${slide.imageUrlMobile || slide.imageUrlDesktop || ''}" alt="Promotional banner" draggable="false">
                   </picture>`
            }
        </a>`).join('');
    initializeSlider(sliderData.length);
}

function renderNormalCategories(categories) {
    const section = document.getElementById('normal-category-section');
    if (!section || !Array.isArray(categories) || categories.length === 0) { if(section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    section.innerHTML = `<div class="category-master-scroller"><div class="category-rows-container"><div id="top-category-row" class="category-row"></div><div id="bottom-category-row" class="category-row"></div></div></div>`;
    const topWrapper = document.getElementById('top-category-row');
    const bottomWrapper = document.getElementById('bottom-category-row');
    const renderCategoryHTML = cat => {
        const href = (cat.size === 'double' && cat.linkUrl) ? cat.linkUrl : `./products.html?category=${encodeURIComponent(cat.name)}`;
        return `<a href="${href}" target="${(cat.size === 'double' && cat.linkUrl) ? '_blank' : ''}" class="category-card ${cat.size === 'double' ? 'category-card--double' : ''}">
                    <div class="img-wrapper"><img src="${cat.imageUrl}" alt="${cat.name}" loading="lazy"></div>
                    <p class="category-name">${cat.name}</p>
                </a>`;
    };
    topWrapper.innerHTML = categories.filter(c => c && c.row === 'top').map(renderCategoryHTML).join('');
    bottomWrapper.innerHTML = categories.filter(c => c && c.row !== 'top').map(renderCategoryHTML).join('');
}

function renderVideosSection(videoData) {
    const section = document.getElementById('video-section');
    const slider = document.getElementById('video-slider');
    if (!section || !Array.isArray(videoData) || videoData.length === 0) { if(section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    slider.innerHTML = videoData.map(video => `
        <a href="${video.youtubeUrl || '#'}" target="_blank" class="video-card">
            <img src="${video.imageUrl || 'https://placehold.co/600x400/black/white?text=Video'}" alt="${video.title}" loading="lazy">
            <i class="fas fa-play-circle play-icon"></i>
            <div class="video-card-overlay">
                <h3 class="video-card-title">${video.title}</h3>
                <p class="video-card-desc">${video.description || ''}</p>
            </div>
        </a>`).join('');
}

function renderFestiveCollection(collectionData) {
    const container = document.getElementById('festive-collection-container');
    if (!container || !collectionData || !Array.isArray(collectionData.productIds) || collectionData.productIds.length === 0) { if(container) container.style.display = 'none'; return; }
    container.style.display = 'block';
    container.style.backgroundColor = collectionData.backgroundColor || 'var(--bg-light)';
    document.getElementById('festive-headline').innerText = collectionData.title || 'Special Offers';
    document.getElementById('festive-headline').style.color = collectionData.headlineColor || 'var(--text-dark)';
    const slider = document.getElementById('festive-product-slider');
    const productsToRender = collectionData.productIds
        .map(id => allProductsCache.find(p => p.id === id))
        .filter(Boolean);
    slider.innerHTML = productsToRender.map(p => createProductCardHTML(p, 'carousel-item')).join('');
}

function renderJustForYouSection(jfyData) {
    const section = document.getElementById('just-for-you-section');
    if (!section || !jfyData) { if (section) section.style.display = 'none'; return; }

    const poster = jfyData.poster;
    const deals = jfyData.topDeals;
    const mainProduct = allProductsCache.find(p => p.id === deals?.mainProductId);
    const subProduct1 = allProductsCache.find(p => p.id === deals?.subProductIds?.[0]);
    const subProduct2 = allProductsCache.find(p => p.id === deals?.subProductIds?.[1]);

    if (!poster || !deals || !mainProduct || !subProduct1 || !subProduct2) { 
        section.style.display = 'none'; 
        return; 
    }

    const getDiscount = p => p && p.originalPrice && Number(p.originalPrice) > Number(p.displayPrice) ? `<p class="discount">${Math.round(((p.originalPrice - p.displayPrice) / p.originalPrice) * 100)}% OFF</p>` : '';

    const getAddButton = p => {
        if (!p) return '';
        const showAddButton = Number(p.displayPrice) < 500 || p.category === 'grocery';
        return showAddButton ? `<button class="add-btn standard-card-add-btn" data-id="${p.id}">+</button>` : "";
    };

    const jfyContent = document.getElementById('jfy-content');
    if (jfyContent) {
        jfyContent.innerHTML = `
        <div class="jfy-main-container" style="background-color: ${jfyData.backgroundColor || 'var(--bg-light)'};">
            <h2 class="jfy-main-title" style="color: ${jfyData.titleColor || 'var(--text-dark)'};">${jfyData.title || 'Just for You'}</h2>
            <div class="jfy-grid">
                <a href="${poster.linkUrl || '#'}" class="jfy-poster-card">
                    <div class="jfy-poster-slider-container">
                        <div class="jfy-poster-slider">${poster.images.map(img => `<div class="jfy-poster-slide"><img src="${img}" alt="Poster Image"></div>`).join('')}</div>
                        <div class="jfy-slider-dots"></div>
                    </div>
                </a>
                <div class="jfy-deals-card">
                    <div class="relative jfy-main-product">
                        <a href="./product-details.html?id=${mainProduct.id}"><img src="${(mainProduct.images && mainProduct.images[0]) || ''}" alt="${mainProduct.name}"></a>
                        ${getAddButton(mainProduct)}
                    </div>
                    <div class="jfy-sub-products">
                        <div class="relative jfy-sub-product-item">
                            <a href="./product-details.html?id=${subProduct1.id}">
                                <div class="img-wrapper"><img src="${(subProduct1.images && subProduct1.images[0]) || ''}" alt="${subProduct1.name}"></div>
                                <div class="details"><p class="name">${subProduct1.name}</p>${getDiscount(subProduct1)}</div>
                            </a>
                            <div class="absolute bottom-2 right-2">${getAddButton(subProduct1)}</div>
                        </div>
                        <div class="relative jfy-sub-product-item">
                             <a href="./product-details.html?id=${subProduct2.id}">
                                <div class="img-wrapper"><img src="${(subProduct2.images && subProduct2.images[0]) || ''}" alt="${subProduct2.name}"></div>
                                <div class="details"><p class="name">${subProduct2.name}</p>${getDiscount(subProduct2)}</div>
                            </a>
                            <div class="absolute bottom-2 right-2">${getAddButton(subProduct2)}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    section.style.display = 'block';
    if(poster.images && poster.images.length > 0) {
        initializeJfySlider(poster.images.length);
    }
}

function renderHighlightedProducts() {
    const wrapper = document.getElementById('highlighted-products-wrapper');
    const section = document.getElementById('highlighted-products-section');
    const deals = getDealsOfTheDayProducts(18);
    if (!wrapper || deals.length === 0) { if(section) section.style.display = 'none'; return; }
    section.style.display = 'block';
    wrapper.innerHTML = deals.map(p => createProductCardHTML(p, 'grid-item')).join('');
}

function renderSearch(searchData) { if (!searchData || !searchData.scrollingTexts || searchData.scrollingTexts.length === 0) return; const texts = searchData.scrollingTexts; let i = 0; const el = document.getElementById("categoryText"); if (window.searchInterval) clearInterval(window.searchInterval); window.searchInterval = setInterval(() => { if (el) { el.style.opacity = 0; setTimeout(() => { el.innerText = texts[i]; el.style.opacity = 1; i = (i + 1) % texts.length; }, 300); } }, 2500); }
function renderInfoMarquee(text) { const section = document.getElementById('info-marquee-section'); if (!text) { if(section) section.style.display = 'none'; return; } section.style.display = 'block'; section.querySelector('#info-marquee-text').innerHTML = text; }
function renderFlipCardSection(data) { const section = document.getElementById('flipcard-section'); const content = document.getElementById('flip-card-inner-content'); if (!data || !data.front || !data.back) { if(section) section.style.display = 'none'; return; } section.style.display = 'block'; content.innerHTML = `<a href="${data.front.linkUrl||'#'}" target="_blank" class="flip-card-front"><img src="${data.front.imageUrl}" loading="lazy"></a><a href="${data.back.linkUrl||'#'}" target="_blank" class="flip-card-back"><img src="${data.back.imageUrl}" loading="lazy"></a>`; content.classList.add('flipping');}
function renderFooter(data) { if (!data) return; document.getElementById('footer-shop-link').href = './order.html'; document.getElementById('footer-play-link').href = data.playLink || '#'; document.getElementById('footer-profile-link').href = data.profileLink || '#'; const links = data.followLinks; if (links) { const mobileContainer = document.getElementById('social-links-container'); const desktopContainer = document.getElementById('desktop-social-links'); mobileContainer.innerHTML = ''; desktopContainer.innerHTML = ''; const platforms = { youtube: { icon: 'https://www.svgrepo.com/show/416500/youtube-circle-logo.svg', color: '#FF1111' }, instagram: { icon: 'https://www.svgrepo.com/show/452229/instagram-1.svg', color: '#E4405F' }, facebook: { icon: 'https://www.svgrepo.com/show/448224/facebook.svg', color: '#1877F2' }, whatsapp: { icon: 'https://www.svgrepo.com/show/452133/whatsapp.svg', color: '#25D366' } }; Object.keys(platforms).forEach(key => { if (links[key]) { const p = platforms[key]; mobileContainer.innerHTML += `<a href="${links[key]}" target="_blank" class="social-link" style="background-color:${p.color};"><img src="${p.icon}" alt="${key}"></a>`; desktopContainer.innerHTML += `<a href="${links[key]}" target="_blank"><img src="${p.icon}" class="w-7 h-7" alt="${key}"></a>`; } }); } }

// --- SLIDER LOGIC (UPDATED WITH A SIMPLER, MORE RELIABLE SWIPE FEATURE) ---
let currentSlide = 1, totalSlides = 0, sliderInterval, isTransitioning = false;
function initializeSlider(count) {
    const slider = document.getElementById("main-slider");
    const dots = document.getElementById("slider-dots-container");
    totalSlides = count;

    if (totalSlides <= 1) {
        if (dots) dots.style.display = "none";
        return;
    }

    slider.appendChild(slider.children[0].cloneNode(true));
    slider.insertBefore(slider.children[totalSlides - 1].cloneNode(true), slider.children[0]);
    slider.style.transform = `translateX(-${100 * currentSlide}%)`;

    dots.innerHTML = "";
    for (let i = 0; i < totalSlides; i++) {
        dots.innerHTML += `<div class="dot" data-slide="${i + 1}"><div class="timer"></div></div>`;
    }
    dots.addEventListener("click", e => {
        const dot = e.target.closest(".dot");
        if (dot) goToSlide(parseInt(dot.dataset.slide));
    });

    // --- NEW, SIMPLIFIED SWIPE LOGIC ---
    let startPos = 0;
    const swipeThreshold = 50; // Min pixels to count as a swipe

    const getPositionX = event => event.type.includes("mouse") ? event.pageX : event.touches[0].clientX;

    const swipeStart = e => {
        startPos = getPositionX(e);
        clearInterval(sliderInterval); // Pause autoplay
    };

    const swipeEnd = e => {
        // For touchend, we need to get the position from changedTouches
        const endPos = e.type.includes("touch") ? e.changedTouches[0].clientX : e.pageX;
        const deltaX = endPos - startPos;

        if (Math.abs(deltaX) > swipeThreshold) {
            if (deltaX < 0) {
                moveSlide(1); // Swiped left
            } else {
                moveSlide(-1); // Swiped right
            }
        }
        resetSliderInterval(); // Always resume autoplay
    };

    slider.addEventListener("mousedown", swipeStart);
    slider.addEventListener("touchstart", swipeStart, { passive: true });
    slider.addEventListener("mouseup", swipeEnd);
    slider.addEventListener("touchend", swipeEnd);
    // --- END OF NEW SWIPE LOGIC ---

    slider.addEventListener("transitionend", () => {
        isTransitioning = false;
        if (currentSlide === 0) {
            slider.classList.remove("transitioning");
            currentSlide = totalSlides;
            slider.style.transform = `translateX(-${100 * currentSlide}%)`;
        }
        if (currentSlide === totalSlides + 1) {
            slider.classList.remove("transitioning");
            currentSlide = 1;
            slider.style.transform = `translateX(-${100 * currentSlide}%)`;
        }
    });

    updateDots();
    resetSliderInterval();
}

function moveSlide(dir) {
    if (isTransitioning) return;
    isTransitioning = true;
    const slider = document.getElementById("main-slider");
    slider.classList.add("transitioning");
    currentSlide += dir;
    slider.style.transform = `translateX(-${100 * currentSlide}%)`;
    updateDots();
}

function goToSlide(num) {
    if (isTransitioning || currentSlide === num) return;
    isTransitioning = true;
    const slider = document.getElementById("main-slider");
    slider.classList.add("transitioning");
    currentSlide = num;
    slider.style.transform = `translateX(-${100 * currentSlide}%)`;
    updateDots();
    resetSliderInterval();
}

function updateDots() {
    const dots = document.querySelectorAll(".slider-dots .dot");
    dots.forEach(d => {
        d.classList.remove("active");
        const timer = d.querySelector(".timer");
        if (timer) {
            timer.style.transition = "none";
            timer.style.width = "0%";
        }
    });

    let activeDotIndex = currentSlide - 1;
    if (currentSlide === 0) activeDotIndex = totalSlides - 1;
    if (currentSlide === totalSlides + 1) activeDotIndex = 0;

    const activeDot = dots[activeDotIndex];
    if (activeDot) {
        activeDot.classList.add("active");
        const timer = activeDot.querySelector(".timer");
        if (timer) {
            void timer.offsetWidth;
            timer.style.transition = "width 5000ms linear";
            timer.style.width = "100%";
        }
    }
}

function resetSliderInterval() {
    clearInterval(sliderInterval);
    sliderInterval = setInterval(() => moveSlide(1), 5000);
}


// --- JFY SLIDER LOGIC (UNCHANGED) ---
let jfyCurrentSlide=1,jfyTotalSlides=0,jfySliderInterval,jfyIsTransitioning=!1;function initializeJfySlider(count){const slider=document.querySelector(".jfy-poster-slider"),dots=document.querySelector(".jfy-slider-dots");if(!slider)return;if((jfyTotalSlides=count)<=1)return void(dots&&(dots.style.display="none"));slider.appendChild(slider.children[0].cloneNode(!0)),slider.insertBefore(slider.children[jfyTotalSlides-1].cloneNode(!0),slider.children[0]),slider.style.transform=`translateX(-${100*jfyCurrentSlide}%)`,slider.addEventListener("transitionend",()=>{jfyIsTransitioning=!1,0===jfyCurrentSlide&&(slider.classList.remove("transitioning"),jfyCurrentSlide=jfyTotalSlides,slider.style.transform=`translateX(-${100*jfyCurrentSlide}%)`),jfyCurrentSlide===jfyTotalSlides+1&&(slider.classList.remove("transitioning"),jfyCurrentSlide=1,slider.style.transform=`translateX(-${100*jfyCurrentSlide}%)`)}),dots.innerHTML="";for(let i=0;i<jfyTotalSlides;i++)dots.innerHTML+='<div class="dot" data-slide="'.concat(i+1,'"></div>');dots.addEventListener("click",e=>{e.target.closest(".dot")&&goToJfySlide(e.target.closest(".dot").dataset.slide)}),updateJfyDots(),resetJfySliderInterval()}function moveJfySlide(dir){if(jfyIsTransitioning)return;const slider=document.querySelector(".jfy-poster-slider");slider&&(jfyIsTransitioning=!0,slider.classList.add("transitioning"),jfyCurrentSlide+=dir,slider.style.transform=`translateX(-${100*jfyCurrentSlide}%)`,updateJfyDots(),resetJfySliderInterval())}function goToJfySlide(num){if(jfyIsTransitioning||jfyCurrentSlide==num)return;const slider=document.querySelector(".jfy-poster-slider");slider&&(jfyIsTransitioning=!0,slider.classList.add("transitioning"),jfyCurrentSlide=parseInt(num),slider.style.transform=`translateX(-${100*jfyCurrentSlide}%)`,updateJfyDots(),resetJfySliderInterval())}function updateJfyDots(){const dots=document.querySelectorAll(".jfy-slider-dots .dot");dots.forEach(d=>d.classList.remove("active"));let activeDotIndex=jfyCurrentSlide-1;0===jfyCurrentSlide&&(activeDotIndex=jfyTotalSlides-1),jfyCurrentSlide===jfyTotalSlides+1&&(activeDotIndex=0);const activeDot=dots[activeDotIndex];activeDot&&activeDot.classList.add("active")}function resetJfySliderInterval(){clearInterval(jfySliderInterval),jfySliderInterval=setInterval(()=>moveJfySlide(1),4e3)}

