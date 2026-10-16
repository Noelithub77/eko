# Audio delay operators

Discover the current surface with `pnpm ops latency --help`. These commands emit JSON with an environment, success flag and measurement limits. Failures return a nonzero exit code. No profiler logs or audio files are written.

```sh
pnpm --silent ops latency status --seconds 20 --json
pnpm --silent ops latency status --max-delay-ms 150 --json
pnpm --silent ops latency capture --json
pnpm --silent ops latency pipeline --json
pnpm --silent ops latency check --json
```

`status` reads the loopback desktop operator endpoint; override it with `EKO_OPERATOR_URL` when using another local port. Connected receiver samples must be fresh. It reports each device separately, with average, p95 and maximum recent delay/buffer/round trip/jitter, and the native pipeline counters. For native Android, the host combines the reported playback queue with half the selected peer round trip when that timing is available. A threshold cannot pass with an unavailable delay measurement.

`capture` requires Linux, Python 3, `pactl` and `libpulse-simple`. It reads the default output's monitor with the same 48 kHz stereo, signed 16-bit format and 20 ms reads as the production app, comparing server-default buffering with explicit 20 ms and 10 ms fragments. It measures the record pipeline's reported latency after five warm-up reads. It does not include the application producing audio, packetization or remote playback.

`pipeline` runs a cached ignored Rust test that reads the real default monitor for three seconds. It uses the production capture, channel, Opus encoder and WebRTC track writer. It reports stage sample counts, latest/average/maximum durations, write errors and stale-frame drops. There is no connected peer, so write timings exclude network delivery. Cargo and system build libraries must already be available; missing prerequisites fail rather than installing software. This command can compile the focused test harness; it is not a full desktop build.

## Full browser and TURN workflow

Use a frozen build so editing source cannot reload a test page mid-run:

```sh
pnpm build:web:client
pnpm exec cross-env PLATFORM=web/client pnpm exec vite preview --host 127.0.0.1 --port 5190 --strictPort
```

In another terminal:

```sh
pnpm --silent ops latency media --path both --protocol all --targets 60,40,20 --seconds 12 --client-url http://127.0.0.1:5190 --json
```

Add `--max-delay-ms 150` to enforce a p95 budget for observed probe/estimated delay; missing or over-budget timing fails even if the workflow connects. A workflow-only run without that option can pass while showing slow media.

For repeated comparisons, add `--runs 2` or `--runs 3`. Bound each run with `--seconds 6..60`. `--protocol udp|tcp|tls|all` filters the real ephemeral credentials to the transport being tested; it does not change production defaults. `EKO_CHROMIUM_PATH` selects Chromium (default `/usr/bin/chromium`). Use `--relay-url` to select a different explicit HTTPS relay origin. The default is `https://eko.allpyq.in`.

The test creates an isolated browser context and a temporary Worker room per run. It follows the actual receiver UI through join, approval waiting, permission, receiver-ready, answer, ICE, first audio, pause and resume. It obtains real host and receiver TURN credentials. Forced TURN constrains both peers to relay candidates and fails if either selected path is direct. Direct baselines fail if a relay is selected. No live desktop session or approved-device list is changed.

Results contain a stage timeline, selected candidate types and relay protocols, packet counts, loss, concealment, requested and observed buffer, recent profile samples, and mean/p95/max delay/jitter. The relay's client-to-server transport can be TCP or TLS while the candidate `protocol` still says UDP; inspect `relayProtocol` to identify that distinction.

Frequency-coded audio pulses travel through real Opus media and a receiver AudioWorklet detects decoded onsets. Each pulse has its own identity so a delayed pulse cannot be matched to a later timestamp. At least 90% must be detected. This measures software source-to-decoded-media timing, with cross-context audio-clock and scheduling uncertainty; it excludes desktop system capture, physical speaker/Bluetooth output and screen-to-sound lip sync. This is a browser sender fixture, not a production Rust sender. Report those limits beside the numbers.

Setup durations are not steady audio latency: room creation, token fetch and user approval happen before media playback. Do not add those times to every audio packet.

### Production native sender

The same isolated workflow can use the actual Rust sender instead of the synthetic browser source:

```sh
pnpm --silent ops latency media --sender native --path turn --protocol udp --targets 40 --seconds 12 --client-url http://127.0.0.1:5190 --json
```

The native startup explicitly initializes Rustls with the existing `ring` provider before networking. This prevents a panic when transitive dependencies enable both Rustls providers. Rustls 0.23.40 was already locked; the direct declaration uses that version without introducing another library version.

