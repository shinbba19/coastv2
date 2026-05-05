// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract SecondaryMarket {
    using SafeERC20 for IERC20;

    IERC20 public immutable mUSDT;
    IERC1155 public immutable propertyToken;

    struct Listing {
        address seller;
        uint256 assetId;
        uint256 amount;
        uint256 pricePerToken;
        bool active;
    }

    uint256 public nextListingId;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => uint256[]) private _listingsByAsset;

    event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed assetId, uint256 amount, uint256 pricePerToken);
    event Purchased(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 totalCost);
    event Cancelled(uint256 indexed listingId);

    constructor(address _mUSDT, address _propertyToken) {
        mUSDT = IERC20(_mUSDT);
        propertyToken = IERC1155(_propertyToken);
    }

    function listToken(uint256 assetId, uint256 amount, uint256 pricePerToken) external {
        require(amount > 0, "Amount must be > 0");
        require(pricePerToken > 0, "Price must be > 0");
        require(propertyToken.balanceOf(msg.sender, assetId) >= amount, "Insufficient token balance");
        require(propertyToken.isApprovedForAll(msg.sender, address(this)), "Approve marketplace first");

        uint256 listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            assetId: assetId,
            amount: amount,
            pricePerToken: pricePerToken,
            active: true
        });
        _listingsByAsset[assetId].push(listingId);

        emit Listed(listingId, msg.sender, assetId, amount, pricePerToken);
    }

    function buyListing(uint256 listingId, uint256 amount) external {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(amount > 0 && amount <= listing.amount, "Invalid amount");
        require(msg.sender != listing.seller, "Cannot buy your own listing");

        uint256 cost = amount * listing.pricePerToken;
        listing.amount -= amount;
        if (listing.amount == 0) listing.active = false;

        mUSDT.safeTransferFrom(msg.sender, listing.seller, cost);
        propertyToken.safeTransferFrom(listing.seller, msg.sender, listing.assetId, amount, "");

        emit Purchased(listingId, msg.sender, amount, cost);
    }

    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Not your listing");

        listing.active = false;
        emit Cancelled(listingId);
    }

    function getActiveListings(uint256 assetId) external view returns (uint256[] memory ids, Listing[] memory result) {
        uint256[] storage allIds = _listingsByAsset[assetId];
        uint256 count = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (listings[allIds[i]].active) count++;
        }
        ids = new uint256[](count);
        result = new Listing[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (listings[allIds[i]].active) {
                ids[idx] = allIds[i];
                result[idx] = listings[allIds[i]];
                idx++;
            }
        }
    }
}
