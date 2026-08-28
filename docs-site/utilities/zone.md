---
title: fakeAsync on Vitest
description: vitest-auto-spy/zone — the ProxyZone patch zone.js/testing does not ship for Vitest, behind its own specifier so a zoneless project never sees it.
---

# `fakeAsync` on Vitest

```ts
// vitest.setup.ts
import 'zone.js';
import 'zone.js/testing';
import 'vitest-auto-spy/zone';
```

`zone.js/testing` patches three runners: jasmine, mocha and jest. Vitest is not one of them, so in an
Angular project on Vitest **every** `fakeAsync` fails:

```text
Error: Expected to be running in 'ProxyZone', but it was not found.
```

A message about a zone, in a test that never mentions one. Exactly one package does something about
it today — `@analogjs/vitest-angular`, as a side effect of importing `…/setup-zone` — which means a
project moving to the native `@angular/build:unit-test` builder loses the patch along with Analog:
the builder loads `zone.js/testing`, but installs no wrapper for Vitest.

## What it does

`fakeAsync` needs one thing: the callback it wraps must run inside a zone that carries a
`ProxyZoneSpec`, because that is the spec it swaps its own `FakeAsyncTestZoneSpec` into. So the patch
runs every test and hook body inside a forked proxy zone.

The difficulty is doing that without disturbing the runner, and the three ways a hand-written version
gets it wrong are all failures in *other people's files*:

| Detail                                            | What goes wrong without it                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| the wrapper declares **no** parameters            | Vitest reads `fn.toString()` to find fixtures; `function (...args)` fails every file with `FixtureParseError: … must use object destructuring`    |
| `fn.length` and `fn.toString()` are carried over  | the runner reads both to decide how to call the callback — a wrapper of arity 0 silently changes that decision, and hides the fixtures            |
| `it` is **proxied**, not replaced                 | `each` is a method that reads `this`; called detached it returns `undefined` and the line after it explodes. `it.skip` / `test.each` come free    |

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
