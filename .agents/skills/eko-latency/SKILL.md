---
name: eko-latency
description: Measure and tune eko audio delay, compare direct and forced TURN media, or diagnose capture and receiver buffering with the project operators.
---

# Eko audio latency

Read `docs/latency.md` for operator options and measurement boundaries.

1. Run `pnpm ops latency --help`, then `pnpm --silent ops latency status --json`. No connected receiver or fresh samples is missing evidence; never substitute zeroes.
2. On Linux, run `pnpm --silent ops latency capture --json` to compare real recording fragments, then `pnpm --silent ops latency pipeline --json` for the actual capture/queue/Opus stages. These read monitor audio without saving it or playing it through physical speakers.
3. For a controlled receiver comparison, build the client and serve a frozen Vite preview as documented. Use `pnpm ops latency media` with explicit path, protocol, targets and duration. A dev server with hot reload invalidates timing when source changes during a run.
4. For TURN investigations, test `--path turn --protocol all`. Each run must prove a relay candidate at both endpoints, audio packets, decoded markers, approval before connection, pause/resume, and profiler delivery over signaling. Report failed runs and missing markers; keep network round trip separate from estimated audio delay.
5. Compare averages and p95, packet loss/concealment and marker completeness before changing a default. Change one variable at a time. The user chose balanced tuning; smaller requested buffers can produce worse observed delay on an unstable path.
6. Run `pnpm ops latency check`, `pnpm test:types`, `pnpm lint`, `pnpm test:core`, and targeted Rust checks after changes. Use the existing Cargo target cache. Re-run affected real-path measurements.

Use `--sender native` to verify the production Rust capture/Opus/WebRTC sender through the same hosted workflow; it returns native stage timings without synthetic markers. The default browser experiment uses a synthetic browser sender and the actual receiver UI and Cloudflare TURN service. The default browser fixture does not prove native sender network timing. Neither mode proves physical speaker delay, Android background behavior, or movie lip sync. The native pipeline probe has no remote peer; its write timing excludes network delivery. Ask for device access when physical acceptance is required; do not infer it from a successful build.

Keep profiler samples in memory. Emit bounded JSON to stdout; do not persist raw audio, credentials, SDP, ICE addresses or profiler logs. Media experiments create temporary rooms and close them in cleanup; they do not authorize deployment or restarting the user's desktop.
