// ==========================================
// FILE 1: delivery-utils.js
// (Helpers, Map, Smart Dashboard, Wholesaler UI, Routing)
// ==========================================

console.log("Loading Delivery Utils (Light Mode + Routing)...");

// --- 1. GENERAL HELPERS ---

window.showToast = function(msg) { 
    const t = document.getElementById('toast'); 
    if(!t) return;
    document.getElementById('toastMsg').innerText = msg; 
    t.classList.remove('opacity-0','pointer-events-none'); 
    setTimeout(() => t.classList.add('opacity-0','pointer-events-none'), 2000); 
}

window.toggleMenu = function() { 
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('menuOverlay');
    if(sb) sb.classList.toggle('open'); 
    if(ov) ov.classList.toggle('open'); 
}

// Distance Calculator (Haversine Formula - Backup)
window.getDistance = function(lat1, lon1, lat2, lon2) {
    if(!lat1 || !lon1 || !lat2 || !lon2) return 9999;
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1); 
}

// Order Weight Calculator
window.calculateOrderWeight = function(cart) {
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

// --- 2. MAP LOGIC (Light Theme & Routing) ---
let deliveryMap = null;
let deliveryLayerGroup = null;
let routeControl = null;

window.toggleLiveMap = function(forceOpen = false) {
    const mapSection = document.getElementById('liveMapSection');
    if(!mapSection) return;

    if(forceOpen || mapSection.classList.contains('hidden')) {
        mapSection.classList.remove('hidden');
        window.isMapOpen = true;
        setTimeout(() => {
            initDeliveryMap();
            updateMapVisuals();
            renderActiveWholesalerWidget(); // Load Carousel
        }, 300);
    }
}

window.initDeliveryMap = function() {
    if(deliveryMap) {
        deliveryMap.invalidateSize();
        return;
    }
    const startLat = window.myLat || 20.5937;
    const startLng = window.myLng || 78.9629;

    deliveryMap = L.map('deliveryMap', {
        zoomControl: true, 
        attributionControl: false
    }).setView([startLat, startLng], 14);

    // LIGHT THEME TILES (CartoDB Voyager)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
    }).addTo(deliveryMap);

    deliveryLayerGroup = L.layerGroup().addTo(deliveryMap);
    document.getElementById('mapLoader').classList.add('hidden');
}

window.recenterMap = function() {
    if(deliveryMap && window.myLat && window.myLng) {
        deliveryMap.flyTo([window.myLat, window.myLng], 16, { animate: true, duration: 1.5 });
    } else {
        showToast("Waiting for GPS...");
    }
}

window.updateMapVisuals = function() {
    if(!deliveryMap || !deliveryLayerGroup) return;

    deliveryLayerGroup.clearLayers();
    
    // Clear old route if exists
    if(routeControl) {
        try { deliveryMap.removeControl(routeControl); } catch(e) {}
        routeControl = null;
    }

    // 1. RIDER MARKER
    if(window.myLat && window.myLng) {
        const riderIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color:#3b82f6; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 0 15px rgba(59, 130, 246, 0.4); animation: pulse-blue 2s infinite;">
                    <i class="fa-solid fa-motorcycle text-white text-sm"></i>
                   </div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        L.marker([window.myLat, window.myLng], {icon: riderIcon}).addTo(deliveryLayerGroup);
    }

    // 2. CUSTOMER / DESTINATION MARKER & ROUTE
    if(window.activeOrder && window.activeOrder.location && window.activeOrder.location.lat) {
        const custLat = window.activeOrder.location.lat;
        const custLng = window.activeOrder.location.lng;

        const custIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color:#22c55e; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <i class="fa-solid fa-house text-white text-xs"></i>
                   </div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        L.marker([custLat, custLng], {icon: custIcon})
            .bindPopup(`<b style="color:#111827">Customer</b>`)
            .addTo(deliveryLayerGroup);
        
        // DRAW ROUTE (Turn-by-Turn)
        if(window.myLat && window.myLng) {
            drawRoute(window.myLat, window.myLng, custLat, custLng);
        }
    }

    // 3. WHOLESALER MARKERS (With Distance Popup)
    if(window.approvedWholesalers && window.approvedWholesalers.length > 0) {
        window.approvedWholesalers.forEach(ws => {
            if(ws.location && ws.location.lat) {
                const dist = getDistance(window.myLat, window.myLng, ws.location.lat, ws.location.lng);
                if(dist <= 5) { 
                    const shopIcon = L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div style="background-color:#f59e0b; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; border: 1px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                <i class="fa-solid fa-shop text-white text-[10px]"></i>
                               </div>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });
                    
                    L.marker([ws.location.lat, ws.location.lng], {icon: shopIcon})
                        .bindPopup(`
                            <div class="text-center p-1">
                                <b style="color:#d97706; font-size:12px;">${ws.shopName}</b><br>
                                <span style="font-size:10px; color:#6b7280;">${dist} KM Away</span><br>
                                <a href="tel:${ws.ownerMobile}" style="color:#2563eb; font-weight:bold; font-size:10px; text-decoration:none;">📞 CALL</a>
                            </div>
                        `)
                        .addTo(deliveryLayerGroup);
                }
            }
        });
    }
}

