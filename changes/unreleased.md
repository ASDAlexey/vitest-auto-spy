# Unreleased

> **`CHANGELOG.md` (repo root) is the single source of truth.** This file is only an optional
> local staging mirror — GitHub Releases are auto-generated from Conventional Commits on push to
> `master`, so nothing here is pasted anywhere. See `CONTRIBUTING.md` → "Releasing".

_Last released: **v3.1.0** (2026-08-28)._

## Added

- **`setupAutoSpy({ strayRejections: true })`** — fails the test a promise rejection zone.js
  swallowed surfaced in. zone.js drains a rejection nobody handled into `console.error` and stops
  there, so it never reaches the channel Vitest listens on and the run still exits 0: an assertion
  that dies inside a `.then()`, an `async` helper called without `await`, a `TypeError` in a
  `.then()` in production code — all green, all only in stderr. Six real defects of that shape were
  hiding in the 1688-spec, 11 587-test suite it came from. Off by default; it needs zone.js loaded
  and throws if it is not, and it installs no `process.on('unhandledRejection')` listener, which
  would silence the native rejections Vitest already reports. `trackStrayRejections()`,
  `countStrayRejections()` and `flushStrayRejections()` are exported for a narrower check.
- **`no-floating-assertion`** — a ninth ESLint rule, `error` in `configs.recommended`: an
  `expect()` in a `.then()` / `.catch()` / `.finally()` callback whose chain nobody awaits,
  returns, assigns or passes on. The test ends first, the assertion never runs, and the test passes
  no matter what it claimed. Only the immediately enclosing callback counts — that is the scope
  awaiting the chain actually repairs.

- **`setupAutoSpy({ resetConsoleSpies })`** — clears the `vitest-auto-spy/console` spies after every
  test, on by default. Nothing else empties them: they are plain mocks over the real `console`, so
  `vi.restoreAllMocks()` (which only knows `vi.spyOn`) walks past them and `clearMocks` is off by
  default. Left alone, `consoleErrorSpy.mock.calls` keeps every argument of every log for the whole
  run — `Error` objects and their stacks included, which in an Angular suite is a teardown warning
  per test. `resetConsoleSpies()` had been written and wired to nothing since the entry shipped. A
  project that never imports the `/console` entry pays nothing: the hook looks the reset up on a
  registry that entry fills in, so the module is not pulled in on its account. Pass
  `resetConsoleSpies: false` for a suite that asserts on what an earlier test logged.

## Changed

- **The `vitest-auto-spies` alias is published by CI**
  (`.github/workflows/publish-alias.yml`), from both release paths, right after the canonical
  package reaches npm. It re-checks `alias:sync:check`, refuses to go out before the package it
  depends on, and skips a version that is already published — so it is safe to re-run, and it can
  be run on its own (Actions → _Publish alias_) to catch up a version released before it existed.
  Hand-publishing is what let the alias sit at 1.9.3 for two majors.
- **CI runs `test:zone` and `alias:sync:check`.** `vitest-auto-spy/zone` is the only entry that
  touches zone.js and no other suite loads it, so `fakeAsync` / `waitForAsync` were covered locally
  and nowhere else; the alias check keeps the generated package from drifting from `package.json`.

## Fixed

- **A throwing `setupAutoSpy` diagnostic no longer cancels the restores.** `strayRejections` and
  `guardGlobals: 'throw'` fail a test on purpose, and each hygiene step used to be its own
  `afterEach` — so which ran first was decided by the project's `sequence.hooks`. Under its default
  `'stack'` Vitest runs them in reverse registration order, which put the throwing diagnostic first
  and skipped every restore behind it: on any test that surfaced a stray rejection, `mockValueProp` /
  `mockReadonlyProp` patches, observer stubs, the `blockNetwork` stub and the media-element prototype
  patch all stayed applied and leaked into the rest of the worker. A project pinning
  `sequence.hooks: 'list'` was immune by accident. The steps now share one hook and run in the order
  the code lists them, diagnostics first, and the diagnostic's message still fails the test.
- **`restoreMockedProps()` finishes the sweep when one patch cannot be undone.** It reversed the
  journal _in place_ and restored without a `try`, so the first failure — a property some spec later
  redefined as non-configurable — abandoned every patch behind it and left the journal both non-empty
  and back-to-front, silently breaking the "the first descriptor recorded is the original one"
  invariant for the next call. Each patch is now restored on its own, the journal is emptied whatever
  happens, and everything that could not be put back is reported in one message. Undoing a single
  patch through the handle a `mock*Prop` helper returns is also O(1) rather than a scan of the
  journal.

- **`mockSystemTime()` no longer leaves the environment without `Date`.** Its undo called
  `vi.useRealTimers()` and stopped there, and under a DOM environment that _deletes_ `Date` instead
  of putting it back — so with `isolate: false` the next file in the worker died inside Vitest's own
  `useFakeTimers`, several files away from the spec that froze the clock. It now restores the timer
  globals the way `setupFakeTimers()` already did. The same undo also keeps the promise its docblock
  makes: it recognises the fakes it installed by identity, so a set the suite installed in between
  is left running and a second undo does nothing, where before both were torn off.
