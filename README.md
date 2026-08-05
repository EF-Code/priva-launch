# PrivaLaunch (priva-launch)

> Anonymous Anti-Sniper Memecoin Launchpad on TON Powered by zk-tele-auth Zero-Knowledge Proofs

PrivaLaunch is an anonymous, anti-sniper token launchpad and bonding curve trading protocol built for The Open Network (TON). By integrating zk-tele-auth zero-knowledge proofs, PrivaLaunch solves the core vulnerabilities of traditional token launchpads: front-running by MEV sniper bots and doxxing or harassment of token creators.

---

## 1. Core Philosophy and Differences

| Feature | Traditional Launchpads (e.g., pump.fun) | PrivaLaunch |
| :--- | :--- | :--- |
| Creator Identity | Public wallet address exposed on-chain | 100% Anonymous (Creator identified solely by ZK Nullifier Hash) |
| Sniper Bot Resistance | Vulnerable to MEV bots buying supply via 500 dummy wallets | Enforced Anti-Sniper cap (Max 50 TON buy per unique ZK Telegram user) |
| Sybil Protection | None (multi-wallet farming) | Enforced by Poseidon ZK Nullifier Hash (`hash(userId, appDomain, salt)`) |
| Liquidity Migration | Migrates to AMM upon target cap | Auto-migrates to DeDust CPMM v2 upon reaching 85 TON raise |

---

## 2. System Architecture

```
+--------------------------------+
|    Telegram WebApp / Creator   |
| (Generates zk-tele-auth Proof) |
+---------------+----------------+
                |
                v
+--------------------------------+
|   PrivaLaunch Frontend & SDK   |
| (Enforces 50 TON Anti-Sniper)  |
+---------------+----------------+
                |
                v
+--------------------------------+
| Tolk 1.2 Smart Contracts (TON) |
|    (priva_launchpad.tolk)      |
+---------------+----------------+
                | (Hits 85 TON Target)
                v
+--------------------------------+
|  DeDust CPMM v2 Liquidity Pool |
+--------------------------------+
```

---

## 3. Repository Structure

```
priva-launch/
├── package.json                   # Dependencies, scripts, and build rules
├── index.html                     # Single Page Application HTML layout
├── index.css                      # Design tokens and CSS layout styling
├── contracts/
│   ├── priva_launchpad.tolk       # Tolk 1.2 Bonding Curve Launchpad contract
│   ├── priva_token.tolk           # Tolk 1.2 TEP-74 Jetton Master contract
│   └── priva_wallet.tolk          # Tolk 1.2 TEP-74 Jetton Wallet contract
├── src/
│   ├── app.js                     # Main application state and feed controller
│   ├── zk-auth.js                 # zk-tele-auth ZK proof integration module
│   ├── ton-wallet.js              # TonConnect 2.0 wallet and RPC manager
│   ├── telegram-app.js            # Telegram MiniApp integration module
│   ├── bonding-curve.js           # Bonding curve pricing math engine
│   └── components/
│       └── trading-terminal.js    # Production Trading Terminal and Chart UI
├── scripts/
│   ├── run-tests.cjs              # Test runner script
│   └── compile-contracts.cjs      # Tolk smart contract compiler script
└── tests/
    └── unit-tests.cjs             # Automated test suite
```

---

## 4. Key Components and Functionality

### Client-Side Zero-Knowledge Proof Integration
When a user launches a token or buys shares on the bonding curve, the application generates a Poseidon SHA-256 nullifier hash locally using the `zk-tele-auth` SDK. This proves the user is a unique, verified Telegram user without exposing their numeric Telegram User ID or personal data to the public or on-chain contracts.

### Anti-Sniper Allocation Cap
To prevent automated MEV bots from purchasing large portions of the token supply at launch, PrivaLaunch restricts early bonding curve purchases to a maximum of 50 TON per verified ZK nullifier. Attempting to bypass this limit using multiple wallet addresses fails because each purchase requires a distinct ZK nullifier proof.

### On-Chain Smart Contracts (Tolk 1.2)
Smart contracts are written in Tolk 1.2 for execution on the TON Virtual Machine (TVM).
- `priva_launchpad.tolk`: Manages bonding curve state, receives TON deposits, enforces buy limits per nullifier hash, and triggers liquidity migration.
- `priva_token.tolk`: Standard TEP-74 Jetton Master contract handling token minting.
- `priva_wallet.tolk`: Standard TEP-74 Jetton Wallet contract handling user balances and transfers.

---

## 5. Development and Build Instructions

### Prerequisites
Node.js (v18 or higher) and npm.

### Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/EF-Code/priva-launch.git
cd priva-launch
npm install
```

### Development Server
Run the local development server with hot module replacement:

```bash
npm run dev
```

### Production Build
Build the optimized production assets:

```bash
npm run build
```

### Run Tests and Compile Contracts
Execute the unit test suite and compile Tolk smart contracts:

```bash
npm test
npm run compile-contracts
```

---

## 6. License

MIT License. Copyright (c) 2026 ef-code.
