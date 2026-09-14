# From Bluetooth Limits to Live Audio on Your Phone

---

## 1. Why Eko?

The idea for Eko came to me while I was travelling on a train with my friends. We wanted to watch a movie together, and we had one shared screen, but playing the audio through a speaker was not really an option. It would disturb the people around us, and the laptop speakers were too quiet for everyone to hear clearly.

The obvious solution was for everyone to use headphones. That solved the noise problem for one person, but it created another problem: how do you send the same audio to everyone's device while keeping the movie on one shared screen? Passing around one pair of headphones would defeat the whole point of watching together.

That led me to a simple question: why is it still so difficult to send one computer's audio to several nearby devices?

Bluetooth is excellent for connecting a device to a speaker or headphones, but it becomes much less flexible when the same audio needs to reach multiple receivers. Traditional Bluetooth setups are generally designed around one active audio stream, while multipoint support usually means switching between devices rather than broadcasting the same audio to all of them.

There are newer technologies that improve this situation. Bluetooth LE Audio and Auracast can support broadcast-style audio, but they require compatible hardware, profiles, operating-system support, and receivers. Dedicated audio devices and split-audio solutions also exist, but they can be expensive and often introduce their own compatibility limitations.

I researched the native options available for the setup I wanted. I could find ways to solve parts of the problem, but I could not find a simple, affordable solution that used the phones and computers people already had, worked over a local network, and did not require users to understand audio routing or manually enter network addresses.

That gap was the reason I started building this project.

The goal was not to replace Bluetooth everywhere. The goal was more focused: take audio already playing on a desktop and make it available to trusted nearby devices with as little friction as possible. The desktop would continue displaying the movie; the system would only share the live audio.

The requirements quickly became clear:

- No account should be needed for local use.
- Users should not have to type IP addresses or ports.
- A device should be easy to discover but never trusted automatically.
- The desktop should remain in control of who receives the audio.
- The experience should feel live, not like downloading and replaying a file.
- The solution should work with ordinary phones rather than requiring special receivers.

That last point mattered most to me. The most useful technology is often the technology people can use immediately, with the devices already in their hands. A group should be able to sit together, scan a code, wait for the host to approve each person, and start watching without buying a special transmitter or passing around a single pair of headphones.

> [Excalidraw diagram 01: Show one desktop audio source, a traditional Bluetooth output, and several nearby receivers. Mark the one-to-one limitation in red, then show the local-network fan-out approach. Caption: “The problem was not creating audio; it was sharing one live source with several ordinary devices.”]

---

## 2. The Innovation

The central idea was to use WebRTC to stream the desktop's audio directly to each person's phone instead of treating Bluetooth as the transport layer.

WebRTC is usually associated with video calls, browser meetings, and real-time communication. That made it a good fit for this problem. It already provides the difficult parts of live media transport: peer connections, negotiation, connectivity checks, encryption, congestion handling, and support for audio codecs such as Opus.

The important innovation in this project is not that I invented WebRTC. I did not. The interesting part was applying it to a different experience: turning a desktop into a local audio source that can serve several approved phones independently while everyone continues watching the same shared screen.

Instead of sending audio through Bluetooth, the system follows this path:

```text
Desktop audio
    ↓
Local capture
    ↓
Opus encoding
    ↓
WebRTC
    ↓
Phone playback
```

Every approved receiver gets its own WebRTC connection. This means one person can disconnect without taking every other listener down. It also gives the desktop clear control over individual devices.

The user experience is deliberately simple:

1. Start a stream on the desktop.
2. Scan a QR code or find the host nearby.
3. Wait for the desktop user to approve the device.
4. Establish the WebRTC connection.
5. Play the live audio on the phone.

The most important product rule is:

> Pairing identifies a device. Approval authorizes it.

A QR code or a LAN discovery result only begins the connection. It does not grant access. The desktop user must approve the receiver before the system creates its media path.

This small distinction made the design safer and easier to reason about. It also gave the desktop a clear role as the authority instead of allowing any nearby device to start receiving audio automatically.

