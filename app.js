const ARC_CHAIN_CONFIG = {
    chainId: '0x4cef52',
    chainName: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: ['https://rpc.blockdaemon.testnet.arc.io', 'https://rpc.drpc.testnet.arc.io'],
    blockExplorerUrls: ['https://testnet.arcscan.app']
};

const CONTRACT_ADDRESS = "0xF83506D10f4416953a6b7CF4cdc5a970CE49B52e";
const USDC_ADDRESS     = "0x3600000000000000000000000000000000000000";

const ABI_CAFEPAY = [
    "function registerShop(string memory _shopName) external",
    "function addItem(string memory _name, uint256 _price) external",
    "function buyItem(address _shopOwner, uint256 _itemIndex) external",
    "function getShopMenu(address _shopOwner) external view returns (tuple(uint256 id, string name, uint256 price, bool active)[])",
    "function shops(address owner) external view returns (string shopName, address ownerAddress, bool exists)",
    "function getAllShops() external view returns (address[] memory)"
];

const ABI_ERC20 = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

let provider, signer, userAddress;
let cafePayContract, usdcContract;
let currentCategory = 'all';

const readonlyProvider = new ethers.JsonRpcProvider(ARC_CHAIN_CONFIG.rpcUrls[0]);
const readonlyCafePayContract = new ethers.Contract(CONTRACT_ADDRESS, ABI_CAFEPAY, readonlyProvider);

const getStoredLogos = () => JSON.parse(localStorage.getItem('cafepay_logos') || '{}');
const saveStoredLogo = (owner, url) => {
    const logos = getStoredLogos();
    logos[owner.toLowerCase()] = url;
    localStorage.setItem('cafepay_logos', JSON.stringify(logos));
};

const getStoredImages = () => JSON.parse(localStorage.getItem('cafepay_images') || '{}');
const saveStoredImage = (owner, itemId, url) => {
    const images = getStoredImages();
    if (!images[owner.toLowerCase()]) images[owner.toLowerCase()] = {};
    images[owner.toLowerCase()][itemId] = url;
    localStorage.setItem('cafepay_images', JSON.stringify(images));
};

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const img = new Image();
            img.src = reader.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 400;
                const MAX_HEIGHT = 400;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    initUI();
    await loadShops();
});

function initUI() {
    document.getElementById('btn-connect').addEventListener('click', connectWallet);
    document.getElementById('btn-open-owner-modal').addEventListener('click', openOwnerModal);
    document.getElementById('btn-close-owner-modal').addEventListener('click', closeOwnerModal);
    document.getElementById('btn-register').addEventListener('click', registerShop);
    document.getElementById('btn-add-item').addEventListener('click', addItem);
    document.getElementById('btn-back-to-shops').addEventListener('click', showDirectoryView);
    document.getElementById('btn-update-logo').addEventListener('click', updateShopLogo);
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterShops(e.target.value));
    }
}

