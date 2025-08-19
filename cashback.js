import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, getDocs, writeBatch, serverTimestamp, orderBy, limit, runTransaction as firestoreTransaction, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- START: Firebase Configuration ---
// जरूरी: अपनी Firebase कॉन्फ़िगरेशन जानकारी यहाँ डालें
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
let activeFilter = 'all';
let pendingCashbackClaim = null;
let isInitialDataLoaded = false;

// --- Initialization ---
function initializeFirebaseApp() {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        setupApplication();
    } catch (error) {
        console.error("FATAL: Firebase initialization failed.", error);
        showFatalError("Application could not start. Please check connection.");
    }
}

// --- UI Helper Functions ---
function showLoader() {
    // एक लोडर एलिमेंट बनाएँ और दिखाएँ
    let loader = document.getElementById('app-loader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'app-loader';
        loader.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.8); z-index: 9999; display: flex; justify-content: center; align-items: center; font-size: 18px; color: #e50914; font-weight: 600;`;
        loader.textContent = 'Loading...';
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

// --- Core Logic ---
function generateReferralCode() {
    const part1 = Math.floor(100 + Math.random() * 900);
    const part2 = Math.floor(100 + Math.random() * 900);
    return `RMZC${part1}B${part2}`;
}

async function getUpline(userRefId, levels = 5) {
    let upline = [];
    let currentUserId = userRefId;
    for (let i = 0; i < levels; i++) {
        if (!currentUserId || currentUserId === 'master' || currentUserId === 'none') break;
        try {
            const userDoc = await getDoc(doc(db, 'users', currentUserId));
            if (userDoc.exists()) {
                upline.push(currentUserId);
                currentUserId = userDoc.data().referredBy;
            } else break;
        } catch (error) { console.error("Upline fetch error:", error); break; }
    }
    return upline;
}

// --- Authentication ---
function setupAuthentication() {
    onAuthStateChanged(auth, user => {
        const params = new URLSearchParams(window.location.search);
        const refCode = params.get('ref');

        if (user) {
            showLoader();
            toggleView('dashboard-view');
            attachRealtimeListeners(user);
        } else {
            detachAllListeners();
            hideLoader();
            toggleView(refCode ? 'registration-view' : 'login-view');
            if (refCode) document.getElementById('reg-referral').value = refCode;
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
        const referralCode = document.getElementById('reg-referral').value.trim().toUpperCase();

        if (!name || !/^\d{10}$/.test(mobile) || password.length < 6) {
            return showErrorMessage(DOMElements.registerErrorMsg, "Kripya sabhi details sahi se bharein.");
        }

        let referredBy = "none", upline = [];
        if (referralCode) {
            if (referralCode === MASTER_REFERRAL_ID) {
                referredBy = "master";
            } else {
                const q = query(collection(db, 'users'), where('referralId', '==', referralCode));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const referrerDoc = querySnapshot.docs[0];
                    referredBy = referrerDoc.id;
                    upline = await getUpline(referredBy);
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
                referralId: generateReferralCode(), referredBy, upline, createdAt: serverTimestamp()
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

// --- Realtime Data Handling ---
function attachRealtimeListeners(user) {
    detachAllListeners();
    const uid = user.uid;
    isInitialDataLoaded = false;

    const userDocRef = doc(db, 'users', uid);
    const userUnsubscribe = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
            currentUserData = { id: doc.id, ...doc.data() };
            updateDashboardUI(currentUserData, user);
            if (!isInitialDataLoaded) {
                isInitialDataLoaded = true;
                hideLoader();
            }
        } else {
            // अगर डॉक्यूमेंट मौजूद नहीं है, तो कुछ सेकंड प्रतीक्षा करें, फिर लॉगआउट करें।
            // यह रजिस्ट्रेशन के दौरान रेस कंडीशन से बचने में मदद करता है।
            setTimeout(() => {
                getDoc(userDocRef).then(checkDoc => {
                    if (!checkDoc.exists()) {
                        console.error("User document not found after delay. Logging out.");
                        signOut(auth);
                    }
                });
            }, 3000);
        }
    }, (error) => {
        console.error("Error listening to user document:", error);
        showToast("Could not load user data.");
        hideLoader();
    });
    activeListeners.push(userUnsubscribe);

    // जरूरी: Firestore में इस क्वेरी के लिए एक इंडेक्स बनाएँ।
    // Collection: transactions, Fields: involvedUsers (Array), timestamp (Descending)
    const transactionsQuery = query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc"));
    const transUnsubscribe = onSnapshot(transactionsQuery, (querySnapshot) => {
        allTransactions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUnifiedHistory();
    }, (error) => {
        console.error("Error listening to transactions:", error);
        showToast("Could not load transaction history.");
    });
    activeListeners.push(transUnsubscribe);

    const cashbackQuery = query(collection(db, 'cashback_requests'), where('userId', '==', uid), where('status', '==', 'approved'), where('claimed', '==', false));
    const cashbackUnsubscribe = onSnapshot(cashbackQuery, (snapshot) => {
        if (!snapshot.empty) {
            pendingCashbackClaim = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            document.getElementById('claim-amount-display').textContent = `₹ ${parseFloat(pendingCashbackClaim.cashbackAmount).toFixed(2)}`;
            openModal(DOMElements.cashbackClaimModal);
            DOMElements.openCashbackModalBtn.classList.add("has-claim");
        } else {
            pendingCashbackClaim = null;
            DOMElements.openCashbackModalBtn.classList.remove("has-claim");
        }
    }, (error) => console.error("Error listening to cashback requests:", error));
    activeListeners.push(cashbackUnsubscribe);
}

function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null;
    allTransactions = [];
    isInitialDataLoaded = false;
}

// --- UI Updates ---
function updateDashboardUI(dbData, authUser) {
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

function renderUnifiedHistory() {
    const historyList = document.getElementById('unified-history-list');
    historyList.innerHTML = '';

    const filtered = allTransactions.filter(item => activeFilter === 'all' || item.type === activeFilter);
    if (filtered.length === 0) {
        historyList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><h4>No Transactions Found</h4><p>Is filter ke liye aapka transaction history khaali hai.</p></div>`;
        return;
    }

    filtered.forEach(trans => {
        // Robust checks for transaction data
        const amount = typeof trans.amount === 'number' ? trans.amount : 0;
        const description = trans.description || 'No description';
        const dateString = trans.timestamp && typeof trans.timestamp.toDate === 'function'
            ? trans.timestamp.toDate().toLocaleDateString()
            : 'Invalid date';

        const itemDiv = document.createElement('div');
        const sign = amount >= 0 ? '+' : '-';
        const typeClass = amount >= 0 ? 'credit' : 'debit';
        const icon = { cashback: '🎁', commission: '🏆', payment: '↔️', claim: '💸' }[trans.type] || '📜';

        itemDiv.className = `history-item ${trans.type === 'commission' ? 'commission' : typeClass}`;
        itemDiv.innerHTML = `
            <div class="history-details">
                <div class="history-icon ${typeClass}">${icon}</div>
                <div class="history-info">
                    <div class="title">${description}</div>
                    <div class="date">${dateString}</div>
                </div>
            </div>
            <div class="history-amount">
                <div class="amount ${typeClass}">${sign} ₹${Math.abs(amount).toFixed(2)}</div>
                <span class="status status-completed">completed</span>
            </div>`;
        historyList.appendChild(itemDiv);
    });
}


// --- Event Handlers ---
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
                description: `Cashback for ${pendingCashbackClaim.productName}`,
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

// --- Application Setup ---
function setupApplication() {
    setupAuthentication();
    
    document.getElementById('show-register-link').addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    document.getElementById('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    
    DOMElements.openCashbackModalBtn.addEventListener('click', () => {
        if (pendingCashbackClaim) {
            openModal(DOMElements.cashbackClaimModal);
        } else {
            DOMElements.cashbackRequestForm.reset();
            hideErrorMessage(DOMElements.cashbackErrorMsg);
            document.getElementById('product-purchase-date').valueAsDate = new Date();
            openModal(DOMElements.cashbackModal);
        }
    });

    DOMElements.openProfileModalBtn.addEventListener('click', () => {
        if (!currentUserData) return showToast("User data load ho raha hai...");
        DOMElements.passwordChangeForm.reset();
        hideErrorMessage(DOMElements.passwordChangeErrorMsg);
        openModal(DOMElements.profileModal);
    });

    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay'))));
    
    DOMElements.cashbackRequestForm.addEventListener('submit', handleCashbackRequest);
    DOMElements.claimNowBtn.addEventListener('click', handleCashbackClaim);
    DOMElements.passwordChangeForm.addEventListener('submit', handlePasswordChange);

    DOMElements.walletShareBtn.addEventListener('click', () => {
        if (!currentUserData?.referralId) return showToast("Data load ho raha hai...");
        const referralLink = `${window.location.origin}${window.location.pathname}?ref=${currentUserData.referralId}`;
        const shareMessage = `🎉 *Wow! Ek Zabardast Offer!* 🎉\nMera code *${currentUserData.referralId}* use karein aur Ramazone Cashback app par har khareed par dher saare paise bachayein.\n\nAbhi join karein: ${referralLink}`;
        if (navigator.share) {
            navigator.share({ text: shareMessage }).catch(err => console.log('Share error', err));
        } else {
            navigator.clipboard.writeText(shareMessage).then(() => showToast('Share message copy ho gaya!'));
        }
    });

    DOMElements.userReferralContainer.addEventListener('click', () => {
        const referralId = DOMElements.userReferralId.textContent;
        if (referralId && referralId !== 'N/A') {
            navigator.clipboard.writeText(referralId).then(() => showToast('Referral ID Copied!'));
        }
    });

    DOMElements.filterBar.addEventListener('click', e => {
        const target = e.target.closest('.filter-btn');
        if (!target) return;
        DOMElements.filterBar.querySelector('.active')?.classList.remove('active');
        target.classList.add('active');
        activeFilter = target.dataset.filter;
        renderUnifiedHistory();
    });
}

// --- Start the App ---
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);

