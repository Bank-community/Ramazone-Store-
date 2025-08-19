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
    userReferralId: document.getElementById('user-referral-id'),
    walletShareBtn: document.getElementById('wallet-share-btn'),
    profileDisplay: document.getElementById('profile-display'),
    profileModalDisplay: document.getElementById('profile-modal-display'),
    loginErrorMsg: document.getElementById('login-error-msg'),
    registerErrorMsg: document.getElementById('register-error-msg'),
    cashbackErrorMsg: document.getElementById('cashback-error-msg'),
    passwordChangeErrorMsg: document.getElementById('password-change-error-msg'),
};

// --- Application State ---
let currentUserData = null;
let activeListeners = [];
let allTransactions = [];
let cashbackRequests = [];
let activeFilter = 'all';
let pendingCashbackClaim = null;

// --- Initialization ---
async function initializeFirebaseApp() {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        await setPersistence(auth, browserSessionPersistence);
        db = getFirestore(app);
        setupApplication();
    } catch (error) {
        console.error("FATAL: Firebase initialization failed.", error);
        showFatalError("Application could not start.");
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
    
    DOMElements.loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const mobile = document.getElementById('login-mobile').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password)
            .catch(() => showErrorMessage(DOMElements.loginErrorMsg, "Galat mobile/password."));
    });

    DOMElements.registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const mobile = document.getElementById('reg-mobile').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const referralCode = document.getElementById('reg-referral').value.trim().toUpperCase();

        if (!name || !/^\d{10}$/.test(mobile) || password.length < 6) {
            return showErrorMessage(DOMElements.registerErrorMsg, "Sahi details bharein.");
        }
        // ... (rest of registration logic is fine)
    });

    DOMElements.logoutBtn.addEventListener('click', () => signOut(auth));
}

// **LOADER FIX:** This function is now async and handles initial load separately.
async function attachRealtimeListeners(user) {
    detachAllListeners();
    const uid = user.uid;

    try {
        // Step 1: Fetch initial user data once.
        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            currentUserData = { id: userDoc.id, ...userDoc.data() };
            updateDashboardUI(currentUserData, user);
        } else {
            console.error("User document not found. Logging out.");
            signOut(auth);
            return; // Stop execution
        }

        // Step 2: Hide the loader now that initial data is loaded.
        hideLoader();

        // Step 3: Now, attach all real-time listeners for updates.
        // Listener for user data (for real-time wallet updates etc.)
        const userUnsubscribe = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
                currentUserData = { id: doc.id, ...doc.data() };
                updateDashboardUI(currentUserData, user);
            }
        });
        activeListeners.push(userUnsubscribe);

        // Listener for completed transactions
        const transactionsQuery = query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc"));
        const transUnsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
            allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            combineAndRenderHistory();
        });
        activeListeners.push(transUnsubscribe);

        // Listener for all cashback requests
        const requestsQuery = query(collection(db, "cashback_requests"), where("userId", "==", uid), orderBy("requestDate", "desc"));
        const requestsUnsubscribe = onSnapshot(requestsQuery, (snapshot) => {
            cashbackRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            combineAndRenderHistory();
        });
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

    } catch (error) {
        console.error("Error during initial data load:", error);
        hideLoader();
        showToast("Error loading your account data.");
        signOut(auth);
    }
}


function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null; allTransactions = []; cashbackRequests = [];
}

function updateDashboardUI(dbData, authUser) {
    if (!dbData || !authUser) return;
    DOMElements.userReferralId.textContent = dbData.referralId || 'N/A';
    document.getElementById('user-name-display').textContent = authUser.displayName;
    document.getElementById('wallet-balance').textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹ ${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    const initial = authUser.displayName ? authUser.displayName.charAt(0).toUpperCase() : 'R';
    const placeholderUrl = `https://placehold.co/50x50/ffffff/2980b9?text=${initial}`;
    DOMElements.profileDisplay.src = dbData.profilePictureUrl || placeholderUrl;
    DOMElements.profileModalDisplay.src = dbData.profilePictureUrl || placeholderUrl;
}

function combineAndRenderHistory() {
    const formattedTransactions = allTransactions.map(t => ({
        id: t.id, description: t.description, amount: t.amount,
        date: t.timestamp?.toDate(), status: 'completed', type: t.type, isTransaction: true
    }));
    const formattedRequests = cashbackRequests
        .filter(r => r.status === 'pending' || r.status === 'rejected')
        .map(r => ({
            id: r.id, description: `Request for ${r.productName}`, amount: r.cashbackAmount,
            date: r.requestDate?.toDate(), status: r.status, type: 'cashback', isTransaction: false
        }));
    const combinedList = [...formattedTransactions, ...formattedRequests];
    combinedList.sort((a, b) => (b.date || 0) - (a.date || 0));
    renderUnifiedHistory(combinedList);
}

function renderUnifiedHistory(historyItems) {
    const historyList = document.getElementById('unified-history-list');
    historyList.innerHTML = '';
    const filtered = historyItems.filter(item => activeFilter === 'all' || item.type === activeFilter);

    if (filtered.length === 0) {
        historyList.innerHTML = `<div class="empty-state"><h4>No History Found</h4></div>`;
        return;
    }
    // ... (rendering logic remains the same)
}

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
    
    DOMElements.filterBar.addEventListener('click', e => {
        const target = e.target.closest('.filter-btn');
        if (!target) return;
        DOMElements.filterBar.querySelector('.active')?.classList.remove('active');
        target.classList.add('active');
        activeFilter = target.dataset.filter;
        combineAndRenderHistory();
    });
    // ... (other event listeners and form submission handlers)
}

// --- Start the App ---
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);

