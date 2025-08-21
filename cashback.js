import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, query, where, getDocs, writeBatch, serverTimestamp, orderBy, limit, runTransaction, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = { /* ... your config ... */ };

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Global Variables ---
let currentUserData = null;
let activeListeners = [];
let scannerAnimation = null;
let allTransactions = [];
let cashbackRequests = [];
let userCoupons = [];
let activeFilter = 'all';
let pendingAction = null;
let successPopupTimeout = null;

// --- All previous functions (showToast, toggleView, etc.) are here ---
// ...

// --- UI Update Functions ---
function updateDashboardUI(dbData, authUser) {
    // ... (same as before)
}

function combineAndRenderHistory() {
    const formattedTransactions = allTransactions.map(t => ({ ...t, date: t.timestamp?.toDate(), isTransaction: true }));
    const formattedRequests = cashbackRequests
        .filter(r => r.status === 'pending' || r.status === 'rejected')
        .map(r => ({ ...r, description: `Request for ${r.productName}`, date: r.requestDate?.toDate(), type: 'cashback', isTransaction: false }));
    
    const combined = [...formattedTransactions, ...formattedRequests].sort((a, b) => (b.date || 0) - (a.date || 0));
    renderUnifiedHistory(combined);
}

// UPDATED: Now calculates and displays total for the filtered view
function renderUnifiedHistory(items) {
    const listEl = document.getElementById('unified-history-list');
    const totalBox = document.getElementById('transaction-total-box');
    listEl.innerHTML = '';
    
    const filtered = items.filter(item => {
        if (activeFilter === 'all') return true;
        return item.type === activeFilter;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><h4>No Transactions</h4></div>`;
        totalBox.textContent = '₹0.00';
        return;
    }

    let totalAmount = 0;
    filtered.forEach(item => {
        const amount = item.amount || item.cashbackAmount || 0;
        // We only sum up completed transactions for the total
        if (item.status !== 'pending' && item.status !== 'rejected') {
            totalAmount += amount;
        }
        // ... (rest of the rendering logic is the same)
        const itemDiv = document.createElement('div');
        itemDiv.className = 'history-item';
        let sign = amount >= 0 ? '+' : '-';
        let typeClass = amount >= 0 ? 'credit' : 'debit';
        if(item.type === 'due_payment') { typeClass = 'debit'; sign = ''; }
        if (item.status === 'rejected' || item.status === 'refunded') { typeClass = 'rejected'; }
        itemDiv.innerHTML = `...`; // same as before
        listEl.appendChild(itemDiv);
    });

    totalBox.textContent = `₹${totalAmount.toFixed(2)}`;
}

// --- All other functions (renderCoupons, handlePayment, etc.) are here ---
// ...

// --- Main Event Listener Setup ---
document.addEventListener('DOMContentLoaded', () => {
    // --- NEW: Menu Logic ---
    const menuBtn = document.getElementById('menu-btn');
    const sideMenu = document.getElementById('side-menu');
    const menuOverlay = document.getElementById('side-menu-overlay');

    const openMenu = () => {
        sideMenu.classList.add('active');
        menuOverlay.classList.add('active');
    };
    const closeMenu = () => {
        sideMenu.classList.remove('active');
        menuOverlay.classList.remove('active');
    };

    menuBtn.addEventListener('click', openMenu);
    menuOverlay.addEventListener('click', closeMenu);

    document.querySelectorAll('.menu-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const action = e.currentTarget.dataset.action;
            switch(action) {
                case 'cashback': openModal('cashback-modal'); break;
                case 'scan': openModal('scan-pay-modal'); startScanner(); break;
                case 'claim': openModal('claim-modal'); break;
                case 'coupons': openModal('coupons-modal'); break;
                case 'profile': openModal('profile-modal'); break;
            }
            closeMenu();
        });
    });

    // --- All other event listeners (login, register, etc.) are here ---
    // ...
    document.getElementById('filter-bar').addEventListener('click', e => {
        const target = e.target.closest('.filter-btn');
        if (!target) return;
        document.querySelector('#filter-bar .active')?.classList.remove('active');
        target.classList.add('active');
        activeFilter = target.dataset.filter;
        combineAndRenderHistory(); // This will now also update the total
    });
    // ...
});

// --- All remaining functions (startScanner, handleShare, etc.) are here ---
// ...

