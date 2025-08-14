// --- GLOBAL STATE for Order Page ---
let allProductsCache = [];
let validCoupons = [];
let orderItems = []; 
let appliedCoupon = null;
let deliveryFee = 0;
let ramazoneDeliveryCharge = 10;
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
    // This function remains the same as your previous version
    const dbRef = db.ref('ramazone');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const config = data.config || {};
        ramazoneDeliveryCharge = config.deliveryCharge || 10;

        const homepageData = data.homepage || {};
        const productsObject = data.products || {};
        const mainProducts = Object.values(productsObject);

        const festiveProductIds = homepageData.festiveCollection?.productIds || [];
        const jfyMainProductId = homepageData.justForYou?.topDeals?.mainProductId;
        const jfySubProductIds = homepageData.justForYou?.topDeals?.subProductIds || [];

        const allReferencedIds = new Set([...festiveProductIds, jfyMainProductId, ...jfySubProductIds].filter(Boolean));

        const referencedProducts = mainProducts.filter(p => p && allReferencedIds.has(p.id));
        const combinedProducts = [...mainProducts, ...referencedProducts];

        allProductsCache = combinedProducts.filter((p, index, self) => p && p.id && index === self.findIndex((t) => t.id === p.id));

        validCoupons = (homepageData.coupons || []).filter(c => c.status === 'active');
        document.getElementById('ramazone-delivery-label').textContent = `Ramazone Delivery (+₹${ramazoneDeliveryCharge})`;
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

    orderItems = [];
    cart.forEach(cartItem => {
        const productDetails = allProductsCache.find(p => p && p.id === cartItem.id);
        if (productDetails) {
            orderItems.push({
                ...productDetails,
                quantity: cartItem.quantity,
                selectedVariants: {} 
            });
        } else {
            console.warn(`Product with ID ${cartItem.id} found in cart but not in product cache. It will be ignored.`);
        }
    });

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
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
    document.getElementById('search-order-btn').addEventListener('click', searchOrder);
    document.getElementById('download-slip-btn').addEventListener('click', downloadOrderSlip);

    document.querySelectorAll('.payment-option').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.payment-option').forEach(opt => opt.classList.remove('selected'));
            el.classList.add('selected');
        });
    });

    document.querySelectorAll('input[name="delivery"]').forEach(radio => {
        radio.addEventListener('change', (event) => {
            document.querySelectorAll('.delivery-option').forEach(opt => opt.classList.remove('selected'));
            event.target.closest('.delivery-option').classList.add('selected');
            deliveryFee = (event.target.value === 'Ramazone') ? ramazoneDeliveryCharge : 0;
            updatePriceSummary();
        });
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
    container.innerHTML = '';
    orderItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'order-item-card flex items-start gap-4 p-2 border-b last:border-b-0';
        let variantText = Object.entries(item.selectedVariants || {})
            .map(([type, value]) => `<span class="variant-tag">${type}: ${value}</span>`).join('');

        itemDiv.innerHTML = `
            <img src="${item.images?.[0] || ''}" alt="${item.name}" class="w-20 h-20 object-cover rounded-md border">
            <div class="flex-grow">
                <h3 class="font-bold text-md text-gray-800">${item.name}</h3>
                <div class="flex flex-wrap gap-2 my-1">${variantText}</div>
                <div class="flex items-center justify-between mt-2">
                    <span class="text-lg font-bold text-gray-900">₹${Number(item.displayPrice).toLocaleString('en-IN')}</span>
                    <div class="quantity-selector-order">
                        <button class="qty-decrease" data-id="${item.id}">-</button>
                        <span>${item.quantity}</span>
                        <button class="qty-increase" data-id="${item.id}">+</button>
                    </div>
                </div>
            </div>`;
        container.appendChild(itemDiv);
    });
}

