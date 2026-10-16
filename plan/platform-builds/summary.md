# Windows verification and all-platform builds

The user approved Windows VM build prerequisites and a virtual audio endpoint, then requested builds for all supported platforms.

**[chosen]** Reuse the default Omarchy VM, verify official installer hashes/signatures, install the existing CI tool versions where applicable, and measure production Windows capture before changing its defaults. Keep the user-selected balanced latency policy.

Use a build-only GitHub workflow for Windows, Linux, Android APK/AAB and hosted web. The existing release workflow publishes assets and can bump versions, so it is not the appropriate build-only entry point. Validation artifacts use no production signing secrets and do not change releases. Android validation packages use debug signing.

Build the exact committed tree on an isolated remote build reference. Preserve the local branch and unrelated dotfiles work. Run appropriate source checks before dispatch, record the remote revision and run URL, and distinguish started jobs from finished artifacts.

Windows VM setup is authorized. No further approval is needed for the declared Rust/MSVC, Node/pnpm, Git and virtual audio setup.

The existing VM now has Node 22.23.3, pnpm 11.5.0, MinGit 2.56.0.2, an MSVC Rust toolchain and Microsoft C++ Build Tools. Setup completed in 338.9 seconds with official hashes and Microsoft signature verification. Virtual HDA sound and a Windows speaker endpoint were detected without host playback. Native Windows compilation is being verified in this VM.

The Windows source now drains all pending WASAPI packets per event and retains the original QPC sample timestamp, allowing the existing stale-frame guard to reject old device backlog. Sender queue timing uses a separate enqueue timestamp. The new real capture recovery probe observed four stale packets after a 500 ms Linux consumer stall and returned to a fresh packet in 0.63 ms. Windows measurements remain separate until its probe runs.
