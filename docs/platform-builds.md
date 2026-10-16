# Platform artifact builds

Use `pnpm ops platforms --help` to discover the build-only workflow. It builds the current committed tree for Windows, Linux, Android and hosted web without changing the app version or publishing a GitHub release.

```sh
pnpm --silent ops platforms start --ref build/latency-20261016 --json
pnpm --silent ops platforms status --run RUN_ID --json
```

`start` requires a clean worktree, Git, an authenticated GitHub CLI and permission to push a new branch to the configured origin. It fetches `origin/main`, creates an isolated snapshot commit with exactly `HEAD`'s tree, and pushes that snapshot to the explicit `build/` reference. It does not move the local branch or publish its older local history. GitHub runs `.github/workflows/build.yml` when that reference is created.

Reusing the same reference with an identical tree locates the existing run without another push. A different tree requires a new reference; there is no force push. If GitHub has not registered the run yet, the result says `awaiting-workflow`, and repeating the same command is safe.

For a targeted retry, use `build/android/NAME`, `build/windows/NAME`, `build/linux/NAME` or `build/web/NAME`. Other `build/` references select all targets. This lets a failed platform retry without discarding successful builds or recompiling unrelated platforms.

`status` returns the selected run's jobs and up to 100 artifacts, including their expiry flags. A running job is separate from a completed package; a completed failed run returns a failed result. Build artifacts are retained for 14 days.

| Target | Artifact |
| --- | --- |
| Windows x64 | Release-mode executable and NSIS installer, without updater signing |
| Linux x64 | Release-mode AppImage, without updater signing |
| Android arm64 | Debug-signed validation APK and AAB |
| Hosted web | Built landing and browser receiver files |

These validation artifacts use no production signing secrets. Android debug packages are for testing and do not replace the production-signed application. The existing manual `Release` workflow remains the entry point for signed public releases and version changes. macOS and iOS are not configured project targets.
