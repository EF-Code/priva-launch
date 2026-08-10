# Governance and Emergency Control Policy

**Version 1 policy:** deployed launchpads are immutable. Governance cannot
change economics, verifier keys, code, migration destinations, jetton supply,
or user balances.

## Authorities

| Authority | Required form | Allowed actions | Explicitly prohibited |
| --- | --- | --- | --- |
| Governance | Published threshold multisig | Factory-template releases; future-version timelock proposals | Per-launch upgrades, withdrawals, minting, parameter edits |
| Pause authority | Separate published multisig or threshold role | Reject new creates/buys; publish incident state | Transfers, changing recipient/price/verifier, blocking owed excess refunds |
| DeDust adapter | Immutable contract address | Pinned migration message only | Any caller-supplied destination or asset change |

No privileged role may be a single EOA. Each deployment manifest records the
multisig address, signers/threshold disclosure policy, pause authority, and any
future-version delay. A future factory template requires a minimum 48-hour
timelock between proposal publication and activation.

## Emergency semantics

`Paused` blocks only new risk-increasing actions. It preserves getters,
accounting inspection, excess/refund recovery, and the ability to observe a
pending migration. It does not create an escape hatch for operators to move
sale reserves.

An incident requires a public record of the triggering condition, affected
launches, exact on-chain pause transaction, user impact, mitigation, and
unpause criteria. Unpausing requires the same threshold process and must be
visible before it takes effect.

## Implementation tests

Tests must prove that unauthorized callers and pause authority cannot mint,
withdraw, change code/data/configuration, change a verifier/adapter address, or
alter curve/cap values. Tests must also prove that a pause prevents new buys
without preventing a previously owed excess refund.
