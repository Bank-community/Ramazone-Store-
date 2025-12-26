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
const targetMobile = urlParams.get('shop') || (session ? session.mobile : null);

if (!targetMobile) window.location.href = 'index.html'; 

const isOwner = session && session.mobile === targetMobile;
const CACHE_KEY = `rmz_products_${targetMobile}`;

let editMode = false;
let deleteMode = false;
let editItemId = null;
let itemsToDelete = new Set();
let allProducts = [];
let historyData = {};

// Slider Variables
let slides = [];
let slideIndex = 1; // Start from 1 because 0 is a clone
let slideInterval;
let isTransitioning = false;

// --- INITIALIZATION ---
window.onload = () => {
    setupUI();
    loadShopData();
    loadProfile();
    updateCartBadge();
    
    // Core Features
    initSeamlessSlider();
    calculateStats();
    loadLocalProducts(); // Show cached data first
    syncProducts(); // Sync live data in background
};

// --- UTILS ---
function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    t.classList.remove('opacity-0', 'pointer-events-none');
    t.style.transform = "translate(-50%, 0)";
    setTimeout(() => { t.classList.add('opacity-0', 'pointer-events-none'); t.style.transform = "translate(-50%, -10px)"; }, 2000);
}

function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('menuOverlay').classList.toggle('open'); }
function logout() { localStorage.removeItem('rmz_user'); window.location.href='index.html'; }

// --- UI SETUP ---
function setupUI() {
    if (isOwner) {
        document.getElementById('ownerControls').classList.remove('hidden');
        document.getElementById('fabAddStock').classList.remove('hidden');
        document.getElementById('logoUploadBtn').classList.remove('hidden');
        document.getElementById('menuName').innerText = session.name || 'Owner';
        document.getElementById('menuMobile').innerText = '+91 ' + session.mobile;
        
        // Owner Specific Menu
        document.getElementById('sidebarNav').innerHTML = `
            <button onclick="openAddModal()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-box text-indigo-500 w-5"></i> Add Stock
            </button>
            <button onclick="document.getElementById('bannerModal').classList.remove('hidden'); toggleMenu();" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-paintbrush text-pink-500 w-5"></i> My Banner Settings
            </button>
            <button onclick="openHistory()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-clock-rotate-left text-blue-500 w-5"></i> Order History
            </button>
            <div class="h-px bg-slate-100 my-2"></div>
            <button onclick="changeShopName()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-pen-nib text-slate-400 w-5"></i> Change Shop Name
            </button>
            <button onclick="openAddressModal()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-location-dot text-slate-400 w-5"></i> Update Address
            </button>
            <button onclick="changePin()" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-key text-slate-400 w-5"></i> Change PIN
            </button>
            <div class="h-px bg-slate-100 my-2"></div>
            <button onclick="logout()" class="w-full text-left px-4 py-3 rounded hover:bg-red-50 text-red-500 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-power-off w-5"></i> Logout
            </button>
        `;
    } else {
        // Guest Menu
        document.getElementById('sidebarNav').innerHTML = `
            <button onclick="window.location.href='index.html'" class="w-full text-left px-4 py-3 rounded hover:bg-slate-50 text-slate-700 font-bold text-sm flex items-center gap-3">
                <i class="fa-solid fa-store text-indigo-500 w-5"></i> Create My Own Store
            </button>
        `;
    }
}

// --- SEAMLESS SLIDER LOGIC ---
function initSeamlessSlider() {
    slides = [];
    // Fetch Banners
    db.ref(`users/${targetMobile}/banner`).once('value', uSnap => {
        if(uSnap.exists()) {
            const b = uSnap.val();
            slides.push({ type: 'user', text: b.text || 'Welcome', color: b.color || '#3b82f6', bold: b.bold || false });
        }
        
        db.ref('admin/sliders').once('value', aSnap => {
            if(aSnap.exists()) {
                Object.values(aSnap.val()).forEach(s => slides.push({ type: 'admin', img: s.img, link: s.link || '#' }));
            }
            if(slides.length === 0) slides.push({type: 'user', text: 'Welcome', color: '#1e293b'});
            renderSeamlessSlider();
        });
    });
}

