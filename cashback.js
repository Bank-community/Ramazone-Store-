import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, runTransaction, query, orderByChild, equalTo, update } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- Constants and Global Variables ---
const MASTER_REFERRAL_ID = "RMZC000B001";
let auth, database;
let currentUserData = null;
let activeListeners = [];
let allTransactionsSnapshot = {};

// --- DOM Element References ---
const DOMElements = {
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    logoutBtn: document.getElementById('logout-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    notificationBtn: document.getElementById('notification-btn'),
    showRegisterLink: document.getElementById('show-register-link'),
    showLoginLink: document.getElementById('show-login-link'),
    loginErrorMsg: document.getElementById('login-error-msg'),
    registerErrorMsg: document.getElementById('register-error-msg'),
    userNameDisplay: document.getElementById('user-name-display'),
    walletBalance: document.getElementById('wallet-balance'),
    // Add all other element IDs here
};

// --- CORE INITIALIZATION ---
function initializeFirebaseApp() {
    try {
        // >>> APNI API KEYS YAHAN PASTE KAREIN <<<
        const firebaseConfig = {
            apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXX",
            authDomain: "your-project-id.firebaseapp.com",
            databaseURL: "https://your-project-id.firebaseio.com",
            projectId: "your-project-id",
            storageBucket: "your-project-id.appspot.com",
            messagingSenderId: "1234567890",
            appId: "1:1234567890:web:XXXXXXXXXXXXXXXX"
        };
        // >>> YAHAN TAK <<<

        if (firebaseConfig.apiKey.startsWith("AIzaSyXXX")) {
            throw new Error("API Keys are placeholders. Please add your actual Firebase keys.");
        }

        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        database = getDatabase(app);
        
        setupApplication();
        
    } catch (error) {
        document.body.innerHTML = `<div style="text-align: center; padding: 40px; color: #B91C1C; font-family: sans-serif;"><h2>Application Error</h2><p>${error.message}</p></div>`;
        console.error("FATAL: Firebase initialization failed.", error);
    }
}

// --- FULL APPLICATION LOGIC ---

function setupApplication() {
    setupAuthentication();
    
    DOMElements.showRegisterLink.addEventListener('click', e => { e.preventDefault(); toggleView('registration-view'); });
    DOMElements.showLoginLink.addEventListener('click', e => { e.preventDefault(); toggleView('login-view'); });
    DOMElements.logoutBtn.addEventListener('click', () => signOut(auth));
    DOMElements.refreshBtn.addEventListener('click', refreshData);
    // Add other button listeners here
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
        const referralId = document.getElementById('reg-referral').value.trim().toUpperCase();

        if (!name || !/^\d{10}$/.test(mobile) || password.length < 6 || !referralId) {
            showErrorMessage(DOMElements.registerErrorMsg, "Kripya sabhi details sahi se bharein.");
            return;
        }

        try {
            const referralUserSnapshot = await get(query(ref(database, 'users'), orderByChild('referralId'), equalTo(referralId)));
            if (!referralUserSnapshot.exists() && referralId !== MASTER_REFERRAL_ID) {
                showErrorMessage(DOMElements.registerErrorMsg, "Invalid Referral ID.");
                return;
            }
            const referrerUid = referralUserSnapshot.exists() ? Object.keys(referralUserSnapshot.val())[0] : 'master';

            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: name });

            const newUserReferralId = generateReferralId();
            await set(ref(database, 'users/' + user.uid), {
                uid: user.uid, name, mobile, wallet: 0, lifetimeEarning: 0, dueAmount: 0,
                profilePictureUrl: '', referralId: newUserReferralId, referredBy: referrerUid,
                createdAt: new Date().toISOString()
            });

            alert("Registration safal hua! Ab aap login kar sakte hain.");
            toggleView('login-view');
            DOMElements.registerForm.reset();

        } catch (error) {
            console.error("Registration Error:", error);
            const msg = error.code === 'auth/email-already-in-use' ? "Is mobile number se account pehle se hai." : "Registration fail ho gaya.";
            showErrorMessage(DOMElements.registerErrorMsg, msg);
        }
    });
}

function attachRealtimeListeners(user) {
    detachAllListeners();
    const uid = user.uid;
    activeListeners.push(onValue(ref(database, 'users/' + uid), (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = { uid, ...snapshot.val() };
            updateDashboardUI(currentUserData, user);
        }
    }));
    // Add listeners for transactions, etc. here
}

function detachAllListeners() {
    activeListeners.forEach(unsubscribe => unsubscribe());
    activeListeners = [];
    currentUserData = null;
}

function updateDashboardUI(dbData, authUser) {
    DOMElements.userNameDisplay.textContent = authUser.displayName;
    DOMElements.walletBalance.textContent = `₹ ${(dbData.wallet || 0).toFixed(2)}`;
    document.getElementById('user-mobile').textContent = `Mobile: ${dbData.mobile}`;
    document.getElementById('credit-limit').textContent = `₹${((dbData.wallet || 0) + (dbData.dueAmount || 0)).toFixed(2)}`;
    document.getElementById('lifetime-earning').textContent = `₹${(dbData.lifetimeEarning || 0).toFixed(2)}`;
    document.getElementById('due-amount').textContent = `- ₹${(dbData.dueAmount || 0).toFixed(2)}`;
    document.getElementById('user-referral-id').textContent = dbData.referralId || 'N/A';
}

function refreshData() {
    if (auth.currentUser) {
        attachRealtimeListeners(auth.currentUser);
        showToast("Data refreshed!");
    }
}

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
function showErrorMessage(element, message) { element.textContent = message; element.style.display = 'block'; }
function hideErrorMessage(element) { element.style.display = 'none'; }
function generateReferralId() { const r1 = Math.floor(100 + Math.random() * 900); const r2 = Math.floor(1000 + Math.random() * 9000); return `RMZC${r1}B${r2}`; }

// --- Start the application ---
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);

