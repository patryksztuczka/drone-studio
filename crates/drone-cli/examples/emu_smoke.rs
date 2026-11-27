#[path = "../src/emu.rs"]
mod emu;

use std::path::Path;
use std::process::ExitCode;

fn main() -> ExitCode {
    let json = std::env::args().any(|a| a == "--json");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    match emu::smoke(&root, json) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("drone: {e:#}");
            ExitCode::from(2)
        }
    }
}
