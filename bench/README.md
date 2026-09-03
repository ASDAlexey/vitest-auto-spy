# Benchmarks

Everything that produces a published performance number lives here or is driven from here. The
tables these commands generate are on the docs site under
[Performance](https://asdalexey.github.io/vitest-auto-spy/core/performance) — this file is how you
regenerate them yourself.

## Run it

From the **repository root**, not from this directory:

```bash
npm ci
npm ci --prefix bench
npm run bench:vs
```

That is the whole thing, and it is identical on Windows, macOS and Linux — every dependency here is
pure JavaScript, nothing compiles. The package's declared floor is Node 18; the published numbers
were measured on v24.19.0, which is also the version CI measures them on. Takes about a minute.

Two installs, because the libraries this benchmark measures are not dependencies of the package —
see [Why a second package.json](#why-a-second-packagejson) below.

## What each command does

| Command | What it measures | Cost |
| --- | --- | --- |
| `npm run bench` | This package against itself — lazy against eager spies, `lazySpies: 'proxy'`, `calledWith` dispatch. Needs no install here. | ~1 min |
| `npm run bench:vs` | This package against `jest-auto-spies`, `jasmine-auto-spies`, `@bugsplat/vitest-auto-spies`, `vitest-mock-extended`, `@golevelup/ts-vitest` and a hand-written `vi.fn()` control. | ~1 min |
| `npm run bench:suite` | Whole synthetic suites — 1 000 / 3 000 / 10 000 tests — measuring wall-clock and peak RSS per library. | tens of minutes |

`npm run bench:suite -- --help` documents its own options. Start with the smoke run, which finishes
in well under a minute and proves the harness works before you commit to the long one:

```bash
npm run bench:suite -- --sizes 100 --repeats 1
```

The suite harness installs its own pinned copies of the competitors into a temporary directory and
deletes it on every exit path, so it needs no install here and leaves nothing behind.

## Reading the output

**Read the `p75` column, not `hz`.** These cases allocate spy objects by the hundred thousand, so a
GC pause lands in some samples and not others: `hz` for one case swings several-fold between runs —
and Vitest's "N× faster" summary swings with it — while `p75` reproduces to the fourth decimal.

**Ratios transfer between machines; absolute times do not.** Every arm runs back-to-back in one
process on one machine, which is what makes the ratio meaningful. The microseconds describe the
machine that produced them and nothing else.

**A ratio from `bench:vs` is not a suite-level claim.** Per-operation cost and end-to-end suite cost
are different quantities and they do not agree — the micro-benchmark has this package roughly 4.9×
faster than a hand-written double on a 40-method class, and across a real suite that advantage is
gone, because building a double is on the order of one per cent of what a test costs. If you are
quoting a number at anyone, quote the suite-scale one.

## How `jest-auto-spies` and `jasmine-auto-spies` run here

Neither ships a runner, and neither runner is installed. [`runner-globals.ts`](./runner-globals.ts)
gives them a minimal `jest` / `jasmine` global backed by `vi.fn()` — for jasmine, a spy whose `.and`
is the object `@hirez_io/auto-spies-core` hangs its helpers on, which is why its configuration API
reads `spy.method.and.calledWith(x).returnValue(y)` where the other two read
`spy.method.calledWith(x).mockReturnValue(y)`.

This is what makes the comparison mean anything rather than a compromise on it. Every arm then
creates the same underlying mock, so the runner's per-mock cost is a constant shared by all of them
and what the numbers separate is each library's own work on top. Running `jest-auto-spies` on Jest
and this package on Vitest would report the difference between two runners, which is not the
question.

What it does mean is that these numbers describe each library's own code, not what you would see in
a Jest or Jasmine suite, where the runner's mock is a different implementation with its own cost.

All three of `jest-auto-spies@3.0.1`, `jasmine-auto-spies@8.0.1` and
`@bugsplat/vitest-auto-spies@1.0.0` depend on `@hirez_io/auto-spies-core@3.0.0` and differ only in
that factory — and they measure within a few per cent of each other, which is the point of running
all three rather than arguing from the source that they are one algorithm.

## Why a second `package.json`

The competitors are measured, not used. Keeping them in the root `package.json` would put four
libraries this package neither ships nor tests with into every contributor's install, so they live
here instead — the same arrangement `docs-site/` already uses.

Versions are pinned **exactly**, with no caret. A published benchmark number has to describe the
code that will actually install; a range means a fresh checkout can silently measure something the
table never measured.

## `bench/.npmrc` — do not delete it

It sets `legacy-peer-deps=true`, and that is deliberate.

The competitors declare `vitest` as a peer dependency. Left to itself, npm installs a second copy of
it here, beside the root one. Two copies of Vitest mean two copies of `@vitest/spy`, which means
**two mock registries** — and `@vitest/spy` keeps every mock it ever created in a module-level strong
`Set`, so the prune each benchmark case runs reaches only one of them. The other grows without limit
until the run dies with `JavaScript heap out of memory`, roughly seven groups in.

With this file, peers resolve upward to the root install and there is one Vitest. Both `npm install`
and `npm ci --prefix bench` honour it.

## How these numbers stay current

- [`.github/workflows/bench.yml`](../.github/workflows/bench.yml) runs `bench:vs` on a monthly
  schedule, on demand, and on any pull request touching `bench/**` or `src/lib/**`. Every arm runs in
  one job on one runner — splitting them across matrix jobs would compare two machines and report it
  as a difference between libraries.
- [`.github/dependabot.yml`](../.github/dependabot.yml) watches this directory's `package.json`, so a
  competitor's release opens a pull request and that pull request re-measures the table against the
  new version. That is the whole anti-rot mechanism; if you change one of those two files, check the
  other still lines up with it.

Results are written to the workflow's job summary, so you can read a run you did not trigger.

## Two rules the harness follows, learned the hard way

**Measure the built `dist/`, never `src/`.** `@vitest/coverage-v8` drops any URL containing
`/node_modules/` before user configuration is consulted. A competitor's prebuilt package is therefore
never instrumented, while this package's sources — which are not under `node_modules` — would be, on
every run, plus an esbuild transform per worker that prebuilt JavaScript does not pay. Measuring
sources made hand-written doubles look 1.4× faster than they are.

**Interleave the arms, never run them in blocks.** All repeats of one arm, then the next, hands any
drift during the run — thermal, background load, cache state — to whichever arm ran last, and it
shows up as a library difference. The harness runs one round of every arm, then the next round.
