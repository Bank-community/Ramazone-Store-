// --- GLOBAL STATE & CONFIG ---
let allProductsCache = [], validCoupons = [], orderItems = [];
let appliedCoupon = null, deliveryFee = 0, ramazoneDeliveryCharge = 15;
const FREE_DELIVERY_THRESHOLD = 500;
let database;

// --- LOCAL STORAGE & DATE HELPERS ---
const isSameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
const getTodaysOrders = () => { try { const o = JSON.parse(localStorage.getItem('ramazoneTodaysOrders')) || []; return o.filter(order => isSameDay(new Date(order.date), new Date())); } catch (e) { return []; } };
const addOrderToTodaysList = (id) => { const o = getTodaysOrders(); o.push({ id, date: new Date().toISOString() }); localStorage.setItem('ramazoneTodaysOrders', JSON.stringify(o)); };

// --- CART HELPERS ---
const getCart = () => { try { return JSON.parse(localStorage.getItem('ramazoneCart')) || []; } catch (e) { return []; } };
const saveCart = (cart) => localStorage.setItem('ramazoneCart', JSON.stringify(cart));

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeOrderPage);

async function initializeOrderPage() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        const firebaseConfig = await response.json();
        if (!firebaseConfig.apiKey) throw new Error("Firebase config invalid.");

        firebase.initializeApp(firebaseConfig);
        database = firebase.database();

        await fetchAllData();
        await checkAutoOrderStatus();
        loadOrderFromCart(); 
        setupEventListeners();
    } catch (error) { 
        console.error("Initialization Failed:", error); 
        document.getElementById('loading-indicator').innerHTML = `<p class="text-red-500">Could not load page.</p>`; 
    }
}

async function fetchAllData() {
    const snapshot = await database.ref('ramazone').get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        ramazoneDeliveryCharge = data.config?.deliveryCharge || 15;
        document.getElementById('ramazone-delivery-label').textContent = `Ramazone Delivery (+₹${ramazoneDeliveryCharge})`;
        allProductsCache = Object.values(data.products || {});
        validCoupons = (data.homepage?.coupons || []).filter(c => c.status === 'active');
    }
}

function processCartForDisplay() {
    const cart = getCart();
    const processedItems = [];
    const bundledIds = new Set(); 

    for (let i = 0; i < cart.length; i++) {
        const cartItem = cart[i];
        if (bundledIds.has(`${cartItem.id}-${JSON.stringify(cartItem.variants)}`)) continue;

        const product1 = allProductsCache.find(p => p.id === cartItem.id);
        if (!product1 || !product1.combos || !product1.combos.productBundle) continue;

        const bundleInfo = product1.combos.productBundle;
        const linkedProductId = bundleInfo.linkedProductId;

        for (let j = i + 1; j < cart.length; j++) {
            const potentialPartner = cart[j];
            if (potentialPartner.id === linkedProductId) {
                const product2 = allProductsCache.find(p => p.id === linkedProductId);
                if (product2) {
                    processedItems.push({
                        isBundle: true,
                        bundlePrice: bundleInfo.bundlePrice,
                        quantity: cartItem.quantity,
                        products: [ { ...product1, ...cartItem }, { ...product2, ...potentialPartner } ],
                        cartIndices: [i, j]
                    });
                    bundledIds.add(`${cartItem.id}-${JSON.stringify(cartItem.variants)}`);
                    bundledIds.add(`${potentialPartner.id}-${JSON.stringify(potentialPartner.variants)}`);
                    break; 
                }
            }
        }
    }

    cart.forEach((cartItem, index) => {
        if (!bundledIds.has(`${cartItem.id}-${JSON.stringify(cartItem.variants)}`)) {
            const productDetails = allProductsCache.find(p => p.id === cartItem.id);
            if (productDetails) {
                processedItems.push({ isBundle: false, ...productDetails, ...cartItem, cartIndex: index });
            }
        }
    });

    return processedItems;
}

function loadOrderFromCart() {
    const orderContent = document.getElementById('order-page-content');
    const emptyMessage = document.getElementById('empty-cart-message');
    const stickyFooter = document.getElementById('sticky-order-footer');

    orderItems = processCartForDisplay();

    if (orderItems.length === 0 && getCart().length > 0) {
        saveCart([]);
        window.location.reload();
        return;
    }

    if (orderItems.length === 0) {
        orderContent.classList.add('hidden');
        stickyFooter.classList.add('hidden');
        emptyMessage.classList.remove('hidden');
        document.getElementById('loading-indicator').style.display = 'none';
        return;
    }

    emptyMessage.classList.add('hidden');
    orderContent.classList.remove('hidden');
    stickyFooter.classList.remove('hidden');
    renderOrderItems();
    updatePriceSummary();
    document.getElementById('loading-indicator').style.display = 'none';
}

