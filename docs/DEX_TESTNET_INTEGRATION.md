# DEX testnet integration decision

**Selected target:** DeDust volatile pool, native TON + the launch jetton.
STON.fi v2 is not a fallback target for this launch template. A migration must
choose one immutable DEX path before deployment; attempting both exposes the
same reserves to incompatible asynchronous state machines.

## Source-pinned ABI research

The DeDust SDK source was reviewed at
[`dedust-io/sdk@3aa071f`](https://github.com/dedust-io/sdk/tree/3aa071fb7f906e492c2fcc8f771812a3da0dfe78).
The relevant native-vault body begins with `0xd55e4686` and serializes query
ID, amount, pool type, two assets, a reference containing minimum LP and target
balances, then optional fulfill/reject payloads. The jetton-vault forward
payload begins with `0x40e108d6` and is carried through the standard jetton
transfer notification path. A DeDust `LiquidityDeposit` records the two legs
and can be cancelled with `0x166cedee`.

This means Priva's future adapter needs a bounded pending record keyed by its
query ID, a pinned native-vault address, a pinned jetton-vault address, the
expected pool assets/type, and an authenticated success/failure/cancel path.
It must not infer success merely because either outbound message was accepted.

STON.fi v2 was reviewed at
[`ston-fi/dex-core-v2@af0a955`](https://github.com/ston-fi/dex-core-v2/tree/af0a955cc835af9697cd383e201fefcbe1a6a87e).
Its router uses `provide_lp` through transfer notification and has a separate
LP-account/refund flow. The official STON.fi documentation says its API serves
mainnet data only and that testnet liquidity is a manual, hardcoded-contract
setup. It therefore is not an interchangeable fallback for a DeDust launch.

## Testnet manifest additions

The reviewed testnet manifest must now include `dex` with `kind: "dedust-v2"`,
the exact source revision above (or a newly reviewed replacement), and public
addresses/code hashes for the native vault, jetton vault, and target pool. All
three need chain verification before the adapter is allowed to send funds.

This document is an ABI integration constraint, not an authorization to deploy
or transfer testnet value. The adapter remains fail-closed until its complete
message, bounce, and retry state machine is implemented and tested.
