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

The live document was verified byte-for-byte against commit `2c0e770` on
2026-08-10. Its SHA-256 digest is
`e0c4409d35ba05df5d9b6845a6ad02cc7bf851ca659fa2367834d5739ed9c381`.

`reviewed-manifest.json` is deliberately absent. Add it only after all values
are collected from a real testnet deployment and checked by the project owner.
It is safe to commit because TON addresses, code hashes, URLs, and public
circuit commitments are not credentials.

Before creating that manifest, the team must provide:

1. a compiled and lifecycle-tested launchpad, factory, adapter, and inlined
   verifier implementation;
2. exact testnet deployment addresses and SHA-256 code hashes;
3. a TLS gateway and indexer controlled by the testnet operator;
4. a public TonConnect manifest URL bound to the testnet UI origin; and
5. the circuit verification-key hash used by the deployed verifier.
6. the DeDust native vault, jetton vault, and pool addresses plus their code
   hashes, pinned to the reviewed DeDust SDK/source revision.

The runtime manifest must set `status` to `reviewed`, pin the exact 40-character
source revision, and use canonical friendly TON addresses (`EQ`, `UQ`, `kQ`, or
`0Q`) for every launchpad, verifier, and DeDust account. The UI rejects an
otherwise-shaped object before it can open TonConnect.

Validate a supplied manifest with `npm run check:testnet-manifest --
deployment/testnet/reviewed-manifest.json`. The command checks shape and public
integrity only; it does not certify an address, operator, or audit.

Before any StateInit is built, validate its separate reviewed initialization
record with `npm run check:testnet-init -- deployment/testnet/reviewed-init.json`.
It pins the address-binding proof ABI, immutable verifier policy, settlement
minter and wallet-library code hashes, the pinned upstream minter revision and
`PRIVA_MINT_FAILURE` opcode, jetton sale terms, launchpad code hash, and the
owner's exact-commit testnet-only attestation. A solo owner attestation is
allowed for this testnet package; it is not an independent audit and must not
be replaced with placeholder URLs.

`npm run compile:testnet-init -- deployment/testnet/reviewed-init.json` emits
the exact initial-data cell hash and BOC. The manifest must contain that hash;
the compiler rejects a mismatch and also compares its launchpad code hash to
the current Acton build artifact. Pair those two hashes before calculating or
funding any contract address.

After both real manifests exist, generate the canonical release payload and
run `npm run check:testnet-signatures --
deployment/testnet/reviewed-release.json`. For this solo project, that gate
verifies the two manifest digests, the owner attestation's exact source and
payload binding, and placeholder rejection without requiring reports or
cryptographic signatures. An optional independent-review envelope continues to
verify distinct reviewer identities, detached OpenPGP signatures, and public
key fingerprints. Neither mode proves the authenticity of a chain trace;
that still requires release-authority inspection of published evidence.

## Controlled testnet deployment

The repository now includes `scripts/deploy_testnet_launchpad.tolk` and
`scripts/deploy_testnet_settlement_minter.tolk`. The launchpad script takes the
exact reviewed launchpad data cell and its pinned code/data hashes, derives the
StateInit address, refuses an address or artifact mismatch, refuses an already
deployed account, and prints the observed transaction hash. The minter script
uses the exact `build/priva_settlement_minter.boc` emitted by
`npm run compile:settlement-minter`, applies the same address/hash/network/
TonConnect checks, and never invents minter metadata or admin state. Both run
in the emulator by default and refuse configured mnemonic wallets for
broadcasts.

Run the deterministic preflight first:

```bash
acton script scripts/deploy_testnet_launchpad.tolk \
  <DATA_CELL_BOC_HEX> <EXPECTED_BASECHAIN_ADDRESS> \
  0x<EXPECTED_LAUNCHPAD_CODE_HASH> 0x<EXPECTED_DATA_CELL_HASH> <DEPLOY_VALUE_NANOTONS>
```

Only after `reviewed-init.json`, `reviewed-manifest.json`, and the owner-attested
release gate pass may the release authority run the same command with:

```bash
PRIVA_DEPLOY_NETWORK=testnet \
  acton script scripts/deploy_testnet_launchpad.tolk \
  --net testnet --tonconnect --explorer tonscan
```

The connected wallet will show and approve the transaction; the resulting
address and transaction hash must then be recorded in the real manifest/evidence
package. No live address, transaction hash, or reviewer signature is created by
the emulator run.

Run the minter preflight with the same reviewed data cell and expected values:

```bash
npm run compile:settlement-minter
acton script scripts/deploy_testnet_settlement_minter.tolk \
  <MINTER_DATA_CELL_BOC_HEX> <EXPECTED_MINTER_ADDRESS> \
  0x<EXPECTED_MINTER_CODE_HASH> 0x<EXPECTED_MINTER_DATA_CELL_HASH> \
  <DEPLOY_VALUE_NANOTONS>
```

Only the release authority may repeat it with `PRIVA_DEPLOY_NETWORK=testnet
--net testnet --tonconnect` after the signed release gate passes. The deployer
must record the resulting address, transaction hash, and post-deploy code/data
hashes in the real reviewed manifests.
