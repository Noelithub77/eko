// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(all(target_os = "linux", not(mobile)))]
    eko_lib::linux_wayland::apply();
    eko_lib::run()
}
