import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue, runTransaction, query, orderByChild, equalTo, update } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- Constants and Global Variables ---
const ADMIN_PAYMENT_ID = "@RamazoneStoreCashback";
const MASTER_REFERRAL_ID = "RMZC000B001";
let auth, database;

// --- CORE INITIALIZATION ---
function initializeFirebaseApp() {
    try {
        // >>> APNI API KEYS YAHAN PASTE KAREIN <<<
        // Firebase se copy kiya hua pura 'firebaseConfig' object yahan daalein
        const firebaseConfig = {
  apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
  authDomain: "tipsplit-e3wes.firebaseapp.com",
  databaseURL: "https://tipsplit-e3wes-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tipsplit-e3wes",
  storageBucket: "tipsplit-e3wes.firebasestorage.app",
  messagingSenderId: "984733883633",
  appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};
        // >>> YAHAN TAK <<<

        // Check if keys are placeholders
        if (firebaseConfig.apiKey.startsWith("AIzaSyXXX")) {
            throw new Error("Firebase config keys are placeholders. Please replace them with your actual keys.");
        }

        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        database = getDatabase(app);
        
        // Firebase safaltapoorvak shuru ho gaya hai
        setupApplication();
        
    } catch (error) {
        // Agar yahan error aata hai, to matlab API keys galat copy hui hain
        document.body.innerHTML = `<div style="text-align: center; padding: 40px; color: #B91C1C; font-family: sans-serif;"><h2>Application Error</h2><p>${error.message}</p></div>`;
        console.error("FATAL: Firebase initialization failed.", error);
    }
}

// --- All other functions (Authentication, UI, etc.) ---

function setupApplication() {
    // Buttons ko kaam karne layak banayein
    document.getElementById('show-register-link').addEventListener('click', e => {
        e.preventDefault();
        toggleView('registration-view');
    });
    
    document.getElementById('show-login-link').addEventListener('click', e => {
        e.preventDefault();
        toggleView('login-view');
    });

    // Authentication listeners ko setup karein
    setupAuthentication();
    
    // ... baaki sabhi buttons aur features ka setup code yahan aayega
}

function setupAuthentication() {
    onAuthStateChanged(auth, user => {
        if (user) {
            toggleView('dashboard-view');
            // attachRealtimeListeners(user); 
        } else {
            toggleView('login-view');
            // detachAllListeners();
        }
    });

    document.getElementById('login-form').addEventListener('submit', e => {
        e.preventDefault();
        const mobile = document.getElementById('login-mobile').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password)
            .catch((error) => {
                console.error("Login Error:", error);
                document.getElementById('login-error-msg').textContent = "Galat mobile number ya password.";
                document.getElementById('login-error-msg').style.display = 'block';
            });
    });

    document.getElementById('register-form').addEventListener('submit', async e => {
        e.preventDefault();
        const errorMsgElement = document.getElementById('register-error-msg');
        hideErrorMessage(errorMsgElement);

        const name = document.getElementById('reg-name').value.trim();
        const mobile = document.getElementById('reg-mobile').value.trim();
        const password = document.getElementById('reg-password').value.trim();
        const referralId = document.getElementById('reg-referral').value.trim().toUpperCase();

        if (!name || !/^\d{10}$/.test(mobile) || password.length < 6 || !referralId) {
            showErrorMessage(errorMsgElement, "Kripya sabhi details sahi se bharein.");
            return;
        }

        try {
            const referralUserSnapshot = await get(query(ref(database, 'users'), orderByChild('referralId'), equalTo(referralId)));
            if (!referralUserSnapshot.exists() && referralId !== MASTER_REFERRAL_ID) {
                showErrorMessage(errorMsgElement, "Invalid Referral ID.");
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
            document.getElementById('register-form').reset();

        } catch (error) {
            console.error("Registration Error Details:", error);
            const msg = error.code === 'auth/email-already-in-use' ? "Is mobile number se account pehle se hai." : `Registration fail ho gaya. (Error: ${error.code})`;
            showErrorMessage(errorMsgElement, msg);
        }
    });
}

function toggleView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId)?.classList.add('active');
}
function showErrorMessage(element, message) { element.textContent = message; element.style.display = 'block'; }
function hideErrorMessage(element) { element.style.display = 'none'; }
function generateReferralId() { const randomPart1 = Math.floor(100 + Math.random() * 900); const randomPart2 = Math.floor(1000 + Math.random() * 9000); return `RMZC${randomPart1}B${randomPart2}`; }

// --- Start the application ---
document.addEventListener('DOMContentLoaded', initializeFirebaseApp);

