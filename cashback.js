import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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

const ADMIN_PAYMENT_ID = "@RamazoneStoreCashback";
const MASTER_REFERRAL_ID = "RMZC000B001";
let auth, db;

const DOMElements = {
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    logoutBtn: document.getElementById('logout-btn'),
    notificationBtn: document.getElementById('notification-btn'),
    notificationDot: document.getElementById('notification-dot'),
    filterBar: document.getElementById('filter-bar'),
    dateFilter: document.getElementById('date-filter'),
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
    profileDisplay: document.getElementById('profile-display'),
    profileModalDisplay: document.getElementById('profile-modal-display'),
    userReferralContainer: document.getElementById('user-referral-container'),
    userReferralId: document.getElementById('user-referral-id'),
    profileReferralId: document.getElementById('profile-referral-id'),
    loginErrorMsg: document.getElementById('login-error-msg'),
    registerErrorMsg: document.getElementById('register-error-msg'),
    claimErrorMsg: document.getElementById('claim-error-msg'),
    cashbackErrorMsg: document.getElementById('cashback-error-msg'),
    modalErrorMsg: document.getElementById('modal-error-msg'),
    passwordChangeErrorMsg: document.getElementById('password-change-error-msg'),
    paymentErrorMsg: document.getElementById('payment-error-msg'),
    scannerStatus: document.getElementById('scanner-status'),
};

let currentUserData = null;
let activeListeners = [];
let allTransactions = [];
let allNotifications = [];
let activeFilter = 'all';
let scanner = null;
let tempActionData = {};
let pendingCashbackClaim = null;
let currentPopupNotification = null;

function initializeFirebaseApp() {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        setupApplication();
    } catch (error) {
        console.error("FATAL: Firebase initialization failed.", error);
        document.body.innerHTML = `<div style="text-align: center; padding: 50px; color: #ff6b6b;">Application could not start. Please check connection and configuration.</div>`;
    }
}

function handleProfilePictureUpload(event) {
    showToast("Profile picture upload is currently disabled.");
}

function showFullImage(src) {
    if (!src || src.includes('placehold.co')) return;
    document.getElementById('full-view-image').src = src;
    openModal(DOMElements.imageViewModal);
}

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

function generateReferralCode() {
    const part1 = Math.floor(100 + Math.random() * 900);
    const part2 = Math.floor(100 + Math.random() * 900);
    return `RMZC${part1}B${part2}`;
}

async function getUpline(userRefId, levels = 5) {
    let upline = [];
    let currentUserId = userRefId;
    for (let i = 0; i < levels; i++) {
        if (!currentUserId || currentUserId === 'master' || currentUserId === 'none') {
            break;
        }
        const userDocRef = doc(db, 'users', currentUserId);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
            const userData = userDoc.data();
            upline.push(currentUserId);
            currentUserId = userData.referredBy;
        } else {
            break;
        }
    }
    return upline;
}

function setupAuthentication() {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');

    onAuthStateChanged(auth, user => {
        if (user) { 
            toggleView('dashboard-view'); 
            attachRealtimeListeners(user); 
        } else { 
            if (refCode) {
                toggleView('registration-view');
                document.getElementById('reg-referral').value = refCode;
            } else {
                toggleView('login-view');
            }
            detachAllListeners(); 
        }
    });

    DOMElements.loginForm.addEventListener('submit', e => {
        e.preventDefault();
        hideErrorMessage(DOMElements.loginErrorMsg);
        signInWithEmailAndPassword(auth, `${document.getElementById('login-mobile').value}@ramazone.com`, document.getElementById('login-password').value)
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
            showErrorMessage(DOMElements.registerErrorMsg, "Kripya sabhi details sahi se bharein."); 
            return; 
        }
        
        let referredBy = "none";
        let upline = [];

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
                    showErrorMessage(DOMElements.registerErrorMsg, "Invalid referral code.");
                    return;
                }
            }
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            const newUserRef = doc(db, 'users', userCredential.user.uid);
            await updateProfile(userCredential.user, { displayName: name });
            
            await setDoc(newUserRef, {
                uid: userCredential.user.uid, name, mobile, wallet: 0, lifetimeEarning: 0, dueAmount: 0,
                profilePictureUrl: '', referralId: generateReferralCode(), referredBy: referredBy,
                upline: upline,
                createdAt: serverTimestamp()
            });

            alert("Registration safal hua! Ab aap login kar sakte hain.");
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

    const userDocRef = doc(db, 'users', uid);
    const userUnsubscribe = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
            currentUserData = { id: doc.id, ...doc.data() };
            updateDashboardUI(currentUserData, user);
        } else {
            console.error("User document not found, but user is authenticated. Logging out to prevent issues.");
            signOut(auth);
        }
    });
    activeListeners.push(userUnsubscribe);

    const transactionsQuery = query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc"));
    const transUnsubscribe = onSnapshot(transactionsQuery, (querySnapshot) => {
        allTransactions = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderUnifiedHistory();
    });
    activeListeners.push(transUnsubscribe);
    
    const cashbackQuery = query(collection(db, 'cashback_requests'), where('userId', '==', uid), where('status', '==', 'approved'), where('claimed', '==', false));
    const cashbackUnsubscribe = onSnapshot(cashbackQuery, (snapshot) => {
        if (!snapshot.empty) {
            const claimable = {id: snapshot.docs[0].id, ...snapshot.docs[0].data()};
            pendingCashbackClaim = claimable;
            document.getElementById('claim-amount-display').textContent = `₹ ${parseFloat(claimable.cashbackAmount).toFixed(2)}`;
            openModal(DOMElements.cashbackClaimModal);
            DOMElements.openCashbackModalBtn.classList.add("has-claim");
        } else {
            pendingCashbackClaim = null;
            DOMElements.openCashbackModalBtn.classList.remove("has-claim");
        }
    });
    activeListeners.push(cashbackUnsubscribe);

    const notificationsQuery = query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(20));
    const notifUnsubscribe = onSnapshot(notificationsQuery, (querySnapshot) => {
        allNotifications = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        // processNotifications(); // Simplified for now
    });
    activeListeners.push(notifUnsubscribe);
}

