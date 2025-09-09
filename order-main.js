// --- GLOBAL STATE & CONFIG ---
let allProductsCache = [], validCoupons = [], orderItems = [];
let appliedCoupon = null;
let database;
let currentStep = 1;
let ramazoneConfig = {
    deliveryCharge: 15,
    freeDeliveryThreshold: 500
};

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

        await fetchAllDataAndConfig();

        const cart = getCart();
        if (cart.length > 0) {
            document.getElementById('checkout-flow-container').classList.remove('hidden');
            document.getElementById('step-cart').classList.add('active');
            updateProgressBar();
            loadOrderFromCart();
        } else {
            document.getElementById('loading-indicator').style.display = 'none';
            document.getElementById('empty-cart-message').classList.remove('hidden');
        }

        setupEventListeners();
    } catch (error) { 
        console.error("Initialization Failed:", error); 
        document.getElementById('loading-indicator').innerHTML = `<p class="text-red-500">Could not load page. Error: ${error.message}</p>`; 
    }
}

async function fetchAllDataAndConfig() {
    const snapshot = await database.ref('ramazone').get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        if (data.config) {
            ramazoneConfig.deliveryCharge = data.config.deliveryCharge || 15;
            ramazoneConfig.freeDeliveryThreshold = data.config.freeDeliveryThreshold || 500;
        }
        document.getElementById('ramazone-delivery-label').textContent = `Ramazone Delivery (+₹${ramazoneConfig.deliveryCharge})`;
        document.getElementById('ramazone-delivery-info').textContent = `Orders above ₹${ramazoneConfig.freeDeliveryThreshold} get free Ramazone Delivery.`;
        allProductsCache = Object.values(data.products || {});
        validCoupons = (data.homepage?.coupons || []).filter(c => c.status === 'active');
    }
}

function processCartForDisplay() {
    const cart = getCart();
    return cart.map((cartItem, index) => {
        const productDetails = allProductsCache.find(p => p.id === cartItem.id);
        return productDetails ? { ...productDetails, ...cartItem, cartIndex: index } : null;
    }).filter(item => item !== null);
}

function loadOrderFromCart() {
    orderItems = processCartForDisplay();

    if (orderItems.length === 0) {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('checkout-flow-container').classList.add('hidden');
        document.getElementById('empty-cart-message').classList.remove('hidden');
        return;
    }

    document.getElementById('loading-indicator').style.display = 'none';
    renderOrderItems();
    updatePriceSummary();
}

// --- RENDER FUNCTIONS ---
function renderOrderItems() {
    const container = document.getElementById('order-items-container');
    container.innerHTML = orderItems.map(createSingleItemCard).join('');
}

function createSingleItemCard(item) {
    const isPack = item.pack && item.pack.name !== 'Single Item';
    const displayName = isPack ? `${item.name} (${item.pack.name})` : item.name;
    const displayPrice = isPack ? Number(item.pack.price) : Number(item.displayPrice);
    return `<div class="order-item-card flex items-start gap-4 p-2 border-b last:border-b-0"><button class="delete-item-btn" data-cart-index="${item.cartIndex}"><img src="https://www.svgrepo.com/show/502614/delete.svg" alt="Delete"></button><a href="product-details.html?id=${item.id}" class="flex-shrink-0"><img src="${item.images?.[0] || ''}" alt="${item.name}" class="w-20 h-20 object-cover rounded-md border"></a><div class="flex-grow flex flex-col justify-between self-stretch"><div><a href="product-details.html?id=${item.id}" class="block"><h3 class="font-bold text-md text-gray-800">${displayName}</h3></a></div><div class="flex items-center justify-between mt-2"><span class="text-lg font-bold text-gray-900">₹${displayPrice.toLocaleString('en-IN')}</span><div class="quantity-selector-order"><button class="qty-decrease" data-cart-index="${item.cartIndex}">-</button><span>${item.quantity}</span><button class="qty-increase" data-cart-index="${item.cartIndex}">+</button></div></div></div></div>`;
}