function renderSeamlessSlider() {
    const track = document.getElementById('sliderTrack');
    const dotsContainer = document.getElementById('dotsContainer');
    
    // Create Clones for Seamless Effect (First slide at end, Last slide at beginning)
    const firstClone = slides[0];
    const lastClone = slides[slides.length - 1];
    
    const allSlides = [lastClone, ...slides, firstClone];
    
    track.innerHTML = '';
    dotsContainer.innerHTML = '';
    
    // Render All Slides (including clones)
    allSlides.forEach(s => {
        const div = document.createElement('div');
        div.className = "slide";
        div.style.width = "100%"; // Ensure full width
        if(s.type === 'user') {
            div.style.backgroundColor = s.color;
            div.innerHTML = `<span class="px-8 text-white text-xl md:text-2xl ${s.bold ? 'font-extrabold' : 'font-medium'}">${s.text}</span>`;
        } else {
            div.innerHTML = `<img src="${s.img}" class="w-full h-full object-cover" onclick="window.location.href='${s.link}'">`;
        }
        track.appendChild(div);
    });

    // Render Dots (Only for actual slides)
    slides.forEach((_, idx) => {
        const dot = document.createElement('div');
        dot.className = `slider-dot ${idx === 0 ? 'active' : ''}`;
        dotsContainer.appendChild(dot);
    });

    // Set initial position (show first real slide, not clone)
    track.style.transform = `translateX(-100%)`; 

    // Auto Slide
    startSeamlessInterval();
    
    // Transition End Listener (The Magic Trick)
    track.addEventListener('transitionend', () => {
        isTransitioning = false;
        if (slideIndex >= slides.length + 1) {
            track.style.transition = 'none';
            slideIndex = 1;
            track.style.transform = `translateX(-${slideIndex * 100}%)`;
        }
        if (slideIndex <= 0) {
            track.style.transition = 'none';
            slideIndex = slides.length;
            track.style.transform = `translateX(-${slideIndex * 100}%)`;
        }
    });

    // Touch Support
    const container = document.getElementById('sliderContainer');
    let startX = 0;
    container.addEventListener('touchstart', e => { startX = e.touches[0].clientX; clearInterval(slideInterval); });
    container.addEventListener('touchend', e => {
        const endX = e.changedTouches[0].clientX;
        if (startX - endX > 50) nextSeamlessSlide();
        if (endX - startX > 50) prevSeamlessSlide();
        startSeamlessInterval();
    });
}

function nextSeamlessSlide() {
    if (isTransitioning) return;
    const track = document.getElementById('sliderTrack');
    isTransitioning = true;
    slideIndex++;
    track.style.transition = 'transform 0.5s ease-in-out';
    track.style.transform = `translateX(-${slideIndex * 100}%)`;
    updateSeamlessDots();
}

function prevSeamlessSlide() {
    if (isTransitioning) return;
    const track = document.getElementById('sliderTrack');
    isTransitioning = true;
    slideIndex--;
    track.style.transition = 'transform 0.5s ease-in-out';
    track.style.transform = `translateX(-${slideIndex * 100}%)`;
    updateSeamlessDots();
}

function updateSeamlessDots() {
    // Map internal index to visual dot index
    let dotIndex = slideIndex - 1;
    if (dotIndex < 0) dotIndex = slides.length - 1;
    if (dotIndex >= slides.length) dotIndex = 0;

    const dots = document.querySelectorAll('.slider-dot');
    dots.forEach((d, i) => {
        if(i === dotIndex) d.classList.add('active');
        else d.classList.remove('active');
    });
}

