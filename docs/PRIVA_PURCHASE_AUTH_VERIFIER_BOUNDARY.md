# Priva Purchase-Authorization Verifier Boundary

**Status:** Compileable testnet-only proof-checking candidate. It verifies a
complete Groth16 envelope synchronously, but it is **not** a purchase
authorizer and must not receive user funds.

## Artifact pinned for review

The sibling `zk-tele-auth` repository generates the following development
artifact set for `priva_purchase_auth`:

| Item | Value |
| --- | --- |
| Circuit version | `1` |
| Public inputs | `17` |
| Circuit verification-key commitment | `7454d4f4663b455dd2753dec56acabce5bb662a89a50dc22d22d6c07ad5121e4` |
| Verification-key file SHA-256 | `bde50de738c19ff675d19d09e611aae50247e1658df798b520313acc076466ae` |
| Generated verifier source | `../zk-tele-auth/contracts/priva_purchase_auth_verifier.tolk` |

The verification key and proving key are development artifacts, not a completed
ceremony or an audited mainnet dependency. A release manifest must pin the
reviewed replacement artifact hashes.

## Exact public-input ABI

The generated verifier exposes outputs first, followed by the circuit's
declared public inputs. The future inlined verifier must reject any count,
order, scalar encoding, or value that differs from this table.

| Index | Signal | Launchpad requirement |
| ---: | --- | --- |
| 0 | `identityNullifier` | persistent cumulative-cap key |
| 1 | `actionNullifier` | persistent one-time replay key |
| 2 | `isAuthorized` | must equal `1` |
| 3 | `appDomainHash` | equals immutable Priva domain commitment |
| 4 | `currentTimestamp` | checked against the launchpad clock policy |
| 5 | `maxTokenAgeSec` | equals immutable credential-age policy |
| 6 | `isPremiumRequired` | equals immutable launch policy |
| 7 | `issuerKeyHash` | equals immutable gateway issuer commitment |
| 8 | `launchIdHash` | equals this launch's immutable identifier |
| 9 | `launchpadAddressHi` | high 128 bits of this basechain contract account ID |
| 10 | `launchpadAddressLo` | low 128 bits of this basechain contract account ID |
| 11 | `operation` | equals `BUY` (`1`) |
| 12 | `recipientAddressHi` | high 128 bits of the exact basechain jetton recipient account ID |
| 13 | `recipientAddressLo` | low 128 bits of the exact basechain jetton recipient account ID |
| 14 | `clientNonce` | bound into the action nullifier only |
| 15 | `expiryEpoch` | not expired under the immutable clock policy |
| 16 | `circuitVersion` | equals `1` |

The supplied TON amount, quote, and token output are intentionally absent:
they remain contract-calculated values and must not be trusted from a proof or
gateway response.

## Why this is a boundary rather than a call

The generated verifier includes its own `onInternalMessage`. The boundary
candidate now uses that same pure `verifyProof` function synchronously, checks
the minimum verification value and rejects malformed envelopes. It has no
state writes, sender allow-list, nullifier store, recipient binding, launch
policy, or purchase transition. A valid proof therefore only proves the
cryptographic statement encoded by its 17 public inputs; it does not authorize
a purchase.

`contracts/priva_purchase_auth_verifier_boundary.tolk` is useful for testnet
smoke tests and gas measurement only. The production launchpad must continue
to import the generated core directly, bind every public input to immutable
policy and the current recipient/launchpad, consume replay state atomically,
and settle mint success or failure in the same lifecycle transaction path. No
asynchronous verifier callback is permitted.

## Enablement evidence

Before any production deployment, require all of the following:

1. A reviewed inlined verifier generated from the pinned verification key;
   the standalone candidate must not become the purchase authorization path.
2. Emulator traces for a valid candidate proof and each wrong public-input index, malformed
   proof cell, out-of-field scalar, and invalid pairing.
3. Tests proving a buy cannot mutate sale state, action-nullifier state, or
   identity allocation before every binding and proof check succeeds.
4. A measured gas/storage budget on the intended TON network and an independent
   cryptographic and contract audit.
