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

1. a compiled and lifecycle-tested launchpad and inlined verifier
   implementation; the factory and adapter are required only for a later
   migration-enabled profile;
2. the exact testnet launchpad and jetton-minter deployment addresses and code
   hashes, plus a verifier descriptor. The current launchpad uses an **inlined**
   verifier, so it must pin the verifier source digest and require its
   `launchpadCodeHash` to equal the deployed launchpad code hash. A
   `verifier.address` is permitted only for a separately deployed authorizer
   contract that the launchpad actually calls; the standalone proof-checking
   boundary is not such an authorizer;
3. a TLS gateway and indexer controlled by the testnet operator;
4. a public TonConnect manifest URL bound to the testnet UI origin;
5. the HTTPS token metadata URL and its digest;
6. the circuit verification-key hash used by the deployed verifier;
7. either an explicitly disabled migration policy for a fixed-price testnet
   sale, or the DeDust native vault, jetton vault, and pool addresses plus
   their code hashes, pinned to the reviewed DeDust SDK/source revision.

The runtime manifest must set `status` to `reviewed`, pin the exact 40-character
source revision, and use canonical friendly TON addresses (`EQ`, `UQ`, `kQ`, or
`0Q`) for every deployed launchpad, minter, and (when enabled) DeDust account.
For the fixed-price testnet profile, set `dex` to exactly
`{"kind":"none","migration":"disabled","reason":"fixed-price-testnet-sale"}`.
That profile does not claim post-graduation trading and must not include a
DeDust address or hash. The UI rejects an otherwise-shaped object before it
can open TonConnect. For the current inlined verifier there is intentionally
no verifier address to record.

`observed-deployments.json` records the two actual testnet deployments and
read-only post-deploy code/data-hash checks, the inlined verifier source
digest, and the live TonConnect origin. Its `observed-testnet` status is
deliberate: it is chain evidence, not a substitute for the runtime manifest.
There is no separate verifier endpoint for the current inlined design. The
public gateway/indexer remain unfilled until those services exist. A
fixed-price testnet manifest may explicitly disable DEX migration; that does
not make the fail-closed DeDust adapter deployable.

Re-check the live public chain state at any time with:

```bash
npm run check:testnet-deployments
```

The command validates active accounts, code/data hashes, deployment
and the minter's final `admin`, `next_admin`, and lock fields. Add
`--with-transactions` when the public API rate limit permits bounded history
lookups; that mode also checks the recorded account transaction hashes. Set
`PRIVA_TESTNET_CHAIN_API` only to a trusted TON Center-compatible read-only API
root if the default public endpoint is unavailable.

Validate a supplied manifest with `npm run check:testnet-manifest --
deployment/testnet/reviewed-manifest.json`. The command checks shape and public
integrity only; it does not certify an address, operator, or audit.

After the gateway, indexer, metadata, and TonConnect assets are hosted, run
the read-only public dependency check:

```bash
npm run check:testnet-endpoints -- deployment/testnet/reviewed-manifest.json
```

It requires public HTTPS, rejects loopback/private hosts, checks the manifest
and PNG/ICO icon, validates token metadata, and requires both service health
endpoints to return JSON `200` responses.

The main application remains read-only unless the reviewed manifest is supplied
to the build. Once the real manifest exists, run:

```bash
npm run build:testnet
```

That command validates `deployment/testnet/reviewed-manifest.json` before
injecting it into the bundle. A normal `npm run build` deliberately injects no
manifest. The Pages workflow follows the same rule: it enables the reviewed
manifest only when that exact file exists and passes validation.

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

To derive the minter data cell from the actual connected admin wallet and the
public metadata URL, run the read-only helper after compiling the pinned
minter:

```bash
npm run compile:settlement-minter
npm run create:testnet-minter-init -- \
  <CONNECTED_TESTNET_ADMIN_ADDRESS> \
  https://ef-code.github.io/priva-launch/testnet/v1/metadata.json
```

The JSON contains the StateInit-derived testnet address, code/data hashes, and
both hex/base64 data BoC encodings. Store that output outside the repository
with mode `0600`; it is an input to the deployment preflight, not a reviewed
runtime manifest. The helper performs no network request and sends no funds.

Run the minter preflight with the same reviewed data cell and expected values:

```bash
npm run compile:settlement-minter
acton script scripts/deploy_testnet_settlement_minter.tolk \
  <MINTER_DATA_CELL_BOC_HEX> <EXPECTED_MINTER_ADDRESS> \
  0x<EXPECTED_MINTER_CODE_HASH> 0x<EXPECTED_MINTER_DATA_CELL_HASH> \
  <DEPLOY_VALUE_NANOTONS> <EXPECTED_INITIAL_ADMIN_ADDRESS>
```

Only the release authority may repeat it with `PRIVA_DEPLOY_NETWORK=testnet
--net testnet --tonconnect` after the owner-attested release gate passes. The
script checks that the selected TonConnect wallet is the exact initial minter
admin before it sends anything. The deployer must record the resulting
address, transaction hash, and post-deploy code/data hashes in the real
reviewed manifests.

After both contracts are deployed, complete the minter's two-stage admin
handoff with `scripts/handoff_testnet_settlement_minter.tolk`. It first sends
`change_admin` from the reviewed initial-admin wallet, verifies
`get_next_admin_address`, then asks the exact launchpad to emit `claim_admin`
and verifies that the nomination is cleared. The script refuses mnemonic
wallets for broadcasts and requires the same testnet TonConnect path:

```bash
PRIVA_DEPLOY_NETWORK=testnet \
  npm run handoff:testnet-minter -- \
  --net testnet --tonconnect --explorer tonscan \
  <MINTER_ADDRESS> <LAUNCHPAD_ADDRESS> <INITIAL_ADMIN_ADDRESS> \
  <CHANGE_QUERY_ID> <CLAIM_QUERY_ID> \
  <CHANGE_VALUE_NANOTONS> <CLAIM_VALUE_NANOTONS>
```

Use two distinct non-zero query IDs and exact reviewed values. Run it without
`--net` first, inspect the printed addresses and values, and approve each
TonConnect request only when the wallet shows the expected testnet
destination. Do not hand-encode these opcodes in a wallet application.
