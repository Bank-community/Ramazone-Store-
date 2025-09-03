// --- GLOBAL VARIABLES & CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyCXrwTUdy5B5mxEMsmAOX_3ZVKxiWht7Vw",
    authDomain: "re-store-8e5b3.firebaseapp.com",
    databaseURL: "https://re-store-8e5b3-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "re-store-8e5b3",
    storageBucket: "re-store-8e5b3.firebasestorage.app",
    messagingSenderId: "747691299697",
    appId: "1:747691299697:web:20dda42f47c7b39d495cd0",
};
const IMGBB_API_KEY = 'f513510bd9ce285f80f9df4d3648451a';
const IMGBB_API_URL = `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`;

const DB_BASE_PATH = 'ramazone';
const ADMIN_EMAIL = 'princekumar954684@gmail.com';

// Global state
let app, db, auth, secondaryApp;
window.ramazoneData = {};
window.allCategoriesCache = [];
window.allProductsCache = [];
window.allVendorsCache = {}; // Cache for vendors

// --- CORE FUNCTIONS ---

async function loadPage(pageUrl) {
    const mainContentArea = document.getElementById('main-content-area');
    mainContentArea.innerHTML = `<div class="text-center py-20"><div class="loader"></div><p class="text-primary font-medium mt-6">Loading...</p></div>`;

    try {
        const response = await fetch(pageUrl);
        if (!response.ok) throw new Error(`Page not found: ${pageUrl}`);
        const html = await response.text();
        mainContentArea.innerHTML = html;

        const scripts = mainContentArea.querySelectorAll("script");
        scripts.forEach(script => {
            const newScript = document.createElement("script");
            if (script.src) {
                newScript.src = script.src;
            } else {
                newScript.textContent = script.innerHTML;
            }
            document.body.appendChild(newScript).parentNode.removeChild(newScript);
        });
        mainContentArea.classList.add('page-enter-active');
        setTimeout(() => mainContentArea.classList.remove('page-enter-active'), 500);

    } catch (error)
    {
        console.error("Error loading page:", error);
        mainContentArea.innerHTML = `<div class="text-center text-red-500 font-bold p-8">${error.message}</div>`;
    }
}

function initializeAdminPanel() {
    const mainContentArea = document.getElementById('main-content-area');
    
    db.ref(DB_BASE_PATH).on('value', 
        (snapshot) => {
            const data = snapshot.val() || {};
            window.ramazoneData = data;
            // Cache products, categories, AND vendors
            window.allProductsCache = Array.isArray(data.products) ? data.products.map((p, i) => ({...p, id: p.id || `prod-${Date.now()}-${i}`})) : [];
            window.allCategoriesCache = (data.homepage?.normalCategories || []).map(c => c.name).filter(Boolean);
            window.allVendorsCache = data.vendors || {};

            console.log("Firebase data updated and cached globally.");
            
            const isInitialLoad = mainContentArea.querySelector('#adminLoadingIndicator');
            if (isInitialLoad) {
                 const dashboardLink = document.querySelector('[data-page="sections/dashboard.html"]');
                 if (dashboardLink) {
                     dashboardLink.click();
                 } else {
                     document.querySelector('.sidebar-link').click();
                 }
            }
        }, 
        (error) => {
            showToast('Database Error', `Could not connect: ${error.message}`, 'error');
            mainContentArea.innerHTML = `<div class="text-center text-red-500 font-bold p-8">Database connection failed.</div>`;
        }
    );

    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const pageUrl = link.dataset.page;
            if (!pageUrl) return;

            document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.getElementById('contentTitle').textContent = link.querySelector('span').textContent;
            
            loadPage(pageUrl);

            if (window.innerWidth < 768) {
                document.getElementById('sidebar').classList.add('-translate-x-full');
                document.getElementById('sidebarOverlay').classList.add('hidden');
            }
        });
    });
}

// --- NEW VENDOR MODAL FUNCTION ---
window.openVendorRegistrationModal = () => {
    const modal = document.getElementById('universalModal');
    document.getElementById('modalTitle').textContent = 'Register New Vendor';
    document.getElementById('modalBody').innerHTML = `
        <form id="modal-vendor-form" class="space-y-4">
            <div><label class="form-label">Vendor Full Name</label><input type="text" id="modal-vendor-name" class="form-control" required></div>
            <div><label class="form-label">Shop Name</label><input type="text" id="modal-vendor-shop-name" class="form-control" required></div>
            <div><label class="form-label">Login Email</label><input type="email" id="modal-vendor-email" class="form-control" required></div>
            <div><label class="form-label">Set Password</label><input type="password" id="modal-vendor-password" class="form-control" required></div>
            <div><label class="form-label">WhatsApp Number</label><input type="tel" id="modal-vendor-whatsapp" class="form-control" required></div>
        </form>
    `;
    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.innerHTML = 'Register Vendor';
    saveBtn.onclick = handleVendorRegistration; // Assign the registration handler
    modal.classList.add('active');
};

