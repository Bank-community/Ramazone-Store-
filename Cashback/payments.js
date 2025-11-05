// --- Firebase modules import ---
import { getFirestore, doc, getDoc, setDoc, runTransaction, increment, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- Global variables for payment logic ---
let db, auth;
let showToast, openModal, closeModal, showErrorMessage, hideErrorMessage, getCurrentUser, getCurrentUserData;
let scannerAnimation = null;
let pendingAction = null; // Password verification ke baad run hone wala action
let p2pReceiver = null; // Store receiver details for P2P transfer
const RAMAZONE_STORE_ID = '@RamazoneStoreCashback'; // Store payment QR ID

/**
 * Payment views ke beech switch karein
 * @param {string} viewToShow - Dikhane wale view ki ID (e.g., 'scan-qr-view')
 */
function switchPaymentView(viewToShow) {
    // Sabhi views ko chhupayein
    document.querySelectorAll('.payment-view').forEach(view => {
        view.style.display = 'none';
        view.classList.remove('active');
    });
    // Active button se 'active' class hatayein
    document.querySelectorAll('.rmz-pay-option-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Target view ko dikhayein
    const viewElement = document.getElementById(viewToShow);
    if (viewElement) {
        viewElement.style.display = 'block';
        viewElement.classList.add('active');
    }

    // Target button mein 'active' class lagayein
    let activeButton;
    if (viewToShow === 'scan-qr-view') {
        activeButton = document.getElementById('select-scan-btn');
        startScanner(); // Scan view dikhate hi scanner start karein
    } else if (viewToShow === 'p2p-pay-view') {
        activeButton = document.getElementById('select-p2p-btn');
        stopScanner();
    } else if (viewToShow === 'rmz-store-pay-view') {
        activeButton = document.getElementById('select-rmz-store-btn');
        stopScanner();
    }
    
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

/**
 * Payment modal ko uski default state (Scan QR) par reset karein.
 */
function resetPaymentModal() {
    switchPaymentView('scan-qr-view');
    p2pReceiver = null; // P2P receiver ko clear karein
    
    // Sabhi forms aur error messages ko reset karein
    document.getElementById('p2p-search-id').value = '';
    document.getElementById('p2p-receiver-info').style.display = 'none';
    document.getElementById('p2p-receiver-info').textContent = '';
    document.getElementById('p2p-payment-form').style.display = 'none';
    document.getElementById('p2p-payment-amount').value = '';
    hideErrorMessage(document.getElementById('p2p-payment-error-msg'));
    
    document.getElementById('rmz-payment-amount').value = '';
    hideErrorMessage(document.getElementById('rmz-payment-error-msg'));
}

// --- Scanner/QR Code Functions ---

/**
 * QR code scan successful hone par handle karein.
 * @param {string} data - QR code se mila data.
 */
async function handleSuccessfulScan(data) {
    // Sirf Ramazone Store ka QR hi accept karein
    if (data === RAMAZONE_STORE_ID) {
        stopScanner();
        showToast("Ramazone Store QR Scanned!");
        // Scan ke baad RMZ Store payment view dikhayein
        switchPaymentView('rmz-store-pay-view');
        document.getElementById('scanner-status').textContent = 'QR Code Scanned!';
    } else {
        showToast("Invalid QR code. Only Ramazone Store QR is accepted.");
        // Invalid QR par scanning jaari rakhein (ya user ko P2P ke liye guide karein)
        // startScanner(); // Isse loop ban sakta hai, user ko khud rescan karne dein.
    }
}

/**
 * QR code scanner ko start karein.
 */
function startScanner() {
    stopScanner(); // Pehle stop karein
    const video = document.getElementById('scanner-video');
    const statusEl = document.getElementById('scanner-status');
    
    if (!video || !statusEl) return;
    
    statusEl.textContent = 'Starting camera...';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
        video.srcObject = stream;
        video.play();
        statusEl.textContent = 'Scanning for QR code...';
        
        const tick = () => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth; 
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                // QR code detect karein
                const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
                
                if (code && code.data === RAMAZONE_STORE_ID) { 
                    handleSuccessfulScan(code.data); 
                    return; // Scan milne par loop rok dein
                }
            }
            if (scannerAnimation) scannerAnimation = requestAnimationFrame(tick);
        };
        scannerAnimation = requestAnimationFrame(tick);

    }).catch(() => {
        statusEl.textContent = 'Could not access camera.';
    });
}

