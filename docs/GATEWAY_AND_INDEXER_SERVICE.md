# Gateway and Indexer Service Contract

**Status:** Interface specification only; no endpoint is configured in the demo.

## Gateway responsibility

The issuer gateway accepts Telegram Mini App `initData` and a canonical Priva
purchase-authorization request. It validates Telegram HMAC and the requested
action fields, then returns a `priva_purchase_auth` proof. It never receives a
private key, custody, a TON transfer request, a curve quote, or permission to
select a recipient.

### `POST /v1/purchase-authorizations`

Request body:

```json
{
  "initData": "Telegram-signed query string",
  "launchId": "32-byte launch configuration hash",
  "launchpadAddress": "canonical TON address",
  "recipientAddress": "canonical TON address",
  "operation": "BUY",
  "clientNonce": "32-byte random nonce",
  "circuitVersion": "priva_purchase_auth/v1"
}
```

The gateway rejects malformed/cross-workchain fields, stale or future Telegram
data, unsupported operations, replayed request nonces within its rate-limit
window, and a request that does not match its published issuer policy. The
response contains only the proof, canonical public inputs, proof expiry, and
circuit version. Clients still must wait for on-chain verification.

## Indexer responsibility

The indexer is a read-only availability layer. It ingests masterchain-confirmed
transactions and decodes events using the deployed code/data hashes and
manifest. It does not create balances, quotes, allocations, launches, or proof
validity records from frontend requests.

Every API record must include the block sequence number, transaction hash,
logical time, account address, decoded opcode/query ID, and decoder version.
The UI compares a submitted request against these fields before displaying
confirmation.

The testnet discovery endpoint consumed by `src/indexer-client.js` is:

```text
GET /v1/launches
{
  "launches": [
    {
      "id": "public-launch-id",
      "name": "Example",
      "symbol": "EX",
      "state": "active | closing",
      "raisedTon": 12.5,
      "participants": 10,
      "ends": "2h 14m"
    }
  ]
}
```

The client rejects malformed records and renders no fixtures when a reviewed
testnet indexer is unavailable. This endpoint is discovery-only; purchase
confirmation must use the transaction fields described above.

## Security boundaries

- Gateway compromise can issue fraudulent credentials; it cannot alter a
  launchpad's curve, cap, recipient, or funds without a proof/contract defect.
- Indexer compromise can delay or misrepresent UI data; it cannot settle a
  contract transaction. The UI must provide a raw-chain/provider fallback.
- Use TLS, strict request-body limits, rate limiting, privacy-minimized logs,
  secret-manager backed bot/issuer credentials, and separate service accounts.
- Do not persist raw Telegram `initData`, bot tokens, issuer secrets, or full
  proofs in ordinary analytics/logging systems.

## Operational data retained

Persist only the minimum needed for replay/rate-limit analysis: a salted request
fingerprint, time bucket, result class, and a non-reversible operational ID.
Public chain data belongs in the indexer; identity-derived data does not.