function updatePriceSummary() {
    const subtotal = orderItems.reduce((acc, item) => {
        const isPack = item.pack && item.pack.name !== 'Single Item';
        const price = isPack ? Number(item.pack.price) : Number(item.displayPrice);
        return acc + (price * item.quantity);
    }, 0);

    // Step 1 Summary
    const summaryStep1HTML = `<div class="flex justify-between"><span class="text-gray-600">Subtotal</span><span class="font-medium text-gray-800">₹${subtotal.toLocaleString('en-IN')}</span></div><p class="text-xs text-gray-500 mt-2">Delivery charges and coupons will be applied at the final step.</p>`;
    document.getElementById('price-summary-container-step1').innerHTML = summaryStep1HTML;

    // Step 3 Summary
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const selectedDelivery = document.querySelector('input[name="delivery"]:checked').value;
    const deliveryFee = (selectedDelivery === 'Ramazone' && subtotal < ramazoneConfig.freeDeliveryThreshold) ? ramazoneConfig.deliveryCharge : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;

    let summaryStep3HTML = `<div class="flex justify-between"><span class="text-gray-600">Subtotal</span><span class="font-medium text-gray-800">₹${subtotal.toLocaleString('en-IN')}</span></div>`;
    if (appliedCoupon) {
        summaryStep3HTML += `<div id="coupon-discount-row" class="flex justify-between text-green-600"><span>Coupon Discount</span><span id="coupon-discount-amount" class="font-medium">- ₹${couponDiscount.toLocaleString('en-IN')}</span></div>`;
    }
    summaryStep3HTML += `<div class="flex justify-between"><span class="text-gray-600">Delivery Fee</span><span class="font-medium text-gray-800">${deliveryFee > 0 ? `₹${deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></div>`;
    summaryStep3HTML += `<div class="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t"><span>Total Amount</span><span>₹${grandTotal.toLocaleString('en-IN')}</span></div>`;
    document.getElementById('price-summary-container-step3').innerHTML = summaryStep3HTML;
}

// --- EVENT LISTENERS & NAVIGATION ---
function setupEventListeners() {
    document.getElementById('btn-to-address').addEventListener('click', () => navigateToStep(2));
    document.getElementById('btn-to-payment').addEventListener('click', () => { if (document.getElementById('customer-details-form').checkValidity()) { navigateToStep(3); } else { document.getElementById('customer-details-form').reportValidity(); showToast('Please fill all shipping details.', 'error'); } });
    document.getElementById('btn-back-to-cart').addEventListener('click', () => navigateToStep(1));
    document.getElementById('btn-back-to-address').addEventListener('click', () => navigateToStep(2));
    document.getElementById('order-items-container').addEventListener('click', handleCartActions);
    document.getElementById('delivery-option-group').addEventListener('click', e => handleOptionChange(e, 'delivery-option-group', updatePriceSummary));
    document.getElementById('payment-option-group').addEventListener('click', e => handleOptionChange(e, 'payment-option-group'));
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
    document.getElementById('apply-coupon-btn').addEventListener('click', applyCoupon);
    document.getElementById('remove-coupon-btn').addEventListener('click', removeCoupon);
    document.getElementById('search-order-btn').addEventListener('click', searchOrder);
}

function handleCartActions(event) {
    const target = event.target.closest('button');
    if (!target) return;
    const cart = getCart();
    const cartIndex = parseInt(target.dataset.cartIndex);
    if (isNaN(cartIndex) || !cart[cartIndex]) return;
    let cartUpdated = false, item = cart[cartIndex];
    if (target.classList.contains('delete-item-btn')) { cart.splice(cartIndex, 1); cartUpdated = true; } 
    else if (target.classList.contains('qty-increase')) { item.quantity++; cartUpdated = true; } 
    else if (target.classList.contains('qty-decrease')) { if (item.quantity > 1) item.quantity--; else cart.splice(cartIndex, 1); cartUpdated = true; }
    if (cartUpdated) { saveCart(cart); loadOrderFromCart(); }
}

function handleOptionChange(event, groupId, callback) { if (event.target.closest('.option-label')) { document.querySelectorAll(`#${groupId} .option-label`).forEach(l => l.classList.remove('selected')); event.target.closest('.option-label').classList.add('selected'); if (callback) callback(); } }

function navigateToStep(stepNumber) {
    document.querySelectorAll('.step-content').forEach(step => step.classList.remove('active'));
    document.getElementById(`step-${['cart', 'address', 'payment'][stepNumber - 1]}`).classList.add('active');
    currentStep = stepNumber;
    updateProgressBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgressBar() {
    const progressLine = document.getElementById('stepper-progress');
    const steps = [document.getElementById('step-icon-1'), document.getElementById('step-icon-2'), document.getElementById('step-icon-3')];
    steps.forEach((step, index) => {
        step.classList.remove('active', 'completed');
        if (index < currentStep - 1) step.classList.add('completed');
        else if (index === currentStep - 1) step.classList.add('active');
    });
    progressLine.style.width = `${((currentStep - 1) / (steps.length - 1)) * 100}%`;
}

// --- COUPON FUNCTIONS ---
function applyCoupon() {
    const code = document.getElementById('coupon-input').value.trim().toLowerCase();
    if (!code) return;
    if (appliedCoupon) { showToast('Coupon already applied.', 'error'); return; }
    const foundCoupon = validCoupons.find(c => c.code.toLowerCase() === code);
    if (foundCoupon) {
        appliedCoupon = foundCoupon;
        showToast(`Coupon "${foundCoupon.code}" applied!`, 'success');
        document.getElementById('coupon-section').classList.add('hidden');
        document.getElementById('applied-coupon-code').textContent = foundCoupon.code;
        document.getElementById('applied-coupon-div').classList.remove('hidden');
    } else {
        appliedCoupon = null;
        showToast('Invalid coupon code.', 'error');
    }
    updatePriceSummary();
}

function removeCoupon() {
    appliedCoupon = null;
    showToast('Coupon removed.', 'info');
    document.getElementById('coupon-input').value = '';
    document.getElementById('coupon-section').classList.remove('hidden');
    document.getElementById('applied-coupon-div').classList.add('hidden');
    updatePriceSummary();
}

// --- ORDER PLACEMENT ---
async function placeOrder(event) {
    event.preventDefault();
    const placeOrderBtn = document.getElementById('place-order-btn');
    placeOrderBtn.textContent = 'Placing...';
    placeOrderBtn.disabled = true;

    const generateOrderId = () => 'RMZ' + Math.random().toString(36).substr(2, 8).toUpperCase();
    const orderId = generateOrderId();
    const customerDetails = { name: document.getElementById('customer-name').value, mobile: document.getElementById('customer-mobile').value, address: document.getElementById('customer-address').value };

    updatePriceSummary(); // Final price calculation
    const subtotal = orderItems.reduce((acc, item) => { const isPack = item.pack && item.pack.name !== 'Single Item'; const price = isPack ? Number(item.pack.price) : Number(item.displayPrice); return acc + (price * item.quantity); }, 0);
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const deliveryFee = (document.querySelector('input[name="delivery"]:checked').value === 'Ramazone' && subtotal < ramazoneConfig.freeDeliveryThreshold) ? ramazoneConfig.deliveryCharge : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;

    const orderData = {
        orderId, customerDetails, grandTotal,
        paymentMethod: document.querySelector('input[name="payment"]:checked').value,
        deliveryMethod: document.querySelector('input[name="delivery"]:checked').value,
        items: orderItems.map(item => ({ id: item.id, name: (item.pack && item.pack.name !== 'Single Item') ? `${item.name} (${item.pack.name})` : item.name, quantity: item.quantity, displayPrice: (item.pack && item.pack.name !== 'Single Item') ? item.pack.price : item.displayPrice, image: item.images?.[0] || '' })),
        priceSummary: { subtotal, coupon: appliedCoupon, deliveryFee, grandTotal },
        status: 'Pending', createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        await database.ref(`ramazone/orders/pending/${orderId}`).set(orderData);
        const sellerPhoneNumber = '917903698180';
        let message = `🛍️ *Ramazone Order* 🛍️\n\n*ID:* ${orderId}\n\n*Customer:*\n${customerDetails.name}\n${customerDetails.mobile}\n${customerDetails.address}\n\n*Items:*\n`;
        orderData.items.forEach((item, i) => { message += `${i+1}. *${item.name}* (x${item.quantity}) - *₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}*\n`; });
        if(appliedCoupon) message += `\n*Coupon Applied:* ${appliedCoupon.code} (-₹${couponDiscount})\n`;
        message += `\n*Total:* *₹${grandTotal.toLocaleString('en-IN')}*\n*Payment:* ${orderData.paymentMethod}`;
        saveCart([]);
        window.location.href = `https://wa.me/${sellerPhoneNumber}?text=${encodeURIComponent(message)}`;
    } catch (error) { console.error("Failed to place order:", error); showToast('Could not place order.', 'error'); placeOrderBtn.textContent = 'Place Order'; placeOrderBtn.disabled = false; }
}

// --- ORDER STATUS & INVOICE FUNCTIONS ---
async function searchOrder() {
    const orderId = document.getElementById('order-id-input').value.trim().toUpperCase();
    const searchStatusEl = document.getElementById('search-status');
    const checkoutContainer = document.getElementById('checkout-flow-container');
    const statusContainer = document.getElementById('order-status-container');
    if (!orderId) { searchStatusEl.textContent = 'Please enter an Order ID.'; searchStatusEl.className = 'text-center my-2 text-sm text-yellow-600'; return; }

    searchStatusEl.textContent = 'Searching...';
    searchStatusEl.className = 'text-center my-2 text-sm text-blue-600';
    checkoutContainer.classList.add('hidden');
    statusContainer.classList.remove('active');
    statusContainer.innerHTML = '';

    try {
        const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get();
        if (snapshot.exists()) {
            const orderData = snapshot.val();
            renderSearchResult(orderData);
            searchStatusEl.textContent = `Showing results for Order ID: ${orderId}`;
            searchStatusEl.className = 'text-center my-2 text-sm text-green-600';
            statusContainer.classList.add('active');
        } else {
            searchStatusEl.textContent = 'Order not found or not confirmed yet.';
            searchStatusEl.className = 'text-center my-2 text-sm text-red-600';
        }
    } catch (error) { console.error("Order search failed:", error); searchStatusEl.textContent = 'An error occurred.'; searchStatusEl.className = 'text-center my-2 text-sm text-red-600'; }
}

function renderSearchResult(orderData) {
    const statusContainer = document.getElementById('order-status-container');
    const summary = orderData.priceSummary;
    const savingsHTML = (summary.coupon ? Number(summary.coupon.discount) : 0) > 0 ? `<div class="bg-green-50 text-green-800 font-semibold text-center p-3 rounded-lg mt-4">🎉 You Saved ₹${Number(summary.coupon.discount).toLocaleString('en-IN')} on this order!</div>` : '';

    const resultHTML = `
        <div class="space-y-6">
            <div class="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
                <div><h3 class="text-lg font-bold text-gray-800 mb-2">Shipping To:</h3><div class="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg"><p class="font-semibold">${orderData.customerDetails.name}</p><p>${orderData.customerDetails.address}</p></div></div>
                <div><h3 class="text-lg font-bold text-gray-800 mt-4 mb-2">Items Ordered:</h3><div class="space-y-3">${orderData.items.map(item => `<div class="flex items-center gap-4 border-b pb-3 last:border-b-0"><img src="${item.image || ''}" alt="${item.name}" class="w-16 h-16 object-cover rounded-md border"><div class="flex-grow"><p class="font-semibold text-gray-800">${item.name}</p><p class="text-sm text-gray-500">Qty: ${item.quantity}</p></div><p class="font-semibold">₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}</p></div>`).join('')}</div></div>
                <div><h3 class="text-lg font-bold text-gray-800 mt-4 mb-2">Price Details:</h3><div class="space-y-2 text-sm pt-2 border-t"><div class="flex justify-between"><span>Subtotal</span><span class="font-medium">₹${summary.subtotal.toLocaleString('en-IN')}</span></div>${summary.coupon ? `<div class="flex justify-between text-green-600"><span>Coupon (${summary.coupon.code})</span><span class="font-medium">- ₹${Number(summary.coupon.discount).toLocaleString('en-IN')}</span></div>` : ''}<div class="flex justify-between"><span>Delivery Fee</span><span class="font-medium">${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></div><div class="flex justify-between text-lg font-bold pt-2 border-t"><span>Total Paid</span><span>₹${summary.grandTotal.toLocaleString('en-IN')}</span></div></div></div>
                ${savingsHTML}
            </div>
            <div class="bg-white rounded-lg shadow p-4 sm:p-6"><h2 class="text-xl font-bold mb-4 text-gray-800">Delivery Status</h2><div id="delivery-tracker-container" class="py-4"></div></div>
            <div class="text-center">
                <button id="view-invoice-btn" class="btn btn-primary invoice-btn-red !px-8 !py-3"><i class="fas fa-download"></i>Download Invoice</button>
            </div>
        </div>
    `;
    statusContainer.innerHTML = resultHTML;
    renderDeliveryTracker(orderData.status, document.getElementById('delivery-tracker-container'));
    document.getElementById('view-invoice-btn').addEventListener('click', () => downloadInvoiceDirectly(orderData));
}

function renderDeliveryTracker(status, container) { if (status === 'Rejected') { container.innerHTML = `<div class="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg"><i class="fas fa-times-circle text-red-500 text-3xl mr-4"></i><div><h3 class="font-bold text-red-700">Order Rejected</h3><p class="text-sm text-red-600">Please contact support.</p></div></div>`; return; } const statuses = ['Confirmed', 'Shipped', 'Out for Delivery', 'Delivered']; const icons = ['fa-check', 'fa-truck-fast', 'fa-truck-ramp-box', 'fa-star']; const currentStatusIndex = statuses.indexOf(status); let stepsHtml = statuses.map((s, index) => `<div class="tracker-step ${index <= currentStatusIndex ? 'completed' : ''}"><div class="step-icon"><i class="fas ${icons[index]}"></i></div><p class="step-label">${s.replace(' ', '\n')}</p></div>`).join(''); container.innerHTML = `<div class="relative"><div class="tracker-line"><div class="tracker-progress-line" style="width: ${currentStatusIndex >= 0 ? (currentStatusIndex / (statuses.length - 1)) * 100 : 0}%;"></div></div><div class="delivery-tracker">${stepsHtml}</div></div>`; }

async function downloadInvoiceDirectly(orderData) { const btn = document.getElementById('view-invoice-btn'); if (!orderData) { showToast('No order data found.', 'error'); return; } btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Downloading...`; try { const { orderId, customerDetails, items, priceSummary: summary, createdAt } = orderData; const storeDetails = { name: 'Ramazone Online Store', owner: 'Prince Rama', address: 'Lalunagar, Begusarai, Bihar - 851129', phone: 'WhatsApp: 7903698180', email: 'ramazone007@gmail.com', website: 'www.ramazon.in' }; const invoiceHTML = `<div style="width:210mm;min-height:297mm;padding:10mm;font-family:'Segoe UI',sans-serif;color:#333;font-size:11pt;display:flex;flex-direction:column;background:white;border:1px solid #333"><header style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1.5rem;border-bottom:4px solid #DC2626"><div><h1 style="font-size:2.5rem;font-weight:bold;color:#DC2626;margin:0">INVOICE</h1><p style="margin:8px 0 0;font-size:1rem;color:#555"><strong>Invoice No:</strong> ${orderId}</p><p style="margin:4px 0 0;font-size:1rem;color:#555"><strong>Invoice Date:</strong> ${new Date(createdAt).toLocaleDateString()}</p></div><div style="text-align:right"><img src="https://i.ibb.co/2RySQ5K/20240813-084352.png" alt="Ramazone Logo" style="height:65px;margin-bottom:8px;margin-left:auto" crossOrigin="anonymous"><p style="margin:0;font-weight:bold;font-size:1.1rem">${storeDetails.name}</p></div></header><section style="margin-top:2rem;display:flex;justify-content:space-between;font-size:.9rem;line-height:1.5"><div><p style="font-weight:bold;color:#555">STORE DETAILS:</p><p style="margin:4px 0 0">${storeDetails.address}</p><p style="margin:4px 0 0">${storeDetails.phone}</p></div><div style="text-align:right"><p style="font-weight:bold;color:#555">BILL TO:</p><p style="margin:4px 0 0">${customerDetails.name}</p><p style="margin:4px 0 0;color:#666;max-width:250px">${customerDetails.address}</p></div></section><section style="margin-top:2.5rem;flex-grow:1"><table style="width:100%;border-collapse:collapse;font-size:.9rem;border:1px solid #999"><thead><tr style="background-color:#DC2626;color:#fff"><th style="padding:.8rem;text-align:left;border:1px solid #999">#</th><th style="padding:.8rem;text-align:left;border:1px solid #999">Product</th><th style="padding:.8rem;text-align:center;border:1px solid #999">Qty</th><th style="padding:.8rem;text-align:right;border:1px solid #999">Rate</th><th style="padding:.8rem;text-align:right;border:1px solid #999">Amount (₹)</th></tr></thead><tbody>${items.map((item, index) => `<tr><td style="padding:.8rem;border:1px solid #999">${index + 1}</td><td style="padding:.8rem;font-weight:500;border:1px solid #999">${item.name}</td><td style="padding:.8rem;text-align:center;border:1px solid #999">${item.quantity}</td><td style="padding:.8rem;text-align:right;border:1px solid #999">₹${Number(item.displayPrice).toFixed(2)}</td><td style="padding:.8rem;text-align:right;font-weight:500;border:1px solid #999">₹${(item.displayPrice * item.quantity).toLocaleString("en-IN")}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="2" rowspan="4" style="vertical-align:top;border:1px solid #999;padding:.6rem"><p style="margin:0;font-weight:bold">Total (In Words):</p><p style="margin:4px 0">${numberToWords(summary.grandTotal)}</p></td><td colspan="2" style="text-align:right;border:1px solid #999;padding:.6rem">Sub Total:</td><td style="text-align:right;border:1px solid #999;padding:.6rem">₹${summary.subtotal.toLocaleString("en-IN")}</td></tr>${summary.coupon ? `<tr><td colspan="2" style="text-align:right;border:1px solid #999;padding:.6rem">Coupon Discount:</td><td style="text-align:right;border:1px solid #999;padding:.6rem">- ₹${Number(summary.coupon.discount).toLocaleString("en-IN")}</td></tr>` : ""}<tr><td colspan="2" style="text-align:right;border:1px solid #999;padding:.6rem">Delivery Fee:</td><td style="text-align:right;border:1px solid #999;padding:.6rem">${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString("en-IN")}` : "Free"}</td></tr><tr><td colspan="2" style="text-align:right;background-color:#DC2626;color:#fff;font-weight:bold;border:1px solid #999;padding:.8rem">Total Payable:</td><td style="text-align:right;background-color:#DC2626;color:#fff;font-weight:bold;border:1px solid #999;padding:.8rem">₹${summary.grandTotal.toLocaleString("en-IN")}</td></tr></tfoot></table></section><footer style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #eee;padding-top:1rem"><div style="font-size:.8rem;color:#888"><p style="margin:0">Thank you for your order!</p><p style="margin:4px 0 0;font-weight:bold">${storeDetails.website}</p></div><div style="text-align:center"><p style="margin:0;border-top:1px solid #555;padding-top:4px;font-size:.8rem;font-weight:bold">Authorized Signatory</p></div></footer></div>`; const el = document.createElement('div'); el.style.position = 'absolute'; el.style.left = '-9999px'; document.body.appendChild(el); el.innerHTML = invoiceHTML; const canvas = await html2canvas(el.querySelector('div'), { scale: 3, useCORS: true }); const link = document.createElement('a'); link.download = `Ramazone-Invoice-${orderId}.png`; link.href = canvas.toDataURL('image/png'); link.click(); document.body.removeChild(el); } catch (error) { console.error("Invoice download failed:", error); showToast('Invoice creation failed.', 'error'); } finally { btn.disabled = false; btn.innerHTML = `<i class="fas fa-download mr-2"></i>Download Invoice`; } }
function numberToWords(num) { const a = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]; const b = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]; if ((num = num.toString()).length > 9) return "overflow"; const n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/); if (!n) return; let str = ""; str += n[1] != 0 ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + " crore " : ""; str += n[2] != 0 ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + " lakh " : ""; str += n[3] != 0 ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + " thousand " : ""; str += n[4] != 0 ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + " hundred " : ""; str += n[5] != 0 ? (str != "" ? "and " : "") + (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]]) : ""; return str.replace(/\s+/g, ' ').trim().split(' ').map(w=>w.charAt(0).toUpperCase() + w.substr(1)).join(' ') + ' Rupees Only'; }

// --- UTILITY ---
function showToast(message, type = "info") { const toast = document.getElementById("toast-notification"); if (!toast) return; toast.textContent = message; toast.className = 'show'; if (type === 'success') toast.style.backgroundColor = '#16a34a'; else if (type === 'error') toast.style.backgroundColor = '#ef4444'; else toast.style.backgroundColor = '#333'; setTimeout(() => toast.classList.remove("show"), 3000); }


