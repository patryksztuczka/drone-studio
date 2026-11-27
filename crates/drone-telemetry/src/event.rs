use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Event {
    pub t: f64,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Value::is_null")]
    pub data: Value,
}

impl Event {
    pub fn new(t: f64, kind: &str, data: Value) -> Self {
        Self {
            t,
            kind: kind.to_owned(),
            data,
        }
    }
}