The project also taught me that a successful signaling connection is not the same as a successful media connection. WebSocket can carry the messages needed to negotiate a session while WebRTC still fails to find a usable network path. Keeping those responsibilities separate helped me debug the system without confusing setup with playback.

> [Excalidraw diagram 02: Draw the user journey as “Discover → Request access → Desktop approves → WebRTC connects → Audio plays.” Add a lock between the request and approval stages. Caption: “The innovation is both a new transport and a simpler trust model.”]

---

## 3. Architecture

The architecture is built around one principle: the desktop owns the session, while each platform handles the part it understands best.

### Desktop application

The desktop application uses Tauri 2 with a React interface and a Rust core.

React handles the visible experience: stream controls, QR pairing, device lists, approval buttons, connection status, and settings.

Rust owns the parts that need to remain authoritative and close to the system:

- Desktop audio capture
- Opus encoding
- WebRTC sender connections
- WebSocket signaling
- Session and device state
- QR and LAN pairing information
- Approval, denial, disconnection, and stop-stream behavior
- Connection and audio diagnostics

Keeping these responsibilities in Rust prevents the UI from becoming the source of truth for media or authorization. The frontend sends typed commands and receives typed state updates, but the session itself remains owned by the core.

### Audio pipeline

On the Windows path, the system captures the default desktop output using WASAPI loopback. Audio is prepared as 48 kHz stereo Opus with 20 ms packets and written to a WebRTC audio track.

The receiver then decodes the stream and sends it to native audio output. The target path is:

```text
WASAPI loopback
    → PCM frames
    → Opus encoder
    → WebRTC audio track
    → receiver decoder
    → native audio output
```

The packet and buffer choices matter. Smaller packets can reduce waiting time but increase overhead and sensitivity to scheduling. Larger buffers can hide jitter but add delay. For a live listening experience, the right balance is more important than simply maximizing throughput.

> [Excalidraw diagram 03: Draw the complete audio pipeline from desktop output to phone speaker. Under every stage, add its main diagnostic: captured frames, encoded packets, ICE state, received packets, decoded samples, and written samples. Caption: “A live audio feature is a chain of independently failing stages.”]

### Pairing and session control

There are two supported ways to find a host:

- QR pairing gives the receiver the information needed to begin joining.
- LAN discovery lets a nearby device find an advertised host.

Both paths use the same approval flow. The receiver joins, the desktop receives a request, and the desktop decides whether to allow it.

After approval, the peers exchange SDP and ICE candidates through signaling. The audio itself does not travel over the WebSocket. WebSocket coordinates the session; WebRTC carries the media.

The important session states are:

```text
Join requested
    → Waiting for approval
    → Approved
    → Negotiating
    → Connected
```

The flow can also end in denied, disconnected, stopped, or retry-required states.

> [Excalidraw diagram 04: Draw an approval state machine with “Join requested,” “Waiting for approval,” “Approved,” “Denied,” “Negotiating,” and “Connected.” Show “Stop stream” returning active sessions to “Stopped.” Caption: “Approval is a first-class state, not a side effect of networking.”]

### Android receiver

Android is the preferred client, so it does not rely on the browser for its main playback path.

The Android-facing React UI handles scanning, nearby discovery, approval status, and connection feedback. The native receiver handles the media path: receiving the WebRTC stream, decoding audio, controlling playback, and writing to the device's native output system.

This separation is important for lifecycle and playback behavior. The UI can request pause, resume, or stop, but it should not be responsible for being the audio engine. Pausing should stop local playback and clear stale samples. Resuming should continue from the live stream rather than playing old buffered audio.

It also made startup safety more important. Code-generation or desktop-only setup work cannot be allowed to make the Android application fragile before the UI has even opened. Mobile startup should initialize only what the mobile runtime actually needs.

> [Excalidraw diagram 05: Draw three layers: React/Tauri UI, native bridge and media service, and Rust receiver/decoder/native audio output. Show playback commands crossing the bridge while audio bypasses the UI. Caption: “The interface controls playback; the native receiver performs it.”]

