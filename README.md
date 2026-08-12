# Priva

> Demo-only interface prototype for a proposed privacy-preserving TON token launchpad.

## Status: fail-closed testnet integration; not deployed

This repository is an early product and contract prototype. It is **not a live TON launchpad**. The shipped build has no reviewed deployment manifest, so it stays in demo/read-only mode and cannot connect a wallet or submit a transaction. When a real reviewed testnet manifest is injected, the UI can lazily open TonConnect and construct one canonical testnet purchase request; it still does not turn unreviewed contracts, gateway responses, or browser state into authorization.

Do not send TON to an address represented by this project unless you are deliberately
testing the documented testnet contracts. The repository records observed testnet
launchpad and settlement-minter addresses in
[`deployment/testnet/observed-deployments.json`](deployment/testnet/observed-deployments.json),
but it still has no reviewed runtime manifest or public gateway/indexer. Demo mode
contains simulated launch cards for product exploration only; testnet mode renders
no fixtures when its reviewed indexer is unavailable. A solo-owner testnet
attestation is self-attestation rather than an independent audit.

## What is here today

- A Vite single-page interface with a fail-closed testnet manifest, TonConnect, gateway, and indexer boundaries.
- An explicit two-step testnet purchase review: Telegram-signed gateway proof first, wallet approval second.
- Illustrative bonding-curve calculations.
- Candidate Tolk/Acton launchpad and settlement-minter contracts with emulator lifecycle tests.
- JavaScript tests for pricing, manifest validation, gateway/indexer transport, canonical transaction encoding, and real-proof emulator paths.

## What must exist before a mainnet launch

1. A written protocol specification covering pricing, fees, refunds, migration, privileged roles, and failure paths.
2. Cryptographically verified Telegram authentication and a real, replay-resistant ZK/nullifier design.
3. Complete on-chain enforcement of pricing, cumulative allocations, minting, transfers, accounting, and migration.
4. Authentic TonConnect integration with canonical contract addresses and independently indexed confirmation tracking.
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
The [test strategy](docs/TEST_STRATEGY.md) records current coverage and the
gates that must pass before mainnet value is accepted.
The [governance and emergency control policy](docs/GOVERNANCE_AND_EMERGENCY_CONTROL.md)
limits future privileged actions to user-protective controls.
The [operations and incident-response guide](docs/OPERATIONS_AND_INCIDENT_RESPONSE.md)
defines the service and monitoring controls needed before any live deployment.
The executable [release-readiness gate](docs/RELEASE_READINESS.md) is expected
to block until reviewed deployment and assurance evidence is present.
The loopback-only [local service boundary](services/README.md) provides a real
proof adapter and a no-fixture indexer proxy for development; it is not a
public endpoint or a substitute for live chain evidence.

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

To exercise the service boundaries locally, provide the real gateway policy
through your local secret manager and run:

```bash
npm run gateway:local
npm run indexer:local
npm run test:local-services
```

The gateway refuses to start without `PRIVA_GATEWAY_MODE=local`, binds only to
loopback, and never prints the Telegram bot token or issuer secret. The indexer
returns no launches until a real upstream is configured. The Pages workflow
builds the app, TonConnect manifest, SVG icon, and public token metadata, but
does not inject a reviewed deployment manifest or enable wallet actions.

The default build intentionally has no deployment manifest. `npm test` runs the JavaScript boundaries and manifest fixtures; `npm run test:contracts`, `npm run test:real-verifier`, and `npm run test:real-lifecycle` cover the candidate contracts and emulator paths. These checks do not create a live address, replace an independent audit, or authorize a wallet broadcast.
