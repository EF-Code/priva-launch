# Priva testnet deployment package

This directory is the only repository location for public, reviewed testnet
deployment metadata. It must contain no seed phrase, private key, API token,
Telegram bot token, or gateway issuer secret.

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

Validate a supplied manifest with `npm run check:testnet-manifest --
deployment/testnet/reviewed-manifest.json`. The command checks shape and public
integrity only; it does not certify an address, operator, or audit.

