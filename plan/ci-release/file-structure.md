# CI Release File Structure

```text
eko/
  .github/
    workflows/
      release.yml
  frontend/
    desktop/
      features/
        updates/
          update-check.ts
          UpdatePrompt.tsx
  scripts/
    sync-version.mjs
  rust/
    tauri.conf.json
    Cargo.toml
    src/
      lib.rs
```

- `.github/workflows/release.yml` builds selected public release targets, including the optional unsigned Apple Silicon macOS beta DMG.
- `scripts/finalize-release.mjs` verifies selected assets, creates the Windows/Linux updater manifest and preserves release notes while labeling the macOS beta download before publication.
- `tests/release-manifest.test.mjs` covers missing/empty macOS packages, macOS-only and mixed releases, platform signatures, note retries and failure/publication order.
- `rust/src/audio/macos_capture.rs` and `macos_pcm.rs` implement the approved beta capture path.
- `rust/Info.plist` and `docs/macos-beta.md` describe capture permission and test limits.
- `scripts/platform-cleanup.ts` owns manual/automatic branch cleanup guards, GitHub evidence and leased deletion/readback.
- `scripts/cleanup-build-workflow.ts` reads the GitHub event file for the default-branch `.github/workflows/cleanup-build-branches.yml` listener.
- `tests/platforms/` type-checks and tests cleanup with mocked Git/GitHub commands; `docs/platform-builds.md` documents operation and limits.
