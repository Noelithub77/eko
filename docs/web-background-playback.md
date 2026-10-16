# Browser background audio

Reviewed against primary browser documentation on 16 October 2026. Eko's web receiver should continue live audio with the screen locked, another tab selected or another app in front, while the browser permits execution and network access. A powered-off device, terminated browser, discarded tab or unavailable network cannot continue a live stream. Media Session is an integration API, not a guarantee that Android keeps Chrome alive.

## Playback and recovery

The receiver keeps one HTML audio element attached to its WebRTC stream. Audio delivery does not depend on animation frames or JavaScript packet scheduling. Hiding the page does not pause, detach or close healthy media. The visualizer is a separate analysis graph, not the speaker output.

The initial Ask desktop action is a user gesture. Every `play()` rejection is handled; the visible Play control remains available when autoplay is blocked. Playback events update the displayed and Media Session state. A user pause remains separate from a transport interruption, including across reconnection. Resume uses live media rather than replaying an application backlog.

Media Session exposes supported Play, Pause and Stop actions to lock-screen, headset and notification controls. Action handlers stay registered across playback-state updates. Metadata follows desktop media and uses a 512-pixel artwork asset. Optional Audio Session playback mode is feature-detected and a rejected setter cannot break playback. Unsupported actions or missing metadata support are tolerated.

Connection recovery listens for online, page show, focus, visibility returning and Page Lifecycle resume. A bounded recovery check also runs while execution is available, including in hidden pages. Reconnect attempts have a 15-second cooldown, one active attempt and continue after transient failures. Desktop rejection, revocation, stream end and the receiver's Disconnect stop automatic retries. Every replacement connection still uses the existing desktop approval protocol.

## Browser constraints and choices

- Chrome's documented Energy Saver freeze criteria exclude audible pages and certain live WebRTC sessions. Keep real media active; silence hacks do not provide a reliable exemption. This policy does not promise survival under memory pressure or Android process termination.
- A frozen page cannot run JavaScript timers. Lifecycle events provide recovery when execution returns. Online signals are hints; connection state determines whether a retry is needed.
- Android audio focus, calls, headphones and other apps may interrupt playback. Do not repeatedly steal focus from another application or override explicit user Pause/Stop.
- Screen Wake Lock keeps a visible screen awake and is released when the document becomes inactive. It does not solve screen-off playback, so eko does not request it.
- A service worker cannot preserve the document's audio element or WebRTC connection after that document is terminated. PWA installation can improve launch/autoplay behavior but does not make playback immortal.
- iOS browsers use platform-specific lifecycle and autoplay rules. Chrome-on-Android proof does not establish iOS behavior. The native Android receiver remains the preferred durable background path.

## Verification

Run `pnpm test:types`, `pnpm lint`, `pnpm ops latency check`, and the focused Playwright cases in `tests/desktop/web-background.spec.ts` and `tests/desktop/latency.spec.ts`. Playwright fixtures isolate optional-API failures, hidden lifecycle events, transient network failures, explicit pause and terminal desktop rejection.

`pnpm ops receiver --json` compares production `/client/` and its versioned script byte-for-byte against the local `dist/hosted/` build. `pnpm ops deploy` performs the same verification after upload. A healthy `/client/` HTTP response alone cannot detect an old receiver bundle.

The latency media operator tests actual receiver approval, playback, pause/resume and stats through direct or forced TURN in isolated temporary rooms. It does not prove a physical phone's screen-off or battery-manager behavior. Physical acceptance still needs the target phone: start audio, lock for at least ten minutes, switch apps, exercise headset controls, interrupt Wi-Fi and restore it, and confirm live audio/updated stats on return. Test call interruption separately and respect the other app's audio focus. Do not automate these actions on a user's phone without device authorization.

## Primary references

- [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay): user interaction, `play()` promises and truthful playback controls.
- [Media Session integration](https://web.dev/articles/media-session): media metadata, lock-screen actions and partial support.
- [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api): hidden/frozen/discarded states and resume events.
- [Chrome Energy Saver freezing](https://developer.chrome.com/blog/freezing-on-energy-saver): eligibility, live WebRTC and background CPU work.
- [Audio Session](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/audioSession): optional experimental playback category.
- [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API): visibility/lifecycle restrictions.
- [Android native background media](https://developer.android.com/media/media3/session/background-playback): foreground media service lifecycle for native applications.

Context7's library lookup did not identify an applicable browser Web APIs catalog; these official browser and platform documents were used directly.
