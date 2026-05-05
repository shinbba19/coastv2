const hre = require("hardhat");

// Reuse existing contracts, only redeploy FundingVault
const MUSDT_ADDRESS = process.env.MUSDT_ADDRESS || process.env.NEXT_PUBLIC_MUSDT;
const PROPERTY_TOKEN_ADDRESS = process.env.PROPERTY_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_PROPERTY_TOKEN;

async function main() {
  if (!MUSDT_ADDRESS || !PROPERTY_TOKEN_ADDRESS) {
    throw new Error("Set MUSDT_ADDRESS and PROPERTY_TOKEN_ADDRESS in contracts/.env");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Deploy new FundingVault
  const FundingVault = await hre.ethers.getContractFactory("FundingVault");
  const fundingVault = await FundingVault.deploy(MUSDT_ADDRESS);
  await fundingVault.waitForDeployment();
  const vaultAddress = await fundingVault.getAddress();
  console.log("New FundingVault deployed to:", vaultAddress);

  // Wire: FundingVault -> PropertyToken
  await fundingVault.setPropertyToken(PROPERTY_TOKEN_ADDRESS);
  console.log("FundingVault wired to PropertyToken.");

  // Wire: PropertyToken -> new FundingVault (so it can mint)
  const PropertyToken = await hre.ethers.getContractAt("PropertyToken", PROPERTY_TOKEN_ADDRESS);
  await PropertyToken.setFundingVault(vaultAddress);
  console.log("PropertyToken updated to point to new FundingVault.");

  console.log("\n=== Update your .env.local ===");
  console.log(`NEXT_PUBLIC_FUNDING_VAULT=${vaultAddress}`);
  console.log("\nAll other addresses stay the same.");
}

main().catch((err) => { console.error(err); process.exit(1); });
