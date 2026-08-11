# Real reviewed testnet release package

This directory must contain only values obtained from a real testnet
deployment. Do not copy values from `tests/fixtures/` and do not use
`example.invalid`, fabricated addresses, or simulated transaction IDs.

## Required files

The release authority creates these files after deployment:

* `reviewed-init.json` — exact launchpad StateInit inputs and immutable policy;
* `reviewed-manifest.json` — deployed addresses, endpoints, code hashes, and
  testnet-only runtime configuration;
* `reviewed-release-payload.json` — canonical compact JSON binding both
  manifest digests to one source revision;
* `reviewed-release.json` — signed-release envelope consumed by
  `npm run check:testnet-signatures`;
* `reviews/<reviewer>.md` — independently authored review reports;
* `reviews/<reviewer>.md.asc` — detached signatures over those reports;
* `reviews/<reviewer>.payload.json.asc` — detached signatures over the
  canonical release payload; and
* `reviews/<reviewer>.pub.asc` — the corresponding public key.

The private signing keys never belong in this repository.

## Review requirements

Use at least two reviewers with different identities and different roles. One
must review TON contracts and asynchronous settlement; the other must review
the circuit, verification-key provenance, public-input binding, gateway, and
replay policy. Each report must identify the exact source revision and all
artifact hashes, list unresolved findings, state limitations, and say
`approved-for-testnet-only` only when no blocking finding remains.

The reviewer signs the final canonical payload, not a mutable branch or a
pre-deployment draft. Changing an address, hash, policy, endpoint, or evidence
file invalidates both approvals and requires a new review.

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

The signature checker fails closed if a file is missing, a digest differs, a
reviewer or role is duplicated, a URL is a placeholder, a report or payload
signature is invalid, the public-key fingerprint differs, or either manifest
is not tied to the same reviewed source revision. It verifies OpenPGP detached
signatures with an isolated temporary keyring; it does not decide whether a
reviewer is independent or whether a chain trace is authentic. Those remain
release-authority decisions backed by the published evidence.

The existing `check:release` command is a separate mainnet gate and should
remain blocked for this testnet package.
