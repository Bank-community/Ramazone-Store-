// --- GLOBAL STATE for Order Page ---
let allProductsCache = [];
let validCoupons = [];
let orderItems = []; 
let appliedCoupon = null;
let deliveryFee = 0;
let ramazoneDeliveryCharge = 15; // Default charge
const FREE_DELIVERY_THRESHOLD = 500;
let database;

// --- CART HELPER FUNCTIONS ---
function getCart() {
    try {
        const cart = localStorage.getItem('ramazoneCart');
        return cart ? JSON.parse(cart) : [];
    } catch (e) {
        console.error("Could not parse cart from localStorage", e);
        return [];
    }
}

function saveCart(cart) {
    const cartToSave = cart.map(item => ({ id: item.id, quantity: item.quantity }));
    localStorage.setItem('ramazoneCart', JSON.stringify(cartToSave));
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeOrderPage);

async function initializeOrderPage() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        const firebaseConfig = await response.json();

        if (firebaseConfig.apiKey) {
            firebase.initializeApp(firebaseConfig);
            database = firebase.database();
            await fetchAllData(database);
            loadOrderFromCart(); 
            setupEventListeners();
        } else {
            throw new Error("Firebase config is missing or invalid.");
        }
    } catch (error) { 
        console.error("Initialization failed:", error); 
        document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Could not load order page.</p>'; 
    }
}

async function fetchAllData(db) {
    const dbRef = db.ref('ramazone');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const config = data.config || {};
        ramazoneDeliveryCharge = config.deliveryCharge || 15;

        const homepageData = data.homepage || {};
        const productsObject = data.products || {};
        const mainProducts = Object.values(productsObject);

        const allReferencedIds = new Set(
            [...Object.values(homepageData).flatMap(section => section.productIds || [])]
        );
        const referencedProducts = mainProducts.filter(p => p && allReferencedIds.has(p.id));
        const combinedProducts = [...mainProducts, ...referencedProducts];

        allProductsCache = combinedProducts.filter((p, index, self) => p && p.id && index === self.findIndex((t) => t.id === p.id));
        validCoupons = (homepageData.coupons || []).filter(c => c.status === 'active');
    }
}

function loadOrderFromCart() {
    const cart = getCart();
    if (cart.length === 0) {
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('order-page-content').style.display = 'none';
        document.getElementById('sticky-order-footer').style.display = 'none';
        document.getElementById('empty-cart-message').classList.remove('hidden');
        return;
    }
    orderItems = cart.map(cartItem => {
        const productDetails = allProductsCache.find(p => p && p.id === cartItem.id);
        return productDetails ? { ...productDetails, quantity: cartItem.quantity, selectedVariants: {} } : null;
    }).filter(Boolean);

    if(orderItems.length === 0) {
        saveCart([]); 
        loadOrderFromCart();
        return;
    }
    renderOrderItems();
    updatePriceSummary();
    document.getElementById('loading-indicator').style.display = 'none';
    document.getElementById('order-page-content').classList.remove('hidden');
    document.getElementById('sticky-order-footer').classList.remove('hidden');
}

function setupEventListeners() {
    document.getElementById('apply-coupon-btn').addEventListener('click', applyCoupon);
    document.getElementById('remove-coupon-btn').addEventListener('click', removeCoupon);
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
    document.getElementById('search-order-btn').addEventListener('click', searchOrder);
    document.getElementById('download-slip-btn').addEventListener('click', downloadOrderSlip);

    // New compact option listeners
    document.getElementById('payment-option-group').addEventListener('click', e => {
        if (e.target.tagName === 'LABEL') {
            document.querySelectorAll('#payment-option-group .option-label').forEach(l => l.classList.remove('selected'));
            e.target.classList.add('selected');
        }
    });
    document.getElementById('delivery-option-group').addEventListener('click', e => {
        if (e.target.tagName === 'LABEL') {
            document.querySelectorAll('#delivery-option-group .option-label').forEach(l => l.classList.remove('selected'));
            e.target.classList.add('selected');
            updatePriceSummary();
        }
    });

    const itemsContainer = document.getElementById('order-items-container');
    itemsContainer.addEventListener('click', function(event) {
        const target = event.target;
        const productId = target.dataset.id;
        if (!productId) return;
        const itemIndex = orderItems.findIndex(item => item.id == productId);
        if (itemIndex === -1) return;
        if (target.classList.contains('qty-increase')) {
            orderItems[itemIndex].quantity++;
        } else if (target.classList.contains('qty-decrease')) {
            if (orderItems[itemIndex].quantity > 1) {
                orderItems[itemIndex].quantity--;
            } else {
                 orderItems.splice(itemIndex, 1);
            }
        }
        saveCart(orderItems);
        if(orderItems.length === 0) {
            loadOrderFromCart();
        } else {
            renderOrderItems();
            updatePriceSummary();
        }
    });
}

