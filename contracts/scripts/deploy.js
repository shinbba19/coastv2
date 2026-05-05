const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. MockUSDT (our own with faucet)
  const MockUSDT = await hre.ethers.getContractFactory("MockUSDT");
  const mockUSDT = await MockUSDT.deploy();
  await mockUSDT.waitForDeployment();
  console.log("MockUSDT deployed to:", await mockUSDT.getAddress());

  // 2. PropertyToken
  const PropertyToken = await hre.ethers.getContractFactory("PropertyToken");
  const propertyToken = await PropertyToken.deploy();
  await propertyToken.waitForDeployment();
  console.log("PropertyToken deployed to:", await propertyToken.getAddress());

  // 3. FundingVault (uses our MockUSDT)
  const FundingVault = await hre.ethers.getContractFactory("FundingVault");
  const fundingVault = await FundingVault.deploy(await mockUSDT.getAddress());
  await fundingVault.waitForDeployment();
  console.log("FundingVault deployed to:", await fundingVault.getAddress());

  // 4. DividendVault
  const DividendVault = await hre.ethers.getContractFactory("DividendVault");
  const dividendVault = await DividendVault.deploy(
    await mockUSDT.getAddress(),
    await propertyToken.getAddress()
  );
  await dividendVault.waitForDeployment();
  console.log("DividendVault deployed to:", await dividendVault.getAddress());

  // Wire up
  await propertyToken.setFundingVault(await fundingVault.getAddress());
  await fundingVault.setPropertyToken(await propertyToken.getAddress());
  console.log("Contracts wired up.");

  console.log("\n=== Deployment Summary ===");
  console.log("MockUSDT:      ", await mockUSDT.getAddress());
  console.log("PropertyToken: ", await propertyToken.getAddress());
  console.log("FundingVault:  ", await fundingVault.getAddress());
  console.log("DividendVault: ", await dividendVault.getAddress());
}

main().catch((err) => { console.error(err); process.exit(1); });
