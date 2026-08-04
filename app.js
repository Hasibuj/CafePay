// Default initial shops (can be empty or contain seed addresses)
const INITIAL_SHOPS = [
  "0x8c7a4b87da5777b5c9ce8d68292e4d383ecd7b90"
];

// Helper to get all known shop addresses dynamically
function getAllShops() {
  const savedShops = JSON.parse(localStorage.getItem('cafepay_registered_shops') || '[]');
  // Merge initial shops with locally saved registered shops (remove duplicates)
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

async function loadShopsDirectory() {
  const grid = document.getElementById('shops-grid');
  grid.innerHTML = "<p class='text-slate-500 col-span-3 text-center'>Loading restaurants...</p>";

  const allShopAddresses = getAllShops();
  let shopsHtml = "";

  for (const ownerAddr of allShopAddresses) {
    try {
      const shop = await readOnlyCafePayContract.shops(ownerAddr);
      if (shop.exists) {
        const logoUrl = localStorage.getItem(`shop_logo_${ownerAddr}`);
        const logoElement = logoUrl 
          ? `<img src="${logoUrl}" class="w-12 h-12 rounded-xl object-cover border" alt="Logo">`
          : `<div class="text-3xl">☕</div>`;

        shopsHtml += `
          <div onclick="openStorefront('${ownerAddr}')" class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between">
            <div>
              <div class="mb-3">${logoElement}</div>
              <h3 class="shop-title text-xl font-bold text-slate-900">${shop.shopName}</h3>
              <p class="text-xs font-mono text-slate-500 mt-1">${ownerAddr.substring(0, 10)}...</p>
            </div>
            <button class="mt-4 w-full bg-amber-50 text-amber-900 font-semibold py-2 rounded-xl text-sm border border-amber-200 hover:bg-amber-100">View Menu</button>
          </div>
        `;
      }
    } catch (e) {
      console.error(e);
    }
  }

  grid.innerHTML = shopsHtml || "<p class='text-slate-500 col-span-3 text-center'>No restaurants found.</p>";
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

    // Automatically save newly registered shop address to directory
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
