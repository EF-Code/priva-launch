# Real reviewed testnet release package

This directory must contain only values obtained from a real testnet
deployment. Do not copy values from `tests/fixtures/` and do not use
`example.invalid`, fabricated addresses, or simulated transaction IDs.

## Required files

The release authority creates these files after deployment:

* `reviewed-init.json` — exact launchpad StateInit inputs, immutable policy,
  and the inlined verifier source/code binding;
* `reviewed-manifest.json` — deployed addresses, endpoints, code hashes, and
  testnet-only runtime configuration;
* `reviewed-release-payload.json` — canonical compact JSON binding both
  manifest digests to one source revision;
* `reviewed-release.json` — release envelope consumed by
  `npm run check:testnet-signatures`;
* `reviews/<reviewer>.md`, detached signatures, and public keys — optional
  evidence when the release authority chooses independent review.

The private signing keys never belong in this repository.

## Solo testnet approval

This project is maintained by one owner, so two independent reports and
cryptographic signatures are not a prerequisite for a testnet-only release.
Set `approvalMode` to `solo-owner-attested` in `reviewed-release.json` and
include an `ownerAttestation` that names the release owner, identifies the
exact source revision, repeats the payload and both manifest SHA-256 digests,
records an ISO-8601 timestamp, and uses the decision
`approved-for-testnet-only`. The initialization manifest must use the matching
`review.mode: "solo-owner-attested"` declaration.

This is an explicit self-attestation, not independent assurance. It does not
authorize mainnet, and it must not contain placeholder values. Changing an
address, hash, policy, endpoint, or source revision requires a new payload and
owner attestation. A later independent review may instead set `approvalMode` to
`independent-gpg` and use the optional GPG package without changing the
deployment data.

## Verification

Run all ordinary gates first:

```bash
npm run check:testnet-init -- deployment/testnet/reviewed-init.json
npm run compile:testnet-init -- deployment/testnet/reviewed-init.json
npm run check:testnet-manifest -- deployment/testnet/reviewed-manifest.json
```

Then verify the signed evidence:

```bash
npm run create:testnet-payload -- \
  deployment/testnet/reviewed-init.json \
  deployment/testnet/reviewed-manifest.json \
  deployment/testnet/reviewed-release-payload.json
npm run check:testnet-signatures -- deployment/testnet/reviewed-release.json
```

The release checker fails closed if a file is missing, a digest differs, the
owner attestation is not tied to the exact payload and manifests, a URL is a
placeholder, or either manifest is not tied to the same reviewed source
revision. In the optional independent-review mode it also verifies OpenPGP
detached signatures with an isolated temporary keyring. The checker does not
decide whether an owner statement is true, whether a reviewer is independent,
or whether a chain trace is authentic; those remain release-authority
decisions backed by the published evidence.

The existing `check:release` command is a separate mainnet gate and should
remain blocked for this testnet package.
