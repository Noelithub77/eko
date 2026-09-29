## 1. Why eko?

The idea for eko started on a train journey with my friends.

We wanted to watch a movie together without playing the audio out loud to not disturb others nearby.  
left me with a simple question:

**How can one computer stream the same live audio to several nearby phones?**

Bluetooth was the obvious place to start looking. It works well for normal audio devices, but sending one stream to several independent receivers is less straightforward. Technologies such as **Bluetooth LE Audio** and **Auracast** address this, but support still depends on compatible hardware, operating systems, and receivers.

I wanted to see how far I could get using devices people already had.

That became eko: capture the audio playing on a desktop and stream it to approved nearby devices with as little setup as possible.

The basic requirements were:

- No account for local use.
    
- No manually entering IP addresses or ports.
    
- QR or local-network discovery.
    
- The host decides who can connect.
    
- Low enough latency to feel live.
    
- No dedicated receiving hardware.
    

The intended flow is simply: start the stream, scan a QR code, approve the device, and listen.

![[Pasted image 20260916113204.png]]
---

## 2. Exploring the Approach

I ended up using **WebRTC** for the audio transport.

It already solves many of the problems I would otherwise have to build myself: peer connections, encryption, connectivity negotiation, congestion handling, and real-time codecs such as **Opus**.

The pipeline is:

```text
Desktop audio
    ↓
Capture
    ↓
Opus
    ↓
WebRTC
    ↓
Phone
```

Each receiver gets an independent WebRTC connection, so devices can join or leave without affecting the others.

Before creating that connection, the receiver first has to find the host. eko supports QR pairing and LAN discovery, but neither grants access by itself.

The distinction I settled on was:

> **Pairing identifies a device. Approval authorizes it.**

After approval, WebSocket signaling exchanges the information WebRTC needs to establish its media connection.

That separation also cleared up something I initially found confusing: signaling can work perfectly while the media connection still fails. A working WebSocket tells me the peers can coordinate; it does not tell me that WebRTC found a path for the audio.

> _[Excalidraw diagram 02: Discover → Request → Approve → Negotiate WebRTC → Play audio.]_

---

## 3. Architecture

The desktop application uses **Tauri 2**, with a **React** interface and a **Rust** core.

### Why Rust?

One of my goals with eko was to properly learn Rust.

I had experimented with the language before, but I wanted to use it somewhere performance actually mattered rather than learning it entirely through small exercises.

Real-time audio seemed like a good fit. Capture, encoding, buffering, and networking happen continuously, so unnecessary allocations, copies, blocking work, or poor concurrency decisions can directly affect latency and playback.

That gives me a practical reason to learn concepts such as ownership, memory management, concurrency, and efficient data movement instead of treating them as language features in isolation.

I am still learning Rust, which is part of the reason I chose it here: this project forces me to think more carefully about how the code behaves rather than only whether it works.

### Desktop

React handles the interface:

- Stream controls
    
- QR pairing
    
- Device management
    
- Approval
    
- Connection status
    
- Settings
    

Rust owns the underlying session:

- Audio capture
    
- Opus encoding
    
- WebRTC connections
    
- WebSocket signaling
    
- Device and session state
    
- Pairing
    
- Connection control
    
- Diagnostics
    

This keeps the media and authorization logic independent from the UI.

### Audio Pipeline

On Windows, eko captures the default system output using **WASAPI loopback**.

```text
WASAPI loopback
      ↓
PCM
      ↓
Opus encoder
      ↓
WebRTC
      ↓
Decoder
      ↓
Native audio output
```

The current stream uses **48 kHz stereo Opus with 20 ms packets**.

This part of the project made latency feel much less abstract.

Smaller packets can reduce waiting time but increase overhead. Larger playback buffers tolerate jitter better but add delay.

So the problem is not simply making everything as small as possible. It is finding the smallest buffers and packet sizes that still keep playback stable.

