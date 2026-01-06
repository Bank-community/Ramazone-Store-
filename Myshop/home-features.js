// --- FILE: home-features.js ---
// Contains: Tracking, Slider, Owner Tools, History, Support, Settings, Add Stock Logic

// --- GLOBAL VARIABLES FOR FEATURES ---
let activeTrackingOrder = null;
let historyData = {};
let slides = [];
let slideIndex = 1;
let slideInterval;
let isTransitioning = false;
let selectedQtyValue = ''; // NEW: Stores selected quantity button value

// --- TRACKING & BANNER LOGIC ---

function checkActiveOrderHome() {
    const savedOrder = JSON.parse(localStorage.getItem('rmz_active_order'));
    
    // 1. Check: Kya Local data exist karta hai?
    // 2. Check: Kya ye order abhi login kiye hue user (session.mobile) ka hi hai?
    if (savedOrder && session && savedOrder.user && savedOrder.user.mobile === session.mobile) {
        
        // Active Status Check (Date check hata diya hai taaki purane active orders bhi dikhein)
        const activeStatuses = ['placed', 'accepted', 'out_for_delivery', 'admin_accepted'];
        
        if (activeStatuses.includes(savedOrder.status)) {
            activateBanner(savedOrder);
            return; // Local data sahi hai, yahi use karo
        } else {
            // Agar delivered/cancelled hai toh Local Storage clear karo
            localStorage.removeItem('rmz_active_order');
        }
    } else {
        // Agar user match nahi hua (dusra device/user) toh Local Storage clear karo
        localStorage.removeItem('rmz_active_order');
    }

    // Local Storage mein kuch nahi mila ya galat tha, ab Cloud (Database) check karo
    fetchActiveOrderFromCloud();
}



// home-features.js mein is function ko update karein

function fetchActiveOrderFromCloud() {
    // Safety Check: Agar session nahi hai toh return karo
    if(!session || !session.mobile) return;

    // Database se last order fetch karo
    db.ref('orders').orderByChild('user/mobile').equalTo(session.mobile).limitToLast(1).once('value', snap => {
        if(snap.exists()) {
            const data = snap.val();
            const orderId = Object.keys(data)[0];
            const order = data[orderId];
            
            // Timestamp fix
            let ts = order.timestamp; 
            if(typeof ts === 'object' || !ts) ts = Date.now();

            // ACTIVE ORDER LOGIC:
            // Hum date check nahi karenge. Hum bas ye dekhenge ki order abhi chal raha hai ya nahi.
            const activeStatuses = ['placed', 'accepted', 'out_for_delivery', 'admin_accepted'];

            if (activeStatuses.includes(order.status)) {
                const fullOrder = { id: orderId, ...order, timestamp: ts };
                
                // 1. Banner dikhao
                activateBanner(fullOrder);
                
                // 2. Local Storage mein save kar lo taaki agli baar fast khule (Hybrid approach)
                localStorage.setItem('rmz_active_order', JSON.stringify(fullOrder));
            }
        }
    });
}


function activateBanner(order) {
    activeTrackingOrder = order;
    const banner = document.getElementById('liveOrderBanner');
    if(banner) banner.classList.remove('hidden');
    syncHomeOrderStatus(order.id);
}

function syncHomeOrderStatus(orderId) {
    db.ref('orders/' + orderId).on('value', snap => {
        if(snap.exists()) {
            const updatedOrder = snap.val();
            activeTrackingOrder = { id: orderId, ...updatedOrder };
            
            // Keep local storage updated
            localStorage.setItem('rmz_active_order', JSON.stringify(activeTrackingOrder));
            
            updateBannerText(updatedOrder.status);

            // Update Modal if open
            if(!document.getElementById('trackingModal').classList.contains('hidden')) {
                renderTrackingModalUI(activeTrackingOrder);
            }
        } else {
            // Order Deleted (Cancelled by Admin/User)
            localStorage.removeItem('rmz_active_order');
            activeTrackingOrder = null;
            document.getElementById('liveOrderBanner').classList.add('hidden');
            document.getElementById('trackingModal').classList.add('hidden');
        }
    });
}

