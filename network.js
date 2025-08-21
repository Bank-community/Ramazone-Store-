import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCmgMr4cj7ec1B09eu3xpRhCwsVCeQR9v0",
    authDomain: "tipsplit-e3wes.firebaseapp.com",
    projectId: "tipsplit-e3wes",
    storageBucket: "tipsplit-e3wes.appspot.com",
    appId: "1:984733883633:web:adc1e1d22b629a6b631d50"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const container = document.getElementById('network-container');
const loader = document.getElementById('loader');

onAuthStateChanged(auth, user => {
    if (user) {
        buildNetworkTree(user.uid, container, 1);
    } else {
        loader.textContent = 'Please login to see your network.';
    }
});

async function buildNetworkTree(userId, parentElement, level) {
    if (level > 5) return; // We only go 5 levels deep

    const referrals = await getDirectReferrals(userId);
    if (level === 1) loader.style.display = 'none';

    if (referrals.length === 0) {
        if (level === 1) {
            parentElement.innerHTML = '<p>You have no members in your network yet.</p>';
        }
        return;
    }

    const levelContainer = document.createElement('div');
    levelContainer.className = 'level';

    for (const member of referrals) {
        const commissionFromThisMember = await calculateCommissionFromMember(auth.currentUser.uid, member.uid);

        const node = document.createElement('div');
        node.className = 'member-node';
        node.innerHTML = `
            <div class="member-info">
                <div class="member-avatar">${member.name.charAt(0)}</div>
                <div class="member-details">
                    <div class="member-name">${member.name} (Level ${level})</div>
                </div>
            </div>
            <div class="member-stats">
                <div class="commission">+ ₹${commissionFromThisMember.toFixed(2)}</div>
            </div>
        `;
        
        const subLevelContainer = document.createElement('div');
        subLevelContainer.style.display = 'none'; // Initially hidden

        node.addEventListener('click', () => {
             if (subLevelContainer.innerHTML === '') { // Load sub-network only once
                buildNetworkTree(member.uid, subLevelContainer, level + 1);
             }
             // Toggle visibility
             subLevelContainer.style.display = subLevelContainer.style.display === 'none' ? 'block' : 'none';
        });

        parentElement.appendChild(node);
        parentElement.appendChild(subLevelContainer);
    }
}

async function getDirectReferrals(userId) {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return [];
    
    const referralId = userDoc.data().referralId;
    const q = query(collection(db, 'users'), where('referredBy', '==', referralId));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
}

async function calculateCommissionFromMember(currentUserId, downlineMemberId) {
    let totalCommission = 0;
    const q = query(
        collection(db, 'transactions'),
        where('involvedUsers', 'array-contains', currentUserId),
        where('type', '==', 'commission')
    );
    const snapshot = await getDocs(q);

    for (const doc of snapshot.docs) {
        const transaction = doc.data();
        // This is a simplified logic. A more robust way would be to store the source of commission.
        // For now, we assume the description contains the name of the original user.
        const downlineMemberDoc = await getDoc(doc(db, 'users', downlineMemberId));
        if (downlineMemberDoc.exists() && transaction.description.includes(downlineMemberDoc.data().name)) {
            totalCommission += transaction.amount;
        }
    }
    return totalCommission;
}

