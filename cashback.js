import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, getDocs, writeBatch, serverTimestamp, orderBy, limit, runTransaction, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    databaseURL: "https://tipsplit-e3wes-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.appspot.com",
    messagingSenderId: "984733883633",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUserData = null;
let activeListeners = [];
let scannerAnimation = null;
let allTransactions = [];
let cashbackRequests = [];
let activeFilter = 'all';
let pendingAction = null;

// --- UI Helper Functions ---
const showToast = (message) => {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
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
};
const showErrorMessage = (element, message) => { if (element) { element.textContent = message; element.style.display = 'block'; } };
const hideErrorMessage = (element) => { if (element) { element.style.display = 'none'; } };

// --- Authentication ---
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
        const refCode = new URLSearchParams(window.location.search).get('ref');
        toggleView(refCode ? 'registration-view' : 'login-view');
        if (refCode) document.getElementById('reg-referral').value = refCode;
    }
});

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
    activeListeners.push(userUnsubscribe, transUnsubscribe, requestsUnsubscribe);
}

function detachAllListeners() {
    activeListeners.forEach(unsub => unsub());
    activeListeners = [];
}

function updateDashboardUI(dbData, authUser) {
    document.getElementById('wallet-user-name').textContent = authUser.displayName;
    document.getElementById('header-profile-img').src = dbData.profilePictureUrl || `https://placehold.co/40x40/e50914/FFFFFF?text=${authUser.displayName.charAt(0)}`;
    document.getElementById('wallet-balance').textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹ ${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    document.getElementById('profile-payment-id').textContent = `${dbData.mobile}@RMZ`;
    document.getElementById('profile-referral-id').textContent = dbData.referralId || 'N/A';
    document.getElementById('wallet-referral-id').textContent = dbData.referralId || 'N/A';
}

function combineAndRenderHistory() {
    const formattedTransactions = allTransactions.map(t => ({ ...t, date: t.timestamp?.toDate(), isTransaction: true }));
    const formattedRequests = cashbackRequests.map(r => ({ ...r, description: `Request for ${r.productName}`, date: r.requestDate?.toDate(), type: 'cashback', isTransaction: false }));
    const combined = [...formattedTransactions, ...formattedRequests].sort((a, b) => (b.date || 0) - (a.date || 0));
    renderUnifiedHistory(combined);
}

function renderUnifiedHistory(items) {
    const listEl = document.getElementById('unified-history-list');
    listEl.innerHTML = '';
    const filtered = items.filter(item => activeFilter === 'all' || item.type === activeFilter);
    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="border:none; padding: 20px 0; text-align:center; color: var(--text-secondary);"><h4>No Transactions</h4></div>`;
        return;
    }
    filtered.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-item';
        const amount = item.amount || item.cashbackAmount || 0;
        const sign = amount >= 0 ? '+' : '-';
        const typeClass = amount >= 0 ? 'credit' : 'debit';
        itemDiv.innerHTML = `
            <div class="history-details">
                <div class="history-info">
                    <div class="title">${item.description}</div>
                    <div class="date">${item.date ? item.date.toLocaleDateString() : 'N/A'}</div>
                </div>
            </div>
            <div class="history-amount">
                <div class="amount ${typeClass}">${sign} ₹${Math.abs(amount).toFixed(2)}</div>
                <span class="status">${item.status}</span>
            </div>`;
        listEl.appendChild(itemDiv);
    });
}

// --- Password Verification ---
function verifyPasswordAndExecute(action) {
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
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, password);

    try {
        await reauthenticateWithCredential(user, credential);
        closeModal('password-verification-modal');
        if (pendingAction) {
            pendingAction();
            pendingAction = null;
        }
    } catch (error) {
        showErrorMessage(errorMsg, "Incorrect password.");
    } finally {
        confirmBtn.disabled = false;
        document.getElementById('verification-password').value = '';
    }
}

// --- QR Scanner ---
function startScanner() {
    stopScanner();
    const video = document.getElementById('scanner-video');
    const statusEl = document.getElementById('scanner-status');
    document.getElementById('payment-form').style.display = 'none';
    document.getElementById('scan-pay-initial-actions').style.display = 'flex';
    statusEl.textContent = 'Starting camera...';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => {
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
        if(scannerAnimation) scannerAnimation = requestAnimationFrame(tick);
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

// --- Core Functionalities ---
function handlePayment() {
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const errorMsg = document.getElementById('payment-error-msg');
    hideErrorMessage(errorMsg);
    if (isNaN(amount) || amount < 5) return showErrorMessage(errorMsg, "Minimum payment is ₹5.");
    if (currentUserData.wallet < amount) return showErrorMessage(errorMsg, "Insufficient balance.");
    
    verifyPasswordAndExecute(async () => {
        const btn = document.getElementById('pay-submit-btn');
        btn.disabled = true;
        try {
            await runTransaction(db, async (t) => {
                const userRef = doc(db, "users", currentUserData.id);
                const configRef = doc(db, "app_settings", "config");
                t.update(userRef, { wallet: increment(-amount) });
                t.update(configRef, { rmz_wallet_balance: increment(amount) });
                t.set(doc(collection(db, "transactions")), { type: 'payment', amount: -amount, description: 'Paid to Ramazone Store', status: 'completed', timestamp: serverTimestamp(), involvedUsers: [currentUserData.id] });
                t.set(doc(collection(db, "rmz_wallet_transactions")), { amount, senderId: currentUserData.id, senderName: currentUserData.name, senderMobile: currentUserData.mobile, timestamp: serverTimestamp() });
            });
            showToast(`₹${amount.toFixed(2)} paid successfully!`);
            closeModal('scan-pay-modal');
        } catch (error) {
            showErrorMessage(errorMsg, "Payment failed.");
        } finally {
            btn.disabled = false;
        }
    });
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

function handleClaimRequest(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('claim-error-msg');
    const amount = parseFloat(document.getElementById('claim-amount').value);
    hideErrorMessage(errorMsg);
    if (isNaN(amount) || amount < 10) return showErrorMessage(errorMsg, "Minimum claim is ₹10.");
    if (currentUserData.wallet < amount) return showErrorMessage(errorMsg, "Insufficient balance.");
    
    verifyPasswordAndExecute(async () => {
        const btn = document.getElementById('claim-submit-btn');
        btn.disabled = true;
        try {
            await runTransaction(db, async (t) => {
                const userRef = doc(db, "users", currentUserData.id);
                // Deduct amount from wallet
                t.update(userRef, { wallet: increment(-amount) });
                // Create a claim request for admin
                t.set(doc(collection(db, "claim_requests")), {
                    userId: currentUserData.id, userName: currentUserData.name, userMobile: currentUserData.mobile,
                    amount, status: "pending", requestDate: serverTimestamp()
                });
                // Create a transaction record for user
                t.set(doc(collection(db, "transactions")), {
                    type: 'claim', amount: -amount, description: `Claim request for ₹${amount}`,
                    status: 'pending', timestamp: serverTimestamp(), involvedUsers: [currentUserData.id]
                });
            });
            showToast("Claim request sent successfully!");
            closeModal('claim-modal');
            document.getElementById('claim-request-form').reset();
        } catch (error) {
            showErrorMessage(errorMsg, "Failed to send request.");
        } finally {
            btn.disabled = false;
        }
    });
}

async function handleCashbackRequest(e) {
    e.preventDefault();
    const btn = document.getElementById('cashback-submit-btn');
    const errorMsg = document.getElementById('cashback-error-msg');
    hideErrorMessage(errorMsg);
    btn.disabled = true;
    const productName = document.getElementById("product-name").value.trim();
    const productPrice = parseFloat(document.getElementById("product-price").value);
    if (!productName || isNaN(productPrice) || productPrice < 10) {
        showErrorMessage(errorMsg, "Sahi details daalein.");
        btn.disabled = false;
        return;
    }
    try {
        const configDoc = await getDoc(doc(db, "app_settings", "config"));
        const cashbackPercentage = configDoc.exists() && configDoc.data().cashback_percentage ? configDoc.data().cashback_percentage : 2;
        const cashbackAmount = productPrice * (cashbackPercentage / 100);
        await addDoc(collection(db, "cashback_requests"), {
            userId: currentUserData.id, userName: currentUserData.name, userMobile: currentUserData.mobile,
            productName, productPrice, cashbackAmount, status: "pending", requestDate: serverTimestamp(), claimed: false
        });
        showToast("Cashback request submitted!");
        closeModal('cashback-modal');
        document.getElementById('cashback-request-form').reset();
    } catch (error) {
        showErrorMessage(errorMsg, `Error: ${error.message}`);
    } finally {
        btn.disabled = false;
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', e => { e.preventDefault(); signInWithEmailAndPassword(auth, `${document.getElementById('login-mobile').value}@ramazone.com`, document.getElementById('login-password').value).catch(() => showErrorMessage(document.getElementById('login-error-msg'), "Galat mobile/password.")); });
    document.getElementById('register-form').addEventListener('submit', async e => { e.preventDefault(); try { const userCredential = await createUserWithEmailAndPassword(auth, `${document.getElementById('reg-mobile').value}@ramazone.com`, document.getElementById('reg-password').value); await updateProfile(userCredential.user, { displayName: document.getElementById('reg-name').value }); await setDoc(doc(db, 'users', userCredential.user.uid), { uid: userCredential.user.uid, name: document.getElementById('reg-name').value, mobile: document.getElementById('reg-mobile').value, wallet: 0, lifetimeEarning: 0, referralId: `RMZC${Math.floor(100+Math.random()*900)}B${Math.floor(100+Math.random()*900)}`, referredBy: document.getElementById('reg-referral').value.trim().toUpperCase() || 'none', upline: [], createdAt: serverTimestamp() }); toggleView('login-view'); } catch (error) { showErrorMessage(document.getElementById('register-error-msg'), "Registration fail ho gaya."); } });
    document.getElementById('show-register-link').addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    document.getElementById('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
    document.getElementById('open-profile-modal-header').addEventListener('click', () => openModal('profile-modal'));
    document.getElementById('open-profile-modal').addEventListener('click', () => openModal('profile-modal'));
    document.getElementById('open-cashback-modal').addEventListener('click', () => openModal('cashback-modal'));
    document.getElementById('open-claim-modal').addEventListener('click', () => openModal('claim-modal'));
    document.getElementById('open-coupons-modal').addEventListener('click', () => openModal('coupons-modal'));
    document.getElementById('scan-and-pay-btn').addEventListener('click', () => { openModal('scan-pay-modal'); startScanner(); });
    document.getElementById('rescan-btn').addEventListener('click', startScanner);
    document.getElementById('pay-submit-btn').addEventListener('click', handlePayment);
    document.getElementById('wallet-share-btn').addEventListener('click', handleShare);
    document.getElementById('copy-referral-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(currentUserData.referralId).then(() => showToast("Referral ID Copied!"));
    });
    document.getElementById('whatsapp-support-btn').addEventListener('click', handleWhatsAppSupport);
    document.getElementById('cashback-request-form').addEventListener('submit', handleCashbackRequest);
    document.getElementById('claim-request-form').addEventListener('submit', handleClaimRequest);
    document.getElementById('upload-qr-btn').addEventListener('click', () => document.getElementById('qr-file-input').click());
    document.getElementById('qr-file-input').addEventListener('change', handleQrUpload);
    document.getElementById('verification-confirm-btn').addEventListener('click', handleVerificationConfirm);
    document.getElementById('filter-bar').addEventListener('click', e => { const target = e.target.closest('.filter-btn'); if (!target) return; document.querySelector('#filter-bar .active')?.classList.remove('active'); target.classList.add('active'); activeFilter = target.dataset.filter; combineAndRenderHistory(); });
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay').id)));
});