function updateBannerText(status) {
    const statusEl = document.getElementById('bannerStatus');
    let text = "Processing...";
    
    // Map status codes to readable text
    if(status === 'placed') text = "Waiting for Confirmation";
    else if(status === 'accepted') text = "Partner Assigned";
    else if(status === 'out_for_delivery') text = "Out for Delivery";
    else if(status === 'delivered') text = "Delivered";
    
    if(statusEl) statusEl.innerText = text;
}

// --- TRACKING MODAL LOGIC ---
function openTrackingModal() {
    if(!activeTrackingOrder) return;
    document.getElementById('trackingModal').classList.remove('hidden');
    renderTrackingModalUI(activeTrackingOrder);
}

function closeTrackingModal() {
    document.getElementById('trackingModal').classList.add('hidden');
}

function renderTrackingModalUI(order) {
    document.getElementById('modalOrderId').innerText = order.orderId ? order.orderId.slice(-6) : '...';
    document.getElementById('modalTotal').innerText = order.payment.deliveryFee;

    // 1. Render Timeline
    const steps = ['placed', 'accepted', 'out_for_delivery', 'delivered'];
    const labels = { 
        placed: 'Order Placed', 
        accepted: 'Partner Assigned', 
        out_for_delivery: 'Out for Delivery', 
        delivered: 'Delivered' 
    };
    const timelineContainer = document.getElementById('modalTimeline');
    timelineContainer.innerHTML = '';

    let passed = true;
    let currentStep = order.status;
    if(currentStep === 'admin_accepted') currentStep = 'placed'; 

    steps.forEach(step => {
        let isActive = passed;
        if(step === currentStep) passed = false;

        timelineContainer.innerHTML += `
            <div class="modal-timeline-item ${isActive ? 'active' : ''}">
                <div class="modal-timeline-dot"></div>
                <h4 class="text-xs font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}">${labels[step]}</h4>
            </div>
        `;
    });

    // 2. Dynamic Actions Area (Cancel/Edit OR Partner Info)
    const pCard = document.getElementById('modalPartnerCard');
    const actionsContainer = document.getElementById('modalFooterActions');

    // Show Edit/Cancel only if status is 'placed' (not accepted yet)
    if(order.status === 'placed' || order.status === 'admin_accepted') {
        pCard.classList.add('hidden');
        
        actionsContainer.innerHTML = `
            <div class="flex gap-3">
                <button onclick="cancelOrder()" class="flex-1 py-3 bg-red-50 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 border border-red-100 transition">CANCEL ORDER</button>
                <button onclick="editOrder()" class="flex-1 py-3 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 border border-indigo-100 transition">EDIT / ADD ITEMS</button>
            </div>
            <p class="text-[9px] text-center text-slate-400 mt-2">You can edit until a partner accepts.</p>
        `;
    } else {
        // Partner Assigned -> Show Partner Card & Support
        if(order.deliveryBoyName) {
            pCard.classList.remove('hidden');
            document.getElementById('modalPartnerName').innerText = `${order.deliveryBoyName} (${order.deliveryBoyMobile})`;
            document.getElementById('btnCallPartner').href = `tel:${order.deliveryBoyMobile}`;
            document.getElementById('btnChatPartner').href = `https://wa.me/91${order.deliveryBoyMobile}`;
        } else {
            // Accepted but no name yet
            pCard.classList.add('hidden');
        }
        
        actionsContainer.innerHTML = `
            <p class="text-[10px] text-center text-slate-400 mb-3 font-bold uppercase">Need help?</p>
            <button onclick="openSupportOptions()" class="w-full py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition">CONTACT SUPPORT</button>
        `;
    }

    // 3. Items List
    const itemsContainer = document.getElementById('modalItemsList');
    itemsContainer.innerHTML = '';
    if(order.cart) {
        order.cart.forEach(item => {
            itemsContainer.innerHTML += `
                <div class="flex justify-between border-b border-slate-50 last:border-0 py-1">
                    <span>${item.name} <span class="text-slate-400 text-[10px]">(${item.qty})</span></span>
                    <span class="font-bold text-slate-700">x${item.count}</span>
                </div>
            `;
        });
    }
}

