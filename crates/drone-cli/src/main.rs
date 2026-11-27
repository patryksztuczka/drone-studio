mod hardware;
mod output;
mod root;

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
    name = "drone",
    version,
    about = "Drone Studio command line: manifests, codegen, simulation, analysis and emulation."
)]
struct Cli {
    #[arg(long, global = true, help = "Print machine-readable JSON on stdout")]
    json: bool,
    #[arg(
        long,
        global = true,
        env = "DRONE_ROOT",
        help = "Repository root (defaults to the nearest parent with hardware/)"
    )]
    root: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    #[command(
        about = "Validate every manifest under hardware/ against its JSON Schema and cross-references"
    )]
    Validate,
    #[command(
        about = "Generate firmware constants, simulator model, Renode platform and Studio layout"
    )]
    Codegen {
        #[arg(
            long,
            help = "Fail when a generated file is missing or stale instead of writing"
        )]
        check: bool,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let root = match root::resolve(cli.root.clone()) {
        Ok(r) => r,
        Err(e) => return output::fail(cli.json, &e),
    };
    let result = match cli.command {
        Command::Validate => hardware::validate(&root, cli.json),
        Command::Codegen { check } => hardware::codegen(&root, cli.json, check),
    };
    match result {
        Ok(code) => code,
        Err(e) => output::fail(cli.json, &e),
    }
}
