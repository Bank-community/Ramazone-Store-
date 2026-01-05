// ==========================================
// ADMIN MANAGERS - TOOLS & UTILITIES
// ==========================================
// This file handles modal logic, heavy data processing, 
// and management tools. It depends on admin.js for global state.

console.log("Manager Tools Loaded");

// ==========================================
// 1. PARTNER MANAGEMENT (DETAILED)
// ==========================================

function renderPartnerModalList() {
    const activeBody = document.getElementById('partnerDetailTable');
    const reqList = document.getElementById('requestsList');
    
    if(activeBody) activeBody.innerHTML = '';
    if(reqList) reqList.innerHTML = '';
    
    let hasReq = false;
    let hasActive = false;

    if(!partnersData) return;

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
    if(partnersData) {
        Object.values(partnersData).forEach(p => { 
            if(p.status === 'pending') pendingCount++; 
        });
    }

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
// 2. CUSTOMERS & PIN RECOVERY
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

// ==========================================
// 3. APP BANNERS MANAGEMENT
// ==========================================

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
    
    // imageKit is initialized in admin.js
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
// 4. ANALYTICS & CHARTS
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
    
    // salesChartInstance is defined in admin.js
    if(typeof salesChartInstance !== 'undefined' && salesChartInstance) {
        salesChartInstance.destroy();
    }
    
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
// 5. CONTENT MANAGEMENT (POLICIES & VIDEOS)
// ==========================================

// --- Policies ---
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

// --- Videos ---
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

// ==========================================
// 6. MASTER INVENTORY MANAGEMENT
// ==========================================

function loadMasterProducts() {
    const list = document.getElementById('masterProductList');
    const countBadge = document.getElementById('mpTotalCount');
    if(!list) return;

    list.innerHTML = '<p class="text-center text-slate-500 text-xs py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p>';

    db.ref('masterProducts').on('value', snap => {
        list.innerHTML = '';
        let count = 0;
        
        if(snap.exists()) {
            const data = snap.val();
            count = Object.keys(data).length;

            Object.entries(data).reverse().forEach(([key, item]) => {
                const div = document.createElement('div');
                div.className = "bg-slate-800 p-3 rounded-lg flex justify-between items-center group hover:bg-slate-750 transition border border-slate-700";
                div.innerHTML = `
                    <div>
                        <h4 class="font-bold text-white text-sm">${item.name}</h4>
                    </div>
                    <button onclick="deleteMasterProduct('${key}')" class="text-slate-500 hover:text-red-500 transition px-2">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = '<p class="text-center text-slate-500 text-xs py-4">Database is empty.</p>';
        }
        
        if(countBadge) countBadge.innerText = `${count} Found`;
    });
}

function addMasterProduct() {
    const name = document.getElementById('mpName').value.trim();
    
    if(!name) return showToast("Enter Product Name");

    const newItem = {
        name: name,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref('masterProducts').push(newItem)
    .then(() => {
        showToast("Added to Master DB");
        document.getElementById('mpName').value = '';
    })
    .catch(e => showToast("Error: " + e.message));
}

function deleteMasterProduct(key) {
    if(confirm("Remove from Master DB?")) {
        db.ref('masterProducts/' + key).remove()
        .then(() => showToast("Item Removed"));
    }
}

function toggleBulkUpload() {
    const section = document.getElementById('bulkUploadSection');
    if(section.classList.contains('hidden')) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
    }
}

function processBulkUpload() {
    const rawText = document.getElementById('mpBulkData').value.trim();
    if(!rawText) return showToast("Enter List");

    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if(lines.length === 0) return showToast("No valid items found");

    let updates = {};
    lines.forEach(name => {
        const newKey = db.ref('masterProducts').push().key;
        updates['masterProducts/' + newKey] = {
            name: name,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
    });

    db.ref().update(updates)
    .then(() => {
        showToast(`Uploaded ${lines.length} items successfully!`);
        document.getElementById('mpBulkData').value = '';
        toggleBulkUpload();
    })
    .catch(e => showToast("Error: " + e.message));
}

// ==========================================
// 7. WHOLESALER VERIFICATION SYSTEM
// ==========================================

function loadWholesalerRequests() {
    const list = document.getElementById('wholesalerVerifyList');
    if(!list) return;

    list.innerHTML = '<p class="text-center text-slate-500 col-span-2 py-10"><i class="fa-solid fa-spinner fa-spin"></i> Loading Requests...</p>';

    db.ref('wholesalerRequests').on('value', snap => {
        list.innerHTML = '';
        if(snap.exists()) {
            const data = snap.val();
            // Convert to array and reverse (Newest first)
            const requests = Object.entries(data).reverse();

            requests.forEach(([key, req]) => {
                let statusBadge = '';
                let actionButtons = '';
                let opacityClass = '';

                // --- Status Logic ---
                if(req.status === 'pending') {
                    statusBadge = `<span class="bg-amber-900/40 text-amber-500 text-[10px] px-2 py-0.5 rounded border border-amber-900/50 uppercase font-bold animate-pulse">Pending Review</span>`;
                    actionButtons = `
                        <button onclick="approveWholesaler('${key}')" class="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-green-900/20">
                            <i class="fa-solid fa-check mr-1"></i> APPROVE
                        </button>
                        <button onclick="deleteWholesalerRequest('${key}')" class="flex-1 bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white py-2 rounded-lg text-xs font-bold transition">
                            REJECT
                        </button>
                    `;
                } else if(req.status === 'approved') {
                    statusBadge = `<span class="bg-green-900/40 text-green-400 text-[10px] px-2 py-0.5 rounded border border-green-900/50 uppercase font-bold"><i class="fa-solid fa-check-circle mr-1"></i> Verified</span>`;
                    actionButtons = `
                        <button onclick="toggleWholesalerStatus('${key}', 'disabled')" class="flex-1 bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-900/50 py-2 rounded-lg text-xs font-bold transition">
                            <i class="fa-solid fa-ban mr-1"></i> DISABLE
                        </button>
                        <button onclick="deleteWholesalerRequest('${key}')" class="px-3 bg-slate-800 text-slate-500 hover:text-red-500 rounded-lg text-xs font-bold transition" title="Delete Permanently">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    `;
                } else {
                    statusBadge = `<span class="bg-red-900/40 text-red-400 text-[10px] px-2 py-0.5 rounded border border-red-900/50 uppercase font-bold">Disabled</span>`;
                    opacityClass = 'opacity-60';
                    actionButtons = `
                        <button onclick="toggleWholesalerStatus('${key}', 'approved')" class="flex-1 bg-green-900/20 text-green-400 hover:bg-green-900/40 border border-green-900/50 py-2 rounded-lg text-xs font-bold transition">
                            <i class="fa-solid fa-power-off mr-1"></i> ENABLE
                        </button>
                        <button onclick="deleteWholesalerRequest('${key}')" class="px-3 bg-slate-800 text-slate-500 hover:text-red-500 rounded-lg text-xs font-bold transition" title="Delete Permanently">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    `;
                }

                // Map Link
                const mapLink = req.location ? `https://maps.google.com/?q=${req.location.lat},${req.location.lng}` : '#';

                const card = document.createElement('div');
                card.className = `bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-3 ${opacityClass}`;
                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-white text-base">${req.shopName}</h4>
                            <p class="text-[10px] text-slate-400 font-mono"><i class="fa-solid fa-phone mr-1"></i>${req.ownerMobile}</p>
                        </div>
                        ${statusBadge}
                    </div>
                    
                    <div class="bg-slate-900/50 p-2 rounded-lg text-xs text-slate-300 border border-slate-700/50">
                        <p class="mb-1"><i class="fa-solid fa-location-dot text-amber-500 mr-1"></i> ${req.address}</p>
                        <a href="${mapLink}" target="_blank" class="text-[10px] text-blue-400 font-bold hover:underline flex items-center gap-1">
                            <i class="fa-solid fa-map-location-dot"></i> View on Google Maps
                        </a>
                    </div>
                    
                    <div class="flex justify-between items-center border-t border-slate-700 pt-2">
                        <span class="text-[9px] text-slate-500">Added by: <b class="text-slate-400">${req.partnerName}</b></span>
                        <span class="text-[9px] text-slate-600 font-mono">${new Date(req.timestamp).toLocaleDateString()}</span>
                    </div>

                    <div class="flex gap-2 pt-1">
                        ${actionButtons}
                    </div>
                `;
                list.appendChild(card);
            });
        } else {
            list.innerHTML = '<div class="col-span-2 flex flex-col items-center justify-center py-12 text-slate-500"><i class="fa-solid fa-clipboard-check text-4xl mb-3 opacity-20"></i><p class="text-sm">No verification requests found.</p></div>';
        }
    });
}

function approveWholesaler(key) {
    if(confirm("Approve this Wholesaler Shop? Partner will get incentive.")) {
        db.ref('wholesalerRequests/' + key).update({
            status: 'approved',
            verifiedAt: firebase.database.ServerValue.TIMESTAMP
        }).then(() => showToast("Shop Verified & Live!"));
    }
}

function toggleWholesalerStatus(key, newStatus) {
    const action = newStatus === 'approved' ? 'Enable' : 'Disable';
    if(confirm(`${action} this shop?`)) {
        db.ref('wholesalerRequests/' + key).update({ status: newStatus })
        .then(() => showToast(`Shop ${action}d Successfully`));
    }
}

function deleteWholesalerRequest(key) {
    if(confirm("Delete this shop permanently? This cannot be undone.")) {
        db.ref('wholesalerRequests/' + key).remove()
        .then(() => showToast("Shop Deleted"));
    }
}

// ==========================================
// AUTO-HOOK: Extend admin.js logic dynamically
// ==========================================
// This allows the new modal to work without modifying admin.js manually.
if (typeof window.openModal === 'function') {
    const originalOpenModal = window.openModal;
    window.openModal = function(id) {
        originalOpenModal(id); // Call original
        if (id === 'wholesalerVerifyModal') loadWholesalerRequests();
    };
}