function renderOrderItems() {
    const container = document.getElementById('order-items-container');
    container.innerHTML = orderItems.map(item => `
        <div class="order-item-card flex items-start gap-4 p-2 border-b last:border-b-0">
            <img src="${item.images?.[0] || ''}" alt="${item.name}" class="w-20 h-20 object-cover rounded-md border">
            <div class="flex-grow">
                <h3 class="font-bold text-md text-gray-800">${item.name}</h3>
                <div class="flex items-center justify-between mt-2">
                    <span class="text-lg font-bold text-gray-900">₹${Number(item.displayPrice).toLocaleString('en-IN')}</span>
                    <div class="quantity-selector-order">
                        <button class="qty-decrease" data-id="${item.id}">-</button>
                        <span>${item.quantity}</span>
                        <button class="qty-increase" data-id="${item.id}">+</button>
                    </div>
                </div>
            </div>
        </div>`).join('');
}

function updatePriceSummary() {
    const subtotal = orderItems.reduce((acc, item) => acc + (item.displayPrice * item.quantity), 0);
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;

    // NEW: Free delivery logic
    const isRamazoneDelivery = document.querySelector('input[name="delivery"]:checked').value === 'Ramazone';
    deliveryFee = (isRamazoneDelivery && subtotal < FREE_DELIVERY_THRESHOLD) ? ramazoneDeliveryCharge : 0;

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

function applyCoupon() {
    const code = document.getElementById('coupon-input').value.trim().toLowerCase();
    if (!code) return;
    if (appliedCoupon) {
        showToast('Coupon already applied. Remove it first.', 'error');
        return;
    }
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

// NEW: Function to remove the applied coupon
function removeCoupon() {
    appliedCoupon = null;
    showToast('Coupon removed.', 'info');
    document.getElementById('coupon-input').value = '';
    document.getElementById('coupon-section').classList.remove('hidden');
    document.getElementById('applied-coupon-div').classList.add('hidden');
    updatePriceSummary();
}

function generateOrderId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'RMZ';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function placeOrder(event) {
    event.preventDefault();
    const form = document.getElementById('customer-details-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        showToast('Please fill all required shipping details.', 'error');
        return;
    }
    const placeOrderBtn = document.getElementById('place-order-btn');
    placeOrderBtn.textContent = 'Placing...';
    placeOrderBtn.disabled = true;

    const orderId = generateOrderId();
    const customerDetails = { name: document.getElementById('customer-name').value, address: document.getElementById('customer-address').value };
    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    const deliveryMethod = document.querySelector('input[name="delivery"]:checked').value;
    const subtotal = orderItems.reduce((acc, item) => acc + (item.displayPrice * item.quantity), 0);
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;

    const orderData = {
        orderId, customerDetails, paymentMethod, deliveryMethod,
        items: orderItems.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, displayPrice: item.displayPrice, image: item.images?.[0] || '' })),
        priceSummary: { subtotal, coupon: appliedCoupon ? { code: appliedCoupon.code, discount: couponDiscount } : null, deliveryFee, grandTotal },
        status: 'Pending', createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        await database.ref(`ramazone/orders/pending/${orderId}`).set(orderData);
        const sellerPhoneNumber = '917903698180';

        // UPDATED: WhatsApp Message Format
        let message = `🛍️ *Ramazone Store Order* 🛍️\n\n`;
        message += `*Order ID:* ${orderId}\n\n`;
        message += "--- *Customer Details* ---\n";
        message += `*Name:* ${customerDetails.name}\n`;
        message += `*Address:* ${customerDetails.address}\n\n`;
        message += "--- *Order Summary* ---\n";
        orderData.items.forEach((item, index) => {
            message += `${index + 1}. *${item.name}* (x${item.quantity}) - *₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}*\n`;
        });
        message += `\n*Total Amount:* *₹${grandTotal.toLocaleString('en-IN')}*\n`;
        message += `*Payment:* ${paymentMethod}\n\n`;
        message += "Please check the admin panel to approve this order.";

        saveCart([]);
        document.getElementById('order-page-content').innerHTML = `<div class="text-center p-8 bg-white rounded-lg shadow"><i class="fas fa-check-circle text-5xl text-green-500 mb-4"></i><h2 class="text-2xl font-bold text-gray-800">Order Placed Successfully!</h2><p class="text-gray-600 mt-2">Your order has been sent for confirmation.</p><p class="mt-4 font-semibold text-lg">Your Order ID is:</p><div class="bg-gray-100 text-gray-800 font-bold text-2xl p-3 rounded-lg mt-2 inline-block select-all">${orderId}</div><p class="text-sm text-gray-500 mt-2">Please save this ID to track your order.</p><a href="index.html" class="shop-now-btn mt-6">Continue Shopping</a></div>`;
        document.getElementById('sticky-order-footer').style.display = 'none';

        const whatsappUrl = `https://wa.me/${sellerPhoneNumber}?text=${encodeURIComponent(message)}`;
        window.location.href = whatsappUrl;
    } catch (error) {
        console.error("Failed to place order:", error);
        showToast('Could not place order. Please try again.', 'error');
        placeOrderBtn.textContent = 'Place Order';
        placeOrderBtn.disabled = false;
    }
}

