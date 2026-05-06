"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, SALE_VOTING_ADDRESS, SALE_VOTING_ABI } from "@/lib/contracts";
import { useProperties } from "@/lib/properties";
import { getReadProvider } from "@/lib/web3";

async function fetchCampaign(assetId) {
  if (!FUNDING_VAULT_ADDRESS) return null;
  try {
    const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, getReadProvider());
    return await vault.getCampaign(assetId);
  } catch {
    return null;
  }
}

function StatusBadge({ campaign }) {
  if (!campaign || campaign.deadline === 0n)
    return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Not Started</span>;
  if (campaign.finalized && campaign.funded)
    return <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Funded</span>;
  if (campaign.finalized && !campaign.funded)
    return <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">Failed</span>;
  if (Number(campaign.deadline) * 1000 < Date.now())
    return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">Awaiting Finalize</span>;
  return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Active</span>;
}

function TokenProgress({ campaign }) {
  if (!campaign || campaign.deadline === 0n)
    return <div className="text-sm text-gray-400">No active campaign</div>;

  const totalSupply = Number(campaign.totalSupply);
  const tokenPrice = Number(campaign.tokenPrice) / 1e6;
  const soldTokens = totalSupply > 0
    ? Math.floor(Number(campaign.currentAmount) / Number(campaign.tokenPrice))
    : 0;
  const progress = totalSupply > 0 ? Math.min(100, (soldTokens / totalSupply) * 100) : 0;

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{soldTokens.toLocaleString()} / {totalSupply.toLocaleString()} tokens sold</span>
        <span>{tokenPrice.toLocaleString()} mUSDT/token</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-1">{progress.toFixed(1)}% sold</p>
    </div>
  );
}

export default function MarketplacePage() {
  const { properties } = useProperties();
  const [campaigns, setCampaigns] = useState({});
  const [saleStatuses, setSaleStatuses] = useState({});

  useEffect(() => {
    async function load() {
      const results = {};
      const saleResults = {};
      const provider = getReadProvider();
      const sv = SALE_VOTING_ADDRESS
        ? new ethers.Contract(SALE_VOTING_ADDRESS, SALE_VOTING_ABI, provider)
        : null;
      for (const asset of properties) {
        results[asset.id] = await fetchCampaign(asset.id);
        if (sv) {
          try {
            const raw = await sv.getProposal(asset.id);
            saleResults[asset.id] = { approved: raw[4], closed: raw[5] };
          } catch { /* skip */ }
        }
      }
      setCampaigns(results);
      setSaleStatuses(saleResults);
    }
    load();
  }, [properties]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Property Marketplace</h1>
        <p className="text-gray-500 mt-1">Buy fractional ownership tokens using mUSDT on Sepolia.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((asset) => {
          const c = campaigns[asset.id];
          const sale = saleStatuses[asset.id];
          const saleApproved = sale?.approved;
          const saleClosed = sale?.closed;
          return (
            <div key={asset.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
              <img src={asset.image} alt={asset.name} className="w-full h-48 object-cover" />
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h2 className="font-semibold text-gray-900">{asset.name}</h2>
                    <p className="text-sm text-gray-500">{asset.location}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge campaign={c} />
                    {saleClosed && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Archived</span>}
                    {saleApproved && !saleClosed && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Sale Agreed</span>}
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{asset.description}</p>
                {(() => {
                  const targetMUSDT = asset.targetAmount
                    ?? (c && c.deadline !== 0n && c.targetAmount > 0n ? Math.round(Number(c.targetAmount) / 1e6) : null);
                  const thbVal = asset.thbPrice ?? (targetMUSDT ? Math.round(targetMUSDT * 30) : null);
                  if (!targetMUSDT && !thbVal) return null;
                  return (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3 flex items-center justify-between">
                      <div>
                        {thbVal && <p className="text-xs text-amber-600 font-medium">฿{thbVal.toLocaleString()}</p>}
                        {targetMUSDT && <p className="text-xs text-gray-500">{targetMUSDT.toLocaleString()} mUSDT target</p>}
                      </div>
                      <span className="text-xs text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">1 mUSDT = 30 THB</span>
                    </div>
                  );
                })()}
                <TokenProgress campaign={c} />
                {saleApproved || saleClosed ? (
                  <div className={`mt-4 w-full text-center py-2 rounded-lg text-sm font-semibold ${saleClosed ? "bg-gray-100 text-gray-400" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                    {saleClosed ? "Property Archived" : "Sale In Progress"}
                  </div>
                ) : (
                  <a
                    href={`/asset/${asset.id}`}
                    className="mt-4 block w-full text-center bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold transition"
                  >
                    Buy Tokens
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
