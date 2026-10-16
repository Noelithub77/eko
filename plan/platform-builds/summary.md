# Windows verification and all-platform builds

The user approved Windows VM build prerequisites and a virtual audio endpoint, then requested builds for all supported platforms.

**[chosen]** Reuse the default Omarchy VM, verify official installer hashes/signatures, install the existing CI tool versions where applicable, and measure production Windows capture before changing its defaults. Keep the user-selected balanced latency policy.

Use a build-only GitHub workflow for Windows, Linux, Android APK/AAB and hosted web. The existing release workflow publishes assets and can bump versions, so it is not the appropriate build-only entry point. Validation artifacts use no production signing secrets and do not change releases. Android validation packages use debug signing.

Build the exact committed tree on an isolated remote build reference. Preserve the local branch and unrelated dotfiles work. Run appropriate source checks before dispatch, record the remote revision and run URL, and distinguish started jobs from finished artifacts.

Windows VM setup is authorized. No further approval is needed for the declared Rust/MSVC, Node/pnpm, Git and virtual audio setup.

The existing VM now has Node 22.23.3, pnpm 11.5.0, MinGit 2.56.0.2, an MSVC Rust toolchain and Microsoft C++ Build Tools. Setup completed in 338.9 seconds with official hashes and Microsoft signature verification. Virtual HDA sound and a Windows speaker endpoint were detected without host playback. Native Windows compilation and three production WASAPI/Opus probes passed in this VM.

The Windows source now drains all pending WASAPI packets per event and retains the original QPC sample timestamp, allowing the existing stale-frame guard to reject old device backlog. Sender queue timing uses a separate enqueue timestamp. The new real capture recovery probe observed four stale packets after a 500 ms Linux consumer stall and returned to a fresh packet in 0.63 ms. Windows measurements remain separate until its probe runs.

Windows, Linux and hosted web jobs completed successfully in run `38895971974`. Its Android SDK setup failed on a retired package; the explicit platform-tools fix passed in targeted retry `38896849858`. All four artifacts were downloaded and expected files inspected. No public release or production signing was performed.

Native Windows direct and forced UDP TURN workflows passed approval, playback, pause/resume and profiling. Partial receiver means were 50.25/93.31 ms, with TURN p95 142.73 ms. Capture age remained unavailable; physical output was not measured. The aggregate report preserves all setup stages without session identifiers or raw traces.
