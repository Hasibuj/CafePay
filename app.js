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

const readOnlyProvider = new ethers.JsonRpcProvider(ARC_CHAIN_CONFIG.rpcUrls[0]);
const readOnlyCafePayContract = new ethers.Contract(CONTRACT_ADDRESS, ABI_CAFEPAY, readOnlyProvider);

async function getAllShops() {
    try {
        const shops = await readOnlyCafePayContract.getAllShops();
        return shops || [];
    } catch (err) {
        console.error("Error fetching shops from blockchain:", err);
        return [];
    }
}

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
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(compressedDataUrl);
            };
            img.onerror = function () { resolve(null); };
        };
        reader.onerror = function () { resolve(null); };
        reader.readAsDataURL(file);
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('btn-connect').addEventListener('click', connectWallet);
    document.getElementById('btn-register').addEventListener('click', registerShop);
    document.getElementById('btn-add-item').addEventListener('click', addItem);
    document.getElementById('btn-update-logo').addEventListener('click', updateShopLogo);
    document.getElementById('btn-open-owner-modal').addEventListener('click', openOwnerModal);
    document.getElementById('btn-close-owner-modal').addEventListener('click', closeOwnerModal);
    document.getElementById('btn-back-to-shops').addEventListener('click', showDirectoryView);
    document.getElementById('search-input').addEventListener('input', filterShops);
    routeView();
});

