use std::path::PathBuf;

use anyhow::{Context, bail};

pub fn resolve(explicit: Option<PathBuf>) -> anyhow::Result<PathBuf> {
    if let Some(p) = explicit {
        if p.join("hardware").is_dir() {
            return Ok(p);
        }
        bail!("{} has no hardware/ directory", p.display());
    }
    let mut dir = std::env::current_dir().context("cannot read the current directory")?;
    loop {
        if dir.join("hardware").is_dir() && dir.join("Cargo.toml").is_file() {
            return Ok(dir);
        }
        if !dir.pop() {
            bail!("no hardware/ directory found in this directory or its parents; pass --root");
        }
    }
}
