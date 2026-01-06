// ==========================================
// FILE 2: delivery-home.js
// (Core Logic, Orders, Duty, Initialization)
// ==========================================

console.log("Loading Delivery Core Logic (Light Mode + Smart GPS)...");

const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    databaseURL: "https://tipsplit-e3wes-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.firebasestorage.app",
    messagingSenderId: "984733883633",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};

// Initialize Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
window.db = firebase.database(); // Expose DB globally for Utils

// GLOBAL STATE VARIABLES
try {
    window.session = JSON.parse(localStorage.getItem('rmz_delivery_user'));
} catch(e) { window.session = null; }

if (!window.session) window.location.href = 'delivery-login.html';

window.isOnline = false;
window.activeOrder = null;
window.myLat = 0;
window.myLng = 0;
window.approvedWholesalers = []; // Store list for utils to display
window.myWholesalerQuery = null;
window.isMapOpen = false;

// SMART GPS VARIABLES
let lastSentLat = 0;
let lastSentLng = 0;
const GPS_UPDATE_THRESHOLD_KM = 0.03; // 30 Meters

let watchId, heartbeatInterval;
const PARTNER_PAY = 20;

let serviceRadius = localStorage.getItem('rmz_pref_radius') || 5;
if(serviceRadius > 10) serviceRadius = 10;

// --- INITIALIZATION ---
window.onload = () => {
    // 1. Setup UI
    const els = {
        headerName: document.getElementById('headerName'),
        vehicleType: document.getElementById('vehicleType'),
        menuName: document.getElementById('menuName'),
        menuMobile: document.getElementById('menuMobile'),
        radiusSlider: document.getElementById('radiusSlider'),
        radiusVal: document.getElementById('radiusVal'),
        scanKm: document.getElementById('scanKm'),
        dutySwitch: document.getElementById('dutySwitch')
    };

    if(els.headerName) els.headerName.innerText = window.session.name;
    if(els.vehicleType) els.vehicleType.innerText = window.session.vehicle;
    if(els.menuName) els.menuName.innerText = window.session.name;
    if(els.menuMobile) els.menuMobile.innerText = '+91 ' + window.session.mobile;
    
    if(els.radiusSlider) els.radiusSlider.value = serviceRadius;
    if(els.radiusVal) els.radiusVal.innerText = serviceRadius;
    if(els.scanKm) els.scanKm.innerText = serviceRadius;

    // 2. Check Account Status
    window.db.ref('deliveryBoys/' + window.session.mobile + '/status').on('value', snap => {
        const s = snap.val();
        if(s === 'disabled') {
            alert("Your account has been disabled by Admin.");
            logout();
        }
    });

    // 3. Restore Duty Status
    const savedDuty = localStorage.getItem('rmz_duty_on') === 'true';
    if(savedDuty && els.dutySwitch) {
        els.dutySwitch.checked = true;
        toggleDuty();
    }
    
    fetchEarnings(); 
    fetchApprovedWholesalersList(); 
    checkForActive();
};

// --- CORE DUTY LOGIC ---
window.toggleDuty = function() {
    const switchEl = document.getElementById('dutySwitch');
    if(!switchEl) return;
    
    window.isOnline = switchEl.checked;
    localStorage.setItem('rmz_duty_on', window.isOnline);
    const status = document.getElementById('dutyStatusText');
    
    if(window.isOnline) {
        if(status) { status.innerText = "ONLINE"; status.classList.add('text-green-600'); }
        document.getElementById('offlineState').classList.add('hidden');
        document.getElementById('statsSection').classList.remove('hidden');
        document.getElementById('radiusControl').classList.remove('hidden');
        
        window.db.ref('deliveryBoys/'+window.session.mobile+'/status').onDisconnect().set('offline');
        startGPS();
        startHeartbeat();
        listenOrders();
        if(window.updateWholesalerDisplay) window.updateWholesalerDisplay(); // Call Utils function
    } else {
        if(status) { status.innerText = "OFFLINE"; status.classList.remove('text-green-600'); }
        document.getElementById('offlineState').classList.remove('hidden');
        document.getElementById('noOrdersState').classList.add('hidden');
        document.getElementById('ordersContainer').classList.add('hidden');
        document.getElementById('statsSection').classList.add('hidden');
        document.getElementById('radiusControl').classList.add('hidden');
        document.getElementById('wholesalerStrip').classList.add('hidden');
        
        stopGPS();
        stopHeartbeat();
        window.db.ref('deliveryBoys/'+window.session.mobile+'/status').set('offline');
        window.db.ref('deliveryBoys/'+window.session.mobile+'/status').onDisconnect().cancel();
        window.db.ref('orders').off();
    }
}

