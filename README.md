# Priva

Privacy-preserving, fixed-price token launches on TON.

## Release status

Priva is currently a controlled testnet release candidate. The default build is
intentionally unconfigured: no runtime deployment manifest is committed, so
wallet actions remain disabled until the exact testnet addresses, service
endpoints, code hashes, and policy commitments are published together.

The repository contains the testnet launchpad, settlement-minter integration,
Telegram-bound purchase authorization flow, TonConnect boundary, and read-only
chain indexer. It does not claim to be a mainnet launchpad. Do not send funds
to any address from this repository unless you are deliberately testing the
documented testnet deployment.

The current testnet profile is a fixed-price sale with DEX migration disabled.
The factory and DeDust migration boundary remain disabled until their complete
message schemas, callback/bounce handling, deployment evidence, and lifecycle
tests are available.

## Product boundary

- The browser displays only launch records returned by the configured indexer.
- Telegram `initData` is verified by the issuer gateway; secrets never enter
  the browser or repository.
- Purchase authorization binds the launch, recipient, operation, expiry, and
  replay-protection values.
- TonConnect requests one canonical testnet transaction only after explicit
  wallet approval.
- A submitted transaction is not shown as final until independent chain data
  confirms the exact operation.

## Repository layout

```text
contracts/       Tolk/Acton protocol boundaries and testnet launchpad
deployment/      Testnet initialization and observed deployment records
docs/            Protocol, integration, operations, and release documentation
services/        Loopback gateway and read-only chain indexer boundaries
src/             Browser application and protocol clients
tests/           Reference-model, emulator, transport, and lifecycle tests
scripts/         Compilation, deployment, and release validation tools
```

## Local development

Requirements: Node.js 18+, npm, and Acton for contract compilation/tests.

```bash
npm install
npm run dev
```

Run the validation suite:

```bash
npm test
npm run build
npm run test:local-services
npm run test:contracts
npm run test:real-verifier
```

The gateway and indexer default to loopback-only operation. Provide policy
values and secrets through the local secret manager; never place Telegram bot
tokens or issuer secrets in shell history, logs, manifests, or commits.

## Testnet release path

1. Deploy the pinned testnet contracts and record their addresses, hashes, and
   transaction evidence.
2. Operate the gateway and indexer over HTTPS with the exact testnet policy.
3. Create `deployment/testnet/reviewed-manifest.json` for the exact source
   revision and public endpoints.
4. Run the manifest, endpoint, initialization, and release-payload checks.
5. Execute a real Telegram authorization and wallet-approved lifecycle test.

The application remains read-only until the runtime manifest is injected by
the build pipeline. See the [protocol specification](docs/PROTOCOL_SPEC.md),
[wallet integration gate](docs/WALLET_AND_CHAIN_INTEGRATION.md),
[service contract](docs/GATEWAY_AND_INDEXER_SERVICE.md), and
[release-readiness guide](docs/RELEASE_READINESS.md).