function updatePriceSummary() {
    const subtotal = orderItems.reduce((acc, item) => acc + (item.displayPrice * item.quantity), 0);
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;

    document.getElementById('subtotal-price').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    const couponRow = document.getElementById('coupon-discount-row');
    if (appliedCoupon) {
        document.getElementById('coupon-code-text').textContent = `Coupon Discount (${appliedCoupon.code})`;
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

    const foundCoupon = validCoupons.find(c => c.code.toLowerCase() === code);
    if (foundCoupon) {
        appliedCoupon = foundCoupon;
        showToast(`Coupon "${foundCoupon.code}" applied successfully!`, 'success');
    } else {
        appliedCoupon = null;
        showToast('Invalid coupon code.', 'error');
    }
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
    const customerDetails = {
        name: document.getElementById('customer-name').value,
        address: document.getElementById('customer-address').value,
    };
    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    const deliveryMethod = document.querySelector('input[name="delivery"]:checked').value;
    const subtotal = orderItems.reduce((acc, item) => acc + (item.displayPrice * item.quantity), 0);
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;

    const orderData = {
        orderId: orderId,
        customerDetails: customerDetails,
        items: orderItems.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            displayPrice: item.displayPrice,
            image: item.images?.[0] || ''
        })),
        priceSummary: {
            subtotal: subtotal,
            coupon: appliedCoupon ? { code: appliedCoupon.code, discount: couponDiscount } : null,
            deliveryFee: deliveryFee,
            grandTotal: grandTotal
        },
        paymentMethod: paymentMethod,
        deliveryMethod: deliveryMethod,
        status: 'Pending',
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        // CORRECTED PATH: Save order inside 'ramazone' node
        await database.ref(`ramazone/orders/pending/${orderId}`).set(orderData);

        const sellerPhoneNumber = '917903698180';
        let message = `*New Ramazone Order Received!*\n\n`;
        message += `*Order ID:* ${orderId}\n\n`;
        message += "--- Customer Details ---\n";
        message += `*Name:* ${customerDetails.name}\n`;
        message += `*Address:* ${customerDetails.address}\n\n`;
        message += "--- Order Summary ---\n";
        orderData.items.forEach(item => {
            message += `*${item.name}* (x${item.quantity}) - ₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}\n`;
        });
        message += `\n*Total Amount:* *₹${grandTotal.toLocaleString('en-IN')}*\n`;
        message += `*Payment:* ${paymentMethod}\n\n`;
        message += "Please check the admin panel to approve this order.";

        saveCart([]);
        document.getElementById('order-page-content').innerHTML = `
            <div class="text-center p-8 bg-white rounded-lg shadow">
                <i class="fas fa-check-circle text-5xl text-green-500 mb-4"></i>
                <h2 class="text-2xl font-bold text-gray-800">Order Placed Successfully!</h2>
                <p class="text-gray-600 mt-2">Your order has been sent to the seller for confirmation.</p>
                <p class="mt-4 font-semibold text-lg">Your Order ID is:</p>
                <div class="bg-gray-100 text-gray-800 font-bold text-2xl p-3 rounded-lg mt-2 inline-block select-all">${orderId}</div>
                <p class="text-sm text-gray-500 mt-2">Please save this ID to track your order.</p>
                <a href="index.html" class="shop-now-btn mt-6">Continue Shopping</a>
            </div>`;
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
        // CORRECTED PATH: Search for order inside 'ramazone' node
        const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get();
        if (snapshot.exists()) {
            const orderData = snapshot.val();
            renderSearchResult(orderData);
            searchStatusEl.textContent = `Showing results for Order ID: ${orderId}`;
            searchStatusEl.className = 'text-center mt-3 text-sm text-green-600';
        } else {
            searchStatusEl.textContent = 'Order not found. Please check the ID or contact support. Note: You can only track orders after they are confirmed by the seller.';
            searchStatusEl.className = 'text-center mt-3 text-sm text-red-600';
        }
    } catch (error) {
        console.error("Order search failed:", error);
        searchStatusEl.textContent = 'An error occurred while searching. Please try again.';
        searchStatusEl.className = 'text-center mt-3 text-sm text-red-600';
    }
}

