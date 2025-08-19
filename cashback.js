import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, getDocs, writeBatch, serverTimestamp, orderBy, limit, runTransaction as firestoreTransaction, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- START: Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    databaseURL: "https://tipsplit-e3wes-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.appspot.com",
    messagingSenderId: "984733883633",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};
// --- END: Firebase Configuration ---

const MASTER_REFERRAL_ID = "RMZC000B001";
let auth, db;

// --- DOM Elements Cache ---
const DOMElements = {
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    logoutBtn: document.getElementById('logout-btn'),
    filterBar: document.getElementById('filter-bar'),
    cashbackModal: document.getElementById('cashback-modal'),
    profileModal: document.getElementById('profile-modal'),
    cashbackClaimModal: document.getElementById('cashback-claim-modal'),
    cashbackRequestForm: document.getElementById('cashback-request-form'),
    passwordChangeForm: document.getElementById('password-change-form'),
    openCashbackModalBtn: document.getElementById('open-cashback-modal'),
    openProfileModalBtn: document.getElementById('open-profile-modal'),
    claimNowBtn: document.getElementById('claim-now-btn'),
    cashbackSubmitBtn: document.getElementById('cashback-submit-btn'),
    walletShareBtn: document.getElementById('wallet-share-btn'),
    userReferralContainer: document.getElementById('user-referral-container'),
    userReferralId: document.getElementById('user-referral-id'),
    profileDisplay: document.getElementById('profile-display'),
    profileModalDisplay: document.getElementById('profile-modal-display'),
    profileReferralId: document.getElementById('profile-referral-id'),
    loginErrorMsg: document.getElementById('login-error-msg'),
    registerErrorMsg: document.getElementById('register-error-msg'),
    cashbackErrorMsg: document.getElementById('cashback-error-msg'),
    passwordChangeErrorMsg: document.getElementById('password-change-error-msg'),
};

// --- Application State ---
let currentUserData = null;
let activeListeners = [];
let allTransactions = [];
let cashbackRequests = []; // **NEW:** To store cashback requests separately
let activeFilter = 'all';
let pendingCashbackClaim = null;
let isInitialDataLoaded = false;

// --- Initialization ---
async function initializeFirebaseApp() {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        // **LOGIN STABILITY FIX:** Set persistence to SESSION
        // This isolates the login to the current tab, preventing conflicts with the admin panel.
        await setPersistence(auth, browserSessionPersistence);
        db = getFirestore(app);
        setupApplication();
    } catch (error) {
        console.error("FATAL: Firebase initialization failed.", error);
        showFatalError("Application could not start. Please check connection.");
    }
}

// --- UI Helper Functions ---
function showLoader() {
    let loader = document.getElementById('app-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'app-loader';
        loader.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.9); z-index: 9999; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #e50914; font-weight: 600; backdrop-filter: blur(5px);`;
        loader.textContent = 'Loading Your Account...';
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

function hideLoader() {
    const loader = document.getElementById('app-loader');
    if (loader) loader.style.display = 'none';
}

function showFatalError(message) {
    document.body.innerHTML = `<div style="text-align: center; padding: 50px; color: #ff6b6b;">${message}</div>`;
}

function showErrorMessage(element, message) { if(element) { element.textContent = message; element.style.display = 'block'; } }
function hideErrorMessage(element) { if(element) { element.style.display = 'none'; } }
function toggleView(viewId) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(viewId)?.classList.add('active'); }
function openModal(modalElement) { modalElement?.classList.add('active'); }
function closeModal(modalElement) { modalElement?.classList.remove('active'); }
function showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Authentication & Data Handling ---
function setupAuthentication() {
    onAuthStateChanged(auth, user => {
        if (user) {
            showLoader();
            toggleView('dashboard-view');
            attachRealtimeListeners(user);
        } else {
            detachAllListeners();
            hideLoader();
            const params = new URLSearchParams(window.location.search);
            const refCode = params.get('ref');
            toggleView(refCode ? 'registration-view' : 'login-view');
            if (refCode) document.getElementById('reg-referral').value = refCode;
        }
    });
    // ... (Login and Register form listeners remain the same)
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
        const referralCode = document.getElementById('reg-referral').value.trim().toUpperCase();

        if (!name || !/^\d{10}$/.test(mobile) || password.length < 6) {
            return showErrorMessage(DOMElements.registerErrorMsg, "Kripya sabhi details sahi se bharein.");
        }

        let referredBy = "none", upline = [];
        if (referralCode) {
            if (referralCode === "RMZC000B001") {
                referredBy = "master";
            } else {
                const q = query(collection(db, 'users'), where('referralId', '==', referralCode));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const referrerDoc = querySnapshot.docs[0];
                    referredBy = referrerDoc.id;
                    // upline logic can be added here if needed
                } else {
                    return showErrorMessage(DOMElements.registerErrorMsg, "Aमान्य रेफरल कोड।");
                }
            }
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            const newUserRef = doc(db, 'users', userCredential.user.uid);
            await updateProfile(userCredential.user, { displayName: name });
            await setDoc(newUserRef, {
                uid: userCredential.user.uid, name, mobile, wallet: 0, lifetimeEarning: 0,
                referralId: `RMZC${Math.floor(100+Math.random()*900)}B${Math.floor(100+Math.random()*900)}`, 
                referredBy, upline, createdAt: serverTimestamp()
            });
            showToast("Registration safal hua! Ab aap login kar sakte hain.");
            toggleView('login-view');
            DOMElements.registerForm.reset();
        } catch (error) {
            showErrorMessage(DOMElements.registerErrorMsg, error.code === 'auth/email-already-in-use' ? "Is mobile number se account pehle se hai." : "Registration fail ho gaya.");
        }
    });

    DOMElements.logoutBtn.addEventListener('click', () => signOut(auth));
}

