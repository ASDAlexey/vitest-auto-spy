---
title: Performance
description: What each factory costs, which one to reach for, and why none of them is where a slow suite spends its time.
---

# Performance

Short version: **use `provideAutoSpy` on Angular and `createSpyFromClass` everywhere else, call it in
`beforeEach`, and stop thinking about it.** The numbers below exist so that claim is checkable, and
so the two settings that _do_ cost something are named.

## Measured

`npm run bench` (Vitest bench, one machine — treat the ratios as the result, not the absolute
times). The figures are the **`p75`** column: these cases allocate spy objects by the hundred
thousand, so `hz` swings several-fold between runs as GC pauses land in different samples, while
`p75` reproduces to the fourth decimal.

| Operation                                                  | per call (p75) |
| ---------------------------------------------------------- | -------------: |
| spy a 10-method class, call 2 methods — lazy (the default) |     **5.4 µs** |
| the same, eager (`lazySpies: false`)                       |        17.5 µs |
| spy a 40-method class, call 3 methods — lazy               |    **10.3 µs** |
| the same, eager                                            |        68.6 µs |
| `createAutoMock<Service>()` + 4 accesses                   |         7.8 µs |
| `calledWith` dispatch, 3 configured calls                  |         0.5 µs |
| unconfigured dispatch, 3 calls with two object arguments   |         0.4 µs |

Lazy widens as the class does, and gives it back only when a single test really calls every method
(10 methods, all 10: 20.7 µs lazy against 19.2 µs eager — a rounding error against the order of
magnitude it wins everywhere else). That asymmetry is why it is the default rather than an option.

