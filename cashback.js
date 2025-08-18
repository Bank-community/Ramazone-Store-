import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, runTransaction, query, orderByChild, equalTo, update } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- Constants and Global Variables ---
const ADMIN_PAYMENT_ID = "@RamazoneStoreCashback";
const MASTER_REFERRAL_ID = "RMZC000B001";
let auth, database;
let imageApiKey = null;

// --- DOM Element References ---
// This object should contain all your element IDs
const DOMElements = {
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    logoutBtn: document.getElementById('logout-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    notificationBtn: document.getElementById('notification-btn'),
    showRegisterLink: document.getElementById('show-register-link'),
    showLoginLink: document.getElementById('show-login-link'),
    // ... add all other element IDs here for consistency
};

// --- Function to display error directly on the screen ---
function showFatalError(message, details = '') {
    document.body.innerHTML = `<div style="text-align: center; padding: 40px; color: #B91C1C; font-family: sans-serif; background-color: #FEF2F2; min-height: 100vh;">
        <h2 style="margin-bottom: 15px;">Application Error</h2>
        <p style="font-size: 16px; color: #374151;">${message}</p>
        <p style="font-size: 14px; color: #9CA3AF; margin-top: 20px; word-break: break-all;">${details}</p>
    </div>`;
    console.error(message, details); // Also log to console for good measure
}


// --- CORE INITIALIZATION ---
async function initializeFirebaseApp() {
    try {
        const response = await fetch('/api/cashback-config');
        if (!response.ok) {
            throw new Error(`API call failed with status: ${response.status}`);
        }
        const firebaseConfig = await response.json();

        // >>> NEW AGGRESSIVE CHECKING <<<
        // This will check each key and show an error on screen if one is missing.
        const requiredKeys = [
            "apiKey", "authDomain", "databaseURL", "projectId", 
            "storageBucket", "messagingSenderId", "appId"
        ];
        
        for (const key of requiredKeys) {
            if (!firebaseConfig[key]) {
                // Find the corresponding environment variable name
                const envVarName = `CASHBACK_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
                throw new Error(`Firebase config key '${key}' is missing. Please check the Environment Variable named '${envVarName}' in Vercel.`);
            }
        }

        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        database = getDatabase(app);
        
        // Now that Firebase is initialized, we can safely set up the application
        setupApplication();
        
    } catch (error) {
        showFatalError(error.message, "Please double-check your Vercel Environment Variables and redeploy the project.");
    }
}

// --- All other functions (Authentication, UI, etc.) ---

function setupApplication() {
    // This function now runs ONLY if Firebase initialization is successful.
    
    // Setup page navigation
    DOMElements.showRegisterLink.addEventListener('click', e => {
        e.preventDefault();
        toggleView('registration-view');
    });
    
    DOMElements.showLoginLink.addEventListener('click', e => {
        e.preventDefault();
        toggleView('login-view');
    });

    // Setup Authentication listeners
    setupAuthentication();
    
    // ... rest of your setup code (modal buttons, etc.)
}

function setupAuthentication() {
    onAuthStateChanged(auth, user => {
        if (user) {
            toggleView('dashboard-view');
            // attachRealtimeListeners(user); // This would be called here
        } else {
            toggleView('login-view');
            // detachAllListeners(); // This would be called here
        }
    });

    DOMElements.loginForm.addEventListener('submit', e => {
        e.preventDefault();
        // ... login logic
    });

    DOMElements.registerForm.addEventListener('submit', async e => {
        e.preventDefault();
        // ... registration logic
    });

    // ... other auth listeners
}

function toggleView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
}

// --- Start the application ---
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);

