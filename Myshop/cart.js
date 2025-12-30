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

// --- STATE ---
const session = JSON.parse(localStorage.getItem('rmz_user'));
if (!session || !session.isLoggedIn) window.location.href = 'index.html';

let currentStep = 1;
let selectedCharge = 0;
let selectedLabel = "";
let selectedBudget = "standard";
// Default set to Evening to match HTML
let selectedTime = "Evening"; 
let selectedAddress = null;
let tempGeoData = null;

// --- INITIALIZATION ---
window.onload = () => {
    checkActiveOrder();
    renderCart();
    
    // UI Defaults
    highlightBudget('standard');
    
    // FORCE UPDATE TIME UI ON LOAD (Silent Mode)
    // Yeh line ensure karegi ki text "Standard" na dikhe balki "Evening" dikhe
    updateTimeUI('Evening', false); 
    
    // Auto-Location Logic
    initLocationLogic();
};

function initLocationLogic() {
    const savedDef = localStorage.getItem('rmz_def_addr');
    if (savedDef) {
        loadSavedAddresses();
    } else {
        db.ref('users/' + session.mobile + '/savedAddresses').once('value', snap => {
            if (snap.exists()) {
                loadSavedAddresses();
            } else {
                console.log("No saved address found. Triggering Auto GPS...");
                loadSavedAddresses(); 
                selectLiveLocation(); 
            }
        });
    }
}

// --- ONE ORDER POLICY CHECK ---
function checkActiveOrder() {
    const savedOrder = JSON.parse(localStorage.getItem('rmz_active_order'));
    if (savedOrder) {
        let ts = savedOrder.timestamp;
        if (typeof ts === 'object') ts = Date.now();
        const orderDate = new Date(ts);
        const today = new Date();
        const isSameDay = orderDate.getDate() === today.getDate() && 
                          orderDate.getMonth() === today.getMonth() && 
                          orderDate.getFullYear() === today.getFullYear();

        if (isSameDay && savedOrder.status !== 'delivered' && savedOrder.status !== 'cancelled') {
            disablePlaceOrderButton();
        } else {
            localStorage.removeItem('rmz_active_order');
        }
    }
}

