import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

document.addEventListener('DOMContentLoaded', () => {

    const MASTER_REFERRAL_ID = "RMZC000B001";
    let auth, database, currentUserData, activeListeners = [], tempActionData = {};

    const DOMElements = {
        loginForm: document.getElementById('login-form'), registerForm: document.getElementById('register-form'),
        logoutBtn: document.getElementById('logout-btn'), refreshBtn: document.getElementById('refresh-btn'),
        showRegisterLink: document.getElementById('show-register-link'), showLoginLink: document.getElementById('show-login-link'),
        loginErrorMsg: document.getElementById('login-error-msg'), registerErrorMsg: document.getElementById('register-error-msg'),
        userNameDisplay: document.getElementById('user-name-display'), userMobileDisplay: document.getElementById('user-mobile'),
        walletBalance: document.getElementById('wallet-balance'), creditLimit: document.getElementById('credit-limit'),
        lifetimeEarning: document.getElementById('lifetime-earning'), dueAmount: document.getElementById('due-amount'),
        userReferralId: document.getElementById('user-referral-id'), walletShareBtn: document.getElementById('wallet-share-btn'),
        openCashbackModalBtn: document.getElementById('open-cashback-modal'), scanAndPayBtn: document.getElementById('scan-and-pay-btn'),
        openCouponsModalBtn: document.getElementById('open-coupons-modal'), openProfileModalBtn: document.getElementById('open-profile-modal'),
        openClaimModalBtn: document.getElementById('open-claim-modal'), regReferralInput: document.getElementById('reg-referral'),
        cashbackRequestForm: document.getElementById('cashback-request-form'), claimRequestForm: document.getElementById('claim-request-form'),
        modalConfirmBtn: document.getElementById('modal-confirm-btn'), unifiedHistoryList: document.getElementById('unified-history-list'),
    };

    async function initializeFirebaseApp() {
        try {
            const response = await fetch('/api/cashback-config');
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            const firebaseConfig = await response.json();
            if (!firebaseConfig.apiKey) throw new Error("API Keys missing.");
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            database = getDatabase(app);
            setupApplication();
        } catch (error) {
            document.body.innerHTML = `<div class="auth-card"><h2>Application Error</h2><p>${error.message}</p></div>`;
        }
    }

    function setupApplication() {
        setupAuthentication();
        DOMElements.showRegisterLink.addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
        DOMElements.showLoginLink.addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
        DOMElements.logoutBtn.addEventListener('click', () => signOut(auth));
        DOMElements.refreshBtn.addEventListener('click', refreshData);
        DOMElements.openCashbackModalBtn.addEventListener('click', () => openModal(document.getElementById('cashback-modal')));
        DOMElements.scanAndPayBtn.addEventListener('click', () => openModal(document.getElementById('scan-pay-modal')));
        DOMElements.openCouponsModalBtn.addEventListener('click', () => openModal(document.getElementById('coupons-modal')));
        DOMElements.openProfileModalBtn.addEventListener('click', () => openModal(document.getElementById('profile-modal')));
        DOMElements.openClaimModalBtn.addEventListener('click', () => openModal(document.getElementById('claim-modal')));
        DOMElements.walletShareBtn.addEventListener('click', shareReferralLink);
        DOMElements.cashbackRequestForm.addEventListener('submit', handleCashbackRequest);
        DOMElements.claimRequestForm.addEventListener('submit', handleClaimRequest);
        DOMElements.modalConfirmBtn.addEventListener('click', handlePasswordConfirmation);
        document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay'))));
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('ref')) {
            toggleView('registration-view');
            DOMElements.regReferralInput.value = urlParams.get('ref');
        }
    }

    function setupAuthentication() {
        onAuthStateChanged(auth, user => {
            if (user) {
                toggleView('dashboard-view');
                attachRealtimeListeners(user); 
            } else {
                if (!new URLSearchParams(window.location.search).has('ref')) toggleView('login-view');
                detachAllListeners();
            }
        });
        DOMElements.loginForm.addEventListener('submit', handleLogin);
        DOMElements.registerForm.addEventListener('submit', handleRegistration);
    }

    async function handleLogin(e) { /* ... (logic from previous correct version) ... */ }
    async function handleRegistration(e) { /* ... (logic from previous correct version) ... */ }

    async function handleCashbackRequest(e) {
        e.preventDefault();
        const productName = document.getElementById("product-name").value.trim();
        const productPrice = parseFloat(document.getElementById("product-price").value);
        const purchaseDate = document.getElementById("product-purchase-date").value;
        if (!productName || isNaN(productPrice) || !purchaseDate) {
            showErrorMessage(document.getElementById('cashback-error-msg'), "Sabhi details bharein.");
            return;
        }
        try {
            const settings = (await get(ref(database, 'app_settings'))).val() || {};
            const totalPercent = settings.cashback_percentage || 3;
            const selfPercent = settings.self_cashback_percentage || 66.67;
            const totalCommission = productPrice * (totalPercent / 100);
            const selfCashback = totalCommission * (selfPercent / 100);
            const referralPool = totalCommission - selfCashback;

            await push(ref(database, "cashback_requests"), { 
                userId: currentUserData.uid, userName: currentUserData.name, productName, productPrice, purchaseDate, 
                cashbackAmount: selfCashback, referralPool, status: "pending", requestDate: new Date().toISOString()
            });
            showToast("Cashback request submit ho gaya!");
            closeModal(document.getElementById('cashback-modal'));
        } catch (error) {
            showErrorMessage(document.getElementById('cashback-error-msg'), "Request fail ho gaya.");
        }
    }

    async function handleClaimRequest(e) {
        e.preventDefault();
        const amount = parseFloat(document.getElementById("claim-amount").value);
        if (isNaN(amount) || amount < 10 || amount > currentUserData.wallet) {
            showErrorMessage(document.getElementById('claim-error-msg'), "Sahi amount daalein.");
            return;
        }
        tempActionData = { type: 'claim', amount };
        closeModal(document.getElementById('claim-modal'));
        openModal(document.getElementById('password-modal-for-action'));
    }

    async function handlePasswordConfirmation() {
        if (tempActionData.type === 'claim') {
            // ... (Logic to verify password and process claim) ...
            showToast("Claim request sent!");
        }
        closeModal(document.getElementById('password-modal-for-action'));
    }
    
    function attachRealtimeListeners(user) { /* ... (logic from previous correct version) ... */ }
    function detachAllListeners() { /* ... (logic from previous correct version) ... */ }
    function updateDashboardUI(dbData, authUser) { /* ... (logic from previous correct version) ... */ }
    function refreshData() { /* ... (logic from previous correct version) ... */ }
    async function shareReferralLink() { /* ... (logic from previous correct version) ... */ }
    function toggleView(viewId) { /* ... (logic from previous correct version) ... */ }
    function openModal(modal) { if(modal) modal.classList.add('active'); }
    function closeModal(modal) { if(modal) modal.classList.remove('active'); }
    function showToast(message) { /* ... (logic from previous correct version) ... */ }
    function showErrorMessage(el, msg) { el.textContent = msg; el.style.display = 'block'; }
    function hideErrorMessage(el) { el.style.display = 'none'; }
    function generateReferralId() { return `RMZC${Math.floor(100+Math.random()*900)}B${Math.floor(1000+Math.random()*9000)}`; }

    initializeFirebaseApp();
});

