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

const session = JSON.parse(localStorage.getItem('rmz_delivery_user'));
if (!session) window.location.href = 'delivery-login.html';

let isOnline = false, activeOrder = null, watchId, heartbeatInterval;
let myLat = 0, myLng = 0;
let serviceRadius = localStorage.getItem('rmz_pref_radius') || 5;
// Cap radius at 10 if previously higher
if(serviceRadius > 10) serviceRadius = 10;

// Store Approved Wholesalers locally
let approvedWholesalers = [];

const PARTNER_PAY = 20;

window.onload = () => {
    document.getElementById('headerName').innerText = session.name;
    document.getElementById('vehicleType').innerText = session.vehicle;
    document.getElementById('menuName').innerText = session.name;
    document.getElementById('menuMobile').innerText = '+91 ' + session.mobile;
    
    // Set saved radius
    document.getElementById('radiusSlider').value = serviceRadius;
    document.getElementById('radiusVal').innerText = serviceRadius;
    document.getElementById('scanKm').innerText = serviceRadius;

    // --- ACCOUNT STATUS CHECK (DISABLE LOGIC) ---
    db.ref('deliveryBoys/' + session.mobile + '/status').on('value', snap => {
        const s = snap.val();
        if(s === 'disabled') {
            alert("Your account has been disabled by Admin.");
            logout();
        }
    });

    const savedDuty = localStorage.getItem('rmz_duty_on') === 'true';
    if(savedDuty) {
        document.getElementById('dutySwitch').checked = true;
        toggleDuty();
    }
    fetchEarnings(); 
    fetchApprovedWholesalers(); // NEW: Load wholesalers in background
    checkForActive();
};

function showToast(msg) { const t=document.getElementById('toast'); document.getElementById('toastMsg').innerText=msg; t.classList.remove('opacity-0','pointer-events-none'); setTimeout(()=>t.classList.add('opacity-0','pointer-events-none'),2000); }
function toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('menuOverlay').classList.toggle('open'); }

// --- RADIUS LOGIC ---
function updateRadius(val) {
    serviceRadius = val;
    localStorage.setItem('rmz_pref_radius', val);
    document.getElementById('radiusVal').innerText = val;
    document.getElementById('scanKm').innerText = val;
}

function getDistance(lat1, lon1, lat2, lon2) {
    if(!lat1 || !lon1 || !lat2 || !lon2) return 9999;
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1); 
}

