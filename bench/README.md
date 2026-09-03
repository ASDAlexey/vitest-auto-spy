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

The report speaks six languages — English, Russian, French, Chinese, Spanish and Portuguese — and
follows the shell locale, so `LANG=ru_RU.UTF-8` or `LANG=zh_CN.UTF-8` needs no switch at all. Pass
`--lang` to override it, which is what keeps a CI log English on a machine set to something else:

```bash
npm run bench:vs -- --lang fr        # en | ru | fr | zh | es | pt
node scripts/bench-report.mjs bench-results.json --lang zh   # re-read a run without measuring again
```

Only the words change; the numbers are identical, and thousands separators follow the language. The
case headings stay English in every language because they are the `describe` names from the
benchmark file — run data, not report text, and translating them by pattern would drift from the
file on the first edit.

## What each command does

| Command                    | What it measures                                                                                                                                                                  | Cost            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `npm run bench`            | This package against itself — lazy against eager spies, `lazySpies: 'proxy'`, `calledWith` dispatch. Needs no install here.                                                       | ~1 min          |
| `npm run bench:vs`         | This package against `jest-auto-spies`, `jasmine-auto-spies`, `@bugsplat/vitest-auto-spies`, `vitest-mock-extended`, `@golevelup/ts-vitest` and a hand-written `vi.fn()` control. | ~55 s           |
| `npm run bench:vs:fast`    | The same, budgets divided by eight — for editing the benchmark. Marks itself as not a result.                                                                                     | ~10 s           |
| `npm run bench:vs:precise` | Seven runs at double the budgets; the published numbers come from this.                                                                                                           | ~13 min         |
| `npm run bench:memory`     | Retained heap per double, across the same libraries, at two class widths and two touch levels.                                                                                    | ~40 s           |
| `npm run bench:suite`      | Whole synthetic suites — 1 000 / 3 000 / 10 000 tests — measuring wall-clock and peak RSS per library.                                                                            | tens of minutes |

`npm run bench:suite -- --help` documents its own options. Start with the smoke run, which finishes
in well under a minute and proves the harness works before you commit to the long one:

```bash
npm run bench:suite -- --sizes 100 --repeats 1
```

The suite harness installs its own pinned copies of the competitors into a temporary directory and
deletes it on every exit path, so it needs no install here and leaves nothing behind.

## Reading the output

Vitest prints one block per case and one row per arm inside it. The block heading names the case:

```
bench/vs-libraries.bench.ts > double from a class — 10 methods, 2 called   3091ms
```

`double from a class` is the operation being measured, `10 methods` is how wide the subject class
is, and `2 called` is how many of its methods the case actually calls afterwards — the ratio that
decides whether building spies lazily pays off. One iteration is one test. In spec terms that case
is this:

```ts
class OrderService {
  validate() {}
  save() {}
  // …eight more, ten in total
}

beforeEach(() => {
  orders = createSpyFromClass(OrderService); // the double is built here
});

it('saves a validated order', () => {
  checkout(orders);
  expect(orders.validate).toHaveBeenCalled(); // method 1 of 10
  expect(orders.save).toHaveBeenCalled(); // method 2 of 10
}); // the other eight are never touched
```

Eight of the ten are never needed, so an eager library pays for them and a lazy one does not. The
`all 10 called` row is the same class in a test that really does use every method — this package's
worst case, where the laziness is paid for with nothing to show. Both are published; quoting only
the first would be a lie by omission. The 40-method rows ask the same question of a class that is
wide by construction — a generated API client, an ngrx facade, a `Store` double.

The trailing `3091ms` is how long Vitest spent on
that whole block, not a result.

### What each column means

Every column except `hz`, `rme` and `samples` is **milliseconds for one iteration of the case**, so
`0.0048` means 4.8 microseconds.

Everything this project publishes is time per operation, never operations per second. Throughput
reads well and is the wrong number: it is computed from the mean, so one garbage-collection pause
among tens of thousands of samples moves it, and it answers a question — how many doubles can this
machine build in a second — that no spec has ever asked.

