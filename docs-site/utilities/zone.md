---
title: fakeAsync on Vitest
description: vitest-auto-spy/zone — the ProxyZone patch zone.js/testing does not ship for Vitest, behind its own specifier so a zoneless project never sees it.
---

# `fakeAsync` on Vitest

```ts
// vitest.setup.ts
import 'vitest-auto-spy/zone';
import 'zone.js';
import 'zone.js/testing';
```

`zone.js/testing` patches three runners: jasmine, mocha and jest. Vitest is not one of them, so in an
Angular project on Vitest **every** `fakeAsync` fails:

```text
Error: Expected to be running in 'ProxyZone', but it was not found.
```

A message about a zone, in a test that never mentions one.

zone.js 0.16.2 (2026-05-06) does ship a patch of its own — `zone.js/plugins/vitest-patch` — but it is
opt-in and nothing installs it for you: `zone.js/testing` does not include it (its bundle carries the
jasmine, mocha and jest patches and the string `vitest` zero times), and neither does
`@angular/build:unit-test`, which in every version from 20 to 22 only ever appends `zone.js/testing`
to the polyfills. The one package that wires a patch up as a side effect is `@analogjs/vitest-angular`,
via `…/setup-zone` — so a project moving to the native builder loses that one along with Analog.

Importing the official plugin by hand is not the answer either, and people are actively being told to.
ng-mocks prescribes exactly this load order in its install guide — `zone.js`, then `zone.js/testing`,
then `zone.js/plugins/vitest-patch` — alongside a tested compatibility matrix (Angular 20 / Vitest 3 /
jsdom 26, zoneless only; Angular 21 and 22 / Vitest 4 / jsdom 28, zoned or zoneless). Follow it and you
get the plugin's behaviour, which is this. Measured on Vitest 4.1.9 with zone.js 0.16.2, one spec file
per API:

| In the spec                             | Without the plugin   | With `zone.js/plugins/vitest-patch`                                                        |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `it.skip` / `it.todo` / `it.concurrent` | reported             | **the test is gone, and the run exits 0**                                                  |
| `it.only`                               | only that test runs  | **that test is gone; the unfocused one runs**                                              |
| `it.each`                               | passes               | **`TypeError: Cannot read properties of undefined (reading 'apply')`, no tests collected** |
| `describe.skip`                         | skipped              | **the suite runs**                                                                         |
| `describe.only`                         | only that suite runs | **every suite runs**                                                                       |
| `test.extend`                           | fixtures work        | **`TypeError: test.extend is not a function`**                                             |
| `test: { globals: false }`              | —                    | patches nothing, warns nothing, every `fakeAsync` still throws                             |

The cause is that it replaces the runner globals with plain functions and reattaches ten hard-coded
names to them, so `it.extend`, `it.fails` and `it.scoped` are lost outright while `it.skip`, `it.only`
and `it.todo` become factories that return a function instead of registering a test. It preserves
`fn.length` but not `fn.toString()`, which is what Vitest reads to find destructured fixtures. The same
file under `vitest-auto-spy/zone` reproduces the unpatched run exactly.

In fairness: a plain `fakeAsync` in a bare `it` inside a bare `describe` does work under the official
plugin. It solves the problem it set out to solve, for specs that use no test modifier at all.

## What it does

`fakeAsync` needs one thing: the callback it wraps must run inside a zone that carries a
`ProxyZoneSpec`, because that is the spec it swaps its own `FakeAsyncTestZoneSpec` into. So the patch
runs every test and hook body inside a forked proxy zone.

The difficulty is doing that without disturbing the runner, and the three ways a patch gets it wrong
are all failures in _other people's files_ — each one measured above on the official plugin, not
hypothetical:

| Detail                                           | What goes wrong without it                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| the wrapper declares **no** parameters           | Vitest reads `fn.toString()` to find fixtures; `function (...args)` fails every file with `FixtureParseError: … must use object destructuring` |
| `fn.length` and `fn.toString()` are carried over | the runner reads both to decide how to call the callback — a wrapper of arity 0 silently changes that decision, and hides the fixtures         |
| `it` is **proxied**, not replaced                | `each` is a method that reads `this`; called detached it returns `undefined` and the line after it explodes. `it.skip` / `test.each` come free |

## One zone for the run, or one per callback

```ts
import { installProxyZonePatch } from 'vitest-auto-spy/zone';

installProxyZonePatch({ scope: 'callback' });
```

`scope: 'shared'` is the default: every test and hook body of the run goes through **one** proxy
zone. That is what Angular's own jasmine patch does, and what the ecosystem is written against — a
component built in `beforeEach` schedules from its constructor, and the `tick()` inside the
`fakeAsync` test has to see those timers. Fork per callback instead and the two end up in different
zones, so the test waits on a timer nothing will ever flush.

`scope: 'callback'` is that fork-per-callback shape. It is the correct one in the abstract, and the
required one for `test.concurrent`: two callbacks are then in flight at once and would otherwise
swap the same `ProxyZoneSpec` delegate under one another.

## Requirements

**`test: { globals: true }`.** The patch works by replacing the runner globals; an `it` imported from
`'vitest'` is a module binding that nothing — no patch, in any package — can reach.

**zone.js loaded first, by you.** This entry imports none of it. Under `@angular/build:unit-test` the
builder already loads both bundles from its own entry point; otherwise import them at the top of the
setup file. If they are missing, the patch says which half:

```text
[vitest-auto-spy] vitest-auto-spy/zone: globalThis.Zone is not there, so there is nothing to patch.
This entry deliberately does not import zone.js — a zoneless project must not pull it in — …
```

## Why it is a separate entry

**zone.js is a `devDependency` of this package and nothing else** — not a dependency, not an optional
peer. `vitest-auto-spy` declares no runtime dependencies at all, so installing it cannot pull zone.js
into anybody's tree.

And no other entry of the library reaches this module, even transitively: `dist/zone.js` is
self-contained and nothing else in `dist/` references it. A zoneless project that imports
`vitest-auto-spy` gets no zone code, no zone import, and no bytes of this file. That is an invariant
of the package, not an accident of this release — see `AGENTS.md`.

`installProxyZonePatch()` is exported for a setup file that would rather call it explicitly; it
returns the undo.