/**
 * QR code scanner ko stop karein.
 */
function stopScanner() {
    if (scannerAnimation) cancelAnimationFrame(scannerAnimation);
    scannerAnimation = null;
    const video = document.getElementById('scanner-video');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
}

/**
 * Gallery se QR code image upload ko handle karein.
 * @param {Event} event - File input change event.
 */
function handleQrUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            
            if (code && code.data === RAMAZONE_STORE_ID) {
                handleSuccessfulScan(code.data);
            } else {
                showToast("No valid Ramazone QR code found.");
            }
        };
        image.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = ''; // Input ko reset karein
}

// --- P2P (Pay to User) Logic ---

/**
 * Payment ID se user ko search karein.
 */
async function handleP2PSearch() {
    const searchInput = document.getElementById('p2p-search-id');
    const searchBtn = document.getElementById('p2p-search-btn');
    const receiverInfoEl = document.getElementById('p2p-receiver-info');
    const paymentForm = document.getElementById('p2p-payment-form');
    const errorMsgEl = document.getElementById('p2p-payment-error-msg');
    
    const paymentId = searchInput.value.trim();
    if (!paymentId.includes('@RMZ')) {
        showErrorMessage(errorMsgEl, "Invalid Payment ID format.");
        return;
    }
    
    const mobile = paymentId.split('@RMZ')[0];
    const currentUserData = getCurrentUserData();
    if (mobile === currentUserData.mobile) {
        showErrorMessage(errorMsgEl, "You cannot send money to yourself.");
        return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = '...';
    hideErrorMessage(errorMsgEl);
    receiverInfoEl.style.display = 'none';
    paymentForm.style.display = 'none';
    p2pReceiver = null;

    try {
        const q = query(collection(db, "users"), where("mobile", "==", mobile));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            showErrorMessage(errorMsgEl, "User not found.");
        } else {
            const userDoc = querySnapshot.docs[0];
            p2pReceiver = { uid: userDoc.id, ...userDoc.data() };
            
            receiverInfoEl.innerHTML = `Paying to: <strong style="color: var(--brand-red);">${p2pReceiver.name}</strong>`;
            receiverInfoEl.style.display = 'block';
            paymentForm.style.display = 'block';
        }
    } catch (error) {
        console.error("Error searching user:", error);
        showErrorMessage(errorMsgEl, "An error occurred. Please try again.");
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
    }
}

// --- Password Verification Logic ---

/**
 * Koi bhi action karne se pehle password verify karein.
 * @param {Function} action - Password sahi hone par run hone wala function.
 */
function verifyPasswordAndExecute(action) {
    pendingAction = action; // Payment function ko save karein
    document.getElementById('verification-password').value = '';
    hideErrorMessage(document.getElementById('verification-error-msg'));
    openModal('password-verification-modal');
}

/**
 * Password verification modal ke confirm button ko handle karein.
 */
async function handleVerificationConfirm() {
    const password = document.getElementById('verification-password').value;
    const errorMsg = document.getElementById('verification-error-msg');
    hideErrorMessage(errorMsg);
    if (!password) return showErrorMessage(errorMsg, "Password is required.");
    
    const confirmBtn = document.getElementById('verification-confirm-btn');
    confirmBtn.disabled = true; 
    confirmBtn.textContent = "Verifying...";
    
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, password);
    
    try {
        await reauthenticateWithCredential(user, credential);
        closeModal('password-verification-modal');
        if (pendingAction) {
            await pendingAction(); // Save kiya gaya payment function run karein
        }
    } catch (error) {
        showErrorMessage(errorMsg, "Incorrect password.");
    } finally {
        confirmBtn.disabled = false; 
        confirmBtn.textContent = "Confirm";
        document.getElementById('verification-password').value = '';
        pendingAction = null; // Action ko clear karein
    }
}

