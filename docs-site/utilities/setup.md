---
title: Test-run hygiene
description: setupAutoSpy() — property restore, mock-registry reset, duplicate-copy detection and global-patch guarding in one call.
---

# Test-run hygiene

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

One call for the pieces of hygiene every project otherwise assembles by hand, each of which is
cheap to install and expensive to diagnose when it is missing. The first three are on by default;
the rest are switches, because they change what the code under test sees.

## 1. Restoring patched properties

`vi.restoreAllMocks()` knows about spies, not about properties
[`mockReadonlyProp` / `mockValueProp`](../adapters/angular#signal-readonly-property-mocking)
redefined. Under `isolate: false` an un-restored patch on a global, a prototype or a singleton
leaks straight into the next file. `setupAutoSpy()` registers `restoreMockedProps()` in a global
`afterEach`.

## 2. One copy of the library in the process

Two copies keep two sets of console spies and two registries, so an assertion runs against a spy
that never replaced the console the code under test called — and the symptom reads as "tests fail
depending on file order". The check fails the run with a report naming both copies and what to do
about each cause: a second install, or one install loaded in both its ESM and CommonJS form.

```ts
import { describeDuplicateCopies, getPackageCopies } from 'vitest-auto-spy/setup';

getPackageCopies(); // the registered copies, for your own reporting
describeDuplicateCopies(); // the human-readable report, or undefined when there is only one
```

Both are exported from the core entry as well.

## 3. Draining the runner's restore registry

Every `vi.spyOn` adds an entry that only `vi.restoreAllMocks()` removes; with a shared environment
that list grows for the whole run. `restoreMocks: true` drains it after each test.

## 4. Cancelling timers that outlive their file

Opt-in, and only relevant with `isolate: false` — where every spec file in a worker shares one set of
globals. A `setTimeout` a component schedules and never clears survives the file that created it: the
callback fires while a **different** file is mid-test, against mocks and a DOM that no longer match,
and the runner blames whichever file happened to be running.

`requestAnimationFrame` is the half that gets missed. Angular's zoneless change-detection scheduler
races a timeout against a frame callback, so a component torn down at the end of one file can still
have a frame queued — and what surfaces later is an Angular-internal complaint (a scheduler running
watches while scheduling, a signal read in the notification phase) attributed to innocent code.

```ts
setupAutoSpy({ strayTimers: true });
```

That wraps the four schedulers once per worker and sweeps whatever is outstanding in `afterAll`. The
pieces are exported for a suite that wants the sweep elsewhere — or wants a leak to **fail** rather
than be tidied away:

```ts
import { cancelStrayTimers, countStrayTimers, trackStrayTimers } from 'vitest-auto-spy/setup';

const stop = trackStrayTimers(); // idempotent; returns the undo, which also cancels
afterEach(() => expect(countStrayTimers()).toBe(0));
afterAll(() => {
  const cancelled = cancelStrayTimers(); // how many had to be cancelled

  if (cancelled > 0) {
    process.stdout.write(`${cancelled} timer(s) outlived this file\n`);
  }
});
```

Each takes an optional host, defaulting to the real globals, so a test can contain a stand-in object
instead. Under `isolate: true` this is close to a no-op — the environment is discarded per file
anyway.

## 5. Keeping the run off the network

Opt-in, and the reason it exists is a run that is green and still fails.

jsdom ships no `fetch`, so under it a component reaching for a remote asset is inert and the suite
never notices. happy-dom implements it, and the same component starts issuing real requests — an
icon loader pulling every SVG from a CDN, a config service polling an endpoint. The tests still
pass, because nothing they assert depends on the response. The run does not:

```text
 Test Files  260 passed (260)
      Tests  2257 passed (2257)

Vitest caught 8 unhandled errors during the test run.
DOMException [AbortError]: The operation was aborted.
```

The runner aborts whatever is in flight when it tears the environment down, and those aborts arrive
as unhandled rejections after the summary. Exit code 1, and no test named — because no test failed.

```ts
setupAutoSpy({ blockNetwork: true });
```

`fetch` then rejects immediately, naming what was requested — which is the thing a stack trace does
not tell you:

```text
[vitest-auto-spy] fetch is stubbed in unit tests — the code under test requested https://cdn.example.test/sprite.svg
```

Nothing leaves the machine, the run stops depending on a host being reachable, and the code under
test takes exactly the branch it would take for a failed request. A spec that genuinely wants
`fetch` replaces it as before — this is a floor, not a ceiling. The stub is installed per test
(`restoreProps` takes it off again), and `blockNetwork()` is exported for suites that want it
somewhere narrower.

## 6. Putting back timer globals the fakes took with them

On by default, because it can only ever repair.

`vi.useRealTimers()` reads like the inverse of `vi.useFakeTimers()`, and in a plain Node realm it
is. Under a DOM environment it is not: `@sinonjs/fake-timers` restores a global by assigning the
original back **when it was an own property of the global object**, and deletes it otherwise. In
happy-dom `Date` is inherited from the environment's realm, so uninstalling removes it outright.

With `isolate: true` nothing notices. With `isolate: false` the next file in the same worker meets
a realm with no `Date` and dies inside Vitest's own `useFakeTimers`, several files away from
whatever installed the fakes:

```text
TypeError: Cannot read properties of undefined (reading 'now')
 ❯ hijackMethod node_modules/@sinonjs/fake-timers/src/fake-timers-src.js
 ❯ Object.useFakeTimers node_modules/vitest/dist/chunks/vi.js
 ❯ src/app/billing/invoice.component.spec.ts:24:6
```

The file in that stack is simply the one that ran next.

The real globals are captured when the library is first imported — before any spec can install
fakes — and anything left `undefined` after a test is put back. Only that: a value a spec replaced
on purpose is still there and is left alone, so the repair cannot overwrite a deliberate stub.

```ts
import { getWatchedTimerGlobals, restoreTimerGlobals } from 'vitest-auto-spy/setup';

restoreTimerGlobals(); // safe at any point, and as often as you like
getWatchedTimerGlobals(); // the names captured in this environment
```

`setupFakeTimers()` runs the same repair in its own `afterEach`, so a suite using it is covered
whether or not `setupAutoSpy()` is installed.

## 7. Naming the file that sealed a global

Opt-in, and it answers a question that is otherwise answered by grepping the repository.

`Object.defineProperty(document, 'cookie', { value, writable: true })` is the Jest-era way to stub a
browser global, and `configurable` defaults to `false`. Under per-file isolation that is harmless —
the environment is discarded anyway. Under `isolate: false` the property can no longer be redefined
*or* deleted, so every later file in that worker inherits it, and what fails is some library, every
other run, with nothing pointing back at the file that did it.

```ts
setupAutoSpy({ guardGlobals: 'throw' }); // or 'warn' while a large suite is being cleaned up
```

```text
[vitest-auto-spy] /src/app/diagnostics/app-info.spec.ts redefined document.cookie as a
non-configurable own property, so nothing can put it back — not `restoreMockedProps()`, not
`vi.unstubAllGlobals()`, not the next file's own `Object.defineProperty`. … use
`mockValueProp(document, 'cookie', value)`, which records the descriptor it replaced …
```

`globalThis`, `document` and `navigator` are compared before and after every test; only properties
that appeared *and* cannot be removed are reported. `guardGlobalPatches(reaction)` is exported for a
suite that wants the check somewhere narrower.

## Reinstalling a stub for every test

```ts
import { installPerTest } from 'vitest-auto-spy/setup';

const observers = installPerTest(() => stubIntersectionObserver({ autoEmit: true }));

it('loads the shelf once it scrolls into view', () => {
  fixture.detectChanges();

  expect(observers().last.targets).toEqual([host]);
});
```

Every stub this library installs is taken off again by `restoreMockedProps()` after each test — that
is what keeps it out of the next file. The consequence is easy to miss: a stub installed once at
`describe` level, or in a `beforeAll`, is gone from the second test on, and what fails is an
assertion about the component ("expected 2 calls, got 0") with the stub sitting ten lines above it,
apparently in force.

The same ordering bites from the other direction. A project-wide setup file installs default
observers in a root `beforeEach`, and root hooks run **before** a file's own — so a `beforeAll` in a
spec loses to them silently, while a `beforeEach` in the same spec wins.

`installPerTest` hands back a **reader**, not the handle, because the handle is a different object
each test: a stub installed for the previous test is exactly what must not still be reachable.

## Options

| Option                | Default   | Notes                                                                         |
| --------------------- | --------- | ----------------------------------------------------------------------------- |
| `duplicateCopies`     | `'throw'` | `'warn'` to report without failing, `'off'` to skip the check                 |
| `restoreProps`        | `true`    | `restoreMockedProps()` in a global `afterEach`                                |
| `restoreMocks`        | `false`   | `vi.restoreAllMocks()` in a global `afterEach` — turn on for `isolate: false` |
| `strayTimers`         | `false`   | Track and cancel timeouts, intervals and frames that outlive their file       |
| `blockNetwork`        | `false`   | Reject every `fetch`, so a unit run cannot reach the network                  |
| `guardGlobals`        | `'off'`   | Report a test that redefines a global property as non-configurable            |
| `restoreTimerGlobals` | `true`    | Put back timer globals that uninstalling the fakes deleted                    |

`restoreMocks` is off by default because it also drops `vi.spyOn` stubs a suite installed in
`beforeAll`; it is the knob to reach for when the run shares one environment across files.

```ts
setupAutoSpy({ restoreMocks: true, duplicateCopies: 'warn' });
```

## Fake timers for the whole run

```ts
setupAutoSpy({ globalFakeTimers: true }); // or a `vi.useFakeTimers()` config object
```

Jest had `fakeTimers: { enableGlobally: true }`; Vitest has no such setting. A suite ported from a
project that used it was written against a frozen clock throughout, and turning that back on file by
file is a thousand edits.

Both ends are guarded, which is the half a hand-written pair of hooks gets wrong. A spec that drives
the clock itself would otherwise reach a second `vi.useRealTimers()`, and under happy-dom that one
leaves the environment without `clearInterval` — which explodes during teardown of whichever file
runs next, blaming it.

## Shared fixtures are functions, not constants

Under `isolate: false` a module is evaluated **once per worker**. An exported object holding
`vi.fn()`s is therefore one set of spies shared by every file that imports it, registered against
whichever file got there first, and the other files' `clearMocks` never reaches them. The symptom is
a 30-second timeout in a different file on each run.

```ts
// ❌ a constant: one set of spies for the whole worker
export const mockCommandContext = { actions: { navigateToChannel: vi.fn() } };

// ✅ a factory: one set per caller
export const createCommandContext = () => ({ actions: { navigateToChannel: vi.fn() } });
```

The same applies to a shared provider fixture — `{ provide: X, useValue: { load: vi.fn() } }` is a
constant unless it is returned from a function. And a spec file must **export nothing**: under
`isolate: false` an exported spec file gets imported by its neighbours and loses its own suite. Put
shared doubles in a `*.mock.ts` beside them.

The [`no-shared-module-level-mock`](/utilities/eslint-plugin) rule finds these mechanically, which
is faster than the timeout that finds them otherwise.

## Hook order differs from Jest

Vitest runs `afterEach` hooks as a stack — innermost and last-registered first — where Jest ran them
in declaration order. In a ported suite where a spec's `afterEach` depends on something the setup
file installed, the setup file's teardown now runs first and the spec's hook operates on an
already-restored environment. `sequence: { hooks: 'list' }` in the Vitest config restores the Jest
ordering.
