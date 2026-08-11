# Priva controlled-testnet deployment runbook for Luna Max

Last prepared: 2026-08-11

This is the execution handoff for taking Priva from its current repository state to a controlled TON testnet deployment. Follow the phases in order. Do not interpret compilation, fixture validation, or a successful deploy transaction as proof that the launchpad lifecycle is safe.

## Outcome and present blocker

The project is not yet safe for a public testnet sale. The principal blocker is the mint-settlement protocol.

The current launchpad consumes the purchase authorization and updates sale accounting before it has reliable proof that the buyer received jettons. The standard jetton minter can roll back supply after a downstream jetton-wallet failure without necessarily returning a terminal failure callback to the launchpad. This can leave the buyer without tokens while the launchpad records a completed sale.

Do not deploy the current candidate publicly until success and failure have deterministic, authenticated terminal outcomes.

## 1. Protect and inspect the existing work

Start with:

```bash
cd /home/wellington/stuff/priva

git status --short
git diff -- .gitmodules contracts/priva_testnet_launchpad.tolk
git diff --submodule=log
git submodule status --recursive
git rev-parse HEAD
git rev-parse origin/main
git config --show-origin --get-regexp '^user\.(name|email)$'
```

Expected current baseline:

- Branch: `main`.
- HEAD: `79356e4265b9aaa895089fe7e0ff4dd58376f54c`.
- Modified: `.gitmodules`, `contracts/priva_testnet_launchpad.tolk`, `vendor/ton-token-contract`, and content in `vendor/zk-tele-auth`.
- Untracked deployment evidence exists under `evidence/`.

Do not reset, clean, checkout, or overwrite this work. Inspect the evidence before deciding whether to commit it. Use the user's global Git identity and remove any accidental repository-local identity override. Use the existing GNOME-keyring GitHub authentication. Never use or print the previously exposed access token.

The intended official jetton dependency is:

```text
Repository: https://github.com/ton-blockchain/jetton-contract.git
Revision: d55f228edb0eb477cb4845d67e0dacc6489c6b57

Minter code-cell hash:
f83d05490af7c9cc58019488c7b253c9492d49c25d12d09383e52e81537e343a

Wallet code-cell hash:
ba2918c8947e9b25af9ac1b883357754173e5812f807a3d6e642a14709595395

Wallet library hash:
8d28ea421b77e805fea52acf335296499f03aec8e9fd21ddb5f2564aa65c48de
```

Correct reference opcodes:

```text
mint              0x642b7d07
internal_transfer 0x178d4519
change_admin      0x6501f354
claim_admin       0xfb88e119
drop_admin        0x7431f221
excesses          0xd53276db
```

Update stale references in:

- `contracts/vendor/tep74-reference.lock.json`
- `docs/TEP74_SETTLEMENT_ADAPTER.md`

They still mention the older source revision and `mint opcode 21`.

First focused commit:

```text
build: pin current official jetton reference
```

Push it separately and confirm `origin/main` contains it before proceeding.

## 2. Finish the Acton ABI refactor

The only present launchpad candidate is:

```text
contracts/priva_testnet_launchpad.tolk
```

Do not deploy these fail-closed scaffolds:

- `contracts/priva_launchpad.tolk`
- `contracts/priva_factory.tolk`
- `contracts/priva_dedust_adapter.tolk`

The first controlled testnet should contain only one fixed-price launchpad and one reviewed jetton minter. Do not add a factory or DEX integration to satisfy a manifest field.

Complete the candidate contract header with its real incoming message types, including buy, admin claim, delivery acknowledgement, refund retry, and relevant bounced messages. Then regenerate the Acton wrapper:

```bash
acton wrapper priva_testnet_launchpad \
  --output tests/acton/PrivaTestnetLaunchpad.gen.tolk

acton check
acton build
acton test tests/acton --reporter console
```

