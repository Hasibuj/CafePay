const ARC_CHAIN_CONFIG = {
    chainId: '0x4cef52',
    chainName: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: [
        'https://rpc.blockdaemon.testnet.arc.io',
        'https://rpc.drpc.testnet.arc.io'
    ],
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
                    const customTagline = localStorage.getItem(`shop_tagline_${cleanAddr}`) || "Fresh food & delicious coffee served daily!";
                    const logoElement = logoUrl ? `<img src="${logoUrl}" class="w-12 h-12 rounded-xl object-cover border" alt="Logo">` : `<div class="text-3xl">☕</div>`;
                    
                    shopsHtml += `
                        <div onclick="openStorefront('${cleanAddr}')" class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between">
                            <div>
                                <div class="mb-3">${logoElement}</div>
                                <h3 class="shop-title text-xl font-bold text-slate-900">${shopName}</h3>
                                <p class="text-xs text-slate-500 mt-1 line-clamp-2">${customTagline}</p>
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
        
        const customTagline = localStorage.getItem(`shop_tagline_${cleanOwner}`) || "Fresh food & delicious coffee served daily!";
        document.getElementById('cust-shop-owner').innerText = customTagline;

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
            if (!isAvailable) return;

            const itemName = localStorage.getItem(`item_name_${cleanOwner}_${item.id}`) || item.name;
            const itemPrice = localStorage.getItem(`item_price_${cleanOwner}_${item.id}`) || ethers.formatUnits(item.price, 6);
            
            const itemDesc = localStorage.getItem(`item_desc_${cleanOwner}_${item.id}`) || "";
            const foodImgUrl = localStorage.getItem(`item_img_${cleanOwner}_${item.id}`);
            const imgElement = foodImgUrl ? `<img src="${foodImgUrl}" class="w-full h-36 object-cover rounded-xl mb-3">` : `<div class="w-full h-36 bg-amber-50 rounded-xl mb-3 flex items-center justify-center text-4xl">🍔</div>`;
            
            const card = document.createElement('div');
            card.className = "bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between";
            card.innerHTML = `
                <div>
                    ${imgElement}
                    <h4 class="text-lg font-bold text-slate-900">${itemName}</h4>
                    <p class="text-xs text-slate-500 mt-1 mb-2">${itemDesc}</p>
                    <p class="text-amber-700 font-bold">${itemPrice} USDC</p>
                </div>
                <button onclick="buyItem('${cleanOwner}', ${item.id}, '${itemPrice}')" class="mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-xl transition">Pay with USDC</button>
            `;
            menuContainer.appendChild(card);
        });
    } catch (err) {
        console.error("Error loading menu:", err);
    }
}

async function loadOwnerDashboardMenu() {
    if (!userAddress) return;
    try {
        const cleanAddr = ethers.getAddress(userAddress);
        
        const modalContent = document.querySelector('#owner-modal > div');
        if (modalContent) {
            modalContent.className = "bg-white rounded-3xl max-w-2xl w-full p-8 max-h-[90vh] overflow-y-auto shadow-2xl relative";
        }

        let qrContainer = document.getElementById('owner-qr-section');
        if (!qrContainer) {
            const dashboardCard = document.getElementById('card-dashboard');
            qrContainer = document.createElement('div');
            qrContainer.id = 'owner-qr-section';
            qrContainer.className = "mt-6 bg-slate-50 p-5 rounded-2xl border border-slate-200 text-center";
            dashboardCard.appendChild(qrContainer);
        }
        const storeUrl = `${window.location.origin}${window.location.pathname}?shop=${cleanAddr}`;
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(storeUrl)}`;
        const currentTagline = localStorage.getItem(`shop_tagline_${cleanAddr}`) || "Fresh food & delicious coffee served daily!";

        qrContainer.innerHTML = `
            <h4 class='font-bold text-slate-800 text-base mb-2'>Shop QR Code & Link</h4>
            <p class='text-xs text-slate-500 mb-3'>Customers can scan this to view your menu directly.</p>
            <div class='flex justify-center mb-3'>
                <img src="${qrApiUrl}" alt="Shop QR Code" class="w-36 h-36 rounded-xl border p-1 bg-white shadow-sm">
            </div>
            <input type="text" readonly value="${storeUrl}" class="w-full text-xs bg-white border border-slate-200 p-2 rounded-lg text-slate-600 text-center select-all mb-3" onclick="this.select()">
            <div class="text-left mt-2">
                <label class="block text-xs font-semibold text-slate-700 mb-1">Shop Subtitle / Tagline:</label>
                <div class="flex gap-2">
                    <input type="text" id="input-shop-tagline" value="${currentTagline}" class="w-full text-xs bg-white border border-slate-200 p-2 rounded-lg text-slate-800">
                    <button onclick="updateShopTagline('${cleanAddr}')" class="bg-amber-600 text-white text-xs px-3 py-2 rounded-lg font-semibold hover:bg-amber-700">Save</button>
                </div>
            </div>
        `;

        const menu = await readOnlyCafePayContract.getShopMenu(cleanAddr);
        let dashMenuContainer = document.getElementById('owner-menu-list');
        if (!dashMenuContainer) {
            const dashboardCard = document.getElementById('card-dashboard');
            dashMenuContainer = document.createElement('div');
            dashMenuContainer.id = 'owner-menu-list';
            dashMenuContainer.className = "mt-6 space-y-3 border-t border-slate-100 pt-6";
            dashboardCard.appendChild(dashMenuContainer);
        }
        dashMenuContainer.innerHTML = "<h4 class='font-bold text-slate-800 text-base'>Manage Existing Menu Items</h4>";
        
        if (!menu || menu.length === 0) {
            dashMenuContainer.innerHTML += "<p class='text-sm text-slate-500'>No items added yet.</p>";
            return;
        }

        menu.forEach(item => {
            const isDeleted = localStorage.getItem(`item_deleted_${cleanAddr}_${item.id}`) === 'true';
            if (isDeleted) return;

            const isAvailable = localStorage.getItem(`item_available_${cleanAddr}_${item.id}`) !== 'false';
            const currentName = localStorage.getItem(`item_name_${cleanAddr}_${item.id}`) || item.name;
            const currentPrice = localStorage.getItem(`item_price_${cleanAddr}_${item.id}`) || ethers.formatUnits(item.price, 6);
            const currentDesc = localStorage.getItem(`item_desc_${cleanAddr}_${item.id}`) || "";

            const itemCard = document.createElement('div');
            itemCard.className = "flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm";
            itemCard.innerHTML = `
                <div>
                    <p class="font-semibold text-slate-900">${currentName} <span class="text-xs ${isAvailable ? 'text-green-600 bg-green-50 px-2 py-0.5 rounded' : 'text-red-600 bg-red-50 px-2 py-0.5 rounded'}">${isAvailable ? 'Available' : 'Not Available'}</span></p>
                    <p class="text-xs text-slate-500 mt-0.5">${currentDesc}</p>
                    <p class="text-amber-700 text-xs mt-1 font-semibold">${currentPrice} USDC</p>
                </div>
                <div class="flex gap-1.5 flex-wrap">
                    <button onclick="toggleAvailability('${cleanAddr}', ${item.id})" class="px-2.5 py-1 rounded-lg border text-xs font-semibold ${isAvailable ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}">${isAvailable ? 'Mark Unavailable' : 'Mark Available'}</button>
                    <button onclick="editItemPrompt('${cleanAddr}', ${item.id}, '${currentName}', '${currentPrice}', '${currentDesc.replace(/'/g, "\\'")}')" class="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg border border-blue-200 text-xs font-semibold hover:bg-blue-100">Edit</button>
                    <button onclick="deleteItem('${cleanAddr}', ${item.id})" class="bg-red-50 text-red-600 px-2.5 py-1 rounded-lg border border-red-200 text-xs font-semibold hover:bg-red-100">Delete</button>
                </div>
            `;
            dashMenuContainer.appendChild(itemCard);
        });
    } catch (err) {
        console.error("Error loading owner dashboard menu:", err);
    }
}