// --- NEW ROUTING FUNCTION ---
function drawRoute(startLat, startLng, endLat, endLng) {
    if(!deliveryMap) return;

    routeControl = L.Routing.control({
        waypoints: [
            L.latLng(startLat, startLng),
            L.latLng(endLat, endLng)
        ],
        lineOptions: {
            styles: [{color: '#3b82f6', opacity: 0.8, weight: 6}]
        },
        createMarker: function() { return null; }, // We use our own markers
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        showAlternatives: false,
        containerClassName: 'hidden-routing-container' // Hidden via CSS
    }).on('routesfound', function(e) {
        const routes = e.routes;
        const summary = routes[0].summary;
        
        // Update Dashboard with Real Road Data
        const distKm = (summary.totalDistance / 1000).toFixed(1);
        const timeMin = Math.round(summary.totalTime / 60);
        
        const timeBox = document.getElementById('liveTimeBox');
        const distBox = document.getElementById('liveDistBox');
        
        if(timeBox) timeBox.innerText = timeMin + " min";
        if(distBox) distBox.innerText = distKm + " KM";
        
    }).addTo(deliveryMap);
}

// --- 3. SMART DASHBOARD (Left Carousel + Right Distance) ---

let currentShopIndex = 0;
let nearbyShopsCache = [];

window.renderActiveWholesalerWidget = function() {
    const container = document.getElementById('activeWholesalerCard');
    const nextBtn = document.getElementById('btnNextShop');
    
    if(!container) return;

    // Filter Nearby Shops
    if(window.approvedWholesalers && window.approvedWholesalers.length > 0) {
        nearbyShopsCache = window.approvedWholesalers.map(ws => {
            const d = parseFloat(getDistance(window.myLat, window.myLng, ws.location.lat, ws.location.lng));
            return { ...ws, dist: d };
        }).sort((a, b) => a.dist - b.dist).slice(0, 5); // Take top 5
    }

    if(nearbyShopsCache.length === 0) {
        container.innerHTML = `<div class="flex items-center justify-center h-full text-gray-400 text-xs gap-2"><i class="fa-solid fa-store-slash"></i> No shops nearby</div>`;
        if(nextBtn) nextBtn.classList.add('hidden');
        return;
    }

    // Show Button if more than 1 shop
    if(nearbyShopsCache.length > 1 && nextBtn) {
        nextBtn.classList.remove('hidden');
        nextBtn.onclick = () => {
            currentShopIndex = (currentShopIndex + 1) % nearbyShopsCache.length;
            renderSingleShopCard(nearbyShopsCache[currentShopIndex]);
        };
    } else if (nextBtn) {
        nextBtn.classList.add('hidden');
    }

    // Render First Shop
    renderSingleShopCard(nearbyShopsCache[currentShopIndex]);
}

