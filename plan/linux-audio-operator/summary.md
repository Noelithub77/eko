# Linux audio relay and operator diagnostics

## Goal

Make Linux desktop-to-device audio connections work across all reachable LAN
interfaces and make runtime evidence accessible to agents through a CLI.

## Evidence

- PulseAudio/PipeWire produced non-zero monitor samples and thousands of frames.
- WebRTC repeatedly entered `checking`, logged `pingAllCandidates called with no
  candidate pairs`, and closed.
- The desktop had Ethernet `192.168.10.21` and hotspot `10.42.0.1`.
- The host filtered ICE candidates to the QR pairing address, so the second
  network could not form a candidate pair.
- An older packaged run also dumped core in `eko-linux-captu`; the saved
  coredump has no matching executable/debug symbols, so its exact Rust line is
  unverified.

## Approaches considered

1. Filter ICE by the receiver's signaling interface.
   - Pros: exposes fewer candidates.
   - Cons: complicated with hosted signaling and fragile across reconnects.
2. Allow every ICE candidate and keep the QR address only for signaling.
   - Pros: fixes Ethernet, Wi-Fi, hotspot, and multi-interface sessions with a
     small change.
   - Cons: advertises more local candidates to the paired receiver.

## Chosen approach

Allow every ICE candidate. Remove the over-broad IP filter; keep existing
pairing address selection for QR/discovery.

## Main implementation

- Remove the WebRTC host-IP restriction.
- Add operator-only loopback runtime JSON with session, audio pipeline, peer
  state, and profiler information.
- Add `pnpm operator` commands for status, profiler, logs, diagnostics, and
  watch mode.
- Document log locations, commands, and interpretation.