function updateShopTagline(shopOwner) {
    const taglineInput = document.getElementById('input-shop-tagline');
    if (!taglineInput) return;
    const newTagline = taglineInput.value.trim();
    if (!newTagline) return alert("Tagline cannot be empty.");
    localStorage.setItem(`shop_tagline_${shopOwner}`, newTagline);
    alert("Shop tagline updated successfully!");
    loadShopsDirectory();
}

function toggleAvailability(shopOwner, itemId) {
    const currentStatus = localStorage.getItem(`item_available_${shopOwner}_${itemId}`) !== 'false';
    const newStatus = !currentStatus;
    localStorage.setItem(`item_available_${shopOwner}_${itemId}`, newStatus.toString());
    alert(newStatus ? "Item is now Available!" : "Item marked as Not Available!");
    loadOwnerDashboardMenu();
}

function editItemPrompt(shopOwner, itemId, oldName, oldPrice, oldDesc) {
    const newName = prompt("Enter new item name:", oldName);
    if (newName === null) return;
    const newPrice = prompt("Enter new item price (USDC):", oldPrice);
    if (newPrice === null) return;
    const newDesc = prompt("Enter new item description:", oldDesc);
    if (newDesc === null) return;

    if (!newName.trim() || !newPrice.trim()) {
        return alert("Name and Price fields cannot be empty.");
    }

    localStorage.setItem(`item_name_${shopOwner}_${itemId}`, newName.trim());
    localStorage.setItem(`item_price_${shopOwner}_${itemId}`, newPrice.trim());
    localStorage.setItem(`item_desc_${shopOwner}_${itemId}`, newDesc.trim());
    
    alert("Item updated successfully!");
    loadOwnerDashboardMenu();
}