function renderSingleShopCard(shop) {
    const container = document.getElementById('activeWholesalerCard');
    if(!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <h4 class="font-bold text-gray-800 text-xs truncate w-[85%]" title="${shop.shopName}">${shop.shopName}</h4>
            <span class="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold">${shop.dist}KM</span>
        </div>
        <p class="text-[9px] text-gray-500 truncate mb-1"><i class="fa-solid fa-map-pin mr-1"></i>${shop.address}</p>
        <div class="flex gap-1.5 mt-auto">
             <button onclick="window.open('tel:${shop.ownerMobile}')" class="bg-gray-100 hover:bg-gray-200 text-gray-600 w-6 h-6 rounded flex items-center justify-center transition"><i class="fa-solid fa-phone text-[10px]"></i></button>
             <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${shop.location.lat},${shop.location.lng}')" class="bg-blue-50 hover:bg-blue-100 text-blue-600 w-6 h-6 rounded flex items-center justify-center transition"><i class="fa-solid fa-location-arrow text-[10px]"></i></button>
             <button onclick="showWholesalerDetails('${shop.shopName}', '${shop.address}', '${shop.ownerMobile}')" class="bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 h-6 rounded text-[9px] font-bold flex-1">View</button>
        </div>
    `;
}

// Fallback distance updater (runs if routing fails or for initial state)
window.updateDashboardDistance = function() {
    // Only update if routing hasn't updated it yet (check for '--')
    const timeBox = document.getElementById('liveTimeBox');
    if(timeBox && timeBox.innerText !== '--') return; // Routing is working

    const distBox = document.getElementById('liveDistBox');
    if(!distBox || !window.activeOrder || !window.activeOrder.location) return;
    
    const d = getDistance(window.myLat, window.myLng, window.activeOrder.location.lat, window.activeOrder.location.lng);
    distBox.innerText = d + " KM";
    if(timeBox) timeBox.innerText = Math.ceil(d * 3) + " min"; // Rough estimate
}


// --- 4. EXTERNAL ACTIONS ---

window.changePin = function() { 
    toggleMenu(); 
    const p = prompt("New PIN:"); 
    if(p && p.length===4) window.db.ref('deliveryBoys/'+window.session.mobile).update({pin:p}).then(()=>showToast("PIN Changed")); 
}

window.updateVehicle = function() { 
    toggleMenu(); 
    const v = prompt("Vehicle (Bike/Cycle):"); 
    if(v) { 
        window.db.ref('deliveryBoys/'+window.session.mobile).update({vehicle:v}); 
        window.session.vehicle=v; 
        localStorage.setItem('rmz_delivery_user',JSON.stringify(window.session)); 
        document.getElementById('vehicleType').innerText=v; 
    }
}

window.logout = function() { 
    localStorage.removeItem('rmz_delivery_user'); 
    window.location.href='delivery-login.html'; 
}

window.triggerSOS = function(adminNumber) {
    if(!confirm("⚠️ SEND EMERGENCY SOS? \nLocation will be shared with Admin & Team.")) return;
    const message = `🚨 *SOS EMERGENCY* 🚨\n\nPartner: ${window.session.name}\nPhone: ${window.session.mobile}\nLocation: https://maps.google.com/?q=${window.myLat},${window.myLng}\n\n*Call Immediately!*`;
    window.open(`https://wa.me/91${adminNumber}?text=${encodeURIComponent(message)}`, '_blank');
}

window.openMapDirect = function(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
}

window.openMap = function(type) { 
    if(!window.activeOrder || !window.activeOrder.location) return;
    const lat = window.activeOrder.location.lat;
    const lng = window.activeOrder.location.lng;
    
    if(type === 'dir') window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    else if (type === 'view') window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank');
}

window.callCust = function() { if(window.activeOrder && window.activeOrder.user) window.open(`tel:${window.activeOrder.user.mobile}`); }
window.openWhatsApp = function() { if(window.activeOrder && window.activeOrder.user) window.open(`https://wa.me/91${window.activeOrder.user.mobile}`, '_blank'); }

window.triggerCelebration = function() {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    const overlay = document.getElementById('celebrationOverlay');
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.add('hidden'), 3000);
}

// --- 5. WHOLESALER LOGIC (Strip & Modal) ---

