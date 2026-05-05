# COAST v2 — System Diagrams

---

## 1. Architecture Diagram

```mermaid
graph TB
    subgraph CLIENT["Client Layer"]
        direction LR
        PG1[Marketplace]
        PG2[Asset Detail]
        PG3[Portfolio]
        PG4[Faucet]
        PG5[Admin Panel]
        MM[MetaMask Wallet]
        LS[(localStorage\nProperty Metadata)]
    end

    subgraph WEB3["Web3 Layer — ethers.js"]
        direction LR
        BP[BrowserProvider\nWrite Operations]
        RP[JsonRpcProvider\nRead Operations]
    end

    subgraph CONTRACTS["Smart Contract Layer — Sepolia Testnet"]
        direction LR
        MU["MockUSDT\nERC-20 · 6 decimals\nFaucet: 10k / 24h\n0x6213...8F11"]
        PT["PropertyToken\nERC-1155\nOne ID per asset\n0xBEc9...a74F"]
        FV["FundingVault\nCampaign escrow\nTokenize-first model\n0xb473...a482"]
        DV["DividendVault\nPer-share revenue\ndistribution\n0xaace...8347"]
        SM["SecondaryMarket\nP2P token resale\nafter funding success\n0x7f02...EB4"]
    end

    subgraph INFRA["Infrastructure"]
        AL[Alchemy RPC Node\nSepolia]
        BC[Sepolia Blockchain]
    end

    PG1 & PG2 & PG3 & PG4 & PG5 --> MM
    PG1 & PG2 & PG3 & PG4 & PG5 --> LS
    MM --> BP
    PG1 & PG2 & PG3 & PG4 & PG5 --> RP
    RP --> AL --> BC
    BP --> FV
    BP --> MU
    BP --> DV
    BP --> SM
    RP --> FV
    RP --> MU
    RP --> PT
    RP --> DV
    RP --> SM
    FV -- "mint(vault, assetId, supply)" --> PT
    FV -- "safeTransferFrom" --> MU
    DV -- "safeTransfer" --> MU
    DV -- "balanceOf / totalMinted" --> PT
    SM -- "safeTransferFrom (ERC-1155)" --> PT
    SM -- "safeTransferFrom (mUSDT)" --> MU
```

---

## 2. DFD Level 0 — Context Diagram

```mermaid
graph LR
    INV["🧑 Investor"]
    ADM["🔑 Admin\n(Contract Owner)"]
    NET["⛓ Sepolia\nNetwork"]

    SYSTEM(("COAST v2\nPlatform"))

    INV -- "Connect wallet\nBuy tokens\nClaim tokens / refund\nClaim dividend\nGet faucet mUSDT" --> SYSTEM
    SYSTEM -- "mUSDT balance\nCampaign info & progress\nToken allocation\nDividend amount" --> INV

    ADM -- "Create campaign\nAdd property\nFinalize campaign\nDeposit rental revenue\nRelease funds" --> SYSTEM
    SYSTEM -- "Campaign status\nTokens minted\nFunds released" --> ADM

    SYSTEM -- "Signed transactions\nContract calls" --> NET
    NET -- "On-chain events\nState reads" --> SYSTEM
```

---

## 3. DFD Level 1

```mermaid
graph TB
    %% External Entities
    INV["🧑 Investor"]
    ADM["🔑 Admin"]

    %% Processes
    P1(["1.0\nWallet &\nBalance"])
    P2(["2.0\nToken\nPurchase"])
    P3(["3.0\nCampaign\nManagement"])
    P4(["4.0\nDividend\nDistribution"])
    P5(["5.0\nProperty\nManagement"])
    P6(["6.0\nFaucet"])

    %% Data Stores
    D1[("D1\nFundingVault\ncampaigns\npurchasedTokens\ntokensClaimed\nrefundClaimed")]
    D2[("D2\nPropertyToken\nERC-1155\nbalanceOf\ntotalMinted")]
    D3[("D3\nMockUSDT\nERC-20\nbalances\nallowances\ncooldown")]
    D4[("D4\nDividendVault\ndividendPerShare\nclaimedPerShare\ntotalDeposited")]
    D5[("D5\nlocalStorage\nname · location\ndescription · image")]

    %% ── Investor flows ──
    INV -- "connect wallet" --> P1
    P1 -- "address, mUSDT balance" --> INV
    P1 -- "balanceOf(addr)" --> D3

    INV -- "qty to buy" --> P2
    P2 -- "approve(vault, cost)" --> D3
    P2 -- "buyTokens(assetId, qty)" --> D1
    D1 -- "campaign data" --> P2
    P2 -- "getCampaign / progress" --> INV
    INV -- "claimTokens / claimRefund" --> P2
    P2 -- "claimTokens(assetId)" --> D1
    D1 -- "transfer ERC-1155" --> D2
    P2 -- "claimRefund(assetId)" --> D1
    D1 -- "return mUSDT" --> D3
    P2 -- "tokens / mUSDT back" --> INV

    INV -- "claim dividend" --> P4
    P4 -- "getClaimable(assetId, addr)" --> D4
    P4 -- "claimDividend(assetId)" --> D4
    D4 -- "safeTransfer mUSDT" --> D3
    P4 -- "mUSDT dividend" --> INV

    INV -- "claim 10k mUSDT" --> P6
    P6 -- "faucet()" --> D3
    P6 -- "cooldownRemaining(addr)" --> D3
    P6 -- "10,000 mUSDT + cooldown" --> INV

    %% ── Admin flows ──
    ADM -- "assetId, target,\nsupply, duration" --> P3
    P3 -- "createCampaign()" --> D1
    D1 -- "mint(vault, assetId, supply)" --> D2
    P3 -- "finalizeCampaign()" --> D1
    P3 -- "releaseFunds()" --> D1
    D1 -- "campaign status" --> ADM

    ADM -- "name, location,\ndescription, image" --> P5
    P5 -- "save property" --> D5
    D5 -- "property list" --> P5
    P5 -- "updated property list" --> ADM

    ADM -- "assetId, amount" --> P4
    P4 -- "approve(divVault, amount)" --> D3
    P4 -- "depositRevenue(assetId, amount)" --> D4
    P4 -- "revenue deposited" --> ADM
```

---

## Contract Address Reference

| Contract | Address |
|---|---|
| MockUSDT | `0x6213C1C7Ca089623E86476D43F5b30631eDf8F11` |
| PropertyToken | `0xBEc97F0798F74E8eC876a4396ffF5514c86aa74F` |
| FundingVault | `0xb473FC818A6D06Eb4bde6309b4d482285F59a482` |
| DividendVault | `0xaace8Fd6eF4c93e193C8e38204c78f6aacDf8347` |

Network: **Sepolia Testnet** · RPC: Alchemy · Frontend: Next.js 16 (App Router) · Web3: ethers.js v6
