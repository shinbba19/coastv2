"use client";
import { useState, useEffect, use } from "react";
import { ethers } from "ethers";
import {
  FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI,
  MUSDT_ADDRESS, ERC20_ABI,
  DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI,
  SECONDARY_MARKET_ADDRESS, SECONDARY_MARKET_ABI,
} from "@/lib/contracts";
import { getProperties } from "@/lib/properties";
import { connectWallet, switchToSepolia, formatDeadline, getReadProvider } from "@/lib/web3";

export default function AssetDetailPage({ params }) {
  const { id } = use(params);
  const assetId = parseInt(id);

  const [asset, setAsset] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [purchased, setPurchased] = useState(0n);
  const [musdtBalance, setMusdtBalance] = useState(null);
  const [claimable, setClaimable] = useState(null);
  const [listings, setListings] = useState([]);
  const [address, setAddress] = useState(null);
  const [tokenAmount, setTokenAmount] = useState("");
  const [buyQty, setBuyQty] = useState({});
  const [loading, setLoading] = useState(false);
  const [txMsg, setTxMsg] = useState("");
  const [divMsg, setDivMsg] = useState("");
  const [buyMsg, setBuyMsg] = useState({});

  useEffect(() => {
    const props = getProperties();
    setAsset(props.find((a) => a.id === assetId) || null);
  }, [assetId]);

  async function loadData(addr) {
    if (!FUNDING_VAULT_ADDRESS) return;
    try {
      const provider = getReadProvider();
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, provider);
      const musdt = new ethers.Contract(MUSDT_ADDRESS, ERC20_ABI, provider);
      const [c, p, bal] = await Promise.all([
        vault.getCampaign(assetId),
        addr ? vault.getPurchasedTokens(assetId, addr) : Promise.resolve(0n),
        addr ? musdt.balanceOf(addr) : Promise.resolve(null),
      ]);
      setCampaign(c);
      setPurchased(p);
      if (bal !== null) setMusdtBalance(Number(ethers.formatUnits(bal, 6)));

      if (addr && DIVIDEND_VAULT_ADDRESS) {
        const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, provider);
        const cl = await divVault.getClaimable(assetId, addr);
        setClaimable(Number(ethers.formatUnits(cl, 6)));
      }

      if (SECONDARY_MARKET_ADDRESS) {
        const market = new ethers.Contract(SECONDARY_MARKET_ADDRESS, SECONDARY_MARKET_ABI, provider);
        const [ids, result] = await market.getActiveListings(assetId);
        setListings(ids.map((id, i) => ({ id: Number(id), ...result[i] })));
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        const addr = accounts[0] || null;
        setAddress(addr);
        loadData(addr);
      });
    } else {
      loadData(null);
    }
  }, [assetId]);

  async function handleConnect() {
    await switchToSepolia();
    const { address: addr } = await connectWallet();
    setAddress(addr);
    loadData(addr);
  }

  async function handleBuy() {
    const qty = parseInt(tokenAmount);
    if (!qty || qty <= 0) return alert("Enter a valid token amount");
    setLoading(true);
    setTxMsg("");
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const cost = BigInt(qty) * campaign.tokenPrice;
      const musdt = new ethers.Contract(MUSDT_ADDRESS, ERC20_ABI, signer);
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, signer);
      const signerAddr = await signer.getAddress();
      const allowance = await musdt.allowance(signerAddr, FUNDING_VAULT_ADDRESS);
      if (allowance < cost) {
        setTxMsg("Approving mUSDT...");
        await (await musdt.approve(FUNDING_VAULT_ADDRESS, cost)).wait();
      }
      setTxMsg("Buying tokens...");
      await (await vault.buyTokens(assetId, qty)).wait();
      setTxMsg("Purchase successful!");
      setTokenAmount("");
      loadData(address);
    } catch (err) {
      setTxMsg("Error: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleClaimDividend() {
    setDivMsg("Claiming dividend...");
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, signer);
      await (await divVault.claimDividend(assetId)).wait();
      setDivMsg("Dividend claimed!");
      loadData(address);
    } catch (err) {
      setDivMsg("Error: " + (err.reason || err.message));
    }
  }

  async function handleBuyListing(listingId, pricePerToken, maxAmount) {
    const qty = parseInt(buyQty[listingId] || "1");
    if (!qty || qty <= 0 || qty > maxAmount) {
      setBuyMsg((p) => ({ ...p, [listingId]: "Invalid quantity." }));
      return;
    }
    setBuyMsg((p) => ({ ...p, [listingId]: "Approving mUSDT..." }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const cost = BigInt(qty) * pricePerToken;
      const musdt = new ethers.Contract(MUSDT_ADDRESS, ERC20_ABI, signer);
      const market = new ethers.Contract(SECONDARY_MARKET_ADDRESS, SECONDARY_MARKET_ABI, signer);
      const signerAddr = await signer.getAddress();
      const allowance = await musdt.allowance(signerAddr, SECONDARY_MARKET_ADDRESS);
      if (allowance < cost) {
        await (await musdt.approve(SECONDARY_MARKET_ADDRESS, cost)).wait();
      }
      setBuyMsg((p) => ({ ...p, [listingId]: "Buying..." }));
      await (await market.buyListing(listingId, qty)).wait();
      setBuyMsg((p) => ({ ...p, [listingId]: "Purchased!" }));
      setBuyQty((q) => ({ ...q, [listingId]: "" }));
      loadData(address);
    } catch (err) {
      setBuyMsg((p) => ({ ...p, [listingId]: "Error: " + (err.reason || err.message) }));
    }
  }

  if (!asset) return <div className="text-center py-20 text-gray-500">Asset not found.</div>;

  const deadlinePassed = campaign && Number(campaign.deadline) * 1000 < Date.now();
  const canBuy = campaign && campaign.deadline !== 0n && !campaign.finalized && !deadlinePassed;
  const tokenPrice = campaign ? Number(campaign.tokenPrice) / 1e6 : 0;
  const totalSupply = campaign ? Number(campaign.totalSupply) : 0;
  const soldTokens = campaign && campaign.tokenPrice > 0n
    ? Math.floor(Number(campaign.currentAmount) / Number(campaign.tokenPrice))
    : 0;
  const availableTokens = totalSupply - soldTokens;
  const cost = tokenAmount && campaign ? (parseInt(tokenAmount) || 0) * tokenPrice : 0;
  const myListings = listings.filter((l) => address && l.seller.toLowerCase() === address.toLowerCase());
  const otherListings = listings.filter((l) => !address || l.seller.toLowerCase() !== address.toLowerCase());

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <img src={asset.image} alt={asset.name} className="w-full h-64 object-cover" />
        <div className="p-8">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-gray-900">{asset.name}</h1>
            <p className="text-gray-500">{asset.location}</p>
            {(() => {
              const targetMUSDT = asset.targetAmount
                ?? (campaign && campaign.deadline !== 0n && campaign.targetAmount > 0n ? Math.round(Number(campaign.targetAmount) / 1e6) : null);
              const thbVal = asset.thbPrice ?? (targetMUSDT ? Math.round(targetMUSDT * 30) : null);
              if (!targetMUSDT && !thbVal) return null;
              return (
                <div className="flex items-center gap-3 mt-2">
                  {thbVal && <span className="text-sm font-semibold text-amber-700">฿{thbVal.toLocaleString()}</span>}
                  {thbVal && targetMUSDT && <span className="text-sm text-gray-500">·</span>}
                  {targetMUSDT && <span className="text-sm text-blue-700 font-medium">{targetMUSDT.toLocaleString()} mUSDT target</span>}
                  <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">1 mUSDT = 30 THB</span>
                </div>
              );
            })()}
          </div>
          <p className="text-gray-600 mb-6">{asset.description}</p>

          {campaign && campaign.deadline !== 0n ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Total Tokens</p>
                  <p className="font-bold text-gray-900">{totalSupply.toLocaleString()}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Price / Token</p>
                  <p className="font-bold text-blue-600">{tokenPrice.toLocaleString()} mUSDT</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Available</p>
                  <p className="font-bold text-gray-900">{availableTokens.toLocaleString()}</p>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>{soldTokens.toLocaleString()} tokens sold</span>
                  <span>Goal: {totalSupply.toLocaleString()} tokens</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-blue-500 h-3 rounded-full transition-all"
                    style={{ width: `${totalSupply > 0 ? Math.min(100, (soldTokens / totalSupply) * 100) : 0}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-6">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-400">Deadline</p>
                  <p className="font-medium">{formatDeadline(campaign.deadline)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-400">Status</p>
                  <p className="font-medium">
                    {campaign.finalized
                      ? campaign.funded ? "Funded ✓" : "Failed ✗"
                      : deadlinePassed ? "Awaiting finalization" : "Active"}
                  </p>
                </div>
                {address && purchased > 0n && (
                  <div className="bg-blue-50 rounded-lg p-3 col-span-2">
                    <p className="text-gray-400">Your Tokens</p>
                    <p className="font-semibold text-blue-700">
                      {Number(purchased).toLocaleString()} tokens
                      <span className="text-gray-400 font-normal ml-2">
                        ({(Number(purchased) * tokenPrice).toLocaleString()} mUSDT paid)
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 text-gray-500 text-sm mb-6">
              No active campaign for this property.
            </div>
          )}

          {/* Dividends */}
          {address && claimable !== null && claimable > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-800">Unclaimed Dividends</p>
                  <p className="text-xl font-bold text-green-700">{claimable.toFixed(4)} mUSDT</p>
                </div>
                <button onClick={handleClaimDividend}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                  Claim Dividend
                </button>
              </div>
              {divMsg && (
                <p className={`text-sm mt-2 ${divMsg.startsWith("Error") ? "text-red-500" : "text-green-700"}`}>{divMsg}</p>
              )}
            </div>
          )}

          {/* Primary market buy */}
          {!address ? (
            <button onClick={handleConnect} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition">
              Connect Wallet to Buy Tokens
            </button>
          ) : canBuy ? (
            <div className="space-y-3">
              {musdtBalance !== null && (
                <div className="flex justify-between text-sm bg-gray-50 rounded-xl px-4 py-2">
                  <span className="text-gray-400">Your mUSDT balance</span>
                  <span className={`font-semibold ${cost > musdtBalance ? "text-red-500" : "text-gray-800"}`}>
                    {musdtBalance.toLocaleString()} mUSDT{cost > musdtBalance && " (insufficient)"}
                  </span>
                </div>
              )}
              <div className="flex gap-3">
                <input type="number" min="1" value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  placeholder="Number of tokens"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {cost > 0 && (
                  <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-700 font-semibold whitespace-nowrap">
                    = {cost.toLocaleString()} mUSDT
                  </div>
                )}
              </div>
              <button onClick={handleBuy} disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition">
                {loading ? "Processing..." : "Approve & Buy Tokens"}
              </button>
              {txMsg && (
                <p className={`text-sm text-center ${txMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{txMsg}</p>
              )}
            </div>
          ) : campaign && campaign.finalized && !campaign.funded && purchased > 0n ? (
            <p className="text-center text-sm text-gray-500">
              Campaign failed. Go to <a href="/portfolio" className="text-blue-600 underline">Portfolio</a> to claim your refund.
            </p>
          ) : null}
        </div>
      </div>

      {/* Secondary Market */}
      {SECONDARY_MARKET_ADDRESS && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Secondary Market</h2>
          <p className="text-xs text-gray-400 mb-4">Buy tokens from existing holders.</p>

          <div className="space-y-3">
            {listings.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No listings yet. Token holders can list from their Portfolio.</p>
            )}
            {otherListings.map((listing) => {
              const priceEach = Number(ethers.formatUnits(listing.pricePerToken, 6));
              const qty = parseInt(buyQty[listing.id] || "1") || 1;
              const totalCost = qty * priceEach;
              return (
                <div key={listing.id} className="flex items-center gap-4 bg-gray-50 rounded-xl p-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{Number(listing.amount).toLocaleString()} tokens available</p>
                    <p className="text-xs text-gray-500">
                      {priceEach.toLocaleString()} mUSDT/token · Seller: {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="1" max={Number(listing.amount)}
                      value={buyQty[listing.id] || ""}
                      onChange={(e) => setBuyQty((q) => ({ ...q, [listing.id]: e.target.value }))}
                      placeholder="Qty"
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                    <span className="text-xs text-purple-700 font-semibold whitespace-nowrap">
                      = {totalCost.toLocaleString()} mUSDT
                    </span>
                    <button
                      onClick={() => handleBuyListing(listing.id, listing.pricePerToken, Number(listing.amount))}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap"
                    >
                      Buy
                    </button>
                  </div>
                </div>
              );
            })}

            {myListings.map((listing) => {
              const priceEach = Number(ethers.formatUnits(listing.pricePerToken, 6));
              return (
                <div key={listing.id} className="flex items-center gap-4 bg-purple-50 border border-purple-100 rounded-xl p-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-purple-900">Your listing · {Number(listing.amount).toLocaleString()} tokens</p>
                    <p className="text-xs text-purple-500">{priceEach.toLocaleString()} mUSDT/token</p>
                  </div>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Active</span>
                </div>
              );
            })}
          </div>

          {Object.entries(buyMsg).map(([lid, msg]) =>
            msg ? (
              <p key={lid} className={`text-xs mt-2 ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
