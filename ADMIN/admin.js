// ==========================================
// 1. CONFIGURATION & SETUP
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    databaseURL: "https://tipsplit-e3wes-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.firebasestorage.app",
    messagingSenderId: "984733883633",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};

// Initialize ImageKit for Banner Uploads
const imageKit = new ImageKit({
    publicKey: "public_key_test", 
    urlEndpoint: "https://ik.imagekit.io/your_id", 
});

// Initialize Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================================
// 2. GLOBAL VARIABLES & STATE
// ==========================================

// Maps & Location
let map = null;
let markers = {};
let layerGroup = null; 
let adminLat = null;
let adminLng = null;
let currentMapFilter = 'all'; // 'all', 'online', 'offline'

// Charts & Analytics
let salesChartInstance = null;

// Data Stores (Local Cache)
let partnersData = {}; // Stores all delivery boys data
let ordersData = {};   // Stores active orders

// Assignment Logic
let selectedOrderIdForAssignment = null;

// PIN Recovery Logic Variables (Used in Managers)
let recTargetMobile = null;
let recTargetPin = null;
let recTargetName = null;
let recTargetContext = null; 
let recTargetShop = null;

// Partner Management Variables (Used in Managers)
let currentPartnerTab = 'active'; 
let currentPartnerMobile = null; 

// ==========================================
// 3. INITIALIZATION
// ==========================================

window.onload = () => {
    try {
        console.log("System Initializing...");
        
        // 1. Set Date
        if(document.getElementById('todayDateDisplay')) 
            document.getElementById('todayDateDisplay').innerText = new Date().toLocaleDateString();
        
        // 2. Get Admin GPS
        getAdminLocation();
        
        // 3. Start Core Listeners
        trackPartners(); // Loads Partner Data for Team Tab & Map
        
        // 4. Set Default Tab
        switchTab('orders');
        
    } catch (e) {
        console.error("Critical Init Error:", e);
        showToast("System Init Failed: " + e.message);
    }
};

// ==========================================
// 4. NAVIGATION & UI UTILITIES
// ==========================================

function switchTab(tabId) { 
    const tabs = ['orders', 'map', 'analytics', 'history', 'partners', 'alerts', 'content'];
    
    // Hide all
    tabs.forEach(t => {
        const el = document.getElementById('tab-' + t);
        if(el) el.classList.add('hidden'); 
        
        // Update Desktop Nav
        const nav = document.getElementById('nav-' + t);
        if(nav) nav.classList.remove('active'); 
        
        // Update Mobile Nav
        const mob = document.getElementById('mob-' + t);
        if(mob) { 
            mob.classList.replace('bg-blue-600', 'text-slate-400'); 
            mob.classList.remove('text-white'); 
        }
    }); 
    
    // Show Target
    const target = document.getElementById('tab-' + tabId);
    if(target) target.classList.remove('hidden'); 
    
    // Highlight Nav
    const activeNav = document.getElementById('nav-' + tabId);
    if(activeNav) activeNav.classList.add('active'); 
    
    const activeMob = document.getElementById('mob-' + tabId); 
    if(activeMob) { 
        activeMob.classList.add('bg-blue-600', 'text-white'); 
        activeMob.classList.remove('text-slate-400'); 
    } 

    // Specific Tab Actions
    if(tabId === 'map') { 
        setTimeout(() => { 
            if(!map) initMap(); 
            else map.invalidateSize(); 
        }, 200); 
    }
    
    // Call functions from admin-managers.js if they exist
    if(tabId === 'analytics' && typeof initAnalytics === 'function') { 
        initAnalytics(); 
    }

    if(tabId === 'content' && typeof loadVideos === 'function') {
        loadVideos(); 
    }
}

function toggleDrawer() {
    const drawer = document.getElementById('menuDrawer');
    const overlay = document.getElementById('drawerOverlay');
    
    if(drawer.classList.contains('open')) { 
        drawer.classList.remove('open'); 
        overlay.classList.add('hidden'); 
    } else { 
        drawer.classList.add('open'); 
        overlay.classList.remove('hidden'); 
    }
}

function openModal(id) { 
    // Close sidebar if open
    const d = document.getElementById('menuDrawer');
    if(d && d.classList.contains('open')) toggleDrawer();

    const modal = document.getElementById(id);
    if(modal) {
        modal.classList.remove('hidden');
        
        // Load Data based on modal type (Functions in admin-managers.js)
        if(id === 'customerModal' && typeof loadCustomers === 'function') loadCustomers(); 
        if(id === 'partnerModal' && typeof renderAllPartnerViews === 'function') renderAllPartnerViews(); 
        if(id === 'bannerModal' && typeof loadBanners === 'function') loadBanners(); 
        if(id === 'masterProductModal' && typeof loadMasterProducts === 'function') loadMasterProducts(); 
    }
}

