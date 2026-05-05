// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PropertyToken is ERC1155, Ownable {
    address public fundingVault;

    // assetId => total minted
    mapping(uint256 => uint256) public totalMinted;

    event Minted(address indexed to, uint256 indexed assetId, uint256 amount);

    constructor() ERC1155("") Ownable(msg.sender) {}

    function setFundingVault(address _vault) external onlyOwner {
        fundingVault = _vault;
    }

    function mint(address to, uint256 assetId, uint256 amount) external {
        require(msg.sender == fundingVault, "Only FundingVault can mint");
        totalMinted[assetId] += amount;
        _mint(to, assetId, amount, "");
        emit Minted(to, assetId, amount);
    }

    function uri(uint256 assetId) public pure override returns (string memory) {
        return string(abi.encodePacked("https://coast-v2.vercel.app/api/token/", _toString(assetId)));
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
