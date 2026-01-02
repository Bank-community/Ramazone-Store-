// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    databaseURL: "https://tipsplit-e3wes-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.firebasestorage.app",
    messagingSenderId: "984733883633",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- STATE MANAGEMENT ---
const session = JSON.parse(localStorage.getItem('rmz_user'));
const urlParams = new URLSearchParams(window.location.search);
// Default to session mobile if 'shop' param is missing (for owner view)
const targetMobile = urlParams.get('shop') || (session ? session.mobile : null);

// If no target shop and no session, go to login
if (!targetMobile) window.location.href = 'index.html'; 

const isOwner = session && session.mobile === targetMobile;
const CACHE_KEY = `rmz_products_${targetMobile}`;

// Global Variables
let editMode = false;
let deleteMode = false;
let editItemId = null;
let itemsToDelete = new Set();
let allProducts = [];
let filteredProducts = [];

// --- INITIALIZATION ---
window.onload = () => {
    // 1. UI & User Data
    setupUI();
    loadShopData();
    updateCartBadge();
    
    // 2. Core Content (Products)
    loadLocalProducts(); // Show cached first for speed
    syncProducts();      // Then fetch fresh from Firebase
    calculateStats();

    // 3. Feature Loading (Functions from home-features.js)
    // We check if functions exist to avoid errors if file is missing
    if (typeof loadProfile === 'function') loadProfile();
    if (typeof initSeamlessSlider === 'function') initSeamlessSlider();
    if (typeof checkActiveOrderHome === 'function') checkActiveOrderHome();
};

// --- UTILS ---
function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    t.classList.remove('opacity-0', 'pointer-events-none');
    t.style.transform = "translate(-50%, 0)";
    setTimeout(() => { 
        t.classList.add('opacity-0', 'pointer-events-none'); 
        t.style.transform = "translate(-50%, -10px)"; 
    }, 2000);
}

