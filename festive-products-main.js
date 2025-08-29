// This script is specifically for the festive-products.html page

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    try {
        // Fetch Firebase config from the backend
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Failed to get Firebase config');

        const firebaseConfig = await response.json();
        if (firebaseConfig.apiKey) {
            firebase.initializeApp(firebaseConfig);
            loadFestiveProducts();
        } else {
            throw new Error('Invalid Firebase config');
        }
    } catch (error) {
        console.error("Initialization failed:", error);
        displayError('Could not load products. Please try again.');
    }
}

function loadFestiveProducts() {
    const db = firebase.database();
    const festiveRef = db.ref('ramazone/homepage/festiveCollection');
    const productsRef = db.ref('ramazone/products');

    festiveRef.once('value').then(snapshot => {
        const collectionData = snapshot.val();
        if (!collectionData || !collectionData.productIds) {
            displayError('No festive products found.');
            return;
        }

        // Set the page title dynamically
        const pageTitle = document.getElementById('page-title');
        if (pageTitle && collectionData.title) {
            pageTitle.textContent = collectionData.title;
        }

        // Fetch all products to find the ones in the festive list
        productsRef.once('value').then(productsSnapshot => {
            const allProducts = Array.isArray(productsSnapshot.val()) 
                ? productsSnapshot.val() 
                : Object.values(productsSnapshot.val() || {});

            const festiveProducts = collectionData.productIds
                .map(id => allProducts.find(p => p && p.id === id))
                .filter(Boolean); // Filter out any null/undefined products

            renderProducts(festiveProducts);
        });
    }).catch(error => {
        console.error("Failed to load festive collection data:", error);
        displayError('Failed to load festive deals.');
    });
}

function renderProducts(products) {
    const grid = document.getElementById('product-grid');
    const loader = document.getElementById('loader');

    if (loader) loader.style.display = 'none';

    if (!products.length) {
        grid.innerHTML = '<p class="col-span-2 text-center text-gray-500 p-8">No products available in this collection.</p>';
        return;
    }

    grid.innerHTML = products.map(createProductTileHTML).join('');
}

// --- CORRECTED AND UPDATED FUNCTION ---
// 1. Boldness reduced from 'font-extrabold' to 'font-bold'.
// 2. Space between title and price removed by removing min-height and margin-top.
// 3. The "..." placeholder is replaced with the actual product name variable.
function createProductTileHTML(prod) {
    if (!prod) return '';

    const imageUrl = (prod.images && prod.images[0]) || 'https://placehold.co/300x300/e2e8f0/64748b?text=Image';

    let priceHTML = `<span class="font-bold text-gray-900">₹${Number(prod.displayPrice).toLocaleString("en-IN")}</span>`;
    let originalPriceHTML = '';
    let discountHTML = '';

    if (prod.originalPrice && Number(prod.originalPrice) > Number(prod.displayPrice)) {
        const discount = Math.round(((prod.originalPrice - prod.displayPrice) / prod.originalPrice) * 100);
        originalPriceHTML = `<span class="line-through text-gray-400 text-xs">₹${Number(prod.originalPrice).toLocaleString("en-IN")}</span>`;
        if (discount > 0) {
            discountHTML = `<span class="text-green-700 font-bold text-xs">↓${discount}%</span>`;
        }
    }

    // Title logic updated to remove extra space and reduce boldness
    const titleHTML = `
        <div>
             <h2 class="font-bold text-lg leading-5 truncate">${prod.brand || prod.name}</h2>
             ${prod.brand ? `<p class="text-gray-500 text-sm truncate max-w-full">${prod.name}</p>` : ''}
        </div>
    `;

    // Price paragraph's top margin (mt-2) is removed
    return `
        <a href="./product-details.html?id=${prod.id}" class="product-tile block border-b border-r border-gray-200">
            <img src="${imageUrl}" alt="${prod.name}" class="w-full h-auto object-contain aspect-square" loading="lazy">
            <div class="p-3">
                ${titleHTML}
                <p class="flex items-baseline flex-wrap gap-x-2">
                    ${discountHTML}
                    ${originalPriceHTML}
                    ${priceHTML}
                </p>
            </div>
        </a>
    `;
}

function displayError(message) {
    const grid = document.getElementById('product-grid');
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    if (grid) grid.innerHTML = `<p class="col-span-2 text-center text-red-500 p-8">${message}</p>`;
}