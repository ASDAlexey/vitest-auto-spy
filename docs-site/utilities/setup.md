---
title: Test-run hygiene
description: setupAutoSpy() — property restore, mock-registry reset, duplicate-copy detection, stray timers, rejections and console output, global-patch guarding and a strict preset in one call.
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
is the _last_, and any hook the spec file registered — which therefore runs first — takes the chain
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

Not every timer a file owns is one its code scheduled. jsdom answers every `setItem`, `removeItem`
and `clear` on a Web Storage with a real `setTimeout(…, 0)` that dispatches the `storage` event
(`living/webstorage/Storage-impl.js`), so a file that only writes to `localStorage` still has
timeouts queued — and a fully synchronous one can reach `afterAll` with them pending. The library's
own storage probe (see section 14) runs under `withoutStrayTimerTracking`, so it is never charged to
a file; the same helper takes any setup work of a suite's own out of the count:

```ts
import { withoutStrayTimerTracking } from 'vitest-auto-spy/setup';

withoutStrayTimerTracking(() => seedStorage()); // what this schedules is neither counted nor cancelled
```

`onStrayTimers` is the same count without leaving `setupAutoSpy`, plus **where each stray came from**:
`timers` lists every one with its kind, the spec file that was running when it was scheduled, and up
to five frames of the scheduling call, those outside `node_modules` first.

```ts
setupAutoSpy({ strayTimers: true, onStrayTimers: ({ cancelled }) => expect(cancelled).toBe(0) });

setupAutoSpy({
  strayTimers: true,
  onStrayTimers: ({ timers }) => expect(timers).toEqual([]), // the failure diff names file and frames
});
```

The file is what makes a stray charged to the wrong file traceable: a callback scheduled after the
previous file's sweep is counted against the next file, and its `file` says which one really
scheduled it. The stack is captured when the callback is scheduled — twelve frames at most, formatted
only for the ones that turn out to be strays — and `describeStrayTimers()` returns the same list for
a suite that sweeps by hand.

That capture is what `strayTimers` costs. A `setTimeout` + `clearTimeout` pair on Node's real timers
takes 70 ns untracked, 116 ns tracked in 5.5.0 and about 1.75 µs tracked now, and a pending timer
holds about 0.9 kB more until it fires or is swept (Node v24.19.0, Apple M4 Max). The cap is not the
lever: V8 pays about 0.9 µs for any stack at all, twelve frames or five. A file that schedules 10 000
timers pays about 16 ms for knowing where each came from.

### With Vitest 4.1's `--detect-async-leaks`

::: warning The two cancel each other out, and the quiet one wins
`detectAsyncLeaks` remembers every async resource a file created and, once the file is over, asks
each whether anything still holds it. The sweep runs in `afterAll` — **before** that question — so
every timer it cancelled answers no, and a file that leaks timers is reported as leaking nothing.
:::

Cancelling is still the right default: a callback that fires during a later file is the more
expensive failure, and it is the one `strayTimers` exists to prevent. So when both are on and no
`onStrayTimers` is given, the sweep prints one line to stderr saying how many it took away — enough
to know the leak report is not the whole story.

The warning names where the first three were scheduled and from which file; `onStrayTimers` gets all
of them. Vitest's own report, with `strayTimers` off, points its code frame at the `setTimeout` in the
spec: the library's scheduler wrappers go through `vi.defineHelper`, so the frames inside
`vitest-auto-spy` are dropped from the stack rather than shown in place of the spec's.

```
⎯⎯⎯⎯⎯⎯⎯ Async Leaks 1 ⎯⎯⎯⎯⎯⎯⎯⎯

Timeout leaking in src/app/cart.component.spec.ts
  12|   it('polls', () => {
  13|     component.startPolling();
  14|     setTimeout(() => refresh(), 60_000);
     |     ^
```

The warning goes to stderr rather than `console.warn` on purpose: the sweep runs after the file's
last test, and Vitest attributes intercepted console output to the task that produced it — with no
task left, the line is dropped.

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

| option   | default    | what it does                                                               |
| -------- | ---------- | -------------------------------------------------------------------------- |
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
[`stubConstructor`](/utilities/constructor-doubles) is the tool for a spec that has one.

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

### The mocks it keeps, it also guards

Staying registered has a second consequence, and it is the one that costs a day to find. `clearAllMocks`
is not the only thing that walks the set: `vi.resetAllMocks()` walks the same one and calls
`mockReset()` on everything in it, and `mockReset` puts an implementation back only when it was
passed to `vi.fn(implementation)`. A `vi.fn()` that got its behaviour from a chained
`.mockReturnValue(…)` or `.mockReturnThis()` is simply left answering `undefined` — `@vitest/spy`
spells it `resetToMockImplementation ? mockImplementation : undefined`.