async function connectWallet() {
    if (!window.ethereum) return alert("MetaMask is required.");
    try {
        await switchNetwork();
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = ethers.getAddress(await signer.getAddress());
        document.getElementById('btn-connect').innerText = `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
        cafePayContract = new ethers.Contract(CONTRACT_ADDRESS, ABI_CAFEPAY, signer);
        usdcContract = new ethers.Contract(USDC_ADDRESS, ABI_ERC20, signer);
        checkOwnerShopStatus();
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
    document.getElementById('view-customer-store').classList.add('hidden');
    document.getElementById('view-directory').classList.remove('hidden');
    loadShopsDirectory();
}

async function loadShopsDirectory() {
    const grid = document.getElementById('shops-grid');
    if (!grid) return;
    grid.innerHTML = "<p class='text-slate-500 col-span-3 text-center'>Loading restaurants from blockchain...</p>";
    try {
        const allShopAddresses = await getAllShops();
        if (!allShopAddresses || allShopAddresses.length === 0) {
            grid.innerHTML = "<p class='text-slate-500 col-span-3 text-center'>No restaurants found.</p>";
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
                    const logoElement = logoUrl ? `<img src="${logoUrl}" class="w-12 h-12 rounded-xl object-cover border" alt="Logo">` : `<div class="text-3xl">☕</div>`;
                    shopsHtml += `
                        <div onclick="openStorefront('${cleanAddr}')" class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between">
                            <div>
                                <div class="mb-3">${logoElement}</div>
                                <h3 class="shop-title text-xl font-bold text-slate-900">${shopName}</h3>
                                <p class="text-xs font-mono text-slate-500 mt-1">${cleanAddr.substring(0, 10)}...</p>
                            </div>
                            <button class="mt-4 w-full bg-amber-50 text-amber-900 font-semibold py-2 rounded-xl text-sm border border-amber-200 hover:bg-amber-100">View Menu</button>
                        </div>
                    `;
                }
            } catch (innerErr) {
                console.error("Error parsing shop:", ownerAddr, innerErr);
            }
        }
        grid.innerHTML = shopsHtml || "<p class='text-slate-500 col-span-3 text-center'>No active restaurants found.</p>";
    } catch (err) {
        console.error("Error loading shops directory:", err);
        grid.innerHTML = "<p class='text-red-500 col-span-3 text-center'>Failed to load restaurants.</p>";
    }
}

function filterShops() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const cards = document.querySelectorAll('#shops-grid > div');
    cards.forEach(card => {
        const title = card.querySelector('.shop-title')?.innerText.toLowerCase() || "";
        card.style.display = title.includes(query) ? "flex" : "none";
    });
}

function openStorefront(ownerAddr) {
    window.history.pushState({}, "", `?shop=${ownerAddr}`);
    showCustomerStoreView(ownerAddr);
}

async function showCustomerStoreView(shopOwner) {
    document.getElementById('view-directory').classList.add('hidden');
    document.getElementById('view-customer-store').classList.remove('hidden');
    try {
        const cleanOwner = ethers.getAddress(shopOwner);
        const shop = await readOnlyCafePayContract.shops(cleanOwner);
        document.getElementById('cust-shop-name').innerText = shop.shopName || shop[0] || "Shop Not Found";
        document.getElementById('cust-shop-owner').innerText = `Owner: ${cleanOwner}`;

        const logoUrl = localStorage.getItem(`shop_logo_${cleanOwner}`);
        const logoContainer = document.getElementById('cust-shop-logo');
        if (logoUrl) {
            logoContainer.innerHTML = `<img src="${logoUrl}" class="w-full h-full object-cover">`;
        } else {
            logoContainer.innerHTML = `☕`;
        }

        const menu = await readOnlyCafePayContract.getShopMenu(cleanOwner);
        const menuContainer = document.getElementById('customer-menu');
        menuContainer.innerHTML = "";

        menu.forEach((item) => {
            const isDeleted = localStorage.getItem(`item_deleted_${cleanOwner}_${item.id}`) === 'true';
            if (isDeleted) return;

            const isAvailable = localStorage.getItem(`item_available_${cleanOwner}_${item.id}`) !== 'false';
            const currentName = localStorage.getItem(`item_name_${cleanOwner}_${item.id}`) || item.name;
            const currentPrice = localStorage.getItem(`item_price_${cleanOwner}_${item.id}`) || ethers.formatUnits(item.price, 6);
            const foodImgUrl = localStorage.getItem(`item_img_${cleanOwner}_${item.id}`);

            const imgElement = foodImgUrl ? `<img src="${foodImgUrl}" class="w-full h-36 object-cover rounded-xl mb-3">` : `<div class="w-full h-36 bg-amber-50 rounded-xl mb-3 flex items-center justify-center text-4xl">🍔</div>`;
            const card = document.createElement('div');
            card.className = "bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between";

            if (!isAvailable) {
                card.innerHTML = `
                    <div>
                        ${imgElement}
                        <h4 class="text-lg font-bold text-slate-400 line-through">${currentName}</h4>
                        <p class="text-slate-400 font-bold mt-1">${currentPrice} USDC</p>
                    </div>
                    <button disabled class="mt-4 bg-slate-200 text-slate-500 font-semibold py-2 rounded-xl cursor-not-allowed">Not Available</button>
                `;
            } else {
                card.innerHTML = `
                    <div>
                        ${imgElement}
                        <h4 class="text-lg font-bold text-slate-900">${currentName}</h4>
                        <p class="text-amber-700 font-bold mt-1">${currentPrice} USDC</p>
                    </div>
                    <button onclick="buyItem('${cleanOwner}', ${item.id}, '${currentPrice}')" class="mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-xl transition">Pay with USDC</button>
                `;
            }
            menuContainer.appendChild(card);
        });
    } catch (err) {
        console.error("Error loading menu:", err);
    }
}

function openOwnerModal() {
    document.getElementById('owner-modal').classList.remove('hidden');
    loadOwnerDashboardMenu();
}

function closeOwnerModal() {
    document.getElementById('owner-modal').classList.add('hidden');
}

async function registerShop() {
    if (!cafePayContract) return alert("Please connect wallet first.");
    const name = document.getElementById('reg-shop-name').value.trim();
    if (!name) return alert("Please enter a shop name.");
    try {
        const tx = await cafePayContract.registerShop(name);
        await tx.wait();
        alert("Shop registered successfully!");
        checkOwnerShopStatus();
        loadShopsDirectory();
    } catch (err) {
        alert("Error: " + (err.reason || err.message));
    }
}

async function addItem() {
    if (!cafePayContract) return alert("Please connect wallet first.");
    const name = document.getElementById('item-name').value.trim();
    const price = document.getElementById('item-price').value.trim();
    if (!name || !price) return alert("Please fill in item details.");
    try {
        const parsedPrice = ethers.parseUnits(price, 6);
        const tx = await cafePayContract.addItem(name, parsedPrice);
        await tx.wait();

        const menu = await readOnlyCafePayContract.getShopMenu(userAddress);
        const newItem = menu[menu.length - 1];
        if (newItem) {
            const compressedImg = await uploadImageFile('item-image-file');
            if (compressedImg) {
                localStorage.setItem(`item_img_${userAddress}_${newItem.id}`, compressedImg);
            }
        }

        alert("Item added successfully!");
        document.getElementById('item-name').value = "";
        document.getElementById('item-price').value = "";
        const fileInput = document.getElementById('item-image-file');
        if (fileInput) fileInput.value = "";
        loadOwnerDashboardMenu();
    } catch (err) {
        alert("Error: " + (err.reason || err.message));
    }
}

async function updateShopLogo() {
    if (!userAddress) return alert("Please connect wallet first.");
    try {
        const compressedLogo = await uploadImageFile('shop-logo-file');
        if (!compressedLogo) return alert("Please select a logo image.");
        localStorage.setItem(`shop_logo_${userAddress}`, compressedLogo);
        alert("Shop logo updated successfully!");
        const fileInput = document.getElementById('shop-logo-file');
        if (fileInput) fileInput.value = "";
        checkOwnerShopStatus();
    } catch (err) {
        alert("Error updating logo: " + err.message);
    }
}

async function checkOwnerShopStatus() {
    if (!userAddress || !cafePayContract) return;
    try {
        const shop = await readOnlyCafePayContract.shops(userAddress);
        const regSection = document.getElementById('section-register-shop');
        const ownerContent = document.getElementById('section-owner-content');
        const openBtn = document.getElementById('btn-open-owner-modal');

        if (shop && shop.exists) {
            if (regSection) regSection.classList.add('hidden');
            if (ownerContent) ownerContent.classList.remove('hidden');
            if (openBtn) openBtn.classList.remove('hidden');
            const shopName = shop.shopName || shop[0];
            document.getElementById('owner-shop-title').innerText = `Dashboard: ${shopName}`;
            generateOwnerStoreLink(userAddress);
        } else {
            if (regSection) regSection.classList.remove('hidden');
            if (ownerContent) ownerContent.classList.add('hidden');
            if (openBtn) openBtn.classList.add('hidden');
        }
    } catch (err) {
        console.error("Error checking owner shop status:", err);
    }
}

function generateOwnerStoreLink(ownerAddr) {
    const baseUrl = window.location.origin + window.location.pathname;
    const storeUrl = `${baseUrl}?shop=${ownerAddr}`;
    const linkInput = document.getElementById('owner-store-link');
    if (linkInput) linkInput.value = storeUrl;

    const qrContainer = document.getElementById('owner-qr-code');
    if (qrContainer) {
        qrContainer.innerHTML = "";
        new QRCode(qrContainer, {
            text: storeUrl,
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

async function loadOwnerDashboardMenu() {
    if (!userAddress) return;
    try {
        const menu = await readOnlyCafePayContract.getShopMenu(userAddress);
        const container = document.getElementById('owner-manage-menu-container');
        if (!container) return;
        container.innerHTML = "";

        if (!menu || menu.length === 0) {
            container.innerHTML = "<p class='text-slate-500 text-sm'>No items added yet.</p>";
            return;
        }

        menu.forEach((item) => {
            const isDeleted = localStorage.getItem(`item_deleted_${userAddress}_${item.id}`) === 'true';
            if (isDeleted) return;

            const isAvailable = localStorage.getItem(`item_available_${userAddress}_${item.id}`) !== 'false';
            const currentName = localStorage.getItem(`item_name_${userAddress}_${item.id}`) || item.name;
            const currentPrice = localStorage.getItem(`item_price_${userAddress}_${item.id}`) || ethers.formatUnits(item.price, 6);
            const foodImgUrl = localStorage.getItem(`item_img_${userAddress}_${item.id}`);

            const imgElement = foodImgUrl ? `<img src="${foodImgUrl}" class="w-12 h-12 object-cover rounded-lg border">` : `<div class="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center text-xl">🍔</div>`;

            const itemDiv = document.createElement('div');
            itemDiv.className = "flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 gap-3";
            itemDiv.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden">
                    ${imgElement}
                    <div class="truncate">
                        <h5 class="font-bold text-sm text-slate-900 truncate">${currentName}</h5>
                        <p class="text-xs text-amber-700 font-semibold">${currentPrice} USDC</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button onclick="toggleItemAvailability('${userAddress}', ${item.id})" class="text-xs px-2.5 py-1.5 rounded-lg font-semibold border ${isAvailable ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'}">
                        ${isAvailable ? 'Available' : 'Unavailable'}
                    </button>
                    <button onclick="deleteShopItem('${userAddress}', ${item.id})" class="text-xs px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg font-semibold hover:bg-red-100">
                        Delete
                    </button>
                </div>
            `;
            container.appendChild(itemDiv);
        });
    } catch (err) {
        console.error("Error loading owner dashboard menu:", err);
    }
}