function cancelOrder() {
    if(!activeTrackingOrder) return;
    if(confirm("Are you sure you want to Cancel this order?")) {
        db.ref('orders/' + activeTrackingOrder.id).remove()
        .then(() => {
            showToast("Order Cancelled");
            localStorage.removeItem('rmz_active_order');
            activeTrackingOrder = null;
            document.getElementById('trackingModal').classList.add('hidden');
            document.getElementById('liveOrderBanner').classList.add('hidden');
        })
        .catch(e => showToast("Error cancelling"));
    }
}

function editOrder() {
    if(!activeTrackingOrder) return;
    if(confirm("To edit, we will cancel this order and add items back to your cart. Continue?")) {
        // 1. Restore items to cart
        localStorage.setItem('rmz_cart', JSON.stringify(activeTrackingOrder.cart));
        updateCartBadge();
        
        // 2. Delete current order
        db.ref('orders/' + activeTrackingOrder.id).remove()
        .then(() => {
            localStorage.removeItem('rmz_active_order');
            window.location.href = 'cart.html';
        });
    }
}

// --- SLIDER LOGIC ---
function initSeamlessSlider() {
    slides = [];
    
    // 1. Fetch Shop Banner
    db.ref(`users/${targetMobile}/banner`).once('value', uSnap => {
        if(uSnap.exists()) {
            const b = uSnap.val();
            slides.push({ 
                type: 'user', 
                text: b.text || 'Welcome', 
                color: b.color || '#3b82f6', 
                bold: b.bold || false,
                textColor: b.textColor || '#ffffff', 
                fontSize: b.fontSize || 'text-2xl'
            });
        }
        
        // 2. Fetch Admin Sliders
        db.ref('admin/sliders').once('value', aSnap => {
            if(aSnap.exists()) {
                Object.values(aSnap.val()).forEach(s => slides.push({ type: 'admin', img: s.img, link: s.link || '#' }));
            }
            // Fallback
            if(slides.length === 0) slides.push({type: 'user', text: 'Welcome', color: '#1e293b', textColor: '#ffffff', fontSize: 'text-2xl'});
            
            renderSeamlessSlider();
        });
    });
}

