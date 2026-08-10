# Priva Protocol Specification

**Status:** Draft 0.1 — implementation-blocking design document  
**Scope:** A non-custodial TON token-launch protocol. This document supersedes all production claims in the current demo UI and contract sketches.  
**Mainnet status:** Not approved. No contract may accept user value until this specification is implemented, tested, audited, and deployed with a published configuration manifest.

## 1. Goals and non-goals

Priva intends to provide an on-chain token launch with deterministic pricing and a capped, privacy-preserving early allocation. The protocol must make its money movement and allocation rules enforceable without trusting the frontend, an indexer, or a relayer.

It does not promise perfect anonymity, a guarantee against all MEV, an untraceable token market, or a risk-free asset. A public identity nullifier can make a participant's purchases linkable within a launch. The system must describe that limitation to users before they transact.

Version 1 has no creator allocation and no platform fee. Those fields must be zero in every accepted launch configuration. Adding either requires a future, separately audited specification revision.

## 2. Terms and units

| Term | Definition |
| --- | --- |
| `nanoTON` | The integer unit used for every TON amount on-chain. Floating-point numbers are forbidden. |
| `S` | Fixed jetton supply for one launch. The initial template uses `1_000_000_000` whole tokens, with jetton decimals and raw supply fixed in the deployment manifest. |
| `R` | Graduation raise target. The initial template uses `85 TON` (`85_000_000_000 nanoTON`). |
| `identityNullifier` | A domain-separated public ZK output identifying one eligible Telegram identity for one launch without exposing the Telegram ID. |
| `actionNullifier` | A one-time public ZK output that prevents reuse of the same authorization for a buy or creation action. |
| `quote` | The exact on-chain result for a deposit: tokens, accepted value, excess refund, and post-trade state. |

## 3. Architecture and trust boundaries

```text
User wallet + verified Telegram data
             │ witness only
             ▼
  ZK prover ───────────────► ZK verifier contract
             proof/public inputs       │ valid proof only
                                       ▼
Factory ──creates──► Per-launch Launchpad ──► Standard Jetton Master/Wallets
                           │
                           └─► immutable DeDust migration adapter

Frontend, indexer, and relayer are untrusted for pricing, identity eligibility,
allocation, contract addresses, and final transaction status.
```

The frontend only composes cells and displays independently indexed chain state. A relayer may transport a proof or sponsor gas, but cannot certify identity, choose a recipient, alter a quote, or authorize a trade. Telegram `initDataUnsafe`, client-provided user IDs, and local hashes are never trusted inputs.

## 4. Contract set and authority model

### 4.1 Factory

The factory deploys a launchpad only from an approved, immutable code hash and a fully validated configuration cell. It records the deterministic launchpad address and rejects duplicate launch identifiers. It cannot edit a deployed launchpad's economics, verifier key, token code, treasury address, or migration destination.

### 4.2 Per-launch launchpad

The launchpad owns its sale inventory and is the sole caller authorized to issue the configured sale allocation from the jetton master. It stores, at minimum:

- immutable launch configuration and code hashes;
- current state, sold amount, accepted raise, and reserved migration amount;
- identity-nullifier purchase totals;
- consumed action nullifiers;
- a bounded pending-operation record for asynchronous mint and migration messages; and
- explicit accounting for refunds and excess value.

### 4.3 Jetton contracts

Use an audited, standards-compliant TEP-74 master and derived wallet implementation. Minting must be authorized only by the launchpad and bounded by `S`; there is no general-purpose admin mint. Transfers, burns, notifications, wallet address derivation, bounces, and excess handling must follow the selected TEP-74 reference implementation.

### 4.4 Governance and emergency controls

Each launch's immutable configuration identifies a governance multisig and a pause authority. Neither may be a single externally owned account.

The complete role boundaries and emergency semantics are defined in the
[governance and emergency control policy](GOVERNANCE_AND_EMERGENCY_CONTROL.md).

- A pause can reject new buys and creation requests. It must not transfer sale reserves, alter prices, mint tokens, change the verifier, or block an already due refund.
- Economic changes and code upgrades are prohibited for a deployed launchpad in version 1.
- If a future version permits factory-template changes, they require a published proposal, a minimum 48-hour timelock, and a multisig threshold recorded in its deployment manifest.
- All authority messages require sender authentication, an opcode-specific body schema, a query ID, and replay protection where the action is not idempotent.