**Native transport limit:** direct and forced UDP TURN workflows passed after initialization was fixed. Forced native TCP and TLS TURN trials reached answer exchange but did not connect. The pinned `webrtc-ice` 0.17.1 implementation only gathers UDP TURN relays; TCP/TLS handling remains unimplemented in [the upstream relay gatherer](https://github.com/webrtc-rs/webrtc/blob/v0.17.1/ice/src/agent/agent_gather.rs). Browser-to-browser TCP/TLS results do not establish native transport support. Adding Rustls initialization does not add these transports.

This builds a cached ignored test harness, reads the system monitor using the production capture code, encodes with the production Opus encoder, and negotiates through the real hosted approval protocol into the real browser receiver. The native fixture carries SDP and ICE only through an in-memory child-process pipe; never log that pipe or the credential environment. Its result includes native stage timings and selected peer counters. There is no physical desktop window and Chromium's headless output is muted. No raw audio is saved.

Both peers are forced to relay for TURN tests. The native test-only policy override is compiled only into tests. Native runs do not synthesize frequency-coded markers; their `softwareMarkerDelay` is unknown, and full physical delay remains unmeasured. The normal synthetic browser experiment remains useful for those controlled software marker comparisons.

## Reading the UI

The desktop shows each connected device's average over the last 30 seconds. Click the value for p95, receiver buffering and network advice. Stale data disappears after eight seconds without fresh samples, and reconnects discard the prior connection's window.

“Estimated delay” is half the selected ICE pair's round trip plus recent receiver jitter-buffer delay. It assumes a roughly symmetric network and excludes capture, decoding and hardware output. A receiver's buffer-only measurement is labeled “avg buffer”; an unavailable delay is never rendered as zero. Legacy version-one RTT values are excluded from audio-delay averages.

Browser buffer delay uses interval differences of cumulative delay and emitted-sample counters. The first reading or an interval without emitted audio is unknown. The browser may use a larger jitter buffer than requested. The requested target is a preference, not an upper bound.

## Ranked approaches

1. Fix capture buffering. On Linux, explicitly request one 20 ms recording fragment and cap the record buffer at 60 ms. Server defaults can hold seconds. On Windows, WASAPI already requests the minimum shared device period; it still needs measurement on Windows.
2. Bound old audio throughout the pipeline. Keep three sender packets and discard frames older than 60 ms while preserving RTP time for skipped packets. Android caps its app queue at 80 ms and recovers to the freshest 40 ms after overflow. Pause/resume clears stale samples. Small queues can expose glitches on overloaded devices, so watch drops and concealment.
3. Prefer direct media on shared Wi-Fi, Ethernet plus the same router, or a mobile hotspot. Pairing can remain hosted while media is direct. Guest isolation, firewalls and VPNs can still prevent it. Do not weaken approval or blindly open firewall ports.
4. Prefer working UDP TURN. Keep TCP/TLS fallback for restrictive networks, but TCP head-of-line blocking can grow delay after loss or stalls. Compare actual relay protocol, RTT, buffer and markers; TURN does not imply a fixed one-second delay.
5. Tune the browser jitter target from measured results. Test 60, 40 and 20 ms. **[chosen]** The balanced default is 40 ms. Keep a balanced target when smaller requests lead to extra concealment, stalls or browser buffer growth. Retain feature detection on browsers that do not expose the tuning API.
6. Remove unnecessary startup waiting separately from steady playback. The schedule now uses a 40 ms lead instead of a 250 ms lead rounded to a 500 ms grid; the browser fallback also uses 40 ms. Clock alignment or a delayed first play call cannot prove continuous multi-device audio synchronization.
7. Consider 10 ms Opus packets after measuring the above. They can save at most about 10 ms of packet accumulation compared with 20 ms, at the cost of more packets, encoding calls and transport overhead. A codec/packetization change needs cross-platform loss and quality validation.
8. Inspect CPU stalls, allocations, resampling and callback locks. Measure encoding before reducing quality. Native playback callbacks should avoid waiting on a mutex; request the stream rate that matches decoded PCM. A lock-free ring buffer could further improve real-time behavior, but requires a separate package/implementation choice and device proof.
9. Test built-in or wired output separately from Bluetooth. Hardware output delay is outside these stats. Optimizing the network cannot remove an earbud's own buffering.
10. For exact movie synchronization, measure physical screen-to-speaker delay. Delaying video in the player can compensate for residual audio lag when supported; it is a separate product choice, not a hidden relay fix.

## Agent workflow

Use the project skill at `.agents/skills/eko-latency/SKILL.md`. Record only aggregate measurements and evidence limits in plans/reports; keep session samples in memory. Do not describe a synthetic browser test as physical Android, Windows, native sender or movie acceptance.

## Primary references

- [WebRTC statistics](https://www.w3.org/TR/webrtc-stats/): selected pair, round trip, cumulative jitter buffer counters and concealment.
- [WebRTC receiver jitter buffer target](https://www.w3.org/TR/webrtc/#dom-rtcrtpreceiver-jitterbuffertarget): requested target and browser clamping.
- [PulseAudio buffer attributes](https://docs.rs/libpulse-binding/latest/libpulse_binding/def/struct.BufferAttr.html): recording fragment and maximum buffer.
- [Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/): ephemeral relay access and transports.
- [Oboe stream builder](https://docs.rs/oboe/0.6.1/oboe/struct.AudioStreamBuilder.html): low-latency output configuration and requested sample rate.
