# Windows VM verification

The default Omarchy Windows VM was prepared and tested after Linux optimization, using the global [omarchy-windows-vm skill](/home/noel/dotfiles/shared/agents/.agents/skills/omarchy-windows-vm/SKILL.md). The user explicitly approved guest tools and virtual audio on 16 October 2026.

```sh
cd ~/dotfiles
./ops windows-vm --help
./ops windows-vm status --json
./ops windows-vm start --json
./ops windows-vm doctor --json
./ops windows-vm guest --file /absolute/check.ps1 --timeout-seconds 60 --json
./ops windows-vm stop --json
```

The operator reuses the existing default VM disk and cached image, opens no visible RDP window and forwards no microphone, clipboard or sound to the host. It does not use the separate physical-SSD/libvirt Windows VM. The tracked global skill includes verified installer setup, virtual audio configuration, bounded guest output and console serialization.

## Environment verified on 16 October 2026

- Windows build 26200, PowerShell 5.1.26100.7920.
- Node 22.23.3, pnpm 11.5.0, Git 2.56.0.windows.2, Rust 1.99.1 MSVC and Microsoft C++ Build Tools 2022; CMake 3.31.6-msvc6. Load `C:\eko-tools\env.ps1`; the compiler is discovered through Visual Studio even though `cl` is absent from the ordinary PATH.
- Official installer hashes and Microsoft's signature were verified. Setup took 338.9 seconds. Tool installation belongs to the guest, not the host.
- Virtual High Definition Audio Device and its speaker endpoint reported healthy. The documented `AUDIO: "Y"` setting provides virtual audio without automatic host playback.
- The initial cached-source Windows native test compilation passed. Tauri's Common Controls 6 manifest must also be embedded into Cargo's library test executable; the native operator now does this through the Windows SDK `mt.exe`. Without it, Windows fails on `TaskDialogIndirect` before Rust starts.
- Guest command failure and concurrent-console rejection were verified. Default-VM boot and console turnaround are setup timings, not audio delay.

## Actual WASAPI and Opus probes

The baseline used commit `2688aab`; optimized production source is `8a19517` with the test runner from `d034387`. Same virtual speaker, in-memory 48 kHz stereo tone and 20 ms packet size. Raw audio and session profiles were not written to disk. These three-second pipeline probes have no connected peer.

| Stage | Baseline average ms | Optimized trial 1 | Trial 2 | Trial 3 |
| --- | --- | --- | --- | --- |
| Sender queue | 0.143 | 0.179 | 0.135 | 0.134 |
| Opus encoding | 0.931 | 0.767 | 0.854 | 0.852 |
| Encoded frames | 149 | 136 | 149 | 149 |
| Write errors | 0 | 0 | 0 | 0 |

The main change drains every pending WASAPI packet before waiting on the next event. Original sample timestamps feed the existing stale-frame guard; sender queue timing has its own enqueue timestamp. Upstream's fallible slice read replaces the deque helper that contains an unchecked release.

The VM driver supplied usable QPC sample timestamps for only two frames in trial 1 (average 10.874 ms, maximum 15.405 ms) and none in the repeats. Baseline capture age was unavailable. Do not present missing timestamps as zero latency or claim a reliable before/after capture-age improvement from this VM.

| Deliberate consumer stall | Stale queue packets observed | Maximum observed age ms | Time to a fresh queue packet ms |
| --- | --- | --- | --- |
| 500 ms | 5 | 517.519 | 13.516 |
| 1000 ms | 5 | 1000.240 | 18.536 |

Recovery probes use the same real capture source and bounded three-packet sender queue. When the virtual driver timestamp is unavailable, age falls back to capture-read time; these results establish bounded queue recovery, not independently verified device sample age. Opus, network delivery and physical playback are excluded from the recovery probe.

Native TCP/TLS TURN support remains a pinned ICE-library limitation documented in [latency.md](latency.md). Physical Windows speakers, Bluetooth, real phone radios, Android background limits and movie lip sync require separate device acceptance. A VM build or low queue duration cannot prove those.

## Native direct and UDP TURN receiver workflows

The production Windows WASAPI/Opus/WebRTC sender passed the real hosted room/approval workflow with the frozen browser receiver and a 40 ms requested buffer. Both routes verified approval before media, playback, pause/resume and profiler delivery. TURN selected relay candidates at both endpoints. There were no sender write errors, stale-frame drops or reported packet loss.

| Measured stage | Direct | UDP TURN |
| --- | --- | --- |
| Partial receiver delay average / p95 ms | 50.250 / 50.500 | 93.305 / 142.732 |
| Receiver buffer average ms | 49.750 | 57.722 |
| Selected-path round trip average ms | 1.000 | 71.167 |
| Sender queue average ms | 0.210 | 0.200 |
| Opus average ms | 0.959 | 1.310 |
| Connected track write average ms | 0.385 | 0.530 |
| Receiver packets received / lost | 709 / 0 | 707 / 0 |
| Concealed audio samples | 0 | 3052 |

Each route had six interval profile observations over 12 measured seconds plus warm-up. Capture timestamps were unavailable during these connected trials. The partial estimate excludes capture, decoding and physical output; no coded markers were used by the native sender. These short trials establish working paths, not long-term latency guarantees.

[Interactive aggregate report](reports/platform-verification-2026-10-16.html) includes every measured setup stage and native pipeline timing. Native test preparation took 68.6 seconds direct and 33.7 seconds TURN, including Cargo/manifest startup. After preparation, offer to first playback took 1.78 seconds direct and 2.67 seconds TURN. These one-time setup timings are separate from ongoing audio delay. Raw session profiles, audio and signaling bodies were not persisted.
