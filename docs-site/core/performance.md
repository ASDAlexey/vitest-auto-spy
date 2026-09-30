---
title: Performance
description: What each factory costs, which settings make a slow or memory-hungry suite faster, and the measurements behind each claim.
---

# Performance

This page holds the measurements: what a spy costs in time and memory, and which settings change a
suite's speed. Spy construction is almost never why a suite is slow. The summary below says where the
time and memory go and which knobs matter.

## Summary

A **double** is the object a test uses in place of a real dependency; its methods are **spies**. A
double is "untouched" when the test calls none of its methods.

**What is fast.** Building a double takes a few microseconds, so spies are not what slows a suite.

| Question                       | Short answer                                                                                       | Details                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| How long does a double take?   | About 2 µs for a 10-method class, 6 µs for 40 methods, when a test calls two or three methods.     | [Measured](#measured)                                                 |
| Which factory should I use?    | `provideAutoSpy` on Angular, `createSpyFromClass` elsewhere, called in `beforeEach`.               | [What to reach for](#what-to-reach-for)                               |
| Is it faster than other libs?  | Per double, 2–11× faster; across a whole suite, about 1.5× faster than the jest-auto-spies family. | [Against other libraries](#against-other-libraries)                   |
| Where does a slow suite spend? | In `TestBed`: one environment per file, rendering child components, the worker count.              | [What actually makes a suite slow](#what-actually-makes-a-suite-slow) |

**What costs memory.** Under `isolate: false`, every double a file builds stays alive until the run
ends. This is how `isolate: false` works, not a leak. With it, memory, not time, is what runs out
first.

| Question                             | Short answer                                                                                          | Details                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| What does one untouched double hold? | Under 300 B, however wide the class is.                                                               | [Retained memory per double](#retained-memory-per-double)    |
| What does a called method hold?      | About 1.1 kB, against 5.8 kB for a hand-written `vi.fn()`.                                            | [What a single spy costs](#what-a-single-spy-costs)          |
| What happens across a big suite?     | 10 000 tests, 100-method class: peak RSS 2.1 GB with the library, 6.4 GB with hand-written `vi.fn()`. | [Memory under `isolate: false`](#memory-under-isolate-false) |
| Does the Node version change memory? | Yes: on the same suite Node 26 peaks about 15 % lower than Node 24.                                   | [Which Node version](#which-node-version)                    |

**Which knobs matter**, largest effect first:

| Knob                                                                              | Effect                                                                                                      | Details                                                                             |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Vitest 5 under the Angular builder, with coverage on                              | 46 % less wall time with v8 coverage, 35.5 % with istanbul; none without                                    | [Vitest 5 under the Angular builder](#vitest-5-under-the-angular-unit-test-builder) |
| On Vitest 4, coverage with many include globs: upgrade to 5, or wrap the provider | Coverage phase 229.59 s → 22.88 s on one measured shard                                                     | [Coverage matching on Vitest 4](#coverage-matching-on-vitest-4)                     |
| One shared environment (`isolate: false` + `fileParallelism: false`)              | jsdom and `TestBed` set up once per run, not per file; memory becomes the limit                             | [One environment](#_1-one-environment-instead-of-one-per-file)                      |
| `renderShallow` for components with many children                                 | 3.85× at 100 children, 17.5× at 400; slower on a leaf component                                             | [Rendering the child subtree](#_2-rendering-the-child-subtree)                      |
| Node 26 (or 24), plus `NODE_COMPILE_CACHE`                                        | Cold import twice as fast as Node 22; the cache cuts imports by a third, but does nothing under v8 coverage | [Which Node version](#which-node-version), [compile cache](#node-s-compile-cache)   |
| Leave `lazySpies` unset                                                           | The default picks the lighter double; `lazySpies: false` costs memory                                       | [The two settings that cost](#the-two-settings-that-cost)                           |
| `strayTimers` and `documentPollution: { nodes: true }`                            | Small per-test costs that add up on large suites                                                            | [The two settings that cost](#the-two-settings-that-cost)                           |

To find the slow files in your own suite, see
[Finding your own number 1, 2 and 3](#finding-your-own-number-1-2-and-3).

All figures come from one machine (Apple M4 Max). Read the ratios, not the absolute times. Each table
states its date and versions.

## What actually makes a suite slow

Spy construction is not it: see [Measured](#measured). Three Angular-shaped costs are:

1. an environment per test file;
2. the child subtree of every component a spec renders;
3. the worker count.

The second has a benchmark of its own, and its tables are below. The first and third have none
yet, so their sections give the mechanism and the config.

### 1. One environment instead of one per file

By default each test file gets its own environment. A shared one pays for jsdom and the zoneless
`TestBed` once per run instead of once per file. The saving is per file, so it grows with the suite.

With the Angular unit-test builder (`ng test`), `isolate: false` is already the default. Add only
`fileParallelism: false`, in a Vitest config file you pass to `ng test` with `--runner-config`.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    isolate: false, // already the default under the Angular unit-test builder
    fileParallelism: false, // forces maxWorkers to 1: every file shares one environment
  },
});
```

**Under a memory cap**, measure peak RSS before you keep this mode. It holds every double of every
file until the run ends. If the peak nears the limit, keep file parallelism and lower `maxWorkers`
instead: each worker then holds only its own files. Library settings change the peak little; see
[Memory under `isolate: false`](#memory-under-isolate-false).

Two things are easy to get wrong:

- **`fileParallelism: false` is the lever, not `isolate: false`.** Flipping `isolate` alone, with
  the default worker pool, does not remove the per-file cost. Landing every file in one worker does.
  `isolate: false` makes that mode safe to leave on, together with
  [`setupAutoSpy()`](../utilities/setup), the library's setup-file helper that cleans shared state
  between tests.
- **`poolOptions: { threads: { singleThread: true } }` does nothing on Vitest 4.** Vitest logs
  `was removed in Vitest 4` and ignores it. Use the top-level `fileParallelism: false`.

The mode has two risks the clock does not show. Anything that patches `TestBed` once per worker
outlives the file that asked for it. A load-time failure is reported against every file in the
worker. Read [Vitest → Isolation](../runtimes/vitest#isolation) before you copy the config.

Two helpers are cheaper in a shared worker, where a per-file cost becomes a per-run cost:

- `setupAngularTestEnv()` remembers which testing environment the worker is on. It no longer tears
  down and re-initialises the environment for every spec file.
- A second `installProxyZonePatch()` call does nothing. It used to add a Proxy layer per spec file,
  so two hundred files left two hundred layers on every zone operation.

On a small suite, Vitest's own start-up dominates and the mode barely helps. This library's suite
has 107 files and 1 697 tests. On Node 24 it takes 4.05 s, and only 1.8–1.9 s of that is the tests.
The rest is start-up, transform and teardown, which a shared environment removes per file.

The measured effect of `isolate: false` on memory and time is in
[Memory under `isolate: false`](#memory-under-isolate-false).

### 2. Rendering the child subtree

[`renderShallow`](../adapters/angular#shallow-component-rendering) creates the component through the
real `TestBed`, without its children and without its template.

```ts
import { renderShallow } from 'vitest-auto-spy/angular';

const view = renderShallow(DashboardComponent); // no child components, no template
const withTemplate = renderShallow(DashboardComponent, { keepTemplate: true });
```

Its cost does not depend on the number of children, because it never builds the subtree.
`TestBed.createComponent` grows linearly with them. So the saving is not a fixed percentage. It is
as large as the markup the component owns.

The benchmark renders a host component with an `@for` of a minimal child. Each arm runs the full
per-test cycle: `resetTestingModule`, `configureTestingModule`, `createComponent` and the first
change detection.

| Child instances | `TestBed.createComponent` | `renderShallow` | ratio |
| --------------: | ------------------------: | --------------: | ----: |
|               0 |                  0.487 ms |        0.619 ms | 0.79× |
|              25 |                  0.762 ms |        0.470 ms | 1.62× |
|             100 |                  1.757 ms |        0.457 ms | 3.85× |
|             400 |                  7.047 ms |        0.403 ms | 17.5× |

Read the first row first: with no children, `renderShallow` is **slower**. There is no subtree to
skip, and the per-test `overrideComponent` is pure cost. On a table or a dashboard the saving is
large.

Median of 60 reps per arm, five passes merged by median, Node v24.19.0, **Angular 22 and Vitest 5**,
2026-09-10. A second five-pass run gave 0.80× / 1.50× / 3.89× / 16.4×. Read the ratios with that
spread: per-arm rme runs from ±4 % to ±24 %. The zero-children row is the noisiest: in the committed baseline
it straddles 1.0, at ±16 % against ±3 % for 100 children.

Where the time goes on the 100-child shape:

| Step of the cycle                                                       |   median |
| ----------------------------------------------------------------------- | -------: |
| Full per-test cycle: reset + configure + `createComponent` + CD         | 1.556 ms |
| `resetTestingModule()` alone                                            | 0.001 ms |
| `resetTestingModule()` + `configureTestingModule()`                     | 0.001 ms |
| `createComponent` + CD on an **already-configured** module              | 1.277 ms |
| `configureTestingModule` + `overrideComponent` + `createComponent` + CD | 0.365 ms |
| `compileComponents()` on a standalone AOT bed                           | 0.002 ms |

`configureTestingModule` compiles nothing: it records metadata and returns. Reset and configure are
**0.06 %** of the cycle. Reusing a configured bed across tests recovers only 18 %. Nearly all the
cycle is `createComponent` plus the first change detection building the children. That is the part
`renderShallow` removes.

This trade is worth it because [a spec rarely asserts on the child templates](../recipes). A test
that reads component state pays for the subtree and gets nothing back.

The per-render ratio is an upper bound for a spec file, not a prediction. A file also pays for
imports, the `TestBed` module and the assertions. Use
[`enableTestBedDiagnostics()`](../adapters/angular#where-a-spec-spends-its-time) to find the files
where rendering is the cost.

**On a real suite.** Three of the most expensive component specs of a private Angular 22 zoneless
suite (784 specs, the AOT unit-test builder) were converted. The ten-file batch ran three times;
medians, same machine:

| Spec (479 tests in the batch, all still green) | Before |  After |   Change |
| ---------------------------------------------- | -----: | -----: | -------: |
| a container with a deep child tree (34 tests)  | 129 ms |  61 ms | **2.1×** |
| a list rendering 58 fixtures                   | 133 ms |  75 ms | **1.8×** |
| a small leaf component (20 tests)              |  29 ms |  38 ms | **0.8×** |
| the three together                             | 291 ms | 174 ms | **1.7×** |

The leaf component got slower, as the benchmark predicts: there is no subtree to remove.

**It moves branch coverage off the compiled component.** `renderShallow` changes the component
through `TestBed.overrideComponent`, which recompiles it under JIT for the rest of the spec file.
That happens with `keepTemplate: true` too, because the children still have to go. The AOT
template and host-binding branches then drop out of coverage. A later plain render in the same file
does not bring them back. On an 850-spec suite that was about 310 branches, enough to fail a 90 %
gate.

Where those branches matter, keep one real `TestBed.createComponent` render per component, before
any `renderShallow` of it in the file. A module-declared component under `keepTemplate: true` needs
no override, and none is issued.

#### The middle rung, `keepTemplate: true`

A spec that needs a `viewChild`, content projection or a host binding needs the component's own
template. That does not mean paying for the whole tree. With `keepTemplate: true`, `renderShallow`
keeps the component's own pipes and directives and drops only the child _components_. The template
renders, and each child component in it resolves to nothing under `NO_ERRORS_SCHEMA`.

So there are three rungs. On the same 100-child shape:

| Rung                                    |   median | vs full cycle |
| --------------------------------------- | -------: | ------------: |
| `TestBed.createComponent`, full cycle   | 1.558 ms |             — |
| `renderShallow({ keepTemplate: true })` | 1.211 ms |         1.29× |
| `renderShallow()`                       | 0.356 ms |         4.38× |

The middle rung saves exactly what the children cost. This benchmark's child has one element and one
binding, so 1.29× is a floor. A second five-pass run gave 1.24× and 3.89×. Expect roughly 1.2–1.3× on
a minimal child, and more on a real one.

Use the middle rung when the spec reads something the template creates. Use `keepChildren` for the
few children the spec needs resolved.

::: warning Before 5.4.0 this dropped the whole scope
`keepTemplate: true` used to drop the template's pipes and directives too. A `{{ value | shout }}`
threw `NG0302`, and an attribute directive silently never applied. The spec stayed green over
behaviour that never ran. The table above measures the fixed version. That is why it is slower
than an older edition of this page.
:::

### 3. Worker count

This applies when files still run in parallel, without `fileParallelism: false`. Each worker
re-imports the whole module graph and shares that work with nobody. So more workers stop helping
early, and each one adds memory. Measure before you raise `maxWorkers`: the default is not
automatically right.

### Finding your own number 1, 2 and 3

The three costs above differ per suite. Two Vitest 4.1 flags measure them on **yours**. Neither is
part of this library.

- **`experimental.importDurations: { limit, print }`** names the imports a spec file waits on,
  with a threshold and an optional failure. It shows whether a file's cost is `TestBed`, the
  doubles, or one heavy barrel import the spec never uses. On Angular suites it is usually the
  barrel import.
- **`experimental.preParse`** (4.1.3) moves parsing off the critical path at start-up.

[`enableTestBedDiagnostics()`](../adapters/angular#where-a-spec-spends-its-time) reports the
per-file cost from inside `TestBed`. Use the Vitest flags to find which files are expensive. Use the
diagnostics to find where the time goes inside one of them.

### The perf gate on a slower machine

The [`perf --gate`](../utilities/cli#the-gate) budget is counted in the median test of the same run.
So a laptop and a runner nine times slower give the same verdict. Measured on a 2 023-file
consumer suite, slowed down artificially:

| Slowdown | Files flagged by the old fixed-time rule | Files flagged by the gate |
| -------: | ---------------------------------------: | ------------------------: |
|       ×1 |                                        0 |                         0 |
|       ×3 |                                        4 |                         0 |
|       ×6 |                                        8 |                         0 |
|       ×9 |                                       19 |                         0 |

The old rule compared a file with a fixed floor (5 s) and ten times the median **file**. In that suite
the median file was 8.9 ms and five tests, so the floor decided alone. It flagged the largest files,
such as a 209-test service spec at 5 ms a test. One component spec took 0.96 s on its own on a laptop
and 5.62 s on CI: green on one, red on the other. The per-test rule flags nothing at any slowdown;
the heaviest file adds up to 742 median tests against the 2 000 it would take.

### What the doctor and perf findings measured

The [`doctor` and `perf` findings](../utilities/cli) state a conclusion. The measurements behind them:

| Finding                             | Measured                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `angular-build-happy-dom`           | 700-file Angular 22.2 suite: 4.6 % less wall time, 6 % less resident memory                                                                                                                  |
| `angular-cache-off-in-ci`           | 700-file suite: +2.91 s (+33 %) per run with the builder cache off                                                                                                                           |
| `runner-dom-differs-from-builder`   | 48-file Angular suite with `environment: 'happy-dom'`: 1.37 s → 1.10 s (−20 %)                                                                                                               |
| `perf-environment-engine`           | this package's 117 Angular files: 26.5 s → 23.2 s user CPU (−12 %); a DOM-only spec: 253 → 119 ms of environment per file                                                                    |
| `perf-workers`                      | 1.42 GB plus ~155 MB per worker; capping at half the cores: 13.50 s against 13.13 s (+2.8 %) for 3.7 GB instead of 5.8 GB                                                                    |
| `perf-isolation`                    | a suite with over 30 % overhead: `isolate: false` 0 % faster, the work moved into the files; a 30-file jsdom project: 1.13 s → 583 ms (`--ab-isolate`)                                       |
| environment counted once per worker | a 672-file shard on 13 workers reported 126.4 s of environment against 2.44 s actually spent                                                                                                 |
| a bare run that is not your suite   | one workspace: 1 830 files, 29 s of wall clock, 0 test bodies executed                                                                                                                       |
| `ng-test --shard`                   | 700 specs, coverage, builder cache off: slower shard 7.58 s against 11.21 s for the whole run; a `test.shard` from the runner config took 9.38 s, because every shard compiled all 700 specs |
| `perf-heap`                         | `@sentry/angular` alone is about 7.5 MB of heap                                                                                                                                              |
| `enableAngularDiagnostics()`        | 1759-file Angular suite: real defects in 25 files and 324 tests; full run 12.5 s with it against 13.4 s, nothing measurable                                                                  |

### Vitest 5 under the Angular unit-test builder

With coverage on, upgrading the runner is the one lever that needs no change to a spec.
`@angular/build` 22.2.0 is the first release whose `@angular/build:unit-test` accepts Vitest 5. Its
peer range is `^4.0.8 || ^5.0.0`; before 22.2.0 it stopped at `^4`.

The suite: Angular 22.2, 700 spec files, 11 491 tests, built on this library. Only the builder's
runner changed, from Vitest 4.1.11 to 5.0.2:

| coverage provider          | Vitest 4.1.11 | Vitest 5.0.2 |                  wall time |
| -------------------------- | ------------: | -----------: | -------------------------: |
| v8 (the builder's default) |       16.50 s |   **8.91 s** | **−46.0 %** (1.85× faster) |
| istanbul                   |       37.07 s |  **23.92 s** | **−35.5 %** (1.55× faster) |

Where the gain comes from:

- **Without coverage there is no gain**: 6.16 s against 5.97 s at the median. Tests run at the same
  speed on both majors. Vitest 5 shortens coverage processing.
- **With v8**, the last test finishes at the same moment on both. Then Vitest 4 spends about 9.3 s
  converting and merging coverage; Vitest 5 spends about 1.1 s.
- **With istanbul**, both phases shrink. The instrumented run goes from about 27 s to 16–20 s, the
  merge from 8–9 s to about 6 s.
- **Angular 22.1 → 22.2 alone is noise**: −2.0 % (v8) and −3.4 % (istanbul) on Vitest 4.
- **The gain grows with the suite.** At 150 spec files (2 454 tests) it is −15.5 % (v8) and −17.7 %
  (istanbul). A small run has 2.5–3 s of fixed bundling and `ng` start-up that Vitest 5 does not
  touch.
- **Memory does not move.** Peak RSS of the process tree changes by −1.8 % (v8) and +2.5 %
  (istanbul), within noise.

**How it was measured.**

| Aspect    | Setup                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace | mirrors `ng new` 22.2.0 `--defaults`: zoneless, jsdom, builder defaults (`isolate: false` included), `strict`, `strictTemplates`                                                                                        |
| Setup     | one setup file importing `vitest-auto-spy/angular` and `vitest-auto-spy/rxjs`; `vitest-auto-spy` 5.34.0 from the npm tarball                                                                                            |
| Suite     | generated in the shape of real suites: 370 services with 3–6 dependencies via `provideAutoSpy` and `injectSpy`, 251 standalone components rendered through `TestBed` and `whenStable()`, 36 pipes, 43 functional guards |
| Command   | `ng test --watch=false --coverage`; a runner config file (`--runner-config`) whose only line is `test.coverage.provider`                                                                                                |
| Runs      | one discarded warm-up and 5 measured runs per cell, interleaved, median reported                                                                                                                                        |
| Machine   | Apple M4 Max, 16 cores, Node v24.19.0, 2026-09-26                                                                                                                                                                       |

The ranges do not overlap. The slowest Vitest 5 run (9.32 s v8, 24.60 s istanbul) beat the fastest
Vitest 4 run (16.01 s, 35.44 s). The generator, the setup and the raw runs are in the
[builder benchmark sources](https://github.com/ASDAlexey/vitest-auto-spy/tree/master/bench-angular-builder).

**What it does not show.** It is one busy machine, so read the ratios rather than the seconds. The
suite is synthetic: it matches real suites in shape and size, but those were not run. The builder
cache was warm, as in local development. With `CI=true` the builder cache is off, which adds the same
2.5–3 s to every run and lowers the percentage slightly. A CI runner with fewer cores was not
measured.

**Taking it:**

- `@angular/build` (and `@angular/cli`) **22.2.0 or newer**.
- `vitest` and every `@vitest/coverage-*` package on 5, **upgraded together**. A coverage package
  pins `vitest` to its own exact version.
- On Analog, `@analogjs/vite-plugin-angular` and `@analogjs/vitest-angular` **2.7.5 or newer**.
- No npm `overrides`: the peer ranges already admit Vitest 5.
- Vitest 5 turns `clearMocks` on by default. The one spec pattern that breaks, and the fix, are in
  [Vitest → The one thing that can still break your specs](../runtimes/vitest#the-one-thing-that-can-still-break-your-specs).
  The 11 491 tests above needed no change, because `provideAutoSpy` creates every spy per test.

None of this is required. The library supports Vitest 2.1+ and Angular 20+, and an older
`@angular/build` keeps working as it is.

#### Without Angular

On a plain suite, the runner upgrade alone helps less, and the spy engine adds to it. 40 spec files,
800 tests, 400 spied methods per file, v8 coverage on, Node v24.19.0, median of five runs,
2026-09-06, identical library source:

| Suite                                                        | Vitest 4.1.11 | Vitest 5.0.0 |
| ------------------------------------------------------------ | ------------: | -----------: |
| this library's spy engine (default)                          |       1383 ms |  **1276 ms** |
| every method built with `vi.fn()` (`setSpyEngine('runner')`) |       1473 ms |      1390 ms |

| Change                                             |      Effect |
| -------------------------------------------------- | ----------: |
| only the runner, 4 → 5                             |      −7.7 % |
| the spy engine against `vi.fn()`, on Vitest 4      |      −6.1 % |
| the spy engine against `vi.fn()`, on Vitest 5      |      −8.1 % |
| Vitest 4 with `vi.fn()` → Vitest 5 with the engine | **−13.4 %** |

### Coverage matching on Vitest 4

On Vitest 4, deciding which files belong in the coverage report can cost more than collecting
coverage. `@vitest/coverage-v8` asks `isIncluded` for every file. Its cache keeps the verdict per
filename, not the compiled glob matcher, so every filename recompiles every pattern. Vitest 5 builds
the matchers once, so this section applies to Vitest 4 and earlier only. Upgrading is the cheaper
fix where it is available.

Profiled on one shard of a 1 725-file Angular suite, with a coverage scope of 124 include globs plus
304 negations:

| Phase of `Generate coverage`, 224.2 s total |        time |
| ------------------------------------------- | ----------: |
| reading the 432 workers' coverage files     |       2.6 s |
| before the first conversion                 |      54.3 s |
| remapping the 1 958 covered files           |      50.5 s |
| the pass over the 458 untested files        |  **0.35 s** |
| the final `coverageMap.filter`              | **114.1 s** |

A narrowed scope is usually blamed on the pass over untested files, and that pass is a third of a
second. The final filter, one `isIncluded` call per file, is half the run. Timed against a matcher
compiled once, on the same globs:

| Operation                          |      stock | compiled once |
| ---------------------------------- | ---------: | ------------: |
| `isIncluded`, 8 000 calls          | 167 853 ms |      1 808 ms |
| `coverageMap.filter`               |  81 393 ms |        713 ms |
| the pass over 1 816 untested files |  69 779 ms |      9 439 ms |

A coverage provider wrapper that compiles the matcher once gave, on the same shard and reporters:

| Measure                      | Stock                     | Wrapper                      |
| ---------------------------- | ------------------------- | ---------------------------- |
| Vitest phase                 | 229.59 s                  | **22.88 s**                  |
| files                        | 432 / 432                 | 432 / 432                    |
| cobertura report             | 8.0 MB                    | 8.0 MB                       |
| statements covered           | 27 292 / 65 325 (41.77 %) | 27 289 / 65 325 (41.77 %)    |
| per file, 200 distinct paths | 1.13 ms                   | 0.018 ms, identical verdicts |

The three-statement difference is the ordinary drift of a shared environment.

::: danger A wrapper that delegates `allowExternal: false` measures as zero
`@angular/build:unit-test` turns `allowExternal: false` on. A wrapper that hands that case back to the
original method takes the slow path on every call. The first attempt did exactly that: 227.6 s
against a 229.6 s baseline, which looks like "the idea does not work". Test the path inline instead,
with two `startsWith` checks against the workspace and project roots.
:::

Two more numbers from the same series:

- **v8 against istanbul.** On one Angular monorepo, `v8` dropped 184 of 4969 files it could not parse,
  with a warning, and stayed green. At matching settings it was 28 % faster than istanbul: 81 s
  against 113 s.
- **Report size.** The cobertura report was 10.78 MB without `include` and 8.89 MB with it. GitLab
  parses at most 10 MB. Over that limit the report is dropped **silently**: the job is green and the
  merge request shows no line coverage.

### Code splitting off in `@angular/build` 22.1.5 and 22.1.6

In `@angular/build` 22.1.5 and 22.1.6, the unit-test bundle is built with esbuild code splitting off,
and no option turns it back on. 22.1.7 restores splitting.

| Effect                   | Measured                                                                    |
| ------------------------ | --------------------------------------------------------------------------- |
| bundle graph             | every spec is a self-contained bundle: **791 chunks / 596 MB** on 784 specs |
| under `--coverage`       | grows by hundreds of megabytes with no plateau, until the run is killed     |
| module mocking           | no change: `vi.mock` behaves the same either way                            |
| warning from the builder | none, in either mode                                                        |

### Istanbul's module cache under the builder

Under the builder, esbuild has already bundled the code. The one transform left worth caching is
istanbul's instrumentation, through Vitest's `fsModuleCache`. The gain depends on the suite:

| Suite (Angular 22.2, Vitest 5)               | istanbul, cold | istanbul, warm cache | v8, cold | v8, warm cache |
| -------------------------------------------- | -------------: | -------------------: | -------: | -------------: |
| 700 spec files                               |        24.55 s |      13.20 s (−46 %) |        — |        no gain |
| 700 spec files, builder cache off (as on CI) |        27.01 s |      15.85 s (−41 %) |        — |              — |
| 862 spec files                               |           48 s |         39 s (−19 %) |  19–22 s |    18.7–22.5 s |
| 862 spec files, CI profile (`CI=1`, 3 forks) |        51–53 s |              41–44 s |  31–32 s |           30 s |

On the 862-file suite, v8 was about 2× faster than istanbul with a warm cache. It peaked at 7.5–8 GB
RSS against istanbul's 10–11 GB, with 100 % coverage on both.

## Which Node version

Run **Node 26 or 24**; under a memory cap, 26. Node 22 is the supported floor (`engines.node: ">=22"`), and CI tests 22, 24
and 26. Measured on one machine, 2026-09-04, on the newest release of each major:

|                                                        |          20 |      22 |      24 |         25 |          26 |
| ------------------------------------------------------ | ----------: | ------: | ------: | ---------: | ----------: |
| the library's 107-file suite, `vitest run` (best of 3) |      4.85 s |  4.63 s |  4.05 s |     3.91 s |  **3.84 s** |
| cold `import('vitest-auto-spy/node')` (best of 7)      |     15.0 ms | 14.8 ms |  6.7 ms | **6.2 ms** |      6.3 ms |
| process startup (best of 11)                           |     12.0 ms | 13.3 ms | 10.9 ms |    10.6 ms | **10.3 ms** |
| peak RSS of the suite (median of 3)                    | **3947 MB** | 4185 MB | 5467 MB |    5313 MB |     4645 MB |
| RSS after the import (median of 7)                     | **43.9 MB** | 51.5 MB | 52.1 MB |    55.1 MB |     58.3 MB |

The break is between 22 and 24:

| From 22 to 24   | Change        |
| --------------- | ------------- |
| cold import     | 2.2× faster   |
| suite wall time | 1.14× faster  |
| process startup | 1.22× faster  |
| suite peak RSS  | 1.3 GB higher |

The import matters most on a suite spread over many files, because each worker pays it. Node 24,
25 and 26 time within a few per cent of each other. On memory they differ: 26 uses about 15 % less
peak RSS than 24.

**A spy costs the same on every version.** Retained bytes per double match to within 0.2 % on 20,
22, 24, 25 and 26. The RSS rows move because newer V8 starts with a larger heap and collects later.

**In a memory-capped CI container**, prefer 26: it is as fast as 24 and peaks about 15 % lower. Also
set V8's heap limit below the container's limit, so V8 collects garbage before the container kills
the process:

```bash
export NODE_OPTIONS=--max-old-space-size=<megabytes below the container limit>
```

Node 22 peaks lower still, but imports twice as slowly; a heap limit solves the same problem without
that cost. Node 20 is past end-of-life
and kept in the table only to show why the floor moved.
Node 18 is covered under [In depth](#node-18).

## Node's compile cache

From Node 22.1, `NODE_COMPILE_CACHE` stores V8's compiled code for every module Node loads. The next
start reuses it. Vitest's workers inherit the variable, so one line covers the whole run.

```bash
# locally: any directory that survives between runs
export NODE_COMPILE_CACHE=node_modules/.cache/node-compile
npx vitest run
```

```yaml
# GitHub Actions: restore the directory, or every job starts cold
env:
  NODE_COMPILE_CACHE: ${{ github.workspace }}/.node-compile-cache
steps:
  - uses: actions/cache@v4
    with:
      path: .node-compile-cache
      key: node-compile-${{ runner.os }}-${{ matrix.node }}-${{ hashFiles('package-lock.json') }}
  - run: npx vitest run
```

Measured on this package in plain Node with a warm cache:

| Import                                           | Without cache |          With cache |
| ------------------------------------------------ | ------------: | ------------------: |
| the root entry                                   |       4.17 ms |             2.97 ms |
| root + `/setup` (what a spec file loads from us) |       6.51 ms | **4.32 ms** (−34 %) |

The runner and every other externalized dependency are cached the same way. On a real suite the
saving is not limited to this package.

Three things decide whether it pays:

- **The directory must persist.** The cache is written when the process exits. A CI job that starts
  empty writes a cache nobody reads. Restore it like `node_modules/.vite`, keyed on the Node version
  and the lockfile.
- **Coverage with the `v8` provider gets nothing.** Vitest turns the cache off in its workers under
  `coverage.provider: 'v8'`, because V8 coverage is less precise on cached code. Under `istanbul`
  the cache stays on.
- **It covers only what Node compiles itself.** Your specs and inlined dependencies go through
  Vite's transform and Vitest's module runner. The numbers above do not include them.

`NODE_DISABLE_COMPILE_CACHE=1` turns it off for one run.

## What to reach for

| Situation                                  | Use                           | Why                                                                |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ |
| Angular dependency                         | `provideAutoSpy(Service)`     | the DI provider, written for you                                   |
| A class, no Angular                        | `createSpyFromClass(Service)` | same factory, same lazy default                                    |
| No class at runtime — an interface, a type | `createAutoMock<T>()`         | Proxy; builds a member on first access                             |
| An ngrx `signalStore()`                    | `createAutoMock<T>()`         | its members live on the instance, so there is no prototype to read |
| A data shape the code only reads           | `createMock<T>(partial)`      | no spies at all — it is one checked assertion                      |
| Nested object graph                        | `mockDeep<T>()`               | auto-creates chainable spies down the tree                         |

Call the factory in `beforeEach`. A fresh double per test costs microseconds, and the method list
is cached per class.

## The two settings that cost

Most options cost nothing you can measure. The table lists the five that do; the two `lazySpies`
values come first.

| Setting                                    | What it costs                                                                               | When to use it                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `lazySpies: true` on a class of 8+ methods | A touched double is 21–68 % heavier and slower to build                                     | a spec needs a plain object, or reads one member in a hot loop |
| `lazySpies: false`                         | 11.50 µs instead of 6.04 µs (40 methods); 42 655 B instead of 259 B untouched (100 methods) | a spec inspects the spy through property descriptors           |
| `autoSpyAccessors: true`                   | One accessor indirection per spy; the prototype walk is cached                              | when you need accessor spies; for a smaller set, list them     |
| `setupAutoSpy({ strayTimers: true })`      | A scheduled-and-cleared timeout goes from 70 ns to about 1.75 µs                            | when you hunt timers that outlive their file                   |
| `documentPollution: { nodes: true }`       | 3.5 µs to 188 µs per test, growing with `<head>` children                                   | on the `describe` blocks that need it, not the whole suite     |

`lazySpies` takes three values, and all but `false` are lazy:

| Value           | What the double is                                                 |
| --------------- | ------------------------------------------------------------------ |
| unset (default) | below 8 methods, an accessor per method; from 8 methods, a `Proxy` |
| `true`          | an accessor per method, at any width                               |
| `'proxy'`       | a `Proxy`, at any width                                            |
| `false`         | every spy built up front                                           |

**`lazySpies: true` on a wide class** gives an accessor per method instead of the `Proxy`. Reads are plain property reads, about 5 ns
against 20–25 ns through the proxy trap. An untouched double is about 100 B lighter, and the double is an ordinary object. A
touched double is heavier and slower to build: see the
[width table](#where-the-remaining-memory-is-and-lazyspies-proxy).

**`lazySpies: false`** builds every spy up front. Enumeration (`Object.keys`, spread, a snapshot)
already works in every lazy mode. You need `false` only when a spec reads the spy's property
descriptors.

**`autoSpyAccessors: true`** walks the prototype chain for getters and setters. The walk is cached
per prototype, like the method walk. A class spied in 300 tests pays for it once. The per-spy
accessor indirection is not isolated by any benchmark. Pass an explicit `gettersToSpyOn` /
`settersToSpyOn` list when you want fewer spies, not for speed.

Everything else is a constant: `methodsToSpyOn`, `observablePropsToSpyOn`, the return-type
helpers. An exact `calledWith` is a sub-microsecond map lookup: 0.17 µs for two configured shapes
plus a miss, in the [micro-benchmark](#micro-benchmark).

**`calledWith` with an asymmetric matcher** is the one slower shape. This covers `expect.any` and
`expect.objectContaining`, also nested inside an object, array, `Map` or `Set`. Such a config
cannot be a static key. It is stored as a predicate and compared with the actual arguments after
the exact lookup misses. Three things keep that cheap:

| What                                     | Before                       | Now                                 |
| ---------------------------------------- | ---------------------------- | ----------------------------------- |
| Config arguments serialized              | on every call                | once, when the config is registered |
| 200-field argument against eight configs | 636 µs (rendered per config) | 0.4 µs (rendered once per call)     |
| Component graph with a back edge         | 4.1 ms per call              | 0.1 µs                              |
| Cyclic graph 18 levels deep              | 10.7 MB key in 276 ms        | 84 kB key in 0.29 ms                |

The structural comparison adds about 10 % to the key of a deep object argument. Six of those ten points come from
reading each object's symbol keys, so two arguments that differ only in a symbol stay
apart. A single primitive argument costs the same as before. Use an exact `calledWith` when you
have one.

**[`setupAutoSpy({ strayTimers: true })`](/utilities/setup#_4-cancelling-timers-that-outlive-their-file)**
is also on under `preset: 'strict'`. Every `setTimeout`, `setInterval` and `requestAnimationFrame`
captures a stack, so a stray timer can name the call that scheduled it. That raises a
scheduled-and-cleared timeout from 70 ns to about 1.75 µs. Nearly all of it is V8 building the
stack, about 0.9 µs at any depth. Before 5.6 recorded origins, the figure was 116 ns (Node
v24.19.0, 2026-09-11).

What else the capture costs, Node v24.19.0, Apple M4 Max:

| Case                                           | Cost                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| a pending timer, until it fires or is swept    | about 0.9 kB more memory                                              |
| each frame taken behind a deep framework chain | about 60 ns                                                           |
| a timer behind a deep chain                    | about 3 µs (twelve frames: 1.4 µs)                                    |
| a file that schedules 10 000 timers            | about 16 ms in total                                                  |
| naming the test that scheduled it              | not measurable: 4.0 µs per tracked pair before and after, coverage on |

### What the /setup guards cost per test

The guards in [`setupAutoSpy()`](/utilities/setup) run on every test. Their price grows with the
number of tests, not with the number of doubles. The table shows the **whole** time of an empty
test, runner included. Subtract the first row to get the library's share.

| Setting                                   |  node | happy-dom |
| ----------------------------------------- | ----: | --------: |
| no setup file (the runner alone)          |  8 µs |      8 µs |
| `setupAutoSpy()` with its defaults        | 16 µs |     18 µs |
| `setupAutoSpy({ strayConsole: 'throw' })` |     — |     23 µs |
| `setupAutoSpy({ guardGlobals: 'warn' })`  |     — |     19 µs |
| `setupAutoSpy({ preset: 'strict' })`      | 18 µs |     30 µs |

5 000 empty tests, one worker, Node v24.19.0, Vitest 5.0, 2026-09-26. With istanbul coverage on:

| Setting                              |  node | happy-dom |
| ------------------------------------ | ----: | --------: |
| no setup file                        | 10 µs |     11 µs |
| `setupAutoSpy()` with its defaults   | 20 µs |     23 µs |
| `setupAutoSpy({ preset: 'strict' })` | 33 µs |     28 µs |

Ten thousand tests at the strict preset add about 0.2 s of library time to the whole run. Three
things keep the per-test figure flat as guards are added:

- Every guard is a step in one shared `beforeEach` and `afterEach`. Separate hooks would cost about
  1 µs each per test.
- The teardown net uses `aroundEach` on Vitest 4.1 and later. An `onTestFinished` per test captured
  a stack each time, about 5 µs.
- `guardGlobals` no longer lists `globalThis` after every test, which cost 20–25 µs under a DOM
  environment. It notes which watched object got a non-configurable definition and checks only
  those.

`documentPollution: { nodes: true }` compares the children of `<html>`, `<head>` and `<body>` as
well as their attributes. Its cost depends on how many children there are:

| Children in `<head>` | `nodes: true` | with `ignoreNodes` |
| -------------------- | ------------: | -----------------: |
| 0                    |        3.5 µs |               5 µs |
| 50                   |         11 µs |              43 µs |
| 300                  |         56 µs |             243 µs |
| 1 000                |    **188 µs** |             808 µs |

An Angular suite that lets component styles pile up in `<head>` can reach a thousand children. At
that width the check used to cost 7.1 ms per test. It now walks siblings instead of copying a live
`HTMLCollection` on every read. An `ignoreNodes` selector runs once per test, not once per node.
Turn `nodes` on for the `describe` block that needs it rather than for the whole suite.

### What the emission helpers cost per call

`expectEmission` and its siblings build the stack anchor for a failure message **only when the wait
fails**. A passing call pays less:

| Call site               | Passing call, before | Passing call, now |
| ----------------------- | -------------------: | ----------------: |
| top level               |               3.6 µs |        **2.3 µs** |
| twenty-five frames deep |               4.6 µs |        **3.2 µs** |

A failing call pays about 0.7 µs more for the same information.

`skip` and `until` decide whether a value counts as it arrives. They used to re-scan everything
collected so far on each new value. On a stream that emits heavily before it settles, this is 30× to
300× faster: linear instead of quadratic. `expectCompletion` and `expectError` now count values
instead of keeping them. A wait on ten thousand values holds a number, not an array.

## Measured

What one double costs to build and call. The figure is the **p75** of a Vitest bench run. These
cases allocate spies by the hundred thousand, so GC pauses swing `hz` several-fold between runs.
`p75` reproduces to the fourth decimal.

| Operation                                                 | per call (p75) |
| --------------------------------------------------------- | -------------: |
| spy a 10-method class, call 2 methods — `lazySpies: true` |    **2.25 µs** |
| the same, eager (`lazySpies: false`)                      |        3.21 µs |
| spy a 40-method class, call 3 methods — `lazySpies: true` |    **6.04 µs** |
| the same, eager                                           |       11.50 µs |
| `createAutoMock<Service>()` + 4 accesses                  |        1.79 µs |
| `calledWith` dispatch, 3 configured calls                 |        0.21 µs |
| unconfigured dispatch, 3 calls with two object arguments  |        0.25 µs |

Node v24.19.0, Vitest 4.1.11, Apple M4 Max, 2026-09-04. When [the spy engine](#the-spy-engine)
landed in 4.1, every row got 1.6× to 6× faster. The eager rows moved most.

**Lazy wins until a test calls every method.**

| Class      | Lazy vs eager, 2–3 methods called | All methods called: lazy / eager |
| ---------- | --------------------------------: | -------------------------------: |
| 10 methods |                      1.43× faster |                5.83 µs / 4.21 µs |
| 40 methods |                      1.90× faster |              23.08 µs / 16.00 µs |

When every method is called, eager is about 1.4× faster. Memory settles the choice. An untouched
100-method double retains **259 B** lazy and 42 655 B eager. Fully built, the two are within 1 % of
each other: see [Retained memory per double](#retained-memory-per-double). That is why lazy is the
default.

**Against a whole suite this is noise.** Five providers across two thousand tests are ten thousand
doubles: about 0.02 s for the entire run. `TestBed` is where a slow suite spends its time.
[`enableTestBedDiagnostics()`](../adapters/angular#where-a-spec-spends-its-time) measures that, and
[`renderShallow`](../adapters/angular#shallow-component-rendering) usually fixes it.

**The three factories on Vitest 5 with Angular.** The same ten-method class, two methods called.
Node v24.19.0, Vitest 5.0.0, Angular 22.1.5, 2026-09-06, median `p75` of five runs (they differed by
at most 0.1 µs):

| Call                                                        | per call (p75) |
| ----------------------------------------------------------- | -------------: |
| `provideAutoSpy(Service)` — lazy, the default               |     **2.1 µs** |
| `createSpyFromClass(Service, { lazySpies: false })` — eager |         2.8 µs |
| `createAutoMock<Service>()` + 4 accesses                    |         1.5 µs |

`createAutoMock` is quickest because it skips the prototype walk. It also gives up what the walk
buys: a double that fails when the real class loses a method. `provideAutoSpy` adds nothing over
`createSpyFromClass`; the gap between the first two rows is `lazySpies`.

The type-checker's cost is measured separately. The repository's gate counts the instantiations
`Spy<T>` costs `tsc` and fails past a budget: see [Type-check cost](../comparison#_3-type-check-cost).

## Why it is fast

Three things keep a double cheap:

1. **Lazy spies.** `lazySpies` is on by default for `createSpyFromClass` and `provideAutoSpy`. A
   method's spy is built on first access. A twenty-method service a test touches twice builds two
   spies. Below 8 methods the placeholder is an accessor; from 8 the double is a `Proxy`.
2. **A cached method list.** The prototype chain is walked once per class and cached in a `WeakMap`.
   A class spied in 300 tests walks its prototype once.
3. **Its own spy engine.** Since 4.1, a method spy on Vitest is not a `vi.fn()`.

### The spy engine

`vi.fn()` is expensive to create, even before it is called. Each mock it creates gets:

- About twenty-five closures as own properties of the function.
- Six arrays of call state, allocated even if the mock is never called.
- An entry in a module-level strong `Set` and in a `WeakMap`.
- A `defineProperty` for `length` and for `mock`.

A double of a forty-method class used to pay that forty times, for a spec that calls two methods.

The library now builds method spies itself:

- **One shared prototype** carries the whole `Mock` API. A spy is one function object and one small
  config record.
- **Call state appears on the first call.** A method nothing touches owns no arrays. A called spy
  records four arrays: `calls`, `invocationCallOrder`, `results` and `contexts`. `settledResults`
  and `instances` are derived on the first read, then recorded per call. Until that read,
  `results` holds the returned value itself and the `{ type, value }` entries are built on the
  first read. A recorded call costs about 100 bytes; a `vi.fn()` call costs about 200.
- **No global registry**, so nothing has to be pruned later.

**What a spec sees is unchanged:** `vi.isMockFunction`, every matcher, the `mockReturnValue` family,
`mock.calls` / `.results` / `.settledResults` / `.instances` / `.contexts` / `.lastCall`,
`mockClear` / `mockReset` / `mockRestore`, `using`. The library's own tests put a spy and a
`vi.fn()` through the same steps and compare their state. A change in what Vitest records fails
those tests, not yours.

Two details follow `vi.fn()` exactly:

- A reset (`mockReset`, `mockRestore`, `using`, `vi.resetAllMocks()`) drops a `mockName()`. It puts
  back the name the spy was created with, as `vi.spyOn` does. A bare spy reads `vi.fn()` again; a
  method spy reads its method's name.
- A spy's `length` is its implementation's, as on `vi.fn(impl)`.

`vi.clearAllMocks()`, `clearMocks: true` and `mockReset: true` reach these spies too. The mechanism
is under [In depth](#how-the-engine-reaches-vi-clearallmocks).

What the engine changed, 4.0 against 4.1 (median of seven runs, same machine, same day):

|                                                        |                                         4.0 |                             4.1 |
| ------------------------------------------------------ | ------------------------------------------: | ------------------------------: |
| a double whose test calls all 14 of its 14 methods     | 18.92 µs (a loss to hand-written `vi.fn()`) | **8.17 µs** (2.19× ahead of it) |
| a double whose test calls all 45 of its 45 methods     |                           75.33 µs (a loss) |      **26.12 µs** (2.37× ahead) |
| `createAutoMock<T>()`, 40 members touched              | 72.88 µs (a loss to `vitest-mock-extended`) |      **18.92 µs** (3.00× ahead) |
| `mockDeep<T>()`, 3 levels, leaf called                 |                            8.83 µs (a loss) |       **2.29 µs** (2.38× ahead) |
| retained heap, one materialised method                 |                                     5 445 B |                     **1 929 B** |
| retained heap per method, eager double, nothing called |                                     4 418 B |                       **632 B** |

These are the 4.1 release figures, taken on Vitest 4. The heap rows have since moved on Vitest 5,
the runner's own mock most of all. Current numbers are in
[Retained memory per double](#retained-memory-per-double).

The `calledWith` dispatch row also moved, from 0.54 to 0.17 µs, for a different reason: see the
[micro-benchmark](#micro-benchmark).

**The one difference, and the way out.** `mock.invocationCallOrder` counts on the library's own
scale. `expect(a).toHaveBeenCalledBefore(b)` is exact between two auto-spies. Between an auto-spy
and a hand-written `vi.fn()` it is meaningless, because the two counters never meet. Using the
runner's counter would mean calling one of its mocks on every dispatch, which is the cost the engine
avoids. So the switch is explicit:

```ts
// vitest.setup.ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

setSpyEngine('runner'); // every double built afterwards is vi.fn() per method, as before 4.1
```

| API                            | What it does                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `setSpyEngine(engine)`         | Takes a `SpyEngine`: `'auto-spy'` (the default) or `'runner'`. Affects doubles built afterwards. |
| `getSpyEngine()`               | Returns the engine now in use, so a setup file can assert what it got.                           |
| return value of `setSpyEngine` | An undo that puts back the previous engine, for example in `afterAll`.                           |

Doubles already built keep their engine. To switch for one file under `isolate: false`, see
[Switching the engine for one file](/utilities/setup#switching-the-engine-for-one-file).

The engine is Vitest only. On Bun and `node:test`, the runner's matchers recognise only the
runner's own mocks. Those entries keep building spies from `mock()` and `t.mock.fn()`.

## Memory, not just time

[Measured](#measured) times one double. Whether a large suite fits in a container depends on what
the doubles _hold_. This is where laziness earns its default. On a 40-method class, a spec that
calls two methods never builds the other 38. Each skipped method is a function, its argument map and
its helper bundles.

The bytes are in [Retained memory per double](#retained-memory-per-double). The sections below
explain where they come from.

### Where the remaining memory is, and `lazySpies: 'proxy'`

A lazy double still has to define something for each method name. With the accessor placeholder
(`lazySpies: true`), that is one `Object.defineProperty` accessor per method. The `get` / `set` pair
is shared by every double with a method of that name. The double is found through `this`. So an
untouched name costs a descriptor slot, about two bytes. An untouched double retains under
**200 B**, whether it stands for 10 methods or 100.

Reading the first method has a cost on this path. V8 keeps doubles with shared accessors on a shared
"fast-mode" map. Turning one accessor into a data property would rewrite that whole map. So the
double switches to dictionary mode once, on its first read, where the change is a hash update. An
untouched double never pays it. The history of this trade is under
[In depth](#why-the-accessors-are-shared).

That dictionary is why a class of 8 methods or more gets `'proxy'` when `lazySpies` is not set. The
proxy answers every method from one trap handler and one name set per class. It defines nothing, so
there is no dictionary to grow.

Bytes per double with one and two methods called (1 000 doubles held at once, 2026-09-27):

| Methods in the class | `true`, 1 / 2 touched | `'proxy'`, 1 / 2 touched |        Saving |
| -------------------: | --------------------: | -----------------------: | ------------: |
|                  4–6 |       1 743 / 2 887 B |          1 415 / 2 573 B | −19 % / −11 % |
|                 8–16 |       2 110 / 3 269 B |          1 417 / 2 573 B | −33 % / −21 % |
|                20–30 |       2 877 / 4 036 B |          1 416 / 2 573 B | −51 % / −36 % |
|                   45 |       4 412 / 5 570 B |          1 417 / 2 577 B | −68 % / −54 % |

The steps come from V8: the dictionary holds `pow2ceil(1.5·(width + 3))` slots.

| `'proxy'` against `true`    | Effect                                                |
| --------------------------- | ----------------------------------------------------- |
| build and touch, 8 methods  | 2.2 → 1.1 µs                                          |
| build and touch, 45 methods | 6.5 → 1.0 µs                                          |
| every member read           | about 20–25 ns instead of 5 ns, for the double's life |
| untouched double            | about 100 B heavier                                   |
| what a spec can see         | the double is a `Proxy`                               |

Eight methods is the smallest width where the proxy saves at least 15 % on both profiles. Below it
the proxy still saves 11–19 %, which is not worth a double that is no longer a plain object, so the
default stays a plain object. `lazySpies: true` opts a wide class out.

### What a single spy costs

On Vitest, a built method spy is the library's own, not the runner's mock. It retains **1 906 B**,
where `vi.fn()` retains 5 783 B on the same machine and runner. On Bun and `node:test` the runner's
mock is still the floor.

Per _method_, Node v24.19.0, Vitest 5.0.0:

|                                 |    retained |              time |
| ------------------------------- | ----------: | ----------------: |
| lazy placeholder, never touched |     **2 B** |        **126 ns** |
| materialised on first read      | **1 906 B** | **487 ns** on top |
| a bare `vi.fn()`                | **5 783 B** |      **3 380 ns** |

A method a spec never touches costs about two bytes. A `vi.fn()` in its place retains 4 726 B before
it is ever called. A method a spec does touch is **3.0× lighter and 5.5× faster** to build: 126 + 487
ns against 3 380 ns.

The retained column is read off the 100-method untouched and all-called cells of the
[retained-memory table](#retained-memory-per-double). The `vi.fn()` time is 20 000 doubles of 10
methods, median of seven passes. Its spread is wide, 3 042–7 947 ns, so it is published with the
median.

The placeholder figure is small because it is a descriptor slot, not an object. The accessor pair is
shared by every double of every class with that method name. So on a narrow class the double's
fixed cost dominates. With `lazySpies: true`, an untouched 10-method double measures 156 B in total,
a 100-method one 178 B.

`calledWith` chains are built on first use. A spy used to build two of them, each an object plus an
argument map, even if the spec never called `calledWith`. When a spec does use it, the chain is
built exactly as before. `resetAutoSpy()` drops the chains, so a reset spy is back to a fresh spy's
footprint.

Memory matters more than time here. Under `isolate: false` a worker keeps everything its files
allocated until the run ends. It is the heap, not the clock, that kills a CI job in a container.

### Helpers shared across spies

Every built method has helpers: `calledWith`, `mustBeCalledWith`, `failWith`, `resolveWith`,
`rejectWith`, `resolveWithPerCall`, and the reset and clear hooks. With `vitest-auto-spy/rxjs`
loaded, seven stream helpers are added. These used to be eight to twenty closures per spy.

Now they are one set of functions for the whole run. Each finds its spy through `this`:

- On the library's engine, the bundle sits on the prototype every spy inherits. That saves six slots
  per built method, and seven more with `/rxjs`. Measured at **48 B per built method** in the
  [retained-memory table](#retained-memory-per-double).
- A runner-backed mock (`setSpyEngine('runner')`, Bun, `node:test`) has no prototype of ours, so it
  still gets a copy.
- The reset and clear hooks live on the spy's state object, under the spy's mark. The mark and both
  hooks cost one property instead of three.
- The stream handle is built by the first stream helper, not for every spy.

On `node:test` and Bun the runner's own mock dominates. `node:test` captures a stack trace into every
recorded call and creates its mock as a Proxy. The benchmarks on this page all run under Vitest, so
no `node:test` or Bun figure is quoted.

**One change for callers.** A helper taken _off_ its spy no longer works:

```ts
const { resolveWith } = spy.load;
resolveWith(user); // → throws, naming the helper and the two forms that work

spy.load.resolveWith(user); // works
const bound = spy.load.resolveWith.bind(spy.load); // works
```

The jasmine namespaces bind their helpers, so nothing changes there.

### On `node:test`

`node:test` keeps every `mock.fn()` in its module-level `MockTracker` for the life of the process.
Only `reset()` empties that list, and it restores everything on the way. `trackNodeMocks()` from
`vitest-auto-spy/node` moves the library's spies onto a tracker of its own.

| 20 000 spies of a 10-method class, 20 tests, dropped, two forced collections |              Retained |
| ---------------------------------------------------------------------------- | --------------------: |
| baseline                                                                     |                5.5 MB |
| without `trackNodeMocks()`                                                   |              124.5 MB |
| with `trackNodeMocks()`                                                      | **5.9 MB** (21× less) |

Node v24.19.0, `--expose-gc`.

Spy names cost memory too. A `node:test` mock takes its `name` from the function it wraps, so the
adapter names the implementation when it creates it. Redefining `name` afterwards drops the function
out of V8's fast map. Over 200 000 mocks on Node v24.19.0:

| How the spy is named    | Extra per mock |
| ----------------------- | -------------: |
| redefining `name` after |          206 B |
| naming at creation      |       **65 B** |

## Against other libraries

This section compares the library with:

- the three jest-auto-spies-family libraries: `jest-auto-spies@3.0.1`, `jasmine-auto-spies@8.0.1`,
  `@bugsplat/vitest-auto-spies@1.0.0`;
- `vitest-mock-extended` and `@golevelup/ts-vitest`, for doubles built from a type.

Both per double and across a whole suite. Node v24.19.0, Vitest 4.1.11, Apple M4 Max, macOS 26.6.2.
Each table has its own date; the whole page was re-measured 2026-09-04.

Read memory first. Suite wall-clock is the noisiest number here: the widest round-to-round spread was
**16 %** of a cell's median. Peak RSS reproduces tightly and separates arms by multiples. So
wall-clock is quoted to one significant figure in prose: "roughly 1.5×", not "1.53×".

| Cell         | Three rounds of wall-clock |
| ------------ | -------------------------- |
| 1 000 tests  | 1.35 / 1.33 / 1.32 s       |
| 10 000 tests | 10.02 / 10.65 / 9.72 s     |

### The three jest-auto-spies-family libraries, all measured

All three depend on `@hirez_io/auto-spies-core@3.0.0`. They differ only in the spy factory they pass
to it:

| Library                             | Spy factory           |
| ----------------------------------- | --------------------- |
| `jest-auto-spies@3.0.1`             | `jest.fn()`           |
| `jasmine-auto-spies@8.0.1`          | `jasmine.createSpy()` |
| `@bugsplat/vitest-auto-spies@1.0.0` | `vi.fn()`             |

All three are measured directly. They land within a few per cent of each other on every case: see
the 40-method row below. So the claim that they share one algorithm is measured, not argued.

`jest-auto-spies` and `jasmine-auto-spies` run under a minimal `jest` / `jasmine` global backed by
`vi.fn()`. Every other arm then creates the same underlying mock. The runner's per-mock cost becomes
a shared constant, and the numbers separate each library's own work. They do not show what a real
Jest or Jasmine suite would, where the runner's mock has its own cost.

**This library's arm is the deliberate exception.** Since 4.1 it does not call `vi.fn()` at all:
see [the spy engine](#the-spy-engine). Part of its lead is that it never pays the runner's per-mock
cost. The `hand-written vi.fn() per method` arm shows this: it is the runner's mock with no library
in the way. `setSpyEngine('runner')` puts this library back on `vi.fn()`. As of the table's date, no
other library skips `vi.fn()`.

### Micro-benchmark

One double, per call. **Every figure is the median p75 of seven independent runs**, each in its own
process, at doubled iteration budgets. Canonical run 2026-09-03; a full re-run on 2026-09-04 moved
every absolute by 2–6 % and every ratio by a few per cent.

The `(×)` after a competing figure is its time divided by ours. Above 1× means slower than this
library.

**Double from a class.** This library, `@bugsplat`, `jest-auto-spies` and `jasmine-auto-spies` all
read a class. `vi.fn()` is the same class assembled by hand from plain mocks.

| Case                                   | vitest-auto-spy |         @bugsplat |   jest-auto-spies | jasmine-auto-spies | hand-written vi.fn() |       n |
| -------------------------------------- | --------------: | ----------------: | ----------------: | -----------------: | -------------------: | ------: |
| small project — 6 methods, 1 called    |         1.42 µs |   8.33 µs (5.88×) |   8.38 µs (5.91×) |    8.50 µs (6.00×) |      6.83 µs (4.82×) |  90,000 |
| medium project — 14 methods, 2 called  |         2.67 µs |  19.37 µs (7.27×) |  19.17 µs (7.19×) |   19.71 µs (7.39×) |     15.92 µs (5.97×) |  70,000 |
| large project — 45 methods, 2 called   |         5.79 µs | 64.04 µs (11.06×) | 65.67 µs (11.34×) |  66.25 µs (11.44×) |     52.79 µs (9.11×) |  36,000 |
| worst case — 14 methods, all 14 called |         8.17 µs |  21.87 µs (2.68×) |  21.79 µs (2.67×) |   22.25 µs (2.72×) |     17.92 µs (2.19×) |  30,000 |
| worst case — 45 methods, all 45 called |        26.12 µs |  73.42 µs (2.81×) |  71.83 µs (2.75×) |   73.04 µs (2.80×) |     62.04 µs (2.37×) |   9,000 |
| configure a return + 3 calls           |         2.21 µs |  19.63 µs (8.88×) |  19.33 µs (8.75×) |       not measured |     16.38 µs (7.41×) | 102,000 |

The widths and call counts come from four private Angular suites: about 2 700 spec files and 2 742
doubles built from a class.

| Percentile | Methods in the doubled service | Methods the spec touches |
| ---------- | -----------------------------: | -----------------------: |
| median     |                            5–8 |                        1 |
| p75        |                          12–16 |                        — |
| p90        |                          32–44 |                        2 |

[How the sizes were chosen](https://github.com/ASDAlexey/vitest-auto-spy/blob/master/bench/README.md#where-the-three-sizes-come-from).
`jasmine-auto-spies` is absent from the last row on purpose. Its configuration call is
`spy.method.and.calledWith(x).returnValue(y)`, a different operation from `mockReturnValue`.

**Double from a type.** All three arms are Proxy-based and do equal work.

| Members touched     | vitest-auto-spy | vitest-mock-extended | @golevelup/ts-vitest |       n |
| ------------------- | --------------: | -------------------: | -------------------: | ------: |
| 2                   |         1.00 µs |      2.79 µs (2.79×) |      4.92 µs (4.92×) | 590,000 |
| 10                  |         4.67 µs |     13.83 µs (2.96×) |     24.92 µs (5.34×) |  60,000 |
| 40                  |        18.92 µs |     56.79 µs (3.00×) |    103.37 µs (5.46×) |  16,000 |
| configure + 3 calls |         0.71 µs |      1.58 µs (2.24×) |      1.58 µs (2.24×) | 584,000 |

**Deep double and `calledWith`:**

| Case                                         |         n | vitest-auto-spy | vitest-mock-extended | @golevelup      | @bugsplat       |
| -------------------------------------------- | --------: | --------------: | -------------------: | --------------- | --------------- |
| deep double, 3 levels, leaf called           |   232,000 |         2.29 µs |      5.46 µs (2.38×) | 6.00 µs (2.62×) | —               |
| `calledWith` dispatch, 2 configured + 1 miss | 2,304,000 |         0.17 µs |      0.54 µs (3.25×) | —               | 0.96 µs (5.74×) |

The `calledWith` row moved in 4.1 for a reason other than the engine. A config of a single primitive
argument used to be rendered into a string key on every call. A `Map` keyed by the value itself does
the same lookup with no allocation. Two shapes stay on the string path and keep their old answer. A
symbol renders by its description. `-0` renders apart from `0`, but is one key with it under
`SameValueZero`.

**Every table above favours this library**, including the two worst-case rows. Before 4.1,
`vitest-mock-extended` won every type-based row and the deep-double row. Hand-written `vi.fn()` won
both all-methods-called rows. The spy engine changed that.

::: warning These multipliers do not carry over to a whole suite
On one 45-method double, this library is roughly 9× faster than hand-written `vi.fn()`. Across a
real suite that advantage is gone: see [Suite scale](#suite-scale). Building a double is about 1 %
of a test's cost. A micro-benchmark multiplier describes the double, not the run.
:::

#### The measured resolution limit

Read this before you quote any number from these tables.

A single run of this benchmark moves several per cent between runs of unchanged code. That is
machine state, not sampling error: four times the iterations lowers `rme` and leaves the drift. So
the page publishes the **median of seven runs**. Each row's ± column says how far that median can be
off.

| Across the 47 rows of the 2026-09-04 run           | Error on the median |
| -------------------------------------------------- | ------------------: |
| median                                             |              ±0.9 % |
| worst (the `calledWith` dispatch row, the fastest) |              ±6.3 % |

For a single local run, keep the blunter rule: **a gap under about 20 % between two arms is not worth
quoting.**

The narrowest gap on this page is **2.19×** (all 14 methods called); the widest is 11.4×.
Both are an order of magnitude outside the error. The table this one replaced had one row inside the
noise, and it had to be reported as parity.

How the figures are made trustworthy:

- **The ± column bounds the median, not the mean.** `rme` bounds the mean, which GC tails dominate. A
  large `rme` next to a stable `p75` means a noisy tail, not an unreliable number.
- **Every arm in a block runs the same number of iterations**, printed as `n`. By default tinybench
  gives each arm the same _time_, so a faster arm runs more iterations. GC grows with objects created,
  so the fast arm would pay for its own speed.
- **The published figure is `p75`**, which a GC pause does not move. Operations per second, where
  quoted, are `1/p75`, never the runner's mean-based `hz`.

### Retained memory per double

Bytes each double keeps alive. Node v24.19.0, **Vitest 5.0.0**, 2026-09-27.

| Method               | Setting                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| doubles held at once | 500                                                                                                                                                     |
| repeats              | 5 per cell (median), 4 forced GC passes per settle; whole bench run three times, median of the three                                                    |
| figure               | heap delta ÷ 500 = **bytes per double**; in parentheses, ÷ methods = bytes per method                                                                   |
| between arms         | the mock registry is pruned (worst residual 0.2 %)                                                                                                      |
| spread               | every cell within 0.2 % of its median across the three runs; worst repeat spread ±33 %, on the smallest cell (the default's untouched 10-method double) |

Without pruning, every arm would carry forward what earlier arms allocated.

**Built from a class:**

| Arm                                                 |     10 methods, untouched |            10, all called |     100 methods, untouched |            100, all called |
| --------------------------------------------------- | ------------------------: | ------------------------: | -------------------------: | -------------------------: |
| vitest-auto-spy default (`'proxy'` at these widths) |       258 B (26 B/method) | 11 367 B (1 137 B/method) |         259 B (3 B/method) | 110 837 B (1 108 B/method) |
| vitest-auto-spy `lazySpies: true`                   |   **156 B** (16 B/method) | 11 987 B (1 199 B/method) |     **178 B** (2 B/method) | 116 082 B (1 161 B/method) |
| vitest-auto-spy `lazySpies: false`                  |    4 454 B (445 B/method) | 11 297 B (1 130 B/method) |    42 655 B (427 B/method) | 110 730 B (1 107 B/method) |
| jest-auto-spies                                     | 67 246 B (6 725 B/method) | 77 802 B (7 780 B/method) | 674 658 B (6 747 B/method) | 779 711 B (7 797 B/method) |
| jasmine-auto-spies                                  | 69 723 B (6 972 B/method) | 80 289 B (8 029 B/method) | 699 474 B (6 995 B/method) | 804 525 B (8 045 B/method) |
| @bugsplat/vitest-auto-spies                         | 67 234 B (6 723 B/method) | 77 807 B (7 781 B/method) | 674 671 B (6 747 B/method) | 779 723 B (7 797 B/method) |
| hand-written `vi.fn()`                              | 47 258 B (4 726 B/method) | 57 825 B (5 783 B/method) | 476 862 B (4 769 B/method) | 581 883 B (5 819 B/method) |

::: info The 2026-09-29 change is not in this table yet
Since 2026-09-29, a called spy records four arrays instead of six until its state is read, and
`results` keeps bare values until then. In this benchmark, "all called" doubles fell by 19–21 % in
every arm. The default at 10 methods went 11 369 → 9 037 B, at 100 methods 110 848 → 87 638 B.
Untouched doubles did not move. Details are
under [In depth](#how-the-retained-memory-came-down).
:::

**Built from a type.** Untouched is the same Proxy object at any width:

| Arm                               | untouched | 10 members called | 100 members called |
| --------------------------------- | --------: | ----------------: | -----------------: |
| vitest-auto-spy `createAutoMock`  |     369 B |          11 744 B |          113 566 B |
| vitest-mock-extended `mock`       |     353 B |          60 138 B |          602 182 B |
| @golevelup/ts-vitest `createMock` |     496 B |         116 462 B |        1 158 269 B |

**What this shows:**

1. **From 8 methods, the default is the lighter double once a test touches it.** Untouched,
   `lazySpies: true` is smaller, because its placeholder is a descriptor slot. After the first read
   it pays for a dictionary as wide as the class; the proxy does not. See the
   [width table](#where-the-remaining-memory-is-and-lazyspies-proxy).
2. **A called method retains about 1 110 B** against the runner's 5 819 B. An eager, never-called one
   (`lazySpies: false`, untouched) retains **427 B**. A spy never called allocates none of the arrays
   `vi.fn()` allocates up front.
3. **`jest-auto-spies` and `@bugsplat` agree to within 0.01 %** on retained bytes. That confirms the
   [shared core](#the-three-jest-auto-spies-family-libraries-all-measured) on a metric free of timing
   noise.
4. **The jest-auto-spies core costs about 2.0 kB per method over a raw `vi.fn()`**, before anything
   is called: 6 725 against 4 726 B. `jasmine-auto-spies` is about 4 % higher still.
5. **Fully built, four arms measure `@vitest/spy`.** The hand-written control retains 5 783 B per mock
   after one call, and the jest-auto-spies family lands 35–39 % above it. This library's spy is its
   own, so it sits **5.1× below that floor**, at about 1 120 B.

**Where this library loses on memory:**

- An untouched `createAutoMock<T>()` retains **369 B**, against **353 B** for
  `vitest-mock-extended` (4.5 % more) and **496 B** for `@golevelup`. From the first member called,
  it is 5.1× lighter than `vitest-mock-extended` and 9.9× lighter than `@golevelup`.
- `lazySpies: false` retains 0.1–0.6 % less than the default when every method is called anyway.
  That is 11 297 vs 11 367 B at 10 methods, 110 730 vs 110 837 B at 100.

Only `heapUsed` was measured, not off-heap memory. The `@vitest/spy` registry `Set` is counted and
charged to every arm alike. The absolute bytes are V8-specific. The ratios should hold elsewhere,
but that was not checked.

### Suite scale

A whole generated suite, per arm. Every arm imports the prebuilt package, as a consumer does. Arms
run interleaved round-robin. Coverage is on.

**20-method class, `isolate: true`**, 3 rounds per cell after a discarded warm-up, median of three.
2026-09-04, 4.1 build, Node v24.19.0, Vitest 4.1.11, Apple M4 Max:

|  Tests |   vitest-auto-spy |                 @bugsplat |             hand-written |
| -----: | ----------------: | ------------------------: | -----------------------: |
|  1 000 |  1.33 s · 1116 MB |  2.00 s (1.50×) · 1237 MB | 1.31 s (0.99×) · 1085 MB |
|  3 000 |  2.86 s · 1167 MB |  4.61 s (1.61×) · 1349 MB | 2.85 s (1.00×) · 1136 MB |
| 10 000 | 10.02 s · 1295 MB | 15.45 s (1.54×) · 1509 MB | 9.25 s (0.92×) · 1283 MB |

| Across the nine rounds | Range       | Median    |
| ---------------------- | ----------- | --------- |
| hand-written `vi.fn()` | 0.84×–1.00× | **0.97×** |
| `@bugsplat`            | 1.46×–1.62× | **1.54×** |

The widest round-to-round spread was **16 %** of a cell's median. Read the ratios, not the seconds.
Hand-written `vi.fn()` sat at 0.76× at 10 000 tests before the spy engine, and at 0.92× now.

**100-method class, `isolate: true`, 10 000 tests**, 5 rounds after a discarded warm-up:

| Arm                        | Median wall | Median peak RSS | Across 5 rounds                                                        |
| -------------------------- | ----------: | --------------: | ---------------------------------------------------------------------- |
| vitest-auto-spy (ours)     |      9.42 s |         1294 MB | —                                                                      |
| ours, `lazySpies: 'proxy'` |      9.41 s |         1276 MB | median exactly 1.00× (1.00 / 0.98 / 1.00 / 1.02 / 0.98) — not a result |
| @bugsplat                  |     15.85 s |         1518 MB | median ratio 1.68, 5/5 above 1.0× (1.66–1.73×)                         |
| hand-written `vi.fn()`     |      9.21 s |         1280 MB | median 0.98×, 5/5 below 1.0× (0.97–1.00×)                              |

What holds across 1 000, 3 000 and 10 000 tests and both class widths:

- **This library is roughly 1.5–1.7× faster than the jest-auto-spies family**, measured through
  `@bugsplat`. Per-round ratios range 1.46–1.73×, so never quote it to two significant figures.
- **Hand-written `vi.fn()` doubles are still slightly cheaper under `isolate: true`**: about 3 % at
  the median. It used to be 10–15 %. Two of nine 20-method rounds came out at parity, and the tail
  reaches 0.84×. So nothing narrower than "a few per cent" is claimed.
- **`lazySpies: 'proxy'` does nothing measurable under `isolate: true`.** Its median over five
  rounds is exactly 1.00×.

Building a double is about 1 % of a test's cost. A 10× micro-benchmark win shows up here as a few
per cent. The remaining gap is what this library does _besides_ building doubles.

### Memory under `isolate: false`

This is the largest and cleanest effect on this page. It reproduces tightly where wall-clock does
not.

**100-method class, `isolate: false`, 10 000 tests, 7 rounds, peak RSS:**

| Arm                                   | Peak RSS median | Range     |   Wall |
| ------------------------------------- | --------------: | --------- | -----: |
| hand-written `vi.fn()`                |         6366 MB | 6249–6801 | 2.63 s |
| vitest-auto-spy default               |         2103 MB | 1995–2167 | 2.17 s |
| vitest-auto-spy, `lazySpies: 'proxy'` |         1851 MB | 1835–1960 | 2.38 s |

Hand-written `vi.fn()` peaks at 3.0× the library's default and 3.4× the `'proxy'` mode. The
proxy/default ratio was below 1.0× in 7 of 7 rounds: 0.854, 0.879, 0.889, 0.893, 0.894, 0.922,
0.932. The wall-clock column changes sign across rounds, so it is **not** a result. Read only RSS
here.

Why it shows only under `isolate: false`:

- Under `isolate: true`, a test's doubles are freed when its environment tears down. Nothing adds
  up across the file.
- Under `isolate: false`, every double a file ever built stays reachable for the worker's life. The
  cost of one double is multiplied by every double the file made.

That is how a per-double difference becomes a multi-gigabyte gap. It can decide whether a run
finishes or gets OOM-killed.

The same workload also runs about 4× faster under `isolate: false` (2.17 s) than under
`isolate: true` (9.42 s). That is more than any library choice measured here.

These RSS tables predate the 2026-09-27 proxy, and they measure the older one.

### Choosing a setting for your suite

1. **`isolate: false` first.** It is worth about 4× on its own, more than any library or
   flag measured here. Memory then becomes the limit, because everything a file allocates stays
   alive until the run ends. See
   [One environment instead of one per file](#_1-one-environment-instead-of-one-per-file).
2. **Leave `lazySpies` unset.** The width picks the lighter double: a plain object below 8 methods,
   a proxy from 8. Pass `lazySpies: true` only for a spec that needs a plain object or reads one
   member in a hot loop.
3. **Do not expect a suite-scale speed win over hand-written `vi.fn()`.** Under `isolate: true` the
   two are level at 1 000 and 3 000 tests. At 10 000 this library is roughly 8 % behind. The
   case for the library is memory, the lazy default, the cached prototype walk, `calledWith`, and
   type-level and deep doubles.
4. **Against the jest-auto-spies family** the win holds everywhere tested: roughly 1.5× faster in
   every round, at every suite size and class width.

### What is not explained

About 98 % of `@bugsplat`'s suite-scale deficit is not explained by the per-double difference:

| At 10 000 tests                             | Wall-clock  |
| ------------------------------------------- | ----------- |
| `@bugsplat`'s measured deficit              | about 5.4 s |
| per-double gap (about 10 µs) × 10 000 tests | about 0.1 s |

Its peak RSS is also higher: 1509 MB against 1295 MB at 10 000 tests, 20-method class. More GC work
is _consistent with_ the rest of the gap. That link was not measured and is not claimed.

### Reproducing this

```bash
npm ci
npm ci --prefix bench
npm run bench:vs                 # micro-benchmark, about one minute
npm run bench:suite --help       # suite-scale harness documents itself; tens of minutes at 10 000 tests
```

| Command                               | What it measures                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run bench`                       | [Measured](#measured): this library against itself                                           |
| `npm run bench:vs`                    | the micro-benchmark, one run, about a minute                                                 |
| `npm run bench:vs:precise`            | the published micro-benchmark: seven runs, about eleven minutes                              |
| `npm run bench:memory`                | [Retained memory per double](#retained-memory-per-double)                                    |
| `npm run bench:suite`                 | [Suite scale](#suite-scale) and [Memory under `isolate: false`](#memory-under-isolate-false) |
| `npm run bench:angular -- --repeat 5` | [Rendering the child subtree](#_2-rendering-the-child-subtree)                               |
| `npm run bench:angular-builder`       | [Vitest 5 under the Angular builder](#vitest-5-under-the-angular-unit-test-builder)          |

The bench install sets `legacy-peer-deps=true` on purpose. The competitors declare `vitest` as a peer.
A second copy beside the root one gives two mock registries. The bench's prune then reaches only one,
and the run dies out of memory.

The Angular render benchmark's README describes its method and two ways it can silently measure
nothing.

## Bundle size

The badge says 30.3 kB min+gzip, and that is the whole core entry bundled together. Each subpath is
a separate entry, and a project pays only for the ones it imports:

| Imported                                      |    min+gzip |
| --------------------------------------------- | ----------: |
| `.` — the core entry, what the badge measures | **30.3 kB** |
| `vitest-auto-spy/angular` on its own          |     38.7 kB |
| `vitest-auto-spy/angular/doubles`             |     21.4 kB |
| `vitest-auto-spy/angular/diagnostics`         |      7.5 kB |
| `vitest-auto-spy/angular/matchers`            |      3.2 kB |
| `vitest-auto-spy/react` / `/vue` / `/svelte`  |     30.3 kB |
| `vitest-auto-spy/setup`                       |     31.1 kB |
| `vitest-auto-spy/node`                        |     29.5 kB |
| `vitest-auto-spy/dom-stubs`                   |     12.1 kB |
| `vitest-auto-spy/rxjs`                        |      2.3 kB |
| `vitest-auto-spy/angular-router`              |     11.2 kB |
| `vitest-auto-spy/angular-http`                |      4.3 kB |
| `vitest-auto-spy/signal-forms`                |      1.3 kB |
| `vitest-auto-spy/zone`                        |      1.2 kB |

None of this reaches a production bundle: the package is a devDependency.

- **The three `/angular/*` rows are `/angular` split apart, not extra weight.** Before the split, a
  project paid 30.4 kB in every Angular spec file. After it, 26.3 kB there, plus the other rows once
  in the setup file. That file calls `enableAngularDiagnostics`, `registerSignalMatchers` or the
  Material dialog doubles.
- **`/angular` takes the core from the root entry.** Until 2026-09-26, each carried its own copy of
  the ~130 kB core, parsed twice per spec file. Root plus `/angular` now weigh 38.8 kB instead of
  55.8 kB, and import in 5.8 ms instead of 7.3 ms. `/angular` imported alone brings the root with it:
  33.6 kB instead of 30.6 kB.
- **The framework rows equal the core row.** `/react`, `/vue` and `/svelte` are 1.1–1.3 kB
  re-exports of the root (`/vue` adds `provideAutoSpy`). A process that loads the root next to one
  of them loads the core once.

Every figure is the committed size baseline, which the badge also reads. The repository's gate fails
when a row stops matching it. Growth of more than 3 % over the last release fails the size check
until the changelog says what the bytes are for. A separate check prints all twenty-six entries
against the baseline. An entry that quietly gains a second copy of the core fails it.

How each row got to its current size is under
[In depth](#how-the-size-rows-got-here).

### What is in the download

The published tarball is **1 019 kB** over **114 files** (`npm pack --dry-run`, 2026-09-26). It is
3.5 MB unpacked. It carries the 5.x changelog only; the full history is in the repository.

Where the bytes are:

| File                           |   Size | Loaded by a spec run?                                            |
| ------------------------------ | -----: | ---------------------------------------------------------------- |
| the `vitest-auto-spy` CLI      | 252 kB | no: it is the command-line tool                                  |
| the ESLint plugin (`.cjs`)     | 180 kB | no: ESLint loads it                                              |
| the root entry                 | 170 kB | always                                                           |
| the `/angular` entry           |  59 kB | on Angular; it imports the core from the root                    |
| `README.md`                    | 417 kB | no                                                               |
| `AGENTS.md` with `agent-docs/` | 389 kB | no: the reference for coding agents that read the installed copy |

`/setup` and `/node` are built as one file each. Each used to reach twelve to fourteen modules
through the loader. Per spec file, Node 24, median of 25 runs:

| Import                       | Before |    Now |
| ---------------------------- | -----: | -----: |
| `/setup`                     | 5.6 ms | 3.1 ms |
| root + `/setup`              | 7.0 ms | 4.9 ms |
| `/react`                     | 5.5 ms | 3.1 ms |
| `/node`                      | 3.4 ms | 1.7 ms |
| root + `/angular` + `/setup` | 7.7 ms | 5.9 ms |

The same Angular shape went 9.9 → 8.5 ms when `/angular` started taking the core from the root. The
bill is **+108 kB in the tarball** and about 442 kB on disk, paid once at install. A cold-import
check guards these times against a committed baseline. It counts modules as well as bytes.

Two of those milliseconds were not loading at all. The root entry and `/setup` formatted a stack
trace at import, to tell the caller's frame from the library's in call-site messages. Under Vitest
the first formatted stack in a spec file costs most of a millisecond. That probe now runs only when a
strict or constructor double first reports a call site. Per spec file under Vitest 5, median of 93
files over 31 runs:

| Import          | Before |    Now |
| --------------- | -----: | -----: |
| root + `/setup` | 8.6 ms | 6.8 ms |
| the root alone  | 5.4 ms | 4.0 ms |

The root entry and `/angular` also reach the loader as few modules. The loader's cost is per module,
not per byte. Measured 2026-09-04:

| Entry      | Modules, before → after | Saved per spec file |
| ---------- | ----------------------- | ------------------: |
| root       | 8 → 2                   |        about 0.8 ms |
| `/angular` | 10 → 2                  |        about 1.0 ms |

That cost about 120 kB in the tarball. The process-wide state (the mock-adapter registry, observable
and jasmine support, the package identity, the emission timeout) stays in one shared module, so
there is exactly one registry. Only the state goes in. Pinning just the emission helper's default timeout there paid off. It took 10.0 kB off the module graph of seven entries. It took 2.5 kB off the eight that export an emission helper; `/setup` min+gzip went 12 092 → 12 072 B then. Making every entry standalone would add
429 kB and duplicate the registries.

No module is emitted twice within the shared chunks. No byte of a peer dependency (`vitest`,
`@angular/*`, `rxjs`) is inlined anywhere. `/signal-forms` used to break that rule quietly: its
graph measured 274 kB, nearly all of it `@angular/forms`. Its own graph is **5.9 kB**.

CommonJS ships only for `vitest-auto-spy/node` and `vitest-auto-spy/eslint-plugin`. Everything else
is ESM-only. Why is under [In depth](#why-commonjs-ships-for-two-entries-only).

### DOM stubs off the root entry

Since 4.0 the DOM stubs live behind `vitest-auto-spy/dom-stubs`. ESM re-exports are eager, and no
runner tree-shakes a test file, so every spec used to evaluate them. Measured when they moved:

| Spec file                    |        Change |
| ---------------------------- | ------------: |
| does not import `/dom-stubs` | **−0.159 ms** |
| imports `/dom-stubs`         |     +0.155 ms |
| built output                 |      −20.3 kB |

### Types without rxjs

Since 4.0 no declaration outside `vitest-auto-spy/rxjs` and `vitest-auto-spy/observer-spy` names rxjs, and the
build fails if one does. Measured against a consumer whose only use of the library is
`createSpyFromClass`:

|                                                           | 3.18 |     4.0 |
| --------------------------------------------------------- | ---: | ------: |
| files in the consumer's TypeScript program                |  303 | **114** |
| of those, rxjs `.d.ts` files                              |  189 |   **0** |
| `TS2307` with `skipLibCheck: false` and no rxjs installed |  yes |    none |

A type-only import is resolved like a value import, so `import type` alone would not have fixed it.

## Lint cost of the ESLint plugin

The plugin takes 56 ms over 173 spec files and 68 ms over a single 1.7 MB spec. Most of the earlier
cost was three rules asking a whole-file question once per node. They now ask once per file or per
block:

| Rule                                                  |   Before |   After | Measured on     |
| ----------------------------------------------------- | -------: | ------: | --------------- |
| `no-inject-before-override`, `no-overridden-provider` | 1 028 ms | 0.13 ms | a 249 kB spec   |
| `prefer-render-shallow`                               | 2 528 ms | 12.8 ms | the 1.7 MB spec |
| `no-redundant-smoke-test`                             |    46 ms |  9.7 ms | the 173 specs   |
| the whole plugin                                      |    93 ms |   56 ms | the 173 specs   |
| the whole plugin                                      | 3 263 ms |   68 ms | the 1.7 MB spec |

No message or position moved: the rules decide the same things, only fewer times.

## Why this is not written in Rust

The question comes with scale: ten or twenty thousand tests, a real CI bill, and a library on the hot
path of every test. A native addon sounds like the obvious lever. It is not, for two reasons. The
time is not in the spies. And the part a native addon could take over is smaller than the part it
could not.

### What a native version could actually take over

On every call a spy does two things. It enters the recording code, and it keeps its arguments for
`mock.calls`. Only the second is a candidate, and it resists.

Arguments are live JavaScript values: component instances, `Subject`s, DOM nodes.
`toHaveBeenCalledWith` compares them by identity as well as by structure. Keeping one from Rust
needs an N-API reference per argument, created and released on every call. Serializing them would
be cheaper, but it destroys the identity every matcher depends on. A JavaScript array keeps the
semantics without crossing a boundary.

Everything around that stays JavaScript:

- `spy.mock.calls` must be a plain array, because Vitest's matchers walk it synchronously.
- `mockReturnValue` must hand back a JavaScript value.
- On Bun and `node:test`, the mock object comes from `mock()` / `t.mock.fn()` and belongs to the
  runner.

The budget is small, too. The `unconfigured dispatch` row in [Measured](#measured) is **0.25 µs
for three calls**: about 83 ns each, `mockClear` included. That is the whole per-call cost. Since
4.1, on Vitest, all of it is this library's code: [the spy engine](#the-spy-engine).

### And spy construction does not show up in a CI job

Take a 10 500-test Angular suite where every test builds four doubles. At 2.67 µs for a 14-method
double, that is **about 0.11 s of CPU** for the whole suite, before workers split it. Removing spy
construction entirely would not move a CI job. Its minutes go on checkout, install, bundling and
coverage.

Coverage makes the ratio worse. Coverage is normally scoped to application sources, so the library
is not instrumented. The coverage slowdown lands on your code and misses the spies.

### What a native build would cost

Against a saving lost in the noise:

- **Six or more platform binaries** in every consumer's `devDependencies`, with install-time
  failures. A testing library must never break the tool you would use to diagnose it.
- **The runners this package supports.** `bun:test`, `node:test` and browser mode are first-class.
  A native addon does not load the same way across them, or at all in a browser. A WASM fallback
  would be slower than the JavaScript it replaced.
- **Sandboxes**: StackBlitz, WebContainers, a bare CI image without a matching prebuild.

The native wins in a JavaScript test stack are real, and others have taken them: the bundler, the
transformer, the linter. Those tools process the whole source tree once per run. A spy factory
hands back an object, a microsecond or two at a time. It should be small, lazy and boring.

## In depth

History and design notes behind the numbers above. You do not need them to choose a setting.

### How the engine reaches `vi.clearAllMocks()`

Two parts of the engine needed building.

- **`vi.clearAllMocks()` has to reach a spy that is in no registry.** Vitest clears mocks by walking
  a `Set` inside `@vitest/spy`. Only `vi.fn()` and `vi.spyOn()` write to it, and there is no API to
  add to it. So the adapter registers one `vi.fn()` of its own, whose `mockClear` sweeps the
  library's spies. The walk reaches that mock, and that mock reaches all of ours. `clearMocks: true`
  and `mockReset: true` in a config keep working, because Vitest applies both the same way. This
  sentinel carries a mark the registry pruner skips. Dropping it would make the sweep a silent no-op.
- **A sweep must not walk anything.** The sweep bumps a counter. Each spy compares its own stamp
  against it before it records or reports, and empties itself if it is behind. Clearing every spy is
  one integer increment and holds nothing alive. The `mock` state object exposes its arrays through
  accessors. A state object a spec is holding also answers with the emptied arrays, as the runner's
  own state does.

### Why the accessors are shared

Creating a lazy double is still one `defineProperty` per accessor placeholder. That is now most of
what it costs. The helper bundle moved to a shared prototype; the placeholders cannot.

Sharing one `get` / `set` pair per method name was tried once and rejected. It was faster to build
and much slower to materialise. V8 keeps objects whose accessors all came from the same descriptors
on a shared fast-mode map. Turning an accessor into a data property rewrites that whole map. An
object with fresh closures has already fallen into dictionary mode and pays a hash update instead.

| Materialise all methods of one double | Before sharing | Naive sharing | Sharing + dictionary on first read |
| ------------------------------------- | -------------: | ------------: | ---------------------------------: |
| 100 methods                           |          45 µs |        223 µs |                            48.7 µs |
| 300 methods                           |         195 µs |      1 733 µs |                             144 µs |

The fix is to enter dictionary mode deliberately, once, at the double's first materialisation. An
untouched double never gets there. On JSC (Bun) there is no shared-map problem. The switch buys
nothing there and costs about 50 ns per materialised method. It is paid anyway, because the memory
win holds on both engines. `Object.create(prototype, descriptors)` has the same fast-mode problem.

The one cut not made is putting the accessors on a shared **prototype**. Then `Object.keys(spy)` and
`{ ...spy }` would stop listing methods nobody has touched. A spec could observe that.

### How the retained memory came down

The table in [Retained memory per double](#retained-memory-per-double) is the 2026-09-27 edition.
Only this library's rows moved against the 2026-09-26 edition; the runner and the jest-auto-spies
family are within a few bytes.

| Date       | Change                                                                                                                           | Effect                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-17 | lazy placeholder became one shared accessor pair per method name, not a closure pair per double                                  | untouched `lazySpies: true` double: 25 593 → 215 B (100 methods), 70 165 → 284 B (300 methods); building a 300-method double ~28 % slower, materialising all its methods ~26 % cheaper |
| 2026-09-26 | call-state arrays seeded with room for four calls instead of growing to seventeen slots on the first `push`                      | a method called 1–4 times holds 30–38 % less; more calls +8 B. Per called method: 1 947 → 1 332 B (10 methods), 1 905 → 1 290 B (100)                                                  |
| 2026-09-27 | a built method spy dropped an empty `Once` queue, a closure context, its own state object and a six-slot dispatch context: 128 B | "all called", `lazySpies: true`, 100 methods: 1 290 → 1 161 B per method (−10 %)                                                                                                       |
| 2026-09-27 | the `accessorSpies` bag built from objects sized to hold nothing (V8 reserves four slots in every `{}`)                          | bag 152 → 88 B; untouched `lazySpies: true` 100-method double 243 → 178 B                                                                                                              |
| 2026-09-27 | `createAutoMock` and `mockDeep` nodes create their accessor and tombstone collections on first `defineProperty` or `delete`      | untouched auto-mock 705 → 369 B (1 184 B the edition before)                                                                                                                           |
| 2026-09-27 | the auto-mock Proxy handler became one handler per run instead of an object and seven trap closures per double                   | part of the 369 B above                                                                                                                                                                |
| 2026-09-27 | `'proxy'`: one trap handler per double and one method-name set per class                                                         | untouched 100-method proxy double 4 097 → 259 B                                                                                                                                        |
| 2026-09-27 | classes of 8 methods or more default to `'proxy'`                                                                                | the default row is now `'proxy'`; the old default is the `lazySpies: true` row                                                                                                         |
| 2026-09-29 | a called spy records four arrays until read; the fifth call copies into eight slots, the ninth into seventeen                    | once-called spy 890 → 696 B; five calls 1 503 → 1 208 B; eight calls 1 793 → 1 495 B; unchanged from nine                                                                              |
| 2026-09-29 | `mock.results` keeps the returned value until read; the `{ type, value }` entries are built on the first read                    | per recorded call 142 → 102 B; "all called" double −4 % more (default, 100 methods: 91 638 → 87 638 B)                                                                                 |

V8 reserves seventeen slots on the first `push` into an empty array: about 900 B of empty slots on a
method called once. That is what the 2026-09-26 change removed.

### Benchmark mistakes that were fixed

Two things were wrong on the first attempt of the cross-library benchmark:

- **The first run imported this library from source, outside `node_modules`.** `@vitest/coverage-v8`
  skips any `/node_modules/` URL before user config is read. So only this library's sources were
  instrumented and transformed per worker; the competitors' prebuilt code was not. Every arm now
  measures the built package, which removed a penalty that fell only on this library.
- **Arms first ran in blocks**, all repeats of one arm, then the next. Machine drift landed on
  whichever arm ran later. Arms now run interleaved round-robin.

The cross-version table in [Which Node version](#which-node-version) comes from a standalone
harness, not from `npm run bench`. The Vitest bench returned figures orders of magnitude apart
between runs of the same case. `@vitest/spy` keeps every mock in a module-level strong `Set`, so
each case ran into the heap the previous one left. The bench now calls `pruneMockRegistry()` (from
`vitest-auto-spy/setup`) after every case. It still cannot compare two runtimes: that needs a
separate process per version, with the runner outside the measurement.

### Node 18

Node 18 was the previous floor. `vitest run` exits immediately there, and Node 18 cannot run
Vitest 4 at all (see [Installation](./installation)). It does import the library: 9.4 ms cold,
45.7 MB of RSS afterwards, 13.7 ms to start. That is faster to import than 20 or 22, so the ranking
is not monotonic in the version. Node 18 and 20 are both past end-of-life.

### How the size rows got here

An earlier edition quoted 15.1, 18.7 and 14.5 kB for the first three rows. That was before the
defaults registry, the outside-a-hook report and the shadowed-provider check. Every figure below is
the tree measured on 2026-09-20, oldest change first.

| Change                                                                                                                                                   | Entry                         | Delta                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `stubWebStorage`                                                                                                                                         | `/dom-stubs`                  | +256 B                                                                                       |
| `createComponentStub`                                                                                                                                    | `/angular`                    | +1.02 kB                                                                                     |
| claim record that keeps helpers on a spy when two copies of the package share a process                                                                  | core rows                     | +0.12…0.27 kB                                                                                |
| suite-wide settings read off `globalThis`, misconfiguration grade, bounded strict report, lifecycle-hook exemption                                       | core rows                     | +0.34…0.43 kB                                                                                |
| recorder behind `takeStrictViolations`, swallowed-strict guard                                                                                           | core rows                     | +0.16…0.41 kB                                                                                |
| read-side report: getter and stream trackers, `unconfiguredReads` ledger, `selfReturning`                                                                | core rows; `/setup`           | +0.37…0.41 kB; +0.61 kB                                                                      |
| token registrations                                                                                                                                      | core rows                     | +18 B                                                                                        |
| dispatch-replacement report (hook and message in the shared spy engine)                                                                                  | every runtime entry; `/setup` | +0.28…0.44 kB, root 17.19 → 17.50 kB; +85 B                                                  |
| `renderShallow` shape fix                                                                                                                                | `/angular`, `/bun`, `/node`   | on top of the above                                                                          |
| `setInputs`, `window` / `document` and Material-dialog doubles, the `ResourceRef` double, recomputation counters                                         | `/angular`                    | +3.26 kB against v5.8.0, the largest move of that entry                                      |
| of which: unforgeable members the `window` double answers by hand, dialog ref checked against its component                                              | `/angular`                    | 0.35 kB                                                                                      |
| `Router` double built on Angular's own `DefaultUrlSerializer`, `createUrlTreeFromSnapshot` and `RouterState`                                             | `/angular-router`             | +4.32 kB (tripled)                                                                           |
| navigation in flight: `currentNavigation()`, `setCurrentNavigation()`, event bookkeeping                                                                 | `/angular-router`             | +390 B (6411 → 6801 B, +6.1 %)                                                               |
| dispatch-replacement report                                                                                                                              | `/angular-router`             | +338 B (6801 → 7139 B, +5.0 %)                                                               |
| `Location` double: Angular's `SpyLocation`, `collectRouterEvents()`, `resolve` / `title` fields                                                          | `/angular-router`             | 8492 → 9048 B (+6.5 %)                                                                       |
| rules of the two previous releases                                                                                                                       | `/eslint-plugin`              | +1.77 kB                                                                                     |
| `no-redundant-smoke-test`                                                                                                                                | `/eslint-plugin`              | +1122 B (31295 → 32417 B, +3.6 %)                                                            |
| two fixes: the subject the rule weighs, the doubles `prefer-create-spy-from-class` exempts                                                               | `/eslint-plugin`              | +371 B (32417 → 32788 B, +1.1 %)                                                             |
| `prefer-provide-auto-spy`, `prefer-set-inputs`                                                                                                           | `/eslint-plugin`              | +2068 B (to 34 856 B, +6.3 %)                                                                |
| `createForm` and one matcher over Angular's own `form()`                                                                                                 | `/signal-forms` (new)         | 1.36 kB                                                                                      |
| after v5.15.1: guard that refuses an AOT scope `renderShallow` cannot rebuild (mostly error text)                                                        | `/angular`; `/bun-angular`    | +452 B; +508 B (21 429 → 21 937 B, +2.4 %)                                                   |
| `narrow.defined`                                                                                                                                         | other runtime rows            | +53…112 B                                                                                    |
| object-spread message, stub-factory exemption                                                                                                            | `/eslint-plugin`              | +501 B                                                                                       |
| entries emitted as standalone bundles instead of a shell around shared chunks                                                                            | `/setup`; framework rows      | 18.3 → 17.1 kB; 17.9 → 17.6 kB                                                               |
| repair round: nested-matcher structural matcher, symbol-keyed and static-member discovery, `/setup` teardown and guard modules, Angular internals canary | solo rows; chunked rows       | +2.4…3.6 kB (root 17.6 → 20.1, `/angular` 26.9 → 30.4, `/setup` 17.1 → 18.9 kB); +0.1…1.3 kB |
| v5.20.0: `mockDeep` arrays, `fallbackMockImplementation`, `createSpyFromInstance` passthrough, `adoptMock`, `moduleNamespace` passthrough                | every core row                | +1.74…1.79 kB (root 20.3 → 22.1 kB)                                                          |
| v5.20.0: `stubResponse` and the MSW check                                                                                                                | `/setup`                      | +0.36 kB                                                                                     |
| v5.20.0: `no-hand-assigned-global`                                                                                                                       | `/eslint-plugin`              | +1.01 kB                                                                                     |
| v5.21.0: `/angular` split into three entries                                                                                                             | `/angular`                    | 30.4 → 26.3 kB                                                                               |
| v5.21.0: patch journal's per-entry file stamp, weak-keyed defaults registry                                                                              | core rows                     | +0.2…0.4 kB                                                                                  |
| `prefer-stub-response`                                                                                                                                   | `/eslint-plugin`              | +0.87 kB                                                                                     |
| JSON `null` body                                                                                                                                         | `/setup`                      | +0.11 kB                                                                                     |

The standalone bundles are the one move downward. The duplication they cost is paid on disk, not in
any one entry: see [What is in the download](#what-is-in-the-download).

The tarball's own history:

| Date        | Tarball             | Note                                                               |
| ----------- | ------------------- | ------------------------------------------------------------------ |
| v2.0.0      | 241 kB, 54 files    | thirteen subpaths, no CLI, an ESLint entry a sixth of today's size |
| 2026-09-12  | 584 kB, 84 files    | against 1 560 kB of built output                                   |
| (same tree) | 751 kB, 82 files    | after the standalone bundles, before the repair round              |
| 2026-09-17  | 818 kB, 84 files    |                                                                    |
| 2026-09-20  | 867 kB, 96 files    | twelve files from the Angular split and two CLI JSON reports       |
| 2026-09-26  | 1 019 kB, 114 files | current                                                            |

An older edition presented the v2.0.0 figures as a reduction. They were correct for that package,
which was a different package from today's.

### NG0101 under zone.js

`NG0101: ApplicationRef.tick is called recursively` can appear when a test drives change detection
under zone.js. The chain:

1. `TestBed.createComponent` builds the component inside `ngZone.run(…)`. Every `effect()` its
   constructor registers records the zone's inner zone.
2. A tick started from a test body runs in the runner's zone. To run a **dirty** effect, Angular hops
   back with `effect.zone.run(() => effect.run())`.
3. Leaving that hop turns the zone from unstable to stable. `NgZone.onMicrotaskEmpty` reports it.
4. The subscriber `provideZoneChangeDetection()` installs answers with `ApplicationRef._tick()`. It is
   guarded against its own scheduler, but not against a tick already running. The running tick is
   re-entered, and Angular throws `NG0101`.

It is hard to meet and hard to see. The Angular CLI's `@angular/build:unit-test` adds
`provideZoneChangeDetection()` to any suite that loads zone.js, and one `effect()` is ordinary. But
the effect must be dirty at that moment, so the same call is fine until it drives a first render.
The error goes to `ErrorHandler` rather than being thrown. A suite that does not fail on console
output stays green, with change detection unfinished.

On an Angular 22 suite of 1771 spec files, rewriting 451 `componentRef.setInput` calls to `setInputs`
turned **57 green files red**, all on `NG0101`. None stayed red once the tick moved inside the zone.

One side effect under zone.js: leaving the zone reports it stable, so the subscriber ticks once more.
Counted on `ApplicationRef.afterTick`, one `flushEffects()` is 2 application ticks instead of 1 under
zone.js, and unchanged under zoneless. `fixture.detectChanges()` has always caused the same second
pass here, and it finds nothing dirty.

### Resource settling, measured

Angular's resource primitives each need a different wait. Measured on Angular 21.2.17, zoneless
`TestBed`:

| What                                            | What it needs to settle            |
| ----------------------------------------------- | ---------------------------------- |
| `httpResource()`, after its response is flushed | one tick + one microtask           |
| `resource()` with an async loader               | two rounds of the same             |
| `httpResource()` that has just been created     | a tick, or it makes **no request** |

### How Angular suites use doubles

On a ~370-file Angular suite, the spy almost always arrives through DI:

| API                       | Files |
| ------------------------- | ----: |
| `provideAutoSpy`          |   371 |
| `injectSpy`               |   308 |
| `mockReadonlyProp`        |   127 |
| `instanceMethodsToSpyOn`  |   103 |
| `observablePropsToSpyOn`  |    79 |
| bare `createSpyFromClass` |    41 |

Hand-written providers, counted across two private Angular suites:

| Provider written by hand            | Count | Usual shapes                                                                                 |
| ----------------------------------- | ----: | -------------------------------------------------------------------------------------------- |
| `window`                            |    95 | `useValue: window` (isolates nothing), a slice such as `{ screen: { … } }`                   |
| `document`                          |    70 | a `mockDocument` with one hand-written `querySelector`                                       |
| Material dialog (data, ref, dialog) |    36 | an object on `MAT_DIALOG_DATA`, `{ close: vi.fn() }` on `MatDialogRef`, a spy on `MatDialog` |

The slices fail when a component reads a member the author did not think of: it gets `undefined`.
The hand-rolled dialog ref breaks on `afterClosed()`. A repair such as `afterClosed: () => of('saved')`
answers before anything closed the dialog, so the spec passes whether or not `close()` was called.

### Why CommonJS ships for two entries only

The package used to ship a `.cjs` build of every entry. Most of it could never load. Vitest refuses
to be required (`Vitest cannot be imported in a CommonJS module using require()`), so eight of the
twelve `.cjs` files threw on their first line. esbuild cannot code-split CommonJS, so each surviving
file carried its own copy of the adapter registries. Even `require('vitest-auto-spy/rxjs')` next to
`require('vitest-auto-spy/node')` failed with "Observable spies require rxjs": two bundles, two
disconnected registries. CommonJS now ships only where `require()` works and needs no second entry:
`vitest-auto-spy/node` and `vitest-auto-spy/eslint-plugin`.
