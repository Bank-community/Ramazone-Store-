// --- Firebase modules import ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, orderBy, runTransaction, increment, limit, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- App Initialization and Global Variables ---
let app, auth, db;
let imgbbApiKey; // Yeh config se load hoga

// ======================= PWA Install & Update Logic START =======================
let deferredPrompt; 

/**
 * Check karein ki PWA installed hai ya nahi.
 */
async function isPwaInstalled() {
    if ('getInstalledRelatedApps' in navigator) {
        try {
            const relatedApps = await navigator.getInstalledRelatedApps();
            const isInstalled = relatedApps.some(app => app.id === '/Cashback/'); // Manifest ID se match karein
            console.log(isInstalled ? 'Manifest ID ke anusaar PWA installed hai.' : 'Manifest ID ke anusaar PWA installed nahi hai.');
            return isInstalled;
        } catch (error) {
            console.error('Error checking getInstalledRelatedApps:', error);
            // Fallback agar API fail hota hai
            return window.matchMedia('(display-mode: standalone)').matches;
        }
    }
    console.log('Fallback (display-mode) se installation status check kiya ja raha hai.');
    return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * PWA install button ko setup karein.
 */
async function setupPwaInstallButton() {
    const installBtn = document.getElementById('install-pwa-btn');
    if (!installBtn) return;

    const installed = await isPwaInstalled();
    if (installed) {
        console.log('PWA pehle se installed hai. Install button nahi dikhega.');
        installBtn.style.display = 'none';
        return;
    }

    // Install prompt ko listen karein
    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('`beforeinstallprompt` event fire hua.');
        e.preventDefault(); // Prompt ko automatic dikhne se rokein
        deferredPrompt = e; // Prompt ko save karein
        installBtn.style.display = 'flex'; // Button dikhayein
    });
}

/**
 * Install button click ko handle karein.
 */
function handleInstallClick() {
    const installBtn = document.getElementById('install-pwa-btn');
    if (!deferredPrompt) {
        console.log('deferredPrompt available nahi hai.');
        return;
    }
    
    installBtn.style.display = 'none'; // Button chhupayein
    deferredPrompt.prompt(); // Install prompt dikhayein
    
    // User ke choice ka wait karein
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('User ne PWA install kar liya.');
        } else {
            console.log('User ne install prompt ko dismiss kar diya.');
        }
        deferredPrompt = null; // Prompt ko clear karein
    });
}

// App install hone ke baad event listen karein
window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) {
        installBtn.style.display = 'none';
    }
    deferredPrompt = null;
    console.log('PWA safaltapoorvak install ho gaya!');
});
// ======================= PWA Install & Update Logic END =======================


// --- Global State Variables ---
let currentUser = null;
let currentUserData = null;
let combinedHistory = []; // Sabhi history items ke liye global store
let activeListeners = []; // Realtime listeners ko track karne ke liye
let scannerAnimation = null; // QR scanner animation frame
let allTransactions = [];
let allNotifications = []; // Bheje gaye notifications
let activeFilter = 'all';
let pendingAction = null; // Password verification ke baad run hone wala action
let isUplineLoaded = false;
let popupTimeout = null;
let initialPopupShown = false;
const commissionRates = [30, 25, 20, 15, 10]; // Legacy (unused)
let historyStack = [];
const networkLoader = document.getElementById('network-loader');
const networkTitleEl = document.getElementById('network-title');
const UPI_ID = "princekumar954684-1@okicici"; // Due payment UPI ID
const RAMAZONE_STORE_ID = '@RamazoneStoreCashback'; // Store payment QR ID

// --- Core Functions (Config, UI Toggles) ---

/**
 * Firebase config fetch karein aur app ko initialize karein.
 */
async function fetchConfigsAndInit() {
    try {
        // Hardcoded config (jaisa pehle tha)
        const firebaseConfig = {
            apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
            authDomain: "tipsplit-e3wes.firebaseapp.com",
            projectId: "tipsplit-e3wes",
            storageBucket: "tipsplit-e3wes.appspot.com",
            appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
        };
        // Dummy ImgBB key
        imgbbApiKey = "DUMMY_API_KEY_FOR_IMGBB"; 

        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        initializeAppLogic(); // Baaki ka app logic start karein
    } catch (error) {
        console.error("Critical Initialization Error:", error);
        document.body.innerHTML = `<div style="text-align: center; padding: 40px; font-family: 'Poppins', sans-serif;"><h2>Application Error</h2><p>Could not load settings. Please try again later.</p></div>`;
    }
}

/**
 * Screen par ek chhota notification (toast) dikhayein.
 * @param {string} message - Dikhane wala message.
 */
const showToast = (message) => {
    const toast = document.getElementById('toast-notification');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
};

/**
 * Alag-alag app views (pages) ke beech switch karein.
 * @param {string} viewId - Dikhane wale view ki ID.
 */
const toggleView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewElement = document.getElementById(viewId);
    if(viewElement) {
        viewElement.classList.add('active');
    }
};

