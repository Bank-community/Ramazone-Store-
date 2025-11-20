// --- GLOBAL STATE & CONFIG ---
let allProductsCache = [], validCoupons = [], orderItems = [];
let appliedCoupon = null, database, currentStep = 1;
let ramazoneConfig = { deliveryCharge: 15, freeDeliveryThreshold: 500, minOrderForDelivery: 0 };
let editingAddressIndex = null; // State variable for address editing

// === HARDCODED FIREBASE CONFIG (As requested) ===
const firebaseConfig = {
    apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
    authDomain: "re-store-8e5b3.firebaseapp.com",
    databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
};

// --- HELPERS ---
const getCart = () => { try { return JSON.parse(localStorage.getItem('ramazoneCart')) || []; } catch (e) { return []; } };
const saveCart = (cart) => localStorage.setItem('ramazoneCart', JSON.stringify(cart));
// --- Address Helpers ---
const getSavedAddresses = () => { try { return JSON.parse(localStorage.getItem('ramazoneSavedAddresses')) || []; } catch (e) { return []; } };
const saveAddresses = (addresses) => localStorage.setItem('ramazoneSavedAddresses', JSON.stringify(addresses));

// Helper to format variants and pack info
const getVariantDetailsString = (item) => {
    let details = [];
    if (item.variants) {
        Object.entries(item.variants).forEach(([key, val]) => {
            details.push(`${key}: ${val}`);
        });
    }
    if (item.pack) {
        details.push(`Pack: ${item.pack.name}`);
    }
    return details.join(' | ');
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeOrderPage);

async function initializeOrderPage() {
    try {
        // Initialize Firebase directly with hardcoded config
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        database = firebase.database();

        await fetchAllDataAndConfig();
        
        await checkAndDisplayRecentOrder();

        if (getCart().length > 0) {
            document.getElementById('checkout-flow-container').classList.remove('hidden');
            renderSavedAddresses(); 
            navigateToStep(1);
            loadOrderFromCart();
        } else {
            document.getElementById('loading-indicator').style.display = 'none';
            if (!localStorage.getItem('ramazoneRecentOrderId')) {
                document.getElementById('empty-cart-message').classList.remove('hidden');
            }
        }

        setupEventListeners();
    } catch (error) { 
        console.error("Initialization Failed:", error); 
        document.getElementById('loading-indicator').innerHTML = `<p class="text-red-500">Could not load page. Error: ${error.message}</p>`; 
    }
}

async function fetchAllDataAndConfig() {
    const data = (await database.ref('ramazone').get()).val() || {};
    if (data.config) {
        ramazoneConfig.deliveryCharge = data.config.deliveryCharge || 15;
        ramazoneConfig.freeDeliveryThreshold = data.config.freeDeliveryThreshold || 500;
        ramazoneConfig.minOrderForDelivery = data.config.minOrderForDelivery || 0;
    }
    document.getElementById('ramazone-delivery-label').textContent = `Ramazone Delivery (+₹${ramazoneConfig.deliveryCharge})`;
    document.getElementById('ramazone-delivery-info').textContent = `Orders above ₹${ramazoneConfig.freeDeliveryThreshold} get free Ramazone Delivery.`;
    allProductsCache = Object.values(data.products || {});
    validCoupons = (data.homepage?.coupons || []).filter(c => c.status === 'active');
}

function processCartForDisplay() { return getCart().map((cartItem, index) => { const productDetails = allProductsCache.find(p => p.id === cartItem.id); return productDetails ? { ...productDetails, ...cartItem, cartIndex: index } : null; }).filter(Boolean); }

function loadOrderFromCart() {
    orderItems = processCartForDisplay();
    if (orderItems.length === 0) { document.getElementById('loading-indicator').style.display = 'none'; document.getElementById('checkout-flow-container').classList.add('hidden'); document.getElementById('empty-cart-message').classList.remove('hidden'); return; }
    document.getElementById('loading-indicator').style.display = 'none';
    renderOrderItems();
    updatePriceAndValidation();
}

