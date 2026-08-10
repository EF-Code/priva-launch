# Release Readiness Gate

Run:

```bash
npm run check:release
```

The command is intentionally expected to fail today. It passes only when the
repository includes a reviewed deployment manifest and evidence for the
Priva-specific ZK circuit, full testnet lifecycle, independent contract audit,
and operations readiness.

It is a minimum release gate, not an audit replacement. A passing result does
not authorize mainnet on its own: the referenced artifacts must be independently
reviewed and their code/data hashes must match the actual deployment.
