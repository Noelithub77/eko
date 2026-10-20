# Platform artifact builds

Use `pnpm ops platforms --help` to discover the build-only workflow. It builds the current committed tree for Windows, Linux, macOS beta, Android and hosted web without changing the app version or publishing a GitHub release.

```sh
pnpm --silent ops platforms start --ref build/latency-20261016 --json
pnpm --silent ops platforms status --run RUN_ID --json
```

`start` requires a clean worktree, Git, an authenticated GitHub CLI and permission to push a new branch to the configured origin. It fetches `origin/main`, creates an isolated snapshot commit with exactly `HEAD`'s tree, and pushes that snapshot to the explicit `build/` reference. It does not move the local branch or publish its older local history. GitHub runs `.github/workflows/build.yml` when that reference is created.

Reusing an existing reference with an identical tree locates its run without another push. A different tree requires a new reference; there is no force push. If GitHub has not registered the run yet, the result says `awaiting-workflow`, and repeating the same command is safe. After automatic cleanup removes the reference, use `status --run RUN_ID` to inspect the completed run. Starting that reference again creates a new snapshot and build.

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

## Snapshot branch cleanup

Once `.github/workflows/cleanup-build-branches.yml` is on the default branch, successful `Platform builds` or `Release` runs trigger cleanup of their `build/` branch. Cleanup executes code from the default branch, reads event data from GitHub's event file, and requires the triggering repository and current branch SHA to match. It never checks out build-branch code or downloads build artifacts.

Cleanup preserves protected refs, moved refs, and refs with active runs of **any** workflow, including queued, requested, waiting and pending runs at older SHAs. Automatic cleanup also keeps refs with failed or cancelled completed runs at the current SHA so failures remain available for diagnosis and retry. Failed triggers do not run cleanup. A sibling successful workflow can clean up after the last active run finishes; a final failed run leaves the branch for manual cleanup.

Manual cleanup can remove a named idle branch even when its terminal builds failed:

```sh
pnpm --silent ops platforms cleanup --ref build/latency-20261016 --dry-run --json
pnpm --silent ops platforms cleanup --ref build/latency-20261016 --json
```

The command uses the configured GitHub origin and authenticated `gh` CLI; deletion also needs Git push credentials and branch deletion permission. It reports the repository, branch, observed SHA, workflow/branch evidence and a structured state. `eligible` is a dry-run preview; `deleted` requires an absent-ref readback; `missing` is idempotent success. Active, protected or moved refs return nonzero for manual cleanup. API, pagination and readback errors fail closed. Automatic guarded skips are successful no-ops.

All branch runs are paged in batches of 100. History reaching GitHub's 1,000-result filtered-search cap is refused rather than silently truncated. Branch and workflow checks are repeated before deletion, and an exact-SHA Git lease rejects a concurrent branch move. GitHub offers no transaction combining workflow activity checks with ref deletion, so a workflow dispatched after the final check is still a race; avoid dispatching new work while cleanup is running.

Cleanup deletes only `refs/heads/build/NAME`. Tags, releases, artifacts and cache entries are not deleted or changed. GitHub's normal retention and branch-scoped cache visibility still apply. Run `pnpm test:platforms` for mocked safety and readback regressions.

The API/security boundaries follow GitHub's [workflow-run event guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run), [workflow-run pagination limits](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository), and [ref API](https://docs.github.com/en/rest/git/refs#delete-a-reference). The ref API has no expected-SHA delete parameter, so cleanup uses Git's [explicit expected-value lease](https://git-scm.com/docs/git-push#Documentation/git-push.txt---force-with-leaseltrefnamegtltexpectgt).

## Verified build on 16 October 2026

The artifact workflow built the latency changes without publishing a release. Desktop/web source commit: `a07d3d6`; isolated build snapshot: `67ec06a`. The Android retry includes only the subsequent SDK setup/operator fix (`f751565`, snapshot `7e7719d`). Production audio code is identical between these snapshots.

| Target | Job duration | Download |
| --- | --- | --- |
| Windows x64 | 17 min 17 sec | [Executable and NSIS installer](https://github.com/Noelithub77/eko/actions/runs/38895971974/artifacts/12044149277) |
| Linux x64 | 8 min 11 sec | [AppImage](https://github.com/Noelithub77/eko/actions/runs/38895971974/artifacts/12044520527) |
| Hosted web | 37 sec | [Landing and receiver files](https://github.com/Noelithub77/eko/actions/runs/38895971974/artifacts/12044226085) |
| Android arm64 | 10 min 17 sec | [Debug APK and AAB](https://github.com/Noelithub77/eko/actions/runs/38896849858/artifacts/12045415042) |

The first run's overall status is failed because Android requested Google's retired `tools` SDK package. Explicitly selecting `platform-tools` fixed setup; the Android-only retry passed. The Windows, Linux and web jobs in the first run passed. All four artifacts were downloaded and their expected files inspected locally. Android ZIP integrity checks also passed. APK/AAB production signing, installation and physical playback were not verified by these builds. GitHub artifact access requires repository access, and artifacts expire after 14 days.

## Public release

After version synchronization and a clean committed tree, dispatch the manual Release workflow from the intended committed reference. For example, after the intended source is on `main`:

```sh
gh workflow run release.yml --ref main -f windows_exe=true -f linux_appimage=true -f macos_dmg=true -f android_apk=true -f android_aab=true -f bump_minor=false
```

The Release workflow creates a draft, builds signed Windows/Linux updater packages, production-signed Android packages and the optional unsigned Apple Silicon macOS beta DMG, then validates all selected assets before publishing. `macos_dmg` defaults to false, like the other platform checkboxes. It can be selected alone or with other targets. The macOS job explicitly targets `aarch64-apple-darwin`; see `docs/macos-beta.md` for the output path and physical test limits.

Finalization uploads one combined Windows/Linux updater manifest when either is selected. macOS requires a nonempty DMG but no signature, adds no updater target and receives a beta download link in the existing release notes. The overall release remains a normal release. A failed selected build or missing/empty selected asset prevents publication; failed builds with no assets use the existing empty-release cleanup. Build-only platform artifacts remain separate from public release assets.