// --- RENDER & UPDATE FUNCTIONS ---
function renderOrderItems() {
    const container = document.getElementById('order-items-container');
    container.innerHTML = orderItems.map(item => { 
        const isPack = item.pack && item.pack.name !== 'Single Item'; 
        const displayName = item.name; 
        const displayPrice = isPack ? Number(item.pack.price) : Number(item.displayPrice); 
        const variantInfo = getVariantDetailsString(item); // Get variants info

        return `
        <div class="order-item-card flex items-start gap-4 p-2 border-b last:border-b-0 relative">
            <button class="delete-item-btn" data-cart-index="${item.cartIndex}"><img src="https://www.svgrepo.com/show/502614/delete.svg" alt="Delete"></button>
            <a href="product-details.html?id=${item.id}" class="flex-shrink-0">
                <img src="${item.images?.[0] || ''}" alt="${item.name}" class="w-20 h-20 object-cover rounded-md border">
            </a>
            <div class="flex-grow flex flex-col justify-between self-stretch">
                <div>
                    <a href="product-details.html?id=${item.id}" class="block">
                        <h3 class="font-bold text-md text-gray-800 leading-tight">${displayName}</h3>
                    </a>
                    ${variantInfo ? `<p class="text-xs text-gray-500 mt-1 font-medium bg-gray-50 inline-block px-1 rounded border border-gray-200">${variantInfo}</p>` : ''}
                </div>
                <div class="flex items-center justify-between mt-2">
                    <span class="text-lg font-bold text-gray-900">₹${displayPrice.toLocaleString('en-IN')}</span>
                    <div class="quantity-selector-order">
                        <button class="qty-decrease" data-cart-index="${item.cartIndex}">-</button>
                        <span>${item.quantity}</span>
                        <button class="qty-increase" data-cart-index="${item.cartIndex}">+</button>
                    </div>
                </div>
            </div>
        </div>`; 
    }).join('');
}

