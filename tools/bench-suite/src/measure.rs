use anyhow::Result;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    env,
    io::{Read, Seek},
    path::Path,
    process::Command,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Run {
    pub wall_seconds: f64,
    pub peak_mb: Option<f64>,
    pub rss_sampled: bool,
    pub exit_code: Option<i32>,
    pub failed: bool,
    pub stdout: String,
    pub stderr: String,
}

fn process_table() -> Option<Vec<(u32, u32, f64)>> {
    #[cfg(not(windows))]
    {
        let out = Command::new("ps")
            .args(["-A", "-o", "pid=,ppid=,rss="])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        Some(
            std::str::from_utf8(&out.stdout)
                .ok()?
                .lines()
                .filter_map(|s| {
                    let mut f = s.split_whitespace();
                    Some((
                        f.next()?.parse().ok()?,
                        f.next()?.parse().ok()?,
                        f.next()?.parse().ok()?,
                    ))
                })
                .collect(),
        )
    }
    #[cfg(windows)]
    {
        let out=Command::new("powershell").args(["-NoProfile","-Command","Get-CimInstance Win32_Process | ForEach-Object { '{0} {1} {2}' -f $_.ProcessId,$_.ParentProcessId,$_.WorkingSetSize }"]).output().ok()?;
        if !out.status.success() {
            return None;
        }
        Some(
            std::str::from_utf8(&out.stdout)
                .ok()?
                .lines()
                .filter_map(|s| {
                    let mut f = s.split_whitespace();
                    Some((
                        f.next()?.parse().ok()?,
                        f.next()?.parse().ok()?,
                        f.next()?.parse::<f64>().ok()? / 1024.,
                    ))
                })
                .collect(),
        )
    }
}
fn tree_mb(root: u32, table: &[(u32, u32, f64)]) -> Option<f64> {
    let mut children = HashMap::<_, Vec<_>>::new();
    let mut rss = HashMap::new();
    for &(pid, parent, kb) in table {
        children.entry(parent).or_default().push(pid);
        rss.insert(pid, kb);
    }
    rss.get(&root)?;
    let mut stack = vec![root];
    let mut seen = HashSet::new();
    let mut total = 0.;
    while let Some(pid) = stack.pop() {
        if seen.insert(pid) {
            total += rss[&pid];
            if let Some(kids) = children.get(&pid) {
                stack.extend(kids);
            }
        }
    }
    Some(total / 1024.)
}
fn contents(mut file: std::fs::File) -> Result<String> {
    file.rewind()?;
    let mut bytes = vec![];
    file.read_to_end(&mut bytes)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
pub(crate) fn run(root: &Path, dir: &Path, coverage: bool) -> Result<Run> {
    let mut cmd = Command::new(env::var_os("BENCH_NODE").unwrap_or_else(|| "node".into()));
    cmd.current_dir(dir)
        .arg(root.join("node_modules/vitest/vitest.mjs"))
        .arg("run");
    if coverage {
        cmd.arg("--coverage");
    }
    measure(cmd, sample_rss)
}
fn sample_rss(pid: u32, rx: mpsc::Receiver<()>) -> Option<f64> {
    let mut peak: Option<f64> = None;
    loop {
        let Some(rows) = process_table() else {
            break;
        };
        if let Some(mb) = tree_mb(pid, &rows) {
            peak = Some(peak.map_or(mb, |p| p.max(mb)));
        }
        if !matches!(
            rx.recv_timeout(Duration::from_millis(200)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ) {
            break;
        }
    }
    peak
}
fn measure(
    mut cmd: Command,
    sample: impl FnOnce(u32, mpsc::Receiver<()>) -> Option<f64> + Send + 'static,
) -> Result<Run> {
    let stdout = tempfile::tempfile()?;
    let stderr = tempfile::tempfile()?;
    cmd.stdout(stdout.try_clone()?).stderr(stderr.try_clone()?);
    let start = Instant::now();
    let mut child = cmd.spawn()?;
    let pid = child.id();
    let (stop, rx) = mpsc::channel::<()>();
    let sampler = thread::spawn(move || sample(pid, rx));
    let status = child.wait()?;
    let wall_seconds = start.elapsed().as_secs_f64();
    drop(stop);
    let peak_mb = sampler.join().ok().flatten();
    Ok(Run {
        wall_seconds,
        peak_mb,
        rss_sampled: peak_mb.is_some(),
        exit_code: status.code(),
        failed: !status.success(),
        stdout: contents(stdout)?,
        stderr: contents(stderr)?,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wall_clock_excludes_sampler_shutdown() -> Result<()> {
        let mut cmd = Command::new(env::current_exe()?);
        cmd.arg("--list");
        let started = Instant::now();
        let run = measure(cmd, |_, stop| {
            let _ = stop.recv();
            thread::sleep(Duration::from_millis(40));
            Some(10.)
        })?;
        assert!(!run.failed);
        assert_eq!(run.peak_mb, Some(10.));
        assert!(started.elapsed().as_secs_f64() - run.wall_seconds >= 0.035);
        Ok(())
    }
    #[test]
    fn sums_only_live_tree() {
        let rows = [(1, 0, 1024.), (2, 1, 2048.), (3, 2, 1024.), (4, 0, 1024.)];
        assert_eq!(tree_mb(1, &rows), Some(4.));
        assert_eq!(tree_mb(5, &rows), None);
    }
}