function closeModal(id) { 
    const modal = document.getElementById(id);
    if(modal) modal.classList.add('hidden'); 
}

function logout() { 
    if(confirm("Are you sure you want to log out?")) {
        window.location.href = 'index.html'; 
    }
}

function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if(t) {
        document.getElementById('toastMsg').innerText = msg; 
        t.classList.remove('opacity-0', 'pointer-events-none'); 
        
        setTimeout(() => {
            t.classList.add('opacity-0', 'pointer-events-none');
        }, 3000); 
    }
}

// ==========================================
// 5. CORE PARTNER TRACKING (Listener)
// ==========================================

function trackPartners() {
    db.ref('deliveryBoys').on('value', snap => {
        if(snap.exists()) {
            partnersData = snap.val();
            renderDashboardTeamList(); // Kept in core for dashboard view
            
            // Call Manager functions if available
            if(typeof renderPartnerModalList === 'function') renderPartnerModalList();
            if(typeof updatePartnerBadges === 'function') updatePartnerBadges();
            
            updateMapCounts();
            renderMarkers();
            
            if(currentPartnerMobile && !document.getElementById('partnerFullDetailModal').classList.contains('hidden')) {
                if(typeof refreshNanoModal === 'function') refreshNanoModal(currentPartnerMobile);
            }
        } else {
            partnersData = {};
            renderDashboardTeamList();
            if(typeof renderPartnerModalList === 'function') renderPartnerModalList();
        }
    });
}

// Simple Dashboard List Render (Kept in Core)
function renderDashboardTeamList() {
    const tableBody = document.getElementById('partnersTable');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    
    if(Object.keys(partnersData).length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500 text-sm">No partners registered yet.</td></tr>`;
        return;
    }

    Object.entries(partnersData).forEach(([mobile, p]) => {
        if(p.status === 'pending' || !p.name) return;

        const isOnline = p.status === 'online';
        const isDisabled = p.status === 'disabled';
        
        let statusHtml = '';
        if(isOnline) statusHtml = `<span class="px-2 py-1 rounded text-[10px] font-bold bg-green-900/30 text-green-400 border border-green-900">ONLINE</span>`;
        else if(isDisabled) statusHtml = `<span class="px-2 py-1 rounded text-[10px] font-bold bg-red-900/30 text-red-400 border border-red-900">DISABLED</span>`;
        else statusHtml = `<span class="px-2 py-1 rounded text-[10px] font-bold bg-slate-700 text-slate-400 border border-slate-600">OFFLINE</span>`;
        
        const lastActive = p.lastHeartbeat ? new Date(p.lastHeartbeat).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Never';
        const battery = p.battery ? `<i class="fa-solid fa-battery-half text-slate-400 mr-1"></i>${p.battery}` : '-';

        tableBody.innerHTML += `
            <tr class="hover:bg-slate-800/50 transition">
                <td class="p-4">
                    <div class="font-bold text-white flex items-center gap-2">
                        ${p.name}
                        <a href="https://wa.me/91${mobile}" target="_blank" class="text-green-500 hover:text-green-400" title="Chat on WhatsApp">
                            <i class="fa-brands fa-whatsapp"></i>
                        </a>
                    </div>
                    <div class="text-[10px] text-slate-500 font-mono">${mobile}</div>
                </td>
                <td class="p-4">${statusHtml}</td>
                <td class="p-4 text-xs font-mono text-slate-400">${battery}</td>
                <td class="p-4 text-sm font-bold text-green-400">₹${p.earnings || 0}</td>
                <td class="p-4 text-xs font-mono text-slate-500">${lastActive}</td>
            </tr>
        `;
    });
}

// ==========================================
// 6. ORDER MANAGEMENT & LIVE TRACKING
// ==========================================