## 5. Launch configuration validation

The factory accepts a configuration only when all checks pass:

1. `S`, `R`, token metadata commitment, pricing parameters, cap parameters, verifier key commitment, and DeDust adapter address are present and in range.
2. The total configured sale allocation equals `S`; creator allocation, platform fee, and hidden reserve amounts equal zero for version 1.
3. The per-identity buy cap is positive and no greater than 5% of `R`. With the initial `85 TON` target, the maximum mainnet cap is `4.25 TON`; the prototype's `50 TON` value is not permitted.
4. The pricing function is monotonic, bounded, and integer-evaluable for every valid supply point.
5. The configured adapter and jetton code hashes match the factory allowlist.
6. The configuration reserves enough deployment and message gas. User payment is never silently used to cover an unbounded operator cost.

The full configuration cell, code hashes, governance addresses, and deployment parameters must be published before accepting deposits.

## 6. Pricing and settlement

The production protocol may use a monotonic linear bonding curve only after its
fixed-point parameters are independently reviewed. The current **testnet
candidate** uses a fixed-price sale to remove curve rounding and overflow risk.
It sells whole-token units only: 1,000,000,000 sale units at 85 nanoTON each,
for an exact 85 TON target. Fractional jetton balances remain valid under
TEP-74, but fractional sale units are not accepted in this candidate.

For a buy with available value `v`, the contract computes `q` as the smaller
of the remaining sale units and `floor(v / 85 nanoTON)`. It issues `q` whole
tokens, accepts exactly `q * 85 nanoTON`, and returns the remainder as excess
after the fixed documented gas reserve. No frontend quote is authoritative.

The deployment is invalid if the candidate would issue more than one billion
sale units or accept more than 85 TON. The repository's
[`fixed-sale` reference model](../src/protocol/fixed-sale.cjs) uses `BigInt`
and is a test oracle for the eventual Tolk implementation; it is not a
substitute for the same checks in Tolk.

There is no sell-back curve in version 1. A user can transfer jettons under TEP-74 but cannot redeem them against the launchpad. This avoids an unreviewed reserve-liability path. Post-graduation trading occurs only through the configured external pool.

## 7. Identity proof and allocation rules

Every create or buy authorization must contain a ZK proof verified by the on-chain verifier. Its public inputs bind:

- the launchpad address and TON workchain;
- the launch identifier and circuit/verifying-key version;
- `identityNullifier` scoped to this launch;
- `actionNullifier` scoped to the requested operation;
- an expiry epoch; and
- the recipient wallet address for a buy, or the creator action commitment for a launch.

The witness is issued by the Priva gateway after it validates Telegram-authenticated data server-side. The circuit proves knowledge of the gateway's stable issuer secret while binding a credential to the verifier-pinned issuer commitment and policy. The circuit must domain-separate nullifiers; it must not use a frontend-controlled, random, or public constant salt as a substitute for proof verification. The complete boundary is defined in [the zk-tele-auth integration contract](ZK_TELE_AUTH_INTEGRATION.md).

The launchpad rejects a proof when the verifier fails, its launch/workchain binding differs, its epoch is expired, its action nullifier was consumed, or its identity-nullifier total plus the **accepted** buy amount exceeds the configured cap. The contract marks an action nullifier only after all synchronous validation succeeds. It records the allocation total only for the value it actually accepts.

The circuit, proving key provenance, verifier-key hash, Telegram-validation design, and nullifier derivation require independent cryptographic review before mainnet. A relayer-issued attestation is not an acceptable substitute unless a later specification explicitly introduces and discloses that trusted issuer.

## 8. State machine and money movement

```text
Draft -> Active -> GraduationLocked -> MigrationPending -> Migrated
                 \-> Paused
MigrationPending -> MigrationFailed -> MigrationPending (same immutable adapter only)
```

