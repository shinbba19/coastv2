"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI,
  MUSDT_ADDRESS, ERC20_ABI,
  DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI,
  SALE_VOTING_ADDRESS, SALE_VOTING_ABI,
} from "@/lib/contracts";
import { getProperties } from "@/lib/properties";
import { connectWallet, switchToSepolia, formatDeadline, getReadProvider } from "@/lib/web3";

const PLATFORM_FEE_PERCENT = 2.5;

export default function AssetDetailClient({ id }) {
  const assetId = parseInt(id);

  const [asset, setAsset] = useState(null);
  const [assetLoaded, setAssetLoaded] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [purchased, setPurchased] = useState(0n);
  const [musdtBalance, setMusdtBalance] = useState(null);
  const [claimable, setClaimable] = useState(null);
  const [address, setAddress] = useState(null);
  const [tokenAmount, setTokenAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [txMsg, setTxMsg] = useState("");
  const [divMsg, setDivMsg] = useState("");

  const [divHistory, setDivHistory] = useState([]);

  // Sale voting state
  const [proposal, setProposal] = useState(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [proposePrice, setProposePrice] = useState("");
  const [voteMsg, setVoteMsg] = useState("");
  const [voteLoading, setVoteLoading] = useState(false);

  useEffect(() => {
    const props = getProperties();
    setAsset(props.find((a) => a.id === assetId) || null);
    setAssetLoaded(true);
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

      if (DIVIDEND_VAULT_ADDRESS) {
        try {
          const eventProvider = (typeof window !== "undefined" && window.ethereum)
            ? new ethers.BrowserProvider(window.ethereum)
            : new ethers.JsonRpcProvider("https://rpc.sepolia.org");
          const dvEvents = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, eventProvider);
          const logs = await dvEvents.queryFilter(dvEvents.filters.RevenueDeposited(assetId));
          const history = await Promise.all(logs.map(async (e) => {
            let date = null;
            try { const blk = await eventProvider.getBlock(e.blockNumber); date = blk?.timestamp ? new Date(Number(blk.timestamp) * 1000) : null; } catch {}
            return { amount: Number(ethers.formatUnits(e.args[1], 6)), date, txHash: e.transactionHash, blockNumber: e.blockNumber };
          }));
          setDivHistory(history.reverse());
        } catch { setDivHistory([]); }
      }

      if (SALE_VOTING_ADDRESS) {
        const sv = new ethers.Contract(SALE_VOTING_ADDRESS, SALE_VOTING_ABI, provider);
        const prop = await sv.getProposal(assetId);
        setProposal(prop);
        if (addr) {
          const voted = await sv.hasVoted(assetId, addr);
          setAlreadyVoted(voted);
        }
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

  async function addToMetaMask() {
    if (!window.ethereum || !PROPERTY_TOKEN_ADDRESS) return;
    try {
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: { type: "ERC1155", options: { address: PROPERTY_TOKEN_ADDRESS, tokenId: String(assetId) } },
      });
    } catch (err) {
      console.error("wallet_watchAsset failed:", err);
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

  async function handleProposeSale() {
    const price = ethers.parseUnits(proposePrice || "0", 6);
    setVoteLoading(true);
    setVoteMsg("");
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const sv = new ethers.Contract(SALE_VOTING_ADDRESS, SALE_VOTING_ABI, signer);
      await (await sv.proposeSale(assetId, price)).wait();
      setVoteMsg("Proposal submitted!");
      setProposePrice("");
      loadData(address);
    } catch (err) {
      setVoteMsg("Error: " + (err.reason || err.message));
    } finally {
      setVoteLoading(false);
    }
  }

  async function handleVote(approve) {
    setVoteLoading(true);
    setVoteMsg("");
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const sv = new ethers.Contract(SALE_VOTING_ADDRESS, SALE_VOTING_ABI, signer);
      await (await sv.voteSale(assetId, approve)).wait();
      setVoteMsg(approve ? "Voted Yes!" : "Voted No.");
      loadData(address);
    } catch (err) {
      setVoteMsg("Error: " + (err.reason || err.message));
    } finally {
      setVoteLoading(false);
    }
  }

  if (!assetLoaded) return <div className="text-center py-20 text-gray-400">Loading...</div>;
  if (!asset) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <p className="text-4xl">🏗️</p>
      <h2 className="text-xl font-semibold text-gray-800">Property not found</h2>
      <p className="text-sm text-gray-400">Asset #{assetId} doesn't exist or was removed.</p>
      <a href="/" className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-semibold transition">
        Back to Marketplace
      </a>
    </div>
  );

  const deadlinePassed = campaign && Number(campaign.deadline) * 1000 < Date.now();
  const investorsFull = campaign && campaign.maxInvestors > 0n && campaign.investorCount >= campaign.maxInvestors;
  const saleApproved = proposal?.approved;
  const propertyClosed = proposal?.closed;
  const canBuy = campaign && campaign.deadline !== 0n && !campaign.finalized && !deadlinePassed
    && (!investorsFull || purchased > 0n) && !saleApproved;
  const tokenPrice = campaign ? Number(campaign.tokenPrice) / 1e6 : 0;
  const totalSupply = campaign ? Number(campaign.totalSupply) : 0;
  const soldTokens = campaign && campaign.tokenPrice > 0n
    ? Math.floor(Number(campaign.currentAmount) / Number(campaign.tokenPrice))
    : 0;
  const availableTokens = totalSupply - soldTokens;
  const cost = tokenAmount && campaign ? (parseInt(tokenAmount) || 0) * tokenPrice : 0;

  // Sale voting derived values
  const proposalActive = proposal && proposal.deadline > 0n && Number(proposal.deadline) * 1000 > Date.now() && !proposal.approved;
  const proposalExpired = proposal && proposal.deadline > 0n && Number(proposal.deadline) * 1000 <= Date.now() && !proposal.approved;
  const isCoOwner = purchased > 0n; // vault purchaser; secondary holders also qualify via on-chain check

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Sale approved / archived banner */}
      {propertyClosed && (
        <div className="bg-gray-100 border border-gray-300 rounded-2xl p-4 text-center">
          <p className="font-semibold text-gray-600">Property Archived</p>
          <p className="text-sm text-gray-400 mt-1">This property has been transferred at กรมที่ดิน and is no longer active.</p>
        </div>
      )}
      {saleApproved && !propertyClosed && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-center">
          <p className="font-semibold text-amber-800">Sale Approved — Pending กรมที่ดิน Transfer</p>
          <p className="text-sm text-amber-600 mt-1">All co-owners should go to the Land Department to complete the real-world transfer.</p>
        </div>
      )}

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
              <div className="grid grid-cols-4 gap-3 mb-4">
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
                <div className={`rounded-xl p-3 text-center ${investorsFull ? "bg-red-50" : "bg-gray-50"}`}>
                  <p className="text-xs text-gray-400 mb-1">Co-owners</p>
                  <p className={`font-bold ${investorsFull ? "text-red-600" : "text-gray-900"}`}>
                    {Number(campaign.investorCount)} / {Number(campaign.maxInvestors)}
                  </p>
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

              {campaign.finalized && campaign.funded && (() => {
                const totalRaised = Number(ethers.formatUnits(campaign.currentAmount, 6));
                const fee = totalRaised * PLATFORM_FEE_PERCENT / 100;
                const sellerReceives = totalRaised - fee;
                return (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4 text-sm">
                    <p className="font-medium text-amber-800 mb-2">Fundraising Settlement</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-gray-600">
                        <span>Total Raised</span>
                        <span className="font-semibold">{totalRaised.toLocaleString()} mUSDT</span>
                      </div>
                      <div className="flex justify-between text-amber-700">
                        <span>Platform Fee ({PLATFORM_FEE_PERCENT}%)</span>
                        <span className="font-semibold">− {fee.toLocaleString()} mUSDT</span>
                      </div>
                      <div className="flex justify-between text-green-700 border-t border-amber-200 pt-1 mt-1">
                        <span className="font-medium">Seller Receives</span>
                        <span className="font-bold">{sellerReceives.toLocaleString()} mUSDT</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-400">Your Tokens</p>
                        <p className="font-semibold text-blue-700">
                          {Number(purchased).toLocaleString()} tokens
                          <span className="text-gray-400 font-normal ml-2">
                            ({(Number(purchased) * tokenPrice).toLocaleString()} mUSDT paid)
                          </span>
                        </p>
                      </div>
                      <button onClick={addToMetaMask}
                        className="text-xs text-orange-500 hover:text-orange-700 transition flex items-center gap-1 flex-shrink-0">
                        <span>🦊</span> Add to MetaMask
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-gray-50 rounded-lg p-4 text-gray-500 text-sm mb-6">
              No active campaign for this property.
            </div>
          )}

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
              {txMsg === "Purchase successful!" && (
                <button onClick={addToMetaMask}
                  className="w-full border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-600 py-2 rounded-xl text-sm font-medium transition flex items-center justify-center gap-2">
                  <span>🦊</span> Add token to MetaMask
                </button>
              )}
            </div>
          ) : investorsFull && purchased === 0n && !saleApproved ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-sm font-medium text-red-700">Co-owner limit reached</p>
              <p className="text-xs text-red-500 mt-1">This property has reached its maximum number of co-owners ({Number(campaign?.maxInvestors)}).</p>
            </div>
          ) : campaign && campaign.finalized && !campaign.funded && purchased > 0n ? (
            <p className="text-center text-sm text-gray-500">
              Campaign failed. Go to <a href="/portfolio" className="text-blue-600 underline">Portfolio</a> to claim your refund.
            </p>
          ) : null}
        </div>
      </div>

      {/* Sale Voting Panel */}
      {SALE_VOTING_ADDRESS && campaign && campaign.finalized && campaign.funded && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Co-owner Sale Agreement</h2>
          <p className="text-xs text-gray-400 mb-4">Majority vote required to collectively sell this property at กรมที่ดิน.</p>

          {propertyClosed ? (
            <div className="text-center py-4 text-gray-400 text-sm">This property has been archived.</div>
          ) : saleApproved ? (
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="font-semibold text-amber-800">Sale Approved</p>
              <p className="text-sm text-amber-600 mt-1">
                {Number(proposal.yesVotes)} / {totalSupply} co-owners agreed.
                Suggested price: {Number(ethers.formatUnits(proposal.suggestedPrice, 6)).toLocaleString()} mUSDT
              </p>
              <p className="text-xs text-amber-500 mt-2">Go to กรมที่ดิน to complete the transfer. Admin will archive the property afterward.</p>
            </div>
          ) : proposalActive ? (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>{Number(proposal.yesVotes)} yes · {Number(proposal.noVotes)} no</span>
                  <span>Expires {formatDeadline(proposal.deadline)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-green-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${totalSupply > 0 ? Math.min(100, (Number(proposal.yesVotes) / totalSupply) * 100) : 0}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Suggested price: {Number(ethers.formatUnits(proposal.suggestedPrice, 6)).toLocaleString()} mUSDT · Need majority ({Math.floor(totalSupply / 2) + 1} votes)
                </p>
              </div>
              {address && isCoOwner && !alreadyVoted && (
                <div className="flex gap-3">
                  <button onClick={() => handleVote(true)} disabled={voteLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-xl text-sm font-semibold transition">
                    Agree to Sell
                  </button>
                  <button onClick={() => handleVote(false)} disabled={voteLoading}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 py-2 rounded-xl text-sm font-semibold transition">
                    Decline
                  </button>
                </div>
              )}
              {alreadyVoted && <p className="text-sm text-center text-gray-500">You have already voted on this proposal.</p>}
              {!address && <p className="text-sm text-center text-gray-400">Connect wallet to vote.</p>}
              {voteMsg && <p className={`text-sm text-center ${voteMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{voteMsg}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {proposalExpired && <p className="text-xs text-gray-400 text-center">Previous proposal expired without majority. A new one can be submitted.</p>}
              {address && isCoOwner ? (
                <>
                  <div className="flex gap-3">
                    <input type="number" min="0" value={proposePrice}
                      onChange={(e) => setProposePrice(e.target.value)}
                      placeholder="Suggested total price (mUSDT)"
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                  <button onClick={handleProposeSale} disabled={voteLoading || !proposePrice}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                    {voteLoading ? "Submitting..." : "Propose Collective Sale"}
                  </button>
                  {voteMsg && <p className={`text-sm text-center ${voteMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{voteMsg}</p>}
                </>
              ) : (
                <p className="text-sm text-center text-gray-400">Only co-owners can propose a sale.</p>
              )}
            </div>
          )}
        </div>
      )}
      {/* Revenue Distributions */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Revenue Distributions</h2>
        <p className="text-xs text-gray-400 mb-4">Rental income deposited on-chain and distributed to token holders.</p>
        {divHistory.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No distributions yet.</p>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {divHistory.map((item, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-green-700">{divHistory.length - i}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {item.date
                        ? item.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : `Block ${item.blockNumber.toLocaleString()}`}
                    </p>
                    {totalSupply > 0 && (
                      <p className="text-xs text-gray-400">{(item.amount / totalSupply).toFixed(4)} mUSDT / token</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-green-600">{item.amount.toLocaleString()} mUSDT</p>
                  <a href={`https://sepolia.etherscan.io/tx/${item.txHash}`} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-700 transition">Tx ↗</a>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-500">Total Distributed</span>
              <span className="font-bold text-green-700">
                {divHistory.reduce((s, d) => s + d.amount, 0).toLocaleString()} mUSDT
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
