"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { connectWallet, switchToSepolia, getReadProvider } from "@/lib/web3";
import { MUSDT_ADDRESS, ERC20_ABI } from "@/lib/contracts";

async function fetchBalance(address) {
  try {
    const musdt = new ethers.Contract(MUSDT_ADDRESS, ERC20_ABI, getReadProvider());
    const bal = await musdt.balanceOf(address);
    return Number(ethers.formatUnits(bal, 6)).toLocaleString();
  } catch {
    return null;
  }
}

export default function WalletButton({ onConnect }) {
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  async function updateBalance(addr) {
    if (!addr) return;
    const bal = await fetchBalance(addr);
    setBalance(bal);
  }

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts[0]) {
          setAddress(accounts[0]);
          onConnect?.(accounts[0]);
          updateBalance(accounts[0]);
        }
      });
      window.ethereum.on("accountsChanged", (accounts) => {
        setAddress(accounts[0] || null);
        onConnect?.(accounts[0] || null);
        updateBalance(accounts[0] || null);
      });
    }
  }, []);

  async function handleConnect() {
    setLoading(true);
    try {
      await switchToSepolia();
      const { address: addr } = await connectWallet();
      setAddress(addr);
      onConnect?.(addr);
      updateBalance(addr);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (address) {
    return (
      <div className="flex items-center gap-3">
        {balance !== null && (
          <div className="text-sm text-gray-600 bg-gray-100 px-3 py-2 rounded-lg">
            <span className="text-gray-400">mUSDT</span>{" "}
            <span className="font-semibold text-gray-800">{balance}</span>
          </div>
        )}
        <div className="flex items-center gap-2 bg-green-100 text-green-800 px-3 py-2 rounded-lg text-sm font-mono">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          {address.slice(0, 6)}...{address.slice(-4)}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
    >
      {loading ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
