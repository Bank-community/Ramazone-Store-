import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, runTransaction, query, orderByChild, equalTo, update } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- Constants and Global Variables ---
const ADMIN_PAYMENT_ID = "@RamazoneStoreCashback";
const MASTER_REFERRAL_ID = "RMZC000B001";
let auth, database;
let imageApiKey = null;

// --- DOM Element References ---
const DOMElements = {
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    logoutBtn: document.getElementById('logout-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    // ... (rest of the elements are the same)
    registerErrorMsg: document.getElementById('register-error-msg'),
};

// --- CORE INITIALIZATION ---
async function initializeFirebaseApp() {
    try {
        const response = await fetch('/api/cashback-config');
        if (!response.ok) throw new Error('Could not fetch Firebase config!');
        const firebaseConfig = await response.json();
        console.log("Firebase Config Received from API:", firebaseConfig);
        if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.databaseURL) {
            throw new Error("One or more Firebase config keys are missing.");
        }
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        database = getDatabase(app);
        await fetchImageApiKey();
        setupApplication();
    } catch (error) {
        console.error("FATAL: Firebase initialization failed.", error);
        document.body.innerHTML = `<div style="text-align: center; padding: 50px; color: #EF4444; font-family: sans-serif;"><h2>Application could not start.</h2><p>Please check connection and configuration.</p><p style="color: #6B7280; font-size: 14px; margin-top: 10px;">Error: ${error.message}</p></div>`;
    }
}

// --- AUTHENTICATION & DATA LISTENERS ---
function setupAuthentication() {
    // ... onAuthStateChanged and loginForm listener remain the same ...

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
                showErrorMessage(DOMElements.registerErrorMsg, "Invalid Referral ID. Kripya sahi ID daalein.");
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
            // >>> DEGBUGGING LINE ADDED HERE <<<
            // Yeh line browser ke console mein asli error dikhayegi
            console.error("Registration Error Details:", error); 
            
            const msg = error.code === 'auth/email-already-in-use' ? "Is mobile number se account pehle se hai." : "Registration fail ho gaya. Dobara koshish karein.";
            showErrorMessage(DOMElements.registerErrorMsg, msg);
        }
    });

    // ... logoutBtn listener remains the same ...
}

// --- All other functions (utility, UI rendering, etc.) remain the same ---
// NOTE: For brevity, only the changed function is shown. You should replace the whole file.
// Make sure to include all the other functions from the previous version in your final file.

// --- UTILITY FUNCTIONS ---
function showErrorMessage(element, message) { element.textContent = message; element.style.display = 'block'; }
function hideErrorMessage(element) { element.style.display = 'none'; }
function toggleView(viewId) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(viewId)?.classList.add('active'); }
function generateReferralId() { const randomPart1 = Math.floor(100 + Math.random() * 900); const randomPart2 = Math.floor(1000 + Math.random() * 9000); return `RMZC${randomPart1}B${randomPart2}`; }
async function fetchImageApiKey() { if (imageApiKey) return imageApiKey; try { const response = await fetch('/api/image-config'); if (!response.ok) throw new Error('Could not get image config.'); const config = await response.json(); imageApiKey = config.apiKey; return imageApiKey; } catch (error) { console.error("Failed to fetch image API key:", error); return null; } }
function setupApplication() { setupAuthentication(); /* ... other setup code ... */ }
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);

