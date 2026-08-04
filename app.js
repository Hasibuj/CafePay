// --- Configuration for Arc Network & Contracts ---
const ARC_CHAIN_CONFIG = {
  chainId: '0x4cef52', // Hexadecimal value of Chain ID 5042002
  chainName: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: [
    'https://rpc.testnet.arc.io',         // Primary (Circle) RPC
    'https://5042002.rpc.thirdweb.com',   // Thirdweb RPC
    'https://rpc.drpc.testnet.arc.io'     // dRPC
  ],
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

// --- Global State ---
let provider, signer, userAddress;
let cafePayContract, usdcContract;

// --- Initialize App ---
window.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-connect').addEventListener('click', connectWallet);
  document.getElementById('btn-register').addEventListener('click', registerShop);
  document.getElementById('btn-add-item').addEventListener('click', addItem);
});

async function connectWallet() {
  if (!window.ethereum) return alert("MetaMask is required to use CaféPay.");

  try {
    await switchNetwork();
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    
    // Checksum Error এড়ানোর জন্য Address ফরম্যাট করা হলো
    const rawAddress = await signer.getAddress();
    userAddress = ethers.getAddress(rawAddress);

    document.getElementById('btn-connect').innerText = `${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
    
    cafePayContract = new ethers.Contract(CONTRACT_ADDRESS, ABI_CAFEPAY, signer);
    usdcContract = new ethers.Contract(USDC_ADDRESS, ABI_ERC20, signer);

    routeView();
  } catch (err) {
    showStatus("Wallet connection failed: " + err.message, "info");
  }
}

// --- Network Switcher Logic ---
async function switchNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_CHAIN_CONFIG.chainId }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [ARC_CHAIN_CONFIG],
      });
    } else {
      throw switchError;
    }
  }
}

// --- Routing & UI Display Logic ---
async function routeView() {
  const urlParams = new URLSearchParams(window.location.search);
  const shopOwnerParam = urlParams.get('shop');

  if (shopOwnerParam) {
    // Render Customer View
    document.getElementById('view-customer').classList.remove('hidden');
    loadCustomerStorefront(shopOwnerParam);
  } else {
    // Render Shop Owner View
    document.getElementById('view-owner').classList.remove('hidden');
    loadOwnerDashboard();
  }
}

// --- Shop Owner Functions ---
async function loadOwnerDashboard() {
  try {
    const cleanAddress = ethers.getAddress(userAddress);
    const shop = await cafePayContract.shops(cleanAddress);

    if (shop.exists) {
      document.getElementById('card-register').classList.add('hidden');
      document.getElementById('card-dashboard').classList.remove('hidden');
      document.getElementById('dash-title').innerText = `Dashboard: ${shop.shopName}`;

      const storeUrl = `${window.location.origin}${window.location.pathname}?shop=${cleanAddress}`;
      const linkElem = document.getElementById('store-link');
      linkElem.href = storeUrl;
      linkElem.innerText = storeUrl;

      // Render QR Code
      document.getElementById('qr-code').innerHTML = "";
      new QRCode(document.getElementById('qr-code'), {
        text: storeUrl,
        width: 128,
        height: 128
      });
    }
  } catch (err) {
    showStatus("Error loading dashboard: " + err.message, "info");
  }
}

async function registerShop() {
  const name = document.getElementById('reg-shop-name').value;
  if (!name) return alert("Please enter a shop name");

  try {
    showStatus("Registering shop on Arc Network...", "info");
    const tx = await cafePayContract.registerShop(name);
    await tx.wait();
    showStatus("Shop registered successfully!", "success");
    loadOwnerDashboard();
  } catch (err) {
    showStatus(err.reason || err.message, "info");
  }
}

async function addItem() {
  const name = document.getElementById('item-name').value;
  const priceStr = document.getElementById('item-price').value;
  if (!name || !priceStr) return alert("Fill in item details");

  // Convert USDC unit (6 Decimal Precision)
  const priceInMicroUSDC = ethers.parseUnits(priceStr, 6);

  try {
    showStatus("Adding item to contract...", "info");
    const tx = await cafePayContract.addItem(name, priceInMicroUSDC);
    await tx.wait();
    showStatus("Item added successfully!", "success");
  } catch (err) {
    showStatus(err.reason || err.message, "info");
  }
}

// --- Customer Functions ---
async function loadCustomerStorefront(shopOwner) {
  try {
    // shopOwner এড্রেস সঠিক Checksum-এ রূপান্তর
    const cleanOwner = ethers.getAddress(shopOwner);
    const shop = await cafePayContract.shops(cleanOwner);

    if (!shop.exists) {
      document.getElementById('cust-shop-name').innerText = "Shop Not Found";
      return;
    }

    document.getElementById('cust-shop-name').innerText = shop.shopName;
    document.getElementById('cust-shop-owner').innerText = `Owner: ${shop.ownerAddress}`;

    const menu = await cafePayContract.getShopMenu(cleanOwner);
    const menuContainer = document.getElementById('customer-menu');
    menuContainer.innerHTML = "";

    menu.forEach((item) => {
      if (!item.active) return;
      const formattedPrice = ethers.formatUnits(item.price, 6);

      const card = document.createElement('div');
      card.className = 'menu-item';
      card.innerHTML = `
        <div>
          <h4>${item.name}</h4>
          <p><strong>${formattedPrice} USDC</strong></p>
        </div>
        <button onclick="buyItem('${cleanOwner}', ${item.id}, ${item.price})">Pay with USDC</button>
      `;
      menuContainer.appendChild(card);
    });
  } catch (err) {
    showStatus("Failed loading storefront: " + err.message, "info");
  }
}

// 2-Step Payment Protocol: USDC Approve -> Execute Buy
window.buyItem = async function(shopOwner, itemId, price) {
  if (!signer) return alert("Please connect wallet first.");

  try {
    const cleanOwner = ethers.getAddress(shopOwner);

    // Step 1: Check Allowance & Approve
    showStatus("Step 1/2: Checking USDC allowance...", "info");
    const allowance = await usdcContract.allowance(userAddress, CONTRACT_ADDRESS);
    
    if (allowance < price) {
      showStatus("Step 1/2: Approving USDC transfer...", "info");
      const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, price);
      await approveTx.wait();
    }

    // Step 2: Execute Purchase
    showStatus("Step 2/2: Confirming item purchase...", "info");
    const buyTx = await cafePayContract.buyItem(cleanOwner, itemId);
    await buyTx.wait();

    showStatus("Payment Successful! Order placed.", "success");
  } catch (err) {
    showStatus("Transaction failed: " + (err.reason || err.message), "info");
  }
};

function showStatus(msg, statusClass) {
  const el = document.getElementById('status-bar');
  el.className = `status-${statusClass}`;
  el.innerText = msg;
  el.classList.remove('hidden');
}
