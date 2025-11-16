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

// ImgBB API for Image Uploads
const IMGBB_API_KEY = 'f513510bd9ce285f80f9df4d3648451a';
const IMGBB_API_URL = `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`;

const DB_BASE_PATH = 'ramazone';
const ADMIN_EMAIL = 'princekumar954684@gmail.com';

// Global state
let app, db, auth, secondaryApp;
window.ramazoneData = {};
window.allCategoriesCache = []; // Stores just names ['Grocery', 'Mobile']
window.allProductsCache = [];
window.allVendorsCache = {}; 
window.allLocationsCache = []; // Stores location objects/strings
window.allSubCategoriesCache = {}; // Stores { "Grocery": ["Dal", "Rice"], "Mobile": ["Samsung"] }

// --- CORE FUNCTIONS ---

async function loadPage(pageUrl) {
    const mainContentArea = document.getElementById('main-content-area');
    mainContentArea.innerHTML = `<div class="text-center py-20"><div class="loader"></div><p class="text-primary font-medium mt-6">Loading...</p></div>`;

    try {
        const response = await fetch(pageUrl);
        if (!response.ok) throw new Error(`Page not found: ${pageUrl}`);
        const html = await response.text();
        mainContentArea.innerHTML = html;

        // Execute scripts found in the loaded HTML
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

    } catch (error) {
        console.error("Error loading page:", error);
        mainContentArea.innerHTML = `<div class="text-center text-red-500 font-bold p-8">${error.message}</div>`;
    }
}