window.updateRadius = function(val) {
    serviceRadius = val;
    localStorage.setItem('rmz_pref_radius', val);
    document.getElementById('radiusVal').innerText = val;
    document.getElementById('scanKm').innerText = val;
    listenOrders(); // Refresh orders with new radius
}

// --- GPS & HEARTBEAT ---
function startHeartbeat() {
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    pingServer(); heartbeatInterval = setInterval(pingServer, 60000); 
}
function stopHeartbeat() { if(heartbeatInterval) clearInterval(heartbeatInterval); }

async function pingServer() {
    if(!window.isOnline) return;
    let batteryLevel = 'Unknown';
    try { if(navigator.getBattery) { const battery = await navigator.getBattery(); batteryLevel = Math.round(battery.level * 100) + '%'; } } catch(e) {}
    
    const updates = { 
        lastHeartbeat: firebase.database.ServerValue.TIMESTAMP, 
        status: 'online', 
        battery: batteryLevel 
    };
    window.db.ref('deliveryBoys/'+window.session.mobile).update(updates);
    window.db.ref('deliveryBoys/'+window.session.mobile+'/onlineMinutes').transaction(m => (m || 0) + 1);
}

function startGPS() {
    if("geolocation" in navigator) {
        // Force update status immediately on start
        window.db.ref('deliveryBoys/'+window.session.mobile).update({status:'online'});
        
        watchId = navigator.geolocation.watchPosition(p => {
            const newLat = p.coords.latitude;
            const newLng = p.coords.longitude;
            
            // Update Global Variables (Always keep these live for UI)
            window.myLat = newLat;
            window.myLng = newLng;
            
            const locStatus = document.getElementById('locStatus');
            if(locStatus) locStatus.innerText = "GPS Live";
            
            // --- SMART GPS LOGIC (Bandwidth Saver) ---
            // Calculate distance from last SENT location
            const distMoved = parseFloat(window.getDistance(lastSentLat, lastSentLng, newLat, newLng));
            
            // Only update Firebase if moved > 30 meters (0.03 KM) OR if it's the first update
            if(distMoved >= GPS_UPDATE_THRESHOLD_KM || (lastSentLat === 0 && lastSentLng === 0)) {
                
                window.db.ref('deliveryBoys/'+window.session.mobile).update({
                    status:'online',
                    location:{lat:newLat, lng:newLng},
                    lastUpdated: firebase.database.ServerValue.TIMESTAMP
                });
                
                // Update "Last Sent" coordinates
                lastSentLat = newLat;
                lastSentLng = newLng;
                
                // console.log("📡 GPS Sent to Server (Moved: " + (distMoved*1000).toFixed(0) + "m)");
            } else {
                // console.log("Skipping Server Update (Moved only: " + (distMoved*1000).toFixed(0) + "m)");
            }

            // --- LOCAL UI UPDATES (Run on EVERY pulse for smoothness) ---
            if(window.activeOrder) {
                updateActiveDistance();
                if(window.updateDashboardDistance) window.updateDashboardDistance(); // Live Dashboard
            }
            if(window.isMapOpen) {
                if(window.updateMapVisuals) window.updateMapVisuals(); 
                if(window.renderActiveWholesalerWidget) window.renderActiveWholesalerWidget(); 
            }
            if(window.updateWholesalerDisplay) window.updateWholesalerDisplay();
            
            listenOrders(); // Re-scan orders locally
            
        }, e => {
            const locStatus = document.getElementById('locStatus');
            if(locStatus) locStatus.innerText = "GPS Weak";
        }, {
            enableHighAccuracy: true,
            maximumAge: 10000, // Accept cached positions up to 10s old
            timeout: 10000
        });
    }
}
function stopGPS() { if(watchId) navigator.geolocation.clearWatch(watchId); }

