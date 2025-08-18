import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, runTransaction, query, orderByChild, equalTo, update } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- Constants and Global Variables ---
const ADMIN_PAYMENT_ID = "@RamazoneStoreCashback";
const MASTER_REFERRAL_ID = "RMZC000B001"; // Master ID for first registration
let auth, database;
let imageApiKey = null;

// --- DOM Element References ---
const DOMElements = {
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    logoutBtn: document.getElementById('logout-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    notificationBtn: document.getElementById('notification-btn'),
    notificationDot: document.getElementById('notification-dot'),
    filterBar: document.getElementById('filter-bar'),
    dateFilter: document.getElementById('date-filter'),
    // Modals
    passwordModal: document.getElementById('password-modal-for-action'),
    claimModal: document.getElementById('claim-modal'),
    cashbackModal: document.getElementById('cashback-modal'),
    profileModal: document.getElementById('profile-modal'),
    scanPayModal: document.getElementById('scan-pay-modal'),
    cashbackClaimModal: document.getElementById('cashback-claim-modal'),
    imageViewModal: document.getElementById('image-view-modal'),
    couponsModal: document.getElementById('coupons-modal'),
    notificationsListModal: document.getElementById('notifications-list-modal'),
    notificationPopupModal: document.getElementById('notification-popup-modal'),
    transactionSuccessModal: document.getElementById('transaction-success-modal'),
    notificationDetailModal: document.getElementById('notification-detail-modal'),
    // Forms & Buttons
    claimRequestForm: document.getElementById('claim-request-form'),
    cashbackRequestForm: document.getElementById('cashback-request-form'),
    passwordChangeForm: document.getElementById('password-change-form'),
    profilePictureInput: document.getElementById('profile-picture-input'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn'),
    claimSubmitBtn: document.getElementById('claim-submit-btn'),
    cashbackSubmitBtn: document.getElementById('cashback-submit-btn'),
    paySubmitBtn: document.getElementById('pay-submit-btn'),
    claimNowBtn: document.getElementById('claim-now-btn'),
    openCashbackModalBtn: document.getElementById('open-cashback-modal'),
    walletShareBtn: document.getElementById('wallet-share-btn'),
    // Displays & Messages
    profileDisplay: document.getElementById('profile-display'),
    profileModalDisplay: document.getElementById('profile-modal-display'),
    loginErrorMsg: document.getElementById('login-error-msg'),
    registerErrorMsg: document.getElementById('register-error-msg'),
    claimErrorMsg: document.getElementById('claim-error-msg'),
    cashbackErrorMsg: document.getElementById('cashback-error-msg'),
    modalErrorMsg: document.getElementById('modal-error-msg'),
    passwordChangeErrorMsg: document.getElementById('password-change-error-msg'),
    paymentErrorMsg: document.getElementById('payment-error-msg'),
    scannerStatus: document.getElementById('scanner-status'),
};

// --- State Variables ---
let currentUserData = null;
let activeListeners = [];
let allTransactionsSnapshot = {};
let allNotifications = [];
let activeFilter = 'all';
let scanner = null;
let tempActionData = {};
let pendingCashbackClaim = null;
let currentPopupNotification = null;

// --- CORE INITIALIZATION ---
async function initializeFirebaseApp() {
    try {
        const response = await fetch('/api/cashback-config');
        if (!response.ok) throw new Error('Could not fetch Firebase config!');
        const firebaseConfig = await response.json();

        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        database = getDatabase(app);
        await fetchImageApiKey();
        setupApplication();
    } catch (error) {
        console.error("FATAL: Firebase initialization failed.", error);
        document.body.innerHTML = `<div style="text-align: center; padding: 50px; color: #EF4444;">Application could not start. Please check connection and configuration.</div>`;
    }
}

// --- UTILITY FUNCTIONS ---
function showErrorMessage(element, message) { element.textContent = message; element.style.display = 'block'; }
function hideErrorMessage(element) { element.style.display = 'none'; }
function toggleView(viewId) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(viewId)?.classList.add('active'); }
function openModal(modalElement) { modalElement?.classList.add('active'); }
function closeModal(modalElement) {
    modalElement?.classList.remove('active');
    if (scanner && modalElement === DOMElements.scanPayModal) {
        scanner.getTracks().forEach(track => track.stop());
        scanner = null;
    }
}
function showToast(message) {
    const toast = document.getElementById('toast-notification');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}
function generatePaymentId(name, mobile) {
    if (!name || !mobile) return '';
    const formattedName = name.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '');
    return `@${formattedName}RMZ${mobile}`;
}
// New Referral ID Generator
function generateReferralId() {
    const randomPart1 = Math.floor(100 + Math.random() * 900); // 3 digits
    const randomPart2 = Math.floor(1000 + Math.random() * 9000); // 4 digits
    return `RMZC${randomPart1}B${randomPart2}`;
}

