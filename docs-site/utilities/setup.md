---
title: Test-run hygiene
description: setupAutoSpy() — property restore, mock-registry reset, duplicate-copy detection, stray timers and rejections, and global-patch guarding in one call.
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

**And in an `onTestFinished` net behind it**, because the `afterEach` is not guaranteed to run.
Vitest calls `afterEach` hooks in **reverse** registration order, so the one a setup file registers
is the *last*, and any hook the spec file registered — which therefore runs first — takes the chain
down with it when it throws:

```ts
// in the spec file, and therefore running before the library's hook
afterEach(() => vi.restoreAllMocks()); // ← throws, and the cleanup below it never happens
```

That is not hypothetical. One spec kept exactly that line for years; migrating it to
`provideAutoSpy(LayoutStateService, { gettersToSpyOn: [...] })` made the restored getter return
`undefined`, `ngOnDestroy` called it as a signal, and the resulting `TypeError` aborted the hook.
The patch travelled, and the failure surfaced in a **different `describe`** as a template error
about a null profile. With the hand-rolled `vi.fn()` it replaced, the restored getter was still
callable, so the mine had been sitting there invisible the whole time.

`onTestFinished` runs after the `afterEach` chain and runs whatever that chain did, so the net puts
the properties back and warns — naming the count and the cause, at the test where it happened rather
than two tests later. It costs one boolean on the ordinary path: it does nothing unless the hook was
skipped.

`countMockedProps()` is exported for suites that would rather assert it:

```ts
afterEach(() => expect(countMockedProps()).toBe(0));
```

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

`fetch` is only half of the network, and the other half is the one jsdom implements in full.
Plenty of libraries never left `XMLHttpRequest` — `rmp-vast` pings every VAST tracker through a
hand-rolled one — so a suite with `blockNetwork: true` already on was still reaching the internet,
one ping per quartile per ad per test, and printing jsdom's `AggregateError at
Object.dispatchError` for each connection that failed. Whether a green run prints that depends on
whether the machine has a route out, which is not a property a test suite should have.

Every channel the environment implements is closed by default. The object narrows it:

| option   | default    | what it does                                                              |
| -------- | ---------- | ------------------------------------------------------------------------- |
| `fetch`  | `true`     | `fetch` rejects, naming what was requested                                 |
| `xhr`    | `'reject'` | how a diverted `XMLHttpRequest` is answered — or `false` to leave it alone |
| `beacon` | `true`     | `navigator.sendBeacon` answers `false`, where the environment has one      |

`'reject'` fails the request the way an unreachable host does: `readyState` 4, `status` 0, an
`error` event, and the marker on `statusText` — the one string channel a failed request has.
`'empty'` answers it with status 200 and an empty body instead, which is what a request nobody
reads the response of wants:

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } }); // tracker pings, answered and silent
```

A `data:` URL is let through, and it is the only thing that is: it is the scheme a spec serves its
own fixtures from, and the only one a DOM answers without a socket. A **relative** URL is not
exempt — the DOM resolves it against the document origin, so a spec that reaches `/config` and
passes is resting on nothing listening on that port.

`WebSocket` and `EventSource` are deliberately left alone. Their failure is an event on an object
the code keeps and reconnects, so there is no answer a blanket stub could give that is not a
behaviour change of its own;
[`stubConstructor`](/utilities/doubles) is the tool for a spec that has one.

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
_or_ deleted, so every later file in that worker inherits it, and what fails is some library, every
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
that appeared _and_ cannot be removed are reported. `guardGlobalPatches(reaction)` is exported for a
suite that wants the check somewhere narrower.

## 8. Failing on a rejection zone.js swallowed

Opt-in, and the one switch on this page that changes whether a green run is telling the truth.

zone.js replaces the global `Promise`. A rejected `ZoneAwarePromise` nobody handled is drained in
`api.microtaskDrainDone()` and reported through `api.onUnhandledError` — which is a
`console.error` and nothing else. It never reaches `process.on('unhandledRejection')`, the channel
Vitest listens on, so the runner is never told: a file that rejected a hundred promises still exits 0.

What that hides is ordinary code:

```ts
it('renders once compiled', () => {
  TestBed.compileComponents().then(() => expect(component.ready).toBe(true)); // never runs
});
```

