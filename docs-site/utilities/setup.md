---
title: Test-run hygiene
description: setupAutoSpy() in your Vitest setup file puts back what a test leaves behind - patched properties, timers, listeners, globals - and names the test that left it.
---

# Test-run hygiene

`setupAutoSpy()` is one call in your Vitest setup file. It cleans up what a test leaves behind and
names the test that left it. You need it most when spec files share one environment
(`isolate: false`): there, a leftover from one file breaks a different file.

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy();
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    // isolate: false, // if your spec files share one environment
  },
});
```

With the Angular `@angular/build:unit-test` builder, list the file under the test target's
`options.setupFiles` in `angular.json` instead. `/setup` is for Vitest only: `bun:test`, `node:test`
and Rstest have no setup entry to host it.

## Common setups

Start with the defaults. They only repair or report, and never change what your code sees.

```ts
setupAutoSpy();
```

If your spec files share one environment (`isolate: false`), also clean up between files. This
cleans up quietly; add `onStrayTimers: 'throw'` and similar options to fail the file instead.
`restoreMocks` also removes `vi.spyOn` stubs made in `beforeAll`, so make those in `beforeEach`.

```ts
setupAutoSpy({ restoreMocks: true, strayTimers: true, strayListeners: true, restoreGlobals: true });
```

To turn every guard to its strictest grade at once, use the preset:

```ts
setupAutoSpy({ preset: 'strict' });
```

An option you pass in the same object as the preset wins over it. See
[`preset: 'strict'`](#one-grade-for-everything-preset-strict).

## Options

Every option is optional. "Grade" options take `'throw'` (fail), `'warn'` (report only) or `'off'`.

| Option                                                                                 | Type                            | Default   | What it does                                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------- | --------- | --------------------------------------------------------------------------------- |
| [`restoreProps`](#_1-restoring-patched-properties)                                     | `boolean`                       | `true`    | Undoes `mock*Prop` patches after each test                                        |
| [`propsOutsideHooks`](#a-patch-put-in-the-wrong-hook-stops-applying)                   | grade                           | `'warn'`  | Reports a `mock*Prop` patch made outside `beforeEach`                             |
| [`duplicateCopies`](#_2-one-copy-of-the-library-in-the-process)                        | grade                           | `'throw'` | Fails the run when two copies of the library are loaded                           |
| [`restoreMocks`](#_3-draining-the-runner-s-restore-registry)                           | `boolean`                       | `false`   | Calls `vi.restoreAllMocks()` after each test                                      |
| [`strayTimers`](#_4-cancelling-timers-that-outlive-their-file)                         | `boolean` \| `{ ignore }`       | `false`   | Cancels timeouts, intervals and frames a file left running                        |
| [`onStrayTimers`](#_4-cancelling-timers-that-outlive-their-file)                       | `'throw'` \| function           | —         | Fails or reports the file that left timers                                        |
| [`blockNetwork`](#_5-keeping-the-run-off-the-network)                                  | `boolean` \| object             | `false`   | Makes `fetch`, `XMLHttpRequest` and `sendBeacon` fail instead of going out        |
| [`restoreTimerGlobals`](#_6-putting-back-timer-globals-the-fakes-took-with-them)       | `boolean`                       | `true`    | Puts back timer globals that removing fake timers deleted                         |
| [`guardGlobals`](#_7-naming-the-file-that-sealed-a-global)                             | grade                           | `'off'`   | Reports a test that made a global property non-configurable                       |
| [`strayRejections`](#_8-failing-on-a-rejection-zone-js-swallowed)                      | `boolean`                       | `false`   | Fails the test in which zone.js swallowed a rejected promise                      |
| [`pruneMockRegistry`](#_9-pruning-the-mock-registry-nothing-empties)                   | `boolean`                       | `false`   | Stops Vitest's list of all mocks from growing for the whole run                   |
| [`strict`](#_10-strict-doubles-for-the-whole-suite)                                    | `boolean` \| `'survey'`         | `false`   | A method nobody configured throws instead of returning `undefined`                |
| [`onUnstubbedCall`](#_10-strict-doubles-for-the-whole-suite)                           | function                        | —         | Runs on a call nobody configured; its return value becomes the result             |
| [`swallowedStrictCalls`](/core/strict-mode)                                            | grade                           | see link  | Fails a test whose strict throw was caught before the test saw it                 |
| [`unconfiguredReads`](#_10-strict-doubles-for-the-whole-suite)                         | grade                           | `'off'`   | Reports getters and streams of a strict spy that nothing configured               |
| [`onUnstubbedRead`](#_10-strict-doubles-for-the-whole-suite)                           | function                        | —         | Receives those findings instead of the report                                     |
| [`hookTimeoutHint`](#_11-the-hook-budget-jest-had-only-one-of)                         | `boolean`                       | `true`    | Explains a hook timeout caused by `hookTimeout` being smaller than `testTimeout`  |
| [`frozenClockHint`](#_12-a-timeout-the-clock-explains-not-the-code)                    | `boolean`                       | `true`    | Explains a timeout caused by a fake clock nobody advanced                         |
| [`angularBuildHint`](#_13-the-builder-version-that-eats-memory-named-in-the-run)       | `boolean`                       | `true`    | Warns about the `@angular/build` versions that build tests without code splitting |
| [`restoreWebStorage`](#_14-web-storage-the-runner-never-handed-over)                   | `boolean`                       | `true`    | Gives the run a working `localStorage` and `sessionStorage`                       |
| [`prototypePollution`](#_15-the-key-on-object-prototype-that-stops-the-run-collecting) | grade                           | `'throw'` | Removes and reports a key a test left on `Object.prototype`                       |
| [`strayConsole`](#_16-console-output-nothing-absorbed)                                 | grade \| `{ reaction, allow }`  | `'off'`   | Fails a test that wrote to the console without a spy to absorb it                 |
| [`resetConsoleSpies`](./console)                                                       | `boolean`                       | `true`    | Clears the `vitest-auto-spy/console` spies after each test                        |
| [`documentPollution`](#_17-an-attribute-left-on-the-shared-document)                   | grade \| object                 | `'off'`   | Puts back and reports attributes a test left on `<html>`, `<head>`, `<body>`      |
| [`restoreStorageSpies`](#_18-a-spy-on-storage-the-runner-cannot-take-off)              | `boolean`                       | `true`    | Takes spies off Web Storage methods where `mockRestore()` cannot                  |
| [`strayListeners`](#_19-listeners-that-outlive-their-file)                             | `boolean`                       | `false`   | Removes `window` and `document` listeners a file left behind                      |
| [`onStrayListeners`](#_19-listeners-that-outlive-their-file)                           | `'throw'` \| function           | —         | Fails or reports the file that left listeners                                     |
| [`restoreGlobals`](#_20-globals-put-back-at-the-file-boundary)                         | `boolean`                       | `false`   | Puts every changed global back at the end of each file                            |
| [`cleanTestBed`](#_21-a-testbed-left-dirty-at-file-end)                                | grade                           | `'warn'`  | Resets an Angular `TestBed` a file left dirty                                     |
| [`misconfiguration`](#misconfiguration-reports-that-fail-at-the-call)                  | `'warn'` \| `'throw'`           | `'warn'`  | Makes the library's own misuse warnings throw at the call                         |
| [`globalFakeTimers`](#fake-timers-for-the-whole-run)                                   | `boolean` \| fake-timers config | `false`   | Fake timers for every test and between tests                                      |
| [`preset`](#one-grade-for-everything-preset-strict)                                    | `'strict'`                      | —         | Starts every guard at its strictest grade                                         |

`swallowedStrictCalls` defaults to `'throw'` with `strict: true` or `preset: 'strict'`, and to
`'off'` otherwise.

```ts
setupAutoSpy({ restoreMocks: true, duplicateCopies: 'warn' });
```

## 1. Restoring patched properties

On by default (`restoreProps`). After each test, every property that
[`mockReadonlyProp` / `mockValueProp`](../adapters/angular#signal-readonly-property-mocking) patched
goes back to its original value. `vi.restoreAllMocks()` does not do this: it knows about spies,
not about patched properties.

The cleanup also runs if a spec's own `afterEach` throws first. In that case you get a warning that
names the test, the number of patches put back and the hook that threw.

To assert that no patch is left, use `countMockedProps()`:

```ts
import { countMockedProps } from 'vitest-auto-spy/setup';

afterEach(() => expect(countMockedProps()).toBe(0));
```

**Common mistake:** a patch written in a `describe` body or `beforeAll` applies to the first test
only. See [A patch put in the wrong hook stops applying](#a-patch-put-in-the-wrong-hook-stops-applying).

Why it also needs a safety net after `afterEach`: [In depth](#restoring-properties-when-a-hook-throws).

## 2. One copy of the library in the process

On by default (`duplicateCopies: 'throw'`). If two copies of `vitest-auto-spy` are loaded, the run
fails with a report that names both copies and how to fix each cause.

Two copies keep two sets of console spies and two registries. The symptom is "tests fail depending
on file order". The usual causes are a second install, or one install loaded both as ESM and as
CommonJS.

```ts
import { describeDuplicateCopies, getPackageCopies } from 'vitest-auto-spy/setup';

getPackageCopies(); // the registered copies, for your own reporting
describeDuplicateCopies(); // the readable report, or undefined when there is only one copy
```

Both functions are also exported from the main `vitest-auto-spy` entry. Use `'warn'` to report
without failing, or `'off'` to skip the check.

## 3. Draining the runner's restore registry

Off by default (`restoreMocks: false`). When on, it calls `vi.restoreAllMocks()` after each test.

Every `vi.spyOn` adds an entry that only `vi.restoreAllMocks()` removes. With a shared environment
(`isolate: false`) that list grows for the whole run. Turn this on in that case.

```ts
setupAutoSpy({ restoreMocks: true });
```

**Common mistake:** it also removes `vi.spyOn` stubs you installed in `beforeAll`. That is why it is
off by default.

### Clear, reset and restore applied to an auto-spy

Vitest's `clearMocks`, `mockReset` and `restoreMocks` config flags affect a spy built by this
library (an auto-spy) exactly as they affect a `vi.fn()`. This holds whichever spy engine you use.

| Config flag    | Default               | Recorded calls | `mockReturnValue` / `mockImplementation`      | `calledWith(…)` rules | `vi.spyOn` on a real object        |
| -------------- | --------------------- | -------------- | --------------------------------------------- | --------------------- | ---------------------------------- |
| `clearMocks`   | `true` since Vitest 5 | emptied        | kept                                          | kept                  | calls emptied, stays installed     |
| `mockReset`    | `false`               | emptied        | dropped; a method or getter returns undefined | kept                  | real implementation answers again  |
| `restoreMocks` | `false`               | untouched      | untouched                                     | untouched             | taken off, the real member is back |

What this means for you:

- **`clearMocks`** is on by default on Vitest 5. It empties recorded calls and keeps the setup.
- **`mockReset`** runs before each test. It wipes any setup you made in `beforeAll` or a `describe`
  body, so that spy returns `undefined`. Build spies in `beforeEach`. `calledWith(…)` rules survive;
  [`resetAutoSpy(spy)`](/core/control-helpers#resetting-spies-—-clearautospy-resetautospy) drops
  them too.
- **`restoreMocks`** never touches an auto-spy. It only undoes `vi.spyOn` on real objects.

A spy built in `beforeEach` needs none of the three: the next test builds a fresh one.
`setupAutoSpy()` does not clear or reset spies on its own. For a spy that lives longer than one test,
use [`resetAutoSpy` and `clearAutoSpy`](/core/control-helpers#resetting-spies-—-clearautospy-resetautospy).

### Switching the engine for one file

You need this only if you switch spy engines. `setSpyEngine(...)` changes the engine for the whole
worker, not only your file. It returns an
undo function. Under `isolate: false`, switch in `beforeAll` and undo in `afterAll`:

```ts
import { setSpyEngine } from 'vitest-auto-spy/setup';