Resolve candidate warnings rather than suppressing them. In particular, determine whether verifier division-before-multiplication warnings are range-safe and mathematically equivalent.

The current Acton tests only prove deployment and rejection of an unknown ABI. They do not test a purchase.

Second focused commit:

```text
refactor: align launchpad ABI with current jetton admin flow
```

## 3. Correct the mint and refund state machine

The unsafe current sequence is:

```text
buyer sends buy + valid proof
  -> launchpad consumes nullifier and counts sale
  -> launchpad asks minter to mint
  -> minter sends internal_transfer to buyer wallet
  -> buyer wallet can fail and bounce only to minter
  -> minter can roll back supply while launchpad remains unaware
```

Implement an explicit state machine:

```text
PROOF_ACCEPTED
  -> MINT_PENDING
      -> DELIVERY_ACKNOWLEDGED -> FINALIZED
      -> DIRECT_MINT_FAILURE   -> REFUND_PENDING
      -> DOWNSTREAM_FAILURE    -> REFUND_PENDING
  -> REFUNDED
  -> REFUND_RETRYABLE
```

Store per purchase:

- query ID;
- action nullifier;
- identity nullifier or identity-cap key;
- buyer and refund address;
- expected buyer jetton-wallet address;
- inbound value;
- accepted sale value;
- gas reserve;
- refundable excess;
- token amount;
- creation time;
- settlement state;
- refund retry eligibility.

Enforce these invariants:

```text
finalized sold units == acknowledged token deliveries
finalized accepted TON == value of acknowledged sales
a query ID finalizes at most once
an action nullifier authorizes at most one purchase
identity cap includes pending plus finalized exposure
refund amount never exceeds reserved refundable value
contract assets always cover refund liabilities
a late acknowledgement can never coexist with a completed refund
```

### Authenticate mint success

The jetton wallet can send `excesses#d53276db` to the configured response address. The launchpad must:

1. Derive the expected recipient jetton-wallet address deterministically.
2. Accept success only from that address.
3. Match its query ID to a pending mint.
4. Reject duplicate or forged acknowledgements.
5. Only then finalize sold units and accepted TON.
6. Terminally mark or delete the pending purchase.
7. Return refundable buyer excess safely.

Pin the wallet code hash or all wallet-derivation inputs in immutable launch configuration.

### Resolve downstream wallet failure

An arbitrary timeout is not proof that minting failed. A late success after a timeout refund could give the buyer both jettons and TON.

Preferred design: use a narrow settlement minter or wrapper that emits authenticated terminal success and failure callbacks to the launchpad. If the official minter is modified, the modified implementation needs its own full review and lifecycle coverage.

A tiny allowlisted deployment may be used only as a diagnostic trace collection run. It must be labelled unsafe and must not become a public sale.

If no deterministic terminal outcome can be implemented, stop deployment.

### Make refunds solvent

Define an explicit gas reserve:

```text
inbound value = accepted sale value + refundable excess + execution/message reserve
```

Do not promise to refund value already spent on gas or outgoing messages. Test the most expensive bounce chain. Add getters for configuration, minter, pending/finalized sold amounts, accepted TON, refund liabilities, query state, nullifier state, identity usage, admin and pause status.

Focused commit:

```text
fix: finalize sales only after authenticated mint settlement
```

## 4. Add real lifecycle tests

Use:

- the actual compiled launchpad;
- the official minter or reviewed settlement minter;
- actual jetton-wallet code;
- a real Groth16 `priva_purchase_auth` proof;
- TON sandbox/emulator transaction traces.

Do not use a mocked verifier or mocked minter for the principal success and failure tests.

The ZK submodule contains `PrivaPurchaseAuthProofGenerator.generateProof`. The proof contains 17 public signals binding identity/action nullifiers, authorization, application domain, time policy, issuer commitment, launch ID, launchpad address, BUY operation, recipient, client nonce, expiry and circuit version. Use `proofToMessageCell` to construct the exact on-chain proof cell.

