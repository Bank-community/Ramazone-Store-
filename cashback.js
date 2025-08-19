import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, getDocs, writeBatch, serverTimestamp, orderBy, limit, runTransaction, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    databaseURL: "https://tipsplit-e3wes-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.appspot.com",
    messagingSenderId: "984733883633",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};

// --- App Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- App State ---
let currentUserData = null;
let activeListeners = [];
let scannerAnimation = null;

// --- DOM Elements ---
const DOMElements = {
    loginView: document.getElementById('login-view'),
    registrationView: document.getElementById('registration-view'),
    dashboardView: document.getElementById('dashboard-view'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    logoutBtn: document.getElementById('logout-btn'),
    showRegisterLink: document.getElementById('show-register-link'),
    showLoginLink: document.getElementById('show-login-link'),
    userNameDisplay: document.getElementById('user-name-display'),
    walletBalance: document.getElementById('wallet-balance'),
    lifetimeEarning: document.getElementById('lifetime-earning'),
    profileDisplay: document.getElementById('profile-display'),
    profileModal: document.getElementById('profile-modal'),
    openProfileModalBtn: document.getElementById('open-profile-modal'),
    profileModalName: document.getElementById('profile-modal-name'),
    profileModalMobile: document.getElementById('profile-modal-mobile'),
    profilePaymentId: document.getElementById('profile-payment-id'),
    profileReferralId: document.getElementById('profile-referral-id'),
    passwordChangeForm: document.getElementById('password-change-form'),
    scanPayModal: document.getElementById('scan-pay-modal'),
    scanAndPayBtn: document.getElementById('scan-and-pay-btn'),
    scannerVideo: document.getElementById('scanner-video'),
    scannerStatus: document.getElementById('scanner-status'),
    paymentForm: document.getElementById('payment-form'),
    scanPayInitialActions: document.getElementById('scan-pay-initial-actions'),
    receiverIdDisplay: document.getElementById('receiver-id-display'),
    rescanBtn: document.getElementById('rescan-btn'),
    paySubmitBtn: document.getElementById('pay-submit-btn'),
    walletShareBtn: document.getElementById('wallet-share-btn'),
    loginErrorMsg: document.getElementById('login-error-msg'),
    registerErrorMsg: document.getElementById('register-error-msg'),
    paymentErrorMsg: document.getElementById('payment-error-msg'),
    passwordChangeErrorMsg: document.getElementById('password-change-error-msg'),
    // Add other elements as needed
};

// --- UI Helper Functions ---
function showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}
function toggleView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
}
function openModal(modalId) { document.getElementById(modalId)?.classList.add('active'); }
function closeModal(modalId) { 
    const modal = document.getElementById(modalId);
    if(modal) modal.classList.remove('active');
    if(modalId === 'scan-pay-modal') stopScanner();
}
function showErrorMessage(element, message) { if (element) { element.textContent = message; element.style.display = 'block'; } }
function hideErrorMessage(element) { if (element) { element.style.display = 'none'; } }

// --- Authentication Logic ---
onAuthStateChanged(auth, user => {
    if (user) {
        toggleView('dashboard-view');
        attachRealtimeListeners(user);
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('ref')) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } else {
        detachAllListeners();
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        toggleView(refCode ? 'registration-view' : 'login-view');
        if (refCode) {
            document.getElementById('reg-referral').value = refCode;
        }
    }
});

function attachRealtimeListeners(user) {
    detachAllListeners();
    const userUnsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
            currentUserData = { id: doc.id, ...doc.data() };
            updateDashboardUI(currentUserData, user);
        } else {
            console.log("User document not found, signing out.");
            signOut(auth);
        }
    });
    activeListeners.push(userUnsubscribe);
}

function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null;
}