Put that against a suite: five providers across two thousand tests is ten thousand calls — under a
tenth of a second for the entire run. Spy construction is not where a slow suite spends its time.
`TestBed` is, which is what [`enableTestBedDiagnostics()`](../adapters/angular#where-a-spec-spends-its-time)
measures and [`renderShallow`](../adapters/angular#shallow-component-rendering) usually fixes.

The type-checker's share is measured too: `npm run types:budget` counts the instantiations `Spy<T>`
costs `tsc` on a generated fixture and fails the gate past a budget — the numbers are in
[Type-check cost](../comparison#_3-type-check-cost).

## Why it is fast

`lazySpies` is on by default for every factory: a spy is built on first access rather than for every
method up front, so a twenty-method service a test touches twice builds two spies. `provideAutoSpy`
was the only entry with that default until v2; now the core has it too, and the two are the same
speed.

The second half is a cache: prototype discovery (`getAllMethodNames`) is memoised per prototype in a
`WeakMap`, so calling the factory once per test does not re-walk the chain. A class spied in 300
tests walks its prototype once.

The third half — the one added in 4.1 — is that a method spy is no longer a `vi.fn()`.

### The spy engine

`vi.fn()` is not free, and none of what it costs is per-call work. Every mock it creates gets some
twenty-five closures assigned as **own properties** of the function object, six arrays of call state
allocated whether or not the mock is ever called, an entry in a module-level strong `Set`, an entry
in a `WeakMap`, and a `defineProperty` for `length` and for `mock`. A double built from a
forty-method class used to pay that forty times, for a spec that calls two of them.

The library now builds method spies itself: one shared prototype carrying the whole `Mock` surface,
so a spy is one function object and one small config record; call state allocated on the **first
call**, so a method nothing touches owns no arrays at all; and no global registry, so nothing has to
be pruned later. Measured on this machine, one spy created and called once: **1.23 µs → 0.11 µs**,
and dispatch through it is ~2.6× cheaper than through the runner's mock.

Everything a spec can observe is unchanged — `vi.isMockFunction`, every matcher, the whole
`mockReturnValue` family, `mock.calls` / `.results` / `.settledResults` / `.instances` /
`.contexts` / `.lastCall`, `mockClear` / `mockReset` / `mockRestore`, `using`. The suite asserts
that by putting a spy and a `vi.fn()` through the same steps and comparing their state, so a change
in what Vitest records fails this library's own tests rather than a consumer's.

What it bought, on the two metrics this page keeps — every figure the median of seven runs
(`bench:vs:precise`) or of the retained-heap harness (`bench:memory`), same machine, same day:

| | 4.0 | 4.1 |
| --- | ---: | ---: |
| one spy created and called once | 1.23 µs | **0.11 µs** |
| a double whose test calls all 14 of its 14 methods | 18.92 µs (a loss to hand-written `vi.fn()`) | **8.17 µs** (2.19× ahead of it) |
| a double whose test calls all 45 of its 45 methods | 75.33 µs (a loss) | **26.12 µs** (2.37× ahead) |
| `createAutoMock<T>()`, 40 members touched | 72.88 µs (a loss to `vitest-mock-extended`) | **18.92 µs** (3.00× ahead) |
| `mockDeep<T>()`, 3 levels, leaf called | 8.83 µs (a loss) | **2.29 µs** (2.38× ahead) |
| retained heap, one materialised method | 5 445 B | **1 929 B** |
| retained heap per method, eager double, nothing called | 4 418 B | **632 B** |

The `calledWith` dispatch row moved too — 0.54 → 0.17 µs — but for a different reason, and it is
[in the micro-benchmark section](#micro-benchmark) rather than here: that one was a string key being
rendered on every call, not the mock underneath it.

Two seams needed building, and both are the interesting part:

- **`vi.clearAllMocks()` has to reach a spy that is in no registry.** Vitest clears mocks by walking
  a `Set` inside `@vitest/spy` that only `vi.fn()` and `vi.spyOn()` write to, and there is no API to
  add to it. So the adapter registers exactly one `vi.fn()` of its own whose `mockClear` sweeps this
  library's spies — the walk reaches that one mock, and that mock reaches all of ours. It also means
  `clearMocks: true` and `mockReset: true` in a config keep working untouched, because Vitest applies
  both through those same two functions. The sentinel carries a mark
  [the registry pruner](#retained-memory-per-double) skips: dropping it would make the sweep a silent
  no-op, which is the worst failure this design can have.
- **A sweep must not walk anything.** Bumping a counter is the sweep; each spy compares its own stamp
  against it before it records or reports, and empties itself if it is behind. Clearing every spy in
  a run is one integer increment, it holds nothing alive, and a spy nothing touches again never pays
  for it. The `mock` state object exposes its six arrays through accessors so that a state object a
  spec is holding answers with the emptied arrays too — which is what the runner's own state does.

**The one difference, and the way out.** `mock.invocationCallOrder` counts on this library's own
scale, so `expect(a).toHaveBeenCalledBefore(b)` is exact between two auto-spies and meaningless
between an auto-spy and a hand-written `vi.fn()`: the two counters never met. Sourcing the runner's
counter instead means calling one of its mocks on every dispatch — measured at 0.2 µs a call, which
is more than the whole dispatch costs — so the scale stays local and the switch is explicit:

```ts
// vitest.setup.ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

setSpyEngine('runner'); // every double built afterwards is vi.fn() per method, as before 4.1
```

Vitest only. On Bun and `node:test` the runner's matchers recognise only the runner's own mocks, so
those entries keep building spies from `mock()` and `t.mock.fn()`.

## Memory, not just time

The same benchmark shape, but holding the spies (2000 of them, a 40-method class, two methods
touched per spy — a large spec file's worth):

|                            |      time |        heap |
| -------------------------- | --------: | ----------: |
| lazy (the default)         | **22 ms** | **35.4 MB** |
| eager (`lazySpies: false`) |    203 ms |    372.7 MB |

Nine times the speed and a tenth of the memory, because 38 of the 40 spies are never built. Each
one that is skipped is a function, its argument map, and the promise/observable helper bundles
attached to it.

The worst case for lazy is a test that really does call every method:

|       |   time |     heap |
| ----- | -----: | -------: |
| lazy  | 228 ms | 372.9 MB |
| eager | 216 ms | 372.4 MB |

### Where the remaining memory is, and `lazySpies: 'proxy'`

Lazy does not build the spy, but it still has to define **something** for the name: one
`Object.defineProperty` accessor per method. On a class wide enough to matter, that placeholder is
not overhead around the real cost — it _is_ the cost. Measured on Node 24.19 with 2 000 doubles held
at once and nothing touched:

| Methods on the class | `lazySpies: true` | `lazySpies: 'proxy'` |      Delta |
| -------------------: | ----------------: | -------------------: | ---------: |
|                    5 |           1 634 B |              1 737 B | **+102 B** |
|                   20 |           5 629 B |              2 219 B |   −3 410 B |
|                  100 |          25 597 B |              4 135 B |  −21 463 B |
|                  400 |         101 584 B |             11 813 B |  −89 771 B |

**253 B per method against 25 B per method.** `'proxy'` answers every method from one trap object,
so all it retains per name is an entry in a set of strings the prototype already owns. Creation
follows, because there is nothing to define — create a double and call two of its methods five times
each:

| Methods on the class | `lazySpies: true` | `lazySpies: 'proxy'` |     Ratio |
| -------------------: | ----------------: | -------------------: | --------: |
|                    5 |          6 515 ns |             8 180 ns | **0.80×** |
|                   20 |          8 938 ns |             6 643 ns |     1.35× |
|                  100 |         20 713 ns |            11 638 ns |     1.78× |
|                  400 |         61 212 ns |            10 798 ns |     5.67× |

Both tables above predate 4.1 and [the spy engine](#the-spy-engine). The retained-bytes one is
unaffected in kind — it holds *untouched* doubles, which are placeholder accessors either way, and
the [retained-memory section below](#retained-memory-per-double) confirms the same 295 / 186 B per
method on the current build. The creation table includes materialising two methods, which is now
several times cheaper on both arms, so read its **ratio** and not its nanoseconds.

**It is opt-in and stays opt-in**, for a reason that no benchmark of a wide class shows: a `Proxy`
cannot remove itself. Once a method has materialised the accessor path leaves a plain data property
behind and every later read is free — 0.33 ns, which is to say the JIT deletes it. The proxy still
goes through a trap: **+30 ns per read, +43 ns per call, for the life of the double**. The creation
table above crosses over around twenty methods — below that width `'proxy'` is slower to create —
and that crossover is about **time**, not memory. A separate, more rigorous measurement (heap held
per double, GC forced, the mock registry pruned between arms — see
[Retained memory per double](#retained-memory-per-double), below) found no memory crossover at all:
`'proxy'` retained less than the default at every width it measured, from 10 methods up. Do not read
the two tables above as one story — they answer different questions, and only the section below
settles the memory one.

So the rule is about the _shape_, not about the suite: reach for it on classes that are wide by
construction — a generated API client (orval, `ng-openapi-gen`), an ngrx facade, a `Store` double —
and especially under `isolate: false`, where every double a file made is alive at the same time and
this table is the difference between a job that finishes and a job that is killed. Everywhere else
the default is the right answer.

### What a single spy costs

A materialised spy used to be mostly the host runner's own mock — under Vitest the larger part of
its ~4.7 kB, and nothing the library did could shrink it. That is no longer true on Vitest, where
[the spy engine](#the-spy-engine) replaced `vi.fn()` with a spy of the library's own: one shared
prototype instead of twenty-five own properties, and call state allocated on the first call instead
of six arrays at creation. On Bun and `node:test` the runner's mock is still the floor.

What the library adds on top used to include two `calledWith` chains built with every spy, each an
object plus an argument map, whether or not the spec ever called `calledWith`. They are now built on
first use, which is nearly always never:

| 2000 spies × 40 methods, all materialised |         heap |
| ----------------------------------------- | -----------: |
| chains built eagerly (before)             |     417.3 MB |
| chains built on first use                 | **372.7 MB** |

That is ~560 B off every materialised spy, ~11% of the total, and it costs nothing when a spec does
use `calledWith` — the chain is then built exactly as before. `resetAutoSpy()` drops the chains
rather than replacing them with empty maps, so a reset spy is back to a fresh spy's footprint.

Five percent slower, one percent more memory — the price of the accessor indirection when nothing is
saved. That asymmetry is why lazy is the default rather than an option: the common case wins an
order of magnitude, the rare case loses a rounding error.

Memory matters more than the time here. Under `isolate: false` a worker keeps everything its files
allocated until the run ends, and it is the heap — not the clock — that ends up killing a CI job in
a container.

### Helpers shared across spies

The other thing the library used to add to every materialised method was a closure per helper:
`calledWith`, `mustBeCalledWith`, `failWith`, `resolveWith`, `rejectWith`, `resolveWithPerCall`, the
reset and clear hooks — and, once `vitest-auto-spy/rxjs` is loaded, seven more for the stream
helpers plus the handle that owns the subject. Eight to twenty function objects, each with a
context, before the runner's own mock. They are now one set of functions for the whole run that
find their spy through `this`, and the reset and clear hooks live on the spy's state object, which
sits under the spy's mark in place of `true` — so the brand and both hooks cost one property
definition where they cost three.

Measured on 1 000 spies of a 100-method class, every method touched once, against the published
3.15.0, medians of five runs on Node 24.19 and three on Bun 1.4.0, nothing else on the machine:

| runtime            | first call of a method, ns | heap per spied method |
| ------------------ | -------------------------: | --------------------: |
| `node:test`        |          4 355 → **3 902** |    3.34 → **2.78 kB** |
| `node:test` + rxjs |          5 958 → **5 261** |    4.29 → **2.88 kB** |
| Bun 1.4            |              792 → **636** |                     — |
| Bun 1.4 + rxjs     |            1 095 → **790** |    2.72 → **1.66 kB** |

The time saved is modest on V8 because the floor there is the runner's: `node:test` captures a
stack trace into every recorded call (≈1.8 µs of the 4.1) and creates its mock as a Proxy, through
which every property this library attaches has to pass. The memory is the larger win — a third of
every materialised method under rxjs — and it is the heap that decides whether a large suite fits
under `isolate: false`.

One thing changes for a caller: a helper taken _off_ its spy — `const { resolveWith } = spy.load` —
used to work because it was a closure over that spy. It now throws at the call, naming the helper
and the two shapes that work (`spy.load.resolveWith(v)`, or `bind` it first). The jasmine
namespaces bind, so nothing changes there.

**Creating** a *double* is still one `defineProperty` per lazy accessor, and that is now most of what
it costs: a 100-method class costs ~15 µs on V8 and ~7 µs on JSC. Materialising a **method** did
move, and by an order of magnitude — see [the spy engine](#the-spy-engine). The rest of this note is
about the accessors, which are the part that did not. Sharing the
accessor descriptors across spies looked like the obvious cut and measured 30 % faster to build —
and then up to ten times _slower_ to materialise, because V8 keeps an object whose accessors all
came from the same descriptors on a shared fast-mode map, and turning an accessor into a data
property there rewrites the whole map; with fresh closures the object falls into dictionary mode,
where that same step is a hash update. Forcing dictionary mode with a `delete` fixes V8 and
doubles the cost on JSC. `Object.create(prototype, descriptors)` has the same fast-mode problem.
The only cut left is putting the accessors on a shared prototype, which would make
`Object.keys(spy)` and `{ ...spy }` stop listing methods nobody has touched yet — a change a
spec can observe, so it is not made.

## Against other libraries

Everything above measures this package against itself. This section measures it against all three
jest-auto-spies-family libraries — `jest-auto-spies@3.0.1`, `jasmine-auto-spies@8.0.1` and
`@bugsplat/vitest-auto-spies@1.0.0`, each measured directly — plus `vitest-mock-extended` and
`@golevelup/ts-vitest`, both per-call and across a whole suite — Node v24.19.0, Vitest 4.1.9,
Apple M4 Max, macOS 26.6.2, measured 2026-09-03.

Wall-clock at suite scale varies 15–20% **between invocations** of the identical configuration —
the same cell measured 1.56 s and 1.33 s at 1 000 tests, 10.94 s and 12.51 s at 10 000. Within one
invocation the spread is only about 2%, which badly understates the truth. Peak RSS, by contrast,
reproduces tightly and separates arms by multiples. Read memory first and treat wall-clock as
secondary — and never past one significant figure of precision in prose ("roughly 1.5×", not
"1.53×").

### The three jest-auto-spies-family libraries, all measured

`jest-auto-spies@3.0.1`, `jasmine-auto-spies@8.0.1` and `@bugsplat/vitest-auto-spies@1.0.0` all
depend on the same `@hirez_io/auto-spies-core@3.0.0` and differ only in the spy factory they hand
it — `jest.fn()`, `jasmine.createSpy()` and `vi.fn()` respectively. All three are measured directly
below; `@bugsplat` is no longer a stand-in for anything.

`jest-auto-spies` and `jasmine-auto-spies` run here under a minimal `jest` / `jasmine` global backed
by `vi.fn()` (`bench/runner-globals.ts`). That is what makes the comparison mean something rather
than a compromise on it: every *other* arm then creates the same underlying mock, so the runner's
per-mock cost is a shared constant and the numbers separate each library's own work — measuring one
library on Jest and another on Vitest would report the two runners instead of the libraries. State
the limitation plainly, too: these numbers describe each library's own code, not what a real Jest or
Jasmine suite would show, where the runner's mock is a different implementation with its own cost.

**The exception is this package's own arm, and it is deliberate.** Since 4.1 it does not call
`vi.fn()` at all — [the spy engine](#the-spy-engine) — so the shared constant does not cancel for it:
part of its lead is that it never pays the runner's per-mock cost. That is a difference in the
product rather than in the measurement, and the table is built so that it is visible instead of
hidden: the `hand-written vi.fn() per method` arm is the runner's own mock assembled by hand with no
library in the way, and the distance to that arm is the size of this difference and nothing else.
`setSpyEngine('runner')` puts this package back on `vi.fn()`, at which point the constant cancels for
everybody again. Nothing stops the other libraries from doing the same; as of the date on the table,
none of them does.

The three land within a few per cent of each other on every case — see the 40-method row in the
table below. The claim that they share one algorithm is now measured, not argued from reading their
source.

Two things about this benchmark were wrong on the first attempt, and are worth knowing before
trusting the tables below:

- The first run imported this library from `src/`, outside `node_modules`. `@vitest/coverage-v8`
  drops any `/node_modules/` URL before user config is consulted, so this package's sources were
  instrumented (and esbuild-transformed per worker) on every run while the competitors' prebuilt
  `dist/` was not. Fixed by measuring the built `dist/` on every arm — this alone moved the
  hand-written comparison from 0.71× to 1.00× at 1 000 tests.
- Arms originally ran in blocks — all repeats of one arm, then the next — so machine drift during a
  long run landed on whichever arm happened to run later. Fixed by interleaving arms round-robin.

### Micro-benchmark

`npm run bench:vs:precise`, canonical run 2026-09-03. **Every figure below is the median p75 of
seven independent runs, each in its own process, at doubled iteration budgets** — not a single run.
`npm run bench:vs` on its own still exists for local iteration: one run, about a minute. The
seven-run form that produced the numbers below takes about twelve.

#### The measured resolution limit

This is the paragraph to read if nothing else on this page gets read. A single run of this stand
moves several per cent between invocations of unchanged code — machine state, not sampling error:
raising the iteration budgets fourfold lowers `rme` and leaves it untouched. What is published is
therefore the **median of seven runs**, and what each row's ± column reports is how far *that
median* can be off. Across the 47 rows of the canonical run that figure is a **median of ±1.1%** and
at worst **±3.8%**.

That is the error on the published figure, not the resolution of the stand. Keep the older, blunter
rule for reading a single local run: **a difference under about 20% between two arms is not a
difference worth quoting.** Every gap below is far outside both.

Applied to the specific numbers on this page: the narrowest gap in any table below is **2.19×**, on
the row where a test calls all fourteen methods of the class it doubled, and the widest is 11.4×.
Both are an order of magnitude outside the error on the published median, and every row in between
is too. No claim on this page rests on a margin the stand cannot see — which was not true of the
table this one replaced, where one row sat at 0.92× with a spread of 16.8% and had to be reported as
parity.

The column that carries the trust is that **uncertainty on the median**, not `rme`. `rme` bounds the
*mean*; the mean here is dominated by garbage-collection tails that have nothing to do with the
`p75` actually published, so a large `rme` beside a stable `p75` says a noisy tail sits on that arm,
not that the published number is unreliable. A single run has no second number to compare itself
against — repeated whole runs are what make the uncertainty checkable at all.

**Every arm inside one block runs the same number of iterations**, printed as `n` in the tables
below, rather than the same time budget. tinybench defaults to a fixed *time* budget per arm, which
hands a faster arm more iterations — and these cases allocate test doubles by the tens of thousands,
so garbage collection scales with the number of objects created rather than with elapsed time. An
equal time budget therefore gives the faster arm unequal, lighter GC exposure and makes it pay for
its own speed; equal iteration counts close that gap.

**The published figure is the `p75`**, which is the statistic a GC pause does not move. Operations
per second, where quoted, are `1/p75`, never the runner's own `hz`, which is derived from the mean
and inherits its noise. Microseconds per double are also the shape of the question a reader actually
has, since a spec builds a handful of doubles rather than as many as it can in a second.

The `(×)` after each competing figure is that arm's time divided by ours — above 1× means slower
than this library, below 1× means faster.

**Double from a class** (this library, `@bugsplat`, `jest-auto-spies` and `jasmine-auto-spies` all
read a class — `vi.fn()` here is the same class hand-assembled with plain mocks):

| Case | vitest-auto-spy | @bugsplat | jest-auto-spies | jasmine-auto-spies | hand-written vi.fn() | n |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| small project — 6 methods, 1 called | 1.42 µs | 8.33 µs (5.88×) | 8.38 µs (5.91×) | 8.50 µs (6.00×) | 6.83 µs (4.82×) | 90,000 |
| medium project — 14 methods, 2 called | 2.67 µs | 19.37 µs (7.27×) | 19.17 µs (7.19×) | 19.71 µs (7.39×) | 15.92 µs (5.97×) | 70,000 |
| large project — 45 methods, 2 called | 5.79 µs | 64.04 µs (11.06×) | 65.67 µs (11.34×) | 66.25 µs (11.44×) | 52.79 µs (9.11×) | 36,000 |
| worst case — 14 methods, all 14 called | 8.17 µs | 21.87 µs (2.68×) | 21.79 µs (2.67×) | 22.25 µs (2.72×) | 17.92 µs (2.19×) | 30,000 |
| worst case — 45 methods, all 45 called | 26.12 µs | 73.42 µs (2.81×) | 71.83 µs (2.75×) | 73.04 µs (2.80×) | 62.04 µs (2.37×) | 9,000 |
| configure a return + 3 calls | 2.21 µs | 19.63 µs (8.88×) | 19.33 µs (8.75×) | not measured | 16.38 µs (7.41×) | 102,000 |

The three widths and the two call counts are measured project profiles rather than round numbers —
where they come from is in [`bench/README.md`](https://github.com/ASDAlexey/vitest-auto-spy/blob/master/bench/README.md#where-the-three-sizes-come-from):
across four private Angular suites, ~2 700 spec files and 2 742 doubles built from a class, the
service a spec doubles has 5–8 methods at the median, 12–16 at the p75 and 32–44 at the p90, and the
spec touches 1 of them at the median and 2 at the p90.

`jasmine-auto-spies` is absent from the last row on purpose: its configuration API is
`spy.method.and.calledWith(x).returnValue(y)`, a different shape from the `mockReturnValue`-style
call the other libraries make there, so putting it in that row would compare two different
operations.

**Double from a type** (all three arms here are Proxy-based, doing equal work):

| Members touched | vitest-auto-spy | vitest-mock-extended | @golevelup/ts-vitest | n |
| --- | ---: | ---: | ---: | ---: |
| 2 | 1.00 µs | 2.79 µs (2.79×) | 4.92 µs (4.92×) | 590,000 |
| 10 | 4.67 µs | 13.83 µs (2.96×) | 24.92 µs (5.34×) | 60,000 |
| 40 | 18.92 µs | 56.79 µs (3.00×) | 103.37 µs (5.46×) | 16,000 |
| configure + 3 calls | 0.71 µs | 1.58 µs (2.24×) | 1.58 µs (2.24×) | 584,000 |

**Deep double, 3 levels, leaf called (n = 232,000):** vitest-auto-spy 2.29 µs ·
vitest-mock-extended 5.46 µs (2.38×) · @golevelup 6.00 µs (2.62×).

**`calledWith` dispatch, 2 configured + 1 miss (n = 2,304,000):** vitest-auto-spy 0.17 µs ·
@bugsplat 0.96 µs (5.74×) · vitest-mock-extended 0.54 µs (3.25×).

That last row moved in 4.1 for a reason worth naming, because it is not the spy engine: a
`calledWith(x)` config of a single primitive argument used to be *rendered into a string key on
every call* of that spy — an array from `map`, a string per argument, a joined string, then a hash —
where a `Map` keyed by the value itself does the same lookup with no allocation at all. The shapes
where the two disagree (a symbol, which renders by description; `-0`, which renders apart from `0`
and is one key with it under `SameValueZero`) stay on the string path and keep the answer they had.

**Every table above is this package's**, including the two `worst case` blocks where a test calls
every method of the class it doubled. That was not true before 4.1: `vitest-mock-extended` won every
type-based row and the deep-double row, and hand-written `vi.fn()` won both all-methods-called rows.
What changed is [the spy engine](#the-spy-engine), and the honest reading of the margin is on the
`hand-written vi.fn() per method` arm — that arm is the runner's own mock with no library in the way,
so the distance to it is exactly what not calling `vi.fn()` per method is worth.

**These multipliers do not transfer to suite scale, and that is the most important thing on this
page.** The 45-method row above shows this package roughly 9× faster than hand-written `vi.fn()` on
one double. Measured across a real suite, below, that advantage is gone: parity at 1 000 tests,
behind at 10 000. **The suite-scale section that follows was measured before 4.1 and has not been
re-run** — it is left standing rather than quietly deleted, because it is the row that argues
*against* this library and the mechanism it describes (double construction being ~1% of a test) did
not change. Double construction is on the order of 1% of a test's total cost, so a
micro-benchmark multiplier is evidence about the double, not about the run — carrying it forward as
a suite-level claim is the one thing this section is written to prevent.

### Retained memory per double

`npm run bench:memory`, 2026-09-03, Node v24.19.0. 500 doubles held alive at once, 5 repeats per
cell (median), 4 GC passes forced per settle. Each cell is heap delta divided by the 500 doubles,
i.e. **bytes per double** — the number in parentheses divides that further by the method count, i.e.
bytes per method. The mock registry — `@vitest/spy` keeps every mock it ever creates in a
module-level `Set` — is pruned between arms; without that, every arm after the first would carry
forward everything the earlier arms allocated, and the numbers would be a running total rather than
each library's own footprint. Pruning was verified clean — worst residual 0.2% — and run-to-run
agreement was better than 0.01% except on the smallest cells, where the floor is ±2–4%.

**Built from a class:**

| Arm | 10 methods, untouched | 10, all called | 100 methods, untouched | 100, all called |
| --- | ---: | ---: | ---: | ---: |
| vitest-auto-spy default lazy | 2 950 B (295 B/method) | 19 708 B (1 971 B/method) | 25 601 B (256 B/method) | 192 913 B (1 929 B/method) |
| vitest-auto-spy `lazySpies: 'proxy'` | 1 857 B (186 B/method) | 20 677 B (2 068 B/method) | 4 097 B (41 B/method) | 191 443 B (1 914 B/method) |
| vitest-auto-spy `lazySpies: false` | 6 034 B (603 B/method) | 19 021 B (1 902 B/method) | 63 239 B (632 B/method) | 192 888 B (1 929 B/method) |
| jest-auto-spies | 58 116 B (5 812 B/method) | 68 356 B (6 836 B/method) | 583 477 B (5 835 B/method) | 685 887 B (6 859 B/method) |
| jasmine-auto-spies | 60 621 B (6 062 B/method) | 70 874 B (7 087 B/method) | 608 290 B (6 083 B/method) | 710 720 B (7 107 B/method) |
| @bugsplat/vitest-auto-spies | 58 123 B (5 812 B/method) | 68 381 B (6 838 B/method) | 583 480 B (5 835 B/method) | 685 906 B (6 859 B/method) |
| hand-written `vi.fn()` | 41 018 B (4 102 B/method) | 51 258 B (5 126 B/method) | 414 461 B (4 145 B/method) | 516 886 B (5 169 B/method) |

The four competitor rows are within 0.03% of the run this table replaces, which is what says the
harness did not move. The three rows that did are this package's, and they moved for one reason:
[the spy engine](#the-spy-engine). A materialised method went from 5 445 to **1 929 B**, and an
eagerly built one (`lazySpies: false`, untouched) from 4 418 to **632 B** — 7× — because a spy that
is never called now allocates none of the six arrays `vi.fn()` allocates up front.

**Built from a type.** Untouched is width-independent — it is the same Proxy object either way:

| Arm | untouched | 10 members called | 100 members called |
| --- | ---: | ---: | ---: |
| vitest-auto-spy `createAutoMock` | 1 184 B | 20 250 B | 191 161 B |
| vitest-mock-extended `mock` | 353 B | 53 578 B | 537 191 B |
| @golevelup/ts-vitest `createMock` | 496 B | 103 654 B | 1 030 848 B |

**What this establishes:**

1. **`lazySpies: 'proxy'` has no memory crossover.** It is lighter than the default at every width
   measured — 1.6× at 10 methods untouched, 6.2× at 100 — and at 100 all-called it is marginally
   cheaper than both other strategies. The roughly-twenty-method crossover documented
   [above](#where-the-remaining-memory-is-and-lazyspies-proxy) is a time crossover only; nothing in
   this table implies a memory break-even.
2. **`jest-auto-spies` and `@bugsplat` agree to within 0.02%** on retained bytes, confirming the
   shared-core claim ([above](#the-three-jest-auto-spies-family-libraries-all-measured)) on a metric
   that has nothing to do with timing noise.
3. **The jest-auto-spies core costs about 1.7 kB per method over a raw `vi.fn()`** before anything
   is called (5 812 vs 4 102 B per method) — its `calledWith` machinery is roughly 40% on top of the
   mock. `jasmine-auto-spies` is a further ~4% above that.
4. **Full materialisation is no longer a measurement of `@vitest/spy` for every arm.** It still is
   for four of them: the hand-written control retains 5 169 B per mock after one call and the three
   jest-auto-spies-family libraries land 32–38% above it. This package's spy is not one of the
   runner's, so it sits **2.7× below that floor** at 1 929 B — the same shape the micro-benchmark
   shows, measured in bytes instead of microseconds.

**Where this package loses on memory, at full weight:**

- Untouched `createAutoMock<T>()` retains **1 184 B** against `vitest-mock-extended`'s **353 B** and
  `@golevelup`'s **496 B** — 3.4× and 2.4× worse, last in its family by a wide multiple. That is the
  bare Proxy before anything is touched, and it is the one memory row this package still loses; from
  the first member called onwards it is 2.6× lighter than `vitest-mock-extended` and 5.1× lighter
  than `@golevelup`.
- `lazySpies: false` is marginally cheaper than the default at 10 all-called (19 021 vs 19 708 B) —
  the placeholder accessors the default installs are not free, and when every method is materialised
  anyway there is nothing for them to save.

`heapUsed` only; off-heap was not measured. Retention inside the `@vitest/spy` registry `Set` is
counted deliberately and charged identically to every arm. Single machine, Node v24.19.0 — the
absolute bytes are V8-specific; the ratios should travel but that was not verified elsewhere.

### Suite scale

`npm run bench:suite`. All arms import prebuilt `dist/`, as a consumer does. Arms run interleaved
round-robin, not in blocks (see above). Coverage on.

**20-method class, `isolate: true`, two whole runs of 3 rounds each after a discarded warm-up,
medians of all six. Re-measured 2026-09-03 on the 4.1 build, Node v24.19.0, Vitest 4.1.9,
Apple M4 Max:**

| Tests | vitest-auto-spy | @bugsplat | hand-written |
| ---: | ---: | ---: | ---: |
| 1 000 | 1.33 s · 1232 MB | 2.21 s (1.66×) · 1409 MB | 1.33 s (0.99×) · 1114 MB |
| 3 000 | 3.19 s · 1222 MB | 5.50 s (1.72×) · 1376 MB | 3.08 s (0.97×) · 1155 MB |
| 10 000 | 10.66 s · 1338 MB | 17.40 s (1.63×) · 1492 MB | 10.07 s (0.94×) · 1256 MB |

Two runs rather than one because the first one's per-round spread said so: the same cell moved 10%
between rounds of the same run, which is the noise this measurement has and cannot design away.
Across the 18 rounds the hand-written arm lands between **0.81× and 1.01×** of this library, median
**0.95×**, and `@bugsplat` between 1.50× and 1.86×, median **1.66×**.

The absolute seconds are not comparable to the run this table replaces — that one was a different
machine state, and its 1 000-test cell was 20% away with no code involved. The **ratios** are the
result, and one of them moved for a reason: hand-written `vi.fn()` used to sit at 0.76× at 10 000
tests and sits at 0.94× now, because [the spy engine](#the-spy-engine) took the per-double difference
out of the sum. The direction is unchanged, and it is still published as a loss.

**100-method class, `isolate: true`, 10 000 tests, 7 rounds:**

| Arm | Median wall | Median peak RSS | Across 7 rounds |
| --- | ---: | ---: | --- |
| vitest-auto-spy (ours) | 10.70 s | 1335 MB | — |
| ours, `lazySpies: 'proxy'` | 9.97 s | 1329 MB | 5/7 below 1.0× — not a result |
| @bugsplat | 16.42 s | 1518 MB | median ratio 1.59, 7/7 above 1.0× |
| hand-written `vi.fn()` | 9.08 s | 1234 MB | 7/7 below 1.0× |

Established, holding across 1 000 / 3 000 / 10 000 tests and both 20- and 100-method classes, every
round where it was measured: this library is **roughly 1.5–1.7× faster than the jest-auto-spies-family
core**, measured through `@bugsplat` — the family's suite-scale representative, which the
micro-benchmark above now justifies directly (all three land within a few per cent of each other)
rather than by an argument from shared source. Never quote that to two significant figures — the
per-round ratios range 1.27–1.86× across runs.

Also established, and the row that does not get to be a footnote: **hand-written `vi.fn()` doubles
are still cheaper than this library under `isolate: true`.** The magnitude used to be roughly 10–15%
and is now about **5% at the median** — per-round ratios 0.81–1.01 across 18 rounds, cell medians
0.99× at 1 000 tests, 0.97× at 3 000 and 0.94× at 10 000. Two of the eighteen rounds came out at or
above parity, so the direction is no longer unanimous the way it was; the median is what is claimed,
and the tail (one round at 0.81×) is why nothing narrower than "about five per cent" is. That is the whole shape
of the suite-scale story: building a double is around one per cent of what a test costs, so a
10× micro-benchmark win shows up as a few per cent here, and the remaining gap is what this library
does *besides* building doubles. `lazySpies: 'proxy'` under `isolate: true` is **not** established as
doing anything — 5 of 7 rounds landed below 1.0×, which is noise, not a result.

### Memory under `isolate: false`

This is the largest and cleanest effect measured on this page — bigger than any wall-clock number
above, and it reproduces tightly where wall-clock does not.

**100-method class, `isolate: false`, 10 000 tests, 7 rounds, peak RSS:**

| Arm | Peak RSS median | Range | Wall |
| --- | ---: | --- | ---: |
| hand-written `vi.fn()` | 6733 MB | 6423–6918 | 3.86 s |
| vitest-auto-spy default | 2475 MB | 2325–2603 | 3.55 s |
| vitest-auto-spy, `lazySpies: 'proxy'` | 2109 MB | 2067–2223 | 3.32 s |

Hand-written `vi.fn()` peaks at 2.7× this library's default and 3.2× `'proxy'` mode's. The
proxy/default peak-RSS ratio is 0.803, 0.818, 0.854, 0.854, 0.864, 0.892, 0.910 — 7/7 rounds below
1.0×. The wall-clock column has mixed signs across rounds and is **not** established as a
difference; read only the RSS column here as a result.

It only shows up here — under `isolate: true` this same 100-method comparison shows no memory
story worth this much text — because of what isolation changes about what stays alive. Under
`isolate: true` a double built for one test is reclaimed once that test's environment tears down,
so there is nothing across the file to add up. Under `isolate: false` every double a file's tests
ever built stays reachable for the life of the worker, so whatever one double costs gets multiplied
by every double the file ever made and held at once — which is exactly the shape a per-double
memory difference needs to become a multi-gigabyte gap, or the difference between a run that
finishes and one that gets OOM-killed.

The same `vitest-auto-spy` workload also runs about 3× faster at `isolate: false` (3.55 s) than at
`isolate: true` (10.70 s, from the table above) — bigger than any library choice measured on this
page.

### Choosing a setting for your suite

1. **`isolate: false` first.** It is worth about 3× on its own, more than swapping any library or
   flag measured here. It also changes what limits you: memory becomes the binding constraint
   instead of wall-clock, because everything a file allocates now stays alive until the run ends.
2. **On a wide class under `isolate: false`, add `lazySpies: 'proxy'`** for roughly another 15% off
   peak RSS on top of the default (established, 7/7 rounds). It is the second-largest lever
   measured and it only costs a flag.
3. **Do not turn `'proxy'` on under normal isolation** (`isolate: true`, the default). It measurably
   does nothing there — 5/7 rounds below 1.0×, not distinguishable from noise.
4. **Do not expect a suite-scale speed win over hand-written `vi.fn()`.** Under `isolate: true` this
   library is roughly on par at 1 000 tests and behind by roughly 10–15% at 10 000. The case for
   this library over hand assembly is everything else on this page — the lazy default, the
   memoised prototype walk, `calledWith`, type-level and deep doubles — not suite wall-clock.
5. **Against the jest-auto-spies family**, the win is real and holds everywhere tested: roughly
   1.5× faster, 7/7 rounds, at 1 000/3 000/10 000 tests and at 20 and 100 methods — measured through
   `@bugsplat`, the family's suite-scale representative (see the micro-benchmark above for why that
   stand-in is now justified by measurement rather than by shared source).

### What is not explained

About 98% of `@bugsplat`'s suite-scale deficit is not accounted for by the micro-benchmark's
per-double difference: at 10 000 tests its deficit against this library is on the order of 4.9 s of
wall-clock, while the micro-benchmark's per-double gap (on the order of 10 µs) times 10 000 tests
comes to on the order of 0.1 s — two orders of magnitude short. Its peak RSS is also higher at suite
scale (1512 MB vs 1306 MB at 10 000 tests, 20-method class). Higher memory pressure is *consistent
with* more GC work explaining the rest of the gap, but that causal chain was not measured and is not
claimed here.

### Reproducing this

```bash
npm ci
npm ci --prefix bench
npm run bench:vs                 # micro-benchmark, about one minute
npm run bench:suite --help       # suite-scale harness documents itself; tens of minutes at 10 000 tests
```

`bench/.npmrc` sets `legacy-peer-deps=true` deliberately: the competitors declare `vitest` as a
peer, and installing a second copy beside the root one gives two mock registries, so the bench's
prune reaches only one and the run dies out of memory.

## Bundle size

The badge says 6.2 kB min+gzip, and that is the whole core entry bundled together. What a consumer
actually pays is less, because the package is side-effect-free per entry and every bundler shakes it:

| Imported                                       |   min+gzip |
| ---------------------------------------------- | ---------: |
| the whole core entry (what the badge measures) |     6.2 kB |
| `createSpyFromClass` alone                     | **3.6 kB** |
| `createSpyFromClass` + `createMock`            |     3.6 kB |
| the observer stubs alone                       |     1.4 kB |

The framework adapters, rxjs layer, console spies and setup helpers live behind their own subpaths,
so a project that never imports them never pays for them — and none of this reaches a production
bundle in the first place, since the package is a devDependency.

The download is smaller than it was, for a reason worth stating plainly: the package used to ship a
CommonJS build of every entry point, and most of it could never be loaded. Vitest refuses to be
required (`Vitest cannot be imported in a CommonJS module using require()`), so eight of the twelve
`.cjs` files threw on their own first line; and because esbuild cannot code-split CommonJS, each
surviving one carried its own copy of the `MockAdapter` / `ObservableSupport` registries, so even
`require('vitest-auto-spy/rxjs')` next to `require('vitest-auto-spy/node')` failed with "Observable
spies require rxjs" — two bundles, two disconnected registries. CommonJS now ships only where a
`require()` actually works and needs no second entry: `vitest-auto-spy/node` and
`vitest-auto-spy/eslint-plugin`. Folding `bun-angular` into the same ESM pass as everything else
removed a second inlined copy of the core on top of that.

|                      | Before |      After |
| -------------------- | -----: | ---------: |
| `dist/`              | 625 kB | **241 kB** |
| published tarball    | 187 kB | **108 kB** |
| files in the package |     74 |     **54** |

## Which Node version

The library's own code runs unchanged from Node 18 up, so this is a question about the runtime
underneath it, not about compatibility. Measured on one machine across six versions, three ways: the
**core in isolation** (`src/lib/**` bundled and driven by a minimal mock adapter — 13 reps, the
`p75` of ns/op, no runner inside the measurement), the repo's own 39-file suite through
`vitest run` (best of three), and a cold `import('vitest-auto-spy/node')`.

| Core operation (p75, ns/op)        |    18 |    20 |    22 |        24 |    25 |        26 |
| ---------------------------------- | ----: | ----: | ----: | --------: | ----: | --------: |
| `createSpyFromClass`, 10 methods   |  1410 |  1433 |  1264 |      1323 |  1416 |  **1285** |
| lazy, 10 methods / 2 called        |  3056 |  3578 |  3096 |      2869 |  2934 |  **2852** |
| eager, 10 methods / 2 called       |  5180 |  4703 |  4222 |  **3954** |  4073 |      4096 |
| eager, 40 methods / 3 called       | 20026 | 18145 | 17206 | **15635** | 16373 |     15945 |
| lazy, 40 methods / all 40 called   | 42028 | 43630 | 40384 |     34933 | 35748 | **34325** |
| `createAutoMock<T>()` + 4 accesses |  2237 |  2489 |  2074 |  **1756** |  1821 |      1782 |

The break is between 22 and 24 — V8 12.4 to 13.6 — and it is 9–15% on every case that allocates
spies. 24, 25 and 26 are the same speed within noise; 20 is not an improvement on 18.

|                                       |        20 |          22 |      24 |         25 |         26 |
| ------------------------------------- | --------: | ----------: | ------: | ---------: | ---------: |
| the 39-file suite, `vitest run`       |    3.75 s |      3.31 s |  2.67 s |     2.69 s | **2.54 s** |
| cold `import('vitest-auto-spy/node')` |   10.2 ms |     11.8 ms |  4.9 ms | **4.3 ms** |     4.5 ms |
| process startup                       |    9.9 ms |     10.8 ms |  7.9 ms | **7.4 ms** |     7.7 ms |
| peak RSS of the suite                 |   2647 MB | **2565 MB** | 3599 MB |    3432 MB |    3019 MB |
| RSS after the import                  | **40 MB** |       51 MB |   51 MB |      54 MB |      57 MB |

Import cost more than halves at 24, which is per worker rather than per run — it is the one number
that scales with how many files a suite spreads across.

**What a spy costs does not change with the version.** Held heap per spy is identical to the byte on
all six — 13584 B eager (10 methods), 5513 B lazy with two methods touched, 2473 B lazy untouched.
The RSS rows above move because newer V8 starts with a larger heap and lets more garbage accumulate
before collecting, not because the library allocates differently.

So: **run 24 (or 26)**. The only argument for staying on 22 is a memory-capped CI container — a
gigabyte of peak RSS separates them — and on 24 that is what `--max-old-space-size` is for, rather
than a slower runtime. Node 18 and 20 are both past end-of-life, and Node 18 additionally cannot run
Vitest 4 at all (see [Installation](./installation)).

::: details Why `npm run bench` is not the source for this table
The cross-version numbers here come from a standalone harness, not from the repo's Vitest bench.
Vitest bench was tried first and rejected: consecutive runs of the same case on the same version
returned 0.0090 ms and 5.06 ms — GC pauses landed in different samples and swamped a 10% difference
between runtimes. That particular swing has since been traced and fixed at the source: `@vitest/spy`
keeps every mock it ever creates in a module-level strong `Set`, so nothing a bench case allocated
was collectable and each case ran into the heap the previous one had left. `bench/auto-spy.bench.ts`
now calls this package's own `pruneMockRegistry()` at the end of every case, and the table above
reproduces within 1.0–1.2× across consecutive runs. `npm run bench` still cannot compare two
runtimes — a separate process per version, with the runner outside the measurement, is the only
honest way to do that — but it is no longer the GC it was measuring.
:::

## What to reach for

| Situation                                  | Use                           | Why                                                                |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ |
| Angular dependency                         | `provideAutoSpy(Service)`     | the DI provider, written for you                                   |
| A class, no Angular                        | `createSpyFromClass(Service)` | same factory, same lazy default                                    |
| No class at runtime — an interface, a type | `createAutoMock<T>()`         | Proxy; materialises on access                                      |
| An ngrx `signalStore()`                    | `createAutoMock<T>()`         | its members live on the instance, so there is no prototype to read |
| A data shape the code only reads           | `createMock<T>(partial)`      | no spies at all — it is one checked assertion                      |
| Nested object graph                        | `mockDeep<T>()`               | auto-creates chainable spies down the tree                         |

## The two settings that cost

**`{ lazySpies: 'proxy' }`** is the other direction: same laziness, one trap object instead of a
placeholder per method, for classes wide enough that the placeholders are the memory. See
[the table above](#where-the-remaining-memory-is-and-lazyspies-proxy).

**`{ lazySpies: false }`** gives up the win above, and costs an order of magnitude in both time and
memory on a wide class. It is worth it only when a spec inspects the spy object itself through
property descriptors — enumeration (`Object.keys`, spread, a snapshot) already works, because the
placeholders are enumerable accessors.

**`autoSpyAccessors: true`** walks the prototype chain for getters and setters. That walk is
memoised per prototype in a `WeakMap`, exactly like the method walk, so a class spied in 300 tests
pays for it once — this page said otherwise until v3.6.0 and was simply out of date. What the option
still costs per spy is the accessor indirection itself, measured above at five percent; reach for an
explicit `gettersToSpyOn` / `settersToSpyOn` list when you want a smaller surface, not for speed.

Everything else — `methodsToSpyOn`, `observablePropsToSpyOn`, `calledWith`, the return-type helpers
— is either a constant or, in `calledWith`'s case, a sub-microsecond map lookup on a serialized key.

The one `calledWith` shape that is not sub-microsecond is a config holding an **asymmetric matcher**
(`expect.any`, `expect.objectContaining`). Those cannot be a static key, so they are kept as
predicates and evaluated against the actual args after the exact map misses — which means a deep
walk of whatever else is in that config. The config args are serialized once when the config is
registered rather than on every call, which halves it: an asymmetric config whose other argument is
a 200-key object went from **27.3 µs to 14.3 µs** per invocation. Reach for an exact `calledWith`
when you have one; the exact map is flat at 186–237 ns from 1 to 100 configs.

## What actually makes a suite slow

Spy construction is measured above and is not it. The two things that are, both measured on the same
machine as the rest of this page, against a generated Angular suite where every file configures a
`TestBed`, provides `provideAutoSpy(Service)` and renders a component with children — i.e. the shape
of a real component-heavy spec.

### 1. One environment instead of one per file

The default run gives each file its own environment. A shared one — `isolate: false` plus
`fileParallelism: false` — pays for jsdom and the zoneless `TestBed` once for the whole run:

| Suite     | Default run | Shared environment | Change |
| --------- | ----------: | -----------------: | -----: |
| 100 files |      1.78 s |         **1.12 s** |   −37% |
| 400 files |      4.90 s |         **2.54 s** |   −48% |

Three runs per cell, spread under ±0.03 s. The saving is per file, so it grows with the suite: the
400-file run saves twice what the 100-file run saves.

Two things that measurement corrects, both worth knowing before you copy a config:

- **`fileParallelism: false` is the lever, not `isolate: false`.** Flipping `isolate` alone, with the
  default pool, measured 1.76 s against the default's 1.78 s — inside the noise. What collapses the
  per-file cost is landing every file in one worker (`fileParallelism: false` forces `maxWorkers` to
  1). `isolate: false` is what makes running that way _safe to leave on_, which is the whole reason
  [`setupAutoSpy()`](../utilities/setup) exists — it is not itself the speed-up.
- **`poolOptions: { threads: { singleThread: true } }` does nothing on Vitest 4.** `test.poolOptions`
  was removed; Vitest logs `was removed in Vitest 4` and ignores it. The top-level
  `fileParallelism: false` replaces it.

What the mode costs is not in the clock: a `TestBed` patch installed once per worker outlives the
file that asked for it, and a load-time failure is reported against every file in the worker at
once. Both are in [Vitest → Isolation](../runtimes/vitest#isolation), and both are worth reading
before the config is copied.

On a suite small enough that Vitest's own startup dominates, none of this shows up in the clock —
this library's own 39-file suite runs in ~1.03 s either way. The work still collapses, and that is
what scales: aggregate setup 6.3 s → 0.23 s, environment 5.2 s → 0.19 s, transform 3.1 s → 0.32 s.

### 2. Rendering the child subtree

[`renderShallow`](../adapters/angular#shallow-component-rendering) brings the component up through
the real `TestBed` without its children and without its template. Per render, measured 2026-08-26 on
a component holding two `@for` tables whose row count is varied:

| Child instances | `TestBed.createComponent` | `renderShallow` | Ratio |
| --------------: | ------------------------: | --------------: | ----: |
|               0 |                   0.65 ms |         0.55 ms |  1.2× |
|              10 |                   1.00 ms |         0.55 ms |  1.8× |
|             100 |                   2.72 ms |     **0.48 ms** |  5.7× |
|             400 |                   8.52 ms |     **0.53 ms** | 16.2× |

These are Angular figures and therefore not part of `npm run bench`, which deliberately covers only
the plain core — treat the ratios as the result, not the absolute times.

The shape is the point: `renderShallow` is flat at ~0.5 ms because it never builds the subtree, while
`createComponent` scales linearly with it. So the win is not a fixed percentage — it is however much
markup the component under test happens to own. On a leaf component with no children there is nothing
to save (1.2×); on a table or a dashboard it is an order of magnitude.

This is only worth taking because [templates are not what a spec asserts on](../recipes). A test that
reads component state pays for the subtree and gets nothing back for it.

**What that becomes on a real file, and why the two numbers differ.** The README quotes **1.7×**
for the same helper, and both figures are true of different things. The table above isolates one
render; a spec file's wall clock also pays for imports, the `TestBed` module and the assertions,
none of which shallow rendering touches. Converted on a private Angular 22 zoneless suite (784
specs, the AOT `@angular/build:unit-test` builder), three of its most expensive component specs
went 129 ms → 61 ms (2.1×), 133 ms → 75 ms (1.8×) and 29 ms → 38 ms (**0.8× — slower**), for 291 ms
→ 174 ms together. The regression is the leaf component: with almost no subtree to remove, the
per-test `overrideComponent` costs more than it saves, exactly as the 1.2× row predicts. So the
per-render ratio is the upper bound on what a file can gain, and
[`enableTestBedDiagnostics()`](../adapters/angular#where-a-spec-spends-its-time) is how to find the
files where the bound is worth chasing — across those ten files `TestBed` was 25 % of the total, but
per file it ranged from 13 % to 66 %.

#### The middle rung, `keepTemplate: true`

A spec that needs a `viewChild`, content projection or a host binding needs the component's own
template, and the table above reads as if that meant paying for the whole tree again. It does not.
`buildOverride` (`lib/render-shallow.ts:83-98`) applies `imports: options.keepChildren ?? []`
whether or not the template is kept, so with `keepTemplate: true` the template renders while every
child in it resolves to nothing under `NO_ERRORS_SCHEMA`:

Measured 2026-08-30:

|                                          |          per render |
| ---------------------------------------- | ------------------: |
| the full `TestBed.createComponent` cycle |            1.933 ms |
| `renderShallow({ keepTemplate: true })`  | **1.074 ms** — 1.8× |

So there are three rungs, not two: the full cycle, the component's own template with an empty
subtree, and no template at all. Reach for the middle one when the spec reads something the template
creates, and keep `keepChildren` for the handful of children it genuinely needs resolvable.

### 3. Worker count

With a shared environment more workers stop helping early: each one re-imports the whole module graph
and has nobody to share that work with. Measure before raising it — on the suites above, one worker
beat the default pool outright at both sizes.

### Finding your own number 1, 2 and 3

Everything above is measurement, and Vitest 4.1 ships two flags that produce the same kind of
evidence for **your** suite rather than this one. Neither is part of this library; both are worth
knowing before optimising anything.

- **`experimental.importDurations: { limit, print }`** names the imports a spec file waits on, with
  a threshold and an optional failure. It answers the question the numbers above cannot: whether a
  file's cost is the `TestBed`, the doubles, or one heavy barrel import that nothing in the spec
  uses. On an Angular suite the usual finding is the third.
- **`experimental.preParse`** (4.1.3) moves parsing off the critical path at start-up.

They sit alongside [`enableTestBedDiagnostics()`](../adapters/angular#where-a-spec-spends-its-time),
which reports the same per-file cost from inside the `TestBed`. Use the Vitest flags to find which
files are expensive, and the diagnostics to find where inside one the time goes.

## Why this is not written in Rust

The question arrives with scale: a suite of ten or twenty thousand tests, a CI bill that is a real
line item, and a library sitting on the hot path of every one of those tests. Rewriting the core as
a native addon sounds like the obvious lever.

It was measured, and native loses twice over. It is slower at the work, and the work is not where
the time is.

### Native is slower at the one job a spy has

A spy does two things on every call: it crosses into the recording code, and it retains its
arguments so `mock.calls` can be read afterwards. Both were measured against a minimal
[napi-rs](https://napi.rs) addon doing the identical work — the same push into the same kind of
container, once from Rust and once from JavaScript:

| per call                              | native (napi-rs) |         JS |             |
| ------------------------------------- | ---------------: | ---------: | ----------- |
| cross the boundary, do nothing at all |           9.0 ns | **3.7 ns** | 2.4× slower |
| retain two object arguments           |          35.9 ns | **9.3 ns** | 3.8× slower |

The second row is the load-bearing one. Arguments to a spied method are live JavaScript values —
component instances, `Subject`s, DOM nodes, class instances — and `toHaveBeenCalledWith` compares
them by identity as well as by structure. Retaining one from Rust means an N-API reference per
argument, which is what that 35.9 ns buys; serializing them instead would be cheaper and would
destroy the identity every matcher depends on. Pushing them into a JavaScript array is four times
cheaper and keeps the semantics.

::: details Reproducing the two rows

Apple silicon, Node 24.19, napi-rs 2.16, `--release` with LTO. Median of nine runs of 2 000 000
calls; both sides are drained every 100 000 calls, untimed, so that neither row measures its own
garbage collector rather than its own work — without that the JavaScript row varies by 3× between
runs as the retained array grows.

```rust
#[napi]
pub fn noop() {}

#[napi]
pub fn record_refs(env: Env, a: Object, b: Object) -> Result<()> {
  let ra = env.create_reference(a)?;
  let rb = env.create_reference(b)?;
  REFS.with(|r| { let mut r = r.borrow_mut(); r.push(ra); r.push(rb); });
  Ok(())
}
```

against `() => {}` and `(a, b) => { calls.push([a, b]); }`, timed with `process.hrtime.bigint()`
around a `CHUNK`-sized loop.

:::

### It would own 9 ns of a 117 ns call

The `unconfigured dispatch` row in [Measured](#measured) is 0.4 µs for three calls — about 117 ns
each, with the `mockClear` that keeps the benchmark honest charged in. Argument retention is the
~9 ns of that a native version would take over, and turn into ~36 ns.

The other ~108 ns is the host runner's own mock, and it stays JavaScript whatever this library is
written in. `spy.mock.calls` has to be a plain JavaScript array because Vitest's matchers walk it
synchronously; `mockReturnValue` has to hand back a JavaScript value; the mock object itself comes
from `vi.fn()` / `mock()` / `t.mock.fn()` and belongs to the runner. There is no version of this
where the state lives on the other side of the boundary.

### And spies are ~0.1 % of a CI job

The arithmetic that prompts the question is the one that answers it. Take a 10 500-test Angular
suite run in CI as three shards with coverage on — one shard, timed from its own job log:

| shard, ~107 s total                                  | share |
| ---------------------------------------------------- | ----: |
| before Vitest starts — clone, cache, install, bundle | ~38 s |
| Vitest: coverage instrumentation and remapping       | ~47 s |
| Vitest: **running the tests**                        | ~12 s |
| artifact upload                                      |  ~5 s |

Everything this library does lives inside that 12 s. At the measured 5.6 µs per spy, 10 500 tests
that each materialise four of them come to **~0.23 s of CPU spread over three workers** — around a
tenth of one percent of the job. Deleting spy construction entirely, down to zero, would take a
107-second job to about 107 seconds.

Under coverage the ratio gets worse rather than better. With coverage scoped to application sources,
as it normally is, the library is not instrumented at all — so the multiplier that coverage costs
lands on application code and misses the spies completely.

### What a native build would cost

Against a saving indistinguishable from noise:

- **Six or more platform binaries** in every consumer's `devDependencies`, plus the install-time
  failure mode that comes with them — the one thing a testing library must never introduce, because
  it breaks the tool you would use to diagnose it.
- **The runners this package supports.** `bun:test`, `node:test` and browser mode are first-class
  here, and a native addon does not load uniformly across them, or at all in a browser. A WASM
  fallback gives up the premise, since it would be slower than the JavaScript it replaced.
- **Sandboxes** — StackBlitz, WebContainers, a bare CI image without a matching prebuild.

The native wins available in a JavaScript test stack are real, and they have all already been taken
by someone else: the bundler, the transformer, the linter. Those tools chew through the whole source
tree once per run, which is the shape of problem native code is good at. A spy factory does not
process a tree; it hands back an object, a few hundred nanoseconds at a time, and then gets out of
the way. The right thing for it to be is small, lazy and boring — which is what the rest of this
page is about.
