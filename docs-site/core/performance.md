---
title: Performance
description: What each factory costs, which one to reach for, and why none of them is where a slow suite spends its time.
---

# Performance

Short version: **use `provideAutoSpy` on Angular and `createSpyFromClass` everywhere else, call it in
`beforeEach`, and stop thinking about it.** The numbers below exist so that claim is checkable, and
so the two settings that *do* cost something are named.

## Measured

`npm run bench` (Vitest bench, one machine — treat the ratios as the result, not the absolute
times). The figures are the **`p75`** column: these cases allocate spy objects by the hundred
thousand, so `hz` swings several-fold between runs as GC pauses land in different samples, while
`p75` reproduces to the fourth decimal.

| Operation | per call (p75) |
| --- | ---: |
| spy a 10-method class, call 2 methods — lazy (the default) | **5.3 µs** |
| the same, eager (`lazySpies: false`) | 18.5 µs |
| spy a 40-method class, call 3 methods — lazy | **10.6 µs** |
| the same, eager | 75.8 µs |
| `createAutoMock<Service>()` + 4 accesses | 9.2 µs |
| `calledWith` dispatch, 3 configured calls | 0.5 µs |

Lazy widens as the class does, and gives it back only when a single test really calls every method
(10 methods, all 10: 22.0 µs lazy against 20.0 µs eager — a rounding error against the order of
magnitude it wins everywhere else). That asymmetry is why it is the default rather than an option.