// --- WEIGHT CALCULATOR ---
function calculateOrderWeight(cart) {
    if (!cart || !Array.isArray(cart)) return 0;
    let totalKg = 0;
    cart.forEach(item => {
        if (item.qty === 'Special Request') return; 
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
    return totalKg.toFixed(2);
}

// --- TOGGLE DUTY ---
function toggleDuty() {
    isOnline = document.getElementById('dutySwitch').checked;
    localStorage.setItem('rmz_duty_on', isOnline);
    const status = document.getElementById('dutyStatusText');
    
    if(isOnline) {
        status.innerText = "ONLINE"; status.classList.add('text-green-400');
        document.getElementById('offlineState').classList.add('hidden');
        document.getElementById('statsSection').classList.remove('hidden');
        document.getElementById('radiusControl').classList.remove('hidden');
        db.ref('deliveryBoys/'+session.mobile+'/status').onDisconnect().set('offline');
        startGPS();
        startHeartbeat();
        listenOrders();
        updateWholesalerDisplay(); // Update wholesalers when going online
    } else {
        status.innerText = "OFFLINE"; status.classList.remove('text-green-400');
        document.getElementById('offlineState').classList.remove('hidden');
        document.getElementById('noOrdersState').classList.add('hidden');
        document.getElementById('ordersContainer').classList.add('hidden');
        document.getElementById('statsSection').classList.add('hidden');
        document.getElementById('radiusControl').classList.add('hidden');
        document.getElementById('wholesalerStrip').classList.add('hidden');
        stopGPS();
        stopHeartbeat();
        db.ref('deliveryBoys/'+session.mobile+'/status').set('offline');
        db.ref('deliveryBoys/'+session.mobile+'/status').onDisconnect().cancel();
        db.ref('orders').off();
    }
}

// --- HEARTBEAT & GPS (UPDATED FOR TIME TRACKING) ---
function startHeartbeat() {
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    pingServer(); heartbeatInterval = setInterval(pingServer, 60000); 
}
function stopHeartbeat() { if(heartbeatInterval) clearInterval(heartbeatInterval); }

async function pingServer() {
    if(!isOnline) return;
    let batteryLevel = 'Unknown';
    try { if(navigator.getBattery) { const battery = await navigator.getBattery(); batteryLevel = Math.round(battery.level * 100) + '%'; } } catch(e) {}
    
    const updates = { 
        lastHeartbeat: firebase.database.ServerValue.TIMESTAMP, 
        status: 'online', 
        battery: batteryLevel 
    };
    db.ref('deliveryBoys/'+session.mobile).update(updates);
    
    // Increment Online Minutes
    db.ref('deliveryBoys/'+session.mobile+'/onlineMinutes').transaction(m => (m || 0) + 1);
}

function startGPS() {
    if("geolocation" in navigator) {
        db.ref('deliveryBoys/'+session.mobile).update({status:'online'});
        watchId = navigator.geolocation.watchPosition(p => {
            myLat = p.coords.latitude;
            myLng = p.coords.longitude;
            document.getElementById('locStatus').innerText = "GPS Live";
            
            db.ref('deliveryBoys/'+session.mobile).update({
                status:'online',
                location:{lat:myLat, lng:myLng},
                lastUpdated: firebase.database.ServerValue.TIMESTAMP
            });
            
            if(activeOrder) updateActiveDistance();
            
            // NEW: Update Wholesaler List relative to new position
            updateWholesalerDisplay();
            
            listenOrders(); // This might re-render too often, consider debouncing if needed.
            
        }, e => document.getElementById('locStatus').innerText = "GPS Weak", {enableHighAccuracy: true});
    }
}
function stopGPS() { if(watchId) navigator.geolocation.clearWatch(watchId); }

// --- LISTEN ORDERS ---
function listenOrders() {
    const list = document.getElementById('ordersList');
    
    db.ref('orders').on('value', snap => {
        if(!isOnline) return;
        list.innerHTML = '';
        let count = 0;
        
        if(snap.exists()) {
            Object.entries(snap.val()).forEach(([id, o]) => {
                const dist = parseFloat(getDistance(myLat, myLng, o.location.lat, o.location.lng));
                const isInRange = dist <= parseFloat(serviceRadius);
                const isMyOrder = (o.status === 'accepted' && o.deliveryBoyId === session.mobile);
                
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

                    const weight = calculateOrderWeight(o.cart);

                    let specialReqHTML = '';
                    if(o.cart) o.cart.forEach(item => {
                        if(item.qty === 'Special Request') {
                            specialReqHTML = `
                                <div class="mt-3 bg-amber-900/30 border border-amber-500/50 p-2 rounded text-xs flex items-start gap-2 animate-pulse">
                                    <i class="fa-solid fa-star text-amber-400 mt-0.5"></i>
                                    <div>
                                        <p class="font-bold text-amber-400 uppercase text-[9px]">Special Request</p>
                                        <p class="text-gray-200">${item.name}</p>
                                    </div>
                                </div>
                            `;
                        }
                    });

                    let assignedInfo = "";
                    let cardClass = "glass-card";
                    
                    if(isMyOrder) {
                        assignedInfo = `<div class="mt-2 text-center bg-blue-600 text-white text-xs font-bold py-1 rounded">ASSIGNED TO YOU</div>`;
                        cardClass = "glass-card border-2 border-blue-500 bg-blue-900/20";
                    }

                    let prodTxt = o.cart ? o.cart.filter(i=>i.qty!=='Special Request').map(i => `${i.count}x ${i.name}`).join(', ') : 'Items';
                    
                    const div = document.createElement('div');
                    div.className = `${cardClass} p-4 rounded-xl pulse-border relative`;
                    
                    const mapAction = `openMapDirect(${o.location.lat},${o.location.lng})`;
                    const btnDisabled = (activeOrder && activeOrder.id !== id) ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
                    const btnText = (activeOrder && activeOrder.id === id) ? 'CONTINUE TASK' : (activeOrder ? 'Finish Current' : 'ACCEPT ORDER');
                    const bgClass = (activeOrder && activeOrder.id === id) ? 'bg-blue-600 hover:bg-blue-500' : (activeOrder ? 'bg-gray-600' : 'bg-green-600 hover:bg-green-500');
                    const clickAction = (activeOrder && activeOrder.id === id) ? `loadActive('${id}', ${JSON.stringify(o).replace(/"/g, '&quot;')})` : `acceptOrder('${id}')`;

                    const gridHTML = `
                        <div class="grid grid-cols-2 gap-2 mt-3 mb-2">
                            <div class="bg-gray-900/40 p-2 rounded border border-gray-700 flex flex-col items-center justify-center">
                                <span class="text-[9px] text-gray-500 uppercase font-bold">Pref. Time</span>
                                <span class="text-xs font-bold text-blue-400 truncate">${prefTime}</span>
                            </div>
                            <div class="bg-gray-900/40 p-2 rounded border border-gray-700 flex flex-col items-center justify-center">
                                <span class="text-[9px] text-gray-500 uppercase font-bold">Budget</span>
                                <span class="text-xs font-bold text-pink-400 truncate">${prefBudg}</span>
                            </div>
                            <div class="bg-gray-900/40 p-2 rounded border border-gray-700 flex flex-col items-center justify-center">
                                <span class="text-[9px] text-gray-500 uppercase font-bold">Details</span>
                                <div class="text-xs font-bold text-white truncate flex items-center gap-2">
                                    <span>${orderTime}</span>
                                    <span class="bg-gray-700 px-1 rounded text-[10px] text-gray-300">${weight}kg</span>
                                </div>
                            </div>
                            <div class="bg-gray-900/40 p-2 rounded border border-gray-700 flex flex-col items-center justify-center">
                                <span class="text-[9px] text-gray-500 uppercase font-bold">Distance</span>
                                <span class="text-xs font-bold text-amber-400 truncate">${dist} KM</span>
                            </div>
                        </div>
                    `;

                    div.innerHTML = `
                        <div class="flex justify-between items-start mb-2">
                            <h4 class="font-bold text-white text-lg">${shopName}</h4>
                            <span class="bg-green-600 text-xs font-bold px-2 py-1 rounded">₹${fee}</span>
                        </div>
                        <div class="text-xs text-gray-400 space-y-1 mb-3">
                            <p class="truncate"><i class="fa-solid fa-box mr-1"></i> ${prodTxt}</p>
                            <p class="truncate"><i class="fa-solid fa-location-dot mr-1"></i> ${address}</p>
                            
                            ${gridHTML}
                            ${specialReqHTML}
                            
                            ${assignedInfo}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="${mapAction}" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg shadow transition" title="Navigate"><i class="fa-solid fa-location-arrow"></i></button>
                            <button onclick="${clickAction}" class="flex-1 ${bgClass} text-white font-bold py-3 rounded-lg shadow active:scale-95 transition" ${btnDisabled}>
                                ${btnText}
                            </button>
                        </div>
                    `;
                    list.appendChild(div);
                }
            });
        }
        
        document.getElementById('orderCount').innerText = count;
        
        if(!activeOrder) {
            if(count > 0) {
                document.getElementById('noOrdersState').classList.add('hidden');
                document.getElementById('ordersContainer').classList.remove('hidden');
                // Check if wholesalers should be shown
                updateWholesalerDisplay();
            } else {
                document.getElementById('noOrdersState').classList.remove('hidden');
                document.getElementById('ordersContainer').classList.add('hidden');
                document.getElementById('wholesalerStrip').classList.add('hidden'); // Hide if no orders
            }
        }
    });
}

function acceptOrder(id) {
    if(activeOrder) return showToast("Complete current order first!");
    if(!confirm("Are you sure you want to accept?")) return;
    
    db.ref('orders/'+id).transaction(o => {
        if(o && (o.status === 'placed')) {
            o.status = 'accepted'; 
            o.deliveryBoyId = session.mobile; 
            o.deliveryBoyName = session.name; 
            o.deliveryBoyMobile = session.mobile;
            return o;
        }
    }, (err, comm, snap) => {
        if(comm) { showToast("Accepted!"); loadActive(id, snap.val()); }
        else showToast("Taken by others or deleted!");
    });
}

function checkForActive() {
    db.ref('orders').orderByChild('deliveryBoyId').equalTo(session.mobile).on('value', snap => {
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
                activeOrder = null;
                document.getElementById('activeOrderPanel').classList.add('hidden');
                document.getElementById('statsSection').classList.remove('hidden');
                document.getElementById('ordersContainer').classList.remove('hidden');
                document.getElementById('radiusControl').classList.remove('hidden');
                // Re-check for list display
                listenOrders();
            }
        }
    });
}

