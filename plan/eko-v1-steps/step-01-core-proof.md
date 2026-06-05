# Step 01: Core Proof

## Goal

Prove the risky audio path before polishing the whole app.

## Build

- Confirm Rust and Cargo are available.
- Research and install the best current Rust crates for:
  - WebRTC
  - Opus
  - Windows audio capture
  - Android low-latency audio output
- Create the first native sender and receiver proof.
- Measure setup time and latency.

## Done When

- Windows can produce a test audio stream.
- Android native receiver can play it.
- Dev metrics show setup timing and latency.
- The result is good enough to continue toward the under-100 ms target.