async function searchOrder() {
    const orderId = document.getElementById('order-id-input').value.trim().toUpperCase();
    const searchStatusEl = document.getElementById('search-status');
    const searchResultEl = document.getElementById('order-search-result');
    if (!orderId) {
        searchStatusEl.textContent = 'Please enter an Order ID.';
        searchStatusEl.className = 'text-center mt-3 text-sm text-yellow-600';
        return;
    }
    searchStatusEl.textContent = 'Searching...';
    searchStatusEl.className = 'text-center mt-3 text-sm text-blue-600';
    searchResultEl.classList.add('hidden');
    try {
        const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get();
        if (snapshot.exists()) {
            const orderData = snapshot.val();
            renderSearchResult(orderData);
            searchStatusEl.textContent = `Showing results for Order ID: ${orderId}`;
            searchStatusEl.className = 'text-center mt-3 text-sm text-green-600';
        } else {
            searchStatusEl.textContent = 'Order not found. Please check the ID or contact support.';
            searchStatusEl.className = 'text-center mt-3 text-sm text-red-600';
        }
    } catch (error) {
        console.error("Order search failed:", error);
        searchStatusEl.textContent = 'An error occurred while searching.';
        searchStatusEl.className = 'text-center mt-3 text-sm text-red-600';
    }
}

function renderSearchResult(orderData) {
    const searchResultEl = document.getElementById('order-search-result');
    renderDeliveryTracker(orderData.status);
    // This container is now just a placeholder, the real slip is generated on download.
    document.getElementById('order-slip-container').innerHTML = `<p class="text-center text-gray-500 text-sm">Click the button below to download your order invoice.</p>`;
    searchResultEl.classList.remove('hidden');
}

function renderDeliveryTracker(status) {
    const container = document.getElementById('delivery-tracker-container');
    const statuses = ['Confirmed', 'Shipped', 'Out for Delivery', 'Delivered'];
    // UPDATED: New icon for Out for Delivery
    const icons = ['fa-check', 'fa-truck-fast', 'fa-truck-ramp-box', 'fa-star'];
    const currentStatusIndex = statuses.indexOf(status);
    let stepsHtml = statuses.map((s, index) => {
        const isCompleted = index <= currentStatusIndex;
        return `<div class="tracker-step ${isCompleted ? 'completed' : ''}"><div class="step-icon"><i class="fas ${icons[index]}"></i></div><p class="step-label">${s.replace(' ', '\n')}</p></div>`;
    }).join('');
    const progressPercentage = currentStatusIndex >= 0 ? (currentStatusIndex / (statuses.length - 1)) * 100 : 0;
    container.innerHTML = `<div class="relative"><div class="delivery-tracker">${stepsHtml}</div><div class="tracker-line"><div class="tracker-progress-line" style="width: ${progressPercentage}%;"></div></div></div>`;
}

