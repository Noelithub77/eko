use tauri::{plugin::TauriPlugin, Manager, Runtime};

#[cfg(mobile)]
use tauri::plugin::PluginHandle;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.codialo.eko.media";

pub struct EkoMedia<R: Runtime> {
    #[cfg(mobile)]
    handle: PluginHandle<R>,
    #[cfg(not(mobile))]
    _marker: std::marker::PhantomData<fn() -> R>,
}

impl<R: Runtime> EkoMedia<R> {
    #[cfg(target_os = "android")]
    pub fn start_session(&self) -> Result<(), String> {
        self.handle
            .run_mobile_plugin::<()>("startSession", serde_json::json!({}))
            .map_err(|error| error.to_string())
    }

    #[cfg(not(target_os = "android"))]
    pub fn start_session(&self) -> Result<(), String> {
        Ok(())
    }

    #[cfg(target_os = "android")]
    pub fn stop_session(&self) -> Result<(), String> {
        self.handle
            .run_mobile_plugin::<()>("stopSession", serde_json::json!({}))
            .map_err(|error| error.to_string())
    }

    #[cfg(not(target_os = "android"))]
    pub fn stop_session(&self) -> Result<(), String> {
        Ok(())
    }
}

pub fn start_session<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    app.state::<EkoMedia<R>>().start_session()
}

pub fn stop_session<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    app.state::<EkoMedia<R>>().stop_session()
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("eko-media")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "EkoMediaPlugin")?;

            app.manage(EkoMedia {
                #[cfg(mobile)]
                handle,
                #[cfg(not(mobile))]
                _marker: std::marker::PhantomData::<fn() -> R>,
            });
            Ok(())
        })
        .build()
}
