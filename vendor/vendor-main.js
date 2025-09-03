// --- GLOBAL VARIABLES & CONFIG ---
let FIREBASE_CONFIG = null;
let IMGBB_API_KEY = null;
const DB_BASE_PATH = 'ramazone';

// Global state
let app, db, auth;
window.currentVendorData = {};
window.allProductsCache = [];
window.currentVendorProductsCache = [];
window.allCategoriesCache = [];


// --- NAYA SEQUENTIAL CONFIGURATION FETCH FUNCTION ---
// Pehle hum Promise.all se dono file ek saath mang rahe the.
// Ab hum Firebase config PEHLE mangenge.
async function fetchFirebaseConfig() {
    try {
        const response = await fetch('/api/get-vendor-firebase');
        if (!response.ok) {
            throw new Error(`Firebase Config (Error ${response.status})`);
        }
        const config = await response.json();
        if (!config.apiKey) {
            throw new Error('Firebase API key server response mein nahi hai.');
        }
        FIREBASE_CONFIG = config;
        console.log("Firebase configuration loaded successfully.");
        return true;
    } catch (error) {
        console.error("Firebase config load karne mein fail:", error);
        document.body.innerHTML = `<div style="text-align:center; padding: 20px; font-family: sans-serif; color: #333;"><h1>Application Error</h1><p>Configuration load nahi ho saki.</p><p style="color: #d9534f; font-weight: bold; margin-top: 10px; padding: 10px; background: #f2dede; border-radius: 5px;">${error.message}</p></div>`;
        return false;
    }
}

// Firebase config milne ke BAAD hum Image config mangenge.
async function fetchImageConfig() {
    try {
        const response = await fetch('/api/vendor-image-config');
        if (!response.ok) {
            throw new Error(`Image Config (Error ${response.status})`);
        }
        const config = await response.json();
        if (!config.apiKey) {
            throw new Error('Image API key server response mein nahi hai.');
        }
        IMGBB_API_KEY = config.apiKey;
        console.log("Image configuration loaded successfully.");
        return true;
    } catch (error) {
        // Agar image config fail hoti hai, to hum sirf ek warning dikhayenge, app ko rokेंगे nahi.
        console.error("Image config load karne mein fail:", error);
        showToast('Warning', 'Image upload service shuru nahi ho saki. Aap kaam kar sakte hain, lekin image upload shayad na ho.', 'error', 8000);
        return false;
    }
}


