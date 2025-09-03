// --- GLOBAL VARIABLES & CONFIG ---
// Ab config 'config.js' file se aa rahi hai
const DB_BASE_PATH = 'ramazone';

// Global state
let app, db, auth;
window.currentVendorData = {};
window.allProductsCache = [];
window.currentVendorProductsCache = [];
window.allCategoriesCache = [];


// --- CORE FUNCTIONS ---

async function loadPage(pageUrl) {
    const mainContentArea = document.getElementById('main-content-area');
    mainContentArea.innerHTML = `<div class="w-full flex justify-center items-center p-10"><div class="loader"></div></div>`;
    try {
        const response = await fetch(pageUrl);
        if (!response.ok) throw new Error(`Page not found: ${pageUrl}`);
        mainContentArea.innerHTML = await response.text();
        // script ko execute karne ke liye
        const scripts = mainContentArea.querySelectorAll("script");
        scripts.forEach(script => {
            const newScript = document.createElement("script");
            newScript.textContent = script.innerHTML;
            document.body.appendChild(newScript).parentNode.removeChild(newScript);
        });
    } catch (error) {
        console.error("Page Load Error:", error);
        mainContentArea.innerHTML = `<p class="text-center p-10 text-red-500">Error loading page. Please try again.</p>`;
    }
}

async function initializeVendorPanel(user) {
    try {
        const vendorSnapshot = await db.ref(`${DB_BASE_PATH}/vendors/${user.uid}`).once('value');
        window.currentVendorData = vendorSnapshot.val();

        if (!window.currentVendorData) {
            showToast('Error', 'Aapka vendor data nahin mila. Admin se sampark karein.', 'error');
            return auth.signOut();
        }

        if (window.currentVendorData.status === 'disabled') {
            showToast('Account Disabled', 'Aapka account admin dwara disable kar diya gaya hai.', 'error', 8000);
            return auth.signOut();
        }

        const allProductsSnapshot = await db.ref(`${DB_BASE_PATH}/products`).once('value');
        const productsData = allProductsSnapshot.val() || [];
        window.allProductsCache = Array.isArray(productsData) ? productsData.filter(p => p) : Object.values(productsData).filter(p => p);

        const categoriesSnapshot = await db.ref(`${DB_BASE_PATH}/homepage/normalCategories`).once('value');
        const categoriesData = categoriesSnapshot.val() || [];
        window.allCategoriesCache = Array.isArray(categoriesData) ? categoriesData.map(c => c.name) : [];

        window.currentVendorProductsCache = window.allProductsCache
            .map((p, index) => ({ data: p, originalIndex: index }))
            .filter(item => item.data && item.data.vendorId === user.uid);

        document.getElementById('vendor-shop-name-sidebar').textContent = window.currentVendorData.shopName;
        document.getElementById('vendor-name-header').textContent = `Hello, ${window.currentVendorData.name.split(' ')[0]}`;
        document.getElementById('vendor-avatar-header').textContent = window.currentVendorData.name.charAt(0).toUpperCase();

        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('vendorLayout').classList.remove('hidden');

        setupEventListeners();
        document.querySelector('.sidebar-link[data-page="sections/dashboard.html"]').click();
    } catch (error) {
        console.error("Initialization Error:", error);
        showToast('Error', 'Panel initialize karne mein error aaya.', 'error');
    }
}

function setupEventListeners() {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        if (link.eventAttached) return;
        link.eventAttached = true;
        link.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.getElementById('contentTitle').textContent = link.querySelector('span').textContent;
            loadPage(link.dataset.page);
            if (window.innerWidth < 768) {
                document.getElementById('sidebar').classList.add('-translate-x-full');
                document.getElementById('sidebarOverlay').classList.add('hidden');
            }
        });
    });
    document.getElementById('vendor-avatar-header').addEventListener('click', renderProfilePage);
    const homeButton = document.getElementById('home-button');
    if (homeButton && !homeButton.eventAttached) {
        homeButton.eventAttached = true;
        homeButton.addEventListener('click', () => {
            const dashboardLink = document.querySelector('.sidebar-link[data-page="sections/dashboard.html"]');
            if (dashboardLink) dashboardLink.click();
        });
    }
}