Required cases:

1. Valid proof, mint and authenticated delivery acknowledgement.
2. Buyer jetton-wallet balance and minter total supply match.
3. Launchpad finalized accounting matches delivery.
4. Action-nullifier replay.
5. Identity cap across different action nonces or wallets.
6. Wrong issuer, domain, launch ID, launchpad, recipient, operation or version.
7. Expired, future-dated and excessive-age proofs.
8. Sold out, exact-unit and fractional-unit behavior.
9. Duplicate query ID.
10. Direct minter bounce.
11. Recipient-wallet downstream failure.
12. Excess refund.
13. Refund bounce and sender-only retry.
14. Unauthorized forged rich bounce.
15. Malformed cells.
16. Admin nomination and claim.
17. Conservation and property/fuzz tests over values, gas and message ordering.

Admin lifecycle:

```text
temporary deployer is minter admin
  -> deployer sends change_admin nominating launchpad
  -> launchpad sends claim_admin
  -> minter admin equals launchpad
  -> next_admin equals null
```

Focused commit:

```text
test: cover real-proof mint and refund lifecycle
```

## 5. Freeze source and regenerate all derived values

Only after the protocol and tests stabilize, run:

```bash
npm test
npm run build
acton check
acton build
acton test tests/acton --reporter console
git diff --check
```

`npm test` currently fails because the fixture pins an old launchpad code-cell hash. The current dirty build was observed as:

```text
29739753A350C26D190C82CF66EC996FD042D13C120C095EF243DA562F2D2572
```

Do not adopt that hash now. Freeze final source first, then regenerate code, code-cell hash, data, data-cell hash, StateInit, address, fixtures and real manifests.

Rename ambiguous `launchpadCodeSha256` fields to `launchpadCodeCellHash`, or precisely document the hashing representation. Fixtures must be explicitly marked as fixtures and must not be accepted as reviewed deployment evidence.

## 6. Reproduce and deploy the minter

Use the official FunC minter unchanged unless the settlement solution requires a reviewed extension. Do not port it to Tolk just to claim that all contracts use Acton.

Use Blueprint to compile/test the official minter and Acton for the Priva contract and deployment transaction. The current Node 26/npm 12 environment caused an upstream lockfile problem around `fsevents`. Use an isolated Node 20 LTS and npm 10 environment. Do not rewrite the upstream lockfile.

Inside `vendor/ton-token-contract`:

```bash
npm ci
npm run build
npm test
```

Stop and record exact output if the lock still fails.

Deployment metadata:

```text
URL: https://ef-code.github.io/priva-launch/testnet/v1/metadata.json
Previously verified SHA-256:
e0c4409d35ba05df5d9b6845a6ad02cc7bf851ca659fa2367834d5739ed9c381
```

Provisional candidate, to be recalculated after freeze:

```text
Minter address:
kQDkt3NSn0doDszCRAqTfTWFDBgFu4tRmzYZm_ljl_f7NLQE

Initial data-cell hash:
585c987f77edc7e3508c6b9d1a396ce90162fb3b9dfdc9f53d0315b02bb7a578
```

Funded deployment wallet:

```text
kQDl6Fca5kStV9Vh5S0rBE26H5r8m1lOb1daMAgV8U5POIoV
```

It previously held 4.5 testnet TON and was uninitialized. Network refresh failed on 2026-08-11 because DNS was unavailable. Recheck live state before every send:

```bash
acton wallet list --balance
acton rpc info kQDkt3NSn0doDszCRAqTfTWFDBgFu4tRmzYZm_ljl_f7NLQE --net testnet
```

Never display/export the mnemonic. Before deployment prove the destination is uninitialized, StateInit is reproducible, initial supply is zero, metadata matches, and the temporary admin is the deployer. After deployment verify code, data, supply, admin, next-admin, content and wallet library through two independent providers.

## 7. Produce real reviewed initialization and manifest files

