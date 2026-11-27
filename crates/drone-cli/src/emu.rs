use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Output, Stdio};
use std::time::Instant;

use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};

const FIRMWARE_DIR: &str = "firmware/target-stm32h7";
const FIRMWARE_TARGET: &str = "thumbv7em-none-eabihf";
const FIRMWARE_BIN: &str = "target-stm32h7";
const EMU_DIR: &str = "emu";
const SUITE: &str = "emu/tests/boot_and_loop.robot";
const SUMMARIZER: &str = "emu/tests/summarize.py";
const OUT_DIR: &str = "target/emu/smoke";
const IMAGE_REPO: &str = "drone-studio-emu";
const CONTAINER_ROOT: &str = "/work";
const UART_TAIL_LINES: usize = 20;
const OUTPUT_TAIL_LINES: usize = 40;

#[derive(Debug, Serialize, Deserialize)]
pub struct TestResult {
    pub name: String,
    pub passed: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct Summary {
    tests: Vec<TestResult>,
}

#[derive(Debug, Serialize)]
pub struct SmokeReport {
    pub ok: bool,
    pub elf: String,
    pub elf_bytes: u64,
    pub image: String,
    pub tests: Vec<TestResult>,
    pub uart_log_tail: Vec<String>,
    pub duration_s: f64,
}

pub fn smoke(root: &Path, json: bool) -> anyhow::Result<ExitCode> {
    let started = Instant::now();
    let root = &root
        .canonicalize()
        .with_context(|| format!("cannot resolve {}", root.display()))?;
    let elf = build_firmware(root)?;
    let elf_bytes = std::fs::metadata(&elf)
        .with_context(|| format!("cannot read {}", elf.display()))?
        .len();
    let image = ensure_image(root)?;
    let out_dir = root.join(OUT_DIR);
    if out_dir.exists() {
        std::fs::remove_dir_all(&out_dir)
            .with_context(|| format!("cannot clear {}", out_dir.display()))?;
    }
    std::fs::create_dir_all(&out_dir)
        .with_context(|| format!("cannot create {}", out_dir.display()))?;

    let run = run_suite(root, &image)?;
    let summary_path = out_dir.join("summary.json");
    let tests = match std::fs::read_to_string(&summary_path) {
        Ok(text) => {
            serde_json::from_str::<Summary>(&text)
                .with_context(|| format!("cannot parse {}", summary_path.display()))?
                .tests
        }
        Err(_) => bail!(
            "the Robot suite produced no results; renode-test output:\n{}",
            tail(&combined(&run), OUTPUT_TAIL_LINES).join("\n")
        ),
    };
    let uart_log_tail = tests
        .first()
        .map(|t| out_dir.join(format!("{}.uart.log", log_name(&t.name))))
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|log| tail(&log, UART_TAIL_LINES))
        .unwrap_or_default();

    let ok = run.status.success() && !tests.is_empty() && tests.iter().all(|t| t.passed);
    let report = SmokeReport {
        ok,
        elf: relative(root, &elf),
        elf_bytes,
        image,
        tests,
        uart_log_tail,
        duration_s: (started.elapsed().as_secs_f64() * 10.0).round() / 10.0,
    };
    let dev = root.join(".dev");
    if std::fs::create_dir_all(&dev).is_ok() {
        let _ = std::fs::write(dev.join("emu-last.json"), serde_json::to_string(&report)?);
    }
    if json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        print_human(&report, &relative(root, &out_dir));
    }
    Ok(if report.ok {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    })
}

fn build_firmware(root: &Path) -> anyhow::Result<PathBuf> {
    let dir = root.join(FIRMWARE_DIR);
    let cargo = std::env::var_os("CARGO").unwrap_or_else(|| OsString::from("cargo"));
    let output = Command::new(cargo)
        .args(["build", "--release", "--target", FIRMWARE_TARGET])
        .current_dir(&dir)
        .env_remove("CARGO_TARGET_DIR")
        .stdin(Stdio::null())
        .output()
        .with_context(|| format!("cannot run cargo in {}", dir.display()))?;
    if !output.status.success() {
        bail!(
            "firmware build failed in {}:\n{}",
            dir.display(),
            tail(&combined(&output), OUTPUT_TAIL_LINES).join("\n")
        );
    }
    let elf = dir
        .join("target")
        .join(FIRMWARE_TARGET)
        .join("release")
        .join(FIRMWARE_BIN);
    if !elf.is_file() {
        bail!("the firmware build left no ELF at {}", elf.display());
    }
    Ok(elf)
}