function renderSeamlessSlider() {
    const track = document.getElementById('sliderTrack');
    const dotsContainer = document.getElementById('dotsContainer');
    
    // Need at least one slide
    if(!track || slides.length === 0) return;

    // Clone for seamless loop
    const firstClone = slides[0];
    const lastClone = slides[slides.length - 1];
    const allSlides = [lastClone, ...slides, firstClone];
    
    track.innerHTML = '';
    dotsContainer.innerHTML = '';
    
    // Render Slides
    allSlides.forEach(s => {
        const div = document.createElement('div');
        div.className = "slide";
        div.style.width = "100%"; 
        if(s.type === 'user') {
            div.style.backgroundColor = s.color;
            div.innerHTML = `<span style="color: ${s.textColor};" class="px-8 text-center ${s.fontSize} ${s.bold ? 'font-extrabold' : 'font-medium'}">${s.text}</span>`;
        } else {
            div.innerHTML = `<img src="${s.img}" class="w-full h-full object-cover" onclick="window.location.href='${s.link}'">`;
        }
        track.appendChild(div);
    });

    // Render Dots
    slides.forEach((_, idx) => {
        const dot = document.createElement('div');
        dot.className = `slider-dot ${idx === 0 ? 'active' : ''}`;
        dotsContainer.appendChild(dot);
    });

    // Reset Position
    track.style.transform = `translateX(-100%)`; 

    // Start Auto Loop
    startSeamlessInterval();
    
    // Event Listener for Loop Reset
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
    if(container) {
        container.addEventListener('touchstart', e => { startX = e.touches[0].clientX; clearInterval(slideInterval); });
        container.addEventListener('touchend', e => {
            const endX = e.changedTouches[0].clientX;
            if (startX - endX > 50) nextSeamlessSlide();
            if (endX - startX > 50) prevSeamlessSlide();
            startSeamlessInterval();
        });
    }
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

// --- ADD/EDIT STOCK MODAL (UPDATED) ---
function openAddModal(id = null, name = '', qty = '') {
    // UI Cleanup
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('menuOverlay').classList.remove('open');
    
    const modal = document.getElementById('addStockModal');
    const card = document.getElementById('addStockCard');
    const nameInput = document.getElementById('inpProdName');
    const qtyInput = document.getElementById('inpProdQty');
    
    // Clear Inputs & Suggestions
    document.getElementById('suggestionBox').innerHTML = '';
    
    // Reset Buttons
    document.querySelectorAll('.qty-chip').forEach(b => {
        b.classList.remove('bg-slate-900', 'text-white', 'bg-indigo-600', 'text-white');
        if(b.innerText === 'Custom') b.classList.add('bg-indigo-50', 'text-indigo-600');
        else b.classList.add('bg-white', 'text-slate-500', 'border-slate-100');
    });

    modal.classList.remove('hidden');
    setTimeout(() => card.classList.remove('translate-y-full'), 10);

    if(id) {
        // EDIT MODE
        editItemId = id; 
        nameInput.value = name;
        qtyInput.value = qty;
        
        // Try to highlight if it matches a preset
        let matched = false;
        document.querySelectorAll('.qty-chip').forEach(btn => {
            // Simple match logic
            if(qty.toLowerCase().includes(btn.innerText.toLowerCase().replace('pkt','packet').replace('pc','piece'))) {
               // Highlight logic here if needed, but for now just showing value in input is enough
            }
        });
    } else {
        // ADD NEW MODE
        editItemId = null;
        nameInput.value = '';
        qtyInput.value = ''; 
        selectedQtyValue = '';
        
        // Auto Focus Name
        setTimeout(() => nameInput.focus(), 100);
        showSmartSuggestions();
    }

    // Attach Listener
    nameInput.oninput = function() {
        if(this.value.length > 0) searchMasterProduct(this.value);
        else showSmartSuggestions();
    };
}

function closeAddModal() {
    const card = document.getElementById('addStockCard');
    card.classList.add('translate-y-full');
    setTimeout(() => {
        document.getElementById('addStockModal').classList.add('hidden');
        document.getElementById('inpProdName').blur();
    }, 300);
}

// --- SMART SUGGESTIONS ---
function showSmartSuggestions() {
    const box = document.getElementById('suggestionBox');
    box.innerHTML = ''; 

    db.ref('masterProducts').once('value', snap => {
        if(!snap.exists()) return;
        const allMaster = Object.values(snap.val());
        // allProducts comes from home-core.js (loaded local cache)
        const userItemNames = (typeof allProducts !== 'undefined') ? allProducts.map(p => p[1].name.toLowerCase()) : [];
        
        const notAdded = allMaster.filter(m => !userItemNames.includes(m.name.toLowerCase()));
        
        const suggestions = [];
        for(let i=0; i<3 && notAdded.length > 0; i++) {
            const rIndex = Math.floor(Math.random() * notAdded.length);
            suggestions.push(notAdded[rIndex].name);
            notAdded.splice(rIndex, 1); 
        }
        renderSuggestions(suggestions, box);
    });
}

function searchMasterProduct(query) {
    const box = document.getElementById('suggestionBox');
    box.innerHTML = '';
    if(!query || query.length < 2) return;

    db.ref('masterProducts').once('value', snap => {
        if(!snap.exists()) return;
        const matches = [];
        Object.values(snap.val()).forEach(item => {
            if(item.name.toLowerCase().includes(query.toLowerCase())) matches.push(item.name);
        });
        renderSuggestions(matches.slice(0, 3), box);
    });
}

function renderSuggestions(list, container) {
    list.forEach(name => {
        const span = document.createElement('span');
        span.className = "bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer border border-blue-100 hover:bg-blue-600 hover:text-white transition animate-[popIn_0.2s_ease-out]";
        span.innerText = "+ " + name;
        span.onclick = () => {
            document.getElementById('inpProdName').value = name;
        };
        container.appendChild(span);
    });
}

// --- QUANTITY LOGIC (Presets + Custom + Buttons) ---

function setQtyPreset(val, btn) {
    selectedQtyValue = val;
    const input = document.getElementById('inpProdQty');
    input.value = val;
    
    // Reset Visuals
    document.querySelectorAll('.qty-chip').forEach(b => {
        b.classList.remove('bg-slate-900', 'text-white', 'bg-indigo-600');
        if(b.innerText === 'Custom') b.classList.add('bg-indigo-50', 'text-indigo-600');
        else b.classList.add('bg-white', 'text-slate-500', 'border-slate-100');
    });

    // Highlight Clicked
    btn.classList.remove('bg-white', 'text-slate-500', 'border-slate-100');
    btn.classList.add('bg-slate-900', 'text-white');
}

function toggleCustomQty(btn) {
    selectedQtyValue = 'custom';
    const input = document.getElementById('inpProdQty');
    
    // Reset Visuals
    document.querySelectorAll('.qty-chip').forEach(b => {
        b.classList.remove('bg-slate-900', 'text-white', 'bg-indigo-600');
        b.classList.add('bg-white', 'text-slate-500', 'border-slate-100');
    });

    // Highlight Custom
    btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'bg-white', 'text-slate-500');
    btn.classList.add('bg-indigo-600', 'text-white');

    input.value = ''; 
    input.focus();
}

