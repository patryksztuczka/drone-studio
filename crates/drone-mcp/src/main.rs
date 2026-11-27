#![forbid(unsafe_code)]

mod tools;

use std::io::{BufRead, Write};

use serde_json::{Value, json};

const PROTOCOL_VERSIONS: &[&str] = &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS: &str = "Drone Studio lab for the palm_x4_2in micro quad. Typical loop: sim_suite to see what passes, run_anomalies and run_slice on a failing run_id to find the cause, change gains with sim_run overrides (names like rate.roll.kp), then run_diff baseline vs candidate. All flights are deterministic for a given seed. studio_focus shows a run in the open Studio window. Real hardware is never touched by these tools.";

fn response(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn handle(root: &std::path::Path, msg: &Value) -> Option<Value> {
    let id = msg.get("id").cloned();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or_else(|| json!({}));
    let id = id?;
    Some(match method {
        "initialize" => {
            let requested = params["protocolVersion"].as_str().unwrap_or("");
            let version = PROTOCOL_VERSIONS
                .iter()
                .find(|v| **v == requested)
                .copied()
                .unwrap_or(PROTOCOL_VERSIONS[0]);
            response(
                &id,
                json!({
                    "protocolVersion": version,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": "drone-mcp", "title": "Drone Studio", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": INSTRUCTIONS,
                }),
            )
        }
        "ping" => response(&id, json!({})),
        "tools/list" => response(&id, json!({ "tools": tools::definitions() })),
        "tools/call" => {
            let name = params["name"].as_str().unwrap_or("");
            let args = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            match tools::call(root, name, &args) {
                Err(tools::CallError::UnknownTool) => {
                    error(&id, -32602, &format!("unknown tool `{name}`"))
                }
                Err(tools::CallError::Failed(e)) => response(
                    &id,
                    json!({ "content": [{ "type": "text", "text": format!("{e:#}") }], "isError": true }),
                ),
                Ok(v) => response(
                    &id,
                    json!({
                        "content": [{ "type": "text", "text": serde_json::to_string_pretty(&v).unwrap_or_default() }],
                        "structuredContent": v,
                        "isError": false,
                    }),
                ),
            }
        }
        "resources/list" => response(&id, json!({ "resources": [] })),
        "prompts/list" => response(&id, json!({ "prompts": [] })),
        _ => error(&id, -32601, &format!("method `{method}` not found")),
    })
}

fn main() -> anyhow::Result<()> {
    let root = drone_cli::root::resolve(std::env::var_os("DRONE_ROOT").map(Into::into))?;
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(Value::Array(batch)) => {
                let replies: Vec<Value> = batch.iter().filter_map(|m| handle(&root, m)).collect();
                (!replies.is_empty()).then_some(Value::Array(replies))
            }
            Ok(msg) => handle(&root, &msg),
            Err(e) => Some(error(&Value::Null, -32700, &format!("parse error: {e}"))),
        };
        if let Some(r) = reply {
            writeln!(stdout, "{r}")?;
            stdout.flush()?;
        }
    }
    Ok(())
}
