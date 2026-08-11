# Wallet and Chain Integration Gate

**Status:** Fail-closed testnet adapter implemented; the shipped build remains
demo-only until every item below is complete. `src/ton-connect.js` creates the
TonConnect UI lazily from a reviewed manifest, `src/ton-transaction.js` builds
the canonical buy cell, and `src/ton-wallet.js` permits only one destination
and the testnet network ID. No manifest is currently injected, so no wallet
connection or transfer is enabled.

## Required reviewed deployment manifest

The production build receives an immutable manifest containing:

- manifest version and target network/workchain;
- verified factory, launchpad, verifier, and adapter addresses;
- factory, launchpad, verifier, jetton-master, wallet, and adapter code hashes;
- the trusted TonConnect manifest URL and application origin; and
- the ZK circuit/version and issuer-key commitment matching the deployed
  verifier.

The frontend must verify the manifest's signature or fetch it from a pinned,
versioned release. It must never rely on a user-provided contract address,
browser storage, query parameter, or an unauthenticated RPC response for these
values.

## Transaction lifecycle

```text
build checked cell -> wallet approval -> broadcast -> masterchain confirmation
                    -> launchpad event/indexer match -> UI finalization
```

A UI action may call itself *submitted* only after TonConnect accepts it, and
*confirmed* only after an independently indexed on-chain transaction matches
the exact query ID, sender, destination, value, and decoded operation. It must
not create a random transaction hash, mutate balances optimistically, or treat
an RPC request as a transfer.

## Enablement checks

1. The contract code/data hashes match the reviewed deployment manifest.
2. The wallet network and workchain match the manifest.
3. The buy cell contains the canonical opcode, query ID, proof, recipient, and
   value limits from the current quote.
4. TonConnect requests explicit user approval and contains no hidden transfer.
5. A rejected, expired, bounced, or missing transaction leaves the UI and local
   state unchanged.

`src/deployment-config.js` intentionally defaults to an incomplete `demo`
configuration. A deployment host may inject a reviewed manifest through the
build-time `__PRIVA_TESTNET_MANIFEST__` value; missing, malformed, or
unreviewed values fall back to read-only mode.