Create real, non-fixture files:

```text
deployment/testnet/reviewed-init.json
deployment/testnet/reviewed-manifest.json
```

The verifier is inlined. Do not invent a verifier address. Represent it as:

```json
{
  "verifierMode": "inlined",
  "verifierCodeCellHash": "...",
  "verificationKeySha256": "...",
  "circuitArtifacts": {
    "wasmSha256": "...",
    "r1csSha256": "...",
    "zkeySha256": "..."
  }
}
```

The real manifest must pin:

- exact Git commit and testnet/workchain;
- launchpad code/data/StateInit hashes and address;
- minter address, code hash and live admin state;
- wallet code and library hashes;
- jetton source revision;
- metadata URL, digest and decimals;
- price, hard cap, identity cap and gas policy;
- app-domain, issuer-key and launch-ID hashes;
- circuit version and artifact hashes;
- gateway, indexer and TonConnect URLs;
- deployment transactions and block references;
- reviewer approvals.

Current verification-key SHA-256:

```text
bde50de738c19ff675d19d09e611aae50247e1658df798b520313acc076466ae
```

The present ZK setup is development-only and lacks a production ceremony. It is acceptable only for explicitly labelled testnet testing. `npm run check:priva-production` must remain fail-closed.

Two independent reviewers must publish HTTPS evidence that pins the exact commit and material hashes. Do not fabricate approvals, identities or URLs. If approvals are absent, prepare a review bundle and stop for real human review.

Focused commit:

```text
build: harden reviewed testnet manifests
```

## 8. Defer factory and DEX migration

For this deployment set:

```json
{
  "features": {
    "dexMigration": false,
    "factoryLaunches": false
  }
}
```

Do not insert fake DeDust values. A future DEX phase must separately cover authorization, liquidity calculations, slippage, live testnet vault/pool discovery, code hashes, bounce recovery, LP ownership/locking and one-time migration. Revalidate the previously considered DeDust revision `3aa071fb7f906e492c2fcc8f771812a3da0dfe78` at that time.

## 9. Deploy the proof gateway

The user must supply the actual application domain, Telegram bot/Mini App, gateway hostname, issuer secret and operational owner. Do not invent these.

Never commit bot tokens, issuer secrets, mnemonics, raw Telegram `initData`, provider keys or identifying proof requests.

Use one canonical request schema accepting TON addresses; derive hashes and address limbs inside trusted gateway code. The service must validate Telegram HMAC and `auth_date`, bind user/domain/issuer/launch/launchpad/BUY/recipient, generate unique action nullifiers, generate and self-verify the proof, and return the proof cell plus public inputs.

Also require TLS, strict CORS, body/rate/concurrency limits, secret storage, safe logs, health/version endpoints and published non-secret policy hashes. Real Telegram `initData` requires an actual Telegram Mini App; a normal browser cannot manufacture it.

Focused commit:

```text
feat: add testnet purchase authorization gateway
```

## 10. Add a confirmation-aware indexer

Track masterchain-confirmed transactions and persist transaction hash, logical time, block sequence, account, opcode, query ID, decoder version and settlement state. Distinguish:

```text
submitted
included
mint pending
delivery acknowledged
finalized
refund pending
refunded
failed
```

Implement idempotent ingestion, persistent cursors, retries and finality handling. The UI must never equate wallet submission with purchase completion.

Focused commit:

```text
feat: index confirmed testnet launch lifecycle
```

## 11. Enable the real TonConnect UI

Current UI integration remains demo/read-only in `src/ton-wallet.js`, `src/app.js`, and `src/deployment-config.js`.

Use the current official TonConnect SDK and host `tonconnect-manifest.json` at the exact application origin. Add connect/disconnect, enforce testnet, load and verify only the real reviewed manifest, request the gateway proof, build the exact buy BOC, show price/token/fees/recipient/launch ID before confirmation, submit through TonConnect and track settlement through the indexer.

