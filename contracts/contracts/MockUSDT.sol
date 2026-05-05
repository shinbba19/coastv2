// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDT is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e6; // 10,000 mUSDT per claim
    uint256 public constant COOLDOWN = 24 hours;

    mapping(address => uint256) public lastFaucetTime;

    event FaucetClaimed(address indexed user, uint256 amount);

    constructor() ERC20("Mock USDT", "mUSDT") Ownable(msg.sender) {
        _mint(msg.sender, 10_000_000 * 1e6); // 10M to deployer
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        require(
            block.timestamp >= lastFaucetTime[msg.sender] + COOLDOWN,
            "Cooldown: wait 24h between claims"
        );
        lastFaucetTime[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    function cooldownRemaining(address user) external view returns (uint256) {
        uint256 next = lastFaucetTime[user] + COOLDOWN;
        if (block.timestamp >= next) return 0;
        return next - block.timestamp;
    }
}