function renderOrderItems() {
    const container = document.getElementById('order-items-container');
    container.innerHTML = orderItems.map(item => {
        if (item.isBundle) {
            return createBundleItemCard(item);
        } else {
            return createSingleItemCard(item);
        }
    }).join('');
}

function createSingleItemCard(item) {
    const isPack = item.pack && item.pack.name !== 'Single Item';
    const displayName = isPack ? `${item.name} (${item.pack.name})` : item.name;
    const displayPrice = isPack ? Number(item.pack.price) : Number(item.displayPrice);

    const variantsHtml = item.variants && Object.keys(item.variants).length > 0
        ? `<div class="text-xs text-gray-500 mt-1">${Object.entries(item.variants).map(([key, value]) => `<span>${key}: ${value}</span>`).join(' &middot; ')}</div>`
        : '';

    return `<div class="order-item-card flex items-start gap-4 p-2 border-b last:border-b-0">
        <button class="delete-item-btn" data-cart-index="${item.cartIndex}">
            <img src="https://www.svgrepo.com/show/502614/delete.svg" alt="Delete">
        </button>
        <a href="product-details.html?id=${item.id}" class="flex-shrink-0">
            <img src="${item.images?.[0] || ''}" alt="${item.name}" class="w-20 h-20 object-cover rounded-md border">
        </a>
        <div class="flex-grow flex flex-col justify-between self-stretch">
            <div>
                <a href="product-details.html?id=${item.id}" class="block">
                    <h3 class="font-bold text-md text-gray-800">${displayName}</h3>
                </a>
                ${variantsHtml}
            </div>
            <div class="flex items-center justify-between mt-2">
                <span class="text-lg font-bold text-gray-900">₹${displayPrice.toLocaleString('en-IN')}</span>
                <div class="quantity-selector-order">
                    <button class="qty-decrease" data-cart-index="${item.cartIndex}" ${isPack || item.variants ? '' : ''}>-</button>
                    <span>${item.quantity}</span>
                    <button class="qty-increase" data-cart-index="${item.cartIndex}" ${isPack || item.variants ? '' : ''}>+</button>
                </div>
            </div>
        </div>
    </div>`;
}

function createBundleItemCard(bundle) {
    const [p1, p2] = bundle.products;
    return `<div class="order-item-card bg-indigo-50 p-3 rounded-lg border border-indigo-200">
        <button class="delete-item-btn" data-cart-indices="${bundle.cartIndices.join(',')}">
             <img src="https://www.svgrepo.com/show/502614/delete.svg" alt="Delete">
        </button>
        <div class="flex items-center justify-between mb-2">
            <h3 class="font-bold text-md text-indigo-800">Product Bundle</h3>
            <span class="text-lg font-bold text-gray-900">₹${Number(bundle.bundlePrice).toLocaleString('en-IN')}</span>
        </div>
        <div class="flex items-center gap-3 mb-2">
            <img src="${p1.images?.[0] || ''}" class="w-12 h-12 object-cover rounded-md border">
            <p class="text-sm text-gray-700 flex-grow">${p1.name}</p>
        </div>
        <div class="flex items-center gap-3">
            <img src="${p2.images?.[0] || ''}" class="w-12 h-12 object-cover rounded-md border">
            <p class="text-sm text-gray-700 flex-grow">${p2.name}</p>
        </div>
        <div class="flex justify-end mt-2">
             <div class="quantity-selector-order">
                <button class="qty-decrease" data-cart-indices="${bundle.cartIndices.join(',')}">-</button>
                <span>${bundle.quantity}</span>
                <button class="qty-increase" data-cart-indices="${bundle.cartIndices.join(',')}">+</button>
            </div>
        </div>
    </div>`;
}