function disablePlaceOrderButton() {
    const btn = document.getElementById('btnStep2');
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="flex flex-col items-center leading-tight"><span class="text-xs opacity-75">ORDER ACTIVE</span><span class="text-[10px] font-normal">Please wait...</span></div>`;
        btn.classList.add('bg-slate-400');
        btn.classList.remove('bg-green-600');
    }
}

// --- STEP NAVIGATION ---
function goToDetails() {
    const cart = getCart();
    if (cart.length === 0) return showToast("Cart is empty");
    
    currentStep = 2;
    document.getElementById('step1_cart').classList.add('hidden-step');
    document.getElementById('btnStep1').classList.add('hidden');
    
    document.getElementById('step2_details').classList.remove('hidden-step');
    document.getElementById('btnStep2').classList.remove('hidden');
    
    document.getElementById('pageTitle').innerText = "Delivery Details";
    document.getElementById('pageSub').innerText = "Final Step";
    
    window.scrollTo(0, 0);
}

function handleBack() {
    if (currentStep === 2) {
        currentStep = 1;
        document.getElementById('step2_details').classList.add('hidden-step');
        document.getElementById('btnStep2').classList.add('hidden');
        
        document.getElementById('step1_cart').classList.remove('hidden-step');
        document.getElementById('btnStep1').classList.remove('hidden');
        
        document.getElementById('pageTitle').innerText = "My Cart";
        document.getElementById('pageSub').innerText = "Review Items";
    } else {
        window.location.href = 'home.html';
    }
}

// --- CART LOGIC ---
function getCart() { return JSON.parse(localStorage.getItem('rmz_cart')) || []; }
function saveCart(c) { localStorage.setItem('rmz_cart', JSON.stringify(c)); }

function renderCart() {
    const cart = getCart();
    const list = document.getElementById('cartList');
    document.getElementById('itemCountBadge').innerText = `${cart.length} Items`;
    list.innerHTML = '';

    if (cart.length === 0) {
        document.getElementById('cartEmptyState').classList.remove('hidden');
        document.getElementById('bottomBar').classList.add('hidden');
        return;
    }
    document.getElementById('cartEmptyState').classList.add('hidden');
    document.getElementById('bottomBar').classList.remove('hidden');

    cart.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-4";
        div.innerHTML = `
            <div>
                <h4 class="font-bold text-slate-800 text-sm">${item.name}</h4>
                <p class="text-[11px] text-slate-400 font-bold uppercase mt-0.5">${item.qty}</p>
            </div>
            <div class="flex items-center gap-3 bg-slate-50 rounded-lg p-1 border border-slate-200">
                <button onclick="updateQty(${idx}, -1)" class="qty-btn bg-white text-slate-600 shadow-sm hover:text-red-500"><i class="fa-solid fa-minus text-[10px]"></i></button>
                <span class="text-xs font-bold text-slate-800 w-4 text-center">${item.count || 1}</span>
                <button onclick="updateQty(${idx}, 1)" class="qty-btn bg-slate-800 text-white shadow-md hover:bg-black"><i class="fa-solid fa-plus text-[10px]"></i></button>
            </div>
        `;
        list.appendChild(div);
    });
    
    calculateWeight(cart);
}

function updateQty(idx, change) {
    const cart = getCart();
    const item = cart[idx];
    if (!item.count) item.count = 1;
    const newCount = item.count + change;
    
    if (newCount < 1) {
        if(confirm(`Remove ${item.name}?`)) cart.splice(idx, 1);
        else return;
    } else {
        item.count = newCount;
    }
    saveCart(cart);
    renderCart();
}

// --- SMART LOCATION LOGIC ---
function openLocationModal() {
    document.getElementById('locationModal').classList.remove('hidden');
    loadSavedAddresses();
}
function closeLocationModal() {
    document.getElementById('locationModal').classList.add('hidden');
    cancelAddAddr();
}

function loadSavedAddresses() {
    const list = document.getElementById('addressList');
    list.innerHTML = '';
    
    list.innerHTML += `
        <div onclick="selectLiveLocation()" class="addr-card ${!selectedAddress || selectedAddress.type === 'live' ? 'selected' : ''} bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-3 cursor-pointer hover:bg-slate-100">
            <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><i class="fa-solid fa-crosshairs"></i></div>
            <div><h4 class="font-bold text-sm text-slate-800">Live GPS Location</h4><p class="text-xs text-slate-500">Detect current position</p></div>
        </div>
    `;

    db.ref('users/' + session.mobile + '/savedAddresses').once('value', snap => {
        let count = 0;
        const savedDefaultKey = localStorage.getItem('rmz_def_addr');

        if(snap.exists()) {
            const addrs = snap.val();
            Object.entries(addrs).forEach(([key, addr]) => {
                count++;
                const isDefault = savedDefaultKey === key;
                if(isDefault && !selectedAddress) {
                    selectSavedAddress(key, addr.title, addr.text, addr.lat, addr.lng);
                }

                const isSel = selectedAddress && selectedAddress.key === key;
                const defBadge = isDefault ? '<i class="fa-solid fa-star text-amber-400 text-xs ml-1"></i>' : '';

                list.innerHTML += `
                    <div class="addr-card ${isSel ? 'selected' : ''} bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center cursor-pointer hover:bg-slate-100 group">
                        <div class="flex items-center gap-3" onclick="selectSavedAddress('${key}', '${addr.title}', '${addr.text}', ${addr.lat}, ${addr.lng})">
                            <div class="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center"><i class="fa-solid fa-house"></i></div>
                            <div>
                                <h4 class="font-bold text-sm text-slate-800">${addr.title} ${defBadge}</h4>
                                <p class="text-xs text-slate-500 line-clamp-1">${addr.text}</p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            ${!isDefault ? `<button onclick="setDefault('${key}')" class="text-slate-300 hover:text-amber-400 px-1" title="Set Default"><i class="fa-regular fa-star"></i></button>` : ''}
                            <button onclick="deleteAddress('${key}')" class="text-slate-300 hover:text-red-500 px-1"><i class="fa-solid fa-trash text-xs"></i></button>
                        </div>
                    </div>
                `;
            });
        }
        
        const btnAdd = document.getElementById('btnAddLocation');
        if(count >= 3) btnAdd.classList.add('hidden');
        else btnAdd.classList.remove('hidden');
    });
}

function addNewLocation() {
    const btn = document.getElementById('btnAddLocation');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting GPS...';
    
    if("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async p => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            tempGeoData = { lat, lng };
            document.getElementById('detectedCoords').innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await res.json();
                document.getElementById('newAddrText').value = data.display_name || "";
            } catch(e) {}

            document.getElementById('addressList').classList.add('hidden');
            document.getElementById('btnAddLocation').classList.add('hidden');
            document.getElementById('addAddrForm').classList.remove('hidden');
            
        }, () => { showToast("GPS Permission Denied"); btn.innerHTML = 'Retry GPS'; });
    }
}

function saveNewAddress() {
    const title = document.getElementById('newAddrTitle').value.trim();
    const text = document.getElementById('newAddrText').value.trim();
    if(!title || !text || !tempGeoData) return showToast("Fill all details");
    
    const newAddr = { title, text, lat: tempGeoData.lat, lng: tempGeoData.lng };
    const newRef = db.ref('users/' + session.mobile + '/savedAddresses').push();
    newRef.set(newAddr).then(() => {
        localStorage.setItem('rmz_def_addr', newRef.key);
        showToast("Location Saved & Set as Default!");
        selectSavedAddress(newRef.key, title, text, tempGeoData.lat, tempGeoData.lng);
        cancelAddAddr();
    });
}

function cancelAddAddr() {
    document.getElementById('addAddrForm').classList.add('hidden');
    document.getElementById('addressList').classList.remove('hidden');
    document.getElementById('btnAddLocation').classList.remove('hidden');
    document.getElementById('btnAddLocation').innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Add New Location';
}

function deleteAddress(key) {
    if(confirm("Delete this address?")) {
        db.ref('users/' + session.mobile + '/savedAddresses/' + key).remove();
        if(localStorage.getItem('rmz_def_addr') === key) localStorage.removeItem('rmz_def_addr');
        loadSavedAddresses();
        if(selectedAddress && selectedAddress.key === key) selectLiveLocation();
    }
}

function setDefault(key) {
    localStorage.setItem('rmz_def_addr', key);
    showToast("Default Location Updated");
    loadSavedAddresses();
}

function selectSavedAddress(key, title, text, lat, lng) {
    selectedAddress = { type: 'saved', key, title, text, lat, lng };
    localStorage.setItem('rmz_def_addr', key);
    updateAddressUI();
    closeLocationModal();
}

function selectLiveLocation() {
    const btnTitle = document.getElementById('dispAddrTitle');
    btnTitle.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting...';
    
    if("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async p => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            let text = "Current GPS Location";
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await res.json();
                if(data.display_name) text = data.display_name;
            } catch(e) {}

            selectedAddress = { type: 'live', title: "Live Location", text, lat, lng };
            localStorage.removeItem('rmz_def_addr');
            updateAddressUI();
            if(!document.getElementById('locationModal').classList.contains('hidden')) closeLocationModal();
        }, () => { showToast("GPS Failed"); btnTitle.innerText = "GPS Failed"; });
    }
}

function updateAddressUI() {
    if(selectedAddress) {
        document.getElementById('dispAddrTitle').innerText = selectedAddress.title;
        document.getElementById('dispAddrText').innerText = selectedAddress.text;
    }
}

// --- WEIGHT & PRICE LOGIC (LOCKED SELECTION) ---
function calculateWeight(cart) {
    let totalKg = 0;
    cart.forEach(item => {
        let txt = item.qty.toLowerCase().replace(/\s/g, '');
        let weight = 0; let mul = item.count || 1; let match;
        
        if (match = txt.match(/(\d+(\.\d+)?)kg/)) weight = parseFloat(match[1]);
        else if ((match = txt.match(/(\d+)g/)) || (match = txt.match(/(\d+)gm/))) weight = parseFloat(match[1]) / 1000;
        else if ((match = txt.match(/(\d+(\.\d+)?)l/)) || (match = txt.match(/(\d+(\.\d+)?)ltr/))) weight = parseFloat(match[1]);
        else if (match = txt.match(/(\d+)ml/)) weight = parseFloat(match[1]) / 1000;
        
        totalKg += (weight * mul);
    });

    const badge = document.getElementById('weightBadge');
    if (totalKg > 0) {
        badge.classList.remove('hidden');
        document.getElementById('totalWeightDisplay').innerText = `${totalKg.toFixed(2)} KG`;
        autoSelectSlab(totalKg);
    } else {
        badge.classList.add('hidden');
        selectRateLocked(50, 'SMALL (0-10KG)');
    }
}

function autoSelectSlab(kg) {
    let rec = 50, lbl = 'SMALL (0-10KG)';
    if (kg > 31) { rec = 100; lbl = 'HEAVY (31-50KG)'; }
    else if (kg > 21) { rec = 80; lbl = 'LARGE (21-30KG)'; }
    else if (kg > 11) { rec = 70; lbl = 'MEDIUM (11-20KG)'; }
    else { rec = 50; lbl = 'SMALL (0-10KG)'; }

    selectRateLocked(rec, lbl);
}

function manualSelectRate(amt) {
    showToast("Charge is auto-calculated by weight");
}

function selectRateLocked(amt, lbl) {
    selectedCharge = amt; selectedLabel = lbl;
    
    document.querySelectorAll('.slab-card').forEach(c => {
        c.classList.remove('selected');
        c.classList.add('disabled');
        c.style.pointerEvents = 'none';
        c.style.opacity = '0.5';
    });

    const activeBtn = document.getElementById('rateBtn'+amt);
    if(activeBtn) {
        activeBtn.classList.add('selected');
        activeBtn.classList.remove('disabled');
        activeBtn.style.opacity = '1';
    }

    updateTotals();
}

function updateTotals() {
    document.getElementById('cartTotal').innerText = selectedCharge;
    document.getElementById('finalTotal').innerText = selectedCharge;
}

// --- BUDGET LOGIC ---
function selectBudget(type) {
    selectedBudget = type;
    document.querySelectorAll('.budget-card').forEach(c => c.classList.remove('selected', 'border-amber-500', 'bg-white', 'shadow-sm'));
    document.getElementById(`bud_${type}`).classList.add('selected', 'border-amber-500', 'bg-white', 'shadow-sm');
    document.getElementById('customBudgetInput').classList.toggle('hidden', type !== 'custom');
}
function highlightBudget(t) { selectBudget(t); }

// --- TIME LOGIC (FIXED: Default syncs with UI) ---
function selectTime(time) {
    updateTimeUI(time, true); // True means show toast on manual click
}

function selectManualTime(timeStr) {
    if(!timeStr) return;
    const [hours, minutes] = timeStr.split(':');
    const displayTime = formatAMPM(hours, minutes);
    updateTimeUI(displayTime, true);
}

function updateTimeUI(displayTime, showNotification = true) {
    selectedTime = displayTime;
    
    // Reset Chips Selection Visuals
    document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('selected'));
    
    // If it matches a chip, highlight it
    const chip = document.getElementById(`time_${displayTime}`);
    if(chip) chip.classList.add('selected');

    // Update Display Text and Style
    const dispEl = document.getElementById('timeDisplay');
    dispEl.innerText = displayTime;
    
    // Style update to show it's active
    dispEl.className = "text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200";
    
    if(showNotification) showToast(`Time set to ${displayTime}`);
}

function formatAMPM(hours, minutes) {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    return hours + ':' + minutes + ' ' + ampm;
}

// --- FINAL ORDER ---
async function placeOrder() {
    if(!selectedCharge) return showToast("Select Delivery Charge");
    if(!selectedAddress) return showToast("Select Location");

    const cart = getCart();
    
    // Handle Magic Box
    const magicNote = document.getElementById('magicBoxInput').value.trim();
    if(magicNote) {
        cart.push({
            name: magicNote,
            qty: "Special Request",
            count: 1
        });
    }

    let budgetFinal = selectedBudget;
    if(selectedBudget === 'custom') {
        const amt = document.getElementById('customAmount').value;
        if(!amt) return showToast("Enter Budget Amount");
        budgetFinal = `Custom: ₹${amt}`;
    }

    const btn = document.getElementById('btnStep2');
    btn.disabled = true; btn.innerHTML = 'Processing...';

    let shopName = session.name + "'s Store";
    try { const uSnap = await db.ref('users/' + session.mobile + '/shopName').once('value'); if(uSnap.exists()) shopName = uSnap.val(); } catch(e) {}

    const orderData = {
        orderId: 'ORD-' + Date.now().toString().slice(-6),
        user: { name: session.name, mobile: session.mobile, shopName: shopName },
        location: { address: selectedAddress.text, lat: selectedAddress.lat, lng: selectedAddress.lng, title: selectedAddress.title },
        cart: cart,
        payment: { deliveryFee: selectedCharge, slab: selectedLabel, surcharge: 0, mode: 'COD' },
        preferences: { budget: budgetFinal, deliveryTime: selectedTime }, // Now sends 'Evening' correctly
        status: 'placed',
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        const newOrderRef = await db.ref('orders').push(orderData);
        localStorage.setItem('rmz_active_order', JSON.stringify({id: newOrderRef.key, ...orderData, timestamp: Date.now()}));
        localStorage.removeItem('rmz_cart');
        const overlay = document.getElementById('successOverlay');
        overlay.classList.add('active');
        setTimeout(() => { overlay.classList.remove('active'); window.location.href = 'home.html'; }, 2000);
    } catch (err) {
        console.error(err); showToast("Error Placing Order"); btn.disabled = false; btn.innerHTML = 'Try Again';
    }
}

function showToast(msg) {
    const t = document.getElementById('toast'); document.getElementById('toastMsg').innerText = msg;
    t.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => t.classList.add('opacity-0', 'pointer-events-none'), 2500);
}