let undo: () => void;

beforeAll(() => {
  undo = setSpyEngine('runner');
});
afterAll(() => undo());
```

In a setup file you can ignore the return value.
`beforeEach(() => setSpyEngine('runner'))` also works: Vitest treats the returned undo as the hook's
teardown and runs it after each test. What the engines are:
[The spy engine](/core/performance#the-spy-engine).

## 4. Cancelling timers that outlive their file

Off by default (`strayTimers: false`). When on, every `setTimeout`, `setInterval` and
`requestAnimationFrame` callback still pending at the end of a file is cancelled. It matters only
with `isolate: false`. There, a timer from one file fires while a different file is running, and the
runner blames the wrong file.

```ts
setupAutoSpy({ strayTimers: true, onStrayTimers: 'throw' });
```

With `onStrayTimers: 'throw'`, the file fails and the report names each timer:

```text
[vitest-auto-spy] src/app/cart.component.spec.ts left 1 timer pending when it ended:
  - setTimeout 5000 ms, scheduled in "CartComponent > polls" at src/app/cart.component.spec.ts:14:5
It was cancelled so it cannot fire in the next file. Clear it in the test that scheduled it — clearTimeout, unsubscribe, fixture.destroy() — or run it out with fake timers before the test ends.
```

| Option          | Type                                            | Default | Meaning                                                   |
| --------------- | ----------------------------------------------- | ------- | --------------------------------------------------------- |
| `strayTimers`   | `boolean` \| `{ ignore: (string \| RegExp)[] }` | `false` | Turns the sweep on; `ignore` leaves matching timers alone |
| `onStrayTimers` | `'throw'` \| `(report) => void`                 | —       | Called once per file, only when something was cancelled   |

Without `onStrayTimers`, the sweep cancels quietly.

A timer scheduled after one file ended counts against the next file. So the file that fails is not
always the one that scheduled the timer; each timer's `file` field names the real owner.

The handler receives `{ cancelled, timers }`. Each entry in `timers` has:

- `kind` and `delay` of the timer;
- `file`: the spec file that was running when it was scheduled;
- `test` (as `suite > test`), or `outsideTest: 'import' | 'hook'` when no test was running;
- `frames`: up to five lines of the stack trace, showing where the timer was scheduled. Lines from
  your own code come first. Lines from `node_modules` appear only when there is nothing else. Lines
  from this library never appear.

```ts
setupAutoSpy({ strayTimers: true, onStrayTimers: ({ cancelled }) => expect(cancelled).toBe(0) });

setupAutoSpy({
  strayTimers: true,
  onStrayTimers: ({ timers }) => expect(timers).toEqual([]), // the diff names file and frames
});
```

If your handler prints its own message, print `kind`, `delay`, `test` and `frames[0]`.

The pieces work without `setupAutoSpy` too. Each takes an optional host: an object with timer
functions to use instead of the real globals, for example in a test of your own:

```ts
import { cancelStrayTimers, countStrayTimers, trackStrayTimers } from 'vitest-auto-spy/setup';

const stop = trackStrayTimers(); // safe to call twice; stop() ends tracking and cancels what is left
afterEach(() => expect(countStrayTimers()).toBe(0));
afterAll(() => {
  const cancelled = cancelStrayTimers(); // how many had to be cancelled

  if (cancelled > 0) {
    process.stdout.write(`${cancelled} timer(s) outlived this file\n`);
  }
});
```

`describeStrayTimers()` returns the same list as `timers`, for a suite that sweeps by hand.

Setup work that schedules timers (for example, writing to jsdom's `localStorage`) can be excluded
from the count:

```ts
import { withoutStrayTimerTracking } from 'vitest-auto-spy/setup';

withoutStrayTimerTracking(() => seedStorage()); // what this schedules is neither counted nor cancelled
```

::: warning It cannot see a timer created under fake timers
`vi.useFakeTimers()` puts its own `setTimeout` over the tracking, so nothing the fake clock schedules
is counted. `expect(countStrayTimers()).toBe(0)` proves nothing in a file on a frozen clock,
including with `globalFakeTimers: true`. For the fake clock's own queue, use `vi.getTimerCount()`.
:::

**Common mistake:** expecting it to help with `isolate: true`. Each file then gets a fresh
environment anyway, so there is nothing to sweep.

How the tracker reads a cancelled timer, and what tracking costs:
[In depth](#stray-timers-in-depth).

### Timers a dependency owns

Some libraries keep timers on purpose. Timers scheduled by undici (the HTTP client behind Node's
`fetch()`, bundled or as the `undici` package) are never counted, reported or cancelled. A callback
that undici calls on your behalf, such as a `MockAgent` reply handler, is your code: timers it
schedules still count.

For another library's housekeeping timers, list them in `ignore`:

```ts
setupAutoSpy({ strayTimers: { ignore: [/some-sdk[/\\]poll/, 'heartbeat.js'] }, onStrayTimers: 'throw' });

trackStrayTimers(undefined, { ignore: [/some-sdk[/\\]poll/] }); // the same without setupAutoSpy
```

Each entry is a substring or a RegExp. It is searched in the stack of the call that scheduled the
timer. An ignored timer is not cancelled either: its owner still needs it. Each call to
`trackStrayTimers` (or `setupAutoSpy`) replaces the `ignore` list. If two setup files set it, the one
that runs last wins.

### An Observable error nothing handled

When a stream errors and no subscriber handles it, rxjs rethrows the error from a `setTimeout`. That
fails no test. With `strayTimers` on, the library runs that rethrow in `afterEach` and fails the test
that caused it:

```text
[vitest-auto-spy] Unhandled Observable error in "TokenSetupScreen > saves the token":
  - HttpErrorResponse: Http failure response for /api/token: 502 Bad Gateway
rxjs rethrows an error no subscriber handles from a setTimeout, where it fails no test; it was rethrown now instead. …
```

The original error is the failure's `cause`, so you also see its stack. An error scheduled outside a
test fails the file at the end instead. The check also works under fake timers while they are
installed, including `globalFakeTimers`. An error that `config.onUnhandledError` handles is not
reported.

If a test leaves an error unhandled on purpose, assert it with `expectUnhandledObservableErrors`:

```ts
import { HttpErrorResponse } from '@angular/common/http';
import { expectUnhandledObservableErrors } from 'vitest-auto-spy/setup';

it('gives up after the last retry', () => {
  service.refresh(); // the stream errors with a 502 and nothing handles it

  expectUnhandledObservableErrors([{ message: /502/ }]);
});
```

Each list entry matches one error, in order. An entry can be:

- the error itself (same name and message);
- a class, such as `TypeError`, your `ApiError` or Angular's `HttpErrorResponse` (it does not have to
  extend `Error`);
- `{ message }` with a string or a RegExp.

A missing, extra or out-of-order error fails the test and shows both lists. The flushed entries are
returned. Call it with no argument to assert that nothing was left.

```ts
expectUnhandledObservableErrors([HttpErrorResponse]);
expectUnhandledObservableErrors([{ message: /Http failure response.*502/ }]);
```

`flushUnhandledObservableErrors()` does the same flush without comparing. It returns
`{ error, test }` for each error, or `{ error, outsideTest }` for one scheduled outside a test. To
check only the errors, use `toMatchObject`:

```ts
expect(flushUnhandledObservableErrors()).toMatchObject([{ error: new Error('502') }]);
```

**Common mistake:** a spec whose own `afterEach` calls `vi.useRealTimers()` throws the pending fake
timer away before the check runs, so nothing is reported.

### With Vitest 4.1's `--detect-async-leaks`

::: warning The two cancel each other out
Vitest's leak detector checks for leftover timers after the file ends. `strayTimers` has already
cancelled them by then, so Vitest reports no leaks.
:::

The sweep still cancels, because a timer firing in another file is the worse failure. To make up
for it, when both are on and you set no `onStrayTimers`, the sweep prints its own report to stderr: the file, the count, the first three timers with their tests.
It ends with a sentence saying these timers are missing from Vitest's "Async Leaks" report. An
`onStrayTimers` handler receives all of them.

With `strayTimers` off, Vitest's own report points at the `setTimeout` in your spec, not at library
code:

```
⎯⎯⎯⎯⎯⎯⎯ Async Leaks 1 ⎯⎯⎯⎯⎯⎯⎯⎯

