// --- GLOBAL STATE for Order Page ---
let allProductsCache = [];
let validCoupons = [];
let orderItems = []; // This will now be populated from the cart
let appliedCoupon = null;
let deliveryFee = 0;
let ramazoneDeliveryCharge = 10;
let database;

// --- NEW CART HELPER FUNCTIONS ---
/**
 * Retrieves the cart from localStorage.
 * @returns {Array} The cart array, or an empty array if not found.
 */
function getCart() {
    try {
        const cart = localStorage.getItem('ramazoneCart');
        return cart ? JSON.parse(cart) : [];
    } catch (e) {
        console.error("Could not parse cart from localStorage", e);
        return [];
    }
}

/**
 * Saves the cart to localStorage.
 * @param {Array} cart The cart array to save.
 */
function saveCart(cart) {
    // We only need to store id and quantity
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

/**
 * CORRECTED FUNCTION
 * Uses the detailed version of fetchAllData to ensure all products are cached.
 */
async function fetchAllData(db) {
    const dbRef = db.ref('ramazone');
    const snapshot = await dbRef.get();
    if (snapshot.exists()) {
        const data = snapshot.val();
        const config = data.config || {};
        ramazoneDeliveryCharge = config.deliveryCharge || 10;
        
        // This is the complete logic from your product-details page
        const homepageData = data.homepage || {};
        const productsObject = data.products || {};
        const mainProducts = Object.values(productsObject);
        
        const festiveProductIds = homepageData.festiveCollection?.productIds || [];
        const jfyMainProductId = homepageData.justForYou?.topDeals?.mainProductId;
        const jfySubProductIds = homepageData.justForYou?.topDeals?.subProductIds || [];
        
        const allReferencedIds = new Set([...festiveProductIds, jfyMainProductId, ...jfySubProductIds].filter(Boolean));
        
        const referencedProducts = mainProducts.filter(p => p && allReferencedIds.has(p.id));
        const combinedProducts = [...mainProducts, ...referencedProducts];
        
        // This ensures the cache is complete and de-duplicated
        allProductsCache = combinedProducts.filter((p, index, self) => p && p.id && index === self.findIndex((t) => t.id === p.id));
        
        validCoupons = (homepageData.coupons || []).filter(c => c.status === 'active');
        document.getElementById('ramazone-delivery-label').textContent = `Ramazone Delivery (+₹${ramazoneDeliveryCharge})`;
    }
}


/**
 * CORRECTED FUNCTION
 * This is the new core function to load items from localStorage cart.
 * It replaces the old `loadInitialOrder` function.
 */
function loadOrderFromCart() {
    const cart = getCart();

    if (cart.length === 0) {
        // Cart is empty, show empty message
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
                selectedVariants: {} // Variants can be added later if stored in cart
            });
        } else {
            console.warn(`Product with ID ${cartItem.id} found in cart but not in product cache. It will be ignored.`);
        }
    });

    // Check again if, after filtering, the orderItems array is empty
    if(orderItems.length === 0) {
        // This can happen if ALL products in cart were invalid.
        // Clear the bad cart from localStorage to prevent loops and show empty cart view.
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
                // Remove the item if quantity drops to 0
                 orderItems.splice(itemIndex, 1);
            }
        }
        
        // Update the localStorage cart as well
        saveCart(orderItems);
        
        // If all items are removed, refresh the page view
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
    
    const sellerPhoneNumber = '917903698180'; // Your WhatsApp Number

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