function updatePriceAndValidation() {
    let subtotal = 0, totalMRP = 0;
    orderItems.forEach(item => { const isPack = item.pack && item.pack.name !== 'Single Item'; const price = isPack ? Number(item.pack.price) : Number(item.displayPrice); const mrp = Number(item.originalPrice) > price ? Number(item.originalPrice) : price; subtotal += price * item.quantity; totalMRP += mrp * item.quantity; });
    const totalSavings = totalMRP - subtotal;
    let summaryStep1HTML = `<div class="flex justify-between"><span class="text-gray-600">Total MRP</span><span class="font-medium text-gray-800 line-through">₹${totalMRP.toLocaleString('en-IN')}</span></div>`;
    if (totalSavings > 0) summaryStep1HTML += `<div class="flex justify-between text-green-600"><span class="font-semibold">Product Savings</span><span class="font-semibold">- ₹${totalSavings.toLocaleString('en-IN')}</span></div>`;
    summaryStep1HTML += `<div class="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t"><span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>`;
    document.getElementById('price-summary-container-step1').innerHTML = summaryStep1HTML;
    
    // Delivery option validation
    const deliveryOption = document.querySelector('input[name="delivery"]:checked').value;
    const deliveryNotice = document.getElementById('delivery-minimum-notice');
    let isMinOrderMet = true;
    deliveryNotice.classList.add('hidden'); 
    if (deliveryOption === 'Ramazone' && ramazoneConfig.minOrderForDelivery > 0 && subtotal < ramazoneConfig.minOrderForDelivery) {
        const amountNeeded = ramazoneConfig.minOrderForDelivery - subtotal;
        deliveryNotice.innerHTML = `🛒 Ramazone Delivery ke liye <b>₹${amountNeeded.toLocaleString('en-IN')}</b> ka aur saman kharidein.`;
        deliveryNotice.classList.remove('hidden');
        isMinOrderMet = false;
    }

    // Address validation (Basic check if address exists in form logic)
    // We removed complex location validation, so assume true for now until form check
    
    // Final button state
    const placeOrderBtn = document.getElementById('place-order-btn');
    placeOrderBtn.disabled = !isMinOrderMet;

    if (!isMinOrderMet) {
        placeOrderBtn.textContent = `Minimum Order ₹${ramazoneConfig.minOrderForDelivery}`;
    } else {
        placeOrderBtn.innerHTML = `<i class="fas fa-check"></i> Place Order`;
    }

    // Price summary step 3
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const deliveryFee = (deliveryOption === 'Ramazone' && subtotal < ramazoneConfig.freeDeliveryThreshold) ? ramazoneConfig.deliveryCharge : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;
    let summaryStep3HTML = `<div class="flex justify-between"><span class="text-gray-600">Total MRP</span><span class="font-medium text-gray-800 line-through">₹${totalMRP.toLocaleString('en-IN')}</span></div>`;
    if(totalSavings > 0) summaryStep3HTML += `<div class="flex justify-between text-green-600"><span>Product Savings</span><span>- ₹${totalSavings.toLocaleString('en-IN')}</span></div>`;
    if(couponDiscount > 0) summaryStep3HTML += `<div class="flex justify-between text-green-600"><span>Coupon Discount</span><span>- ₹${couponDiscount.toLocaleString('en-IN')}</span></div>`;
    summaryStep3HTML += `<div class="flex justify-between"><span class="text-gray-600">Delivery Fee</span><span>${deliveryFee > 0 ? `+ ₹${deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></div>`;
    summaryStep3HTML += `<div class="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t"><span>Total Amount</span><span>₹${grandTotal.toLocaleString('en-IN')}</span></div>`;
    document.getElementById('price-summary-container-step3').innerHTML = summaryStep3HTML;
}

// --- SAVED ADDRESS MANAGEMENT (Simplified) ---
function renderSavedAddresses() {
    const container = document.getElementById('saved-address-container');
    const addresses = getSavedAddresses();
    if (addresses.length === 0) {
        container.innerHTML = `<p class="text-center text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">Aapke paas koi saved address nahi hai.</p>`;
        return;
    }
    container.innerHTML = addresses.map((addr, index) => {
        return `
        <div class="address-card p-3 rounded-lg flex items-center justify-between gap-4 cursor-pointer ${addr.isPrime ? 'prime' : ''}" data-index="${index}">
            <div class="flex-grow min-w-0"> 
                <p class="font-bold text-gray-800 flex items-center">
                    ${addr.name} ${addr.isPrime ? '<span class="prime-badge">PRIME</span>' : ''}
                </p>
                <p class="text-sm text-gray-600">${addr.mobile}</p>
                <p class="text-sm text-gray-600 truncate">${addr.address}</p>
            </div>
            <div class="address-actions flex flex-col sm:flex-row gap-2 items-center">
                <button class="btn btn-secondary !py-1 !px-3" data-action="edit" data-index="${index}"><i class="fas fa-edit m-0"></i></button>
                <button class="btn !bg-red-100 !text-red-600 hover:!bg-red-200 !py-1 !px-3" data-action="delete" data-index="${index}"><i class="fas fa-trash m-0"></i></button>
                ${!addr.isPrime ? `<button class="btn btn-secondary !py-1 !px-3" data-action="set-prime" data-index="${index}"><i class="fas fa-star m-0"></i></button>` : ''}
            </div>
        </div>`
    }).join('');
    const primeAddress = addresses.find(addr => addr.isPrime);
    if (primeAddress) { fillFormWithAddress(primeAddress); }
}

function fillFormWithAddress(address) {
    document.getElementById('customer-name').value = address.name;
    document.getElementById('customer-mobile').value = address.mobile;
    document.getElementById('customer-address').value = address.address;
}

function handleAddressManagement(e) {
    const card = e.target.closest('.address-card');
    if (!card) return;

    const button = e.target.closest('button[data-action]');
    const action = button ? button.dataset.action : 'use'; 
    const index = parseInt(card.dataset.index);
    let addresses = getSavedAddresses();

    if (action === 'use') {
        fillFormWithAddress(addresses[index]);
        showToast('Address form mein bhar diya gaya hai.', 'success');
    } else if (action === 'edit') {
        fillFormWithAddress(addresses[index]);
        editingAddressIndex = index;
        document.getElementById('address-form-title').textContent = 'Update Your Address';
        document.querySelector('#save-address-btn span').textContent = 'Update Address';
        document.getElementById('customer-name').focus();
    } else if (action === 'delete') {
        addresses.splice(index, 1);
        saveAddresses(addresses);
        renderSavedAddresses();
        showToast('Address delete ho gaya.', 'info');
    } else if (action === 'set-prime') {
        addresses = addresses.map((addr, i) => ({ ...addr, isPrime: i === index }));
        saveAddresses(addresses);
        renderSavedAddresses();
        showToast('Primary address set ho gaya hai.', 'success');
    }
}

function handleSaveOrUpdateAddress(e) {
    e.preventDefault(); // Prevent default form submission if any
    const form = document.getElementById('customer-details-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    
    const newAddress = {
        name: document.getElementById('customer-name').value.trim(),
        mobile: document.getElementById('customer-mobile').value.trim(),
        address: document.getElementById('customer-address').value.trim(),
        isPrime: false
    };

    let addresses = getSavedAddresses();
    if (editingAddressIndex !== null) {
        const wasPrime = addresses[editingAddressIndex].isPrime;
        newAddress.isPrime = wasPrime;
        addresses[editingAddressIndex] = newAddress;
        showToast('Address update ho gaya!', 'success');
    } else {
        if (addresses.length >= 2) { showToast('Aap sirf 2 address save kar sakte hain.', 'error'); return; }
        if (addresses.length === 0) { newAddress.isPrime = true; }
        addresses.push(newAddress);
        showToast('Address save ho gaya!', 'success');
    }
    saveAddresses(addresses);
    renderSavedAddresses();
    editingAddressIndex = null;
    document.getElementById('address-form-title').textContent = 'Add a New Shipping Address';
    document.querySelector('#save-address-btn span').textContent = 'Save this Address';
    form.reset();
}

function autoSaveAddress(customerDetails) {
    let addresses = getSavedAddresses();
    const addressExists = addresses.some(addr => 
        addr.name.trim().toLowerCase() === customerDetails.name.trim().toLowerCase() &&
        addr.mobile.trim() === customerDetails.mobile.trim() &&
        addr.address.trim().toLowerCase() === customerDetails.address.trim().toLowerCase()
    );
    if (addressExists || addresses.length >= 2) {
        return; 
    }
    const newAddress = {
        ...customerDetails,
        isPrime: addresses.length === 0 
    };
    addresses.push(newAddress);
    saveAddresses(addresses);
    renderSavedAddresses(); 
    showToast('Aapka address bhavishya ke liye save ho gaya hai.', 'success');
}

// --- EVENT LISTENERS & NAVIGATION ---
function setupEventListeners() {
    document.getElementById('btn-to-address').addEventListener('click', () => navigateToStep(2));
    document.getElementById('btn-to-payment').addEventListener('click', () => { 
        if (document.getElementById('customer-details-form').checkValidity()) { 
            navigateToStep(3); 
        } else { 
            document.getElementById('customer-details-form').reportValidity(); 
            showToast('Please fill all shipping details.', 'error'); 
        } 
    });
    document.getElementById('btn-back-to-cart').addEventListener('click', () => navigateToStep(1));
    document.getElementById('btn-back-to-address').addEventListener('click', () => navigateToStep(2));
    document.getElementById('order-items-container').addEventListener('click', handleCartActions);
    document.getElementById('delivery-option-group').addEventListener('click', e => { if (e.target.closest('.option-label')) { document.querySelectorAll('#delivery-option-group .option-label').forEach(l => l.classList.remove('selected')); e.target.closest('.option-label').classList.add('selected'); updatePriceAndValidation(); } });
    document.getElementById('payment-option-group').addEventListener('click', e => { if (e.target.closest('.option-label')) { document.querySelectorAll('#payment-option-group .option-label').forEach(l => l.classList.remove('selected')); e.target.closest('.option-label').classList.add('selected'); } });
    document.getElementById('place-order-btn').addEventListener('click', placeOrder);
    document.getElementById('apply-coupon-btn').addEventListener('click', applyCoupon);
    document.getElementById('remove-coupon-btn').addEventListener('click', removeCoupon);
    document.getElementById('search-order-btn').addEventListener('click', searchOrder);
    document.getElementById('stepper').addEventListener('click', (e) => { const stepElement = e.target.closest('.step'); if (stepElement && stepElement.classList.contains('completed')) { navigateToStep(parseInt(stepElement.dataset.step)); } });
    document.getElementById('save-address-btn').addEventListener('click', handleSaveOrUpdateAddress);
    document.getElementById('saved-address-container').addEventListener('click', handleAddressManagement);
    
    // Success Popup Button Action
    document.getElementById('success-popup-btn').addEventListener('click', () => {
        document.getElementById('order-success-popup').classList.remove('active');
        window.location.reload(); // Refresh page as requested to show recent order
    });
}

function handleCartActions(event) { const target = event.target.closest('button'); if (!target) return; let cart = getCart(); const cartIndex = parseInt(target.dataset.cartIndex); const itemInCart = cart.find((_, i) => i === cartIndex); if (!itemInCart) return; if (target.classList.contains('delete-item-btn')) { cart = cart.filter((_, i) => i !== cartIndex); } else if (target.classList.contains('qty-increase')) { itemInCart.quantity++; } else if (target.classList.contains('qty-decrease')) { if (itemInCart.quantity > 1) itemInCart.quantity--; else cart = cart.filter((_, i) => i !== cartIndex); } saveCart(cart); loadOrderFromCart(); }
function navigateToStep(stepNumber) { document.querySelectorAll('.step-content').forEach(step => step.classList.remove('active')); document.getElementById(`step-${['cart', 'address', 'payment'][stepNumber - 1]}`).classList.add('active'); currentStep = stepNumber; updateProgressBar(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function updateProgressBar() { document.querySelectorAll('.step').forEach((step, index) => { step.classList.remove('active', 'completed'); if (index < currentStep - 1) step.classList.add('completed'); else if (index === currentStep - 1) step.classList.add('active'); }); document.getElementById('stepper-progress').style.width = `${((currentStep - 1) / 2) * 100}%`; }
function applyCoupon() { const code = document.getElementById('coupon-input').value.trim().toLowerCase(); if (!code) return; if (appliedCoupon) { showToast('Coupon already applied.', 'error'); return; } const foundCoupon = validCoupons.find(c => c.code.toLowerCase() === code); if (foundCoupon) { appliedCoupon = foundCoupon; showToast(`Coupon "${foundCoupon.code}" applied!`, 'success'); document.getElementById('coupon-section').classList.add('hidden'); document.getElementById('applied-coupon-code').textContent = foundCoupon.code; document.getElementById('applied-coupon-div').classList.remove('hidden'); } else { appliedCoupon = null; showToast('Invalid coupon code.', 'error'); } updatePriceAndValidation(); }
function removeCoupon() { appliedCoupon = null; showToast('Coupon removed.', 'info'); document.getElementById('coupon-input').value = ''; document.getElementById('coupon-section').classList.remove('hidden'); document.getElementById('applied-coupon-div').classList.add('hidden'); updatePriceAndValidation(); }

// --- ORDER PLACEMENT & WHATSAPP MESSAGE (UPDATED) ---
async function placeOrder(e) {
    e.preventDefault();
    const btn = e.currentTarget;
    const form = document.getElementById('customer-details-form');
    if (!form.checkValidity()) { form.reportValidity(); showToast('Please fill all shipping details.', 'error'); return; }

    btn.textContent = 'Placing...';
    btn.disabled = true;

    const customerDetails = { 
        name: document.getElementById('customer-name').value, 
        mobile: document.getElementById('customer-mobile').value, 
        address: document.getElementById('customer-address').value // Simple address
    };

    autoSaveAddress(customerDetails);

    const orderId = 'RMZ' + Math.random().toString(36).substr(2, 8).toUpperCase();
    let subtotal = 0, totalMRP = 0;
    orderItems.forEach(item => { const isPack = item.pack && item.pack.name !== 'Single Item'; const price = isPack ? Number(item.pack.price) : Number(item.displayPrice); const mrp = Number(item.originalPrice) > price ? Number(item.originalPrice) : price; subtotal += price * item.quantity; totalMRP += mrp * item.quantity; });
    const couponDiscount = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const deliveryOption = document.querySelector('input[name="delivery"]:checked').value;
    const deliveryFee = (deliveryOption === 'Ramazone' && subtotal < ramazoneConfig.freeDeliveryThreshold) ? ramazoneConfig.deliveryCharge : 0;
    const grandTotal = subtotal - couponDiscount + deliveryFee;
    
    const orderData = { 
        orderId, 
        customerDetails, 
        grandTotal, 
        paymentMethod: document.querySelector('input[name="payment"]:checked').value, 
        deliveryMethod: deliveryOption, 
        items: orderItems.map(item => ({ 
            id: item.id, 
            name: item.name, 
            quantity: item.quantity, 
            displayPrice: (item.pack && item.pack.name !== 'Single Item') ? item.pack.price : item.displayPrice, 
            originalPrice: item.originalPrice || item.displayPrice, 
            image: item.images?.[0] || '',
            variants: item.variants || {}, // Save variants
            pack: item.pack || null // Save pack info
        })), 
        priceSummary: { subtotal, totalMRP, coupon: appliedCoupon, deliveryFee, grandTotal }, 
        status: 'Confirmed', // AUTO-CONFIRM
        createdAt: firebase.database.ServerValue.TIMESTAMP 
    };
    
    try {
        // Save directly to CONFIRMED node
        await database.ref(`ramazone/orders/confirmed/${orderId}`).set(orderData);
        
        saveCart([]); // Clear cart
        localStorage.setItem('ramazoneRecentOrderId', orderId);
        
        // Show Success Popup
        document.getElementById('order-success-popup').classList.add('active');
        btn.textContent = 'Place Order';
        btn.disabled = false;

    } catch (error) { 
        console.error("Failed to place order:", error); 
        showToast('Could not place order.', 'error'); 
        btn.textContent = 'Place Order'; 
        btn.disabled = false; 
    }
}

// --- ORDER STATUS, INVOICE, and RECENT ORDER ---
async function searchOrder() { const orderId = document.getElementById('order-id-input').value.trim().toUpperCase(); const searchStatusEl = document.getElementById('search-status'); if (!orderId) { searchStatusEl.textContent = 'Please enter an Order ID.'; return; } searchStatusEl.textContent = 'Searching...'; document.getElementById('checkout-flow-container').classList.add('hidden'); document.getElementById('order-status-container').classList.remove('active'); try { const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get(); if (snapshot.exists()) { const orderData = snapshot.val(); renderSearchResult(orderData); searchStatusEl.innerHTML = `Showing results for Order ID: <span class="font-bold text-green-600">${orderId}</span>`; document.getElementById('order-status-container').classList.add('active'); } else { searchStatusEl.textContent = 'Order not found or not confirmed yet.'; } } catch (error) { searchStatusEl.textContent = 'An error occurred during search.'; } }

function renderSearchResult(orderData) { 
    const statusContainer = document.getElementById('order-status-container'); 
    const summary = orderData.priceSummary; 
    const totalSavings = (summary.totalMRP || summary.subtotal) - summary.subtotal + (summary.coupon ? Number(summary.coupon.discount) : 0); 
    const savingsHTML = totalSavings > 0 ? `<div class="bg-green-50 text-green-800 font-semibold text-center p-3 rounded-lg mt-4">🎉 You Saved ₹${totalSavings.toLocaleString('en-IN')} on this order!</div>` : ''; 
    const cust = orderData.customerDetails;
    
    const resultHTML = `
    <div class="space-y-6">
        <div class="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
            <div>
                <h3 class="text-lg font-bold mb-2">Shipping To:</h3>
                <div class="text-sm bg-gray-50 p-3 rounded-lg">
                    <p class="font-semibold">${cust.name}</p>
                    <p>${cust.address}</p>
                    <p>${cust.mobile}</p>
                </div>
            </div>
            <div>
                <h3 class="text-lg font-bold mt-4 mb-2">Items Ordered:</h3>
                <div class="space-y-3">
                    ${orderData.items.map(item => {
                        const variantDetails = getVariantDetailsString(item);
                        return `
                        <a href="product-details.html?id=${item.id}" class="flex items-center gap-4 border-b pb-3 last:border-b-0 hover:bg-gray-50 p-2 rounded transition-colors">
                            <img src="${item.image || ''}" alt="${item.name}" class="w-16 h-16 object-cover rounded-md border">
                            <div class="flex-grow">
                                <p class="font-semibold text-gray-800">${item.name}</p>
                                ${variantDetails ? `<p class="text-xs text-gray-500 bg-gray-100 inline-block px-1 rounded mt-1">${variantDetails}</p>` : ''}
                                <p class="text-sm text-gray-600 mt-1">Qty: ${item.quantity}</p>
                            </div>
                            <p class="font-semibold text-gray-900">₹${(item.displayPrice * item.quantity).toLocaleString('en-IN')}</p>
                        </a>`;
                    }).join('')}
                </div>
            </div>
            <div>
                <h3 class="text-lg font-bold mt-4 mb-2">Price Details:</h3>
                <div class="space-y-2 text-sm pt-2 border-t">
                    <div class="flex justify-between"><span>Total MRP</span><span class="line-through">₹${(summary.totalMRP || summary.subtotal).toLocaleString('en-IN')}</span></div>
                    <div class="flex justify-between text-green-600"><span>Discount</span><span>- ₹${totalSavings.toLocaleString('en-IN')}</span></div>
                    <div class="flex justify-between"><span>Delivery Fee</span><span>${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString('en-IN')}` : 'Free'}</span></div>
                    <div class="flex justify-between text-lg font-bold pt-2 border-t"><span>Total Paid</span><span>₹${summary.grandTotal.toLocaleString('en-IN')}</span></div>
                </div>
            </div>
            ${savingsHTML}
        </div>
        <div class="bg-white rounded-lg shadow p-4 sm:p-6">
            <h2 class="text-xl font-bold mb-4">Order Status</h2>
            <div id="delivery-tracker-container" class="py-4"></div>
        </div>
        <div class="text-center">
            <button id="view-invoice-btn" class="btn btn-primary invoice-btn-red !px-8 !py-3"><i class="fas fa-download"></i>Download Invoice</button>
        </div>
    </div>`; 
    statusContainer.innerHTML = resultHTML; 
    
    // Display 'Order Placed' if status is 'Confirmed' for better user experience
    const displayStatus = orderData.status === 'Confirmed' ? 'Order Placed' : orderData.status;
    renderDeliveryTracker(displayStatus, document.getElementById('delivery-tracker-container')); 
    document.getElementById('view-invoice-btn').addEventListener('click', () => downloadInvoiceDirectly(orderData)); 
}

function renderDeliveryTracker(status, container) { 
    if (status === 'Rejected') { container.innerHTML = `<div class="flex items-center p-3 bg-red-50 rounded-lg"><i class="fas fa-times-circle text-red-500 text-3xl mr-4"></i><div><h3 class="font-bold text-red-700">Order Rejected</h3></div></div>`; return; } 
    const statuses = ['Order Placed', 'Shipped', 'Out for Delivery', 'Delivered']; 
    // Map 'Confirmed' to 'Order Placed' visual step
    const mappedStatus = status === 'Confirmed' ? 'Order Placed' : status;
    const icons = ['fa-check', 'fa-truck-fast', 'fa-truck-ramp-box', 'fa-star']; 
    const currentStatusIndex = statuses.indexOf(mappedStatus); 
    let stepsHtml = statuses.map((s, index) => `<div class="tracker-step ${index <= currentStatusIndex ? 'completed' : ''}"><div class="step-icon"><i class="fas ${icons[index]}"></i></div><p class="step-label">${s.replace(' ', '\n')}</p></div>`).join(''); 
    container.innerHTML = `<div class="relative"><div class="tracker-line"><div class="tracker-progress-line" style="width: ${currentStatusIndex >= 0 ? (currentStatusIndex / (statuses.length - 1)) * 100 : 0}%;"></div></div><div class="delivery-tracker">${stepsHtml}</div></div>`; 
}

async function downloadInvoiceDirectly(orderData) { 
    const btn = document.getElementById('view-invoice-btn'); 
    if (!orderData) { showToast('No order data found.', 'error'); return; } 
    btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Downloading...`; 
    try { 
        const { orderId, customerDetails: cust, items, priceSummary: summary, createdAt } = orderData; 
        const storeDetails = { name: 'Ramazone Online Store', proprietor: 'Prince Rama', address: 'Lalunagar, Begusarai, Bihar - 851129', phone: 'WhatsApp: 7903698180', email: 'ramazone007@gmail.com', website: 'www.ramazon.in' }; 
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0); 
        let rightSideRows = 3 + (summary.coupon ? 1 : 0); 
        
        const tableHTML = `<table style="width:100%;border-collapse:collapse;font-size:.9rem;border:1px solid #999"><thead><tr style="background-color:#DC2626;color:#fff"><th style="padding:.8rem;text-align:left;border:1px solid #999">#</th><th style="padding:.8rem;text-align:left;border:1px solid #999">Product</th><th style="padding:.8rem;text-align:center;border:1px solid #999">Qty</th><th style="padding:.8rem;text-align:right;border:1px solid #999">Rate</th><th style="padding:.8rem;text-align:right;border:1px solid #999">Amount (₹)</th></tr></thead><tbody>${items.map((item, index) => { 
            const variantStr = getVariantDetailsString(item);
            return `<tr><td style="padding:.8rem;border:1px solid #999">${index + 1}</td><td style="padding:.8rem;font-weight:500;border:1px solid #999">${item.name}${variantStr ? `<br><small style="color:#666">${variantStr}</small>` : ''}</td><td style="padding:.8rem;text-align:center;border:1px solid #999">${item.quantity}</td><td style="padding:.8rem;text-align:right;border:1px solid #999">₹${Number(item.displayPrice).toFixed(2)}</td><td style="padding:.8rem;text-align:right;font-weight:500;border:1px solid #999">₹${(item.displayPrice * item.quantity).toLocaleString("en-IN")}</td></tr>`; }).join("")}</tbody><tfoot><tr><td rowspan="${rightSideRows}" colspan="2" style="vertical-align:top;border:1px solid #999;padding:.6rem"><p style="margin:0;font-weight:bold">Total Amounts (In Words):</p><p style="margin:4px 0">${numberToWords(summary.grandTotal)}</p><p style="margin:12px 0 0;font-weight:bold">Total Quantity: ${totalQuantity}</p></td><td colspan="2" style="text-align:right;border:1px solid #999;padding:.6rem">Sub Total:</td><td style="text-align:right;border:1px solid #999;padding:.6rem">₹${summary.subtotal.toLocaleString("en-IN")}</td></tr>${summary.coupon ? `<tr><td colspan="2" style="text-align:right;border:1px solid #999;padding:.6rem">Coupon Discount:</td><td style="text-align:right;border:1px solid #999;padding:.6rem">- ₹${Number(summary.coupon.discount).toLocaleString("en-IN")}</td></tr>` : ""}<tr><td colspan="2" style="text-align:right;border:1px solid #999;padding:.6rem">Delivery Fee:</td><td style="text-align:right;border:1px solid #999;padding:.6rem">${summary.deliveryFee > 0 ? `₹${summary.deliveryFee.toLocaleString("en-IN")}` : "Free"}</td></tr><tr><td colspan="2" style="background-color:#DC2626;color:#fff;font-weight:bold;border:1px solid #999;padding:.8rem">Total Payable:</td><td style="background-color:#DC2626;color:#fff;font-weight:bold;border:1px solid #999;padding:.8rem">₹${summary.grandTotal.toLocaleString("en-IN")}</td></tr></tfoot></table>`; 
        
        const invoiceHTML = `<div style="width:210mm;min-height:297mm;padding:10mm;font-family:'Segoe UI',sans-serif;color:#333;font-size:11pt;display:flex;flex-direction:column;background:white;border:1px solid #333"><header style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1.5rem;border-bottom:4px solid #DC2626"><div><h1 style="font-size:2.5rem;font-weight:bold;color:#DC2626;margin:0">INVOICE</h1><p style="margin:8px 0 0;font-size:1rem;color:#555"><strong>Invoice No:</strong> ${orderId}</p><p style="margin:4px 0 0;font-size:1rem;color:#555"><strong>Invoice Date:</strong> ${new Date(createdAt).toLocaleDateString()}</p></div><div style="text-align:right"><img src="https://i.ibb.co/2RySQ5K/20240813-084352.png" alt="Ramazone Logo" style="height:65px;margin-bottom:8px;margin-left:auto" crossOrigin="anonymous"><p style="margin:0;font-weight:bold;font-size:1.1rem">${storeDetails.name}</p><p style="margin:4px 0 0;font-size:.9rem;color:#555">Proprietor: ${storeDetails.proprietor}</p></div></header><section style="margin-top:2rem;display:flex;justify-content:space-between;font-size:.9rem;line-height:1.5"><div><p style="font-weight:bold;color:#555">STORE DETAILS:</p><p style="margin:4px 0 0">${storeDetails.address}</p><p style="margin:4px 0 0">${storeDetails.phone}</p><p style="margin:4px 0 0">${storeDetails.email}</p></div><div style="text-align:right"><p style="font-weight:bold;color:#555">BILL TO:</p><p style="margin:4px 0 0">${cust.name}</p><p style="margin:4px 0 0;max-width:250px">${cust.address}</p><p style="margin:4px 0 0">${cust.mobile}</p></div></section><section style="margin-top:2.5rem;flex-grow:1">${tableHTML}</section><footer style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #eee;padding-top:1rem"><div style="font-size:.8rem;color:#888"><p style="margin:0">Thank you for your order!</p><p style="margin:4px 0 0;font-weight:bold">${storeDetails.website}</p></div><div style="text-align:center"><p style="font-weight:bold;font-size:1.2rem;letter-spacing:1px;font-family:'Segoe UI',sans-serif;margin:0 0 4px 0;color:#333">Ramazone</p><p style="margin:0;border-top:1px solid #555;padding-top:4px;font-size:.8rem;font-weight:bold">Authorized Signatory</p></div></footer></div>`; 
        
        const el = document.createElement('div'); el.style.position = 'absolute'; el.style.left = '-9999px'; document.body.appendChild(el); el.innerHTML = invoiceHTML; const canvas = await html2canvas(el.querySelector('div'), { scale: 3, useCORS: true }); const link = document.createElement('a'); link.download = `Ramazone-Invoice-${orderId}.png`; link.href = canvas.toDataURL('image/png'); link.click(); document.body.removeChild(el); 
    } catch (error) { console.error("Invoice download failed:", error); showToast('Invoice creation failed.', 'error'); } finally { btn.disabled = false; btn.innerHTML = `<i class="fas fa-download mr-2"></i>Download Invoice`; } 
}

