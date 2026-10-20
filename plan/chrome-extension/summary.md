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

The user requested the Quizialo publishing pattern. Shared publisher and service-account credentials were transferred to upstream Eko secrets using an encrypted temporary Actions artifact; the transfer branch, artifact and private key were removed. Noel created item `ahgbjnbhopbkifeopefgmfjckbbafndm`, and upstream `CWS_EXTENSION_ID` now identifies it. The workflow defaults to building and restricts publishing to an explicit dispatch on upstream `main`.

The user approved merging PR #3 after checks pass. Required reviewer approval still blocks the merge; do not bypass it. Store submission is a separate action.

## Store preparation

**[chosen]** Render the real popup with isolated sample session data and reuse the existing Turn icon, fonts and colors. Generate store-sized PNG assets locally without new packages. Keep listing copy, permission explanations and an extension-specific privacy policy in `docs/chrome-web-store/`. Prepare the console draft without submitting it for review.

Native Chrome and in-app browser control currently report unavailable in this T3 session. The Chromium extension is installed and enabled and its native-host manifest passes diagnostics. The user requested the native Codex browser route, so do not substitute direct CDP for console changes while that constraint applies.

Prepared and visually inspected three 1280 × 800 popup screenshots, the 440 × 280 small promo, the 1400 × 560 marquee and the existing 128 × 128 icon. The local renderer, extension typecheck, seven extension tests and lint pass. Console upload, saved listing fields and privacy disclosures remain unverified and unchanged by this preparation. Noel requested a prompt to continue that work in the Codex app.
