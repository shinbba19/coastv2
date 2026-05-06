export const MUSDT_ADDRESS = process.env.NEXT_PUBLIC_MUSDT || "";
export const FUNDING_VAULT_ADDRESS = process.env.NEXT_PUBLIC_FUNDING_VAULT || "";
export const PROPERTY_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_PROPERTY_TOKEN || "";
export const DIVIDEND_VAULT_ADDRESS = process.env.NEXT_PUBLIC_DIVIDEND_VAULT || "";
export const SECONDARY_MARKET_ADDRESS = process.env.NEXT_PUBLIC_SECONDARY_MARKET || "";

export const FUNDING_VAULT_ABI = [
  "function createCampaign(uint256 assetId, uint256 targetAmount, uint256 totalSupply, uint256 duration, uint256 maxInvestors) external",
  "function buyTokens(uint256 assetId, uint256 tokenAmount) external",
  "function finalizeCampaign(uint256 assetId) external",
  "function claimTokens(uint256 assetId) external",
  "function claimRefund(uint256 assetId) external",
  "function releaseFunds(uint256 assetId) external",
  "function setPropertyToken(address _propertyToken) external",
  "function getCampaign(uint256 assetId) external view returns (tuple(uint256 targetAmount, uint256 currentAmount, uint256 tokenPrice, uint256 totalSupply, uint256 deadline, uint256 maxInvestors, uint256 investorCount, bool funded, bool finalized, bool fundsReleased))",
  "function isInvestor(uint256 assetId, address investor) external view returns (bool)",
  "function getPurchasedTokens(uint256 assetId, address investor) external view returns (uint256)",
  "function purchasedTokens(uint256, address) external view returns (uint256)",
  "function refundClaimed(uint256, address) external view returns (bool)",
  "function tokensClaimed(uint256, address) external view returns (bool)",
  "function owner() external view returns (address)",
  "function mUSDT() external view returns (address)",
  "event CampaignCreated(uint256 indexed assetId, uint256 targetAmount, uint256 tokenPrice, uint256 totalSupply, uint256 deadline)",
  "event TokensPurchased(uint256 indexed assetId, address indexed buyer, uint256 tokenAmount, uint256 cost)",
  "event CampaignFinalized(uint256 indexed assetId, bool funded)",
  "event TokensClaimed(uint256 indexed assetId, address indexed investor, uint256 amount)",
  "event RefundClaimed(uint256 indexed assetId, address indexed investor, uint256 amount)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

export const MUSDT_ABI = [
  ...ERC20_ABI,
  "function faucet() external",
  "function cooldownRemaining(address user) external view returns (uint256)",
  "function lastFaucetTime(address user) external view returns (uint256)",
  "function FAUCET_AMOUNT() external view returns (uint256)",
  "event FaucetClaimed(address indexed user, uint256 amount)",
];

export const PROPERTY_TOKEN_ABI = [
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function totalMinted(uint256 assetId) external view returns (uint256)",
];

export const DIVIDEND_VAULT_ABI = [
  "function depositRevenue(uint256 assetId, uint256 amount) external",
  "function claimDividend(uint256 assetId) external",
  "function getClaimable(uint256 assetId, address user) external view returns (uint256)",
  "function getDividendPerShare(uint256 assetId) external view returns (uint256)",
  "function dividendPerShare(uint256 assetId) external view returns (uint256)",
  "function totalDeposited(uint256 assetId) external view returns (uint256)",
  "event RevenueDeposited(uint256 indexed assetId, uint256 amount)",
  "event DividendClaimed(uint256 indexed assetId, address indexed user, uint256 amount)",
];

export const SECONDARY_MARKET_ABI = [
  "function listToken(uint256 assetId, uint256 amount, uint256 pricePerToken) external",
  "function buyListing(uint256 listingId, uint256 amount) external",
  "function cancelListing(uint256 listingId) external",
  "function getActiveListings(uint256 assetId) external view returns (uint256[] memory ids, tuple(address seller, uint256 assetId, uint256 amount, uint256 pricePerToken, bool active)[] memory result)",
  "function listings(uint256 listingId) external view returns (address seller, uint256 assetId, uint256 amount, uint256 pricePerToken, bool active)",
  "event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed assetId, uint256 amount, uint256 pricePerToken)",
  "event Purchased(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 totalCost)",
  "event Cancelled(uint256 indexed listingId)",
];

export const PROPERTY_TOKEN_FULL_ABI = [
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function totalMinted(uint256 assetId) external view returns (uint256)",
  "function isApprovedForAll(address account, address operator) external view returns (bool)",
  "function setApprovalForAll(address operator, bool approved) external",
];

export const MOCK_ASSETS = [
  { id: 1, name: "The Palm Wongamat 2 Bedroom", location: "Wongamat Beach, Pattaya, Thailand", description: "Premium 2-bedroom beachfront condominium on Wongamat Beach with panoramic sea views and resort-style facilities.", image: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=400", thbPrice: 20000000, targetAmount: 666667 },
  { id: 2, name: "Grand Florida 1 Bedroom", location: "Na Jomtien, Pattaya, Thailand", description: "Modern 1-bedroom resort-style condominium with sea views, private beach access, and world-class amenities.", image: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=400", thbPrice: 6000000, targetAmount: 200000 },
  { id: 3, name: "Andromeda Pratumnak", location: "Pratumnak Hill, Pattaya, Thailand", description: "Luxury condominium on prestigious Pratumnak Hill with stunning sea views and premium lifestyle amenities.", image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400", thbPrice: 12000000, targetAmount: 400000 },
];
