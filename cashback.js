import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, getDocs, writeBatch, serverTimestamp, orderBy, limit, runTransaction, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.appspot.com",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Global Variables ---
let currentUserData = null;
let activeListeners = [];
let scannerAnimation = null;
let allTransactions = [];
let cashbackRequests = [];
let userCoupons = [];
let activeFilter = 'all';
let pendingAction = null;
let successPopupTimeout = null;

// --- UI Helper Functions ---
const showToast = (message) => {
    const toast = document.getElementById('toast-notification');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
};
const toggleView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
};
const openModal = (modalId) => document.getElementById(modalId)?.classList.add('active');
const closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
    if (modalId === 'scan-pay-modal') stopScanner();
    if (modalId === 'success-popup' && successPopupTimeout) {
        clearTimeout(successPopupTimeout);
        successPopupTimeout = null;
    }
};
const showErrorMessage = (element, message) => { if (element) { element.textContent = message; element.style.display = 'block'; } };
const hideErrorMessage = (element) => { if (element) { element.style.display = 'none'; } };
const showSuccessPopup = (title, message) => {
    if (successPopupTimeout) clearTimeout(successPopupTimeout);
    document.getElementById('success-popup-title').textContent = title;
    document.getElementById('success-popup-message').textContent = message;
    openModal('success-popup');
    successPopupTimeout = setTimeout(() => closeModal('success-popup'), 10000);
};

// --- Authentication State Manager ---
onAuthStateChanged(auth, user => {
    if (user && user.displayName) {
        toggleView('dashboard-view');
        attachRealtimeListeners(user);
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('ref')) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } else if (!user) {
        detachAllListeners();
        const refCode = new URLSearchParams(window.location.search).get('ref');
        toggleView(refCode ? 'registration-view' : 'login-view');
        if (refCode) document.getElementById('reg-referral').value = refCode;
    }
});

// --- Realtime Data Listeners ---
function attachRealtimeListeners(user) {
    detachAllListeners();
    const uid = user.uid;
    const userUnsubscribe = onSnapshot(doc(db, 'users', uid), (doc) => {
        if (doc.exists()) {
            currentUserData = { id: doc.id, ...doc.data() };
            updateDashboardUI(currentUserData, user);
        }
    });
    const transUnsubscribe = onSnapshot(query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc")), (snapshot) => {
        allTransactions = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        combineAndRenderHistory();
    });
    const requestsUnsubscribe = onSnapshot(query(collection(db, "cashback_requests"), where("userId", "==", uid), orderBy("requestDate", "desc")), (snapshot) => {
        cashbackRequests = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        combineAndRenderHistory();
    });
    const couponsUnsubscribe = onSnapshot(query(collection(db, "coupons"), where("userId", "==", uid), where("isUsed", "==", false), orderBy("createdAt", "desc")), (snapshot) => {
        userCoupons = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        renderCoupons();
    });
    activeListeners.push(userUnsubscribe, transUnsubscribe, requestsUnsubscribe, couponsUnsubscribe);
}

function detachAllListeners() {
    activeListeners.forEach(unsub => unsub());
    activeListeners = [];
}

