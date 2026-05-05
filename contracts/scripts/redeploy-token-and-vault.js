const hre = require("hardhat");

const MUSDT_ADDRESS = process.env.MUSDT_ADDRESS || process.env.NEXT_PUBLIC_MUSDT;

async function main() {
  if (!MUSDT_ADDRESS) throw new Error("Set MUSDT_ADDRESS in contracts/.env");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Deploy new PropertyToken
  const PropertyToken = await hre.ethers.getContractFactory("PropertyToken");
  const propertyToken = await PropertyToken.deploy();
  await propertyToken.waitForDeployment();
  const tokenAddress = await propertyToken.getAddress();
  console.log("New PropertyToken deployed to:", tokenAddress);

  // Deploy new FundingVault
  const FundingVault = await hre.ethers.getContractFactory("FundingVault");
  const fundingVault = await FundingVault.deploy(MUSDT_ADDRESS);
  await fundingVault.waitForDeployment();
  const vaultAddress = await fundingVault.getAddress();
  console.log("New FundingVault deployed to:", vaultAddress);

  // Wire both ways
  await fundingVault.setPropertyToken(tokenAddress);
  console.log("FundingVault wired to PropertyToken.");

  await propertyToken.setFundingVault(vaultAddress);
  console.log("PropertyToken wired to FundingVault.");

  console.log("\n=== Update your .env.local and Render env vars ===");
  console.log(`NEXT_PUBLIC_PROPERTY_TOKEN=${tokenAddress}`);
  console.log(`NEXT_PUBLIC_FUNDING_VAULT=${vaultAddress}`);
  console.log("\nMockUSDT, DividendVault, SecondaryMarket stay the same.");
}

main().catch((err) => { console.error(err); process.exit(1); });