db.ref('orders').limitToLast(100).on('value', snap => {
    const liveGrid = document.getElementById('ordersGrid');
    const histGrid = document.getElementById('historyGrid');
    const notifList = document.getElementById('notificationList');
    const noAlerts = document.getElementById('noAlertsMsg');
    
    if(liveGrid) liveGrid.innerHTML = ''; 
    if(histGrid) histGrid.innerHTML = ''; 
    if(notifList) notifList.innerHTML = '';
    
    let totalRevenue = 0;
    let activeCount = 0;
    let todayAlertCount = 0;
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);

    if(snap.exists()) {
        Object.entries(snap.val()).reverse().forEach(([id, order]) => {
            if(order.status === 'delivered') totalRevenue += parseInt(order.payment.deliveryFee || 0);
            else activeCount++;

            const cardHTML = createOrderCard(id, order);
            if(order.status === 'delivered') { 
                if(histGrid) histGrid.innerHTML += cardHTML; 
            } else { 
                if(liveGrid) liveGrid.innerHTML += cardHTML; 
            }

            if(new Date(order.timestamp) >= startOfToday) {
                todayAlertCount++;
                const statusColor = order.status === 'delivered' ? 'text-green-400' : (order.status === 'placed' ? 'text-amber-400' : 'text-blue-400');
                
                let partnerNameDisplay = "";
                if(order.deliveryBoyName) {
                    partnerNameDisplay = `<p class=\"text-[9px] text-blue-300 font-mono mt-0.5\"><i class=\"fa-solid fa-motorcycle\"></i> ${order.deliveryBoyName}</p>`;
                }

                if(notifList) notifList.innerHTML += `
                    <div class="p-4 flex justify-between items-center hover:bg-slate-800/50 transition border-b border-slate-800 last:border-0">
                        <div class="flex items-center gap-3">
                            <div class="w-2 h-2 rounded-full ${order.status === 'delivered' ? 'bg-green-500' : 'bg-slate-500'}"></div>
                            <div>
                                <p class="text-sm font-bold text-white">${order.user.name}</p>
                                <p class="text-[10px] text-slate-500">Shop: ${order.user.shopName}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="text-xs font-bold uppercase ${statusColor}">${order.status}</span>
                            ${partnerNameDisplay}
                            <p class="text-[9px] text-slate-600">#${order.orderId.slice(-6)}</p>
                            <p class="text-[9px] text-slate-600">${new Date(order.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                        </div>
                    </div>
                `;
            }
        });
    } else if(liveGrid) {
        liveGrid.innerHTML = `<div class="text-slate-500 col-span-full text-center py-10">No Active Orders</div>`;
    }

    if(document.getElementById('totalRev')) document.getElementById('totalRev').innerText = totalRevenue;
    if(document.getElementById('anTotalRev')) document.getElementById('anTotalRev').innerText = totalRevenue;
    
    const ae = [
        document.getElementById('sidebarActiveCount'), 
        document.getElementById('mobActiveCount'), 
        document.getElementById('headerActiveCount')
    ];
    ae.forEach(el => { 
        if(el) { 
            if(activeCount > 0) { 
                el.innerText = activeCount + (el.id==='headerActiveCount' ? ' Active' : ''); 
                el.classList.remove('hidden'); 
            } else {
                el.classList.add('hidden'); 
            }
        } 
    });
    
    if(noAlerts) {
        if(todayAlertCount === 0) noAlerts.classList.remove('hidden'); 
        else noAlerts.classList.add('hidden');
    }
});

function formatTimeAMPM(timestamp) {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const strTime = hours + ':' + (minutes < 10 ? '0' + minutes : minutes) + ' ' + ampm;
    return strTime;
}

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

