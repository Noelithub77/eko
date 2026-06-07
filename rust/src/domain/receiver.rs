use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NativeReceiverEvent {
    Waiting { message: String },
    Connecting { message: String },
    Connected { message: String },
    Denied { message: String },
    Error { message: String },
    Closed { message: String },
}
