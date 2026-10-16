# Files

- `.github/workflows/build.yml`: isolated artifact builds for supported platforms, separate from release publication.
- `scripts/` and `ops.ts`: tracked operator for starting and inspecting this build workflow when needed.
- `docs/windows-vm-testing.md`: verified setup, measurements and limits.
- `plan/latency/`: updated results and tuning rationale.

The global VM setup and audio operations live in the existing dotfiles skill. Guest installers, Cargo/Gradle caches and temporary VM test copies remain outside the source tree.
