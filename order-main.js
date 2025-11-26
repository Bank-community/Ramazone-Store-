// --- GLOBAL CONFIG ---
let allProductsCache = [], validCoupons = [], orderItems = [];
let appliedCoupon = null, database, currentStep = 1;
let ramazoneConfig = { deliveryCharge: 15, freeDeliveryThreshold: 500, minOrderForDelivery: 0 };
let editingAddressIndex = null;
let helpRequestListener = null;

const firebaseConfig = {
    apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
    authDomain: "re-store-8e5b3.firebaseapp.com",
    databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
};

// --- HELPERS ---
const getCart = () => { try { return JSON.parse(localStorage.getItem('ramazoneCart')) || []; } catch (e) { return []; } };
const saveCart = (cart) => localStorage.setItem('ramazoneCart', JSON.stringify(cart));
const getSavedAddresses = () => { try { return JSON.parse(localStorage.getItem('ramazoneSavedAddresses')) || []; } catch (e) { return []; } };
const saveAddresses = (addresses) => localStorage.setItem('ramazoneSavedAddresses', JSON.stringify(addresses));
const showToast = (msg, type = "info") => { 
    const t = document.getElementById("toast-notification"); 
    t.innerText = msg; t.style.background = type === 'error' ? '#ef4444' : '#333'; 
    t.style.opacity = 1; t.style.visibility = 'visible'; 
    setTimeout(() => { t.style.opacity = 0; t.style.visibility = 'hidden'; }, 3000); 
};

// --- NUMBER TO WORDS (INDIAN SYSTEM) ---
function numberToWords(num) {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if ((num = num.toString()).length > 9) return 'Overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return; 
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'And ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str + 'Rupees Only';
}

// --- SMART IMAGE FINDER ---
function getProductImage(item) {
    if (item.image) return item.image; 
    if (item.images && item.images.length > 0) return item.images[0]; 
    if (item.imageUrl) return item.imageUrl; 
    return 'https://placehold.co/150?text=No+Image'; 
}

// --- WISHLIST HELPERS ---
const getWishlist = () => { try { return JSON.parse(localStorage.getItem('ramazoneWishlist')) || []; } catch { return []; } };
const saveWishlist = (list) => localStorage.setItem('ramazoneWishlist', JSON.stringify(list));

// --- ROBUST COPY FUNCTION ---
const copyToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showToast("Code Copied!", "success"))
            .catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
};

const fallbackCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed"; 
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast("Code Copied!", "success");
    } catch (err) {
        showToast("Unable to copy", "error");
    }
    document.body.removeChild(textArea);
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    
    await fetchConfig();
    
    const cart = getCart();
    if (cart.length > 0) {
        orderItems = processCart(cart);
        renderOrderItems();
        updatePricing();
        document.getElementById('price-summary-box').classList.remove('hidden');
        document.getElementById('btn-to-address').classList.remove('hidden');
        document.getElementById('add-more-products-btn').classList.remove('hidden'); 
        renderSavedAddresses();
    } else {
        document.getElementById('empty-cart-message').classList.remove('hidden');
    }
    document.getElementById('loading-indicator').classList.add('hidden');

    setupEvents();
    monitorHelpRequestStatus(); 
});

async function fetchConfig() {
    const s = await database.ref('ramazone').get();
    const d = s.val() || {};
    ramazoneConfig = { ...ramazoneConfig, ...(d.config || {}) };
    let products = d.products || {};
    if (!Array.isArray(products)) {
        allProductsCache = Object.values(products);
    } else {
        allProductsCache = products;
    }
    
    validCoupons = (d.homepage?.coupons || []).filter(c => c.status === 'active');
    
    const delInfo = `Orders above ₹${ramazoneConfig.freeDeliveryThreshold} free.`;
    const el = document.getElementById('ramazone-delivery-info');
    if(el) el.textContent = delInfo;
}

function processCart(cart) {
    return cart.map((item, idx) => {
        const prod = allProductsCache.find(p => p.id === item.id);
        return prod ? { ...prod, ...item, cartIndex: idx } : null;
    }).filter(Boolean);
}