/**
 * Ek modal (popup) kholein.
 * @param {string} modalId - Kholne wale modal ki ID.
 */
const openModal = (modalId) => document.getElementById(modalId)?.classList.add('active');

/**
 * Ek modal (popup) band karein.
 * @param {string} modalId - Band karne wale modal ki ID.
 */
const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
    if (modalId === 'scan-pay-modal') {
        stopScanner(); // Agar scan modal hai, toh scanner band karein
    }
};

/**
 * Form mein error message dikhayein.
 * @param {HTMLElement} element - Error message dikhane wala P element.
 * @param {string} message - Error message.
 */
const showErrorMessage = (element, message) => { if (element) { element.textContent = message; element.style.display = 'block'; } };

/**
 * Form se error message hatayein.
 * @param {HTMLElement} element - Error message wala P element.
 */
const hideErrorMessage = (element) => { if (element) { element.style.display = 'none'; } };

// --- Realtime Data Handling ---

/**
 * User ke data ke liye realtime listeners attach karein.
 * @param {object} user - Firebase auth user object.
 */
function attachRealtimeListeners(user) {
    detachAllListeners(); // Purane listeners ko hatayein
    const uid = user.uid;
    
    const validTypes = ['payment', 'due_payment', 'credit_given']; 

    const listeners = [
        // User document listener
        onSnapshot(doc(db, 'users', uid), (doc) => {
            if (doc.exists()) {
                currentUserData = { uid: doc.id, ...doc.data() };
                updateDashboardUI(currentUserData, user);
                renderNotificationCenter();
                if (!initialPopupShown) {
                    handleDueNotificationPopup(currentUserData);
                    initialPopupShown = true;
                }
            }
        }),
        // Transactions listener
        onSnapshot(query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc")), (snapshot) => {
            allTransactions = snapshot.docs
                .map(doc => ({ ...doc.data(), id: doc.id, date: doc.data().timestamp?.toDate() }))
                .filter(t => validTypes.includes(t.type));
            combineAndRenderHistory();
        }),
        // Admin Notifications listener
        onSnapshot(query(collection(db, "notifications"), orderBy("createdAt", "desc")), (snapshot) => {
            allNotifications = snapshot.docs
                .map(doc => ({ ...doc.data(), id: doc.id, date: doc.data().createdAt?.toDate() }));
            renderNotificationCenter();
        }),
    ];
    activeListeners.push(...listeners);
}

/**
 * Sabhi active realtime listeners ko band karein (logout par).
 */
function detachAllListeners() {
    activeListeners.forEach(unsub => unsub());
    activeListeners = [];
    initialPopupShown = false;
}

// --- UI Update and Notification Logic ---

/**
 * Dashboard UI ko user ke data se update karein.
 * @param {object} dbData - Firestore se user ka data.
 * @param {object} authUser - Firebase auth se user ka data.
 */
