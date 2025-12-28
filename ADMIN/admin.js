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

const imageKit = new ImageKit({
    publicKey: "public_key_test", 
    urlEndpoint: "https://ik.imagekit.io/your_id", 
});

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let selectedOrderIdForAssignment = null;
let map, markers = {};
let layerGroup = null; // Group to manage markers
let salesChartInstance = null;
let adminLat = null, adminLng = null;
let partnersData = {}; // Store raw data
let currentMapFilter = 'all'; // Default filter

// Variables for PIN Recovery
let recTargetMobile = null;
let recTargetPin = null;
let recTargetName = null;
let recTargetContext = null; // 'customer' or 'partner'
let recTargetShop = null; // Shop Name for dynamic messaging

// --- INITIALIZATION ---
window.onload = () => {
    document.getElementById('todayDateDisplay').innerText = new Date().toLocaleDateString();
    getAdminLocation();
    trackPartnersOnMap(); // Start Listener
};

// --- GET ADMIN LOCATION ---
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

// --- ORDER LISTENER (UPDATED WITH PARTNER NAME) ---
db.ref('orders').on('value', snap => {
    const liveGrid = document.getElementById('ordersGrid');
    const histGrid = document.getElementById('historyGrid');
    const notifList = document.getElementById('notificationList');
    const noAlerts = document.getElementById('noAlertsMsg');
    
    liveGrid.innerHTML = ''; histGrid.innerHTML = ''; notifList.innerHTML = '';
    let totalRevenue = 0, activeCount = 0, todayAlertCount = 0;
    const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);

    if(snap.exists()) {
        Object.entries(snap.val()).reverse().forEach(([id, order]) => {
            if(order.status === 'delivered') totalRevenue += parseInt(order.payment.deliveryFee || 0);
            else activeCount++;

            const cardHTML = createOrderCard(id, order);
            if(order.status === 'delivered') histGrid.innerHTML += cardHTML;
            else liveGrid.innerHTML += cardHTML;

            // Notifications
            if(new Date(order.timestamp) >= startOfToday) {
                todayAlertCount++;
                const statusColor = order.status === 'delivered' ? 'text-green-400' : (order.status === 'placed' ? 'text-amber-400' : 'text-blue-400');
                
                // Show Assigned Partner Name if exists
                let partnerNameDisplay = "";
                if(order.deliveryBoyName) {
                    partnerNameDisplay = `<p class="text-[9px] text-blue-300 font-mono mt-0.5"><i class="fa-solid fa-motorcycle"></i> ${order.deliveryBoyName}</p>`;
                }

                notifList.innerHTML += `
                    <div class="p-4 flex justify-between items-center hover:bg-slate-800/50 transition">
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
                            <p class="text-[10px] text-slate-600">#${order.orderId.slice(-6)}</p>
                            <p class="text-[9px] text-slate-600">${new Date(order.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                        </div>
                    </div>
                `;
            }
        });
    } else liveGrid.innerHTML = `<div class="text-slate-500 col-span-full text-center py-10">No Orders</div>`;

    document.getElementById('totalRev').innerText = totalRevenue;
    const ae = [document.getElementById('sidebarActiveCount'), document.getElementById('mobActiveCount'), document.getElementById('headerActiveCount')];
    ae.forEach(el => { if(activeCount>0) { el.innerText = activeCount+(el.id==='headerActiveCount'?' Active':''); el.classList.remove('hidden'); } else el.classList.add('hidden'); });
    if(todayAlertCount === 0) noAlerts.classList.remove('hidden'); else noAlerts.classList.add('hidden');
});

