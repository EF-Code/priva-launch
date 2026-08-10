# Release Readiness Gate

Run:

```bash
npm run check:release
```

The command is intentionally expected to fail today. It passes only when the
repository includes a reviewed deployment manifest and evidence for the
Priva-specific ZK circuit, full testnet lifecycle, independent contract audit,
and operations readiness.

## Evidence integrity requirements

Do not add placeholder evidence merely to satisfy the command. The gate
requires two review-controlled records which must be produced only for a
specific, frozen release candidate:

- `deployment/reviewed-manifest.json` must pin `network: "mainnet"`, the exact
  `sourceRevision` at `HEAD`, contract `codeHashes`, the gateway issuer-key
  hash, and version-1 `priva_purchase_auth` verification-key and artifact
  SHA-256 hashes.
- `evidence/release-evidence.json` must pin that same source revision and list
  four required artifacts. Each entry has a fixed path, SHA-256 digest,
  reviewer, and ISO-8601 review time. The gate hashes the local artifact again,
  so editing an approved report requires a renewed review record.

The required evidence paths are:

1. `evidence/zk-priva-purchase-auth-audit.md`
2. `evidence/testnet-lifecycle-traces.md`
3. `evidence/independent-contract-audit.md`
4. `evidence/operations-readiness.md`

The verifier checks file presence, revision pins, digest syntax, and local
digest equality. It does not establish that a named reviewer is independent,
that a testnet trace reflects chain state, or that a review is adequate. Those
are human release-authority decisions and must not be inferred from a passing
command.

It is a minimum release gate, not an audit replacement. A passing result does
not authorize mainnet on its own: the referenced artifacts must be independently
reviewed and their code/data hashes must match the actual deployment.
