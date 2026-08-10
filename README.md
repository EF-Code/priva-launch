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

See the [protocol specification](docs/PROTOCOL_SPEC.md) before treating any component as production-ready.
The planned [contract architecture](docs/CONTRACT_ARCHITECTURE.md) explains the
factory, per-launch, jetton, verifier, and DeDust boundaries.
The [zk-tele-auth integration contract](docs/ZK_TELE_AUTH_INTEGRATION.md)
describes the gateway-attested private-identity flow this web app will present;
it is not connected in the current demo.
The [wallet and chain integration gate](docs/WALLET_AND_CHAIN_INTEGRATION.md)
lists the reviewed deployment artifacts required before the demo can connect a
real wallet.
The [gateway and indexer service contract](docs/GATEWAY_AND_INDEXER_SERVICE.md)
defines the privacy and confirmation boundaries for the future web app.

## Repository structure

```
priva/
├── contracts/                  # Fail-closed Tolk protocol-boundary scaffolds
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

`npm test` currently tests only the JavaScript bonding-curve helper. `npm run compile-contracts` is a placeholder validation script; it does not produce contract artifacts. The obsolete generated wrappers were removed; native message-level Acton tests must be added with the real implementation before any contract can receive value.