// --- UI Update Functions ---
function updateDashboardUI(dbData, authUser) {
    document.getElementById('wallet-user-name').textContent = authUser.displayName;
    document.getElementById('header-profile-img').src = dbData.profilePictureUrl || `https://placehold.co/40x40/e50914/FFFFFF?text=${authUser.displayName.charAt(0)}`;
    document.getElementById('wallet-balance').textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹ ${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    document.getElementById('credit-limit').textContent = `₹ ${(dbData.totalCreditGiven || 0).toFixed(2)}`;
    document.getElementById('due-amount').textContent = `₹ ${(dbData.dueAmount || 0).toFixed(2)}`;
    document.getElementById('profile-payment-id').textContent = `${dbData.mobile}@RMZ`;
    document.getElementById('profile-referral-id').textContent = dbData.referralId || 'N/A';
    document.getElementById('wallet-referral-id').textContent = dbData.referralId || 'N/A';
}

function combineAndRenderHistory() {
    const formattedTransactions = allTransactions.map(t => ({ ...t, date: t.timestamp?.toDate(), isTransaction: true }));
    const formattedRequests = cashbackRequests
        .filter(r => r.status === 'pending' || r.status === 'rejected')
        .map(r => ({ ...r, description: `Request for ${r.productName}`, date: r.requestDate?.toDate(), type: 'cashback', isTransaction: false }));
    
    const combined = [...formattedTransactions, ...formattedRequests].sort((a, b) => (b.date || 0) - (a.date || 0));
    renderUnifiedHistory(combined);
}

function renderUnifiedHistory(items) {
    const listEl = document.getElementById('unified-history-list');
    listEl.innerHTML = '';
    const filtered = items.filter(item => {
        if (activeFilter === 'all') return true;
        return item.type === activeFilter;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="border:none; padding: 20px 0; text-align:center; color: var(--text-secondary);"><h4>No Transactions</h4></div>`;
        return;
    }

    filtered.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-item';
        const amount = item.amount || item.cashbackAmount || 0;
        let sign = amount >= 0 ? '+' : '-';
        let typeClass = amount >= 0 ? 'credit' : 'debit';
        
        if(item.type === 'due_payment') {
            typeClass = 'debit';
            sign = '';
        }

        if (item.status === 'rejected' || item.status === 'refunded') {
            typeClass = 'rejected';
        }
        itemDiv.innerHTML = `
            <div class="history-details">
                <div class="history-info">
                    <div class="title">${item.description}</div>
                    <div class="date">${item.date ? item.date.toLocaleDateString() : 'N/A'}</div>
                </div>
            </div>
            <div class="history-amount">
                <div class="amount ${typeClass}">${sign} ₹${Math.abs(amount).toFixed(2)}</div>
                <span class="status">${item.status || ''}</span>
            </div>`;
        listEl.appendChild(itemDiv);
    });
}

function renderCoupons() {
    const listEl = document.getElementById('coupons-list');
    listEl.innerHTML = '';
    if (userCoupons.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="border:none; text-align:center; color: var(--text-secondary);"><h4>No Coupons</h4><p>Aapke paas abhi koi coupon nahi hai.</p></div>`;
        return;
    }
    userCoupons.forEach(coupon => {
        const couponCard = document.createElement('div');
        couponCard.className = 'coupon-card';
        const date = coupon.createdAt ? coupon.createdAt.toDate().toLocaleDateString() : 'N/A';
        couponCard.innerHTML = `
            <div class="coupon-header">
                <span class="coupon-amount">₹${coupon.amount}</span>
                <button class="coupon-copy-btn" data-code="${coupon.code}">Copy</button>
            </div>
            <p class="coupon-code">${coupon.code}</p>
            <p class="coupon-date">Issued on: ${date}</p>
        `;
        listEl.appendChild(couponCard);
    });
}

// --- Core Logic Functions ---
function verifyPasswordAndExecute(action, sourceModalId) {
    if (sourceModalId) closeModal(sourceModalId);
    pendingAction = action;
    openModal('password-verification-modal');
}

async function handleVerificationConfirm() {
    const password = document.getElementById('verification-password').value;
    const errorMsg = document.getElementById('verification-error-msg');
    const confirmBtn = document.getElementById('verification-confirm-btn');
    hideErrorMessage(errorMsg);
    if (!password) return showErrorMessage(errorMsg, "Password is required.");

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Verifying...";
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, password);

    try {
        await reauthenticateWithCredential(user, credential);
        closeModal('password-verification-modal');
        if (pendingAction) await pendingAction();
    } catch (error) {
        showErrorMessage(errorMsg, "Incorrect password.");
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Confirm";
        document.getElementById('verification-password').value = '';
        pendingAction = null;
    }
}

function handlePayment() {
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const errorMsg = document.getElementById('payment-error-msg');
    hideErrorMessage(errorMsg);
    if (isNaN(amount) || amount < 5) return showErrorMessage(errorMsg, "Minimum payment is ₹5.");
    if (currentUserData.wallet < amount) return showErrorMessage(errorMsg, "Insufficient balance.");
    
    verifyPasswordAndExecute(async () => {
        try {
            await runTransaction(db, async (t) => {
                const userRef = doc(db, "users", currentUserData.id);
                const configRef = doc(db, "app_settings", "config");
                t.update(userRef, { wallet: increment(-amount) });
                t.update(configRef, { rmz_wallet_balance: increment(amount) });
                t.set(doc(collection(db, "transactions")), { type: 'payment', amount: -amount, description: 'Paid to Ramazone Store', status: 'completed', timestamp: serverTimestamp(), involvedUsers: [currentUserData.id] });
                t.set(doc(collection(db, "rmz_wallet_transactions")), { amount, senderId: currentUserData.id, senderName: currentUserData.name, senderMobile: currentUserData.mobile, timestamp: serverTimestamp() });
            });
            showSuccessPopup("Payment Successful!", `You have paid ₹${amount.toFixed(2)} to the store.`);
        } catch (error) {
            showToast("Payment failed. Please try again.");
        }
    }, 'scan-pay-modal');
}

function handleClaimRequest(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('claim-error-msg');
    const amount = parseFloat(document.getElementById('claim-amount').value);
    hideErrorMessage(errorMsg);
    if (isNaN(amount) || amount < 10) return showErrorMessage(errorMsg, "Minimum claim is ₹10.");
    if (currentUserData.wallet < amount) return showErrorMessage(errorMsg, "Insufficient balance.");
    
    verifyPasswordAndExecute(async () => {
        try {
            await runTransaction(db, async (t) => {
                const userRef = doc(db, "users", currentUserData.id);
                t.update(userRef, { wallet: increment(-amount) });
                const claimRef = doc(collection(db, "claim_requests"));
                t.set(claimRef, {
                    userId: currentUserData.id, userName: currentUserData.name, userMobile: currentUserData.mobile,
                    amount, status: "pending", requestDate: serverTimestamp()
                });
                t.set(doc(collection(db, "transactions")), {
                    type: 'claim', amount: -amount, description: `Claim request for ₹${amount}`,
                    status: 'pending', timestamp: serverTimestamp(), involvedUsers: [currentUserData.id], originalRequestId: claimRef.id
                });
            });
            showSuccessPopup("Request Sent!", `Your request to claim ₹${amount.toFixed(2)} has been sent for approval.`);
            document.getElementById('claim-request-form').reset();
        } catch (error) {
            showToast("Failed to send request.");
        }
    }, 'claim-modal');
}

async function handleCashbackRequest(e) {
    e.preventDefault();
    const btn = document.getElementById('cashback-submit-btn');
    const errorMsg = document.getElementById('cashback-error-msg');
    hideErrorMessage(errorMsg);
    btn.disabled = true;
    btn.textContent = "Submitting...";
    const productName = document.getElementById("product-name").value.trim();
    const productPrice = parseFloat(document.getElementById("product-price").value);
    if (!productName || isNaN(productPrice) || productPrice < 10) {
        showErrorMessage(errorMsg, "Sahi details daalein.");
        btn.disabled = false; btn.textContent = "Request"; return;
    }
    try {
        const configDoc = await getDoc(doc(db, "app_settings", "config"));
        const cashbackPercentage = configDoc.exists() && configDoc.data().cashback_percentage ? configDoc.data().cashback_percentage : 2;
        const cashbackAmount = productPrice * (cashbackPercentage / 100);
        await addDoc(collection(db, "cashback_requests"), {
            userId: currentUserData.id, userName: currentUserData.name, userMobile: currentUserData.mobile,
            productName, productPrice, cashbackAmount, status: "pending", requestDate: serverTimestamp(), claimed: false
        });
        showSuccessPopup("Request Sent!", `Your cashback request for ₹${cashbackAmount.toFixed(2)} has been submitted.`);
        document.getElementById('cashback-request-form').reset();
    } catch (error) {
        showErrorMessage(errorMsg, `Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = "Request";
        closeModal('cashback-modal');
    }
}

// --- Scanner and Utility Functions ---
function startScanner() {
    stopScanner();
    const video = document.getElementById('scanner-video');
    const statusEl = document.getElementById('scanner-status');
    document.getElementById('payment-form').style.display = 'none';
    document.getElementById('scan-pay-initial-actions').style.display = 'flex';
    statusEl.textContent = 'Starting camera...';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
        video.srcObject = stream;
        video.play();
        statusEl.textContent = 'Scanning for QR code...';
        scannerAnimation = requestAnimationFrame(tick);
    }).catch(() => statusEl.textContent = 'Could not access camera.');
    const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            if (code && code.data === '@RamazoneStoreCashback') {
                handleSuccessfulScan(code.data);
                return;
            }
        }
        if (scannerAnimation) scannerAnimation = requestAnimationFrame(tick);
    };
}
function stopScanner() {
    if (scannerAnimation) cancelAnimationFrame(scannerAnimation);
    scannerAnimation = null;
    const video = document.getElementById('scanner-video');
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
}
function handleSuccessfulScan(data) {
    stopScanner();
    document.getElementById('receiver-id-display').textContent = data;
    document.getElementById('payment-form').style.display = 'block';
    document.getElementById('scan-pay-initial-actions').style.display = 'none';
    document.getElementById('scanner-status').textContent = 'QR Code Scanned!';
}
function handleQrUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            if (code && code.data === '@RamazoneStoreCashback') handleSuccessfulScan(code.data);
            else showToast("No valid QR code found.");
        };
        image.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function handleShare() {
    if (!currentUserData) return;
    const { referralId, name, lifetimeEarning } = currentUserData;
    const referralLink = `${window.location.origin}${window.location.pathname}?ref=${referralId}`;
    const shareText = `🎉 *Wow! Ek Zabardast Offer!* 🎉\n\nMai, *${name}*, Ramazone Cashback app se ab tak *₹${(lifetimeEarning || 0).toFixed(2)}* ki bachat ki hai! 🤑\n\nAap bhi is app ko use karein aur har khareed par dher saare paise bachayein. Miss mat karna! Mera code use karein: *${referralId}*\n\nAbhi join karein: ${referralLink}`;
    if (navigator.share) navigator.share({ text: shareText });
    else navigator.clipboard.writeText(shareText).then(() => showToast("Offer link copied!"));
}
function handleWhatsAppSupport() {
    if (!currentUserData) return showToast("Please wait for your data to load.");
    const { name, referralId, lifetimeEarning, mobile } = currentUserData;
    const message = `Name: ${name}\nMobile: ${mobile}\nReferral ID: ${referralId}\nLifetime Earning: ₹${(lifetimeEarning || 0).toFixed(2)}\n\nHelp Me`;
    const whatsappUrl = `https://wa.me/message/RUJS4JVH3AUAD1?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

// --- Main Event Listener Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // Login Form
    document.getElementById('login-form').addEventListener('submit', e => {
        e.preventDefault();
        const mobile = document.getElementById('login-mobile').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password)
            .catch(() => showErrorMessage(document.getElementById('login-error-msg'), "Galat mobile/password."));
    });
    
    // Registration Form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const registerButton = e.target.querySelector('button');
        const errorMsgEl = document.getElementById('register-error-msg');
        hideErrorMessage(errorMsgEl);
        registerButton.disabled = true;
        registerButton.textContent = 'Registering...';

        const name = document.getElementById('reg-name').value.trim();
        const mobile = document.getElementById('reg-mobile').value.trim();
        const password = document.getElementById('reg-password').value;
        const referralCode = document.getElementById('reg-referral').value.trim().toUpperCase();

        if (!name || !mobile || password.length < 6) {
            showErrorMessage(errorMsgEl, "Sahi naam, mobile number, aur kam se kam 6 character ka password daalein.");
            registerButton.disabled = false;
            registerButton.textContent = 'Register Karein';
            return;
        }

        let tempUser = null;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            tempUser = userCredential.user;

            let upline = [];
            let referredBy = 'none';

            if (referralCode) {
                registerButton.textContent = 'Verifying Code...';
                const q = query(collection(db, 'users'), where("referralId", "==", referralCode));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    await tempUser.delete();
                    showErrorMessage(errorMsgEl, "Aapka referral code galat hai.");
                    registerButton.disabled = false; registerButton.textContent = 'Register Karein';
                    return;
                }
                
                const referrerDoc = querySnapshot.docs[0];
                const referrerData = referrerDoc.data();
                referredBy = referralCode;
                upline = [referrerDoc.id, ...(referrerData.upline || [])].slice(0, 5);
            }

            registerButton.textContent = 'Saving Data...';
            await updateProfile(tempUser, { displayName: name });
            const newUserDoc = {
                uid: tempUser.uid, name, mobile, password,
                wallet: 0, lifetimeEarning: 0, totalCreditGiven: 0, dueAmount: 0,
                referralId: `RMZC${Math.floor(100+Math.random()*900)}B${Math.floor(100+Math.random()*900)}`,
                referredBy, upline, createdAt: serverTimestamp()
            };
            await setDoc(doc(db, 'users', tempUser.uid), newUserDoc);
            
            await signOut(auth);
            toggleView('login-view');
            document.getElementById('login-form').reset();
            document.getElementById('register-form').reset();
            alert("Registration safal hua! Ab login karein.");

        } catch (error) {
            console.error("Registration failed:", error);
            if (tempUser) await tempUser.delete().catch(e => console.error("Failed to delete temp user", e));
            
            let message = "Registration fail ho gaya. Dobara try karein.";
            if (error.code === 'auth/email-already-in-use') {
                message = "Yah mobile number pehle se register hai.";
            }
            showErrorMessage(errorMsgEl, message);
        } finally {
            registerButton.disabled = false;
            registerButton.textContent = 'Register Karein';
        }
    });

    // All other buttons and links
    document.getElementById('show-register-link').addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    document.getElementById('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    document.getElementById('logout-btn').addEventListener('click', () => { closeModal('profile-modal'); signOut(auth); });
    document.getElementById('open-profile-modal-header').addEventListener('click', () => openModal('profile-modal'));
    document.getElementById('open-profile-modal').addEventListener('click', () => openModal('profile-modal'));
    document.getElementById('open-cashback-modal').addEventListener('click', () => openModal('cashback-modal'));
    document.getElementById('open-claim-modal').addEventListener('click', () => openModal('claim-modal'));
    document.getElementById('open-coupons-modal').addEventListener('click', () => openModal('coupons-modal'));
    document.getElementById('scan-and-pay-btn').addEventListener('click', () => { openModal('scan-pay-modal'); startScanner(); });
    document.getElementById('rescan-btn').addEventListener('click', startScanner);
    document.getElementById('pay-submit-btn').addEventListener('click', handlePayment);
    document.getElementById('wallet-share-btn').addEventListener('click', handleShare);
    document.getElementById('copy-referral-btn').addEventListener('click', () => { navigator.clipboard.writeText(currentUserData.referralId).then(() => showToast("Referral ID Copied!")); });
    document.getElementById('whatsapp-support-btn').addEventListener('click', handleWhatsAppSupport);
    document.getElementById('cashback-request-form').addEventListener('submit', handleCashbackRequest);
    document.getElementById('claim-request-form').addEventListener('submit', handleClaimRequest);
    document.getElementById('upload-qr-btn').addEventListener('click', () => document.getElementById('qr-file-input').click());
    document.getElementById('qr-file-input').addEventListener('change', handleQrUpload);
    document.getElementById('verification-confirm-btn').addEventListener('click', handleVerificationConfirm);
    document.getElementById('filter-bar').addEventListener('click', e => {
        const target = e.target.closest('.filter-btn');
        if (!target) return;
        document.querySelector('#filter-bar .active')?.classList.remove('active');
        target.classList.add('active');
        activeFilter = target.dataset.filter;
        combineAndRenderHistory();
    });
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay').id)));
    document.getElementById('coupons-list').addEventListener('click', (e) => {
        if (e.target.matches('.coupon-copy-btn')) {
            const code = e.target.dataset.code;
            navigator.clipboard.writeText(code).then(() => showToast(`Coupon ${code} copied!`));
        }
    });
    document.getElementById('success-popup').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal('success-popup');
        }
    });
});

