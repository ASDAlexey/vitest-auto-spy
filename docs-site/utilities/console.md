---
title: Console spies
description: Silent, typed spies over the global console — installed per test with installConsoleSpies(), restored in afterEach, and what absorbs output under the stray-console guard.
---

# Console spies

Console spying lives behind the `vitest-auto-spy/console` subpath: `console.debug` / `error` /
`info` / `log` / `time` / `timeEnd` / `trace` / `warn` replaced with **silent, fully-typed spies**,
ready to assert — no `vi.spyOn(console, 'info')` boilerplate in every suite, no log output polluting
the test run. Install them for the tests that expect output, and take them off again:

```ts
import { type ConsoleSpies, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

let consoleSpies: ConsoleSpies;

beforeEach(() => {
  consoleSpies = installConsoleSpies();
});

afterEach(() => restoreConsole());

it('logs the finished job', () => {
  service.doWork();

  expect(consoleSpies.consoleInfoSpy).toHaveBeenCalledWith('done');
  expect(consoleSpies.consoleWarnSpy).not.toHaveBeenCalled();
});
```

The exported constants — `consoleInfoSpy`, `consoleErrorSpy`, … — are the same objects as the bag
`installConsoleSpies()` returns, so `expect(consoleErrorSpy)` is the same assertion. When every test
of the file expects output, `installConsoleSpies()` once at the top of the file does the same for the
whole file.

### Why not rely on the import {#why-not-rely-on-the-import}

Importing the entry also installs the spies, on the module's first evaluation — and under
`isolate: false` that is once per **worker**: the spies go on in whichever file imported them first,
silence every later file of the worker, and nothing in any of those files takes them off. What that
hides depends on file order. On a 1759-file Angular consumer, 32 of the 39 files importing the entry
relied on exactly that; the moment three files started calling `restoreConsole()` in an
`afterEach`, 12 tests in 5 other files failed and output the silence had hidden surfaced in 7 files.
The [`no-import-time-console-spies`](/utilities/eslint-rules#no-import-time-console-spies) rule
reports the pattern. The import-time install is kept only for a run without the stray-console guard,
for compatibility; under the guard the import installs nothing.

## Exports

One spy per patched method: `consoleDebugSpy`, `consoleErrorSpy`, `consoleInfoSpy`,
`consoleLogSpy`, `consoleTimeSpy`, `consoleTimeEndSpy`, `consoleTraceSpy`, `consoleWarnSpy`
(type `ConsoleMethodSpy`).

## Housekeeping

```ts
import { installConsoleSpies, resetConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

resetConsoleSpies(); // clear the recorded calls (Vitest's `clearMocks: true` does this per test)
restoreConsole(); // put the original console methods back
installConsoleSpies(); // re-install after a restore (idempotent otherwise)
```

- `resetConsoleSpies()` clears recorded calls but keeps the spies installed. With
  `clearMocks: true` in your Vitest config this happens automatically before each test.
- `restoreConsole()` puts the original methods back and clears what the spies recorded. The spies
  themselves are kept, so `consoleErrorSpy` and the other exports stay live for the next install —
  under `isolate: false` a restore that forgot them left every later file of the worker asserting on
  spies nothing could reach.
- `installConsoleSpies()` returns the full `ConsoleSpies` bag — always the same one — and puts its
  spies back on the console if something took them off.

## Under the stray-console guard

[`setupAutoSpy({ strayConsole: 'throw' })`](/utilities/setup#_16-console-output-nothing-absorbed)
fails a test on any console output nothing absorbed, and these spies are what absorbs it. Two things
change while the guard is on.

**The import installs nothing.** Under `isolate: false` a module is evaluated once per worker, so the
import-time install put the spies on the console in whichever file imported them first and left them
there for every later file of the worker — silencing exactly the output the guard exists to see. So
the import only builds the spies, and `installConsoleSpies()` puts the same objects on the console:

```ts
import { consoleWarnSpy, installConsoleSpies } from 'vitest-auto-spy/console';

beforeEach(() => installConsoleSpies()); // this file's tests — or call it at the top of the file

it('warns about the deprecated flag', () => {
  service.configure({ legacy: true });

  expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('legacy'));
});
```

**The spies do not outlive their scope.** Installed in a test or a `beforeEach`, they come off after
the test; installed at the top of the file, after the file. Spies an import installed before the guard
armed are taken off when it does. A `vi.spyOn(console, m)` with no implementation is not a substitute:
it calls through, so the line still prints and the guard still fails the test — the
[`no-passthrough-console-spy`](/utilities/eslint-rules#no-passthrough-console-spy) rule reports it.

Without the guard nothing here changes: importing the entry installs the spies, as it always did.

## Runtimes

The spies are built on the registered [`MockAdapter`](../runtimes/vitest), not on `vi.spyOn`
directly — import your runtime entry (`vitest-auto-spy/bun`, `vitest-auto-spy/node`) **before**
`vitest-auto-spy/console` and the console spies are driven by that runner's mocks. With no prior
runtime entry, the default Vitest adapter is registered.

## Fully detached alternative

Prefer not to touch the real global? `createAutoMock<Console>()` gives you a typed, in-memory
console to inject into code that takes a logger:

```ts
import { createAutoMock } from 'vitest-auto-spy';

const fakeConsole = createAutoMock<Console>();
const service = new ReportService(fakeConsole);

service.doWork();

expect(fakeConsole.info).toHaveBeenCalledWith('done');
```