> _[Excalidraw diagram 03: WASAPI → PCM → Opus → WebRTC → Decode → Speaker, with buffering shown around the transport and playback stages.]_

### Pairing and Session Control

A receiver can find a host through:

- A QR code
    
- LAN discovery
    

Both lead into the same state flow:

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

Sessions can also be denied, disconnected, stopped, or retried.

Once approved, the peers exchange **SDP** and **ICE candidates** through WebSocket signaling while WebRTC carries the audio itself.

> _[Excalidraw diagram 04: Join requested → Waiting → Approved → Negotiating → Connected, with Denied and Disconnected branches.]_

### Android Receiver

Android is the main mobile target, so I wanted its audio path to be native rather than relying entirely on browser playback.

The React interface handles discovery, pairing, status, and controls. The native layer handles WebRTC reception, decoding, buffering, and audio output.

```text
WebRTC
   ↓
Decode
   ↓
Playback buffer
   ↓
Native audio output
```

This also gives the receiver better control over playback behaviour.

For example, pausing should discard stale buffered audio so resuming returns to the live stream instead of playing audio from several seconds ago.

Keeping the media engine outside the UI also makes Android lifecycle behaviour easier to reason about.

> _[Excalidraw diagram 05: React UI controlling a native media layer, with the WebRTC audio path going directly through the native layer to audio output.]_

### Browser Fallback and TURN

There is also a browser receiver, mainly as a fallback for platforms such as iOS.

Whenever possible, WebRTC connects the peers directly:

```text
Desktop → Receiver
```

Some networks prevent that, so eko can fall back to a **TURN relay**:

```text
Desktop → TURN → Receiver
```

TURN improves connectivity but adds bandwidth, cost, and another network hop, so it is a fallback rather than the normal path.

The client also receives short-lived TURN credentials instead of exposing a long-lived service secret.

> _[Excalidraw diagram 06: Direct WebRTC path as the preferred route, with TURN shown as the fallback when ICE cannot establish a direct connection.]_

---

## 4. What I Want to Explore Next

The next step is less about adding features and more about measuring how well the current system actually works.

The main things I want to measure on real devices are:

- Connection setup time
    
- End-to-end latency
    
- Jitter
    
- Packet loss
    
- Buffer behaviour
    
- Connection stability
    

I also want to record the test environment instead of publishing isolated numbers:

```text
Hardware
Network conditions
Number of samples
Median latency
Worst-case latency
```

Another important test is scaling the number of receivers.

Every receiver currently has its own WebRTC connection, so the practical limit will depend on CPU usage, encoding, bandwidth, Wi-Fi conditions, packet loss, and buffering.

Rather than estimate that limit, I want to measure where the system actually starts to degrade.

Other areas I want to explore are:

1. Better latency, jitter, packet-loss, and buffer diagnostics.
    
2. More testing around joining, approval, disconnection, and cleanup.
    
3. Android lifecycle and background behaviour.
    
4. Audio capture on operating systems beyond Windows.
    
5. Better recovery when connections or devices fail.
    

---

## What Building eko Has Taught Me

eko started from a small inconvenience, but it gave me a reason to explore several areas I had only understood individually before.

Working on the whole path from **system audio → encoding → networking → decoding → playback** made the relationship between them much clearer.

It has also been a useful way to learn Rust. Instead of optimizing code because a benchmark says it is faster, I can see why efficiency matters when extra work becomes latency, buffering, or CPU usage.

There is still quite a lot I want to improve. That is also what makes the project useful to me: every limitation gives me another part of the system to understand.

---

**Source code:**  
[https://github.com/Noelithub77/eko](https://github.com/Noelithub77/eko)

**Privacy policy:**  
[https://github.com/Noelithub77/eko/blob/main/docs/Privacy_Policy.md](https://github.com/Noelithub77/eko/blob/main/docs/Privacy_Policy.md)