Show success only after authenticated finalization. Show refund state and retry eligibility. Disable Buy whenever the manifest, hash checks, wallet network, gateway, indexer or origin checks fail.

Focused commit:

```text
feat: enable reviewed TonConnect testnet purchases
```

## 12. Exact deployment order

1. Freeze and commit all source.
2. Rebuild from the clean commit.
3. Record final launchpad code-cell hash.
4. Recalculate minter StateInit.
5. Confirm minter address remains uninitialized.
6. Deploy minter with the funded deployer as temporary admin.
7. Verify minter live state through two providers.
8. Construct final launchpad StateInit with exact minter, proof policy, economics and settlement design.
9. Calculate the final launchpad address.
10. Generate a real proof bound to that exact address.
11. Run the deployment script locally/emulated.
12. Deploy with Acton on testnet:

```bash
acton script <deployment-script> --net testnet --explorer tonscan
```

13. Verify live launchpad code/data hashes.
14. Deployer nominates the launchpad as minter admin.
15. Launchpad claims minter admin.
16. Verify `admin == launchpad` and `next_admin == null`.
17. Enable one allowlisted wallet only.
18. Execute the smallest practical real purchase.
19. Capture every transaction and bounce.
20. Verify buyer jetton balance, minter supply, finalized sales, accepted TON, excess refund and zero unexpected pending liabilities.
21. Publish the deployment record.
22. Enable its reviewed manifest in the UI.
23. Expand access gradually after multiple clean runs.

Final deployment-record commit:

```text
deploy: record verified controlled-testnet contracts
```

## 13. Mandatory gates

Before declaring controlled testnet ready:

```bash
git status --short
git diff --check

npm test
npm run build

acton check
acton build
acton test tests/acton --reporter console

npm run check:priva-artifacts
npm run check:testnet-init
npm run check:testnet-manifest
```

These may and should remain blocked until real mainnet evidence exists:

```bash
npm run check:release
npm run check:priva-production
```

Do not weaken them.

## 14. Definition of done

Controlled testnet is ready only when all of the following are true:

- clean repository at the reviewed commit;
- official jetton build is reproducible and its tests pass;
- root build, JS tests and Acton checks/tests pass;
- a real Groth16 proof drives the complete lifecycle;
- the real reference/reviewed minter and wallet are used, not mocks;
- mint success and failure have authenticated terminal outcomes;
- finalized accounting occurs only after delivery acknowledgement;
- refunds remain solvent through bounce paths;
- useful state getters exist;
- real reviewed initialization and manifest checks pass;
- two independent approvals pin exact hashes;
- metadata, gateway, indexer and TonConnect endpoints are live;
- live code/data hashes match reviewed values;
- minter admin is the exact launchpad;
- one real wallet purchase has matching token balance, supply, accounting and refunds;
- UI remains fail-closed on every dependency or hash mismatch.

## 15. Non-negotiable rules for Luna

- Do not deploy the fail-closed factory, adapter or original scaffold.
- Do not publicly deploy the current candidate before settlement is corrected.
- Do not treat timeouts as proof of mint failure.
- Do not invent reviews, URLs, domains, addresses or hashes.
- Do not replace the real Groth16 proof with a fixture.
- Do not treat mock contracts as lifecycle evidence.
- Do not update hashes before source is frozen.
- Do not reveal wallet seeds, access tokens, bot tokens or issuer secrets.
- Do not rewrite upstream locks merely to pass installation.
- Do not force-push or discard the current dirty worktree.
- Do not enable DEX migration or a factory in the initial deployment.
- Do not describe the development ZK setup as mainnet-ready.
- Do not show UI success before confirmed settlement.
- Stop immediately on a live code, data or address mismatch.

Use focused functional commits and push each completed phase independently. After every push, fetch and verify that local and remote refs contain the intended commit. If a gate fails, report the exact blocker and leave deployment disabled.
