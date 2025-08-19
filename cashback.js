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
    
    // Modals
    cashbackModal: document.getElementById('cashback-modal'),
    profileModal: document.getElementById('profile-modal'),
    cashbackClaimModal: document.getElementById('cashback-claim-modal'),
    
    // Forms
    cashbackRequestForm: document.getElementById('cashback-request-form'),
    passwordChangeForm: document.getElementById('password-change-form'),
    
    // Buttons
    openCashbackModalBtn: document.getElementById('open-cashback-modal'),
    openProfileModalBtn: document.getElementById('open-profile-modal'),
    claimNowBtn: document.getElementById('claim-now-btn'),
    cashbackSubmitBtn: document.getElementById('cashback-submit-btn'),
    walletShareBtn: document.getElementById('wallet-share-btn'),
    
    // Displays & Containers
    userReferralContainer: document.getElementById('user-referral-container'),
    userReferralId: document.getElementById('user-referral-id'),
    profileDisplay: document.getElementById('profile-display'),
    profileModalDisplay: document.getElementById('profile-modal-display'),
    profileReferralId: document.getElementById('profile-referral-id'),

    // Error Messages
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

// --- Initialization ---
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

// --- UI Helper Functions ---
function showErrorMessage(element, message) { if(element) { element.textContent = message; element.style.display = 'block'; } }
function hideErrorMessage(element) { if(element) { element.style.display = 'none'; } }
function toggleView(viewId) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(viewId)?.classList.add('active'); }
function openModal(modalElement) { modalElement?.classList.add('active'); }
function closeModal(modalElement) { modalElement?.classList.remove('active'); }
function showToast(message) {
    const toast = document.getElementById('toast-notification');
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
            const userDocRef = doc(db, 'users', currentUserId);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const userData = userDoc.data();
                upline.push(currentUserId);
                currentUserId = userData.referredBy;
            } else {
                break;
            }
        } catch (error) {
            console.error("Error getting upline:", error);
            break;
        }
    }
    return upline;
}

// --- Authentication ---
function setupAuthentication() {
    onAuthStateChanged(auth, user => {
        const params = new URLSearchParams(window.location.search);
        const refCode = params.get('ref');

        if (user) { 
            toggleView('dashboard-view'); 
            attachRealtimeListeners(user); 
        } else { 
            detachAllListeners();
            if (refCode && !sessionStorage.getItem('logout_initiated')) {
                toggleView('registration-view');
                document.getElementById('reg-referral').value = refCode;
            } else {
                toggleView('login-view');
            }
            sessionStorage.removeItem('logout_initiated');
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
                    showErrorMessage(DOMElements.registerErrorMsg, "Aमान्य रेफरल कोड।");
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
                upline: upline, createdAt: serverTimestamp()
            });

            showToast("Registration safal hua! Ab aap login kar sakte hain.");
            toggleView('login-view');
            DOMElements.registerForm.reset();
        } catch (error) { 
            showErrorMessage(DOMElements.registerErrorMsg, error.code === 'auth/email-already-in-use' ? "Is mobile number se account pehle se hai." : "Registration fail ho gaya."); 
        }
    });

    DOMElements.logoutBtn.addEventListener('click', () => {
        sessionStorage.setItem('logout_initiated', 'true');
        signOut(auth).catch(error => {
            console.error("Logout Error:", error);
            showToast("Logout fail hua. Kripya dobara koshish karein.");
        });
    });
}

// --- Realtime Data Handling ---
function attachRealtimeListeners(user) {
    detachAllListeners();
    const uid = user.uid;

    const userDocRef = doc(db, 'users', uid);
    const userUnsubscribe = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
            currentUserData = { id: doc.id, ...doc.data() };
            updateDashboardUI(currentUserData, user);
        } else {
            // **FIX:** Removed automatic logout to prevent race conditions on registration.
            console.warn("User document not found, but user is authenticated. Data might be inconsistent.");
        }
    }, (error) => {
        console.error("Error listening to user document:", error);
    });
    activeListeners.push(userUnsubscribe);

    const transactionsQuery = query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc"));
    const transUnsubscribe = onSnapshot(transactionsQuery, (querySnapshot) => {
        allTransactions = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        renderUnifiedHistory();
    }, (error) => {
        console.error("Error listening to transactions:", error);
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
    }, (error) => {
        console.error("Error listening to cashback requests:", error);
    });
    activeListeners.push(cashbackUnsubscribe);
}

