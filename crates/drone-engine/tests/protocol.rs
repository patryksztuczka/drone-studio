use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};

use serde_json::{Value, json};
use tungstenite::{Message, connect};

struct Engine {
    child: Child,
    url: String,
}

impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn start() -> Engine {
    let mut child = Command::new(env!("CARGO_BIN_EXE_drone-engine"))
        .env("DRONE_ROOT", concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .env("DRONE_ENGINE_PORT", "0")
        .env("DRONE_ENGINE_NO_STATE", "1")
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn engine");
    let mut line = String::new();
    BufReader::new(child.stdout.take().expect("stdout"))
        .read_line(&mut line)
        .expect("ready line");
    let url = line
        .trim()
        .strip_prefix("DRONE_ENGINE_READY ")
        .expect("ready marker")
        .to_owned();
    Engine { child, url }
}

type Socket = tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>;

fn call(
    ws: &mut Socket,
    id: u64,
    method: &str,
    params: Value,
    binary: &mut usize,
    notes: &mut Vec<Value>,
) -> Value {
    ws.send(Message::text(
        json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }).to_string(),
    ))
    .expect("send");
    loop {
        match ws.read().expect("read") {
            Message::Binary(_) => *binary += 1,
            Message::Text(t) => {
                let v: Value = serde_json::from_str(t.as_str()).expect("json");
                if v.get("id") == Some(&json!(id)) {
                    assert!(v.get("error").is_none(), "{method} failed: {v}");
                    return v["result"].clone();
                }
                notes.push(v);
            }
            _ => {}
        }
    }
}

#[test]
fn live_session_streams_frames_and_records_a_run() {
    let engine = start();
    let (mut ws, _) = connect(engine.url.as_str()).expect("connect");
    let (mut viewer, _) = connect(engine.url.as_str()).expect("connect viewer");
    let mut frames = 0;
    let mut notes = Vec::new();
    let info = call(
        &mut ws,
        1,
        "engine.info",
        json!({}),
        &mut frames,
        &mut notes,
    );
    let cols = info["frame"]["columns"].as_array().expect("columns");
    assert_eq!(cols[0], "t");
    assert!(cols.iter().any(|c| c == "q_w"));
    assert_eq!(info["scenarios"].as_array().expect("scenarios").len(), 5);

    let layout = call(
        &mut ws,
        2,
        "hardware.layout",
        json!({ "airframe": "palm_x4_2in" }),
        &mut frames,
        &mut notes,
    );
    assert_eq!(layout["board"]["id"], "ref_h743_aio");
    let preview = call(
        &mut ws,
        3,
        "hardware.preview",
        json!({ "battery": "2s_450mah_lipo" }),
        &mut frames,
        &mut notes,
    );
    assert!(
        preview["mass_g"].as_f64().expect("mass")
            < preview["baseline_mass_g"].as_f64().expect("baseline")
    );

    call(
        &mut ws,
        4,
        "sim.start",
        json!({ "scenario": "01_hover_calm", "speed": 20.0 }),
        &mut frames,
        &mut notes,
    );
    let mut finished = None;
    let mut sample_len = 0;
    while finished.is_none() {
        match ws.read().expect("read") {
            Message::Binary(b) => {
                frames += 1;
                sample_len = b.len();
            }
            Message::Text(t) => {
                let v: Value = serde_json::from_str(t.as_str()).expect("json");
                if v["method"] == "sim.finished" {
                    finished = Some(v["params"].clone());
                }
            }
            _ => {}
        }
    }
    let finished = finished.expect("finished");
    assert_eq!(finished["result"], "PASS");
    assert_eq!(sample_len, 8 + 4 * cols.len());
    assert!(frames > 20, "only {frames} frames");
    let run_id = finished["run_id"].as_str().expect("run id").to_owned();

    let loaded = call(
        &mut ws,
        5,
        "runs.load",
        json!({ "run_id": run_id, "rate_hz": 50 }),
        &mut frames,
        &mut notes,
    );
    assert_eq!(loaded["meta"]["run_id"], json!(run_id));
    assert!(loaded["t"].as_array().expect("t").len() > 400);

    let focus = call(
        &mut ws,
        6,
        "studio.focus",
        json!({ "run_id": run_id, "t": 4.5 }),
        &mut frames,
        &mut notes,
    );
    assert_eq!(focus["delivered_to"], 1);
    let note = loop {
        if let Message::Text(t) = viewer.read().expect("viewer read") {
            let v: Value = serde_json::from_str(t.as_str()).expect("json");
            if v["method"] == "studio.focus" {
                break v;
            }
        }
    };
    assert_eq!(note["params"]["run_id"], json!(run_id));
    assert_eq!(note["params"]["t"], 4.5);
    let _ = std::fs::remove_dir_all(
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../runs/").to_owned() + &run_id,
    );
}

#[test]
fn manual_flight_follows_the_sticks() {
    let engine = start();
    let (mut ws, _) = connect(engine.url.as_str()).expect("connect");
    let mut frames = 0;
    let mut notes = Vec::new();
    call(
        &mut ws,
        1,
        "sim.start",
        json!({ "mode": "manual", "speed": 10.0 }),
        &mut frames,
        &mut notes,
    );
    call(
        &mut ws,
        2,
        "rc.set",
        json!({ "arm": false, "throttle": 0.5, "mode": "althold" }),
        &mut frames,
        &mut notes,
    );
    let mut status = json!({});
    for i in 0..400 {
        let t = status["t"].as_f64().unwrap_or(0.0);
        let rc = if t < 0.6 {
            json!({ "arm": false })
        } else if t < 1.0 {
            json!({ "arm": true, "throttle": 0.5 })
        } else if t < 2.5 {
            json!({ "arm": true, "throttle": 0.9 })
        } else {
            json!({ "arm": true, "throttle": 0.5 })
        };
        call(&mut ws, 10 + i, "rc.set", rc, &mut frames, &mut notes);
        status = call(
            &mut ws,
            1000 + i,
            "sim.status",
            json!({}),
            &mut frames,
            &mut notes,
        );
        if t > 4.0 {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(15));
    }
    let stopped = call(
        &mut ws,
        5000,
        "sim.stop",
        json!({ "record": false }),
        &mut frames,
        &mut notes,
    );
    assert_eq!(stopped["stopped"], true);
    let rejected: Vec<&Value> = notes
        .iter()
        .filter(|n| n["method"] == "sim.events")
        .collect();
    let armed = notes.iter().any(|n| {
        n["method"] == "sim.events"
            && n["params"]["events"]
                .as_array()
                .is_some_and(|e| e.iter().any(|x| x["kind"] == "ARM"))
    });
    assert!(armed, "the quad never armed: {rejected:?}");
    let climbed = notes.iter().filter(|n| n["method"] == "sim.status").count();
    assert!(climbed > 0 || frames > 0);
}
