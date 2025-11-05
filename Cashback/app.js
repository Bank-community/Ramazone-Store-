// --- Firebase modules import ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, orderBy, limit, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let allTransactions = [];
let allNotifications = []; // Bheje gaye notifications
let activeFilter = 'all';
let isUplineLoaded = false;
let popupTimeout = null;
let initialPopupShown = false;
const commissionRates = [30, 25, 20, 15, 10]; // Legacy (unused)
let historyStack = [];
const networkLoader = document.getElementById('network-loader');
const networkTitleEl = document.getElementById('network-title');
const UPI_ID = "princekumar954684-1@okicici"; // Due payment UPI ID

// (NEW) "Pay Again" ke liye current transaction ko store karein
let currentTransactionForPayAgain = null;


// --- Core Functions (Config, UI Toggles) ---
// (FIXED) In sabhi ko 'const' se 'function' mein badla gaya taaki yeh 'fetchConfigsAndInit' se pehle load ho sakein (hoisting)

/**
 * Screen par ek chhota notification (toast) dikhayein.
 * @param {string} message - Dikhane wala message.
 */
function showToast(message) {
    const toast = document.getElementById('toast-notification');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

/**
 * Alag-alag app views (pages) ke beech switch karein.
 * @param {string} viewId - Dikhane wale view ki ID.
 */
function toggleView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewElement = document.getElementById(viewId);
    if(viewElement) {
        viewElement.classList.add('active');
    }
}

/**
 * Ek modal (popup) kholein.
 * @param {string} modalId - Kholne wale modal ki ID.
 */
function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

/**
 * Ek modal (popup) band karein.
 * @param {string} modalId - Band karne wale modal ki ID.
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
    
    // Agar payment modal band ho raha hai, toh scanner ko bhi stop karein (event payments.js se emit hoga)
    if (modalId === 'scan-pay-modal') {
        const stopEvent = new CustomEvent('stopScanner');
        document.dispatchEvent(stopEvent);
    }
}

/**
 * Form mein error message dikhayein.
 * @param {HTMLElement} element - Error message dikhane wala P element.
 * @param {string} message - Error message.
 */
function showErrorMessage(element, message) {
    if (element) { 
        element.textContent = message; 
        element.style.display = 'block'; 
    }
}

/**
 * Form se error message hatayein.
 * @param {HTMLElement} element - Error message wala P element.
 */
function hideErrorMessage(element) {
    if (element) { 
        element.style.display = 'none'; 
    }
}
// --- (END OF FIX) ---


/**
 * Firebase config fetch karein aur app ko initialize karein. (FIXED)
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
        
        // Expose core functions to payments.js
        // (FIX) Yeh ab kaam karega kyunki 'showToast' etc. 'function' hain aur hoist ho chuke hain.
        window.RamazoneApp = {
            showToast,
            openModal,
            closeModal,
            showErrorMessage,
            hideErrorMessage,
            getCurrentUser: () => currentUser,
            getCurrentUserData: () => currentUserData,
            getDb: () => db,
            getAuth: () => auth
        };

        initializeAppLogic(); // Baaki ka app logic start karein
    } catch (error) {
        console.error("Critical Initialization Error:", error);
        // Ab yeh error sirf tabhi aayega jab Firebase config galat hogi.
        document.body.innerHTML = `<div style="text-align: center; padding: 40px; font-family: 'Poppins', sans-serif;"><h2>Application Error</h2><p>Could not load settings. Please try again later.</p><p style="color: #999; font-size: 12px;">${error.message}</p></div>`;
    }
}


// --- Realtime Data Handling ---

/**
 * User ke data ke liye realtime listeners attach karein.
 * @param {object} user - Firebase auth user object.
 */