// --- AUTHENTICATION & DATA LISTENERS ---
function setupAuthentication() {
    onAuthStateChanged(auth, user => {
        if (user) {
            toggleView('dashboard-view');
            attachRealtimeListeners(user);
        } else {
            toggleView('login-view');
            detachAllListeners();
        }
    });

    DOMElements.loginForm.addEventListener('submit', e => {
        e.preventDefault();
        hideErrorMessage(DOMElements.loginErrorMsg);
        const mobile = document.getElementById('login-mobile').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password)
            .catch(() => showErrorMessage(DOMElements.loginErrorMsg, "Galat mobile number ya password."));
    });

    DOMElements.registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        hideErrorMessage(DOMElements.registerErrorMsg);
        const name = document.getElementById('reg-name').value.trim();
        const mobile = document.getElementById('reg-mobile').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const referralId = document.getElementById('reg-referral').value.trim().toUpperCase();

        if (!name || !/^\d{10}$/.test(mobile) || password.length < 6 || !referralId) {
            showErrorMessage(DOMElements.registerErrorMsg, "Kripya sabhi details sahi se bharein.");
            return;
        }

        try {
            // Check if referral ID is valid
            const referralUserSnapshot = await get(query(ref(database, 'users'), orderByChild('referralId'), equalTo(referralId)));
            if (!referralUserSnapshot.exists() && referralId !== MASTER_REFERRAL_ID) {
                showErrorMessage(DOMElements.registerErrorMsg, "Invalid Referral ID. Kripya sahi ID daalein.");
                return;
            }
            const referrerUid = referralUserSnapshot.exists() ? Object.keys(referralUserSnapshot.val())[0] : 'master';

            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: name });

            const newUserReferralId = generateReferralId();
            await set(ref(database, 'users/' + user.uid), {
                uid: user.uid,
                name,
                mobile,
                wallet: 0,
                lifetimeEarning: 0,
                dueAmount: 0,
                profilePictureUrl: '',
                referralId: newUserReferralId,
                referredBy: referrerUid, // UID of the person who referred this user
                createdAt: new Date().toISOString()
            });

            alert("Registration safal hua! Ab aap login kar sakte hain.");
            toggleView('login-view');
            DOMElements.registerForm.reset();

        } catch (error) {
            const msg = error.code === 'auth/email-already-in-use' ? "Is mobile number se account pehle se hai." : "Registration fail ho gaya. Dobara koshish karein.";
            showErrorMessage(DOMElements.registerErrorMsg, msg);
        }
    });

    DOMElements.logoutBtn.addEventListener('click', () => signOut(auth));
}

function attachRealtimeListeners(user) {
    detachAllListeners();
    const uid = user.uid;
    activeListeners.push(onValue(ref(database, 'users/' + uid), (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = { uid, ...snapshot.val() };
            updateDashboardUI(currentUserData, user);
            checkForApprovedCashback();
        }
    }));

    const queries = {
        claims: query(ref(database, 'claim_requests'), orderByChild('userId'), equalTo(uid)),
        cashback: query(ref(database, 'cashback_requests'), orderByChild('userId'), equalTo(uid)),
        credit: query(ref(database, 'credit_transactions'), orderByChild('userId'), equalTo(uid)),
        sent: query(ref(database, 'payments'), orderByChild('senderId'), equalTo(uid)),
        received: query(ref(database, 'payments'), orderByChild('receiverId'), equalTo(uid)),
        referralEarnings: query(ref(database, 'referral_earnings'), orderByChild('beneficiaryId'), equalTo(uid))
    };

    for (const key in queries) {
        activeListeners.push(onValue(queries[key], s => {
            allTransactionsSnapshot[key] = s;
            renderUnifiedHistory();
            if (key === 'cashback') checkForApprovedCashback();
            if (key === 'claims') renderCouponsModal();
        }));
    }
    // ... (Notification listener remains the same)
}

