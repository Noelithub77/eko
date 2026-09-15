# eko : apshare audio for everyone

## 1. Why eko?

eko started during a train journey with friends. We wanted to watch a movie playing it on the speakers which might disturb our neighbors, which gave us a fairly specific problem: **one media source, multiple private audio outputs**.

Bluetooth seemed like the natural solution. It is excellent until you ask it to behave like a small broadcast system.

Traditional Bluetooth audio is built primarily around direct device-to-device playback.
 **Bluetooth LE Audio** and **Auracast** introduce proper broadcast capabilities, but availability still depends on compatible hardware, operating systems, profiles, and receivers. None of our devices supported it too.

I wanted to explore whether the same experience could be built using hardware people already have.

That became eko: capture system audio on a desktop and stream it with low latency to approved nearby devices.

The constraints were:

* No account for local use.
* QR and local-network discovery.
* Explicit host approval.
* Low-latency playback.
* No dedicated receiver hardware.

The resulting interaction is intentionally small: start a stream, discover it, approve the receiver, and listen.

> [Diagram 01 — Why Eko](./excali/01-why-eko.excalidraw): Desktop audio source → Bluetooth output versus Eko distributing the audio to several phones over the local network.

---

## 2. Choosing the Transport

I chose **WebRTC** for the media layer.

It already provides most of the machinery a real-time stream needs:

* Peer-to-peer media transport
* Encryption
* Connectivity negotiation
* Congestion handling
* Real-time codecs such as **Opus**

The audio path is:

```text
Desktop audio
    ↓
Capture
    ↓
Opus
    ↓
WebRTC
    ↓
Receiver
```

Each receiver gets an independent peer connection. This keeps connection state isolated and lets receivers join or leave independently.

Discovery happens separately through a QR code or LAN discovery.

I deliberately kept discovery and authorization separate:

> **Pairing identifies a device. Approval authorizes it.**

Only after approval does signaling begin.

A **WebSocket** carries SDP and ICE information between peers, while **WebRTC** handles the actual media.

This distinction became important surprisingly quickly. A healthy signaling connection says almost nothing about whether media can actually flow. WebRTC still has to negotiate a usable network path.

> [Diagram 02 — The innovation](./excali/02-innovation.excalidraw): Discover → Request → Approve → Negotiate WebRTC → Stream audio.

---

## 3. Architecture

The desktop application uses **Tauri 2**, with **React** for the interface and **Rust** for the core.

### Why Rust?

I also wanted eko to be a serious Rust learning project.

I had already experimented with Rust, but I wanted to use it somewhere performance was a real constraint rather than a theoretical advantage.

Real-time audio provides that nicely.

Capture, encoding, buffering, and networking run continuously. Extra copies, allocations, blocking work, and poor concurrency decisions can become latency, CPU usage, or broken playback.

That makes concepts such as ownership, borrowing, concurrency, memory layout, and efficient data movement much less academic.

I wanted a project where writing reasonably efficient Rust was part of making the system work, not an optional optimization pass at the end.

### Desktop Core

React handles the user-facing state:

* Stream controls
* Pairing
* Receiver management
* Approval
* Connection status
* Settings

Rust owns:

* Audio capture
* Opus encoding
* WebRTC connections
* WebSocket signaling
* Session state
* Receiver state
* Pairing
* Connection lifecycle
* Diagnostics

The UI therefore controls the session without owning the media pipeline.

### Audio Pipeline

On Windows, system audio is captured using **WASAPI loopback**.

```text
WASAPI loopback
      ↓
PCM
      ↓
Opus
      ↓
WebRTC
      ↓
Decode
      ↓
Native audio output
```

The current stream uses **48 kHz stereo Opus with 20 ms frames**.

Latency here is mostly a collection of small trade-offs.

Shorter frames and smaller buffers reduce delay, but leave less room for scheduling variation and network jitter. Larger buffers make playback more tolerant but move it further away from live.

So the useful target is not simply *minimum buffering*. It is the minimum buffering that remains stable under realistic conditions.