function loadActive(id, o) {
    activeOrder = {id, ...o};
    document.getElementById('ordersContainer').classList.add('hidden');
    document.getElementById('noOrdersState').classList.add('hidden');
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('radiusControl').classList.add('hidden');
    document.getElementById('activeOrderPanel').classList.remove('hidden');
    
    // Hide wholesaler strip in active mode to focus on task
    document.getElementById('wholesalerStrip').classList.add('hidden'); 
    
    const custName = o.user && o.user.name ? o.user.name : "Customer";
    const address = o.location && o.location.address ? o.location.address : "Unknown Address";
    const fee = o.payment && o.payment.deliveryFee ? o.payment.deliveryFee : 0;
    const prefTime = o.preferences && o.preferences.deliveryTime ? o.preferences.deliveryTime : "Standard";
    const prefBudg = o.preferences && o.preferences.budget ? o.preferences.budget : "Standard";

    document.getElementById('actShop').innerText = "You (Partner)";
    document.getElementById('actShop').classList.add('text-blue-400');
    document.getElementById('actShopLoc').innerText = "Your GPS is Live Tracking";
    
    document.getElementById('actCust').innerText = custName;
    document.getElementById('actAddr').innerText = address;
    document.getElementById('actFee').innerText = fee;
    
    document.getElementById('actPrefTime').innerText = prefTime;
    document.getElementById('actPrefBudget').innerText = prefBudg;

    updateActiveDistance();
    
    let orderTime = "N/A";
    if(o.timestamp) {
        const d = new Date(o.timestamp);
        orderTime = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    document.getElementById('actOrderTime').innerText = orderTime;

    const ul = document.getElementById('actItems');
    ul.innerHTML = o.cart ? o.cart.filter(i=>i.qty!=='Special Request').map(i => `
        <li class="flex justify-between border-b border-gray-700 pb-1 last:border-0">
            <span>${i.name}</span>
            <span class="text-white font-bold">${i.qty} x${i.count}</span>
        </li>
    `).join('') : '';

    const weight = calculateOrderWeight(o.cart);
    let specialReqHTML = '';
    if(o.cart) o.cart.forEach(item => {
        if(item.qty === 'Special Request') {
            specialReqHTML = `
                <div class="mt-3 bg-amber-900/30 border border-amber-500/50 p-3 rounded-lg flex items-start gap-3">
                    <i class="fa-solid fa-wand-magic-sparkles text-amber-400 mt-1"></i>
                    <div>
                        <p class="font-bold text-amber-400 uppercase text-xs">Special Request</p>
                        <p class="text-white text-sm font-bold">${item.name}</p>
                    </div>
                </div>
            `;
        }
    });

    const extraContainer = document.getElementById('actExtraDetails');
    extraContainer.innerHTML = `
        <div class="flex items-center justify-between bg-gray-900 p-2 rounded border border-gray-600 mt-2">
            <span class="text-[10px] text-gray-400 font-bold uppercase">Total Weight</span>
            <span class="text-sm font-bold text-white"><i class="fa-solid fa-weight-hanging text-gray-500 mr-1"></i>${weight} KG</span>
        </div>
        ${specialReqHTML}
    `;
    
    updateBtnUI(o.status);
}

function updateActiveDistance() {
    if(activeOrder && activeOrder.location && activeOrder.location.lat) {
        const d = getDistance(myLat, myLng, activeOrder.location.lat, activeOrder.location.lng);
        const el = document.getElementById('actDist');
        if(el) el.innerText = d + " KM";
    }
}

function updateBtnUI(status) {
    const b = document.getElementById('actionBtn');
    const s = document.getElementById('activeStatus');
    if(status === 'accepted') {
        s.innerText = "Going to Shop"; s.className = "text-xs bg-blue-500/20 text-blue-500 px-2 py-1 rounded uppercase font-bold";
        b.innerText = "PICKED UP ORDER"; b.className = "w-full bg-blue-600 text-white font-bold py-4 rounded-xl";
        b.onclick = () => updateStatus('out_for_delivery');
    } else if(status === 'out_for_delivery') {
        s.innerText = "Out for Delivery"; s.className = "text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded uppercase font-bold";
        b.innerText = "DELIVERED & CASH COLLECTED"; b.className = "w-full bg-green-600 text-white font-bold py-4 rounded-xl";
        b.onclick = () => updateStatus('delivered');
    }
}

function updateStatus(st) {
    if(st === 'delivered' && !confirm("Confirm Cash Collected?")) return;
    
    const updates = { status: st };
    
    // --- NEW: Save Pickup Location & Calc Distance ---
    if (st === 'out_for_delivery') {
        updates.pickupLocation = { lat: myLat, lng: myLng };
    }

    if (st === 'delivered') {
        if(activeOrder.pickupLocation) {
            const dist = getDistance(activeOrder.pickupLocation.lat, activeOrder.pickupLocation.lng, myLat, myLng);
            if(dist && !isNaN(dist)) {
                db.ref('deliveryBoys/'+session.mobile+'/totalDistance').transaction(d => (d || 0) + parseFloat(dist));
            }
        }
    }
    
    db.ref('orders/'+activeOrder.id).update(updates).then(() => {
        if(st === 'delivered') {
            triggerCelebration();
            showToast("Order Completed! Great Job!");
            
            db.ref('deliveryBoys/'+session.mobile+'/earnings').transaction(current => (current || 0) + PARTNER_PAY);
            db.ref('deliveryBoys/'+session.mobile+'/trips').transaction(current => (current || 0) + 1);
            // NEW: Lifetime Earnings
            db.ref('deliveryBoys/'+session.mobile+'/lifetimeEarnings').transaction(current => (current || 0) + PARTNER_PAY);

            db.ref('orders/'+activeOrder.id).update({
                completedAt: firebase.database.ServerValue.TIMESTAMP,
                partnerPay: PARTNER_PAY
            });
        }
        else updateBtnUI(st);
    });
}

function triggerCelebration() {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    const overlay = document.getElementById('celebrationOverlay');
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 3000);
}