| Column                | What it is                                                                                                                                          | What to do with it                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                | The arm — one library, or the hand-written control.                                                                                                 | —                                                                                                                                         |
| `hz`                  | Iterations per second. Derived from `mean`, so it inherits every problem `mean` has.                                                                | **Do not quote it.** See below.                                                                                                           |
| `min`                 | The single fastest iteration.                                                                                                                       | Useful only as a floor — it is one lucky sample.                                                                                          |
| `max`                 | The single slowest iteration. Almost always a garbage-collection pause, which is why it is often a thousand times `min`.                            | Ignore.                                                                                                                                   |
| `mean`                | Arithmetic average over every sample.                                                                                                               | Ignore. One 8 ms pause among 70 000 samples drags it, and which arm eats that pause is luck.                                              |
| `p75`                 | 75th percentile — three quarters of the iterations were at or under this.                                                                           | **This is the number.** Every figure this project publishes is a `p75`.                                                                   |
| `p99`, `p995`, `p999` | The 99th, 99.5th and 99.9th percentiles. When these jump from hundredths of a millisecond to about 4, that is a major GC landing inside the sample. | Diagnostic only. Their size is normal here and is not a result.                                                                           |
| `rme`                 | Margin of error around the **mean**, as ±%, at 95% confidence.                                                                                      | A health signal, not a verdict on the figure beside it — the published number is the p75, which is exactly what a GC pause does not move. |
| `samples`             | How many iterations were timed. Equal for every arm inside one block, by construction.                                                              | Confirm they match. If they ever diverge, the fairness argument below has broken.                                                         |

### Three profiles, and which one to use

| Profile            | What it changes                               | Use it for                                                   |
| ------------------ | --------------------------------------------- | ------------------------------------------------------------ |
| `bench:vs:fast`    | budgets divided by eight, one run             | editing this file; the report stamps itself **Not a result** |
| `bench:vs`         | the tuned budgets, one run                    | a quick honest look, good enough to spot a regression        |
| `bench:vs:precise` | budgets doubled, seven runs, median published | anything that gets quoted                                    |

The profiles differ in where they spend, and that is deliberate. Raising the iteration count lowers
`rme` — the bound on the mean — and does **nothing** for the run-to-run spread of the `p75` that is
actually published; that was measured, not assumed. So `--precise` buys most of its accuracy by
running the whole file seven times and publishing the median, which is the only lever that moves the
number a reader depends on. Every profile scales all arms in a block identically, so the sample
counts stay equal and the comparison stays fair whichever one you run.

### What this stand can and cannot resolve

Two different questions hide behind "how accurate is this", and they have different answers.

**How noisy is one run?** Seven independent runs of the whole file moved the `p75` of a given row by
a median of 6.9% and at worst 15.3%. That is machine state — thermal, memory layout, neighbouring
processes — not sampling: raising every budget fourfold lowered `rme` and left it untouched. It does
not improve with more runs either, because it is a property of the machine rather than of the
estimate.

**How far off is the published number?** That is a different quantity, and it does improve. The
published figure is the median of the runs, and the `uncertainty` column is its standard error —
`1.253·σ/√n`. On the seven-run `--precise` profile it comes out at a median of **±1.2%**, worst
**±3.0%**, with one row out of forty-two above ±3%.

So the published numbers are good to a couple of per cent, while any single run is not. That is why
`--precise` runs the file seven times and publishes the median, and why the column reports the
median's error rather than the spread of the runs — an earlier version showed the spread, which does
not fall with repeats and made the extra passes look like they bought nothing.

**A difference under about 20% between two libraries is still not measurable here**, because that
comparison is limited by the run-to-run noise and not by the median's error. The ~6x gap to the
`jest-auto-spies` family is far above it and stands; the type-mock and deep-mock losses stand;
`calledWith` against `vitest-mock-extended` does not, and is parity.

### Why every arm runs the same number of iterations

tinybench's default is a fixed **time** budget per arm, which gives a faster arm more iterations. For
most benchmarks that is fine. It is not fine here, because these cases allocate: garbage collection
scales with the number of doubles created, not with elapsed time. Under an equal time budget the
fastest arm creates several times as many objects as the slowest and pays for several times as many
collections — it is charged for its own speed.