// --- RENDER CART ITEMS ---
function renderOrderItems() {
    const container = document.getElementById('order-items-container');
    container.innerHTML = orderItems.map(item => {
        const isPack = item.pack && item.pack.name !== 'Single Item';
        const price = isPack ? item.pack.price : item.displayPrice;
        const originalPrice = item.originalPrice || (price * 1.2); 
        const discount = Math.round(((originalPrice - price) / originalPrice) * 100);
        const imgUrl = getProductImage(item); 
        
        const variants = [];
        if(item.variants) Object.entries(item.variants).forEach(([k,v]) => variants.push(`${k}: ${v}`));
        if(isPack) variants.push(item.pack.name);
        
        return `
        <div class="order-item-card">
            <button class="delete-item-btn" onclick="handleCartAction('delete', ${item.cartIndex})">
                <i class="fas fa-trash-alt"></i>
            </button>

            <a href="product-details.html?id=${item.id}" class="product-img-container">
                <img src="${imgUrl}" alt="${item.name}" class="product-img">
            </a>

            <div class="flex-grow flex flex-col justify-between py-1">
                <div>
                    <a href="product-details.html?id=${item.id}" class="font-semibold text-gray-800 text-sm leading-tight line-clamp-2 mb-1 block hover:text-indigo-600 transition-colors">
                        ${item.name}
                    </a>
                    <div class="flex items-center gap-2 text-xs mb-1">
                         <span class="bg-green-100 text-green-700 px-1.5 rounded font-bold text-[10px]">⭐ 4.5</span>
                         <span class="text-gray-400 line-through">₹${Number(originalPrice).toLocaleString()}</span>
                         <span class="text-green-600 font-bold">${discount}% OFF</span>
                    </div>
                    ${variants.length ? `<p class="text-xs text-gray-500 bg-gray-50 inline-block px-1 rounded border">${variants.join(' | ')}</p>` : ''}
                </div>
                
                <div class="flex items-end justify-between mt-2">
                    <span class="font-bold text-lg text-gray-900">₹${Number(price).toLocaleString('en-IN')}</span>
                    
                    <div class="quantity-selector-order">
                        <button onclick="handleCartAction('dec', ${item.cartIndex})">-</button>
                        <span>${item.quantity}</span>
                        <button onclick="handleCartAction('inc', ${item.cartIndex})">+</button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function handleCartAction(action, idx) {
    let cart = getCart();
    if (action === 'delete') cart = cart.filter((_, i) => i !== idx);
    else if (action === 'inc') cart[idx].quantity++;
    else if (action === 'dec') {
        if (cart[idx].quantity > 1) cart[idx].quantity--;
        else cart = cart.filter((_, i) => i !== idx);
    }
    saveCart(cart);
    
    if (cart.length > 0) {
        orderItems = processCart(cart);
        renderOrderItems(); 
        updatePricing(); 
    } else {
        location.reload();
    }
}

function updatePricing() {
    let sub = 0, totalMRP = 0;
    orderItems.forEach(i => {
        const price = i.pack ? Number(i.pack.price) : Number(i.displayPrice);
        const mrp = Math.max(Number(i.originalPrice || price * 1.2), price);
        sub += price * i.quantity;
        totalMRP += mrp * i.quantity;
    });

    const step1HTML = `
        <div class="flex justify-between text-gray-500"><span>MRP</span><span class="line-through">₹${totalMRP}</span></div>
        <div class="flex justify-between text-green-600"><span>Discount</span><span>-₹${totalMRP - sub}</span></div>
        <div class="flex justify-between font-bold text-gray-800 border-t pt-2 mt-2"><span>Subtotal</span><span>₹${sub}</span></div>
    `;
    document.getElementById('price-summary-container-step1').innerHTML = step1HTML;

    const delOpt = document.querySelector('input[name="delivery"]:checked').value;
    const delFee = (delOpt === 'Ramazone' && sub < ramazoneConfig.freeDeliveryThreshold) ? ramazoneConfig.deliveryCharge : 0;
    const coupDisc = appliedCoupon ? Number(appliedCoupon.discount) : 0;
    const grand = sub - coupDisc + delFee;

    const step3HTML = `
        <div class="flex justify-between text-gray-500"><span>Subtotal</span><span>₹${sub}</span></div>
        ${coupDisc ? `<div class="flex justify-between text-green-600"><span>Coupon</span><span>-₹${coupDisc}</span></div>` : ''}
        <div class="flex justify-between text-gray-500"><span>Delivery</span><span>${delFee ? '₹'+delFee : 'Free'}</span></div>
        <div class="flex justify-between font-bold text-xl text-gray-900 border-t pt-2 mt-2"><span>Total</span><span>₹${grand}</span></div>
    `;
    document.getElementById('price-summary-container-step3').innerHTML = step3HTML;
    
    const btn = document.getElementById('place-order-btn');
    const notice = document.getElementById('delivery-minimum-notice');
    if (delOpt === 'Ramazone' && ramazoneConfig.minOrderForDelivery > sub) {
        btn.disabled = true; btn.style.opacity = 0.5;
        notice.classList.remove('hidden');
        notice.innerText = `Add items worth ₹${ramazoneConfig.minOrderForDelivery - sub} for delivery.`;
    } else {
        btn.disabled = false; btn.style.opacity = 1;
        notice.classList.add('hidden');
    }
}

// --- COUPONS POPUP LOGIC ---
function openCouponsPopup() {
    document.getElementById('coupons-popup-overlay').classList.add('active');
    const container = document.getElementById('coupons-list-container');
    
    if (validCoupons.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-gray-500"><i class="fas fa-ticket-alt text-4xl mb-2 text-gray-300"></i><p>No coupons available right now.</p></div>`;
        return;
    }

    container.innerHTML = validCoupons.map(c => `
        <div class="coupon-card">
            <div>
                <div class="coupon-code">${c.code}</div>
                <div class="coupon-desc">${c.description || 'Save ' + c.discount}</div>
            </div>
            <div class="flex gap-2">
                <button onclick="copyToClipboard('${c.code}')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-copy"></i></button>
                <button onclick="applyCouponFromList('${c.code}')" class="bg-indigo-50 text-indigo-600 text-xs font-bold px-3 py-1 rounded hover:bg-indigo-100">APPLY</button>
            </div>
        </div>
    `).join('');
}

function closeCouponsPopup(e) {
    if (e === true || e.target.classList.contains('popup-overlay')) {
        document.getElementById('coupons-popup-overlay').classList.remove('active');
    }
}

function applyCouponFromList(code) {
    closeCouponsPopup(true);
    document.getElementById('coupon-input').value = code;
    scrollToCoupons(); // Navigate to step 3
    document.getElementById('apply-coupon-btn').click(); // Trigger existing logic
}

// --- WISHLIST POPUP LOGIC (NEW) ---
function openWishlistPopup() {
    document.getElementById('wishlist-popup-overlay').classList.add('active');
    renderWishlistItems();
}

function closeWishlistPopup(e) {
    if (e === true || e.target.classList.contains('popup-overlay')) {
        document.getElementById('wishlist-popup-overlay').classList.remove('active');
    }
}

function renderWishlistItems() {
    const container = document.getElementById('wishlist-list-container');
    const wishlistIds = getWishlist();

    if (wishlistIds.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i class="fas fa-heart-broken text-2xl text-gray-400"></i>
                </div>
                <p class="text-gray-500 font-medium">Your wishlist is empty</p>
                <button onclick="location.href='products.html'" class="mt-4 text-indigo-600 font-bold text-sm">Start Shopping</button>
            </div>`;
        return;
    }

    // Match IDs with Products from Cache
    const wishlistProducts = wishlistIds.map(id => allProductsCache.find(p => p.id === id)).filter(Boolean);

    if (wishlistProducts.length === 0 && wishlistIds.length > 0) {
        // IDs exist but products not found (maybe deleted)
        container.innerHTML = '<p class="text-center text-gray-500 py-4">Products unavailable.</p>';
        return;
    }

    container.innerHTML = wishlistProducts.map(item => {
        const img = getProductImage(item);
        const price = Number(item.displayPrice).toLocaleString('en-IN');
        return `
        <div class="flex gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100 items-center">
            <a href="product-details.html?id=${item.id}" class="w-16 h-16 flex-shrink-0 bg-white border rounded p-1">
                <img src="${img}" class="w-full h-full object-contain">
            </a>
            <div class="flex-grow min-w-0">
                <p class="font-semibold text-gray-800 text-sm truncate">${item.name}</p>
                <p class="font-bold text-gray-900 mt-1">₹${price}</p>
            </div>
            <div class="flex flex-col gap-2">
                <button onclick="moveToCartFromWishlist('${item.id}')" class="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded shadow-sm hover:bg-indigo-700">
                    Add to Cart
                </button>
                <button onclick="removeFromWishlist('${item.id}')" class="text-red-500 text-xs font-bold hover:text-red-700">
                    Remove
                </button>
            </div>
        </div>`;
    }).join('');
}

function removeFromWishlist(id) {
    let list = getWishlist();
    list = list.filter(itemId => itemId !== id);
    saveWishlist(list);
    renderWishlistItems();
    showToast('Removed from Wishlist');
}

function moveToCartFromWishlist(id) {
    // 1. Add to Cart
    let cart = getCart();
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.quantity += 1;
        showToast('Quantity updated in Cart', 'success');
    } else {
        cart.push({ id: id, quantity: 1, variants: {} });
        showToast('Added to Cart', 'success');
    }
    saveCart(cart);

    // 2. Remove from Wishlist
    removeFromWishlist(id);

    // 3. Refresh UI if Cart is visible
    if(orderItems.length > 0 || cart.length === 1) {
        setTimeout(() => location.reload(), 500); // Reload to show new cart state
    }
}

// --- TRACK ORDER ---
function openOrderPopup() {
    document.getElementById('order-popup-overlay').classList.add('active');
    const recent = localStorage.getItem('ramazoneRecentOrderId');
    if(recent) {
        document.getElementById('popup-search-input').value = recent;
        searchOrders(); 
    }
}
function closeOrderPopup(e) { 
    if(e === true || e.target.classList.contains('popup-overlay')) 
        document.getElementById('order-popup-overlay').classList.remove('active'); 
}

async function searchOrders() {
    const input = document.getElementById('popup-search-input').value.trim();
    const resDiv = document.getElementById('popup-search-results');
    if(!input) return showToast('Please enter Order ID or Mobile', 'error');

    resDiv.innerHTML = '<p class="text-center text-gray-500">Searching...</p>';
    resDiv.classList.remove('hidden');

    try {
        let foundOrders = [];
        const idSnap = await database.ref(`ramazone/orders/confirmed/${input.toUpperCase()}`).get();
        if(idSnap.exists()) foundOrders.push(idSnap.val());
        else {
            const listSnap = await database.ref('ramazone/orders/confirmed').limitToLast(50).get();
            if(listSnap.exists()) {
                const all = listSnap.val();
                Object.values(all).forEach(o => {
                    if(o.customerDetails?.mobile === input) foundOrders.push(o);
                });
            }
        }

        if(foundOrders.length === 0) {
            resDiv.innerHTML = '<p class="text-center text-red-500">No orders found.</p>';
            return;
        }

        resDiv.innerHTML = foundOrders.map(o => {
            const date = new Date(o.createdAt).toLocaleDateString();
            const statusColor = o.status === 'Rejected' ? 'text-red-600' : 'text-green-600';
            const displayStatus = o.status === 'Confirmed' ? 'Order Placed' : o.status;
            const totalAmt = o.priceSummary?.grandTotal || o.grandTotal || 0;
            
            return `
            <div class="bg-gray-50 p-3 rounded-lg border">
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center gap-2 bg-white border px-2 py-1 rounded">
                        <span class="font-bold text-sm">#${o.orderId}</span>
                        <img src="https://www.svgrepo.com/show/522803/copy.svg" class="copy-btn-icon" onclick="copyToClipboard('${o.orderId}')">
                    </div>
                    <span class="text-xs text-gray-500">${date}</span>
                </div>
                <div class="flex gap-2 overflow-x-auto mb-2">
                    ${(o.items || []).map(i => {
                        const img = getProductImage(i); 
                        return `<img src="${img}" class="w-10 h-10 rounded border object-contain bg-white">`
                    }).join('')}
                </div>
                <div class="flex justify-between items-center mt-2">
                    <div>
                        <span class="font-bold text-sm block">₹${Number(totalAmt).toLocaleString('en-IN')}</span>
                        <span class="text-xs font-bold ${statusColor}">${displayStatus}</span>
                    </div>
                    <button onclick='openOrderDetails(${JSON.stringify(o).replace(/'/g, "&apos;")})' class="text-indigo-600 text-xs font-bold border border-indigo-200 bg-white px-3 py-1.5 rounded-full hover:bg-indigo-50">
                        View Details
                    </button>
                </div>
            </div>`;
        }).join('');

    } catch(e) {
        console.error(e);
        resDiv.innerHTML = '<p class="text-center text-red-500">Error fetching orders.</p>';
    }
}

document.getElementById('popup-search-btn').addEventListener('click', searchOrders);

// --- ORDER DETAILS ---
function openOrderDetails(order) {
    const modal = document.getElementById('order-details-overlay');
    const trackCont = document.getElementById('details-tracker-container');
    const listCont = document.getElementById('details-products-list');
    const priceCont = document.getElementById('details-pricing');
    
    document.getElementById('details-order-id').innerText = `#${order.orderId}`;
    
    const status = order.status === 'Confirmed' ? 'Order Placed' : order.status;
    renderDeliveryTracker(status, trackCont);

    listCont.innerHTML = (order.items || []).map(i => {
        const img = getProductImage(i); 
        return `
        <div class="flex gap-3 border-b pb-2 last:border-0">
            <img src="${img}" class="w-14 h-14 object-contain rounded border bg-white">
            <div class="flex-grow">
                <p class="text-sm font-semibold text-gray-800 line-clamp-2">${i.name}</p>
                <p class="text-xs text-gray-500 mt-1">Qty: ${i.quantity} | ₹${i.displayPrice || i.price}</p>
            </div>
            <div class="text-sm font-bold">₹${(i.displayPrice || i.price) * i.quantity}</div>
        </div>`;
    }).join('');

    const s = order.priceSummary || {};
    priceCont.innerHTML = `
        <div class="flex justify-between"><span>Subtotal</span><span>₹${s.subtotal}</span></div>
        <div class="flex justify-between"><span>Delivery</span><span>${s.deliveryFee ? '₹'+s.deliveryFee : 'Free'}</span></div>
        ${s.coupon ? `<div class="flex justify-between text-green-600"><span>Coupon</span><span>-₹${s.coupon.discount}</span></div>` : ''}
        <div class="flex justify-between font-bold border-t pt-2 mt-1 text-gray-900"><span>Total</span><span>₹${s.grandTotal}</span></div>
    `;

    const invBtn = document.getElementById('details-invoice-btn');
    invBtn.onclick = () => downloadInvoiceAsImage(order);

    modal.classList.add('active');
}