function createOrderCard(id, order) {
    let productsHTML = ''; 
    let waItems = ''; 
    let specialReqHTML = '';

    if(order.cart) order.cart.forEach(i => {
        if (i.qty === 'Special Request') {
            specialReqHTML += `
                <div class="bg-amber-900/20 border border-amber-600/50 p-2 rounded text-xs text-amber-200 mt-2 flex items-start gap-2">
                    <i class="fa-solid fa-pen-to-square mt-0.5 text-amber-500"></i>
                    <div>
                        <p class="font-bold uppercase text-[9px] text-amber-500 mb-0.5">Special Request</p>
                        <p>${i.name}</p>
                    </div>
                </div>
            `;
            waItems += `✨ REQUEST: ${i.name}\n`;
        } else {
            productsHTML += `
                <div class="flex justify-between text-xs py-1 border-b border-slate-800 last:border-0">
                    <span class="text-slate-300">${i.count}x ${i.name}</span>
                    <span class="text-slate-500">${i.qty}</span>
                </div>`;
            waItems += `${i.name} (${i.qty}) x${i.count}\n`;
        }
    });

    let stClass = 'st-placed'; 
    let partnerInfo = '';

    if(order.status === 'accepted' || order.status === 'out_for_delivery') { 
        stClass = 'st-accepted'; 
        partnerInfo = `<div class="text-[10px] text-blue-400 mt-1"><i class="fa-solid fa-motorcycle"></i> ${order.deliveryBoyName || 'Partner'}</div>`;
    }
    
    if(order.status === 'delivered') {
        stClass = 'st-delivered';
        if(order.deliveryBoyName) {
            partnerInfo = `<div class="text-[10px] text-green-500 mt-1 font-bold"><i class="fa-solid fa-user-check"></i> Delivered by ${order.deliveryBoyName}</div>`;
        }
    }

    let adminAction = '';
    const hasGPS = order.location && order.location.lat && order.location.lng;
    const btnAction = hasGPS ? `openDistanceModal('${id}', ${order.location.lat}, ${order.location.lng})` : `openAssignModal('${id}')`;
    const btnIcon = hasGPS ? `<i class="fa-solid fa-map-location-dot ml-1"></i>` : `<i class="fa-solid fa-user-plus ml-1"></i>`;
    const btnText = hasGPS ? "CHECK RIDERS (KM)" : "ASSIGN PARTNER";

    if(order.status === 'placed') {
        adminAction = `<button onclick="${btnAction}" class="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-lg transition shadow-lg shadow-indigo-500/20">${btnText} ${btnIcon}</button>`;
    } else if (order.status === 'accepted') {
        adminAction = `<button onclick="${btnAction}" class="w-full mt-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded transition">RE-ASSIGN (Check KM)</button>`;
    }

    const prefTime = order.preferences && order.preferences.deliveryTime ? order.preferences.deliveryTime : "Standard";
    const prefBudg = order.preferences && order.preferences.budget ? order.preferences.budget : "Standard";
    const orderWeight = calculateOrderWeight(order.cart);
    const weightBadge = `<span class="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] font-bold border border-slate-600"><i class="fa-solid fa-weight-hanging mr-1 text-gray-400"></i>${orderWeight} KG</span>`;
    const orderTimeStr = formatTimeAMPM(order.timestamp);

    let distBadge = '';
    if(adminLat && order.location && order.location.lat) {
        const d = getDistance(adminLat, adminLng, order.location.lat, order.location.lng);
        distBadge = `<span class="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] ml-1 border border-slate-700 shrink-0"><i class="fa-solid fa-route text-blue-400"></i> ${d} KM</span>`;
    }

    const waLink = `https://wa.me/?text=${encodeURIComponent(`*Customer:* ${order.user.name}\n*Order ID:* #${order.orderId}\n\n*Items:*\n${waItems}`)}`;

    return `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 hover:border-slate-700 transition relative overflow-hidden group">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-white text-base">${order.user.name}</h3>
                    <p class="text-xs text-blue-400 font-mono mt-0.5"><i class="fa-solid fa-phone mr-1"></i>${order.user.mobile}</p>
                </div>
                <span class="status-badge ${stClass}">${order.status}</span>
            </div>
            
            <div class="text-[10px] text-slate-500 bg-slate-950/50 p-1.5 rounded flex items-center gap-1">
                <i class="fa-solid fa-store"></i> Shop: ${order.user.shopName}
            </div>
            
            <div class="bg-slate-950 rounded p-2 max-h-24 overflow-y-auto prod-list">
                ${productsHTML}
            </div>
            
            <div class="flex gap-2 flex-wrap">
                <span class="bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-800"><i class="fa-regular fa-clock mr-1"></i>${prefTime}</span>
                <span class="bg-pink-900/50 text-pink-300 px-2 py-0.5 rounded text-[10px] font-bold border border-pink-800"><i class="fa-solid fa-wallet mr-1"></i>${prefBudg}</span>
                <span class="time-badge-style px-2 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-hourglass-start mr-1"></i>${orderTimeStr}</span>
                ${weightBadge}
            </div>

            <div class="bg-slate-950 rounded p-2 text-xs text-slate-400 flex justify-between items-center">
                <span class="truncate w-full block" title="${order.location.address}">
                    <i class="fa-solid fa-location-dot mr-1"></i> ${order.location.address}
                </span>
                ${distBadge}
            </div>

            ${specialReqHTML}
            ${partnerInfo}
            ${adminAction}
            
            <div class="mt-auto pt-3 border-t border-slate-800 flex justify-between items-center">
                <div>
                    <span class="block text-[10px] text-slate-500 uppercase font-bold">Fee</span>
                    <span class="font-bold text-white text-lg">₹${order.payment.deliveryFee}</span>
                </div>
                <div class="flex gap-2">
                    <a href="${waLink}" target="_blank" class="w-8 h-8 rounded bg-green-900/40 text-green-500 border border-green-800 flex items-center justify-center hover:bg-green-600 hover:text-white transition"><i class="fa-brands fa-whatsapp text-sm"></i></a>
                    <a href="https://maps.google.com/?q=${order.location.lat},${order.location.lng}" target="_blank" class="w-8 h-8 rounded bg-slate-800 flex items-center justify-center hover:bg-blue-600 hover:text-white transition"><i class="fa-solid fa-map-location-dot text-xs"></i></a>
                    <a href="tel:${order.user.mobile}" class="w-8 h-8 rounded bg-slate-800 flex items-center justify-center hover:bg-green-600 hover:text-white transition"><i class="fa-solid fa-phone text-xs"></i></a>
                    <button onclick="deleteOrder('${id}')" class="w-8 h-8 rounded bg-slate-800 flex items-center justify-center hover:bg-red-600 hover:text-white transition"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            </div>
        </div>
    `;
}

