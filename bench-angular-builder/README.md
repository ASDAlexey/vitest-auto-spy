# Angular unit-test builder: Vitest 4 against Vitest 5, with coverage

This directory produces the numbers quoted under
[Vitest 5 under the Angular unit-test builder](https://asdalexey.github.io/vitest-auto-spy/core/performance#vitest-5-under-the-angular-unit-test-builder)
on the Performance page. It measures a whole `ng test --watch=false --coverage` run through the real
`@angular/build:unit-test` builder, not a microbenchmark: a generated Angular workspace is installed three
times with different versions, and each install is run under both coverage providers.

It needs nothing beyond Node and npm. Every arm is installed into a work directory outside this repository
(`<os tmpdir>/vitest-auto-spy-bench-angular-builder` by default), from the **published** `vitest-auto-spy`
tarball on npm, never from this checkout. Nothing here is part of `npm run check`.

## How to run

From the repository root:

```bash
npm run bench:angular-builder                          # the published measurement: 700 specs, 5 rounds. ~15 min on the reference machine
npm run bench:angular-builder -- --files 150           # the supplementary size
npm run bench:angular-builder -- --files 20 --runs 1 --arms B,C --providers v8 --skip-warmup   # smoke, ~1 min
```

The first run of a size installs three arms, about 20 s to a minute each. Later runs reuse them.

| option               | default                                             | what it does                                                  |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `--files <n>`        | `700`                                               | spec files in the generated suite                             |
| `--runs <n>`         | `5`                                                 | measured rounds; every cell runs once per round               |
| `--arms <list>`      | `A,B,C`                                             | which arms to run                                             |
| `--providers <list>` | `v8,istanbul`                                       | which coverage providers to run                               |
| `--skip-warmup`      | off                                                 | skip the discarded warm-up run per cell                       |
| `--start <n>`        | `1`                                                 | first round number, to add rounds to an existing series       |
| `--lib <version>`    | `5.34.0`                                            | the published `vitest-auto-spy` to install; `latest` works    |
| `--seed <n>`         | `20260926`                                          | generator seed                                                |
| `--work <dir>`       | `<os tmpdir>/vitest-auto-spy-bench-angular-builder` | where arms, logs and results go                               |
| `--reinstall`        | off                                                 | regenerate and reinstall the arms even if they are up to date |
| `--setup-only`       | off                                                 | install the arms and stop                                     |

Measured runs are appended to `<work>/results/runs-<files>.jsonl`, warm-ups to `warmup-<files>.jsonl`, the
full `ng test` output and the `/usr/bin/time` output of every run to `<work>/logs/<files>/`. The median table
is printed at the end. Delete the results file to start a new series.

The pieces also run on their own:

```bash
node bench-angular-builder/gen.mjs <dir> <files> [seed]            # the workspace only
node bench-angular-builder/setup-arm.mjs <A|B|C> <files>           # one arm, installed
node bench-angular-builder/run-once.mjs <armDir> <v8|istanbul|none> <label> <logDir>   # one run, one JSON line
node bench-angular-builder/analyze.mjs <runs-N.jsonl>              # medians and deltas
node bench-angular-builder/phase-timing.mjs <armDir> <v8|istanbul> # diagnostic phase split
```

`run-once.mjs … none` runs with `--no-coverage`. It is a diagnostic that separates the test stage from
coverage and is never a counted run.

## The arms

| arm | `@angular/core`, `compiler-cli` | `@angular/build`, `@angular/cli` | `vitest`, `@vitest/coverage-*` |
| --- | ------------------------------- | -------------------------------- | ------------------------------ |
| A   | 22.1.8                          | 22.1.9                           | 4.1.11                         |
| B   | 22.2.0                          | 22.2.0                           | 4.1.11                         |
| C   | 22.2.0                          | 22.2.0                           | 5.0.2                          |

Everything else is pinned the same in every arm: `jsdom` 30.1.1, `typescript` 6.0.3, `rxjs` 7.8.2, `tslib`
2.8.1. B against C is the Vitest upgrade alone; A against B is the Angular upgrade alone. `ng new` 22.1 would
generate `jsdom ^28`; holding it at 30.1.1 keeps A about Angular and Vitest, not jsdom. Each arm writes the
resolved versions from its own `package-lock.json` to `versions.json`.

## Method

- **Workspace.** `gen.mjs` mirrors `ng new` 22.2.0 `--defaults`: zoneless, the `ng new` tsconfigs with
  `strict` and `strictTemplates`, `test.builder = @angular/build:unit-test` with the builder's defaults
  (runner vitest, environment jsdom, `isolate: false`), plus `setupFiles: ["src/test-setup.ts"]`. The setup
  file only imports `vitest-auto-spy/angular` and `vitest-auto-spy/rxjs`.
- **Suite.** Deterministic from the seed; the `src/` trees are byte-identical across arms. 40 root services,
  each injecting `HttpClient` with 6–12 methods, form the dependency pool. At 700 spec files:
  - 370 services, each with 3–6 dependencies through `provideAutoSpy` and `injectSpy`, 17 tests each, using
    `mockReturnValue`, `calledWith`, `nextWith`, `nextOneTimeWith`, `resolveWith`, `rejectWith`, `throwWith`
    and signals;
  - 251 standalone components with 2–4 spied services, signals, `computed`, `input()` and
    `@if` / `@else if` / `@for` / `@empty`, rendered through `TestBed` and `whenStable()`, 16 tests each;
  - 36 pipes and 43 functional guards (with `provideRouter`), 15 tests each.

  11 491 tests in all. A smaller `--files` is a prefix of the same sequence: 150 files are the first 150 of
  the 700.

- **Coverage provider.** The builder has no provider option and picks v8 when both packages are installed.
  Both providers are therefore selected the same way, through `--runner-config=vitest-<provider>.config.mts`,
  a file whose only setting is `test.coverage.provider`. Every arm has both coverage packages.
- **Command.** `node node_modules/@angular/cli/bin/ng.js test --watch=false --coverage --runner-config=…`
  under `/usr/bin/time` (`-l` on macOS, `-v` on Linux). `CI` is unset, so the builder's persistent cache is
  warm after the warm-up run, in every arm alike.

## Protocol

- Every cell (arm × provider) gets one discarded warm-up run, then 5 measured runs.
- Runs are interleaved round-robin over the six cells, with the order rotated each round, so background load
  lands on every cell alike.
- **Wall time:** a monotonic clock around the whole `ng` process.
- **Peak RSS, tree:** the sum of RSS over the `ng` process and all its descendants (the Vitest workers, 18
  processes at the peak on the reference machine), sampled with `ps` every 200 ms. The sum counts shared pages
  once per process, so it overstates physical memory, by the same amount in every arm; it is for comparing
  arms only.
- **Peak RSS, main:** `/usr/bin/time` maximum resident set size, the `ng` process alone.
- A run counts only with exit code 0 and every test passed; the table's `all passed` column checks it.
- Medians are reported; spread is (max − min) / median.

## Published results

Measured 2026-09-26 on an Apple M4 Max (16 cores, 12 performance + 4 efficiency), 64 GB RAM, macOS 26.6.2,
Node v24.19.0, npm 11.17.0, `vitest-auto-spy` 5.34.0. The raw runs behind these tables are in
[`results/`](./results).

### 700 spec files, 11 491 tests, n = 5 per cell

| arm           | provider | wall s median (min–max, spread) | tree RSS MB | main RSS MB |
| ------------- | -------- | ------------------------------- | ----------- | ----------- |
| A (22.1 + V4) | v8       | 16.83 (15.98–17.91, 11.5 %)     | 6850        | 1131        |
| B (22.2 + V4) | v8       | 16.50 (16.01–17.41, 8.5 %)      | 7239        | 1422        |
| C (22.2 + V5) | v8       | 8.91 (8.02–9.32, 14.6 %)        | 7110        | 1435        |
| A (22.1 + V4) | istanbul | 38.37 (36.17–42.72, 17.1 %)     | 7136        | 2251        |
| B (22.2 + V4) | istanbul | 37.07 (35.44–37.64, 5.9 %)      | 7195        | 2272        |
| C (22.2 + V5) | istanbul | 23.92 (23.10–24.60, 6.3 %)      | 7374        | 2206        |

| provider | C against B (Vitest 5 alone)      | C against A (both upgrades)   | B against A (Angular alone)  |
| -------- | --------------------------------- | ----------------------------- | ---------------------------- |
| v8       | wall **−46.0 %**, tree RSS −1.8 % | wall −47.1 %, tree RSS +3.8 % | wall −2.0 %, tree RSS +5.7 % |
| istanbul | wall **−35.5 %**, tree RSS +2.5 % | wall −37.7 %, tree RSS +3.3 % | wall −3.4 %, tree RSS +0.8 % |

The ranges do not overlap between B and C: the slowest C run (9.32 s v8, 24.60 s istanbul) is below the
fastest B run (16.01 s, 35.44 s). The three cells with a spread above 10 % each owe it to one outlier under
background load.

### 150 spec files, 2 454 tests, n = 5 per cell

| arm | provider | wall s median (min–max, spread) | tree RSS MB | main RSS MB |
| --- | -------- | ------------------------------- | ----------- | ----------- |
| A   | v8       | 4.21 (3.98–4.42, 10.5 %)        | 5141        | 692         |
| B   | v8       | 4.19 (3.97–4.21, 5.7 %)         | 5578        | 1024        |
| C   | v8       | 3.54 (3.53–3.78, 7.1 %)         | 5728        | 1017        |
| A   | istanbul | 7.48 (7.06–7.53, 6.3 %)         | 5340        | 934         |
| B   | istanbul | 7.52 (7.05–7.55, 6.6 %)         | 5516        | 1115        |
| C   | istanbul | 6.19 (6.16–6.40, 3.9 %)         | 5676        | 1102        |

C against B: −15.5 % (v8), −17.7 % (istanbul). A 150-file run carries 2.5–3 s of fixed bundling and `ng`
start-up, so the part Vitest 5 shortens is a smaller share of it.

### Where the time goes

Diagnostic runs, not part of the medians:

- **Without coverage there is no gain.** Three `--no-coverage` runs per arm at 700 files: B 6.16 s, C 5.97 s
  at the median.
- **Phase split** (`phase-timing.mjs`, two runs per cell, raw data in `results/phase-timing-*.jsonl`):

  | cell       | RUN banner → last test line | last test line → summary (coverage collection and merge) |
  | ---------- | --------------------------- | -------------------------------------------------------- |
  | B v8       | 3.8 / 4.1 s                 | 9.3 / 9.2 s                                              |
  | C v8       | 4.2 / 4.6 s                 | 1.1 / 1.2 s                                              |
  | B istanbul | 27.7 / 27.1 s               | 9.4 / 8.0 s                                              |
  | C istanbul | 16.1 / 19.6 s               | 5.6 / 6.3 s                                              |

  With v8 the tests finish at the same moment on both majors; Vitest 4 then spends about 9 s converting and
  merging the V8 coverage, Vitest 5 about 1 s. With istanbul both phases shrink.

- **Memory does not move** with Vitest 5. The main `ng` process grows about 26 % from A to B, which is
  Angular 22.2, not Vitest.

## Caveats

- One machine, and not a quiet one: the 1-minute load average was 5–8 from other processes, recorded per run
  in `load1_before`. Interleaving spreads that load across cells, but absolute times will differ elsewhere.
  On a CI runner with fewer cores the coverage share of a run is likely larger; that is not measured here.
- The suite is synthetic. Its size and shape (700 files, about 11.5k tests, services and components with
  spied dependencies) follow real consumer suites, but no real suite was run.
- The builder cache is warm, as in local development. With `CI=true` the cache is off; bundling is 2.5–3 s of
  every run in every arm, so a cold cache adds a constant and makes the percentages slightly smaller.
- The published numbers were taken with an earlier Python/bash version of these scripts, which stopped the
  wall clock at the first 200 ms poll after the process exited. `run-once.mjs` stops it on the exit event, so
  its wall times can come out up to about 0.2 s lower per run, in every cell alike. Generator output, arms,
  commands and the analysis are identical: `analyze.mjs` reproduces the tables above from `results/`
  byte for byte.

## Files

- `run.mjs` — the whole measurement; what `npm run bench:angular-builder` runs.
- `gen.mjs` — the deterministic workspace and suite generator.
- `setup-arm.mjs` — packs the published `vitest-auto-spy`, generates one arm, writes its pinned
  `package.json` and runner configs, installs it, records `versions.json`.
- `run-once.mjs` — one measured run, one JSON line.
- `analyze.mjs` — medians, spreads and deltas.
- `phase-timing.mjs` — the diagnostic phase split.
- `common.mjs` — arm versions, cell order, the `ng test` command line.
- `results/` — the raw runs behind the published tables: `runs-*.jsonl`, `warmup-*.jsonl`,
  `phase-timing-*.jsonl`.