function createOrderCard(id, order) {
    let productsHTML = ''; let waItems = '';
    if(order.cart) order.cart.forEach(i => {
        productsHTML += `<div class="flex justify-between text-xs py-1 border-b border-slate-800 last:border-0"><span class="text-slate-300">${i.count}x ${i.name}</span><span class="text-slate-500">${i.qty}</span></div>`;
        waItems += `${i.name} (${i.qty}) x${i.count}\n`;
    });

    let stClass = 'st-placed'; let partnerInfo = '';
    if(order.status === 'accepted' || order.status === 'out_for_delivery') { 
        stClass = 'st-accepted'; partnerInfo = `<div class="text-[10px] text-blue-400 mt-1"><i class="fa-solid fa-motorcycle"></i> ${order.deliveryBoyName || 'Partner'}</div>`;
    }
    if(order.status === 'delivered') stClass = 'st-delivered';

    let adminAction = '';
    if(order.status === 'placed') adminAction = `<button onclick="openAssignModal('${id}')" class="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-lg transition shadow-lg shadow-indigo-500/20">ASSIGN PARTNER <i class="fa-solid fa-user-plus ml-1"></i></button>`;
    else if (order.status === 'accepted') adminAction = `<button onclick="openAssignModal('${id}')" class="w-full mt-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded transition">RE-ASSIGN</button>`;

    const prefTime = order.preferences && order.preferences.deliveryTime ? order.preferences.deliveryTime : "Standard";
    const prefBudg = order.preferences && order.preferences.budget ? order.preferences.budget : "Standard";
    
    let distBadge = '';
    if(adminLat && order.location && order.location.lat) {
        const d = getDistance(adminLat, adminLng, order.location.lat, order.location.lng);
        distBadge = `<span class="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] ml-1 border border-slate-700"><i class="fa-solid fa-route text-blue-400"></i> ${d} KM</span>`;
    }

    const waLink = `https://wa.me/?text=${encodeURIComponent(`*Customer:* ${order.user.name}\n*Order ID:* #${order.orderId}\n\n*Items:*\n${waItems}`)}`;

    return `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 hover:border-slate-700 transition relative overflow-hidden">
            <div class="flex justify-between items-start">
                <div><h3 class="font-bold text-white text-base">${order.user.name}</h3><p class="text-xs text-blue-400 font-mono mt-0.5"><i class="fa-solid fa-phone mr-1"></i>${order.user.mobile}</p></div>
                <span class="status-badge ${stClass}">${order.status}</span>
            </div>
            <div class="text-[10px] text-slate-500 bg-slate-950/50 p-1.5 rounded flex items-center gap-1"><i class="fa-solid fa-store"></i> Shop: ${order.user.shopName}</div>
            <div class="bg-slate-950 rounded p-2 max-h-24 overflow-y-auto prod-list">${productsHTML}</div>
            <div class="flex gap-2">
                <span class="bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-800"><i class="fa-regular fa-clock mr-1"></i>${prefTime}</span>
                <span class="bg-pink-900/50 text-pink-300 px-2 py-0.5 rounded text-[10px] font-bold border border-pink-800"><i class="fa-solid fa-wallet mr-1"></i>${prefBudg}</span>
            </div>
            <div class="bg-slate-950 rounded p-2 text-xs text-slate-400 truncate flex justify-between items-center">
                <span><i class="fa-solid fa-location-dot mr-1"></i> ${order.location.address}</span>
                ${distBadge}
            </div>
            ${partnerInfo}
            ${adminAction}
            <div class="mt-auto pt-3 border-t border-slate-800 flex justify-between items-center">
                <div><span class="block text-[10px] text-slate-500 uppercase font-bold">Fee</span><span class="font-bold text-white text-lg">₹${order.payment.deliveryFee}</span></div>
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

// --- MAP & FILTERS (UPDATED) ---
function initMap() {
    if(map) return;
    map = L.map('map').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    document.getElementById('mapLoading').classList.add('hidden');
    layerGroup = L.layerGroup().addTo(map); // Init Layer Group
    
    // We already called trackPartnersOnMap in onload, so data might be ready
    renderMarkers();
}

function setMapFilter(filter) {
    currentMapFilter = filter;
    
    // Update Button UI
    document.querySelectorAll('.map-filter-btn').forEach(b => {
        b.classList.remove('active', 'border-white', 'bg-slate-700');
        if(b.id === `filter-${filter}`) {
            b.classList.add('active', 'border-white');
            if(filter === 'all') b.classList.add('bg-slate-700');
        }
    });

    renderMarkers();
}

function trackPartnersOnMap() {
    db.ref('deliveryBoys').on('value', snap => {
        if(snap.exists()) {
            partnersData = snap.val();
            updateMapCounts();
            renderMarkers();
        }
    });
}

function updateMapCounts() {
    let online = 0, offline = 0;
    Object.values(partnersData).forEach(boy => {
        if(boy.status === 'online') online++;
        else offline++;
    });
    
    document.getElementById('cnt-all').innerText = online + offline;
    document.getElementById('cnt-online').innerText = online;
    document.getElementById('cnt-offline').innerText = offline;
}

function renderMarkers() {
    if(!map || !layerGroup) return;
    layerGroup.clearLayers(); // Clear old markers
    
    const bounds = [];
    
    Object.entries(partnersData).forEach(([mobile, boy]) => {
        if(boy.location && boy.location.lat && boy.location.lng) {
            const isOnline = boy.status === 'online';
            
            // Filter Logic
            if(currentMapFilter === 'online' && !isOnline) return;
            if(currentMapFilter === 'offline' && isOnline) return;

            const lat = boy.location.lat;
            const lng = boy.location.lng;
            const color = isOnline ? '#22c55e' : '#ef4444'; // Tailwind Green-500 : Red-500
            
            // Custom Marker
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

    if(bounds.length > 0 && currentMapFilter !== 'offline') {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
}

// --- ANALYTICS ---
function initAnalytics() {
    db.ref('orders').once('value', snap => {
        let totalOrders = 0, totalRev = 0;
        let customers = new Set();
        let productCounts = {};
        const last7Days = {};
        const today = new Date();
        for(let i=6; i>=0; i--) { const d=new Date(today); d.setDate(today.getDate()-i); last7Days[d.toLocaleDateString()]=0; }

        if(snap.exists()) {
            Object.values(snap.val()).forEach(o => {
                if(o.status === 'delivered') {
                    totalOrders++; totalRev += parseInt(o.payment.deliveryFee || 0);
                    customers.add(o.user.mobile);
                    if(o.cart) o.cart.forEach(p => productCounts[p.name] = (productCounts[p.name] || 0) + (p.count || 1));
                    const dateKey = new Date(o.timestamp).toLocaleDateString();
                    if(last7Days.hasOwnProperty(dateKey)) last7Days[dateKey] += parseInt(o.payment.deliveryFee || 0);
                }
            });
        }

        document.getElementById('anTotalOrders').innerText = totalOrders;
        document.getElementById('anTotalRev').innerText = totalRev;
        document.getElementById('anAvgVal').innerText = totalOrders > 0 ? Math.round(totalRev / totalOrders) : 0;
        document.getElementById('anActiveCust').innerText = customers.size;

        renderSalesChart(Object.keys(last7Days), Object.values(last7Days));

        const sortedProducts = Object.entries(productCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
        const prodContainer = document.getElementById('topProductsList');
        prodContainer.innerHTML = '';
        if(sortedProducts.length > 0) {
            sortedProducts.forEach(([name, count], index) => {
                prodContainer.innerHTML += `<div class="flex justify-between items-center bg-slate-800 p-2 rounded"><span class="truncate flex-1"><span class="text-blue-500 font-bold mr-2">#${index+1}</span>${name}</span><span class="bg-slate-700 px-2 py-0.5 rounded text-xs text-white">${count} sold</span></div>`;
            });
        } else prodContainer.innerHTML = '<p class="text-center text-xs text-slate-500">No sales data yet.</p>';
    });
}