### Browser fallback and hosted networking

The browser client exists mainly for iOS and modern browsers. It uses browser WebRTC and browser audio APIs while keeping Android on its native path.

The hosted path has two responsibilities:

- Hosted signaling helps the desktop and browser exchange session messages.
- Cloudflare TURN provides a relay when direct WebRTC connectivity is blocked.

The preferred path is direct media over WebRTC. TURN is a fallback, not the default destination. This keeps normal local use fast and avoids relay bandwidth when the devices can connect directly.

TURN improves reliability on difficult networks, but it also introduces provider metadata, bandwidth costs, and another operational dependency. Short-lived credentials keep the long-lived service secret away from pairing links, browser bundles, and logs.

> [Excalidraw diagram 06: Show two paths from Desktop to Browser receiver. Use a solid path for “direct ICE → encrypted WebRTC audio” and a dashed fallback path for “hosted signaling → short-lived TURN credentials → TURN relay → encrypted WebRTC audio.” Caption: “Direct media is preferred; relay is used when the network requires it.”]

### Observability and debugging

The system records useful session-level evidence instead of relying on a single “connected” label.

The most useful audio counters follow progress through the pipeline:

```text
audioFramesReceived
    → audioFramesEncoded
    → audioSamplesWritten
```

Connection diagnostics include peer state, ICE state, selected connection path, outbound packet counts, latency, jitter, buffering, and packet loss.

The diagnostics do not need raw audio, SDP bodies, full ICE candidate strings, tokens, or full user-agent strings. The purpose is to understand whether the system is making progress, not to collect more data than necessary.

> [Excalidraw diagram 07: Draw the audio and network pipeline with evidence checkpoints beneath each stage. Mark the first stage that fails and place its log or counter beside it. Caption: “The first stage that stops progressing usually tells you where to investigate.”]

The main lessons from building this architecture were straightforward:

- A discovered device is not automatically trusted.
- A connected WebSocket does not prove that audio can travel.
- Configured TURN credentials do not prove that TURN was selected.
- A passing build does not prove real playback.
- An emulator cannot prove real-device latency.
- Native code belongs where the platform needs control; shared UI belongs where the behavior is genuinely shared.

---

## 4. What's Next

The next stage is not about adding endless features. It is about making the existing experience measurable, dependable, and easier to improve.

The most important next step is repeatable real-device testing. I want to measure setup time and end-to-end latency on real Windows hardware and a real Android phone, with the hardware, Wi-Fi conditions, number of samples, median, and worst-case result recorded clearly.

I also want to test how the system behaves with several receivers on realistic networks. Each receiver currently has an independent WebRTC path, but the practical limit will depend on desktop processing, network bandwidth, packet loss, and the behavior of the Wi-Fi network itself.

Other next steps include:

1. Improving development graphs for latency, jitter, buffering, packet loss, state changes, and errors.
2. Expanding automated coverage for approval, denial, unblock, disconnect, and stop-stream cleanup.
3. Testing Android playback and lifecycle behavior under normal background limits.
4. Comparing desktop capture backends across supported platforms.
5. Hardening release, update, and recovery flows.

The biggest lesson from the project is that real-time software rewards careful evidence. It is easy to say that audio is connected. It is much more useful to know that frames were captured, packets were encoded, ICE selected a real path, bytes were sent, samples were decoded, and the receiver actually played them.

That is what I want the next version of this project to demonstrate: not only that the architecture is promising, but that the experience is repeatable for real people on real devices.

Eko began as a way to make one desktop audio source useful across several nearby devices. Along the way, it became a practical education in networking, native media, platform boundaries, authorization, and debugging systems where every stage can fail independently.

The work is still evolving, but that is part of the value. Every limitation has made the system clearer, and every failed experiment has taught me to ask a better question about what the software is actually doing.

Source code: https://github.com/Noelithub77/eko

Privacy policy: https://github.com/Noelithub77/eko/blob/main/docs/Privacy_Policy.md
