# Priva testnet deployment package

This directory is the only repository location for public, reviewed testnet
deployment metadata. It must contain no seed phrase, private key, API token,
Telegram bot token, or gateway issuer secret.

The public, testnet-only TEP-64 metadata endpoint is
`https://ef-code.github.io/priva-launch/testnet/v1/metadata.json`. Its source
is in `docs/testnet/v1/metadata.json` for GitHub Pages. Pin both this HTTPS URL
and the file's SHA-256 digest in a real reviewed minter deployment record; the
page itself is not deployment approval and must never be repurposed for
mainnet without an independent review.

`reviewed-manifest.json` is deliberately absent. Add it only after all values
are collected from a real testnet deployment and independently reviewed. It is
safe to commit because TON addresses, code hashes, URLs, and public circuit
commitments are not credentials.

Before creating that manifest, the team must provide:

1. a compiled and lifecycle-tested launchpad, factory, adapter, and inlined
   verifier implementation;
2. exact testnet deployment addresses and SHA-256 code hashes;
3. a TLS gateway and indexer controlled by the testnet operator;
4. a public TonConnect manifest URL bound to the testnet UI origin; and
5. the circuit verification-key hash used by the deployed verifier.
6. the DeDust native vault, jetton vault, and pool addresses plus their code
   hashes, pinned to the reviewed DeDust SDK/source revision.

Validate a supplied manifest with `npm run check:testnet-manifest --
deployment/testnet/reviewed-manifest.json`. The command checks shape and public
integrity only; it does not certify an address, operator, or audit.

Before any StateInit is built, validate its separate reviewed initialization
record with `npm run check:testnet-init -- deployment/testnet/reviewed-init.json`.
It pins the address-binding proof ABI, immutable verifier policy, jetton minter and sale
terms, launchpad code hash, and two public review evidence URLs. The fixture is
only a structural example; never deploy it or replace independent review with
placeholder URLs.

`npm run compile:testnet-init -- deployment/testnet/reviewed-init.json` emits
the exact initial-data cell hash and BOC. The manifest must contain that hash;
the compiler rejects a mismatch and also compares its launchpad code hash to
the current Acton build artifact. Pair those two hashes before calculating or
funding any contract address.