- **Draft:** Deployed but not accepting value; configuration can only be inspected.
- **Active:** Valid buys settle using the curve. A buy that would pass `R` accepts only the value required to reach `R` and refunds the rest.
- **GraduationLocked:** No new buys are accepted. Sale accounting is frozen and the migration payload is constructed from the immutable configuration.
- **MigrationPending:** The launchpad sends only the documented reserve and jetton amounts to the configured adapter. No user- or governance-provided destination is accepted.
- **Migrated:** External-pool completion is recorded. The launchpad cannot mint, accept buys, or move reserves again.
- **MigrationFailed:** A recorded bounce or adapter failure permits a retry to the same address and parameters after diagnosis. It does not authorize a reserve withdrawal or adapter change.
- **Paused:** New buys are rejected. Refund/excess and already-authorized recovery paths remain available.

For every inbound value-bearing message, the body contains a known opcode and query ID and has a bounded, fully parsed layout. Unknown opcodes, malformed cells, invalid refs, unexpected senders, and insufficient value are rejected before state mutation. The implementation must explicitly model action-phase failures and bounced messages; it must never assume that a successful outgoing send implies downstream success.

## 9. Refunds, fees, and reserves

- Version 1 charges no protocol, creator, referral, or hidden fee.
- A valid buy receives its exact on-chain quote. Any unaccepted amount is returned to the inbound sender, subject only to a published fixed gas reserve.
- If the launchpad cannot complete its local buy processing, it must leave accounting unchanged and return the remaining value where TON message semantics permit.
- There are no discretionary refunds for market loss, price movement, or user error after a settled buy.
- Contract balances reconcile as: accepted sale proceeds + explicitly tracked gas reserves + pending refunds/migration reserve. Every transition must preserve this equation.

## 10. DeDust migration requirements

The adapter address, expected factory/pool code hashes, asset ordering, sale token amount, and TON reserve amount are immutable launch configuration. Migration must verify the sender/callback origin of every response and handle a bounced downstream message.

Before deployment, the implementation must specify and test the exact DeDust message cells, LP-recipient policy, pool-init behavior, minimum reserve thresholds, and each callback/bounce transition. LP ownership cannot default silently to a creator or operator; its recipient and lock/escrow policy must be public in the configuration.

## 11. Required security properties

The implementation and tests must prove or exercise these properties:

1. **Value conservation:** every accepted nanoTON is accounted for as curve reserve, a documented gas reserve, an excess refund, or migration value.
2. **Supply conservation:** no path mints more than `S`; every issued unit is attributable to a successful launchpad settlement.
3. **Authorization:** no unauthorized caller can mint, pause beyond its scope, withdraw, alter configuration, or invoke migration.
4. **Replay resistance:** a consumed action nullifier cannot create, buy, mint, refund, or migrate twice.
5. **Allocation integrity:** cumulative accepted value per identity never exceeds the immutable cap, regardless of wallet count.
6. **Quote integrity:** accepted value and issued token amount equal the integer curve calculation at the recorded pre-state.
7. **Bounce safety:** a failed jetton or adapter message cannot create unbacked tokens, lose funds, or leave the state machine falsely finalized.
8. **Finality:** after `Migrated`, all sale and mint paths are closed permanently.

## 12. Implementation and launch gates

No mainnet value is permitted until all gates pass:

1. Tolk/Acton sources compile with pinned tool versions; generated wrappers and tests execute in CI.
2. Tests cover all states, opcodes, malformed messages, boundary values, cap accumulation, duplicate action nullifiers, bounces, and migration retries.
3. Property/fuzz tests exercise the pricing and accounting invariants.
4. The ZK circuit and on-chain verifier are independently reviewed and use published proving/verifying-key hashes.
5. Testnet deployment reproduces a full lifecycle with independently inspected transaction traces.
6. An independent TON smart-contract audit resolves all critical and high-severity findings.
7. A deployment manifest and frontend allowlist are published and match the deployed code/data hashes.

## 13. Open decisions that block implementation

The following must be fixed in the deployment manifest and reviewed before coding begins:

- Jetton decimal count and raw `S` representation.
- Fixed-point scale, `P0`, `K`, and rounding tolerance.
- Exact `priva_purchase_auth` circuit, proving-system feasibility/cost on TON, and verifier-key provenance.
- Required gas reserve per inbound/outbound message.
- DeDust pool version, adapter code hash, LP recipient, and LP lock/escrow policy.
- Governance multisig members, threshold, pause authority, and future template-governance timelock.

Until these are resolved, this document defines safety constraints, not a deployable contract configuration.