function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null;
    allTransactions = [];
    allNotifications = [];
}

function updateDashboardUI(dbData, authUser) {
    if (!dbData || !authUser) return;
    
    DOMElements.userReferralId.textContent = dbData.referralId || 'N/A';
    document.getElementById('user-name-display').textContent = authUser.displayName;
    const walletBalance = dbData.wallet || 0;
    const dueAmount = dbData.dueAmount || 0;
    const creditLimit = walletBalance + dueAmount;
    document.getElementById('wallet-balance').textContent = `₹ ${walletBalance.toFixed(2)}`;
    document.getElementById('credit-limit').textContent = `₹${creditLimit.toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    document.getElementById('due-amount').textContent = `- ₹${dueAmount.toFixed(2)}`;
    document.querySelector('.wallet-footer-item .due').parentElement.style.display = dueAmount > 0 ? 'block' : 'none';

    const initial = authUser.displayName ? authUser.displayName.charAt(0).toUpperCase() : 'R';
    const placeholderUrl = `https://placehold.co/80x80/ffffff/2980b9?text=${initial}`;
    const profilePicUrl = dbData.profilePictureUrl || placeholderUrl;
    DOMElements.profileDisplay.src = profilePicUrl;
    DOMElements.profileModalDisplay.src = profilePicUrl;
    
    document.getElementById('profile-modal-name').textContent = authUser.displayName;
    document.getElementById('profile-modal-mobile').textContent = dbData.mobile;
    document.getElementById('whatsapp-support-link').href = `https://wa.me/917903698180?text=${encodeURIComponent(`Help Required\nName: ${authUser.displayName}\nMobile: ${dbData.mobile}`)}`;
    document.getElementById('profile-payment-id').textContent = generatePaymentId(authUser.displayName, dbData.mobile);
    DOMElements.profileReferralId.textContent = dbData.referralId || 'N/A';
}

function renderUnifiedHistory() {
    const historyList = document.getElementById('unified-history-list');
    historyList.innerHTML = '';

    const filtered = allTransactions.filter(item => {
        if (activeFilter === 'all') return true;
        return item.type === activeFilter;
    });

    if (filtered.length === 0) {
        historyList.innerHTML = getEmptyStateHTML('history');
        return;
    }

    filtered.forEach(trans => {
        const itemDiv = document.createElement('div');
        const sign = trans.amount > 0 ? '+' : '-';
        const typeClass = sign === '+' ? 'credit' : 'debit';
        const icon = { cashback: '🎁', commission: '🏆', payment: '↔️', claim: '💸' }[trans.type] || '📜';
        
        itemDiv.className = `history-item ${trans.type === 'commission' ? 'commission' : typeClass}`;
        
        itemDiv.innerHTML = `
            <div class="history-details">
                <div class="history-icon ${trans.type === 'commission' ? 'commission' : typeClass}">${icon}</div>
                <div class="history-info">
                    <div class="title">${trans.description}</div>
                    <div class="date">${trans.timestamp.toDate().toLocaleDateString()}</div>
                </div>
            </div>
            <div class="history-amount">
                <div class="amount ${typeClass}">${sign} ₹${Math.abs(trans.amount).toFixed(2)}</div>
                <span class="status status-completed">completed</span>
            </div>`;
        historyList.appendChild(itemDiv);
    });
}

function getEmptyStateHTML(type) {
    if (type === 'history') return `<div class="empty-state"><div class="empty-state-icon">📂</div><h4>No Transactions Found</h4><p>Your transaction history for the selected filter is empty.</p></div>`;
    if (type === 'coupons') return `<div class="empty-state"><div class="empty-state-icon">🎟️</div><h4>No Coupons Available</h4><p>You don't have any active coupons right now.</p></div>`;
    if (type === 'notifications') return `<div class="empty-state"><div class="empty-state-icon">📭</div><h4>No Notifications</h4><p>You're all caught up!</p></div>`;
    return '';
}

