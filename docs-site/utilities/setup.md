---
title: Test-run hygiene
description: setupAutoSpy() — property restore, mock-registry reset and duplicate-copy detection in one call.
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

## Options

| Option                | Default   | Notes                                                                         |
| --------------------- | --------- | ----------------------------------------------------------------------------- |
| `duplicateCopies`     | `'throw'` | `'warn'` to report without failing, `'off'` to skip the check                 |
| `restoreProps`        | `true`    | `restoreMockedProps()` in a global `afterEach`                                |
| `restoreMocks`        | `false`   | `vi.restoreAllMocks()` in a global `afterEach` — turn on for `isolate: false` |
| `strayTimers`         | `false`   | Track and cancel timeouts, intervals and frames that outlive their file      |
| `blockNetwork`        | `false`   | Reject every `fetch`, so a unit run cannot reach the network                  |
| `restoreTimerGlobals` | `true`    | Put back timer globals that uninstalling the fakes deleted                    |

`restoreMocks` is off by default because it also drops `vi.spyOn` stubs a suite installed in
`beforeAll`; it is the knob to reach for when the run shares one environment across files.

```ts
setupAutoSpy({ restoreMocks: true, duplicateCopies: 'warn' });
```
