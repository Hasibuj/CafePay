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
    
    // ওয়ালেট কানেক্ট ছাড়াই শপ ওনার প্যানেল বাটন দৃশ্যমান করা হলো
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
            if (!item.active) return;
            const itemName = item.name;
            const itemPrice = ethers.formatUnits(item.price, 6);
            
            // লোকাল স্টোরেজ থেকে ডেসক্রিপশন এবং ছবি ফেচ করা
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

function openOwnerModal() {
    document.getElementById('owner-modal').classList.remove('hidden');
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
        
        // ট্রানজেকশন সফল হলে আইটেমের আইডি বের করে লোকাল স্টোরেজে ডেসক্রিপশন ও ছবি সেভ করা
        const receipt = await tx.wait();
        
        // মেনু লিস্ট থেকে নতুন যুক্ত হওয়া আইটেমের আইডি পাওয়ার জন্য মেনু রিফেচ করা হচ্ছে
        const menu = await cafePayContract.getShopMenu(userAddress);
        if (menu && menu.length > 0) {
            const newItem = menu[menu.length - 1]; // সর্বশেষ যোগ করা আইটেম
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
        }
    } catch (err) {
        console.error("Error checking shop status:", err);
    }
}
