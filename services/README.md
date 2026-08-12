# Local service boundary

The default local services are development adapters only. They bind to
loopback and cannot be used as public deployment endpoints or inserted into a
reviewed testnet manifest. For controlled testnet hosting, `render.yaml`
selects the explicit `render` mode, which binds to `0.0.0.0` behind Render's
TLS proxy and requires an HTTPS CORS origin. It is still not a mainnet
deployment profile.

## Gateway

The gateway runs a real `priva_purchase_auth` prover from the pinned vendored
artifacts. It requires the operator to provide actual policy values and secret
inputs; it has no fixture fallback.

```bash
export PRIVA_GATEWAY_MODE=local
export TELEGRAM_BOT_TOKEN='read from your local secret manager'
export PRIVA_ISSUER_SECRET='read from your local secret manager'
export PRIVA_APP_DOMAIN='the exact lower-case app hostname'
export PRIVA_LAUNCH_ID='the exact reviewed launch identifier'
export PRIVA_LAUNCH_ID_HASH='the exact reviewed decimal field element'
export PRIVA_LAUNCHPAD_ADDRESS='the exact deployed testnet launchpad address'
export PRIVA_CORS_ORIGIN='http://localhost:5173'
npm run gateway:local
```

It listens on `http://127.0.0.1:8787` and exposes:

```text
GET  /healthz
POST /v1/purchase-authorizations
```

The adapter converts the browser request into the v2 address-limb request
expected by `zk-tele-auth`, self-verifies the proof, and splits the generated
Tolk verifier message into the two BOCs expected by Priva. It never logs the
request body or returns the issuer secret.

The default service intentionally requires `PRIVA_GATEWAY_MODE=local` and
rejects any non-loopback bind address. A public HTTPS gateway still requires a
separately operated TLS service and a reviewed manifest URL.

The Render blueprint uses `PRIVA_GATEWAY_MODE=render` instead. That mode is
strictly opt-in, requires the same real policy/secrets, and uses Render's
platform `PORT`; it does not accept a public bind when local mode is selected.

To avoid placing either secret in shell history, `npm run gateway:keyring`
loads `issuer-secret` and `telegram-bot-token` from GNOME Secret Service and
loads the non-secret policy values from
`$XDG_STATE_HOME/priva/testnet-policy.env` (or `PRIVA_POLICY_FILE`). It still
binds only to loopback and remains unsuitable as a public endpoint. Store the
Telegram token directly in the keyring; never paste it into chat or commit it.

```bash
secret-tool store --label='Priva Telegram bot token' service priva-launch item telegram-bot-token
npm run gateway:keyring
```

The keyring launcher does not print, persist, or pass secrets as command-line
arguments. It exits before starting the gateway when a required item or policy
field is absent.

## Indexer

The local indexer is a read-only proxy. It has no fixtures and returns `503`
until a real upstream indexer is configured:

```bash
export PRIVA_INDEXER_MODE=local
export PRIVA_INDEXER_UPSTREAM='https://your-real-indexer.example'
export PRIVA_LAUNCHPAD_ADDRESS='the exact deployed testnet launchpad address'
npm run indexer:local
```

The Render blueprint uses `PRIVA_INDEXER_MODE=render` and binds to the platform
`PORT`. With no `PRIVA_INDEXER_UPSTREAM`, it uses direct fixed-price testnet
mode: the configured TON Center-compatible chain API supplies launchpad getter
values and indexed on-chain `PRVB` messages. Set `PRIVA_INDEXER_UPSTREAM` only when a
richer independently operated indexer is available; the proxy still
reconciles accounting with the launchpad.

It listens on `http://127.0.0.1:8788` and serves `/v1/launches` and
`/v1/purchases/<numeric-query-id>` only after validating the upstream response
and matching every launch to the configured launchpad address.

## Public policy commitments

Use `npm run derive:testnet-commitments` with `PRIVA_ISSUER_SECRET` supplied
from a secret manager. The command prints only the app-domain, issuer-key, and
already-reviewed launch-ID commitments. Never commit the issuer secret or send
it through chat.