Timeout leaking in src/app/cart.component.spec.ts
  12|   it('polls', () => {
  13|     component.startPolling();
  14|     setTimeout(() => refresh(), 60_000);
     |     ^
```

The report goes to stderr rather than `console.warn` because Vitest drops console output that
arrives after the file's last test.

## 5. Keeping the run off the network

Off by default (`blockNetwork: false`). When on, `fetch` rejects, `XMLHttpRequest` fails and
`navigator.sendBeacon` returns `false`. Nothing leaves the machine, and each refusal names the
request and the test that made it.

```ts
setupAutoSpy({ blockNetwork: true });
```

```text
[vitest-auto-spy] fetch is stubbed in unit tests — GET https://cdn.example.test/sprite.svg. The test "icons > loads the sprite" requested it, and blockNetwork() refused it: unit tests stay off the network. Answer it in this test: vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ body: … })).
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_5-keeping-the-run-off-the-network
```

A `fetch` your spec stubs itself is not blocked.

Turn it on so tests never reach the network. It matters most when a green run still fails with a
non-zero exit code. That happens under happy-dom, which implements `fetch`: a component quietly
loads icons or polls an endpoint, and Vitest aborts those requests at teardown. The aborts arrive as
unhandled errors after the summary, with no test named:

```text
 Test Files  260 passed (260)
      Tests  2257 passed (2257)

Vitest caught 8 unhandled errors during the test run.
DOMException [AbortError]: The operation was aborted.
```

It helps under jsdom too, which implements `XMLHttpRequest` in full.

The object form narrows what is blocked:

| Option   | Type                               | Default    | Meaning                                                              |
| -------- | ---------------------------------- | ---------- | -------------------------------------------------------------------- |
| `fetch`  | `boolean`                          | `true`     | `fetch` rejects, naming what was requested                           |
| `xhr`    | `'reject'` \| `'empty'` \| `false` | `'reject'` | How a blocked `XMLHttpRequest` is answered; `false` leaves it alone  |
| `beacon` | `boolean`                          | `true`     | `navigator.sendBeacon` returns `false`, where the environment has it |

- `'reject'` fails the request like an unreachable host: `readyState` 4, `status` 0, an `error`
  event, and the marker on `statusText`.
- `'empty'` answers every blocked `XMLHttpRequest` with status 200 and an empty body. Use it when
  the only XHR traffic is requests nobody reads, like tracker pings.

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } }); // tracker pings, answered and silent
```

A blocked `XMLHttpRequest` puts this on `statusText`:
`[vitest-auto-spy] XMLHttpRequest is stubbed in unit tests — GET <url> blocked. Stub it in this test, or blockNetwork({ xhr: 'empty' }) if nothing reads the reply.`

To match these errors in a spec or a reporter, use the exported markers. The text after the marker
may change between releases; the marker does not.

```ts
import { BLOCKED_FETCH_MESSAGE, BLOCKED_XHR_MESSAGE } from 'vitest-auto-spy/setup';

await expect(fetch('https://api.example.test/cart')).rejects.toThrow(BLOCKED_FETCH_MESSAGE);

const xhr = new XMLHttpRequest();
xhr.open('GET', 'https://api.example.test/cart');
xhr.send();
await vi.waitFor(() => expect(xhr.statusText).toContain(BLOCKED_XHR_MESSAGE));
```

`BLOCKED_FETCH_MESSAGE` is `'[vitest-auto-spy] fetch is stubbed in unit tests'`, and
`BLOCKED_XHR_MESSAGE` is `'[vitest-auto-spy] XMLHttpRequest is stubbed in unit tests'`.

What else to know:

- The block is installed before each test and removed after it. A spec can still stub `fetch`
  itself, for example with `vi.spyOn(globalThis, 'fetch')`; a stubbed call never reaches the block.
  Stub it in `beforeEach` or in the test: the block is installed after `beforeAll` and would replace
  a stub made there.
- `blockNetwork()` is exported, for a suite that wants it somewhere narrower.
- If `blockNetwork` is called twice, the latest call's mode applies. The `blockNetwork` option of
  `setupAutoSpy` counts as a call. So a spec that calls `blockNetwork({ xhr: 'reject' })` gets
  `'reject'`, even when the setup file asked for `'empty'`.
- Only `data:` URLs pass. A relative URL like `/config` is blocked too, because the DOM resolves it
  against the page's origin.
- `WebSocket` and `EventSource` are not blocked. Use
  [`stubConstructor`](/utilities/constructor-doubles) for those.

**Common mistake:** returning a hand-built `{ ok: true, json: async () => data } as Response` from a
`fetch` stub. Use [`stubResponse`](#answering-a-stubbed-fetch-—-stubresponse) instead.

### Answering a stubbed `fetch` — `stubResponse`

`stubResponse(init)` builds a real `Response` for a `fetch` stub, with no cast.

```ts
import { stubResponse } from 'vitest-auto-spy/setup';

vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ body: { id: 1, name: 'Ada' } }));
vi.spyOn(globalThis, 'fetch').mockResolvedValue(stubResponse({ ok: false, status: 404 }));
```

| Field        | Default                          | Meaning                                                                                   |
| ------------ | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `body`       | no body                          | object, array, number, boolean or `null` becomes JSON with `application/json`; else as is |
| `status`     | `200`, or `500` when `ok: false` | the status; one the platform refuses (`0`, `600`) throws the platform's error             |
| `ok`         | derived from `status`            | shorthand for the status class; an `ok` that disagrees with `status` throws               |
| `statusText` | `''`                             | as given                                                                                  |
| `headers`    | —                                | any `HeadersInit`; a `content-type` here wins over the JSON one                           |
| `url`        | `''`                             | what `response.url` returns; Angular's fetch backend reports it as the request URL        |

Body rules:

- A string is sent as is, not as a JSON string.
- `null` is JSON `null`. `undefined`, or no `body` at all, means "no body".
- `Blob`, `ArrayBuffer`, typed arrays, `FormData`, `URLSearchParams` and `ReadableStream` go to the
  constructor untouched. Under jsdom, pass a string or bytes instead of `Blob` or `FormData`: Node's
  `Response` cannot read jsdom's versions of them.
- `{ body: null, status: 204 }` throws: a 204, 205 or 304 carries no body.

```ts
await stubResponse({ body: null }).json(); // → null, content type application/json
await stubResponse({ body: undefined }).text(); // → '', no content type, .json() rejects
await stubResponse({}).text(); // → the same: an omitted body is no body
```

**Common mistake:** `stubResponse({ ok: true })` for a JSON body `{ ok: true }`. `ok` is a field of
`stubResponse` and sets the status; the JSON goes in `body`: `stubResponse({ body: { ok: true } })`.

**Common mistake:** `mockResolvedValue(stubResponse(…))` returns the same object on every call, and
a body can be read only once. The second `response.json()` rejects with "Body is unusable". Build
one response per call:

```ts
vi.spyOn(globalThis, 'fetch').mockImplementation(async () => stubResponse({ body: user }));
```

It works wherever there is a global `Response`: Node, jsdom (which uses Node's), happy-dom, Bun and
`node:test`. Elsewhere it throws a `TypeError` that names the missing constructor. Each of its errors
ends with the fix and links this section.

### Next to MSW

`blockNetwork` works next to [MSW](https://mswjs.io)'s `setupServer()`. While an interceptor from
`@mswjs/interceptors` holds `fetch` (MSW's `setupServer()`, or nock 14), `blockNetwork` leaves
`fetch` alone. After `server.close()`, it blocks `fetch` again.

| Request                              | Handled by MSW | Not handled by MSW                 |
| ------------------------------------ | -------------- | ---------------------------------- |
| `fetch`, `HttpClient` (fetch)        | MSW's response | MSW's `onUnhandledRequest` decides |
| `XMLHttpRequest`, `HttpClient` (XHR) | MSW's response | blocked, naming the URL            |

So under MSW, MSW decides what happens to an unhandled `fetch`. `onUnhandledRequest: 'error'` is
not enough on its own: it lets through every URL that looks like a static asset (`.svg`, `.png`,
fonts, `.css`, `.js`, `.json`). Register a catch-all handler last:

```ts
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

export const server = setupServer(
  ...handlers,
  http.all('*', () => HttpResponse.error()), // anything the handlers above miss fails, offline
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`server.use(…)` in a spec adds handlers in front, so the catch-all stays last. `resetHandlers()`
keeps it, because it was passed to `setupServer`. Keep `blockNetwork: true` as well: it covers
`sendBeacon` and files that never start the server.

## 6. Putting back timer globals the fakes took with them

On by default (`restoreTimerGlobals`). After each test, it puts back any timer global (such as
`Date`) that removing fake timers deleted. It never overwrites a value a spec set on purpose.

Under a DOM environment, `vi.useRealTimers()` can delete a global instead of restoring it. In
happy-dom, it deletes `Date`. With `isolate: false`, the next file then fails inside Vitest's own
`useFakeTimers`:

```text
TypeError: Cannot read properties of undefined (reading 'now')
 ❯ hijackMethod node_modules/@sinonjs/fake-timers/src/fake-timers-src.js
 ❯ Object.useFakeTimers node_modules/vitest/dist/chunks/vi.js
 ❯ src/app/billing/invoice.component.spec.ts:24:6
```

The file in that stack is simply the one that ran next.

```ts
import { getWatchedTimerGlobals, restoreTimerGlobals } from 'vitest-auto-spy/setup';

restoreTimerGlobals(); // safe at any point, as often as you like
getWatchedTimerGlobals(); // the names captured in this environment
```

The real globals are captured when the library is first imported, before any spec can install
fakes. [`setupFakeTimers()`](./fake-timers) runs the same repair in its own `afterEach`, with or
without `setupAutoSpy()`.

## 7. Naming the file that sealed a global

Off by default (`guardGlobals: 'off'`). When on, it reports a test that adds a property to a global
object that nothing can remove afterwards.

`Object.defineProperty(document, 'cookie', { value, writable: true })` is a common way to stub a
browser global. It makes the property non-configurable, because `configurable` defaults to `false`.
Under `isolate: false`, every later file in that worker inherits it, and nothing points back at the
file that did it.

```ts
setupAutoSpy({ guardGlobals: 'throw' }); // or 'warn' while you clean up a large suite
```

```text
[vitest-auto-spy] "app info > reads the cookie" (src/app/diagnostics/app-info.spec.ts) redefined document.cookie as non-configurable (Object.defineProperty defaults configurable to false), so no later file can put it back.
Patch it with mockValueProp(document, 'cookie', value) instead: it records what it replaced and undoes it after the test.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_7-naming-the-file-that-sealed-a-global
```

The fix the report names depends on what was defined: a value gets `mockValueProp`, a getter gets
`mockReadonlyPropGetter`, a getter with a setter gets `mockAccessorsProp`.

**What is watched:** `globalThis`, `document`, `navigator`, `location`, `screen`, and the prototypes
of `Element`, `HTMLElement`, `HTMLCanvasElement`, `HTMLMediaElement`, `Node` and `EventTarget`.
Symbol keys are watched too.

**What it cannot see:** an existing property redefined in place with `configurable: false`. It
reports only new properties that cannot be removed, which is the usual shape of such a stub.

`guardGlobalPatches(reaction)` is exported, to register the same check somewhere narrower.

How and when it checks: [In depth](#global-guard-in-depth).

## 8. Failing on a rejection zone.js swallowed

Off by default (`strayRejections: false`). When on, a rejected promise that nobody handled fails the
test instead of passing silently. It is for Angular suites that load zone.js.

zone.js replaces the global `Promise`. It prints an unhandled rejection with `console.error` and
stops there. Vitest never hears about it, so the file still passes. This hides ordinary bugs:

```ts
it('renders once compiled', () => {
  TestBed.compileComponents().then(() => expect(component.ready).toBe(true)); // never runs
});
```

The test ends before the callback runs, so a failing assertion becomes an unhandled rejection. The
same happens with an `async` helper called without `await`, and with an error thrown inside
`import('…').then(…)` in your app code.

```ts
import 'zone.js';

import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strayRejections: true });
```

```text
[vitest-auto-spy] 1 promise rejection went unhandled in "TaskListComponent > renders once compiled", and zone.js swallowed it into console.error:
  - AssertionError: expected false to be true
An assertion that settles after its test has ended cannot fail it, so that test passed without it. Return or await the promise — `.then(() => expect(…))` or an async helper called without await is the usual cause.
```

The report names the test in which the rejection surfaced. That may be a later test than the one
that created it. The closing advice depends on the kind of error: a failed assertion and a thrown
error get different advice.

What to know:

- **zone.js must already be loaded.** The library never imports it. Import `zone.js` at the top of
  the setup file, or use the `@angular/build:unit-test` builder, which loads it. Without zone.js the
  call throws.
- **Native rejections are not affected.** Vitest already fails on those. The library adds no
  `process.on('unhandledRejection')` listener, because a second listener would silence Vitest's.
- **A rejection Vitest already reported is not reported twice.** A failed assertion in an `async`
  test shows once, as the test failure.

The pieces are exported too. Each takes the same optional host as the stray-timer functions:

```ts
import { countStrayRejections, flushStrayRejections, trackStrayRejections } from 'vitest-auto-spy/setup';

const stop = trackStrayRejections(); // safe to call twice; the undo restores the previous handler

afterEach(() => {
  const stray = flushStrayRejections(); // { reason, assertion, testName }[], then starts from empty

  expect(stray).toEqual([]);
});
```

`countStrayRejections()` throws when nothing is tracking. `flushStrayRejections()` returns an empty
array instead, so a leftover teardown does not fail after you turn the option off.

**Common mistake:** reading only `countStrayRejections()`. A counter empties nothing, so the captured
errors pile up for the whole worker. Read through `flushStrayRejections()`, or let `setupAutoSpy()`
do it. See [The two buffers teardown drains](#the-two-buffers-teardown-drains).

The [`no-floating-assertion`](/utilities/eslint-plugin) lint rule catches the most common shape
before you run anything.

## 9. Pruning the mock registry nothing empties

Off by default (`pruneMockRegistry: false`). It keeps a large `isolate: false` run fast and small.

Vitest adds every `vi.fn()` and `vi.spyOn()` to one internal list, so that `vi.clearAllMocks()` can
reach them. Nothing ever removes them. With `isolate: false` the list grows for the whole run:

- `clearMocks: true` walks every mock of every earlier file before each test, so it gets slower as
  the run goes on;
- the worker's memory holds every mock of the run, with the arguments it recorded.

```ts
setupAutoSpy({ pruneMockRegistry: true }); // keep only the mocks that outlive a file
```

At the end of each file, it removes the mocks that file created in its tests and hooks. It keeps the
mocks created while modules were imported, such as a `vi.fn()` in a shared `*.mock.ts`. If the
registry cannot be reached safely, nothing is pruned.

**Common mistake:** a shared mock module first loaded by a dynamic `import()` inside a test. Its
mocks look like the test's own and would be dropped. Mark them to keep:

```ts
// fixtures/navigation.mock.ts — imported by six spec files
import { keepMockRegistered } from 'vitest-auto-spy/setup';

export const navigation = { setFocus: keepMockRegistered(vi.fn()) };
```

How the registry is reached and why the split is safe: [In depth](#mock-registry-in-depth).

### The mocks it keeps, it also guards

`vi.resetAllMocks()` wipes the behaviour of every registered mock. A `vi.fn()` that got its behaviour
from `.mockReturnValue(…)` or `.mockReturnThis()` then returns `undefined`. Under `isolate: false`,
one spec's `vi.resetAllMocks()` breaks a shared mock for a different file:

```
TypeError: Cannot read properties of undefined (reading 'info')
  app.component.ts:316   AppComponent.syncAllProcesses
```

With `pruneMockRegistry` on, the library remembers each kept mock's behaviour. Before each test, it
puts that behaviour back if it was lost. It leaves alone a mock that a test changed on purpose, and a
mock that never had a behaviour.

**Common mistake:** probing this with `vi.restoreAllMocks()`. That call does not cause the problem,
so the probe comes back green. `vi.resetAllMocks()` does.

The pieces are exported, to use without the rest:

| Function                            | What it does                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trackMockRegistry()`               | Installs the same hooks on its own                                                                                                                                |
| `keepRegisteredMocks()`             | Marks every mock registered now as long-lived                                                                                                                     |
| `keepMockRegistered(mock)`          | Marks one mock as long-lived and returns it                                                                                                                       |
| `pruneMockRegistry()`               | One sweep now; returns how many were removed                                                                                                                      |
| `restoreLongLivedImplementations()` | Puts lost behaviour back; returns how many                                                                                                                        |
| `getMockRegistrySize()`             | How many are registered; `undefined` when the registry was not found                                                                                              |
| `captureMockRegistry()`             | Captures Vitest's mock registry once per worker; returns the `Set`, or `undefined` if it cannot be confirmed. Clears every mock's recorded calls as a side effect |
| `resetMockRegistryTracking()`       | Forgets the capture and every long-lived mark. A worker never needs it; it is for testing the tracking itself                                                     |

### A pruner of your own keeps the sweep sentinel

If you write your own registry pruner, keep every entry that carries
`Symbol.for('vitest-auto-spy.sweepSentinel')`. That one mock is how `vi.clearAllMocks()` and
`clearMocks: true` reach this library's spies. Remove it, and they silently stop being cleared.

```ts
for (const mock of captured) {
  if (Symbol.for('vitest-auto-spy.sweepSentinel') in mock) continue; // the library's sweep
  if (!keep.has(mock)) captured.delete(mock);
}
```

With `pruneMockRegistry: true` or `trackMockRegistry()` in the same run, the library puts the
sentinel back before each test and warns once per worker:

```text
[vitest-auto-spy] Something removed this library's sweep mock from Vitest's mock registry — most likely a hand-written registry pruner. It has been put back: without it vi.clearAllMocks() and clearMocks: true stop clearing every spy this library builds.
Make the pruner keep any entry that carries Symbol.for('vitest-auto-spy.sweepSentinel'), or use setupAutoSpy({ pruneMockRegistry: true }).
```

This repair works on Vitest 4 and earlier only. A suite that prunes with only its own code gets no
repair; `doctor` reports that pruner as
[`mock-registry-capture-drops-sentinel`](./cli#mock-registry-capture-drops-sentinel). On Vitest 5
you can drop the capture altogether.

## 10. Strict doubles for the whole suite

Off by default (`strict: false`). When on, every spy built afterwards throws when a method nobody
configured is called. Without it, the method returns `undefined`, and the test fails later, far from
the cause.

```ts
setupAutoSpy({ strict: true }); // a method nobody configured throws, naming itself
```

The error names the class, the method and the arguments. The same switch for one spy is
`createSpyFromClass(UserService, { strict: true })`.

| Option              | Type                             | Default | Meaning                                                           |
| ------------------- | -------------------------------- | ------- | ----------------------------------------------------------------- |
| `strict`            | `boolean` \| `'survey'`          | `false` | Unconfigured calls throw; `'survey'` only counts them             |
| `onUnstubbedCall`   | `(call) => unknown`              | —       | Runs on an unconfigured call; its return value becomes the result |
| `unconfiguredReads` | `'off'` \| `'warn'` \| `'throw'` | `'off'` | Reports getters and streams of a strict spy nobody configured     |
| `onUnstubbedRead`   | `(read) => void`                 | —       | Receives those findings instead of the report, for a survey       |

A spy's own configuration wins, including an explicit `strict: false`. That is how you exempt one
large collaborator.

`onUnstubbedCall` lets you log the gaps before you turn the throw on:

```ts
setupAutoSpy({ onUnstubbedCall: ({ className, method }) => console.warn(`unstubbed ${className}.${method}`) });
```

A strict spy's unconfigured getter still returns `undefined`, and an unfed observable property never
emits. `unconfiguredReads` reports those after the test:

```ts
setupAutoSpy({ strict: true, unconfiguredReads: 'warn' }); // 'off' by default; 'throw' fails the test
```

What counts as configured, and the full precedence:
[Strict mode](/core/strict-mode#reads-nobody-configured).

**Try it on part of the suite** with the `VITEST_AUTO_SPY_STRICT` environment variable. It accepts
`1`/`true`, `0`/`false` and `survey`, and wins over the `strict` option. Any other value is ignored.

```bash
VITEST_AUTO_SPY_STRICT=1 npx vitest run src/app/cards   # strict for this run; 0 turns it off
```

**`strict: 'survey'`** (or `VITEST_AUTO_SPY_STRICT=survey`) is the step before `true`. Nothing
throws. Each file ends with a list on stderr of the calls and reads strict mode would refuse:

```
[vitest-auto-spy] strict survey — src/app/cards/card.component.spec.ts: what strict mode would have refused.
Calls nobody configured (seed them in `returns`, or `registerAutoSpyDefaults` in the setup file):
  NotificationsService.open ×12
  SvgIconService.getIcon ×4
```

A spy built without a class and without a `name` is listed by the line that built it:
`createAutoMock(card.component.spec.ts:42)`. A second `setupAutoSpy()` in another setup file works
too.

The option lasts for the file that set it: it is released in that file's `afterAll`. A plain
`setupAutoSpy()` with neither `strict` nor `onUnstubbedCall` leaves any existing default alone.

## 11. The hook budget Jest had only one of

On by default (`hookTimeoutHint`). When a `beforeEach` times out because `hookTimeout` is smaller
than `testTimeout`, it adds a sentence saying so.

Jest uses one timeout for hooks and tests. Vitest has a separate `hookTimeout`, 10 000 ms by
default. A suite that moved `testTimeout: 30000` from Jest gives hooks a third of the time. Vitest
then reports the hook timeout against the test (`× should create 10045ms`), which looks like a slow
test. The hint adds:

```text
[vitest-auto-spy] hookTimeout is 10000ms while testTimeout is 30000ms, so this hook ran on a smaller budget than the test body it prepares — Vitest resolves `hookTimeout` on its own and defaults it to 10000ms. Set `hookTimeout` next to `testTimeout` in the runner config.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_11-the-hook-budget-jest-had-only-one-of
```

The fix is in your Vitest config:

```ts
test: {
  testTimeout: 30_000,
  // Jest had one budget for both; Vitest defaults this to 10_000 on its own.
  hookTimeout: 30_000,
}
```

It stays silent when the two budgets are equal, and for a hook with its own limit
(`beforeEach(fn, 300)`). It cannot help with `beforeAll`: Vitest reports that timeout as a failed
suite and runs no `afterEach`.

```ts
setupAutoSpy({ hookTimeoutHint: false }); // off
```

**Common mistake:** after moving from Jest, most files are marked slow. That is `slowTestThreshold`:
`5` seconds in Jest, `300` milliseconds in Vitest. It changes only the report.

## 12. A timeout the clock explains, not the code

On by default (`frozenClockHint`). When a test times out while fake timers are installed and
callbacks are waiting on them, it says the clock was never advanced.

Under fake timers, `await new Promise((r) => setTimeout(r, 10))` never resolves by itself. Vitest
then reports an ordinary timeout and suggests a bigger timeout, which cannot help:

```text
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument …
```

The hint adds the real cause:

```text
[vitest-auto-spy] the clock is frozen and 1 callback is queued on it, so this did not run out of time — nothing advanced the clock, and raising the timeout cannot help. Advance it (`await vi.advanceTimersByTimeAsync(ms)`, `await vi.runAllTimersAsync()`) or use real timers for this test.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_12-a-timeout-the-clock-explains-not-the-code
```

It stays silent when the clock is real or the fake queue is empty. When `setImmediate` callbacks are
among the queued ones, it adds a sentence about them.

**Common mistake: an HTTP spec that hangs.** `vi.useFakeTimers()` fakes `setImmediate` by default.
Express answers an unmatched route through `setImmediate`, so the 404 is never sent. In such a file,
"the test hung" means the route did not match. Take `setImmediate` out of `toFake`: see
[Fake timers](./fake-timers#taking-setimmediate-out-of-tofake).

This matters most with [`globalFakeTimers`](#fake-timers-for-the-whole-run), where nothing in the
spec says the clock is fake.

```ts
setupAutoSpy({ frozenClockHint: false }); // off
```

It cannot see through a spec whose own `afterEach` calls `vi.useRealTimers()`. That hook runs first,
so the clock is already real. Nothing is reported then.

## 13. The builder version that eats memory, named in the run

On by default (`angularBuildHint`). Under `@angular/build:unit-test` versions `>=22.1.5 <22.1.7`, it
prints one line to stderr, once per worker. Those versions build tests without code splitting, and
`--coverage` then uses memory until the run is killed. Upgrade `@angular/build` to fix it.

```ts
setupAutoSpy({ angularBuildHint: false }); // off
```

It is silent outside the builder, outside those versions, and wherever the installed version cannot
be read. The same problem is reported by the `angular-build-splitting-off`
[`doctor` check](/utilities/cli#doctor-—-defects-that-never-fail) and explained on the
[Angular unit-test builder guide](/guides/angular-unit-test-builder#when-the-unit-test-build-has-code-splitting-off).

`isAngularUnitTestBuilder()` tells you whether the run is under that builder. Use it in a setup file
that both the builder and plain Vitest run. The builder sets up `TestBed` before any setup file, so a
second `initTestEnvironment()` would throw "Cannot set base providers because it has already been
called":

```ts
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
// or your own initTestEnvironment() call
import { isAngularUnitTestBuilder, setupAutoSpy } from 'vitest-auto-spy/setup';

if (!isAngularUnitTestBuilder()) {
  setupTestBed(); // plain Vitest only; the builder has done this already
}

setupAutoSpy();
```

**Common mistake:** the builder runs this file only when its target lists it in `setupFiles`.
[`doctor`](/utilities/cli#doctor-—-defects-that-never-fail) reports `builder-setup-unreached` when it
does not.

How it detects the builder and reads the version: [In depth](#angular-build-hint-in-depth).

## 14. Web Storage the runner never handed over

On by default (`restoreWebStorage`). It makes sure `localStorage` and `sessionStorage` work under
jsdom and happy-dom. On newer Node versions, Vitest does not copy them from the DOM environment:

| Node  | `localStorage` under Vitest |
| ----- | --------------------------- |
| 24.19 | works                       |
| 25.9  | `setItem is not a function` |
| 26.7  | `undefined`                 |

Only the specs that touch storage fail, so it usually shows up as "CI moved to a new Node and
unrelated specs died".

The repair writes a test key, reads it back and removes it. A storage that passes is left alone, so
your own stub survives. One that fails is replaced: with the window's own storage when that is a
separate object, otherwise with a simple in-memory storage. In a `node` environment it installs
nothing, because that environment has no Web Storage.

```ts
import { restoreWebStorage } from 'vitest-auto-spy/setup';

restoreWebStorage(); // safe at any point, as often as you like
restoreWebStorage({ view: null }); // "there is no window": installs nothing
```

Why Vitest drops the storage: [In depth](#web-storage-in-depth).

### A storage the spec installs itself — `stubWebStorage` {#stub-web-storage}

`stubWebStorage(name, options?)` from `vitest-auto-spy/dom-stubs` installs a fresh storage for one
test. Use it when a spec wants an empty or pre-filled storage and wants to read it back as a plain
object. It is not part of `setupAutoSpy()`.

```ts
import { type WebStorageStub, stubWebStorage } from 'vitest-auto-spy/dom-stubs';

let local: WebStorageStub;

beforeEach(() => {
  local = stubWebStorage('localStorage', { items: { token: 'abc' } }); // or 'sessionStorage'
});

it('forgets the token on logout', () => {
  session.logout();

  expect(local.snapshot()).toEqual({});
});
```

- `getItem`, `setItem`, `removeItem`, `clear`, `key` and `length` behave like the platform's. Keys
  and values become strings.
- `snapshot()` returns a copy, not a live view.
- It goes on `globalThis`, and on `document.defaultView` when that is a separate object. It uses
  `mockValueProp`, so `restoreMockedProps()` puts the previous storage back after the test.
- Unlike the repair, it replaces whatever is there, and it installs in a `node` environment too.

It does not support named-property access (`localStorage.token`, `Object.keys(localStorage)`),
`storage` events or a quota.

**Common mistake:** installing it in `beforeAll`. It is removed after the first test. Install it in
`beforeEach`.

## 15. The key on `Object.prototype` that stops the run collecting

On by default (`prototypePollution: 'throw'`). It removes and reports any enumerable key a test
leaves on `Object.prototype`, `Array.prototype` or `Function.prototype`.

Such a key breaks Vitest while it collects the next file's tests:

```text
TypeError: Spread syntax requires ...iterable[Symbol.iterator] to be a function
```

There is no stack. Under `isolate: false`, every later file in that worker fails to collect. The
summary can then show zero failed tests over code that never ran.

```ts
setupAutoSpy(); // prototypePollution: 'throw'; pass 'warn' to remove and report without failing
```

```text
[vitest-auto-spy] "CheckoutOpenService > closes on destroy" (src/app/checkout/checkout-open.service.spec.ts) left "ngOnDestroy" (a function) on Object.prototype as an enumerable property.
It has been taken off: left there, it stops every later spec file in this worker from collecting. Define it on the prototype of the class it belongs to, or with enumerable: false.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_15-the-key-on-object-prototype-that-stops-the-run-collecting
```

The report names the test and the kind of value, with a path relative to the project root. A key
found at the end of the file, outside any test, is reported against the file.

**Common mistake:** patching `Object.getPrototypeOf(instance)` when `instance` is a plain object,
for example a `useValue` provider or a spy. That prototype is `Object.prototype` itself:

```ts
const proto = Object.getPrototypeOf(instance); // Object.prototype, for a plain object
proto['ngOnDestroy'] = function () { … };      // now every object in the realm has it
```

Patch the prototype of the object's class instead.

Keys the environment already had, such as a polyfill of yours, are left alone. A key written in the
file's own `beforeAll` or `afterAll` is reported too. `guardPrototypePollution(reaction)` registers
the same check on its own.

### The key an earlier file left behind

A key written while a spec file is imported, collected, or in its `afterAll` escapes that file's
hooks. The next file then fails. So `setupAutoSpy()` also checks the prototypes each time the setup
file runs, before the next file is collected. It removes what an earlier file left and writes this to
stderr:

```text
[vitest-auto-spy] "ngOnDestroy" was left on Object.prototype by the previous spec file of this worker, src/app/checkout/checkout-open.service.spec.ts — while it was imported, collected or in an afterAll — and has been taken off.
Left on, the key stops every later spec file in the worker from collecting: Vitest walks a file's hooks with for…in. In that file, patch the prototype of the class an object came from, never Object.getPrototypeOf(someObjectLiteral).
```

The named file is the one whose setup ran just before in the same worker. This check never throws,
because the current file did not write the key. A key that cannot be deleted is accepted into the
baseline, so you hear about it once.

Only a call from a setup file can do this; `guardPrototypePollution` registered in a spec file
cannot.

## 16. Console output nothing absorbed

Off by default (`strayConsole: 'off'`). When on, a test that writes to the console without a spy to
catch the output fails. Console output from a green test is either a bug nobody asserted on, or noise
that hides the next real failure.

```ts
setupAutoSpy({ strayConsole: 'throw' });
```

```text
[vitest-auto-spy] "CartService > reports a failed load" wrote to console.error 1 time and nothing absorbed it:
  - console.error: Error: load failed {"id":7}
      at CartService.load (src/app/cart.service.ts:41:15)
Absorb what the test expects — useConsoleSpies() in the describe, then assert consoleErrorSpy — or fix the code if the output is a defect.
```

To absorb expected output, use the [`/console`](./console) spies and assert on them.
`useConsoleSpies()` in a `describe` installs them before each test and removes them after:

```ts
import { consoleErrorSpy, useConsoleSpies } from 'vitest-auto-spy/console';

describe('CartService', () => {
  useConsoleSpies();

  it('reports a failed load', () => {
    service.load();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error), { id: 7 });
  });
});
```

To cover every test of a file at once, call `installConsoleSpies()` once at the top of the file.

| Option     | Type                             | Default   | Meaning                                             |
| ---------- | -------------------------------- | --------- | --------------------------------------------------- |
| `reaction` | `'throw'` \| `'warn'` \| `'off'` | `'throw'` | In the object form; `'warn'` prints without failing |
| `allow`    | `(string \| RegExp)[]`           | `[]`      | Output to ignore; a string matches as a substring   |

**What absorbs output:**

| In the test                                                          | Result                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `installConsoleSpies()` from `vitest-auto-spy/console`, then asserts | absorbed; the spy never calls through                         |
| `vi.spyOn(console, 'error').mockImplementation(() => undefined)`     | absorbed                                                      |
| `vi.spyOn(console, 'error')` with no implementation                  | **stray**; it records the call, then calls through and prints |
| nothing                                                              | **stray**                                                     |

**What counts as output:** `log`, `info`, `warn`, `error`, `debug`, `trace`, `table`, `dir`,
`dirxml`, `timeLog`, `timeEnd`, `count`; `group` / `groupCollapsed` only with a label; `assert` only
when its condition is false. `time`, `groupEnd` and `countReset` print nothing and are not watched.
Output written straight to `process.stdout` or `process.stderr` is not seen.

**The report.** It quotes the method and up to three lines of output (200 characters each, five
calls, then `… and N more`). If a cut dropped a URL, the first dropped URL is appended. It shows the
first stack frame outside `node_modules`, or the direct caller for a dependency's output. It names
the spy to use for each method (`consoleErrorSpy`, `consoleWarnSpy`, …). For a `vi.spyOn(console,
'error')` without an implementation, it says:
`vi.spyOn(console, 'error') calls through — add .mockImplementation(() => undefined).`

**Output outside a test** fails the file in `afterAll`. That covers output during import, in
`beforeAll` / `afterAll`, from a callback that fired after its test ended, or in a test whose
`afterEach` never ran. The report names the moment (`while the file was being imported`,
`in a beforeAll`, `after a test had ended`) and gives advice for it. For output during import, it
names the module and the line to fix. Only when that line is inside `node_modules` does it suggest
`allow`. Under `isolate: false`, import-time output is reported on the first file of the worker that
imports that module.

**Known causes are explained** under `Likely cause:`. For example, Angular's `NG0912` means two
copies of one component are in the bundle:

```text
[vitest-auto-spy] src/app/checkout.component.spec.ts wrote to console.warn 1 time while the file was being imported and nothing absorbed it:
  - console.warn: NG0912: Component ID generation collision detected. Components 'UiRadioGroupComponent' and '_UiRadioGroupComponent' … https://angular.dev/errors/NG0912
      at Function.<static_initializer> (src/app/ui/radio-group.component.ts:210:44)
Likely cause:
  - Angular gave `UiRadioGroupComponent` and `_UiRadioGroupComponent` (selector `ui-radio-group`) one component id, so the bundle holds two copies of one component — … Import the component from one place.
Written while src/app/ui/radio-group.component.ts was evaluated, before any hook — no spy can absorb it; fix it at src/app/ui/radio-group.component.ts:210:44. Under isolate: false it is reported on the first file of the worker that imports that module.
```

Any other Angular `NGxxxx` code gets the link Angular printed.

**Other behaviour:**

- Every console method a test replaced is put back after the test. One replaced in a `describe`
  body, `beforeAll` or at module level is put back after the file.
- While the guard is on, importing `vitest-auto-spy/console` installs nothing. Install the spies with
  `installConsoleSpies()` as shown above. Spies installed by an earlier import are removed when the
  guard turns on. A file that imports a spy without installing it gets the failure plus a sentence
  with the fix.
- The library's own warnings are not counted as stray output: `propsOutsideHooks`, `guardGlobals`,
  `prototypePollution`, `unconfiguredReads`, a strict call the test swallowed, the duplicate-copy
  report, the misconfiguration reports, the teardown safety net of section 1 and the
  `test.concurrent` notice. They stay warnings under `strayConsole: 'throw'`. A `vi.spyOn(console, 'warn')` in your test still catches them. To make
  them fail at the call instead, use [`misconfiguration: 'throw'`](#misconfiguration-reports-that-fail-at-the-call).
- It changes nothing else: Vitest's per-test output, `onConsoleLog` and failure output stay the same.
- Output of the DOM environment's own console (happy-dom's page console, jsdom's virtual console) is
  watched too. For example, `Not implemented: navigation` is reported against the test that caused
  it, with a `Likely cause:` line.
- The file that wrote the output is the file that is named, even if a report before it threw.
- With `strayRejections` on, a rejection zone.js swallowed is printed through `console.error`. The
  rejection report comes first and wins.

**`allow` is the last resort.** Use it only for environment noise no spec can reach, never for output
your code makes:

```ts
setupAutoSpy({ strayConsole: { allow: ['Download the React DevTools', /^Lit is in dev mode/] } });
```

A RegExp is searched; its `g` / `y` flags make no difference. Use `{ reaction: 'warn' }` to measure a
large suite before turning the guard on. `guardStrayConsole(reaction)` registers the same guard on
its own.

**Common mistake: `NG0912` under `isolate: false` with a module reset.** When an Angular suite
re-evaluates spec bundles between files, Angular prints `NG0912` during import, and no spec can
absorb it. Allow that one only: `allow: [/NG0912/]`. It is not allowed by default, because outside a
reset it points at a real duplicate.

### An iframe that must stay unloaded under happy-dom

happy-dom 20 cannot keep a remote-`src` iframe both unloaded and silent.
`disableIframePageLoading` logs a `NotSupportedError` for each iframe (and fires `error`).
`navigation.disableChildFrameNavigation` is silent but fires `load`, so a "page never loads" branch
cannot be reached. Two ways out, both per file. Absorb the log:

```ts
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { consoleErrorSpy, installConsoleSpies } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies());

it('gives up when the logout page never loads', async () => {
  await service.logout(); // no `load` ever comes

  expect(consoleErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'NotSupportedError' }));
});
```

Or put `// @vitest-environment jsdom` at the top of the file: jsdom leaves a remote `src` unloaded,
silent and without `load`. There is no `dom-stubs` helper for this.

## 17. An attribute left on the shared document

When on, it reports any attribute a test added, changed or removed on `<html>`, `<head>` or
`<body>`, and puts back its value from before the test. Off by default (`documentPollution: 'off'`);
`preset: 'strict'` turns it on as `'throw'`.

Under `isolate: false`, all spec files in a worker render into one document. For example, a
component sets `data-reset-focus` on `<body>` and never removes it. Another service returns early
when `[data-reset-focus]` matches, so its spec fails, but only when both files share a worker.

```ts
setupAutoSpy({ documentPollution: 'throw' }); // 'warn' puts the document back and only reports
```

```text
[vitest-auto-spy] "KeyboardComponent > renders the layout" (libs/keyboard/src/lib/keyboard.component.spec.ts) left the shared document changed:
  - <body> data-reset-focus="" added
It has been put back, because every later spec file in this worker shares this document. Undo it in the teardown of what set it: ngOnDestroy / DestroyRef.onDestroy of the component, or destroy the fixture that owns it.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_17-an-attribute-left-on-the-shared-document
```

The Angular advice appears only when Angular is detected. Otherwise the advice is an `afterEach` in
the spec, or `afterAll` for a change made outside a test. A change made in `beforeAll` and never
undone is reported against the file.

| Form                                                          | What it does                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `'throw'` / `'warn'` / `'off'`                                | The reaction; `'warn'` writes to stderr and still puts the document back                |
| `{ reaction }`                                                | Same; `'throw'` when left out                                                           |
| `{ nodes: true }`                                             | Also child elements of `<head>` and `<body>`: added ones removed, removed ones put back |
| `{ ignoreAttributes: ['aria-hidden', /^data-cdk-/] }`         | Attributes to leave alone, by exact name or RegExp                                      |
| `{ nodes: true, ignoreNodes: 'style, link[rel=stylesheet]' }` | Child elements to leave alone, as a CSS selector                                        |

`nodes` is off by default. A library that injects a stylesheet on first import does so once per
worker, and a node check would blame whichever test imported it first.

An empty `class` or `style` counts as no attribute. `classList.add` then `classList.remove` leaves
`class=""`, and that is not reported. Any other empty value is a change: `data-reset-focus=""` is a
flag that `[data-reset-focus]` matches.

It checks after the `TestBed` destroys its fixtures, so what a component cleans up on destroy is
never reported.

What it cannot see:

- a change made while the spec file is imported (it is already in the baseline);
- a fixture kept alive by `teardown: { destroyAfterEach: false }`. It is destroyed in the next test,
  so its leftovers are reported against the test that rendered it. Turn `destroyAfterEach` on, or
  list the attribute in `ignoreAttributes`;
- `document.title`, focus, cookies and `customElements`.

What an Angular suite typically finds: a scroll lock from a modal left open, a theme or platform
class, a `lang` / `dir` from an i18n service, a `data-*` flag from a focus manager. Close or destroy
what set it. Use `ignoreAttributes` only for an attribute set once on purpose.

`guardDocumentPollution(option)` registers the same check on its own.

Why it checks where it checks, and what it costs: [In depth](#document-guard-in-depth).

## 18. A spy on storage the runner cannot take off

On by default (`restoreStorageSpies`). At the end of each file, it removes spies left on
`localStorage` / `sessionStorage` methods.

Under happy-dom, `mockRestore()` on `vi.spyOn(localStorage, 'setItem')` silently does nothing. The
spy stays, and a later spec's `vi.spyOn` gets the same mock with the old calls in it. So
"not to have been called" fails every other run.

```ts
setupAutoSpy(); // restoreStorageSpies: true; the sweep runs at the end of each file
```

- It works at the file boundary, not per test: a spy a `beforeAll` installed stays for that file's
  tests.
- `restoreStorageSpies()` runs the sweep once and returns the storages it repaired.
- `restoreStorageSpies: false` turns it off, for a suite that keeps a storage spy for a whole worker
  on purpose.
- It removes only real mocks. A clean storage or a deliberate replacement is left alone.

**Common mistake:** checking with `vi.restoreAllMocks()` whether the spy is gone. That call silently
does nothing here too, so the check looks green.

## 19. Listeners that outlive their file

Off by default (`strayListeners: false`). When on, it removes `window` and `document` listeners a
file added and never removed. Under `isolate: false`, those listeners fire during the next file,
against mocks and a DOM they were not written for.

```ts
setupAutoSpy({ strayListeners: true });
```

Listeners registered while modules are imported (a framework's one-time setup) are kept. Everything
added later in a file is removed at the end of that file.

To fail the file instead of cleaning up quietly:

```ts
setupAutoSpy({ strayListeners: true, onStrayListeners: ({ removed }) => expect(removed).toBe(0) });
```

`onStrayListeners: 'throw'` does the same with a report that lists each listener as
`keydown on document, added in "<test>" at <frames[0]>`. Each entry has `type` and `target`, plus the
same `test` / `outsideTest` fields as a stray timer.

The pieces are exported from `vitest-auto-spy/setup`:

| Function                   | What it does                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `trackStrayListeners()`    | Wraps `addEventListener` / `removeEventListener`; safe twice; returns the undo           |
| `baselineStrayListeners()` | Marks what is registered now as kept (the default `beforeAll` step)                      |
| `removeStrayListeners()`   | Removes everything added since the baseline; returns how many                            |
| `countStrayListeners()`    | How many are outstanding; throws before `trackStrayListeners()` has run                  |
| `describeStrayListeners()` | Each stray's target, type, spec file and up to five frames (the `onStrayListeners` list) |

**Common mistake:** under jsdom, a `{ once: true }` listener that already fired stays counted until
something removes it. Removing it is harmless. happy-dom removes it by itself.

With `strayTimers` on too, both reports run after timers are cancelled and listeners removed. Both
run even if the first throws. Two failures appear as one `AggregateError`, which Vitest lists as two
errors.

## 20. Globals put back at the file boundary

Off by default (`restoreGlobals: false`). When on, it puts every global that a file changed back at
the end of the file.

`vi.stubGlobal` is undone by `unstubGlobals`, and `vi.spyOn(globalThis, …)` by `restoreMocks`. A
plain assignment like `global.ResizeObserver = stub` is undone by nothing. Under `isolate: false`,
every later file reads it.

```ts
setupAutoSpy({ restoreGlobals: true });
```

- One snapshot per worker, taken by the first `setupAutoSpy` call. `captureGlobalBaseline()` takes
  it; later calls of `captureGlobalBaseline()` do nothing. `restoreGlobals()` runs the sweep and returns the keys it changed.
- Globals added after the snapshot are kept, so a framework that installs a global at import keeps
  it. This also applies to a global the environment lacks, such as `ResizeObserver` under jsdom: a
  test that assigns it adds it, and it is not removed. Call
  [`fillMissingDomApis()`](#members-the-dom-environment-leaves-out-filled-before-the-snapshot)
  before `setupAutoSpy()`, so the global exists in the snapshot and is put back.
- `location`, `document`, `window`, `frames`, `global`, `parent`, `self` and `top` are never written
  back: assigning them would navigate or swap the environment.
- The library's own wrappers (from `strayTimers`, `strayListeners`) are kept. `blockNetwork` stubs
  are removed after each test anyway.
- A leftover fake clock is removed before the sweep.

`guardGlobals` ([section 7](#_7-naming-the-file-that-sealed-a-global)) covers the case this cannot
repair: a property made non-configurable.

### Members the DOM environment leaves out, filled before the snapshot

If your setup file adds `PointerEvent` or `ResizeObserver` by hand after the snapshot,
`restoreGlobals` and `guardGlobals` blame the first test for it. Call [`fillMissingDomApis()`](./element-stub) from
`vitest-auto-spy/dom-stubs` first. It fills what jsdom and happy-dom leave out (`PointerEvent`, a
no-op `ResizeObserver`, `scrollTo` / `scrollBy` / `scrollIntoView`, `document.doctype`), only where
missing, and returns the names it filled.

```ts
// vitest.setup.ts
import { fillMissingDomApis } from 'vitest-auto-spy/dom-stubs';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

fillMissingDomApis();
setupAutoSpy();
```

## 21. A TestBed left dirty at file end

On by default (`cleanTestBed: 'warn'`). Once any spec imports `vitest-auto-spy/angular`, the end of
each file checks the Angular `TestBed`. A testing module still set up, fixtures still alive, or a spy on
a `TestBed` method is reported and reset. The next file starts clean. A suite without Angular runs
nothing.

```ts
setupAutoSpy({ cleanTestBed: 'throw' }); // 'warn' by default, 'off' to skip
```

```text
[vitest-auto-spy] src/app/cart.spec.ts left the TestBed dirty: a testing module is still instantiated and 1 fixture still alive; TestBed.inject is still a spy. It has been reset now; under isolate: false the next file in this worker would have inherited it.
```

The per-file state of `enableAngularDiagnostics` is dropped at the same point.

**Common mistake:** no global `afterEach` in the runner. Angular registers its own `TestBed` reset
only when a global `afterEach` exists. Any one of `globals: true`, `setupTestBed()` or
`setupAngularTestEnv()` provides it. Remove a spy on
`TestBed` in the test that installed it: `mockRestore()` or `vi.restoreAllMocks()`.

## One grade for everything: `preset: 'strict'` {#one-grade-for-everything-preset-strict}

`preset: 'strict'` starts every guard at its strictest grade. An option you pass in the same object
still wins, so `{ preset: 'strict', guardGlobals: 'warn' }` relaxes exactly one.

```ts
setupAutoSpy({ preset: 'strict' });
```

| Option                 | Under `preset: 'strict'`                | Default without it                          |
| ---------------------- | --------------------------------------- | ------------------------------------------- |
| `duplicateCopies`      | `'throw'`                               | `'throw'`                                   |
| `propsOutsideHooks`    | `'throw'`                               | `'warn'`                                    |
| `guardGlobals`         | `'throw'`                               | `'off'`                                     |
| `prototypePollution`   | `'throw'`                               | `'throw'`                                   |
| `documentPollution`    | `'throw'`                               | `'off'`                                     |
| `strayConsole`         | `'throw'`                               | `'off'`                                     |
| `misconfiguration`     | `'throw'`                               | `'warn'`                                    |
| `swallowedStrictCalls` | `'throw'`                               | `'throw'` with `strict: true`, else `'off'` |
| `cleanTestBed`         | `'throw'`                               | `'warn'`                                    |
| `strayTimers`          | `true`                                  | `false`                                     |
| `strayRejections`      | `true` when zone.js is loaded, else off | `false`                                     |

Not in the preset, and why:

- **`strict`**: it changes what an unconfigured call returns. That is a choice about how you write
  spies, not a report grade.
- **`unconfiguredReads`**: the read side of `strict`. On an existing suite, start with a survey
  (`onUnstubbedRead`).
- **`blockNetwork`**: it changes what the code under test sees.
- **`restoreMocks`**: it also drops `vi.spyOn` stubs installed in `beforeAll`.
- **Failing on stray timers**: the failure lands on a whole file. A timer scheduled after one file
  ended counts against the next file, so the failure can hit a file that scheduled nothing. Each
  timer's `file` field names its real owner. Read the `timers` list first, then opt in with
  `onStrayTimers: 'throw'`.
- **`enableAngularDiagnostics()`**: it lives in `vitest-auto-spy/angular/diagnostics` and needs the
  `TestBed` environment first. Call it in the same setup file.

What the preset costs per test: [Performance](/core/performance).

## Misconfiguration reports that fail at the call {#misconfiguration-reports-that-fail-at-the-call}

`misconfiguration: 'throw'` turns the library's warnings about its own misuse into errors thrown at
the call, with the stack pointing at your configuration line.

```ts
setupAutoSpy({ misconfiguration: 'throw' });
```

It covers:

- a typo in `onlyMethodsToSpyOn`;
- `gettersToSpyOn` / `settersToSpyOn` naming a method;
- a `returns` key no spy answers to (`then` and `constructor` on `createAutoMock` included);
- `injectSpy` handed a real instance;
- a write to `jasmine.DEFAULT_TIMEOUT_INTERVAL`;
- the deprecated `providedMethodNames`.

By default each is a `console.warn`, and some print only once. `'throw'` fails at every occurrence.
The setting applies to the whole process and is released after the file that set it. `injectSpy`'s
"got a real …" warning prints once per token per spec file.

## The two buffers teardown drains

Two checks keep what they find in a list until something reads it:

- `trackStrayRejections()` keeps each swallowed rejection, including its error and stack;
- `mockReadonlyProp` and its siblings keep each patch, with the object and the value it replaced.

`setupAutoSpy()` empties both after every test. They grow only if you wire the pieces by hand and
read them only through the counters. **A counter empties nothing.** Read through
`flushStrayRejections()` / `restoreMockedProps()`, or let `setupAutoSpy()` own the teardown.

An undone patch releases its object and value. `countMockedProps()` is cheap to call.

## Under `test.concurrent`

The cleanups still work under `test.concurrent`, but the console and document guards can blame the
wrong test. With two tests running at once, a console or document finding can land on the other test,
or be cleared before it is seen. The first concurrent test in a worker prints one warning:

```text
[vitest-auto-spy] "CartComponent > loads" runs as test.concurrent, and setupAutoSpy()'s per-test guards judge one test at a time: a console or document finding can land on the other test in flight, or be cleared before it is seen.
Run this file's tests sequentially, or give the files that keep test.concurrent a setup with strayConsole: 'off' and documentPollution: 'off'. Said once per worker.
```

Run files that need those guards sequentially, or give concurrent files a setup with
`strayConsole: 'off'` and `documentPollution: 'off'`.

Property restore is tracked per test, so it stays correct. The unconfigured-read report waits for the
last of the concurrent tests and names them all
([Reads nobody configured](../core/strict-mode#reads-nobody-configured)).

## Reinstalling a stub for every test

`installPerTest(install)` installs a stub before each test and gives you a function that returns the
current one.

```ts
import { stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';
import { installPerTest } from 'vitest-auto-spy/setup';

const observers = installPerTest(() => stubIntersectionObserver({ autoEmit: true }));

it('loads the section once it scrolls into view', () => {
  fixture.detectChanges();

  expect(observers().last.targets).toEqual([host]);
});
```

You need it because every stub this library installs is removed after each test. A stub installed
once in a `describe` body or `beforeAll` is gone from the second test on.

The same applies to a project setup file that installs default stubs in its own `beforeEach`. That
hook runs before every test, after the spec's `beforeAll`, so it replaces what the `beforeAll`
installed. A `beforeEach` in the spec runs after it and wins.

The reader returns a new handle each test. Called when nothing is installed, it throws
`installPerTest: nothing is installed yet` and says when it was called: before the first test, after
a test ended, or from a hook registered before `installPerTest()`.

## A patch put in the wrong hook stops applying

A `mock*Prop` patch applies until the end of the test in which it ran. A patch written in a
`describe` body or `beforeAll` therefore lasts for the first test only:

```ts
describe('modal', () => {
  const modal = new Modal();

  mockValueProp(modal, 'onClose', () => 'patched'); // ← runs once, at collection

  it('one', () => expect(modal.onClose()).toBe('patched')); // ✅
  it('two', () => expect(modal.onClose()).toBe('patched')); // ❌ 'real'
});
```

The fix is one line: move the call into `beforeEach`.

`propsOutsideHooks` reports it: `'warn'` by default, `'throw'` to fail on the first test, `'off'` to
turn it off. With `restoreProps: false` nothing is removed and nothing is reported.

```ts
setupAutoSpy({ propsOutsideHooks: 'throw' });
```

```text
[vitest-auto-spy] mockValueProp(…, 'onClose') on an object in src/app/modal.spec.ts ran outside a per-test hook, so the sweep after the first test took it off for good and every later test reads the real member.
Move the call into beforeEach, so it is applied again for each test.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#a-patch-put-in-the-wrong-hook-stops-applying
```

The report names the target when it can (`globalThis`, `document`, a function or a prototype) and
describes it otherwise (`on an object`, `on a Modal`). It fires once per object and property in each
spec file.

Without `setupAutoSpy`, `reportPropsOutsideHooks(reaction)` from `vitest-auto-spy` sets the same option. Its type is
exported as `OutsideHookReaction`.

Why the patch is not simply re-applied: [In depth](#why-a-patch-is-not-re-applied).

## Fake timers for the whole run

`globalFakeTimers` installs fake timers for every test and keeps them on between tests, like Jest's
`fakeTimers: { enableGlobally: true }`. Vitest has no such setting.

```ts
setupAutoSpy({ globalFakeTimers: true }); // or a `vi.useFakeTimers()` config object
```

Use it for a suite ported from a Jest project that had `enableGlobally` on.

- Pass a config such as `{ toFake: ['setTimeout', 'Date'] }` instead of `true` to narrow it.
- Both ends are guarded: a spec that calls `vi.useRealTimers()` itself does not break the next file.
- The clock stays fake between tests too, so a nested `beforeAll` does not fail with
  `the timers APIs are not mocked`.
- The fakes come off for good in `afterAll`, so they never outlive the file.

For one `describe` instead of the whole run, use
[`setupFakeTimers(config, { betweenTests: true })`](./fake-timers).

**Common mistake:** `true` with a real HTTP handler. The default `toFake` includes `setImmediate`,
which turns an Express 404 into a 30-second timeout. Pass a config without it: see
[taking `setImmediate` out of `toFake`](./fake-timers#taking-setimmediate-out-of-tofake).

It does not work together with `strayTimers`: timers the fake clock schedules are not counted (see
[section 4](#_4-cancelling-timers-that-outlive-their-file)).

### One test on fake timers — `withFakeTimers`

`withFakeTimers(fn, config?)` from `vitest-auto-spy/setup` runs one body on fake timers and restores
real timers however it ends: returned, thrown or rejected. It returns what `fn` returns, or a promise
for an async body.

```ts
import { advanceTimers, withFakeTimers } from 'vitest-auto-spy/setup';

it('retries after a second', () =>
  withFakeTimers(async () => {
    poller.start();
    await advanceTimers(1_000);
    expect(api.fetch).toHaveBeenCalledTimes(2);
  }));
```

Inside `setupFakeTimers()` or `globalFakeTimers`, it runs on the installed fakes and leaves them on.
Passing a `config` there throws:

```text
[vitest-auto-spy] withFakeTimers(fn, config) found fake timers already installed, and cannot put them back after installing its own config. Drop the config to run on the installed fakes, or call it outside setupFakeTimers().
```

Over `mockSystemTime()`, it starts at the mocked time and ends on real timers.

## Shared fixtures are functions, not constants

Under `isolate: false`, a module runs once per worker. An exported object holding `vi.fn()`s is one
set of spies shared by every file that imports it. The symptom is a 30-second timeout in a different
file on each run. Export a factory instead:

```ts
// ❌ a constant: one set of spies for the whole worker
export const mockActionContext = { actions: { navigateToSection: vi.fn() } };

// ✅ a factory: one set per caller
export const createActionContext = () => ({ actions: { navigateToSection: vi.fn() } });
```

The same applies to a provider fixture: `{ provide: X, useValue: { load: vi.fn() } }` is a constant
unless a function returns it.

A spec file must export nothing. Under `isolate: false`, an exported spec file gets imported by its
neighbours and loses its own tests. Put shared spies in a `*.mock.ts` next to the specs.

The [`no-shared-module-level-mock`](/utilities/eslint-plugin) lint rule finds these for you.

## Hook order differs from Jest

Vitest runs `afterEach` hooks innermost and last-registered first. Jest ran them in declaration
order. So in a suite ported from Jest, the setup file's teardown runs before a spec's own
`afterEach`. To get Jest's order back, set `sequence: { hooks: 'list' }` in the Vitest config.

## The hooks belong to the file this call ran in

Everything `setupAutoSpy()` installs is a hook. Vitest runs the setup file again before each spec
file, and the hooks registered at that moment belong to that spec file. So normally each file gets
its own hooks.

If the setup module is cached across files (see the known cause below), the call runs only once. Every later file in that worker
then has no hooks: no property restore, no `blockNetwork`, no timer cleanup, no global fake timers.
The symptom shows up elsewhere, for example
`A function to advance timers was called but the timers APIs are not mocked` in a spec that passes on
its own.

`setupAutoSpy()` reports this with one line per worker on stderr:

```text
[vitest-auto-spy] setupAutoSpy() registered its hooks for src/a.spec.ts and not for src/b.spec.ts, which runs after it in the same worker: …
```

A call from a spec file (for example inside `describe`) is never reported. Calling `setupAutoSpy()`
for only some spec files is fine too: the check sees that the setup module ran again for the file and
stays quiet.

**Known cause:** `@angular/build:unit-test` before 22.2.0, with `--coverage`. It looks like
"coverage broke the tests". Upgrade `@angular/build` to 22.2.0 or later. On an older builder:

- run coverage with per-file isolation: `ng test <project> --coverage --isolate`, or
  `isolate: true` in the config for that case. The builder keeps the config's `test.isolate` unless
  the target sets its own `isolate`;
- or call `setupAutoSpy()` from something evaluated per file.

On any version, keep the call at the top level of the setup file. A module the setup file imports
for side effects can still land in a shared chunk and run once per worker.

## The setup file that gets its own copy of Angular

A setup file that calls `initTestEnvironment` runs before the library is imported. If the setup file
and the specs resolve `@angular/core` differently, the process ends up with two copies of Angular.
The setup file's `TestBed` belongs to one, and every spec uses the other.

The symptoms say nothing about copies. One is:

```text
[vitest-auto-spy] No mock adapter registered: a spy was built before 'vitest-auto-spy' was imported. This is Vitest — import the factories from 'vitest-auto-spy', in the spec or once in the `setupFiles` entry.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/installation#vitest
```

Others: `configureTestingModule` is accepted but the component still gets the real service, an
`overrideProvider` never applies, or `NG0203` appears in an ordinary injection context.

Fix it in the Vitest config:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['@angular/core', '@angular/common', '@angular/platform-browser', '@angular/compiler', 'rxjs'],
  },
  test: {
    server: { deps: { inline: ['vitest-auto-spy'] } },
  },
});
```

- `dedupe` makes every import of those packages resolve to one file.
- `server.deps.inline` makes Vitest process the library like your specs, so the setup file and the
  specs share one copy. The old top-level `test.deps.inline` moved here in Vitest 1 and no longer
  exists (checked against the Vitest 5.0 types).
- `rxjs` is on the list because an `Observable` from one copy fails the other copy's `instanceof`.

Check the [duplicate-copy report](#_2-one-copy-of-the-library-in-the-process) first. A second install,
or one install loaded as both ESM and CommonJS, is more common, and needs no `dedupe`. Use this
section when the report shows the same package resolved twice.

## In depth

Background for the options above. You do not need it to use them.

### Restoring properties when a hook throws

Vitest runs `afterEach` hooks in reverse registration order. The setup file registers its hook
first, so it runs last. If a spec's own `afterEach` throws, the hooks after it never run:

```ts
// in the spec file, and therefore running before the library's hook
afterEach(() => vi.restoreAllMocks()); // ← throws, and the cleanup below it never happens
```

This happened in practice. A spec moved to `provideAutoSpy(LayoutStateService, { gettersToSpyOn: [...] })`.
The restored getter then returned `undefined`, `ngOnDestroy` called it as a signal, and the
`TypeError` stopped the hook chain. The patch leaked, and the failure appeared in a different
`describe` as a template error.

So the library also registers an `onTestFinished` callback. Vitest runs it after the whole
`afterEach` chain. It does nothing unless the `afterEach` was skipped; then it puts the properties
back and warns at the test where it happened.

### Stray timers in depth

- Cancelling is recognised in more ways than `clearTimeout(handle)`. On Node, a library may cancel
  with `clearTimeout(+handle)` or `handle.close()`. Both count as cancelled.
- `promisify(setTimeout)` keeps working: the wrapper carries Node's custom `promisify`.
- jsdom answers each `setItem`, `removeItem` and `clear` on Web Storage with a real
  `setTimeout(…, 0)` for the `storage` event. So a file that only writes to `localStorage` still has
  timers queued. The library's own storage check runs under `withoutStrayTimerTracking`.
- `trackStrayTimers()` is all-or-nothing: if a host refuses one of the five patches, the rest are
  rolled back.
- The stack is captured when a timer is scheduled, at most forty frames below the tracking wrapper,
  so a zone or rxjs scheduler in between does not use them up. It is formatted only for strays.
- A callback scheduled after the previous file's sweep is counted against the next file. Its `file`
  field says which file really scheduled it.
- Timers from undici used to fail files with `setTimeout 499 ms … at new Promise (<anonymous>)`.
  Only the nearest stack frame outside this package and zone.js decides whether a timer is undici's.
- The per-timer cost of tracking is on the [performance page](/core/performance).
- With `strayTimers` off, Vitest's own "Async Leaks" report points its code frame at the
  `setTimeout` in your spec. The library's timer wrappers go through `vi.defineHelper`, so Vitest
  drops the frames inside `vitest-auto-spy` instead of showing them in place of your line.

### Global guard in depth

- The baseline is taken once per file, in `beforeAll`.
- While the guard is on, `Object.defineProperty`, `Object.defineProperties` and
  `Reflect.defineProperty` note which watched object got a non-configurable definition. After each
  test, only those objects are compared, so a test that seals nothing costs nothing.
- Once per file, after every `afterAll`, all watched objects are compared in full. That catches a
  patch in `afterAll`, a sloppy-mode `var`, or a `defineProperty` captured before the file started.
  Such a patch is reported against the file.
- The three functions are put back at the end of the file.
- Checking every existing property on every watched object after every test would cost more than the
  rest of the guard together (`globalThis` alone has hundreds of names). That is why redefining an
  existing name is not reported.
- `Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn() })` is the typical
  case: jsdom lacks the member, the patch adds a non-configurable property, and the next file's
  `mockValueProp` fails with `Cannot redefine property`.

### Mock registry in depth

- Vitest's registry is a module-level `Set` inside `@vitest/spy`. With `isolate: true` it is
  recreated per file; with `isolate: false` once per worker.
- There is no API for it. The library briefly patches `Set.prototype.forEach` while calling
  `vi.clearAllMocks()`: `forEach` passes the set itself as its third argument. The capture is
  checked against a probe mock; without a match, nothing is pruned.
- The split: whatever is in the registry when a file's hooks start was created while modules were
  imported, so it is kept. Everything added afterwards belongs to the file and goes when it ends. A
  naive prune would drop a shared `*.mock.ts` mock after the first file, and the second file would
  then fail on calls its predecessor made.
- `mockReset` restores an implementation only when it was passed to `vi.fn(implementation)`.
  `@vitest/spy` spells it `resetToMockImplementation ? mockImplementation : undefined`.
- Lost behaviour is restored in `beforeEach`, because Vitest applies `restoreMocks` / `mockReset` /
  `clearMocks` before the `beforeEach` hooks.
- In Vitest 4, `vi.restoreAllMocks()` walks a separate list that only `vi.spyOn` writes to. That is
  why it does not cause the reset problem.

### Angular build hint in depth

- The builder is recognised by a marker its own setup file leaves on `globalThis`
  (`Symbol.for('@angular/cli/vitest-mock-patch')`), before any user setup file runs. A plain Vitest
  run never reads anything.
- Under the builder, the version comes from the nearest `node_modules/@angular/build/package.json`
  above the working directory. This is the one place the library reads the disk: one file,
  read-only, through `process.getBuiltinModule`, so `/setup` still loads where there is no
  `process`. On a Node without `getBuiltinModule` (before 20.16 / 22.3), it stays silent.
- The builder runs Vitest with `isolate: false` by default, so a flag on `globalThis` keeps the notice
  to once per worker.
- Memory figures for the affected versions are on the [performance page](/core/performance).

### Web Storage in depth

Vitest copies a DOM environment's globals onto `globalThis` behind one filter:

```js
if (k in global) return KEYS.includes(k);
```

`Storage` is in `KEYS`; `localStorage` and `sessionStorage` are not. While Node had no Web Storage of
its own, `k in global` was false and both were copied. Node's own Web Storage made the key exist, so
the filter now asks `KEYS`, and the environment's storage never arrives. The filter runs before any
environment-specific code, so jsdom and happy-dom break the same way.

The repair tests the storage by using it, because each Node version breaks it differently: Node 25
has a `setItem` that throws, Node 26 has nothing.

The storage-spy repair (section 18) touches only a method that `vi.isMockFunction` says is a mock.
It does not compare against the prototype: jsdom's `Storage` turns a `defineProperty` of a method
into a stored item, so a prototype check would keep rewriting a storage that is merely odd. A mock is
repaired; a clean storage, a deliberate replacement and jsdom's stray item are left alone.

### Prototype guard in depth

Vitest builds a file's hooks by walking an object with `for…in`, so an enumerable key on
`Object.prototype` is treated as a hook list and spread. The error has no stack because every frame
is inside Vitest's own `dist`, which Vitest filters out of stacks. In one large suite this made the
report show `145 failed | 1613 passed` files over `11880 passed | 0 failed` tests, and the count
changed from run to run. `superagent`'s mime table (`typeMap[type].map is not a function`) broke the
same way.

The baseline is taken in the file's `beforeAll` and checked again after every `afterAll`.

### Document guard in depth

The check does not run in `afterEach`. A setup file registers its hooks after the `TestBed`'s, and
`afterEach` hooks run in reverse, so an `afterEach` check would run before the `TestBed` destroys the
fixtures. It would report every attribute and `<style>` that Angular removes on destroy. The test
check runs from `onTestFinished`, after the whole `afterEach` chain. The file check runs after every
`afterAll`.

Per-test cost: a few microseconds for attributes; `nodes` scales with the number of children. The
figures are on the [performance page](/core/performance).

Why the guard exists. Under `isolate: false` every spec file in a worker renders into one jsdom
document, and nothing resets it between files. In the project where this was found, a keyboard
component's effect set `data-reset-focus` on `document.body` and never removed it. A navigation
service elsewhere returns early when `document.querySelector('[data-reset-focus]')` matches. So the
service's spec failed 34 of its 209 tests, in about one full run in six: only when the two files
shared a worker, never on its own. No other guard saw it, because nothing was sealed, added to a
prototype or left running.

It finds leaks in production code too. On an 850-spec Angular application it exposed two components
that left `style="cursor: grabbing"` on `<body>` when destroyed mid-drag, and two tests that passed
only because of a CSS variable an earlier test had left behind.

An empty `class` or `style` counts as no attribute, because `classList.add` followed by
`classList.remove` leaves `class=""` where there was none. On one project that artifact was 9 of the
first 32 failures.

### Stray rejections in depth

A callback that runs after its test has ended settles its assertion too late: the test was already
reported green. When such an assertion fails, the failure surfaces only as a rejection nothing
handled. The same happens with an `async` helper called without `await`, and with a `TypeError`
thrown inside `import('…').then(…)` in production code. In one migrated Angular monorepo (1688 spec
files, 11 587 tests, green, exit code 0) this was hiding six real defects. Two of them were
assertions that were simply false.

### Console guard in depth

- The guard wraps `console` and forwards every call unchanged. Vitest's `stdout | file > test`
  labels, `onConsoleLog` and the output of a failing test stay as they were. This was checked on
  Vitest 4.1 and 5.0, with the guard in a setup file and two spec files sharing one worker under
  `isolate: false`.
- The DOM environment's own console is covered too. happy-dom's page console and jsdom's virtual
  console were given the worker's console when the environment was built, before Vitest replaced
  `globalThis.console`. So their lines reached stderr of a green run. The guard routes that console
  into the one it watches. happy-dom's
  `NotSupportedError: Failed to load iframe page … Iframe page loading is disabled` or jsdom's
  `Not implemented: navigation` is then reported against the test that caused it, with a
  `Likely cause:` line. A console spy or an `allow` pattern takes it like any other line.

### Globals restore in depth

The restore at the file boundary steps around two traps:

- **The descriptor is not the whole story.** A DOM environment installs window properties on
  `globalThis` as getter/setter pairs that forward to a map. `global.ResizeObserver = stub` runs the
  setter and leaves the descriptor unchanged. A restore that only redefined descriptors would report
  "nothing changed" while the stub kept answering. So the captured value goes back through the same
  setter.
- **The library's own wrappers stay.** `strayTimers` has wrapped `setTimeout`, and `strayListeners`
  has wrapped `addEventListener`. A restore that put every original back would remove that tracking
  at the first file boundary. The library marks the wrappers it installs, and the restore skips
  them.

### Listener guard in depth

The guard splits listeners the same way the mock-registry pruner does (section 9). A `beforeAll`
marks the listeners already on `window` and `document`: they were registered while the modules were
imported, for example by a framework's one-time setup. The `afterAll` removes everything added
after that. There is no special case for the first file: an import-time listener is in the baseline
of whichever file imports it, so it survives every later sweep.

### Global fake timers in depth

Both ends of the global fake timers are guarded, which is the half a hand-written pair of hooks gets
wrong. A spec that drives the clock itself would otherwise reach a second `vi.useRealTimers()`. Under
happy-dom that second call leaves the environment without `clearInterval`, which breaks during the
teardown of whichever file runs next and blames that file.

### Why the builder before 22.2 runs the setup file once

`@angular/build:unit-test` before 22.2.0, with coverage, serves each test file, setup files included,
as a small wrapper that imports the built bundle. The setup module stays resolved in the shared
environment, so its top level never runs again. Without coverage the same run is fine, which is why
it looks like "coverage broke the tests". `@angular/build` 22.2.0 fixes it (angular-cli pull request
34143): setup files are no longer wrapped, so their hooks are registered for every spec file under
`--coverage` too.

### Why a patch is not re-applied

`restoreMockedProps()` exists so that a patch does not outlive its file. A patch that re-applied
itself on every test would outlive its file under `isolate: false`. So the library reports the
problem instead of changing the rule. It is reported per object, not per property name, because two
files often patch a member of the same name on different objects.
