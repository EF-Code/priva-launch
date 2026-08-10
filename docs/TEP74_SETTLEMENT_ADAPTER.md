# TEP-74 settlement adapter boundary

**Reference:** `vendor/ton-token-contract` at
`1182ad99413242f09925d50e70ccb7e0e09f94d4`.

Priva's testnet candidate uses the reference minter's `mint` operation
(`opcode 21`). The launchpad must be the immutable minter admin; no creator or
operator may mint. The minter body is:

```text
mint#00000015 query_id:uint64 recipient:MsgAddress amount:Coins
              master_msg:^Cell
```

`master_msg` is the nested wallet transfer that determines the actual minted
jetton amount. The reference minter increments supply by that nested amount,
so the launchpad must construct both amounts from the same checked
`saleUnits * 1_000_000_000` value and reject any mismatch before sending.

## Pending mint record

Before the outbound mint, the launchpad must persist a record keyed by
`queryId` containing sender, recipient, identity/action nullifiers, raw jetton
amount, accepted nanoTON, excess nanoTON, and `PendingMint` state. The action
nullifier is consumed at this point to prevent a second concurrent mint.

On a verified mint completion, it may finalize `soldSaleUnits`, accepted TON,
and the identity total, then refund excess. A bounced mint must not advance
those totals. It moves the full user value to a user-claimable refund record;
a refund bounce cannot redirect value to governance.

The reference minter ignores bounced inbound messages, so Priva must track its
own outbound mint message/bounce rather than rely on minter state alone.
No handler may use an accepted outbound send as proof that recipient jettons
were minted.

## Required Acton traces

1. exact mint and finalization;
2. sold-out partial fill and excess refund;
3. duplicate action-nullifier rejection before a second mint;
4. mint bounce with unchanged sold/identity totals;
5. refund bounce followed by recipient-only claim.

This adapter contract is testnet-candidate design, not a permission to enable
the buy handler before these traces execute.