function fetchEarnings() {
    db.ref('deliveryBoys/'+session.mobile).on('value', s => {
        if(s.exists()) {
            const d = s.val();
            document.getElementById('earnings').innerText = d.earnings || 0;
            document.getElementById('trips').innerText = d.trips || 0;
        }
    });
}

// Utils
function changePin() { toggleMenu(); const p = prompt("New PIN:"); if(p && p.length===4) db.ref('deliveryBoys/'+session.mobile).update({pin:p}).then(()=>showToast("PIN Changed")); }
function updateVehicle() { toggleMenu(); const v = prompt("Vehicle (Bike/Cycle):"); if(v) { db.ref('deliveryBoys/'+session.mobile).update({vehicle:v}); session.vehicle=v; localStorage.setItem('rmz_delivery_user',JSON.stringify(session)); document.getElementById('vehicleType').innerText=v; }}
function logout() { localStorage.removeItem('rmz_delivery_user'); window.location.href='delivery-login.html'; }

// BETTER MAPS FUNCTIONS
function openMapDirect(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
}

function openMap(type) { 
    if(!activeOrder || !activeOrder.location) return;
    const lat = activeOrder.location.lat;
    const lng = activeOrder.location.lng;
    
    if(type === 'dir') {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    } else if (type === 'view') {
        window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank');
    } else if (type === 'cust') {
        window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
    }
}

