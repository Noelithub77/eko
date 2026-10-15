# Landing page

**[CHOSEN]** A static Vite site in `site/`, built like the leet landing page and deployed to Cloudflare Pages at `eko.allpyq.in`.

- The first paint is plain HTML with inline hero CSS and a small download entry module.
- GSAP (ScrollTrigger, SplitText, DrawSVG), Lenis, rough.js scenes, and an OGL ripple shader load on idle. React with Sonner loads only for toasts.
- The design follows leet: Vesper black, Nunito titles, and Liberation Sans body text. Eko's own amber `#ffc131` and cyan `#24c8db` replace mint and peach.
- The page explains the product rather than showing the app UI. Hand-drawn scenes in the Excalidraw style (rough.js with Excalifont) draw themselves as you scroll.

Other options considered:

- Static exported Excalidraw SVGs. They are simple, but they cannot animate each stroke, and their dark mode is an inverted filter.
- Recorded app footage. It was dropped at Noel's request because the page should explain the idea.
- Serving the page from the relay Worker. That would couple the marketing deploys to the hosted signaling Worker.

## Story

1. Hero: the mark is one ring and its echo. A ripple field spreads from it. Downloads are a Windows `.exe`, a Linux AppImage, and an Android APK. There is no macOS build.
2. The problem: speakers, then Bluetooth, then eko.
3. The name: eko is an echo, and the second ring is the first one turned around.
4. Start, scan, approve, listen.
5. WebRTC as two conversations: signaling and media.
6. Encode once, echo everywhere: the 20 ms Opus pipeline.
7. Finding isn't joining: approval states.
8. Direct first, TURN only when needed.
9. Under the hood: the architecture and the Android native receiver.
10. How eko differs from speakers, Bluetooth, Auracast, and video calls.
11. Get eko.

Download links use the version in the root `package.json`. `pnpm ops check` verifies that the release assets exist.

## Hosting

The Pages project `eko-site` takes direct uploads from `pnpm ops deploy`; it is not connected to Git. `pnpm ops domain` attaches `eko.allpyq.in` and creates a proxied CNAME to the project's `pages.dev` subdomain in the `allpyq.in` zone.
