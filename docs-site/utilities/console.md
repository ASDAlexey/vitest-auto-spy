---
title: Console spies
description: Silent, typed spies over the global console from vitest-auto-spy/console - install them for the tests that expect output, assert on them, and they come off after each test.
---

# Console spies

`vitest-auto-spy/console` replaces `console.debug`, `error`, `info`, `log`, `time`, `timeEnd`,
`trace` and `warn` with silent, typed spies. Use it when your code logs and a test wants to assert on
the log, or to keep log output out of the test run. To check the whole output at once, including "nothing
else was logged", use [`consoleOutput()`](#everything-a-test-wrote-as-one-value), or
[`consoleLines()`](#everything-a-test-wrote-in-order) when the order matters too.

```ts
import { useConsoleSpies } from 'vitest-auto-spy/console';

describe('JobService', () => {
  const { consoleInfoSpy, consoleWarnSpy } = useConsoleSpies();

  it('logs the finished job', () => {
    service.doWork();

    expect(consoleInfoSpy).toHaveBeenCalledWith('done');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
```

## `useConsoleSpies()`

Installs the spies before each test of the enclosing `describe` (or file) and removes them after
each test. Returns the spies.

The exported constants (`consoleInfoSpy`, `consoleErrorSpy`, …) are the same objects, so you can also
import them directly:

```ts
import { consoleErrorSpy, useConsoleSpies } from 'vitest-auto-spy/console';

useConsoleSpies();

it('reports the failure', () => {
  service.doWork();
  expect(consoleErrorSpy).toHaveBeenCalledWith('boom');
});
```

If every test of the file expects output, call `installConsoleSpies()` once at the top of the file
instead.

It works on Vitest, `node:test`, Bun and Rstest. It registers its hooks on the runner whose entry you
imported (`vitest-auto-spy/node`, `vitest-auto-spy/bun`, `vitest-auto-spy/rstest`), and on Vitest
otherwise. `vitest-auto-spy/console` does not import the `vitest` package, so it loads without it.

If no runner hooks can be found, `useConsoleSpies()` throws and names the entries to import. You can
always write the pair in your runner's own hooks:

```ts
import { installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies());
afterEach(() => restoreConsole());
```

**Common mistake:** a bare `useConsoleSpies();` in a `describe` body trips the `vitest/require-hook`
lint rule. Add `autoSpy.hookRegisteringHelpers` from `vitest-auto-spy/eslint-plugin` to that rule's
`allowedFunctionCalls`; see
[Alongside `vitest/require-hook`](/utilities/eslint-plugin#alongside-vitest-require-hook).

### Everything a test wrote, as one value {#everything-a-test-wrote-as-one-value}

`consoleOutput()` returns every call the spies recorded, grouped by channel (`debug`, `error`,
`info`, `log`, `trace`, `warn`), with the arguments of each call. Channels nobody wrote to are left
out. Compare it exactly, and any extra line fails the test with a full diff. `toHaveBeenCalledWith`
on one spy cannot do that: it misses an unexpected `console.warn`.

```ts
import { consoleOutput, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies());
afterEach(() => restoreConsole());

it('reports the dry run and nothing else', () => {
  cli.run(['--dry-run']);

  expect(consoleOutput()).toStrictEqual({ info: [['dry run: 3 files']] });
});

it('stays silent on a clean run', () => {
  cli.run([]);

  expect(consoleOutput()).toStrictEqual({});
});
```

`time` and `timeEnd` are left out: `timeEnd` prints a duration no test can predict.

**Common mistake:** calling it when the spies are not installed, for example after
`restoreConsole()`. It throws, because an empty result would look like silence.

### Everything a test wrote, in order

`consoleLines()` returns one array across all channels, in call order. Each entry is the channel
followed by the call's arguments. Use it when order matters, for example a warning before the result.

```ts
import { consoleLines, useConsoleSpies } from 'vitest-auto-spy/console';

describe('cli', () => {
  useConsoleSpies();

  it('warns before it reports', () => {
    cli.run(['--dry-run']);

    expect(consoleLines()).toStrictEqual([
      ['warn', 'deprecated flag'],
      ['info', 'done'],
    ]);
  });
});
```

`time` and `timeEnd` are left out here too. `vi.clearAllMocks()` or `clearMocks: true` between tests
does not break the order.

**Common mistake:** giving a console spy its own `mockImplementation` or `mockReturnValue`. Then the
call order is no longer recorded, so `consoleLines()` throws instead of guessing. Assert on
`consoleOutput()` in that case.

### Why not rely on the import {#why-not-rely-on-the-import}

Importing the entry also installs the spies, the first time the module runs. Under `isolate: false`
that is once per worker: the spies go on in whichever file imported them first and silence every
later file in that worker. Nothing takes them off, and what they hide depends on file order.

Install them explicitly with `useConsoleSpies()` or `installConsoleSpies()`. The
[`no-import-time-console-spies`](/utilities/eslint-rules#no-import-time-console-spies) lint rule
reports specs that rely on the import. The install on import is kept only for runs without the
[stray-console guard](#under-the-stray-console-guard); under the guard, the import installs nothing.

## Exports

| Export                                                                                                                                              | What it is                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `consoleDebugSpy`, `consoleErrorSpy`, `consoleInfoSpy`, `consoleLogSpy`, `consoleTimeSpy`, `consoleTimeEndSpy`, `consoleTraceSpy`, `consoleWarnSpy` | One spy per method, type `ConsoleMethodSpy`                                                |
| `useConsoleSpies()`                                                                                                                                 | Install before each test, remove after; returns the spies                                  |
| `installConsoleSpies()`                                                                                                                             | Install now; returns the `ConsoleSpies` object                                             |
| `restoreConsole()`                                                                                                                                  | Put the real methods back                                                                  |
| `resetConsoleSpies()`                                                                                                                               | Clear recorded calls, keep the spies installed                                             |
| `consoleOutput()`                                                                                                                                   | All calls grouped by channel, type `ConsoleOutput` keyed by `ConsoleChannel`               |
| `consoleLines()`                                                                                                                                    | All calls in order, type `ConsoleLine[]` (`[channel: ConsoleChannel, ...args: unknown[]]`) |

## Housekeeping

```ts
import { installConsoleSpies, resetConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

resetConsoleSpies(); // clear the recorded calls
restoreConsole(); // put the original console methods back
installConsoleSpies(); // install again after a restore; calling it twice is safe
```

- `resetConsoleSpies()` clears recorded calls but keeps the spies installed. `clearMocks: true` in
  the Vitest config does this before each test. [`setupAutoSpy()`](/utilities/setup) does it after
  each test, through its `resetConsoleSpies` option (on by default). Turn that option off only for a
  spec that asserts on what an earlier test logged.
- `restoreConsole()` puts the original methods back and clears what the spies recorded. The spy
  objects stay, so `consoleErrorSpy` and the other exports keep working after the next install.
- `installConsoleSpies()` always returns the same `ConsoleSpies` object. If something removed the
  spies from `console`, it puts them back.
- The spies survive `vi.resetModules()`. A fresh copy of the module still finds the real console
  methods, so `restoreConsole()` never leaves a stale spy on `console`.

## Under the stray-console guard

[`setupAutoSpy({ strayConsole: 'throw' })`](/utilities/setup#_16-console-output-nothing-absorbed)
fails a test that writes to the console with nothing to absorb the output. These spies absorb it.
Three things change while the guard is on.

**The import installs nothing.** It only creates the spies. Install them where you need them:

```ts
import { consoleWarnSpy, useConsoleSpies } from 'vitest-auto-spy/console';

useConsoleSpies(); // this file's tests; or installConsoleSpies() at the top of the file

it('warns about the deprecated flag', () => {
  service.configure({ legacy: true });

  expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('legacy'));
});
```

**The spies do not outlive their scope.** Installed in a test or a `beforeEach`, they come off after
the test. Installed at the top of the file, they come off after the file. Spies installed by an
earlier import are removed when the guard turns on.

**What the DOM environment writes reaches the spies too.** happy-dom's page console and jsdom's
virtual console used to write past every spy. The guard routes them to the console the spies sit
on. So `consoleErrorSpy` absorbs happy-dom's `NotSupportedError … Iframe page loading is disabled`
like any other `console.error`, and the test can assert it.

**Common mistake:** `vi.spyOn(console, 'error')` without an implementation. It passes the call on, so
the line still prints and the guard still fails the test:
`vi.spyOn(console, 'error') calls through — add .mockImplementation(() => undefined).` The
[`no-passthrough-console-spy`](/utilities/eslint-rules#no-passthrough-console-spy) lint rule reports
it before the run.

Without the guard, nothing here changes: importing the entry installs the spies, as before.

## Runtimes

The spies are built on the registered [`MockAdapter`](../runtimes/vitest) (the link between the
library and your runner's `vi.fn()` / `mock()`), not on `vi.spyOn` directly. Import your runtime
entry (`vitest-auto-spy/bun`, `vitest-auto-spy/node`) **before** `vitest-auto-spy/console`, and the
console spies use that runner's mocks.

On Vitest with no runtime entry imported, the default adapter uses Vitest's own `vi`. On another
runner, the spies wait for that runner's entry. So if `/console` is imported before `/node` (a sorted
import list does that), it creates nothing yet. The first `installConsoleSpies()` or
`useConsoleSpies()` creates the spies, and the exported `consoleErrorSpy` and the rest pick them up.

## Fully detached alternative

To leave the real `console` alone, inject a typed in-memory console instead. `createAutoMock<Console>()`
gives you one for code that takes a logger:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const fakeConsole = createAutoMock<Console>();
const service = new ReportService(fakeConsole);

service.doWork();

expect(fakeConsole.info).toHaveBeenCalledWith('done');
```
