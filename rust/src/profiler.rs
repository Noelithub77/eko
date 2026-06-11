use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use serde_json::Value;

const MAX_PROFILER_BYTES: usize = 16 * 1024;
const MAX_SAMPLES: usize = 240;

static PROFILER_SAMPLES: OnceLock<Mutex<VecDeque<Value>>> = OnceLock::new();

pub fn append_sample(body: &[u8]) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Ok(());
    }

    if body.len() > MAX_PROFILER_BYTES {
        return Err("Profiler sample is too large.".to_string());
    }

    let value = serde_json::from_slice::<Value>(body).map_err(|error| error.to_string())?;
    append_value(value)
}

pub fn append_typed_sample(sample: impl Serialize) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Ok(());
    }

    let value = serde_json::to_value(sample).map_err(|error| error.to_string())?;
    append_value(value)
}

pub fn snapshot_json() -> Result<String, String> {
    if !cfg!(debug_assertions) {
        return Ok("[]".to_string());
    }

    let samples = samples().lock().map_err(|error| error.to_string())?;
    let values = samples.iter().cloned().collect::<Vec<_>>();
    serde_json::to_string(&values).map_err(|error| error.to_string())
}

fn append_value(value: Value) -> Result<(), String> {
    let mut samples = samples().lock().map_err(|error| error.to_string())?;
    samples.push_back(value);
    while samples.len() > MAX_SAMPLES {
        let _ = samples.pop_front();
    }
    Ok(())
}

fn samples() -> &'static Mutex<VecDeque<Value>> {
    PROFILER_SAMPLES.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_SAMPLES)))
}
