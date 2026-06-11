# Step 07: Linux Wayland Runtime

## Goal

Stop the desktop Tauri window from being "very buggy" on Ubuntu 26.04 / GNOME
Wayland. Keep the web client and Android paths untouched.

## Why

Tauri 2 on Linux uses WebKitGTK. On Ubuntu + Wayland, the webview shows a
known class of bugs: blurry / DPI-mismatched rendering, broken mouse-wheel
scrolling, missing title-bar buttons, white screens, and backdrop-filter
glitches. Most of these are upstream WebKitGTK / Tao / Wry issues, not Eko
bugs.

Tracking issues:

- `tauri-apps/tauri#14590` – DPI scaling / blurry UI on Ubuntu Wayland
- `tauri-apps/tauri#14427` – broken mouse-wheel scroll on Wayland
- `tauri-apps/tauri#15433` – white screen on dev start (Pop!_OS COSMIC Wayland)
- `tauri-apps/tauri#14251` / `#15460` – title-bar buttons dead / missing on
  KDE Plasma Wayland
- `tauri-apps/tauri#14811` – `backdrop-filter` and visual glitches on
  Wayland + Nvidia

## Build

- `rust/src/linux_wayland.rs` exposes `pub fn apply()` that sets the env
  vars and prints the one-line log.
- `rust/src/main.rs` calls `eko_lib::linux_wayland::apply()` before
  `eko_lib::run()`. The call is gated by
  `#[cfg(all(target_os = "linux", not(mobile)))]`, so the function is never
  referenced on Windows, macOS, or Android builds.
- It sets:
  - `GDK_BACKEND=wayland` – force Wayland instead of XWayland.
  - `MOZ_ENABLE_WAYLAND=1` – defensive, helps in mixed sessions.
  - `WEBKIT_DISABLE_DMABUF_RENDERER=1` – fixes blurry / scaled UI.
  - `WEBKIT_DISABLE_COMPOSITING_MODE=1` – fixes blurry / scaled UI.
- None of these are set if the user has already exported
  `GDK_BACKEND` / `MOZ_ENABLE_WAYLAND`, so they can be overridden.
- A one-line log is written to stderr so it is obvious the workarounds are
  active when debugging.
- `rust/tauri.conf.json` `app.windows[0]` now sets `decorations`,
  `resizable`, `fullscreen`, `visible`, `center` explicitly so the window
  behaves the same on every Linux DE.

## Caveats

- `WEBKIT_DISABLE_COMPOSITING_MODE=1` disables hardware compositing. UI
  rendering uses the CPU. For a control app like Eko this is fine. Do not
  enable it for an app that needs high-FPS video inside the webview.
- `GDK_BACKEND=wayland` will refuse to start on a session that is X11-only.
  If a user needs X11 they can set `GDK_BACKEND=x11` in their shell before
  launching the app and the workaround code will respect it.
- Mouse-wheel scroll on Wayland (`#14427`) is an upstream WebKitGTK bug and
  is not fixed by these env vars. Users on a touchpad / two-finger scroll
  may still see it. Arrow keys and the scrollbar work.

## Done When

- `cargo check` passes.
- `npm run test:types` and `npm run lint` pass.
- Running `npm run dev:desktop` on Ubuntu 26.04 Wayland shows a crisp,
  centered window with working decorations, no blur, and the dev shell
  prints `[eko] Linux Wayland: forced GDK_BACKEND=wayland, ...` once.