// NEW: Function to generate and download A4-style invoice
async function downloadOrderSlip() {
    const orderId = document.getElementById('order-id-input').value.trim().toUpperCase();
    if (!orderId) {
        showToast('No order loaded to download.', 'error');
        return;
    }

    // Fetch the latest order data again to ensure it's current
    const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get();
    if (!snapshot.exists()) {
        showToast('Could not find order data to download.', 'error');
        return;
    }
    const orderData = snapshot.val();

    const slipContent = document.getElementById('a4-invoice-slip');
    const summary = orderData.priceSummary;

    // Populate the A4 invoice template
    slipContent.innerHTML = `
        <div class="flex justify-between items-start pb-4 border-b">
            <div>
                <h1 class="text-4xl font-bold text-gray-800">Ramazone</h1>
                <p class="text-gray-500">Your Trusted Online Store</p>
            </div>
            <h2 class="text-2xl font-semibold text-gray-600">INVOICE</h2>
        </div>
        <div class="flex justify-between mt-8">
            <div>
                <p class="font-bold text-gray-700">Billed To:</p>
                <p>${orderData.customerDetails.name}</p>
                <p class="text-gray-600">${orderData.customerDetails.address}</p>
            </div>
            <div class="text-right">
                <p><span class="font-bold">Invoice #:</span> ${orderData.orderId}</p>
                <p><span class="font-bold">Date:</span> ${new Date(orderData.createdAt).toLocaleDateString()}</p>
            </div>
        </div>
        <div class="mt-8">
            <table class="w-full text-left">
                <thead>
                    <tr class="bg-gray-100">
                        <th class="p-2 font-semibold">#</th>
                        <th class="p-2 font-semibold">ITEM</th>
                        <th class="p-2 font-semibold text-center">QTY</th>
                        <th class="p-2 font-semibold text-right">PRICE</th>
                        <th class="p-2 font-semibold text-right">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${orderData.items.map((item, index) => `
                        <tr class="border-b">
                            <td class="p-2">${index + 1}</td>
                            <td class="p-2">
                                <div class="flex items-center">
                                    <img src="${item.image}" class="w-10 h-10 object-cover rounded mr-3">
                                    <span>${item.name}</span>
                                </div>
                            </td>
                            <td class="p-2 text-center">${item.quantity}</td>
                            <td class="p-2 text-right">₹${item.displayPrice.toLocaleString('en-IN')}</td>
                            <td class="p-2 text-right">₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div class="flex justify-end mt-8">
            <div class="w-full max-w-xs space-y-2">
                <div class="flex justify-between"><span class="text-gray-600">Subtotal:</span><span>₹${summary.subtotal.toLocaleString('en-IN')}</span></div>
                ${summary.coupon ? `<div class="flex justify-between text-green-600"><span >Coupon Discount:</span><span>- ₹${summary.coupon.discount.toLocaleString('en-IN')}</span></div>` : ''}
                <div class="flex justify-between"><span class="text-gray-600">Delivery Fee:</span><span>${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></div>
                <div class="flex justify-between font-bold text-xl border-t pt-2 mt-2"><span >Grand Total:</span><span>₹${summary.grandTotal.toLocaleString('en-IN')}</span></div>
            </div>
        </div>
        <div class="text-center text-gray-500 text-xs mt-16 border-t pt-4">
            <p>Thank you for your purchase!</p>
            <p>Ramazone Store | ramazone.in</p>
        </div>
    `;

    showToast('Generating your invoice...', 'info');

    html2canvas(slipContent, { scale: 3, useCORS: true }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Ramazone-Invoice-${orderId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(err => {
        console.error("Could not create canvas for download:", err);
        showToast('Failed to generate invoice.', 'error');
    });
}

function showToast(message, type = "info") {
    const toast = document.getElementById("toast-notification");
    if(!toast) return;
    toast.textContent = message;
    toast.className = 'toast show';
    if(type === 'success') toast.classList.add('success');
    if(type === 'error') toast.classList.add('error');
    setTimeout(() => toast.classList.remove("show"), 3000);
}

