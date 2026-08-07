# Contract Architecture

**Status:** Safety scaffold only. The active Tolk contracts reject all inbound
messages and must not be deployed to receive user funds.

This document maps the protocol specification to the future contract boundary.
It exists so a complete implementation can be built and reviewed in isolated,
testable components rather than extending the previous monolithic sketch.

## Components

```text
Governance multisig
       │ pause only
       ▼
Protocol Factory ── creates ──► Per-launch Launchpad
                                     │              │
                                     │              ├──► audited TEP-74 master
                                     │              │          └──► derived TEP-74 wallets
                                     │              │
                                     │              ├──► pinned ZK verifier
                                     │              └──► pinned DeDust adapter
                                     ▼
                              excess-refund recipient
```

### Factory

The factory is the only deployment authority for launchpads. Its eventual
`create_launch` message must verify the immutable configuration commitment,
the launch identifier uniqueness, allowed code hashes, a zero-fee v1 policy,
and deterministic StateInit inputs. It must not custody sale proceeds or
provide a post-deployment configuration-edit path.

### Per-launch launchpad

The launchpad owns the sale state and is the only component allowed to request
sale allocation from the selected jetton master. It will contain the state
machine and accounting described in the protocol specification:

```text
Draft -> Active -> GraduationLocked -> MigrationPending -> Migrated
                 \-> Paused
MigrationPending -> MigrationFailed -> MigrationPending
```

Its future inbound operations are limited to `buy`, a narrow `pause` control,
and authenticated migration callbacks/retries. All other opcodes, malformed
cells, unexpected senders, expired proofs, duplicate action nullifiers, and
post-graduation buys must fail before state mutation.

### Jetton master and derived wallets

Priva will not ship a bespoke jetton master or wallet. The eventual build must
pin a reviewed TEP-74 implementation by code hash and document its exact
mint, transfer, burn, notification, excess, bounce, and address-derivation
semantics. The master must authorize minting solely from its configured
launchpad and enforce the fixed supply.

### ZK verifier

The verifier accepts a proof only when public inputs bind the specific
launchpad, workchain, circuit version, identity nullifier, action nullifier,
expiry, and intended recipient/action commitment. It is the only identity
authority; a frontend or relayer cannot replace it.

### DeDust adapter

The adapter is a dedicated integration boundary with a pinned address and code
hash. It accepts migration only from its configured launchpad and only with
the immutable assets, pool parameters, and LP-recipient policy. Callback and
bounce handling is part of the launchpad state machine, not a frontend task.

## Implementation order

1. Adopt and test the selected TEP-74 reference implementation unchanged.
2. Implement the verifier interface and prove its on-chain cost and public
   input binding.
3. Implement launchpad storage, integer curve settlement, nullifier
   dictionaries, and excess refunds with emulator/property tests.
4. Add the factory after the launchpad StateInit and code-hash checks are
   stable.
5. Add the DeDust adapter last, with testnet traces and bounce tests.

Every component requires an isolated test suite and a cross-contract test
suite before it is allowed to receive mainnet value.
