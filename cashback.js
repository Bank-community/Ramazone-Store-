import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// This event listener ensures that the entire HTML is loaded before any JavaScript runs.
document.addEventListener('DOMContentLoaded', () => {

    // --- Constants and Global Variables ---
    const MASTER_REFERRAL_ID = "RMZC000B001";
    let auth, database;
    let currentUserData = null;
    let activeListeners = [];

    // --- COMPLETE DOM Element References ---
    const DOMElements = {
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        logoutBtn: document.getElementById('logout-btn'),
        refreshBtn: document.getElementById('refresh-btn'),
        showRegisterLink: document.getElementById('show-register-link'),
        showLoginLink: document.getElementById('show-login-link'),
        loginErrorMsg: document.getElementById('login-error-msg'),
        registerErrorMsg: document.getElementById('register-error-msg'),
        userNameDisplay: document.getElementById('user-name-display'),
        userMobileDisplay: document.getElementById('user-mobile'),
        walletBalance: document.getElementById('wallet-balance'),
        creditLimit: document.getElementById('credit-limit'),
        lifetimeEarning: document.getElementById('lifetime-earning'),
        dueAmount: document.getElementById('due-amount'),
        userReferralId: document.getElementById('user-referral-id'),
        walletShareBtn: document.getElementById('wallet-share-btn'),
        openCashbackModalBtn: document.getElementById('open-cashback-modal'),
        scanAndPayBtn: document.getElementById('scan-and-pay-btn'),
        openCouponsModalBtn: document.getElementById('open-coupons-modal'),
        openProfileModalBtn: document.getElementById('open-profile-modal'),
        openClaimModalBtn: document.getElementById('open-claim-modal'),
    };

    // --- CORE INITIALIZATION ---
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
            document.body.innerHTML = `<h2>Application Error</h2><p>${error.message}</p>`;
        }
    }

    // --- FULL APPLICATION LOGIC ---
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
    }

    function setupAuthentication() {
        onAuthStateChanged(auth, user => {
            if (user) {
                toggleView('dashboard-view');
                attachRealtimeListeners(user); 
            } else {
                toggleView('login-view');
                detachAllListeners();
            }
        });
        
        DOMElements.loginForm.addEventListener('submit', handleLogin);
        DOMElements.registerForm.addEventListener('submit', handleRegistration);
    }

    async function handleLogin(e) {
        e.preventDefault();
        hideErrorMessage(DOMElements.loginErrorMsg);
        const mobile = document.getElementById('login-mobile').value;
        const password = document.getElementById('login-password').value;
        try {
            await signInWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
        } catch (error) {
            console.error("Login Error:", error); // For debugging
            showErrorMessage(DOMElements.loginErrorMsg, "Galat mobile ya password.");
        }
    }

    async function handleRegistration(e) {
        e.preventDefault();
        hideErrorMessage(DOMElements.registerErrorMsg);
        const name = document.getElementById('reg-name').value.trim();
        const mobile = document.getElementById('reg-mobile').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const referralId = document.getElementById('reg-referral').value.trim().toUpperCase();
        
        if (!name || !/^\d{10}$/.test(mobile) || password.length < 6 || !referralId) {
            showErrorMessage(DOMElements.registerErrorMsg, "Sabhi details bharein.");
            return;
        }
        
        try {
            const snapshot = await get(query(ref(database, 'users'), orderByChild('referralId'), equalTo(referralId)));
            if (!snapshot.exists() && referralId !== MASTER_REFERRAL_ID) {
                showErrorMessage(DOMElements.registerErrorMsg, "Invalid Referral ID.");
                return;
            }
            const referrerUid = snapshot.exists() ? Object.keys(snapshot.val())[0] : 'master';
            
            const cred = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            await updateProfile(cred.user, { displayName: name });
            
            await set(ref(database, 'users/' + cred.user.uid), {
                uid: cred.user.uid, name, mobile, wallet: 0, lifetimeEarning: 0, dueAmount: 0,
                referralId: generateReferralId(), referredBy: referrerUid, createdAt: new Date().toISOString()
            });
            
            alert("Registration safal hua!");
            toggleView('login-view');
        } catch (error) {
            const msg = error.code === 'auth/email-already-in-use' ? "Yeh mobile number pehle se register hai." : "Registration fail ho gaya.";
            showErrorMessage(DOMElements.registerErrorMsg, msg);
        }
    }

    function attachRealtimeListeners(user) {
        detachAllListeners();
        activeListeners.push(onValue(ref(database, 'users/' + user.uid), (snapshot) => {
            if (snapshot.exists()) {
                currentUserData = { uid: user.uid, ...snapshot.val() };
                updateDashboardUI(currentUserData, user);
            }
        }));
    }

    function detachAllListeners() {
        activeListeners.forEach(unsubscribe => unsubscribe());
        activeListeners = [];
    }

    function updateDashboardUI(dbData, authUser) {
        DOMElements.userNameDisplay.textContent = authUser.displayName;
        DOMElements.userMobileDisplay.textContent = `Mobile: ${dbData.mobile}`;
        DOMElements.walletBalance.textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
        DOMElements.creditLimit.textContent = `₹${((dbData.wallet || 0) + (dbData.dueAmount || 0)).toFixed(2)}`;
        DOMElements.lifetimeEarning.textContent = `₹${(dbData.lifetimeEarning || 0).toFixed(2)}`;
        DOMElements.dueAmount.textContent = `- ₹${(dbData.dueAmount || 0).toFixed(2)}`;
        DOMElements.userReferralId.textContent = dbData.referralId || 'N/A';
    }

    function refreshData() {
        if (auth.currentUser) {
            attachRealtimeListeners(auth.currentUser);
            showToast("Data refreshed!");
        }
    }
    
    async function shareReferralLink() {
        const shareUrl = `${window.location.origin}${window.location.pathname}?ref=${currentUserData.referralId}`;
        const shareMessage = `Join me on Ramazone Cashback! Use my referral ID. Link: ${shareUrl}`;
        try {
            if (navigator.share) await navigator.share({ text: shareMessage });
            else { navigator.clipboard.writeText(shareMessage); showToast('Link copied!'); }
        } catch { showToast('Could not share.'); }
    }

    function showToast(message) {
        const toast = document.getElementById('toast-notification');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function toggleView(viewId) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(viewId).classList.add('active'); }
    function openModal(modal) { if (modal) modal.classList.add('active'); }
    function showErrorMessage(el, msg) { el.textContent = msg; el.style.display = 'block'; }
    function hideErrorMessage(el) { el.style.display = 'none'; }
    function generateReferralId() { return `RMZC${Math.floor(100+Math.random()*900)}B${Math.floor(1000+Math.random()*9000)}`; }

    // --- Start the application ---
    initializeFirebaseApp();
});

