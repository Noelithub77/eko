use std::env;

pub fn apply() {
    if env::var_os("GDK_BACKEND").is_none() {
        env::set_var("GDK_BACKEND", "wayland");
    }
    if env::var_os("MOZ_ENABLE_WAYLAND").is_none() {
        env::set_var("MOZ_ENABLE_WAYLAND", "1");
    }
    env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    eprintln!(
        "[eko] Linux Wayland: forced GDK_BACKEND=wayland, \
         WEBKIT_DISABLE_DMABUF_RENDERER=1, \
         WEBKIT_DISABLE_COMPOSITING_MODE=1"
    );
}
