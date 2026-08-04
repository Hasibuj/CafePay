const ARC_CHAIN_CONFIG = {
  chainId: '0x4cef52',
  chainName: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: ['https://rpc.testnet.arc.io', 'https://5042002.rpc.thirdweb.com'],
  blockExplorerUrls: ['https://testnet.arcscan.app']
};

const CONTRACT_ADDRESS = "0x3519D9c9F3ba4416D2A428AC3F80DEa63946B672";
const USDC_ADDRESS     = "0x3600000000000000000000000000000000000000";

const ABI_CAFEPAY = [
  "function registerShop(string memory _shopName) external",
  "function addItem(string memory _name, uint256 _price) external",
  "function buyItem(address _shopOwner, uint256 _itemIndex) external",
  "function getShopMenu(address _shopOwner) external view returns (tuple(uint256 id, string name, uint256 price, bool active)[])",
  "function shops(address) external view returns (string shopName, address ownerAddress, bool exists)"
];

const ABI_ERC20 = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

let provider, signer, userAddress;
let cafePayContract, usdcContract;

const readOnlyProvider = new ethers.JsonRpcProvider(ARC_CHAIN_CONFIG.rpcUrls[0]);
const readOnlyCafePayContract = new ethers.Contract(CONTRACT_ADDRESS, ABI_CAFEPAY, readOnlyProvider);

// Default initial shops
const INITIAL_SHOPS = [
  "0x8c7a4b87da5777b5c9ce8d68292e4d383ecd7b90"
];

// Helper to get all known shop addresses dynamically
function getAllShops() {
  const savedShops = JSON.parse(localStorage.getItem('cafepay_registered_shops') || '[]');
  return Array.from(new Set([...INITIAL_SHOPS, ...savedShops]));
}

// Helper to save a new shop address dynamically
function saveRegisteredShop(address) {
  const shops = JSON.parse(localStorage.getItem('cafepay_registered_shops') || '[]');
  const cleanAddr = ethers.getAddress(address);
  if (!shops.includes(cleanAddr)) {
    shops.push(cleanAddr);
    localStorage.setItem('cafepay_registered_shops', JSON.stringify(shops));
  }
}

// Image uploader with automatic compression to prevent LocalStorage quota errors
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

      img.onerror = function () {
        resolve(null);
      };
    };

    reader.onerror = function () {
      resolve(null);
    };

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
    showStatus("Wallet error: " + err.message, "info");
  }
}

async function switchNetwork() {
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: ARC_CHAIN_CONFIG.chainId }] });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [ARC_CHAIN_CONFIG] });
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
  grid.innerHTML = "<p class='text-slate-500 col-span-3 text-center'>Loading restaurants...</p>";

  const allShopAddresses = getAllShops();
  let shopsHtml = "";

  for (const ownerAddr of allShopAddresses) {
    try {
      const cleanAddr = ethers.getAddress(ownerAddr);
      const shop = await readOnlyCafePayContract.shops(cleanAddr);
      
      if (shop && shop.exists && shop.shopName) {
        const logoUrl = localStorage.getItem(`shop_logo_${cleanAddr}`);
        const logoElement = logoUrl 
          ? `<img src="${logoUrl}" class="w-12 h-12 rounded-xl object-cover border" alt="Logo">`
          : `<div class="text-3xl">☕</div>`;

        shopsHtml += `
          <div onclick="openStorefront('${cleanAddr}')" class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between">
            <div>
              <div class="mb-3">${logoElement}</div>
              <h3 class="shop-title text-xl font-bold text-slate-900">${shop.shopName}</h3>
              <p class="text-xs font-mono text-slate-500 mt-1">${cleanAddr.substring(0, 10)}...</p>
            </div>
            <button class="mt-4 w-full bg-amber-50 text-amber-900 font-semibold py-2 rounded-xl text-sm border border-amber-200 hover:bg-amber-100">View Menu</button>
          </div>
        `;
      }
    } catch (e) {
      console.error("Error loading shop:", ownerAddr, e);
    }
  }

  grid.innerHTML = shopsHtml || "<p class='text-slate-500 col-span-3 text-center'>No restaurants found.</p>";
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

    document.getElementById('cust-shop-name').innerText = shop.shopName || "Shop Not Found";
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
      if (!item.active || isDeleted) return;

      const currentName = localStorage.getItem(`item_name_${cleanOwner}_${item.id}`) || item.name;
      const currentPrice = localStorage.getItem(`item_price_${cleanOwner}_${item.id}`) || ethers.formatUnits(item.price, 6);

      const foodImgUrl = localStorage.getItem(`item_img_${cleanOwner}_${item.id}`);
      const imgElement = foodImgUrl 
        ? `<img src="${foodImgUrl}" class="w-full h-36 object-cover rounded-xl mb-3">`
        : `<div class="w-full h-36 bg-amber-50 rounded-xl mb-3 flex items-center justify-center text-4xl">🍔</div>`;

      const card = document.createElement('div');
      card.className = "bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between";
      card.innerHTML = `
        <div>
          ${imgElement}
          <h4 class="text-lg font-bold text-slate-900">${currentName}</h4>
          <p class="text-amber-700 font-bold mt-1">${currentPrice} USDC</p>
        </div>
        <button onclick="buyItem('${cleanOwner}', ${item.id}, ${ethers.parseUnits(currentPrice, 6)})" class="mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-xl transition">Pay with USDC</button>
      `;
      menuContainer.appendChild(card);
    });
  } catch (err) {
    showStatus("Error loading menu: " + err.message, "info");
  }
}

