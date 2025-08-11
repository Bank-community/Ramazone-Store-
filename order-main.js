// --- GLOBAL STATE for Order Page ---
let allProductsCache = [];
let validCoupons = [];
let orderItems = [];
let appliedCoupon = null;
let deliveryFee = 0;
let ramazoneDeliveryCharge = 10; // Default delivery charge
let database;

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
            loadInitialOrder();
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
        ramazoneDeliveryCharge = config.deliveryCharge || 10;
        allProductsCache = data.products || [];
        validCoupons = (data.homepage?.coupons || []).filter(c => c.status === 'active');
        // Set delivery charge label text
        document.getElementById('ramazone-delivery-label').textContent = `Ramazone Delivery (+₹${ramazoneDeliveryCharge})`;
    }
}

function loadInitialOrder() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    const quantity = parseInt(params.get('quantity'), 10) || 1;
    const couponCodeFromUrl = params.get('coupon');
    const variantsStr = params.get('variants');
    let selectedVariants = {};

    if (variantsStr) {
        try {
            selectedVariants = JSON.parse(decodeURIComponent(variantsStr));
        } catch (e) { console.error("Could not parse variants:", e); }
    }

    if (!productId) {
        document.getElementById('loading-indicator').textContent = 'No product selected.';
        return;
    }

    const product = allProductsCache.find(p => p.id == productId);
    if (!product) {
        document.getElementById('loading-indicator').textContent = 'Selected product not found.';
        return;
    }
    
    orderItems.push({ ...product, quantity: quantity, selectedVariants: selectedVariants });

    if (couponCodeFromUrl) {
        const foundCoupon = validCoupons.find(c => c.code === couponCodeFromUrl);
        if (foundCoupon) {
            appliedCoupon = foundCoupon;
            document.getElementById('coupon-section').style.display = 'none';
        }
    }

    renderOrderItems();
    updatePriceSummary();
    
    document.getElementById('loading-indicator').style.display = 'none';
    document.getElementById('order-page-content').style.display = 'block';
}

function setupEventListeners() {
    document.getElementById('apply-coupon-btn').addEventListener('click', applyCoupon);
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
    
    document.querySelectorAll('.payment-option').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.payment-option').forEach(opt => opt.classList.remove('selected'));
            el.classList.add('selected');
        });
    });

    // ** NEW: Event listener for DELIVERY changes **
    document.querySelectorAll('input[name="delivery"]').forEach(radio => {
        radio.addEventListener('change', (event) => {
            document.querySelectorAll('.delivery-option').forEach(opt => opt.classList.remove('selected'));
            event.target.closest('.delivery-option').classList.add('selected');
            if (event.target.value === 'Ramazone') {
                deliveryFee = ramazoneDeliveryCharge;
            } else {
                deliveryFee = 0;
            }
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
            }
        }
        renderOrderItems();
        updatePriceSummary();
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
    const code = document.getElementById('coupon-input').value.trim();
    if (!code) return;

    const foundCoupon = validCoupons.find(c => c.code.toLowerCase() === code.toLowerCase());
    if (foundCoupon) {
        appliedCoupon = foundCoupon;
        showToast(`Coupon "${foundCoupon.code}" applied successfully!`, 'success');
    } else {
        appliedCoupon = null;
        showToast('Invalid coupon code.', 'error');
    }
    updatePriceSummary();
}

function placeOrder(event) {
    event.preventDefault();
    const form = document.getElementById('customer-details-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        showToast('Please fill all required fields.', 'error');
        return;
    }

    const name = document.getElementById('customer-name').value;
    const address = document.getElementById('customer-address').value;
    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
    const deliveryMethod = document.querySelector('input[name="delivery"]:checked').value;
    
    const sellerPhoneNumber = '917903698180';

    // ** FINAL: Clean, Emoji-Free WhatsApp Message Format **
    let message = "*Ramazone Store Order*\n\n";
    message += "--- Customer Details ---\n";
    message += `*Name:* ${name}\n`;
    message += `*Address:* ${address}\n\n`;
    
    message += "--- Order Items ---\n";
    orderItems.forEach(item => {
        message += `*Product:* ${item.name}\n`;
        message += `*Quantity:* ${item.quantity}\n`;
        message += `*Price:* ₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}\n`;
        const productUrl = `${window.location.origin}/product-details.html?id=${item.id}`;
        message += `*Product ID:* ${item.id}\n`;
        message += `*Product Link:* ${productUrl}\n`;
        message += `-------------------------------------\n`;
    });
    
    message += `\n--- Payment Summary ---\n`;
    const subtotal = orderItems.reduce((acc, item) => acc + (item.displayPrice * item.quantity), 0);
    message += `*Subtotal:* ₹${subtotal.toLocaleString('en-IN')}\n`;

    if (appliedCoupon) {
        message += `*Coupon Discount (${appliedCoupon.code}):* - ₹${Number(appliedCoupon.discount).toLocaleString('en-IN')}\n`;
    }
    message += `*Delivery (${deliveryMethod}):* ${deliveryFee > 0 ? `+ ₹${deliveryFee.toLocaleString('en-IN')}` : 'Free'}\n`;
    
    const grandTotal = subtotal - (appliedCoupon ? Number(appliedCoupon.discount) : 0) + deliveryFee;
    message += `*Total Amount:* *₹${grandTotal.toLocaleString('en-IN')}*\n`;
    message += `*Payment Method:* ${paymentMethod}\n\n`;
    message += "Please confirm the order. Thanks!";

    const whatsappUrl = `https://wa.me/${sellerPhoneNumber}?text=${encodeURIComponent(message)}`;
    window.location.href = whatsappUrl;
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