// --- UI Update Logic ---
function updateDashboardUI(dbData, authUser) {
    if (!dbData || !authUser) return;
    DOMElements.userNameDisplay.textContent = authUser.displayName;
    DOMElements.walletBalance.textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    DOMElements.lifetimeEarning.textContent = `₹ ${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    DOMElements.profileDisplay.src = dbData.profilePictureUrl || `https://placehold.co/50x50/ffffff/2980b9?text=${authUser.displayName.charAt(0)}`;

    // Profile Modal
    DOMElements.profileModalName.textContent = authUser.displayName;
    DOMElements.profileModalMobile.textContent = dbData.mobile;
    const paymentId = `${dbData.mobile}@RMZ`;
    DOMElements.profilePaymentId.textContent = paymentId;
    DOMElements.profileReferralId.textContent = dbData.referralId || 'N/A';
}

// --- QR Scanner Logic ---
function startScanner() {
    stopScanner(); // Ensure previous scanner is stopped
    DOMElements.scannerStatus.textContent = 'Starting camera...';
    DOMElements.paymentForm.style.display = 'none';
    DOMElements.scanPayInitialActions.style.display = 'flex';
    hideErrorMessage(DOMElements.paymentErrorMsg);
    document.getElementById('payment-amount').value = '';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
            DOMElements.scannerVideo.srcObject = stream;
            DOMElements.scannerVideo.setAttribute("playsinline", true);
            DOMElements.scannerVideo.play();
            DOMElements.scannerStatus.textContent = 'Scanning for QR code...';
            scannerAnimation = requestAnimationFrame(tick);
        })
        .catch(err => {
            DOMElements.scannerStatus.textContent = 'Could not access camera.';
            console.error("Camera Error:", err);
        });

    const tick = () => {
        if (DOMElements.scannerVideo.readyState === DOMElements.scannerVideo.HAVE_ENOUGH_DATA) {
            const canvasElement = document.createElement('canvas');
            const canvas = canvasElement.getContext('2d');
            canvasElement.height = DOMElements.scannerVideo.videoHeight;
            canvasElement.width = DOMElements.scannerVideo.videoWidth;
            canvas.drawImage(DOMElements.scannerVideo, 0, 0, canvasElement.width, canvasElement.height);
            const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data === '@RamazoneStoreCashback') {
                handleSuccessfulScan(code.data);
                return;
            }
        }
        scannerAnimation = requestAnimationFrame(tick);
    };
}

function stopScanner() {
    if (scannerAnimation) {
        cancelAnimationFrame(scannerAnimation);
        scannerAnimation = null;
    }
    if (DOMElements.scannerVideo.srcObject) {
        DOMElements.scannerVideo.srcObject.getTracks().forEach(track => track.stop());
        DOMElements.scannerVideo.srcObject = null;
    }
}

function handleSuccessfulScan(data) {
    stopScanner();
    DOMElements.receiverIdDisplay.textContent = data;
    DOMElements.paymentForm.style.display = 'block';
    DOMElements.scanPayInitialActions.style.display = 'none';
    DOMElements.scannerStatus.textContent = 'QR Code Scanned!';
}

// --- Payment Logic ---
async function handlePayment() {
    const amount = parseFloat(document.getElementById('payment-amount').value);
    hideErrorMessage(DOMElements.paymentErrorMsg);

    if (isNaN(amount) || amount < 5) {
        return showErrorMessage(DOMElements.paymentErrorMsg, "Minimum payment amount is ₹5.");
    }
    if (!currentUserData || currentUserData.wallet < amount) {
        return showErrorMessage(DOMElements.paymentErrorMsg, "Insufficient wallet balance.");
    }

    DOMElements.paySubmitBtn.disabled = true;
    DOMElements.paySubmitBtn.textContent = 'Processing...';

    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", currentUserData.id);
            const configRef = doc(db, "app_settings", "config");
            
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists() || userDoc.data().wallet < amount) {
                throw "Insufficient funds!";
            }

            transaction.update(userRef, { wallet: increment(-amount) });
            transaction.update(configRef, { rmz_wallet_balance: increment(amount) });

            const userTransactionRef = doc(collection(db, "transactions"));
            transaction.set(userTransactionRef, {
                type: 'payment', amount: -amount, description: 'Paid to Ramazone Store',
                status: 'completed', timestamp: serverTimestamp(), involvedUsers: [currentUserData.id]
            });

            const rmzTransactionRef = doc(collection(db, "rmz_wallet_transactions"));
            transaction.set(rmzTransactionRef, {
                amount, senderId: currentUserData.id, senderName: currentUserData.name,
                senderMobile: currentUserData.mobile, timestamp: serverTimestamp()
            });
        });
        showToast(`₹${amount.toFixed(2)} paid successfully!`);
        closeModal('scan-pay-modal');
    } catch (error) {
        console.error("Payment failed:", error);
        showErrorMessage(DOMElements.paymentErrorMsg, "Payment failed. Please try again.");
    } finally {
        DOMElements.paySubmitBtn.disabled = false;
        DOMElements.paySubmitBtn.textContent = 'Pay Now';
    }
}

