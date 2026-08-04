// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract MultiShopCoffee {
    // USDC Token Address on Arc Network (Configure as needed)
    address public immutable usdcToken;

    struct Item {
        uint256 id;
        string name;
        uint256 price; // USDC amount in micro-units (6 decimals: 1 USDC = 1,000,000)
        bool active;
    }

    struct Shop {
        string shopName;
        address ownerAddress;
        bool exists;
    }

    // Storage Mappings
    mapping(address => Shop) public shops;
    mapping(address => Item[]) private shopMenus;

    // Events
    event ShopRegistered(address indexed owner, string shopName);
    event ItemAdded(address indexed owner, uint256 indexed itemId, string name, uint256 price);
    event ItemPurchased(address indexed customer, address indexed shopOwner, uint256 indexed itemId, uint256 price);

    constructor(address _usdcToken) {
        require(_usdcToken != address(0), "Invalid token address");
        usdcToken = _usdcToken;
    }

    modifier onlyShopOwner() {
        require(shops[msg.sender].exists, "Shop not registered");
        _;
    }

    /// @notice Registers a new shop linked to msg.sender
    function registerShop(string memory _shopName) external {
        require(!shops[msg.sender].exists, "Shop already registered for this address");
        require(bytes(_shopName).length > 0, "Shop name required");

        shops[msg.sender] = Shop({
            shopName: _shopName,
            ownerAddress: msg.sender,
            exists: true
        });

        emit ShopRegistered(msg.sender, _shopName);
    }

    /// @notice Adds an item to the calling shop owner's menu
    function addItem(string memory _name, uint256 _price) external onlyShopOwner {
        require(bytes(_name).length > 0, "Item name required");
        require(_price > 0, "Price must be greater than zero");

        uint256 itemId = shopMenus[msg.sender].length;
        shopMenus[msg.sender].push(Item({
            id: itemId,
            name: _name,
            price: _price,
            active: true
        }));

        emit ItemAdded(msg.sender, itemId, _name, _price);
    }

    /// @notice Purchases an item; transfers USDC directly from customer to shop owner
    function buyItem(address _shopOwner, uint256 _itemIndex) external {
        require(shops[_shopOwner].exists, "Target shop does not exist");
        require(_itemIndex < shopMenus[_shopOwner].length, "Item index out of bounds");
        
        Item memory item = shopMenus[_shopOwner][_itemIndex];
        require(item.active, "Item is no longer available");

        // Execute direct ERC-20 transfer from buyer to shop owner
        bool success = IERC20(usdcToken).transferFrom(msg.sender, _shopOwner, item.price);
        require(success, "USDC transfer failed");

        emit ItemPurchased(msg.sender, _shopOwner, _itemIndex, item.price);
    }

    /// @notice Retrieves the full menu for a specific shop owner address
    function getShopMenu(address _shopOwner) external view returns (Item[] memory) {
        require(shops[_shopOwner].exists, "Shop does not exist");
        return shopMenus[_shopOwner];
    }
}
