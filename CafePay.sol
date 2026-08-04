// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CafePay {
    
    struct MenuItem {
        uint256 id;
        string name;
        uint256 price; // in USDC (6 decimals)
        bool active;
    }

    struct Shop {
        string shopName;
        address ownerAddress;
        bool exists;
    }

    mapping(address => Shop) public shops;
    mapping(address => MenuItem[]) private shopMenus;

    address[] public allShops;

    event ShopRegistered(address indexed owner, string shopName);
    event MenuItemAdded(address indexed owner, uint256 indexed itemId, string name, uint256 price);
    event ItemPurchased(address indexed buyer, address indexed owner, uint256 indexed itemId, uint256 price);

    function registerShop(string memory _shopName) external {
        require(!shops[msg.sender].exists, "Shop already exists");
        require(bytes(_shopName).length > 0, "Shop name cannot be empty");

        shops[msg.sender] = Shop({
            shopName: _shopName,
            ownerAddress: msg.sender,
            exists: true
        });

        allShops.push(msg.sender);

        emit ShopRegistered(msg.sender, _shopName);
    }

    function addItem(string memory _name, uint256 _price) external {
        require(shops[msg.sender].exists, "Shop does not exist");
        require(bytes(_name).length > 0, "Item name cannot be empty");
        require(_price > 0, "Price must be greater than zero");

        uint256 itemId = shopMenus[msg.sender].length;
        shopMenus[msg.sender].push(MenuItem({
            id: itemId,
            name: _name,
            price: _price,
            active: true
        }));

        emit MenuItemAdded(msg.sender, itemId, _name, _price);
    }

    function getShopMenu(address _shopOwner) external view returns (MenuItem[] memory) {
        return shopMenus[_shopOwner];
    }

    function getAllShops() external view returns (address[] memory) {
        return allShops;
    }

    function buyItem(address _shopOwner, uint256 _itemIndex) external {
        require(shops[_shopOwner].exists, "Shop does not exist");
        require(_itemIndex < shopMenus[_shopOwner].length, "Invalid item index");

        MenuItem memory item = shopMenus[_shopOwner][_itemIndex];
        require(item.active, "Item is not active");

        IERC20 usdc = IERC20(0x3600000000000000000000000000000000000000); 
        bool success = usdc.transferFrom(msg.sender, _shopOwner, item.price);
        require(success, "USDC transfer failed");

        emit ItemPurchased(msg.sender, _shopOwner, _itemIndex, item.price);
    }
}
