# Free hosting path for testnet services

## Recommendation

Use GitHub Pages for the static UI, metadata, icon, and TonConnect manifest.
Use Render's free Node web services for the proof gateway and the read-through
indexer. The repository includes [`render.yaml`](../render.yaml) with two
explicit `render` service profiles.

Render supports Node web services and managed TLS, but its free services spin
down after 15 minutes without inbound traffic and have ephemeral filesystems.
That makes this suitable for controlled personal testnet testing, not a
production or unattended mainnet service. A cold start can delay proof
generation, and any state kept only in process memory is lost on restart.
The on-chain nullifier and lifecycle checks remain the security boundary.

InfinityFree is suitable only for static files or a separate PHP site. Its
free hosting does not provide the Node runtime needed by the gateway and is
not an appropriate place for issuer secrets.

Cloudflare Workers is not a drop-in host for this gateway: the free plan has a
10 ms CPU limit per request and a 3 MB Worker size limit, while Groth16 proof
generation and the pinned Node dependency tree require a conventional Node
runtime. Deno Deploy would require a separate runtime adaptation and does not
remove the need for an independently operated indexer.

## Render setup

1. Create a Render Blueprint from this repository and select `render.yaml`.
2. Let Render initialize the two services. The build commands initialize the
   pinned submodules, install the root dependencies, and install the prover's
   runtime/dev dependencies required by the gateway.
3. Set the two `sync: false` values in Render's encrypted environment:
   `TELEGRAM_BOT_TOKEN` and `PRIVA_ISSUER_SECRET`. The public launch ID and
   commitment are already pinned in the blueprint; do not replace them with
   ad-hoc values.
4. The indexer blueprint uses direct TON testnet mode by default. It reads
   `getPrivaTestnetAccounting` and `getPrivaTestnetQueryState` from the
   configured launchpad and counts indexed on-chain `PRVB` inbound messages
   through `PRIVA_CHAIN_API` (TON Center testnet by default). Keep the launch metadata
   and sale-term values in `render.yaml` synchronized with the reviewed init
   payload. An optional `PRIVA_CHAIN_API_KEY` may be added as a Render secret
   when the selected provider requires one.
5. If you operate a richer independent indexer, set
   `PRIVA_INDEXER_UPSTREAM` to its public HTTPS base URL. The proxy will still
   validate launch addresses and reconcile accounting against the launchpad;
   the upstream must expose `/healthz`, `/v1/launches`, and purchase lookup
   paths described in [the service contract](GATEWAY_AND_INDEXER_SERVICE.md).
6. Record the generated `https://*.onrender.com` service URLs. Do not put
   them in a runtime manifest until `GET /healthz` and the required API paths
   have been checked from the public internet.

## Operational limits

The Render free gateway is a testnet convenience, not a full production
release. Do not use it for mainnet funds, do not rely on its local filesystem,
and do not treat a passing health check as proof that Telegram policy or
on-chain settlement is correct. The service still requires a real bot token,
issuer secret, app-domain commitment, launch-ID commitment, and exact
launchpad address.

The current repository remains fail-closed until the public service URLs are
placed in a real reviewed testnet manifest. The blueprint reduces the hosting
work; it does not create deployment evidence or invent an indexer upstream.