function closeOrderDetails(e) {
    if(e === true || e.target.classList.contains('popup-overlay')) 
        document.getElementById('order-details-overlay').classList.remove('active');
}

function renderDeliveryTracker(status, container) { 
    if (status === 'Rejected') { 
        container.innerHTML = `<div class="bg-red-50 p-3 rounded text-red-600 font-bold text-center">Order Rejected</div>`; 
        return; 
    } 
    const statuses = ['Order Placed', 'Shipped', 'Out for Delivery', 'Delivered']; 
    const idx = statuses.indexOf(status); 
    
    container.innerHTML = `
    <div class="relative">
        <div class="absolute top-[12px] left-[12%] right-[12%] h-[3px] bg-gray-200 z-0 rounded"></div>
        <div class="absolute top-[12px] left-[12%] h-[3px] bg-green-500 z-0 rounded transition-all duration-500" style="width:${idx >= 0 ? (idx/3)*76 : 0}%"></div>
        
        <div class="flex justify-between relative z-10">
            ${statuses.map((s, i) => `
                <div class="flex flex-col items-center w-1/4">
                    <div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] mb-1 transition-colors ${i <= idx ? 'bg-green-500 text-white ring-2 ring-green-100' : 'bg-gray-200 text-gray-400'}">
                        <i class="fas ${i==0?'fa-check':i==1?'fa-shipping-fast':i==2?'fa-truck': 'fa-star'}"></i>
                    </div>
                    <div class="text-[10px] text-center leading-tight ${i <= idx ? 'text-green-700 font-bold' : 'text-gray-400'}">${s.replace(' ','<br>')}</div>
                </div>
            `).join('')}
        </div>
    </div>
    `;
}