function initializeAdminPanel() {
    const mainContentArea = document.getElementById('main-content-area');
    
    // Realtime Listener for EVERYTHING
    db.ref(DB_BASE_PATH).on('value', 
        (snapshot) => {
            const data = snapshot.val() || {};
            window.ramazoneData = data;
            
            // 1. Cache Products
            window.allProductsCache = Array.isArray(data.products) ? data.products.map((p, i) => ({...p, id: p.id || `prod-${Date.now()}-${i}`, originalIndex: i})) : [];
            
            // 2. Cache Categories (From Homepage Normal Categories)
            window.allCategoriesCache = (data.homepage?.normalCategories || []).map(c => c.name).filter(Boolean);
            
            // 3. Cache Locations
            const locs = data.locations || [];
            window.allLocationsCache = Array.isArray(locs) ? locs : Object.values(locs);

            // 4. Cache SubCategories
            // Structure in DB: ramazone/subCategories/CategoryName/0...N
            window.allSubCategoriesCache = data.subCategories || {};

            // 5. Cache Vendors
            window.allVendorsCache = data.vendors || {};

            console.log("Firebase data synced & cached.");
            
            // Initial Dashboard Load
            const isInitialLoad = mainContentArea.querySelector('#adminLoadingIndicator');
            if (isInitialLoad) {
                 const dashboardLink = document.querySelector('[data-page="sections/dashboard.html"]');
                 if (dashboardLink) dashboardLink.click();
                 else document.querySelector('.sidebar-link').click();
            }
        }, 
        (error) => {
            showToast('Database Error', `Could not connect: ${error.message}`, 'error');
            mainContentArea.innerHTML = `<div class="text-center text-red-500 font-bold p-8">Database connection failed.</div>`;
        }
    );

    // Sidebar Navigation
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

// --- MODAL FUNCTIONS FOR CREATING DATA ---

// 1. Open Category Modal
window.openCategoryModal = () => {
    const modal = document.getElementById('universalModal');
    document.getElementById('modalTitle').textContent = 'Create New Category';
    document.getElementById('modalBody').innerHTML = `
        <div class="space-y-4">
            <div><label class="form-label">Category Name</label><input type="text" id="new-cat-name" class="form-control" placeholder="e.g. Electronics"></div>
            <div><label class="form-label">Category Image</label><input type="file" id="new-cat-img" class="form-control" accept="image/*"></div>
            <div class="text-xs text-gray-500">Note: This will add to Homepage > Normal Categories</div>
        </div>`;
    
    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.innerHTML = 'Create Category';
    
    saveBtn.onclick = async () => {
        const name = document.getElementById('new-cat-name').value.trim();
        const fileInput = document.getElementById('new-cat-img');
        
        if (!name) return showToast('Error', 'Category Name is required', 'error');
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Uploading...';

        try {
            let imageUrl = 'https://placehold.co/100x100?text=Cat';
            if (fileInput.files[0]) {
                imageUrl = await window.uploadToImgBB(fileInput.files[0]);
            }

            const ref = db.ref(`${DB_BASE_PATH}/homepage/normalCategories`);
            const snapshot = await ref.once('value');
            let cats = snapshot.val() || [];
            if (!Array.isArray(cats)) cats = Object.values(cats);

            // Check duplicate
            if (cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
                throw new Error('Category already exists!');
            }

            cats.push({ name, imageUrl, linkUrl: `./products.html?category=${encodeURIComponent(name)}`, row: 'bottom' });
            await ref.set(cats);
            
            showToast('Success', 'Category Created!', 'success');
            document.getElementById('modalCloseBtn').click();
            
            // Refresh current form selector if open
            const selector = document.getElementById('product-category-selector');
            if (selector) {
                const opt = new Option(name, name);
                opt.selected = true;
                selector.add(opt);
                selector.dispatchEvent(new Event('change')); // Trigger subcat/field logic
            }

        } catch (err) {
            showToast('Error', err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Create Category';
        }
    };
    modal.classList.add('active');
};

// 2. Open Sub-Category Modal (from product-form)
window.openSubCategoryModal = (parentCategory) => {
    if (!parentCategory) return showToast('Warning', 'Please select a parent category first.', 'error');

    const modal = document.getElementById('universalModal');
    document.getElementById('modalTitle').textContent = `Add Sub-Category to ${parentCategory}`;
    document.getElementById('modalBody').innerHTML = `
        <div class="space-y-4">
            <div><label class="form-label">Sub-Category Name</label><input type="text" id="new-subcat-name" class="form-control" placeholder="e.g. Mobile, Rice"></div>
        </div>`;
    
    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.innerHTML = 'Add Sub-Category';
    
    saveBtn.onclick = async () => {
        const name = document.getElementById('new-subcat-name').value.trim();
        if (!name) return showToast('Error', 'Name is required', 'error');
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Saving...';

        try {
            // Using a sanitized path for DB keys
            const catKey = parentCategory.replace(/[.#$/\[\]]/g, "_"); 
            const ref = db.ref(`${DB_BASE_PATH}/subCategories/${catKey}`);
            
            const snapshot = await ref.once('value');
            let subs = snapshot.val() || [];
            if (!Array.isArray(subs)) subs = Object.values(subs);

            if (!subs.includes(name)) {
                subs.push(name);
                await ref.set(subs);
                showToast('Success', 'Sub-Category Added!', 'success');
                document.getElementById('modalCloseBtn').click();
                
                // Update selector immediately
                const selector = document.getElementById('product-subcategory-selector');
                if (selector) {
                    const opt = new Option(name, name);
                    opt.selected = true;
                    selector.add(opt);
                }
            } else {
                showToast('Info', 'Sub-Category already exists.', 'info');
            }

        } catch (err) {
            showToast('Error', err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Add Sub-Category';
        }
    };
    modal.classList.add('active');
};

// 3. Open Location Modal
window.openLocationModal = () => {
    const modal = document.getElementById('universalModal');
    document.getElementById('modalTitle').textContent = 'Add New Delivery Location';
    document.getElementById('modalBody').innerHTML = `
        <div class="space-y-4">
            <div><label class="form-label">Location Name</label><input type="text" id="new-loc-name" class="form-control" placeholder="e.g. Suja, Begusarai"></div>
        </div>`;
    
    const saveBtn = document.getElementById('modalSaveBtn');
    saveBtn.innerHTML = 'Add Location';
    
    saveBtn.onclick = async () => {
        const name = document.getElementById('new-loc-name').value.trim();
        if (!name) return showToast('Error', 'Location Name is required', 'error');
        
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Saving...';

        try {
            const ref = db.ref(`${DB_BASE_PATH}/locations`);
            const snapshot = await ref.once('value');
            let locs = snapshot.val() || [];
            // Normalize data structure if mixed
            if (!Array.isArray(locs)) locs = Object.values(locs);

            // Check if exists (case insensitive)
            const exists = locs.some(l => {
                const lName = typeof l === 'string' ? l : l.name;
                return lName.toLowerCase() === name.toLowerCase();
            });

            if (exists) throw new Error('Location already exists!');

            // Push new object
            locs.push({ name: name, addedAt: new Date().toISOString() });
            await ref.set(locs);
            
            showToast('Success', 'Location Added!', 'success');
            document.getElementById('modalCloseBtn').click();
            
            // UI will auto-update because of global listener in product form (if implemented), 
            // but we can trigger a re-render if needed inside the form.
            // Since product-form.html re-renders checkboxes on load, simple refresh or smart check is good.
            // Ideally, the realtime listener updates cache, and if we re-open form, it's there.

        } catch (err) {
            showToast('Error', err.message, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Add Location';
        }
    };
    modal.classList.add('active');
};

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
    saveBtn.onclick = handleVendorRegistration;
    modal.classList.add('active');
};

// --- NEW SUB-CATEGORY MANAGER MODAL ---
window.openSubCategoryManagerModal = async (categoryName) => {
    const modal = document.getElementById('universalModal');
    const modalBody = document.getElementById('modalBody');
    const modalSaveBtn = document.getElementById('modalSaveBtn');
    document.getElementById('modalTitle').textContent = `Manage Sub-categories for "${categoryName}"`;

    // Sanitize category name for Firebase key
    const catKey = categoryName.replace(/[.#$/\[\]]/g, "_");
    const ref = db.ref(`${DB_BASE_PATH}/subCategories/${catKey}`);

    // Get current sub-categories from cache or fetch
    let currentSubs = window.allSubCategoriesCache[catKey] || [];
    if (!Array.isArray(currentSubs)) {
        currentSubs = Object.values(currentSubs);
    }
    
    // Function to render the list UI
    const renderList = (subs) => {
        return subs.map((sub, index) => `
            <div class="flex items-center justify-between p-2 border rounded-md bg-white mb-2 subcat-item">
                <span class="font-medium text-gray-700">${sub}</span>
                <button type="button" class="text-red-500 hover:text-red-700 font-bold remove-subcat-btn" data-name="${sub}" title="Remove">
                    <i class="fas fa-times-circle"></i>
                </button>
            </div>
        `).join('');
    };

    // Set modal body HTML
    modalBody.innerHTML = `
        <div id="subcat-list-manager" class="max-h-60 overflow-y-auto bg-gray-50 p-3 rounded-lg border">
            ${currentSubs.length > 0 ? renderList(currentSubs) : '<p class="text-gray-500 text-sm text-center py-4">No sub-categories yet.</p>'}
        </div>
        <div class="mt-4 pt-4 border-t">
            <label class="form-label">Add New Sub-category</label>
            <div class="flex gap-2">
                <input type="text" id="new-subcat-manager-name" class="form-control" placeholder="e.g. T-Shirts, Dal">
                <button type="button" id="add-new-subcat-ui-btn" class="btn btn-primary whitespace-nowrap"><i class="fas fa-plus mr-1"></i> Add</button>
            </div>
        </div>
    `;

    const listContainer = modalBody.querySelector('#subcat-list-manager');
    const addInput = modalBody.querySelector('#new-subcat-manager-name');
    const addBtn = modalBody.querySelector('#add-new-subcat-ui-btn');

    // Handle adding new item to UI
    const addSubToUI = () => {
        const name = addInput.value.trim();
        if (!name) return;

        // Check if it already exists in the UI list
        const
        existingItems = Array.from(listContainer.querySelectorAll('.subcat-item span')).map(s => s.textContent);
        if (existingItems.includes(name)) {
            showToast('Info', 'This sub-category is already in the list.', 'info');
            return;
        }

        if (listContainer.querySelector('p')) {
            listContainer.innerHTML = ''; // Clear "No sub-categories" message
        }
        
        const newItemHTML = `
            <div class="flex items-center justify-between p-2 border rounded-md bg-white mb-2 subcat-item">
                <span class="font-medium text-gray-700">${name}</span>
                <button type="button" class="text-red-500 hover:text-red-700 font-bold remove-subcat-btn" data-name="${name}" title="Remove">
                    <i class="fas fa-times-circle"></i>
                </button>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', newItemHTML);
        addInput.value = '';
        addInput.focus();
    };

    addBtn.onclick = addSubToUI;
    addInput.onkeydown = (e) => { if (e.key === 'Enter') addSubToUI(); };

    // Handle removing item from UI (event delegation)
    listContainer.onclick = (e) => {
        const removeBtn = e.target.closest('.remove-subcat-btn');
        if (removeBtn) {
            removeBtn.closest('.subcat-item').remove();
            if (listContainer.children.length === 0) {
                listContainer.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No sub-categories yet.</p>';
            }
        }
    };

    // Handle final save
    modalSaveBtn.innerHTML = 'Save Changes';
    modalSaveBtn.onclick = async () => {
        modalSaveBtn.disabled = true;
        modalSaveBtn.innerHTML = 'Saving...';

        try {
            // Collect all items from the UI list
            const updatedSubs = Array.from(listContainer.querySelectorAll('.subcat-item span')).map(s => s.textContent);
            
            // Save to Firebase
            await ref.set(updatedSubs);
            
            // Update global cache
            window.allSubCategoriesCache[catKey] = updatedSubs;
            
            showToast('Success', `Sub-categories for "${categoryName}" updated!`, 'success');
            document.getElementById('modalCloseBtn').click();
        } catch (err) {
            showToast('Error', `Could not save: ${err.message}`, 'error');
        } finally {
            modalSaveBtn.disabled = false;
            modalSaveBtn.innerHTML = 'Save Changes';
        }
    };

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
    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch(IMGBB_API_URL, { method: 'POST', body: formData });
        const result = await response.json();

        if (result.success) {
            console.log('ImgBB Upload Success:', result.data.url);
            return result.data.url; 
        } else {
            throw new Error(result.error.message || 'Unknown error from ImgBB');
        }
    } catch (error) {
        console.error('Image Upload Error:', error);
        showToast('Upload Failed', `Image could not be uploaded: ${error.message}`, 'error');
        return null;
    }
};

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        auth = firebase.auth();
        secondaryApp = firebase.initializeApp(firebaseConfig, 'secondary-auth');
        
        // Passcode Login Logic
        const passcodeForm = document.getElementById('passcodeForm');
        if (passcodeForm) {
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
        }
        
        // Sidebar Logic
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const sidebarToggle = document.getElementById('sidebarToggle');
        
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => { 
                sidebar.classList.toggle('-translate-x-full'); 
                sidebarOverlay.classList.toggle('hidden'); 
            });
        }
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => { 
                sidebar.classList.add('-translate-x-full'); 
                sidebarOverlay.classList.add('hidden'); 
            });
        }

        // Header Buttons
        const homeBtn = document.getElementById('header-home-btn');
        if (homeBtn) {
            homeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelector('.sidebar-link[data-page="sections/dashboard.html"]')?.click();
            });
        }
        
        const vendorBtn = document.getElementById('header-vendor-btn');
        if (vendorBtn) {
            vendorBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const vendorLink = document.querySelector('.sidebar-link[data-page="sections/vendor-dashboard.html"]');
                if (vendorLink) vendorLink.click();
            });
        }

        // Modal Logic
        const modal = document.getElementById('universalModal');
        const closeModal = () => modal.classList.remove('active');
        document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
        document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    } catch (error) {
        showToast("Fatal Error", "Firebase initialization failed.", 'error');
        console.error("Firebase Init Error:", error);
    }
});