function startSeamlessInterval() {
    clearInterval(slideInterval);
    slideInterval = setInterval(nextSeamlessSlide, 3000);
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

// --- PRODUCTS LOGIC (WITH LOCAL STORAGE CACHING) ---
function loadLocalProducts() {
    const cached = localStorage.getItem(CACHE_KEY);
    if(cached) { 
        allProducts = JSON.parse(cached); 
        document.getElementById('statProductCount').innerText = allProducts.length;
        renderList(); 
        // console.log("Loaded from Cache");
    }
}

function syncProducts() {
    // This updates the cache and UI seamlessly
    db.ref('products/' + targetMobile).on('value', snapshot => {
        if(snapshot.exists()) {
            allProducts = Object.entries(snapshot.val()).reverse();
            // Save to Local Storage
            localStorage.setItem(CACHE_KEY, JSON.stringify(allProducts));
            
            document.getElementById('statProductCount').innerText = allProducts.length;
            renderList();
        } else {
            allProducts = [];
            localStorage.removeItem(CACHE_KEY);
            document.getElementById('statProductCount').innerText = "0";
            renderList();
        }
    });
}

function renderList() {
    const list = document.getElementById('productList');
    list.innerHTML = '';
    
    if(allProducts.length === 0) {
        list.innerHTML = `<div class="p-8 text-center opacity-50"><p class="text-xs">Shelf Empty</p></div>`;
        return;
    }

    allProducts.forEach(([id, item]) => {
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
            li.onclick = () => openAddModal(id, item.name, item.qty);
            li.classList.add('cursor-pointer');
        } else {
            rightAction = `<button onclick="addToCartLocal('${item.name}', '${item.qty}')" class="w-8 h-8 rounded bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-900 hover:text-white transition active:scale-90"><i class="fa-solid fa-plus text-xs"></i></button>`;
        }

        li.innerHTML = `${leftContent} ${rightAction}`;
        list.appendChild(li);
    });
}

// --- ADD/EDIT STOCK MODAL ---
function openAddModal(id = null, name = '', qty = '') {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('menuOverlay').classList.remove('open');
    
    const modal = document.getElementById('addStockModal');
    const card = document.getElementById('addStockCard');
    const title = document.getElementById('modalTitle');
    
    modal.classList.remove('hidden');
    setTimeout(() => card.classList.remove('translate-y-full'), 10);

    if(id) {
        editItemId = id;
        document.getElementById('inpProdName').value = name;
        document.getElementById('inpProdQty').value = qty;
        title.innerText = "Edit Item";
    } else {
        editItemId = null;
        document.getElementById('inpProdName').value = '';
        document.getElementById('inpProdQty').value = '';
        title.innerText = "Add Stock";
    }
}

function closeAddModal() {
    const card = document.getElementById('addStockCard');
    card.classList.add('translate-y-full');
    setTimeout(() => document.getElementById('addStockModal').classList.add('hidden'), 300);
}

function saveProduct() {
    const name = document.getElementById('inpProdName').value.trim();
    const qty = document.getElementById('inpProdQty').value.trim();
    if(!name) return showToast("Enter Name");

    if(editItemId) {
        db.ref(`products/${targetMobile}/${editItemId}`).update({ name, qty })
        .then(() => { showToast("Updated"); closeAddModal(); toggleEditMode(); });
    } else {
        db.ref(`products/${targetMobile}`).push({ name, qty: qty || '1 Unit', addedAt: firebase.database.ServerValue.TIMESTAMP })
        .then(() => { showToast("Added"); closeAddModal(); });
    }
}

// --- BANNER SETTINGS ---
function setBanColor(c) {
    document.getElementById('selectedColor').value = c;
    document.getElementById('banText').style.borderColor = c;
    showToast("Color Selected");
}