function deleteOrder(id) { 
    if(confirm("Are you sure you want to Delete this order permanently?")) {
        db.ref('orders/' + id).remove().then(() => showToast("Order Deleted"));
    } 
}

// ==========================================
// 7. ASSIGNMENT & DISTANCE CALCULATOR
// ==========================================

function getAdminLocation() {
    if("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
            adminLat = p.coords.latitude;
            adminLng = p.coords.longitude;
            const status = document.getElementById('adminGpsStatus');
            if(status) {
                status.innerHTML = `<i class="fa-solid fa-location-dot text-green-400"></i> HQ Located`;
                status.classList.replace('text-slate-500', 'text-green-400');
            }
        }, e => console.log("Admin GPS Denied"));
    }
}

function getDistance(lat1, lon1, lat2, lon2) {
    if(!lat1 || !lon1 || !lat2 || !lon2) return "?";
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1); 
}

function openDistanceModal(orderId, custLat, custLng) {
    selectedOrderIdForAssignment = orderId; 
    document.getElementById('calcDistanceModal').classList.remove('hidden');
    const container = document.getElementById('distanceListContainer');
    container.innerHTML = '<p class="text-center text-slate-500 text-xs py-4"><i class="fa-solid fa-spinner fa-spin"></i> Calculating Distances...</p>';

    const partners = [];
    if(partnersData) {
        Object.entries(partnersData).forEach(([mobile, boy]) => {
            if(!boy || boy.status === 'pending') return;
            let distVal = 9999;
            if(boy.location && boy.location.lat && boy.location.lng) {
                distVal = parseFloat(getDistance(custLat, custLng, boy.location.lat, boy.location.lng));
            }
            partners.push({ ...boy, mobile, dist: distVal });
        });
    }

    partners.sort((a, b) => a.dist - b.dist);

    container.innerHTML = '';
    if(partners.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-500 text-xs">No active partners found.</p>';
        return;
    }

    partners.forEach(p => {
        const isOnline = p.status === 'online';
        const distDisplay = p.dist === 9999 ? "Unknown Loc" : `${p.dist} KM`;
        const statusColor = isOnline ? 'text-green-400' : 'text-slate-500';
        const btnState = isOnline ? '' : 'disabled style="opacity:0.5; cursor:not-allowed;"';
        
        const div = document.createElement('div');
        div.className = "bg-slate-800 border border-slate-700 p-3 rounded-xl flex justify-between items-center mb-2";
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-xs font-bold border border-slate-600 ${isOnline ? 'border-green-500' : ''}">
                    ${p.name.charAt(0)}
                </div>
                <div>
                    <h4 class="font-bold text-white text-sm">${p.name} <span class="text-[10px] ${statusColor}">(${p.status})</span></h4>
                    <p class="text-xs text-amber-500 font-bold"><i class="fa-solid fa-route"></i> ${distDisplay} away</p>
                </div>
            </div>
            <button onclick="assignToPartner('${p.mobile}', '${p.name}')" class="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-3 py-1.5 rounded transition shadow-lg" ${btnState}>
                ASSIGN
            </button>
        `;
        container.appendChild(div);
    });
}

function openAssignModal(orderId) { 
    selectedOrderIdForAssignment = orderId; 
    document.getElementById('assignModal').classList.remove('hidden'); 
    loadPartnersForAssignment(); 
}

function loadPartnersForAssignment() {
    const container = document.getElementById('partnerListContainer'); 
    container.innerHTML = '';
    
    let hasOnline = false;
    if(partnersData) {
        Object.entries(partnersData).forEach(([mobile, boy]) => {
            if(boy && boy.status === 'online') {
                hasOnline = true;
                const div = document.createElement('div');
                div.className = "partner-select-card bg-slate-800 border border-slate-700 p-3 rounded-xl flex justify-between items-center cursor-pointer transition mb-2";
                div.onclick = () => assignToPartner(mobile, boy.name);
                div.innerHTML = `<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold border border-slate-600">${boy.name.charAt(0)}</div><div><h4 class="font-bold text-white text-sm">${boy.name}</h4><p class="text-[10px] text-slate-400 capitalize">${boy.vehicle}</p></div></div><button class="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full hover:bg-indigo-500">ASSIGN</button>`;
                container.appendChild(div);
            }
        });
    }
    if(!hasOnline) container.innerHTML = '<div class="text-center py-4 text-slate-500 text-xs">No partners Online.</div>';
}

