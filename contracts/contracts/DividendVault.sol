// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPropertyToken {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function totalMinted(uint256 assetId) external view returns (uint256);
}

contract DividendVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable mUSDT;
    IPropertyToken public immutable propertyToken;

    // assetId => cumulative dividend per token (scaled by 1e18)
    mapping(uint256 => uint256) public dividendPerShare;
    // assetId => user => dividendPerShare already accounted for
    mapping(uint256 => mapping(address => uint256)) public claimedPerShare;
    // assetId => total revenue deposited
    mapping(uint256 => uint256) public totalDeposited;

    event RevenueDeposited(uint256 indexed assetId, uint256 amount);
    event DividendClaimed(uint256 indexed assetId, address indexed user, uint256 amount);

    constructor(address _mUSDT, address _propertyToken) Ownable(msg.sender) {
        mUSDT = IERC20(_mUSDT);
        propertyToken = IPropertyToken(_propertyToken);
    }

    // Admin: deposit rental/revenue income for an asset
    function depositRevenue(uint256 assetId, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        uint256 supply = propertyToken.totalMinted(assetId);
        require(supply > 0, "No tokens minted for this asset");

        mUSDT.safeTransferFrom(msg.sender, address(this), amount);
        dividendPerShare[assetId] += (amount * 1e18) / supply;
        totalDeposited[assetId] += amount;

        emit RevenueDeposited(assetId, amount);
    }

    // Token holder: claim accumulated dividends
    function claimDividend(uint256 assetId) external {
        uint256 claimable = getClaimable(assetId, msg.sender);
        require(claimable > 0, "Nothing to claim");

        claimedPerShare[assetId][msg.sender] = dividendPerShare[assetId];
        mUSDT.safeTransfer(msg.sender, claimable);

        emit DividendClaimed(assetId, msg.sender, claimable);
    }

    function getClaimable(uint256 assetId, address user) public view returns (uint256) {
        uint256 tokenBalance = propertyToken.balanceOf(user, assetId);
        if (tokenBalance == 0) return 0;
        uint256 pending = dividendPerShare[assetId] - claimedPerShare[assetId][user];
        return (pending * tokenBalance) / 1e18;
    }

    function getDividendPerShare(uint256 assetId) external view returns (uint256) {
        return dividendPerShare[assetId];
    }
}