async function connectWallet() {
    if (!window.ethereum) {
        alert('Please install MetaMask or a Web3 mobile wallet!');
        return;
    }
    try {
        provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        
        cafePayContract = new ethers.Contract(CONTRACT_ADDRESS, ABI_CAFEPAY, signer);
        usdcContract = new ethers.Contract(USDC_ADDRESS, ABI_ERC20, signer);

        const btnConnect = document.getElementById('btn-connect');
        btnConnect.innerText = `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
        document.getElementById('btn-open-owner-modal').classList.remove('hidden');

        checkShopOwnership();
        await loadShops();
    } catch (err) {
        console.error(err);
        alert('Failed to connect wallet.');
    }
}

async function checkShopOwnership() {
    if (!userAddress) return;
    try {
        const shop = await readonlyCafePayContract.shops(userAddress);
        const regSection = document.getElementById('section-register-shop');
        const dashSection = document.getElementById('section-owner-dashboard');
        const ownerTitle = document.getElementById('owner-shop-title');

        if (shop.exists) {
            regSection.classList.add('hidden');
            dashSection.classList.remove('hidden');
            ownerTitle.innerText = `Managing: ${shop.shopName}`;
        } else {
            regSection.classList.remove('hidden');
            dashSection.classList.add('hidden');
            ownerTitle.innerText = 'Register your restaurant';
        }
    } catch (err) {
        console.error(err);
    }
}

async function registerShop() {
    const shopName = document.getElementById('reg-shop-name').value.trim();
    if (!shopName) {
        alert('Please enter a shop name');
        return;
    }
    try {
        const tx = await cafePayContract.registerShop(shopName);
        alert('Transaction submitted! Waiting for confirmation...');
        await tx.wait();
        alert('Shop registered successfully!');
        checkShopOwnership();
        loadShops();
    } catch (err) {
        console.error(err);
        alert('Error registering shop: ' + (err.reason || err.message));
    }
}

async function updateShopLogo() {
    const fileInput = document.getElementById('shop-logo-input');
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please select an image file first.');
        return;
    }
    try {
        const base64Img = await fileToBase64(fileInput.files[0]);
        saveStoredLogo(userAddress, base64Img);
        alert('Shop logo updated successfully!');
        fileInput.value = '';
    } catch (err) {
        console.error(err);
        alert('Failed to upload logo.');
    }
}

async function loadShops() {
    const grid = document.getElementById('shops-grid');
    grid.innerHTML = `<div class='col-span-3 text-center py-20 text-slate-500'>Loading restaurants from blockchain...</div>`;
    
    try {
        const addresses = await readonlyCafePayContract.getAllShops();
        if (!addresses || addresses.length === 0) {
            grid.innerHTML = `<div class='col-span-3 text-center py-20 text-slate-500'>No restaurants registered yet.</div>`;
            return;
        }

        let html = '';
        const logos = getStoredLogos();

        for (let addr of addresses) {
            const shop = await readonlyCafePayContract.shops(addr);
            if (shop.exists) {
                const logoUrl = logos[addr.toLowerCase()] || '';
                const logoHtml = logoUrl 
                    ? `<img src="${logoUrl}" alt="${shop.shopName}" class="w-full h-full object-cover">`
                    : `<span class="text-3xl">☕</span>`;

                html += `
                <div onclick="openStorefront('${addr}', '${shop.shopName}')" class="bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 transition cursor-pointer group shadow-lg flex flex-col justify-between">
                    <div class="flex items-center gap-4 mb-4">
                        <div class="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0 shadow-inner group-hover:scale-105 transition">
                            ${logoHtml}
                        </div>
                        <div>
                            <h3 class="text-base font-bold text-white group-hover:text-amber-400 transition">${shop.shopName}</h3>
                            <span class="inline-block bg-amber-500/10 text-amber-400 text-[10px] font-semibold px-2 py-0.5 rounded-md mt-1">Verified Shop</span>
                        </div>
                    </div>
                    <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <span>Tap to view menu</span>
                        <span class="text-amber-400 font-bold group-hover:translate-x-1 transition">→</span>
                    </div>
                </div>`;
            }
        }
        grid.innerHTML = html;
    } catch (err) {
        console.error(err);
        grid.innerHTML = `<div class='col-span-3 text-center py-20 text-red-400'>Failed to load restaurants.</div>`;
    }
}

async function openStorefront(shopAddress, shopName) {
    document.getElementById('view-directory').classList.add('hidden');
    document.getElementById('view-customer-store').classList.remove('hidden');

    document.getElementById('cust-shop-name').innerText = shopName;
    
    const logos = getStoredLogos();
    const logoUrl = logos[shopAddress.toLowerCase()] || '';
    const logoContainer = document.getElementById('cust-shop-logo');
    if (logoUrl) {
        logoContainer.innerHTML = `<img src="${logoUrl}" alt="${shopName}" class="w-full h-full object-cover">`;
    } else {
        logoContainer.innerHTML = `☕`;
    }

    await loadCustomerMenu(shopAddress);
}

function showDirectoryView() {
    document.getElementById('view-customer-store').classList.add('hidden');
    document.getElementById('view-directory').classList.remove('hidden');
    loadShops();
}

async function loadCustomerMenu(shopAddress) {
    const menuGrid = document.getElementById('customer-menu');
    menuGrid.innerHTML = `<div class='col-span-3 text-center py-20 text-slate-500'>Loading menu items...</div>`;

    try {
        const items = await readonlyCafePayContract.getShopMenu(shopAddress);
        if (!items || items.length === 0) {
            menuGrid.innerHTML = `<div class='col-span-3 text-center py-20 text-slate-500'>No menu items available yet.</div>`;
            return;
        }

        let html = '';
        const storedImages = getStoredImages();
        const shopImages = storedImages[shopAddress.toLowerCase()] || {};

        items.forEach((item, index) => {
            if (item.active) {
                const priceFormatted = ethers.formatUnits(item.price, 18);
                const itemImgUrl = shopImages[index] || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80';

                html += `
                <div class="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between group">
                    <div class="h-44 w-full overflow-hidden bg-slate-950 relative">
                        <img src="${itemImgUrl}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                        <div class="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-full border border-slate-800 text-xs font-bold text-amber-400">
                            ${priceFormatted} USDC
                        </div>
                    </div>
                    <div class="p-5 space-y-4">
                        <div>
                            <h4 class="font-bold text-white text-base">${item.name}</h4>
                            <p class="text-xs text-slate-400 mt-1">Freshly prepared item ready for order.</p>
                        </div>
                        <button onclick="buyItem('${shopAddress}', ${index}, '${priceFormatted}')" class="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-md shadow-amber-500/20">
                            Pay ${priceFormatted} USDC
                        </button>
                    </div>
                </div>`;
            }
        });
        menuGrid.innerHTML = html || `<div class='col-span-3 text-center py-20 text-slate-500'>No active menu items.</div>`;
    } catch (err) {
        console.error(err);
        menuGrid.innerHTML = `<div class='col-span-3 text-center py-20 text-red-400'>Failed to load menu.</div>`;
    }
}

async function addItem() {
    const name = document.getElementById('item-name').value.trim();
    const priceInput = document.getElementById('item-price').value.trim();
    const fileInput = document.getElementById('item-img-input');

    if (!name || !priceInput) {
        alert('Please fill in item name and price.');
        return;
    }

    try {
        const priceParsed = ethers.parseUnits(priceInput, 18);
        const tx = await cafePayContract.addItem(name, priceParsed);
        alert('Adding item on blockchain... Please wait.');
        await tx.wait();

        if (fileInput.files && fileInput.files.length > 0) {
            const base64Img = await fileToBase64(fileInput.files[0]);
            const items = await readonlyCafePayContract.getShopMenu(userAddress);
            const newIndex = items.length - 1;
            saveStoredImage(userAddress, newIndex, base64Img);
        }

        alert('Menu item added successfully!');
        document.getElementById('item-name').value = '';
        document.getElementById('item-price').value = '';
        document.getElementById('item-desc').value = '';
        fileInput.value = '';
        closeOwnerModal();
        loadCustomerMenu(userAddress);
    } catch (err) {
        console.error(err);
        alert('Error adding item: ' + (err.reason || err.message));
    }
}

async function buyItem(shopOwner, itemIndex, priceStr) {
    if (!signer) {
        alert('Please connect your wallet first!');
        return;
    }
    try {
        const priceWei = ethers.parseUnits(priceStr, 18);
        
        const allowance = await usdcContract.allowance(userAddress, CONTRACT_ADDRESS);
        if (allowance < priceWei) {
            alert('Approving USDC spend...');
            const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, priceWei);
            await approveTx.wait();
        }

        alert('Processing payment...');
        const tx = await cafePayContract.buyItem(shopOwner, itemIndex);
        await tx.wait();
        alert('Payment successful! Order placed.');
        await loadCustomerMenu(shopOwner);
    } catch (err) {
        console.error(err);
        alert('Payment failed: ' + (err.reason || err.message));
    }
}

function openOwnerModal() {
    document.getElementById('owner-modal').classList.remove('hidden');
    checkShopOwnership();
}

function closeOwnerModal() {
    document.getElementById('owner-modal').classList.add('hidden');
}

function filterByCategory(category) {
    currentCategory = category;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('bg-amber-500', 'text-white', 'shadow-md', 'shadow-amber-500/20');
        btn.classList.add('bg-slate-900', 'text-slate-300', 'border', 'border-slate-700');
    });
    event.currentTarget.classList.remove('bg-slate-900', 'text-slate-300', 'border', 'border-slate-700');
    event.currentTarget.classList.add('bg-amber-500', 'text-white', 'shadow-md', 'shadow-amber-500/20');
}

function filterShops(query) {
    const grid = document.getElementById('shops-grid');
    const cards = grid.children;
    const q = query.toLowerCase();
    
    for (let card of cards) {
        const text = card.innerText.toLowerCase();
        if (text.includes(q)) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    }
}
