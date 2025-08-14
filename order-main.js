// --- GLOBAL STATE & CONFIG ---
let allProductsCache = [], validCoupons = [], orderItems = [];
let appliedCoupon = null, deliveryFee = 0, ramazoneDeliveryCharge = 15;
const FREE_DELIVERY_THRESHOLD = 500;
let database;

// --- LOCAL STORAGE & DATE HELPERS ---
const isSameDay = (date1, date2) => date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate();

// NEW: Functions to handle a list of today's orders
const getTodaysOrders = () => {
    try {
        const orders = JSON.parse(localStorage.getItem('ramazoneTodaysOrders')) || [];
        const today = new Date();
        // Filter out orders from previous days
        return orders.filter(order => isSameDay(new Date(order.date), today));
    } catch (e) {
        return [];
    }
};

const addOrderToTodaysList = (id) => {
    const todaysOrders = getTodaysOrders();
    todaysOrders.push({ id, date: new Date().toISOString() });
    localStorage.setItem('ramazoneTodaysOrders', JSON.stringify(todaysOrders));
};

// --- CART HELPERS ---
const getCart = () => { try { return JSON.parse(localStorage.getItem('ramazoneCart')) || []; } catch (e) { return []; } };
const saveCart = (cart) => localStorage.setItem('ramazoneCart', JSON.stringify(cart.map(item => ({ id: item.id, quantity: item.quantity }))));

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

async function fetchAllData() { /* ... No changes ... */ }

// --- UPDATED: AUTO ORDER STATUS LOGIC ---
async function checkAutoOrderStatus() {
    const todaysOrders = getTodaysOrders();
    if (todaysOrders.length === 0) return;

    // Show the list of all today's orders if more than one
    if (todaysOrders.length > 1) {
        const notification = document.getElementById('all-orders-notification');
        document.getElementById('all-orders-summary').textContent = `You have ${todaysOrders.length} orders today:`;
        const listContainer = document.getElementById('all-orders-list');
        listContainer.innerHTML = todaysOrders.map(order => 
            `<div class="flex items-center gap-2">
                <span class="font-mono">${order.id}</span>
                <button data-id="${order.id}" class="copy-id-btn text-indigo-500 hover:text-indigo-700"><i class="far fa-copy"></i></button>
            </div>`
        ).join('');
        notification.classList.remove('hidden');
    }

    // Always track the status of the LATEST order
    const lastOrder = todaysOrders[todaysOrders.length - 1];
    const orderId = lastOrder.id;
    let orderData = null;

    const pathsToSearch = [`ramazone/orders/pending/${orderId}`, `ramazone/orders/confirmed/${orderId}`, `ramazone/orders/rejected/${orderId}`];
    for (const path of pathsToSearch) {
        const snapshot = await database.ref(path).get();
        if (snapshot.exists()) {
            orderData = snapshot.val();
            break;
        }
    }

    if (!orderData) return;

    const container = document.getElementById('auto-status-container');
    const trackerContainer = document.getElementById('auto-status-tracker');
    document.getElementById('auto-status-order-id').textContent = `Order ID: ${orderId}`;
    renderDeliveryTracker(orderData.status, trackerContainer);
    container.classList.remove('hidden');
}

// --- CART & ORDER PLACEMENT ---
function loadOrderFromCart() { /* ... No changes ... */ }

function setupEventListeners() {
    // ... other listeners ...
    // NEW: Event listener for copy buttons
    document.body.addEventListener('click', e => {
        const copyBtn = e.target.closest('.copy-id-btn');
        if (copyBtn) {
            const orderId = copyBtn.dataset.id;
            // Use the clipboard API
            const tempInput = document.createElement('input');
            tempInput.value = orderId;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            showToast(`Order ID ${orderId} copied!`, 'success');
        }
    });
}

// --- All other functions remain the same ---
// No logical changes are needed for the UI refactor.
// Functions: renderOrderItems, updatePriceSummary, applyCoupon, removeCoupon, generateOrderId, placeOrder, searchOrder, renderSearchResult, renderDeliveryTracker, viewInvoice, downloadInvoice, showToast

async function placeOrder(event) {
    // ...
    // In the try block, after successfully placing the order:
    // OLD: saveLastOrder(orderId);
    // NEW:
    addOrderToTodaysList(orderId);
    // ...
}