async function handleCashbackClaim() {
    if (!pendingCashbackClaim || !currentUserData) return;
    DOMElements.claimNowBtn.disabled = true;
    DOMElements.claimNowBtn.textContent = "Claiming...";

    const requestDocRef = doc(db, "cashback_requests", pendingCashbackClaim.id);
    const userDocRef = doc(db, "users", currentUserData.id);
    const transactionsColRef = collection(db, "transactions");

    try {
        await firestoreTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userDocRef);
            if (!userDoc.exists()) throw "User does not exist!";

            const amountToClaim = pendingCashbackClaim.cashbackAmount;
            
            transaction.update(userDocRef, {
                wallet: increment(amountToClaim),
                lifetimeEarning: increment(amountToClaim)
            });

            transaction.update(requestDocRef, {
                claimed: true,
                status: 'completed'
            });

            const newTransactionRef = doc(transactionsColRef);
            transaction.set(newTransactionRef, {
                type: 'cashback',
                amount: amountToClaim,
                description: `Claimed cashback for ${pendingCashbackClaim.productName}`,
                status: 'completed',
                timestamp: serverTimestamp(),
                involvedUsers: [currentUserData.id]
            });
        });

        showToast("Cashback claimed successfully!");
        closeModal(DOMElements.cashbackClaimModal);
        pendingCashbackClaim = null;
    } catch (error) {
        console.error("Claim Error:", error);
        showToast(`Error: ${error}`);
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

    if(!productName || isNaN(productPrice) || productPrice < 10 || !purchaseDate){ 
        showErrorMessage(DOMElements.cashbackErrorMsg,"Sahi details daalein."); 
        DOMElements.cashbackSubmitBtn.disabled = false;
        return; 
    }
    
    try {
        const configDocRef = doc(db, "app_settings", "config");
        const configDoc = await getDoc(configDocRef);
        const cashbackPercentage = configDoc.exists() ? configDoc.data().cashback_percentage : 3;
        const cashbackAmount = productPrice * (cashbackPercentage / 100);
        
        const requestsCol = collection(db, "cashback_requests");
        await addDoc(requestsCol, { 
            userId: currentUserData.id, 
            userName: currentUserData.name, 
            userMobile: currentUserData.mobile, 
            productName, 
            productPrice, 
            purchaseDate: new Date(purchaseDate), 
            cashbackAmount, 
            status: "pending", 
            requestDate: serverTimestamp(), 
            claimed: false 
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

function setupApplication() {
    setupAuthentication();
    document.getElementById('show-register-link').addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    document.getElementById('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    
    DOMElements.openCashbackModalBtn.addEventListener('click', () => {
        if (pendingCashbackClaim) { 
            openModal(DOMElements.cashbackClaimModal); 
        } else { 
            DOMElements.cashbackSubmitBtn.disabled = false;
            hideErrorMessage(DOMElements.cashbackErrorMsg);
            document.getElementById('product-purchase-date').valueAsDate = new Date();
            openModal(DOMElements.cashbackModal); 
        }
    });

    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay'))));
    
    DOMElements.cashbackRequestForm.addEventListener('submit', handleCashbackRequest);
    DOMElements.claimNowBtn.addEventListener('click', handleCashbackClaim);

    DOMElements.walletShareBtn.addEventListener('click', async () => { 
        if (!auth.currentUser || !currentUserData?.referralId) { 
            showToast("Data load ho raha hai..."); 
            return; 
        } 
        const referralLink = `${window.location.origin}${window.location.pathname}?ref=${currentUserData.referralId}`;
        const shareMessage = `🎉 *Wow! Ek Zabardast Offer!* 🎉\n\nMaine, *${auth.currentUser.displayName}*, Ramazone Cashback app se ab tak *₹${(currentUserData.lifetimeEarning || 0).toFixed(2)}* ki bachat ki hai! 🤑\n\nAap bhi is app ko use karein aur har khareed par dher saare paise bachayein. Miss mat karna! Mera code use karein: *${currentUserData.referralId}*\n\nAbhi join karein: ${referralLink}`; 
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

    DOMElements.userReferralContainer.addEventListener('click', () => {
        const referralId = DOMElements.userReferralId.textContent;
        if (referralId && referralId !== 'N/A') {
            navigator.clipboard.writeText(referralId).then(() => {
                showToast('Referral ID Copied!');
            });
        }
    });

    DOMElements.filterBar.addEventListener('click', e => { 
        const target = e.target.closest('.filter-btn'); 
        if (!target || target.type === 'date') return; 
        DOMElements.filterBar.querySelector('.active')?.classList.remove('active'); 
        target.classList.add('active'); 
        activeFilter = target.dataset.filter; 
        renderUnifiedHistory(); 
    });
}

document.addEventListener('DOMContentLoaded', initializeFirebaseApp);

