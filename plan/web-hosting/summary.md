# Unified web hosting

**[chosen]** One Vite multipage build, one package installation, and the existing `eko` Cloudflare Worker.

- `/` serves the static landing page; React and animation libraries stay out of its initial entry.
- `/client/` serves the existing React browser receiver.
- `/health` and `/v1/*` run through the Worker before static assets.
- Existing desktop releases can still create rooms on `eko.noelmcv7.workers.dev`; their room responses use `eko.allpyq.in` for new pairing links and sockets.
- Desktop and Android retain their existing Vite platform builds. Desktop's embedded local browser receiver remains a separate native bundle artifact.
- No approval, room-token, or media transport rules change.

The root `pnpm ops` command builds, checks release links, deploys, and verifies the production routes. The Worker route covers `eko.allpyq.in/*`; the old Pages deployment is no longer used to serve requests on that hostname. Its DNS record remains the proxied route origin.

Validation: build both entries, run web and relay tests, check receiver assets and the health endpoint, and exercise a protected room through the production domain. Actual audio playback requires a desktop and receiver session and is separate from route and approval verification.