// --- Payment Execution Logic ---

/**
 * RMZ Store Payment ko initiate karein (Password verification ke liye).
 */
function handleRMZStorePayment() {
    const amountInput = document.getElementById('rmz-payment-amount');
    const errorMsg = document.getElementById('rmz-payment-error-msg');
    const amount = parseFloat(amountInput.value);
    const currentUserData = getCurrentUserData();

    hideErrorMessage(errorMsg);
    if (isNaN(amount) || amount < 5) {
        return showErrorMessage(errorMsg, "Minimum payment is ₹5.");
    }
    if (currentUserData.wallet < amount) {
        return showErrorMessage(errorMsg, "Insufficient balance.");
    }

    // Password verification ke liye payment function ko pass karein
    verifyPasswordAndExecute(async () => {
        await doRMZStorePayment(amount);
    });
}

/**
 * Asli RMZ Store Payment Transaction (Password verify hone ke baad).
 * @param {number} amount - Pay karne wali amount.
 */
async function doRMZStorePayment(amount) {
    const currentUserData = getCurrentUserData();
    document.getElementById('payment-processing-modal').classList.add('active');
    closeModal('scan-pay-modal');
    
    let newTxnRef = doc(collection(db, "transactions")); 
    
    try {
        await runTransaction(db, async (t) => {
            const userRef = doc(db, 'users', currentUserData.uid);
            const configRef = doc(db, 'app_settings', 'config');
            
            // User ka wallet check karein (double-check)
            const userDoc = await t.get(userRef);
            if (!userDoc.exists() || userDoc.data().wallet < amount) {
                throw new Error("Insufficient balance.");
            }

            // 1. User ka wallet update (debit)
            t.update(userRef, { wallet: increment(-amount) });
            
            // 2. Admin ka wallet update (credit)
            t.set(configRef, { rmz_wallet_balance: increment(amount) }, { merge: true });
            
            // 3. User ke liye transaction record
            t.set(newTxnRef, { 
                type: 'payment', 
                amount: -amount, // User ke liye negative
                description: 'Paid to Ramazone Store', 
                status: 'completed', 
                timestamp: serverTimestamp(), 
                involvedUsers: [currentUserData.uid] // Sirf sender
                // Yahan 'otherParty' ki zaroorat nahi, kyunki type 'payment' hai
            });
            
            // 4. Admin ke liye transaction record
            t.set(doc(collection(db, "rmz_wallet_transactions")), { 
                amount, // Admin ke liye positive
                senderId: currentUserData.uid, 
                senderName: currentUserData.name, 
                senderMobile: currentUserData.mobile, 
                timestamp: serverTimestamp() 
            });
        });
        
        // --- SUCCESS ---
        document.getElementById('payment-processing-modal').classList.remove('active');
        showSuccessModal('rmz', {
            amount: amount,
            receiverName: 'Ramazone Store',
            txnId: newTxnRef.id
        });

    } catch (error) { 
        // --- FAILURE ---
        console.error("RMZ Payment transaction failed:", error);
        document.getElementById('payment-processing-modal').classList.remove('active');
        document.getElementById('payment-failure-modal').querySelector('.modal-content p').textContent = 
            error.message || "Payment failed. Please try again.";
        openModal('payment-failure-modal');
    }
}

/**
 * P2P Payment ko initiate karein (Password verification ke liye).
 */
function handleP2PPayment() {
    const amountInput = document.getElementById('p2p-payment-amount');
    const errorMsg = document.getElementById('p2p-payment-error-msg');
    const amount = parseFloat(amountInput.value);
    const currentUserData = getCurrentUserData();

    hideErrorMessage(errorMsg);
    if (!p2pReceiver) {
        return showErrorMessage(errorMsg, "Please search and select a user first.");
    }
    if (isNaN(amount) || amount < 1) {
        return showErrorMessage(errorMsg, "Minimum payment is ₹1.");
    }
    if (currentUserData.wallet < amount) {
        return showErrorMessage(errorMsg, "Insufficient balance.");
    }

    // Password verification ke liye payment function ko pass karein
    verifyPasswordAndExecute(async () => {
        await doP2PPayment(amount, p2pReceiver);
    });
}