function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null;
    allTransactions = [];
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
    const profilePicUrl = dbData.profilePictureUrl || placeholderUrl;
    DOMElements.profileDisplay.src = profilePicUrl;
    DOMElements.profileModalDisplay.src = profilePicUrl;
    
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
        const itemDiv = document.createElement('div');
        const sign = trans.amount > 0 ? '+' : '-';
        const typeClass = sign === '+' ? 'credit' : 'debit';
        const icon = { cashback: '🎁', commission: '🏆', payment: '↔️', claim: '💸' }[trans.type] || '📜';
        
        // **FIX:** Added check for timestamp to prevent errors
        const dateString = trans.timestamp && typeof trans.timestamp.toDate === 'function' 
            ? trans.timestamp.toDate().toLocaleDateString() 
            : 'No date';

        itemDiv.className = `history-item ${trans.type === 'commission' ? 'commission' : typeClass}`;
        itemDiv.innerHTML = `
            <div class="history-details">
                <div class="history-icon ${trans.type === 'commission' ? 'commission' : typeClass}">${icon}</div>
                <div class="history-info">
                    <div class="title">${trans.description || 'N/A'}</div>
                    <div class="date">${dateString}</div>
                </div>
            </div>
            <div class="history-amount">
                <div class="amount ${typeClass}">${sign} ₹${Math.abs(trans.amount).toFixed(2)}</div>
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

            transaction.update(requestDocRef, { claimed: true, status: 'completed' });

            const newTransactionRef = doc(transactionsColRef);
            transaction.set(newTransactionRef, {
                type: 'cashback', amount: amountToClaim,
                description: `Cashback for ${pendingCashbackClaim.productName}`,
                status: 'completed', timestamp: serverTimestamp(),
                involvedUsers: [currentUserData.id]
            });
        });

        showToast("Cashback safaltapoorvak claim kiya gaya!");
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

    if (newPassword.length < 6) {
        showErrorMessage(DOMElements.passwordChangeErrorMsg, "Naya password kam se kam 6 akshar ka hona chahiye.");
        return;
    }
    if (newPassword !== confirmPassword) {
        showErrorMessage(DOMElements.passwordChangeErrorMsg, "Naya password match nahi ho raha hai.");
        return;
    }

    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, currentPassword);

    try {
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        showToast("Password safaltapoorvak badal gaya!");
        DOMElements.passwordChangeForm.reset();
        closeModal(DOMElements.profileModal);
    } catch (error) {
        console.error("Password change error:", error);
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

    // **FIX:** Added event listener for profile modal
    DOMElements.openProfileModalBtn.addEventListener('click', () => {
        if (!currentUserData || !auth.currentUser) {
            showToast("User data load ho raha hai...");
            return;
        }
        DOMElements.passwordChangeForm.reset();
        hideErrorMessage(DOMElements.passwordChangeErrorMsg);
        openModal(DOMElements.profileModal);
    });

    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay'))));
    
    DOMElements.cashbackRequestForm.addEventListener('submit', handleCashbackRequest);
    DOMElements.claimNowBtn.addEventListener('click', handleCashbackClaim);
    // **FIX:** Added event listener for password change form
    DOMElements.passwordChangeForm.addEventListener('submit', handlePasswordChange);

    DOMElements.walletShareBtn.addEventListener('click', async () => { 
        if (!auth.currentUser || !currentUserData?.referralId) { 
            showToast("Data load ho raha hai..."); 
            return; 
        } 
        const referralLink = `${window.location.origin}${window.location.pathname}?ref=${currentUserData.referralId}`;
        const shareMessage = `🎉 *Wow! Ek Zabardast Offer!* 🎉\n\nMera code *${currentUserData.referralId}* use karein aur Ramazone Cashback app par har khareed par dher saare paise bachayein.\n\nAbhi join karein: ${referralLink}`; 
        try { 
            if (navigator.share) {
                await navigator.share({ text: shareMessage });
            } else { 
                navigator.clipboard.writeText(shareMessage); 
                showToast('Share message copy ho gaya!'); 
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
        if (!target) return; 
        DOMElements.filterBar.querySelector('.active')?.classList.remove('active'); 
        target.classList.add('active'); 
        activeFilter = target.dataset.filter; 
        renderUnifiedHistory(); 
    });
}

// --- Start the App ---
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);

