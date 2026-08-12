# Wallet and Chain Integration Gate

**Status:** Testnet integration boundary implemented. `src/ton-connect.js`
creates the TonConnect UI lazily from a reviewed manifest,
`src/ton-transaction.js` builds the canonical buy cell, and
`src/ton-wallet.js` permits only one destination and the testnet network ID.
No runtime manifest is currently injected, so wallet connection and transfers
remain disabled.

## Required reviewed deployment manifest

The production build receives an immutable manifest containing:

- manifest version and target network/workchain;
- verified factory, launchpad, jetton-minter, and adapter addresses, plus a
  verifier descriptor. The current launchpad embeds the verifier core and
  therefore has no separate verifier address;
- factory, launchpad, jetton-master, wallet, adapter, and inlined-verifier
  source/code hashes;
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

`src/deployment-config.js` intentionally defaults to an unconfigured state. A
deployment host may inject a reviewed manifest through the
build-time `__PRIVA_TESTNET_MANIFEST__` value; missing, malformed, or
unreviewed values fall back to read-only mode.

## Explicit purchase boundary

When a reviewed testnet indexer is present, each launch record must include the
manifest launchpad address, canonical decimal sale terms, and the fixed refund
reserve. The UI opens a purchase dialog but does not submit from that dialog's
first action. `src/purchase-flow.js` requests a fresh gateway proof using the
Telegram-signed `initData`, binds the connected wallet address and launch ID,
constructs one canonical message, and waits for a second explicit wallet
approval. A successful TonConnect response is only “submitted”; final status
must come from the independently indexed transaction.
