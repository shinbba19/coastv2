function fmtUSDT(raw) {
  const n = Number(raw) / 1e6;
  if (n >= 1000) return (n / 1000).toFixed(1) + "K mUSDT";
  return n.toLocaleString() + " mUSDT";
}

export default function FundingBar({ current, target, className = "" }) {
  const progress = target > 0n ? Math.min(100, Number((current * 100n) / target)) : 0;

  return (
    <div className={className}>
      <div className="flex justify-between text-sm text-gray-600 mb-1">
        <span>{fmtUSDT(current)} raised</span>
        <span>Goal: {fmtUSDT(target)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">{progress.toFixed(1)}% funded</p>
    </div>
  );
}
