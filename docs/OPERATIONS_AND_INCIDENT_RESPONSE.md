# Operations and Incident Response

**Status:** Required before any live gateway, indexer, or contract deployment.

## Service hardening

- Store Telegram bot tokens, issuer secrets, RPC keys, and deployment-signing
  material only in a managed secret store; never in the browser, repository,
  build output, logs, or support tickets.
- Separate gateway, indexer, monitoring, and deployment identities. Each gets
  the minimum network and secret access required.
- Enforce TLS, request-size limits, rate limits, bounded proving concurrency,
  dependency pinning, patch management, and structured privacy-minimized logs.
- Monitor proof rejection rates, gateway latency/queue depth, rate-limit hits,
  unexpected issuer/circuit inputs, contract balances, state transitions,
  bounces, failed migrations, and indexer lag.

## Alert classification

| Severity | Example | Immediate response |
| --- | --- | --- |
| Critical | Issuer secret exposure, unauthorized mint, accounting mismatch | Pause affected launches, preserve evidence, disable affected gateway path |
| High | Proof-policy mismatch, repeated adapter bounces, indexer reorg gap | Freeze new buys where justified, verify raw-chain state, publish status |
| Medium | Elevated gateway failures or rate-limit abuse | Scale/mitigate, retain privacy-minimized diagnostics |
| Low | UI/indexer presentation defect | Correct display without asserting chain-state changes |

## Incident workflow

1. Record time, affected versions/addresses, observed chain state, and service
   evidence without collecting unrelated identity data.
2. Use the published pause control only when it reduces user risk; do not move
   user reserves as part of triage.
3. Preserve transaction hashes, block data, deployment manifest, binary/code
   hashes, and bounded service logs.
4. Publish user impact, mitigation, known limitations, and recovery criteria.
5. Add a regression test and audit trail before the incident class is closed.

## Backups and recovery

Back up deployment manifests, public artifacts, indexer checkpoints, and
multisig recovery procedures. Never back up issuer or bot secrets into the same
location as public deployment metadata. An issuer-secret rotation is an identity
migration and requires advance notice, a verifier transition plan, and user
impact analysis.
