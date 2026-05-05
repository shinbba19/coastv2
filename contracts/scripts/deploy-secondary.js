const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Use already-deployed addresses from .env
  const mUSDT = process.env.MUSDT_ADDRESS;
  const propertyToken = process.env.PROPERTY_TOKEN_ADDRESS;

  if (!mUSDT || !propertyToken) {
    throw new Error("Set MUSDT_ADDRESS and PROPERTY_TOKEN_ADDRESS in contracts/.env");
  }

  const SecondaryMarket = await hre.ethers.getContractFactory("SecondaryMarket");
  const market = await SecondaryMarket.deploy(mUSDT, propertyToken);
  await market.waitForDeployment();

  const address = await market.getAddress();
  console.log("SecondaryMarket deployed to:", address);
  console.log("\nAdd to frontend/.env.local:");
  console.log(`NEXT_PUBLIC_SECONDARY_MARKET=${address}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
