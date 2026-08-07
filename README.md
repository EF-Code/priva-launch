# Priva

> Demo-only interface prototype for a proposed privacy-preserving TON token launchpad.

## Status: not safe for deployment or real funds

This repository is an early product and contract prototype. It is **not a live TON launchpad**. It does not connect a real wallet, submit signed transactions, verify Telegram identity, generate or verify zero-knowledge proofs, enforce purchase limits on-chain, mint a standards-compliant jetton, or migrate liquidity to DeDust.

Do not send TON to an address represented by this project. The UI contains simulated tokens, balances, trades, wallet selections, charts, and transaction identifiers for product exploration only.

## What is here today

- A Vite single-page interface that demonstrates a possible launchpad flow.
- Illustrative bonding-curve calculations.
- Incomplete Tolk contract sketches for a launchpad and jetton components.
- Minimal JavaScript tests for the pricing helpers.

## What must exist before a mainnet launch

1. A written protocol specification covering pricing, fees, refunds, migration, privileged roles, and failure paths.
2. Cryptographically verified Telegram authentication and a real, replay-resistant ZK/nullifier design.
3. Complete on-chain enforcement of pricing, cumulative allocations, minting, transfers, accounting, and migration.
4. Authentic TonConnect integration with canonical contract addresses and confirmation tracking.
5. Full Acton/Tolk compilation and integration testing, fuzz/property testing, testnet validation, and an independent security audit.
6. Transparent deployment parameters, controlled administrative authority, monitoring, and incident procedures.

See the project roadmap before treating any component as production-ready.

## Repository structure

```
priva/
├── contracts/                  # Incomplete Tolk contract prototypes
├── src/                        # Demo UI and client-side simulation modules
├── tests/                      # Limited pricing/unit test coverage
├── scripts/                    # Development helper scripts
├── Acton.toml                  # Acton contract manifest
└── index.html                  # Demo interface entry point
```

## Local development

Requirements: Node.js 18+ and npm. Acton is required separately to work with the Tolk sources.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run build
acton build
acton test
```

`npm test` currently tests only the JavaScript bonding-curve helper. `npm run compile-contracts` is a placeholder validation script; it does not produce contract artifacts. At the time this notice was added, `acton test` does not run successfully because generated wrappers cannot resolve their `@acton/*` imports.
