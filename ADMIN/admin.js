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
// Note: Replace with your actual keys if needed
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

// PIN Recovery Logic
let recTargetMobile = null;
let recTargetPin = null;
let recTargetName = null;
let recTargetContext = null; 
let recTargetShop = null;

// Partner Management
let currentPartnerTab = 'active'; // 'active' or 'requests'
let currentPartnerMobile = null; // For Nano Detail Modal

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
    // Define all tabs (Added 'content' here)
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
    
    if(tabId === 'analytics') { 
        initAnalytics(); 
    }

    if(tabId === 'content') {
        loadVideos(); // Load videos when content tab is opened
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
        
        // Load Data based on modal type
        if(id === 'customerModal') loadCustomers(); 
        if(id === 'partnerModal') renderAllPartnerViews(); 
        if(id === 'bannerModal') loadBanners(); 
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
// 5. PARTNER MANAGEMENT SYSTEM
// ==========================================

function trackPartners() {
    db.ref('deliveryBoys').on('value', snap => {
        if(snap.exists()) {
            partnersData = snap.val();
            renderDashboardTeamList();
            renderPartnerModalList();
            updateMapCounts();
            renderMarkers();
            updatePartnerBadges();
            if(currentPartnerMobile && !document.getElementById('partnerFullDetailModal').classList.contains('hidden')) {
                refreshNanoModal(currentPartnerMobile);
            }
        } else {
            partnersData = {};
            renderDashboardTeamList();
            renderPartnerModalList();
        }
    });
}

function renderAllPartnerViews() {
    renderDashboardTeamList();
    renderPartnerModalList();
}

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

function renderPartnerModalList() {
    const activeBody = document.getElementById('partnerDetailTable');
    const reqList = document.getElementById('requestsList');
    
    if(activeBody) activeBody.innerHTML = '';
    if(reqList) reqList.innerHTML = '';
    
    let hasReq = false;
    let hasActive = false;

    Object.entries(partnersData).forEach(([mobile, p]) => {
        if(!p.name) return;

        if(p.status === 'pending') {
            hasReq = true;
            if(reqList) {
                const card = document.createElement('div');
                card.className = "bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-3 animate-[fadeIn_0.3s_ease-out]";
                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center border border-amber-500/50 relative">
                                <span class="text-amber-500 font-bold text-lg">${p.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                                <h4 class="font-bold text-white text-base">${p.name}</h4>
                                <p class="text-xs text-slate-400 font-mono tracking-wide">+91 ${mobile}</p>
                                <span class="text-[10px] bg-slate-900 text-slate-300 px-2 py-0.5 rounded uppercase mt-1 inline-block border border-slate-600">${p.vehicle || 'Unknown'}</span>
                            </div>
                        </div>
                        <span class="bg-amber-600 text-white text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider">Pending</span>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <button onclick="verifyOnWhatsApp('${mobile}', '${p.name}')" class="bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-600/30 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition">
                            <i class="fa-brands fa-whatsapp text-lg"></i> Request Proof
                        </button>
                        <button onclick="approvePartner('${mobile}')" class="bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-xs font-bold shadow-lg transition transform active:scale-95">
                            <i class="fa-solid fa-check mr-1"></i> APPROVE
                        </button>
                    </div>
                    <button onclick="deletePartnerAccount('${mobile}', true)" class="text-[10px] text-red-500 hover:text-red-400 text-center mt-1 underline">Reject & Delete</button>
                `;
                reqList.appendChild(card);
            }
        } 
        else {
            hasActive = true;
            if(activeBody) {
                const isOnline = p.status === 'online';
                const isDisabled = p.status === 'disabled';
                
                let statusBadge = isOnline 
                    ? `<span class="status-badge bg-green-500/20 text-green-400 border border-green-500/30">ONLINE</span>` 
                    : (isDisabled 
                        ? `<span class="status-badge bg-red-500/20 text-red-400 border border-red-500/30">DISABLED</span>` 
                        : `<span class="status-badge bg-slate-700 text-slate-400 border border-slate-600">OFFLINE</span>`);
                
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-800/50 transition cursor-pointer group border-b border-slate-800 last:border-0";
                
                tr.innerHTML = `
                    <td class="p-3 align-middle">${statusBadge}</td>
                    <td class="p-3 align-middle" onclick="openPartnerDetail('${mobile}')">
                        <div class="font-bold text-white text-sm">${p.name}</div>
                        <div class="text-[10px] text-slate-500 font-mono">${mobile}</div>
                    </td>
                    <td class="p-3 align-middle text-xs text-slate-400 capitalize">${p.vehicle || 'Bike'}</td>
                    <td class="p-3 align-middle font-mono font-bold text-green-400">₹${p.earnings || 0}</td>
                    <td class="p-3 align-middle text-right flex justify-end gap-2">
                        <button onclick="openPinRecovery('${mobile}', '${p.pin}', '${p.name}', 'partner', 'Ramazone Delivery')" class="bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-lg text-xs font-bold" title="Recover PIN">
                            <i class="fa-solid fa-key"></i>
                        </button>
                        <button onclick="openPartnerDetail('${mobile}')" class="bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white p-2 rounded-lg transition" title="Full Details">
                            <i class="fa-solid fa-angle-right"></i>
                        </button>
                    </td>
                `;
                activeBody.appendChild(tr);
            }
        }
    });

    const noReqMsg = document.getElementById('noReqMsg');
    if(noReqMsg) {
        if(!hasReq) noReqMsg.classList.remove('hidden');
        else noReqMsg.classList.add('hidden');
    }
    
    if(!hasActive && activeBody) {
        activeBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500 text-sm">No active partners. Check 'New Requests'.</td></tr>`;
    }
}

function updatePartnerBadges() {
    let pendingCount = 0;
    Object.values(partnersData).forEach(p => { 
        if(p.status === 'pending') pendingCount++; 
    });

    const badge = document.getElementById('pendingReqBadge');
    const tabBadge = document.getElementById('reqCountBadge');
    
    if(pendingCount > 0) {
        if(badge) { badge.classList.remove('hidden'); badge.innerText = "New"; }
        if(tabBadge) { tabBadge.classList.remove('hidden'); tabBadge.innerText = pendingCount; }
    } else {
        if(badge) badge.classList.add('hidden');
        if(tabBadge) tabBadge.classList.add('hidden');
    }
}

function switchPartnerTab(type) {
    currentPartnerTab = type;
    const btnActive = document.getElementById('btn-tab-active');
    const btnReq = document.getElementById('btn-tab-requests');
    if(btnActive) btnActive.classList.remove('active', 'border-b-2');
    if(btnReq) btnReq.classList.remove('active', 'border-b-2');
    
    if(type === 'active') {
        if(btnActive) btnActive.classList.add('active', 'border-b-2');
        document.getElementById('view-active-partners').classList.remove('hidden');
        document.getElementById('view-partner-requests').classList.add('hidden');
    } else {
        if(btnReq) btnReq.classList.add('active', 'border-b-2');
        document.getElementById('view-active-partners').classList.add('hidden');
        document.getElementById('view-partner-requests').classList.remove('hidden');
    }
    renderPartnerModalList();
}

function verifyOnWhatsApp(mobile, name) {
    const msg = `Hello ${name}, Welcome to Ramazone Delivery Fleet! 🛵\n\nYour registration is received. To activate your account, please send clear photos of:\n\n1. Aadhar Card (Front & Back)\n2. Driving License (For Bike)\n3. Your Selfie\n4. Bank Details/UPI for Payouts\n\nOnce verified, you can login.`;
    window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank');
}

function approvePartner(mobile) {
    if(confirm("Confirm Approval? This partner will be able to login.")) {
        db.ref('deliveryBoys/' + mobile).update({
            status: 'offline', 
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            earnings: 0,
            lifetimeEarnings: 0,
            totalDistance: 0,
            onlineMinutes: 0
        }).then(() => {
            showToast("Partner Approved Successfully!");
        });
    }
}

function openPartnerDetail(mobile) {
    currentPartnerMobile = mobile;
    const p = partnersData[mobile];
    if(!p) return;

    document.getElementById('nanoInitials').innerText = p.name ? p.name.charAt(0).toUpperCase() : 'U';
    document.getElementById('nanoName').innerText = p.name;
    document.getElementById('nanoMobile').innerText = '+91 ' + mobile;
    
    const toggle = document.getElementById('nanoToggle');
    const statusTxt = document.getElementById('nanoStatusText');
    
    if(p.status === 'disabled') {
        toggle.checked = false;
        statusTxt.innerText = "Partner is DISABLED (Login Blocked)";
        statusTxt.className = "text-xs text-red-400 mt-1 font-bold";
    } else {
        toggle.checked = true;
        statusTxt.innerText = "Partner is ACTIVE";
        statusTxt.className = "text-xs text-green-400 mt-1 font-bold";
    }

    refreshNanoModal(mobile);
    openModal('partnerFullDetailModal');
}

function refreshNanoModal(mobile) {
    const p = partnersData[mobile];
    if(!p) return;

    document.getElementById('nanoLifeEarn').innerText = p.lifetimeEarnings || 0;
    document.getElementById('nanoCurrentBal').innerText = p.earnings || 0;
    document.getElementById('nanoDist').innerText = (p.totalDistance || 0).toFixed(1);
    
    const hours = ((p.onlineMinutes || 0) / 60).toFixed(1);
    document.getElementById('nanoOnlineTime').innerText = hours;

    if(p.joinedAt) {
        document.getElementById('nanoJoined').innerText = new Date(p.joinedAt).toLocaleDateString();
    } else {
        document.getElementById('nanoJoined').innerText = "N/A";
    }
}

function togglePartnerStatus() {
    if(!currentPartnerMobile) return;
    const isChecked = document.getElementById('nanoToggle').checked;
    const newStatus = isChecked ? 'offline' : 'disabled';
    
    db.ref('deliveryBoys/' + currentPartnerMobile).update({ status: newStatus }).then(() => {
        showToast(isChecked ? "Access Enabled" : "Access Disabled");
    });
}

function submitPayout() {
    if(!currentPartnerMobile) return;
    const input = document.getElementById('payoutAmount');
    const amount = parseFloat(input.value);
    
    if(!amount || amount <= 0) return showToast("Enter valid amount");
    
    const currentBal = partnersData[currentPartnerMobile].earnings || 0;
    if(amount > currentBal) return showToast("Amount exceeds balance!");

    db.ref('deliveryBoys/' + currentPartnerMobile + '/earnings').transaction(curr => {
        return (curr || 0) - amount;
    }, (err, committed, snap) => {
        if(committed) {
            showToast(`₹${amount} Settled Successfully`);
            input.value = '';
            
            const logId = Date.now();
            db.ref('payouts/' + logId).set({
                partnerId: currentPartnerMobile,
                amount: amount,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                admin: 'Admin HQ'
            });
        }
    });
}

function deletePartnerAccount(mobileArg = null, isRequest = false) {
    const mobile = mobileArg || currentPartnerMobile;
    if(!mobile) return;
    
    const msg = isRequest 
        ? "Reject request? This cannot be undone." 
        : "⚠️ DANGER: Delete partner account permanently? Earnings & History will be lost.";
    
    if(confirm(msg)) {
        if(!isRequest && !confirm("Double Check: Are you absolutely sure?")) return;
        
        db.ref('deliveryBoys/' + mobile).remove()
        .then(() => {
            showToast("Partner Deleted");
            if(!isRequest) closeModal('partnerFullDetailModal');
        });
    }
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

// ==========================================
// 9. CUSTOMERS, PIN RECOVERY & BANNERS (LEGACY)
// ==========================================

function loadCustomers() {
    const t = document.getElementById('custTable'); 
    t.innerHTML='<tr><td colspan="6" class="p-4 text-center">Loading...</td></tr>';
    
    db.ref('users').once('value', s => { 
        t.innerHTML=''; 
        if(s.exists()) {
            Object.values(s.val()).forEach(u => { 
                t.innerHTML += `
                    <tr class="hover:bg-slate-800 transition">
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

window.togglePin = function(btn, pin) {
    const span = btn.parentElement.querySelector('.pin-text');
    const icon = btn.querySelector('i');
    if (span.innerText === '••••') {
        span.innerText = pin;
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        span.innerText = '••••';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

function openPinRecovery(mobile, pin, name, context, shopName) {
    if(!pin) { showToast("User has no PIN set"); return; }
    recTargetMobile = mobile; 
    recTargetPin = pin; 
    recTargetName = name; 
    recTargetContext = context; 
    recTargetShop = shopName;
    
    document.getElementById('recName').innerText = name + (context === 'partner' ? ' (Partner)' : '');
    document.getElementById('recMobile').innerText = "+91 " + mobile;
    document.getElementById('pinRecoveryModal').classList.remove('hidden');
}

function sendPinWhatsApp() {
    if(!recTargetMobile) return;
    let body = recTargetContext === 'customer' 
        ? `Your Login PIN for *${recTargetShop}* is: *${recTargetPin}*` 
        : `Your Login PIN for *Ramazone Delivery App* is: *${recTargetPin}*`;
    
    const msg = `Hello ${recTargetName},\n\n${body}\n\nPlease keep it safe.\n- Team *Ramazone*`;
    window.open(`https://wa.me/91${recTargetMobile}?text=${encodeURIComponent(msg)}`, '_blank');
    closeModal('pinRecoveryModal');
}

function sendPinSMS() {
    if(!recTargetMobile) return;
    let body = recTargetContext === 'customer' 
        ? `Hello ${recTargetName}, Your PIN for ${recTargetShop} is: ${recTargetPin}` 
        : `Hello ${recTargetName}, Your PIN for Ramazone Delivery is: ${recTargetPin}`;
    
    window.open(`sms:${recTargetMobile}?body=${encodeURIComponent(body)}`, '_self');
    closeModal('pinRecoveryModal');
}

function loadBanners() {
    const list = document.getElementById('bannerList'); 
    list.innerHTML = '<p class="text-xs text-slate-500">Loading...</p>';
    
    db.ref('admin/sliders').once('value', s => { 
        list.innerHTML = ''; 
        if(s.exists()) {
            Object.entries(s.val()).forEach(([key, val]) => { 
                list.innerHTML += `
                    <div class="bg-slate-800 p-2 rounded-lg flex items-center gap-3 border border-slate-700">
                        <img src="${val.img}" class="w-16 h-10 object-cover rounded">
                        <div class="flex-1 overflow-hidden">
                            <p class="text-[10px] text-blue-400 truncate">${val.link || '#'}</p>
                        </div>
                        <button onclick="db.ref('admin/sliders/${key}').remove(); loadBanners()" class="text-red-500 hover:text-red-400">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>`; 
            }); 
        } else {
            list.innerHTML = '<p class="text-xs text-slate-500">No active banners.</p>'; 
        }
    });
}

function uploadBanner() {
    const file = document.getElementById('bannerFile').files[0]; 
    const link = document.getElementById('bannerLink').value || '#';
    
    if(!file) return showToast("Select Image");
    
    const btn = document.getElementById('uploadBtn'); 
    btn.innerHTML = 'Uploading...'; 
    btn.disabled = true;
    
    imageKit.upload({ file : file, fileName : "banner_" + Date.now() + ".jpg", tags : ["banner"] }, function(err, result) {
        if(err) { 
            const reader = new FileReader(); 
            reader.readAsDataURL(file); 
            reader.onload = function () { saveBannerToDb(reader.result, link, btn); }; 
        } else {
            saveBannerToDb(result.url, link, btn);
        }
    });
}

function saveBannerToDb(imgUrl, link, btn) {
    db.ref('admin/sliders').push({ img: imgUrl, link: link })
    .then(() => { 
        showToast("Banner Live!"); 
        document.getElementById('bannerFile').value=''; 
        btn.innerHTML='UPLOAD & PUBLISH'; 
        btn.disabled=false; 
        loadBanners(); 
    });
}

// ==========================================
// 10. ANALYTICS & CHARTS
// ==========================================

function initAnalytics() {
    db.ref('orders').once('value', snap => {
        let totalOrders = 0, totalRev = 0;
        let customers = new Set();
        let productCounts = {};
        const last7Days = {};
        const today = new Date();
        
        for(let i=6; i>=0; i--) { 
            const d = new Date(today); 
            d.setDate(today.getDate()-i); 
            last7Days[d.toLocaleDateString()] = 0; 
        }

        if(snap.exists()) {
            Object.values(snap.val()).forEach(o => {
                if(o.status === 'delivered') {
                    totalOrders++; 
                    totalRev += parseInt(o.payment.deliveryFee || 0);
                    customers.add(o.user.mobile);
                    
                    if(o.cart) {
                        o.cart.forEach(p => {
                            if(p.name) productCounts[p.name] = (productCounts[p.name] || 0) + (p.count || 1);
                        });
                    }
                    
                    const dateKey = new Date(o.timestamp).toLocaleDateString();
                    if(last7Days.hasOwnProperty(dateKey)) {
                        last7Days[dateKey] += parseInt(o.payment.deliveryFee || 0);
                    }
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
                prodContainer.innerHTML += `
                    <div class="flex justify-between items-center bg-slate-800 p-2 rounded hover:bg-slate-700 transition">
                        <span class="truncate flex-1">
                            <span class="text-blue-500 font-bold mr-2">#${index+1}</span>${name}
                        </span>
                        <span class="bg-slate-700 px-2 py-0.5 rounded text-xs text-white border border-slate-600">${count} sold</span>
                    </div>`;
            });
        } else {
            prodContainer.innerHTML = '<p class="text-center text-xs text-slate-500">No sales data yet.</p>';
        }
    });
}

function renderSalesChart(labels, data) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    if(salesChartInstance) salesChartInstance.destroy();
    
    salesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { 
            labels: labels, 
            datasets: [{ 
                label: 'Sales (₹)', 
                data: data, 
                backgroundColor: '#3b82f6', 
                borderRadius: 4 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } }, 
            scales: { 
                y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }, 
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: {size: 10} } } 
            } 
        }
    });
}

// ==========================================
// 11. CONTENT MANAGEMENT (MERGED)
// ==========================================

// --- A. Policies Logic ---
function loadSelectedPolicy() {
    const policyKey = document.getElementById('policySelector').value;
    const editor = document.getElementById('policyEditor');
    
    editor.value = "Loading...";
    editor.disabled = true;

    db.ref('admin/policies/' + policyKey).once('value', snap => {
        editor.disabled = false;
        if(snap.exists()) {
            editor.value = snap.val();
        } else {
            editor.value = "";
            editor.placeholder = "No content yet. Write something...";
        }
    }, err => {
        editor.disabled = false;
        editor.value = "Error loading policy.";
        console.error(err);
    });
}

function savePolicy() {
    const policyKey = document.getElementById('policySelector').value;
    const content = document.getElementById('policyEditor').value;
    const btn = document.getElementById('btnSavePolicy');

    if(!content.trim()) return showToast("Content cannot be empty");

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    db.ref('admin/policies/' + policyKey).set(content)
    .then(() => {
        showToast("Policy Updated Successfully!");
        btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
        btn.disabled = false;
    })
    .catch(err => {
        showToast("Error saving: " + err.message);
        btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
        btn.disabled = false;
    });
}

// --- B. Videos Logic ---
function loadVideos() {
    const list = document.getElementById('videoList');
    if(!list) return;
    
    list.innerHTML = '<p class="text-center text-slate-500 text-xs py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading videos...</p>';

    db.ref('admin/videos').once('value', snap => {
        list.innerHTML = '';
        
        if(snap.exists()) {
            Object.entries(snap.val()).forEach(([key, vid]) => {
                const div = document.createElement('div');
                div.className = "bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center group hover:bg-slate-750 transition";
                div.innerHTML = `
                    <div class="flex items-center gap-3 overflow-hidden">
                        <div class="w-10 h-10 rounded-lg bg-red-900/20 text-red-500 flex items-center justify-center shrink-0 border border-red-900/30">
                            <i class="fa-brands fa-youtube text-lg"></i>
                        </div>
                        <div class="overflow-hidden">
                            <h4 class="font-bold text-white text-sm truncate">${vid.title}</h4>
                            <a href="${vid.link}" target="_blank" class="text-[10px] text-blue-400 hover:underline truncate block">${vid.link}</a>
                        </div>
                    </div>
                    <button onclick="deleteVideo('${key}')" class="w-8 h-8 rounded-lg bg-slate-700 text-slate-400 hover:bg-red-600 hover:text-white transition flex items-center justify-center shrink-0">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = '<p class="text-center text-slate-500 text-xs py-4">No videos added yet.</p>';
        }
    });
}

function addVideo() {
    const title = document.getElementById('vidTitle').value.trim();
    const link = document.getElementById('vidLink').value.trim();

    if(!title || !link) return showToast("Enter Title and Link");
    if(!link.includes('youtube.com') && !link.includes('youtu.be')) return showToast("Only YouTube links allowed");

    const newVid = { title, link, addedAt: firebase.database.ServerValue.TIMESTAMP };

    db.ref('admin/videos').push(newVid)
    .then(() => {
        showToast("Video Added!");
        document.getElementById('vidTitle').value = '';
        document.getElementById('vidLink').value = '';
        loadVideos();
    });
}

function deleteVideo(key) {
    if(confirm("Delete this video?")) {
        db.ref('admin/videos/' + key).remove()
        .then(() => {
            showToast("Video Deleted");
            loadVideos();
        });
    }
}