With `isolate: false` the bill arrives somewhere else entirely. One spec calls `vi.resetAllMocks()` in
its own `afterEach`; a **different** file later in the same worker then dies inside application code,
because a shared double it never touched now answers `undefined`:

```
TypeError: Cannot read properties of undefined (reading 'info')
  app.component.ts:316   AppComponent.syncAllProcesses
```

Nothing in that failure names the spec that caused it. It moves whenever the runner reorders files, it
never reproduces on the file that did the resetting, and `vi.restoreAllMocks()` — the call one
naturally probes with — does not cause it at all: in Vitest 4 that one walks `MOCK_RESTORE`, which only
`vi.spyOn` writes to, so a probe built around it comes back green and sends the search the wrong way.

So the implementation a long-lived mock carries when it is first classified is remembered, and put
back before a test that has lost it. Only when it has been lost: a mock a test deliberately
re-implements is left as that test left it, and a mock that never carried an implementation is never
touched. The hook is `beforeEach`, because Vitest applies `restoreMocks` / `mockReset` / `clearMocks`
from `onBeforeTryTask`, which runs _before_ the `beforeEach` hooks rather than after them.

The pieces are exported for a suite that wants them without the rest: `trackMockRegistry()` installs
the same hooks on its own, `keepRegisteredMocks()` marks everything currently registered as
long-lived, `pruneMockRegistry()` is the one-shot sweep and returns how many went,
`restoreLongLivedImplementations()` is the repair above and returns how many it put back, and
`getMockRegistrySize()` reports what is left — `undefined` when the capture never took.

## 10. Strict doubles for the whole suite

Opt-in, and the one switch here that changes what a **double** does rather than what the environment
does.

```ts
setupAutoSpy({ strict: true }); // a method nobody configured throws, naming itself
```

Off, a method nobody configured returns `undefined` — a legal value, so the failure surfaces
wherever it is finally used, several frames from the omission and usually inside production code.
On, it throws on the call that produced it, naming the class, the method and the arguments. The
per-double form is `createSpyFromClass(X, { strict: true })`; this is the same switch for a whole
suite, so adopting it is one line rather than an edit per factory call.

`onUnstubbedCall` is the general form — whatever it returns becomes the call's result, so a suite can
record the gap before turning the throw on:

```ts
setupAutoSpy({ onUnstubbedCall: ({ className, method }) => console.warn(`unstubbed ${className}.${method}`) });
```

A double's own configuration wins, **including an explicit `strict: false`** — which is the only way
to exempt one wide collaborator from the default.

Two things about the lifetime, both of which matter under `isolate: false`. The default is armed only
when one of the two options is actually passed, so a plain `setupAutoSpy()` cannot clobber a default
something else installed. And it is released in `afterAll` of the file that armed it: the module
holding it is shared by every file in the worker, so a default left armed would fail a spec that
never opted in, with a message naming a class that spec had nothing to do with. That is the same seam
`strayTimers` uses, for the same reason.

**Before this release the switch reached no double a spec built.** The default lived in a module
variable, and `setupAutoSpy` ships in `/setup` while the factories ship in `dist/index.js` and
`dist/angular.js`, each carrying its own copy of that module — so the setup file armed one copy and
every spec read another. A 1759-file Angular consumer ran its full suite of 12 717 tests with
`strict: true` and every one stayed green. The default, `onUnstubbedCall` with it, and
`setSpyEngine()` now live on `globalThis`, where every bundle reads the same answer.

A strict double's getter nobody configured still answers `undefined`, and its observable property
nobody fed never emits — a read cannot throw without breaking a failure diff that prints the double.
`unconfiguredReads` reports them after the test instead, and `onUnstubbedRead` surveys them first:

```ts
setupAutoSpy({ strict: true, unconfiguredReads: 'warn' }); // 'off' by default; 'throw' to fail the test
```