function callCust() { if(activeOrder && activeOrder.user) window.open(`tel:${activeOrder.user.mobile}`); }
function openWhatsApp() { if(activeOrder && activeOrder.user) window.open(`https://wa.me/91${activeOrder.user.mobile}`, '_blank'); }

// ==========================================
// WHOLESALER SHOP LOGIC (ADD & VIEW)
// ==========================================

// 1. SOS Function (Updated Number)
function triggerSOS(adminNumber) {
    if(!confirm("⚠️ SEND EMERGENCY SOS? \nLocation will be shared with Admin & Team.")) return;
    
    const message = `🚨 *SOS EMERGENCY* 🚨\n\nPartner: ${session.name}\nPhone: ${session.mobile}\nLocation: https://maps.google.com/?q=${myLat},${myLng}\n\n*Call Immediately!*`;
    
    // Direct WhatsApp Link
    window.open(`https://wa.me/91${adminNumber}?text=${encodeURIComponent(message)}`, '_blank');
}

// 2. Fetch Wholesalers
function fetchApprovedWholesalers() {
    db.ref('wholesalerRequests').orderByChild('status').equalTo('approved').on('value', snap => {
        approvedWholesalers = [];
        if(snap.exists()) {
            snap.forEach(child => {
                approvedWholesalers.push({ id: child.key, ...child.val() });
            });
        }
        console.log("Loaded Wholesalers:", approvedWholesalers.length);
        updateWholesalerDisplay(); 
    });
}