function deleteItem(shopOwner, itemId) {
    if (confirm("Are you sure you want to delete this item?")) {
        localStorage.setItem(`item_deleted_${shopOwner}_${itemId}`, 'true');
        alert("Item deleted successfully!");
        loadOwnerDashboardMenu();
    }
}

function openOwnerModal() {
    document.getElementById('owner-modal').classList.remove('hidden');
    if (userAddress) {
        loadOwnerDashboardMenu();
    }
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
    const description = document.getElementById('item-desc') ? document.getElementById('item-desc').value.trim() : "";
    
    if (!name || !price) return alert("Please fill in item name and price.");
    try {
        const parsedPrice = ethers.parseUnits(price, 6);
        const tx = await cafePayContract.addItem(name, parsedPrice);
        
        await tx.wait();
        
        const menu = await cafePayContract.getShopMenu(userAddress);
        if (menu && menu.length > 0) {
            const newItem = menu[menu.length - 1];
            if (description) {
                localStorage.setItem(`item_desc_${userAddress}_${newItem.id}`, description);
            }
            const imgUrl = await uploadImageFile('item-img-input');
            if (imgUrl) {
                localStorage.setItem(`item_img_${userAddress}_${newItem.id}`, imgUrl);
            }
        }

        alert("Item added successfully!");
        document.getElementById('item-name').value = "";
        document.getElementById('item-price').value = "";
        if (document.getElementById('item-desc')) document.getElementById('item-desc').value = "";
        
        loadOwnerDashboardMenu();
    } catch (err) {
        alert("Error: " + (err.reason || err.message));
    }
}

async function updateShopLogo() {
    if (!userAddress) return alert("Please connect wallet first.");
    const logoUrl = await uploadImageFile('shop-logo-input');
    if (!logoUrl) return alert("Please select an image.");
    localStorage.setItem(`shop_logo_${userAddress}`, logoUrl);
    alert("Shop logo updated successfully!");
    checkOwnerShopStatus();
    loadShopsDirectory();
}

async function buyItem(shopOwner, itemIndex, priceInUSDC) {
    if (!signer) return alert("Please connect wallet to buy.");
    try {
        const parsedAmount = ethers.parseUnits(priceInUSDC.toString(), 6);
        const allowance = await usdcContract.allowance(userAddress, CONTRACT_ADDRESS);
        if (allowance < parsedAmount) {
            const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, parsedAmount);
            await approveTx.wait();
        }
        const buyTx = await cafePayContract.buyItem(shopOwner, itemIndex);
        await buyTx.wait();
        alert("Payment successful!");
    } catch (err) {
        alert("Transaction failed: " + (err.reason || err.message));
    }
}

async function checkOwnerShopStatus() {
    if (!userAddress) return;
    try {
        const cleanAddress = ethers.getAddress(userAddress);
        const shop = await readOnlyCafePayContract.shops(cleanAddress);
        if (shop.exists) {
            document.getElementById('card-register').classList.add('hidden');
            document.getElementById('card-dashboard').classList.remove('hidden');
            const shopName = shop.shopName || shop[0];
            document.getElementById('dash-title').innerText = `Dashboard: ${shopName}`;
            const logoUrl = localStorage.getItem(`shop_logo_${cleanAddress}`);
            if (logoUrl) {
                document.getElementById('dash-shop-logo').innerHTML = `<img src="${logoUrl}" class="w-full h-full object-cover">`;
            }
            loadOwnerDashboardMenu();
        }
    } catch (err) {
        console.error("Error checking shop status:", err);
    }
}
