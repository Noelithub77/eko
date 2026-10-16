# Reduce audio delay

User chose balanced tuning: low delay with protection against crackles.

**[chosen]** Repair profiling, compare real paths, bound stale queues and use a modest browser target. Retain native Android, existing approval and TURN fallback. The user approved a direct declaration of the already-locked Rustls library to select its existing `ring` provider.

Alternatives: zero buffers minimize deliberate waiting but increase dropouts; large fixed buffers smooth unstable networks but hurt lip sync. Browser receiver rewrites and protocol changes add risk without first isolating the delay.

Baseline: the running desktop had no connected peer or profiler samples. The old latency test used literal zeroes. Browser stats used lifetime buffer averages and an arbitrary succeeded ICE pair, and sent hosted profiles to the website rather than the desktop. Linux capture supplied no fragment size. Android allowed 96,000 interleaved samples (1000 ms at 48 kHz stereo).

Implement recent interval stats, selected-pair RTT, a labeled partial estimate, bounded per-device windows, a delay popup and network advice. Compare capture fragments and browser targets with real operators. End-to-end speaker and movie lip-sync acceptance requires the actual receiver and physical output; never infer it from RTT.

## Verified results

- Three capture probes: server default averaged 1799.4, 1802.2 and 1802.5 ms; 20 ms fragments averaged 0.45, 0.82 and 1.29 ms. These are record queue readings after packet reads, not physical end-to-end delay.
- Sustained running Linux pipeline: 8712 frames, capture queue average 1.84 ms, sender queue 0.17 ms, encode 0.57 ms, no stale drops or write errors; no connected receiver during that snapshot.
- Frozen browser matrix: all 12 direct/relay udp/tcp/tls target combinations passed; four selected-40-ms repeats passed; all 128 coded probes detected. A repeated tls route still buffered roughly one second despite its target, so targets are not hard caps.
- The 40 ms setting avoids the large default start wait and balances the direct/tcp/tls measurements. Retain UDP and direct-media preference plus secure tcp/tls fallback.
- `pnpm ops latency media --max-delay-ms 1` correctly failed the measured budget while retaining `workflowSuccess: true`.
- Six statistics/profiler regressions, two latency UI tests and existing desktop layout/core checks passed. Rust unit tests passed; native hardware playback is not proved.
- Full aggregate data and stage timelines: `docs/reports/latency-2026-10-16.html`.

## Native encryption initialization

The user approved the direct Rustls 0.23.40 declaration. Startup and standalone media initialization now select `ring` before networking, with idempotent handling of concurrent initialization. The locked package version is unchanged. `cargo check --offline` and 21 library tests passed, including a regression constructing both TLS builders with both provider features enabled.

The production Rust-to-browser direct and forced UDP TURN workflows passed without a crypto panic. Both endpoints selected relay candidates for UDP TURN; audio packets, approval, pause/resume and profile delivery were verified. Forced TCP and TLS native trials reached answer exchange but failed to connect. The pinned upstream `webrtc-ice` 0.17.1 relay gatherer implements UDP only and explicitly leaves TCP/TLS unimplemented. This transport limitation needs a separate implementation or library decision; browser-to-browser TCP/TLS success does not prove native support.

The global headless Windows VM skill and operators are implemented and committed in dotfiles. The user approved prerequisites and virtual audio. The default VM now has the native toolchain, a healthy virtual speaker and a passing WASAPI/Opus pipeline. Three optimized probes encoded 136/149/149 frames without write errors. Recovery after 500/1000 ms consumer stalls took 13.5/18.5 ms. QPC timestamp coverage was sparse, so capture age remains unproven; see `docs/windows-vm-testing.md` for precise evidence and limits. All configured platform artifact builds passed, with an Android-only retry after an SDK setup fix; see `docs/platform-builds.md`.

## Receiver telemetry and background recovery

**[chosen]** Fix the hosted receiver version mismatch and verify exact script bytes after deployment. The live desktop had connected media but no receiver profiler samples; production `/client/` still served a bundle without signaling-based profiler delivery. Bound the desktop measuring state to ten seconds and explain missing/unsupported stats without inventing a delay.

**[chosen]** Keep the HTML audio/WebRTC path active while hidden, retain Media Session controls across state changes, tolerate optional browser APIs and retry transient failures in the background with one in-flight attempt and a fifteen-second cooldown. Preserve explicit pause and stop retries on desktop rejection/revocation or stream end. Research and acceptance boundaries are in `docs/web-background-playback.md`.

Headless regression tests cover lifecycle events, API failures, reconnect failure/retry, terminal rejection and media actions. Frozen receiver experiments cover direct and forced UDP/TCP/TLS TURN, approval, audio, pause/resume and signaling profiler samples. Screen-off Android audio focus and battery policy still require a physical phone.