> [Diagram 03 — Audio pipeline](./excali/03-audio-pipeline.excalidraw): WASAPI → PCM → Opus → WebRTC → Decode → Speaker, with buffering and diagnostic checkpoints.

### Pairing and Session Control

Receivers can discover a host through:

* QR pairing
* LAN discovery

Both enter the same session state machine:

```text
Join requested
      ↓
Waiting for approval
      ↓
Approved
      ↓
Negotiating
      ↓
Connected
```

Other terminal or recovery states include denial, disconnection, stop, and retry.

After approval, SDP and ICE candidates are exchanged through signaling and WebRTC establishes the media path.

> [Diagram 04 — Approval state](./excali/04-approval-state.excalidraw): Join requested → Waiting → Approved → Negotiating → Connected, with denial and disconnection branches.

### Android Receiver

Android is the primary mobile target, so its playback path is native rather than browser-driven.

React handles:

* Discovery
* Pairing
* Connection state
* Playback controls

The native layer handles:

```text
WebRTC
   ↓
Decode
   ↓
Playback buffer
   ↓
Native audio output
```

This gives the receiver explicit control over buffering and lifecycle behaviour.

For example, pausing discards stale buffered samples. Resuming returns to the current live position rather than replaying whatever accumulated in the meantime.

The media engine therefore remains independent of the UI lifecycle.

> [Diagram 05 — Android playback boundary](./excali/05-android-boundary.excalidraw): React UI controlling a native media layer while WebRTC audio flows to native output.

### Browser Fallback and TURN

A browser receiver provides a fallback for platforms where the native client is unavailable, particularly iOS.

The preferred WebRTC path is direct:

```text
Desktop → Receiver
```

When ICE cannot establish a direct connection, the stream can use a **TURN relay**:

```text
Desktop → TURN → Receiver
```

TURN improves reachability at the cost of an additional network hop, relay bandwidth, and infrastructure dependency, so it remains a fallback.

TURN access also uses short-lived credentials rather than distributing the service's long-lived secret to clients.

> [Diagram 06 — Direct path and TURN fallback](./excali/06-turn-fallback.excalidraw): Direct WebRTC as the preferred route, with TURN when direct ICE connectivity fails.

> [Diagram 07 — Debugging by evidence](./excali/07-debugging.excalidraw): Healthy capture and encoding followed by a missing ICE path, showing why audio did not reach the receiver.

---

## 4. What I Want to Explore Next

The next phase is mostly about replacing assumptions with measurements.

I want to benchmark:

* Connection setup time
* End-to-end audio latency
* Jitter
* Packet loss
* Buffer behaviour
* Connection stability

Results should include enough context to reproduce them:

```text
Hardware
Network conditions
Number of samples
Median latency
Worst-case latency
```

I also want to measure how the architecture behaves as receivers are added.

Each receiver currently has an independent WebRTC connection, so scaling will eventually be limited by some combination of encoding work, CPU usage, bandwidth, Wi-Fi behaviour, packet loss, and buffering.

Finding that limit experimentally is considerably more useful than guessing it from the architecture.

Other areas I want to explore include:

1. Better latency, jitter, packet-loss, and buffering diagnostics.
2. More complete connection lifecycle testing.
3. Android background and lifecycle behaviour.
4. Audio capture backends beyond Windows.
5. Recovery from network and device failures.

---

## What Building eko Has Taught Me

eko has been useful because it connects several topics I had previously explored separately.

The complete path,

**system audio → PCM → encoding → networking → decoding → playback**

makes interactions between systems programming, networking, and real-time media much easier to understand than studying each in isolation.

It has also been a much better way for me to learn Rust. Performance decisions have visible consequences: unnecessary work eventually becomes CPU usage, buffering, or latency.

There is still plenty of the system I want to improve, which is exactly why I find the project useful. Each limitation exposes another layer worth understanding.

---

**Source code:**
https://github.com/Noelithub77/eko

**Privacy policy:**
https://github.com/Noelithub77/eko/blob/main/docs/Privacy_Policy.md
