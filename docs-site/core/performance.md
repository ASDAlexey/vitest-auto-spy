---
title: Performance
description: What each factory costs, which one to reach for, and why none of them is where a slow suite spends its time.
---

# Performance

Short version: **use `provideAutoSpy` on Angular and `createSpyFromClass` everywhere else, call it in
`beforeEach`, and stop thinking about it.** The numbers below exist so that claim is checkable, and
so the two settings that *do* cost something are named.

## Measured

`npm run bench` (Vitest bench, ten-method class, one machine — treat the ratios as the result, not
the absolute ops/sec):

| Operation | ops/sec | per call |
| --- | ---: | ---: |
| lazy (the default), then call 2 methods | **118 900** | ~8 µs |
| eager (`lazySpies: false`), then call 2 methods | 34 600 | ~29 µs |
| `createAutoMock<Service>()` + 4 accesses | 30 600 | ~33 µs |
| `calledWith` lookup on a configured spy | 1 419 000 | ~0.7 µs |

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
| lazy (the default) | **27 ms** | **34.7 MB** |
| eager (`lazySpies: false`) | 257 ms | 424.5 MB |

Nine times the speed and a twelfth of the memory, because 38 of the 40 spies are never built. Each
one that is skipped is a function, its argument map, and the promise/observable helper bundles
attached to it.

The worst case for lazy is a test that really does call every method:

| | time | heap |
| --- | ---: | ---: |
| lazy | 243 ms | 444.0 MB |
| eager | 232 ms | 438.5 MB |

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

In the order they are worth checking, none of which this library can fix for you:

1. **`TestBed` module setup** — see the diagnostics above; a shallow render typically halves it.
2. **The environment** — `isolate: false` shares one environment per worker and is worth far more
   than any spy-level micro-optimisation, provided the run is clean about what it leaves behind
   ([test-run hygiene](../utilities/setup)).
3. **Worker count** — with `isolate: false` more workers stop helping early, because each one
   re-imports the whole module graph and has nobody to share that work with. Measure before raising
   it; the curve usually flattens between four and eight.
