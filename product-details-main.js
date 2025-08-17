                                  // --- GLOBAL STATE ---
                                  let mediaItems = [], currentMediaIndex = 0, currentProductData = null, currentProductId = null;
                                  let allProductsCache = [];
                                  let selectedVariants = {};
                                  let selectedPack = null; // NEW: To track selected pack
                                  let appThemeColor = '#4F46E5';
                                  let database;

                                  // --- DOM ELEMENTS ---
                                  let slider, sliderWrapper;

                                  // --- SLIDER STATE ---
                                  let isDragging = false, startPos = 0, currentTranslate = 0, prevTranslate = 0, animationID;

                                  // --- CART FUNCTIONS (NOW AWARE OF VARIANTS AND PACKS) ---
                                  const getCart = () => { try { const cart = localStorage.getItem('ramazoneCart'); return cart ? JSON.parse(cart) : []; } catch (e) { return []; } };
                                  const saveCart = (cart) => { localStorage.setItem('ramazoneCart', JSON.stringify(cart)); };

                                  const variantsMatch = (v1, v2) => {
                                      const keys1 = Object.keys(v1 || {});
                                      const keys2 = Object.keys(v2 || {});
                                      if (keys1.length !== keys2.length) return false;
                                      for (let key of keys1) {
                                          if (v1[key] !== v2[key]) return false;
                                      }
                                      return true;
                                  };

                                  const packsMatch = (p1, p2) => {
                                      if (!p1 && !p2) return true; // Both are null/undefined (single item)
                                      if (!p1 || !p2) return false; // One is a pack, the other is not
                                      return p1.name === p2.name; // Compare by pack name
                                  };

                                  const getCartItem = (productId, variants, pack) => {
                                      const cart = getCart();
                                      return cart.find(item => item.id === productId && variantsMatch(item.variants, variants) && packsMatch(item.pack, pack));
                                  };

                                  function addToCart(productId, quantity, variants, pack, showToastMsg = true) {
                                      const cart = getCart();
                                      const product = allProductsCache.find(p => p && p.id === productId);
                                      if (!product) return;

                                      let existingItemIndex = cart.findIndex(item => item.id === productId && variantsMatch(item.variants, variants) && packsMatch(item.pack, pack));

                                      if (existingItemIndex > -1) {
                                          cart[existingItemIndex].quantity += quantity;
                                      } else {
                                          cart.push({ id: productId, quantity: quantity, variants: variants || {}, pack: pack || null });
                                      }
                                      saveCart(cart);
                                      if(showToastMsg) showToast(`${product.name} ${pack ? `(${pack.name})` : ''} added to cart!`, 'success');
                                      updateCartIcon();
                                      if (productId === currentProductId) {
                                          updateStickyActionBar();
                                      }
                                  }

                                  function updateCartItemQuantity(productId, newQuantity, variants, pack) {
                                      let cart = getCart();
                                      const itemIndex = cart.findIndex(item => item.id === productId && variantsMatch(item.variants, variants) && packsMatch(item.pack, pack));

                                      if (itemIndex > -1) {
                                          if (newQuantity > 0) {
                                              cart[itemIndex].quantity = newQuantity;
                                          } else {
                                              cart.splice(itemIndex, 1);
                                          }
                                          saveCart(cart);
                                          updateCartIcon();
                                          updateStickyActionBar();
                                      }
                                  }

                                  const getTotalCartQuantity = () => { const cart = getCart(); return cart.reduce((total, item) => total + item.quantity, 0); };

                                  function updateCartIcon() {
                                      const totalQuantity = getTotalCartQuantity();
                                      const cartCountElement = document.getElementById('cart-item-count');
                                      if (cartCountElement) {
                                          cartCountElement.textContent = totalQuantity > 0 ? totalQuantity : '';
                                      }
                                  }

                                  function updateStickyActionBar() {
                                      if (!currentProductId) return;
                                      const cartItem = getCartItem(currentProductId, selectedVariants, selectedPack);

                                      const qtyWrapper = document.getElementById('quantity-selector-wrapper');
                                      const qtyDisplay = document.getElementById('quantity-display');
                                      const decreaseBtn = document.getElementById('decrease-quantity');
                                      const addToCartBtn = document.getElementById('add-to-cart-btn');
                                      const goToCartBtn = document.getElementById('go-to-cart-btn');
                                      const mainActionContainer = document.getElementById('main-action-container');

                                      if (cartItem) {
                                          qtyDisplay.textContent = cartItem.quantity;
                                          decreaseBtn.disabled = cartItem.quantity <= 1;
                                          qtyWrapper.classList.remove('hidden');
                                          mainActionContainer.classList.remove('col-start-1', 'col-span-2');
                                          mainActionContainer.classList.add('col-start-2');
                                          addToCartBtn.classList.add('hidden');
                                          goToCartBtn.classList.remove('hidden');
                                      } else {
                                          qtyWrapper.classList.add('hidden');
                                          mainActionContainer.classList.add('col-start-1', 'col-span-2');
                                          mainActionContainer.classList.remove('col-start-2');
                                          addToCartBtn.classList.remove('hidden');
                                          goToCartBtn.classList.add('hidden');
                                      }
                                  }


                                  // --- INITIALIZATION ---
                                  document.addEventListener('DOMContentLoaded', initializeApp);

                                  async function initializeApp() {
                                      try {
                                          const response = await fetch('/api/firebase-config');
                                          if (!response.ok) throw new Error(`Server Error: ${response.status}`);
                                          const firebaseConfig = await response.json();
                                          if (firebaseConfig.apiKey) {
                                              firebase.initializeApp(firebaseConfig);
                                              database = firebase.database();
                                              await fetchAllData();
                                              fetchProductData();
                                          } else {
                                              throw new Error("Firebase config invalid.");
                                          }
                                      } catch (error) {
                                          console.error("Initialization Failed:", error);
                                          document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Could not initialize.</p>';
                                      }
                                  }

                                  async function fetchAllData() {
                                      const snapshot = await database.ref('ramazone').get();
                                      if (snapshot.exists()) {
                                          const data = snapshot.val();
                                          appThemeColor = data.config?.themeColor || '#4F46E5';
                                          document.documentElement.style.setProperty('--primary-color', appThemeColor);
                                          allProductsCache = Object.values(data.products || {});
                                      }
                                  }

                                  function fetchProductData() {
                                      currentProductId = new URLSearchParams(window.location.search).get('id')?.trim();
                                      if (!currentProductId) {
                                          document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product ID not found.</p>';
                                          return;
                                      }
                                      const product = allProductsCache.find(p => p && p.id == currentProductId);
                                      if (product) {
                                          currentProductData = product;
                                          loadPageSectionsAndData(product);
                                      } else {
                                          document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500 font-bold">Product not found.</p>';
                                      }
                                  }

                                  async function loadPageSectionsAndData(data) {
                                      try {
                                          const [mediaHtml, infoHtml, similarHtml] = await Promise.all([
                                              fetch('product-details-sections/media-gallery.html').then(res => res.text()),
                                              fetch('product-details-sections/product-main-info.html').then(res => res.text()),
                                              fetch('product-details-sections/similar-products.html').then(res => res.text())
                                          ]);

                                          document.getElementById('media-gallery-container').innerHTML = mediaHtml;
                                          document.getElementById('product-main-info-container').innerHTML = infoHtml;
                                          document.getElementById('similar-products-container-wrapper').innerHTML = similarHtml;

                                          populateDataAndAttachListeners(data);

                                          document.getElementById('loading-indicator').style.display = 'none';
                                          document.getElementById('product-content').style.display = 'block';

                                      } catch (error) {
                                          console.error("Error loading page sections:", error);
                                          document.getElementById('loading-indicator').innerHTML = '<p class="text-red-500">Could not load sections.</p>';
                                      }
                                  }

                                  function populateDataAndAttachListeners(data) {
                                      document.title = `${data.name || "Product"} - Ramazone`;
                                      document.querySelector('meta[property="og:title"]').setAttribute("content", data.name);
                                      document.querySelector('meta[property="og:image"]').setAttribute("content", data.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png");
                                      document.getElementById("product-title").textContent = data.name;

                                      slider = document.getElementById('media-slider');
                                      sliderWrapper = document.getElementById('main-media-wrapper');
                                      mediaItems = (data.images?.map(src => ({ type: "image", src })) || []).concat(data.videoUrl ? [{ type: "video", src: data.videoUrl, thumbnail: data.images?.[0] }] : []);
                                      renderMediaGallery();
                                      showMedia(0);
                                      setupSliderControls();
                                      setupImageModal();

                                      if (data.rating && data.reviewCount) {
                                          document.getElementById("rating-section").style.display = "flex";
                                          renderStars(data.rating, document.getElementById("product-rating-stars"));
                                          document.getElementById("product-review-count").textContent = `(${data.reviewCount} reviews)`;
                                      }
                                      if (data.sellerName) {
                                          document.getElementById("seller-info").textContent = `Seller by: ${data.sellerName}`;
                                          document.getElementById("seller-info").style.display = "block";
                                      }

                                      updatePriceDisplay();
                                      renderProductOptions(data); 
                                      setupVariantModal();
                                      setupBundleModal();

                                      renderAdvancedHighlights(data.specHighlights);
                                      renderDescription(data);
                                      setupActionControls();

                                      updateRecentlyViewed(data.id);
                                      loadHandpickedSimilarProducts(data.similarProductIds);
                                      loadCategoryBasedProducts(data.category);
                                      loadOtherProducts(data.category);

                                      updateCartIcon();
                                      updateStickyActionBar();

                                      document.getElementById('similar-products-container-wrapper').addEventListener('click', handleQuickAdd);
                                      document.getElementById('options-container').addEventListener('click', handleOptionsClick);
                                  }

                                  function handleOptionsClick(event) {
                                      const bundleCard = event.target.closest('.product-bundle-card');
                                      const bundleAddBtn = event.target.closest('.quick-add-btn[data-bundle="true"]');

                                      if (bundleAddBtn) {
                                          event.preventDefault();
                                          const { current, linked } = bundleAddBtn.dataset;
                                          addToCart(current, 1, {}, null, false);
                                          addToCart(linked, 1, {}, null, false);
                                          showToast('Bundle added to cart!', 'success');
                                          return;
                                      }

                                      if (bundleCard) {
                                          event.preventDefault();
                                          const { current, linked, price } = bundleCard.dataset;
                                          openBundleModal(current, linked, price);
                                      }
                                  }

                                  function renderProductOptions(data) {
                                      const container = document.getElementById('options-container');
                                      if (!container) return;
                                      container.innerHTML = '';
                                      selectedVariants = {};
                                      selectedPack = null; // Reset pack selection

                                      if (data.variants && Array.isArray(data.variants)) {
                                          data.variants.forEach(variant => {
                                              if (variant.options && variant.options.length > 0) {
                                                  selectedVariants[variant.type] = variant.options[0].name;
                                                  const variantButtonHTML = createVariantButton(variant);
                                                  container.insertAdjacentHTML('beforeend', variantButtonHTML);
                                              }
                                          });
                                      }

                                      if (data.combos && data.combos.quantityPacks && Array.isArray(data.combos.quantityPacks)) {
                                          const packs = data.combos.quantityPacks.map(p => ({ name: p.name, price: p.price }));
                                          // Add a "Single Item" option to allow deselecting a pack
                                          const singleItemOption = { name: 'Single Item', price: data.displayPrice };
                                          const allOptions = [singleItemOption, ...packs];

                                          selectedPack = null; // Default to no pack selected

                                          const optionHTML = createOptionSelector('Available Packs', allOptions, 'quantityPack');
                                          container.insertAdjacentHTML('beforeend', optionHTML);
                                          attachOptionSelectorListeners(container.lastElementChild);
                                      }

                                      if (data.combos && data.combos.productBundle) {
                                          const bundle = data.combos.productBundle;
                                          const linkedProduct = allProductsCache.find(p => p.id === bundle.linkedProductId);
                                          if (linkedProduct) {
                                              const bundleHTML = createProductBundle(data, linkedProduct, bundle.bundlePrice);
                                              container.insertAdjacentHTML('beforeend', bundleHTML);
                                          }
                                      }
                                  }

                                  function createVariantButton(variant) {
                                      const firstOptionName = variant.options[0].name;
                                      return `
                                          <button class="variant-btn" data-variant-type="${variant.type}">
                                              <span>${variant.type}: <span class="value">${firstOptionName}</span></span>
                                              <i class="fas fa-chevron-down text-xs"></i>
                                          </button>
                                      `;
                                  }

                                  function createOptionSelector(type, options, optionType) {
                                      const firstOptionName = options[0].name;
                                      const cardsHTML = options.map((opt, index) => `
                                          <div class="option-card ${index === 0 ? 'selected' : ''}" data-value="${opt.name}" data-price="${opt.price || ''}">
                                              <div class="card-title">${opt.name}</div>
                                              ${opt.price ? `<div class="card-price">₹${opt.price.toLocaleString('en-IN')}</div>` : ''}
                                          </div>
                                      `).join('');

                                      return `
                                          <div class="option-selector-wrapper" data-option-type="${optionType}">
                                              <div class="option-selector">
                                                  <div>
                                                      <span class="option-type">${type}: </span>
                                                      <span class="option-value">${firstOptionName}</span>
                                                  </div>
                                                  <i class="fas fa-chevron-down arrow-icon"></i>
                                              </div>
                                              <div class="option-panel">
                                                  <div class="option-cards-wrapper">${cardsHTML}</div>
                                              </div>
                                          </div>
                                      `;
                                  }

                                  function createProductBundle(currentProduct, linkedProduct, bundlePrice) {
                                      return `
                                          <div class="mt-4">
                                              <h3 class="text-md font-bold text-gray-800 mb-2">Frequently Bought Together</h3>
                                              <div class="product-bundle-card" data-current="${currentProduct.id}" data-linked="${linkedProduct.id}" data-price="${bundlePrice}">
                                                  <div class="bundle-images">
                                                      <img src="${currentProduct.images[0]}" alt="${currentProduct.name}">
                                                      <img src="${linkedProduct.images[0]}" alt="${linkedProduct.name}">
                                                  </div>
                                                  <div class="bundle-info flex-grow">
                                                      <p class="text-sm text-gray-600">${currentProduct.name} + ${linkedProduct.name}</p>
                                                      <p class="bundle-price">₹${bundlePrice.toLocaleString('en-IN')}</p>
                                                  </div>
                                                  <button class="quick-add-btn" data-bundle="true" data-current="${currentProduct.id}" data-linked="${linkedProduct.id}" style="position: static; transform: none;">+</button>
                                              </div>
                                          </div>
                                      `;
                                  }

                                  function attachOptionSelectorListeners(wrapper) {
                                      const selector = wrapper.querySelector('.option-selector');
                                      const panel = wrapper.querySelector('.option-panel');
                                      const valueEl = wrapper.querySelector('.option-value');
                                      const optionType = wrapper.dataset.optionType;

                                      selector.addEventListener('click', () => {
                                          selector.classList.toggle('active');
                                          panel.classList.toggle('active');
                                      });

                                      const cards = wrapper.querySelectorAll('.option-card');
                                      cards.forEach(card => {
                                          card.addEventListener('click', (e) => {
                                              e.stopPropagation();
                                              cards.forEach(c => c.classList.remove('selected'));
                                              card.classList.add('selected');

                                              const selectedValue = card.dataset.value;
                                              const selectedPrice = card.dataset.price;

                                              valueEl.textContent = selectedValue;

                                              if (optionType === 'quantityPack') {
                                                  if (selectedValue === 'Single Item') {
                                                      selectedPack = null;
                                                  } else {
                                                      selectedPack = { name: selectedValue, price: selectedPrice };
                                                  }
                                                  updatePriceDisplay(selectedPrice); // Update main price
                                                  updateStickyActionBar(); // Reset sticky bar
                                              }

                                              selector.classList.remove('active');
                                              panel.classList.remove('active');
                                          });
                                      });
                                  }

                                  function openBundleModal(currentId, linkedId, bundlePrice) {
                                      const currentProd = allProductsCache.find(p => p.id === currentId);
                                      const linkedProd = allProductsCache.find(p => p.id === linkedId);
                                      if (!currentProd || !linkedProd) return;

                                      const originalTotal = Number(currentProd.displayPrice) + Number(linkedProd.displayPrice);
                                      const savings = originalTotal - bundlePrice;
                                      const discountPercent = Math.round((savings / originalTotal) * 100);

                                      const modalBody = document.getElementById('bundle-modal-body');
                                      modalBody.innerHTML = `
                                          <div class="bundle-modal-products">
                                              <img src="${currentProd.images[0]}" alt="${currentProd.name}">
                                              <span class="plus-icon">+</span>
                                              <img src="${linkedProd.images[0]}" alt="${linkedProd.name}">
                                          </div>
                                          <div class="bundle-modal-details">
                                              <p class="product-names">${currentProd.name} + ${linkedProd.name}</p>
                                              <div class="bundle-price-summary">
                                                  <p class="text-sm text-gray-500">Bundle Price</p>
                                                  <p class="final-price">₹${Number(bundlePrice).toLocaleString('en-IN')}</p>
                                                  <p class="original-price-info">Original Total: <span class="line-through">₹${originalTotal.toLocaleString('en-IN')}</span></p>
                                                  <div class="savings-badge">You save ₹${savings.toLocaleString('en-IN')} (${discountPercent}%) ✨</div>
                                              </div>
                                          </div>
                                      `;

                                      const modalFooter = document.getElementById('bundle-modal-footer');
                                      modalFooter.innerHTML = `<button id="add-bundle-to-cart-btn" class="w-full text-white font-bold py-3 px-4 rounded-xl text-lg" style="background-color: var(--primary-color);">Add Bundle to Cart</button>`;

                                      document.getElementById('add-bundle-to-cart-btn').onclick = () => {
                                          addToCart(currentId, 1, {}, null, false);
                                          addToCart(linkedId, 1, {}, null, false);
                                          showToast('Bundle added to cart!', 'success');
                                          closeBundleModal();
                                      };

                                      const overlay = document.getElementById('bundle-modal-overlay');
                                      overlay.classList.remove('hidden');
                                      setTimeout(() => overlay.classList.add('active'), 10);
                                  }

                                  function closeBundleModal() {
                                      const overlay = document.getElementById('bundle-modal-overlay');
                                      overlay.classList.remove('active');
                                      setTimeout(() => overlay.classList.add('hidden'), 300);
                                  }

                                  function setupBundleModal() {
                                      const overlay = document.getElementById('bundle-modal-overlay');
                                      document.getElementById('bundle-modal-close').addEventListener('click', closeBundleModal);
                                      overlay.addEventListener('click', e => {
                                          if (e.target === overlay) closeBundleModal();
                                      });
                                  }

                                  function handleQuickAdd(event) {
                                      const quickAddButton = event.target.closest('.quick-add-btn');
                                      if (quickAddButton && !quickAddButton.dataset.bundle) {
                                          event.preventDefault();
                                          const productId = quickAddButton.dataset.id;
                                          if (productId) {
                                              addToCart(productId, 1, {}, null);
                                              quickAddButton.innerHTML = '<i class="fas fa-check"></i>';
                                              quickAddButton.classList.add('added');
                                              setTimeout(() => {
                                                  quickAddButton.innerHTML = '+';
                                                  quickAddButton.classList.remove('added');
                                              }, 1500);
                                          }
                                      }
                                  }

                                  function setupActionControls() {
                                      document.getElementById('add-to-cart-btn').addEventListener('click', () => {
                                          addToCart(currentProductId, 1, selectedVariants, selectedPack);
                                      });
                                      document.getElementById('increase-quantity').addEventListener('click', () => {
                                          const item = getCartItem(currentProductId, selectedVariants, selectedPack);
                                          if (item) updateCartItemQuantity(currentProductId, item.quantity + 1, selectedVariants, selectedPack);
                                      });
                                      document.getElementById('decrease-quantity').addEventListener('click', () => {
                                          const item = getCartItem(currentProductId, selectedVariants, selectedPack);
                                          if (item) updateCartItemQuantity(currentProductId, item.quantity - 1, selectedVariants, selectedPack);
                                      });
                                      setupShareButton();
                                  }

                                  function openVariantModal(variantType) {
                                      const variant = currentProductData.variants.find(v => v.type === variantType);
                                      if (!variant) return;
                                      const overlay = document.getElementById("variant-modal-overlay");
                                      const titleEl = document.getElementById("variant-modal-title");
                                      const bodyEl = document.getElementById("variant-modal-body");
                                      titleEl.textContent = `Select ${variant.type}`;
                                      bodyEl.innerHTML = "";
                                      variant.options.forEach(option => {
                                          const isSelected = selectedVariants[variant.type] === option.name;
                                          const optionEl = document.createElement("div");
                                          optionEl.className = `variant-option ${isSelected ? "selected" : ""}`;
                                          let contentHTML = (variant.type.toLowerCase() === 'color' && option.value)
                                              ? `<div class="color-swatch" style="background-color: ${option.value};"></div> <span class="flex-grow">${option.name}</span>`
                                              : `<span>${option.name}</span>`;
                                          optionEl.innerHTML = contentHTML;
                                          optionEl.addEventListener("click", () => {
                                              selectedVariants[variant.type] = option.name;
                                              updateVariantButtonDisplay(variant.type, option.name);
                                              updateStickyActionBar();
                                              closeVariantModal();
                                          });
                                          bodyEl.appendChild(optionEl);
                                      });
                                      overlay.classList.remove("hidden");
                                      setTimeout(() => overlay.classList.add("active"), 10);
                                  }

                                  function closeVariantModal() {
                                      const overlay = document.getElementById("variant-modal-overlay");
                                      overlay.classList.remove("active");
                                      setTimeout(() => overlay.classList.add("hidden"), 300);
                                  }

                                  function updateVariantButtonDisplay(type, value) {
                                      const btn = document.querySelector(`.variant-btn[data-variant-type="${type}"] .value`);
                                      if (btn) btn.textContent = value;
                                  }

                                  function setupVariantModal() {
                                      const overlay = document.getElementById("variant-modal-overlay");
                                      document.getElementById("variant-modal-close").addEventListener("click", closeVariantModal);
                                      overlay.addEventListener("click", e => { if (e.target === overlay) closeVariantModal(); });
                                      document.getElementById('options-container').addEventListener('click', e => {
                                          const btn = e.target.closest('.variant-btn');
                                          if (btn) { openVariantModal(btn.dataset.variantType); }
                                      });
                                  }

                                  function updatePriceDisplay(newPrice) {
                                      const finalPriceEl = document.getElementById("price-final");
                                      const originalPriceEl = document.getElementById("price-original");
                                      const percentageDiscountEl = document.getElementById("price-percentage-discount");

                                      const displayPrice = newPrice ? Number(newPrice) : Number(currentProductData.displayPrice);
                                      const originalPrice = Number(currentProductData.originalPrice);

                                      finalPriceEl.textContent = `₹${displayPrice.toLocaleString("en-IN")}`;

                                      if (originalPrice > displayPrice) {
                                          const discount = Math.round(100 * (originalPrice - displayPrice) / originalPrice);
                                          percentageDiscountEl.innerHTML = `<i class="fas fa-arrow-down mr-1"></i>${discount}%`;
                                          originalPriceEl.textContent = `₹${originalPrice.toLocaleString("en-IN")}`;
                                          percentageDiscountEl.style.display = "flex";
                                          originalPriceEl.style.display = "inline";
                                      } else {
                                          percentageDiscountEl.style.display = "none";
                                          originalPriceEl.style.display = "none";
                                      }
                                  }

                                  // --- UNCHANGED HELPER FUNCTIONS ---
function createHandpickedCard(product) {
    const displayPrice = Number(product.displayPrice);
    const originalPriceNum = Number(product.originalPrice);
    const discount = originalPriceNum > displayPrice ? Math.round(100 * ((originalPriceNum - displayPrice) / originalPriceNum)) : 0;
    const priceHTML = `<div class="mt-2"><p class="text-lg font-bold text-gray-900">₹${displayPrice.toLocaleString("en-IN")}</p>${originalPriceNum > displayPrice ? `<div class="flex items-center gap-2 text-sm mt-1"><span class="text-gray-500 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</span><span class="font-semibold text-green-600">${discount}% OFF</span></div>` : ""}` + "</div>";
    const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : "";

    // UPDATED: Button ab hamesha dikhega, chahe variants ho ya na ho.
    const addButton = `<button class="quick-add-btn" data-id="${product.id}">+</button>`;

    return `<div class="h-full block bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <a href="?id=${product.id}" class="block">
                    <div class="relative">
                        <img src="${product.images?.[0] || 'https://placehold.co/400x400/f0f0f0/333?text=Ramazone'}" class="w-full object-cover aspect-square" alt="${product.name}">
                        ${ratingTag}
                        ${addButton}
                    </div>
                    <div class="p-3">
                        <h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4>
                        ${priceHTML}
                    </div>
                </a>
            </div>`;
}


                                  function createCarouselCard(product) { const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : ""; const originalPriceNum = Number(product.originalPrice); const displayPriceNum = Number(product.displayPrice); const discount = originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0; const addButton = (displayPriceNum < 500 || product.category === 'grocery') && (!product.variants || product.variants.length === 0) ? `<button class="quick-add-btn" data-id="${product.id}">+</button>` : ""; return `<a href="?id=${product.id}" class="carousel-item block bg-white rounded-lg shadow overflow-hidden"><div class="relative"><img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full object-cover aspect-square" alt="${product.name}">${ratingTag}${addButton}</div><div class="p-2"><h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4><div class="flex items-baseline gap-2"><p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}</div>${discount > 0 ? `<p class="text-xs font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}</div></a>`; }
                                  function createGridCard(product) { const ratingTag = product.rating ? `<div class="card-rating-tag">${product.rating} <i class="fas fa-star"></i></div>` : ""; const originalPriceNum = Number(product.originalPrice); const displayPriceNum = Number(product.displayPrice); const discount = originalPriceNum > displayPriceNum ? Math.round(100 * ((originalPriceNum - displayPriceNum) / originalPriceNum)) : 0; const addButton = (displayPriceNum < 500 || product.category === 'grocery') && (!product.variants || product.variants.length === 0) ? `<button class="quick-add-btn" data-id="${product.id}">+</button>` : ""; return `<a href="?id=${product.id}" class="block bg-white rounded-lg shadow overflow-hidden"><div class="relative"><img src="${product.images?.[0] || "https://i.ibb.co/My6h0gdd/20250706-230221.png"}" class="w-full h-auto object-cover aspect-square" alt="${product.name}">${ratingTag}${addButton}</div><div class="p-2 sm:p-3"><h4 class="text-sm font-semibold truncate text-gray-800 mb-1">${product.name}</h4><div class="flex items-baseline gap-2"><p class="text-base font-bold" style="color: var(--primary-color)">₹${displayPriceNum.toLocaleString("en-IN")}</p>${originalPriceNum > displayPriceNum ? `<p class="text-xs text-gray-400 line-through">₹${originalPriceNum.toLocaleString("en-IN")}</p>` : ""}</div>${discount > 0 ? `<p class="text-sm font-semibold text-green-600 mt-1">${discount}% OFF</p>` : ""}</div></a>`; }
                                      function renderDescription(data) {
                                          const descriptionContainer = document.getElementById("product-description");
                                          const descriptionSection = document.getElementById("description-section");
                                          const returnPolicyEl = document.getElementById("return-policy-info");
                                          let hasContent = false;

                                          // Clear previous content
                                          descriptionContainer.innerHTML = "";
                                          returnPolicyEl.style.display = "none";

                                          // 1. UPDATED: Render Product Description with less space
                                          if (data.description && Array.isArray(data.description) && data.description.length > 0) {
                                              // Using a simple list for more compact view
                                              let descriptionHtml = '<ul class="space-y-3 list-inside">'; // Reduced space from space-y-6 to space-y-3
                                              data.description.forEach(block => {
                                                  if (block.details) {
                                                      // Assuming details might contain icons like ✅
                                                      descriptionHtml += `<li class="text-base text-gray-600 leading-relaxed">${block.details}</li>`;
                                                      hasContent = true;
                                                  }
                                              });
                                              descriptionHtml += '</ul>';
                                              descriptionContainer.innerHTML = descriptionHtml;
                                          }

                                          // 2. NEW: Render Dynamic Return Policy
                                          if (data.returnPolicy && data.returnPolicy.type) {
                                              let policyText = '';
                                              switch (data.returnPolicy.type) {
                                                  case 'days': // For "Returnable" type
                                                      policyText = `${data.returnPolicy.value} Days Return Available`;
                                                      break;
                                                  case 'no_return':
                                                      policyText = 'No Return Available';
                                                      break;
                                                  case 'custom':
                                                      policyText = data.returnPolicy.value; // Directly use the custom text
                                                      break;
                                              }

                                              if (policyText) {
                                                  returnPolicyEl.innerHTML = `<i class="fas fa-undo-alt w-5 text-center"></i> <span>${policyText}</span>`;
                                                  returnPolicyEl.style.display = "flex";
                                                  hasContent = true;
                                              }
                                          }

                                          // Show the whole section only if there is some content
                                          if (hasContent) {
                                              descriptionSection.style.display = "block";
                                          } else {
                                              descriptionSection.style.display = "none";
                                          }
                                      }


                                  function renderAdvancedHighlights(specData) { const container = document.getElementById("advanced-highlights-section"); if (!specData || !specData.blocks || specData.blocks.length === 0) { container.style.display = "none"; return; } let html = `<div class="p-4 sm:p-6 lg:p-8 border-t border-b border-gray-200 my-4"><h2 class="text-xl font-bold text-gray-900 mb-4">Highlights</h2>`; if (specData.specScore || specData.specTag) { html += '<div class="flex items-center gap-3 mb-6">'; if (specData.specScore) { html += `<div class="spec-score font-bold">${specData.specScore}</div>`; } if (specData.specTag) { html += `<div class="spec-tag">${specData.specTag}</div>`; } html += '</div>'; } html += '<div class="space-y-6">'; specData.blocks.forEach(block => { const subtitleStyle = "color: #B8860B; font-weight: 500;"; html += `<div class="flex items-start gap-4"><div class="flex-shrink-0 w-8 h-8 text-gray-600 pt-1">${block.icon || ""}</div><div class="flex-grow"><p class="text-sm text-gray-500">${block.category || ""}</p><h4 class="text-md font-semibold text-gray-800 mt-1">${block.title || ""}</h4><p class="text-sm mt-1" style="${subtitleStyle}">${block.subtitle || ""}</p></div></div>`; }); html += '</div></div>'; container.innerHTML = html; container.style.display = "block"; }
                                  function renderMediaGallery() { const gallery=document.getElementById("thumbnail-gallery");gallery.innerHTML="",slider.innerHTML="",mediaItems.forEach((item,index)=>{const e=document.createElement("div");e.className="media-item","image"===item.type?e.innerHTML=`<img src="${item.src}" alt="Product image ${index+1}" draggable="false">`:getYoutubeEmbedUrl(item.src)&&(e.innerHTML=`<iframe src="${getYoutubeEmbedUrl(item.src)}" class="w-full h-auto object-cover aspect-square" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`),slider.appendChild(e);const t=document.createElement("div");t.className="aspect-square thumbnail";const l=document.createElement("img");l.src="image"===item.type?item.src:item.thumbnail,t.appendChild(l),"video"===item.type&&((n=document.createElement("div")).className="play-icon",n.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="50%" height="50%"><path d="M8 5v14l11-7z"/></svg>',t.appendChild(n));var n;t.addEventListener("click",()=>showMedia(index)),gallery.appendChild(t)}),mediaItems.length>0&&showMedia(0)}
                                  function renderStars(rating, container) { container.innerHTML = ""; const fullStars = Math.floor(rating), halfStar = rating % 1 >= .5, emptyStars = 5 - fullStars - (halfStar ? 1 : 0); for (let i = 0; i < fullStars; i++)container.innerHTML += '<i class="fas fa-star"></i>'; halfStar && (container.innerHTML += '<i class="fas fa-star-half-alt"></i>'); for (let i = 0; i < emptyStars; i++)container.innerHTML += '<i class="far fa-star"></i>' }
                                  function getYoutubeEmbedUrl(url) { if(!url)return null;let videoId=null;try{const urlObj=new URL(url);if("www.youtube.com"===urlObj.hostname||"youtube.com"===urlObj.hostname)videoId=urlObj.searchParams.get("v");else if("youtu.be"===urlObj.hostname)videoId=urlObj.pathname.slice(1);return videoId?`https://www.youtube.com/embed/${videoId}?controls=1&rel=0&modestbranding=1`:null}catch(e){return console.error("Invalid video URL:",url,e),null}}
                                  function showMedia(index) { if(!(index<0||index>=mediaItems.length))slider.style.transition="transform 0.3s ease-out",currentMediaIndex=index,currentTranslate=index*-sliderWrapper.offsetWidth,prevTranslate=currentTranslate,setSliderPosition(),document.querySelectorAll(".thumbnail").forEach((t,e)=>t.classList.toggle("active",e===index))}
                                  function setupSliderControls() { sliderWrapper.addEventListener("touchstart",touchStart,{passive:!0}),sliderWrapper.addEventListener("touchend",touchEnd),sliderWrapper.addEventListener("touchmove",touchMove,{passive:!0}),sliderWrapper.addEventListener("mousedown",touchStart),sliderWrapper.addEventListener("mouseup",touchEnd),sliderWrapper.addEventListener("mouseleave",touchEnd),sliderWrapper.addEventListener("mousemove",touchMove)}
                                  function touchStart(event) { startPos=getPositionX(event),isDragging=!0,animationID=requestAnimationFrame(animation),slider.style.transition="none"}
                                  function touchMove(event) { if(isDragging){const e=getPositionX(event);currentTranslate=prevTranslate+e-startPos}}
                                  function touchEnd(event) { if(isDragging){isDragging=!1,cancelAnimationFrame(animationID);const e=currentTranslate-prevTranslate;e<-50&&currentMediaIndex<mediaItems.length-1&&currentMediaIndex++,e>50&&currentMediaIndex>0&&currentMediaIndex--,showMedia(currentMediaIndex)}}
                                  function getPositionX(event) { return event.type.includes("mouse")?event.pageX:event.touches[0].clientX}
                                  function animation() { setSliderPosition(),isDragging&&requestAnimationFrame(animation)}
                                  function setSliderPosition() { slider.style.transform=`translateX(${currentTranslate}px)`}
                                  function setupImageModal() { const modal=document.getElementById("image-modal"),modalImg=document.getElementById("modal-image-content"),closeBtn=document.querySelector("#image-modal .close"),prevBtn=document.querySelector("#image-modal .prev"),nextBtn=document.querySelector("#image-modal .next");sliderWrapper.onclick=e=>{if(isDragging||currentTranslate-prevTranslate!=0)return;"image"===mediaItems[currentMediaIndex].type&&(modal.style.display="flex",modalImg.src=mediaItems[currentMediaIndex].src)},closeBtn.onclick=()=>modal.style.display="none";const showModalImage=direction=>{let e=mediaItems.map((e,t)=>({...e,originalIndex:t})).filter(e=>"image"===e.type);if(0!==e.length){const t=e.findIndex(e=>e.originalIndex===currentMediaIndex);let n=(t+direction+e.length)%e.length;const r=e[n];modalImg.src=r.src,showMedia(r.originalIndex)}};prevBtn.onclick=e=>{e.stopPropagation(),showModalImage(-1)},nextBtn.onclick=e=>{e.stopPropagation(),showModalImage(1)}}
                                  function setupShareButton() { document.getElementById("share-button").addEventListener("click",async()=>{const e=currentProductData.name.replace(/\*/g,"").trim(),t=`*${e}*\nPrice: *₹${Number(currentProductData.displayPrice).toLocaleString("en-IN")}*\n\n✨ Discover more at Ramazone! ✨\n${window.location.href}`;navigator.share?await navigator.share({text:t}):navigator.clipboard.writeText(window.location.href).then(()=>showToast("Link Copied!"))})}
                                  function showToast(message, type = "info") { const toast=document.getElementById("toast-notification");toast.textContent=message,toast.style.backgroundColor="error"===type?"#ef4444":"#333",toast.classList.add("show"),setTimeout(()=>toast.classList.remove("show"),2500)}
                                  function updateRecentlyViewed(newId) { let viewedIds=JSON.parse(sessionStorage.getItem("ramazoneRecentlyViewed"))||[];viewedIds=viewedIds.filter(e=>e!==newId),viewedIds.unshift(newId),viewedIds=viewedIds.slice(0,10),sessionStorage.setItem("ramazoneRecentlyViewed",JSON.stringify(viewedIds)),loadRecentlyViewed(viewedIds)}
                                  function loadHandpickedSimilarProducts(similarIds) { const section = document.getElementById("handpicked-similar-section"), container = document.getElementById("handpicked-similar-container"); if (!similarIds || similarIds.length === 0) return void (section.style.display = "none"); container.innerHTML = ""; let hasContent = !1; similarIds.forEach(id => { const product = allProductsCache.find(p => p && p.id === id); product && (container.innerHTML += createHandpickedCard(product), hasContent = !0) }), hasContent && (section.style.display = "block")}
                                  function loadRecentlyViewed(viewedIds) { const container=document.getElementById("recently-viewed-container"),section=document.getElementById("recently-viewed-section");if(container&&section&&(container.innerHTML="",viewedIds&&viewedIds.length>1)){let t=0;viewedIds.filter(e=>e!=currentProductId).forEach(e=>{const n=allProductsCache.find(t=>t.id==e);n&&(container.innerHTML+=createCarouselCard(n),t++)}),t>0?section.style.display="block":section.style.display="none"}else section.style.display="none"}
                                  function loadCategoryBasedProducts(category) { const section=document.getElementById("similar-products-section"),container=document.getElementById("similar-products-container");if(!category||!allProductsCache)return void(section.style.display="none");container.innerHTML="";let cardCount=0;allProductsCache.forEach(product=>{product&&product.category===category&&product.id!=currentProductId&&(container.innerHTML+=createCarouselCard(product),cardCount++)}),cardCount>0?section.style.display="block":section.style.display="none"}
                                  function loadOtherProducts(currentCategory) { const otherProducts = allProductsCache.filter(p => p.category !== currentCategory && p.id != currentProductId).map(p => { const discount = Number(p.originalPrice) > Number(p.displayPrice) ? 100 * ((Number(p.originalPrice) - Number(p.displayPrice)) / Number(p.originalPrice)) : 0, rating = p.rating || 0, score = 5 * rating + .5 * discount; return { ...p, score: score } }).sort((a, b) => b.score - a.score).slice(0, 20), container = document.getElementById("other-products-container"); if (!container) return; container.innerHTML = "", otherProducts.length > 0 && (otherProducts.forEach(product => { container.innerHTML += createGridCard(product) }), document.getElementById("other-products-section").style.display = "block") }