// 3. Render Wholesaler Strip
function updateWholesalerDisplay() {
    const strip = document.getElementById('wholesalerStrip');
    const container = document.getElementById('wsListContainer');
    
    // Basic checks
    if(!approvedWholesalers.length || !isOnline) {
        strip.classList.add('hidden');
        return;
    }

    // Filter by nearby (e.g., 50KM max just to be safe) and sort by distance
    const nearby = approvedWholesalers.map(ws => {
        let lat = ws.location ? ws.location.lat : 0;
        let lng = ws.location ? ws.location.lng : 0;
        const d = parseFloat(getDistance(myLat, myLng, lat, lng));
        return { ...ws, dist: d };
    }).sort((a, b) => a.dist - b.dist);

    if(!nearby.length) {
        strip.classList.add('hidden');
        return;
    }

    // Hide if in active order mode
    if(activeOrder) {
        strip.classList.add('hidden');
        return;
    }
    
    // Only show if orders list is visible (meaning we are on Home tab waiting for orders)
    if(document.getElementById('ordersContainer').classList.contains('hidden')) {
        strip.classList.add('hidden'); 
        return; 
    }

    strip.classList.remove('hidden');
    container.innerHTML = '';

    nearby.forEach(ws => {
        const div = document.createElement('div');
        div.className = "flex-shrink-0 w-64 bg-slate-800 border border-slate-700 rounded-xl p-3 relative snap-center";
        
        // Safe Location handling
        const lat = ws.location ? ws.location.lat : 0;
        const lng = ws.location ? ws.location.lng : 0;

        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-bold text-white text-sm truncate w-3/4">${ws.shopName}</h4>
                <span class="text-[10px] bg-amber-900/30 text-amber-500 border border-amber-900/50 px-1.5 py-0.5 rounded font-bold">${ws.dist} KM</span>
            </div>
            <p class="text-[10px] text-slate-400 mb-3 truncate"><i class="fa-solid fa-location-dot mr-1"></i>${ws.address}</p>
            <div class="flex gap-2">
                <button onclick="window.open('tel:${ws.ownerMobile}')" class="bg-slate-700 hover:bg-slate-600 text-white w-8 h-8 rounded-lg flex items-center justify-center transition"><i class="fa-solid fa-phone text-xs"></i></button>
                <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}')" class="bg-blue-600 hover:bg-blue-500 text-white w-8 h-8 rounded-lg flex items-center justify-center transition"><i class="fa-solid fa-location-arrow text-xs"></i></button>
                <button onclick="showWholesalerDetails('${ws.shopName}', '${ws.address}', '${ws.ownerMobile}')" class="bg-slate-700 hover:bg-slate-600 text-white px-3 h-8 rounded-lg text-[10px] font-bold flex-1 transition">View More</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function showWholesalerDetails(name, addr, mob) {
    alert(`🏪 ${name}\n\n📍 ${addr}\n\n📞 ${mob}`);
}

// 4. Modal Logic (Add Shop) - Remains same
function openWholesalerModal() {
    toggleMenu();
    document.getElementById('wholesalerModal').classList.remove('hidden');
    resetWsForm();
    loadMyWholesalerRequests();
}

function closeWholesalerModal() {
    document.getElementById('wholesalerModal').classList.add('hidden');
}

function resetWsForm() {
    document.getElementById('wsName').value = '';
    document.getElementById('wsMobile').value = '';
    document.getElementById('wsAddress').value = '';
    document.getElementById('wsLat').value = '';
    document.getElementById('wsLng').value = '';
    document.getElementById('wsEditId').value = '';
    document.getElementById('btnConnectLoc').innerHTML = '<i class="fa-solid fa-location-crosshairs text-lg"></i> Connect Live Location';
    document.getElementById('btnWsSubmit').innerText = "SUBMIT FOR VERIFICATION";
}

function connectWholesalerLocation() {
    const btn = document.getElementById('btnConnectLoc');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting...';
    
    if(!navigator.geolocation) {
        alert("GPS not supported");
        btn.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> GPS Failed';
        return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        
        document.getElementById('wsLat').value = lat;
        document.getElementById('wsLng').value = lng;
        
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Location Connected';
        btn.classList.replace('bg-blue-900/30', 'bg-green-900/30');
        btn.classList.replace('text-blue-400', 'text-green-400');
        
        document.getElementById('wsAddress').value = "Fetching address details...";
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await response.json();
            if(data && data.display_name) {
                document.getElementById('wsAddress').value = data.display_name;
            } else {
                document.getElementById('wsAddress').value = `Lat: ${lat}, Lng: ${lng} (Type Address manually)`;
            }
        } catch(e) {
            document.getElementById('wsAddress').value = `Lat: ${lat}, Lng: ${lng} (Type Address manually)`;
        }

    }, (err) => {
        alert("GPS Access Denied: " + err.message);
        btn.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Retry Location';
    }, { enableHighAccuracy: true });
}