fn ensure_image(root: &Path) -> anyhow::Result<String> {
    let context = root.join(EMU_DIR);
    let dockerfile = std::fs::read(context.join("Dockerfile"))
        .with_context(|| format!("cannot read {}/Dockerfile", context.display()))?;
    let image = format!("{IMAGE_REPO}:{:016x}", fnv1a(&dockerfile));
    let present = Command::new("docker")
        .args(["image", "inspect", &image])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .context("cannot run docker; install Docker and start its daemon")?
        .success();
    if present {
        return Ok(image);
    }
    eprintln!(
        "drone: building {image} from {}/Dockerfile",
        context.display()
    );
    let status = Command::new("docker")
        .args(["build", "--tag", &image])
        .arg(&context)
        .stdin(Stdio::null())
        .stdout(Stdio::from(std::io::stderr()))
        .stderr(Stdio::inherit())
        .status()
        .context("cannot run docker build")?;
    if !status.success() {
        bail!("docker build of {image} failed; its output is above");
    }
    Ok(image)
}

fn run_suite(root: &Path, image: &str) -> anyhow::Result<Output> {
    let workdir = format!("{CONTAINER_ROOT}/{OUT_DIR}");
    let script = format!(
        "renode-test {CONTAINER_ROOT}/{SUITE} --variable UART_LOG_DIR:{workdir}; code=$?; \
         python3 -I {CONTAINER_ROOT}/{SUMMARIZER} robot_output.xml > summary.json; exit $code"
    );
    let mut volume = root.as_os_str().to_owned();
    volume.push(format!(":{CONTAINER_ROOT}"));
    let mut cmd = Command::new("docker");
    cmd.args(["run", "--rm", "--env", "HOME=/tmp", "--workdir", &workdir]);
    if let Some(user) = host_user() {
        cmd.args(["--user", &user]);
    }
    cmd.arg("--volume")
        .arg(volume)
        .args([image, "sh", "-c", &script])
        .stdin(Stdio::null())
        .output()
        .context("cannot run docker run")
}

fn host_user() -> Option<String> {
    let id = |flag: &str| {
        Command::new("id")
            .arg(flag)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_owned())
            .filter(|s| !s.is_empty())
    };
    Some(format!("{}:{}", id("-u")?, id("-g")?))
}

fn print_human(report: &SmokeReport, out_dir: &str) {
    let passed = report.tests.iter().filter(|t| t.passed).count();
    println!(
        "{} emu smoke: {passed}/{} tests passed in {:.1} s",
        if report.ok { "ok" } else { "FAILED" },
        report.tests.len(),
        report.duration_s
    );
    println!("  elf    {} ({} bytes)", report.elf, report.elf_bytes);
    println!("  image  {}", report.image);
    for t in &report.tests {
        println!("  {}  {}", if t.passed { "pass" } else { "FAIL" }, t.name);
        if !t.passed {
            for line in t.message.lines().take(OUTPUT_TAIL_LINES) {
                println!("          {line}");
            }
        }
    }
    if !report.uart_log_tail.is_empty() {
        println!("  usart2 (last {} lines)", report.uart_log_tail.len());
        for line in &report.uart_log_tail {
            println!("    {line}");
        }
    }
    println!("  results in {out_dir}/ (log.html, report.html, *.uart.log)");
}

fn combined(output: &Output) -> String {
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    text
}

fn tail(text: &str, n: usize) -> Vec<String> {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(n)..]
        .iter()
        .map(|l| (*l).to_owned())
        .collect()
}

fn log_name(test: &str) -> String {
    let mut out = String::with_capacity(test.len());
    let mut gap = false;
    for c in test.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            gap = false;
        } else if !gap {
            out.push('_');
            gap = true;
        }
    }
    out
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned()
}

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_name_matches_the_robot_suite() {
        assert_eq!(
            log_name("Should Probe The IMU And Run The Control Loop"),
            "Should_Probe_The_IMU_And_Run_The_Control_Loop"
        );
        assert_eq!(log_name("a -- b"), "a_b");
    }

    #[test]
    fn tail_keeps_the_last_non_empty_lines() {
        assert_eq!(tail("a\n\nb\nc\n", 2), vec!["b", "c"]);
        assert_eq!(tail("a", 5), vec!["a"]);
    }

    #[test]
    fn image_tag_is_stable() {
        assert_eq!(fnv1a(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a(b"a"), 0xaf63_dc4c_8601_ec8c);
    }
}
