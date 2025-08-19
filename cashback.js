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

// --- Data Listeners ---
function attachRealtimeListeners(user) {
    detachAllListeners();
    const uid = user.uid;
    
    const userUnsubscribe = onSnapshot(doc(db, 'users', uid), (doc) => {
        if (doc.exists()) {
            currentUserData = { id: doc.id, ...doc.data() };
            updateDashboardUI(currentUserData, user);
        }
    });
    activeListeners.push(userUnsubscribe);

    const transactionsQuery = query(collection(db, "transactions"), where("involvedUsers", "array-contains", uid), orderBy("timestamp", "desc"));
    const transUnsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
        allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        combineAndRenderHistory();
    });
    activeListeners.push(transUnsubscribe);

    const requestsQuery = query(collection(db, "cashback_requests"), where("userId", "==", uid), orderBy("requestDate", "desc"));
    const requestsUnsubscribe = onSnapshot(requestsQuery, (snapshot) => {
        cashbackRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        combineAndRenderHistory();
    });
    activeListeners.push(requestsUnsubscribe);
}

function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null;
    allTransactions = [];
    cashbackRequests = [];
}

// --- UI Updates ---
function updateDashboardUI(dbData, authUser) {
    document.getElementById('user-name-display').textContent = authUser.displayName;
    document.getElementById('wallet-balance').textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹ ${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    document.getElementById('profile-display').src = dbData.profilePictureUrl || `https://placehold.co/50x50/ffffff/2980b9?text=${authUser.displayName.charAt(0)}`;
    document.getElementById('profile-modal-display').src = dbData.profilePictureUrl || `https://placehold.co/80x80/e50914/FFFFFF?text=${authUser.displayName.charAt(0)}`;
    document.getElementById('profile-modal-name').textContent = authUser.displayName;
    document.getElementById('profile-modal-mobile').textContent = dbData.mobile;
    document.getElementById('profile-payment-id').textContent = `${dbData.mobile}@RMZ`;
    document.getElementById('profile-referral-id').textContent = dbData.referralId || 'N/A';
}

// --- History & Filtering ---
function combineAndRenderHistory() {
    const formattedTransactions = allTransactions.map(t => ({
        id: t.id, description: t.description, amount: t.amount,
        date: t.timestamp?.toDate(), status: 'completed', type: t.type, isTransaction: true
    }));

    const formattedRequests = cashbackRequests
        .filter(r => r.status === 'pending' || r.status === 'rejected' || r.status === 'approved')
        .map(r => ({
            id: r.id, description: `Request for ${r.productName}`, amount: r.cashbackAmount,
            date: r.requestDate?.toDate(), status: r.status, type: 'cashback', isTransaction: false
        }));

    const combinedList = [...formattedTransactions, ...formattedRequests].sort((a, b) => (b.date || 0) - (a.date || 0));
    renderUnifiedHistory(combinedList);
}

function renderUnifiedHistory(historyItems) {
    const historyList = document.getElementById('unified-history-list');
    historyList.innerHTML = '';

    const filtered = historyItems.filter(item => activeFilter === 'all' || item.type === activeFilter);

    if (filtered.length === 0) {
        historyList.innerHTML = `<div class="empty-state"><h4>No History Found</h4><p>Is filter ke liye aapka history khaali hai.</p></div>`;
        return;
    }

    filtered.forEach(item => {
        const itemDiv = document.createElement('div');
        const sign = item.amount >= 0 ? '+' : '-';
        const typeClass = item.amount >= 0 ? 'credit' : 'debit';
        const dateString = item.date ? item.date.toLocaleDateString() : 'No date';

        itemDiv.className = `history-item ${item.type === 'commission' ? 'commission' : typeClass}`;
        itemDiv.innerHTML = `
            <div class="history-details">
                <div class="history-info">
                    <div class="title">${item.description || 'N/A'}</div>
                    <div class="date">${dateString}</div>
                </div>
            </div>
            <div class="history-amount">
                <div class="amount ${typeClass}">${sign} ₹${Math.abs(item.amount || 0).toFixed(2)}</div>
                <span class="status status-${item.status}">${item.status}</span>
            </div>`;
        historyList.appendChild(itemDiv);
    });
}

// --- QR Scanner Logic ---
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
        }).catch(err => {
            statusEl.textContent = 'Could not access camera.';
        });

    const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data === '@RamazoneStoreCashback') {
                handleSuccessfulScan(code.data);
            } else {
                showToast("No valid QR code found in image.");
            }
        };
        image.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// --- Core Functionalities ---
async function handlePayment() {
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const payBtn = document.getElementById('pay-submit-btn');
    const errorMsg = document.getElementById('payment-error-msg');
    hideErrorMessage(errorMsg);

    if (isNaN(amount) || amount < 5) return showErrorMessage(errorMsg, "Minimum payment is ₹5.");
    if (currentUserData.wallet < amount) return showErrorMessage(errorMsg, "Insufficient balance.");

    payBtn.disabled = true;
    payBtn.textContent = 'Processing...';
    try {
        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", currentUserData.id);
            const configRef = doc(db, "app_settings", "config");
            transaction.update(userRef, { wallet: increment(-amount) });
            transaction.update(configRef, { rmz_wallet_balance: increment(amount) });
            transaction.set(doc(collection(db, "transactions")), { type: 'payment', amount: -amount, description: 'Paid to Ramazone Store', status: 'completed', timestamp: serverTimestamp(), involvedUsers: [currentUserData.id] });
            transaction.set(doc(collection(db, "rmz_wallet_transactions")), { amount, senderId: currentUserData.id, senderName: currentUserData.name, senderMobile: currentUserData.mobile, timestamp: serverTimestamp() });
        });
        showToast(`₹${amount.toFixed(2)} paid successfully!`);
        closeModal('scan-pay-modal');
    } catch (error) {
        showErrorMessage(errorMsg, "Payment failed.");
    } finally {
        payBtn.disabled = false;
        payBtn.textContent = 'Pay Now';
    }
}