window.updateWholesalerDisplay = function() {
    const strip = document.getElementById('wholesalerStrip');
    const container = document.getElementById('wsListContainer');
    if(!strip || !container) return;
    
    if(!window.approvedWholesalers || !window.approvedWholesalers.length || !window.isOnline) {
        strip.classList.add('hidden');
        return;
    }

    const nearby = window.approvedWholesalers.map(ws => {
        let lat = ws.location ? ws.location.lat : 0;
        let lng = ws.location ? ws.location.lng : 0;
        const d = parseFloat(getDistance(window.myLat, window.myLng, lat, lng));
        return { ...ws, dist: d };
    }).sort((a, b) => a.dist - b.dist);

    if(!nearby.length || (window.activeOrder || document.getElementById('ordersContainer').classList.contains('hidden'))) {
        strip.classList.add('hidden');
        return;
    }

    strip.classList.remove('hidden');
    container.innerHTML = '';

    nearby.forEach(ws => {
        const div = document.createElement('div');
        div.className = "flex-shrink-0 w-64 bg-white border border-gray-200 rounded-xl p-3 relative snap-center shadow-sm";
        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-bold text-gray-900 text-sm truncate w-3/4">${ws.shopName}</h4>
                <span class="text-[10px] bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded font-bold">${ws.dist} KM</span>
            </div>
            <p class="text-[10px] text-gray-500 mb-3 truncate"><i class="fa-solid fa-location-dot mr-1"></i>${ws.address}</p>
            <div class="flex gap-2">
                <button onclick="window.open('tel:${ws.ownerMobile}')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 w-8 h-8 rounded-lg flex items-center justify-center transition"><i class="fa-solid fa-phone text-xs"></i></button>
                <button onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${ws.location.lat},${ws.location.lng}')" class="bg-blue-50 hover:bg-blue-100 text-blue-600 w-8 h-8 rounded-lg flex items-center justify-center transition"><i class="fa-solid fa-location-arrow text-xs"></i></button>
                <button onclick="showWholesalerDetails('${ws.shopName}', '${ws.address}', '${ws.ownerMobile}')" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 h-8 rounded-lg text-[10px] font-bold flex-1 transition">View More</button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.showWholesalerDetails = function(name, addr, mob) {
    alert(`🏪 ${name}\n\n📍 ${addr}\n\n📞 ${mob}`);
}

window.openWholesalerModal = function() {
    toggleMenu();
    const modal = document.getElementById('wholesalerModal');
    modal.classList.remove('hidden');
    const scrollContainer = modal.querySelector('.overflow-y-auto');
    if(scrollContainer) scrollContainer.scrollTop = 0;
    resetWsForm();
    loadMyWholesalerRequests();
}

window.closeWholesalerModal = function() {
    document.getElementById('wholesalerModal').classList.add('hidden');
    if (window.myWholesalerQuery) {
        window.myWholesalerQuery.off();
        window.myWholesalerQuery = null;
    }
}

window.resetWsForm = function() {
    document.getElementById('wsName').value = '';
    document.getElementById('wsMobile').value = '';
    document.getElementById('wsAddress').value = '';
    document.getElementById('wsLat').value = '';
    document.getElementById('wsLng').value = '';
    document.getElementById('wsEditId').value = '';
    document.getElementById('btnConnectLoc').innerHTML = '<i class="fa-solid fa-location-crosshairs text-lg"></i> Connect Live Location';
    document.getElementById('btnWsSubmit').innerText = "SUBMIT FOR VERIFICATION";
}

window.connectWholesalerLocation = function() {
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
        btn.classList.replace('bg-blue-50', 'bg-green-50');
        btn.classList.replace('text-blue-600', 'text-green-600');
        
        document.getElementById('wsAddress').value = "Fetching address details...";
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await response.json();
            document.getElementById('wsAddress').value = data && data.display_name ? data.display_name : `Lat: ${lat}, Lng: ${lng}`;
        } catch(e) {
            document.getElementById('wsAddress').value = `Lat: ${lat}, Lng: ${lng} (Type Address manually)`;
        }
    }, (err) => {
        alert("GPS Access Denied: " + err.message);
        btn.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Retry Location';
    }, { enableHighAccuracy: true });
}

