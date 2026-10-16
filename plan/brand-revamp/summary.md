# Brand revamp

## Mark

**[CHOSEN]** "Turn": a coral ring with a dot, and the same shape turned 180° in teal. It is the sound and its echo, using the same turned-around idea as Tauri's logo. When animated, its four strokes morph into the stroke wordmark "eko". The ring becomes the e, the dots become the k, and the turned ring becomes the o.

Exploration rounds live in `plan/logo/`. `pairs.html` holds the final geometry.

Rejected along the way: glass and translucent treatments, and single-colour marks.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| Coral | `#ff6b5b` | primary actions, the sound |
| Teal | `#2ec4b6` | live and connected states, focus ring, the echo |
| Ink | `#101010` | dark surface and the icon tile |

Text on coral is near-black because white on coral fails contrast.

## Sources

- `rust/icons/source/`: icon SVGs and the `tauri icon` manifest. Regenerate with `pnpm tauri icon rust/icons/source/icon.json`, then delete `rust/icons/ios/` (no iOS target).
- `frontend/shared/assets/eko.svg`: the favicon for every app surface. Vite hashes it into `/assets/`, which both the desktop server and the Worker serve.
- `frontend/shared/components/EkoMark.tsx`: the in-app mark, with the one-time turn animation.
- `site/public/eko.svg`: the website's copy.
- `frontend/shared/theme.css`: one token set for desktop, Android and the web client.

Android adaptive icon files under `rust/gen/` are force-added because `rust/gen/` is ignored.
