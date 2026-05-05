Nice — this version is **cleaner, more “real tokenization platform”**, and still keeps refund logic.

Here is your **FINAL rewritten PRD (Claude Code–ready, Tokenize First model)** 👇

---

# 🧠 **COAST v2 — FINAL PRD (Tokenize First + Funding + Refund, mUSDT)**

---

## 1. 🎯 Product Goal

Build a Web3 application that enables users to invest in fractional real estate using a **tokenize-first + conditional funding model**:

* Assets are tokenized BEFORE sale
* Investors purchase token allocations using mUSDT
* Tokens are released ONLY if funding target is reached
* If funding fails → full refund and tokens remain locked

---

## 2. 🌐 Blockchain Setup

* Network: Sepolia
* Payment Token: USDT (mock: mUSDT)

**mUSDT Contract Address:**

```
0xfa67cB0de2Ce3eb1dC2E744640455C4d3e06eA5f
```

**Rules:**

* Do NOT redeploy mUSDT
* Use `IERC20` + `SafeERC20`
* Users must `approve()` before purchase

---

## 3. 👥 User Roles

### Investor

* Connect wallet
* Buy token allocation (mUSDT)
* Receive tokens (if success)
* Claim refund (if fail)
* View portfolio

### Admin

* Create asset campaign
* Tokenize asset (mint tokens to vault)
* Set funding target + deadline
* Finalize campaign
* Release tokens
* Withdraw funds

---

## 4. 🧩 Core Mechanism

Each asset = **Tokenized Campaign**

```text
1. Tokenize asset first
2. Tokens held in vault
3. Investors purchase tokens
4. If funding target reached → SUCCESS
5. Else → FAIL → refund
```

---

## 5. 🪙 Tokenization Model (UPDATED)

---

### Token Standard

* ERC-1155
* Each `assetId` = 1 property

---

### Token Supply

```text
1 property = 1,000 tokens
```

---

### Token Minting (IMPORTANT CHANGE)

* Tokens are minted **BEFORE funding**
* Minted to **FundingVault (escrow contract)**

```solidity
mint(address(vault), assetId, totalSupply);
```

---

### Token Pricing

```text
token_price = target_funding / total_token_supply
```

Example:

* Target = 1,000,000 mUSDT
* Supply = 1,000 tokens
* Price = 1,000 mUSDT/token

---

### Purchase Logic

```text
tokens_bought = mUSDT_paid / token_price
```

---

## 6. 📜 Smart Contracts

---

### 6.1 FundingVault (Main Contract)

#### Responsibilities

* Hold mUSDT from investors
* Hold pre-minted tokens
* Track token reservations
* Handle success / failure
* Release tokens or refund

---

### Storage

```solidity
struct Campaign {
    uint256 targetAmount;
    uint256 currentAmount;
    uint256 tokenPrice;
    uint256 totalSupply;
    uint256 deadline;
    bool funded;
    bool finalized;
}

mapping(uint256 => Campaign) public campaigns;
mapping(uint256 => mapping(address => uint256)) public purchasedTokens;
```

---

### Functions

```solidity
function createCampaign(
    uint256 assetId,
    uint256 targetAmount,
    uint256 totalSupply,
    uint256 duration
) external;

function buyTokens(uint256 assetId, uint256 tokenAmount) external;

function finalizeCampaign(uint256 assetId) external;

function claimRefund(uint256 assetId) external;

function claimTokens(uint256 assetId) external;

function releaseFunds(uint256 assetId) external;
```

---

### Logic

---

#### Buy Tokens

* Require before deadline
* Calculate cost = tokenAmount × tokenPrice
* Transfer mUSDT
* Update purchasedTokens

---

#### Finalize

```text
IF currentAmount >= target:
    funded = true
ELSE:
    funded = false
```

---

#### Claim Tokens (Success Case)

* Only if funded == true
* Transfer ERC-1155 tokens from vault → user

---

#### Refund (Fail Case)

* Only if funded == false
* Return mUSDT
* Reset purchasedTokens

---

#### Release Funds

* Only if funded == true
* Transfer mUSDT to admin

---

## 6.2 PropertyToken (ERC-1155)

```solidity
function mint(address to, uint256 assetId, uint256 amount) external;
```

---

## 7. 🔁 User Flow

---

### 🟢 Success Case

1. Admin tokenizes asset
2. Tokens stored in vault
3. Users buy tokens (mUSDT)
4. Funding reaches target
5. Admin finalizes
6. Users claim tokens

---

### 🔴 Fail Case

1. Funding < target
2. Users claim refund
3. Tokens remain in vault

---

## 8. 🖥️ Frontend Pages

---

### Marketplace

* Show:

  * total tokens
  * sold tokens
  * price per token

---

### Asset Page

* Buy tokens input
* Funding progress

---

### Portfolio

* Purchased tokens
* Claim token / refund button

---

### Admin Panel

* Create campaign
* Mint tokens
* Finalize

---

## 9. 🔐 Security Constraints

* No buy after deadline
* No double refund
* No token claim before success
* No fund release before success

---

## 10. ⚠️ Assumptions

* Asset purchase simulated
* No oracle
* Fixed price
* mUSDT used

---

## 11. 🧪 Test Cases

* Buy before deadline ✅
* Buy after deadline ❌
* Claim token after success ✅
* Claim token before success ❌
* Refund after fail ✅
* Refund after success ❌

---

## 12. 🧠 Thesis Justification (STRONG VERSION)

> The COAST platform adopts a tokenize-first approach, where real estate assets are converted into ERC-1155 tokens prior to investor participation. These tokens are held in a smart contract vault and released only upon successful funding. This ensures that ownership distribution is transparent and predetermined, while maintaining financial safety through conditional fund release and refund mechanisms.

---

## 13. ⚡ Claude Code Prompt

```
Build a full-stack Web3 application based on this PRD.

Requirements:
- Solidity:
  - FundingVault
  - ERC1155 PropertyToken

- Use existing mUSDT:
  0xfa67cB0de2Ce3eb1dC2E744640455C4d3e06eA5f

- Network: Sepolia
- Use IERC20 + SafeERC20
- Users must approve before buying

Frontend:
- Next.js
- ethers.js
- MetaMask

Features:
- Tokenize asset (mint to vault)
- Buy tokens
- Track funding progress
- Finalize campaign
- Claim tokens
- Refund if failed

Generate:
1. Contracts
2. Deploy script
3. Frontend
```

---

## 🔥 This version = BEST for you because

* Looks like **real tokenization platform (RWA)**
* Cleaner UX (buy tokens instead of “funding”)
* Stronger thesis argument
* Easier to extend → secondary market later

---

If you want next step:
👉 I can write **FULL FundingVault.sol (tokenize-first version, production clean)**
👉 Or draw **sequence diagram (buy → finalize → claim/refund)** for your slides