// === YEH NAYA FUNCTION HAI DASHBOARD KE LIYE ===
window.renderDashboardData = async function() {
    if (!window.currentVendorData) return;

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

        const vendorOrders = allOrders.filter(order => 
            order.products && Array.isArray(order.products) &&
            order.products.some(p => p.vendorId === window.currentVendorData.vendorId)
        );

        const totalOrderCount = vendorOrders.length;
        const pendingOrderCount = vendorOrders.filter(o => o.status && o.status.toLowerCase() === 'pending').length;
        
        const today = new Date().toISOString().slice(0, 10);
        const todaysSale = vendorOrders
            .filter(o => o.orderDate && o.orderDate.startsWith(today))
            .reduce((sum, order) => sum + (order.totalPrice || 0), 0);

        if(totalOrdersEl) totalOrdersEl.textContent = totalOrderCount;
        if(pendingOrdersEl) pendingOrdersEl.textContent = pendingOrderCount;
        if(todaysSaleEl) todaysSaleEl.textContent = `₹${todaysSale.toLocaleString('en-IN')}`;

        if(recentOrdersContainer) {
            if (vendorOrders.length === 0) {
                if(recentOrdersLoader) recentOrdersLoader.textContent = "No orders found yet.";
            } else {
                if(recentOrdersLoader) recentOrdersLoader.style.display = 'none';
                
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
                                <p class="font-semibold">₹${(order.totalPrice || 0).toLocaleString('en-IN')}</p>
                                <span class="text-xs font-medium px-2 py-1 rounded-full ${orderStatusClass}">${order.status || 'Pending'}</span>
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

function renderProfilePage() {
    const mainContentArea = document.getElementById('main-content-area');
    const contentTitle = document.getElementById('contentTitle');
    contentTitle.textContent = 'My Profile';
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const profilePageHtml = `
        <div class="space-y-6">
            <div class="profile-card">
                <div class="profile-card-header"><h3 class="profile-card-title">Vendor Details</h3></div>
                <div class="profile-card-body">
                    <div class="space-y-4">
                        <div class="detail-item"><i class="fas fa-user-circle w-6 text-center"></i> <strong>Full Name:</strong> <span class="ml-auto text-gray-700">${window.currentVendorData.name}</span></div>
                        <div class="detail-item"><i class="fas fa-store w-6 text-center"></i> <strong>Shop Name:</strong> <span class="ml-auto text-gray-700">${window.currentVendorData.shopName}</span></div>
                        <div class="detail-item"><i class="fas fa-envelope w-6 text-center"></i> <strong>Login Email:</strong> <span class="ml-auto text-gray-700">${window.currentVendorData.email}</span></div>
                        <div class="detail-item"><i class="fab fa-whatsapp w-6 text-center"></i> <strong>WhatsApp:</strong> <span class="ml-auto text-gray-700">${window.currentVendorData.whatsappNumber}</span></div>
                    </div>
                </div>
            </div>
            <div class="profile-card">
                <div class="profile-card-header"><h3 class="profile-card-title">Change Password</h3></div>
                <div class="profile-card-body">
                    <form id="profile-change-password-form" class="space-y-4">
                        <div><label class="form-label">Old Password</label><input type="password" id="profile-old-password" class="form-control" required></div>
                        <div><label class="form-label">New Password</label><input type="password" id="profile-new-password" class="form-control" required></div>
                        <div><label class="form-label">Confirm New Password</label><input type="password" id="profile-confirm-password" class="form-control" required></div>
                        <div class="text-right pt-2"><button type="submit" id="update-password-btn" class="btn btn-primary">Update Password</button></div>
                    </form>
                </div>
            </div>
        </div>`;
    mainContentArea.innerHTML = profilePageHtml;
    document.getElementById('profile-change-password-form').addEventListener('submit', async (e) => { e.preventDefault(); const oldPassword = document.getElementById('profile-old-password').value; const newPassword = document.getElementById('profile-new-password').value; const confirmPassword = document.getElementById('profile-confirm-password').value; if (!oldPassword || !newPassword || !confirmPassword) return showToast('Error', 'Please fill all password fields.', 'error'); if (newPassword !== confirmPassword) return showToast('Error', 'New passwords do not match.', 'error'); if (newPassword.length < 6) return showToast('Error', 'Password must be at least 6 characters.', 'error'); const updateBtn = document.getElementById('update-password-btn'); updateBtn.disabled = true; updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...'; const user = auth.currentUser; const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPassword); try { await user.reauthenticateWithCredential(credential); await user.updatePassword(newPassword); showToast('Success!', 'Your password has been updated successfully.', 'success'); document.getElementById('profile-change-password-form').reset(); } catch (error) { let msg = 'An error occurred. Please try again.'; if (error.code === 'auth/wrong-password') msg = 'The old password you entered is incorrect.'; window.showToast('Update Failed', msg, 'error'); } finally { updateBtn.disabled = false; updateBtn.innerHTML = 'Update Password'; } });
}

function showToast(title, message, type = 'info', duration = 5000) { const container = document.getElementById('toast-container'); if (!container) return; const toast = document.createElement('div'); const typeClasses = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' }; toast.className = `toast`; toast.innerHTML = `<div class="flex items-center"><div class="w-10 h-10 rounded-l-md flex items-center justify-center text-white text-lg ${typeClasses[type] || 'bg-gray-500'}"><i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i></div><div class="px-4 py-2"><p class="font-bold text-gray-800">${title}</p><p class="text-sm text-gray-600">${message}</p></div></div>`; container.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); };

window.uploadToImgBB = async (file) => {
    if (typeof IMGBB_API_KEY === 'undefined' || !IMGBB_API_KEY) {
        showToast('Upload Failed', 'Image upload service key nahi mil rahi.', 'error');
        return null;
    }
    const formData = new FormData(); 
    formData.append('image', file); 
    try { 
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData }); 
        const result = await response.json(); 
        if (result.success) return result.data.url;
        else throw new Error(result.error.message);
    } catch (error) { 
        console.error('Image Upload Error:', error); 
        showToast('Upload Failed', error.message, 'error'); 
        return null; 
    } 
};

// --- APP INITIALIZATION (POORA AUR SAHI) ---
document.addEventListener('DOMContentLoaded', () => {
    if (typeof FIREBASE_CONFIG === 'undefined' || typeof IMGBB_API_KEY === 'undefined') {
        document.body.innerHTML = `<div style="text-align:center; padding: 20px; font-family: sans-serif; color: #333;"><h1>Application Error</h1><p>Configuration file (config.js) nahi mili ya usmein galti hai.</p></div>`;
        return;
    }

    try {
        app = firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.database();
        auth = firebase.auth();

        auth.onAuthStateChanged(user => {
            if (user) {
                initializeVendorPanel(user);
            } else {
                document.getElementById('loginOverlay').style.display = 'flex';
                document.getElementById('vendorLayout').classList.add('hidden');
            }
        });

        const loginForm = document.getElementById('loginForm');
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('vendor-email').value;
            const password = document.getElementById('vendor-password').value;
            const submitButton = loginForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Logging in...';
            auth.signInWithEmailAndPassword(email, password)
                .catch((error) => {
                    let msg = 'Login fail ho gaya. Dobara try karein.';
                    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                        msg = 'Galat email ya password.';
                    }
                    showToast('Login Failed', msg, 'error');
                })
                .finally(() => {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Login';
                });
        });
        
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
        
        document.getElementById('forgot-password-link').addEventListener('click', (e) => {
            e.preventDefault();
            const email = document.getElementById('vendor-email').value;
            if (!email) return showToast('Error', 'Please enter your email address first.', 'error');
            auth.sendPasswordResetEmail(email)
                .then(() => showToast('Check Your Email', `Password reset link sent to ${email}.`, 'success'))
                .catch((error) => showToast('Error', error.message, 'error'));
        });

        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        document.getElementById('sidebarToggle').addEventListener('click', () => { sidebar.classList.toggle('-translate-x-full'); sidebarOverlay.classList.toggle('hidden'); });
        sidebarOverlay.addEventListener('click', () => { sidebar.classList.add('-translate-x-full'); sidebarOverlay.classList.add('hidden'); });

        const modal = document.getElementById('universalModal');
        const closeModal = () => modal.classList.remove('active');
        document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
        document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    } catch (error) {
        console.error("Firebase Init Error:", error);
        document.body.innerHTML = "Error initializing the application. Check console.";
    }
});


