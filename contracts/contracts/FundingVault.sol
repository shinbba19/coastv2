// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPropertyToken {
    function mint(address to, uint256 assetId, uint256 amount) external;
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

contract FundingVault is Ownable, IERC1155Receiver {
    using SafeERC20 for IERC20;

    IERC20 public immutable mUSDT;
    IPropertyToken public propertyToken;

    struct Campaign {
        uint256 targetAmount;
        uint256 currentAmount;
        uint256 tokenPrice;   // mUSDT per token (6 decimals)
        uint256 totalSupply;  // total tokens in vault
        uint256 deadline;
        bool funded;
        bool finalized;
        bool fundsReleased;
    }

    mapping(uint256 => Campaign) public campaigns;
    // assetId => investor => tokens purchased
    mapping(uint256 => mapping(address => uint256)) public purchasedTokens;
    mapping(uint256 => mapping(address => bool)) public refundClaimed;
    mapping(uint256 => mapping(address => bool)) public tokensClaimed;

    event CampaignCreated(uint256 indexed assetId, uint256 targetAmount, uint256 tokenPrice, uint256 totalSupply, uint256 deadline);
    event TokensPurchased(uint256 indexed assetId, address indexed buyer, uint256 tokenAmount, uint256 cost);
    event CampaignFinalized(uint256 indexed assetId, bool funded);
    event TokensClaimed(uint256 indexed assetId, address indexed investor, uint256 amount);
    event RefundClaimed(uint256 indexed assetId, address indexed investor, uint256 amount);
    event FundsReleased(uint256 indexed assetId, uint256 amount);

    constructor(address _mUSDT) Ownable(msg.sender) {
        mUSDT = IERC20(_mUSDT);
    }

    function setPropertyToken(address _propertyToken) external onlyOwner {
        propertyToken = IPropertyToken(_propertyToken);
    }

    // Admin: create campaign + tokenize (mint tokens to vault)
    function createCampaign(
        uint256 assetId,
        uint256 targetAmount,
        uint256 totalSupply,
        uint256 duration
    ) external onlyOwner {
        require(campaigns[assetId].deadline == 0, "Campaign already exists");
        require(targetAmount > 0 && totalSupply > 0 && duration > 0, "Invalid params");
        require(address(propertyToken) != address(0), "PropertyToken not set");

        uint256 tokenPrice = targetAmount / totalSupply;
        require(tokenPrice > 0, "Token price rounds to zero");

        campaigns[assetId] = Campaign({
            targetAmount: targetAmount,
            currentAmount: 0,
            tokenPrice: tokenPrice,
            totalSupply: totalSupply,
            deadline: block.timestamp + duration,
            funded: false,
            finalized: false,
            fundsReleased: false
        });

        // Tokenize first: mint all tokens to this vault
        propertyToken.mint(address(this), assetId, totalSupply);

        emit CampaignCreated(assetId, targetAmount, tokenPrice, totalSupply, block.timestamp + duration);
    }

    // Investor: buy tokens at fixed price
    function buyTokens(uint256 assetId, uint256 tokenAmount) external {
        Campaign storage c = campaigns[assetId];
        require(c.deadline > 0, "Campaign does not exist");
        require(block.timestamp < c.deadline, "Deadline passed");
        require(!c.finalized, "Campaign already finalized");
        require(tokenAmount > 0, "Amount must be > 0");

        uint256 cost = tokenAmount * c.tokenPrice;
        require(c.currentAmount + cost <= c.targetAmount, "Exceeds available supply");

        mUSDT.safeTransferFrom(msg.sender, address(this), cost);
        purchasedTokens[assetId][msg.sender] += tokenAmount;
        c.currentAmount += cost;

        emit TokensPurchased(assetId, msg.sender, tokenAmount, cost);
    }

    // Admin: finalize after deadline OR when fully funded
    function finalizeCampaign(uint256 assetId) external onlyOwner {
        Campaign storage c = campaigns[assetId];
        require(c.deadline > 0, "Campaign does not exist");
        require(block.timestamp >= c.deadline || c.currentAmount >= c.targetAmount, "Deadline not passed and target not reached");
        require(!c.finalized, "Already finalized");

        c.finalized = true;
        c.funded = c.currentAmount >= c.targetAmount;

        emit CampaignFinalized(assetId, c.funded);
    }

    // Investor: claim tokens after success
    function claimTokens(uint256 assetId) external {
        Campaign storage c = campaigns[assetId];
        require(c.finalized && c.funded, "Campaign not successful");
        require(!tokensClaimed[assetId][msg.sender], "Tokens already claimed");

        uint256 amount = purchasedTokens[assetId][msg.sender];
        require(amount > 0, "No tokens purchased");

        tokensClaimed[assetId][msg.sender] = true;
        propertyToken.safeTransferFrom(address(this), msg.sender, assetId, amount, "");

        emit TokensClaimed(assetId, msg.sender, amount);
    }

    // Investor: claim refund after failure
    function claimRefund(uint256 assetId) external {
        Campaign storage c = campaigns[assetId];
        require(c.finalized && !c.funded, "Campaign did not fail");
        require(!refundClaimed[assetId][msg.sender], "Refund already claimed");

        uint256 tokenAmount = purchasedTokens[assetId][msg.sender];
        require(tokenAmount > 0, "Nothing to refund");

        uint256 refundAmount = tokenAmount * c.tokenPrice;
        refundClaimed[assetId][msg.sender] = true;
        mUSDT.safeTransfer(msg.sender, refundAmount);

        emit RefundClaimed(assetId, msg.sender, refundAmount);
    }

    // Admin: withdraw mUSDT after success
    function releaseFunds(uint256 assetId) external onlyOwner {
        Campaign storage c = campaigns[assetId];
        require(c.finalized && c.funded, "Campaign not successful");
        require(!c.fundsReleased, "Funds already released");

        c.fundsReleased = true;
        mUSDT.safeTransfer(owner(), c.currentAmount);

        emit FundsReleased(assetId, c.currentAmount);
    }

    function getCampaign(uint256 assetId) external view returns (Campaign memory) {
        return campaigns[assetId];
    }

    function getPurchasedTokens(uint256 assetId, address investor) external view returns (uint256) {
        return purchasedTokens[assetId][investor];
    }

    // ERC-1155 receiver hooks (required to hold ERC-1155 tokens)
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId;
    }
}
