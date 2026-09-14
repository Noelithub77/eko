# Eko: Building a Desktop-to-Device Audio Relay with Rust, WebRTC, and Android

> [Replace the title only if you find a more personal version. Keep the technical keywords because they help readers understand the project quickly.]

## Index

1. [The idea behind Eko](#1-the-idea-behind-eko)
2. [The problem I wanted to solve](#2-the-problem-i-wanted-to-solve)
3. [What Eko does](#3-what-eko-does)
4. [The decisions that shaped the project](#4-the-decisions-that-shaped-the-project)
5. [The architecture](#5-the-architecture)
6. [Building the audio path](#6-building-the-audio-path)
7. [Pairing is not permission](#7-pairing-is-not-permission)
8. [Why Android has a native receiver](#8-why-android-has-a-native-receiver)
9. [The browser fallback and TURN](#9-the-browser-fallback-and-turn)
10. [The debugging lesson that changed how I tested](#10-the-debugging-lesson-that-changed-how-i-tested)
11. [What I learned](#11-what-i-learned)
12. [What works and what is still unfinished](#12-what-works-and-what-is-still-unfinished)
13. [What I would build next](#13-what-i-would-build-next)
14. [Closing thoughts](#14-closing-thoughts)
15. [Publishing checklist](#15-publishing-checklist)

---

## 1. The idea behind Eko

I have always enjoyed building tools that sit close to the real world. The most interesting projects are often not the ones with the most screens; they are the ones where software has to make something physical feel simple.

Eko started with a small question: could one desktop audio source be shared with several nearby devices without requiring special hardware, accounts, or a complicated setup process?

The answer became Eko, a local desktop-to-device audio relay. It captures audio from a desktop and streams it to approved receivers over WebRTC. The Android app is the preferred client, while a browser client provides a fallback for iOS and modern browsers.

The project taught me that real-time software is rarely just about moving data. It is also about ownership, permission, timing, network paths, platform boundaries, and being honest about what a test has actually proved.

`[Add one personal sentence here about the moment that made you want to build Eko.]`

### Hero image

`[Insert a warm, simple hero image: the Eko desktop window beside an Android phone receiving the same audio. An Excalidraw illustration of one desktop sending to two devices also works well.]`

---

## 2. The problem I wanted to solve

Bluetooth audio is convenient, but it is not always designed for the kind of group listening experience I had in mind. Depending on the hardware and operating system, sending the same audio to several devices can be difficult, inconsistent, or simply unavailable.

There are newer standards such as Bluetooth LE Audio and Auracast, but they depend on compatible hardware, profiles, and operating-system support. I wanted to explore a software-first alternative that could work with devices already connected to the same local network.

The problem statement became:

> Given one desktop audio source, let trusted nearby devices join quickly and receive the same live audio with low enough delay to feel usable.

That wording contains several important constraints:

- “One desktop audio source” means the desktop is the authority.
- “Trusted nearby devices” means discovery alone cannot be enough.
- “Join quickly” means there should be no manual IP entry or account setup.
- “Live audio” means buffering and latency matter as much as correctness.
- “Usable” means the experience must be tested on real devices, not only in a successful build.

`[Add the real-life use case here: who would use Eko, where they would use it, and why existing solutions were not a good fit.]`

### Excalidraw diagram 01 — The problem space

`[Draw one desktop audio source, one traditional Bluetooth output, and several nearby receivers. Show the Bluetooth limitation in red, then show Eko using the local network to fan out to multiple approved devices. Caption: “Eko moves the fan-out problem from Bluetooth hardware constraints into software-managed local sessions.”]`

---

## 3. What Eko does

Eko keeps the user experience intentionally small.

The desktop starts a stream and displays a QR code. It can also advertise itself on the local network. A receiver either scans the QR code or finds the host through LAN discovery. The desktop then receives a join request and decides whether that device should be allowed to receive audio.

Once the device is approved, Eko establishes signaling, completes the WebRTC negotiation, and starts the receiver's audio path.

The flow looks like this:

1. Start the stream on the desktop.
2. Scan the QR code or find the nearby host.
3. Send a join request.
4. Wait for desktop approval.
5. Complete the WebRTC connection.
6. Play the live audio.

The most important sentence in the product is simple:

> Pairing identifies a device. Approval authorizes it.

A QR code is a convenient way to begin a connection, but it is not a permission slip. The same is true of LAN discovery. A nearby device can find Eko, but it cannot receive audio until the desktop user explicitly approves it.

### Excalidraw diagram 02 — From discovery to playback

`[Draw: Discover → Request access → Desktop approves → WebRTC connects → Audio plays. Add a lock between “Request access” and “Desktop approves.” Caption: “Discovery starts the conversation; approval grants access.”]`

---

## 4. The decisions that shaped the project

Before choosing libraries, I made a few product decisions. They helped keep Eko focused.

### Local first

Eko should work on a local network without requiring an account or a cloud dashboard. This keeps the common path fast, private, and understandable.

### No manual IP addresses

Users should not have to look up an address, type a port, or understand which network interface is active. QR pairing and LAN discovery are the two supported entry points.

### The desktop remains the authority

The desktop owns the session, device approval, sharing controls, and stop/disconnect actions. This creates one clear place where the user can see who is connected and decide who may receive audio.

### Native Android playback

The Android app uses a native receiver path instead of simply opening the browser client. The UI can remain shared where that is useful, but the audio receiver needs control over playback, buffering, lifecycle, and native audio output.

### Hosted fallback, not hosted dependency

The browser path can use hosted signaling and TURN when a direct media path is blocked. Direct WebRTC remains preferred whenever it works.

The architecture direction became Tauri 2 with a Rust core and React interfaces. Rust owns audio capture, sessions, discovery, signaling, and WebRTC. React owns screens and user actions. Native Android code owns receiver playback.

### Excalidraw diagram 03 — High-level architecture

`[Draw three main areas: Desktop React UI → Rust core → approved receivers. Inside the Rust core, label capture, session approval, discovery, signaling, and WebRTC. Show two receiver branches: native Android playback and browser fallback. Put hosted Worker/TURN outside the local path with a dashed line. Caption: “Eko keeps authority and media orchestration in the desktop core while adapting playback to the receiver platform.”]`

---

## 5. The architecture

The desktop is the center of the system, but it is not responsible for doing everything in one layer.

The React desktop UI exposes actions such as starting a stream, displaying the QR code, approving a receiver, stopping a stream, and disconnecting a device. Those actions cross a typed boundary into the Rust core.

The Rust core owns the state that should not be duplicated across user interfaces. It captures system audio, manages the session, validates join requests, exchanges signaling messages, and creates a separate WebRTC sender for each approved receiver.

The Android-facing UI is responsible for scanning, discovery, and showing connection status. Its native receiver handles the media path. The browser client uses browser WebRTC and browser audio APIs when it is acting as the fallback.

This separation matters because a UI can display “connected” before audio is actually flowing. The core needs to understand the difference between a request being accepted, signaling succeeding, ICE finding a path, and media being played.

Each approved receiver has an independent peer connection. That makes it possible to approve, disconnect, or stop sharing for one device without treating every receiver as one inseparable connection. The trade-off is that desktop processing and network usage increase as more receivers are added.

`[Add the current tested receiver count here. Do not describe a scaling limit until you have measured it.]`

---

## 6. Building the audio path

The audio path is a chain of stages:

```text
Desktop output
    ↓
OS loopback capture
    ↓
PCM audio frames
    ↓
Opus encoding
    ↓
WebRTC audio track
    ↓
Receiver decode
    ↓
Native audio output
```

On the Windows path, Eko uses WASAPI loopback capture for system output. The captured audio is prepared as Opus at 48 kHz stereo with 20 ms packets, then placed on the Rust WebRTC sender track. The Android receiver decodes the audio natively and writes it to the device's low-latency audio output path.

The important part is not only that every stage exists. It is that every stage has a clear failure signal.

If no frames are captured, the problem is probably near the operating-system audio source. If frames are captured but encoding or writing stops, the problem has moved further down the pipeline. If the audio pipeline is healthy but ICE cannot find a media path, then changing the capture code will not solve the real problem.

Packet size and buffering also create a balance. Smaller packets can reduce waiting time, but they increase scheduling and transport overhead. Larger buffers can hide jitter, but they make playback feel delayed. A paused Android receiver should stop local playback and clear stale samples, then resume from the live edge instead of playing old audio.

### Excalidraw diagram 04 — The audio pipeline

`[Draw seven boxes from capture to speaker. Under each box, add one useful diagnostic such as “frames received,” “encoded packets,” “ICE state,” or “samples written.” Use green for progressing stages and red only for the actual failure in your chosen incident. Caption: “A live audio system is a chain of independently failing stages.”]`

### Measuring latency

Latency is one of the most important numbers in Eko, but it is also one of the easiest numbers to overstate.

`[Add your repeatable measurement method here: source signal, receiver device, network, number of samples, median, p95, and worst observed value.]`

The final article should never say “Eko has X milliseconds of latency” without explaining how X was measured.

---

## 7. Pairing is not permission

Pairing and authorization are closely related, but they are not the same operation.

QR pairing carries the information needed to start joining a room. LAN discovery helps a nearby receiver find an Eko host. Both paths eventually create a join request that the desktop can approve or deny.

The session therefore has meaningful states:

```text
Unknown
  → Join requested
  → Waiting for approval
  → Approved
  → Negotiating
  → Connected
```

It also has important exits: `Denied`, `Disconnected`, `Stopped`, and `Retry required`.

WebSocket is used for coordination. It carries join requests, approval decisions, SDP messages, ICE candidates, and state events. It does not carry the audio itself. WebRTC is responsible for the media path.

That distinction made the system easier to reason about. A successful WebSocket connection means the peers can exchange setup information. It does not mean that audio can travel between them.

### Excalidraw diagram 05 — Approval state machine

`[Draw Join requested → Waiting for approval. From the desktop decision, branch to Approved and Denied. Continue Approved → Negotiating → Connected. Add Stop stream returning all active states to Stopped. Caption: “Approval is a first-class session state.”]`

### Excalidraw diagram 06 — Pairing and signaling sequence

`[Draw four lanes: Receiver UI, Desktop UI, Rust session, and Signaling server. Show join request, approval, SDP, and ICE messages. Draw a separate lower arrow labelled “encrypted WebRTC audio” and make clear that it does not travel through WebSocket. Caption: “Signaling sets up the path; WebRTC carries the audio.”]`

---

## 8. Why Android has a native receiver

It would have been faster to make every phone open a browser page. That approach is still valuable as a fallback, but Android has requirements that are easier to handle natively.

Playback lifecycle, audio focus, media controls, background behavior, and stale buffered audio all become important once a receiver is expected to feel like a real app. A browser UI can request playback, but it should not be the canonical owner of the Android audio engine.

Eko keeps the boundary clear:

- React shows scan, discovery, approval, connection, and error states.
- The native bridge passes playback commands and status events.
- The native media path receives, decodes, buffers, and plays audio.

This was also a lesson in startup safety. Work that is harmless during desktop development can be dangerous when executed during mobile app startup. In Eko, binding-generation behavior had to be kept out of the mobile runtime path so that startup remained focused on opening the application and establishing only the services that Android actually needed.

`[Replace the previous paragraph with the exact Android failure, the evidence from the device log, and the before/after change.]`

### Excalidraw diagram 07 — Android playback boundary

`[Draw React/Tauri UI above a native bridge and media service, with the Rust receiver, decoder, and Oboe output below. Show pause/resume/stop commands crossing the bridge, while the audio stream bypasses the React UI. Caption: “The UI controls playback, but it is not the playback engine.”]`

Do not claim durable background playback until it has been tested on the target Android versions under normal background limits.

---

## 9. The browser fallback and TURN

The browser client exists mainly for iOS and modern browsers. It lets those receivers participate without installing the Android app, while keeping Android's preferred path native.

The hosted path has two separate responsibilities. Signaling helps the host and browser exchange the information needed for WebRTC negotiation. TURN provides a relay when the peers cannot establish a direct media path.

The preferred sequence is:

1. Try to establish a direct WebRTC path.
2. Gather and evaluate available ICE candidates.
3. Use TURN only when a direct path cannot connect.
4. Continue carrying the audio through encrypted WebRTC media.

This design has a useful trade-off. Direct media generally gives the best local latency and avoids relay bandwidth. TURN makes the system more reliable on networks that block direct connectivity, but it introduces provider metadata, relay bandwidth, and an operational cost.

Short-lived TURN credentials help keep the long-lived service secret away from QR payloads, browser bundles, logs, and screenshots.

### Excalidraw diagram 08 — Direct path versus TURN fallback

`[Draw Desktop and Browser receiver with two paths. Use a solid green arrow for “direct ICE → encrypted WebRTC audio.” Use a dashed amber path for “hosted signaling → short-lived TURN credentials → TURN relay → encrypted WebRTC audio.” Caption: “Direct media is preferred; the relay is a fallback.”]`

`[Link to the repository's privacy policy and hosted signaling implementation here.]`

---

## 10. The debugging lesson that changed how I tested

The most valuable Eko debugging lesson came from a failure that looked like an audio problem.

During development, the receiver was not producing useful audio. My first instinct was to inspect capture. That was reasonable, but incomplete.

I followed the counters through the pipeline:

```text
audioFramesReceived
        ↓
audioFramesEncoded
        ↓
audioSamplesWritten
```

The counters showed that capture was progressing, encoded audio was being produced, and samples were being written. That evidence ruled out the first part of the pipeline.

The more important clue was in ICE. The connection moved through checking and then failed with no usable candidate pair. Signaling had happened, but the peers had not found a network path capable of carrying the WebRTC media.

That changed the investigation completely. Instead of repeatedly changing the audio code, I looked at candidate gathering, network interfaces, firewall behavior, and TURN fallback.

The lesson was simple but important:

> Signaling can succeed while media connectivity fails.

A connected WebSocket does not prove connected audio. Available TURN credentials do not prove that a relay was selected. A successful build does not prove playback. Each claim needs evidence from the stage it describes.

Structured operator diagnostics made this much easier. Useful fields included peer state, ICE state, selected connection path, outbound packets and bytes, latency, jitter, buffer, packet loss, and audio pipeline counters.

The diagnostics intentionally avoided collecting raw audio, SDP bodies, full ICE candidate strings, tokens, or full user-agent strings. Good debugging should make the system more understandable without creating a second privacy problem.

### Excalidraw diagram 09 — Debugging checkpoints

`[Draw the full pipeline with a checkpoint beneath every stage. Put the failure marker at the first stage that actually stopped making progress in your chosen incident. Beside it, write the exact evidence: log line, state transition, or counter. Caption: “The fastest diagnosis came from finding the first stage that stopped progressing.”]`

### What did not count as proof

- A QR code being visible did not prove authorization.
- A join request being received did not prove playback.
- A WebSocket being connected did not prove media connectivity.
- TURN being configured did not prove that TURN was selected.
- An emulator result did not prove real-phone latency.

This changed the way I approach debugging. I now ask not only “what failed?” but also “what is the strongest evidence that each earlier stage worked?”

---

## 11. What I learned

### Real-time systems are chains, not features

“Audio streaming works” is not one fact. Capture, encoding, signaling, ICE, decoding, and playback can all succeed or fail independently. The observability should follow the same chain as the data.

### Authorization deserves its own model

Separating discovery from approval made the product safer and the session state easier to explain. It also prevented a common mistake: treating proximity as permission.

### Native boundaries are product decisions

Choosing native Android playback was not about avoiding the web. It was about giving the platform the ownership it needed for lifecycle and audio behavior while keeping the UI shared where that remained valuable.

### Type safety matters most at boundaries

The Rust-to-TypeScript command and event boundary is where mismatched assumptions become user-visible bugs. Keeping that boundary typed made the system easier to evolve and review.

### Direct networking and hosted fallback can coexist

Local-first and hosted fallback are not contradictory. They solve different problems: one optimizes the normal path, while the other handles networks where direct connectivity is unavailable.

### “Works on my machine” is not a measurement

Desktop tests, emulator tests, build checks, and hosted smoke tests all have value. None of them should silently stand in for real-device playback or latency validation.

`[Add one personal lesson here: what Eko changed about how you design or debug software.]`

---

## 12. What works and what is still unfinished

Eko is in active development, so I want to describe its status honestly.

The current implementation includes:

- Desktop system-audio capture on the tested Windows path.
- Rust Opus encoding and WebRTC sender flow.
- QR pairing and LAN discovery.
- Explicit desktop approval and denial.
- Multiple receiver session structure.
- Native Android receiver work.
- A browser fallback with hosted signaling and TURN support.
- Structured diagnostics for audio and connection stages.

The work still requiring stronger validation includes:

- Repeatable setup-time measurement.
- End-to-end latency measurement on real Windows hardware and a real Android phone.
- Multi-device scaling under realistic Wi-Fi conditions.
- Final capture-backend decisions across supported desktop platforms.
- Background playback behavior under Android limits.

`[Replace the list above with the exact status at publication time. Link each important claim to a demo, test, commit, or screenshot.]`

| Claim | Evidence | Next verification |
| --- | --- | --- |
| Desktop captures system audio | `[test, log, or demo]` | `[next test]` |
| Approved Android device receives audio | `[real-device evidence]` | `[next test]` |
| Direct LAN media works | `[selected ICE path]` | `[next test]` |
| TURN fallback works | `[relay-selected evidence]` | `[next test]` |
| Latency meets the target | `[repeatable measurement]` | `[next test]` |

This table is worth keeping. It makes the article more credible and gives the project a clear path from prototype to production quality.

---

## 13. What I would build next

The next stage is less about adding features and more about making the existing experience measurable and dependable.

1. Add repeatable real-device setup-time and latency measurements.
2. Add clearer development graphs for latency, jitter, buffering, packet loss, state changes, and errors.
3. Expand automated coverage for approval, denial, unblock, disconnect, and stop-stream cleanup.
4. Test multiple receivers under realistic Wi-Fi conditions.
5. Harden release, update, and recovery flows.

`[For each item you keep, add one sentence describing how success will be measured.]`

---

## 14. Closing thoughts

Eko began as a practical attempt to make one desktop audio source useful across several nearby devices. It became a much deeper lesson in real-time systems.

I learned that the hardest problems are often found at the boundaries: between desktop and mobile, discovery and authorization, signaling and media, direct networking and relays, or a passing test and real user-facing proof.

The most valuable habit I developed was to ask which stage had actually made progress. That question helped me avoid changing the wrong part of the system, and it made every failure more useful.

There is still work ahead, especially around real-device measurements and production hardening. That is part of what makes the project exciting. Eko is not only a finished feature; it is a record of learning how to build software that interacts with hardware, networks, and people in the real world.

`[Add your final personal sentence here. Keep it sincere and specific.]`

### Links

- Source code: `[GitHub repository]`
- Demo video: `[demo link]`
- Architecture notes: `[architecture link]`
- Privacy policy: `[privacy-policy link]`
- Relevant debugging issue: `[issue or pull-request link]`

---

## 15. Publishing checklist

### Before publishing

- [ ] Replace every `[personal prompt]` with your own experience.
- [ ] Replace every `[measurement]` with a repeatable result, including hardware and network details.
- [ ] Draw and export the nine Excalidraw diagrams in article order.
- [ ] Add one strong hero image or project screenshot.
- [ ] Link to the repository, demo, privacy policy, and relevant implementation.
- [ ] Remove claims that are no longer true.
- [ ] Confirm that screenshots contain no secrets, pairing tokens, private IP addresses, or sensitive logs.
- [ ] Distinguish emulator validation from real-device validation.
- [ ] Distinguish configured TURN fallback from a relay path observed in ICE statistics.

### Medium presentation

- Use this title or a similarly direct one.
- Keep the subtitle focused on the engineering story.
- Keep paragraphs short and generous with whitespace.
- Put the first architecture diagram early, after explaining the problem.
- Put the debugging diagram near the strongest incident in the article.
- Add captions beneath every diagram.
- Use code snippets only when they explain a decision; link to the full source.
- Add five focused tags such as `Rust`, `WebRTC`, `Android Development`, `Tauri`, and `Real-Time Systems`.

`[Recommended final length: approximately 1,800–2,800 words. If the debugging story becomes much longer, publish it as a second article rather than weakening the first one.]`
