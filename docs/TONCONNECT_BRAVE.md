# Brave/Tonkeeper local connection

Acton 1.0.0 serves its TON Connect page over `http://127.0.0.1` but embeds
Acton's public manifest. Brave's Tonkeeper extension correctly blocks that
origin mismatch. The repository includes a public HTTPS, no-transaction probe
for wallet connectivity and a loopback relay for local page/API inspection.

The public probe is the supported way to verify the Brave/Tonkeeper extension.
The loopback relay is not a substitute for a public dApp origin and must not be
used as a substitute for the reviewed HTTPS manifest required by the testnet
release gate.

## Public wallet smoke test

After the Pages deployment completes, open
`https://ef-code.github.io/priva-launch/tonconnect-probe.html`. The manifest
and icon are public HTTPS assets on the same GitHub Pages origin. The page only
requests the wallet address; it has no `sendTransaction` call. Tonkeeper should
show **Priva Launchpad**, and the page should display the connected chain.

## Optional local relay inspection

The local relay can be used to inspect an Acton page and its loopback API, but a
wallet may still return `MANIFEST_NOT_FOUND_ERROR` because wallets are allowed
to require a publicly reachable manifest. Use the public smoke test above for
the browser-extension connection check.

### One-time local trust setup

Close Brave before changing its certificate database, then run:

```sh
npm run tonconnect:cert -- --install-nss
```

The command creates a short-lived CA and a `localhost` certificate under
`$XDG_STATE_HOME`-style local state (`~/.local/state/priva/tonconnect-dev`)
and trusts only that CA in the current NSS database. No key is written to the
repository. Restart Brave after the command.

To remove the trust entry later:

```sh
npm run tonconnect:cert -- --remove-nss
```

## Connect through the relay

1. Start the intended Acton script in testnet mode. Keep the terminal open and
   do not approve anything yet:

   ```sh
   PRIVA_DEPLOY_NETWORK=testnet \
     acton script <reviewed-script>.tolk \
     --net testnet --tonconnect --tonconnect-port 52258 --explorer tonscan
   ```

2. Copy the page token from Acton's output. For example, if it prints
   `http://127.0.0.1:52258/abc123`, pass `/abc123` to the relay in a second
   terminal:

   ```sh
   npm run tonconnect:relay -- \
     --acton-page /abc123 --acton-port 52258 --port 52259
   ```

3. Open the HTTPS URL printed by the relay, not Acton's original HTTP URL:

   ```text
   https://127.0.0.1:52259/abc123
   ```

   Tonkeeper should identify the request as **Priva local TON Connect test**.
   If it displays another app/domain, close it and do not connect.

4. Before any real approval, verify in the wallet that the network is TON
   testnet and that the recipient, amount, bounce flag, and payload match the
   Acton terminal and the reviewed release record.

The relay forwards only `/api/*` to the Acton process on loopback. It is bound
to `127.0.0.1`, has no public listener, and contains no `net.send` logic.

## Release boundary

This fixes the local Brave/Tonkeeper development path. It does **not** create
reviewed deployment manifests, live addresses, code-hash evidence, or an
authorization to broadcast. Testnet broadcasts remain gated by the real
reviewed manifests and the existing Acton scripts.
