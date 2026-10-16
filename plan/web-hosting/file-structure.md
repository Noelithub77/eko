# Web source layout

```text
frontend/web/
  index.html          Static landing entry
  landing/            Landing scenes, styles, shader, downloads, and tests
  public/             Shared hosted static assets and headers
  client/             React browser receiver and its HTML entry
vite.config.ts        Hosted multipage build and native platform builds
ops.ts                Root web build, checks, deployment, and readback
relay/
  worker.ts           Signaling, rooms, TURN, and static asset fallback
  wrangler.jsonc      Existing Worker, assets, and public hostname route
```

Hosted output is `dist/hosted/`. Native desktop receiver assets remain in `dist/web/client/`.
