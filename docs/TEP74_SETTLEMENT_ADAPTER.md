# TEP-74 settlement adapter boundary

**Reference:** `vendor/ton-token-contract` at
`d55f228edb0eb477cb4845d67e0dacc6489c6b57` from
`https://github.com/ton-blockchain/jetton-contract`.

Priva's testnet candidate uses a checked-in settlement fork at
`contracts/priva_settlement_minter.fc`. The fork is based on the reference
minter at the revision above and preserves its `mint` operation
(`0x642b7d07`). The launchpad must become the minter admin through the
two-stage `change_admin` (`0x6501f354`) and `claim_admin` (`0xfb88e119`)
flow; after claim the admin is locked and the generic `upgrade` operation is
disabled. No creator or operator may mint. The fork emits the authenticated
`PRIVA_MINT_FAILURE` callback (`0x50525646`) when a downstream wallet bounce
rolls supply back.

The minter body is:

```text
mint#642b7d07 query_id:uint64 recipient:MsgAddress amount:Coins
              master_msg:^Cell
```

`master_msg` is the nested `internal_transfer` (`0x178d4519`) that determines
the actual minted jetton amount. The reference minter increments supply by
that nested amount, so the launchpad must construct both amounts from the same
checked `saleUnits * 1_000_000_000` value and reject any mismatch before
sending.

## Pending mint record

Before the outbound mint, the launchpad must persist a record keyed by
`queryId` containing sender, recipient, expected recipient jetton-wallet
address, identity/action nullifiers, raw jetton amount, accepted nanoTON,
refundable excess, gas reserve, and `PendingMint` state. The action nullifier
is consumed at this point to prevent a second concurrent mint.

On an authenticated delivery acknowledgement from the expected recipient
jetton wallet, it may finalize `soldSaleUnits`, accepted TON, and the identity
total, then refund excess. The reference wallet reports successful completion
with `excesses` (`0xd53276db`) to its response address, so the launchpad must
authenticate both sender and query ID. A bounced mint must not advance those
totals. It moves the reserved refundable value to a user-claimable refund
record; a refund bounce cannot redirect value to governance.

The reference minter rolls back supply when its outbound internal transfer
bounces, but it does not provide a terminal callback. The settlement fork
handles both ordinary truncated bounces (`0xffffffff`) and rich bounces
(`0xfffffffe`), uses the locked admin as the callback destination, and sends
the returned TON value with fees paid separately. No handler may use an
accepted outbound send as proof that recipient jettons were minted, and no
arbitrary timeout may refund a purchase while a late success remains possible.

## Required Acton traces

1. exact mint, authenticated delivery acknowledgement, and finalization;
2. sold-out partial fill and solvent excess refund;
3. duplicate action-nullifier rejection before a second mint;
4. direct minter bounce with unchanged sold/identity totals;
5. recipient-wallet downstream failure with a deterministic terminal outcome;
6. refund bounce followed by recipient-only claim;
7. forged `excesses` or bounce from an unexpected sender.

This adapter contract is testnet-candidate design, not a permission to enable
the buy handler before these traces execute.
