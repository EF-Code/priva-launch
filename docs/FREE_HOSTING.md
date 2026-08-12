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
3. Set every `sync: false` value in Render's encrypted environment:
   `TELEGRAM_BOT_TOKEN`, `PRIVA_ISSUER_SECRET`, `PRIVA_LAUNCH_ID`,
   `PRIVA_LAUNCH_ID_HASH`, and `PRIVA_INDEXER_UPSTREAM`.
4. Configure the upstream indexer before considering the indexer service
   usable. It must expose `/healthz`, `/v1/launches`, and the purchase lookup
   paths described in [the service contract](GATEWAY_AND_INDEXER_SERVICE.md),
   and must derive records from confirmed TON transactions rather than from
   browser input. The Render proxy additionally reads the deployed launchpad's
   accounting getter from `PRIVA_CHAIN_API` (defaulting to TON Center testnet)
   so raised value and remaining sale units are checked against current chain
   state.
5. Record the two generated `https://*.onrender.com` service URLs. Do not put
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