/**
 * Asli P2P Payment Transaction (Password verify hone ke baad). (UPDATED)
 * @param {number} amount - Pay karne wali amount.
 * @param {object} receiver - Receiver ka user object (jismein uid aur name ho).
 */
async function doP2PPayment(amount, receiver) {
    const sender = getCurrentUserData();
    document.getElementById('payment-processing-modal').classList.add('active');
    closeModal('scan-pay-modal');
    
    const senderTxnRef = doc(collection(db, "transactions"));
    const receiverTxnRef = doc(collection(db, "transactions"));

    try {
        await runTransaction(db, async (t) => {
            const senderRef = doc(db, 'users', sender.uid);
            const receiverRef = doc(db, 'users', receiver.uid);

            // Sender ka wallet check karein
            const senderDoc = await t.get(senderRef);
            if (!senderDoc.exists() || senderDoc.data().wallet < amount) {
                throw new Error("Insufficient balance.");
            }
            
            // Receiver ka doc check karein
            const receiverDoc = await t.get(receiverRef);
            if (!receiverDoc.exists()) {
                throw new Error("Receiver account does not exist.");
            }

            // 1. Sender ka wallet update (debit)
            t.update(senderRef, { wallet: increment(-amount) });
            
            // 2. Receiver ka wallet update (credit)
            t.update(receiverRef, { wallet: increment(amount) });
            
            // 3. Sender ke liye transaction record (Debit)
            t.set(senderTxnRef, { 
                type: 'p2p_sent', 
                amount: -amount, // Negative amount
                description: `Paid to ${receiver.name}`, 
                status: 'completed', 
                timestamp: serverTimestamp(), 
                involvedUsers: [sender.uid], // Sirf Sender
                // (NEW) "Pay Again" ke liye receiver ki info save karein
                otherParty: {
                    name: receiver.name,
                    mobile: receiver.mobile 
                }
            });

            // 4. Receiver ke liye transaction record (Credit)
            t.set(receiverTxnRef, { 
                type: 'p2p_received', 
                amount: amount, // Positive amount
                description: `Received from ${sender.name}`, 
                status: 'completed', 
                timestamp: serverTimestamp(), 
                involvedUsers: [receiver.uid], // Sirf Receiver
                // (NEW) Receiver ki history mein sender ki info
                otherParty: {
                    name: sender.name,
                    mobile: sender.mobile
                }
            });
        });
        
        // --- SUCCESS ---
        document.getElementById('payment-processing-modal').classList.remove('active');
        showSuccessModal('p2p', {
            amount: amount,
            receiverName: receiver.name,
            txnId: senderTxnRef.id // Sender ki transaction ID dikhayein
        });

    } catch (error) {
        // --- FAILURE ---
        console.error("P2P Payment transaction failed:", error);
        document.getElementById('payment-processing-modal').classList.remove('active');
        document.getElementById('payment-failure-modal').querySelector('.modal-content p').textContent = 
            error.message || "Payment failed. Please try again.";
        openModal('payment-failure-modal');
    }
}

/**
 * Payment Success Modal ko data ke saath dikhayein.
 * @param {string} type - 'rmz' ya 'p2p'
 * @param {object} details - { amount, receiverName, txnId }
 */
function showSuccessModal(type, details) {
    const now = new Date();
    document.getElementById('success-modal-amount').textContent = `₹ ${details.amount.toFixed(2)}`;
    document.getElementById('success-modal-receiver').textContent = details.receiverName;
    document.getElementById('success-modal-txn-id').textContent = details.txnId;
    document.getElementById('success-modal-datetime').textContent = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    
    // Download button ke liye naya event listener attach karein (cloneNode trick)
    const oldDownloadBtn = document.getElementById('success-download-receipt-btn');
    const newDownloadBtn = oldDownloadBtn.cloneNode(true);
    oldDownloadBtn.parentNode.replaceChild(newDownloadBtn, oldDownloadBtn);
    
    newDownloadBtn.addEventListener('click', () => handleSuccessReceiptDownload(details.txnId));
    
    openModal('payment-success-modal');
}

