mod measure;
mod project;
mod report;

use anyhow::{Result, ensure};
use clap::{Parser, ValueEnum};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    env, fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, ValueEnum)]
#[serde(rename_all = "kebab-case")]
enum Arm {
    Ours,
    OursProxy,
    Hirez,
    Manual,
    ManualUsed,
}
impl Arm {
    fn label(self) -> &'static str {
        match self {
            Self::Ours => "vitest-auto-spy",
            Self::OursProxy => "vitest-auto-spy (proxy)",
            Self::Hirez => "@bugsplat/vitest-auto-spies",
            Self::Manual => "manual (all methods)",
            Self::ManualUsed => "manual (3 used methods)",
        }
    }
}
#[derive(Parser, Serialize)]
#[command(
    about = "Measure synthetic Vitest suites: wall-clock at process exit and separately sampled peak process-tree RSS."
)]
#[serde(rename_all = "camelCase")]
struct Options {
    /// Test counts, with up to ten tests per generated spec file.
    #[arg(long, value_parser = |s: &str| s.trim().parse::<usize>(), value_delimiter = ',', default_value = "1000,3000,10000")]
    sizes: Vec<usize>,
    /// Arms: ours, ours-proxy, hirez, manual, manual-used. Manual builds every method; manual-used builds only the three invoked in each test.
    #[arg(
        long,
        value_parser = |s: &str| Arm::from_str(s.trim(), false),
        value_delimiter = ',',
        default_value = "ours,hirez,manual,manual-used"
    )]
    arms: Vec<Arm>,
    /// Successful paired rounds required for a verdict, after one discarded warm-up.
    #[arg(long, default_value_t = 3)]
    repeats: usize,
    /// Class width. Use --methods 100 for the 100-versus-3 manual control.
    #[arg(long, default_value_t = 20)]
    methods: usize,
    #[arg(long,default_value="on",value_parser=["on","off","both"])]
    coverage: String,
    #[arg(long,default_value="v8",value_parser=["v8","istanbul"])]
    coverage_provider: String,
    #[arg(long,default_value="true",action=clap::ArgAction::Set)]
    isolate: bool,
    #[arg(long,default_value="dist",value_parser=["src","dist"])]
    ours_source: String,
    /// Write the environment, run samples and successful same-round ratios to JSON.
    #[arg(long)]
    out: Option<PathBuf>,
    /// Retain the generated projects for inspection.
    #[arg(long)]
    keep: bool,
    /// Install the built package beside the microbenchmark competitors and exit.
    #[arg(long)]
    #[serde(skip)]
    prepare_vs: bool,
}
fn read_json(path: &Path) -> Result<Value> {
    Ok(serde_json::from_reader(fs::File::open(path)?)?)
}
fn main() -> Result<()> {
    let opts = Options::parse();
    ensure!(
        opts.repeats > 0 && opts.methods >= 3 && !opts.sizes.contains(&0),
        "need positive sizes/repeats and at least three methods"
    );
    ensure!(
        !opts
            .arms
            .iter()
            .enumerate()
            .any(|(i, a)| opts.arms[..i].contains(a))
            && !opts
                .sizes
                .iter()
                .enumerate()
                .any(|(i, s)| opts.sizes[..i].contains(s)),
        "duplicate arms or sizes"
    );
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()?;
    let tmp = tempfile::Builder::new()
        .prefix(".bench-suite-")
        .tempdir_in(&root)?;
    let work = tmp.path().to_owned();
    #[cfg(unix)]
    {
        use signal_hook::{
            consts::{SIGINT, SIGTERM},
            iterator::Signals,
        };
        let mut signals = Signals::new([SIGINT, SIGTERM])?;
        let cleanup = (!opts.keep).then(|| work.clone());
        std::thread::spawn(move || {
            if let Some(signal) = signals.forever().next() {
                if let Some(dir) = cleanup {
                    let _ = fs::remove_dir_all(dir);
                }
                std::process::exit(128 + signal);
            }
        });
    }
    if opts.keep {
        let _ = tmp.keep();
    }
    let mut host: Value =
        serde_json::from_str(&env::var("BENCH_HOST").unwrap_or_else(|_| "{}".into()))?;
    host["vitest"] = read_json(&root.join("node_modules/vitest/package.json"))?["version"].clone();
    println!("Environment: {host}\nWorking directory: {}", work.display());
    let pkg = project::prepare(
        &root,
        &work,
        &opts,
        host["vitest"].as_str().unwrap_or_default(),
    )?;
    if opts.prepare_vs {
        return project::unpack(
            &root.join("bench"),
            pkg.as_deref()
                .ok_or_else(|| anyhow::anyhow!("--prepare-vs requires the built package"))?,
        );
    }
    let modes: &[bool] = match opts.coverage.as_str() {
        "both" => &[true, false],
        "on" => &[true],
        _ => &[false],
    };
    let mut results = vec![];
    let mut ratios = vec![];
    let mut failed = false;
    for &size in &opts.sizes {
        for &coverage in modes {
            let dirs = opts
                .arms
                .iter()
                .map(|&arm| project::generate(&work, &opts, arm, size, coverage, pkg.as_deref()))
                .collect::<Result<Vec<_>>>()?;
            let mut samples = vec![vec![]; dirs.len()];
            for round in 0..=opts.repeats {
                for offset in 0..dirs.len() {
                    let i = (offset + round) % dirs.len();
                    let arm = opts.arms[i];
                    let run = measure::run(&root, &dirs[i], coverage)?;
                    println!(
                        "{size} tests coverage={coverage} {} round={round}: {:.3}s{}",
                        arm.label(),
                        run.wall_seconds,
                        if run.failed { " FAILED" } else { "" }
                    );
                    if run.failed {
                        eprintln!("{}\n{}", run.stdout, run.stderr);
                    }
                    if round == 0 {
                        ensure!(!run.failed, "warm-up failed for {}", arm.label());
                    } else {
                        failed |= run.failed;
                        samples[i].push(run);
                    }
                }
            }
            let (cells, pairs) = report::summarize(&opts, size, coverage, &samples);
            results.extend(cells);
            ratios.extend(pairs);
        }
    }
    if let Some(out) = &opts.out {
        let path = PathBuf::from(env::var_os("BENCH_CWD").unwrap_or_default()).join(out);
        let mut options = serde_json::to_value(&opts)?;
        options["coverageModes"] = json!(modes);
        options["help"] = json!(false);
        fs::write(
            path,
            serde_json::to_vec_pretty(
                &json!({"env":host,"options":options,"results":results,"roundRatios":ratios}),
            )?,
        )?;
    }
    ensure!(!failed, "one or more measured rounds failed");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_spaces_in_comma_separated_lists() {
        let opts =
            Options::parse_from(["bench-suite", "--sizes", "1, 11", "--arms", "ours, manual"]);
        assert_eq!(opts.sizes, [1, 11]);
        assert_eq!(opts.arms, [Arm::Ours, Arm::Manual]);
    }
}
