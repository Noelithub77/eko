# Chrome extension

## Direction

**[chosen]** Use the existing root Vite build, React, TypeScript and installed packages. Import desktop pairing/listener components and shared theme and controls instead of maintaining a separate UI kit. Build the unpacked extension into `dist/extension/`.

Keep capture and host authority in an offscreen document; React only sends commands and renders snapshots. Chrome provides capture, WebRTC codec negotiation and encrypted media transport. The existing Worker provides authenticated signaling and short-lived TURN credentials.

## Approval boundary

The user approved repairing the discovered security and protocol issues as part of the migration. Require explicit host approval, bind payload identity to the authenticated relay envelope, keep credentials in memory and use shared session types. Leave native receiver and Worker behavior unchanged.

## Verification

Verified TypeScript, lint, the complete production bundle, seven session/publishing tests and three browser checks. Real browser peers enforce approval, duplicate readiness and cancellation; popup screenshots were inspected in light and dark themes. The unpacked extension loads its module worker, popup and offscreen document in an isolated Chromium profile. The existing relay typecheck and seven relay tests also pass.

Real tab capture, native Android, Safari, forced TURN playback and physical latency remain unverified. No native app build or Cloudflare deployment was run.

## Publishing

The user requested the Quizialo publishing pattern. Shared publisher and service-account credentials were transferred to upstream Eko secrets using an encrypted temporary Actions artifact; the transfer branch, artifact and private key were removed. Eko has no listing yet, so its own item ID is intentionally absent. The workflow defaults to building and restricts publishing to an explicit dispatch on upstream `main`. First-upload instructions live in `docs/chrome-extension.md`. Commit changes separately to PR #3 and ask before merging.
