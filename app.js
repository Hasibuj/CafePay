const ARC_CHAIN_CONFIG = {
    chainId: '0x4cef52',
    chainName: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: ['https://rpc.blockdaemon.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io'],
    blockExplorerUrls: ['https://testnet.arcscan.app']
};

const CONTRACT_ADDRESS = "0xF83506D10f4416953a6b7CF4cdC5a970CE49B52e";
const USDC_ADDRESS     = "0x3600000000000000000000000000000000000000";

const ABI_CAFEPAY = [
    "function registerShop(string memory _shopName) external",
    "function addItem(string memory _name, uint256 _price) external",
    "function buyItem(address _shopOwner, uint256 _itemIndex) external",
    "function getShopMenu(address _shopOwner) external view returns (tuple(uint256 id, string name, uint256 price, bool active)[])",
    "function shops(address) external view returns (string shopName, address ownerAddress, bool exists)",
    "function getAllShops() external view returns (address[] memory)"
];

const ABI_ERC20 = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

let provider, signer, userAddress;
let cafePayContract, usdcContract;
let currentCategory = 'all';

const readOnlyProvider = new ethers.JsonRpcProvider(ARC_CHAIN_CONFIG.rpcUrls[0]);
const readOnlyCafePayContract = new ethers.Contract(CONTRACT_ADDRESS, ABI_CAFEPAY, readOnlyProvider);

async function getAllShops() {
    try {
        const shops = await readOnlyCafePayContract.getAllShops();
        return shops || [];
    } catch (err) {
        console.error("Error fetching shops:", err);
        return [];
    }
}