function adjustQty(delta) {
    const input = document.getElementById('inpProdQty');
    let currentVal = input.value.trim();
    
    if(!currentVal) {
        input.value = delta > 0 ? "1 Unit" : "";
        return;
    }

    const match = currentVal.match(/^(\d+(\.\d+)?)\s*(.*)$/);
    if(match) {
        let num = parseFloat(match[1]);
        let unit = match[3] || ""; 
        
        let step = 1;
        if(unit.toLowerCase().includes('g') && !unit.toLowerCase().includes('kg')) step = 50; 
        if(unit.toLowerCase().includes('ml')) step = 100;

        let newNum = num + (delta * step);
        if(newNum <= 0) newNum = 0; 

        input.value = `${newNum} ${unit}`.trim();
    } else {
        // Fallback for weird text
        input.value = delta > 0 ? "1 " + currentVal : currentVal;
    }
}

// --- SAVE PRODUCT ---
function saveProduct() {
    const name = document.getElementById('inpProdName').value.trim();
    const qty = document.getElementById('inpProdQty').value.trim();

    if(!name) return showToast("Enter Name");
    if(!qty) return showToast("Enter Quantity");

    if(editItemId) {
        db.ref(`products/${targetMobile}/${editItemId}`).update({ name, qty })
        .then(() => { showToast("Updated"); closeAddModal(); toggleEditMode(); });
    } else {
        db.ref(`products/${targetMobile}`).push({ name, qty, addedAt: firebase.database.ServerValue.TIMESTAMP })
        .then(() => { showToast("Added"); closeAddModal(); });
    }
}

// --- CUSTOM REQUEST ---
function openCustomRequestModal() {
    document.getElementById('customRequestModal').classList.remove('hidden');
    document.getElementById('reqItemName').focus();
}