// --- Share Logic ---
function handleShare() {
    if (!currentUserData) return;
    const { referralId, name } = currentUserData;
    const referralLink = `${window.location.origin}${window.location.pathname}?ref=${referralId}`;
    const shareText = `🎉 *Wow! Ek Zabardast Offer!* 🎉\n\nMera code *${referralId}* use karein aur Ramazone Cashback app par har khareed par dher saare paise bachayein.\n\nAbhi join karein: ${referralLink}`;

    if (navigator.share) {
        navigator.share({ title: 'Ramazone Cashback Offer', text: shareText })
            .catch(err => console.log("Share failed:", err));
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            showToast("Offer link copied to clipboard!");
        });
    }
}

// --- Event Listeners Setup ---
function addAllEventListeners() {
    DOMElements.loginForm.addEventListener('submit', e => {
        e.preventDefault();
        const email = `${document.getElementById('login-mobile').value}@ramazone.com`;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password)
            .catch(() => showErrorMessage(DOMElements.loginErrorMsg, "Galat mobile number ya password."));
    });

    DOMElements.registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        hideErrorMessage(DOMElements.registerErrorMsg);
        const name = document.getElementById('reg-name').value.trim();
        const mobile = document.getElementById('reg-mobile').value.trim();
        const password = document.getElementById('reg-password').value;
        const referralCode = document.getElementById('reg-referral').value.trim().toUpperCase();
        
        if(!name || !/^\d{10}$/.test(mobile) || password.length < 6) {
            return showErrorMessage(DOMElements.registerErrorMsg, "Please fill all details correctly.");
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            await updateProfile(userCredential.user, { displayName: name });
            await setDoc(doc(db, 'users', userCredential.user.uid), {
                uid: userCredential.user.uid, name, mobile, wallet: 0, lifetimeEarning: 0,
                referralId: `RMZC${Math.floor(100+Math.random()*900)}B${Math.floor(100+Math.random()*900)}`,
                referredBy: referralCode || 'none', upline: [], createdAt: serverTimestamp()
            });
            toggleView('login-view');
            showToast("Registration successful! Please login.");
        } catch (error) {
            showErrorMessage(DOMElements.registerErrorMsg, "Registration failed. Mobile number might already be in use.");
        }
    });

    DOMElements.showRegisterLink.addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    DOMElements.showLoginLink.addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    DOMElements.logoutBtn.addEventListener('click', () => signOut(auth));
    DOMElements.openProfileModalBtn.addEventListener('click', () => openModal('profile-modal'));
    DOMElements.scanAndPayBtn.addEventListener('click', () => {
        openModal('scan-pay-modal');
        startScanner();
    });
    DOMElements.rescanBtn.addEventListener('click', startScanner);
    DOMElements.paySubmitBtn.addEventListener('click', handlePayment);
    DOMElements.walletShareBtn.addEventListener('click', handleShare);

    document.querySelectorAll('[data-close-modal], .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el) {
                closeModal(el.closest('.modal-overlay').id);
            }
        });
    });
     document.querySelector('#scan-pay-modal .btn-secondary[data-close-modal]').addEventListener('click', () => closeModal('scan-pay-modal'));
     document.querySelector('#profile-modal .btn-secondary[data-close-modal]').addEventListener('click', () => closeModal('profile-modal'));
}

// --- Start the App ---
addAllEventListeners();