async function checkAndDisplayRecentOrder() { const orderId = localStorage.getItem('ramazoneRecentOrderId'); if (!orderId) return; const snapshot = await database.ref(`ramazone/orders/confirmed/${orderId}`).get(); if (snapshot.exists()) { const orderData = snapshot.val(); const container = document.getElementById('recent-order-status-container'); container.innerHTML = `<div class="bg-white rounded-lg shadow p-4 sm:p-6"><h2 class="text-xl font-bold mb-4 text-gray-800">Your Recent Order Status <span class="font-mono text-base text-indigo-600">(${orderId})</span></h2><div id="recent-delivery-tracker"></div><div class="text-center mt-4"><button onclick="document.getElementById('order-id-input').value='${orderId}'; document.getElementById('search-order-btn').click();" class="text-indigo-600 font-semibold text-sm">View Full Details</button></div></div>`; renderDeliveryTracker('Order Placed', document.getElementById('recent-delivery-tracker')); } }
function numberToWords(num) { const a=["","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"],b=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];if((num=num.toString()).length>9)return"overflow";const n=("000000000"+num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);if(!n)return;let str="";str+=n[1]!=0?(a[Number(n[1])]||b[n[1][0]]+" "+a[n[1][1]])+" crore ":"";str+=n[2]!=0?(a[Number(n[2])]||b[n[2][0]]+" "+a[n[2][1]])+" lakh ":"";str+=n[3]!=0?(a[Number(n[3])]||b[n[3][0]]+" "+a[n[3][1]])+" thousand ":"";str+=n[4]!=0?(a[Number(n[4])]||b[n[4][0]]+" "+a[n[4][1]])+" hundred ":"";str+=n[5]!=0?(str!=""?"and ":"")+(a[Number(n[5])]||b[n[5][0]]+" "+a[n[5][1]]):"";return str.replace(/\s+/g," ").trim().split(" ").map(w=>w.charAt(0).toUpperCase()+w.substr(1)).join(" ")+" Rupees Only"}
function showToast(message, type = "info") { const toast = document.getElementById("toast-notification"); if (!toast) return; toast.textContent = message; toast.style.transition = 'opacity 0.3s, visibility 0.3s'; toast.style.opacity = '1'; toast.style.visibility = 'visible'; if (type === 'success') toast.style.backgroundColor = '#16a34a'; else if (type === 'error') toast.style.backgroundColor = '#ef4444'; else toast.style.backgroundColor = '#333'; setTimeout(() => { toast.style.opacity = '0'; toast.style.visibility = 'hidden'; }, 3000); }