function closeCustomRequestModal() {
    document.getElementById('customRequestModal').classList.add('hidden');
    document.getElementById('reqItemName').value = '';
}

function addCustomItemToCart() {
    const text = document.getElementById('reqItemName').value.trim();
    if(!text) return showToast("Please write something");

    addToCartLocal(text, "Special Request");
    closeCustomRequestModal();
}

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

// --- VIDEO HELP ---
function openVideoHelp() {
    toggleMenu();
    document.getElementById('videoHelpModal').classList.remove('hidden');
    const container = document.getElementById('videoListContainer');
    container.innerHTML = '<p class="text-center text-slate-400 text-xs py-8"><i class="fa-solid fa-spinner fa-spin"></i> Loading videos...</p>';

    db.ref('admin/videos').once('value', snap => {
        container.innerHTML = '';
        if(snap.exists()) {
            Object.values(snap.val()).forEach(vid => {
                const videoId = vid.link.split('v=')[1] || vid.link.split('/').pop();
                const thumb = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                
                container.innerHTML += `
                    <div onclick="window.open('${vid.link}', '_blank')" class="flex gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100">
                        <div class="w-24 h-16 bg-black rounded-lg flex-shrink-0 overflow-hidden relative">
                            <img src="${thumb}" class="w-full h-full object-cover opacity-80">
                            <div class="absolute inset-0 flex items-center justify-center"><i class="fa-solid fa-play text-white text-lg drop-shadow-md"></i></div>
                        </div>
                        <div class="flex-1 py-1">
                            <h4 class="text-sm font-bold text-slate-800 line-clamp-2 leading-tight">${vid.title}</h4>
                            <p class="text-[10px] text-red-500 font-bold mt-1 uppercase">Watch Now</p>
                        </div>
                    </div>
                `;
            });
        } else {
            container.innerHTML = '<p class="text-center text-slate-400 text-xs py-8">No help videos found.</p>';
        }
    });
}

// --- POLICIES ---
function openPolicies() {
    toggleMenu();
    document.getElementById('policyViewModal').classList.remove('hidden');
    loadPolicy('privacy'); 
}

function loadPolicy(type) {
    const contentArea = document.getElementById('policyContentArea');
    contentArea.innerHTML = '<p class="text-center text-slate-400 mt-10">Loading...</p>';
    
    db.ref('admin/policies/' + type).once('value', snap => {
        if(snap.exists()) {
            let text = snap.val();
            if(!text.includes('<')) text = text.replace(/\n/g, '<br>');
            contentArea.innerHTML = text;
        } else {
            contentArea.innerHTML = '<p class="text-center text-slate-400 mt-10">No content available.</p>';
        }
    });
}

// --- PROFILE & SETTINGS ---
function loadProfile() { 
    db.ref('users/'+targetMobile+'/logo').once('value', s => { 
        if(s.exists()) document.getElementById('profileImg').src = s.val(); 
    }); 
}

function uploadCompressedLogo() { 
    if(!isOwner) return; 
    const f = document.getElementById('logoInput').files[0]; 
    if(f) { 
        const r = new FileReader(); r.readAsDataURL(f); 
        r.onload = e => { 
            const i = new Image(); i.src = e.target.result; 
            i.onload = () => { 
                const c = document.createElement('canvas'); 
                const x = c.getContext('2d'); const w = 300; const sc = w/i.width; 
                c.width=w; c.height=i.height*sc; x.drawImage(i,0,0,c.width,c.height); 
                const d = c.toDataURL('image/jpeg', 0.7); 
                document.getElementById('profileImg').src=d; 
                db.ref('users/'+targetMobile).update({logo:d}).then(()=>showToast("Logo Updated")); 
            }
        }
    }
}

