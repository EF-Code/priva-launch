# Priva Purchase-Authorization Verifier Boundary

**Status:** Compileable fail-closed integration boundary. It does **not**
verify proofs and must not receive user funds.

## Artifact pinned for review

The sibling `zk-tele-auth` repository generates the following development
artifact set for `priva_purchase_auth`:

| Item | Value |
| --- | --- |
| Circuit version | `1` |
| Public inputs | `15` |
| Verifying-key SHA-256 | `3bb53a289f34bd2a3274fd8dccf0ec9d48da155b13c6c696f0f4f349f49bf1f3` |
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
| 9 | `launchpadAddressHash` | equals this contract and workchain commitment |
| 10 | `operation` | equals `BUY` (`1`) |
| 11 | `recipientHash` | equals the requested jetton recipient commitment |
| 12 | `clientNonce` | bound into the action nullifier only |
| 13 | `expiryEpoch` | not expired under the immutable clock policy |
| 14 | `circuitVersion` | equals `1` |

The supplied TON amount, quote, and token output are intentionally absent:
they remain contract-calculated values and must not be trusted from a proof or
gateway response.

## Why this is a boundary rather than a call

The generated verifier includes its own `onInternalMessage`. A separately
deployed verifier can only report success asynchronously, so a launchpad that
forwards a proof cannot safely learn verification success before handling the
buy. A callback would create an authorization race and a new sender-trust
surface. The final implementation must instead adapt the generated
`verifyProof` logic into an inlined, pure launchpad-local function, then prove
all bindings before it consumes an action nullifier or accepts value.

`contracts/priva_purchase_auth_verifier_boundary.tolk` exists to make the ABI
reviewable now. It rejects every inbound message with exit code `850`; it does
not parse, forward, or acknowledge a proof.

## Enablement evidence

Before this boundary is replaced, require all of the following:

1. A reviewed inlined verifier generated from the pinned verification key;
   no standalone handler or asynchronous callback path remains.
2. Emulator traces for valid proofs and each wrong public-input index, malformed
   proof cell, out-of-field scalar, and invalid pairing.
3. Tests proving a buy cannot mutate sale state, action-nullifier state, or
   identity allocation before every binding and proof check succeeds.
4. A measured gas/storage budget on the intended TON network and an independent
   cryptographic and contract audit.
