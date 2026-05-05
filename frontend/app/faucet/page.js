"use client";
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { MUSDT_ADDRESS, MUSDT_ABI } from "@/lib/contracts";
import { connectWallet, switchToSepolia, getReadProvider } from "@/lib/web3";

export default function FaucetPage() {
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [cooldown, setCooldown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [txMsg, setTxMsg] = useState("");

  const loadData = useCallback(async (addr) => {
    if (!MUSDT_ADDRESS || !addr) return;
    try {
      const musdt = new ethers.Contract(MUSDT_ADDRESS, MUSDT_ABI, getReadProvider());
      const [bal, cd] = await Promise.all([
        musdt.balanceOf(addr),
        musdt.cooldownRemaining(addr),
      ]);
      setBalance(Number(ethers.formatUnits(bal, 6)));
      setCooldown(Number(cd));
    } catch (err) {
      console.error("Failed to load faucet data:", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts[0]) { setAddress(accounts[0]); loadData(accounts[0]); }
      });
    }
  }, [loadData]);

  // Countdown timer
  useEffect(() => {
    if (!cooldown || cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleConnect() {
    await switchToSepolia();
    const { address: addr } = await connectWallet();
    setAddress(addr);
    loadData(addr);
  }

  async function handleFaucet() {
    setLoading(true);
    setTxMsg("");
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const musdt = new ethers.Contract(MUSDT_ADDRESS, MUSDT_ABI, signer);
      setTxMsg("Claiming 10,000 mUSDT...");
      const tx = await musdt.faucet();
      await tx.wait();
      setTxMsg("10,000 mUSDT claimed!");
      loadData(address);
    } catch (err) {
      setTxMsg("Error: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  }

  function formatCooldown(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m}m ${s}s`;
  }

  const canClaim = cooldown !== null && cooldown === 0;

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">mUSDT Faucet</h1>
        <p className="text-gray-500 mt-2">Get 10,000 mUSDT every 24 hours to test the platform.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        {!address ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-500 mb-6">Connect your wallet to claim test mUSDT.</p>
            <button onClick={handleConnect}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition">
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-400 mb-1">Your mUSDT Balance</p>
              <p className="text-2xl font-bold text-gray-900">
                {balance !== null ? balance.toLocaleString() : "—"}{" "}
                <span className="text-lg font-normal text-gray-500">mUSDT</span>
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-mono mb-4">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                {address.slice(0, 8)}...{address.slice(-6)}
              </div>
            </div>

            {cooldown !== null && cooldown > 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                <p className="text-sm text-yellow-700 font-medium">Next claim available in</p>
                <p className="text-2xl font-bold text-yellow-800 mt-1 font-mono">{formatCooldown(cooldown)}</p>
              </div>
            ) : (
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-sm text-blue-700">Ready to claim <strong>10,000 mUSDT</strong></p>
              </div>
            )}

            <button
              onClick={handleFaucet}
              disabled={loading || !canClaim}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition"
            >
              {loading ? "Claiming..." : canClaim ? "Claim 10,000 mUSDT" : "On Cooldown"}
            </button>

            {txMsg && (
              <p className={`text-sm text-center ${txMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                {txMsg}
              </p>
            )}

            <p className="text-xs text-gray-400 text-center">
              Faucet resets every 24 hours. These are testnet tokens with no real value.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
