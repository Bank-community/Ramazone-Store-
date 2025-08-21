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
let currentUser = null;

onAuthStateChanged(auth, user => {
    if (user) {
        currentUser = user;
        buildNetworkTree(user.uid, container, 1);
    } else {
        loader.textContent = 'Please login to see your network.';
    }
});

async function buildNetworkTree(userId, parentElement, level) {
    if (level > 5) return;

    const referrals = await getDirectReferrals(userId);
    if (level === 1) loader.style.display = 'none';

    if (referrals.length === 0) {
        if (level === 1) {
            parentElement.innerHTML = '<p>You have no members in your network yet.</p>';
        }
        return;
    }

    for (const member of referrals) {
        const commissionFromThisMember = await calculateCommissionFromMember(currentUser.uid, member.name);

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
        subLevelContainer.className = 'level';
        subLevelContainer.style.display = 'none';

        node.addEventListener('click', () => {
             if (subLevelContainer.innerHTML === '') {
                buildNetworkTree(member.uid, subLevelContainer, level + 1);
             }
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
    if (!referralId) return [];

    const q = query(collection(db, 'users'), where('referredBy', '==', referralId));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
}

async function calculateCommissionFromMember(currentUserId, downlineMemberName) {
    let totalCommission = 0;
    const q = query(
        collection(db, 'transactions'),
        where('involvedUsers', 'array-contains', currentUserId),
        where('type', '==', 'commission'),
        where('description', 'includes', downlineMemberName) // More efficient query
    );
    
    try {
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
            totalCommission += doc.data().amount;
        });
    } catch(e) {
        // Firestore doesn't support 'includes' or 'contains' for queries.
        // We have to fetch all commissions and filter client-side.
        const allCommissionsQuery = query(
            collection(db, 'transactions'),
            where('involvedUsers', 'array-contains', currentUserId),
            where('type', '==', 'commission')
        );
        const allSnapshot = await getDocs(allCommissionsQuery);
        allSnapshot.forEach(doc => {
            if (doc.data().description.includes(downlineMemberName)) {
                totalCommission += doc.data().amount;
            }
        });
    }
    
    return totalCommission;
}

