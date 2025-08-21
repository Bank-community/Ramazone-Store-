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
const networkTreeContainer = document.getElementById('network-tree');
const uplineListContainer = document.getElementById('upline-list');
const downlineLoader = document.getElementById('downline-loader');
const uplineLoader = document.getElementById('upline-loader');
let currentUser = null;
let currentUserData = null;

// --- Authentication ---
onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
        }
        // Load downline by default
        loadDownline();
    } else {
        downlineLoader.innerHTML = 'Please login to see your network.';
        uplineLoader.style.display = 'none';
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
    uplineLoader.style.display = 'block';
    const uplineUIDs = currentUserData.upline || [];
    if (uplineUIDs.length === 0) {
        uplineListContainer.innerHTML = '<div class="empty-state">You do not have an upline.</div>';
        uplineLoader.style.display = 'none';
        return;
    }

    uplineListContainer.innerHTML = ''; // Clear for content
    for (let i = 0; i < uplineUIDs.length; i++) {
        const uplineId = uplineUIDs[i];
        const uplineDoc = await getDoc(doc(db, 'users', uplineId));
        if (uplineDoc.exists()) {
            const uplineData = uplineDoc.data();
            // NEW: Calculate commission paid to this upline member
            const commissionPaid = await calculateCommissionPaidToUpline(uplineId);
            const node = createMemberNode({
                name: uplineData.name,
                level: i + 1,
                amount: commissionPaid,
                type: 'upline'
            });
            uplineListContainer.appendChild(node);
        }
    }
    uplineLoader.style.display = 'none';
}

// --- Downline Logic ---
async function loadDownline() {
    downlineLoader.style.display = 'block';
    networkTreeContainer.innerHTML = '';
    await buildNetworkTree(currentUser.uid, networkTreeContainer, 1);
    downlineLoader.style.display = 'none';
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
            amount: commissionFromThisMember,
            type: 'downline',
            isExpandable: hasSubReferrals
        });
        
        parentElement.appendChild(node);

        if (hasSubReferrals) {
            const subLevelContainer = document.createElement('div');
            subLevelContainer.className = 'level';
            parentElement.appendChild(subLevelContainer);

            node.addEventListener('click', () => {
                node.classList.toggle('expanded');
                subLevelContainer.classList.toggle('expanded');
                if (subLevelContainer.innerHTML === '') { // Load sub-network only once
                    subLevelContainer.innerHTML = `<div id="loader" style="padding: 10px;">Loading...</div>`;
                    buildNetworkTree(member.uid, subLevelContainer, level + 1).then(() => {
                        subLevelContainer.querySelector('#loader').remove();
                    });
                }
            });
        }
    }
}

// --- Helper & Calculation Functions ---
function createMemberNode({ name, level, amount, type, isExpandable = false }) {
    const node = document.createElement('div');
    node.className = 'member-node';
    if (isExpandable) node.classList.add('expandable');

    let amountHTML, levelHTML, avatarColor;

    if (type === 'downline') {
        amountHTML = `<div class="amount income">+ ₹${amount.toFixed(2)}</div><div class="label">Total Earning</div>`;
        levelHTML = `<div class="member-level"><span>🏅</span> Level ${level}</div>`;
        avatarColor = `var(--brand-red)`;
    } else { // upline
        amountHTML = `<div class="amount expense">- ₹${amount.toFixed(2)}</div><div class="label">Commission Paid</div>`;
        levelHTML = `<div class="member-level"><span>🔼</span> Level ${level} Upline</div>`;
        avatarColor = `#3498db`;
    }

    const expandIconHTML = isExpandable ? `<div class="expand-icon">›</div>` : '';

    node.innerHTML = `
        <div class="member-header">
            <div class="member-info">
                <div class="member-avatar" style="background-color: ${avatarColor};">${name.charAt(0).toUpperCase()}</div>
                <div class="member-details">
                    <div class="member-name">${name}</div>
                    ${levelHTML}
                </div>
            </div>
            <div class="member-stats">${amountHTML}</div>
            ${expandIconHTML}
        </div>
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
            where('type', '==', 'commission'),
            where('description', '>', `Commission from ${downlineMemberName}`),
            where('description', '<', `Commission from ${downlineMemberName}~`)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            totalCommission += doc.data().amount;
        });
    } catch (error) {
        console.error("Error calculating commission from member:", error);
    }
    return totalCommission;
}

// NEW FUNCTION to calculate commission paid to upline
async function calculateCommissionPaidToUpline(uplineMemberId) {
    let totalCommission = 0;
    if (!currentUserData || !currentUserData.name) return 0;

    try {
        const q = query(
            collection(db, 'transactions'),
            where('involvedUsers', 'array-contains', uplineMemberId),
            where('type', '==', 'commission'),
            where('description', '>', `Commission from ${currentUserData.name}`),
            where('description', '<', `Commission from ${currentUserData.name}~`)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            totalCommission += doc.data().amount;
        });
    } catch (error) {
        console.error("Error calculating commission paid to upline:", error);
    }
    return totalCommission;
}

