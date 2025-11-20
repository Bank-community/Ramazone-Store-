// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
    authDomain: "re-store-8e5b3.firebaseapp.com",
    databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "re-store-8e5b3",
};

let app, db;
let allBrandProducts = [];
let currentFilter = 'all';

// --- CART HELPER FUNCTIONS ---
const getCart = () => { try { return JSON.parse(localStorage.getItem('ramazoneCart')) || []; } catch (e) { return []; } };
const saveCart = (cart) => { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); updateCartBadgeUI(); };
const getTotalCartQuantity = () => { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); };

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (!firebase.apps.length) { app = firebase.initializeApp(firebaseConfig); } 
        else { app = firebase.app(); }
        db = firebase.database();
        loadBrandStore();
        updateCartBadgeUI();
    } catch (error) {
        console.error("Firebase Init Error:", error);
        showError("System Error. Please reload.");
    }
});

async function loadBrandStore() {
    const urlParams = new URLSearchParams(window.location.search);
    const brandName = urlParams.get('brand');

    if (brandName) {
        document.getElementById('store-title').textContent = brandName;
        document.title = `${brandName} Store`;
    } else {
        document.getElementById('store-title').textContent = "All Products";
    }

    try {
        const snapshot = await db.ref('ramazone/products').once('value');
        const data = snapshot.val();
        
        if (!data) { showEmptyState(); return; }

        const allProducts = Array.isArray(data) ? data : Object.values(data);
        
        if (brandName) {
            allBrandProducts = allProducts.filter(p => p && p.brand && p.brand.toLowerCase().trim() === brandName.toLowerCase().trim() && p.isVisible !== false);
        } else {
            allBrandProducts = allProducts.filter(p => p && p.isVisible !== false);
        }

        if (allBrandProducts.length > 0) {
            populateFilters(); // Generate Dynamic Filters
            renderProducts(allBrandProducts);
        } else {
            showEmptyState();
        }

    } catch (error) {
        console.error("Data Load Error:", error);
        showError("Could not load products.");
    }
}

// --- DYNAMIC FILTER GENERATION ---
function populateFilters() {
    const container = document.getElementById('filter-container');
    container.innerHTML = ''; // Clear existing

    // 1. "All" Button
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.textContent = 'All Items';
    allBtn.onclick = function() { filterItems('all', this); };
    container.appendChild(allBtn);

    // 2. Extract Unique Subcategories from loaded products
    const subcategories = [...new Set(allBrandProducts.map(p => p.subcategory).filter(Boolean))];
    
    subcategories.forEach(sub => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.textContent = sub;
        btn.onclick = function() { filterItems(sub, this); };
        container.appendChild(btn);
    });

    // 3. Sorting Options (Low/High Price)
    const sortLowBtn = document.createElement('button');
    sortLowBtn.className = 'filter-btn';
    sortLowBtn.innerHTML = 'Price: Low <i class="fas fa-arrow-right text-xs"></i> High';
    sortLowBtn.onclick = function() { filterItems('sort-low-high', this); };
    container.appendChild(sortLowBtn);

    const sortHighBtn = document.createElement('button');
    sortHighBtn.className = 'filter-btn';
    sortHighBtn.innerHTML = 'Price: High <i class="fas fa-arrow-right text-xs"></i> Low';
    sortHighBtn.onclick = function() { filterItems('sort-high-low', this); };
    container.appendChild(sortHighBtn);
}

function renderProducts(products) {
    const container = document.getElementById('products-container');
    const loader = document.getElementById('loading-indicator');
    const noMsg = document.getElementById('no-products-msg');
    
    container.innerHTML = '';
    
    if (products.length === 0) {
        container.classList.add('hidden');
        noMsg.classList.remove('hidden');
        loader.classList.add('hidden');
        return;
    }

    noMsg.classList.add('hidden');
    
    products.forEach(product => {
        const displayPrice = Number(product.displayPrice);
        const originalPrice = Number(product.originalPrice);
        let discount = 0;
        if (originalPrice > displayPrice) {
            discount = Math.round(((originalPrice - displayPrice) / originalPrice) * 100);
        }

        const imageSrc = product.images && product.images.length > 0 ? product.images[0] : 'https://placehold.co/300x300/f3f4f6/9ca3af?text=No+Image';
        const ratingVal = product.rating || 4.5; 

        const html = `
            <a href="product-details.html?id=${product.id}" class="product-card">
                <div class="card-image-wrapper">
                    <img src="${imageSrc}" alt="${product.name}" loading="lazy">
                    <div class="rating-pill"><i class="fas fa-star"></i> ${ratingVal}</div>
                    
                    <!-- SQUARE ADD BUTTON -->
                    <div class="square-add-btn" onclick="handleAddToCart(event, '${product.id}')">
                        <i class="fas fa-plus"></i>
                    </div>
                </div>
                <div class="card-details">
                    <h3 class="product-name">${product.name}</h3>
                    <div class="price-block">
                        <span class="final-price">₹${displayPrice.toLocaleString('en-IN')}</span>
                        ${originalPrice > displayPrice ? `<span class="original-price">₹${originalPrice}</span>` : ''}
                        ${discount > 0 ? `<span class="discount-tag">${discount}% OFF</span>` : ''}
                    </div>
                </div>
            </a>
        `;
        container.innerHTML += html;
    });

    loader.classList.add('hidden');
    container.classList.remove('hidden');
}

// --- FILTER & SORT LOGIC ---
function filterItems(criteria, btnElement) {
    // UI Update
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');
    btnElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    let filtered = [...allBrandProducts];

    if (criteria === 'all') {
        // Do nothing, show all
    } else if (criteria === 'sort-low-high') {
        filtered.sort((a, b) => Number(a.displayPrice) - Number(b.displayPrice));
    } else if (criteria === 'sort-high-low') {
        filtered.sort((a, b) => Number(b.displayPrice) - Number(a.displayPrice));
    } else {
        // It's a Subcategory filter
        filtered = filtered.filter(p => p.subcategory === criteria);
    }

    renderProducts(filtered);
}

// --- REAL CART LOGIC ---
function handleAddToCart(event, productId) {
    event.preventDefault();
    event.stopPropagation();
    
    const cart = getCart();
    const existingItemIndex = cart.findIndex(item => item.id === productId && !item.isBundle);
    
    if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += 1;
    } else {
        cart.push({ id: productId, quantity: 1, variants: {}, pack: null });
    }
    
    saveCart(cart);
    showToast("Item added to cart");
    
    // Visual Feedback
    const btn = event.currentTarget;
    btn.style.transform = "scale(0.9)";
    btn.classList.add('added');
    const icon = btn.querySelector('i');
    icon.className = "fas fa-check";
    
    setTimeout(() => { 
        btn.style.transform = "scale(1)"; 
        btn.classList.remove('added');
        icon.className = "fas fa-plus";
    }, 1000);
}

function updateCartBadgeUI() {
    const count = getTotalCartQuantity();
    const badge = document.getElementById('cart-count-badge');
    badge.innerText = count;
    if (count > 0) badge.classList.add('visible');
    else badge.classList.remove('visible');
}

function showToast(msg) {
    const toast = document.getElementById('toast-notification');
    toast.querySelector('span').textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function showEmptyState() {
    document.getElementById('loading-indicator').classList.add('hidden');
    document.getElementById('no-products-msg').classList.remove('hidden');
}

function showError(msg) {
    document.getElementById('loading-indicator').innerHTML = `<p class="text-red-500 font-semibold">${msg}</p>`;
}