function assignToPartner(mobile, name) {
    if(!selectedOrderIdForAssignment || !confirm(`Assign order to ${name}?`)) return;
    
    db.ref('orders/' + selectedOrderIdForAssignment).update({ 
        status: 'accepted', 
        deliveryBoyId: mobile, 
        deliveryBoyName: name, 
        deliveryBoyMobile: mobile, 
        assignedAt: firebase.database.ServerValue.TIMESTAMP 
    })
    .then(() => { 
        showToast(`Assigned to ${name}`); 
        closeModal('assignModal'); 
        closeModal('calcDistanceModal');
    });
}

// ==========================================
// 8. MAP SYSTEM
// ==========================================

function initMap() {
    if(map) return;
    map = L.map('map').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    document.getElementById('mapLoading').classList.add('hidden');
    layerGroup = L.layerGroup().addTo(map);
    renderMarkers();
}

function setMapFilter(filter) {
    currentMapFilter = filter;
    document.querySelectorAll('.map-filter-btn').forEach(b => {
        b.classList.remove('active', 'border-white', 'bg-slate-700');
        if(b.id === `filter-${filter}`) {
            b.classList.add('active', 'border-white');
            if(filter === 'all') b.classList.add('bg-slate-700');
        }
    });
    renderMarkers();
}

function updateMapCounts() {
    let online = 0, offline = 0;
    if(partnersData) {
        Object.values(partnersData).forEach(boy => {
            if(boy && boy.status === 'online') online++;
            else offline++;
        });
    }
    document.getElementById('cnt-all').innerText = online + offline;
    document.getElementById('cnt-online').innerText = online;
    document.getElementById('cnt-offline').innerText = offline;
}

function renderMarkers() {
    if(!map || !layerGroup) return;
    layerGroup.clearLayers();
    const bounds = [];
    
    if(partnersData) {
        Object.entries(partnersData).forEach(([mobile, boy]) => {
            if(!boy || boy.status === 'pending') return;

            if(boy.location && boy.location.lat && boy.location.lng) {
                const isOnline = boy.status === 'online';
                if(currentMapFilter === 'online' && !isOnline) return;
                if(currentMapFilter === 'offline' && isOnline) return;

                const lat = boy.location.lat;
                const lng = boy.location.lng;
                const color = isOnline ? '#22c55e' : '#ef4444';
                
                const iconHtml = `<div style="background:${color}; width:14px; height:14px; border-radius:50%; border:2px solid white; box-shadow: 0 0 8px ${color};"></div>`;
                const customIcon = L.divIcon({ className: 'custom-map-icon', html: iconHtml, iconSize: [14, 14] });

                const marker = L.marker([lat, lng], {icon: customIcon})
                    .bindPopup(`
                        <div style="text-align:center;">
                            <b style="color:${color}">${boy.name}</b><br>
                            <span style="font-size:10px;">${boy.status.toUpperCase()}</span><br>
                            <span style="font-size:10px;">🔋 ${boy.battery || '?'}</span>
                        </div>
                    `);
                layerGroup.addLayer(marker);
                if(isOnline) bounds.push([lat, lng]);
            }
        });
    }
    if(bounds.length > 0 && currentMapFilter !== 'offline') {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
}
