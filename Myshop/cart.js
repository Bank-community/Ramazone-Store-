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

let selectedCharge = 0;
let selectedLabel = "";
let selectedBudget = "standard"; // standard, high, custom
let selectedTime = "Evening";

// --- INITIALIZATION ---
window.onload = () => {
    // 1. Check for Active Order immediately (Fast Load)
    checkActiveOrder();

    // 2. Load Cart & Other UI only if no active order
    if(!document.body.classList.contains('tracking-mode')) {
        renderCart();
        loadSavedAddress();
        
        // Default Selections UI
        highlightBudget('standard');
        highlightTime('Evening');
    }
};

// --- ONE ORDER POLICY & NEXT DAY RESET ---
function checkActiveOrder() {
    const savedOrder = JSON.parse(localStorage.getItem('rmz_active_order'));
    
    if (savedOrder) {
        const orderDate = new Date(savedOrder.timestamp);
        const today = new Date();
        const isSameDay = orderDate.getDate() === today.getDate() && 
                          orderDate.getMonth() === today.getMonth() && 
                          orderDate.getFullYear() === today.getFullYear();

        if (isSameDay && savedOrder.status !== 'delivered' && savedOrder.status !== 'cancelled') {
            // ACTIVE ORDER EXISTS -> Show Tracking, Hide Cart
            enableTrackingMode(savedOrder);
            syncOrderStatus(savedOrder.id); // Check DB for updates in background
        } else {
            // OLD ORDER / DELIVERED -> Reset
            localStorage.removeItem('rmz_active_order');
            // Logic to restore items to cart could go here if needed, 
            // currently we just clear the "Active" block so user can order again.
        }
    }
}

function enableTrackingMode(order) {
    document.body.classList.add('tracking-mode');
    document.getElementById('liveTrackingSection').classList.remove('hidden');
    document.getElementById('checkoutFormContainer').classList.add('hidden');
    document.getElementById('bottomBar').classList.add('hidden');
    
    // Update Tracking UI
    document.getElementById('trackId').innerText = order.orderId ? order.orderId.slice(-6) : '...';
    updateTimelineUI(order.status);
}

function syncOrderStatus(orderId) {
    db.ref('orders/' + orderId).on('value', snap => {
        if(snap.exists()) {
            const updatedOrder = snap.val();
            // Update LocalStorage
            localStorage.setItem('rmz_active_order', JSON.stringify({id: orderId, ...updatedOrder}));
            updateTimelineUI(updatedOrder.status);
            
            if(updatedOrder.status === 'delivered') {
                // Keep showing delivered state until next day or manual close? 
                // For now, let it show delivered. Next refresh next day will clear it.
            }
        } else {
            // Order deleted? Reset.
            localStorage.removeItem('rmz_active_order');
            window.location.reload();
        }
    });
}

function updateTimelineUI(status) {
    const steps = ['placed', 'accepted', 'out_for_delivery', 'delivered'];
    let passed = true;
    
    // Normalize status
    let currentStep = status;
    if(currentStep === 'admin_accepted') currentStep = 'placed'; 

    steps.forEach(step => {
        const el = document.getElementById(`step-${step}`);
        if(!el) return;
        
        el.classList.remove('active');
        el.querySelector('.timeline-icon').style.backgroundColor = '#e2e8f0';
        
        if(passed) {
            el.classList.add('active');
            el.querySelector('.timeline-icon').style.backgroundColor = '#22c55e';
        }
        if(step === currentStep) passed = false;
    });
}

// --- CART RENDERING & LOGIC ---
function getCart() { return JSON.parse(localStorage.getItem('rmz_cart')) || []; }
function saveCart(c) { localStorage.setItem('rmz_cart', JSON.stringify(c)); }

function renderCart() {
    const cart = getCart();
    const list = document.getElementById('cartList');
    document.getElementById('itemCountBadge').innerText = `${cart.length} Items`;
    list.innerHTML = '';

    if (cart.length === 0) {
        document.getElementById('cartEmptyState').classList.remove('hidden');
        document.getElementById('bottomBar').classList.add('hidden'); // Hide footer if empty
        return;
    }
    document.getElementById('cartEmptyState').classList.add('hidden');
    document.getElementById('bottomBar').classList.remove('hidden');

    cart.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-4";
        
        // Quantity Controls Logic
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
        if(confirm(`Remove ${item.name} from cart?`)) {
            cart.splice(idx, 1);
        } else {
            return; // Cancelled
        }
    } else {
        item.count = newCount;
    }
    
    saveCart(cart);
    renderCart(); // Re-render to update UI & Weight
}

