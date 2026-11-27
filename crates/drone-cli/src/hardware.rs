use std::path::Path;
use std::process::ExitCode;

use serde::Serialize;

use drone_schema::codegen::{self, FileReport, FileStatus};
use drone_schema::{Diagnostic, Severity};

use crate::output::print_json;

#[derive(Serialize)]
struct ValidateReport {
    ok: bool,
    files_checked: usize,
    errors: usize,
    warnings: usize,
    airframes: Vec<String>,
    boards: Vec<String>,
    scenarios: Vec<String>,
    diagnostics: Vec<Diagnostic>,
}

pub fn validate(root: &Path, json: bool) -> anyhow::Result<ExitCode> {
    let (repo, diags) = drone_schema::validate(&root.join("hardware"));
    let errors = diags.error_count();
    let warnings = diags.warning_count();
    let report = ValidateReport {
        ok: errors == 0,
        files_checked: repo.files_checked,
        errors,
        warnings,
        airframes: repo.airframes.keys().cloned().collect(),
        boards: repo.boards.keys().cloned().collect(),
        scenarios: repo.scenarios.keys().cloned().collect(),
        diagnostics: diags.sorted(),
    };
    if json {
        print_json(&report);
    } else {
        for d in &report.diagnostics {
            let line = format!("hardware/{d}");
            match d.severity {
                Severity::Error => eprintln!("{line}"),
                Severity::Warning => eprintln!("{line}"),
            }
        }
        println!(
            "{} {} manifests: {} errors, {} warnings ({} airframes, {} scenarios)",
            if report.ok { "ok" } else { "FAILED" },
            report.files_checked,
            errors,
            warnings,
            report.airframes.len(),
            report.scenarios.len()
        );
    }
    Ok(if report.ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

#[derive(Serialize)]
struct CodegenReport {
    ok: bool,
    mode: &'static str,
    files: Vec<FileReport>,
    diagnostics: Vec<Diagnostic>,
}

pub fn codegen(root: &Path, json: bool, check: bool) -> anyhow::Result<ExitCode> {
    let (repo, diags) = drone_schema::validate(&root.join("hardware"));
    if diags.has_errors() {
        let report = CodegenReport {
            ok: false,
            mode: if check { "check" } else { "write" },
            files: Vec::new(),
            diagnostics: diags.sorted(),
        };
        if json {
            print_json(&report);
        } else {
            for d in &report.diagnostics {
                eprintln!("hardware/{d}");
            }
            eprintln!("codegen refused: fix the manifest errors first (drone validate)");
        }
        return Ok(ExitCode::FAILURE);
    }
    let artifacts = codegen::generate(&repo)?;
    let files = if check {
        codegen::check(root, &artifacts)
    } else {
        codegen::write(root, &artifacts)?
    };
    let ok = files
        .iter()
        .all(|f| matches!(f.status, FileStatus::Unchanged | FileStatus::Written));
    let report = CodegenReport {
        ok,
        mode: if check { "check" } else { "write" },
        files,
        diagnostics: diags.sorted(),
    };
    if json {
        print_json(&report);
    } else {
        for f in &report.files {
            let status = match f.status {
                FileStatus::Unchanged => "unchanged",
                FileStatus::Written => "written",
                FileStatus::Stale => "STALE",
                FileStatus::Missing => "MISSING",
            };
            println!("{status:>9}  {}", f.path);
        }
        if !ok {
            eprintln!("generated files are out of date: run `drone codegen`");
        }
    }
    Ok(if ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}
