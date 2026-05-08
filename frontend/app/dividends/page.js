"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI,
  DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI,
  PROPERTY_TOKEN_ADDRESS, PROPERTY_TOKEN_FULL_ABI,
} from "@/lib/contracts";
import { useProperties } from "@/lib/properties";
import { connectWallet, switchToSepolia, getReadProvider } from "@/lib/web3";

export default function DividendsPage() {
  const { properties } = useProperties();
  const [address, setAddress] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txMsg, setTxMsg] = useState({});
  const [claimAllMsg, setClaimAllMsg] = useState("");

  async function loadDividends(addr) {
    if (!DIVIDEND_VAULT_ADDRESS) return;
    try {
      const provider = getReadProvider();
      const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, provider);
      const vault = FUNDING_VAULT_ADDRESS
        ? new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, provider)
        : null;
      const tokenContract = PROPERTY_TOKEN_ADDRESS
        ? new ethers.Contract(PROPERTY_TOKEN_ADDRESS, PROPERTY_TOKEN_FULL_ABI, provider)
        : null;

      const results = [];
      for (const asset of properties) {
        const [totalDeposited, campaign, claimableRaw, tokenBalance] = await Promise.all([
          divVault.totalDeposited(asset.id),
          vault ? vault.getCampaign(asset.id) : Promise.resolve(null),
          addr ? divVault.getClaimable(asset.id, addr) : Promise.resolve(0n),
          addr && tokenContract ? tokenContract.balanceOf(addr, asset.id) : Promise.resolve(0n),
        ]);

        const totalDep = Number(ethers.formatUnits(totalDeposited, 6));
        const claimable = Number(ethers.formatUnits(claimableRaw, 6));
        const tokenBal = Number(tokenBalance);
        const totalSupply = campaign ? Number(campaign.totalSupply) : 0;
        const sharePercent = totalSupply > 0 ? (tokenBal / totalSupply) * 100 : 0;

        if (totalDep > 0 || tokenBal > 0) {
          results.push({ asset, totalDeposited: totalDep, claimable, tokenBalance: tokenBal, totalSupply, sharePercent });
        }
      }
      setRows(results);
    } catch (err) {
      console.error("Failed to load dividends:", err);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts[0]) { setAddress(accounts[0]); loadDividends(accounts[0]); }
        else loadDividends(null);
      });
    } else {
      loadDividends(null);
    }
  }, [properties]);

  async function handleConnect() {
    await switchToSepolia();
    const { address: addr } = await connectWallet();
    setAddress(addr);
    loadDividends(addr);
  }

  async function claimOne(assetId) {
    setLoading(true);
    setTxMsg((p) => ({ ...p, [assetId]: "Claiming..." }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, signer);
      await (await divVault.claimDividend(assetId)).wait();
      setTxMsg((p) => ({ ...p, [assetId]: "Claimed!" }));
      loadDividends(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [assetId]: "Error: " + (err.reason || err.message) }));
    } finally { setLoading(false); }
  }

  async function claimAll() {
    const claimable = rows.filter((r) => r.claimable > 0);
    if (!claimable.length) return;
    setLoading(true);
    setClaimAllMsg("Claiming all...");
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, signer);
      for (const { asset } of claimable) {
        setClaimAllMsg(`Claiming ${asset.name}...`);
        await (await divVault.claimDividend(asset.id)).wait();
      }
      setClaimAllMsg("All dividends claimed!");
      loadDividends(address);
    } catch (err) {
      setClaimAllMsg("Error: " + (err.reason || err.message));
    } finally { setLoading(false); }
  }

  const totalClaimable = rows.reduce((s, r) => s + r.claimable, 0);
  const hasClaimable = totalClaimable > 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dividends</h1>
          <p className="text-gray-500 mt-1">Rental income distributed to token holders.</p>
        </div>
        {address && (
          <div className="flex items-center gap-3">
            {hasClaimable && (
              <span className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1.5 rounded-full">
                {totalClaimable.toFixed(4)} mUSDT available
              </span>
            )}
            <button
              onClick={claimAll}
              disabled={loading || !hasClaimable}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-sm font-semibold transition"
            >
              {loading ? "Processing..." : "Claim All"}
            </button>
          </div>
        )}
      </div>

      {claimAllMsg && (
        <p className={`text-sm mb-4 ${claimAllMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
          {claimAllMsg}
        </p>
      )}

      {/* Not connected */}
      {!address ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-4">
          <p className="text-gray-400">Connect your wallet to see your dividend earnings.</p>
          <button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition">
            Connect Wallet
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          No dividend distributions found yet. Revenue will appear here once admin deposits rental income.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-400 mb-1">Total Distributed (All Properties)</p>
              <p className="text-xl font-bold text-gray-900">
                {rows.reduce((s, r) => s + r.totalDeposited, 0).toLocaleString()}
                <span className="text-sm font-normal text-gray-500 ml-1">mUSDT</span>
              </p>
            </div>
            <div>
              <p className="text-gray-400 mb-1">Your Total Claimable</p>
              <p className={`text-xl font-bold ${hasClaimable ? "text-green-600" : "text-gray-400"}`}>
                {totalClaimable.toFixed(4)}
                <span className="text-sm font-normal text-gray-500 ml-1">mUSDT</span>
              </p>
            </div>
            <div>
              <p className="text-gray-400 mb-1">Properties with Holdings</p>
              <p className="text-xl font-bold text-gray-900">
                {rows.filter((r) => r.tokenBalance > 0).length}
                <span className="text-sm font-normal text-gray-500 ml-1">/ {rows.length}</span>
              </p>
            </div>
          </div>

          {/* Per-property rows */}
          {rows.map(({ asset, totalDeposited, claimable, tokenBalance, totalSupply, sharePercent }) => (
            <div key={asset.id} className="bg-white rounded-2xl border border-gray-100 p-6 flex gap-5">
              <img src={asset.image} alt={asset.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="font-semibold text-gray-900">{asset.name}</h2>
                    <p className="text-xs text-gray-400">{asset.location}</p>
                  </div>
                  {tokenBalance > 0 ? (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                      {tokenBalance} token{tokenBalance !== 1 ? "s" : ""} held
                    </span>
                  ) : (
                    <span className="text-xs bg-gray-100 text-gray-400 px-2 py-1 rounded-full">No tokens</span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                  <div>
                    <p className="text-gray-400">Total Distributed</p>
                    <p className="font-semibold">{totalDeposited.toLocaleString()} mUSDT</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Your Share</p>
                    <p className="font-semibold">
                      {tokenBalance > 0
                        ? `${sharePercent.toFixed(1)}% (${tokenBalance}/${totalSupply})`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Claimable Now</p>
                    <p className={`font-semibold ${claimable > 0 ? "text-green-600" : "text-gray-400"}`}>
                      {claimable > 0 ? `${claimable.toFixed(4)} mUSDT` : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {claimable > 0 ? (
                    <button
                      onClick={() => claimOne(asset.id)}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                    >
                      Claim {claimable.toFixed(4)} mUSDT
                    </button>
                  ) : tokenBalance > 0 ? (
                    <span className="text-sm text-gray-400">Nothing to claim</span>
                  ) : (
                    <a href={`/asset/${asset.id}`} className="text-sm text-blue-600 hover:text-blue-800 transition">
                      Buy tokens to earn dividends →
                    </a>
                  )}
                  {txMsg[asset.id] && (
                    <span className={`text-sm ${txMsg[asset.id].startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                      {txMsg[asset.id]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
