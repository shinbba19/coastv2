"use client";
import { ethers } from "ethers";

// For reads: always uses Alchemy directly (unaffected by MetaMask's selected network)
export function getReadProvider() {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  if (rpc) return new ethers.JsonRpcProvider(rpc);
  if (typeof window !== "undefined" && window.ethereum)
    return new ethers.BrowserProvider(window.ethereum);
  throw new Error("No RPC provider available");
}

export async function getProvider() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask not found. Please install MetaMask.");
  }
  return new ethers.BrowserProvider(window.ethereum);
}

export async function connectWallet() {
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export async function switchToSepolia() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }], // Sepolia
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0xaa36a7",
          chainName: "Sepolia Testnet",
          rpcUrls: ["https://rpc.sepolia.org"],
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        }],
      });
    }
  }
}

export function formatUSDT(amount) {
  return (Number(ethers.formatUnits(amount, 6)) / 1000).toFixed(1) + "K USDT";
}

export function parseUSDT(amount) {
  return ethers.parseUnits(amount.toString(), 6);
}

export function formatProgress(current, target) {
  if (target === 0n) return 0;
  return Math.min(100, Number((current * 100n) / target));
}

export function formatDeadline(timestamp) {
  if (!timestamp || timestamp === 0n) return "—";
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function isDeadlinePassed(timestamp) {
  return Number(timestamp) * 1000 < Date.now();
}