function toggleMenu() { 
    document.getElementById('sidebar').classList.toggle('open'); 
    document.getElementById('menuOverlay').classList.toggle('open'); 
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function logout() { 
    localStorage.removeItem('rmz_user'); 
    window.location.href='index.html'; 
}

// --- UI SETUP & NAVIGATION ---
function setupUI() {
    let menuHtml = '';

    // Common Top Items
    if (isOwner) {
        document.getElementById('ownerControls').classList.remove('hidden');
        document.getElementById('fabAddStock').classList.remove('hidden');
        document.getElementById('logoUploadBtn').classList.remove('hidden');
        document.getElementById('menuName').innerText = session.name || 'Owner';
        document.getElementById('menuMobile').innerText = '+91 ' + session.mobile;
        
        // Note: openAddModal, openHistory, etc. are in home-features.js
        menuHtml += `
            <button onclick="openAddModal()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-box text-indigo-500 w-5"></i> Add Product
            </button>
            <button onclick="openHistory()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-clock-rotate-left text-blue-500 w-5"></i> Order History
            </button>
            
            <div class="h-px bg-slate-100 my-2"></div>
            
            <button onclick="document.getElementById('profileMenuModal').classList.remove('hidden'); toggleMenu();" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-user-gear text-slate-500 w-5"></i> My Shop Profile
            </button>
        `;
    } else {
        // Guest Menu
        menuHtml += `
            <button onclick="window.location.href='index.html'" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-store text-indigo-500 w-5"></i> Create My Own Store
            </button>
        `;
    }

    // Common Bottom Items
    menuHtml += `
        <button onclick="openVideoHelp()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
            <i class="fa-brands fa-youtube text-red-500 w-5"></i> How to Use App
        </button>
        
        <button onclick="openSupportOptions()" class="w-full text-left px-4 py-3 rounded hover:bg-green-50 text-green-600 font-bold text-sm flex items-center gap-3">
            <i class="fa-brands fa-whatsapp w-5 text-xl"></i> Contact Support
        </button>
        
        <button onclick="openPolicies()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
            <i class="fa-solid fa-shield-halved text-slate-400 w-5"></i> Policies & Terms
        </button>

        <div class="h-px bg-slate-100 my-2"></div>
        <button onclick="logout()" class="w-full text-left px-4 py-3 rounded hover:bg-red-50 text-red-500 font-bold text-sm flex items-center gap-3">
            <i class="fa-solid fa-power-off w-5"></i> Logout
        </button>
    `;

    document.getElementById('sidebarNav').innerHTML = menuHtml;
}

function loadShopData() {
    db.ref('users/' + targetMobile).on('value', s => {
        if(s.exists()) {
            const d = s.val();
            const shop = d.shopName || d.name + "'s Store";
            document.getElementById('headerShopName').innerText = shop;
        }
    });
}

// --- STATS SYSTEM ---
function calculateStats() {
    if(isOwner) {
        db.ref('orders').orderByChild('user/mobile').equalTo(targetMobile).on('value', snap => {
            let todayCount = 0;
            if(snap.exists()) {
                const now = new Date();
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                Object.values(snap.val()).forEach(order => {
                    if(order.timestamp >= startOfDay) todayCount++;
                });
            }
            document.getElementById('statOrderCount').innerText = todayCount;
        });
    }
}

// --- PRODUCT LOADING ---
function loadLocalProducts() {
    const cached = localStorage.getItem(CACHE_KEY);
    if(cached) { 
        allProducts = JSON.parse(cached);
        filteredProducts = allProducts; 
        document.getElementById('statProductCount').innerText = allProducts.length;
        renderList(allProducts); 
    }
}

function syncProducts() {
    db.ref('products/' + targetMobile).on('value', snapshot => {
        if(snapshot.exists()) {
            allProducts = Object.entries(snapshot.val()).reverse();
            localStorage.setItem(CACHE_KEY, JSON.stringify(allProducts));
            
            document.getElementById('statProductCount').innerText = allProducts.length;
            
            // Keep search filter if active
            const query = document.getElementById('searchInput').value.toLowerCase();
            if(query) filterProducts(); 
            else {
                filteredProducts = allProducts;
                renderList(allProducts);
            }
        } else {
            allProducts = [];
            filteredProducts = [];
            localStorage.removeItem(CACHE_KEY);
            document.getElementById('statProductCount').innerText = "0";
            renderList([]);
        }
    });
}

function filterProducts() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    if (!query) {
        filteredProducts = allProducts;
    } else {
        filteredProducts = allProducts.filter(([id, item]) => 
            item.name.toLowerCase().includes(query)
        );
    }
    renderList(filteredProducts);
}

function renderList(products) {
    const list = document.getElementById('productList');
    list.innerHTML = '';
    
    if(products.length === 0) {
        list.innerHTML = `<div class="p-8 text-center opacity-50"><p class="text-xs">No items found</p></div>`;
        return;
    }

    products.forEach(([id, item]) => {
        const li = document.createElement('li');
        li.className = "bg-white border-b border-slate-50 p-4 flex items-center justify-between hover:bg-slate-50 transition-colors";
        
        let leftContent = `
            <div>
                <h4 class="font-bold text-slate-800 text-sm">${item.name}</h4>
                <p class="text-[11px] text-slate-400 font-bold uppercase mt-0.5">${item.qty}</p>
            </div>
        `;

        let rightAction = '';

        if (deleteMode && isOwner) {
            const isChecked = itemsToDelete.has(id);
            leftContent = `
                <div class="flex items-center gap-4 w-full" onclick="toggleCheck('${id}')">
                    <input type="checkbox" class="custom-check pointer-events-none" ${isChecked ? 'checked' : ''}>
                    <div>
                        <h4 class="font-bold text-slate-800 text-sm">${item.name}</h4>
                        <span class="text-xs text-slate-500 font-medium">${item.qty}</span>
                    </div>
                </div>
            `;
        } else if (editMode && isOwner) {
            rightAction = `<span class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">EDIT</span>`;
            // openAddModal is in home-features.js, but will be available when clicked
            li.onclick = () => openAddModal(id, item.name, item.qty);
            li.classList.add('cursor-pointer');
        } else {
            // Main 'Add' button
            rightAction = `<button onclick="addToCartLocal('${item.name}', '${item.qty}')" class="w-8 h-8 rounded bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-900 hover:text-white transition active:scale-90"><i class="fa-solid fa-plus text-xs"></i></button>`;
        }

        li.innerHTML = `${leftContent} ${rightAction}`;
        list.appendChild(li);
    });
}