function attachRealtimeListeners(user) {
    detachAllListeners();
    const uid = user.uid;
    isInitialDataLoaded = false;

    // Listener for user data
    const userUnsubscribe = onSnapshot(doc(db, 'users', uid), (doc) => {
        if (doc.exists()) {
            currentUserData = { id: doc.id, ...doc.data() };
            updateDashboardUI(currentUserData, user);
            if (!isInitialDataLoaded) { isInitialDataLoaded = true; hideLoader(); }
        } else {
             setTimeout(() => { getDoc(doc(db, 'users', uid)).then(d => !d.exists() && signOut(auth)); }, 5000);
        }
    }, error => { console.error("User listener error:", error); hideLoader(); });
    activeListeners.push(userUnsubscribe);

    // Listener for completed transactions
    const transactionsQuery = query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc"));
    const transUnsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
        allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        combineAndRenderHistory();
    }, error => console.error("Transactions listener error:", error));
    activeListeners.push(transUnsubscribe);

    // **NEW:** Listener for all cashback requests (pending, rejected, etc.)
    const requestsQuery = query(collection(db, "cashback_requests"), where("userId", "==", uid), orderBy("requestDate", "desc"));
    const requestsUnsubscribe = onSnapshot(requestsQuery, (snapshot) => {
        cashbackRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        combineAndRenderHistory();
    }, error => console.error("Cashback requests listener error:", error));
    activeListeners.push(requestsUnsubscribe);

    // Listener for claimable cashback
    const claimableQuery = query(collection(db, 'cashback_requests'), where('userId', '==', uid), where('status', '==', 'approved'), where('claimed', '==', false));
    const claimableUnsubscribe = onSnapshot(claimableQuery, (snapshot) => {
        if (!snapshot.empty) {
            pendingCashbackClaim = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            document.getElementById('claim-amount-display').textContent = `₹ ${parseFloat(pendingCashbackClaim.cashbackAmount).toFixed(2)}`;
            openModal(DOMElements.cashbackClaimModal);
        } else {
            pendingCashbackClaim = null;
        }
    });
    activeListeners.push(claimableUnsubscribe);
}

function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null; allTransactions = []; cashbackRequests = []; isInitialDataLoaded = false;
}

