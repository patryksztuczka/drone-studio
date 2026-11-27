use std::process::ExitCode;

use serde::Serialize;

pub fn print_json<T: Serialize>(value: &T) {
    match serde_json::to_string_pretty(value) {
        Ok(s) => println!("{s}"),
        Err(e) => eprintln!("drone: cannot encode JSON: {e}"),
    }
}

pub fn fail(json: bool, error: &anyhow::Error) -> ExitCode {
    if json {
        print_json(&serde_json::json!({ "ok": false, "error": format!("{error:#}") }));
    } else {
        eprintln!("drone: {error:#}");
    }
    ExitCode::from(2)
}
