# 🚀 PrivaLaunch (`priva-launch`)

> **Anonymous Anti-Sniper Memecoin Launchpad on TON Powered by `zk-tele-auth` Zero-Knowledge Proofs**

[![TON Ecosystem](https://img.shields.io/badge/TON-Smart_Contracts-0088cc.svg)](https://ton.org)
[![Zero Knowledge](https://img.shields.io/badge/ZK-zk--tele--auth-00f2fe.svg)](https://github.com/EF-Code/zk-tele-auth)
[![Tolk Contract](https://img.shields.io/badge/Tolk-1.2-purple.svg)](https://docs.ton.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**PrivaLaunch** completely reimagines token launchpads (like `pump.fun` or `DeDust`) by solving the two biggest flaws in Web3 token launches: **Sniper Bot Front-running** and **Creator Doxxing / Harassment**.

By integrating **`zk-tele-auth`**, PrivaLaunch enforces **100% Creator Anonymity** and **Anti-Sniper Fair Allocations** directly through Zero-Knowledge proofs.

---

## 🌟 Traditional Launchpads vs. PrivaLaunch

| Feature | Traditional Launchpads (`pump.fun`) | **PrivaLaunch** |
| :--- | :--- | :--- |
| **Creator Identity** | Wallet address publicly visible | 🛡️ **100% Anonymous** (Creator = ZK Nullifier Hash) |
| **Sniper Bot Front-running** | MEV bots buy 80% supply in 1s using 500 dummy wallets | 🛡️ **Anti-Sniper Enforced** (Max 50 TON buy per unique ZK Telegram user) |
| **Sybil Attack Resistance** | None (anyone can spin up 1,000 wallets) | ⚡ Enforced by **`zk-tele-auth`** Poseidon Nullifier Hash |
| **Liquidity Graduation** | Auto-migrates upon target cap | ⚡ Auto-graduates to **DeDust CPMM v2** upon 85 TON raise |

---

## 🏗️ System Architecture & Protocol Flow

```
┌────────────────────────────────┐
│   Telegram MiniApp / Creator   │
│ (Generates zk-tele-auth Proof) │
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│   PrivaLaunch WebApp & SDK     │
│(Applies Anti-Sniper Buy Limit) │
└───────────────┬────────────────┘
                │
                ▼
┌────────────────────────────────┐
│ Tolk 1.2 Smart Contract (TON)  │
│  (priva_launchpad.tolk)        │
└───────────────┬────────────────┘
                │ (Hits 85 TON Raised)
                ▼
┌────────────────────────────────┐
│   DeDust CPMM Liquidity Pool   │
└────────────────────────────────┘
```

---

## 📦 Project Structure

```
priva-launch/
├── package.json                   # Dependencies & test scripts
├── index.html                     # Main Glassmorphic SPA
├── index.css                      # Design tokens & Glassmorphic styling
├── contracts/
│   └── priva_launchpad.tolk       # Tolk 1.2 Bonding Curve Launchpad contract
├── src/
│   ├── app.js                     # Main application controller state & feed
│   ├── zk-auth.js                 # zk-tele-auth SDK integration module
│   ├── bonding-curve.js           # Bonding curve pricing math engine
│   └── bonding-curve-cjs.js       # CommonJS variant for unit testing
├── scripts/
│   └── run-tests.js               # Test runner script
└── tests/
    └── unit-tests.js              # Unit test suite
```

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/EF-Code/priva-launch.git
cd priva-launch

# Run unit tests
npm test
```

---

## 📄 License

MIT License © 2026 ef-code.