function attachRealtimeListeners(user) {
    detachAllListeners(); // Purane listeners ko hatayein
    const uid = user.uid;
    
    // Valid transaction types jo user ko dikhne chahiye
    const validTypes = ['payment', 'due_payment', 'credit_given', 'p2p_sent', 'p2p_received']; 

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
        // Transactions listener (UPDATED)
        onSnapshot(query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc")), (snapshot) => {
            allTransactions = snapshot.docs
                .map(doc => ({ ...doc.data(), id: doc.id, date: doc.data().timestamp?.toDate() }))
                .filter(t => validTypes.includes(t.type)); // Sirf valid types hi filter karein
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
 * Dashboard UI ko user ke data se update karein. (UPDATED)
 * @param {object} dbData - Firestore se user ka data.
 * @param {object} authUser - Firebase auth se user ka data.
 */
function updateDashboardUI(dbData, authUser) {
    const profilePicUrl = dbData.profilePictureUrl || `https://placehold.co/40x40/e50914/FFFFFF?text=${authUser.displayName.charAt(0)}`;
    document.getElementById('header-profile-avatar').src = profilePicUrl;
    document.getElementById('wallet-user-name').textContent = authUser.displayName;
    document.getElementById('modal-profile-img').src = profilePicUrl;
    document.getElementById('wallet-balance').textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    
    // Lifetime Earning hata diya gaya
    
    document.getElementById('credit-limit').textContent = `₹ ${(dbData.totalCreditGiven || 0).toFixed(2)}`;
    document.getElementById('due-amount').textContent = `₹ ${(dbData.dueAmount || 0).toFixed(2)}`;
    
    // Payment ID ko mobile number + @RMZ se set karein
    const paymentId = `${dbData.mobile}@RMZ`;
    document.getElementById('profile-payment-id').textContent = paymentId;
    
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
 * Transaction history list ko filter ke hisaab se render karein. (UPDATED)
 */
function renderUnifiedHistory() {
    const listEl = document.getElementById('unified-history-list');
    const summaryAmountEl = document.getElementById('summary-total-amount');
    const summaryLabelEl = document.getElementById('summary-filter-label');
    listEl.innerHTML = '';

    const filterLabels = {
        all: "All Transactions",
        payment: "Total Payments", // Isme RMZ Store aur P2P Sent dono aayenge
        due_payment: "Total Due Paid",
        credit_given: "Total Credit Received" // Isme Admin Credit aur P2P Received aayenge
    };
    
    // Filter logic ko update karein
    const itemsToRender = combinedHistory.filter(item => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'payment') return item.type === 'payment' || item.type === 'p2p_sent';
        if (activeFilter === 'due_payment') return item.type === 'due_payment';
        if (activeFilter === 'credit_given') return item.type === 'credit_given' || item.type === 'p2p_received';
        return false;
    });
    
    // Total amount logic ko update karein
    let totalAmount = 0;
    itemsToRender.forEach(item => {
        const amount = item.amount || 0;
        // Credit (positive) types
        if (item.type === 'credit_given' || item.type === 'p2p_received') {
            totalAmount += amount;
        } 
        // Debit (negative) types - amount pehle se negative store ho sakta hai
        else if (item.type === 'payment' || item.type === 'due_payment' || item.type === 'p2p_sent') {
            totalAmount += amount; // Amount pehle se negative hai, isliye seedha add karein
        }
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
        
        // (NEW) Click par item ka data save karein (data attribute se behtar hai)
        itemDiv.addEventListener('click', () => showTransactionDetails(item));
        
        const amount = item.amount || 0;
        let sign = '';
        let typeClass = '';
        
        // Types ko classify karein
        if(item.type === 'credit_given' || item.type === 'p2p_received') {
            typeClass = 'credit'; 
            sign = '+';
        } else if (item.type === 'payment' || item.type === 'due_payment' || item.type === 'p2p_sent') {
            typeClass = 'debit'; 
            sign = ''; // Amount pehle se negative hai
        }

        const displayAmount = (sign === '+') ? amount.toFixed(2) : Math.abs(amount).toFixed(2);
        if (item.status === 'rejected' || item.status === 'refunded') { typeClass = 'rejected'; }
        
        // Title ko logic ke hisaab se set karein
        let title = item.description;
        if (item.type === 'credit_given') title = `Admin Credit`;
        // 'p2p_sent' aur 'p2p_received' ke liye description pehle se set hoga ("Paid to X", "Received from Y")

        itemDiv.innerHTML = `<div class="history-details"><div class"history-info"><div class="title">${title}</div><div class="date">${item.date ? item.date.toLocaleDateString() : 'N/A'}</div></div></div><div class="history-amount"><div class="amount ${typeClass}">${sign} ₹${displayAmount}</div><span class="status">${item.status || 'Completed'}</span></div>`;
        listEl.appendChild(itemDiv);
    });
}

/**
 * Transaction Details ka popup dikhayein. (UPDATED for Pay Back & Note)
 * @param {object} item - Click kiya gaya transaction item.
 */
function showTransactionDetails(item) {
    // Sabse pehle, global variable aur "Pay Again" button ko reset karein
    currentTransactionForPayAgain = null;
    const payAgainBtn = document.getElementById('details-pay-again-btn');
    payAgainBtn.style.display = 'none';
    payAgainBtn.textContent = 'Pay Again'; // Default text

    const amount = item.amount || 0;
    let sign = '';
    let typeClass = '';
    let description = item.description;
    
    // Types ko classify karein
    if (item.type === 'credit_given' || item.type === 'p2p_received') {
        sign = '+';
        typeClass = 'credit';
        if (item.type === 'credit_given') description = "Credit received from Ramazone Admin";
        
        // (NEW) Agar yeh P2P received hai, toh "Pay Back" button dikhayein
        if (item.type === 'p2p_received') {
            currentTransactionForPayAgain = item; // Data save karein
            payAgainBtn.textContent = 'Pay Back'; // Button text badlein
            payAgainBtn.style.display = 'block'; // Button dikhayein
        }

    } else if (item.type === 'payment' || item.type === 'p2p_sent') {
        sign = ''; // Amount pehle se negative hai
        typeClass = 'debit';
        
        // (NEW) Agar yeh "sent" transaction hai, toh "Pay Again" button dikhayein
        currentTransactionForPayAgain = item; // Data save karein
        payAgainBtn.textContent = 'Pay Again'; // Default text
        payAgainBtn.style.display = 'block'; // Button dikhayein
    }
    
    // (FIX) "Due Payment" aur "Admin Credit" par "Pay" button nahi dikhna chahiye
    if (item.type === 'due_payment' || item.type === 'credit_given') {
         currentTransactionForPayAgain = null;
         payAgainBtn.style.display = 'none';
    }

    const displayAmount = (sign === '+') ? amount.toFixed(2) : Math.abs(amount).toFixed(2);

    // Amount aur basic details set karein
    document.getElementById('details-modal-amount').textContent = `${sign} ₹${displayAmount}`;
    document.getElementById('details-modal-amount').style.color = typeClass === 'credit' ? 'var(--accent-green)' : 'var(--brand-red)';
    const statusEl = document.getElementById('details-modal-status');
    statusEl.textContent = item.status || 'Completed';
    statusEl.className = 'value status-badge'; // CSS class reset karein
    if (item.status) statusEl.classList.add(item.status);

    document.getElementById('details-modal-desc').textContent = description;
    document.getElementById('details-modal-date').textContent = item.date ? item.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
    document.getElementById('details-modal-time').textContent = item.date ? item.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';
    
    // (NEW) Note ko handle karein
    const noteContainer = document.getElementById('details-modal-note-container');
    const noteEl = document.getElementById('details-modal-note');
    if (item.note && item.note.trim() !== '') {
        noteEl.textContent = item.note;
        noteContainer.style.display = 'flex'; // 'flex' kyunki yeh detail-item hai
    } else {
        noteContainer.style.display = 'none';
        noteEl.textContent = '';
    }

    // Naye Transaction ID Row mein ID set karein
    document.getElementById('details-modal-txn-id-text').textContent = item.id;
    
    // Naye buttons ke liye event listeners (purane listeners hatakar cloneNode trick se)
    
    // 1. Copy Icon Button
    const oldCopyBtn = document.getElementById('details-copy-txn-id-icon-btn');
    const newCopyBtn = oldCopyBtn.cloneNode(true); // Clone karke listener hatayein
    oldCopyBtn.parentNode.replaceChild(newCopyBtn, oldCopyBtn);
    newCopyBtn.addEventListener('click', () => handleCopyTxnId(item.id));
    
    // 2. Download Button
    const oldDownloadBtn = document.getElementById('details-download-receipt-btn');
    const newDownloadBtn = oldDownloadBtn.cloneNode(true);
    oldDownloadBtn.parentNode.replaceChild(newDownloadBtn, oldDownloadBtn);
    newDownloadBtn.addEventListener('click', () => handleDownloadReceipt(item.id));
    
    // 3. "Pay Again" / "Pay Back" button ka listener pehle se `initializeAppLogic` mein laga hua hai.
    
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
 * Transaction receipt ka screenshot download karein. (UPDATED for Note)
 * @param {string} txnId - Transaction ID (filename ke liye).
 */
function handleDownloadReceipt(txnId) {
    const receiptElement = document.querySelector('#transaction-details-modal .modal-content');
    
    // Sabhi buttons aur note container ko select karein
    const downloadBtn = document.getElementById('details-download-receipt-btn');
    const closeBtn = document.querySelector('#transaction-details-modal .action-btn[data-close-modal]');
    const payAgainBtn = document.getElementById('details-pay-again-btn');
    const copyIconBtn = document.getElementById('details-copy-txn-id-icon-btn');
    const noteContainer = document.getElementById('details-modal-note-container'); // (NEW)
    
    // Original display state ko save karein
    const payAgainDisplay = payAgainBtn ? payAgainBtn.style.display : 'none';
    const noteDisplay = noteContainer ? noteContainer.style.display : 'none';

    // Screenshot ke liye buttons ko chhupayein
    if(downloadBtn) downloadBtn.style.visibility = 'hidden';
    if(closeBtn) closeBtn.style.visibility = 'hidden';
    if(payAgainBtn) payAgainBtn.style.display = 'none'; // (FIX) visibility ki jagah display none
    if(copyIconBtn) copyIconBtn.style.visibility = 'hidden';
    if(noteContainer && noteDisplay !== 'none') noteContainer.style.display = 'none'; // (FIX) visibility ki jagah display none
    
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

            const clonedPayAgainBtn = doc.getElementById('details-pay-again-btn');
            if (clonedPayAgainBtn) clonedPayAgainBtn.style.display = 'none';
            
            const clonedCopyIconBtn = doc.getElementById('details-copy-txn-id-icon-btn');
            if (clonedCopyIconBtn) clonedCopyIconBtn.style.visibility = 'hidden';
            
            const clonedNoteContainer = doc.getElementById('details-modal-note-container'); // (NEW)
            if (clonedNoteContainer && clonedNoteContainer.style.display !== 'none') clonedNoteContainer.style.display = 'none';
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
        if(payAgainBtn) payAgainBtn.style.display = payAgainDisplay; // Original state par restore karein
        if(copyIconBtn) copyIconBtn.style.visibility = 'visible';
        if(noteContainer) noteContainer.style.display = noteDisplay; // Original state par restore karein
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
 * Payment ID ko copy karein (Profile Modal se).
 */
function handleCopyPaymentId() {
    const paymentId = document.getElementById('profile-payment-id').textContent;
    if (!navigator.clipboard) {
        showToast("Copying not supported.");
        return;
    }
    navigator.clipboard.writeText(paymentId).then(() => {
        showToast("Payment ID Copied!");
    }).catch(err => {
        showToast("Failed to copy ID.");
        console.error('Failed to copy ID: ', err);
    });
}


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
    const { name } = currentUserData; // Lifetime earning hata diya
    const shareText = `🎉 *Wow! Ek Zabardast Offer!* 🎉\n\nMai, *${name}*, Ramazone Cashback app use kar raha hoon!\n\nAap bhi is app ko use karein aur har khareed par dher saare paise bachayein. Miss mat karna!\n\nAbhi app download karein: ${window.location.origin}${window.location.pathname}`;
    if (navigator.share) navigator.share({ text: shareText });
    else navigator.clipboard.writeText(shareText).then(() => showToast("Share message copied to clipboard!"));
}

/**
 * "Pay Again" / "Pay Back" button click ko handle karein. (UPDATED)
 */
function handlePayAgain() {
    if (!currentTransactionForPayAgain) {
        showToast("Could not find transaction details to pay again.");
        return;
    }
    
    const item = currentTransactionForPayAgain;
    
    // Pehle raseed modal ko band karein
    closeModal('transaction-details-modal');
    // Payment modal kholein
    openModal('scan-pay-modal');
    
    if (item.type === 'payment') {
        // Agar yeh RMZ Store ka payment tha
        // 'payments.js' ko event bhejein ki RMZ tab khole
        document.dispatchEvent(new CustomEvent('openPaymentTab', { 
            detail: { tab: 'rmz-store' } 
        }));
        
    } else if (item.type === 'p2p_sent' || item.type === 'p2p_received') {
        // (NEW) Dono cases ko handle karein (Pay Again ya Pay Back)
        // Hamein 'otherParty' data ki zaroorat hogi (jo 'payments.js' save karega)
        if (!item.otherParty || !item.otherParty.mobile) {
            // Agar purana transaction hai jismein 'otherParty' save nahi hai
            showToast("Could not find ID. Please search manually.");
            // Sirf P2P tab kholein
            document.dispatchEvent(new CustomEvent('openPaymentTab', { 
                detail: { tab: 'p2p' } 
            }));
            return;
        }
        
        const paymentId = `${item.otherParty.mobile}@RMZ`;
        
        // 'payments.js' ko event bhejein ki P2P tab khole aur ID search kare
        document.dispatchEvent(new CustomEvent('openPaymentTab', { 
            detail: { 
                tab: 'p2p',
                searchId: paymentId 
            } 
        }));
    }
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
                lastCheckInDate: null, totalCheckInDays: 0, referralRewardClaimed: false, totalPurchaseAmount: 0,
                profilePictureUrl: '' // (NEW) Profile pic ke liye khaali string
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
    
    // (UPDATED) Copy Payment ID button (profile modal)
    document.getElementById('profile-copy-id-btn').addEventListener('click', handleCopyPaymentId);
    
    // (UPDATED) "Pay Again" / "Pay Back" button (transaction details modal)
    document.getElementById('details-pay-again-btn').addEventListener('click', handlePayAgain);

    // Quick Actions Listeners
    document.getElementById('shop-now-btn').addEventListener('click', () => {
        window.open('https://www.ramazone.in', '_blank');
    });
    
    // (UPDATED) Scan button sirf modal kholega
    document.getElementById('scan-and-pay-btn').addEventListener('click', () => {
        openModal('scan-pay-modal');
        // Payment modal ke default state ko set karne ke liye event fire karein
        const event = new CustomEvent('paymentModalOpened');
        document.dispatchEvent(event);
    });
    
    document.getElementById('whatsapp-support-btn').addEventListener('click', handleWhatsAppSupport);

    // Wallet & Utility Listeners
    document.getElementById('pay-due-amount-btn').addEventListener('click', generateDueQR);
    document.getElementById('download-qr-btn').addEventListener('click', downloadQRCard);
    document.getElementById('wallet-share-btn').addEventListener('click', handleShare);
    
    // Payment/QR Listeners (REMOVED - Moved to payments.js)
    
    // Verification Listener (REMOVED - Moved to payments.js)

    // Notification and History Listeners
    document.getElementById('popup-notification-close').addEventListener('click', () => { if (popupTimeout) clearTimeout(popupTimeout); document.getElementById('popup-notification').classList.remove('show'); });
    document.getElementById('notification-back-btn').addEventListener('click', () => toggleView('dashboard-view'));
    
    // (UPDATED) Filter bar
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

// (FIXED) App ko 'load' event par initialize karein, 'DOMContentLoaded' par nahi.
window.addEventListener('load', fetchConfigsAndInit);


