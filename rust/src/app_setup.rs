use tauri_specta::{collect_commands, Builder, ErrorHandlingMode};

use crate::domain::{
    IceCandidateMessage, NativeReceiverEvent, SessionDescriptionMessage, SignalClientMessage,
    SignalServerMessage, StreamProfilerSample,
};
use crate::*;

pub(super) fn install_panic_logger() {
    std::panic::set_hook(Box::new(|panic_info| {
        let location = panic_info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        let message = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| (*message).to_string())
            .or_else(|| {
                panic_info
                    .payload()
                    .downcast_ref::<String>()
                    .map(ToString::to_string)
            })
            .unwrap_or_else(|| "unknown panic".to_string());

        log::error!("Unexpected panic at {location}: {message}");
        eprintln!("Unexpected panic at {location}: {message}");
    }));
}

pub(super) fn command_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .error_handling(ErrorHandlingMode::Throw)
        .typ::<IceCandidateMessage>()
        .typ::<SessionDescriptionMessage>()
        .typ::<SignalClientMessage>()
        .typ::<SignalServerMessage>()
        .typ::<NativeReceiverEvent>()
        .typ::<StreamProfilerSample>()
        .typ::<media::MediaState>()
        .commands(collect_commands![
            greet,
            start_stream,
            stop_stream,
            get_room_session,
            set_lan_discovery,
            submit_join_request,
            add_dev_join_request,
            allow_device,
            deny_device,
            unblock_device,
            disconnect_device,
            clear_session_events,
            get_core_proof_status,
            get_audio_capture_status,
            find_nearby_hosts,
            start_native_receiver,
            stop_native_receiver,
            start_android_media_session,
            stop_android_media_session,
            media_play,
            media_pause,
            media_toggle,
            media_next,
            media_previous,
            media_get_state
        ])
}

#[cfg(any(test, all(debug_assertions, not(mobile))))]
pub(super) fn export_bindings(builder: &Builder<tauri::Wry>) {
    use specta_typescript::Typescript;

    builder
        .export(
            Typescript::default(),
            "../frontend/shared/bindings/tauri.ts",
        )
        .expect("failed to export Tauri bindings");
}

#[cfg(test)]
mod tests {
    use super::{command_builder, export_bindings};

    #[test]
    fn export_typescript_bindings() {
        let builder = command_builder();
        export_bindings(&builder);
    }
}