function updatePriceSummary() {
    const subtotal = orderItems.reduce((acc, item) => {
        if (item.isBundle) return acc + (Number(item.bundlePrice) * item.quantity);
        if (item.pack && item.pack.name !== 'Single Item') return acc + (Number(item.pack.price) * item.quantity);
        return acc + (Number(item.displayPrice) * item.quantity);
    }, 0);
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const selectedDelivery = document.querySelector('input[name="delivery"]:checked').value;
    deliveryFee = (selectedDelivery === 'Ramazone' && subtotal < FREE_DELIVERY_THRESHOLD) ? ramazoneDeliveryCharge : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;
    document.getElementById('subtotal-price').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    const couponRow = document.getElementById('coupon-discount-row');
    if (appliedCoupon) {
        document.getElementById('coupon-discount-amount').textContent = `- ₹${couponDiscount.toLocaleString('en-IN')}`;
        couponRow.style.display = 'flex';
    } else {
        couponRow.style.display = 'none';
    }
    document.getElementById('delivery-fee').textContent = deliveryFee > 0 ? `+ ₹${deliveryFee.toLocaleString('en-IN')}` : 'Free';
    document.getElementById('grand-total').textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    document.getElementById('footer-total-price').textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
}

function setupEventListeners() {
    document.getElementById('apply-coupon-btn').addEventListener('click', applyCoupon);
    document.getElementById('remove-coupon-btn').addEventListener('click', removeCoupon);
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
    document.getElementById('search-order-btn').addEventListener('click', searchOrder);
    document.getElementById('view-invoice-btn').addEventListener('click', viewInvoice);
    document.getElementById('invoice-close-btn').addEventListener('click', () => document.getElementById('invoice-modal').classList.remove('active'));
    document.getElementById('download-invoice-btn').addEventListener('click', downloadInvoice);
    document.getElementById('payment-option-group').addEventListener('click', e => { if (e.target.closest('.option-label')) { document.querySelectorAll('#payment-option-group .option-label').forEach(l => l.classList.remove('selected')); e.target.closest('.option-label').classList.add('selected'); } });
    document.getElementById('delivery-option-group').addEventListener('click', e => { if (e.target.closest('.option-label')) { document.querySelectorAll('#delivery-option-group .option-label').forEach(l => l.classList.remove('selected')); e.target.closest('.option-label').classList.add('selected'); updatePriceSummary(); } });
    document.body.addEventListener('click', e => { const copyBtn = e.target.closest('.copy-id-btn'); if (copyBtn) { navigator.clipboard.writeText(copyBtn.dataset.id).then(() => showToast(`Order ID ${copyBtn.dataset.id} copied!`, 'success')); } });
    document.getElementById('order-items-container').addEventListener('click', handleCartActions);
    document.getElementById('auto-status-container').addEventListener('click', (event) => {
        const viewMoreBtn = event.target.closest('.view-more-btn');
        if (viewMoreBtn) {
            const orderId = viewMoreBtn.dataset.orderId;
            document.getElementById('order-id-input').value = orderId;
            document.getElementById('search-order-btn').click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

function handleCartActions(event) {
    const target = event.target.closest('button');
    if (!target) return;
    let cart = getCart();
    let cartUpdated = false;
    if (target.classList.contains('delete-item-btn')) {
        const indicesToDelete = (target.dataset.cartIndices || target.dataset.cartIndex).split(',').map(Number);
        indicesToDelete.sort((a, b) => b - a);
        indicesToDelete.forEach(index => cart.splice(index, 1));
        cartUpdated = true;
    } else if (target.classList.contains('qty-increase') || target.classList.contains('qty-decrease')) {
        const isIncrease = target.classList.contains('qty-increase');
        const indicesToUpdate = (target.dataset.cartIndices || target.dataset.cartIndex).split(',').map(Number);
        indicesToUpdate.forEach(index => {
            if (cart[index]) {
                if (isIncrease) cart[index].quantity++;
                else cart[index].quantity--;
            }
        });
        for (let i = cart.length - 1; i >= 0; i--) {
            if (cart[i].quantity <= 0) cart.splice(i, 1);
        }
        cartUpdated = true;
    }
    if (cartUpdated) {
        saveCart(cart);
        loadOrderFromCart();
    }
}

async function placeOrder(event) {
    event.preventDefault();
    const form = document.getElementById('customer-details-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        showToast('Please fill all shipping details correctly.', 'error');
        return;
    }
    const placeOrderBtn = document.getElementById('place-order-btn');
    placeOrderBtn.textContent = 'Placing...';
    placeOrderBtn.style.pointerEvents = 'none';
    const orderId = generateOrderId();
    const customerDetails = {
        name: document.getElementById('customer-name').value,
        mobile: document.getElementById('customer-mobile').value,
        address: document.getElementById('customer-address').value
    };
    updatePriceSummary();
    const subtotal = orderItems.reduce((acc, item) => { if (item.isBundle) return acc + (Number(item.bundlePrice) * item.quantity); if (item.pack && item.pack.name !== 'Single Item') return acc + (Number(item.pack.price) * item.quantity); return acc + (Number(item.displayPrice) * item.quantity); }, 0);
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;
    const dbItems = [];
    orderItems.forEach(item => {
        if (item.isBundle) {
            item.products.forEach(p => dbItems.push({ id: p.id, name: p.name, quantity: item.quantity, displayPrice: p.displayPrice, image: p.images?.[0] || '', variants: p.variants, bundleParent: item.products[0].id }));
        } else {
            dbItems.push({ id: item.id, name: item.name, quantity: item.quantity, displayPrice: item.displayPrice, image: item.images?.[0] || '', variants: item.variants, pack: item.pack });
        }
    });
    const orderData = {
        orderId, customerDetails, grandTotal,
        paymentMethod: document.querySelector('input[name="payment"]:checked').value,
        deliveryMethod: document.querySelector('input[name="delivery"]:checked').value,
        items: dbItems,
        priceSummary: { subtotal, coupon: appliedCoupon, deliveryFee, grandTotal },
        status: 'Pending', createdAt: firebase.database.ServerValue.TIMESTAMP,
        statusHistory: { initial: { status: 'Pending', timestamp: firebase.database.ServerValue.TIMESTAMP } }
    };
    try {
        await database.ref(`ramazone/orders/pending/${orderId}`).set(orderData);
        addOrderToTodaysList(orderId);
        const sellerPhoneNumber = '917903698180';
        let message = `🛍️ *Ramazone Store Order* 🛍️\n\n*Order ID:* ${orderId}\n\n*Customer:*\n${customerDetails.name}\n*Mobile:* ${customerDetails.mobile}\n*Address:* ${customerDetails.address}\n\n*Summary:*\n`;
        orderItems.forEach((item, index) => {
            if (item.isBundle) {
                message += `${index + 1}. *BUNDLE* (x${item.quantity}) - *₹${(item.bundlePrice * item.quantity).toLocaleString('en-IN')}*\n   - ${item.products[0].name}\n   - ${item.products[1].name}\n`;
            } else {
                const isPack = item.pack && item.pack.name !== 'Single Item';
                const price = isPack ? item.pack.price : item.displayPrice;
                const name = isPack ? `${item.name} (${item.pack.name})` : item.name;
                message += `${index + 1}. *${name}* (x${item.quantity}) - *₹${(price * item.quantity).toLocaleString('en-IN')}*\n`;
                if (item.variants && Object.keys(item.variants).length > 0) {
                    message += `   - _${Object.entries(item.variants).map(([k, v]) => `${k}: ${v}`).join(', ')}_\n`;
                }
            }
        });
        message += `\n--- *Price Details* ---\n*Subtotal:* ₹${subtotal.toLocaleString('en-IN')}\n`;
        if (appliedCoupon) message += `*Coupon (${appliedCoupon.code}):* - ₹${couponDiscount.toLocaleString('en-IN')}\n`;
        message += `*Delivery:* ${deliveryFee > 0 ? `₹${deliveryFee.toLocaleString('en-IN')}` : 'Free'}\n--------------------\n*Total:* *₹${grandTotal.toLocaleString('en-IN')}*\n*Payment:* ${orderData.paymentMethod}`;
        saveCart([]);
        document.getElementById('order-page-content').innerHTML = `<div class="text-center p-8 bg-white rounded-lg shadow"><i class="fas fa-check-circle text-5xl text-green-500 mb-4"></i><h2 class="text-2xl font-bold text-gray-800">Order Placed!</h2><p class="mt-4 font-semibold text-lg">Your Order ID:</p><div class="bg-gray-100 text-gray-800 font-bold text-2xl p-3 rounded-lg mt-2 inline-block select-all">${orderId}</div><p class="text-sm text-gray-500 mt-2">We will keep you updated.</p><a href="index.html" class="shop-now-btn mt-6">Continue Shopping</a></div>`;
        document.getElementById('sticky-order-footer').style.display = 'none';
        window.location.href = `https://wa.me/${sellerPhoneNumber}?text=${encodeURIComponent(message)}`;
    } catch (error) {
        console.error("Failed to place order:", error);
        showToast('Could not place order.', 'error');
        placeOrderBtn.textContent = 'Place Order';
        placeOrderBtn.style.pointerEvents = 'auto';
    }
}

function applyCoupon() { const code = document.getElementById('coupon-input').value.trim().toLowerCase(); if (!code) return; if (appliedCoupon) { showToast('Coupon already applied.', 'error'); return; } const foundCoupon = validCoupons.find(c => c.code.toLowerCase() === code); if (foundCoupon) { appliedCoupon = foundCoupon; showToast(`Coupon "${foundCoupon.code}" applied!`, 'success'); document.getElementById('coupon-section').classList.add('hidden'); document.getElementById('applied-coupon-code').textContent = foundCoupon.code; document.getElementById('applied-coupon-div').classList.remove('hidden'); } else { appliedCoupon = null; showToast('Invalid coupon code.', 'error'); } updatePriceSummary(); }
function removeCoupon() { appliedCoupon = null; showToast('Coupon removed.', 'info'); document.getElementById('coupon-input').value = ''; document.getElementById('coupon-section').classList.remove('hidden'); document.getElementById('applied-coupon-div').classList.add('hidden'); updatePriceSummary(); }
function generateOrderId() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let result = 'RMZ'; for (let i = 0; i < 8; i++) { result += chars.charAt(Math.floor(Math.random() * chars.length)); } return result; }
async function searchOrder() { const orderId = document.getElementById('order-id-input').value.trim().toUpperCase(); const searchStatusEl = document.getElementById('search-status'); const searchResultEl = document.getElementById('order-search-result'); if (!orderId) { searchStatusEl.textContent = 'Please enter an Order ID.'; searchStatusEl.className = 'text-center my-2 text-sm text-yellow-600'; return; } searchStatusEl.textContent = 'Searching...'; searchStatusEl.className = 'text-center my-2 text-sm text-blue-600'; searchResultEl.classList.add('hidden'); try { const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get(); if (snapshot.exists()) { const orderData = snapshot.val(); renderSearchResult(orderData); searchStatusEl.textContent = `Showing results for Order ID: ${orderId}`; searchStatusEl.className = 'text-center my-2 text-sm text-green-600'; } else { searchStatusEl.textContent = 'Order not found or not confirmed yet.'; searchStatusEl.className = 'text-center my-2 text-sm text-red-600'; } } catch (error) { console.error("Order search failed:", error); searchStatusEl.textContent = 'An error occurred.'; searchStatusEl.className = 'text-center my-2 text-sm text-red-600'; } }
function renderSearchResult(orderData) { const searchResultEl = document.getElementById('order-search-result'); renderDeliveryTracker(orderData.status, document.getElementById('delivery-tracker-container')); searchResultEl.classList.remove('hidden'); }
function renderDeliveryTracker(status, container) { if (status === 'Rejected') { container.innerHTML = `<div class="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg"><i class="fas fa-times-circle text-red-500 text-3xl mr-4"></i><div><h3 class="font-bold text-red-700">Order Rejected</h3><p class="text-sm text-red-600">This order was rejected. Please contact support for more details.</p></div></div>`; return; } const statuses = ['Confirmed', 'Shipped', 'Out for Delivery', 'Delivered']; const icons = ['fa-check', 'fa-truck-fast', 'fa-truck-ramp-box', 'fa-star']; const currentStatusIndex = statuses.indexOf(status); let stepsHtml = statuses.map((s, index) => { const isCompleted = index <= currentStatusIndex; return `<div class="tracker-step ${isCompleted ? 'completed' : ''}"><div class="step-icon"><i class="fas ${icons[index]}"></i></div><p class="step-label">${s.replace(' ', '\n')}</p></div>`; }).join(''); const progressPercentage = currentStatusIndex >= 0 ? (currentStatusIndex / (statuses.length - 1)) * 100 : 0; container.innerHTML = `<div class="relative"><div class="tracker-line"><div class="tracker-progress-line" style="width: ${progressPercentage}%;"></div></div><div class="delivery-tracker">${stepsHtml}</div></div>`; }
async function viewInvoice() { const orderId = document.getElementById('order-id-input').value.trim().toUpperCase(); if (!orderId) { showToast('No order loaded.', 'error'); return; } const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get(); if (!snapshot.exists()) { showToast('Could not find order data.', 'error'); return; } const orderData = snapshot.val(); const slipContent = document.getElementById('invoice-slip-for-render'); const summary = orderData.priceSummary; const storeDetails = { name: 'Ramazone Online Store', owner: 'Prince Rama', address: 'Lalunagar, Begusarai, Bihar - 851129', phone: 'WhatsApp: 7903698180', email: 'ramazone007@gmail.com', website: 'www.ramazon.in' }; slipContent.innerHTML = `<div style="width: 210mm; min-height: 297mm; padding: 15mm; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; color: #333; font-size: 11pt; display: flex; flex-direction: column; margin: auto; background: white;"><header style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 1.5rem; border-bottom: 4px solid #DC2626;"><div><h1 style="font-size: 2.5rem; font-weight: bold; color: #DC2626; margin: 0;">INVOICE</h1><p style="margin: 8px 0 0; font-size: 1rem; color: #555;"><strong>Invoice No:</strong> ${orderData.orderId}</p><p style="margin: 4px 0 0; font-size: 1rem; color: #555;"><strong>Invoice Date:</strong> ${new Date(orderData.createdAt).toLocaleDateString()}</p></div><div style="text-align: right;"><img src="https://i.ibb.co/2RySQ5K/20240813-084352.png" alt="Ramazone Logo" style="height: 65px; margin-bottom: 8px; margin-left: auto;" crossOrigin="anonymous"><p style="margin: 0; font-weight: bold; font-size: 1.1rem;">${storeDetails.name}</p><p style="margin: 4px 0 0; font-size: 0.9rem; color: #555;">Proprietor: ${storeDetails.owner}</p></div></header><section style="margin-top: 2rem; display: flex; justify-content: space-between; font-size: 0.9rem; line-height: 1.5;"><div><p style="font-weight: bold; color: #555;">STORE DETAILS:</p><p style="margin: 4px 0 0;">${storeDetails.address}</p><p style="margin: 4px 0 0;">${storeDetails.phone}</p><p style="margin: 4px 0 0;">${storeDetails.email}</p></div><div style="text-align: right;"><p style="font-weight: bold; color: #555;">BILL TO:</p><p style="margin: 4px 0 0;">${orderData.customerDetails.name}</p><p style="margin: 4px 0 0; color: #666; max-width: 250px;">${orderData.customerDetails.address}</p></div></section><section style="margin-top: 2.5rem; flex-grow: 1;"><table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;"><thead><tr style="background-color: #DC2626; color: #FFFFFF;"><th style="padding: 0.8rem; text-align: left; border-radius: 6px 0 0 6px;">SL.</th><th style="padding: 0.8rem; text-align: left;">DESCRIPTION</th><th style="padding: 0.8rem; text-align: center;">QTY</th><th style="padding: 0.8rem; text-align: right;">RATE</th><th style="padding: 0.8rem; text-align: right; border-radius: 0 6px 6px 0;">AMOUNT</th></tr></thead><tbody>${orderData.items.map((item, index) => `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 0.8rem;">${index + 1}</td><td style="padding: 0.8rem;"><div style="display: flex; align-items: center;"><img src="${item.image}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; margin-right: 12px;" crossOrigin="anonymous"><span style="font-weight: 500;">${item.name}</span></div></td><td style="padding: 0.8rem; text-align: center;">${item.quantity}</td><td style="padding: 0.8rem; text-align: right;">₹${item.displayPrice.toLocaleString('en-IN')}</td><td style="padding: 0.8rem; text-align: right; font-weight: 500;">₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}</td></tr>`).join('')}</tbody></table></section><section style="margin-top: 2rem; display: flex; justify-content: flex-end;"><div style="width: 300px; font-size: 0.9rem;"><div style="display: flex; justify-content: space-between; padding: 0.5rem 0;"><span>Subtotal:</span><span>₹${summary.subtotal.toLocaleString('en-IN')}</span></div>${summary.coupon ? `<div style="display: flex; justify-content: space-between; padding: 0.5rem 0; color: #16a34a;"><span>Coupon (${summary.coupon.code}):</span><span>- ₹${summary.coupon.discount.toLocaleString('en-IN')}</span></div>` : ''}<div style="display: flex; justify-content: space-between; padding: 0.5rem 0;"><span>Delivery Fee:</span><span>${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></div><div style="display: flex; justify-content: space-between; padding: 0.75rem 0; margin-top: 0.5rem; border-top: 2px solid #333; font-weight: bold; font-size: 1.3rem;"><span>Grand Total:</span><span>₹${summary.grandTotal.toLocaleString('en-IN')}</span></div></div></section><footer style="margin-top: 4rem; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #eee; padding-top: 1rem;"><div style="font-size: 0.8rem; color: #888;"><p style="margin: 0;">Thank you for your order!</p><p style="margin: 4px 0 0; font-weight: bold;">${storeDetails.website}</p></div><div style="text-align: center;"><p style="font-weight: bold; font-size: 1.2rem; letter-spacing: 1px; font-family: 'Segoe UI', sans-serif; margin: 0; color: #333;">Ramazone</p><p style="margin: 0; border-top: 1px solid #555; padding-top: 4px; font-size: 0.8rem; font-weight: bold;">Authorized Signatory</p></div></footer></div>`; document.getElementById('invoice-modal').classList.add('active'); }
function downloadInvoice() { const invoiceElement = document.getElementById('invoice-slip-for-render').querySelector('div'); const orderId = document.getElementById('order-id-input').value.trim().toUpperCase(); if (!invoiceElement || !orderId) { showToast('Invoice content not found.', 'error'); return; } const btn = document.getElementById('download-invoice-btn'); btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Generating...`; html2canvas(invoiceElement, { scale: 3, useCORS: true, allowTaint: true, width: 794, height: invoiceElement.scrollHeight, windowWidth: 794, windowHeight: invoiceElement.scrollHeight }).then(canvas => { const link = document.createElement('a'); link.download = `Ramazone-Invoice-${orderId}.png`; link.href = canvas.toDataURL('image/png'); link.click(); btn.disabled = false; btn.innerHTML = `<i class="fas fa-download mr-2"></i>Download Invoice`; }).catch(err => { console.error("Download failed:", err); showToast('Failed to generate invoice.', 'error'); btn.disabled = false; btn.innerHTML = `<i class="fas fa-download mr-2"></i>Download Invoice`; }); }
function showToast(message, type = "info") { const toast = document.getElementById("toast-notification"); if(!toast) return; toast.textContent = message; toast.className = 'toast show'; if(type === 'success') toast.classList.add('success'); if(type === 'error') toast.classList.add('error'); setTimeout(() => toast.classList.remove("show"), 3000); }

async function checkAutoOrderStatus() {
    const todaysOrders = getTodaysOrders();
    if (todaysOrders.length === 0) return;
    if (todaysOrders.length > 1) {
        const notification = document.getElementById('all-orders-notification');
        document.getElementById('all-orders-summary').textContent = `You have ${todaysOrders.length} orders today:`;
        document.getElementById('all-orders-list').innerHTML = todaysOrders.map(o => `<div class="flex items-center gap-2"><span class="font-mono">${o.id}</span><button data-id="${o.id}" class="copy-id-btn text-indigo-500 hover:text-indigo-700"><i class="far fa-copy"></i></button></div>`).join('');
        notification.classList.remove('hidden');
    }
    const lastOrder = todaysOrders[todaysOrders.length - 1];
    const orderId = lastOrder.id;
    let orderData = null;
    for (const status of ['pending', 'confirmed', 'rejected']) {
        const snapshot = await database.ref(`ramazone/orders/${status}/${orderId}`).get();
        if (snapshot.exists()) {
            orderData = snapshot.val();
            break;
        }
    }
    if (!orderData || !orderData.items || orderData.items.length === 0) return;
    const firstItem = orderData.items[0];
    const productPreviewContainer = document.getElementById('auto-status-product-preview');
    productPreviewContainer.innerHTML = `
        <img src="${firstItem.image || 'https://placehold.co/128x128'}" alt="${firstItem.name}">
        <div class="status-product-details">
            <h4>${firstItem.name}</h4>
            <p>₹${Number(firstItem.displayPrice).toLocaleString('en-IN')} &times; ${firstItem.quantity}</p>
        </div>
    `;
    const footerContainer = document.getElementById('auto-status-footer');
    const orderDate = new Date(orderData.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    footerContainer.innerHTML = `
        <span class="order-date">Ordered on: ${orderDate}</span>
        <button class="view-more-btn" data-order-id="${orderId}">View More &rarr;</button>
    `;
    renderDeliveryTracker(orderData.status, document.getElementById('auto-status-tracker'));
    document.getElementById('auto-status-container').classList.remove('hidden');
}