function renderSearchResult(orderData) {
    const searchResultEl = document.getElementById('order-search-result');
    const slipContainer = document.getElementById('order-slip-container');
    renderDeliveryTracker(orderData.status);
    let itemsHtml = orderData.items.map(item => `
        <div class="flex items-start gap-4 py-3 border-b">
            <img src="${item.image}" alt="${item.name}" class="w-16 h-16 object-cover rounded-md border">
            <div class="flex-grow">
                <p class="font-bold text-gray-800">${item.name}</p>
                <p class="text-sm text-gray-600">Quantity: ${item.quantity}</p>
            </div>
            <p class="font-semibold text-gray-900">₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}</p>
        </div>
    `).join('');

    const summary = orderData.priceSummary;
    slipContainer.innerHTML = `
        <div id="slip-content-to-download" class="p-2">
            <div class="text-center mb-4">
                <h2 class="text-2xl font-bold">Ramazone Order Slip</h2>
                <p class="text-sm text-gray-500">Order ID: ${orderData.orderId}</p>
                <p class="text-sm text-gray-500">Date: ${new Date(orderData.createdAt).toLocaleString()}</p>
            </div>
            <div class="border-t border-b py-2 my-2">
                <h3 class="font-bold mb-2">Shipping to:</h3>
                <p class="text-gray-700">${orderData.customerDetails.name}</p>
                <p class="text-gray-600">${orderData.customerDetails.address}</p>
            </div>
            <div>
                <h3 class="font-bold mb-2">Items:</h3>
                ${itemsHtml}
            </div>
            <div class="mt-4 pt-4 border-t space-y-2 text-right">
                <p>Subtotal: <span class="font-medium">₹${summary.subtotal.toLocaleString('en-IN')}</span></p>
                ${summary.coupon ? `<p class="text-green-600">Coupon (${summary.coupon.code}): <span class="font-medium">- ₹${summary.coupon.discount.toLocaleString('en-IN')}</span></p>` : ''}
                <p>Delivery Fee: <span class="font-medium">${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></p>
                <p class="text-xl font-bold">Total: <span class="font-medium">₹${summary.grandTotal.toLocaleString('en-IN')}</span></p>
            </div>
        </div>
    `;
    searchResultEl.classList.remove('hidden');
}

function renderDeliveryTracker(status) {
    const container = document.getElementById('delivery-tracker-container');
    const statuses = ['Confirmed', 'Shipped', 'Out for Delivery', 'Delivered'];
    const icons = ['fa-check', 'fa-truck-fast', 'fa-box-taped', 'fa-star'];
    const currentStatusIndex = statuses.indexOf(status);
    let stepsHtml = '';
    statuses.forEach((s, index) => {
        const isCompleted = index <= currentStatusIndex;
        stepsHtml += `
            <div class="tracker-step ${isCompleted ? 'completed' : ''}">
                <div class="step-icon"><i class="fas ${icons[index]}"></i></div>
                <p class="step-label">${s}</p>
            </div>
        `;
    });
    const progressPercentage = currentStatusIndex >= 0 ? (currentStatusIndex / (statuses.length - 1)) * 100 : 0;
    container.innerHTML = `
        <div class="delivery-tracker">
            <div class="tracker-line">
                <div class="tracker-progress-line" style="width: ${progressPercentage}%;"></div>
            </div>
            ${stepsHtml}
        </div>
    `;
}

function downloadOrderSlip() {
    const slipContent = document.getElementById('slip-content-to-download');
    const orderId = document.getElementById('order-id-input').value.trim().toUpperCase();
    if (!slipContent) {
        showToast('No order details to download.', 'error');
        return;
    }
    html2canvas(slipContent, { scale: 2, useCORS: true }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Ramazone-Order-${orderId || 'slip'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(err => {
        console.error("Could not create canvas for download:", err);
        showToast('Failed to generate order slip.', 'error');
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

