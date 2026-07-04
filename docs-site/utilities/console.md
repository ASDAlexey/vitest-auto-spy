# Console spies

Console spying lives behind the `vitest-auto-spy/console` subpath. Importing the entry (in a test
file or your Vitest setup file) replaces `console.debug` / `error` / `info` / `log` / `time` /
`timeEnd` / `trace` / `warn` with **silent, fully-typed spies** and exports each one ready to
assert — no `vi.spyOn(console, 'info')` boilerplate in every suite, no log output polluting the
test run:

```ts
import { consoleInfoSpy, consoleWarnSpy } from 'vitest-auto-spy/console';

service.doWork();

expect(consoleInfoSpy).toHaveBeenCalledWith('done');
expect(consoleWarnSpy).not.toHaveBeenCalled();
```

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
- `restoreConsole()` undoes the patching entirely and forgets the installed spies.
- `installConsoleSpies()` returns the full `ConsoleSpies` bag; calling it while spies are
  installed returns the same bag.

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