// --- INVOICE GENERATOR (UPDATED A4) ---
async function downloadInvoiceAsImage(order) {
    const btn = document.getElementById('details-invoice-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    const captureArea = document.getElementById('invoice-capture-area');
    const s = order.priceSummary;

    // Calculate Total Quantity
    let totalQty = 0;
    order.items.forEach(item => totalQty += item.quantity);

    // Amount in Words
    const totalInWords = numberToWords(Math.round(s.grandTotal));
    
    // Generate Table Rows
    const itemsHTML = order.items.map((item, idx) => {
        const img = getProductImage(item);
        const price = item.displayPrice || item.price;
        const total = price * item.quantity;
        return `
        <tr style="border-bottom: 1px solid #d1d5db; font-size: 14px;">
            <td style="padding: 10px; border-right: 1px solid #d1d5db; text-align: center; color: #374151;">${idx + 1}</td>
            <td style="padding: 10px; border-right: 1px solid #d1d5db; color: #374151;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${img}" style="width: 40px; height: 40px; object-fit: contain; border: 1px solid #eee; border-radius: 4px; background:white;" crossorigin="anonymous">
                    <span>${item.name}</span>
                </div>
            </td>
            <td style="padding: 10px; border-right: 1px solid #d1d5db; text-align: center; color: #374151;">${item.quantity}</td>
            <td style="padding: 10px; border-right: 1px solid #d1d5db; text-align: right; color: #374151;">₹${Number(price).toFixed(2)}</td>
            <td style="padding: 10px; text-align: right; font-weight: 500; color: #111827;">₹${Number(total).toLocaleString('en-IN')}</td>
        </tr>`;
    }).join('');

    // Fill Empty Rows
    let emptyRows = '';
    const minRows = 8;
    if(order.items.length < minRows) {
        for(let i = 0; i < (minRows - order.items.length); i++) {
            emptyRows += `
            <tr style="border-bottom: 1px solid #d1d5db; height: 50px;">
                <td style="border-right: 1px solid #d1d5db;"></td>
                <td style="border-right: 1px solid #d1d5db;"></td>
                <td style="border-right: 1px solid #d1d5db;"></td>
                <td style="border-right: 1px solid #d1d5db;"></td>
                <td></td>
            </tr>`;
        }
    }

    const currentDate = new Date(order.createdAt).toLocaleDateString();

    captureArea.innerHTML = `
        <div style="width: 794px; min-height: 1123px; background: white; padding: 40px; font-family: 'Segoe UI', sans-serif; box-sizing: border-box; position: relative; color: #333;">
            
            <!-- HEADER -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 30px; align-items: flex-start;">
                <div>
                    <h1 style="margin: 0; color: #D32F2F; font-size: 38px; font-weight: 800; letter-spacing: 1px;">INVOICE</h1>
                    <div style="margin-top: 5px; font-size: 14px; color: #555;">
                        <p style="margin: 2px 0;">Invoice No: <strong>${order.orderId}</strong></p>
                        <p style="margin: 2px 0;">Invoice Date: ${currentDate}</p>
                    </div>
                </div>
                <div style="text-align: right;">
                    <img src="https://i.ibb.co/2RySQ5K/20240813-084352.png" style="height: 60px; display: block; margin-left: auto; margin-bottom: 5px;" crossorigin="anonymous">
                    <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #111827;">Ramazone Online Store</h2>
                    <p style="margin: 2px 0; font-size: 13px; color: #666;">Proprietor: Prince Rama</p>
                </div>
            </div>

            <!-- RED SEPARATOR -->
            <div style="height: 4px; background: #D32F2F; margin-bottom: 30px;"></div>

            <!-- ADDRESS SECTION -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
                <div style="width: 48%;">
                    <h4 style="margin: 0 0 10px; font-size: 12px; font-weight: 700; color: #374151; text-transform: uppercase;">Store Details:</h4>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4B5563;">
                        Lalunagar, Begusarai, Bihar - 851129<br>
                        WhatsApp: 7903698180<br>
                        ramazone007@gmail.com
                    </p>
                </div>
                <div style="width: 48%; text-align: right;">
                    <h4 style="margin: 0 0 10px; font-size: 12px; font-weight: 700; color: #374151; text-transform: uppercase;">Bill To:</h4>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #111827; font-weight: 600;">${order.customerDetails.name}</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4B5563;">${order.customerDetails.address}</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #4B5563;">${order.customerDetails.mobile}</p>
                </div>
            </div>

            <!-- TABLE -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #d1d5db;">
                <thead>
                    <tr style="background-color: #D32F2F; color: white;">
                        <th style="padding: 12px; text-align: center; font-size: 14px; width: 50px; border-right: 1px solid #ef4444;">#</th>
                        <th style="padding: 12px; text-align: left; font-size: 14px; border-right: 1px solid #ef4444;">Product</th>
                        <th style="padding: 12px; text-align: center; font-size: 14px; width: 60px; border-right: 1px solid #ef4444;">Qty</th>
                        <th style="padding: 12px; text-align: right; font-size: 14px; width: 100px; border-right: 1px solid #ef4444;">Rate</th>
                        <th style="padding: 12px; text-align: right; font-size: 14px; width: 120px;">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHTML}
                    ${emptyRows}
                </tbody>
            </table>

            <!-- FOOTER CALCULATION -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px;">
                <!-- Left: Words & Quantity -->
                <div style="width: 55%;">
                    <div style="margin-bottom: 15px;">
                        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #374151;">Total Amounts (In Words):</p>
                        <p style="margin: 0; font-size: 13px; color: #4B5563; line-height: 1.4;">${totalInWords}</p>
                    </div>
                    <p style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">Total Quantity: ${totalQty}</p>
                </div>

                <!-- Right: Totals -->
                <div style="width: 40%;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #374151;">
                        <span>Sub Total:</span>
                        <span>₹${Number(s.subtotal).toLocaleString('en-IN')}</span>
                    </div>
                    ${s.coupon ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #16a34a;">
                        <span>Discount:</span>
                        <span>-₹${s.coupon.discount}</span>
                    </div>` : ''}
                    <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px; color: #374151;">
                        <span>Delivery Fee:</span>
                        <span>${s.deliveryFee ? '₹' + s.deliveryFee : 'Free'}</span>
                    </div>
                    
                    <!-- TOTAL PAYABLE BLOCK -->
                    <div style="background: #D32F2F; color: white; padding: 10px; display: flex; justify-content: space-between; font-weight: 700; font-size: 16px;">
                        <span>Total Payable:</span>
                        <span>₹${Number(s.grandTotal).toLocaleString('en-IN')}</span>
                    </div>
                </div>
            </div>

            <!-- FOOTER SIGNATORY -->
            <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #eee; padding-top: 20px;">
                <div>
                    <p style="margin: 0; color: #6B7280; font-size: 12px;">Thank you for your order!</p>
                    <p style="margin: 4px 0 0; color: #D32F2F; font-weight: 600; font-size: 12px;">www.ramazon.in</p>
                </div>
                <div style="text-align: center;">
                    <h3 style="margin: 0 0 5px; font-size: 16px; font-weight: 700; color: #111827; text-decoration: underline;">Ramazone</h3>
                    <p style="margin: 0; font-size: 12px; font-weight: 600; color: #374151;">Authorized Signatory</p>
                </div>
            </div>

        </div>
    `;

    // Wait for images
    const images = captureArea.getElementsByTagName('img');
    const promises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => { img.onload = img.onerror = resolve; });
    });

    try {
        await Promise.all(promises);
        await new Promise(r => setTimeout(r, 500)); // Extra buffer for font rendering
        
        // Scale 2 for better quality on A4
        const canvas = await html2canvas(captureArea, { 
            scale: 2, 
            useCORS: true, 
            allowTaint: true, 
            backgroundColor: '#ffffff',
            windowWidth: 1200 // Ensure layout doesn't break
        });
        
        const link = document.createElement('a');
        link.download = `Invoice_${order.orderId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('Invoice downloaded!', 'success');
    } catch (e) {
        console.error(e);
        showToast('Error generating invoice', 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-image mr-2"></i> Download Invoice as Image';
        captureArea.innerHTML = '';
    }
}

// --- HELP CENTER LOGIC (WITH DAILY LIMIT) ---
function openHelpPopup() { 
    document.getElementById('help-popup-overlay').classList.add('active'); 
    monitorHelpRequestStatus(); // Check status on open
}
function closeHelpPopup(e) { 
    if(e === true || e.target.classList.contains('popup-overlay')) 
        document.getElementById('help-popup-overlay').classList.remove('active'); 
}

async function handleHelpSubmit(e) {
    e.preventDefault();
    
    // 1. CHECK DAILY LIMIT
    const today = new Date().toDateString();
    let dailyStats = JSON.parse(localStorage.getItem('ramazone_help_limit') || '{}');
    
    // Reset if new day
    if (dailyStats.date !== today) {
        dailyStats = { date: today, count: 0 };
    }

    if (dailyStats.count >= 3) {
        showToast('Daily limit reached (3/3). Please try tomorrow.', 'error');
        return;
    }

    // 2. PROCEED SUBMISSION
    const name = document.getElementById('help-name').value;
    const mobile = document.getElementById('help-mobile').value;
    const reason = document.getElementById('help-reason').value;
    const requestId = 'HLP' + Date.now();

    const requestData = {
        requestId, name, mobile, reason, 
        status: 'Pending', // Initial status
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    try {
        await database.ref(`ramazone/help_requests/${requestId}`).set(requestData);
        localStorage.setItem('ramazoneActiveHelpRequest', requestId); // Save to track
        
        // Update Count
        dailyStats.count++;
        localStorage.setItem('ramazone_help_limit', JSON.stringify(dailyStats));

        showToast('Request Submitted! We will contact you.', 'success');
        document.getElementById('help-form').reset();
        monitorHelpRequestStatus(); 
    } catch (err) {
        console.error(err);
        showToast('Failed to submit. Try again.', 'error');
    }
}

// --- LIVE STATUS MONITORING ---
function monitorHelpRequestStatus() {
    const activeId = localStorage.getItem('ramazoneActiveHelpRequest');
    const statusContainer = document.getElementById('help-active-request-container');
    const form = document.getElementById('help-form');
    const statusText = document.getElementById('help-status-text');
    const iconDiv = document.getElementById('help-status-icon');
    const preview = document.getElementById('help-request-preview');

    if (!activeId) {
        statusContainer.classList.add('hidden');
        form.classList.remove('hidden');
        return;
    }

    if (helpRequestListener) database.ref(`ramazone/help_requests/${activeId}`).off('value', helpRequestListener);

    helpRequestListener = database.ref(`ramazone/help_requests/${activeId}`).on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            localStorage.removeItem('ramazoneActiveHelpRequest'); 
            monitorHelpRequestStatus();
            return;
        }

        statusContainer.classList.remove('hidden');
        form.classList.add('hidden'); 
        preview.innerText = `Issue: ${data.reason}`;

        if (data.status === 'Pending') {
            statusText.innerText = "Pending";
            statusText.className = "text-yellow-600 font-bold";
            iconDiv.innerHTML = '<i class="fas fa-clock text-yellow-500"></i>';
            statusContainer.className = "mb-6 p-4 bg-yellow-50 rounded-xl border border-yellow-100";
        } else if (data.status === 'Read' || data.status === 'Solved') {
            statusText.innerText = "Successfully Read";
            statusText.className = "text-green-600 font-bold";
            iconDiv.innerHTML = '<i class="fas fa-check-circle text-green-500"></i>';
            statusContainer.className = "mb-6 p-4 bg-green-50 rounded-xl border border-green-100";
            
            // Allow new request after 10 seconds of being read
            setTimeout(() => {
                 localStorage.removeItem('ramazoneActiveHelpRequest');
                 // Optional: auto-refresh UI or let user open popup again
            }, 10000);
        }
    });
}

