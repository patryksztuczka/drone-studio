use drone_cli::{analyze, hardware, output, root, sim, studio};
use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Args, Parser, Subcommand};

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
    #[command(subcommand, about = "Run scenarios in SITL lockstep")]
    Sim(SimCommand),
    #[command(about = "Summarise a recorded run, list its anomalies or slice its telemetry")]
    Analyze(AnalyzeArgs),
    #[command(about = "Compare two recorded runs")]
    Diff { baseline: String, candidate: String },
    #[command(about = "List recorded runs, newest first")]
    Runs {
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    #[command(subcommand, about = "Talk to a running Drone Studio")]
    Studio(StudioCommand),
}

#[derive(Subcommand, Debug)]
enum SimCommand {
    #[command(about = "Run one scenario and record it under runs/")]
    Run {
        scenario: String,
        #[arg(long)]
        seed: Option<u64>,
        #[arg(
            long = "set",
            value_name = "PARAM=VALUE",
            help = "Override a flight-core parameter, e.g. --set rate.roll.kp=0.03"
        )]
        sets: Vec<String>,
        #[arg(long, help = "Do not write runs/<id>/")]
        no_record: bool,
    },
    #[command(about = "Run every scenario (or those with a tag) in parallel")]
    Suite {
        #[arg(long = "tag")]
        tags: Vec<String>,
        #[arg(long)]
        jobs: Option<usize>,
        #[arg(long = "set", value_name = "PARAM=VALUE")]
        sets: Vec<String>,
        #[arg(long)]
        no_record: bool,
    },
}

#[derive(Args, Debug)]
struct AnalyzeArgs {
    #[arg(
        help = "Run id, unique prefix or suffix, scenario id (latest run of it), `latest`, or a run directory"
    )]
    run: String,
    #[arg(long, group = "mode")]
    summary: bool,
    #[arg(long, group = "mode")]
    anomalies: bool,
    #[arg(long, group = "mode", value_name = "T0..T1")]
    slice: Option<String>,
    #[arg(
        long,
        value_delimiter = ',',
        help = "Signals for --slice, comma separated"
    )]
    signals: Vec<String>,
    #[arg(long, default_value_t = 200)]
    max_rows: usize,
}

#[derive(Subcommand, Debug)]
enum StudioCommand {
    #[command(about = "Open a run in the Studio window and move the Time Machine to a timestamp")]
    Focus {
        run: String,
        #[arg(long, short)]
        t: Option<f64>,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let root = match root::resolve(cli.root.clone()) {
        Ok(r) => r,
        Err(e) => return output::fail(cli.json, &e),
    };
    let json = cli.json;
    let result = match cli.command {
        Command::Validate => hardware::validate(&root, json),
        Command::Codegen { check } => hardware::codegen(&root, json, check),
        Command::Sim(SimCommand::Run {
            scenario,
            seed,
            sets,
            no_record,
        }) => sim::run(&root, json, &scenario, seed, &sets, !no_record),
        Command::Sim(SimCommand::Suite {
            tags,
            jobs,
            sets,
            no_record,
        }) => sim::suite(&root, json, &tags, jobs, &sets, !no_record),
        Command::Analyze(a) => (|| {
            let v = if a.anomalies {
                analyze::anomalies_report(&root, &a.run)?
            } else if let Some(range) = &a.slice {
                analyze::slice_report(
                    &root,
                    &a.run,
                    analyze::parse_range(range)?,
                    &a.signals,
                    a.max_rows,
                )?
            } else {
                let _ = a.summary;
                analyze::summary_report(&root, &a.run)?
            };
            analyze::print(json, &v);
            Ok(ExitCode::SUCCESS)
        })(),
        Command::Diff {
            baseline,
            candidate,
        } => analyze::diff_report(&root, &baseline, &candidate).map(|v| {
            analyze::print(json, &v);
            ExitCode::SUCCESS
        }),
        Command::Runs { limit } => {
            let v = analyze::runs_report(&root, limit);
            analyze::print(json, &v);
            Ok(ExitCode::SUCCESS)
        }
        Command::Studio(StudioCommand::Focus { run, t }) => studio::focus(&root, json, &run, t),
    };
    match result {
        Ok(code) => code,
        Err(e) => output::fail(json, &e),
    }
}
