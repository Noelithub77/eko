# Reduce audio delay

User chose balanced tuning: low delay with protection against crackles.

**[chosen]** Repair profiling, compare real paths, bound stale queues and use a modest browser target. Retain native Android, existing approval and TURN fallback. No new dependencies.

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

## Pending native encryption decision

The production Rust-to-browser TURN fixture compiles and reaches answer exchange, but the library panics because `ring` and `aws-lc-rs` both enable Rustls without choosing a process provider. The proposed fix is a direct declaration of the already-locked Rustls library and explicit `ring` initialization before networking. This needs dependency approval under AGENTS.md; no new package has been added. The native TURN route remains unverified until that fix is approved and tested. This is separate from the successful browser-to-browser real TURN runs.

Windows optimization and the global headless Windows VM skill remain queued after the Linux phase, following the user's priority correction.