window.submitWholesalerRequest = function() {
    const name = document.getElementById('wsName').value.trim();
    const mobile = document.getElementById('wsMobile').value.trim();
    const address = document.getElementById('wsAddress').value.trim();
    const lat = document.getElementById('wsLat').value;
    const lng = document.getElementById('wsLng').value;
    const editId = document.getElementById('wsEditId').value;

    if(!name || !mobile || !address) return showToast("Fill all fields");
    if(!lat || !lng) return showToast("Connect Location First");

    const data = {
        partnerMobile: String(window.session.mobile),
        partnerName: window.session.name,
        shopName: name,
        ownerMobile: mobile,
        address: address,
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
        status: 'pending', 
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    if(editId) {
        window.db.ref('wholesalerRequests/' + editId).update(data).then(() => { showToast("Shop Updated!"); resetWsForm(); });
    } else {
        window.db.ref('wholesalerRequests').push(data).then(() => { showToast("Submitted Successfully!"); resetWsForm(); });
    }
}

window.loadMyWholesalerRequests = function() {
    const list = document.getElementById('myWholesalerList');
    if(!list) return;
    list.innerHTML = '<p class="text-center text-gray-500 text-xs py-2"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p>';
    if (window.myWholesalerQuery) window.myWholesalerQuery.off();
    
    window.myWholesalerQuery = window.db.ref('wholesalerRequests').orderByChild('partnerMobile').equalTo(String(window.session.mobile));
    window.myWholesalerQuery.on('value', snap => {
        list.innerHTML = '';
        if(snap.exists()) {
            const requests = [];
            snap.forEach(c => requests.push({key: c.key, ...c.val()}));
            requests.reverse(); 

            requests.forEach(req => {
                let statusBadge = req.status === 'approved' ? `<span class="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded border border-green-200 uppercase font-bold"><i class="fa-solid fa-check-circle mr-1"></i> Verified</span>` : 
                                 (req.status === 'pending' ? `<span class="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded border border-amber-200 uppercase font-bold">Pending</span>` : 
                                 `<span class="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded border border-red-200 uppercase font-bold">Disabled</span>`);
                
                let actions = req.status === 'pending' ? `
                    <div class="flex gap-2 mt-2">
                        <button onclick="editWsRequest('${req.key}', '${req.shopName}', '${req.ownerMobile}', '${req.address}', ${req.location.lat}, ${req.location.lng})" class="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded text-gray-700 flex-1 font-bold">Edit</button>
                        <button onclick="window.db.ref('wholesalerRequests/${req.key}').remove()" class="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded border border-red-200 flex-1 font-bold">Delete</button>
                    </div>` : '';

                list.innerHTML += `
                    <div class="bg-white p-3 rounded-xl border border-gray-200 ${req.status === 'disabled' ? 'opacity-50' : ''} shadow-sm">
                        <div class="flex justify-between items-start mb-1">
                            <h4 class="font-bold text-gray-900 text-sm">${req.shopName}</h4>
                            ${statusBadge}
                        </div>
                        <p class="text-[10px] text-gray-500 font-mono mb-1"><i class="fa-solid fa-phone mr-1"></i>${req.ownerMobile}</p>
                        <p class="text-[10px] text-gray-600 truncate"><i class="fa-solid fa-map-pin mr-1"></i>${req.address}</p>
                        ${actions}
                    </div>
                `;
            });
        } else {
            list.innerHTML = '<p class="text-center text-gray-500 text-xs py-4">You haven\'t added any shops yet.</p>';
        }
    });
}

window.editWsRequest = function(key, name, mobile, address, lat, lng) {
    document.getElementById('wsEditId').value = key;
    document.getElementById('wsName').value = name;
    document.getElementById('wsMobile').value = mobile;
    document.getElementById('wsAddress').value = address;
    document.getElementById('wsLat').value = lat;
    document.getElementById('wsLng').value = lng;
    document.getElementById('btnConnectLoc').innerHTML = '<i class="fa-solid fa-check"></i> Location Set (Tap to Update)';
    document.getElementById('btnWsSubmit').innerText = "UPDATE REQUEST";
    const modal = document.getElementById('wholesalerModal');
    const scrollContainer = modal.querySelector('.overflow-y-auto');
    if(scrollContainer) scrollContainer.scrollTop = 0;
}


