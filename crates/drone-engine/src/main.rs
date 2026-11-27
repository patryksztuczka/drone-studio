#![forbid(unsafe_code)]

mod hardware;
mod live;
mod rpc;
mod spectrum;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;

use crate::rpc::Engine;

#[derive(Clone, Debug)]
pub enum Outgoing {
    Text(String),
    Binary(Vec<u8>),
}

pub fn notification(method: &str, params: Value) -> Outgoing {
    Outgoing::Text(json!({ "jsonrpc": "2.0", "method": method, "params": params }).to_string())
}

fn find_root() -> anyhow::Result<PathBuf> {
    if let Some(r) = std::env::var_os("DRONE_ROOT") {
        return Ok(PathBuf::from(r));
    }
    let mut dir = std::env::current_dir()?;
    loop {
        if dir.join("hardware").is_dir() && dir.join("Cargo.toml").is_file() {
            return Ok(dir);
        }
        if !dir.pop() {
            anyhow::bail!("no hardware/ directory found; set DRONE_ROOT");
        }
    }
}

async fn serve_client(
    stream: TcpStream,
    engine: Arc<Mutex<Engine>>,
    bus: broadcast::Sender<Outgoing>,
) {
    let Ok(ws) = tokio_tungstenite::accept_async(stream).await else {
        return;
    };
    let (mut sink, mut source) = ws.split();
    let (reply_tx, mut reply_rx) = mpsc::unbounded_channel::<Outgoing>();
    let mut bus_rx = bus.subscribe();
    let writer = tokio::spawn(async move {
        loop {
            let next = tokio::select! {
                r = reply_rx.recv() => r,
                b = bus_rx.recv() => match b {
                    Ok(m) => Some(m),
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => None,
                },
            };
            let Some(msg) = next else { break };
            let ws_msg = match msg {
                Outgoing::Text(t) => Message::text(t),
                Outgoing::Binary(b) => Message::binary(b),
            };
            if sink.send(ws_msg).await.is_err() {
                break;
            }
        }
    });
    while let Some(Ok(msg)) = source.next().await {
        let Message::Text(text) = msg else {
            continue;
        };
        let Ok(req) = serde_json::from_str::<Value>(text.as_str()) else {
            let _ = reply_tx.send(Outgoing::Text(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "parse error" } }).to_string()));
            continue;
        };
        let id = req.get("id").cloned();
        let method = req["method"].as_str().unwrap_or("").to_owned();
        let params = req.get("params").cloned().unwrap_or_else(|| json!({}));
        let result = {
            let mut e = engine.lock().await;
            e.handle(&method, &params, &bus)
        };
        if let Some(id) = id {
            let body = match result {
                Ok(v) => json!({ "jsonrpc": "2.0", "id": id, "result": v }),
                Err(err) => {
                    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": format!("{err:#}") } })
                }
            };
            if reply_tx.send(Outgoing::Text(body.to_string())).is_err() {
                break;
            }
        }
    }
    writer.abort();
}

async fn ticker(engine: Arc<Mutex<Engine>>, bus: broadcast::Sender<Outgoing>) {
    let hz = 60.0;
    let mut interval = tokio::time::interval(Duration::from_secs_f64(1.0 / hz));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last = Instant::now();
    loop {
        interval.tick().await;
        let now = Instant::now();
        let dt = now.duration_since(last).as_secs_f64();
        last = now;
        let mut e = engine.lock().await;
        e.tick(dt, &bus);
    }
}

async fn remove_state_on_exit(state_file: Option<PathBuf>) {
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        () = terminate => {}
    }
    if let Some(file) = state_file {
        let ours = std::fs::read_to_string(&file)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .is_some_and(|v| v["pid"] == json!(std::process::id()));
        if ours {
            let _ = std::fs::remove_file(&file);
        }
    }
    std::process::exit(0);
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let root = find_root()?;
    let port: u16 = std::env::var("DRONE_ENGINE_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(47800);
    let listener = match TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], port))).await {
        Ok(l) => l,
        Err(_) if std::env::var("DRONE_ENGINE_PORT").is_err() => {
            TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?
        }
        Err(e) => return Err(e.into()),
    };
    let addr = listener.local_addr()?;
    let url = format!("ws://{addr}");
    let engine = Arc::new(Mutex::new(Engine::open(root.clone(), url.clone())?));
    let state_file = (std::env::var_os("DRONE_ENGINE_NO_STATE").is_none())
        .then(|| root.join(".dev/engine.json"));
    if let Some(file) = &state_file {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(
            file,
            json!({ "url": url, "pid": std::process::id() }).to_string(),
        );
    }
    tokio::spawn(remove_state_on_exit(state_file));
    println!("DRONE_ENGINE_READY {url}");
    let (bus, _) = broadcast::channel::<Outgoing>(256);
    tokio::spawn(ticker(engine.clone(), bus.clone()));
    loop {
        let (stream, _) = listener.accept().await?;
        let _ = stream.set_nodelay(true);
        tokio::spawn(serve_client(stream, engine.clone(), bus.clone()));
    }
}