Where the guard reaches, what counts as configured, the full precedence chain and what the read report
counts are on [Strict mode](/core/strict-mode#reads-nobody-configured).

## 11. The hook budget Jest had only one of

On by default, because it only ever appends a sentence to a test that has already failed.

```ts
setupAutoSpy({ hookTimeoutHint: false }); // off
```

Jest resolves **one** budget and spends it on a hook and on a test body alike:

```js
const timeout = hook.timeout || getState().testTimeout; // jest-circus
const timeout = test.timeout || getState().testTimeout;
```

Vitest resolves two, and `hookTimeout` has its own default of 10 000 ms. So a suite that carried its
Jest preset's `testTimeout: 30000` into the runner config and stopped there gives every hook a third
of the budget its tests get, and nothing says so.

What makes that expensive is where the failure lands. Vitest attributes a `beforeEach` timeout to the
**test**, with the test's duration pinned at the limit:

```text
× should create 10045ms
```

It reads as a slow test. The body it names never ran at all, so the ten seconds are nowhere to be
found in it, and the reader spends the afternoon in the wrong file. The hint puts the missing
sentence on the error itself, naming both budgets and the field to set.

It is silent when the budgets agree — then the hook really is slow and the config is not the story —
and silent for a hook that named its own limit (`beforeEach(fn, 300)`). `beforeAll` is out of reach
by construction: its timeout is reported as a failed _suite_, every test is marked skipped, and no
`afterEach` runs for the hint to ride on.

Migrating a runner config off Jest, set the two side by side and treat the single Jest number as
belonging to both:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

One neighbouring field differs quietly and changes only the report: `slowTestThreshold` is `5` in
Jest (**seconds**) and `300` in Vitest (**milliseconds**), so a migrated suite starts marking most of
its files slow. A unit change, not a regression.

## 12. A timeout the clock explains, not the code

On by default, and silent unless the clock is frozen with callbacks queued on it.

```ts
setupAutoSpy({ frozenClockHint: false }); // off
```

Fake timers turn waiting into waiting forever. `await new Promise((r) => setTimeout(r, 10))` never
resolves unless something advances them, and all the runner has to say about it is what it says
about a genuinely slow test:

```text
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument …
```

So the reader is told to raise the budget — the one repair that cannot work, because the callback is
not late, it is never going to run. Under [`globalFakeTimers`](#fake-timers-for-the-whole-run) it is
worse: nothing in the spec says the clock is fake, because the setting came from a Jest preset that
had `fakeTimers.enableGlobally`, so the timeout arrives in a file that never mentions a timer.

The hint reports `vi.isFakeTimers()` and `vi.getTimerCount()` — the clock is frozen, N callbacks are
queued on it, and nothing advanced it. That is a fact rather than a guess, which is why the check
says nothing when the fake clock's queue is empty: an empty queue explains no timeout.

**The shape that reaches this with no timer in sight is an HTTP spec.** `setImmediate` is among the
globals `vi.useFakeTimers()` replaces by default, and Express ends a request that matched no route
through `finalhandler`, which schedules on `setImmediate`. The 404 is therefore never written, and a
routing mistake is reported as a test that took thirty seconds. In such a file, "the test hung"
means _the route did not match_.

One thing this cannot see through: a spec whose own `afterEach` calls `vi.useRealTimers()`. Hooks
run in reverse registration order, so a spec's own hook runs before the one `setupAutoSpy` installs,
and the clock is real again by the time the hint reads it. Nothing is reported then, rather than
something wrong.

## 13. The builder version that eats memory, named in the run

On by default, and silent unless the process is a worker of `@angular/build:unit-test` **and** the
installed `@angular/build` is in `[22.1.5, 22.1.7)`.

```ts
setupAutoSpy({ angularBuildHint: false }); // off
```

In that window the builder compiles the unit-test bundle with esbuild code splitting off, so every
spec is a self-contained bundle and `--coverage` grows by hundreds of megabytes with no plateau —
791 chunks / 596 MB on a 784-spec suite, until the OOM killer ends the run. The builder emits no
warning, and the two places that already say so — the
[`doctor` check](/utilities/cli#doctor-—-defects-that-never-fail) `angular-build-splitting-off` and the
[Angular page](/adapters/angular#when-the-unit-test-build-has-code-splitting-off) — both have to
be sought out. This one line is printed from inside the run where it hurts, to stderr, once per
worker: the builder runs Vitest with `isolate: false` and evaluates the setup file once, and the
notice keeps a flag on `globalThis` so a second evaluation says nothing.

The builder is recognised by the marker its own `vitest-mock-patch` setup file leaves on
`globalThis` (`Symbol.for('@angular/cli/vitest-mock-patch')`, set before any user setup file runs),
so a plain Vitest run never reads anything. Under the builder the version comes from the nearest
`node_modules/@angular/build/package.json` above the working directory — **the one place this
library reads the disk**: one file, read-only, through `process.getBuiltinModule` rather than a
static `node:fs` import so the `/setup` entry still loads where there is no `process`, and nothing
but the line depends on what it finds. On a Node without `getBuiltinModule` (before 20.16 / 22.3)
it stays silent rather than guessing.

## 14. Web Storage the runner never handed over

On by default, and — like the timer globals — it can only ever repair.

Vitest copies a DOM environment's globals onto `globalThis` behind one filter:

```js
if (k in global) return KEYS.includes(k);
```

`Storage` is in that `KEYS` list. `localStorage` and `sessionStorage` are not. For as long as Node
put neither on `globalThis`, the first half was false and both were copied over. Node's own Web
Storage made the key exist, so the filter now asks `KEYS`, `KEYS` says no, and the environment's
storage never arrives. The filter runs before any environment-specific code, so jsdom and happy-dom
break identically:

| Node  | `localStorage` under Vitest |
| ----- | --------------------------- |
| 24.19 | works                       |
| 25.9  | `setItem is not a function` |
| 26.7  | `undefined`                 |

A suite stays green with this broken, because only the specs that touch storage fail — which is why
it usually arrives as "CI moved to a new Node and eleven unrelated specs died".

The repair decides by using the storage, not by looking at it: it writes a namespaced key, reads it
back and removes it again. Node 25 offers a `setItem` that throws, Node 26 offers nothing, and the
next runtime is free to invent a third shape; a storage that survives a round trip works, whoever
implemented it. One that does not is replaced — with the window's own storage where that is a
separate object, and with a `Map`-backed stand-in otherwise.

```ts
import { restoreWebStorage } from 'vitest-auto-spy/setup';

restoreWebStorage(); // safe at any point, and as often as you like
restoreWebStorage({ view: null }); // "there is no window" — installs nothing
```

Two things it deliberately does not do. It installs nothing in a `node` environment, which is
supposed to have no Web Storage at all: handing the code under test an API the real runtime lacks
is a larger change than the one it was there to make. And it leaves a working storage exactly as it
is, so a spec's own stub survives it.

### A storage the spec installs itself — `stubWebStorage` {#stub-web-storage}

The other direction, and not part of `setupAutoSpy()`: a spec that wants a storage of its own — empty,
or seeded, and readable back as a plain record — installs one from `vitest-auto-spy/dom-stubs`
instead of writing a `TestingStorage` class per project.

```ts
import { stubWebStorage, type WebStorageStub } from 'vitest-auto-spy/dom-stubs';

let local: WebStorageStub;

beforeEach(() => {
  local = stubWebStorage('localStorage', { items: { token: 'abc' } }); // or 'sessionStorage'
});

it('forgets the token on logout', () => {
  session.logout();

  expect(local.snapshot()).toEqual({});
});
```

`getItem`, `setItem`, `removeItem`, `clear`, `key` and `length` behave as the platform's do,
keys and values coerced to strings and `key()`'s index converted the way an `unsigned long` is.
`snapshot()` is a copy, not a view. The storage goes on `globalThis` — and on `document.defaultView`
when that is a separate object — through `mockValueProp`, so `restoreMockedProps()` puts back whatever
was there, the repaired storage included; install it in `beforeEach`, like every other stub.

Where the two differ on purpose: the repair leaves a working storage alone and installs nothing in a
`node` environment, because it is guessing what the environment should have been; the stub replaces
whatever is there and installs in a `node` environment too, because the spec asked for it. What it
does not do: named-property access (`localStorage.token`, `Object.keys(localStorage)`) does not see
the items, no `storage` event fires, and there is no quota.

## 15. The key on `Object.prototype` that stops the run collecting

On by default, and the only check here whose absence makes a run report success over code it never
executed.

Vitest assembles a file's hooks in `mergeHooks`, which walks its hooks object with `for…in`. One own
enumerable key on `Object.prototype` therefore adds a key that is spread as if it were an array, and
it happens during **collect**:

```text
TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function
```

with no stack — `parseErrorStacktrace` filters frames through `stackIgnorePatterns`, which covers
`"/vitest/dist/"` and `/\/@vitest\/\w+\/dist\//`, and every frame of that error lives there. Under
`isolate: false` the key outlives the file that wrote it, so the casualties are that worker's whole
tail. In a 1759-file suite the report read `145 failed | 1613 passed` over `11880 passed | 0 failed`
— zero failing tests because those 145 files never ran — and the count wandered across 0, 75, 83,
122, 135, 145 and 155 on an unchanged tree, because a run whose writer happened to go last came out
green. Anything else that walks a plain object breaks the same way; `superagent`'s mime table
(`typeMap[type].map is not a function`) was the second place the same key surfaced.

```ts
setupAutoSpy(); // prototypePollution: 'throw' — pass 'warn' to sweep and report without failing
```

```text
[vitest-auto-spy] /src/app/purchase/purchase-open.service.spec.ts left "ngOnDestroy" on
Object.prototype as an own enumerable property. … **every spec file after this one in the same
worker fails to collect** … The key has been taken back off so the rest of the run survives.
```

The write is nearly always accidental. Code that decorates a class by patching
`Object.getPrototypeOf(instance)` is handed `Object.prototype` itself the moment `instance` is an
object literal from a `useValue` provider — or a test double:

```ts
const proto = Object.getPrototypeOf(instance); // Object.prototype, for a plain object
proto['ngOnDestroy'] = function () { … };      // now every object in the realm has it
```

Patch the prototype of the class the object came from, never the prototype of a plain object or of a
double. `Object.prototype`, `Array.prototype` and `Function.prototype` are compared before and after
every test; a key the environment already carried is left alone, so a project's own prototype
polyfill is not swept. `guardPrototypePollution(reaction)` is exported for a suite that wants the
check somewhere narrower.

A key added while the spec file is being _imported_ takes that file's own collect down before any
hook can run, and nothing inside the runner can report it — what the guard still does there is take
the key back off, so the report names one file instead of a hundred.

## 16. Console output nothing absorbed

Opt-in. Console output from a green test is either a defect the test never asserted on or noise that
buries the next real failure, and the runner does not tell the two apart: it attributes the line to
the test and moves on.

```ts
setupAutoSpy({ strayConsole: 'throw' });
```

Any call to a console method that writes, made during a test, that nothing absorbed fails **that
test** by name:

```text
[vitest-auto-spy] "CartService > reports a failed load" wrote to the console 1 time(s) and nothing absorbed it:
  - console.error: Error: load failed {"id":7}
      at CartService.load (src/app/cart.service.ts:41:15)
Absorb what the test expects: `installConsoleSpies()` from `vitest-auto-spy/console` in a `beforeEach`, …
```

The report quotes the method, the first three lines of what was written (200 characters each, five
calls, then `… and N more`) and the first stack frame outside `node_modules` — for a line a
dependency wrote, the direct caller instead, which names the package. Vitest reads that frame as the
error's location, so the code frame it prints points at the `console.error` itself.

**What counts.** `log`, `info`, `warn`, `error`, `debug`, `trace`, `table`, `dir`, `dirxml`,
`timeLog`, `timeEnd`, `count`; `group` / `groupCollapsed` only with a label; `assert` only when its
condition is falsy. `time`, `groupEnd` and `countReset` write nothing and are not watched.

**What absorbs.** The guard puts a recording wrapper _under_ whatever stands on `console`, so a call
is stray exactly when it reaches that wrapper:

| In the test                                                          | Result                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `installConsoleSpies()` from `vitest-auto-spy/console`, then asserts | absorbed — the spy never calls through                        |
| `vi.spyOn(console, 'error').mockImplementation(() => undefined)`     | absorbed                                                      |
| `vi.spyOn(console, 'error')` with no implementation                  | **stray** — it records the call, then calls through and prints |
| nothing                                                              | **stray**                                                     |

**Outside any test.** Output made while the file is being imported, in a `beforeAll` / `afterAll`,
from a callback that fired after its test had ended, or in a test whose `afterEach` never ran, fails
the **file** in `afterAll` with the same report — `… wrote to the console N time(s) outside any test
— while the file was being imported, …`. An import-time log from a third-party package is caught the
same way, attributed to whichever file triggered the import.

**Nothing a test installs outlives it.** Every console method a test replaced is put back after the
test; one a file replaced — in a `describe` body, a `beforeAll` or at the top of the module — after
the file. Under `isolate: false` that is what keeps one file's silence out of the next.

**The `/console` import installs nothing under the guard.** Without the guard, importing
`vitest-auto-spy/console` puts silent spies on the console. Under `isolate: false` that import runs
**once per worker**, so the spies went on in whichever file imported them first and stayed for every
later file of the worker — which is precisely the output the guard exists to see. So while the guard
is on, install them where they belong:

```ts
import { consoleErrorSpy, installConsoleSpies } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies()); // for each test — or call it at the top of the file, for the file

it('reports a failed load', () => {
  service.load();

  expect(consoleErrorSpy).toHaveBeenCalledWith('load failed', expect.any(Error));
});
```

Spies an import installed before the guard armed are taken off when it does. A file that imports a
spy without installing it gets the failure above plus one sentence naming the fix.

**The library's own warnings are console output too.** A `console.warn` from `injectSpy` or from a
`createSpyFromClass` configuration fails the test that caused it, so the guard turns every warning
into a failure; [`misconfiguration: 'throw'`](#misconfiguration-reports-that-fail-at-the-call) makes
the same reports throw at the call instead, which is the better stack.

**It changes nothing else.** The wrapper forwards every call unchanged, so Vitest's
`stdout | file > test` attribution, `onConsoleLog` and the output of a failing test all stay exactly
as they were — checked on Vitest 4.1 and 5.0, with the guard in a setup file and two spec files sharing one worker under `isolate: false`.

**`allow` is the last resort**, for environment noise no spec can reach — never for output the code
under test makes, which is a defect to fix or an assertion to write:

```ts
setupAutoSpy({ strayConsole: { allow: ['Download the React DevTools', /^Lit is in dev mode/] } });
```

A string matches as a substring, a `RegExp` is searched (its `g` / `y` flags make no difference). The
object form's `reaction` defaults to `'throw'`; `'warn'` prints the same report — through the console
for a test, to stderr for a file — without failing, which is how to measure a large suite before
turning it on. `guardStrayConsole(reaction)` is the same guard registered on its own.

What it does not see: output written to `process.stdout` / `process.stderr` directly, and jsdom's
own virtual console, which captured the real console before Vitest intercepted it — route jsdom's
`jsdomError` events to `console.error` if they should count. A rejection zone.js swallowed is printed
through `console.error`, so with `strayRejections` on it is reported twice over; the first failure
wins, and it is the rejection report.

## One grade for everything: `preset: 'strict'` {#one-grade-for-everything-preset-strict}

```ts
setupAutoSpy({ preset: 'strict' });
```

Starts every guard at its strictest grade. An option passed alongside it still wins, so
`{ preset: 'strict', guardGlobals: 'warn' }` relaxes exactly one.

| Option               | Under `preset: 'strict'`               | Default without it |
| -------------------- | -------------------------------------- | ------------------ |
| `duplicateCopies`    | `'throw'`                              | `'throw'`          |
| `propsOutsideHooks`  | `'throw'`                              | `'warn'`           |
| `guardGlobals`       | `'throw'`                              | `'off'`            |
| `prototypePollution` | `'throw'`                              | `'throw'`          |
| `strayConsole`       | `'throw'`                              | `'off'`            |
| `misconfiguration`   | `'throw'`                              | `'warn'`           |
| `strayTimers`        | `true`                                 | `false`            |
| `strayRejections`    | `true` when zone.js is loaded, else off | `false`            |

`strayRejections` is conditional because it throws where there is no zone.js to watch; the preset
checks for `Zone.__symbol__` instead.

Deliberately **not** in it, each for a reason:

- **`strict`** — strict doubles change what an unconfigured call _returns_; that is a decision about
  how a suite writes its doubles, not a grade for a report. The option name was already taken by it,
  which is why this one is `preset`.
- **`unconfiguredReads`** — the read side of `strict`, so the same decision: it asks every getter and
  stream a test touches to be configured, and on an existing suite it starts with a survey
  (`onUnstubbedRead`), not with a red run.
- **`blockNetwork`** — it changes what the code under test sees.
- **`restoreMocks`** — it also drops `vi.spyOn` stubs a suite installed in `beforeAll`.
- **Failing on stray timers** — the sweep runs in `afterAll`, so the failure lands on the file rather
  than a test, and a callback scheduled after the previous file's sweep is charged to the next one:
  the count can fail a file that scheduled nothing. `timers` names who really scheduled each, so it is
  one line to opt in once a suite has read them: `onStrayTimers: ({ timers }) => expect(timers).toEqual([])`.
- **`enableAngularDiagnostics()`** — it lives in `vitest-auto-spy/angular` and needs the TestBed
  environment first. Call it in the same setup file as the Angular half of strict: on a 1759-file
  Angular consumer it found real defects in 25 files and 324 tests, and cost nothing measurable
  (12.5 s against 13.4 s for the full run).

## Misconfiguration reports that fail at the call {#misconfiguration-reports-that-fail-at-the-call}

```ts
setupAutoSpy({ misconfiguration: 'throw' });
```

The library reports a misuse of its own API — a typo in `onlyMethodsToSpyOn`, `gettersToSpyOn` /
`settersToSpyOn` naming a method, a `returns` key no spy answers to (`then` and `constructor` on
`createAutoMock` included), `injectSpy` handed a real instance, a write to
`jasmine.DEFAULT_TIMEOUT_INTERVAL`, the deprecated `providedMethodNames`. By default each is a
`console.warn`, and several are printed once and then de-duplicated — which under `isolate: false`
meant the one file showing the line was whichever got there first. `'throw'` fails at the call site,
every occurrence, with the stack at the line that wrote the configuration.

The grade is process-wide — the core, `/angular` and `/setup` are separate bundles, so it lives on
`globalThis` — and it is released after the file that set it.

The printed grade changed too: `injectSpy`'s "the injector returned a plain instance" warning is now
de-duplicated per token **per spec file** rather than per worker, so the file that shows it no longer
depends on run order.

## The two buffers teardown drains

Two of the checks above keep what they find in a buffer until something takes it out, and both
buffers are unbounded.

- **The rejection captures.** `trackStrayRejections()` appends one entry per swallowed rejection,
  and each entry holds the reason itself — an `Error`, its stack, and through that the whole async
  closure chain that produced it.
- **The property journal.** `mockReadonlyProp` and its siblings append to
  `globalThis.__vitestAutoSpyPatchedProps__`, one entry per patch, each holding the object it
  patched and the descriptor it overwrote.

On the supported path neither grows: `setupAutoSpy()`'s `afterEach` drains both after every test —
`flushStrayRejections()` hands the array over and leaves it empty, `restoreMockedProps()` empties
the journal before it puts anything back. What accumulates for the worker's life is the hand-wired
half: a `trackStrayRejections()` read only through `countStrayRejections()`, or patches read only
through `countMockedProps()`. **A counter empties nothing.** Read through the flush, or let
`setupAutoSpy()` own the teardown and use the counters for the assertion they are there for.

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

| Option                | Default   | Notes                                                                           |
| --------------------- | --------- | ------------------------------------------------------------------------------- |
| `duplicateCopies`     | `'throw'` | `'warn'` to report without failing, `'off'` to skip the check                   |
| `restoreProps`        | `true`    | `restoreMockedProps()` in a global `afterEach`                                  |
| `propsOutsideHooks`   | `'warn'`  | Report a `mock*Prop` patch made outside a per-test hook — see below             |
| `restoreMocks`        | `false`   | `vi.restoreAllMocks()` in a global `afterEach` — turn on for `isolate: false`   |
| `strayTimers`         | `false`   | Track and cancel timeouts, intervals and frames that outlive their file         |
| `onStrayTimers`       | —         | Takes the per-file count and each stray's origin, instead of the stderr warning |
| `strayRejections`     | `false`   | Fail the test a rejection zone.js swallowed surfaced in — needs zone.js         |
| `blockNetwork`        | `false`   | Close every network channel the environment has — `true`, or a narrowing object |
| `guardGlobals`        | `'off'`   | Report a test that redefines a global property as non-configurable              |
| `prototypePollution`  | `'throw'` | Sweep and report an enumerable key a test left on a built-in prototype          |
| `strayConsole`        | `'off'`   | Fail a test (or file) that wrote to the console without absorbing it — section 16 |
| `misconfiguration`    | `'warn'`  | `'throw'` fails the library's own misuse reports at the call site               |
| `preset`              | —         | `'strict'` starts every guard at its strictest grade — see above                |
| `globalFakeTimers`    | `false`   | Fake timers for every test **and between them** — see below                     |
| `restoreTimerGlobals` | `true`    | Put back timer globals that uninstalling the fakes deleted                      |
| `restoreWebStorage`   | `true`    | Give the run a `localStorage` / `sessionStorage` that work — see section 14     |
| `pruneMockRegistry`   | `false`   | Keep @vitest/spy's ever-growing mock registry to the mocks that outlive a file  |
| `hookTimeoutHint`     | `true`    | Explain a hook that ran out of `hookTimeout` while `testTimeout` is larger      |
| `frozenClockHint`     | `true`    | Explain a timeout that happened because nothing advanced the fake clock         |
| `angularBuildHint`    | `true`    | Say once per worker that `@angular/build` builds the test bundle unsplit        |
| `strict`              | `false`   | Every double built afterwards throws on a method nobody configured              |
| `onUnstubbedCall`     | —         | The general form of `strict` — its return value becomes the call's result       |
| `unconfiguredReads`   | `'off'`   | Report a strict double's getter read, or stream subscribed to, that nothing configured |
| `onUnstubbedRead`     | —         | Takes those findings instead of the report, from every double — for a survey    |

`restoreMocks` is off by default because it also drops `vi.spyOn` stubs a suite installed in
`beforeAll`; it is the knob to reach for when the run shares one environment across files.

```ts
setupAutoSpy({ restoreMocks: true, duplicateCopies: 'warn' });
```

## A patch put in the wrong hook stops applying

```ts
describe('modal', () => {
  const modal = new Modal();

  mockValueProp(modal, 'onClose', () => 'patched'); // ← runs once, at collection

  it('one', () => expect(modal.onClose()).toBe('patched')); // ✅
  it('two', () => expect(modal.onClose()).toBe('patched')); // ❌ 'real'
});
```

`restoreProps` undoes a `mock*Prop` patch after the test **during which it was applied**, whenever
it was created. A patch written in a `describe` body — or in `beforeAll` — therefore survives exactly
one test, and nothing puts it back. The first test passes, every test after it reads the real member,
and the failure lands as `… is not a function` nowhere near the line that caused it. Found in six
files of one suite at once, during a bulk move onto `mockValueProp`.

The repair is one line: move the call into `beforeEach`, where a patch every test needs belongs.

`setupAutoSpy` now says so rather than leaving it to be found by debugging. `propsOutsideHooks`
grades the report — `'warn'` by default, `'throw'` for a suite that would rather fail on the first
test, `'off'` to decide that its `beforeAll` patches are its own business:

```ts
setupAutoSpy({ propsOutsideHooks: 'throw' });
```

For a suite that wires its own hooks rather than calling `setupAutoSpy`, `reportPropsOutsideHooks(reaction)`
sets the same dial directly; the reaction type is exported as `OutsideHookReaction`.

It fires once per object and property in each spec file, so a `describe`-body patch is named once
rather than once per test. Per file rather than per worker: under `isolate: false` a worker-wide record
named a patch of a shared object only in whichever file happened to run first. It is keyed by the
object rather than by the name, because two files of one worker routinely patch a member of the same
name on different objects, and a name-keyed report would name the first and silence the second.

**Why the patch is not simply re-applied**, which is the fix this looks like it should have.
`restoreMockedProps()` exists so a patch does not outlive its file; a patch that put itself back on
every test would defeat exactly that under `isolate: false`, where "the file this patch belongs to"
is not something the journal can observe. The silence is what gets removed here, not the rule.

This is the second helper of the pair — the first was `restoreMocks: true` taking accessor spies off
a double built anywhere but a `beforeEach`. That one was fixed rather than reported, because there
was nothing legitimate a spec could have meant by it; this one has a legitimate reading and a
one-line repair, so it is reported.

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

Pass a config object rather than `true` when the run drives a real HTTP handler: the default
`toFake` includes `setImmediate`, which is how an Express `404` becomes a 30-second timeout that
names nothing — see [taking `setImmediate` out of `toFake`](./fake-timers#taking-setimmediate-out-of-tofake).

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

## The setup file that gets its own copy of Angular

A setup file that calls `initTestEnvironment` — directly, or through whichever preset a workspace
inherited — runs before any spec, and therefore before the library is imported. Where the two halves
of the run resolve `@angular/core` differently, that ordering is enough to leave two copies of
Angular in the process: the platform, the environment and the `TestBed` the setup file built belong
to one of them, and every spec builds on the other.

What surfaces says nothing about copies. One half of it is this:

```text
No mock adapter registered. Import a runtime entry once before creating spies — …
```

The registry is module state of `vitest-auto-spy`, and importing an entry is what writes to it, so a
run holding two copies of the library can hand a spec the copy nobody imported.

The other half is a `TestBed` that behaves like a stranger — `configureTestingModule` accepted and
the component still resolving the real service, an `overrideProvider` that never applies, `NG0203`
from an injection context that looks perfectly ordinary. A second `TestBed` with an injector of its
own explains all three, and none of them says so.

The repair is in the runner config, not in a spec:

```ts
// vitest.config.ts
export default defineConfig({
  resolve: {
    dedupe: ['@angular/core', '@angular/common', '@angular/platform-browser', '@angular/compiler', 'rxjs'],
  },
  test: {
    server: { deps: { inline: ['vitest-auto-spy'] } },
  },
});
```

`dedupe` makes every importer resolve those packages to one file, whichever nested `node_modules`
directory it happens to sit under. Inlining the library sends it through the same transform pipeline
the specs go through instead of leaving it externalised to Node, so the copy the setup file loads and
the copy a spec loads are one module instance — one registry, one set of spies. `rxjs` earns its
place on that list for the same reason the Angular packages do: an `Observable` from one copy fails
the other's `instanceof`, which is a different failure with the same cause.

`test.server.deps.inline` is where that key lives from Vitest 1 onwards — checked here against the
5.0 typings; the top-level `test.deps.inline` that older answers still show moved there and is gone.

Reach for the duplicate-copy report in section 2 first. Two installs, or one install loaded as both
ESM and CommonJS, are the commoner causes, and neither of them needs `dedupe` — the report names
both copies, and this section is what to do when the paths it prints are the same package resolved
twice.