function updateDashboardUI(dbData, authUser) {
    const profilePicUrl = dbData.profilePictureUrl || `https://placehold.co/40x40/e50914/FFFFFF?text=${authUser.displayName.charAt(0)}`;
    document.getElementById('header-profile-avatar').src = profilePicUrl;
    document.getElementById('wallet-user-name').textContent = authUser.displayName;
    document.getElementById('modal-profile-img').src = profilePicUrl;
    document.getElementById('wallet-balance').textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹ ${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    document.getElementById('credit-limit').textContent = `₹ ${(dbData.totalCreditGiven || 0).toFixed(2)}`;
    document.getElementById('due-amount').textContent = `₹ ${(dbData.dueAmount || 0).toFixed(2)}`;
    document.getElementById('profile-payment-id').textContent = `${dbData.mobile}@RMZ`;
    
    const payDueBtn = document.getElementById('pay-due-amount-btn');
    payDueBtn.style.display = dbData.dueAmount > 0 ? 'block' : 'none';
}

/**
 * Check karein ki due notification dikhana hai ya nahi.
 * @param {object} dbData - Firestore user data.
 * @returns {object|null} Notification data ya null.
 */
function getDueNotificationData(dbData) {
    if (!dbData) return null;
    const today = new Date();
    const dayOfMonth = today.getDate();
    // Due period (1st se 7th)
    if (dbData.dueAmount > 0 && dayOfMonth >= 1 && dayOfMonth <= 7) {
        return {
            id: 'due_notification_priority',
            title: `Payment Due: ₹${dbData.dueAmount.toFixed(2)}`,
            popupTitle: `Namaste ${dbData.name}, aapka bhugtan baki hai.`,
            popupPercentage: `Amount: ₹${dbData.dueAmount.toFixed(2)}`,
            paragraph: `Kripya apna ₹${dbData.dueAmount.toFixed(2)} ka due amount 7 tarikh se pehle pay karein. Dhanyavad!`,
            isDue: true
        };
    }
    return null;
}

/**
 * Login par due notification popup dikhayein (agar zaroori ho).
 * @param {object} dbData - Firestore user data.
 */
function handleDueNotificationPopup(dbData) {
    const dueNotification = getDueNotificationData(dbData);
    if (dueNotification) {
        showPopupNotification({
            popupBgColor: 'var(--due-red)',
            popupTextColor: 'white',
            popupIcon: '⚠️',
            popupTitle: dueNotification.popupTitle,
            popupPercentage: dueNotification.popupPercentage
        }, 4000);
    }
}

/**
 * Screen ke top par aane wala popup notification dikhayein.
 * @param {object} notifData - Notification ka data (colors, text, icon).
 * @param {number} duration - Kitni der dikhana hai (ms mein).
 */
function showPopupNotification(notifData, duration = 4000) {
     if (popupTimeout) clearTimeout(popupTimeout);
     const popup = document.getElementById('popup-notification');
     popup.style.backgroundColor = notifData.popupBgColor || '#333';
     popup.style.color = notifData.popupTextColor || 'white';
     document.getElementById('popup-notification-icon').textContent = notifData.popupIcon || '🔥';
     document.getElementById('popup-notification-title').innerHTML = (notifData.popupTitle || '').replace('|', '<br>');
     document.getElementById('popup-notification-percentage').textContent = notifData.popupPercentage || '';
     document.getElementById('popup-notification-close').style.color = notifData.popupTextColor || 'white';
     popup.classList.add('show');
     popupTimeout = setTimeout(() => popup.classList.remove('show'), duration);
}

/**
 * Notification Center (poora page) ko render karein.
 */
async function renderNotificationCenter() {
    const listEl = document.getElementById('notification-center-list');
    listEl.innerHTML = '';
    
    const notificationsToRender = [];
    
    // 1. Due Payment Notification add karein
    const dueNotification = getDueNotificationData(currentUserData);
    if (dueNotification) {
        notificationsToRender.push(dueNotification);
    }
    
    // 2. Admin se bheje gaye Notifications add karein
    notificationsToRender.push(...allNotifications);

    if (notificationsToRender.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No new notifications right now.</p>';
        return;
    }

    // Sort karein (Due sabse upar, fir baaki date ke hisaab se)
    notificationsToRender.sort((a, b) => {
        if (a.isDue && !b.isDue) return -1;
        if (!a.isDue && b.isDue) return 1;
        if (a.date && b.date) return b.date - a.date;
        return 0;
    });


    notificationsToRender.forEach(notif => {
        const item = document.createElement('div');
        item.className = 'notification-center-item';
        
        if (notif.isDue) {
            item.classList.add('due-notification-item');
            item.innerHTML = `
                <div class="title" style="color: var(--due-red);">${notif.title}</div>
                <p class="paragraph">${notif.paragraph}</p>
                <div style="margin-top: 15px;">
                    <button class="btn-secondary" style="background-color: var(--brand-red); color: white; width: auto; padding: 8px 15px; font-size: 14px; border-radius: 20px;" onclick="document.getElementById('pay-due-amount-btn').click(); toggleView('dashboard-view');">Pay Due Now</button>
                </div>
            `;
        } 
        else {
            const linkHtml = notif.link ? `<a href="${notif.link}" target="_blank"> ${notif.title}</a>` : notif.title;
            item.innerHTML = `
                <div class="title">${linkHtml}</div>
                <p class="paragraph">${notif.text.replace(/\n/g, '<br>')}</p>
                <p style="font-size: 12px; color: var(--text-secondary); margin-top: 10px;">${notif.date.toLocaleString()}</p>
            `;
        }
        
        listEl.appendChild(item);
    });
}

/**
 * Sabhi transactions ko combine karke render karein.
 */
function combineAndRenderHistory() {
    combinedHistory = allTransactions.sort((a, b) => (b.date || 0) - (a.date || 0));
    renderUnifiedHistory();
}

/**
 * Transaction history list ko filter ke hisaab se render karein.
 */
function renderUnifiedHistory() {
    const listEl = document.getElementById('unified-history-list');
    const summaryAmountEl = document.getElementById('summary-total-amount');
    const summaryLabelEl = document.getElementById('summary-filter-label');
    listEl.innerHTML = '';

    const filterLabels = {
        all: "All Transactions",
        payment: "Total Payments",
        due_payment: "Total Due Paid",
        credit_given: "Total Credit Received"
    };

    const itemsToRender = combinedHistory.filter(item => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'payment') return item.type === 'payment';
        if (activeFilter === 'due_payment') return item.type === 'due_payment';
        if (activeFilter === 'credit_given') return item.type === 'credit_given';
        return false;
    });
    
    let totalAmount = 0;
    itemsToRender.forEach(item => {
        const amount = item.amount || 0;
        totalAmount += amount; 
    });

    summaryLabelEl.textContent = `${filterLabels[activeFilter]}:`;
    summaryAmountEl.textContent = `₹ ${totalAmount.toFixed(2)}`;

    if (totalAmount > 0) {
        summaryAmountEl.style.color = 'var(--accent-green)';
    } else if (totalAmount < 0) {
        summaryAmountEl.style.color = 'var(--due-red)';
    } else {
        summaryAmountEl.style.color = 'var(--text-primary)';
    }

    if (itemsToRender.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="padding: 20px 0; text-align:center; color: var(--text-secondary);">No Transactions Found for this filter.</div>`;
        return;
    }

    itemsToRender.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-item';
        
        itemDiv.style.cursor = 'pointer'; // Clickable dikhane ke liye
        itemDiv.addEventListener('click', () => showTransactionDetails(item));
        
        const amount = item.amount || 0;
        let sign = '+';
        let typeClass = 'credit';
        
        if(item.type === 'payment' || item.type === 'due_payment') { 
            typeClass = 'debit'; 
            sign = '-'; 
        } else if (item.type === 'credit_given') {
            typeClass = 'credit'; 
            sign = '+';
        }

        const displayAmount = Math.abs(amount).toFixed(2);
        if (item.status === 'rejected' || item.status === 'refunded') { typeClass = 'rejected'; }
        
        const title = item.type === 'credit_given' ? `Admin Credit` : item.description;

        itemDiv.innerHTML = `<div class="history-details"><div class="history-info"><div class="title">${title}</div><div class="date">${item.date ? item.date.toLocaleDateString() : 'N/A'}</div></div></div><div class="history-amount"><div class="amount ${typeClass}">${sign} ₹${displayAmount}</div><span class="status">${item.status || 'Completed'}</span></div>`;
        listEl.appendChild(itemDiv);
    });
}

/**
 * Transaction Details ka popup dikhayein (Naye layout ke saath).
 * @param {object} item - Click kiya gaya transaction item.
 */
function showTransactionDetails(item) {
    const amount = item.amount || 0;
    let sign = '+', typeClass = 'credit';
    let description = item.description;
    
    if (item.type === 'payment' || item.type === 'due_payment') { 
        sign = '-'; 
        typeClass = 'debit'; 
    } else if (item.type === 'credit_given') {
        sign = '+';
        typeClass = 'credit';
        description = "Credit received from Ramazone Admin";
    }
    
    // Amount aur basic details set karein
    document.getElementById('details-modal-amount').textContent = `${sign} ₹${Math.abs(amount).toFixed(2)}`;
    document.getElementById('details-modal-amount').style.color = typeClass === 'credit' ? 'var(--accent-green)' : 'var(--brand-red)';
    const statusEl = document.getElementById('details-modal-status');
    statusEl.textContent = item.status || 'Completed';
    statusEl.className = 'value status-badge';
    if (item.status) statusEl.classList.add(item.status);

    document.getElementById('details-modal-desc').textContent = description;
    document.getElementById('details-modal-date').textContent = item.date ? item.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
    document.getElementById('details-modal-time').textContent = item.date ? item.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';
    
    // Naye Transaction ID box mein ID set karein
    document.getElementById('details-modal-txn-id-box').textContent = item.id;
    
    // Naye buttons ke liye event listeners (purane listeners hatakar)
    // Purane button ko clone karke naya banao taaki purana event listener nikal jaaye
    const oldCopyBtn = document.getElementById('details-copy-txn-id-btn');
    const newCopyBtn = oldCopyBtn.cloneNode(true); // Clone karke listener hatayein
    oldCopyBtn.parentNode.replaceChild(newCopyBtn, oldCopyBtn);
    newCopyBtn.addEventListener('click', () => handleCopyTxnId(item.id));
    
    const oldDownloadBtn = document.getElementById('details-download-receipt-btn');
    const newDownloadBtn = oldDownloadBtn.cloneNode(true);
    oldDownloadBtn.parentNode.replaceChild(newDownloadBtn, oldDownloadBtn);
    newDownloadBtn.addEventListener('click', () => handleDownloadReceipt(item.id));
    
    openModal('transaction-details-modal');
}

/**
 * Transaction ID ko clipboard par copy karein.
 * @param {string} txnId - Copy karne wali ID.
 */
function handleCopyTxnId(txnId) {
    if (!navigator.clipboard) {
        showToast("Copying not supported on this device.");
        return;
    }
    navigator.clipboard.writeText(txnId).then(() => {
        showToast("Transaction ID Copied!");
    }, (err) => {
        showToast("Failed to copy ID.");
        console.error('Failed to copy text: ', err);
    });
}

/**
 * Transaction receipt ka screenshot download karein.
 * @param {string} txnId - Transaction ID (filename ke liye).
 */
function handleDownloadReceipt(txnId) {
    const receiptElement = document.querySelector('#transaction-details-modal .modal-content');
    const downloadBtn = document.getElementById('details-download-receipt-btn');
    const closeBtn = document.querySelector('#transaction-details-modal .action-btn[data-close-modal]');
    const copyBtn = document.getElementById('details-copy-txn-id-btn');
    
    // Screenshot ke liye buttons ko chhupayein
    if(downloadBtn) downloadBtn.style.visibility = 'hidden';
    if(closeBtn) closeBtn.style.visibility = 'hidden';
    if(copyBtn) copyBtn.style.visibility = 'hidden';
    
    showToast("Downloading receipt...");

    html2canvas(receiptElement, { 
        scale: 2, // Behtar quality
        useCORS: true,
        onclone: (doc) => {
            // Cloned document mein bhi buttons ko chhupayein
            const clonedDownloadBtn = doc.getElementById('details-download-receipt-btn');
            if (clonedDownloadBtn) clonedDownloadBtn.style.visibility = 'hidden';
            const clonedCloseBtn = doc.querySelector('#transaction-details-modal .action-btn[data-close-modal]');
            if (clonedCloseBtn) clonedCloseBtn.style.visibility = 'hidden';
            const clonedCopyBtn = doc.getElementById('details-copy-txn-id-btn');
            if (clonedCopyBtn) clonedCopyBtn.style.visibility = 'hidden';
        }
    }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Ramazone-Receipt-${txnId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }).catch(err => {
        console.error("Error downloading receipt:", err);
        showToast("Download failed.");
    }).finally(() => {
        // Buttons ko wapas dikhayein
        if(downloadBtn) downloadBtn.style.visibility = 'visible';
        if(closeBtn) closeBtn.style.visibility = 'visible';
        if(copyBtn) copyBtn.style.visibility = 'visible';
    });
}
// --- END NEW Helpers ---


// --- Feature Logic (Payment, QR, etc.) ---

/**
 * Due Payment ke liye QR code generate karein aur modal kholein.
 */
function generateDueQR() {
    if (!currentUserData || currentUserData.dueAmount <= 0) {
        showToast("No due amount to pay.");
        return;
    }
    const amount = currentUserData.dueAmount;
    const upiLink = `upi://pay?pa=${UPI_ID}&pn=Ramazone%20Cashback&am=${amount.toFixed(2)}&cu=INR&tn=DuePaymentFor-${currentUserData.mobile}`;
    const qrContainer = document.getElementById('due-qr-code');
    qrContainer.innerHTML = ''; 
    
    new QRCode(qrContainer, {
        text: upiLink,
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
    document.getElementById('due-qr-amount').textContent = `Pay: ₹ ${amount.toFixed(2)}`;
    document.getElementById('due-qr-upi-id').textContent = UPI_ID;
    openModal('due-payment-modal');
}

/**
 * Due Payment QR card ko download karein.
 */
function downloadQRCard() {
    const cardElement = document.getElementById('due-qr-card');
    if (!cardElement) {
        showToast("QR Card element not found.");
        return;
    }
    showToast("Preparing download...");
    html2canvas(cardElement, { scale: 3, useCORS: true }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Ramazone-Due-Payment-${currentUserData.dueAmount.toFixed(2)}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }).catch(err => {
        console.error("Error downloading QR card:", err);
        showToast("Download failed. Please try again.");
    });
}

/**
 * Profile picture upload ko handle karein.
 * @param {Event} event - File input change event.
 */
async function handleProfilePictureUpload(event) {
    const file = event.target.files[0];
    if (!file || !currentUser) return;
    if (!imgbbApiKey) { showToast("Image hosting service is not available."); return; }
    showToast("Uploading picture...");
    const formData = new FormData();
    formData.append("image", file);
    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKey}`, { method: "POST", body: formData });
        const result = await response.json();
        if (result.success) {
            const imageUrl = result.data.url;
            await updateDoc(doc(db, "users", currentUser.uid), { profilePictureUrl: imageUrl });
            showToast("Profile picture updated!");
        } else { throw new Error(result.error.message || "Failed to upload image."); }
    } catch (error) {
        console.error("Image upload failed:", error);
        showToast("Upload failed. Please try again.");
    } finally { event.target.value = ''; }
}

/**
 * Koi bhi action karne se pehle password verify karein.
 * @param {Function} action - Password sahi hone par run hone wala function.
 * @param {string} [sourceModalId] - Agar koi modal khula hai toh use band karne ke liye ID.
 */
function verifyPasswordAndExecute(action, sourceModalId) {
    if (sourceModalId) closeModal(sourceModalId);
    pendingAction = action;
    openModal('password-verification-modal');
}

/**
 * Password verification modal ke confirm button ko handle karein.
 */
async function handleVerificationConfirm() {
    const password = document.getElementById('verification-password').value;
    const errorMsg = document.getElementById('verification-error-msg');
    hideErrorMessage(errorMsg);
    if (!password) return showErrorMessage(errorMsg, "Password is required.");
    const confirmBtn = document.getElementById('verification-confirm-btn');
    confirmBtn.disabled = true; confirmBtn.textContent = "Verifying...";
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, password);
    try {
        await reauthenticateWithCredential(user, credential);
        closeModal('password-verification-modal');
        if (pendingAction) await pendingAction();
    } catch (error) {
        showErrorMessage(errorMsg, "Incorrect password.");
    } finally {
        confirmBtn.disabled = false; confirmBtn.textContent = "Confirm";
        document.getElementById('verification-password').value = '';
        pendingAction = null;
    }
}

/**
 * Payment process ko handle karein (THEEK KIYA GAYA LOGIC).
 */
async function handlePayment() {
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const errorMsg = document.getElementById('payment-error-msg');
    hideErrorMessage(errorMsg);
    if (isNaN(amount) || amount < 5) return showErrorMessage(errorMsg, "Minimum payment is ₹5.");
    if (currentUserData.wallet < amount) return showErrorMessage(errorMsg, "Insufficient balance.");
    
    let newTxnRef = doc(collection(db, "transactions")); 

    verifyPasswordAndExecute(async () => {
        try {
            closeModal('scan-pay-modal'); 

            // Firebase Transaction shuru karein
            await runTransaction(db, async (t) => {
                const userRef = doc(db, 'users', currentUserData.uid);
                const configRef = doc(db, 'app_settings', 'config');
                // 1. User ka wallet update (debit)
                t.update(userRef, { wallet: increment(-amount) });
                // 2. Admin ka wallet update (credit)
                t.set(configRef, { rmz_wallet_balance: increment(amount) }, { merge: true });
                // 3. User ke liye transaction record
                t.set(newTxnRef, { 
                    type: 'payment', 
                    amount: -amount, // User ke liye negative
                    description: 'Paid to Ramazone Store', 
                    status: 'completed', 
                    timestamp: serverTimestamp(), 
                    involvedUsers: [currentUserData.uid] 
                });
                // 4. Admin ke liye transaction record
                t.set(doc(collection(db, "rmz_wallet_transactions")), { 
                    amount, // Admin ke liye positive
                    senderId: currentUserData.uid, 
                    senderName: currentUserData.name, 
                    senderMobile: currentUserData.mobile, 
                    timestamp: serverTimestamp() 
                });
            });
            
            // --- SUCCESS LOGIC (THEEK KIYA GAYA) ---
            const now = new Date();
            document.getElementById('success-modal-amount').textContent = `₹ ${amount.toFixed(2)}`;
            document.getElementById('success-modal-receiver').textContent = 'Ramazone Store';
            document.getElementById('success-modal-txn-id').textContent = newTxnRef.id;
            document.getElementById('success-modal-datetime').textContent = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
            // Ab sahi modal call hoga
            openModal('payment-success-modal');

        } catch (error) { 
            // --- FAILURE LOGIC (THEEK KIYA GAYA) ---
            console.error("Payment transaction failed during Firestore transaction:", error);
            // Ab sahi failure modal call hoga
            openModal('payment-failure-modal'); 
        }
    });
}
// --- END handlePayment FIX ---


// --- RMZ Pay Modal (Scan/Direct) Logic ---

/**
 * Scan QR view dikhayein.
 */
function showScanView() {
    stopScanner(); // Pehle scanner band karein
    document.getElementById('qr-scanner-section').style.display = 'block';
    document.getElementById('payment-form').style.display = 'none';
    document.getElementById('select-scan-btn').classList.add('active');
    document.getElementById('select-direct-pay-btn').classList.remove('active');
    document.getElementById('rescan-btn').style.display = 'none'; 
    document.getElementById('receiver-id-display').textContent = '...'; 
    document.getElementById('payment-amount').value = '';
    hideErrorMessage(document.getElementById('payment-error-msg'));
    startScanner(); // Scanner chalu karein
}

/**
 * Direct Payment (bina scan) view dikhayein.
 */
function showDirectPayView() {
    stopScanner(); // Scanner band karein
    document.getElementById('qr-scanner-section').style.display = 'none';
    document.getElementById('payment-form').style.display = 'block';
    document.getElementById('select-direct-pay-btn').classList.add('active');
    document.getElementById('select-scan-btn').classList.remove('active');
    
    document.getElementById('receiver-id-display').textContent = 'Ramazone Store';
    document.getElementById('rescan-btn').style.display = 'none'; 
    
    document.getElementById('payment-amount').value = '';
    hideErrorMessage(document.getElementById('payment-error-msg'));
}

/**
 * Dashboard par "RMZ Pay" button click ko handle karein.
 */
function handleRmzPayButtonClick() {
    openModal('scan-pay-modal');
    showScanView(); // Default mein Scan view dikhayein
}

// --- Scanner/QR Code Functions ---

/**
 * QR code scan successful hone par handle karein.
 * @param {string} data - QR code se mila data.
 */
async function handleSuccessfulScan(data) {
    // Sirf Ramazone Store ka QR hi accept karein
    if (data !== RAMAZONE_STORE_ID) {
        showToast("Invalid QR code scanned. Only Ramazone Store QR is accepted.");
        startScanner(); // Scanning jaari rakhein
        return;
    }
    
    stopScanner();
    
    // Scan ke baad payment form dikhayein
    document.getElementById('qr-scanner-section').style.display = 'none';
    document.getElementById('payment-form').style.display = 'block';
    document.getElementById('select-scan-btn').classList.add('active');
    document.getElementById('select-direct-pay-btn').classList.remove('active');
    document.getElementById('receiver-id-display').textContent = 'Ramazone Store'; 
    document.getElementById('rescan-btn').style.display = 'block'; 
    document.getElementById('scanner-status').textContent = 'QR Code Scanned!';
}

/**
 * QR code scanner ko start karein.
 */
function startScanner() {
    stopScanner();
    const video = document.getElementById('scanner-video');
    const statusEl = document.getElementById('scanner-status');
    
    statusEl.textContent = 'Starting camera...';
    document.getElementById('select-direct-pay-btn').disabled = false; 

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
        video.srcObject = stream;
        video.play();
        statusEl.textContent = 'Scanning for QR code...';
        scannerAnimation = requestAnimationFrame(tick);
    }).catch(() => {
        statusEl.textContent = 'Could not access camera.';
        document.getElementById('select-direct-pay-btn').disabled = false; 
    });
    
    const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            // QR code detect karein
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            if (code && code.data === RAMAZONE_STORE_ID) { 
                handleSuccessfulScan(code.data); 
                return; 
            }
        }
        if (scannerAnimation) scannerAnimation = requestAnimationFrame(tick);
    };
}

/**
 * QR code scanner ko stop karein.
 */
function stopScanner() {
    if (scannerAnimation) cancelAnimationFrame(scannerAnimation);
    scannerAnimation = null;
    const video = document.getElementById('scanner-video');
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    document.getElementById('select-direct-pay-btn').disabled = false;
}

/**
 * Gallery se QR code image upload ko handle karein.
 * @param {Event} event - File input change event.
 */
function handleQrUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            if (code && code.data === RAMAZONE_STORE_ID) handleSuccessfulScan(code.data);
            else showToast("No valid Ramazone QR code found.");
        };
        image.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
// --- END RMZ Pay Modal Logic ---


/**
 * Password change form ko handle karein.
 * @param {Event} e - Form submit event.
 */
async function handlePasswordChange(e) {
    e.preventDefault();
    const form = document.getElementById('password-change-form');
    const btn = document.getElementById('password-change-btn');
    const errorMsgEl = document.getElementById('password-change-error-msg');
    hideErrorMessage(errorMsgEl);
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    if (newPassword.length < 6) {
        showErrorMessage(errorMsgEl, "Naya password kam se kam 6 character ka hona chahiye.");
        return;
    }
    btn.disabled = true; btn.textContent = "Updating...";
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    try {
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        await updateDoc(doc(db, "users", user.uid), { password: newPassword });
        showToast("Password safaltapoorvak badal gaya!");
        form.reset();
        closeModal('profile-modal');
    } catch (error) {
        if (error.code === 'auth/wrong-password') {
            showErrorMessage(errorMsgEl, "Aapka purana password galat hai.");
        } else {
            showErrorMessage(errorMsgEl, "Ek error aayi. Dobara try karein.");
        }
    } finally {
        btn.disabled = false; btn.textContent = "Password Badlein";
    }
}

/**
 * App share function.
 */
function handleShare() {
    if (!currentUserData) return;
    const { name, lifetimeEarning } = currentUserData;
    const shareText = `🎉 *Wow! Ek Zabardast Offer!* 🎉\n\nMai, *${name}*, Ramazone Cashback app se ab tak *₹${(lifetimeEarning || 0).toFixed(2)}* ki bachat ki hai! 🤑\n\nAap bhi is app ko use karein aur har khareed par dher saare paise bachayein. Miss mat karna!\n\nAbhi app download karein: ${window.location.origin}${window.location.pathname}`;
    if (navigator.share) navigator.share({ text: shareText });
    else navigator.clipboard.writeText(shareText).then(() => showToast("Share message copied to clipboard!"));
}

/**
 * WhatsApp support chat kholein.
 */
function handleWhatsAppSupport() {
    const whatsappUrl = `https://chat.whatsapp.com/E2HaPJMGCDm7ALrZ8FM1s5?mode=wwt`;
    window.open(whatsappUrl, '_blank');
}