function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null;
    allTransactionsSnapshot = {};
    allNotifications = [];
}

function refreshData() {
    if (!auth.currentUser) return;
    DOMElements.refreshBtn.classList.add('refreshing');
    attachRealtimeListeners(auth.currentUser);
    setTimeout(() => DOMElements.refreshBtn.classList.remove('refreshing'), 1000);
}

// --- UI RENDERING ---
function updateDashboardUI(dbData, authUser) {
    if (!dbData || !authUser) return;

    document.getElementById('user-name-display').textContent = authUser.displayName;
    document.getElementById('user-mobile').textContent = `Mobile: ${dbData.mobile}`;
    document.getElementById('user-referral-id').textContent = dbData.referralId || 'N/A';

    const walletBalance = dbData.wallet || 0;
    const dueAmount = dbData.dueAmount || 0;
    const creditLimit = walletBalance + dueAmount;

    document.getElementById('wallet-balance').textContent = `₹ ${walletBalance.toFixed(2)}`;
    document.getElementById('credit-limit').textContent = `₹${creditLimit.toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    document.getElementById('due-amount').textContent = `- ₹${dueAmount.toFixed(2)}`;
    document.getElementById('due-amount-container').style.display = dueAmount > 0 ? 'block' : 'none';

    const initial = authUser.displayName ? authUser.displayName.charAt(0).toUpperCase() : 'R';
    const placeholderUrl = `https://placehold.co/80x80/e0e0e0/333333?text=${initial}`;
    const profilePicUrl = dbData.profilePictureUrl || placeholderUrl;
    DOMElements.profileDisplay.src = profilePicUrl;
    DOMElements.profileModalDisplay.src = profilePicUrl;

    document.getElementById('profile-modal-name').textContent = authUser.displayName;
    document.getElementById('profile-modal-mobile').textContent = dbData.mobile;
    document.getElementById('whatsapp-support-link').href = `https://wa.me/917903698180?text=${encodeURIComponent(`Help Required\nName: ${authUser.displayName}\nMobile: ${dbData.mobile}`)}`;
}

