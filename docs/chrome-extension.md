# Chrome extension

The extension shares the audio of the current tab, another tab, a window or the
whole system, chosen from the split button's menu. It uses the root React 19, Vite 7,
Tailwind 4 and shadcn installation, the `@shared` alias and the existing Luma
component configuration in `components.json`. There is no second package install
or copied component catalog.

The popup imports `DesktopLayout`, `DeviceList` and `QrPairingCard` from the
desktop app, plus shared buttons, popovers, theme tokens and `EkoMark`. The QR
card accepts a compact size and a browser link opener; desktop defaults remain
unchanged. Listen opens a separate tab with the shared receiver layout, then
uses the existing hosted web receiver after a pairing link is entered.

## Build and load

```sh
pnpm install --frozen-lockfile
pnpm ops extension:package
```

Load `dist/extension/` with **Load unpacked** at `chrome://extensions`. Chrome 116
or later is required. Open a normal web tab, invoke the extension and choose
**Start sharing**. Scan the code on the receiver, then allow it in the popup.
Settings contains local speaker mute, theme and the receiver entry point.

The package operation creates:

- `dist/extension/`: the complete unpacked extension.
- `dist/eko-extension.zip`: a Web Store package with `manifest.json` at its root.
- `dist/eko-extension.zip.sha256`: the archive checksum.
- `dist/extension-bundle.json`: version, file count, size and checksum.

The bundle contains the module service worker, offscreen audio page, popup and
receiver entry pages, React modules, styles, local Nunito fonts and 16/32/48/128
pixel brand icons. No remote script or runtime CDN is required. Packaging checks
manifest entries and local HTML/CSS assets before creating the archive. The
`zip` command is required; GitHub’s Ubuntu runner includes it.

`pnpm dev:extension` previews the popup at `http://127.0.0.1:4140/popup.html`.
That preview cannot use Chrome extension capture APIs. Load the production build
to exercise the service worker and offscreen host. Increment the version in
`extension/public/manifest.json` before each subsequent Web Store upload.

## Encoding and sending

1. For **This tab**, the user action grants access to the active tab. The
   service worker obtains a tab capture stream ID and the offscreen page
   consumes it through `getUserMedia`. For **Another tab**, **A window** and
   **System audio**, the offscreen page (created with the `DISPLAY_MEDIA`
   reason) calls `getDisplayMedia` and Chrome shows its own picker. The picture
   track is stopped immediately, and a selection without audio fails with a
   clear error. Window audio needs Chrome 140+, and both window and system
   audio depend on the operating system; Chrome omits the audio option where
   it cannot capture it. All capture code lives in `extension/runtime/capture.ts`.
2. A Web Audio graph preserves computer playback and allows muting only that
   local output.
3. The host creates a room through the existing Worker, authenticates its
   WebSocket with the host token and fetches short-lived TURN credentials.
4. A QR scan only creates a pending request. The host’s explicit Allow action
   permits a send-only peer for that authenticated receiver identity.
5. Chrome negotiates Opus and provides packetization, congestion control, ICE
   and encrypted WebRTC media. Audio travels directly when possible; Cloudflare
   TURN forwards encrypted packets when direct connectivity fails.

The extension needs no JavaScript Opus encoder or custom WebRTC transport.
It reuses installed React, Zod and QR packages for UI, input validation and QR
rendering. The original PR also bundled a QR library directly in its source;
absence of a package manifest did not mean every feature was implemented from
scratch. The shared QR renderer now owns that functionality.

The Worker remains an authenticated signaling and credential service, rather
than an audio encoder or media mixer. Its existing token checks, receiver
limits, rate limits and host-reconnection grace still apply. The extension
does not implement LAN discovery or a local signaling server; its QR payload
retains the existing protocol’s local placeholder fields and uses hosted
signaling. Android’s existing fallback must be checked on a real device.

## Audit of PR #3

Audited original revision: `61630ffe6ccf9edfdd35d1505692795a666be3ef`.