- **`countStrayTimers()` counts what is still pending, not what the file scheduled.** A timeout now
  drops its handle when it fires, a frame when it runs, and either kind of timer when something
  clears it — `clearTimeout`, `clearInterval` and `cancelAnimationFrame` are wrapped symmetrically
  with the schedulers. The check the docs recommend, `expect(countStrayTimers()).toBe(0)`, could not
  pass in any file that scheduled a single timer before this; the handles a Node `Timeout` object
  kept alive until `afterAll` — and with them the component or service its callback closes over —
  are released as soon as it fires. An interval still counts until it is cancelled, which is the
  leak worth reporting. `SchedulerHost` now spells out the callback parameter (`ScheduledCallback`,
  also exported) that a one-shot scheduler has to wrap.
- **`expectNoEmission()` cancels its quiet window.** When the source emitted or errored, the promise
  settled but the timer stayed armed: it fired later, outlived the test and — under `isolate: false`
  — went off inside another file, precisely the stray this package exists to catch.
- **A value that references itself no longer replaces the failure it was supposed to explain.**
  `expectNoEmission()` and `narrow()` built their messages with `JSON.stringify`, which throws
  `Converting circular structure to JSON` on a component, a DOM node or a store slice with
  back-references — and answers `undefined` for a function and throws on a `BigInt`. Both now use
  the library's own total serializer, so the message shows the value. The rendering changes with it:
  `{id:1}` rather than `{"id":1}`.

- **`mockDeep<T>()` materialises members that share a name with the function surface.** The child
  lookup shadowed every key that merely _existed_ on the underlying spy, and a spy is a function —
  so `mockDeep<Api>().name` answered with the mock's name string instead of a child spy, and
  `.length`, `.call`, `.apply`, `.bind`, `.constructor` and `.toString` could not be members of a
  mocked type at all. Only the spy's real surface shadows a child now, and that surface is read off
  a live spy rather than listed, so it cannot drift from the three mock adapters. Reading a spy
  method off a deep node is also stable again — `api.log.info === api.log.info`, where each read
  used to allocate a fresh bound function.
- **An observable helper now overrides an earlier `rejectWith`.** `spy.load.rejectWith(err)`
  followed by `spy.load.nextWith(value)` kept returning `Promise.reject(err)`: the observable
  helpers published a new value onto the spy's container without taking down the
  `_isRejectedPromise` / per-call state the promise helpers had left there, and the dispatcher
  reads those first. The configuration written last wins again, both on a spy and on a
  `calledWith` chain.
- **`installPerTest` drops its handle after each test.** It kept the last test's handle in a
  closure of the spec module, which under `isolate: false` is never unloaded — for the documented
  `installPerTest(() => stubIntersectionObserver(…))` that is an observer stub holding the
  fixture's DOM and the component instance, one subtree per spec file, until the worker exits.
  Reading the handle outside a test now reports that, as its docblock always promised.

- **`setupAngularTestEnv` decides the mode once per spec file.** The `zoneless` predicate is called
  from a `beforeAll` instead of before every test: `expect.getState().testPath` _is_ the file, and a
  file does not change mode halfway through, so the per-test call re-derived an answer that was
  already known — 10 536 calls become 784 on the suite this came from. Only a predicate with
  per-test side effects can tell the difference.
- **The global-patch guard compares names, not descriptors.** `guardGlobalPatches` used to
  materialise `Object.getOwnPropertyDescriptors` of `globalThis`, `document` and `navigator` after
  every test — ~1260 descriptor objects per test in a DOM environment — to find an addition that
  virtually never happens. It now compares the list of own property names, reads a descriptor only
  for a name that appeared, and carries the baseline from test to test rather than re-taking it.
  Measured in isolation: 0.283 ms → 0.013 ms per test, 1260 descriptor objects → 0. What it catches
  is unchanged: a non-configurable addition is still reported against the test that made it, and a
  property added and taken off again within one test is still nothing to report.
- **Accessor discovery is cached per prototype**, the way method discovery already was. With
  `autoSpyAccessors: true`, `createSpyFromClass` walked the prototype chain and materialised the
  descriptors of every level on every call — that is, in every `beforeEach`. 0.0013 ms → 0.0001 ms
  per spy on a three-level chain; 10 000 spies of one class walk that chain once instead of 10 000
  times. `resolveAccessors` copies what it reads, so a caller cannot mutate the cached lists.
- **`blockNetwork` installs one and the same stub** rather than allocating a fresh closure before
  every test. The stub carries no state — everything it reports comes from the argument it is handed.

- **`vitest-auto-spy/zone` keeps the identity of the runner API.** The patch returned a new `Proxy`
  for every property read, so `it.skip !== it.skip` and `test.each !== test.each`: anything that
  compares a member of the runner API by identity — or keys a `WeakMap` by one — behaved differently
  under the patch than without it, with nothing pointing at the patch. Views are now memoised per
  target, and the undo drops them along with the shared fork, so a re-installation under the other
  `scope` starts from nothing.

<!-- Add user-facing items here as work lands, mirroring `## [Unreleased]` in the root CHANGELOG. -->
