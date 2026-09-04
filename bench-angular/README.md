# The Angular benchmark

`bench/` measures the plain spy core. This directory measures the other half of a slow Angular
suite: what a `TestBed` per-test cycle costs, and how much of it
[`renderShallow`](https://asdalexey.github.io/vitest-auto-spy/adapters/angular#shallow-component-rendering)
takes off. It exists because until now nothing in the repository produced those figures — the
per-render table and the `keepTemplate` rung on the
[Performance](https://asdalexey.github.io/vitest-auto-spy/core/performance) page were hand-run
measurements that a reader could not reproduce and CI could not defend.

## The commands

Run these from the **repository root**. Nothing needs installing: every dependency here is already
a devDependency of the root package.

```bash
npm run bench:angular                   # one pass, ~40 s — for editing the benchmark
npm run bench:angular -- --repeat 5     # five passes merged by median — what a quotable number needs
npm run bench:angular -- --markdown     # the same table as markdown, for pasting into a page
```

Like every other command in this repository, it prints a boxed table to a terminal and markdown
through a pipe, so `npm run bench:angular -- --repeat 5 > table.md` gives a documentation page
something it can take verbatim.

## The gate

`scripts/bench-check.mjs` is generic — it takes any results file and any baseline — so this project
needs no gate of its own:

```bash
npm run bench:angular -- --repeat 5 --json bench-results.angular.json
npm run bench:check -- bench-results.angular.json --baseline bench-angular/baseline.json
```

**Feed it a merged five-pass file, not a single pass.** A single pass of this benchmark is not a
gate-quality measurement and will produce a false failure: on one unmodified run
`renderShallow(), full cycle` came back at `0.724×` of its block reference against a `0.174×`
baseline — a four-fold "regression" in a working tree with no changes in it, reported at ±63 % rme
by the run itself. Five passes merged by median put the same arm back at `0.174×`.

Keep it **report-only** (no `--strict`) for the same reason the self-benchmark gate is report-only:
until it has run on CI hardware often enough to know its own spread, a gate that cries wolf gets
switched off.

Regenerating the baseline, which is what a deliberate change to the shape under test needs:

```bash
npm run bench:angular -- --repeat 5 --json bench-results.angular.json
npm run bench:check -- bench-results.angular.json --baseline bench-angular/baseline.json --update
```

Two things about `--update` here. It rewrites `generated.command` with the **self**-benchmark's
command line, because `scripts/bench-check.mjs` hard-codes that string; correct that one line by
hand afterwards. And it honours the `reference` arm already recorded for each case, which is why
those are pinned to `TestBed.createComponent, full cycle` (and to the full cycle in the last block)
rather than left to default to the fastest arm: the ratio worth gating is `renderShallow`'s share of
a plain cycle, and if the reference floated to whichever arm happened to win, a `renderShallow`
regression would silently rebase the whole block instead of showing up.

## Why this is not in `bench/`

`vitest.bench.config.mts` carries no Angular plugin and no `TestBed` setup, deliberately: the spy
numbers it publishes must not include the Angular transform. This project has the opposite
requirement — every figure it reports is a `TestBed` figure — so it gets its own config
(`vitest.bench.angular.config.mts`) and its own TypeScript program
(`tsconfig.bench-angular.json`). Keep them apart.

## Methodology

- **60 reps after 30 warm-up reps per arm, `time: 0`.** A time budget would hand the microsecond
  rungs (a bare `resetTestingModule`) five orders of magnitude more samples than the millisecond
  arms they are compared against.
- **The published figure is the median**, in milliseconds, and `p75` is printed beside it. The rest
  of this repository publishes `p75` because its cases allocate by the hundred thousand and a GC
  pause lands in some samples and not others; these cases build whole component trees and take
  milliseconds, so the pause is inside every sample rather than a few of them.
- **`--repeat N` merges whole passes by median.** Raising the rep count lowers `rme`, which bounds
  the mean within a pass; it does nothing for the run-to-run spread, and the run-to-run spread is
  what moves here. `TestBed.createComponent` at 100 children came back as 1.21, 1.39, 1.49 and
  1.54 ms on four consecutive unmodified single passes.
- **Every per-test arm starts with `TestBed.resetTestingModule()`**, because that is where a real
  suite pays to tear the previous fixture down, and both arms of a comparison pay it.
- **The last block carries its own copy of the full cycle** as its reference arm. Arms measured
  minutes apart in one process are not comparable to the third decimal — this file's own numbers
  drift 10–20 % between the first block and the last as V8 finishes warming up — and every claim in
  that block is a claim about a _fraction_ of a cycle.

## The shape under test, and its two traps

A host component holding an `@for` of a child component, at 0 / 25 / 100 / 400 children. The child
is deliberately minimal: one element and one binding.

**Trap one — `input()` is not compiled in this file.** The obvious way to write the four sizes is
one host with `rows = input<number[]>([])` and a `setInput` per arm. It measures nothing: the
Angular plugin does not process initializer-API inputs here, every `setInput` fails with `NG0303`,
and all four sizes render a childless component. The first draft of this benchmark reported
0.51 / 0.38 / 0.34 / 0.28 ms for 0 / 25 / 100 / 400 children — the arrival order of the JIT warm-up,
with the curve pointing the wrong way. Hence four host classes with literal row counts: a size that
did not take shows up as four identical rows. The same applies to the child's input, which is an
`@Input()` decorator rather than `input()`; an unbound `[value]` logs an `NG0303` **per child
instance**, and 100 of those per rep is what the arm would then be measuring.

**Trap two — a minimal child understates the middle rung.** `keepTemplate: true` renders the host's
own template while every child in it resolves to nothing under `NO_ERRORS_SCHEMA`, so what it saves
is exactly the children's own cost. With a one-element child that saving is real but modest
(1.60× here); with a child that owns a real template it is larger. The number in the table is a
floor, not a typical case.

## What this measures and what it does not

It measures one render, on one shape, on one machine. A spec file's wall clock also pays for
imports, the testing module and the assertions, none of which shallow rendering touches — so a
per-render ratio is the **upper bound** on what a file can gain, not a prediction of it. Finding
the files where that bound is worth chasing is what
[`enableTestBedDiagnostics()`](https://asdalexey.github.io/vitest-auto-spy/adapters/angular#where-a-spec-spends-its-time)
is for.