function saveBannerSettings() {
    const text = document.getElementById('banText').value;
    const color = document.getElementById('selectedColor').value;
    const bold = document.getElementById('banBold').checked;
    
    if(!text) return showToast("Enter Text");

    db.ref(`users/${targetMobile}/banner`).set({text, color, bold})
    .then(() => {
        showToast("Banner Updated");
        document.getElementById('bannerModal').classList.add('hidden');
        setTimeout(() => window.location.reload(), 1000);
    });
}

// --- GLOBAL ACTIONS ---
function toggleEditMode() {
    if(!isOwner) return;
    if(deleteMode) toggleDeleteMode();
    editMode = !editMode;
    const btn = document.getElementById('globalEditBtn');
    if(editMode) { btn.classList.add('bg-indigo-100', 'text-indigo-600'); showToast("Tap item to Edit"); } 
    else { btn.classList.remove('bg-indigo-100', 'text-indigo-600'); }
    renderList();
}

function toggleDeleteMode() {
    if(!isOwner) return;
    if(editMode) toggleEditMode();
    deleteMode = !deleteMode;
    const btn = document.getElementById('globalDeleteBtn');
    const bar = document.getElementById('bulkDeleteBar');
    if(deleteMode) { btn.classList.add('bg-red-100', 'text-red-600'); bar.classList.remove('hidden'); showToast("Select items"); } 
    else { btn.classList.remove('bg-red-100', 'text-red-600'); bar.classList.add('hidden'); itemsToDelete.clear(); }
    renderList();
}

function toggleCheck(id) { if(itemsToDelete.has(id)) itemsToDelete.delete(id); else itemsToDelete.add(id); renderList(); }

function deleteSelectedItems() {
    if(itemsToDelete.size === 0) return showToast("No items selected");
    if(confirm(`Delete ${itemsToDelete.size} items?`)) {
        itemsToDelete.forEach(id => db.ref(`products/${targetMobile}/${id}`).remove());
        toggleDeleteMode();
        showToast("Deleted");
    }
}