// --- Re-pasting all functions for completeness ---
async function fetchAllData() { const snapshot = await database.ref('ramazone').get(); if (snapshot.exists()) { const data = snapshot.val(); ramazoneDeliveryCharge = data.config?.deliveryCharge || 15; document.getElementById('ramazone-delivery-label').textContent = `Ramazone Delivery (+₹${ramazoneDeliveryCharge})`; const homepageData = data.homepage || {}; const productsObject = data.products || {}; const mainProducts = Object.values(productsObject); const allReferencedIds = new Set([...Object.values(homepageData).flatMap(section => section.productIds || [])]); const referencedProducts = mainProducts.filter(p => p && allReferencedIds.has(p.id)); const combinedProducts = [...mainProducts, ...referencedProducts]; allProductsCache = combinedProducts.filter((p, i, self) => p && p.id && i === self.findIndex(t => t.id === p.id)); validCoupons = (homepageData.coupons || []).filter(c => c.status === 'active'); } }
function loadOrderFromCart() { const cart = getCart(); const orderContent = document.getElementById('order-page-content'); const emptyMessage = document.getElementById('empty-cart-message'); const stickyFooter = document.getElementById('sticky-order-footer'); if (cart.length === 0) { orderContent.classList.add('hidden'); stickyFooter.classList.add('hidden'); emptyMessage.classList.remove('hidden'); document.getElementById('loading-indicator').style.display = 'none'; return; } orderItems = cart.map(cartItem => { const productDetails = allProductsCache.find(p => p && p.id === cartItem.id); return productDetails ? { ...productDetails, quantity: cartItem.quantity } : null; }).filter(Boolean); if(orderItems.length === 0) { saveCart([]); loadOrderFromCart(); return; } emptyMessage.classList.add('hidden'); orderContent.classList.remove('hidden'); stickyFooter.classList.remove('hidden'); renderOrderItems(); updatePriceSummary(); document.getElementById('loading-indicator').style.display = 'none'; }
function setupEventListeners() { document.getElementById('apply-coupon-btn').addEventListener('click', applyCoupon); document.getElementById('remove-coupon-btn').addEventListener('click', removeCoupon); document.getElementById('place-order-btn').addEventListener('click', placeOrder); document.getElementById('search-order-btn').addEventListener('click', searchOrder); document.getElementById('view-invoice-btn').addEventListener('click', viewInvoice); document.getElementById('invoice-close-btn').addEventListener('click', () => document.getElementById('invoice-modal').classList.remove('active')); document.getElementById('download-invoice-btn').addEventListener('click', downloadInvoice); document.getElementById('payment-option-group').addEventListener('click', e => { if (e.target.closest('.option-label')) { document.querySelectorAll('#payment-option-group .option-label').forEach(l => l.classList.remove('selected')); e.target.closest('.option-label').classList.add('selected'); } }); document.getElementById('delivery-option-group').addEventListener('click', e => { if (e.target.closest('.option-label')) { document.querySelectorAll('#delivery-option-group .option-label').forEach(l => l.classList.remove('selected')); e.target.closest('.option-label').classList.add('selected'); updatePriceSummary(); } }); document.getElementById('order-items-container').addEventListener('click', function(event) { const target = event.target.closest('button'); if (!target) return; const productId = target.dataset.id; const itemIndex = orderItems.findIndex(item => item.id == productId); if (itemIndex === -1) return; if (target.classList.contains('qty-increase')) orderItems[itemIndex].quantity++; else if (target.classList.contains('qty-decrease')) { if (orderItems[itemIndex].quantity > 1) orderItems[itemIndex].quantity--; else orderItems.splice(itemIndex, 1); } saveCart(orderItems); if(orderItems.length === 0) loadOrderFromCart(); else { renderOrderItems(); updatePriceSummary(); } }); document.body.addEventListener('click', e => { const copyBtn = e.target.closest('.copy-id-btn'); if (copyBtn) { const orderId = copyBtn.dataset.id; const tempInput = document.createElement('input'); tempInput.value = orderId; document.body.appendChild(tempInput); tempInput.select(); document.execCommand('copy'); document.body.removeChild(tempInput); showToast(`Order ID ${orderId} copied!`, 'success'); } }); }
function renderOrderItems() { const container = document.getElementById('order-items-container'); container.innerHTML = orderItems.map(item => `<div class="order-item-card flex items-start gap-4 p-2 border-b last:border-b-0"><img src="${item.images?.[0] || ''}" alt="${item.name}" class="w-20 h-20 object-cover rounded-md border"><div class="flex-grow"><h3 class="font-bold text-md text-gray-800">${item.name}</h3><div class="flex items-center justify-between mt-2"><span class="text-lg font-bold text-gray-900">₹${Number(item.displayPrice).toLocaleString('en-IN')}</span><div class="quantity-selector-order"><button class="qty-decrease" data-id="${item.id}">-</button><span>${item.quantity}</span><button class="qty-increase" data-id="${item.id}">+</button></div></div></div></div>`).join(''); }
function updatePriceSummary() { const subtotal = orderItems.reduce((acc, item) => acc + (item.displayPrice * item.quantity), 0); const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0; const selectedDelivery = document.querySelector('input[name="delivery"]:checked').value; if (selectedDelivery === 'Ramazone') { deliveryFee = subtotal < FREE_DELIVERY_THRESHOLD ? ramazoneDeliveryCharge : 0; } else { deliveryFee = 0; } const grandTotal = subtotal - couponDiscount + deliveryFee; document.getElementById('subtotal-price').textContent = `₹${subtotal.toLocaleString('en-IN')}`; const couponRow = document.getElementById('coupon-discount-row'); if (appliedCoupon) { document.getElementById('coupon-discount-amount').textContent = `- ₹${couponDiscount.toLocaleString('en-IN')}`; couponRow.style.display = 'flex'; } else { couponRow.style.display = 'none'; } document.getElementById('delivery-fee').textContent = deliveryFee > 0 ? `+ ₹${deliveryFee.toLocaleString('en-IN')}` : 'Free'; document.getElementById('grand-total').textContent = `₹${grandTotal.toLocaleString('en-IN')}`; document.getElementById('footer-total-price').textContent = `₹${grandTotal.toLocaleString('en-IN')}`; }
function applyCoupon() { const code = document.getElementById('coupon-input').value.trim().toLowerCase(); if (!code) return; if (appliedCoupon) { showToast('Coupon already applied.', 'error'); return; } const foundCoupon = validCoupons.find(c => c.code.toLowerCase() === code); if (foundCoupon) { appliedCoupon = foundCoupon; showToast(`Coupon "${foundCoupon.code}" applied!`, 'success'); document.getElementById('coupon-section').classList.add('hidden'); document.getElementById('applied-coupon-code').textContent = foundCoupon.code; document.getElementById('applied-coupon-div').classList.remove('hidden'); } else { appliedCoupon = null; showToast('Invalid coupon code.', 'error'); } updatePriceSummary(); }
function removeCoupon() { appliedCoupon = null; showToast('Coupon removed.', 'info'); document.getElementById('coupon-input').value = ''; document.getElementById('coupon-section').classList.remove('hidden'); document.getElementById('applied-coupon-div').classList.add('hidden'); updatePriceSummary(); }
function generateOrderId() { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let result = 'RMZ'; for (let i = 0; i < 8; i++) { result += chars.charAt(Math.floor(Math.random() * chars.length)); } return result; }
async function placeOrder(event) { event.preventDefault(); const form = document.getElementById('customer-details-form'); if (!form.checkValidity()) { form.reportValidity(); showToast('Please fill shipping details.', 'error'); return; } const placeOrderBtn = document.getElementById('place-order-btn'); placeOrderBtn.textContent = 'Placing...'; placeOrderBtn.disabled = true; const orderId = generateOrderId(); const customerDetails = { name: document.getElementById('customer-name').value, address: document.getElementById('customer-address').value }; updatePriceSummary(); const grandTotal = orderItems.reduce((acc, item) => acc + (item.displayPrice * item.quantity), 0) - (appliedCoupon ? Number(appliedCoupon.discount) : 0) + deliveryFee; const orderData = { orderId, customerDetails, grandTotal, paymentMethod: document.querySelector('input[name="payment"]:checked').value, deliveryMethod: document.querySelector('input[name="delivery"]:checked').value, items: orderItems.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, displayPrice: item.displayPrice, image: item.images?.[0] || '' })), priceSummary: { subtotal: orderItems.reduce((acc, item) => acc + (item.displayPrice * item.quantity), 0), coupon: appliedCoupon, deliveryFee, grandTotal }, status: 'Pending', createdAt: firebase.database.ServerValue.TIMESTAMP, statusHistory: { initial: { status: 'Pending', timestamp: firebase.database.ServerValue.TIMESTAMP } } }; try { await database.ref(`ramazone/orders/pending/${orderId}`).set(orderData); addOrderToTodaysList(orderId); const sellerPhoneNumber = '917903698180'; let message = "🛍️ *Ramazone Store Order* 🛍️\n\n"; message += `*Order ID:* ${orderId}\n\n*Customer Details:*\nName: ${customerDetails.name}\nAddress: ${customerDetails.address}\n\n*Order Summary:*\n`; orderData.items.forEach((item, index) => { message += `${index + 1}. *${item.name}* (x${item.quantity}) - *₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}*\n`; }); message += `\n*Total Amount:* *₹${grandTotal.toLocaleString('en-IN')}*\n*Payment:* ${orderData.paymentMethod}\n\nPlease check the admin panel.`; saveCart([]); document.getElementById('order-page-content').innerHTML = `<div class="text-center p-8 bg-white rounded-lg shadow"><i class="fas fa-check-circle text-5xl text-green-500 mb-4"></i><h2 class="text-2xl font-bold text-gray-800">Order Placed Successfully!</h2><p class="mt-4 font-semibold text-lg">Your Order ID is:</p><div class="bg-gray-100 text-gray-800 font-bold text-2xl p-3 rounded-lg mt-2 inline-block select-all">${orderId}</div><p class="text-sm text-gray-500 mt-2">We will keep you updated on this page.</p><a href="index.html" class="shop-now-btn mt-6">Continue Shopping</a></div>`; document.getElementById('sticky-order-footer').style.display = 'none'; window.location.href = `https://wa.me/${sellerPhoneNumber}?text=${encodeURIComponent(message)}`; } catch (error) { console.error("Failed to place order:", error); showToast('Could not place order.', 'error'); placeOrderBtn.textContent = 'Place Order'; placeOrderBtn.disabled = false; } }
async function searchOrder() { const orderId = document.getElementById('order-id-input').value.trim().toUpperCase(); const searchStatusEl = document.getElementById('search-status'); const searchResultEl = document.getElementById('order-search-result'); if (!orderId) { searchStatusEl.textContent = 'Please enter an Order ID.'; searchStatusEl.className = 'text-center my-2 text-sm text-yellow-600'; return; } searchStatusEl.textContent = 'Searching...'; searchStatusEl.className = 'text-center my-2 text-sm text-blue-600'; searchResultEl.classList.add('hidden'); try { const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get(); if (snapshot.exists()) { const orderData = snapshot.val(); renderSearchResult(orderData); searchStatusEl.textContent = `Showing results for Order ID: ${orderId}`; searchStatusEl.className = 'text-center my-2 text-sm text-green-600'; } else { searchStatusEl.textContent = 'Order not found or not confirmed yet.'; searchStatusEl.className = 'text-center my-2 text-sm text-red-600'; } } catch (error) { console.error("Order search failed:", error); searchStatusEl.textContent = 'An error occurred.'; searchStatusEl.className = 'text-center my-2 text-sm text-red-600'; } }
function renderSearchResult(orderData) { const searchResultEl = document.getElementById('order-search-result'); renderDeliveryTracker(orderData.status, document.getElementById('delivery-tracker-container')); searchResultEl.classList.remove('hidden'); }
function renderDeliveryTracker(status, container) { const statuses = ['Confirmed', 'Shipped', 'Out for Delivery', 'Delivered']; const icons = ['fa-check', 'fa-truck-fast', 'fa-truck-ramp-box', 'fa-star']; const currentStatusIndex = statuses.indexOf(status); let stepsHtml = statuses.map((s, index) => { const isCompleted = index <= currentStatusIndex; return `<div class="tracker-step ${isCompleted ? 'completed' : ''}"><div class="step-icon"><i class="fas ${icons[index]}"></i></div><p class="step-label">${s.replace(' ', '\n')}</p></div>`; }).join(''); const progressPercentage = currentStatusIndex >= 0 ? (currentStatusIndex / (statuses.length - 1)) * 100 : 0; container.innerHTML = `<div class="relative"><div class="tracker-line"><div class="tracker-progress-line" style="width: ${progressPercentage}%;"></div></div><div class="delivery-tracker">${stepsHtml}</div></div>`; }
async function viewInvoice() { const orderId = document.getElementById('order-id-input').value.trim().toUpperCase(); if (!orderId) { showToast('No order loaded.', 'error'); return; } const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get(); if (!snapshot.exists()) { showToast('Could not find order data.', 'error'); return; } const orderData = snapshot.val(); const slipContent = document.getElementById('invoice-slip-for-render'); const summary = orderData.priceSummary; slipContent.innerHTML = `<div class="flex justify-between items-start pb-4 border-b"><div><h1 class="text-4xl font-bold text-gray-800">Ramazone</h1><p class="text-gray-500">Your Trusted Online Store</p></div><h2 class="text-2xl font-semibold text-gray-600">INVOICE</h2></div><div class="flex justify-between mt-8"><div><p class="font-bold text-gray-700">Billed To:</p><p>${orderData.customerDetails.name}</p><p class="text-gray-600">${orderData.customerDetails.address}</p></div><div class="text-right"><p><span class="font-bold">Invoice #:</span> ${orderData.orderId}</p><p><span class="font-bold">Date:</span> ${new Date(orderData.createdAt).toLocaleDateString()}</p></div></div><div class="mt-8"><table class="w-full text-left text-sm"><thead><tr class="bg-gray-100"><th class="p-2 font-semibold">#</th><th class="p-2 font-semibold">ITEM</th><th class="p-2 font-semibold text-center">QTY</th><th class="p-2 font-semibold text-right">PRICE</th><th class="p-2 font-semibold text-right">TOTAL</th></tr></thead><tbody>${orderData.items.map((item, index) => `<tr class="border-b"><td class="p-2">${index + 1}</td><td class="p-2"><div class="flex items-center"><img src="${item.image}" class="w-10 h-10 object-cover rounded mr-3" crossOrigin="anonymous"><span>${item.name}</span></div></td><td class="p-2 text-center">${item.quantity}</td><td class="p-2 text-right">₹${item.displayPrice.toLocaleString('en-IN')}</td><td class="p-2 text-right">₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}</td></tr>`).join('')}</tbody></table></div><div class="flex justify-end mt-8"><div class="w-full max-w-xs space-y-2 text-sm"><div class="flex justify-between"><span class="text-gray-600">Subtotal:</span><span>₹${summary.subtotal.toLocaleString('en-IN')}</span></div>${summary.coupon ? `<div class="flex justify-between text-green-600"><span>Coupon Discount:</span><span>- ₹${summary.coupon.discount.toLocaleString('en-IN')}</span></div>` : ''}<div class="flex justify-between"><span class="text-gray-600">Delivery Fee:</span><span>${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></div><div class="flex justify-between font-bold text-lg border-t pt-2 mt-2"><span>Grand Total:</span><span>₹${summary.grandTotal.toLocaleString('en-IN')}</span></div></div></div><div class="text-center text-gray-500 text-xs mt-16 border-t pt-4"><p>Thank you for your purchase!</p><p>Ramazone Store | ramazone.in</p></div>`; document.getElementById('invoice-modal').classList.add('active'); }
function downloadInvoice() { const invoiceElement = document.getElementById('invoice-slip-for-render'); const orderId = document.getElementById('order-id-input').value.trim().toUpperCase(); if (!invoiceElement || !orderId) { showToast('Invoice content not found.', 'error'); return; } const btn = document.getElementById('download-invoice-btn'); btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Generating...`; html2canvas(invoiceElement, { scale: 2, useCORS: true, allowTaint: true }).then(canvas => { const link = document.createElement('a'); link.download = `Ramazone-Invoice-${orderId}.png`; link.href = canvas.toDataURL('image/png'); link.click(); btn.disabled = false; btn.innerHTML = `<i class="fas fa-download mr-2"></i>Download Invoice`; }).catch(err => { console.error("Download failed:", err); showToast('Failed to generate invoice.', 'error'); btn.disabled = false; btn.innerHTML = `<i class="fas fa-download mr-2"></i>Download Invoice`; }); }
function showToast(message, type = "info") { const toast = document.getElementById("toast-notification"); if(!toast) return; toast.textContent = message; toast.className = 'toast show'; if(type === 'success') toast.classList.add('success'); if(type === 'error') toast.classList.add('error'); setTimeout(() => toast.classList.remove("show"), 3000); }