The test is over before the callback runs, so the assertion settles after the test it belongs to was
already reported green — and when it fails, the failure _is_ a rejection nothing handled. The same
goes for an `async` helper called without `await`, and for a `TypeError` thrown inside an
`import('…').then(…)` in production code. In one migrated Angular monorepo — 1688 spec files,
11 587 tests, green, exit 0 — six real defects were sitting behind exactly this, two of them
assertions that were simply false.

```ts
setupAutoSpy({ strayRejections: true });
```

The rejection then fails the test the runner was in when zone.js gave up on it:

```text
[vitest-auto-spy] 1 promise rejection(s) went unhandled and zone.js swallowed each one into console.error:
  - AssertionError: expected false to be true — attributed to TaskListComponent > renders once compiled
An assertion that settles after its test has finished cannot fail it: the test it belongs to was
reported green without ever running it. … return or await the promise so the assertion lands inside
the test.
```

"Attributed to" rather than "thrown by", because a rejection created by one file's test routinely
surfaces during a later one; and the closing advice changes with the kind — a failed matcher and a
thrown error are different bugs.

Two deliberate limits. zone.js has to be loaded already: this package never imports it — a zoneless
project must not pull it in — so `import 'zone.js';` at the top of the setup file, or the
`@angular/build:unit-test` builder's own entry point, is what puts it there, and without it the call
**throws** rather than quietly watching nothing. And no `process.on('unhandledRejection')` listener
is installed: Vitest's own handler bails out as soon as a second listener exists, so adding one would
_silence_ the native rejections the runner already reports and fails runs for. Native rejections are
not the gap; the zone-swallowed ones are.

The pieces are exported for a suite that wants the check somewhere narrower, or wants the captures
themselves:

```ts
import { countStrayRejections, flushStrayRejections, trackStrayRejections } from 'vitest-auto-spy/setup';

const stop = trackStrayRejections(); // idempotent; returns the undo, which restores the previous handler

afterEach(() => {
  const stray = flushStrayRejections(); // { reason, assertion, testName }[], and starts again from empty

  expect(stray).toEqual([]);
});
```

Each takes the same optional host as the stray-timer trackers, defaulting to the real globals.
`countStrayRejections()` throws when nothing is tracking the host — asking for a count that is
always `0` because nothing is watching is the failure mode worth being loud about — while
`flushStrayRejections()` returns an empty array instead, so a teardown left behind after the option
is turned off does not throw at the suite.

A rejection the runner has **already** blamed the finished test for is not reported again. An
`async` test that fails an assertion leaves its own `AssertionError` in both places: the runner names
the failure, and the same error arrives here as a rejection nobody handled. A red run therefore
used to print two messages per failure, and the first thing a reader does with the second one is go
looking for a defect that is not there. What survives the filter is what this check exists for —
the rejections that fail no test at all.

The [`no-floating-assertion`](/utilities/eslint-plugin) rule catches the commonest shape statically,
before it ever runs.

## 9. Pruning the mock registry nothing empties

Opt-in, and the one switch on this page that is about what the run costs rather than what it reports.

`vi.fn()` and `vi.spyOn()` add the mock they create to a single module-level `Set` inside
`@vitest/spy`, because that is what `vi.clearAllMocks()` walks — and no API ever takes anything out
of it again. With `isolate: true` the module is re-evaluated per file and the set starts empty every
time. With `isolate: false` it is evaluated once per worker and only grows, and a large suite feels
both halves of that:

- `clearMocks: true` walks every mock of every file already run **before every single test**, so the
  cost of clearing grows with the number of tests already behind it.
- the worker's heap holds every mock of the run at once — with their recorded arguments, and through
  those whole component trees.

```ts
setupAutoSpy({ pruneMockRegistry: true }); // keep only the mocks that outlive a file
```

There is no API for that set, so it is taken from the one thing that iterates it: `Set.forEach`
passes the set to its callback as the third argument, so `vi.clearAllMocks()` under a briefly patched
`Set.prototype.forEach` hands the registry over. The capture is verified against a probe mock, and
without a match nothing is pruned — a slower run beats a broken one.

The half worth understanding before turning it on is what must **not** go. Dropping a mock from the
registry means `vi.clearAllMocks()` and `clearMocks: true` can no longer see it, so its calls
accumulate silently: harmless for a mock that dies with the file that made it, a bug for the
module-level `vi.fn()` in a shared `*.mock.ts` that six spec files import. The first file to import
it creates it, a naive prune drops it when that file ends, and the file that happens to run **second**
then fails on calls its predecessor made — which reads as flakiness, because which file runs first is
the runner's choice.

