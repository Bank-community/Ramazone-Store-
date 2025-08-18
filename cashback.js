import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

// --- Constants and Global Variables ---
const MASTER_REFERRAL_ID = "RMZC000B001";
let auth, database;

// --- CORE INITIALIZATION ---
function initializeFirebaseApp() {
    try {
        // >>> APNI API KEYS YAHAN PASTE KAREIN <<<
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

        if (firebaseConfig.apiKey.startsWith("AIzaSyXXX")) {
            throw new Error("Firebase config keys are placeholders. Please replace them with your actual keys.");
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

// --- All other functions (Authentication, UI, etc.) ---

function setupApplication() {
    document.getElementById('show-register-link').addEventListener('click', e => {
        e.preventDefault();
        toggleView('registration-view');
    });
    
    document.getElementById('show-login-link').addEventListener('click', e => {
        e.preventDefault();
        toggleView('login-view');
    });

    setupAuthentication();
}

function setupAuthentication() {
    onAuthStateChanged(auth, user => {
        if (user) {
            toggleView('dashboard-view');
        } else {
            toggleView('login-view');
        }
    });

    document.getElementById('login-form').addEventListener('submit', e => {
        e.preventDefault();
        const mobile = document.getElementById('login-mobile').value;
        const password = document.getElementById('login-password').value;
        signInWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password)
            .catch((error) => {
                showErrorMessage(document.getElementById('login-error-msg'), "Galat mobile number ya password.");
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
            // >>> TEMPORARY CHANGE: Skipping the referral check <<<
            // Hum referral check ko baad mein theek karenge. Abhi direct account banate hain.
            
            const userCredential = await createUserWithEmailAndPassword(auth, `${mobile}@ramazone.com`, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: name });

            const newUserReferralId = generateReferralId();
            // Hum abhi referredBy ko 'master' set kar rahe hain testing ke liye
            await set(ref(database, 'users/' + user.uid), {
                uid: user.uid, name, mobile, wallet: 0, lifetimeEarning: 0, dueAmount: 0,
                profilePictureUrl: '', referralId: newUserReferralId, referredBy: 'master',
                createdAt: new Date().toISOString()
            });

            alert("Registration safal hua! Ab aap login kar sakte hain.");
            toggleView('login-view');
            document.getElementById('register-form').reset();

        } catch (error) {
            // Is baar humein asli error message milega
            console.error("Registration Error Details:", error);
            const msg = error.code === 'auth/email-already-in-use' 
                ? "Is mobile number se account pehle se hai." 
                : `Registration fail ho gaya. (Error: ${error.message})`; // Using error.message
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

