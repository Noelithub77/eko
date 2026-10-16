# Local desktop deployment

On Linux, build and install the current checkout as an optimized desktop app:

```sh
pnpm ops local:deploy --json
```

This uses Tauri's release build with `--no-bundle`, including the desktop frontend and embedded browser receiver. It reuses `rust/target` or your configured `CARGO_TARGET_DIR`, uses sccache when available, and defaults to two Cargo workers. Install the normal [Tauri development prerequisites](../.github/SETUP.md) first.

The command installs:

- `~/.local/bin/eko`, pointing to a versioned binary.
- `~/.local/share/eko/builds/`, retaining previous binaries.
- `~/.local/share/applications/eko.desktop`, including the app icon.

`XDG_DATA_HOME` overrides the data directory. Put `~/.local/bin` on your shell's `PATH` to run `eko` from a terminal. App settings and session data are preserved. Running windows keep using their current binary; close and reopen eko when ready to use the new build.

The installer verifies executable permissions, the binary checksum, and the command link without launching the app. It replaces an existing `eko.desktop` launcher, including an AppImage launcher, and saves its previous contents beside the new binary as `previous.desktop`. It refreshes the desktop entry database when `update-desktop-database` is installed. Unrelated commands and launchers are preserved. The result reports the Git revision, whether the checkout had uncommitted edits, install paths, checksum, and elapsed time. This is a local installation; it publishes no release.

Preview the command and paths without building or installing:

```sh
pnpm ops local:deploy --dry-run --json
pnpm ops local:deploy --help
```

Local deployment currently supports Linux, matching Leet's local installation flow. Windows users can use the release installer; native Windows builds remain available through the [platform build operator](platform-builds.md).

## T3 action

`t3.json` declares **Local deploy**, running `pnpm ops local:deploy --json`.

To add it to T3's saved Actions menu, select eko, open **Settings → Project → Actions → Import scripts**, and import **Local deploy** once. Check for an existing action with the same command before importing.