So the split is drawn where it is observable: whatever is already in the registry when a file's hooks
start was created while the module graph was being evaluated, which is exactly what "lives in a
module" means, and it is kept; everything added afterwards belongs to a test or a hook of that file
and goes when the file ends. One case lands on the wrong side of that line — a module first loaded by
a dynamic `import()` inside a test — and says so explicitly:

```ts
// fixtures/navigation.mock.ts — imported by six spec files
export const navigation = { setFocus: keepMockRegistered(vi.fn()) };
```

The pieces are exported for a suite that wants them without the rest: `trackMockRegistry()` installs
the same pair of hooks on its own, `keepRegisteredMocks()` marks everything currently registered as
long-lived, `pruneMockRegistry()` is the one-shot sweep and returns how many went, and
`getMockRegistrySize()` reports what is left — `undefined` when the capture never took.

## Reinstalling a stub for every test

```ts
import { installPerTest } from 'vitest-auto-spy/setup';

const observers = installPerTest(() => stubIntersectionObserver({ autoEmit: true }));

it('loads the section once it scrolls into view', () => {
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
| `strayRejections`     | `false`   | Fail the test a rejection zone.js swallowed surfaced in — needs zone.js       |
| `blockNetwork`        | `false`   | Close every network channel the environment has — `true`, or a narrowing object |
| `guardGlobals`        | `'off'`   | Report a test that redefines a global property as non-configurable            |
| `globalFakeTimers`    | `false`   | Fake timers for every test **and between them** — see below                   |
| `restoreTimerGlobals` | `true`    | Put back timer globals that uninstalling the fakes deleted                    |
| `pruneMockRegistry`   | `false`   | Keep @vitest/spy's ever-growing mock registry to the mocks that outlive a file |

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

It also keeps the clock fake **between** tests, which is the half of `enableGlobally` a
`beforeEach`-only pair misses: a `beforeAll` inside a nested `describe` runs _after_ the previous
test's `afterEach`, so a block that prepares its samples there would otherwise meet real timers and
fail with `the timers APIs are not mocked` — in a set whose own tests never touch a timer. The fakes
come off for good in `afterAll`, so they never outlive the file. For one `describe` rather than the
whole run, that is [`setupFakeTimers(config, { betweenTests: true })`](./fake-timers).

## Shared fixtures are functions, not constants

Under `isolate: false` a module is evaluated **once per worker**. An exported object holding
`vi.fn()`s is therefore one set of spies shared by every file that imports it, registered against
whichever file got there first, and the other files' `clearMocks` never reaches them. The symptom is
a 30-second timeout in a different file on each run.

```ts
// ❌ a constant: one set of spies for the whole worker
export const mockActionContext = { actions: { navigateToSection: vi.fn() } };

// ✅ a factory: one set per caller
export const createActionContext = () => ({ actions: { navigateToSection: vi.fn() } });
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

## The hooks belong to the file this call ran in

Everything `setupAutoSpy()` installs is a `beforeEach` / `afterEach` / `afterAll`, and a hook
registered while a setup file is imported belongs to the spec file whose collection imported it.
Vitest re-imports the setup files for every spec file, so normally none of that is visible.

It becomes visible when something keeps the setup module in the module cache across files: the call
runs once, and every file after the first in that worker has none of the hooks — no property
restore, no `blockNetwork`, no stray-timer cancellation, no `restoreTimerGlobals`, no global fake
timers. Nothing reports it, and the symptom lands somewhere else entirely — a leaked global, or
`A function to advance timers was called but the timers APIs are not mocked` in a spec that is green
when it runs on its own.

The case seen in the wild is `@angular/build:unit-test` **with coverage**. The builder then serves
each test file as a wrapper that imports the built bundle, the setup module stays resolved in the
shared environment, and its top level never runs again; without coverage the same run is fine, which
is what makes it read as "coverage broke the tests".

Two ways out: run coverage with per-file isolation (`ng test <project> --coverage --isolate`, or
`isolate: true` in the config for that case alone), or call `setupAutoSpy()` from something that is
evaluated per file rather than from a module the runner can cache.