function renderUnifiedHistory() {
    const historyList = document.getElementById('unified-history-list');
    historyList.innerHTML = '';
    let combinedHistory = [];

    // --- Populate combinedHistory from allTransactionsSnapshot ---
    // Cashback
    if (allTransactionsSnapshot.cashback?.exists()) allTransactionsSnapshot.cashback.forEach(snap => { const c = snap.val(); combinedHistory.push({ key: snap.key, type: 'cashback', date: new Date(c.requestDate), title: `Cashback: ${c.productName}`, amount: c.cashbackAmount, status: c.status, sign: '+' }); });
    // Claims
    if (allTransactionsSnapshot.claims?.exists()) allTransactionsSnapshot.claims.forEach(snap => { const c = snap.val(); combinedHistory.push({ key: snap.key, type: 'claim', date: new Date(c.requestDate), title: 'Wallet Claim', amount: c.claimAmount, status: c.status, sign: '-', coupon: c.couponCode }); });
    // Sent Payments
    if (allTransactionsSnapshot.sent?.exists()) allTransactionsSnapshot.sent.forEach(snap => { const p = snap.val(); combinedHistory.push({ key: snap.key, type: 'payment', date: new Date(p.timestamp), title: `Paid to ${p.receiverName}`, amount: p.amount, status: 'completed', sign: '-' }); });
    // Received Payments
    if (allTransactionsSnapshot.received?.exists()) allTransactionsSnapshot.received.forEach(snap => { const p = snap.val(); combinedHistory.push({ key: snap.key+'_rec', type: 'payment', date: new Date(p.timestamp), title: `Received from ${p.senderName}`, amount: p.amount, status: 'completed', sign: '+' }); });
    // Credit/Settled
    if (allTransactionsSnapshot.credit?.exists()) {
        allTransactionsSnapshot.credit.forEach(snap => { 
            const c = snap.val(); 
            if (c.type === 'credit') {
                combinedHistory.push({ key: snap.key, type: 'credit', date: new Date(c.timestamp), title: `Credit from Admin`, amount: c.amount, status: 'completed', sign: '+' }); 
            } else if (c.type === 'Settled') {
                combinedHistory.push({ key: snap.key, type: 'settled', date: new Date(c.timestamp), title: `Due Amount Settled`, amount: c.amount, status: 'completed', sign: '+' }); 
            }
        });
    }
    // Referral Earnings
    if (allTransactionsSnapshot.referralEarnings?.exists()) {
        allTransactionsSnapshot.referralEarnings.forEach(snap => {
            const r = snap.val();
            combinedHistory.push({
                key: snap.key,
                type: 'referral',
                date: new Date(r.timestamp),
                title: `Referral Earning from ${r.sourceUserName}`,
                amount: r.amount,
                status: 'completed',
                sign: '+'
            });
        });
    }

    const selectedDate = DOMElements.dateFilter.value;
    let filteredHistory = combinedHistory
        .filter(item => activeFilter === 'all' || item.type === activeFilter)
        .filter(item => {
            if (!selectedDate) return true;
            const itemDate = item.date.toISOString().split('T')[0];
            return itemDate === selectedDate;
        });

    if (filteredHistory.length === 0) { historyList.innerHTML = getEmptyStateHTML('history'); return; }

    filteredHistory.sort((a, b) => b.date - a.date).forEach(item => {
        const itemDiv = document.createElement('div');
        const typeClass = item.sign === '+' ? 'credit' : 'debit';
        const icon = { cashback: '🎁', claim: '💸', payment: '↔️', credit: '✨', settled: '🤝', referral: '👥' }[item.type] || '📜';
        const itemType = item.type === 'referral' ? 'referral' : item.type === 'settled' ? 'settled' : typeClass;

        itemDiv.className = `history-item ${itemType}`;
        let couponHTML = (item.type === 'claim' && item.status === 'approved' && item.coupon) ? `<span class="coupon-code">${item.coupon}</span>` : (item.type === 'claim' && item.status === 'rejected') ? `<span class="coupon-code">Refunded</span>` : '';

        itemDiv.innerHTML = `<div class="history-details"><div class="history-icon ${itemType}">${icon}</div><div class="history-info"><div class="title">${item.title}</div><div class="date">${item.date.toLocaleDateString()}</div></div></div><div class="history-amount"><div class="amount ${typeClass}">${item.sign} ₹${parseFloat(item.amount).toFixed(2)}</div><span class="status status-${item.status}">${item.status}</span>${couponHTML}</div>`;
        historyList.appendChild(itemDiv);
    });
}

// ... (renderCouponsModal and getEmptyStateHTML remain mostly the same)

// --- ACTION HANDLERS & BUSINESS LOGIC ---
async function handleCashbackRequest(e) {
    e.preventDefault();
    hideErrorMessage(DOMElements.cashbackErrorMsg);
    DOMElements.cashbackSubmitBtn.disabled = true;

    const productName = document.getElementById("product-name").value.trim();
    const productPrice = parseFloat(document.getElementById("product-price").value);
    const purchaseDate = document.getElementById("product-purchase-date").value;
    if (!productName || isNaN(productPrice) || productPrice < 10 || !purchaseDate) {
        showErrorMessage(DOMElements.cashbackErrorMsg, "Sahi details daalein.");
        DOMElements.cashbackSubmitBtn.disabled = false;
        return;
    }

    try {
        const settingsSnapshot = await get(ref(database, 'app_settings'));
        const settings = settingsSnapshot.exists() ? settingsSnapshot.val() : {};
        const cashbackPercentage = settings.cashback_percentage || 2; // default 2%
        const selfCashbackPercentage = settings.self_cashback_percentage || 66.67; // default 2/3 for self
        const referralLevels = settings.referral_levels || [30, 25, 20, 15, 10]; // default percentages

        const totalCommission = productPrice * (cashbackPercentage / 100);
        const selfCashback = totalCommission * (selfCashbackPercentage / 100);
        const referralPool = totalCommission - selfCashback;

        // Create the cashback request
        const newRequestRef = push(ref(database, "cashback_requests"));
        await set(newRequestRef, {
            requestId: newRequestRef.key,
            userId: currentUserData.uid,
            userName: currentUserData.name,
            userMobile: currentUserData.mobile,
            productName,
            productPrice,
            purchaseDate,
            cashbackAmount: selfCashback, // Only self amount goes here
            status: "pending",
            requestDate: new Date().toISOString(),
            claimed: false,
            referralPool: referralPool, // Store the amount to be distributed
            referralDistribution: { // For tracking
                status: 'pending',
                levels: referralLevels
            }
        });

        // The distribution will happen from an admin panel or a cloud function upon approval
        showToast("Cashback request submit ho gaya!");
        DOMElements.cashbackRequestForm.reset();
        closeModal(DOMElements.cashbackModal);

    } catch (error) {
        showErrorMessage(DOMElements.cashbackErrorMsg, `Error: ${error.message}`);
    } finally {
        DOMElements.cashbackSubmitBtn.disabled = false;
    }
}

