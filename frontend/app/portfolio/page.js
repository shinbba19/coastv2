"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI,
  PROPERTY_TOKEN_ADDRESS, PROPERTY_TOKEN_FULL_ABI,
  DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI,
  SALE_VOTING_ADDRESS, SALE_VOTING_ABI,
} from "@/lib/contracts";
import { useProperties } from "@/lib/properties";
import { connectWallet, switchToSepolia, getReadProvider } from "@/lib/web3";

export default function PortfolioPage() {
  const { properties } = useProperties();
  const [address, setAddress] = useState(null);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txMsg, setTxMsg] = useState({});
  const [proposePrice, setProposePrice] = useState({});

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
      const saleVoting = SALE_VOTING_ADDRESS
        ? new ethers.Contract(SALE_VOTING_ADDRESS, SALE_VOTING_ABI, provider)
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

        let proposal = null;
        let alreadyVoted = false;
        if (saleVoting) {
          try {
            const raw = await saleVoting.getProposal(asset.id);
            proposal = {
              suggestedPrice: raw[0],
              deadline: raw[1],
              yesVotes: raw[2],
              noVotes: raw[3],
              approved: raw[4],
              closed: raw[5],
            };
            if (tokenBalance > 0n && proposal.deadline > 0n) {
              alreadyVoted = await saleVoting.hasVoted(asset.id, addr);
            }
          } catch { /* skip */ }
        }

        if (purchased > 0n || tokenBalance > 0n) {
          results.push({ asset, campaign, purchased, refunded, claimed, tokenBalance, claimable, proposal, alreadyVoted });
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

  async function handleVote(assetId, approve) {
    setLoading(true);
    setTxMsg((p) => ({ ...p, [`vote_${assetId}`]: "Submitting vote..." }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const sv = new ethers.Contract(SALE_VOTING_ADDRESS, SALE_VOTING_ABI, signer);
      await (await sv.voteSale(assetId, approve)).wait();
      setTxMsg((p) => ({ ...p, [`vote_${assetId}`]: approve ? "Voted Yes!" : "Voted No!" }));
      loadPortfolio(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [`vote_${assetId}`]: "Error: " + (err.reason || err.message) }));
    } finally { setLoading(false); }
  }

  async function addToMetaMask(assetId) {
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

  async function handlePropose(assetId) {
    const price = proposePrice[assetId];
    if (!price || parseFloat(price) <= 0) {
      setTxMsg((p) => ({ ...p, [`vote_${assetId}`]: "Enter a suggested sale price." }));
      return;
    }
    setLoading(true);
    setTxMsg((p) => ({ ...p, [`vote_${assetId}`]: "Proposing sale..." }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const sv = new ethers.Contract(SALE_VOTING_ADDRESS, SALE_VOTING_ABI, signer);
      await (await sv.proposeSale(assetId, ethers.parseUnits(price, 6))).wait();
      setTxMsg((p) => ({ ...p, [`vote_${assetId}`]: "Sale proposal created!" }));
      setProposePrice((p) => ({ ...p, [assetId]: "" }));
      loadPortfolio(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [`vote_${assetId}`]: "Error: " + (err.reason || err.message) }));
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
          {(() => {
            const totalPaid = positions.reduce((sum, { campaign, purchased }) => {
              const tokenPrice = Number(campaign.tokenPrice) / 1e6;
              return sum + Number(purchased) * tokenPrice;
            }, 0);
            const totalEstValue = positions.reduce((sum, { campaign, tokenBalance }) => {
              const tokenPrice = Number(campaign.tokenPrice) / 1e6;
              return sum + Number(tokenBalance) * tokenPrice;
            }, 0);
            const gain = totalEstValue - totalPaid;
            return (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 mb-1">Total Spent</p>
                  <p className="text-xl font-bold text-gray-900">{totalPaid.toLocaleString()} <span className="text-sm font-normal text-gray-500">mUSDT</span></p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Est. Portfolio Value</p>
                  <p className="text-xl font-bold text-blue-600">{totalEstValue.toLocaleString()} <span className="text-sm font-normal text-gray-500">mUSDT</span></p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">Unrealized Gain</p>
                  <p className={`text-xl font-bold ${gain >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {gain >= 0 ? "+" : ""}{gain.toLocaleString()} <span className="text-sm font-normal text-gray-500">mUSDT</span>
                  </p>
                </div>
              </div>
            );
          })()}
          {positions.map(({ asset, campaign, purchased, refunded, claimed, tokenBalance, claimable, proposal, alreadyVoted }) => {
            const tokenPrice = Number(campaign.tokenPrice) / 1e6;
            const mUSDTPaid = Number(purchased) * tokenPrice;
            const canClaim = campaign.finalized && campaign.funded && !claimed && purchased > 0n;
            const canRefund = campaign.finalized && !campaign.funded && !refunded && purchased > 0n;
            const claimableAmt = Number(ethers.formatUnits(claimable, 6));
            const heldBalance = Number(tokenBalance);

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
                      <>
                        <div>
                          <p className="text-gray-400">Source</p>
                          <p className="font-semibold text-purple-700">Secondary Market</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Est. Value</p>
                          <p className="font-semibold">{(heldBalance * tokenPrice).toLocaleString()} mUSDT</p>
                        </div>
                      </>
                    )}
                    <div>
                      <p className="text-gray-400">Tokens in Wallet</p>
                      <p className="font-semibold">{heldBalance.toLocaleString()}</p>
                      {heldBalance > 0 && (
                        <button onClick={() => addToMetaMask(asset.id)}
                          className="mt-1 text-xs text-orange-500 hover:text-orange-700 transition flex items-center gap-1">
                          <span>🦊</span> Add to MetaMask
                        </button>
                      )}
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

                  {/* Sale Voting Widget */}
                  {tokenBalance > 0n && SALE_VOTING_ADDRESS && (() => {
                    const p = proposal;
                    const totalSupply = Number(campaign.totalSupply);
                    const yesPercent = totalSupply > 0 ? Math.round(Number(p?.yesVotes ?? 0n) / totalSupply * 100) : 0;

                    if (!p || p.deadline === 0n) {
                      return (
                        <div className="bg-amber-50 rounded-lg p-3 mb-3">
                          <p className="text-xs font-medium text-amber-700 mb-2">Collective Sale</p>
                          <div className="flex gap-2 items-center">
                            <input
                              type="number" step="any" placeholder="Suggested price (mUSDT)"
                              value={proposePrice[asset.id] || ""}
                              onChange={(e) => setProposePrice((pp) => ({ ...pp, [asset.id]: e.target.value }))}
                              className="flex-1 border border-amber-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                            />
                            <button onClick={() => handlePropose(asset.id)} disabled={loading}
                              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition">
                              Propose Sale
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (p.closed) {
                      return (
                        <div className="bg-gray-100 rounded-lg p-3 mb-3">
                          <p className="text-xs text-gray-500">Property Archived — sale completed at กรมที่ดิน</p>
                        </div>
                      );
                    }

                    if (p.approved) {
                      return (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                          <p className="text-xs font-semibold text-amber-800">Sale Approved</p>
                          <p className="text-xs text-amber-600 mt-0.5">Majority agreed — proceed to กรมที่ดิน for transfer.</p>
                        </div>
                      );
                    }

                    const now = BigInt(Math.floor(Date.now() / 1000));
                    const isActive = p.deadline > now;
                    const daysLeft = Math.max(0, Math.ceil((Number(p.deadline) - Date.now() / 1000) / 86400));
                    const suggestedPriceFmt = Number(ethers.formatUnits(p.suggestedPrice, 6)).toLocaleString();

                    if (isActive) {
                      return (
                        <div className="bg-amber-50 rounded-lg p-3 mb-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-medium text-amber-700">Sale Vote Active</p>
                            <span className="text-xs text-amber-600">{daysLeft}d left · {suggestedPriceFmt} mUSDT</span>
                          </div>
                          <div className="w-full bg-amber-200 rounded-full h-1.5 mb-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${yesPercent}%` }} />
                          </div>
                          <p className="text-xs text-gray-500 mb-2">
                            {Number(p.yesVotes).toLocaleString()} yes / {Number(p.noVotes).toLocaleString()} no ({yesPercent}% of supply)
                          </p>
                          {!alreadyVoted ? (
                            <div className="flex gap-2">
                              <button onClick={() => handleVote(asset.id, true)} disabled={loading}
                                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-1.5 rounded-lg text-xs font-semibold transition">
                                Vote Yes
                              </button>
                              <button onClick={() => handleVote(asset.id, false)} disabled={loading}
                                className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-1.5 rounded-lg text-xs font-semibold transition">
                                Vote No
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">You have voted</p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-xs text-gray-500 mb-2">Proposal expired — majority not reached.</p>
                        <div className="flex gap-2 items-center">
                          <input
                            type="number" step="any" placeholder="New suggested price (mUSDT)"
                            value={proposePrice[asset.id] || ""}
                            onChange={(e) => setProposePrice((pp) => ({ ...pp, [asset.id]: e.target.value }))}
                            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                          />
                          <button onClick={() => handlePropose(asset.id)} disabled={loading}
                            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition">
                            New Proposal
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {txMsg[`vote_${asset.id}`] && (
                    <p className={`text-xs mb-2 ${txMsg[`vote_${asset.id}`].startsWith("Error") ? "text-red-500" : "text-amber-700"}`}>
                      {txMsg[`vote_${asset.id}`]}
                    </p>
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