function renderSalesChart(labels, data) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    if(salesChartInstance) salesChartInstance.destroy();
    salesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Sales (₹)', data: data, backgroundColor: '#3b82f6', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8', font: {size: 10} } } } }
    });
}

// --- GENERAL UTILS ---
function switchTab(id) { 
    ['orders','map','analytics','history','partners','alerts'].forEach(t=>{
        document.getElementById('tab-'+t).classList.add('hidden'); 
        document.getElementById('nav-'+t)?.classList.remove('active'); 
        const m = document.getElementById('mob-'+t);
        if(m) { m.classList.replace('bg-blue-600','text-slate-400'); m.classList.remove('text-white'); }
    }); 
    document.getElementById('tab-'+id).classList.remove('hidden'); 
    document.getElementById('nav-'+id)?.classList.add('active'); 
    const m=document.getElementById('mob-'+id); 
    if(m){ m.classList.add('bg-blue-600','text-white'); m.classList.remove('text-slate-400'); } 

    if(id === 'map') { setTimeout(() => { if(!map) initMap(); else map.invalidateSize(); }, 100); }
    if(id === 'analytics') { initAnalytics(); }
}

function toggleDrawer() {
    const d = document.getElementById('menuDrawer'); const o = document.getElementById('drawerOverlay');
    if(d.classList.contains('open')) { d.classList.remove('open'); o.classList.add('hidden'); }
    else { d.classList.add('open'); o.classList.remove('hidden'); }
}
function openModal(id) { toggleDrawer(); document.getElementById(id).classList.remove('hidden'); if(id === 'customerModal') loadCustomers(); if(id === 'partnerModal') loadPartnerDetails(); if(id === 'bannerModal') loadBanners(); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function logout() { if(confirm("Exit?")) window.location.href = 'index.html'; }
function showToast(msg) { const t=document.getElementById('toast'); document.getElementById('toastMsg').innerText=msg; t.classList.remove('opacity-0','pointer-events-none'); setTimeout(()=>t.classList.add('opacity-0','pointer-events-none'),2000); }

// --- PARTNER & ASSIGNMENT ---
function openAssignModal(orderId) { selectedOrderIdForAssignment = orderId; document.getElementById('assignModal').classList.remove('hidden'); loadPartnersForAssignment(); }
function loadPartnersForAssignment() {
    const container = document.getElementById('partnerListContainer'); container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">Loading...</p>';
    db.ref('deliveryBoys').once('value', snap => {
        container.innerHTML = '';
        if(snap.exists()) {
            let hasOnline = false;
            Object.entries(snap.val()).forEach(([mobile, boy]) => {
                if(boy.status === 'online') {
                    hasOnline = true;
                    const div = document.createElement('div');
                    div.className = "partner-select-card bg-slate-800 border border-slate-700 p-3 rounded-xl flex justify-between items-center cursor-pointer transition mb-2";
                    div.onclick = () => assignToPartner(mobile, boy.name);
                    div.innerHTML = `<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold border border-slate-600">${boy.name.charAt(0)}</div><div><h4 class="font-bold text-white text-sm">${boy.name}</h4><p class="text-[10px] text-slate-400 capitalize">${boy.vehicle}</p></div></div><button class="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full hover:bg-indigo-500">ASSIGN</button>`;
                    container.appendChild(div);
                }
            });
            if(!hasOnline) container.innerHTML = '<div class="text-center py-4 text-slate-500 text-xs">No partners Online.</div>';
        } else container.innerHTML = '<p class="text-slate-500 text-xs text-center">No Partners.</p>';
    });
}
function assignToPartner(mobile, name) {
    if(!selectedOrderIdForAssignment || !confirm(`Assign to ${name}?`)) return;
    db.ref('orders/' + selectedOrderIdForAssignment).update({ status: 'accepted', deliveryBoyId: mobile, deliveryBoyName: name, deliveryBoyMobile: mobile, assignedAt: firebase.database.ServerValue.TIMESTAMP })
    .then(() => { showToast(`Assigned to ${name}`); closeModal('assignModal'); });
}
function deleteOrder(id) { if(confirm("Delete Permanently?")) db.ref('orders/'+id).remove(); }

// --- DATA LISTS & UTILS ---

// Toggle Eye Icon Logic
window.togglePin = function(btn, pin) {
    const span = btn.parentElement.querySelector('.pin-text');
    const icon = btn.querySelector('i');
    
    if (span.innerText === '••••') {
        span.innerText = pin;
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        icon.parentElement.classList.add('text-white');
        icon.parentElement.classList.remove('text-slate-500');
    } else {
        span.innerText = '••••';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
        icon.parentElement.classList.remove('text-white');
        icon.parentElement.classList.add('text-slate-500');
    }
}

// Updated Customer Loader (With Eye Icon + Send Button + Context)
function loadCustomers() {
    const t = document.getElementById('custTable'); 
    t.innerHTML='<tr><td colspan="6" class="p-4 text-center">Loading...</td></tr>';
    
    db.ref('users').once('value', s => { 
        t.innerHTML=''; 
        if(s.exists()) {
            Object.values(s.val()).forEach(u => { 
                t.innerHTML += `
                    <tr class="hover:bg-slate-800">
                        <td class="p-3 font-bold text-white">${u.name}</td>
                        <td class="p-3 font-mono">${u.mobile}</td>
                        <td class="p-3">${u.shopName || '-'}</td>
                        <td class="p-3 font-mono tracking-widest text-xs flex items-center gap-2">
                            <span class="text-amber-500 pin-text">••••</span>
                            <button onclick="togglePin(this, '${u.pin}')" class="text-slate-500 hover:text-white transition"><i class="fa-solid fa-eye"></i></button>
                        </td>
                        <td class="p-3">
                            <button onclick="openPinRecovery('${u.mobile}', '${u.pin}', '${u.name}', 'customer', '${u.shopName || 'Ramazone Store'}')" class="bg-slate-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-[10px] font-bold transition flex items-center gap-1">
                                <i class="fa-solid fa-key"></i> SEND
                            </button>
                        </td>
                        <td class="p-3 text-xs text-slate-500">${new Date(u.joinedAt || Date.now()).toLocaleDateString()}</td>
                    </tr>
                `; 
            }); 
        } else {
            t.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">No Customers Found</td></tr>';
        }
    });
}

// Updated Partner Loader (With Eye Icon + Send Button + Context)
function loadPartnerDetails() {
    const t = document.getElementById('partnerDetailTable'); t.innerHTML='<tr><td colspan="6" class="p-4 text-center">Loading...</td></tr>';
    
    db.ref('deliveryBoys').once('value', s => { 
        t.innerHTML=''; 
        if(s.exists()) {
            Object.entries(s.val()).forEach(([m,u]) => { 
                t.innerHTML += `
                <tr class="hover:bg-slate-800">
                    <td class="p-3 font-bold text-white">${u.name}</td>
                    <td class="p-3">${m}</td>
                    <td class="p-3 capitalize">${u.vehicle}</td>
                    <td class="p-3 font-mono tracking-widest text-xs flex items-center gap-2">
                        <span class="text-amber-500 pin-text">••••</span>
                        <button onclick="togglePin(this, '${u.pin}')" class="text-slate-500 hover:text-white transition"><i class="fa-solid fa-eye"></i></button>
                    </td>
                    <td class="p-3">
                        <button onclick="openPinRecovery('${m}', '${u.pin}', '${u.name}', 'partner', 'Ramazone Delivery Team')" class="bg-slate-700 hover:bg-green-600 text-white px-3 py-1.5 rounded text-[10px] font-bold transition flex items-center gap-1">
                            <i class="fa-solid fa-key"></i> SEND
                        </button>
                    </td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] ${u.status==='online'?'bg-green-900 text-green-400':'bg-slate-700 text-slate-400'}">${u.status}</span></td>
                </tr>`; 
            }); 
        }
    });
}

// Universal PIN Recovery Logic
function openPinRecovery(mobile, pin, name, context, shopName) {
    if(!pin) { showToast("User has no PIN set"); return; }
    
    recTargetMobile = mobile;
    recTargetPin = pin;
    recTargetName = name;
    recTargetContext = context; // 'customer' or 'partner'
    recTargetShop = shopName;

    // Update Modal UI
    document.getElementById('recName').innerText = name + (context === 'partner' ? ' (Partner)' : '');
    document.getElementById('recMobile').innerText = "+91 " + mobile;
    
    // Open Modal
    document.getElementById('pinRecoveryModal').classList.remove('hidden');
}

function sendPinWhatsApp() {
    if(!recTargetMobile) return;
    
    // Dynamic Message Logic
    let header = `Hello ${recTargetName}`;
    let body = "";
    
    if (recTargetContext === 'customer') {
        body = `Your Login PIN for *${recTargetShop}* is: *${recTargetPin}*`;
    } else {
        body = `Your Login PIN for *Ramazone Delivery App* is: *${recTargetPin}*`;
    }
    
    const msg = `${header},\n\n${body}\n\nPlease keep it safe.\n- Admin Team`;
    
    window.open(`https://wa.me/91${recTargetMobile}?text=${encodeURIComponent(msg)}`, '_blank');
    closeModal('pinRecoveryModal');
}

function sendPinSMS() {
    if(!recTargetMobile) return;
    
    let body = "";
    if (recTargetContext === 'customer') {
        body = `Hello ${recTargetName}, Your PIN for ${recTargetShop} is: ${recTargetPin}. Keep it safe.`;
    } else {
        body = `Hello ${recTargetName}, Your PIN for Ramazone Delivery is: ${recTargetPin}. Keep it safe.`;
    }
    
    // Universal SMS Link (Works on Android & iOS)
    const ua = navigator.userAgent.toLowerCase();
    const url = (ua.indexOf("iphone") > -1 || ua.indexOf("ipad") > -1)
        ? `sms:${recTargetMobile}&body=${encodeURIComponent(body)}`
        : `sms:${recTargetMobile}?body=${encodeURIComponent(body)}`;
        
    window.location.href = url;
    closeModal('pinRecoveryModal');
}

function loadBanners() {
    const list = document.getElementById('bannerList'); list.innerHTML = '<p class="text-xs text-slate-500">Loading...</p>';
    db.ref('admin/sliders').once('value', s => { list.innerHTML = ''; if(s.exists()) Object.entries(s.val()).forEach(([key, val]) => { list.innerHTML += `<div class="bg-slate-800 p-2 rounded-lg flex items-center gap-3 border border-slate-700"><img src="${val.img}" class="w-16 h-10 object-cover rounded"><div class="flex-1 overflow-hidden"><p class="text-[10px] text-blue-400 truncate">${val.link}</p></div><button onclick="db.ref('admin/sliders/${key}').remove(); loadBanners()" class="text-red-500 hover:text-red-400"><i class="fa-solid fa-trash"></i></button></div>`; }); else list.innerHTML = '<p class="text-xs text-slate-500">No active banners.</p>'; });
}
function uploadBanner() {
    const file = document.getElementById('bannerFile').files[0]; const link = document.getElementById('bannerLink').value || '#';
    if(!file) return showToast("Select Image");
    const btn = document.getElementById('uploadBtn'); btn.innerHTML = 'Uploading...'; btn.disabled = true;
    imageKit.upload({ file : file, fileName : "banner_" + Date.now() + ".jpg", tags : ["banner"] }, function(err, result) {
        if(err) { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = function () { saveBannerToDb(reader.result, link, btn); }; } 
        else saveBannerToDb(result.url, link, btn);
    });
}
function saveBannerToDb(imgUrl, link, btn) {
    db.ref('admin/sliders').push({ img: imgUrl, link: link }).then(() => { showToast("Banner Live!"); document.getElementById('bannerFile').value=''; btn.innerHTML='UPLOAD & PUBLISH'; btn.disabled=false; loadBanners(); });
}

// Partner Status Table (Main Dashboard)
db.ref('deliveryBoys').on('value', snap => {
    const tbody = document.getElementById('partnersTable'); tbody.innerHTML = '';
    if(snap.exists()) {
        Object.entries(snap.val()).forEach(([mobile, boy]) => {
            const isOnline = boy.status === 'online';
            let statusHtml = isOnline ? `<span class="px-2 py-1 rounded text-[10px] font-bold bg-green-900/30 text-green-400">ONLINE</span>` : `<span class="px-2 py-1 rounded text-[10px] font-bold bg-slate-800 text-slate-500">OFFLINE</span>`;
            const bat = boy.battery ? `<i class="fa-solid fa-battery-half text-slate-400 mr-1"></i>${boy.battery}` : '-';
            const lastActive = boy.lastHeartbeat ? new Date(boy.lastHeartbeat).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';
            tbody.innerHTML += `<tr><td class="p-4"><div class="font-bold text-white flex items-center gap-2">${boy.name}<a href="https://wa.me/91${mobile}" target="_blank" class="text-green-500"><i class="fa-brands fa-whatsapp"></i></a></div><div class="text-[10px] text-slate-500">${mobile}</div></td><td class="p-4">${statusHtml}</td><td class="p-4 text-xs font-mono text-slate-400">${bat}</td><td class="p-4 text-sm font-bold text-green-400">₹${boy.earnings || 0}</td><td class="p-4 text-xs font-mono text-slate-500">${lastActive}</td></tr>`;
        });
    }
});