Every block therefore pins an iteration count and every arm in it runs exactly that many, with the
count printed in the `samples` column so you can check. Pinning them also meant raising them, which
brought the worst margin of error across the file down from ±36.6% to ±16%.

The counts differ between blocks, and that is intended — a comparison only ever happens inside a
block, so that is where the counts have to match.

### Why `p75` and not `hz` or `mean`

These cases allocate spy objects by the hundred thousand, and `@vitest/spy` holds every mock it ever
created in a module-level strong `Set`. Each case prunes what it allocated — otherwise the numbers
would measure the garbage collector — but a major collection still lands inside some samples and not
others. `mean` and `hz` absorb those pauses whole, so they swing several-fold between runs of
unmodified code. `p75` cuts below the pauses and reproduces to the fourth decimal.

The same applies to Vitest's own `BENCH Summary` block at the end, the one that says "N× faster":
it is built from `hz`, so it swings with it. **Compute the ratio yourself from `p75`.**

### Working out a ratio

Take the `p75` of the arm you care about and divide by the `p75` of `vitest-auto-spy` in the same
block. From the canonical run of `double from a class — 10 methods, 2 called`:

```
vitest-auto-spy   0.0048 ms  ->  4.8 µs
jest-auto-spies   0.0128 ms  -> 12.8 µs      12.8 / 4.8 = 2.7x
```

Compare only inside one block. Two blocks are two different operations — `double from a class` reads
a real prototype and `double from a type` does not, so a ratio across them would report the
difference between two amounts of work, not between two libraries.

### Three things the numbers do not say

**Ratios transfer between machines; absolute times do not.** Every arm runs back-to-back in one
process on one machine, which is what makes the ratio meaningful. The microseconds describe the
machine that produced them and nothing else.

**A ratio here is not a suite-level claim.** Per-operation cost and end-to-end suite cost are
different quantities and they disagree — this benchmark has the package roughly 4.7× faster than a
hand-written double on a 40-method class, and across a real suite that advantage is gone, because
building a double is on the order of one per cent of what a test costs. If you are quoting a number
at anyone, quote the suite-scale one from `npm run bench:suite`.

**A difference under about 20% is not a difference.** Repeated runs of an unchanged case move that
much on a quiet machine. Only gaps larger than that survive a second opinion.

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

## Memory, and why it is the better metric here

`npm run bench:memory` measures **retained heap per double**: allocate 500 doubles into an array
that stays reachable, force garbage collection, and divide the heap delta by 500. It reports bytes
per double and bytes per method, at 10 and 100 methods, with none of the methods called and with all
of them called.

It exists because time is the noisier axis. Wall-clock at suite scale moves 15-20% between runs of
unchanged code; retained heap reproduces to better than 0.01% and separates the libraries by
multiples rather than percentages. If you are repeating this work, measure memory first.

Two things about the harness are load-bearing:

- **The registry is pruned between arms.** `@vitest/spy` holds every mock it ever created in a
  module-level strong `Set`, so without pruning each arm's baseline would silently include every arm
  before it and the column would be a running total. The file asserts the release is clean and fails
  loudly when it is not.
- **`--expose-gc` is wired through the config, not left to the reader.** It also forces
  `pool: 'forks'`: the threads pool rejects V8 flags in `execArgv` outright, so that is not a
  preference.

## What is deliberately not measured here

**`provideAutoSpy` has no arm, because it cannot have a different number.** It is
`createSpyFromClass` with an object literal around it:

```ts
export function provideAutoSpy(ObjectClass, methodsToSpyOnOrConfig) {
  return { provide: ObjectClass, useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig) };
}
```

`jest-auto-spies` defines it identically. Benchmarking it would report the `createSpyFromClass` row
plus measurement noise, and it would cost the whole Angular testing runtime to do so — the entry it
lives in imports `TestBed` from `@angular/core/testing`, so the number would be dominated by an
import that has nothing to do with the helper.

There is a reason people expect otherwise, and it used to be true. Until v2 `provideAutoSpy` was the
only entry that built spies lazily by default; the core has that default now, so the two converged.
If you are choosing between them, choose on where the double is going — a `TestBed` provider or a
plain variable — not on speed.

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