// --- UI Rendering ---
function updateDashboardUI(dbData, authUser) {
    // ... (This function remains mostly the same)
    if (!dbData || !authUser) return;
    DOMElements.userReferralId.textContent = dbData.referralId || 'N/A';
    document.getElementById('user-name-display').textContent = authUser.displayName;
    document.getElementById('wallet-balance').textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹ ${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    const initial = authUser.displayName ? authUser.displayName.charAt(0).toUpperCase() : 'R';
    const placeholderUrl = `https://placehold.co/80x80/ffffff/2980b9?text=${initial}`;
    DOMElements.profileDisplay.src = dbData.profilePictureUrl || placeholderUrl;
    DOMElements.profileModalDisplay.src = dbData.profilePictureUrl || placeholderUrl;
    document.getElementById('profile-modal-name').textContent = authUser.displayName;
    document.getElementById('profile-modal-mobile').textContent = dbData.mobile;
    DOMElements.profileReferralId.textContent = dbData.referralId || 'N/A';
}

// **NEW & IMPROVED:** Combines data from two sources before rendering
function combineAndRenderHistory() {
    if (!isInitialDataLoaded) return; // Wait for user data to load first

    // Map completed transactions to a standard format
    const formattedTransactions = allTransactions.map(t => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.timestamp?.toDate(),
        status: 'completed',
        type: t.type,
        isTransaction: true
    }));

    // Map pending/rejected cashback requests to the same format
    const formattedRequests = cashbackRequests
        .filter(r => r.status === 'pending' || r.status === 'rejected') // Only show these statuses
        .map(r => ({
            id: r.id,
            description: `Request for ${r.productName}`,
            amount: r.cashbackAmount,
            date: r.requestDate?.toDate(),
            status: r.status, // 'pending' or 'rejected'
            type: 'cashback',
            isTransaction: false
        }));

    // Combine both lists and sort by date
    const combinedList = [...formattedTransactions, ...formattedRequests];
    combinedList.sort((a, b) => (b.date || 0) - (a.date || 0)); // Sort newest first

    renderUnifiedHistory(combinedList);
}

