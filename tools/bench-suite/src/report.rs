use crate::{Arm, Options, measure::Run};
use serde_json::{Value, json};

fn median(mut nums: Vec<f64>) -> Option<f64> {
    nums.sort_by(f64::total_cmp);
    let n = nums.len();
    if n == 0 {
        None
    } else {
        Some((nums[(n - 1) / 2] + nums[n / 2]) / 2.)
    }
}
fn comparison(ours: &[Run], other: &[Run], required: usize) -> (Vec<(usize, f64)>, Option<f64>) {
    let pairs = ours
        .iter()
        .zip(other)
        .enumerate()
        .filter(|(_, (a, b))| !a.failed && !b.failed && a.wall_seconds > 0.)
        .map(|(i, (a, b))| (i + 1, b.wall_seconds / a.wall_seconds))
        .collect::<Vec<_>>();
    let ratio = if pairs.len() == required {
        median(pairs.iter().map(|p| p.1).collect())
    } else {
        None
    };
    (pairs, ratio)
}
pub(crate) fn summarize(
    opts: &Options,
    size: usize,
    coverage: bool,
    samples: &[Vec<Run>],
) -> (Vec<Value>, Vec<Value>) {
    let mut cells = vec![];
    let mut rounds = vec![];
    let ours = opts.arms.iter().position(|a| *a == Arm::Ours);
    println!(
        "\n{size} tests | coverage {} | {} paired rounds required\n\n| arm | wall median (s) | peak tree RSS median (MiB) | median paired ratio vs ours | successful pairs |\n| --- | ---: | ---: | ---: | ---: |",
        if coverage {
            &opts.coverage_provider
        } else {
            "off"
        },
        opts.repeats
    );
    for (&arm, runs) in opts.arms.iter().zip(samples) {
        let ok = runs.iter().filter(|r| !r.failed).collect::<Vec<_>>();
        let times = ok.iter().map(|r| r.wall_seconds).collect::<Vec<_>>();
        let wall = median(times.clone());
        let rss = median(ok.iter().filter_map(|r| r.peak_mb).collect());
        let mut label = "—".to_string();
        let mut pairs_count = None;
        let mut ratio = None;
        if arm != Arm::Ours
            && let Some(i) = ours
        {
            let (pairs, r) = comparison(&samples[i], runs, opts.repeats);
            pairs_count = Some(pairs.len());
            ratio = r;
            label = r
                .map(|n| format!("{n:.3}×"))
                .unwrap_or_else(|| "inconclusive".into());
            for (round, v) in pairs {
                rounds.push(json!({"size":size,"coverage":coverage,"round":round,"arm":arm,"ratioVsOurs":v}));
            }
        }
        println!(
            "| {} | {} | {} | {} | {} |",
            arm.label(),
            wall.map_or_else(|| "FAIL".into(), |n| format!("{n:.3}")),
            rss.map_or_else(|| "not sampled".into(), |n| format!("{n:.0}")),
            label,
            pairs_count.map_or_else(|| "—".into(), |n| n.to_string())
        );
        cells.push(json!({
            "size":size, "arm":arm, "coverage":coverage,
            "coverageProvider":coverage.then_some(&opts.coverage_provider),
            "isolate":opts.isolate, "methods":opts.methods, "oursSource":opts.ours_source,
            "repeats":opts.repeats, "failures":runs.len()-ok.len(), "runs":runs,
            "wallMedian":wall, "wallMin":times.iter().copied().reduce(f64::min),
            "wallMax":times.iter().copied().reduce(f64::max),
            "rssMedian":rss, "rssSampled":rss.is_some(),
            "pairedRounds":pairs_count, "pairedRatioMedian":ratio
        }));
    }
    println!(
        "\nRatios below 1 favor the listed arm. Missing pairs are inconclusive; RSS is sampled separately and may miss short peaks."
    );
    (cells, rounds)
}
#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;
    fn runs(values: &[Option<f64>]) -> Vec<Run> {
        values
            .iter()
            .map(|n| Run {
                failed: n.is_none(),
                wall_seconds: n.unwrap_or_default(),
                peak_mb: None,
                rss_sampled: false,
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
            })
            .collect()
    }
    #[test]
    fn never_compares_mismatched_or_incomplete_rounds() {
        let a = runs(&[None, Some(2.)]);
        let b = runs(&[Some(3.), None]);
        assert_eq!(comparison(&a, &b, 2), (vec![], None));
        assert_eq!(comparison(&a, &a, 2), (vec![(2, 1.)], None));
    }
    #[test]
    fn opposite_coverage_results_and_missing_competitor() {
        let opts = Options::parse_from([
            "bench-suite",
            "--arms",
            "ours,hirez,manual",
            "--repeats",
            "2",
        ]);
        for (coverage, time, ratio) in [(true, 2., 2.), (false, 0.5, 0.5)] {
            let (cells, pairs) = summarize(
                &opts,
                10,
                coverage,
                &[
                    runs(&[Some(1.); 2]),
                    runs(&[Some(time); 2]),
                    runs(&[None; 2]),
                ],
            );
            assert_eq!(cells[1]["pairedRatioMedian"], ratio);
            assert!(cells[2]["pairedRatioMedian"].is_null());
            assert_eq!(cells[2]["failures"], 2);
            assert_eq!(pairs.len(), 2);
            assert!(pairs.iter().all(|r| r["coverage"] == coverage));
        }
        let (cells, pairs) = summarize(
            &opts,
            10,
            true,
            &[runs(&[Some(1.); 2]), runs(&[None; 2]), runs(&[Some(3.); 2])],
        );
        assert!(cells[1]["wallMedian"].is_null());
        assert!(cells[1]["pairedRatioMedian"].is_null());
        assert_eq!(cells[1]["pairedRounds"], 0);
        assert!(pairs.iter().all(|p| p["arm"] != "hirez"));
    }
}