function shareStore() {
    const url = `${window.location.origin}${window.location.pathname}?shop=${targetMobile}`;
    const text = `Check out ${document.getElementById('headerShopName').innerText} on Ramazone!\nOrder here: ${url}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
}

// --- CART LOGIC ---
function addToCartLocal(name, qty) { let cart = JSON.parse(localStorage.getItem('rmz_cart')) || []; const exists = cart.find(i => i.name === name && i.qty === qty); if(exists) exists.count = (exists.count || 1) + 1; else cart.push({ name, qty, count: 1 }); localStorage.setItem('rmz_cart', JSON.stringify(cart)); updateCartBadge(); showToast("Added to Bill"); }

function updateCartBadge() { const c = JSON.parse(localStorage.getItem('rmz_cart')) || []; const b = document.getElementById('floatCartBadge'); const h = document.getElementById('headerBadge'); if(c.length > 0) { b.innerText = c.length; b.classList.remove('hidden'); h.classList.remove('hidden'); } else { b.classList.add('hidden'); h.classList.add('hidden'); } }

function loadShopData() {
    db.ref('users/' + targetMobile).on('value', s => {
        if(s.exists()) {
            const d = s.val();
            const shop = d.shopName || d.name + "'s Store";
            document.getElementById('headerShopName').innerText = shop;
        }
    });
}

// --- PROFILE & SETTINGS ---
function loadProfile() { db.ref('users/'+targetMobile+'/logo').once('value', s => { if(s.exists()) document.getElementById('profileImg').src = s.val(); }); }

function uploadCompressedLogo() { if(!isOwner) return; const f = document.getElementById('logoInput').files[0]; if(f) { const r = new FileReader(); r.readAsDataURL(f); r.onload = e => { const i = new Image(); i.src = e.target.result; i.onload = () => { const c = document.createElement('canvas'); const x = c.getContext('2d'); const w = 300; const sc = w/i.width; c.width=w; c.height=i.height*sc; x.drawImage(i,0,0,c.width,c.height); const d = c.toDataURL('image/jpeg', 0.7); document.getElementById('profileImg').src=d; db.ref('users/'+targetMobile).update({logo:d}).then(()=>showToast("Logo Updated")); }}}}

function openAddressModal() { toggleMenu(); document.getElementById('addressModal').classList.remove('hidden'); db.ref('users/'+targetMobile+'/address').once('value', s => { if(s.exists()) document.getElementById('updateAddrText').value = s.val(); }); }
function closeAddressModal() { document.getElementById('addressModal').classList.add('hidden'); }
function saveAddress() { const val = document.getElementById('updateAddrText').value; db.ref('users/'+targetMobile).update({address:val}).then(()=>{ showToast("Address Saved"); closeAddressModal(); }); }
function changePin() { toggleMenu(); const p = prompt("New PIN:"); if(p && p.length===4) db.ref('users/'+targetMobile).update({pin:p}); }
function changeShopName() { toggleMenu(); const n = prompt("Enter New Shop Name:"); if(n) db.ref('users/'+targetMobile).update({shopName: n}).then(()=>showToast("Shop Name Updated")); }

// --- HISTORY & INVOICE ---
function openHistory() {
    toggleMenu();
    const list = document.getElementById('historyList');
    list.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    document.getElementById('historyModal').classList.remove('hidden');

    db.ref('orders').orderByChild('user/mobile').equalTo(targetMobile).once('value', s => {
        list.innerHTML = '';
        if(s.exists()) {
            const all = Object.values(s.val()).reverse().filter(o => o.status === 'delivered');
            if(all.length === 0) { list.innerHTML = '<div class="text-center p-8 text-slate-400">No delivered orders yet</div>'; return; }
            
            all.forEach(o => {
                historyData[o.orderId] = o;
                const div = document.createElement('div');
                div.className = "bg-white p-4 rounded-xl border border-slate-200 shadow-sm";
                div.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <h3 class="font-bold text-slate-800">Order #${o.orderId.slice(-6)}</h3>
                            <p class="text-xs text-slate-500">${new Date(o.timestamp).toLocaleDateString()}</p>
                        </div>
                        <span class="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded">DELIVERED</span>
                    </div>
                    <div class="text-xs text-slate-500 mb-3">
                        <p>Items: ${o.cart ? o.cart.length : 0}</p>
                        <p>Fee: ₹${o.payment.deliveryFee}</p>
                    </div>
                    <button onclick="openInvoice('${o.orderId}')" class="w-full bg-slate-900 text-white text-xs font-bold py-2.5 rounded-lg">DOWNLOAD INVOICE</button>
                `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = '<div class="text-center p-8 text-slate-400">No history found</div>';
        }
    });
}

function closeHistory() { document.getElementById('historyModal').classList.add('hidden'); }

function openInvoice(oid) {
    const o = historyData[oid];
    if(!o) return;
    document.getElementById('invName').innerText = o.user.name;
    document.getElementById('invMobile').innerText = o.user.mobile;
    document.getElementById('invAddr').innerText = o.location.address;
    document.getElementById('invId').innerText = "#" + o.orderId.slice(-6);
    document.getElementById('invDate').innerText = new Date(o.timestamp).toLocaleDateString();
    document.getElementById('invFee').innerText = o.payment.deliveryFee;
    document.getElementById('invTotal').innerText = o.payment.deliveryFee;
    const tbody = document.getElementById('invItems');
    tbody.innerHTML = '';
    if(o.cart) { o.cart.forEach(i => { tbody.innerHTML += `<tr><td class="py-2 px-4 border-b border-slate-50"><p class="font-bold text-slate-800">${i.name}</p><p class="text-[10px] text-slate-400">${i.qty}</p></td><td class="py-2 px-4 border-b border-slate-50 text-right font-bold text-slate-700">x${i.count}</td></tr>`; }); }
    document.getElementById('invoiceModal').classList.remove('hidden');
}