| Finding | Result in this implementation |
| --- | --- |
| `receiverReady` created an audio peer without checking approval; automatic approval defaulted to enabled. | Explicit approval is mandatory, and peer creation, answers and candidates all enforce it. |
| The receiver ID inside messages was not bound to its authenticated relay identity. | Boundary validation rejects mismatched IDs and malformed payloads. |
| Approval sent both permission and ready notifications; repeated readiness replaced existing peers. | Peer creation is idempotent. Revoking access cancels in-flight work before it can send an offer. |
| Session device objects omitted required fields used by the Rust receiver. | Session snapshots use the generated shared `Device` and `RoomSession` types and the existing session helpers. |
| Disconnect only removed local state and did not notify the receiver. | Disconnect closes media, revokes access and sends the shared permission change. Rejoining requires fresh approval. |
| Host and join credentials were written to persistent extension storage. | Host and TURN credentials remain in offscreen memory. Popup snapshots expose only the pairing details needed to join. |
| Network failures and exhausted retries could leave capture running. | Startup failure, tab closure, explicit stop and exhausted relay recovery release tracks, peers, timers, audio context and the room socket. An unauthenticated room expires under the existing Worker alarm. |
| TURN failures were silent, credentials were not refreshed, and peers were labelled relayed without observing the route. | Direct fallback shows a notice, new connections use refreshed credentials, and unmeasured route information remains unknown. |
| Receiver playback lived inside the popup. | Listening uses the existing hosted receiver in a separate tab. |
| The README referenced personal paths and absent packaging/publishing scripts. | Setup uses tracked root commands, a verified bundle and the workflow below. Unsupported compatibility and installation claims were removed. |

## Checks and evidence

```sh
pnpm ops extension:check
```

Checks include session approval/denial, authenticated identity binding, Web Store
upload failure handling, TypeScript, lint, packaging and Playwright interactions.
Browser tests use real peer objects with isolated synthetic audio to verify an
Opus send-only offer, duplicate readiness and revocation. Popup fixtures cover
pending approval, light/dark themes and stopping. Another test loads the built
extension in an isolated Chromium profile and verifies its module worker,
popup and offscreen messaging.

For a system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable
when running browser checks. Otherwise install Playwright’s Chromium once with
`pnpm exec playwright install chromium`; CI installs its browser dependencies.

These checks do not establish real tab capture, live cross-device playback,
native Android compatibility, Safari playback, forced TURN, physical speaker
latency or background survival under device power limits. Keep those separate
from source, build, rendered UI and isolated extension-load evidence.

## Web Store publishing

`.github/workflows/publish-webstore.yml` follows Quizialo’s service-account
authentication and Web Store v2 API flow. Pull requests build and check the ZIP
without publishing credentials. Dispatch it on upstream `main` after merge:

```sh
gh workflow run publish-webstore.yml --repo Noelithub77/eko --ref main -f action=build
```

Modes:

- `build` (default): checks, bundles and uploads the ZIP artifact.
- `preflight`: also authenticates and reads eko’s listing; no upload or submission.
- `publish`: uploads that run’s ZIP, waits for upload processing, submits it for
  review and reads back submission/publication status. Submission is not approval
  or proof that the extension is publicly available.

Publishing is restricted to `Noelithub77/eko` on `main`. It cannot run from the
contributor fork or a pull-request event. Cancellation is disabled for an active
publishing workflow. The script blocks submission after failed processing or
validation warnings and never prints access tokens or service-account keys.

### First listing

Eko did not have a Web Store listing when this workflow was added. Noel has since
created item `ahgbjnbhopbkifeopefgmfjckbbafndm`; upstream `CWS_EXTENSION_ID` now
points to it. The shared
`CWS_PUBLISHER_ID` and `CWS_SERVICE_ACCOUNT_KEY` were copied from Quizialo into
Eko’s repository secrets. Quizialo’s item ID was not copied.

[Store copy, assets and permission explanations](chrome-web-store/listing.md)
are tracked with an extension-specific [privacy policy](chrome-web-store/privacy.md).
Run `pnpm ops extension:assets --json` to render the actual popup with isolated
sample session data and regenerate all six PNGs. This uses the existing
Playwright Chromium installation; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select
a system browser for the isolated renderer. It never drives a live user profile.
Verify the privacy URL is public after merge before using it in the console.

1. Build the ZIP and create eko’s new item in the Chrome Web Store developer
   console. Complete its listing, screenshots and privacy declarations.
2. Ensure the existing publisher service account has access to eko’s item.
3. Copy eko’s 32-character item ID from the console and configure the repository:

   ```sh
   gh variable set CWS_EXTENSION_ID --repo Noelithub77/eko --body '<eko-item-id>'
   ```

4. After this workflow reaches upstream `main`, dispatch `action=preflight` to
   verify item access. Use `action=publish` only when ready to submit. Complete
   any first-publication steps required by the console.

The first-upload step is required because the v2 upload API updates an existing
item. The workflow intentionally fails clearly if eko’s item ID is missing.

## Primary references

- [Chrome tab capture and offscreen recording](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
- [Chrome tabCapture API and local playback](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Vite multi-page builds](https://github.com/vitejs/vite/blob/v7.0.0/docs/guide/build.md)
- [Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/)
- [Web Store v2 upload](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload)
- [Web Store v2 publish](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)
- [Web Store v2 status](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)