/**
 * Payment Success Receipt ko download karein.
 * @param {string} txnId - Transaction ID
 */
function handleSuccessReceiptDownload(txnId) {
    const receiptElement = document.querySelector('#payment-success-modal .modal-content');
    const downloadBtn = document.getElementById('success-download-receipt-btn');
    const doneBtn = document.querySelector('#payment-success-modal .action-btn[data-close-modal]');
    
    // Buttons ko chhupayein
    downloadBtn.style.visibility = 'hidden';
    doneBtn.style.visibility = 'hidden';
    
    showToast("Downloading receipt...");

    html2canvas(receiptElement, { scale: 2, useCORS: true }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `Ramazone-Payment-${txnId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }).catch(err => {
        console.error("Error downloading receipt:", err);
        showToast("Download failed.");
    }).finally(() => {
        // Buttons ko wapas dikhayein
        downloadBtn.style.visibility = 'visible';
        doneBtn.style.visibility = 'visible';
    });
}


/**
 * Payment module ke event listeners ko initialize karein. (UPDATED)
 */
function initializePaymentListeners() {
    // app.js se core functions lein
    const App = window.RamazoneApp;
    if (!App) {
        console.error("RamazoneApp core not found!");
        return;
    }
    
    db = App.getDb();
    auth = App.getAuth();
    showToast = App.showToast;
    openModal = App.openModal;
    closeModal = App.closeModal;
    showErrorMessage = App.showErrorMessage;
    hideErrorMessage = App.hideErrorMessage;
    getCurrentUser = App.getCurrentUser;
    getCurrentUserData = App.getCurrentUserData;

    // --- Modal Tab Buttons ---
    document.getElementById('select-scan-btn').addEventListener('click', () => switchPaymentView('scan-qr-view'));
    document.getElementById('select-p2p-btn').addEventListener('click', () => switchPaymentView('p2p-pay-view'));
    document.getElementById('select-rmz-store-btn').addEventListener('click', () => switchPaymentView('rmz-store-pay-view'));

    // --- Scan View ---
    document.getElementById('upload-qr-btn').addEventListener('click', () => document.getElementById('qr-file-input').click());
    document.getElementById('qr-file-input').addEventListener('change', handleQrUpload);

    // --- P2P View ---
    document.getElementById('p2p-search-btn').addEventListener('click', handleP2PSearch);
    document.getElementById('p2p-pay-submit-btn').addEventListener('click', handleP2PPayment);
    
    // --- RMZ Store View ---
    document.getElementById('rmz-pay-submit-btn').addEventListener('click', handleRMZStorePayment);

    // --- Password Verification ---
    document.getElementById('verification-confirm-btn').addEventListener('click', handleVerificationConfirm);
    
    // --- Custom Event Listeners (app.js se) ---
    
    // Jab payment modal khule, use reset karein
    document.addEventListener('paymentModalOpened', resetPaymentModal);
    
    // Jab modal band ho, scanner ko stop karein
    document.addEventListener('stopScanner', stopScanner);
    
    // (NEW) "Pay Again" event ko sunein
    document.addEventListener('openPaymentTab', (e) => {
        const detail = e.detail;
        if (detail.tab === 'rmz-store') {
            switchPaymentView('rmz-store-pay-view');
        } else if (detail.tab === 'p2p') {
            switchPaymentView('p2p-pay-view');
            if (detail.searchId) {
                // ID ko search box mein daalein
                document.getElementById('p2p-search-id').value = detail.searchId;
                // Auto-search trigger karein
                handleP2PSearch();
            }
        }
    });
}

// DOM load hone par payment listeners ko initialize karein
document.addEventListener('DOMContentLoaded', initializePaymentListeners);