// আগের মতো লোকাল ইমেজ কম্প্রেস ও বেস৬৪ কনভার্ট করার ফাংশন
function uploadImageFile(fileInputId) {
    return new Promise((resolve) => {
        const input = document.getElementById(fileInputId);
        if (!input || !input.files[0]) {
            resolve(null);
            return;
        }
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.src = e.target.result;
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 300;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = () => resolve(null);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('btn-connect')?.addEventListener('click', connectWallet);
    document.getElementById('btn-register')?.addEventListener('click', registerShop);
    document.getElementById('btn-add-item')?.addEventListener('click', addItem);
    document.getElementById('btn-update-logo')?.addEventListener('click', updateShopLogo);
    document.getElementById('btn-open-owner-modal')?.addEventListener('click', openOwnerModal);
    document.getElementById('btn-close-owner-modal')?.addEventListener('click', closeOwnerModal);
    document.getElementById('btn-back-to-shops')?.addEventListener('click', showDirectoryView);
    document.getElementById('search-input')?.addEventListener('input', applyFilters);

    const ownerModalBtn = document.getElementById('btn-open-owner-modal');
    if (ownerModalBtn) ownerModalBtn.classList.remove('hidden');

    routeView();
});

async function connectWallet() {
    if (!window.ethereum) return alert("MetaMask is required.");
    try {
        await switchNetwork();
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = ethers.getAddress(await signer.getAddress());

        const connectBtn = document.getElementById('btn-connect');
        if (connectBtn) {
            connectBtn.innerText = `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
        }

        cafePayContract = new ethers.Contract(CONTRACT_ADDRESS, ABI_CAFEPAY, signer);
        usdcContract = new ethers.Contract(USDC_ADDRESS, ABI_ERC20, signer);

        await checkOwnerShopStatus();
    } catch (err) {
        alert("Wallet error: " + err.message);
    }
}

async function switchNetwork() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ARC_CHAIN_CONFIG.chainId }]
        });
    } catch (err) {
        if (err.code === 4902) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [ARC_CHAIN_CONFIG]
            });
        }
    }
}

async function routeView() {
    const urlParams = new URLSearchParams(window.location.search);
    const shopParam = urlParams.get('shop');
    if (shopParam) {
        showCustomerStoreView(shopParam);
    } else {
        showDirectoryView();
    }
}

async function showDirectoryView() {
    // ডিরেক্টরি বা হোমপেজে আসলে ডিসকভার ব্যানার আবার শো করবে
    const discoverBanner = document.getElementById('discover-banner-section');
    if (discoverBanner) discoverBanner.classList.remove('hidden');

    document.getElementById('view-customer-store')?.classList.add('hidden');
    document.getElementById('view-directory')?.classList.remove('hidden');
    loadShopsDirectory();
}

async function loadShopsDirectory() {
    const grid = document.getElementById('shops-grid');
    if (!grid) return;
    grid.innerHTML = "<div class='col-span-3 text-center py-20 text-slate-500'>Loading restaurants from blockchain...</div>";

    try {
        const allShopAddresses = await getAllShops();
        if (!allShopAddresses || allShopAddresses.length === 0) {
            grid.innerHTML = "<div class='col-span-3 text-center py-20 text-slate-500'>No restaurants found.</div>";
            return;
        }

        let shopsHtml = "";
        for (const ownerAddr of allShopAddresses) {
            try {
                const cleanAddr = ethers.getAddress(ownerAddr);
                const shop = await readOnlyCafePayContract.shops(cleanAddr);
                if (shop && shop.exists) {
                    const shopName = shop.shopName || shop[0];
                    if (!shopName) continue;

                    const logoUrl = localStorage.getItem(`shop_logo_${cleanAddr}`);
                    const customTagline = localStorage.getItem(`shop_tagline_${cleanAddr}`) || "Fresh food & delicious coffee served daily!";

                    const logoElement = logoUrl ? 
                        `<img src="${logoUrl}" class="w-14 h-14 rounded-2xl object-cover border border-slate-700 shadow-sm" alt="Logo">` : 
                        `<div class="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl shadow-inner">☕</div>`;

                    const shopNameLower = shopName.toLowerCase();
                    let assignedCategory = 'coffee';
                    if (shopNameLower.includes('burger') || shopNameLower.includes('pizza') || shopNameLower.includes('fast')) {
                        assignedCategory = 'fastfood';
                    } else if (shopNameLower.includes('bakery') || shopNameLower.includes('bread') || shopNameLower.includes('cafe')) {
                        assignedCategory = 'bakery';
                    }

                    shopsHtml += `
                        <div onclick="openStorefront('${cleanAddr}')" data-category="${assignedCategory}" class="bg-slate-800/40 backdrop-blur-md p-6 rounded-3xl border border-slate-800/80 shadow-lg hover:bg-slate-800/70 hover:border-amber-500/60 hover:shadow-amber-500/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between group">
                            <div>
                                <div class="mb-4">${logoElement}</div>
                                <h3 class="shop-title text-xl font-black text-white group-hover:text-amber-400 transition">${shopName}</h3>
                                <p class="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">${customTagline}</p>
                            </div>
                            <button class="mt-6 w-full bg-slate-900 text-amber-400 font-bold py-2.5 rounded-xl text-xs border border-slate-700 group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-500 transition">View Menu</button>
                        </div>
                    `;
                }
            } catch (innerErr) {
                console.error("Error parsing shop:", innerErr);
            }
        }

        grid.innerHTML = shopsHtml || "<div class='col-span-3 text-center py-20 text-slate-500'>No active restaurants found.</div>";
        applyFilters();
    } catch (err) {
        console.error("Error loading directory:", err);
        grid.innerHTML = "<div class='col-span-3 text-center py-20 text-red-400'>Failed to load restaurants.</div>";
    }
}

function filterByCategory(category) {
    currentCategory = category;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.className = "category-btn bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold px-4 py-2 rounded-xl border border-slate-700 transition whitespace-nowrap";
    });
    if (event && event.currentTarget) {
        event.currentTarget.className = "category-btn bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition whitespace-nowrap shadow-md shadow-amber-500/20";
    }
    applyFilters();
}

function applyFilters() {
    const searchQuery = document.getElementById('search-input')?.value.toLowerCase() || "";
    const cards = document.querySelectorAll('#shops-grid > div');
    cards.forEach(card => {
        const title = card.querySelector('.shop-title')?.innerText.toLowerCase() || "";
        const categoryAttr = card.getAttribute('data-category') || 'coffee';
        const matchesSearch = title.includes(searchQuery);
        const matchesCategory = (currentCategory === 'all' || categoryAttr === currentCategory);

        if (matchesSearch && matchesCategory) {
            card.style.display = "flex";
        } else {
            card.style.display = "none";
        }
    });
}

function openStorefront(ownerAddr) {
    window.history.pushState({}, "", `?shop=${ownerAddr}`);
    showCustomerStoreView(ownerAddr);
}

async function showCustomerStoreView(shopOwner) {
    // শপ পেজে প্রবেশ করলে ওপরের ডিসকভার ব্যানারটি সম্পূর্ণ লুকিয়ে যাবে
    const discoverBanner = document.getElementById('discover-banner-section');
    if (discoverBanner) discoverBanner.classList.add('hidden');

    document.getElementById('view-directory')?.classList.add('hidden');
    document.getElementById('view-customer-store')?.classList.remove('hidden');

    try {
        const cleanOwner = ethers.getAddress(shopOwner);
        const shop = await readOnlyCafePayContract.shops(cleanOwner);

        const shopNameEl = document.getElementById('cust-shop-name');
        if (shopNameEl) shopNameEl.innerText = shop.shopName || shop[0] || "Shop Not Found";

        const customTagline = localStorage.getItem(`shop_tagline_${cleanOwner}`) || "Fresh food & delicious coffee served daily!";
        const shopOwnerEl = document.getElementById('cust-shop-owner');
        if (shopOwnerEl) shopOwnerEl.innerText = customTagline;

        const logoUrl = localStorage.getItem(`shop_logo_${cleanOwner}`);
        const logoContainer = document.getElementById('cust-shop-logo');
        if (logoContainer) {
            logoContainer.innerHTML = logoUrl ? `<img src="${logoUrl}" class="w-full h-full object-cover">` : `☕`;
        }

        const menu = await readOnlyCafePayContract.getShopMenu(cleanOwner);
        const menuContainer = document.getElementById('customer-menu');
        if (!menuContainer) return;

        menuContainer.innerHTML = "";
        if (!menu || menu.length === 0) {
            menuContainer.innerHTML = "<div class='col-span-3 text-center py-20 text-slate-500'>No menu items available.</div>";
            return;
        }

        menu.forEach((item) => {
            const isDeleted = localStorage.getItem(`item_deleted_${cleanOwner}_${item.id}`) === 'true';
            if (isDeleted) return;

            const isAvailable = localStorage.getItem(`item_available_${cleanOwner}_${item.id}`) !== 'false';
            if (!isAvailable) return;

            const itemName = localStorage.getItem(`item_name_${cleanOwner}_${item.id}`) || item.name;
            const basePrice = parseFloat(localStorage.getItem(`item_price_${cleanOwner}_${item.id}`) || ethers.formatUnits(item.price, 6));
            const itemDesc = localStorage.getItem(`item_desc_${cleanOwner}_${item.id}`) || "";
            const foodImgUrl = localStorage.getItem(`item_img_${cleanOwner}_${item.id}`);

            const imgElement = foodImgUrl ? 
                `<img src="${foodImgUrl}" class="w-full h-40 object-cover rounded-2xl mb-4 border border-slate-700">` : 
                `<div class="w-full h-40 bg-slate-900 rounded-2xl mb-4 flex items-center justify-center text-4xl border border-slate-700">🍔</div>`;

            const isPizza = itemName.toLowerCase().includes('pizza');

            const card = document.createElement('div');
            card.className = "bg-slate-800/50 backdrop-blur-md p-5 rounded-3xl border border-slate-800 shadow-lg flex flex-col justify-between";
            card.innerHTML = `
                <div>
                    ${imgElement}
                    <h4 class="text-lg font-black text-white">${itemName}</h4>
                    <p class="text-xs text-slate-400 mt-1 mb-4 leading-relaxed">${itemDesc}</p>
                    
                    ${isPizza ? `
                        <div class="mb-4">
                            <label class="block text-xs font-semibold text-slate-300 mb-1.5">Select Size:</label>
                            <select id="size-${cleanOwner}-${item.id}" onchange="updateItemPrice('${cleanOwner}', ${item.id}, ${basePrice})" class="w-full text-xs bg-slate-900 border border-slate-700 p-2.5 rounded-xl text-white focus:outline-none focus:border-amber-500 transition">
                                <option value="regular">Regular (Base Price)</option>
                                <option value="medium">Medium</option>
                                <option value="large">Large</option>
                            </select>
                        </div>
                    ` : ''}

                    <div class="mb-4 flex items-center justify-between">
                        <label class="text-xs font-semibold text-slate-300">Quantity:</label>
                        <div class="flex items-center gap-2">
                            <button onclick="adjustQty('${cleanOwner}', ${item.id}, -1, ${basePrice})" class="w-8 h-8 bg-slate-900 border border-slate-700 rounded-xl font-bold text-slate-300 hover:bg-slate-700 transition">-</button>
                            <span id="qty-${cleanOwner}-${item.id}" class="text-sm font-bold text-white">1</span>
                            <button onclick="adjustQty('${cleanOwner}', ${item.id}, 1, ${basePrice})" class="w-8 h-8 bg-slate-900 border border-slate-700 rounded-xl font-bold text-slate-300 hover:bg-slate-700 transition">+</button>
                        </div>
                    </div>

                    <div class="mb-2 text-xs text-slate-400">Total Price: <span id="price-display-${cleanOwner}-${item.id}" class="text-amber-400 font-black text-base">${basePrice.toFixed(2)}</span> USDC</div>
                </div>
                <button onclick="buyCustomItem('${cleanOwner}', ${item.id})" class="mt-4 w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-3 rounded-xl transition text-xs shadow-md shadow-amber-500/20">Pay with USDC</button>
            `;
            menuContainer.appendChild(card);
        });
    } catch (err) {
        console.error("Error loading menu:", err);
    }
}

function calculateCurrentPrice(shopOwner, itemId, basePrice) {
    const sizeSelect = document.getElementById(`size-${shopOwner}-${itemId}`);
    let finalUnitPrice = basePrice;
    if (sizeSelect) {
        const selectedSize = sizeSelect.value;
        if (selectedSize === 'medium') {
            const customMed = localStorage.getItem(`item_price_medium_${shopOwner}_${itemId}`);
            finalUnitPrice = customMed ? parseFloat(customMed) : basePrice + 2;
        } else if (selectedSize === 'large') {
            const customLarge = localStorage.getItem(`item_price_large_${shopOwner}_${itemId}`);
            finalUnitPrice = customLarge ? parseFloat(customLarge) : basePrice + 5;
        }
    }
    const qtySpan = document.getElementById(`qty-${shopOwner}-${itemId}`);
    const qty = qtySpan ? parseInt(qtySpan.innerText) : 1;
    return finalUnitPrice * qty;
}

function updateItemPrice(shopOwner, itemId, basePrice) {
    const finalPrice = calculateCurrentPrice(shopOwner, itemId, basePrice);
    const priceDisplay = document.getElementById(`price-display-${shopOwner}-${itemId}`);
    if (priceDisplay) {
        priceDisplay.innerText = finalPrice.toFixed(2);
    }
}

function adjustQty(shopOwner, itemId, change, basePrice) {
    const qtySpan = document.getElementById(`qty-${shopOwner}-${itemId}`);
    if (!qtySpan) return;
    let currentQty = parseInt(qtySpan.innerText) + change;
    if (currentQty < 1) currentQty = 1;
    qtySpan.innerText = currentQty;
    updateItemPrice(shopOwner, itemId, basePrice);
}

async function buyCustomItem(shopOwner, itemIndex) {
    if (!signer) return alert("Please connect wallet to buy.");
    try {
        const basePriceStr = localStorage.getItem(`item_price_${shopOwner}_${itemIndex}`);
        const menu = await readOnlyCafePayContract.getShopMenu(shopOwner);
        const itemObj = menu.find(i => Number(i.id) === Number(itemIndex));
        const basePrice = basePriceStr ? parseFloat(basePriceStr) : parseFloat(ethers.formatUnits(itemObj.price, 6));

        const finalAmount = calculateCurrentPrice(shopOwner, itemIndex, basePrice);
        const parsedAmount = ethers.parseUnits(finalAmount.toString(), 6);

        const allowance = await usdcContract.allowance(userAddress, CONTRACT_ADDRESS);
        if (allowance < parsedAmount) {
            const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, parsedAmount);
            await approveTx.wait();
        }

        const buyTx = await cafePayContract.buyItem(shopOwner, itemIndex);
        const receipt = await buyTx.wait();

        const shop = await readOnlyCafePayContract.shops(shopOwner);
        const shopName = shop.shopName || shop[0] || "CafePay Shop";
        const itemName = localStorage.getItem(`item_name_${shopOwner}_${itemIndex}`) || itemObj.name;
        const txHash = receipt.hash;

        const receiptHTML = `
            <div id="receipt-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div class="bg-slate-900 rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-slate-800 text-center">
                    <div class="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 border border-emerald-500/30">✅</div>
                    <h3 class="text-2xl font-black text-white mb-1">Payment Successful!</h3>
                    <p class="text-xs text-slate-400 mb-6">Digital Receipt from ${shopName}</p>
                    <div class="bg-slate-800/60 rounded-2xl p-4 text-left space-y-3 mb-6 border border-slate-800">
                        <div class="flex justify-between text-xs">
                            <span class="text-slate-400">Item:</span>
                            <span class="font-bold text-white">${itemName}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-slate-400">Total Paid:</span>
                            <span class="font-bold text-amber-400">${finalAmount.toFixed(2)} USDC</span>
                        </div>
                        <div class="flex justify-between text-xs items-center">
                            <span class="text-slate-400">Tx Hash:</span>
                            <a href="${ARC_CHAIN_CONFIG.blockExplorerUrls[0]}/tx/${txHash}" target="_blank" class="font-mono text-amber-400 underline truncate max-w-[150px]">${txHash}</a>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="downloadReceiptImage()" class="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition text-xs border border-slate-700">Download Receipt</button>
                        <button onclick="document.getElementById('receipt-modal').remove(); window.location.reload();" class="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-3 rounded-xl transition text-xs shadow-md shadow-amber-500/20">Back to Menu</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', receiptHTML);
    } catch (err) {
        alert("Transaction failed: " + (err.reason || err.message));
    }
}

function downloadReceiptImage() {
    window.print();
}

async function updateShopLogo() {
    if (!userAddress) return alert("Please connect wallet first.");
    const cleanAddr = ethers.getAddress(userAddress);
    const logoBase64 = await uploadImageFile('input-shop-logo-file');
    if (!logoBase64) return alert("Please select a valid image file.");

    localStorage.setItem(`shop_logo_${cleanAddr}`, logoBase64);
    alert("Shop logo updated successfully!");
    loadOwnerDashboardMenu();
}

async function addItem() {
    if (!signer) return alert("Please connect wallet.");
    const name = document.getElementById('new-item-name')?.value;
    const price = document.getElementById('new-item-price')?.value;
    const desc = document.getElementById('new-item-desc')?.value;

    if (!name || !price) return alert("Please fill in item name and price.");

    try {
        const parsePrice = ethers.parseUnits(price, 6);
        const tx = await cafePayContract.addItem(name, parsePrice);
        await tx.wait();

        const menu = await readOnlyCafePayContract.getShopMenu(userAddress);
        const newItemId = menu.length - 1;
        const cleanAddr = ethers.getAddress(userAddress);

        localStorage.setItem(`item_name_${cleanAddr}_${newItemId}`, name);
        localStorage.setItem(`item_price_${cleanAddr}_${newItemId}`, price);
        localStorage.setItem(`item_desc_${cleanAddr}_${newItemId}`, desc || "");

        const foodImgBase64 = await uploadImageFile('new-item-img-file');
        if (foodImgBase64) {
            localStorage.setItem(`item_img_${cleanAddr}_${newItemId}`, foodImgBase64);
        }

        alert("Item added successfully!");
        document.getElementById('new-item-name').value = '';
        document.getElementById('new-item-price').value = '';
        document.getElementById('new-item-desc').value = '';
        loadOwnerDashboardMenu();
    } catch (err) {
        alert("Error adding item: " + err.message);
    }
}

async function checkOwnerShopStatus() {
    if (!userAddress) return;
    try {
        const cleanAddr = ethers.getAddress(userAddress);
        const shop = await readOnlyCafePayContract.shops(cleanAddr);
        const regSection = document.getElementById('register-shop-section');
        const dashSection = document.getElementById('owner-dashboard-section');

        if (shop && shop.exists) {
            if (regSection) regSection.classList.add('hidden');
            if (dashSection) dashSection.classList.remove('hidden');
            loadOwnerDashboardMenu();
        } else {
            if (regSection) regSection.classList.remove('hidden');
            if (dashSection) dashSection.classList.add('hidden');
        }
    } catch (err) {
        console.error("Error checking shop status:", err);
    }
}

async function registerShop() {
    if (!signer) return alert("Please connect wallet.");
    const name = document.getElementById('reg-shop-name')?.value;
    if (!name) return alert("Please enter shop name.");
    try {
        const tx = await cafePayContract.registerShop(name);
        await tx.wait();
        alert("Shop registered successfully!");
        checkOwnerShopStatus();
    } catch (err) {
        alert("Registration failed: " + err.message);
    }
}

function openOwnerModal() {
    document.getElementById('owner-modal')?.classList.remove('hidden');
    checkOwnerShopStatus();
}

function closeOwnerModal() {
    document.getElementById('owner-modal')?.classList.add('hidden');
}

function updateShopTagline(cleanAddr) {
    const taglineInput = document.getElementById('input-shop-tagline');
    if (!taglineInput) return;
    localStorage.setItem(`shop_tagline_${cleanAddr}`, taglineInput.value);
    alert("Shop tagline updated!");
}

async function loadOwnerDashboardMenu() {
    if (!userAddress) return;
    try {
        const cleanAddr = ethers.getAddress(userAddress);
        const dashboardCard = document.getElementById('card-dashboard');
        if (!dashboardCard) return;

        let qrContainer = document.getElementById('owner-qr-section');
        if (!qrContainer) {
            qrContainer = document.createElement('div');
            qrContainer.id = 'owner-qr-section';
            qrContainer.className = "mt-6 bg-slate-900 p-5 rounded-2xl border border-slate-800 text-center";
            dashboardCard.appendChild(qrContainer);
        }

        const storeUrl = `${window.location.origin}${window.location.pathname}?shop=${cleanAddr}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(storeUrl)}`;
        const currentTagline = localStorage.getItem(`shop_tagline_${cleanAddr}`) || "Fresh food & delicious coffee served daily!";

        qrContainer.innerHTML = `
            <h4 class='font-bold text-white text-base mb-1'>Shop QR Code & Link</h4>
            <p class='text-xs text-slate-400 mb-3'>Customers can scan this to view your menu directly.</p>
            <div class='flex justify-center mb-3'>
                <img src="${qrApiUrl}" alt="Shop QR Code" class="w-36 h-36 rounded-2xl border border-slate-700 p-2 bg-white shadow-sm">
            </div>
            <input type="text" readonly value="${storeUrl}" class="w-full text-xs bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-slate-300 text-center select-all mb-3" onclick="this.select()">
            <div class="text-left mt-2">
                <label class="block text-xs font-semibold text-slate-300 mb-1.5">Shop Subtitle / Tagline:</label>
                <div class="flex gap-2">
                    <input type="text" id="input-shop-tagline" value="${currentTagline}" class="w-full text-xs bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white">
                    <button onclick="updateShopTagline('${cleanAddr}')" class="bg-amber-500 hover:bg-amber-600 text-white text-xs px-4 py-2.5 rounded-xl font-semibold transition">Save</button>
                </div>
            </div>
        `;

        const menu = await readOnlyCafePayContract.getShopMenu(cleanAddr);
        let dashMenuContainer = document.getElementById('owner-menu-list');
        if (!dashMenuContainer) {
            dashMenuContainer = document.createElement('div');
            dashMenuContainer.id = 'owner-menu-list';
            dashMenuContainer.className = "mt-6 space-y-3 border-t border-slate-800 pt-6";
            dashboardCard.appendChild(dashMenuContainer);
        }

        dashMenuContainer.innerHTML = "<h4 class='font-bold text-white text-base'>Manage Existing Menu Items</h4>";
        if (!menu || menu.length === 0) {
            dashMenuContainer.innerHTML += "<p class='text-xs text-slate-500 mt-2'>No items added yet.</p>";
            return;
        }

        menu.forEach(item => {
            const isDeleted = localStorage.getItem(`item_deleted_${cleanAddr}_${item.id}`) === 'true';
            if (isDeleted) return;

            const isAvailable = localStorage.getItem(`item_available_${cleanAddr}_${item.id}`) !== 'false';
            const currentName = localStorage.getItem(`item_name_${cleanAddr}_${item.id}`) || item.name;
            const currentPrice = localStorage.getItem(`item_price_${cleanAddr}_${item.id}`) || ethers.formatUnits(item.price, 6);

            const itemCard = document.createElement('div');
            itemCard.className = "flex items-center justify-between bg-slate-900 p-4 rounded-2xl border border-slate-800 text-xs";
            itemCard.innerHTML = `
                <div>
                    <p class="font-bold text-white text-sm">${currentName} <span class="ml-2 px-2 py-0.5 rounded font-semibold ${isAvailable ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-red-400 bg-red-500/10 border border-red-500/20'}">${isAvailable ? 'Available' : 'Hidden'}</span></p>
                    <p class="text-amber-400 font-semibold mt-0.5">${currentPrice} USDC</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="toggleItemAvailability('${cleanAddr}', ${item.id})" class="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl border border-slate-700 transition">${isAvailable ? 'Hide' : 'Show'}</button>
                    <button onclick="deleteShopItem('${cleanAddr}', ${item.id})" class="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-2 rounded-xl border border-red-500/30 transition">Delete</button>
                </div>
            `;
            dashMenuContainer.appendChild(itemCard);
        });
    } catch (err) {
        console.error("Error loading owner menu:", err);
    }
}

function toggleItemAvailability(cleanAddr, itemId) {
    const current = localStorage.getItem(`item_available_${cleanAddr}_${itemId}`) !== 'false';
    localStorage.setItem(`item_available_${cleanAddr}_${itemId}`, !current);
    loadOwnerDashboardMenu();
}

function deleteShopItem(cleanAddr, itemId) {
    if (confirm("Are you sure you want to remove this item from your menu?")) {
        localStorage.setItem(`item_deleted_${cleanAddr}_${itemId}`, 'true');
        loadOwnerDashboardMenu();
    }
}