/**
 * Referral link (ya default) load par login view dikhayein.
 */
function handleReferralLink() {
    toggleView('login-view');
}

// --- Initialization and Event Listeners ---

/**
 * Sabhi event listeners ko initialize karein.
 */
function initializeAppLogic() {
    // Auth state listener
    onAuthStateChanged(auth, user => {
        if (user && user.displayName) {
            currentUser = user;
            attachRealtimeListeners(user);
            toggleView('dashboard-view');
        } else {
            detachAllListeners();
            handleReferralLink();
        }
    });

    // PWA Install button
    setupPwaInstallButton();
    document.getElementById('install-pwa-btn').addEventListener('click', handleInstallClick);
    
    // Auth forms
    document.getElementById('login-form').addEventListener('submit', e => {
        e.preventDefault();
        const mobile = document.getElementById('login-mobile').value;
        const password = document.getElementById('login-password').value;
        const errorMsgEl = document.getElementById('login-error-msg');
        hideErrorMessage(errorMsgEl);
        signInWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password)
            .catch(() => showErrorMessage(errorMsgEl, "Galat mobile ya password."));
    });
    
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const registerButton = e.target.querySelector('button');
        const errorMsgEl = document.getElementById('register-error-msg');
        hideErrorMessage(errorMsgEl);
        const name = document.getElementById('reg-name').value.trim();
        const mobile = document.getElementById('reg-mobile').value.trim();
        const password = document.getElementById('reg-password').value;

        if (!name || !mobile || password.length < 6) {
            showErrorMessage(errorMsgEl, "Sahi naam, mobile number, aur kam se kam 6 character ka password daalein.");
            registerButton.disabled = false; registerButton.textContent = 'Register Karein'; return;
        }
        let tempUser = null;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            tempUser = userCredential.user;
            
            const referredBy = 'none';
            const upline = [];
            
            registerButton.textContent = 'Saving Data...';
            await updateProfile(tempUser, { displayName: name });
            const newUserDoc = { 
                uid: tempUser.uid, name, mobile, password, 
                wallet: 0, lifetimeEarning: 0, totalCreditGiven: 0, dueAmount: 0, 
                referredBy, upline, createdAt: serverTimestamp(), creditLevel: 0,
                lastCheckInDate: null, totalCheckInDays: 0, referralRewardClaimed: false, totalPurchaseAmount: 0
            };
            await setDoc(doc(db, 'users', tempUser.uid), newUserDoc);
            await signOut(auth);
            toggleView('login-view');
            document.getElementById('login-form').reset();
            document.getElementById('register-form').reset();
            showToast("Registration safal hua! Ab login karein.");
        } catch (error) {
            if (tempUser) await tempUser.delete().catch(e => console.error("Failed to delete temp user", e));
            showErrorMessage(errorMsgEl, error.code === 'auth/email-already-in-use' ? "Yah mobile number pehle se register hai." : "Registration fail ho gaya. Dobara try karein.");
        } finally {
            registerButton.disabled = false; registerButton.textContent = 'Register Karein';
        }
    });

    // Navigation and Profile Listeners
    document.getElementById('show-register-link').addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    document.getElementById('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    document.getElementById('logout-btn').addEventListener('click', () => { closeModal('profile-modal'); signOut(auth); });
    document.getElementById('header-profile-avatar').addEventListener('click', () => openModal('profile-modal'));
    document.getElementById('header-notification-btn').addEventListener('click', () => toggleView('notification-view'));
    document.getElementById('modal-profile-img').addEventListener('click', () => { document.getElementById('full-profile-img').src = document.getElementById('modal-profile-img').src; openModal('profile-picture-modal'); });
    document.getElementById('edit-profile-pic-icon').addEventListener('click', () => document.getElementById('profile-picture-input').click());
    document.getElementById('profile-picture-input').addEventListener('change', handleProfilePictureUpload);
    document.getElementById('password-change-form').addEventListener('submit', handlePasswordChange);
    
    // Quick Actions Listeners
    document.getElementById('shop-now-btn').addEventListener('click', () => {
        window.open('https://www.ramazone.in', '_blank');
    });
    document.getElementById('scan-and-pay-btn').addEventListener('click', handleRmzPayButtonClick);
    document.getElementById('whatsapp-support-btn').addEventListener('click', handleWhatsAppSupport);

    // Wallet & Utility Listeners
    document.getElementById('pay-due-amount-btn').addEventListener('click', generateDueQR);
    document.getElementById('download-qr-btn').addEventListener('click', downloadQRCard);
    document.getElementById('wallet-share-btn').addEventListener('click', handleShare);
    
    // Payment/QR Listeners
    document.getElementById('rescan-btn').addEventListener('click', showScanView);
    document.getElementById('pay-submit-btn').addEventListener('click', handlePayment);
    document.getElementById('upload-qr-btn').addEventListener('click', () => document.getElementById('qr-file-input').click());
    document.getElementById('qr-file-input').addEventListener('change', handleQrUpload);
    
    // RMZ Pay Option Buttons
    document.getElementById('select-scan-btn').addEventListener('click', showScanView);
    document.getElementById('select-direct-pay-btn').addEventListener('click', showDirectPayView);
    
    // Verification Listener
    document.getElementById('verification-confirm-btn').addEventListener('click', handleVerificationConfirm);

    // Notification and History Listeners
    document.getElementById('popup-notification-close').addEventListener('click', () => { if (popupTimeout) clearTimeout(popupTimeout); document.getElementById('popup-notification').classList.remove('show'); });
    document.getElementById('notification-back-btn').addEventListener('click', () => toggleView('dashboard-view'));
    document.getElementById('filter-bar').addEventListener('click', e => {
        const target = e.target.closest('.filter-btn');
        if (!target) return;
        document.querySelector('#filter-bar .active')?.classList.remove('active');
        target.classList.add('active');
        activeFilter = target.dataset.filter;
        renderUnifiedHistory();
    });
    
    // Close modal buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay').id)));
}

// App ko Dhyan se initialize karein
document.addEventListener('DOMContentLoaded', fetchConfigsAndInit);