async function handleVendorRegistration() {
    const name = document.getElementById('modal-vendor-name').value.trim();
    const shopName = document.getElementById('modal-vendor-shop-name').value.trim();
    const email = document.getElementById('modal-vendor-email').value.trim();
    const password = document.getElementById('modal-vendor-password').value;
    const whatsappNumber = document.getElementById('modal-vendor-whatsapp').value.trim();

    if (!name || !shopName || !email || !password || !whatsappNumber) {
        return showToast('Validation Error', 'Please fill all fields.', 'error');
    }

    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Registering...';

    try {
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
        const newUser = userCredential.user;
        
        const vendorData = {
            vendorId: newUser.uid, name, shopName, email, whatsappNumber,
            createdAt: new Date().toISOString(), status: 'active'
        };
        await db.ref(`${DB_BASE_PATH}/vendors/${newUser.uid}`).set(vendorData);
        await secondaryApp.auth().signOut();

        showToast('Success!', `${name} has been registered.`, 'success');
        document.getElementById('modalCloseBtn').click();
        
        // Refresh the vendor list if currently on that page
        if (document.querySelector('#vendor-list-container')) {
             loadPage('sections/vendor-dashboard.html');
        }

    } catch (error) {
        console.error("Vendor registration error:", error);
        showToast('Registration Failed', error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Register Vendor';
    }
}

// --- GLOBAL HELPER FUNCTIONS ---
window.showToast = (title, message, type = 'info', duration = 5000) => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconClass = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<div class="toast-icon"><i class="fas ${iconClass}"></i></div><div class="flex-1"><div class="font-semibold">${title}</div><div class="text-sm text-gray-600">${message}</div></div><div class="toast-progress"><div class="toast-progress-bar"></div></div>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    const progressBar = toast.querySelector('.toast-progress-bar');
    progressBar.style.transitionDuration = `${duration}ms`;
    setTimeout(() => progressBar.style.width = '100%', 50);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration);
};
window.uploadToImgBB = async (file) => {
    // ... (upload function remains unchanged)
};

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Initialize main Firebase app
        app = firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();

        // Initialize a secondary Firebase app for vendor auth operations.
        secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary-auth');
        
        const passcodeForm = document.getElementById('passcodeForm');
        passcodeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const password = document.getElementById('passcodeInput').value;
            const submitButton = passcodeForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Logging in...';

            auth.signInWithEmailAndPassword(ADMIN_EMAIL, password)
                .then(() => {
                    document.getElementById('passcodeOverlay').style.display = 'none';
                    document.getElementById('adminLayout').classList.remove('hidden');
                    initializeAdminPanel();
                })
                .catch((error) => {
                    let msg = error.code === 'auth/wrong-password' ? 'Galat password!' : 'Login fail ho gaya.';
                    showToast('Error', msg, 'error');
                    document.getElementById('passcodeCard').classList.add('shake');
                    document.getElementById('passcodeInput').value = '';
                    setTimeout(() => document.getElementById('passcodeCard').classList.remove('shake'), 500);
                })
                .finally(() => {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Enter';
                });
        });
        
        // Sidebar toggle logic
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        document.getElementById('sidebarToggle').addEventListener('click', () => { 
            sidebar.classList.toggle('-translate-x-full'); 
            sidebarOverlay.classList.toggle('hidden'); 
        });
        sidebarOverlay.addEventListener('click', () => { 
            sidebar.classList.add('-translate-x-full'); 
            sidebarOverlay.classList.add('hidden'); 
        });

        // Header home button
        document.getElementById('header-home-btn').addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector('.sidebar-link[data-page="sections/dashboard.html"]')?.click();
        });
        
        // === NEW EVENT LISTENER FOR HEADER VENDOR BUTTON ===
        document.getElementById('header-vendor-btn').addEventListener('click', (e) => {
            e.preventDefault();
            const vendorLink = document.querySelector('.sidebar-link[data-page="sections/vendor-dashboard.html"]');
            if (vendorLink) {
                vendorLink.click(); // Sidebar link ko click karein taaki active state bhi update ho
            }
        });

        // Universal Modal close logic
        const modal = document.getElementById('universalModal');
        const closeModal = () => modal.classList.remove('active');
        document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
        document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    } catch (error) {
        showToast("Fatal Error", "Firebase shuru nahi ho saka. Console check karein.", 'error');
        console.error("Firebase Init Error:", error);
    }
});
