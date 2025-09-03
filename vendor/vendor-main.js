// --- Is naye function ko vendor-main.js mein add karein ---

window.renderDashboardData = async function() {
    if (!window.currentVendorData) return;

    // --- Update Stat Cards ---
    const totalProductsEl = document.getElementById('stat-total-products');
    if (totalProductsEl) {
        totalProductsEl.textContent = window.currentVendorProductsCache.length;
    }

    const totalOrdersEl = document.getElementById('stat-total-orders');
    const pendingOrdersEl = document.getElementById('stat-pending-orders');
    const todaysSaleEl = document.getElementById('stat-todays-sale');
    const recentOrdersContainer = document.getElementById('recent-orders-container');
    const recentOrdersLoader = document.getElementById('recent-orders-loader');

    try {
        const ordersSnapshot = await db.ref(`${DB_BASE_PATH}/orders`).once('value');
        const allOrders = Object.values(ordersSnapshot.val() || {});

        // Sirf is vendor ke orders ko filter karein
        const vendorOrders = allOrders.filter(order => 
            order.products.some(p => p.vendorId === window.currentVendorData.vendorId)
        );

        // Stats Calculate Karein
        const totalOrderCount = vendorOrders.length;
        const pendingOrderCount = vendorOrders.filter(o => o.status && o.status.toLowerCase() === 'pending').length;
        
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
        const todaysSale = vendorOrders
            .filter(o => o.orderDate && o.orderDate.startsWith(today))
            .reduce((sum, order) => sum + order.totalPrice, 0);

        // HTML Elements ko Update Karein
        if(totalOrdersEl) totalOrdersEl.textContent = totalOrderCount;
        if(pendingOrdersEl) pendingOrdersEl.textContent = pendingOrderCount;
        if(todaysSaleEl) todaysSaleEl.textContent = `₹${todaysSale.toLocaleString('en-IN')}`;

        // --- Recent Orders List Banayein ---
        if(recentOrdersContainer) {
            if (vendorOrders.length === 0) {
                recentOrdersLoader.textContent = "No orders found yet.";
            } else {
                recentOrdersLoader.style.display = 'none'; // Loader ko hatayein
                
                // Orders ko naye se purane ke hisaab se sort karein aur sirf 5 dikhayein
                const recentOrders = vendorOrders
                    .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
                    .slice(0, 5);
                
                let ordersHTML = '';
                recentOrders.forEach(order => {
                    const orderStatusClass = order.status === 'Delivered' ? 'text-green-600 bg-green-100' : 'text-yellow-600 bg-yellow-100';
                    ordersHTML += `
                        <div class="flex justify-between items-center p-2 rounded-md hover:bg-gray-50">
                            <div>
                                <p class="font-medium text-gray-800">${order.customer.name}</p>
                                <p class="text-xs text-gray-500">ID: ${order.orderId}</p>
                            </div>
                            <div class="text-right">
                                <p class="font-semibold">₹${order.totalPrice.toLocaleString('en-IN')}</p>
                                <span class="text-xs font-medium px-2 py-1 rounded-full ${orderStatusClass}">${order.status}</span>
                            </div>
                        </div>
                    `;
                });
                recentOrdersContainer.innerHTML = ordersHTML;
            }
        }

    } catch (error) {
        console.error("Dashboard data load karne mein error:", error);
        if(recentOrdersLoader) recentOrdersLoader.textContent = "Could not load orders.";
    }
};