// --- GLOBAL ACTIONS (Delete/Edit State) ---
function toggleEditMode() {
    if(!isOwner) return;
    if(deleteMode) toggleDeleteMode();
    editMode = !editMode;
    const btn = document.getElementById('globalEditBtn');
    if(editMode) { btn.classList.add('bg-indigo-100', 'text-indigo-600'); showToast("Tap item to Edit"); } 
    else { btn.classList.remove('bg-indigo-100', 'text-indigo-600'); }
    renderList(allProducts);
}

function toggleDeleteMode() {
    if(!isOwner) return;
    if(editMode) toggleEditMode();
    deleteMode = !deleteMode;
    const btn = document.getElementById('globalDeleteBtn');
    const bar = document.getElementById('bulkDeleteBar');
    if(deleteMode) { btn.classList.add('bg-red-100', 'text-red-600'); bar.classList.remove('hidden'); showToast("Select items"); } 
    else { btn.classList.remove('bg-red-100', 'text-red-600'); bar.classList.add('hidden'); itemsToDelete.clear(); }
    renderList(allProducts); 
}

function toggleCheck(id) { 
    if(itemsToDelete.has(id)) itemsToDelete.delete(id); 
    else itemsToDelete.add(id); 
    renderList(allProducts); 
}

function deleteSelectedItems() {
    if(itemsToDelete.size === 0) return showToast("No items selected");
    if(confirm(`Delete ${itemsToDelete.size} items?`)) {
        itemsToDelete.forEach(id => db.ref(`products/${targetMobile}/${id}`).remove());
        toggleDeleteMode();
        showToast("Deleted");
    }
}

// --- CART LOGIC ---
function addToCartLocal(name, qty) { 
    let cart = JSON.parse(localStorage.getItem('rmz_cart')) || []; 
    const exists = cart.find(i => i.name === name && i.qty === qty); 
    if(exists) exists.count = (exists.count || 1) + 1; 
    else cart.push({ name, qty, count: 1 }); 
    localStorage.setItem('rmz_cart', JSON.stringify(cart)); 
    updateCartBadge(); 
    showToast("Added to Bill"); 
}

function updateCartBadge() { 
    const c = JSON.parse(localStorage.getItem('rmz_cart')) || []; 
    const b = document.getElementById('floatCartBadge'); 
    const h = document.getElementById('headerBadge'); 
    if(c.length > 0) { 
        b.innerText = c.length; b.classList.remove('hidden'); h.classList.remove('hidden'); 
    } else { 
        b.classList.add('hidden'); h.classList.add('hidden'); 
    } 
}

// --- SEARCH BAR LOGIC ---
function activateSearch() {
    document.body.classList.add('search-mode');
    document.getElementById('headerControls').classList.add('hidden');
    document.getElementById('clearSearchBtn').classList.remove('hidden');
}

function deactivateSearch() {
    // Left empty to keep search open until 'X' is clicked
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    input.value = '';
    
    // Reset products
    filterProducts(); 
    
    // Reset UI
    document.body.classList.remove('search-mode');
    document.getElementById('headerControls').classList.remove('hidden');
    document.getElementById('clearSearchBtn').classList.add('hidden');
    
    input.blur(); 
}