Put that against a suite: five providers across two thousand tests is ten thousand calls — under a
tenth of a second for the entire run. Spy construction is not where a slow suite spends its time.
`TestBed` is, which is what [`enableTestBedDiagnostics()`](../adapters/angular#where-a-spec-spends-its-time)
measures and [`renderShallow`](../adapters/angular#shallow-component-rendering) usually fixes.

## Why it is fast

`lazySpies` is on by default for every factory: a spy is built on first access rather than for every
method up front, so a twenty-method service a test touches twice builds two spies. `provideAutoSpy`
was the only entry with that default until v2; now the core has it too, and the two are the same
speed.

The other half is a cache: prototype discovery (`getAllMethodNames`) is memoised per prototype in a
`WeakMap`, so calling the factory once per test does not re-walk the chain. A class spied in 300
tests walks its prototype once.

## Memory, not just time

The same benchmark shape, but holding the spies (2000 of them, a 40-method class, two methods
touched per spy — a large spec file's worth):

| | time | heap |
| --- | ---: | ---: |
| lazy (the default) | **22 ms** | **35.4 MB** |
| eager (`lazySpies: false`) | 203 ms | 372.7 MB |

Nine times the speed and a tenth of the memory, because 38 of the 40 spies are never built. Each
one that is skipped is a function, its argument map, and the promise/observable helper bundles
attached to it.

The worst case for lazy is a test that really does call every method:

| | time | heap |
| --- | ---: | ---: |
| lazy | 228 ms | 372.9 MB |
| eager | 216 ms | 372.4 MB |

### What a single spy costs

A materialised spy is mostly the host runner's own mock — under Vitest that is the larger part of
its ~4.7 kB, and nothing this library does can shrink it. What the library adds on top used to
include two `calledWith` chains built with every spy, each an object plus an argument map, whether
or not the spec ever called `calledWith`. They are now built on first use, which is nearly always
never:

| 2000 spies × 40 methods, all materialised | heap |
| --- | ---: |
| chains built eagerly (before) | 417.3 MB |
| chains built on first use | **372.7 MB** |

That is ~560 B off every materialised spy, ~11% of the total, and it costs nothing when a spec does
use `calledWith` — the chain is then built exactly as before. `resetAutoSpy()` drops the chains
rather than replacing them with empty maps, so a reset spy is back to a fresh spy's footprint.

Five percent slower, one percent more memory — the price of the accessor indirection when nothing is
saved. That asymmetry is why lazy is the default rather than an option: the common case wins an
order of magnitude, the rare case loses a rounding error.

Memory matters more than the time here. Under `isolate: false` a worker keeps everything its files
allocated until the run ends, and it is the heap — not the clock — that ends up killing a CI job in
a container.

## Bundle size

The badge says 6.2 kB min+gzip, and that is the whole core entry bundled together. What a consumer
actually pays is less, because the package is side-effect-free per entry and every bundler shakes it:

| Imported | min+gzip |
| --- | ---: |
| the whole core entry (what the badge measures) | 6.2 kB |
| `createSpyFromClass` alone | **3.6 kB** |
| `createSpyFromClass` + `createMock` | 3.6 kB |
| the observer stubs alone | 1.4 kB |

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

| | Before | After |
| --- | ---: | ---: |
| `dist/` | 625 kB | **241 kB** |
| published tarball | 187 kB | **108 kB** |
| files in the package | 74 | **54** |

## What to reach for

| Situation | Use | Why |
| --- | --- | --- |
| Angular dependency | `provideAutoSpy(Service)` | the DI provider, written for you |
| A class, no Angular | `createSpyFromClass(Service)` | same factory, same lazy default |
| No class at runtime — an interface, a type | `createAutoMock<T>()` | Proxy; materialises on access |
| An ngrx `signalStore()` | `createAutoMock<T>()` | its members live on the instance, so there is no prototype to read |
| A data shape the code only reads | `createMock<T>(partial)` | no spies at all — it is one checked assertion |
| Nested object graph | `mockDeep<T>()` | auto-creates chainable spies down the tree |

## The two settings that cost

**`{ lazySpies: false }`** gives up the win above, and costs an order of magnitude in both time and
memory on a wide class. It is worth it only when a spec inspects the spy object itself through
property descriptors — enumeration (`Object.keys`, spread, a snapshot) already works, because the
placeholders are enumerable accessors.

**`autoSpyAccessors: true`** walks the prototype chain for getters and setters, and unlike the
method walk that result is not cached. On a class spied once per test in a large file it is the one
option worth replacing with an explicit `gettersToSpyOn` / `settersToSpyOn` list.

Everything else — `methodsToSpyOn`, `observablePropsToSpyOn`, `calledWith`, the return-type helpers
— is either a constant or, in `calledWith`'s case, a sub-microsecond map lookup on a serialized key.

## What actually makes a suite slow

Spy construction is measured above and is not it. The two things that are, both measured on the same
machine as the rest of this page, against a generated Angular suite where every file configures a
`TestBed`, provides `provideAutoSpy(Service)` and renders a component with children — i.e. the shape
of a real component-heavy spec.

### 1. One environment instead of one per file

The default run gives each file its own environment. A shared one — `isolate: false` plus
`fileParallelism: false` — pays for jsdom and the zoneless `TestBed` once for the whole run:

| Suite | Default run | Shared environment | Change |
| --- | ---: | ---: | ---: |
| 100 files | 1.78 s | **1.12 s** | −37% |
| 400 files | 4.90 s | **2.54 s** | −48% |

Three runs per cell, spread under ±0.03 s. The saving is per file, so it grows with the suite: the
400-file run saves twice what the 100-file run saves.

Two things that measurement corrects, both worth knowing before you copy a config:

- **`fileParallelism: false` is the lever, not `isolate: false`.** Flipping `isolate` alone, with the
  default pool, measured 1.76 s against the default's 1.78 s — inside the noise. What collapses the
  per-file cost is landing every file in one worker (`fileParallelism: false` forces `maxWorkers` to
  1). `isolate: false` is what makes running that way *safe to leave on*, which is the whole reason
  [`setupAutoSpy()`](../utilities/setup) exists — it is not itself the speed-up.
- **`poolOptions: { threads: { singleThread: true } }` does nothing on Vitest 4.** `test.poolOptions`
  was removed; Vitest logs `was removed in Vitest 4` and ignores it. The top-level
  `fileParallelism: false` replaces it.

On a suite small enough that Vitest's own startup dominates, none of this shows up in the clock —
this library's own 39-file suite runs in ~1.03 s either way. The work still collapses, and that is
what scales: aggregate setup 6.3 s → 0.23 s, environment 5.2 s → 0.19 s, transform 3.1 s → 0.32 s.

### 2. Rendering the child subtree

[`renderShallow`](../adapters/angular#shallow-component-rendering) brings the component up through
the real `TestBed` without its children and without its template. Per render, on a component holding
two `@for` tables whose row count is varied:

| Child instances | `TestBed.createComponent` | `renderShallow` | Ratio |
| ---: | ---: | ---: | ---: |
| 0 | 0.65 ms | 0.55 ms | 1.2× |
| 10 | 1.00 ms | 0.55 ms | 1.8× |
| 100 | 2.72 ms | **0.48 ms** | 5.7× |
| 400 | 8.52 ms | **0.53 ms** | 16.2× |

The shape is the point: `renderShallow` is flat at ~0.5 ms because it never builds the subtree, while
`createComponent` scales linearly with it. So the win is not a fixed percentage — it is however much
markup the component under test happens to own. On a leaf component with no children there is nothing
to save (1.2×); on a table or a dashboard it is an order of magnitude.

This is only worth taking because [templates are not what a spec asserts on](../recipes). A test that
reads component state pays for the subtree and gets nothing back for it.

### 3. Worker count

With a shared environment more workers stop helping early: each one re-imports the whole module graph
and has nobody to share that work with. Measure before raising it — on the suites above, one worker
beat the default pool outright at both sizes.