function renderUnifiedHistory(historyItems) {
    const historyList = document.getElementById('unified-history-list');
    historyList.innerHTML = '';

    const filtered = historyItems.filter(item => {
        if (activeFilter === 'all') return true;
        return item.type === activeFilter;
    });

    if (filtered.length === 0) {
        historyList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><h4>No History Found</h4><p>Is filter ke liye aapka history khaali hai.</p></div>`;
        return;
    }

    filtered.forEach(item => {
        const itemDiv = document.createElement('div');
        let typeClass, sign, icon, statusClass;

        if (item.isTransaction) {
            sign = item.amount >= 0 ? '+' : '-';
            typeClass = item.amount >= 0 ? 'credit' : 'debit';
            icon = { cashback: '🎁', commission: '🏆', payment: '↔️', claim: '💸' }[item.type] || '📜';
            statusClass = 'status-completed';
        } else { // It's a request
            sign = '+';
            typeClass = 'credit'; // Visually treat as a potential credit
            icon = '🕒';
            statusClass = `status-${item.status}`; // status-pending or status-rejected
        }
        
        const dateString = item.date ? item.date.toLocaleDateString() : 'No date';

        itemDiv.className = `history-item ${item.type === 'commission' ? 'commission' : typeClass}`;
        itemDiv.innerHTML = `
            <div class="history-details">
                <div class="history-icon ${typeClass}">${icon}</div>
                <div class="history-info">
                    <div class="title">${item.description || 'N/A'}</div>
                    <div class="date">${dateString}</div>
                </div>
            </div>
            <div class="history-amount">
                <div class="amount ${typeClass}">${sign} ₹${Math.abs(item.amount).toFixed(2)}</div>
                <span class="status ${statusClass}">${item.status}</span>
            </div>`;
        historyList.appendChild(itemDiv);
    });
}

// --- Event Handlers & Application Setup ---
function setupApplication() {
    setupAuthentication();
    
    document.getElementById('show-register-link').addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    document.getElementById('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    
    DOMElements.openCashbackModalBtn.addEventListener('click', () => {
        DOMElements.cashbackRequestForm.reset();
        hideErrorMessage(DOMElements.cashbackErrorMsg);
        document.getElementById('product-purchase-date').valueAsDate = new Date();
        openModal(DOMElements.cashbackModal);
    });

    DOMElements.openProfileModalBtn.addEventListener('click', () => {
        if (!currentUserData) return showToast("User data load ho raha hai...");
        DOMElements.passwordChangeForm.reset();
        hideErrorMessage(DOMElements.passwordChangeErrorMsg);
        openModal(DOMElements.profileModal);
    });

    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay'))));
    
    // Form Submissions
    DOMElements.cashbackRequestForm.addEventListener('submit', handleCashbackRequest);
    DOMElements.claimNowBtn.addEventListener('click', handleCashbackClaim);
    DOMElements.passwordChangeForm.addEventListener('submit', handlePasswordChange);

    // Filter bar logic
    DOMElements.filterBar.addEventListener('click', e => {
        const target = e.target.closest('.filter-btn');
        if (!target) return;
        DOMElements.filterBar.querySelector('.active')?.classList.remove('active');
        target.classList.add('active');
        activeFilter = target.dataset.filter;
        combineAndRenderHistory(); // Re-render with the new filter
    });
    // ... other handlers like share, copy referral etc.
}

// Placeholder for other functions like handleCashbackClaim, handleCashbackRequest, handlePasswordChange
// These functions can remain the same as in the previous version.
async function handleCashbackClaim() {
    if (!pendingCashbackClaim || !currentUserData) return;
    DOMElements.claimNowBtn.disabled = true;
    DOMElements.claimNowBtn.textContent = "Claiming...";

    const requestRef = doc(db, "cashback_requests", pendingCashbackClaim.id);
    const userRef = doc(db, "users", currentUserData.id);

    try {
        await firestoreTransaction(db, async (transaction) => {
            const amountToClaim = pendingCashbackClaim.cashbackAmount;
            transaction.update(userRef, {
                wallet: increment(amountToClaim),
                lifetimeEarning: increment(amountToClaim)
            });
            transaction.update(requestRef, { claimed: true, status: 'completed' });
            const newTransactionRef = doc(collection(db, "transactions"));
            transaction.set(newTransactionRef, {
                type: 'cashback', amount: amountToClaim,
                description: `Claimed cashback for ${pendingCashbackClaim.productName}`,
                status: 'completed', timestamp: serverTimestamp(),
                involvedUsers: [currentUserData.id]
            });
        });
        showToast("Cashback safaltapoorvak claim kiya gaya!");
        closeModal(DOMElements.cashbackClaimModal);
    } catch (error) {
        console.error("Claim Error:", error);
        showToast(`Error: ${error.message}`);
    } finally {
        DOMElements.claimNowBtn.disabled = false;
        DOMElements.claimNowBtn.textContent = "Claim Now";
    }
}

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
        const configDoc = await getDoc(doc(db, "app_settings", "config"));
        const cashbackPercentage = configDoc.exists() ? configDoc.data().cashback_percentage : 3;
        const cashbackAmount = productPrice * (cashbackPercentage / 100);

        await addDoc(collection(db, "cashback_requests"), {
            userId: currentUserData.id, userName: currentUserData.name, userMobile: currentUserData.mobile,
            productName, productPrice, purchaseDate: new Date(purchaseDate), cashbackAmount,
            status: "pending", requestDate: serverTimestamp(), claimed: false
        });
        showToast("Cashback request submit ho gaya!");
        DOMElements.cashbackRequestForm.reset();
        closeModal(DOMElements.cashbackModal);
    } catch (error) {
        showErrorMessage(DOMElements.cashbackErrorMsg, `Error: ${error.message}`);
    } finally {
        DOMElements.cashbackSubmitBtn.disabled = false;
    }
}

async function handlePasswordChange(e) {
    e.preventDefault();
    hideErrorMessage(DOMElements.passwordChangeErrorMsg);
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword.length < 6) return showErrorMessage(DOMElements.passwordChangeErrorMsg, "Naya password kam se kam 6 akshar ka hona chahiye.");
    if (newPassword !== confirmPassword) return showErrorMessage(DOMElements.passwordChangeErrorMsg, "Naya password match nahi ho raha hai.");

    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, currentPassword);

    try {
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        showToast("Password safaltapoorvak badal gaya!");
        DOMElements.passwordChangeForm.reset();
        closeModal(DOMElements.profileModal);
    } catch (error) {
        showErrorMessage(DOMElements.passwordChangeErrorMsg, "Purana password galat hai ya koi error aayi.");
    }
}


// --- Start the App ---
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);