function submitWholesalerRequest() {
    const name = document.getElementById('wsName').value.trim();
    const mobile = document.getElementById('wsMobile').value.trim();
    const address = document.getElementById('wsAddress').value.trim();
    const lat = document.getElementById('wsLat').value;
    const lng = document.getElementById('wsLng').value;
    const editId = document.getElementById('wsEditId').value;

    if(!name || !mobile || !address) return showToast("Fill all fields");
    if(!lat || !lng) return showToast("Connect Location First");

    const data = {
        partnerMobile: session.mobile,
        partnerName: session.name,
        shopName: name,
        ownerMobile: mobile,
        address: address,
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
        status: 'pending', 
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    if(editId) {
        db.ref('wholesalerRequests/' + editId).update(data)
        .then(() => {
            showToast("Shop Updated!");
            resetWsForm();
        });
    } else {
        db.ref('wholesalerRequests').push(data)
        .then(() => {
            showToast("Submitted Successfully!");
            resetWsForm();
        });
    }
}

function loadMyWholesalerRequests() {
    const list = document.getElementById('myWholesalerList');
    list.innerHTML = '<p class="text-center text-slate-600 text-xs py-2"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p>';
    
    db.ref('wholesalerRequests').orderByChild('partnerMobile').equalTo(session.mobile).on('value', snap => {
        list.innerHTML = '';
        if(snap.exists()) {
            const requests = [];
            snap.forEach(c => requests.push({key: c.key, ...c.val()}));
            requests.reverse(); 

            requests.forEach(req => {
                let statusBadge = '';
                let actions = '';
                let opacity = '';

                if(req.status === 'pending') {
                    statusBadge = `<span class="bg-amber-900/40 text-amber-500 text-[10px] px-2 py-0.5 rounded border border-amber-900/50 uppercase font-bold">Pending</span>`;
                    actions = `
                        <div class="flex gap-2 mt-2">
                            <button onclick="editWsRequest('${req.key}', '${req.shopName}', '${req.ownerMobile}', '${req.address}', ${req.location.lat}, ${req.location.lng})" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-white flex-1 font-bold">Edit</button>
                            <button onclick="db.ref('wholesalerRequests/${req.key}').remove()" class="text-xs bg-red-900/30 text-red-400 hover:bg-red-900/50 px-3 py-1.5 rounded border border-red-900/50 flex-1 font-bold">Delete</button>
                        </div>
                    `;
                } else if(req.status === 'approved') {
                    statusBadge = `<span class="bg-green-900/40 text-green-400 text-[10px] px-2 py-0.5 rounded border border-green-900/50 uppercase font-bold"><i class="fa-solid fa-check-circle mr-1"></i> Verified</span>`;
                } else {
                    statusBadge = `<span class="bg-red-900/40 text-red-400 text-[10px] px-2 py-0.5 rounded border border-red-900/50 uppercase font-bold">Disabled</span>`;
                    opacity = 'opacity-50';
                }

                list.innerHTML += `
                    <div class="bg-slate-800 p-3 rounded-xl border border-slate-700 ${opacity}">
                        <div class="flex justify-between items-start mb-1">
                            <h4 class="font-bold text-white text-sm">${req.shopName}</h4>
                            ${statusBadge}
                        </div>
                        <p class="text-[10px] text-slate-400 font-mono mb-1"><i class="fa-solid fa-phone mr-1"></i>${req.ownerMobile}</p>
                        <p class="text-[10px] text-slate-500 truncate"><i class="fa-solid fa-map-pin mr-1"></i>${req.address}</p>
                        ${actions}
                    </div>
                `;
            });
        } else {
            list.innerHTML = '<p class="text-center text-slate-600 text-xs py-4">You haven\'t added any shops yet.</p>';
        }
    });
}

function editWsRequest(key, name, mobile, address, lat, lng) {
    document.getElementById('wsEditId').value = key;
    document.getElementById('wsName').value = name;
    document.getElementById('wsMobile').value = mobile;
    document.getElementById('wsAddress').value = address;
    document.getElementById('wsLat').value = lat;
    document.getElementById('wsLng').value = lng;
    
    document.getElementById('btnConnectLoc').innerHTML = '<i class="fa-solid fa-check"></i> Location Set (Tap to Update)';
    document.getElementById('btnWsSubmit').innerText = "UPDATE REQUEST";
    
    document.querySelector('.modal-animate').scrollTop = 0;
}

