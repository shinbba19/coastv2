"use client";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI,
  MUSDT_ADDRESS, ERC20_ABI,
  DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI,
  SECONDARY_MARKET_ADDRESS, SECONDARY_MARKET_ABI,
} from "@/lib/contracts";
import { useProperties } from "@/lib/properties";
import { connectWallet, switchToSepolia, formatDeadline, getReadProvider } from "@/lib/web3";

export default function AdminPage() {
  const { properties, add: addProperty } = useProperties();
  const [address, setAddress] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [campaigns, setCampaigns] = useState({});
  const [dividends, setDividends] = useState({});
  const [txHistory, setTxHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [txMsg, setTxMsg] = useState({});
  const [activeTab, setActiveTab] = useState("summary");

  // Campaign form — default targetAmount from first seed property
  const [form, setForm] = useState({ assetId: "1", targetAmount: "666667", totalSupply: "1000", durationDays: "30" });

  // Property form
  const [propForm, setPropForm] = useState({ name: "", location: "", description: "", image: "", thbPrice: "", targetAmount: "" });
  const [propMsg, setPropMsg] = useState("");

  // Dividend form
  const [divForm, setDivForm] = useState({ assetId: "1", amount: "" });
  const [divMsg, setDivMsg] = useState("");

  async function loadCampaigns(addr) {
    if (!FUNDING_VAULT_ADDRESS) return;
    try {
      const provider = getReadProvider();
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, provider);
      const results = {};
      const divResults = {};
      for (const asset of properties) {
        results[asset.id] = await vault.getCampaign(asset.id);
        if (DIVIDEND_VAULT_ADDRESS) {
          try {
            const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, provider);
            divResults[asset.id] = Number(ethers.formatUnits(await divVault.totalDeposited(asset.id), 6));
          } catch { divResults[asset.id] = 0; }
        }
      }
      setCampaigns(results);
      setDividends(divResults);
      if (addr) {
        const owner = await vault.owner();
        setIsOwner(owner.toLowerCase() === addr.toLowerCase());
      }
    } catch (err) {
      console.error("Failed to load campaigns:", err);
    }
  }

  async function loadTxHistory() {
    if (!FUNDING_VAULT_ADDRESS) return;
    setHistoryLoading(true);
    try {
      // Use MetaMask provider for event queries — avoids Alchemy free-tier 10-block limit.
      // Fall back to public Sepolia RPC if MetaMask is unavailable.
      const provider = (typeof window !== "undefined" && window.ethereum)
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider("https://rpc.sepolia.org");
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, provider);
      const fmt = (v) => parseFloat(ethers.formatUnits(v, 6));
      const addr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "—";

      const [created, purchased, finalized, claimed, refunded] = await Promise.all([
        vault.queryFilter(vault.filters.CampaignCreated()),
        vault.queryFilter(vault.filters.TokensPurchased()),
        vault.queryFilter(vault.filters.CampaignFinalized()),
        vault.queryFilter(vault.filters.TokensClaimed()),
        vault.queryFilter(vault.filters.RefundClaimed()),
      ]);

      const rows = [
        ...created.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Campaign Created", color: "blue", assetId: Number(e.args.assetId), address: null, amount: fmt(e.args.targetAmount), detail: `${Number(e.args.totalSupply).toLocaleString()} tokens` })),
        ...purchased.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Token Purchase", color: "green", assetId: Number(e.args.assetId), address: addr(e.args.buyer), amount: fmt(e.args.cost), detail: `${Number(e.args.tokenAmount).toLocaleString()} tokens` })),
        ...finalized.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: e.args.funded ? "Finalized ✓" : "Finalized ✗", color: e.args.funded ? "green" : "red", assetId: Number(e.args.assetId), address: null, amount: null, detail: e.args.funded ? "Funded" : "Failed" })),
        ...claimed.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Tokens Claimed", color: "teal", assetId: Number(e.args.assetId), address: addr(e.args.investor), amount: null, detail: `${Number(e.args.amount).toLocaleString()} tokens` })),
        ...refunded.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Refund", color: "orange", assetId: Number(e.args.assetId), address: addr(e.args.investor), amount: fmt(e.args.amount), detail: "Refunded" })),
      ];

      if (DIVIDEND_VAULT_ADDRESS) {
        try {
          const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, provider);
          const [deposited, divClaimed] = await Promise.all([
            divVault.queryFilter(divVault.filters.RevenueDeposited()),
            divVault.queryFilter(divVault.filters.DividendClaimed()),
          ]);
          rows.push(...deposited.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Revenue Deposited", color: "purple", assetId: Number(e.args.assetId), address: null, amount: fmt(e.args.amount), detail: "Rental income" })));
          rows.push(...divClaimed.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Dividend Claimed", color: "purple", assetId: Number(e.args.assetId), address: addr(e.args.user), amount: fmt(e.args.amount), detail: "Dividend" })));
        } catch { /* skip */ }
      }

      if (SECONDARY_MARKET_ADDRESS) {
        try {
          const market = new ethers.Contract(SECONDARY_MARKET_ADDRESS, SECONDARY_MARKET_ABI, provider);
          const [listed, mktPurchased, cancelled] = await Promise.all([
            market.queryFilter(market.filters.Listed()),
            market.queryFilter(market.filters.Purchased()),
            market.queryFilter(market.filters.Cancelled()),
          ]);
          rows.push(...listed.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Listed", color: "indigo", assetId: Number(e.args.assetId), address: addr(e.args.seller), amount: parseFloat(ethers.formatUnits(e.args.pricePerToken, 6)), detail: `${Number(e.args.amount).toLocaleString()} tokens` })));
          rows.push(...mktPurchased.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Market Purchase", color: "green", assetId: null, address: addr(e.args.buyer), amount: fmt(e.args.totalCost), detail: `${Number(e.args.amount).toLocaleString()} tokens` })));
          rows.push(...cancelled.map((e) => ({ blockNumber: e.blockNumber, txHash: e.transactionHash, type: "Listing Cancelled", color: "gray", assetId: null, address: null, amount: null, detail: `Listing #${Number(e.args.listingId)}` })));
        } catch { /* skip */ }
      }

      rows.sort((a, b) => b.blockNumber - a.blockNumber);
      setTxHistory(rows.slice(0, 100));
    } catch (err) {
      console.error("Failed to load tx history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
        if (accounts[0]) { setAddress(accounts[0]); loadCampaigns(accounts[0]); }
      });
    }
    loadTxHistory();
  }, [properties]);

  async function handleConnect() {
    await switchToSepolia();
    const { address: addr } = await connectWallet();
    setAddress(addr);
    loadCampaigns(addr);
  }

  useEffect(() => {
    const selected = properties.find((p) => String(p.id) === form.assetId);
    if (selected?.targetAmount) {
      setForm((f) => ({ ...f, targetAmount: String(selected.targetAmount) }));
    }
  }, [form.assetId, properties]);

  const tokenPricePreview = form.targetAmount && form.totalSupply
    ? (parseFloat(form.targetAmount) / parseFloat(form.totalSupply)).toFixed(2)
    : null;

  const selectedAsset = properties.find((p) => String(p.id) === form.assetId);

  async function createCampaign() {
    setTxMsg((p) => ({ ...p, create: "Creating campaign & tokenizing..." }));
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, signer);
      const target = ethers.parseUnits(form.targetAmount, 6);
      const supply = parseInt(form.totalSupply);
      const duration = parseInt(form.durationDays) * 86400;
      const tx = await vault.createCampaign(parseInt(form.assetId), target, supply, duration);
      await tx.wait();
      setTxMsg((p) => ({ ...p, create: "Campaign created & tokens minted to vault!" }));
      loadCampaigns(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, create: "Error: " + (err.reason || err.message) }));
    }
  }

  async function finalize(assetId) {
    setTxMsg((p) => ({ ...p, [assetId]: "Finalizing..." }));
    try {
      const { signer } = await connectWallet();
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, signer);
      await (await vault.finalizeCampaign(assetId)).wait();
      setTxMsg((p) => ({ ...p, [assetId]: "Finalized!" }));
      loadCampaigns(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [assetId]: "Error: " + (err.reason || err.message) }));
    }
  }

  async function releaseFunds(assetId) {
    setTxMsg((p) => ({ ...p, [assetId]: "Releasing funds..." }));
    try {
      const { signer } = await connectWallet();
      const vault = new ethers.Contract(FUNDING_VAULT_ADDRESS, FUNDING_VAULT_ABI, signer);
      await (await vault.releaseFunds(assetId)).wait();
      setTxMsg((p) => ({ ...p, [assetId]: "Funds released!" }));
      loadCampaigns(address);
    } catch (err) {
      setTxMsg((p) => ({ ...p, [assetId]: "Error: " + (err.reason || err.message) }));
    }
  }

  function handleAddProperty() {
    if (!propForm.name || !propForm.location) {
      setPropMsg("Name and location are required.");
      return;
    }
    const imageUrl = propForm.image || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400";
    const thbPrice = propForm.thbPrice ? parseInt(propForm.thbPrice) : undefined;
    const targetAmount = propForm.targetAmount ? parseInt(propForm.targetAmount)
      : thbPrice ? Math.round(thbPrice / 30) : undefined;
    const newProp = addProperty({ ...propForm, image: imageUrl, thbPrice, targetAmount });
    setPropMsg(`Property added! Asset ID: ${newProp.id} — now create a campaign for it.`);
    setPropForm({ name: "", location: "", description: "", image: "", thbPrice: "", targetAmount: "" });
  }

  async function handleDepositRevenue() {
    if (!divForm.amount || parseFloat(divForm.amount) <= 0) {
      setDivMsg("Enter a valid amount.");
      return;
    }
    setDivMsg("Approving mUSDT...");
    try {
      await switchToSepolia();
      const { signer } = await connectWallet();
      const amount = ethers.parseUnits(divForm.amount, 6);
      const musdt = new ethers.Contract(MUSDT_ADDRESS, ERC20_ABI, signer);
      const signerAddr = await signer.getAddress();
      const allowance = await musdt.allowance(signerAddr, DIVIDEND_VAULT_ADDRESS);
      if (allowance < amount) {
        const tx = await musdt.approve(DIVIDEND_VAULT_ADDRESS, amount);
        await tx.wait();
      }
      setDivMsg("Depositing revenue...");
      const divVault = new ethers.Contract(DIVIDEND_VAULT_ADDRESS, DIVIDEND_VAULT_ABI, signer);
      const tx = await divVault.depositRevenue(parseInt(divForm.assetId), amount);
      await tx.wait();
      setDivMsg(`Revenue deposited! ${divForm.amount} mUSDT distributed to Asset #${divForm.assetId} holders.`);
      setDivForm((f) => ({ ...f, amount: "" }));
    } catch (err) {
      setDivMsg("Error: " + (err.reason || err.message));
    }
  }

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-gray-500">Connect your wallet to manage campaigns.</p>
        <button onClick={handleConnect} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold">Connect Wallet</button>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          Access denied. Connected address is not the contract owner.
        </div>
        <p className="text-xs text-gray-400 font-mono">{address}</p>
      </div>
    );
  }

  const tabs = [
    { id: "summary", label: "Summary" },
    { id: "campaigns", label: "Campaigns" },
    { id: "property", label: "Add Property" },
    { id: "dividend", label: "Deposit Revenue" },
  ];

  // Summary calculations
  const summaryRows = properties.map((asset) => {
    const c = campaigns[asset.id];
    const hasCampaign = c && c.deadline !== 0n;
    const raised = hasCampaign ? Number(ethers.formatUnits(c.currentAmount, 6)) : 0;
    const target = asset.targetAmount || 0;
    const soldTokens = hasCampaign && c.tokenPrice > 0n
      ? Math.floor(Number(c.currentAmount) / Number(c.tokenPrice)) : 0;
    const totalSupply = hasCampaign ? Number(c.totalSupply) : 0;
    const progress = target > 0 ? Math.min(100, (raised / target) * 100) : 0;
    const deadlinePassed = hasCampaign && Number(c.deadline) * 1000 < Date.now();
    const status = !hasCampaign ? "No Campaign"
      : c.finalized && c.funded ? "Funded"
      : c.finalized && !c.funded ? "Failed"
      : deadlinePassed ? "Awaiting Finalize"
      : "Active";
    return { asset, raised, target, soldTokens, totalSupply, progress, status, hasCampaign, fundsReleased: hasCampaign && c.fundsReleased, dividendsTotal: dividends[asset.id] || 0 };
  });
  const totalThb = properties.reduce((s, p) => s + (p.thbPrice || 0), 0);
  const totalTarget = properties.reduce((s, p) => s + (p.targetAmount || 0), 0);
  const totalRaised = summaryRows.reduce((s, r) => s + r.raised, 0);
  const totalDividends = summaryRows.reduce((s, r) => s + r.dividendsTotal, 0);
  const overallProgress = totalTarget > 0 ? Math.min(100, (totalRaised / totalTarget) * 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
        <div className="flex items-center gap-2 mt-1">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <p className="text-sm text-green-600 font-medium">Owner connected</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Summary Tab */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs text-gray-400 mb-1">Total Portfolio Value</p>
              <p className="text-xl font-bold text-amber-700">฿{totalThb.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-0.5">{totalTarget.toLocaleString()} mUSDT target</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs text-gray-400 mb-1">Total Raised</p>
              <p className="text-xl font-bold text-blue-700">{totalRaised.toLocaleString()} mUSDT</p>
              <p className="text-xs text-gray-400 mt-0.5">฿{(totalRaised * 30).toLocaleString()} THB equiv.</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs text-gray-400 mb-1">Overall Progress</p>
              <p className="text-xl font-bold text-gray-900">{overallProgress.toFixed(1)}%</p>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs text-gray-400 mb-1">Total Dividends Distributed</p>
              <p className="text-xl font-bold text-green-700">{totalDividends.toLocaleString()} mUSDT</p>
              <p className="text-xs text-gray-400 mt-0.5">฿{(totalDividends * 30).toLocaleString()} THB equiv.</p>
            </div>
          </div>

          {/* Per-asset table */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Campaign Transaction Summary</h2>
              <p className="text-xs text-gray-400 mt-0.5">1 mUSDT = 30 THB</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400">
                    <th className="text-left px-6 py-3 font-medium">Property</th>
                    <th className="text-right px-4 py-3 font-medium">THB Price</th>
                    <th className="text-right px-4 py-3 font-medium">Target (mUSDT)</th>
                    <th className="text-right px-4 py-3 font-medium">Raised (mUSDT)</th>
                    <th className="text-right px-4 py-3 font-medium">Tokens Sold</th>
                    <th className="text-right px-4 py-3 font-medium">Progress</th>
                    <th className="text-right px-4 py-3 font-medium">Dividends</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                    <th className="text-center px-4 py-3 font-medium">Funds</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.asset.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900 text-xs leading-tight">{row.asset.name}</p>
                        <p className="text-xs text-gray-400">#{row.asset.id} · {row.asset.location}</p>
                      </td>
                      <td className="px-4 py-4 text-right text-amber-700 font-medium whitespace-nowrap">
                        ฿{row.asset.thbPrice?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-700 whitespace-nowrap">
                        {row.target.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right text-blue-700 font-semibold whitespace-nowrap">
                        {row.hasCampaign ? row.raised.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-4 text-right text-gray-600 whitespace-nowrap">
                        {row.hasCampaign ? `${row.soldTokens.toLocaleString()} / ${row.totalSupply.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {row.hasCampaign ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-1.5">
                              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${row.progress}%` }} />
                            </div>
                            <span className="text-xs text-gray-600">{row.progress.toFixed(1)}%</span>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-4 text-right text-green-700 whitespace-nowrap">
                        {row.dividendsTotal > 0 ? `${row.dividendsTotal.toLocaleString()} mUSDT` : "—"}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                          row.status === "Funded" ? "bg-green-100 text-green-700" :
                          row.status === "Failed" ? "bg-red-100 text-red-700" :
                          row.status === "Active" ? "bg-blue-100 text-blue-700" :
                          row.status === "Awaiting Finalize" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-500"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {row.fundsReleased
                          ? <span className="text-xs text-green-600 font-medium">Released ✓</span>
                          : <span className="text-xs text-gray-400">Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 text-xs font-semibold border-t border-gray-200">
                    <td className="px-6 py-3 text-gray-700">Total</td>
                    <td className="px-4 py-3 text-right text-amber-700">฿{totalThb.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{totalTarget.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-blue-700">{totalRaised.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-600">—</td>
                    <td className="px-4 py-3 text-right text-gray-600">{overallProgress.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right text-green-700">{totalDividends > 0 ? `${totalDividends.toLocaleString()} mUSDT` : "—"}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Transaction History */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Transaction History</h2>
                <p className="text-xs text-gray-400 mt-0.5">All on-chain events, newest first (max 100)</p>
              </div>
              <button onClick={loadTxHistory} disabled={historyLoading}
                className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 transition">
                {historyLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
            {historyLoading ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">Loading transactions...</div>
            ) : txHistory.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">No transactions found. Deploy contracts and interact with the platform to see history here.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400">
                      <th className="text-left px-6 py-3 font-medium">Tx Hash</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="text-left px-4 py-3 font-medium">Property</th>
                      <th className="text-left px-4 py-3 font-medium">Address</th>
                      <th className="text-right px-4 py-3 font-medium">Amount (mUSDT)</th>
                      <th className="text-left px-4 py-3 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txHistory.map((row, i) => {
                      const assetName = row.assetId ? (properties.find((p) => p.id === row.assetId)?.name ?? `Asset #${row.assetId}`) : "—";
                      const badgeClass = {
                        blue: "bg-blue-100 text-blue-700",
                        green: "bg-green-100 text-green-700",
                        red: "bg-red-100 text-red-700",
                        teal: "bg-teal-100 text-teal-700",
                        orange: "bg-orange-100 text-orange-700",
                        purple: "bg-purple-100 text-purple-700",
                        indigo: "bg-indigo-100 text-indigo-700",
                        gray: "bg-gray-100 text-gray-500",
                      }[row.color] ?? "bg-gray-100 text-gray-500";
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition">
                          <td className="px-6 py-3 whitespace-nowrap">
                            <a href={`https://sepolia.etherscan.io/tx/${row.txHash}`} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-mono text-xs group">
                              <span>{row.txHash.slice(0, 6)}...{row.txHash.slice(-4)}</span>
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 opacity-50 group-hover:opacity-100 transition" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                              </svg>
                            </a>
                            <p className="text-xs text-gray-400 mt-0.5">Block {row.blockNumber.toLocaleString()}</p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeClass}`}>{row.type}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{assetName}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono whitespace-nowrap">{row.address ?? "—"}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-800 font-semibold whitespace-nowrap">
                            {row.amount != null ? row.amount.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{row.detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaigns Tab */}
      {activeTab === "campaigns" && (
        <div className="space-y-6">
          {/* Create Campaign */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Create Campaign + Tokenize Asset</h2>
            <p className="text-xs text-gray-400 mb-4">Tokens are minted to the vault automatically on creation.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Asset</label>
                <select value={form.assetId} onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  {properties.map((a) => <option key={a.id} value={a.id}>#{a.id} {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Target (mUSDT)</label>
                <input type="number" value={form.targetAmount}
                  onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))}
                  placeholder="e.g. 666667"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                {selectedAsset?.thbPrice && (
                  <p className="text-xs text-amber-600 mt-1">฿{selectedAsset.thbPrice.toLocaleString()} · 1 mUSDT = 30 THB</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Token Supply</label>
                <input type="number" value={form.totalSupply}
                  onChange={(e) => setForm((f) => ({ ...f, totalSupply: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Duration (days)</label>
                <input type="number" value={form.durationDays}
                  onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {tokenPricePreview && (
              <p className="text-sm text-blue-600 mt-3">
                Token price: <strong>{tokenPricePreview} mUSDT/token</strong>
              </p>
            )}
            <button onClick={createCampaign}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold transition">
              Create Campaign & Tokenize
            </button>
            {txMsg.create && (
              <p className={`text-sm mt-2 ${txMsg.create.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                {txMsg.create}
              </p>
            )}
          </div>

          {/* Campaign Management */}
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Campaign Management</h2>
            {properties.map((asset) => {
              const c = campaigns[asset.id];
              if (!c || c.deadline === 0n) return null;
              const deadlinePassed = Number(c.deadline) * 1000 < Date.now();
              const tokenPrice = Number(c.tokenPrice) / 1e6;
              const soldTokens = c.tokenPrice > 0n
                ? Math.floor(Number(c.currentAmount) / Number(c.tokenPrice))
                : 0;
              const progress = Number(c.totalSupply) > 0
                ? Math.min(100, (soldTokens / Number(c.totalSupply)) * 100)
                : 0;

              return (
                <div key={asset.id} className="bg-white rounded-2xl border border-gray-100 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{asset.name}</h3>
                      <p className="text-sm text-gray-500">
                        Asset #{asset.id} · {tokenPrice.toLocaleString()} mUSDT/token · Deadline: {formatDeadline(c.deadline)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      c.finalized && c.funded ? "bg-green-100 text-green-700" :
                      c.finalized && !c.funded ? "bg-red-100 text-red-700" :
                      deadlinePassed ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {c.finalized ? (c.funded ? "Funded" : "Failed") : deadlinePassed ? "Deadline Passed" : "Active"}
                    </span>
                  </div>
                  <div className="mb-1 flex justify-between text-xs text-gray-500">
                    <span>{soldTokens.toLocaleString()} / {Number(c.totalSupply).toLocaleString()} tokens sold</span>
                    <span>{progress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {!c.finalized && deadlinePassed && (
                      <button onClick={() => finalize(asset.id)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                        Finalize Campaign
                      </button>
                    )}
                    {c.finalized && c.funded && !c.fundsReleased && (
                      <button onClick={() => releaseFunds(asset.id)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                        Release Funds
                      </button>
                    )}
                    {c.fundsReleased && <span className="text-sm text-gray-400 py-2">Funds released ✓</span>}
                  </div>
                  {txMsg[asset.id] && (
                    <p className={`text-sm mt-2 ${txMsg[asset.id].startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                      {txMsg[asset.id]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Property Tab */}
      {activeTab === "property" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Add New Property</h2>
          <p className="text-xs text-gray-400 mb-4">
            Properties are stored locally. After adding, create a campaign for the new asset ID on the Campaigns tab.
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Property Name *</label>
                <input type="text" value={propForm.name}
                  onChange={(e) => setPropForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Ocean View Penthouse"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Location *</label>
                <input type="text" value={propForm.location}
                  onChange={(e) => setPropForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Phuket, Thailand"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Description</label>
              <textarea value={propForm.description}
                onChange={(e) => setPropForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of the property..."
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">THB Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">฿</span>
                  <input type="number" value={propForm.thbPrice}
                    onChange={(e) => {
                      const thb = e.target.value;
                      const auto = thb ? String(Math.round(parseInt(thb) / 30)) : "";
                      setPropForm((f) => ({ ...f, thbPrice: thb, targetAmount: f.targetAmount || auto }));
                    }}
                    placeholder="e.g. 6000000"
                    className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">mUSDT Target <span className="text-gray-300">(auto from THB ÷ 30)</span></label>
                <input type="number" value={propForm.targetAmount}
                  onChange={(e) => setPropForm((f) => ({ ...f, targetAmount: e.target.value }))}
                  placeholder="e.g. 200000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Image URL</label>
              <input type="text" value={propForm.image}
                onChange={(e) => setPropForm((f) => ({ ...f, image: e.target.value }))}
                placeholder="https://... (leave blank for default)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              {propForm.image && (
                <img src={propForm.image} alt="preview" className="mt-2 w-40 h-24 object-cover rounded-lg" />
              )}
            </div>
          </div>
          <button onClick={handleAddProperty}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold transition">
            Add Property
          </button>
          {propMsg && (
            <p className={`text-sm mt-2 ${propMsg.startsWith("Error") || propMsg.startsWith("Name") ? "text-red-500" : "text-green-600"}`}>
              {propMsg}
            </p>
          )}

          {properties.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Current Properties ({properties.length})</h3>
              <div className="space-y-2">
                {properties.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">#{p.id} {p.name}</p>
                      <p className="text-xs text-gray-500">{p.location}</p>
                    </div>
                    {p.thbPrice && (
                      <div className="text-right">
                        <p className="text-xs font-semibold text-amber-700">฿{p.thbPrice.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{p.targetAmount?.toLocaleString()} mUSDT</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Deposit Revenue Tab */}
      {activeTab === "dividend" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Deposit Rental Revenue</h2>
          <p className="text-xs text-gray-400 mb-4">
            Distribute rental income to token holders. Funds are split proportionally based on tokens held.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Asset</label>
              <select value={divForm.assetId} onChange={(e) => setDivForm((f) => ({ ...f, assetId: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {properties.map((a) => <option key={a.id} value={a.id}>#{a.id} {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Amount (mUSDT)</label>
              <input type="number" value={divForm.amount}
                onChange={(e) => setDivForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 500"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4 bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
            This will transfer mUSDT from your wallet to the DividendVault. Token holders can then claim their share.
          </div>
          <button onClick={handleDepositRevenue}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-semibold transition">
            Approve & Deposit Revenue
          </button>
          {divMsg && (
            <p className={`text-sm mt-2 ${divMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {divMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
