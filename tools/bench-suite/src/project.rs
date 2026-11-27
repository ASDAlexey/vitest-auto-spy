use crate::{Arm, Options, read_json};
use anyhow::{Context, Result, ensure};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::SystemTime,
};

fn command(dir: &Path, name: &str, args: &[&str]) -> Result<String> {
    let out = Command::new(name)
        .current_dir(dir)
        .args(args)
        .output()
        .with_context(|| format!("starting {name}"))?;
    ensure!(
        out.status.success(),
        "{name} {} failed: {}\n{}",
        args.join(" "),
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    Ok(String::from_utf8(out.stdout)?)
}
fn newest(dir: &Path) -> Result<SystemTime> {
    let mut t = SystemTime::UNIX_EPOCH;
    for e in fs::read_dir(dir)? {
        let e = e?;
        t = t.max(if e.file_type()?.is_dir() {
            newest(&e.path())?
        } else {
            e.metadata()?.modified()?
        });
    }
    Ok(t)
}
pub(crate) fn prepare(
    root: &Path,
    work: &Path,
    opts: &Options,
    vitest: &str,
) -> Result<Option<PathBuf>> {
    if opts.coverage != "off"
        && opts.coverage_provider == "istanbul"
        && read_json(&root.join("node_modules/@vitest/coverage-istanbul/package.json"))
            .ok()
            .and_then(|v| v["version"].as_str().map(String::from))
            .as_deref()
            != Some(vitest)
    {
        command(
            root,
            "npm",
            &[
                "install",
                "--no-save",
                "--no-package-lock",
                "--no-audit",
                "--no-fund",
                &format!("@vitest/coverage-istanbul@{vitest}"),
            ],
        )?;
    }
    if opts.ours_source != "dist"
        || !opts
            .arms
            .iter()
            .any(|a| matches!(a, Arm::Ours | Arm::OursProxy))
    {
        return Ok(None);
    }
    let entry = root.join("dist/index.js");
    if !entry.exists() || fs::metadata(entry)?.modified()? < newest(&root.join("src"))? {
        println!("Building dist before timing");
        command(root, "npm", &["run", "build"])?;
    }
    let packed = command(
        root,
        "npm",
        &[
            "pack",
            "--ignore-scripts",
            "--silent",
            "--pack-destination",
            work.to_str().context("non-UTF8 path")?,
        ],
    )?;
    Ok(Some(
        work.join(
            packed
                .lines()
                .last()
                .context("npm pack did not return a filename")?,
        ),
    ))
}
fn factory(arm: Arm, count: usize, source: &str) -> String {
    if matches!(arm, Arm::Manual | Arm::ManualUsed) {
        let n = if arm == Arm::ManualUsed { 3 } else { count };
        let fields = (0..n)
            .map(|i| format!("m{i}: vi.fn()"))
            .collect::<Vec<_>>()
            .join(", ");
        return format!(
            "import {{ vi }} from 'vitest';\nexport function createDouble() {{return {{{fields}}};}}\n"
        );
    }
    let pkg = if arm == Arm::Hirez {
        "@bugsplat/vitest-auto-spies"
    } else if source == "src" {
        "../../../src/index.ts"
    } else {
        "vitest-auto-spy"
    };
    let config = if arm == Arm::OursProxy {
        ", {lazySpies: 'proxy'}"
    } else {
        ""
    };
    format!(
        "import {{ createSpyFromClass }} from '{pkg}';\nimport {{ Subject }} from './subject';\nexport function createDouble() {{return createSpyFromClass(Subject{config});}}\n"
    )
}
pub(crate) fn generate(
    work: &Path,
    opts: &Options,
    arm: Arm,
    size: usize,
    coverage: bool,
    pkg: Option<&Path>,
) -> Result<PathBuf> {
    let dir = work.join(format!("s{size}-{coverage}-{arm:?}"));
    let fixtures = dir.join("fixtures");
    let specs = dir.join("specs");
    fs::create_dir_all(&fixtures)?;
    fs::create_dir_all(&specs)?;
    let methods = (0..opts.methods)
        .map(|i| format!("  m{i}(x: number): number {{return x + {i};}}\n"))
        .collect::<String>();
    fs::write(
        fixtures.join("subject.ts"),
        format!("export class Subject {{\n{methods}}}\n"),
    )?;
    fs::write(
        fixtures.join("double-factory.ts"),
        factory(arm, opts.methods, &opts.ours_source),
    )?;
    for start in (0..size).step_by(10) {
        let tests = (start..size.min(start.saturating_add(10)))
            .map(|id| {
                include_str!("../../../bench/suite-case.ts.in").replace("ID", &id.to_string())
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        fs::write(
            specs.join(format!("suite-{:05}.spec.ts", start / 10)),
            include_str!("../../../bench/suite.spec.ts.in")
                .replace("START", &start.to_string())
                .replace("TESTS", &tests),
        )?;
    }
    fs::write(
        dir.join("package.json"),
        r#"{"name":"bench-suite-project","private":true,"type":"module"}"#,
    )?;
    fs::write(
        dir.join("vitest.config.mts"),
        format!(
            "import {{defineConfig}} from 'vitest/config';\nexport default defineConfig({{test:{{include:['specs/**/*.spec.ts'],environment:'node',globals:false,isolate:{},coverage:{{provider:'{}',reporter:['text-summary'],include:['fixtures/**/*.ts']}}}}}});",
            opts.isolate, opts.coverage_provider
        ),
    )?;
    if arm == Arm::Hirez {
        command(
            &dir,
            "npm",
            &[
                "install",
                "--prefer-offline",
                "--no-save",
                "--legacy-peer-deps",
                "--no-audit",
                "--no-fund",
                "@bugsplat/vitest-auto-spies@1.0.0",
            ],
        )?;
    }
    if matches!(arm, Arm::Ours | Arm::OursProxy)
        && let Some(pkg) = pkg
    {
        unpack(&dir, pkg)?;
    }
    Ok(dir)
}
pub(crate) fn unpack(dir: &Path, pkg: &Path) -> Result<()> {
    let target = dir.join("node_modules/vitest-auto-spy");
    let modules = dir.join("node_modules");
    fs::create_dir_all(&modules)?;
    let staged = tempfile::tempdir_in(modules)?;
    command(
        staged.path(),
        "tar",
        &[
            "-xzf",
            pkg.to_str().context("non-UTF8 tarball path")?,
            "--strip-components=1",
        ],
    )?;
    if target.symlink_metadata().is_ok() {
        fs::remove_dir_all(&target)?;
    }
    fs::rename(staged.path(), target)?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unpack_replaces_previous_package_contents() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let installed = dir.path().join("node_modules/vitest-auto-spy");
        fs::create_dir_all(&installed)?;
        fs::write(installed.join("obsolete.js"), "old")?;
        fs::create_dir(dir.path().join("package"))?;
        fs::write(dir.path().join("package/index.js"), "new")?;
        command(dir.path(), "tar", &["-czf", "build.tgz", "package"])?;
        unpack(dir.path(), &dir.path().join("build.tgz"))?;
        assert!(!installed.join("obsolete.js").exists());
        assert_eq!(fs::read(installed.join("index.js"))?, b"new");
        Ok(())
    }
    #[test]
    fn manual_widths() {
        assert_eq!(
            factory(Arm::Manual, 100, "dist").matches("vi.fn()").count(),
            100
        );
        assert_eq!(
            factory(Arm::ManualUsed, 100, "dist")
                .matches("vi.fn()")
                .count(),
            3
        );
    }
}
