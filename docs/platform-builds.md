# Platform artifact builds

Use `pnpm ops platforms --help` to discover the build-only workflow. It builds the current committed tree for Windows, Linux, macOS beta, Android and hosted web without changing the app version or publishing a GitHub release.

```sh
pnpm --silent ops platforms start --ref build/latency-20261016 --json
pnpm --silent ops platforms status --run RUN_ID --json
```

`start` requires a clean worktree, Git, an authenticated GitHub CLI and permission to push a new branch to the configured origin. It fetches `origin/main`, creates an isolated snapshot commit with exactly `HEAD`'s tree, and pushes that snapshot to the explicit `build/` reference. It does not move the local branch or publish its older local history. GitHub runs `.github/workflows/build.yml` when that reference is created.

Reusing the same reference with an identical tree locates the existing run without another push. A different tree requires a new reference; there is no force push. If GitHub has not registered the run yet, the result says `awaiting-workflow`, and repeating the same command is safe.

For a targeted retry, use `build/android/NAME`, `build/windows/NAME`, `build/linux/NAME`, `build/macos/NAME` or `build/web/NAME`. Other `build/` references select all targets. This lets a failed platform retry without discarding successful builds or recompiling unrelated platforms.

`status` returns the selected run's jobs and up to 100 artifacts, including their expiry flags. A running job is separate from a completed package; a completed failed run returns a failed result. Build artifacts are retained for 14 days.

| Target | Artifact |
| --- | --- |
| Windows x64 | Release-mode executable and NSIS installer, without updater signing |
| Linux x64 | Release-mode AppImage, without updater signing |
| macOS beta | Unsigned DMG on the hosted macOS runner; build and capture support are separate |
| Android arm64 | Debug-signed validation APK and AAB |
| Hosted web | Built landing and browser receiver files |

These validation artifacts use no production signing secrets. Android debug packages are for testing and do not replace the production-signed application. The existing manual `Release` workflow remains the entry point for signed public releases and version changes. macOS is an experimental build target. The macOS beta now uses the approved ScreenCaptureKit 11 dependency for system audio on macOS 13+. A successful build does not establish physical capture, permission handling or output-device behavior; see `docs/macos-beta.md`. iOS is not configured.

## Build caches

Frontend installs use the existing frozen pnpm lockfile and setup-node pnpm store cache. Rust caches use distinct desktop-platform and Android-arm64 keys, preserving existing Cargo targets. Android Gradle state is saved on build branches as well as the default branch; its default read-only behavior on non-default branches previously prevented that. No cache is deleted and no global cache config is installed. GitHub cache visibility is branch-scoped: a fresh isolated build branch can restore default-branch entries but cannot promise hits from an unrelated prior build branch. Reruns on the same reference can reuse its caches.

## Verified build on 16 October 2026

The artifact workflow built the latency changes without publishing a release. Desktop/web source commit: `a07d3d6`; isolated build snapshot: `67ec06a`. The Android retry includes only the subsequent SDK setup/operator fix (`f751565`, snapshot `7e7719d`). Production audio code is identical between these snapshots.

| Target | Job duration | Download |
| --- | --- | --- |
| Windows x64 | 17 min 17 sec | [Executable and NSIS installer](https://github.com/Noelithub77/eko/actions/runs/38895971974/artifacts/12044149277) |
| Linux x64 | 8 min 11 sec | [AppImage](https://github.com/Noelithub77/eko/actions/runs/38895971974/artifacts/12044520527) |
| Hosted web | 37 sec | [Landing and receiver files](https://github.com/Noelithub77/eko/actions/runs/38895971974/artifacts/12044226085) |
| Android arm64 | 10 min 17 sec | [Debug APK and AAB](https://github.com/Noelithub77/eko/actions/runs/38896849858/artifacts/12045415042) |

The first run's overall status is failed because Android requested Google's retired `tools` SDK package. Explicitly selecting `platform-tools` fixed setup; the Android-only retry passed. The Windows, Linux and web jobs in the first run passed. All four artifacts were downloaded and their expected files inspected locally. Android ZIP integrity checks also passed. APK/AAB production signing, installation and physical playback were not verified by these builds. GitHub artifact access requires repository access, and artifacts expire after 14 days.

## Signed public release

After version synchronization and a clean committed tree, create the exact snapshot with the platform operator. The macOS-only reference avoids rebuilding unsigned Windows/Linux/Android validation packages when the signed release will build those targets:

```sh
pnpm --silent ops platforms start --ref build/macos/background-v050 --json
gh workflow run release.yml --ref build/macos/background-v050 -f windows_exe=true -f linux_appimage=true -f android_apk=true -f android_aab=true -f bump_minor=false
```

The Release workflow creates a draft, builds signed desktop updater packages and production-signed Android packages, validates all selected assets, writes one combined updater manifest, then publishes. Failed selected targets leave the draft unpublished. The separate macOS job produces an unsigned beta DMG and does not change stable updater targets.
