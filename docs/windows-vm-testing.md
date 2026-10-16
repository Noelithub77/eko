# Windows VM test status

Linux optimization and native Rustls verification were completed first, as requested. The default Omarchy Windows VM is available for the Windows phase through the global `omarchy-windows-vm` skill in `~/dotfiles/shared/agents/.agents/skills/`.

```sh
cd ~/dotfiles
./ops windows-vm --help
./ops windows-vm status --json
./ops windows-vm start --json
./ops windows-vm doctor --json
./ops windows-vm guest --file /absolute/check.ps1 --timeout-seconds 60 --json
./ops windows-vm stop --json
```

The operator reuses the existing default VM disk and cached image, starts no visible RDP window and forwards no microphone, clipboard or sound to the host. Guest scripts run through the VM console and its existing shared folder. It does not use the separate physical-SSD/libvirt Windows VM.

## Observed on 16 October 2026

| Check | Result |
| --- | --- |
| Headless boot | Packaged readiness signal reached |
| Guest execution | PowerShell diagnostics completed; Windows build 26200, PowerShell 5.1 |
| Console command turnaround | 15.08 seconds initially; 7.68 seconds for the repeat diagnostic, including input and script startup; this is unrelated to audio latency |
| Failure propagation | Guest exit code 7 produced `success: false` and host exit status 1 |
| Concurrent guest commands | Rejected before console input |
| Rust/Cargo, Node/pnpm, Git, C++ | Unavailable on PATH and at the checked default install locations |
| Sound controllers and audio endpoints | None reported by Windows diagnostics |
| Native Windows eko build/capture timing | Not measured |

## Setup decision pending

The user has been asked to approve preparing this VM with build prerequisites and a virtual audio endpoint. No guest packages were installed. The intended prerequisites follow [Tauri's Windows setup](https://v2.tauri.app/start/prerequisites/#windows): Microsoft C++ Build Tools with the desktop C++ workload, the MSVC Rust toolchain, and Node for this React frontend. Check the existing WebView2 runtime before installing another copy. Use the repository's package manager and lockfiles.

[Dockurr's audio option](https://github.com/dockur/windows#how-do-i-enable-audio) can provide virtual audio without forwarding sound to the host. Enabling it and verifying a render/loopback endpoint is separate from testing real Windows speakers or Bluetooth. A VM comparison must keep packet size, capture source, receiver and route constant before changing the WASAPI minimum-period setup.

After approved setup, run the production native pipeline and direct/UDP TURN workflows on Windows, then compare capture, queue, encoding, track-write, receiver buffering, loss and concealment. Native TCP/TLS TURN support remains a separate pinned ICE-library limitation documented in `latency.md`.
