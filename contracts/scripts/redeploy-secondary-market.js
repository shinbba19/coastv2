const hre = require("hardhat");

const MUSDT_ADDRESS = process.env.MUSDT_ADDRESS || process.env.NEXT_PUBLIC_MUSDT;
const PROPERTY_TOKEN_ADDRESS = process.env.PROPERTY_TOKEN_ADDRESS;

async function main() {
  if (!MUSDT_ADDRESS || !PROPERTY_TOKEN_ADDRESS) {
    throw new Error("Set MUSDT_ADDRESS and PROPERTY_TOKEN_ADDRESS in contracts/.env");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const SecondaryMarket = await hre.ethers.getContractFactory("SecondaryMarket");
  const market = await SecondaryMarket.deploy(MUSDT_ADDRESS, PROPERTY_TOKEN_ADDRESS);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("New SecondaryMarket deployed to:", marketAddress);

  console.log("\n=== Update your .env.local and Render env vars ===");
  console.log(`NEXT_PUBLIC_SECONDARY_MARKET=${marketAddress}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
