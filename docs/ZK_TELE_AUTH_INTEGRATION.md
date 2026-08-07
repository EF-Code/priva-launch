# zk-tele-auth Integration Contract

**Status:** Design locked; implementation blocked until Priva-specific proving
artifacts and an audited verifier are generated.  
**Reference implementation:** `/home/wellington/stuff/zk-tele-auth` at commit
`e50efa2` (inspected locally on 2026-08-07).  
**Trust model:** Gateway-attested Telegram credential plus an on-chain Groth16
proof verifier.

## Why this model

Telegram Mini App `initData` is authenticated with a bot token. That token
must remain in server-side secret storage; it cannot be shipped to a browser or
a TON contract. The gateway is therefore an explicit issuer that verifies the
Telegram HMAC and freshness. The ZK proof hides the Telegram user ID while
binding the credential to a verifier-pinned issuer commitment and policy.

The gateway is trusted to validate Telegram correctly and to protect its issuer
secret. It is **not** trusted to choose a launch, wallet, buy size, quote, or
allocation outcome: those values are bound by the proof and checked on-chain.

## Reuse boundary

The generic `telegram_auth` circuit is a useful credential primitive, but it
must not be submitted directly to a Priva launchpad. Its public signals prove a
platform-domain credential and stable identity nullifier; they do not bind a
specific launch, recipient wallet, or buy action. Reusing it directly would
permit proof replay or redirection across purchases.

Priva requires a separately named and versioned circuit, `priva_purchase_auth`.
Its circuit source, proving key, verification key, generated Tolk verifier, and
test vectors must be committed together and code-hash pinned in the factory
configuration.

## Gateway flow

```text
Telegram Mini App
  │ signed initData + requested action fields
  ▼
Priva issuer gateway
  ├─ validates Telegram HMAC, user ID, and auth_date
  ├─ checks rate limits and published issuer policy
  ├─ uses the stable issuer secret only inside the prover
  └─ returns a Priva-bound proof; never returns the secret or user ID
  ▼
User wallet sends proof + buy cell to launchpad
  ▼
Launchpad verifies proof, action replay, identity cap, quote, and mint path
```

The browser must treat every gateway response as untrusted until the on-chain
transaction is confirmed. It must not render the user as “verified” merely
because a local request succeeded.

## Required public inputs

The `priva_purchase_auth` proof must expose exactly these canonical inputs in a
published order:

| Input | Required binding |
| --- | --- |
| `identityNullifier` | `Poseidon(userId, privaPlatformDomainHash, issuerSecret)`; stable for one Telegram user on Priva, never random. |
| `actionNullifier` | `Poseidon(identityNullifier, launchIdHash, operation, recipientHash, clientNonce)`; consumed once by the launchpad. |
| `launchIdHash` | Immutable launch configuration identifier. |
| `launchpadAddressHash` | Exact deployed launchpad and workchain. |
| `operation` | Fixed operation code, initially `BUY`. |
| `recipientHash` | Exact jetton recipient wallet address. |
| `expiryEpoch` | Short, verifier-pinned authorization expiry. |
| `issuerKeyHash` | Poseidon commitment to the gateway’s stable issuer secret. |
| `circuitVersion` | Pinned circuit/verifier version. |

The requested TON amount is **not** trusted as a proof policy input. The
launchpad calculates accepted value from its on-chain curve then checks the
cumulative amount associated with `identityNullifier`. The `clientNonce` only
creates a distinct one-time action authorization; it cannot evade that
cumulative identity cap.

## Verifier and launchpad requirements

The final launchpad must embed or synchronously invoke a verifier generated for
`priva_purchase_auth`; it must not rely on an asynchronous “verified” callback
from an arbitrary contract. Before any sale-state mutation, it must verify:

1. The Groth16 proof and exact public-input count/order.
2. The immutable verifier-key hash, issuer-key hash, circuit version, and
   platform domain.
3. The exact launch ID, launchpad address/workchain, `BUY` operation, recipient,
   and non-expired epoch.
4. That `actionNullifier` is absent from persistent state.
5. That `identityPurchased + acceptedValue <= perIdentityCap`.

Only then may it consume `actionNullifier`, increase the identity total by the
accepted value, and begin the jetton settlement. A bounced mint/settlement must
restore any optimistically consumed authorization or move it to an explicit
retry/refund state, as specified by the launchpad state machine.

## Gateway policy

The deployment manifest must pin the issuer endpoint identity, issuer-key hash,
max Telegram `initData` age, maximum future clock skew, request-size limit,
concurrency limit, and circuit version. The gateway must:

- validate Telegram HMAC before reading user-controlled claims as authenticated;
- reject absent/zero user IDs, stale or future-dated data, and malformed action
  fields;
- derive no nullifier from a browser-supplied random salt;
- log only privacy-minimized security events; never log raw `initData`, bot
  tokens, issuer secrets, proofs, or Telegram IDs in ordinary request logs;
- rate-limit proof issuance by network and issuer-side identity; and
- rotate issuer secrets only through an announced identity-migration process.

## Required proof and integration tests

Before deployment, CI must reject proofs with: a forged Telegram session, a
wrong issuer key, a stale/future epoch, a different launch, a different
recipient, a different operation, a changed circuit version, a reused action
nullifier, or an identity total beyond the cap. Tests must also show that two
actions from the same identity retain the same `identityNullifier` while using
different consumed `actionNullifier` values.

The existing generic `zk-tele-auth` tests do not satisfy these Priva-specific
tests. A green generic proof test is not evidence that Priva’s allocation cap
is enforceable.
