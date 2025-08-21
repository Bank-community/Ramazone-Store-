import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.appspot.com",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM Elements ---
const loader = document.getElementById('loader');
const networkTreeContainer = document.getElementById('network-tree');
const uplineListContainer = document.getElementById('upline-list');
let currentUser = null;

// --- Authentication ---
onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        // Load downline by default
        loadDownline();
    } else {
        loader.innerHTML = 'Please login to see your network.';
    }
});

// --- Tab Switching Logic ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.tab-btn.active').classList.remove('active');
        btn.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${btn.dataset.tab}-content`).classList.add('active');

        if (btn.dataset.tab === 'upline' && uplineListContainer.innerHTML === '') {
            loadUpline();
        }
    });
});

// --- Upline Logic ---
async function loadUpline() {
    uplineListContainer.innerHTML = '<div id="loader">Loading your upline...</div>';
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if (!userDoc.exists()) {
        uplineListContainer.innerHTML = '<div class="empty-state">Could not find user data.</div>';
        return;
    }

    const uplineUIDs = userDoc.data().upline || [];
    if (uplineUIDs.length === 0) {
        uplineListContainer.innerHTML = '<div class="empty-state">You do not have an upline.</div>';
        return;
    }

    uplineListContainer.innerHTML = ''; // Clear loader
    for (let i = 0; i < uplineUIDs.length; i++) {
        const uplineId = uplineUIDs[i];
        const uplineDoc = await getDoc(doc(db, 'users', uplineId));
        if (uplineDoc.exists()) {
            const uplineData = uplineDoc.data();
            const node = createMemberNode({
                name: uplineData.name,
                level: i + 1,
                commission: null, // We don't show commission for upline
                isExpandable: false
            });
            uplineListContainer.appendChild(node);
        }
    }
}

// --- Downline Logic ---
async function loadDownline() {
    loader.style.display = 'block';
    networkTreeContainer.innerHTML = '';
    await buildNetworkTree(currentUser.uid, networkTreeContainer, 1);
    loader.style.display = 'none';
    if (networkTreeContainer.innerHTML === '') {
        networkTreeContainer.innerHTML = '<div class="empty-state">You have no members in your network yet.</div>';
    }
}

async function buildNetworkTree(userId, parentElement, level) {
    if (level > 5) return; // Max 5 levels

    const referrals = await getDirectReferrals(userId);
    if (referrals.length === 0) return;

    for (const member of referrals) {
        const commissionFromThisMember = await calculateCommissionFromMember(currentUser.uid, member.name);
        const hasSubReferrals = await checkSubReferrals(member.uid);

        const node = createMemberNode({
            name: member.name,
            level: level,
            commission: commissionFromThisMember,
            isExpandable: hasSubReferrals
        });
        
        parentElement.appendChild(node);

        if (hasSubReferrals) {
            const subLevelContainer = document.createElement('div');
            subLevelContainer.className = 'level';
            subLevelContainer.style.display = 'none'; // Initially hidden
            parentElement.appendChild(subLevelContainer);

            node.addEventListener('click', () => {
                node.classList.toggle('expanded');
                if (subLevelContainer.innerHTML === '') { // Load sub-network only once
                    buildNetworkTree(member.uid, subLevelContainer, level + 1);
                }
                subLevelContainer.style.display = subLevelContainer.style.display === 'none' ? 'block' : 'none';
            });
        }
    }
}

// --- Helper Functions ---
function createMemberNode({ name, level, commission, isExpandable }) {
    const node = document.createElement('div');
    node.className = 'member-node';
    if (isExpandable) {
        node.classList.add('expandable');
    }

    const commissionHTML = commission !== null ? `<div class="commission">+ ₹${commission.toFixed(2)}</div>` : '';

    node.innerHTML = `
        <div class="member-info">
            <div class="member-avatar">${name.charAt(0).toUpperCase()}</div>
            <div class="member-details">
                <div class="member-name">${name}</div>
                <div class="member-level">Level ${level}</div>
            </div>
        </div>
        <div class="member-stats">${commissionHTML}</div>
    `;
    return node;
}

async function getDirectReferrals(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) return [];
        
        const referralId = userDoc.data().referralId;
        if (!referralId) return [];

        const q = query(collection(db, 'users'), where('referredBy', '==', referralId));
        const snapshot = await getDocs(q);
        
        return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error getting direct referrals:", error);
        return [];
    }
}

async function checkSubReferrals(userId) {
    const referrals = await getDirectReferrals(userId);
    return referrals.length > 0;
}

async function calculateCommissionFromMember(currentUserId, downlineMemberName) {
    let totalCommission = 0;
    try {
        const q = query(
            collection(db, 'transactions'),
            where('involvedUsers', 'array-contains', currentUserId),
            where('type', '==', 'commission')
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            if (doc.data().description.includes(downlineMemberName)) {
                totalCommission += doc.data().amount;
            }
        });
    } catch (error) {
        console.error("Error calculating commission:", error);
    }
    return totalCommission;
}

