"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI,
  PROPERTY_TOKEN_ADDRESS, PROPERTY_TOKEN_FULL_ABI,
  DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI,
  SECONDARY_MARKET_ADDRESS, SECONDARY_MARKET_ABI,
  MUSDT_ADDRESS, ERC20_ABI,
} from "@/lib/contracts";
import { useProperties } from "@/lib/properties";
import { connectWallet, switchToSepolia, getReadProvider } from "@/lib/web3";

export default function PortfolioPage() {
  const { properties } = useProperties();
  const [address, setAddress] = useState(null);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txMsg, setTxMsg] = useState({});
  const [listForm, setListForm] = useState({});

  async function loadPortfolio(addr) {
    if (!FUNDING_VAULT_ADDRESS || !addr) return;
    try {
      const provider = getReadProvider();
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, provider);
      const tokenContract = PROPERTY_TOKEN_ADDRESS
        ? new ethers.Contract(PROPERTY_TOKEN_ADDRESS, PROPERTY_TOKEN_FULL_ABI, provider)
        : null;
      const divVault = DIVIDEND_VAULT_ADDRESS
        ? new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, provider)
        : null;

      const results = [];
      for (const asset of properties) {
        const [campaign, purchased, refunded, claimed] = await Promise.all([
          vault.getCampaign(asset.id),
          vault.getPurchasedTokens(asset.id, addr),
          vault.refundClaimed(asset.id, addr),
          vault.tokensClaimed(asset.id, addr),
        ]);
        const tokenBalance = tokenContract ? await tokenContract.balanceOf(addr, asset.id) : 0n;
        const claimable = divVault ? await divVault.getClaimable(asset.id, addr) : 0n;
        const isApproved = tokenContract && SECONDARY_MARKET_ADDRESS
          ? await tokenContract.isApprovedForAll(addr, SECONDARY_MARKET_ADDRESS)
          : false;

        if (purchased > 0n || tokenBalance > 0n) {
          results.push({ asset, campaign, purchased, refunded, claimed, tokenBalance, claimable, isApproved });
        }
      }
      setPositions(results);
    } catch (err) {
      console.error("Failed to load portfolio:", err);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts[0]) { setAddress(accounts[0]); loadPortfolio(accounts[0]); }
      });
    }
  }, [properties]);

  async function handleConnect() {
    await switchToSepolia();
    const { address: addr } = await connectWallet();
    setAddress(addr);
    loadPortfolio(addr);
  }

  async function doClaimTokens(assetId) {
    setLoading(true);
    setTxMsg((p) => ({ ...p, [assetId]: "Claiming tokens..." }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, signer);
      await (await vault.claimTokens(assetId)).wait();
      setTxMsg((p) => ({ ...p, [assetId]: "Tokens claimed!" }));
      loadPortfolio(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [assetId]: "Error: " + (err.reason || err.message) }));
    } finally { setLoading(false); }
  }

  async function doClaimRefund(assetId) {
    setLoading(true);
    setTxMsg((p) => ({ ...p, [assetId]: "Processing refund..." }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, signer);
      await (await vault.claimRefund(assetId)).wait();
      setTxMsg((p) => ({ ...p, [assetId]: "Refund claimed!" }));
      loadPortfolio(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [assetId]: "Error: " + (err.reason || err.message) }));
    } finally { setLoading(false); }
  }

  async function doClaimDividend(assetId) {
    setLoading(true);
    setTxMsg((p) => ({ ...p, [`div_${assetId}`]: "Claiming dividend..." }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, signer);
      await (await divVault.claimDividend(assetId)).wait();
      setTxMsg((p) => ({ ...p, [`div_${assetId}`]: "Dividend claimed!" }));
      loadPortfolio(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [`div_${assetId}`]: "Error: " + (err.reason || err.message) }));
    } finally { setLoading(false); }
  }

  async function doListForSale(assetId, isApproved) {
    const f = listForm[assetId] || {};
    const amount = parseInt(f.amount);
    const price = f.price;
    if (!amount || amount <= 0 || !price || parseFloat(price) <= 0) {
      setTxMsg((p) => ({ ...p, [`list_${assetId}`]: "Enter valid amount and price." }));
      return;
    }
    setLoading(true);
    setTxMsg((p) => ({ ...p, [`list_${assetId}`]: "" }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const tokenContract = new ethers.Contract(PROPERTY_TOKEN_ADDRESS, PROPERTY_TOKEN_FULL_ABI, signer);
      const market = new ethers.Contract(SECONDARY_MARKET_ADDRESS, SECONDARY_MARKET_ABI, signer);
      const pricePerToken = ethers.parseUnits(price, 6);

      if (!isApproved) {
        setTxMsg((p) => ({ ...p, [`list_${assetId}`]: "Approving marketplace..." }));
        await (await tokenContract.setApprovalForAll(SECONDARY_MARKET_ADDRESS, true)).wait();
      }

      setTxMsg((p) => ({ ...p, [`list_${assetId}`]: "Listing tokens..." }));
      await (await market.listToken(assetId, amount, pricePerToken)).wait();
      setTxMsg((p) => ({ ...p, [`list_${assetId}`]: `Listed ${amount} token(s) at ${price} mUSDT each!` }));
      setListForm((f) => ({ ...f, [assetId]: { amount: "", price: "" } }));
      loadPortfolio(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [`list_${assetId}`]: "Error: " + (err.reason || err.message) }));
    } finally { setLoading(false); }
  }

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">My Portfolio</h1>
        <p className="text-gray-500">Connect your wallet to view your holdings.</p>
        <button onClick={handleConnect} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Portfolio</h1>
        <p className="text-gray-500 mt-1 font-mono text-sm">{address.slice(0, 8)}...{address.slice(-6)}</p>
      </div>

      {positions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          No token purchases found. Head to the{" "}
          <a href="/" className="text-blue-600 underline">Marketplace</a> to invest.
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map(({ asset, campaign, purchased, refunded, claimed, tokenBalance, claimable, isApproved }) => {
            const tokenPrice = Number(campaign.tokenPrice) / 1e6;
            const mUSDTPaid = Number(purchased) * tokenPrice;
            const canClaim = campaign.finalized && campaign.funded && !claimed && purchased > 0n;
            const canRefund = campaign.finalized && !campaign.funded && !refunded && purchased > 0n;
            const claimableAmt = Number(ethers.formatUnits(claimable, 6));
            const heldBalance = Number(tokenBalance);
            const canList = heldBalance > 0 && SECONDARY_MARKET_ADDRESS;
            const f = listForm[asset.id] || {};

            return (
              <div key={asset.id} className="bg-white rounded-2xl border border-gray-100 p-6 flex gap-6">
                <img src={asset.image} alt={asset.name} className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h2 className="font-semibold text-gray-900">{asset.name}</h2>
                      <p className="text-sm text-gray-500">{asset.location}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      campaign.finalized && campaign.funded ? "bg-green-100 text-green-700" :
                      campaign.finalized && !campaign.funded ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {campaign.finalized ? (campaign.funded ? "Funded" : "Failed") : "Active"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                    {purchased > 0n ? (
                      <>
                        <div>
                          <p className="text-gray-400">Tokens Purchased</p>
                          <p className="font-semibold">{Number(purchased).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">mUSDT Paid</p>
                          <p className="font-semibold">{mUSDTPaid.toLocaleString()} mUSDT</p>
                        </div>
                      </>
                    ) : (
                      <div className="col-span-2">
                        <p className="text-gray-400">Source</p>
                        <p className="font-semibold text-purple-700">Secondary Market</p>
                      </div>
                    )}
                    <div>
                      <p className="text-gray-400">Tokens in Wallet</p>
                      <p className="font-semibold">{heldBalance.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Dividends */}
                  {claimableAmt > 0 && (
                    <div className="bg-green-50 rounded-lg p-3 mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-600">Unclaimed Dividends</p>
                        <p className="font-semibold text-green-700">{claimableAmt.toFixed(4)} mUSDT</p>
                      </div>
                      <button onClick={() => doClaimDividend(asset.id)} disabled={loading}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition">
                        Claim
                      </button>
                    </div>
                  )}
                  {txMsg[`div_${asset.id}`] && (
                    <p className={`text-xs mb-2 ${txMsg[`div_${asset.id}`].startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                      {txMsg[`div_${asset.id}`]}
                    </p>
                  )}

                  {/* List for Sale */}
                  {canList && (
                    <div className="bg-purple-50 rounded-lg p-3 mb-3">
                      <p className="text-xs font-medium text-purple-700 mb-2">List Tokens for Sale</p>
                      <div className="flex gap-2 items-center flex-wrap">
                        <input
                          type="number" min="1" max={heldBalance}
                          placeholder="Amount"
                          value={f.amount || ""}
                          onChange={(e) => setListForm((lf) => ({ ...lf, [asset.id]: { ...lf[asset.id], amount: e.target.value } }))}
                          className="w-24 border border-purple-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        />
                        <input
                          type="number" min="0.000001" step="any"
                          placeholder="Price / token (mUSDT)"
                          value={f.price || ""}
                          onChange={(e) => setListForm((lf) => ({ ...lf, [asset.id]: { ...lf[asset.id], price: e.target.value } }))}
                          className="w-44 border border-purple-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
                        />
                        <button
                          onClick={() => doListForSale(asset.id, isApproved)}
                          disabled={loading}
                          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap"
                        >
                          {isApproved ? "List for Sale" : "Approve & List"}
                        </button>
                      </div>
                      {txMsg[`list_${asset.id}`] && (
                        <p className={`text-xs mt-1.5 ${txMsg[`list_${asset.id}`].startsWith("Error") ? "text-red-500" : "text-purple-700"}`}>
                          {txMsg[`list_${asset.id}`]}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Claim / Refund */}
                  <div className="flex gap-3 flex-wrap">
                    {canClaim && (
                      <button onClick={() => doClaimTokens(asset.id)} disabled={loading}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                        Claim Tokens
                      </button>
                    )}
                    {canRefund && (
                      <button onClick={() => doClaimRefund(asset.id)} disabled={loading}
                        className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                        Claim Refund
                      </button>
                    )}
                    {claimed && <span className="text-sm text-green-600 py-2">Tokens claimed ✓</span>}
                    {refunded && <span className="text-sm text-gray-400 py-2">Refund claimed ✓</span>}
                  </div>

                  {txMsg[asset.id] && (
                    <p className={`text-sm mt-2 ${txMsg[asset.id].startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                      {txMsg[asset.id]}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
