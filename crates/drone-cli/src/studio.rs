use std::path::Path;
use std::process::ExitCode;

use anyhow::Context;
use serde_json::{Value, json};

use crate::output::print_json;

pub fn engine_url(root: &Path) -> String {
    if let Ok(url) = std::env::var("DRONE_ENGINE_URL") {
        return url;
    }
    let from_file = std::fs::read_to_string(root.join(".dev/engine.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v["url"].as_str().map(str::to_owned));
    from_file.unwrap_or_else(|| "ws://127.0.0.1:47800".to_owned())
}

pub fn request(root: &Path, method: &str, params: Value) -> anyhow::Result<Value> {
    let url = engine_url(root);
    let (mut socket, _) = tungstenite::connect(url.as_str()).with_context(|| {
        format!("Drone Studio engine is not reachable at {url}; start it with `pnpm dev:desktop`")
    })?;
    let req = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
    socket.send(tungstenite::Message::text(req.to_string()))?;
    loop {
        let msg = socket.read()?;
        if let tungstenite::Message::Text(text) = msg {
            let v: Value = serde_json::from_str(text.as_str())?;
            if v.get("id") == Some(&json!(1)) {
                let _ = socket.close(None);
                if let Some(err) = v.get("error") {
                    anyhow::bail!(
                        "engine refused {method}: {}",
                        err["message"].as_str().unwrap_or("error")
                    );
                }
                return Ok(v["result"].clone());
            }
        }
    }
}

pub fn focus(root: &Path, json: bool, run: &str, t: Option<f64>) -> anyhow::Result<ExitCode> {
    let dir = drone_telemetry::store::resolve_run(&root.join("runs"), run)?;
    let meta = drone_telemetry::store::read_meta(&dir)?;
    let result = request(
        root,
        "studio.focus",
        json!({ "run_id": meta.run_id, "t": t }),
    )?;
    if json {
        print_json(&result);
    } else {
        println!(
            "Studio focused on {} at t={}",
            meta.run_id,
            t.unwrap_or(0.0)
        );
    }
    Ok(ExitCode::SUCCESS)
}