function handleShare() {
    if (!currentUserData) return;
    const { referralId, name, lifetimeEarning } = currentUserData;
    const referralLink = `${window.location.origin}${window.location.pathname}?ref=${referralId}`;
    const shareText = `🎉 *Wow! Ek Zabardast Offer!* 🎉\n\nMai, *${name}*, Ramazone Cashback app se ab tak *₹${(lifetimeEarning || 0).toFixed(2)}* ki bachat ki hai! 🤑\n\nAap bhi is app ko use karein aur har khareed par dher saare paise bachayein. Miss mat karna! Mera code use karein: *${referralId}*\n\nAbhi join karein: ${referralLink}`;
    
    if (navigator.share) {
        navigator.share({ title: 'Ramazone Cashback Offer', text: shareText });
    } else {
        navigator.clipboard.writeText(shareText).then(() => showToast("Offer link copied!"));
    }
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
        const cashbackPercentage = configDoc.exists() ? configDoc.data().cashback_percentage : 2;
        const cashbackAmount = productPrice * (cashbackPercentage / 100);
        await addDoc(collection(db, "cashback_requests"), {
            userId: currentUserData.id, userName: currentUserData.name, userMobile: currentUserData.mobile,
            productName, productPrice, cashbackAmount,
            status: "pending", requestDate: serverTimestamp(), claimed: false
        });
        showToast("Cashback request submit ho gaya!");
        closeModal('cashback-modal');
    } catch (error) {
        showErrorMessage(errorMsg, `Error: ${error.message}`);
    } finally {
        btn.disabled = false;
    }
}

async function handleClaimRequest(e) {
    e.preventDefault();
    // This is for manual claim from wallet, not the approved cashback claim popup
    // Logic for this can be added if required
    showToast("This feature is coming soon!");
}

// --- Event Listeners Setup ---
function addAllEventListeners() {
    document.getElementById('login-form').addEventListener('submit', e => {
        e.preventDefault();
        const email = `${document.getElementById('login-mobile').value}@ramazone.com`;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, email, password)
            .catch(() => showErrorMessage(document.getElementById('login-error-msg'), "Galat mobile number ya password."));
    });
    document.getElementById('register-form').addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const mobile = document.getElementById('reg-mobile').value.trim();
        const password = document.getElementById('reg-password').value;
        const referralCode = document.getElementById('reg-referral').value.trim().toUpperCase();
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            await updateProfile(userCredential.user, { displayName: name });
            await setDoc(doc(db, 'users', userCredential.user.uid), {
                uid: userCredential.user.uid, name, mobile, wallet: 0, lifetimeEarning: 0,
                referralId: `RMZC${Math.floor(100+Math.random()*900)}B${Math.floor(100+Math.random()*900)}`,
                referredBy: referralCode || 'none', upline: [], createdAt: serverTimestamp()
            });
            toggleView('login-view');
        } catch (error) { showErrorMessage(document.getElementById('register-error-msg'), "Registration fail ho gaya."); }
    });
    document.getElementById('show-register-link').addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    document.getElementById('show-login-link').addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
    document.getElementById('open-profile-modal').addEventListener('click', () => openModal('profile-modal'));
    document.getElementById('open-cashback-modal').addEventListener('click', () => openModal('cashback-modal'));
    document.getElementById('open-claim-modal').addEventListener('click', () => openModal('claim-modal'));
    document.getElementById('open-coupons-modal').addEventListener('click', () => openModal('coupons-modal'));
    document.getElementById('scan-and-pay-btn').addEventListener('click', () => { openModal('scan-pay-modal'); startScanner(); });
    document.getElementById('rescan-btn').addEventListener('click', startScanner);
    document.getElementById('pay-submit-btn').addEventListener('click', handlePayment);
    document.getElementById('wallet-share-btn').addEventListener('click', handleShare);
    document.getElementById('cashback-request-form').addEventListener('submit', handleCashbackRequest);
    document.getElementById('claim-request-form').addEventListener('submit', handleClaimRequest);
    document.getElementById('upload-qr-btn').addEventListener('click', () => document.getElementById('qr-file-input').click());
    document.getElementById('qr-file-input').addEventListener('change', handleQrUpload);
    document.getElementById('filter-bar').addEventListener('click', e => {
        const target = e.target.closest('.filter-btn');
        if (!target) return;
        document.querySelector('#filter-bar .active')?.classList.remove('active');
        target.classList.add('active');
        activeFilter = target.dataset.filter;
        combineAndRenderHistory();
    });
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay').id)));
}

addAllEventListeners();

