use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

use serde_json::{Value, json};

fn exchange(requests: &[Value]) -> Vec<Value> {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");
    let mut child = Command::new(env!("CARGO_BIN_EXE_drone-mcp"))
        .env("DRONE_ROOT", root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn drone-mcp");
    let mut stdin = child.stdin.take().expect("stdin");
    for r in requests {
        writeln!(stdin, "{r}").expect("write");
    }
    drop(stdin);
    let out = BufReader::new(child.stdout.take().expect("stdout"));
    let replies: Vec<Value> = out
        .lines()
        .map(|l| serde_json::from_str(&l.expect("line")).expect("json"))
        .collect();
    assert!(child.wait().expect("wait").success());
    replies
}

#[test]
fn discovery_and_calls_over_stdio() {
    let replies = exchange(&[
        json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "0"}}}),
        json!({"jsonrpc": "2.0", "method": "notifications/initialized"}),
        json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
        json!({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "sim_run", "arguments": {"scenario": "01_hover_calm", "record": false}}}),
        json!({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "run_slice", "arguments": {"run_id": "no-such-run", "t_start": 0, "t_end": 1}}}),
        json!({"jsonrpc": "2.0", "id": 5, "method": "nope"}),
        json!({"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "sim_run", "arguments": {"scenario": "02_step_roll_pitch", "record": false, "overrides": {"angle.kp": 2.0}}}}),
    ]);
    assert_eq!(replies.len(), 6, "the notification must not get a reply");
    assert_eq!(replies[0]["result"]["protocolVersion"], "2025-06-18");
    assert_eq!(replies[0]["result"]["serverInfo"]["name"], "drone-mcp");
    let names: Vec<&str> = replies[1]["result"]["tools"]
        .as_array()
        .expect("tools")
        .iter()
        .filter_map(|t| t["name"].as_str())
        .collect();
    for required in [
        "sim_run",
        "sim_suite",
        "run_anomalies",
        "run_slice",
        "run_diff",
        "emu_smoke_test",
        "studio_focus",
    ] {
        assert!(names.contains(&required), "missing {required}");
    }
    for t in replies[1]["result"]["tools"].as_array().expect("tools") {
        assert_eq!(t["inputSchema"]["type"], "object");
    }
    assert_eq!(replies[2]["result"]["isError"], false);
    assert_eq!(replies[2]["result"]["structuredContent"]["result"], "PASS");
    assert_eq!(replies[3]["result"]["isError"], true);
    assert_eq!(replies[4]["error"]["code"], -32601);
    assert_eq!(replies[5]["result"]["structuredContent"]["result"], "FAIL");
    assert_eq!(
        replies[5]["result"]["structuredContent"]["params"]["angle.kp"],
        2.0
    );
}