// --- UTILS ---
function scrollToCoupons() { navigateToStep(3); setTimeout(() => { document.getElementById('coupon-input').focus(); document.getElementById('coupon-section-wrapper').classList.add('ring-2', 'ring-indigo-500'); setTimeout(() => document.getElementById('coupon-section-wrapper').classList.remove('ring-2', 'ring-indigo-500'), 1000); }, 300); }
function navigateToStep(step) { document.querySelectorAll('.step-content').forEach(d => d.classList.remove('active')); document.getElementById(step === 1 ? 'step-cart' : step === 2 ? 'step-address' : 'step-payment').classList.add('active'); document.querySelectorAll('.step').forEach((el, i) => { el.classList.remove('active', 'completed'); if(i < step - 1) el.classList.add('completed'); if(i === step - 1) el.classList.add('active'); }); document.getElementById('stepper-progress').style.width = `${((step-1)/2)*100}%`; currentStep = step; window.scrollTo(0,0); }
function renderSavedAddresses() { const arr = getSavedAddresses(); const cont = document.getElementById('saved-address-container'); if(arr.length === 0) { cont.innerHTML = '<p class="text-xs text-center bg-gray-50 p-2 rounded">No saved addresses.</p>'; return; } cont.innerHTML = arr.map((a, i) => `<div class="border p-3 rounded-lg flex justify-between items-start bg-white ${a.isPrime?'border-indigo-500 ring-1 ring-indigo-500':''}" onclick="useAddress(${i})"><div><p class="font-bold text-sm">${a.name} ${a.isPrime?'<span class="text-[10px] bg-indigo-600 text-white px-1 rounded">DEFAULT</span>':''}</p><p class="text-xs text-gray-600">${a.mobile}</p><p class="text-xs text-gray-500 line-clamp-1">${a.address}</p></div><button onclick="event.stopPropagation(); deleteAddress(${i})" class="text-red-400"><i class="fas fa-trash-alt"></i></button></div>`).join(''); }
function useAddress(i) { const a = getSavedAddresses()[i]; document.getElementById('customer-name').value = a.name; document.getElementById('customer-mobile').value = a.mobile; document.getElementById('customer-address').value = a.address; editingAddressIndex = i; }
function deleteAddress(i) { const arr = getSavedAddresses(); arr.splice(i, 1); saveAddresses(arr); renderSavedAddresses(); }
document.getElementById('save-address-btn').addEventListener('click', () => { const n = document.getElementById('customer-name').value, m = document.getElementById('customer-mobile').value, a = document.getElementById('customer-address').value; if(!n || !m || !a) return showToast('Fill all details', 'error'); const arr = getSavedAddresses(); const newAddr = { name: n, mobile: m, address: a, isPrime: arr.length === 0 }; if(editingAddressIndex !== null) arr[editingAddressIndex] = { ...newAddr, isPrime: arr[editingAddressIndex].isPrime }; else arr.push(newAddr); saveAddresses(arr); renderSavedAddresses(); editingAddressIndex = null; document.getElementById('customer-details-form').reset(); showToast('Address Saved', 'success'); });
function setupEvents() {
    document.getElementById('btn-to-address').addEventListener('click', () => navigateToStep(2));
    document.getElementById('btn-to-payment').addEventListener('click', () => { if(document.getElementById('customer-details-form').checkValidity()) navigateToStep(3); else showToast('Please fill address', 'error'); });
    document.getElementById('apply-coupon-btn').addEventListener('click', () => { const v = document.getElementById('coupon-input').value.trim().toLowerCase(); const c = validCoupons.find(x => x.code.toLowerCase() === v); if(c) { appliedCoupon = c; document.getElementById('coupon-section').classList.add('hidden'); document.getElementById('applied-coupon-div').classList.remove('hidden'); document.getElementById('applied-coupon-div').classList.add('flex'); document.getElementById('applied-coupon-code').innerText = c.code; updatePricing(); showToast('Coupon Applied!', 'success'); } else showToast('Invalid Coupon', 'error'); });
    document.getElementById('remove-coupon-btn').addEventListener('click', () => { appliedCoupon = null; document.getElementById('coupon-section').classList.remove('hidden'); document.getElementById('applied-coupon-div').classList.add('hidden'); document.getElementById('applied-coupon-div').classList.remove('flex'); document.getElementById('coupon-input').value = ''; updatePricing(); });
    
    // --- UPDATED PLACE ORDER LOGIC ---
    document.getElementById('place-order-btn').addEventListener('click', async (e) => {
        const btn = e.target; btn.disabled = true; btn.innerText = 'Processing...';
        const cust = { name: document.getElementById('customer-name').value, mobile: document.getElementById('customer-mobile').value, address: document.getElementById('customer-address').value };
        const orderId = 'RMZ' + Math.random().toString(36).substr(2, 7).toUpperCase();
        
        let sub = 0; 
        let totalMRP = 0; // Calculate Total Savings
        
        orderItems.forEach(i => {
            const price = i.pack ? i.pack.price : i.displayPrice;
            sub += price * i.quantity;
            const original = i.originalPrice || (price * 1.2);
            totalMRP += original * i.quantity;
        });

        const delOpt = document.querySelector('input[name="delivery"]:checked').value;
        const delFee = (delOpt === 'Ramazone' && sub < ramazoneConfig.freeDeliveryThreshold) ? ramazoneConfig.deliveryCharge : 0;
        const total = sub - (appliedCoupon?.discount||0) + delFee;
        const savings = Math.round(totalMRP - total);

        const order = { orderId, customerDetails: cust, items: orderItems.map(i => ({...i, image: getProductImage(i)})), priceSummary: { subtotal: sub, deliveryFee: delFee, coupon: appliedCoupon, grandTotal: total }, status: 'Confirmed', createdAt: firebase.database.ServerValue.TIMESTAMP };
        try { 
            await database.ref(`ramazone/orders/confirmed/${orderId}`).set(order); 
            saveCart([]); 
            localStorage.setItem('ramazoneRecentOrderId', orderId); 
            
            // 1. PLAY SOUND
            const audio = document.getElementById('order-success-sound');
            if(audio) audio.play().catch(e => console.log('Audio error:', e));

            // 2. SHOW FULL SCREEN POPUP
            const popup = document.getElementById('order-success-popup');
            popup.classList.remove('hidden');
            
            // 3. SET SAVINGS TEXT
            if(savings > 0) {
                document.getElementById('success-savings-text').innerText = `You saved ₹${savings}`;
            } else {
                document.getElementById('success-savings-text').innerText = '';
            }

            // 4. SHOW BUTTON AFTER 2 SECONDS
            setTimeout(() => {
                document.getElementById('success-view-btn').classList.add('visible');
            }, 2000);

            // 5. HANDLE VIEW ORDER CLICK
            document.getElementById('success-view-btn').onclick = () => {
                popup.classList.add('hidden');
                document.getElementById('popup-search-input').value = orderId;
                openOrderPopup();
            };

        } catch(err) { 
            console.error(err); 
            showToast('Order Failed', 'error'); 
            btn.disabled = false; btn.innerText = 'Place Order'; 
        }
    });
    
    document.querySelectorAll('input[name="delivery"]').forEach(el => el.addEventListener('change', updatePricing));
}