function openOwnerModal() {
  document.getElementById('owner-modal').classList.remove('hidden');
  if (userAddress) checkOwnerShopStatus();
}

function closeOwnerModal() {
  document.getElementById('owner-modal').classList.add('hidden');
}

async function checkOwnerShopStatus() {
  if (!userAddress) return;
  try {
    const cleanAddress = ethers.getAddress(userAddress);
    const shop = await readOnlyCafePayContract.shops(cleanAddress);

    if (shop.exists) {
      document.getElementById('card-register').classList.add('hidden');
      document.getElementById('card-dashboard').classList.remove('hidden');
      document.getElementById('dash-title').innerText = `Dashboard: ${shop.shopName}`;
      
      const logoUrl = localStorage.getItem(`shop_logo_${cleanAddress}`);
      if (logoUrl) {
        document.getElementById('dash-shop-logo').innerHTML = `<img src="${logoUrl}" class="w-full h-full object-cover">`;
      }

      const storeUrl = `${window.location.origin}${window.location.pathname}?shop=${cleanAddress}`;
      document.getElementById('store-link').href = storeUrl;
      document.getElementById('store-link').innerText = storeUrl;

      document.getElementById('qr-code').innerHTML = "";
      new QRCode(document.getElementById('qr-code'), { text: storeUrl, width: 100, height: 100 });

      loadOwnerManageItemsList(cleanAddress);
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadOwnerManageItemsList(ownerAddr) {
  const container = document.getElementById('owner-menu-manage-list');
  container.innerHTML = "<p class='text-xs text-slate-400'>Loading menu items...</p>";

  try {
    const menu = await readOnlyCafePayContract.getShopMenu(ownerAddr);
    container.innerHTML = "";

    menu.forEach((item) => {
      const isDeleted = localStorage.getItem(`item_deleted_${ownerAddr}_${item.id}`) === 'true';
      if (isDeleted) return;

      const name = localStorage.getItem(`item_name_${ownerAddr}_${item.id}`) || item.name;
      const price = localStorage.getItem(`item_price_${ownerAddr}_${item.id}`) || ethers.formatUnits(item.price, 6);

      const div = document.createElement('div');
      div.className = "p-3 bg-slate-50 border rounded-lg flex items-center justify-between text-xs";
      div.innerHTML = `
        <div>
          <p class="font-bold text-slate-800">${name}</p>
          <p class="text-slate-500">${price} USDC</p>
        </div>
        <div class="flex gap-2">
          <button onclick="editMenuItem(${item.id})" class="px-2 py-1 bg-amber-500 text-white font-semibold rounded hover:bg-amber-600">Edit</button>
          <button onclick="deleteMenuItem(${item.id})" class="px-2 py-1 bg-red-500 text-white font-semibold rounded hover:bg-red-600">Delete</button>
        </div>
      `;
      container.appendChild(div);
    });
  } catch (e) {
    console.error(e);
  }
}

window.editMenuItem = function(itemId) {
  const currentName = localStorage.getItem(`item_name_${userAddress}_${itemId}`) || "";
  const currentPrice = localStorage.getItem(`item_price_${userAddress}_${itemId}`) || "";

  const newName = prompt("Enter new item name:", currentName);
  if (newName === null) return;

  const newPrice = prompt("Enter new item price (USDC):", currentPrice);
  if (newPrice === null) return;

  if (newName.trim()) localStorage.setItem(`item_name_${userAddress}_${itemId}`, newName.trim());
  if (newPrice.trim()) localStorage.setItem(`item_price_${userAddress}_${itemId}`, newPrice.trim());

  showStatus("Item details updated successfully!", "success");
  checkOwnerShopStatus();
};

window.deleteMenuItem = function(itemId) {
  if (confirm("Are you sure you want to delete this menu item?")) {
    localStorage.setItem(`item_deleted_${userAddress}_${itemId}`, 'true');
    showStatus("Item deleted successfully!", "success");
    checkOwnerShopStatus();
  }
};

async function updateShopLogo() {
  if (!userAddress) return alert("Please connect wallet first.");
  
  const logoInput = document.getElementById('update-shop-logo-file');
  if (!logoInput || !logoInput.files[0]) return alert("Please select an image file first.");

  try {
    showStatus("Processing image...", "info");
    const uploadedLogoUrl = await uploadImageFile('update-shop-logo-file');

    if (uploadedLogoUrl) {
      localStorage.setItem(`shop_logo_${userAddress}`, uploadedLogoUrl);
      
      const dashLogo = document.getElementById('dash-shop-logo');
      if (dashLogo) {
        dashLogo.innerHTML = `<img src="${uploadedLogoUrl}" class="w-full h-full object-cover">`;
      }
      
      showStatus("Shop logo updated successfully!", "success");
      loadShopsDirectory();
    } else {
      showStatus("Failed to process image.", "info");
    }
  } catch (err) {
    showStatus("Error: " + err.message, "info");
  }
}

async function registerShop() {
  if (!signer) return alert("Please connect wallet first.");
  const name = document.getElementById('reg-shop-name').value;
  if (!name) return alert("Enter shop name.");

  try {
    const uploadedLogoUrl = await uploadImageFile('reg-shop-logo-file');

    showStatus("Registering shop on blockchain...", "info");
    const tx = await cafePayContract.registerShop(name);
    await tx.wait();

    saveRegisteredShop(userAddress);

    if (uploadedLogoUrl) {
      localStorage.setItem(`shop_logo_${userAddress}`, uploadedLogoUrl);
    }

    showStatus("Shop registered successfully!", "success");
    checkOwnerShopStatus();
    loadShopsDirectory();
  } catch (err) {
    showStatus(err.message, "info");
  }
}

async function addItem() {
  if (!signer) return alert("Please connect wallet first.");
  const name = document.getElementById('item-name').value;
  const priceStr = document.getElementById('item-price').value;

  if (!name || !priceStr) return alert("Fill in item details.");

  try {
    const uploadedFoodImgUrl = await uploadImageFile('item-image-file');

    showStatus("Adding item to blockchain...", "info");
    const tx = await cafePayContract.addItem(name, ethers.parseUnits(priceStr, 6));
    await tx.wait();

    const menu = await cafePayContract.getShopMenu(userAddress);
    const newItemId = menu.length - 1;

    if (uploadedFoodImgUrl && newItemId >= 0) {
      localStorage.setItem(`item_img_${userAddress}_${newItemId}`, uploadedFoodImgUrl);
    }

    showStatus("Item added successfully!", "success");
    checkOwnerShopStatus();
  } catch (err) {
    showStatus("Error: " + err.message, "info");
  }
}

window.buyItem = async function(shopOwner, itemId, price) {
  if (!signer) {
    alert("Connect wallet first.");
    await connectWallet();
    if (!signer) return;
  }

  try {
    showStatus("1/2: Checking USDC allowance...", "info");
    const allowance = await usdcContract.allowance(userAddress, CONTRACT_ADDRESS);
    if (allowance < price) {
      showStatus("1/2: Approving USDC...", "info");
      const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, price);
      await approveTx.wait();
    }

    showStatus("2/2: Confirming payment...", "info");
    const buyTx = await cafePayContract.buyItem(shopOwner, itemId);
    await buyTx.wait();

    showStatus("Payment Successful!", "success");
  } catch (err) {
    showStatus("Transaction failed: " + err.message, "info");
  }
};

function showStatus(msg, statusClass) {
  const el = document.getElementById('status-bar');
  el.innerText = msg;
  el.classList.remove('hidden');
}