function openAddressModal() { toggleMenu(); document.getElementById('addressModal').classList.remove('hidden'); db.ref('users/'+targetMobile+'/address').once('value', s => { if(s.exists()) document.getElementById('updateAddrText').value = s.val(); }); }
function closeAddressModal() { document.getElementById('addressModal').classList.add('hidden'); }
function saveAddress() { const val = document.getElementById('updateAddrText').value; db.ref('users/'+targetMobile).update({address:val}).then(()=>{ showToast("Address Saved"); closeAddressModal(); }); }
function changePin() { toggleMenu(); const p = prompt("New PIN:"); if(p && p.length===4) db.ref('users/'+targetMobile).update({pin:p}); }
function changeShopName() { toggleMenu(); const n = prompt("Enter New Shop Name:"); if(n) db.ref('users/'+targetMobile).update({shopName: n}).then(()=>showToast("Shop Name Updated")); }

// --- BANNER SETTINGS ---
function setBanColor(c) {
    document.getElementById('selectedColor').value = c;
    document.getElementById('banText').style.borderColor = c;
}

function setBanTextColor(c) {
    document.getElementById('selectedTextColor').value = c;
    showToast("Text Color Selected");
}

function saveBannerSettings() {
    const text = document.getElementById('banText').value;
    const color = document.getElementById('selectedColor').value;
    const textColor = document.getElementById('selectedTextColor').value;
    const fontSize = document.getElementById('banFontSize').value;
    const bold = document.getElementById('banBold').checked;
    
    if(!text) return showToast("Enter Text");

    db.ref(`users/${targetMobile}/banner`).set({text, color, textColor, fontSize, bold})
    .then(() => {
        showToast("Banner Updated");
        document.getElementById('bannerModal').classList.add('hidden');
        setTimeout(() => window.location.reload(), 1000);
    });
}

// --- MISC ACTIONS ---
function repeatLastOrder() {
    if(activeTrackingOrder) return showToast("Finish current order first!");

    showToast("Fetching last order...");
    db.ref('orders').orderByChild('user/mobile').equalTo(session.mobile).limitToLast(1).once('value', snap => {
        if (snap.exists()) {
            const orderData = Object.values(snap.val())[0];
            if(orderData && orderData.cart && orderData.cart.length > 0) {
                let currentCart = JSON.parse(localStorage.getItem('rmz_cart')) || [];
                
                orderData.cart.forEach(prevItem => {
                    currentCart = currentCart.filter(i => !(i.name === prevItem.name && i.qty === prevItem.qty));
                    currentCart.push({ name: prevItem.name, qty: prevItem.qty, count: prevItem.count || 1 });
                });

                localStorage.setItem('rmz_cart', JSON.stringify(currentCart));
                updateCartBadge();
                showToast("Cart updated from previous order!");
            } else {
                showToast("Previous order was empty/invalid.");
            }
        } else {
            showToast("No previous orders found.");
        }
    });
}

function openSupportOptions() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('menuOverlay').classList.remove('open');
    document.getElementById('supportModal').classList.remove('hidden');
}

function sendSupportMsg(issueType) {
    const waNumber = "7903698180";
    db.ref('orders').orderByChild('user/mobile').equalTo(session.mobile).once('value', snap => {
        const totalOrders = snap.exists() ? Object.keys(snap.val()).length : 0;
        const message = `*Ramazone Support Request*\n---------------------------\n*Name:* ${session.name}\n*Mobile:* ${session.mobile}\n*Total Orders:* ${totalOrders}\n---------------------------\n*Issue:* ${issueType}\n\nPlease assist me.`;
        window.open(`https://wa.me/91${waNumber}?text=${encodeURIComponent(message)}`, '_blank');
        document.getElementById('supportModal').classList.add('hidden');
    });
}

function shareStore() {
    const url = `${window.location.origin}${window.location.pathname}?shop=${targetMobile}`;
    const text = `Check out ${document.getElementById('headerShopName').innerText} on Ramazone!\nOrder here: ${url}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
}