// ... (handleClaimRequest and other handlers remain mostly the same)

// --- APP SETUP ---
function setupApplication() {
    setupAuthentication();

    // Check for referral ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const refId = urlParams.get('ref');
    if (refId) {
        localStorage.setItem('referralId', refId);
        // If on registration view, pre-fill the field
        const regReferralInput = document.getElementById('reg-referral');
        if (regReferralInput) {
            regReferralInput.value = refId;
        }
    }

    // Pre-fill referral ID if stored
    document.getElementById('show-register-link').addEventListener('click', e => {
        e.preventDefault();
        toggleView('registration-view');
        const storedRefId = localStorage.getItem('referralId');
        if (storedRefId) {
            document.getElementById('reg-referral').value = storedRefId;
        }
    });

    document.getElementById('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    DOMElements.refreshBtn.addEventListener('click', refreshData);

    // Share button logic
    DOMElements.walletShareBtn.addEventListener('click', async () => {
        if (!auth.currentUser || !currentUserData || !currentUserData.referralId) {
            showToast("Data load ho raha hai...");
            return;
        }
        const referralId = currentUserData.referralId;
        const shareUrl = `${window.location.origin}${window.location.pathname}?ref=${referralId}`;
        const shareMessage = `🎉 *Wow! Ek Zabardast Offer!* 🎉\n\nMaine, *${auth.currentUser.displayName}*, Ramazone Cashback app se dher saari bachat ki hai! 🤑\n\nAap bhi is app ko use karein aur har khareed par paise bachayein. Miss mat karna! 👇\n\n${shareUrl}`;
        try {
            if (navigator.share) {
                await navigator.share({ text: shareMessage });
            } else {
                navigator.clipboard.writeText(shareMessage);
                showToast('Share message copied!');
            }
        } catch (err) {
            if (err.name !== 'AbortError') showToast('Share karne mein error aayi.');
        }
    });

    // --- All other event listeners from the original file ---
    // (Modal openers, form submissions, etc.)
    document.getElementById('open-claim-modal').addEventListener('click', () => openModal(DOMElements.claimModal));
    document.getElementById('open-coupons-modal').addEventListener('click', () => openModal(DOMElements.couponsModal));
    document.getElementById('open-profile-modal').addEventListener('click', () => openModal(DOMElements.profileModal));
    DOMElements.openCashbackModalBtn.addEventListener('click', () => { /* ... */ });
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay'))));
    DOMElements.claimRequestForm.addEventListener('submit', handleClaimRequest);
    DOMElements.cashbackRequestForm.addEventListener('submit', handleCashbackRequest);
    DOMElements.passwordChangeForm.addEventListener('submit', handlePasswordChange);
    // ... and so on for all other event listeners.
}

// Initialize the app
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);


// NOTE: The full implementation of all event listeners (like handlePasswordChange, scan & pay, etc.) 
// would be copied from the original file into this script. For brevity, only the modified or new 
// functions are fully detailed here. The core logic for unchanged features remains the same.
// The referral commission distribution itself would ideally be handled by a secure backend 
// (like a Firebase Cloud Function) that triggers when a cashback request is approved by an admin.
// This function would fetch the upline and distribute the 'referralPool' amount.

