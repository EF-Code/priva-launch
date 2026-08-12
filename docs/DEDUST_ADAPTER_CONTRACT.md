# DeDust Migration Adapter Contract

**Status:** Migration boundary disabled in the current release; it cannot
receive a live migration.

The adapter is a separate contract so a launchpad never accepts a DEX address,
pool parameter, LP recipient, or destination from a browser, creator, or
governance message. The factory configuration will pin all of the following:

- adapter code hash and address;
- DeDust factory and pool code hashes, workchain, and asset ordering;
- exact TON and jetton migration amounts;
- pool-init and minimum-reserve parameters; and
- LP recipient and public lock/escrow policy.

The real adapter may accept a migration request only from its configured
launchpad and only once. It must parse the entire message, validate the sender,
reserve sufficient gas, and emit requests only to pinned addresses.

## Required asynchronous states

```text
NotStarted -> Submitted -> Confirmed
                     \-> Bounced -> Retriable
```

`Confirmed` is terminal. A retry retains the same immutable assets and
destination; it cannot alter the LP recipient or transfer reserves elsewhere.
The launchpad must record a pending migration before sending and must reconcile
the adapter callback or bounce before it marks itself `Migrated`.

## Exit criteria

Before this boundary is enabled, add testnet traces for successful
pool creation/deposit, an existing-pool path, every callback, and every bounced
outbound message. Independently verify the DeDust message schema and code hashes
against the target deployment.