// --- DATA FETCHING ---
function fetchEarnings() {
    window.db.ref('deliveryBoys/'+window.session.mobile).on('value', s => {
        if(s.exists()) {
            const d = s.val();
            if(document.getElementById('earnings')) document.getElementById('earnings').innerText = d.earnings || 0;
            if(document.getElementById('trips')) document.getElementById('trips').innerText = d.trips || 0;
        }
    });
}

function fetchApprovedWholesalersList() {
    window.db.ref('wholesalerRequests').orderByChild('status').equalTo('approved').on('value', snap => {
        window.approvedWholesalers = [];
        if(snap.exists()) {
            snap.forEach(child => {
                window.approvedWholesalers.push({ id: child.key, ...child.val() });
            });
        }
        if(window.updateWholesalerDisplay) window.updateWholesalerDisplay(); 
        if(window.renderActiveWholesalerWidget) window.renderActiveWholesalerWidget();
    });
}

// --- ORDER LISTENER ---
window.listenOrders = function() {
    const list = document.getElementById('ordersList');
    if(!list) return;

    window.db.ref('orders').on('value', snap => {
        if(!window.isOnline) return;
        list.innerHTML = '';
        let count = 0;
        
        if(snap.exists()) {
            Object.entries(snap.val()).forEach(([id, o]) => {
                const dist = parseFloat(window.getDistance(window.myLat, window.myLng, o.location.lat, o.location.lng));
                const isInRange = dist <= parseFloat(serviceRadius);
                const isMyOrder = (o.status === 'accepted' && o.deliveryBoyId === window.session.mobile);
                
                if((o.status === 'placed' && isInRange) || isMyOrder) {
                    count++;
                    const shopName = o.user && o.user.shopName ? o.user.shopName : "Unknown Shop";
                    const address = o.location && o.location.address ? o.location.address : "Address Hidden";
                    const fee = o.payment && o.payment.deliveryFee ? o.payment.deliveryFee : 0;
                    const prefTime = o.preferences && o.preferences.deliveryTime ? o.preferences.deliveryTime : "Standard";
                    const prefBudg = o.preferences && o.preferences.budget ? o.preferences.budget : "Standard";
                    
                    let orderTime = "N/A";
                    if(o.timestamp) {
                        const d = new Date(o.timestamp);
                        orderTime = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    }

                    const weight = window.calculateOrderWeight ? window.calculateOrderWeight(o.cart) : 0;
                    let specialReqHTML = '';
                    if(o.cart) o.cart.forEach(item => {
                        if(item.qty === 'Special Request') {
                            specialReqHTML = `
                                <div class="mt-3 bg-amber-50 border border-amber-200 p-2 rounded text-xs flex items-start gap-2">
                                    <i class="fa-solid fa-star text-amber-500 mt-0.5"></i>
                                    <div><p class="font-bold text-amber-600 uppercase text-[9px]">Special Request</p><p class="text-gray-700">${item.name}</p></div>
                                </div>`;
                        }
                    });

                    let assignedInfo = "";
                    let cardClass = "glass-card";
                    if(isMyOrder) {
                        assignedInfo = `<div class="mt-2 text-center bg-blue-600 text-white text-xs font-bold py-1 rounded">ASSIGNED TO YOU</div>`;
                        cardClass = "bg-blue-50 border border-blue-200 shadow-sm";
                    }

                    let prodTxt = o.cart ? o.cart.filter(i=>i.qty!=='Special Request').map(i => `${i.count}x ${i.name}`).join(', ') : 'Items';
                    const div = document.createElement('div');
                    div.className = `${cardClass} p-4 rounded-xl relative mb-4`;
                    
                    const safeOrder = JSON.stringify(o).replace(/"/g, '"');
                    const mapAction = `openMapDirect(${o.location.lat},${o.location.lng})`;
                    const btnDisabled = (window.activeOrder && window.activeOrder.id !== id) ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
                    const btnText = (window.activeOrder && window.activeOrder.id === id) ? 'CONTINUE TASK' : (window.activeOrder ? 'Finish Current' : 'ACCEPT ORDER');
                    const bgClass = (window.activeOrder && window.activeOrder.id === id) ? 'bg-blue-600 hover:bg-blue-500' : (window.activeOrder ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-500');
                    const clickAction = (window.activeOrder && window.activeOrder.id === id) ? `loadActive('${id}', ${safeOrder})` : `acceptOrder('${id}')`;

                    div.innerHTML = `
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-gray-900 text-lg">${shopName}</h4>
                            <span class="bg-green-100 text-green-700 border border-green-200 text-xs font-bold px-2 py-1 rounded">₹${fee}</span>
                        </div>
                        <div class="text-xs text-gray-500 space-y-1 mb-3">
                            <p class="truncate"><i class="fa-solid fa-box mr-1"></i> ${prodTxt}</p>
                            <p class="truncate"><i class="fa-solid fa-location-dot mr-1"></i> ${address}</p>
                            <div class="grid grid-cols-2 gap-2 mt-3 mb-2">
                                <div class="bg-gray-50 p-2 rounded border border-gray-200 flex flex-col items-center justify-center">
                                    <span class="text-[9px] text-gray-400 uppercase font-bold">Pref. Time</span><span class="text-xs font-bold text-blue-600 truncate">${prefTime}</span>
                                </div>
                                <div class="bg-gray-50 p-2 rounded border border-gray-200 flex flex-col items-center justify-center">
                                    <span class="text-[9px] text-gray-400 uppercase font-bold">Budget</span><span class="text-xs font-bold text-pink-600 truncate">${prefBudg}</span>
                                </div>
                                <div class="bg-gray-50 p-2 rounded border border-gray-200 flex flex-col items-center justify-center">
                                    <span class="text-[9px] text-gray-400 uppercase font-bold">Details</span>
                                    <div class="text-xs font-bold text-gray-700 truncate flex items-center gap-2"><span>${orderTime}</span><span class="bg-gray-200 px-1 rounded text-[10px] text-gray-600">${weight}kg</span></div>
                                </div>
                                <div class="bg-gray-50 p-2 rounded border border-gray-200 flex flex-col items-center justify-center">
                                    <span class="text-[9px] text-gray-400 uppercase font-bold">Distance</span><span class="text-xs font-bold text-amber-600 truncate">${dist} KM</span>
                                </div>
                            </div>
                            ${specialReqHTML}
                            ${assignedInfo}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="${mapAction}" class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-lg shadow-sm transition" title="Navigate"><i class="fa-solid fa-location-arrow"></i></button>
                            <button onclick="${clickAction}" class="flex-1 ${bgClass} text-white font-bold py-3 rounded-lg shadow-sm active:scale-95 transition" ${btnDisabled}>${btnText}</button>
                        </div>
                    `;
                    list.appendChild(div);
                }
            });
        }
        
        const oc = document.getElementById('orderCount');
        if(oc) oc.innerText = count;
        
        if(!window.activeOrder) {
            if(count > 0) {
                document.getElementById('noOrdersState').classList.add('hidden');
                document.getElementById('ordersContainer').classList.remove('hidden');
                if(window.updateWholesalerDisplay) window.updateWholesalerDisplay();
            } else {
                document.getElementById('noOrdersState').classList.remove('hidden');
                document.getElementById('ordersContainer').classList.add('hidden');
                document.getElementById('wholesalerStrip').classList.add('hidden');
            }
        }
    });
}

// --- ORDER ACTIONS ---
window.acceptOrder = function(id) {
    if(window.activeOrder) return showToast("Complete current order first!");
    if(!confirm("Are you sure you want to accept?")) return;
    
    window.db.ref('orders/'+id).transaction(o => {
        if(o && (o.status === 'placed')) {
            o.status = 'accepted'; 
            o.deliveryBoyId = window.session.mobile; 
            o.deliveryBoyName = window.session.name; 
            o.deliveryBoyMobile = window.session.mobile;
            return o;
        }
    }, (err, comm, snap) => {
        if(comm) { showToast("Accepted!"); loadActive(id, snap.val()); }
        else showToast("Taken by others or deleted!");
    });
}

function checkForActive() {
    window.db.ref('orders').orderByChild('deliveryBoyId').equalTo(window.session.mobile).on('value', snap => {
        if(snap.exists()) {
            let foundActive = false;
            const orders = snap.val();
            Object.keys(orders).forEach(key => {
                const o = orders[key];
                if(o.status !== 'delivered') {
                    loadActive(key, o);
                    foundActive = true;
                    if(!document.getElementById('dutySwitch').checked) {
                        document.getElementById('dutySwitch').checked = true;
                        toggleDuty();
                    }
                }
            });
            if(!foundActive) {
                window.activeOrder = null;
                document.getElementById('activeOrderPanel').classList.add('hidden');
                document.getElementById('statsSection').classList.remove('hidden');
                document.getElementById('ordersContainer').classList.remove('hidden');
                document.getElementById('radiusControl').classList.remove('hidden');
                listenOrders();
            }
        }
    });
}

window.loadActive = function(id, o) {
    window.activeOrder = {id, ...o};
    document.getElementById('ordersContainer').classList.add('hidden');
    document.getElementById('noOrdersState').classList.add('hidden');
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('radiusControl').classList.add('hidden');
    document.getElementById('activeOrderPanel').classList.remove('hidden');
    document.getElementById('wholesalerStrip').classList.add('hidden'); 
    
    // Fill Details
    const custName = o.user && o.user.name ? o.user.name : "Customer";
    const address = o.location && o.location.address ? o.location.address : "Unknown Address";
    const fee = o.payment && o.payment.deliveryFee ? o.payment.deliveryFee : 0;
    const prefTime = o.preferences && o.preferences.deliveryTime ? o.preferences.deliveryTime : "Standard";
    const prefBudg = o.preferences && o.preferences.budget ? o.preferences.budget : "Standard";

    document.getElementById('actShop').innerText = "You (Partner)";
    document.getElementById('actShop').classList.add('text-blue-600');
    document.getElementById('actShopLoc').innerText = "Your GPS is Live Tracking";
    document.getElementById('actCust').innerText = custName;
    document.getElementById('actAddr').innerText = address;
    document.getElementById('actFee').innerText = fee;
    document.getElementById('actPrefTime').innerText = prefTime;
    document.getElementById('actPrefBudget').innerText = prefBudg;

    let orderTime = "N/A";
    if(o.timestamp) {
        const d = new Date(o.timestamp);
        orderTime = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    document.getElementById('actOrderTime').innerText = orderTime;

    const ul = document.getElementById('actItems');
    ul.innerHTML = o.cart ? o.cart.filter(i=>i.qty!=='Special Request').map(i => `
        <li class="flex justify-between border-b border-gray-100 pb-1 last:border-0">
            <span>${i.name}</span><span class="text-gray-900 font-bold">${i.qty} x${i.count}</span>
        </li>
    `).join('') : '';

    const weight = window.calculateOrderWeight ? window.calculateOrderWeight(o.cart) : 0;
    let specialReqHTML = '';
    if(o.cart) o.cart.forEach(item => {
        if(item.qty === 'Special Request') {
            specialReqHTML = `
                <div class="mt-3 bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-3">
                    <i class="fa-solid fa-wand-magic-sparkles text-amber-500 mt-1"></i>
                    <div><p class="font-bold text-amber-600 uppercase text-xs">Special Request</p><p class="text-gray-700 text-sm font-bold">${item.name}</p></div>
                </div>`;
        }
    });

    document.getElementById('actExtraDetails').innerHTML = `
        <div class="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-200 mt-2">
            <span class="text-[10px] text-gray-400 font-bold uppercase">Total Weight</span>
            <span class="text-sm font-bold text-gray-800"><i class="fa-solid fa-weight-hanging text-gray-500 mr-1"></i>${weight} KG</span>
        </div>
        ${specialReqHTML}
    `;
    
    updateActiveDistance();
    
    // --- OPEN MAP & WIDGETS ---
    if(window.toggleLiveMap) window.toggleLiveMap(true); 
    if(window.renderActiveWholesalerWidget) window.renderActiveWholesalerWidget();

    updateBtnUI(o.status);
}

function updateActiveDistance() {
    if(window.activeOrder && window.activeOrder.location && window.activeOrder.location.lat) {
        const d = window.getDistance(window.myLat, window.myLng, window.activeOrder.location.lat, window.activeOrder.location.lng);
        const el = document.getElementById('actDist');
        if(el) el.innerText = d + " KM";
    }
}

function updateBtnUI(status) {
    const b = document.getElementById('actionBtn');
    const s = document.getElementById('activeStatus');
    if(status === 'accepted') {
        s.innerText = "Going to Shop"; s.className = "text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded uppercase font-bold";
        b.innerText = "PICKED UP ORDER"; b.className = "w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200";
        b.onclick = () => updateStatus('out_for_delivery');
    } else if(status === 'out_for_delivery') {
        s.innerText = "Out for Delivery"; s.className = "text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded uppercase font-bold";
        b.innerText = "DELIVERED & CASH COLLECTED"; b.className = "w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-200";
        b.onclick = () => updateStatus('delivered');
    }
}

window.updateStatus = function(st) {
    if(st === 'delivered' && !confirm("Confirm Cash Collected?")) return;
    
    const updates = { status: st };
    if (st === 'out_for_delivery') updates.pickupLocation = { lat: window.myLat, lng: window.myLng };

    if (st === 'delivered') {
        if(window.activeOrder.pickupLocation) {
            const dist = window.getDistance(window.activeOrder.pickupLocation.lat, window.activeOrder.pickupLocation.lng, window.myLat, window.myLng);
            if(dist && !isNaN(dist)) {
                window.db.ref('deliveryBoys/'+window.session.mobile+'/totalDistance').transaction(d => (d || 0) + parseFloat(dist));
            }
        }
    }
    
    window.db.ref('orders/'+window.activeOrder.id).update(updates).then(() => {
        if(st === 'delivered') {
            if(window.triggerCelebration) window.triggerCelebration();
            showToast("Order Completed! Great Job!");
            
            window.db.ref('deliveryBoys/'+window.session.mobile+'/earnings').transaction(current => (current || 0) + PARTNER_PAY);
            window.db.ref('deliveryBoys/'+window.session.mobile+'/trips').transaction(current => (current || 0) + 1);
            window.db.ref('deliveryBoys/'+window.session.mobile+'/lifetimeEarnings').transaction(current => (current || 0) + PARTNER_PAY);

            window.db.ref('orders/'+window.activeOrder.id).update({
                completedAt: firebase.database.ServerValue.TIMESTAMP,
                partnerPay: PARTNER_PAY
            });
        }
        else updateBtnUI(st);
    });
}

window.changeStatus = function() {
    if(window.activeOrder) updateBtnUI(window.activeOrder.status);
}