// --- WEIGHT & SLABS ---
function calculateWeight(cart) {
    let totalKg = 0;
    cart.forEach(item => {
        let txt = item.qty.toLowerCase().replace(/\s/g, '');
        let weight = 0;
        let mul = item.count || 1;
        let match;

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
        if(selectedCharge === 0) selectRate(50, 'SMALL (0-10KG)');
    }
}

function autoSelectSlab(kg) {
    ['50','70','80','100'].forEach(r => document.getElementById('rateBtn'+r).classList.remove('disabled'));
    if (kg > 10) document.getElementById('rateBtn50').classList.add('disabled');
    if (kg > 20) document.getElementById('rateBtn70').classList.add('disabled');
    if (kg > 30) document.getElementById('rateBtn80').classList.add('disabled');
    
    let rec = 50, lbl = 'SMALL (0-10KG)';
    if (kg > 30) { rec = 100; lbl = 'HEAVY (31-50KG)'; }
    else if (kg > 20) { rec = 80; lbl = 'LARGE (21-30KG)'; }
    else if (kg > 10) { rec = 70; lbl = 'MEDIUM (11-20KG)'; }

    // If current selected is invalid, force update. Otherwise stick to user choice if valid.
    if (selectedCharge < rec || selectedCharge === 0) selectRate(rec, lbl);
}

function selectRate(amt, lbl) {
    selectedCharge = amt; selectedLabel = lbl;
    document.querySelectorAll('.slab-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('rateBtn'+amt).classList.add('selected');
    document.getElementById('displayTotal').innerText = amt;
}

// --- BUDGET & TIME LOGIC ---
function selectBudget(type) {
    selectedBudget = type;
    document.querySelectorAll('.budget-card').forEach(c => c.classList.remove('selected', 'border-amber-500', 'bg-white', 'shadow-sm'));
    const btn = document.getElementById(`bud_${type}`);
    btn.classList.add('selected', 'border-amber-500', 'bg-white', 'shadow-sm');
    
    // Show/Hide Custom Input
    const inputDiv = document.getElementById('customBudgetInput');
    if (type === 'custom') {
        inputDiv.classList.remove('hidden');
        document.getElementById('customAmount').focus();
    } else {
        inputDiv.classList.add('hidden');
    }
}
// Initial Highlight Helper
function highlightBudget(type) { selectBudget(type); }

function selectTime(time) {
    selectedTime = time;
    document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('selected'));
    document.getElementById(`time_${time}`).classList.add('selected');
}
function highlightTime(time) { selectTime(time); }


// --- ADDRESS ---
function loadSavedAddress() {
    db.ref('users/' + session.mobile + '/address').once('value', s => { 
        if(s.exists()) document.getElementById('deliveryAddress').value = s.val(); 
    });
}
function getLocation() {
    const btn = document.getElementById('btnAutoLoc'); 
    const addrBox = document.getElementById('deliveryAddress');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting...';
    
    if("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async p => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            document.getElementById('lat').value = lat;
            document.getElementById('lng').value = lng;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Found';
            btn.classList.replace('text-indigo-600', 'text-green-600');
            btn.classList.replace('bg-indigo-50', 'bg-green-50');
            
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
                const data = await response.json();
                if(data && data.display_name) {
                    addrBox.value = data.display_name;
                    showToast("Address Auto-filled!");
                }
            } catch(e) { showToast("GPS Coords set. Type address."); }
        }, () => { btn.innerHTML = 'Retry GPS'; showToast("GPS Failed"); });
    }
}

// --- PLACE ORDER ---
async function placeOrder() {
    const cart = getCart();
    const address = document.getElementById('deliveryAddress').value.trim();
    const lat = parseFloat(document.getElementById('lat').value) || 0;
    const lng = parseFloat(document.getElementById('lng').value) || 0;

    if(!selectedCharge) return showToast("Select Parcel Size");
    if(!address) return showToast("Address Required");
    if(cart.length === 0) return showToast("Cart is empty");

    // Prepare Extra Data
    let budgetFinal = selectedBudget;
    if(selectedBudget === 'custom') {
        const amt = document.getElementById('customAmount').value;
        if(!amt) return showToast("Enter Budget Amount");
        budgetFinal = `Custom: ₹${amt}`;
    }

    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true; btn.innerHTML = '<span class="animate-pulse">Processing...</span>';

    const orderData = {
        orderId: 'ORD-' + Date.now().toString().slice(-6),
        user: { name: session.name, mobile: session.mobile, shopName: session.shopName || session.name + "'s Store" },
        location: { address, lat, lng },
        cart: cart,
        payment: { deliveryFee: selectedCharge, slab: selectedLabel, mode: 'COD' },
        preferences: { budget: budgetFinal, deliveryTime: selectedTime },
        status: 'placed',
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        // 1. Push to Firebase
        const newOrderRef = await db.ref('orders').push(orderData);
        
        // 2. Save Address for future
        db.ref('users/' + session.mobile).update({ address: address });
        
        // 3. Set Local Active Order (For Auto-Tracking)
        localStorage.setItem('rmz_active_order', JSON.stringify({id: newOrderRef.key, ...orderData}));
        
        // 4. Clear Cart
        localStorage.removeItem('rmz_cart');

        // 5. Success Animation
        const overlay = document.getElementById('successOverlay');
        overlay.classList.add('active');

        setTimeout(() => {
            overlay.classList.remove('active');
            // Instead of reloading, we switch UI modes directly
            enableTrackingMode({id: newOrderRef.key, ...orderData});
            btn.disabled = false; btn.innerHTML = '<div>...</div>'; // Reset button text structure
        }, 2000);

    } catch (err) {
        console.error(err);
        showToast("Error Placing Order");
        btn.disabled = false; btn.innerHTML = 'Try Again';
    }
}

function showToast(msg) {
    const t = document.getElementById('toast'); document.getElementById('toastMsg').innerText = msg;
    t.classList.remove('opacity-0', 'pointer-events-none');
    setTimeout(() => t.classList.add('opacity-0', 'pointer-events-none'), 2500);
}