// --- CORE FUNCTIONS (Unchanged) ---
async function loadPage(pageUrl) {
    const mainContentArea = document.getElementById('main-content-area');
    mainContentArea.innerHTML = `<div class="w-full flex justify-center items-center p-10"><div class="loader"></div></div>`;
    try {
        const response = await fetch(pageUrl);
        if (!response.ok) throw new Error(`Page not found: ${pageUrl}`);
        mainContentArea.innerHTML = await response.text();
        const scripts = mainContentArea.querySelectorAll("script");
        scripts.forEach(script => {
            const newScript = document.createElement("script");
            if (script.src) {
                newScript.src = script.src;
                newScript.async = false;
                document.body.appendChild(newScript);
            } else {
                newScript.textContent = script.innerHTML;
                document.head.appendChild(newScript).parentNode.removeChild(newScript);
            }
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
        const productsData = allProductsSnapshot.val();
        
        if (typeof productsData === 'object' && productsData !== null && !Array.isArray(productsData)) {
            window.allProductsCache = Object.values(productsData);
        } else if (Array.isArray(productsData)) {
            window.allProductsCache = productsData;
        } else {
            window.allProductsCache = [];
        }
        window.allProductsCache = window.allProductsCache.filter(p => p);

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
        
        // Image config ko background mein load karein
        fetchImageConfig();

        document.querySelector('.sidebar-link[data-page="sections/dashboard.html"]').click();

    } catch (error) {
        console.error("Initialization Error:", error);
        showToast('Error', 'Panel initialize karne mein error aaya.', 'error');
    }
}

function setupEventListeners() {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        if(link.eventAttached) return;
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

function renderProfilePage() {
    const mainContentArea = document.getElementById('main-content-area');
    const contentTitle = document.getElementById('contentTitle');
    contentTitle.textContent = 'My Profile';
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    mainContentArea.innerHTML = '';
    const profilePageHtml = `
        <div class="profile-page-header">
            <div><h2 class="text-2xl font-bold text-gray-800">My Profile & Settings</h2><p class="text-sm text-gray-500">View your details and manage your password.</p></div>
            <button id="back-to-dashboard-btn" class="btn btn-secondary"><i class="fas fa-arrow-left mr-2"></i> Back to Dashboard</button>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="profile-card"><div class="profile-card-header"><h3 class="profile-card-title">Vendor Details</h3></div><div class="profile-card-body"><div class="space-y-4"><div class="detail-item"><i class="fas fa-user-circle"></i> <strong>Full Name:</strong> <span class="ml-auto text-gray-700">${window.currentVendorData.name}</span></div><div class="detail-item"><i class="fas fa-store"></i> <strong>Shop Name:</strong> <span class="ml-auto text-gray-700">${window.currentVendorData.shopName}</span></div><div class="detail-item"><i class="fas fa-envelope"></i> <strong>Login Email:</strong> <span class="ml-auto text-gray-700">${window.currentVendorData.email}</span></div><div class="detail-item"><i class="fab fa-whatsapp"></i> <strong>WhatsApp:</strong> <span class="ml-auto text-gray-700">${window.currentVendorData.whatsappNumber}</span></div></div></div></div>
            <div class="profile-card"><div class="profile-card-header"><h3 class="profile-card-title">Change Password</h3></div><div class="profile-card-body"><form id="profile-change-password-form" class="space-y-4"><div><label class="form-label">Old Password</label><input type="password" id="profile-old-password" class="form-control" required></div><div><label class="form-label">New Password</label><input type="password" id="profile-new-password" class="form-control" required></div><div><label class="form-label">Confirm New Password</label><input type="password" id="profile-confirm-password" class="form-control" required></div><div class="text-right pt-2"><button type="submit" id="update-password-btn" class="btn btn-primary">Update Password</button></div></form></div></div>
        </div>`;
    mainContentArea.innerHTML = profilePageHtml;
    document.getElementById('back-to-dashboard-btn').addEventListener('click', () => { document.querySelector('.sidebar-link[data-page="sections/dashboard.html"]')?.click(); });
    document.getElementById('profile-change-password-form').addEventListener('submit', async (e) => { e.preventDefault(); const oldPassword = document.getElementById('profile-old-password').value; const newPassword = document.getElementById('profile-new-password').value; const confirmPassword = document.getElementById('profile-confirm-password').value; if (!oldPassword || !newPassword || !confirmPassword) return window.showToast('Error', 'Please fill all password fields.', 'error'); if (newPassword !== confirmPassword) return window.showToast('Error', 'New passwords do not match.', 'error'); if (newPassword.length < 6) return window.showToast('Error', 'Password must be at least 6 characters.', 'error'); const updateBtn = document.getElementById('update-password-btn'); updateBtn.disabled = true; updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...'; const user = auth.currentUser; const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPassword); try { await user.reauthenticateWithCredential(credential); await user.updatePassword(newPassword); window.showToast('Success!', 'Your password has been updated successfully.', 'success'); document.getElementById('profile-change-password-form').reset(); } catch (error) { console.error("Password change error:", error); let msg = 'An error occurred. Please try again.'; if (error.code === 'auth/wrong-password') msg = 'The old password you entered is incorrect.'; else if (error.code === 'auth/weak-password') msg = 'The new password is too weak.'; window.showToast('Update Failed', msg, 'error'); } finally { updateBtn.disabled = false; updateBtn.innerHTML = 'Update Password'; } });
}

window.showToast = (title, message, type = 'info', duration = 5000) => { const container = document.getElementById('toast-container'); if (!container) return; const toast = document.createElement('div'); const typeClasses = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' }; toast.className = `toast`; toast.innerHTML = `<div class="flex items-center"><div class="w-10 h-10 rounded-l-md flex items-center justify-center text-white text-lg ${typeClasses[type] || 'bg-gray-500'}"><i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i></div><div class="px-4 py-2"><p class="font-bold text-gray-800">${title}</p><p class="text-sm text-gray-600">${message}</p></div></div>`; container.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); };
window.uploadToImgBB = async (file) => {
    if (!IMGBB_API_KEY) {
        showToast('Upload Failed', 'Image upload service is not available.', 'error');
        return null;
    }
    const formData = new FormData(); 
    formData.append('image', file); 
    try { 
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData }); 
        const result = await response.json(); 
        if (result.success) { 
            return result.data.url; 
        } else { 
            throw new Error(result.error.message); 
        } 
    } catch (error) { 
        console.error('Image Upload Error:', error); 
        showToast('Upload Failed', error.message, 'error'); 
        return null; 
    } 
};


// --- APP INITIALIZATION (Final with Sequential Loading) ---
document.addEventListener('DOMContentLoaded', async () => {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'config-loading-overlay';
    loadingOverlay.innerHTML = `<div style="position:fixed; inset:0; background: #f9fafb; z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:1rem; font-family: Inter, sans-serif;"><div class="loader"></div><p>Panel ko surakshit roop se shuru kiya ja raha hai...</p></div>`;
    document.body.prepend(loadingOverlay);

    // Step 1: Pehle sirf Firebase config fetch karein
    const firebaseLoaded = await fetchFirebaseConfig();
    
    // Step 2: Agar Firebase load ho gaya, tabhi aage badhein
    if (firebaseLoaded) {
        loadingOverlay.remove();
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
            const loginForm = document.getElementById('loginForm'); const logoutBtn = document.getElementById('logout-btn'); const forgotPasswordLink = document.getElementById('forgot-password-link');
            loginForm.addEventListener('submit', (e) => { e.preventDefault(); const email = document.getElementById('vendor-email').value; const password = document.getElementById('vendor-password').value; const submitButton = loginForm.querySelector('button[type="submit"]'); submitButton.disabled = true; submitButton.textContent = 'Logging in...'; auth.signInWithEmailAndPassword(email, password) .catch((error) => { let msg = error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' ? 'Galat email ya password.' : 'Login fail ho gaya. Dobara try karein.'; showToast('Login Failed', msg, 'error'); }) .finally(() => { submitButton.disabled = false; submitButton.textContent = 'Login'; }); });
            logoutBtn.addEventListener('click', () => { auth.signOut(); });
            forgotPasswordLink.addEventListener('click', (e) => { e.preventDefault(); const email = document.getElementById('vendor-email').value; if (!email) { return window.showToast('Error', 'Please enter your email address first.', 'error'); } auth.sendPasswordResetEmail(email) .then(() => { showToast('Check Your Email', `Password reset link sent to ${email}.`, 'success'); }) .catch((error) => { showToast('Error', error.message, 'error'); }); });
            const sidebar = document.getElementById('sidebar'); const sidebarOverlay = document.getElementById('sidebarOverlay');
            document.getElementById('sidebarToggle').addEventListener('click', () => { sidebar.classList.toggle('-translate-x-full'); sidebarOverlay.classList.toggle('hidden'); });
            sidebarOverlay.addEventListener('click', () => { sidebar.classList.add('-translate-x-full'); sidebarOverlay.classList.add('hidden'); });
            const modal = document.getElementById('universalModal');
            if (modal) { const modalFooter = document.getElementById('modalFooter'); const closeModal = () => { modal.classList.remove('active'); if(modalFooter) { modalFooter.style.display = 'flex'; const saveBtn = document.getElementById('modalSaveBtn'); if(saveBtn) saveBtn.onclick = null; } }; const closeBtn = document.getElementById('modalCloseBtn'); const cancelBtn = document.getElementById('modalCancelBtn'); if(closeBtn) closeBtn.addEventListener('click', closeModal); if(cancelBtn) cancelBtn.addEventListener('click', closeModal); modal.addEventListener('click', e => { if (e.target === modal) closeModal(); }); }
        } catch (error) {
            console.error("Firebase Init Error:", error);
            document.body.innerHTML = "Error initializing the application. Check console.";
        }
    }
});