function toggleItemAvailability(ownerAddr, itemId) {
    const currentStatus = localStorage.getItem(`item_available_${ownerAddr}_${itemId}`) !== 'false';
    localStorage.setItem(`item_available_${ownerAddr}_${itemId}`, (!currentStatus).toString());
    loadOwnerDashboardMenu();
}

function deleteShopItem(ownerAddr, itemId) {
    if (confirm("Are you sure you want to delete this item?")) {
        localStorage.setItem(`item_deleted_${ownerAddr}_${itemId}`, 'true');
        loadOwnerDashboardMenu();
    }
}

async function buyItem(shopOwner, itemIndex, priceStr) {
    if (!cafePayContract || !usdcContract) return alert("Please connect wallet first.");
    try {
        const parsedPrice = ethers.parseUnits(priceStr, 6);
        const allowance = await usdcContract.allowance(userAddress, CONTRACT_ADDRESS);
        if (allowance < parsedPrice) {
            alert("Approval needed. Please approve USDC spending.");
            const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, parsedPrice);
            await approveTx.wait();
        }
        const tx = await cafePayContract.buyItem(shopOwner, itemIndex);
        await tx.wait();
        alert("Payment successful! Item purchased.");
    } catch (err) {
        alert("Payment error: " + (err.reason || err.message));
    }
}
