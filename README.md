# qits-network-access-frontend

The network-access page: where a person registers a device on the platform's private network.

It is one Angular 21 page and it ships no container image. `qits-network-access-service` — the
repository behind the `qits-network-access` application — carries this repository as a git
submodule at `service/src/main/webui` (Quinoa's ui-dir) and builds it into the service image, which
serves it at `/` on its own host, `network-access.<env>.<domain>`. The build output is
`dist/qits-network-access-frontend/browser`, which the service's `quarkus.quinoa.build-dir` names.

**Why it is its own frontend (qits-2361).** The page used to live in qits-landing-app at
`/network-access`. Once the landing app is private, a person not on the tunnel could not reach the
page that puts them on it. qits-network-access-service is public on purpose, so the page moved to
its host.

**It reaches only its own host and qits-idp.** Every call is same-origin, to
`/network-access/api/...`, with no base URL. The sign-in is `provideQitsBearerSignIn({ clientId:
'qits-spa' })` with `qitsBearerInterceptor`, as in every SPA here, and it is the only thing that
talks to `idp.<domain>`. There is deliberately no `@qits/ui-components` chrome, no
`/main-navigation`, no project picker and no builds bolt: those call qits-projects and qits-ci,
which are private.

## What the page does

- **Connect this machine**: the copyable `qits network-access up`, and the companion's PAC URL for
  browsers.
- **Private edge**: its endpoint, public key and announce time, or that none has announced itself.
- **Add device**, for a phone or a laptop without the CLI: the browser makes an X25519 keypair
  (WebCrypto), only the public key is sent, and the config for the WireGuard apps is shown once as a
  QR code, a `.conf` download and copyable text, the private key filled in in memory. It is gone
  once closed.
- **Peers**: every device and node, newest first, filtered by All, Mine (`?owner=me`), Devices,
  Nodes or Revoked. An active device downloads its `wg-quick` config (`<PRIVATE_KEY>` left in
  place); an active peer can be revoked, after a confirmation.

## Layout

- `src/app/page/` — the page.
- `src/app/core/` — the operations (`peers.operations.ts`, one `qitsOperation` per call), what each
  reads (`peers.consumes.ts`), the page's helpers and the WireGuard key maker.
- `src/app/ui/` — the QR code and the copy-text box.
- `src/app/api/network-access/` — the `@hey-api/openapi-ts` client for qits-network-access-service,
  copied as generated from qits-landing-app. There is no generator setup here: to change it,
  regenerate it from the service's OpenAPI document and copy the output in.

## Development

```
npm ci
npm run lint && npm test && npm run build
npm start          # ng serve; proxy.conf.json sends /network-access/api and /network-access/q
                   # to localhost:8080
```

## The pact

`src/app/core/peers.operations.pact.spec.ts` runs each operation against a pact mock server built
from `@qits/network-access-golden-masters` (`addGoldenInteraction`) and compares the result with
the committed `pacts/qits-network-access-frontend_qits-network-access-service.json`. After a change
to an operation, or a bump of the golden masters, regenerate it:

```
QITS_GOLDEN_UPDATE=true npm test
```

and commit the file. The release packs it into
`eu.wohlben.qits:qits-network-access-frontend-pacts-qits-network-access-service`, which the service
verifies in its gate (`.config/qits/release.yml`).

## Registries

`.npmrc` routes installs at the platform's own registries and carries no credential; a developer's
`~/.npmrc` holds the workstation one. The comment in `.npmrc` explains the arrangement.
