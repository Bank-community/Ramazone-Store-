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
        loadOrderFromCart();
        await checkAutoOrderStatus();
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

    cart.forEach((cartItem, index) => {
        const productDetails = allProductsCache.find(p => p.id === cartItem.id);
        if (productDetails) {
            processedItems.push({
                ...productDetails,
                ...cartItem,
                cartIndex: index
            });
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
    container.innerHTML = orderItems.map(createSingleItemCard).join('');
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
                    <button class="qty-decrease" data-cart-index="${item.cartIndex}" ${isPack ? 'disabled' : ''}>-</button>
                    <span>${item.quantity}</span>
                    <button class="qty-increase" data-cart-index="${item.cartIndex}" ${isPack ? 'disabled' : ''}>+</button>
                </div>
            </div>
        </div>
    </div>`;
}

function updatePriceSummary() {
    const subtotal = orderItems.reduce((acc, item) => {
        const isPack = item.pack && item.pack.name !== 'Single Item';
        const price = isPack ? Number(item.pack.price) : Number(item.displayPrice);
        return acc + (price * item.quantity);
    }, 0);

    const bundleDiscounts = JSON.parse(localStorage.getItem('ramazoneDiscounts')) || [];
    let totalBundleDiscount = 0;
    let appliedBundleInfo = '';

    if (bundleDiscounts.length > 0) {
        bundleDiscounts.forEach(discount => {
            if (discount.type === 'BUNDLE') {
                const areAllProductsInCart = discount.productIds.every(id =>
                    orderItems.some(item => item.id === id)
                );
                if (areAllProductsInCart) {
                    const originalTotalOfBundle = discount.productIds.reduce((total, id) => {
                        const product = orderItems.find(item => item.id === id);
                        return total + (Number(product.displayPrice) * product.quantity);
                    }, 0);
                    const discountAmount = originalTotalOfBundle - (Number(discount.bundlePrice) * orderItems.find(i=>i.id === discount.productIds[0]).quantity) ;
                    if (discountAmount > 0) {
                        totalBundleDiscount += discountAmount;
                        appliedBundleInfo = 'Bundle Offer';
                    }
                }
            }
        });
    }

    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const selectedDelivery = document.querySelector('input[name="delivery"]:checked').value;
    deliveryFee = (selectedDelivery === 'Ramazone' && subtotal < FREE_DELIVERY_THRESHOLD) ? ramazoneDeliveryCharge : 0;
    const grandTotal = subtotal - couponDiscount - totalBundleDiscount + deliveryFee;

    document.getElementById('subtotal-price').textContent = `₹${subtotal.toLocaleString('en-IN')}`;

    const summaryContainer = document.getElementById('price-summary-container');
    let bundleRow = document.getElementById('bundle-discount-row');
    if (totalBundleDiscount > 0) {
        if (!bundleRow) {
            bundleRow = document.createElement('div');
            bundleRow.id = 'bundle-discount-row';
            summaryContainer.insertBefore(bundleRow, document.getElementById('delivery-fee-row'));
        }
        bundleRow.className = 'flex justify-between text-green-600';
        bundleRow.innerHTML = `<span>${appliedBundleInfo}</span><span class="font-medium">- ₹${totalBundleDiscount.toLocaleString('en-IN')}</span>`;
        bundleRow.style.display = 'flex';
    } else if (bundleRow) {
        bundleRow.style.display = 'none';
    }

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
    document.getElementById('view-invoice-btn').addEventListener('click', downloadInvoiceDirectly);
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

    const cart = getCart();
    const cartIndex = parseInt(target.dataset.cartIndex);
    let cartUpdated = false;

    if (isNaN(cartIndex) || !cart[cartIndex]) return;

    if (target.classList.contains('delete-item-btn')) {
        cart.splice(cartIndex, 1);
        cartUpdated = true;
    } else if (target.classList.contains('qty-increase')) {
        cart[cartIndex].quantity++;
        cartUpdated = true;
    } else if (target.classList.contains('qty-decrease')) {
        if (cart[cartIndex].quantity > 1) {
            cart[cartIndex].quantity--;
        } else {
            cart.splice(cartIndex, 1);
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
    const subtotal = orderItems.reduce((acc, item) => { const isPack = item.pack && item.pack.name !== 'Single Item'; const price = isPack ? Number(item.pack.price) : Number(item.displayPrice); return acc + (price * item.quantity); }, 0);
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const bundleDiscountValue = Number(document.getElementById('bundle-discount-row')?.textContent.replace(/[^0-9.-]+/g,"")) || 0;
    const grandTotal = subtotal - couponDiscount + bundleDiscountValue + deliveryFee;

    const orderData = {
        orderId, customerDetails, grandTotal,
        paymentMethod: document.querySelector('input[name="payment"]:checked').value,
        deliveryMethod: document.querySelector('input[name="delivery"]:checked').value,
        items: orderItems.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            displayPrice: (item.pack && item.pack.name !== 'Single Item') ? item.pack.price : item.displayPrice,
            image: item.images?.[0] || '',
            variants: item.variants || {},
            pack: item.pack || null
        })),
        priceSummary: { subtotal, coupon: appliedCoupon, bundleDiscount: bundleDiscountValue, deliveryFee, grandTotal },
        status: 'Pending', createdAt: firebase.database.ServerValue.TIMESTAMP,
        statusHistory: { initial: { status: 'Pending', timestamp: firebase.database.ServerValue.TIMESTAMP } }
    };

    try {
        await database.ref(`ramazone/orders/pending/${orderId}`).set(orderData);
        addOrderToTodaysList(orderId);
        const sellerPhoneNumber = '917903698180';

        let message = `🛍️ *Ramazone Store Order* 🛍️\n\n*Order ID:* ${orderId}\n\n*Customer:*\n${customerDetails.name}\n*Mobile:* ${customerDetails.mobile}\n*Address:* ${customerDetails.address}\n\n*Summary:*\n`;

        orderItems.forEach((item, index) => {
            const isPack = item.pack && item.pack.name !== 'Single Item';
            const name = isPack ? `${item.name} (${item.pack.name})` : item.name;
            const price = isPack ? Number(item.pack.price) : Number(item.displayPrice);
            message += `${index + 1}. *${name}* (x${item.quantity}) - *₹${(price * item.quantity).toLocaleString('en-IN')}*\n`;
            if(item.variants && Object.keys(item.variants).length > 0) {
                message += `   - _${Object.entries(item.variants).map(([k,v]) => `${k}: ${v}`).join(', ')}_\n`;
            }
        });

        message += `\n--- *Price Details* ---\n*Subtotal:* ₹${subtotal.toLocaleString('en-IN')}\n`;
        if (bundleDiscountValue < 0) message += `*Bundle Offer:* - ₹${Math.abs(bundleDiscountValue).toLocaleString('en-IN')}\n`;
        if (appliedCoupon) message += `*Coupon (${appliedCoupon.code}):* - ₹${couponDiscount.toLocaleString('en-IN')}\n`;
        message += `*Delivery:* ${deliveryFee > 0 ? `₹${deliveryFee.toLocaleString('en-IN')}` : 'Free'}\n--------------------\n*Total:* *₹${grandTotal.toLocaleString('en-IN')}*\n*Payment:* ${orderData.paymentMethod}`;

        saveCart([]);
        localStorage.removeItem('ramazoneDiscounts');
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
function renderSearchResult(orderData) { const searchResultEl = document.getElementById('order-search-result'); const summaryContainer = document.getElementById('order-summary-details'); const customerDetailsHTML = `<div><h3 class="text-lg font-bold text-gray-800 mb-2">Shipping To:</h3><div class="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg"><p class="font-semibold">${orderData.customerDetails.name}</p><p>${orderData.customerDetails.address}</p></div></div>`; const itemsHTML = `<div><h3 class="text-lg font-bold text-gray-800 mt-4 mb-2">Items Ordered:</h3><div class="space-y-3">${orderData.items.map(item => `<div class="flex items-center gap-4 border-b pb-3 last:border-b-0"><img src="${item.image || ''}" alt="${item.name}" class="w-16 h-16 object-cover rounded-md border"><div class="flex-grow"><p class="font-semibold text-gray-800">${item.name}</p><p class="text-sm text-gray-500">Quantity: ${item.quantity}</p></div><p class="font-semibold">₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}</p></div>`).join('')}</div></div>`; const summary = orderData.priceSummary; const totalSavings = (summary.coupon ? Number(summary.coupon.discount) : 0) + Math.abs(summary.bundleDiscount || 0); const priceDetailsHTML = `<div><h3 class="text-lg font-bold text-gray-800 mt-4 mb-2">Price Details:</h3><div class="space-y-2 text-sm pt-2 border-t"><div class="flex justify-between"><span class="text-gray-600">Subtotal</span><span class="font-medium text-gray-800">₹${summary.subtotal.toLocaleString('en-IN')}</span></div>${summary.coupon ? `<div class="flex justify-between text-green-600"><span>Coupon (${summary.coupon.code})</span><span class="font-medium">- ₹${Number(summary.coupon.discount).toLocaleString('en-IN')}</span></div>` : ''}${summary.bundleDiscount < 0 ? `<div class="flex justify-between text-green-600"><span>Bundle Offer</span><span class="font-medium">- ₹${Math.abs(summary.bundleDiscount).toLocaleString('en-IN')}</span></div>` : ''}<div class="flex justify-between"><span class="text-gray-600">Delivery Fee</span><span class="font-medium text-gray-800">${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></div><div class="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t"><span>Total Paid</span><span>₹${summary.grandTotal.toLocaleString('en-IN')}</span></div></div></div>`; const savingsHTML = totalSavings > 0 ? `<div class="bg-green-50 text-green-800 font-semibold text-center p-3 rounded-lg mt-4">🎉 You Saved a total of ₹${totalSavings.toLocaleString('en-IN')} on this order!</div>` : ''; summaryContainer.innerHTML = customerDetailsHTML + itemsHTML + priceDetailsHTML + savingsHTML; renderDeliveryTracker(orderData.status, document.getElementById('delivery-tracker-container')); searchResultEl.classList.remove('hidden'); }
function renderDeliveryTracker(status, container) { if (status === 'Rejected') { container.innerHTML = `<div class="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg"><i class="fas fa-times-circle text-red-500 text-3xl mr-4"></i><div><h3 class="font-bold text-red-700">Order Rejected</h3><p class="text-sm text-red-600">This order was rejected. Please contact support for more details.</p></div></div>`; return; } const statuses = ['Confirmed', 'Shipped', 'Out for Delivery', 'Delivered']; const icons = ['fa-check', 'fa-truck-fast', 'fa-truck-ramp-box', 'fa-star']; const currentStatusIndex = statuses.indexOf(status); let stepsHtml = statuses.map((s, index) => { const isCompleted = index <= currentStatusIndex; return `<div class="tracker-step ${isCompleted ? 'completed' : ''}"><div class="step-icon"><i class="fas ${icons[index]}"></i></div><p class="step-label">${s.replace(' ', '\n')}</p></div>`; }).join(''); const progressPercentage = currentStatusIndex >= 0 ? (currentStatusIndex / (statuses.length - 1)) * 100 : 0; container.innerHTML = `<div class="relative"><div class="tracker-line"><div class="tracker-progress-line" style="width: ${progressPercentage}%;"></div></div><div class="delivery-tracker">${stepsHtml}</div></div>`; }

// === YAHAN BADLAV KIYA GAYA HAI: Invoice generation function poora update kiya gaya hai ===
function numberToWords(num) {
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    if ((num = num.toString()).length > 9) return 'overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return; let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + ' crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + ' lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + ' thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + ' hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.replace(/\s+/g, ' ').trim().split(' ').map(w=>w.charAt(0).toUpperCase() + w.substr(1)).join(' ') + ' Rupees Only';
}

async function downloadInvoiceDirectly(event) {
    const btn = event.currentTarget;
    const orderId = document.getElementById('order-id-input').value.trim().toUpperCase();
    if (!orderId) { showToast('No order loaded.', 'error'); return; }
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Downloading...`;
    try {
        const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get();
        if (!snapshot.exists()) { throw new Error('Could not find order data.'); }
        const orderData = snapshot.val();
        const summary = orderData.priceSummary;
        const storeDetails = { name: 'Ramazone Online Store', owner: 'Prince Rama', address: 'Lalunagar, Begusarai, Bihar - 851129', phone: 'WhatsApp: 7903698180', email: 'ramazone007@gmail.com', website: 'www.ramazon.in' };

        const totalQuantity = orderData.items.reduce((sum, item) => sum + item.quantity, 0);

        const tableHTML = `<div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; border: 1px solid #999;">
                <thead>
                    <tr style="background-color: #DC2626; color: #FFFFFF;">
                        <th style="padding: 0.8rem; text-align: left; border: 1px solid #999;">#</th>
                        <th style="padding: 0.8rem; text-align: left; border: 1px solid #999;">Image</th>
                        <th style="padding: 0.8rem; text-align: left; border: 1px solid #999;">Product/Service</th>
                        <th style="padding: 0.8rem; text-align: center; border: 1px solid #999;">Qty</th>
                        <th style="padding: 0.8rem; text-align: right; border: 1px solid #999;">MRP</th>
                        <th style="padding: 0.8rem; text-align: right; border: 1px solid #999;">Rate</th>
                        <th style="padding: 0.8rem; text-align: right; border: 1px solid #999;">Disc.</th>
                        <th style="padding: 0.8rem; text-align: right; border: 1px solid #999;">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${orderData.items.map((item, index) => {
                        const productFromCache = allProductsCache.find(p => p.id === item.id) || {};
                        const mrp = Number(productFromCache.originalPrice) > Number(item.displayPrice) ? Number(productFromCache.originalPrice) : Number(item.displayPrice);
                        const discount = (mrp - Number(item.displayPrice)) * item.quantity;
                        return `
                        <tr style="border-bottom: 1px solid #999;">
                            <td style="padding: 0.8rem; border: 1px solid #999;">${index + 1}</td>
                            <td style="padding: 0.8rem; border: 1px solid #999;"><img src="${item.image}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" crossOrigin="anonymous"></td>
                            <td style="padding: 0.8rem; font-weight: 500; border: 1px solid #999;">${item.name}</td>
                            <td style="padding: 0.8rem; text-align: center; border: 1px solid #999;">${item.quantity}</td>
                            <td style="padding: 0.8rem; text-align: right; border: 1px solid #999;">₹${mrp.toFixed(2)}</td>
                            <td style="padding: 0.8rem; text-align: right; border: 1px solid #999;">₹${Number(item.displayPrice).toFixed(2)}</td>
                            <td style="padding: 0.8rem; text-align: right; border: 1px solid #999;">${discount > 0 ? `₹${discount.toFixed(2)}` : '-'}</td>
                            <td style="padding: 0.8rem; text-align: right; font-weight: 500; border: 1px solid #999;">₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;

        const summaryFooterHTML = `
        <section style="margin-top: 2rem; display: flex; justify-content: space-between; align-items: flex-start; border-top: 2px solid #333; padding-top: 1rem;">
             <div style="font-size: 0.9rem; color: #555; width: 60%;">
                <p style="margin:0; font-weight: bold;">Total Amounts (In Words):</p>
                <p style="margin: 4px 0;">${numberToWords(summary.grandTotal)}</p>
                <p style="margin: 12px 0 0; font-weight: bold;">Total Quantity: ${totalQuantity}</p>
            </div>
            <div style="width: 35%; font-size: 0.9rem;">
                <div style="display: flex; justify-content: space-between; padding: 0.4rem 0;"><span>Sub Total:</span><span>₹${summary.subtotal.toLocaleString('en-IN')}</span></div>
                ${summary.coupon ? `<div style="display: flex; justify-content: space-between; padding: 0.4rem 0; color: #16a34a;"><span>Coupon Discount:</span><span>- ₹${Number(summary.coupon.discount).toLocaleString('en-IN')}</span></div>` : ''}
                ${summary.bundleDiscount < 0 ? `<div style="display: flex; justify-content: space-between; padding: 0.4rem 0; color: #16a34a;"><span>Bundle Offer:</span><span>- ₹${Math.abs(summary.bundleDiscount).toLocaleString('en-IN')}</span></div>` : ''}
                ${summary.deliveryFee > 0 ? `<div style="display: flex; justify-content: space-between; padding: 0.4rem 0;"><span>Delivery Fee:</span><span>₹${summary.deliveryFee.toLocaleString('en-IN')}</span></div>` : ''}
                <div style="display: flex; justify-content: space-between; padding: 0.6rem; margin-top: 0.5rem; background-color: #DC2626; color: white; font-weight: bold; font-size: 1.1rem;"><span>Total Payable:</span><span>₹${summary.grandTotal.toLocaleString('en-IN')}</span></div>
            </div>
        </section>`;

        const oldFooterHTML = `
        <footer style="margin-top: 2rem; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #eee; padding-top: 1rem;">
            <div style="font-size: 0.8rem; color: #888;">
                <p style="margin: 0;">Thank you for your order!</p>
                <p style="margin: 4px 0 0; font-weight: bold;">${storeDetails.website}</p>
            </div>
            <div style="text-align: center;">
                <p style="font-weight: bold; font-size: 1.2rem; letter-spacing: 1px; font-family: 'Segoe UI', sans-serif; margin: 0; color: #333;">Ramazone</p>
                <p style="margin: 0; border-top: 1px solid #555; padding-top: 4px; font-size: 0.8rem; font-weight: bold;">Authorized Signatory</p>
            </div>
        </footer>`;

        const invoiceHTML = `<div style="width: 210mm; min-height: 297mm; padding: 5mm; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; color: #333; font-size: 11pt; display: flex; flex-direction: column; background: white; border: 1px solid #333;">
            <header style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 1.5rem; border-bottom: 4px solid #DC2626;">
                <div>
                    <h1 style="font-size: 2.5rem; font-weight: bold; color: #DC2626; margin: 0;">INVOICE</h1>
                    <p style="margin: 8px 0 0; font-size: 1rem; color: #555;"><strong>Invoice No:</strong> ${orderData.orderId}</p>
                    <p style="margin: 4px 0 0; font-size: 1rem; color: #555;"><strong>Invoice Date:</strong> ${new Date(orderData.createdAt).toLocaleDateString()}</p>
                </div>
                <div style="text-align: right;">
                    <img src="https://i.ibb.co/2RySQ5K/20240813-084352.png" alt="Ramazone Logo" style="height: 65px; margin-bottom: 8px; margin-left: auto;" crossOrigin="anonymous">
                    <p style="margin: 0; font-weight: bold; font-size: 1.1rem;">${storeDetails.name}</p>
                    <p style="margin: 4px 0 0; font-size: 0.9rem; color: #555;">Proprietor: ${storeDetails.owner}</p>
                </div>
            </header>
            <section style="margin-top: 2rem; display: flex; justify-content: space-between; font-size: 0.9rem; line-height: 1.5;">
                <div>
                    <p style="font-weight: bold; color: #555;">STORE DETAILS:</p>
                    <p style="margin: 4px 0 0;">${storeDetails.address}</p>
                    <p style="margin: 4px 0 0;">${storeDetails.phone}</p>
                    <p style="margin: 4px 0 0;">${storeDetails.email}</p>
                </div>
                <div style="text-align: right;">
                    <p style="font-weight: bold; color: #555;">BILL TO:</p>
                    <p style="margin: 4px 0 0;">${orderData.customerDetails.name}</p>
                    <p style="margin: 4px 0 0; color: #666; max-width: 250px;">${orderData.customerDetails.address}</p>
                </div>
            </section>
            <section style="margin-top: 2.5rem; flex-grow: 1;">${tableHTML}</section>
            ${summaryFooterHTML}
            ${oldFooterHTML}
        </div>`;

        const renderContainer = document.createElement('div'); renderContainer.style.position = 'absolute'; renderContainer.style.left = '-9999px'; document.body.appendChild(renderContainer); renderContainer.innerHTML = invoiceHTML; const invoiceElement = renderContainer.querySelector('div'); const canvas = await html2canvas(invoiceElement, { scale: 3, useCORS: true, allowTaint: true }); const link = document.createElement('a'); link.download = `Ramazone-Invoice-${orderId}.png`; link.href = canvas.toDataURL('image/png'); link.click(); document.body.removeChild(renderContainer);
    } catch (error) {
        console.error("Invoice download failed:", error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-download mr-2"></i>Download Invoice`;
    }
}

function showToast(message, type = "info") { const toast = document.getElementById("toast-notification"); if(!toast) return; toast.textContent = message; toast.className = 'toast show'; if(type === 'success') toast.classList.add('success'); if(type === 'error') toast.classList.add('error'); setTimeout(() => toast.classList.remove("show"), 3000); }
async function checkAutoOrderStatus() { const todaysOrders = getTodaysOrders(); if (todaysOrders.length === 0) return; if (todaysOrders.length > 1) { const notification = document.getElementById('all-orders-notification'); document.getElementById('all-orders-summary').textContent = `You have ${todaysOrders.length} orders today:`; document.getElementById('all-orders-list').innerHTML = todaysOrders.map(o => `<div class="flex items-center gap-2"><span class="font-mono">${o.id}</span><button data-id="${o.id}" class="copy-id-btn text-indigo-500 hover:text-indigo-700"><i class="far fa-copy"></i></button></div>`).join(''); notification.classList.remove('hidden'); } const lastOrder = todaysOrders[todaysOrders.length - 1]; const orderId = lastOrder.id; let orderData = null; for (const status of ['pending', 'confirmed', 'rejected']) { const snapshot = await database.ref(`ramazone/orders/${status}/${orderId}`).get(); if (snapshot.exists()) { orderData = snapshot.val(); break; } } if (!orderData || !orderData.items || orderData.items.length === 0) return; const firstItem = orderData.items[0]; const productPreviewContainer = document.getElementById('auto-status-product-preview'); productPreviewContainer.innerHTML = `<img src="${firstItem.image || 'https://placehold.co/128x128'}" alt="${firstItem.name}"><div class="status-product-details"><h4>${firstItem.name}</h4><p>₹${Number(firstItem.displayPrice).toLocaleString('en-IN')} &times; ${firstItem.quantity}</p></div>`; const footerContainer = document.getElementById('auto-status-footer'); const orderDate = new Date(orderData.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); footerContainer.innerHTML = `<span class="order-date">Ordered on: ${orderDate}</span><button class="view-more-btn" data-order-id="${orderId}">View More &rarr;</button>`; renderDeliveryTracker(orderData.status, document.getElementById('auto-status-tracker')); document.getElementById('auto-status-container').classList.remove('hidden'); }
