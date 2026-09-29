# vitest-auto-spy — Other adapters

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 15. Other adapters

```ts
// NestJS
import { createNestUnit, injectSpy, provideAutoSpy } from 'vitest-auto-spy/nestjs';
const moduleRef = await Test.createTestingModule({ providers: [provideAutoSpy(MyService)] }).compile();
const spy = injectSpy(moduleRef, MyService);
// or no module at all: the unit built from its DI metadata, every unprovided token spied
const { unit, spies } = createNestUnit(CartService, { expose: [PricingService], providers: [{ provide: 'CONFIG', useValue: cfg }] });
spies.get(TaxService).rate.mockReturnValue(0.2); // spies.get refuses a token the unit never asked for, and an exposed class
spies.autoSpiedTokens(); // what nothing provided — the list the refusal message prints; spies.exposedTokens() is what `expose` actually built
// needs what Nest needs: emitDecoratorMetadata (tsc / SWC, not esbuild) and reflect-metadata loaded first
// /nestjs imports no `vitest`: on node --test / bun test / Rstest import the runtime entry and its mocks are built;
// createNestUnit is also exported from /node and /bun — `import { createNestUnit } from 'vitest-auto-spy/node'`

// Vue / Pinia — provideAutoSpy(token, Class, methodsOrConfig?) returns a `global.provide` map
import { provideAutoSpy } from 'vitest-auto-spy/vue';
const provide = provideAutoSpy(UserServiceKey, UserService);
provide[UserServiceKey].getName.mockReturnValue('Ada');
mount(Greeting, { global: { provide } });
// a setup-store (`defineStore('x', () => …)`) is not a class — use createAutoMock<T>() there

// React / Svelte — the core API, re-exported with the right adapter registered
import { createSpyFromClass } from 'vitest-auto-spy/react';
```

**Types without Vitest.** `/node`, `/bun`, `/bun-angular`, `/rstest`, `/jasmine-compat`,
`/angular-router`, `/console`, `/nestjs`, `/observer-spy` and `/rxjs` type-check with no Vitest
installed and `skipLibCheck: false`. `Spy<T>` is one type on every entry: once the program imports an
entry that loads Vitest (the root, `/angular`, `/react`, `/vue`, `/svelte`, `/setup`, `/jasmine`,
`/dom-stubs`, `/angular/doubles`), method spies are Vitest's `MockInstance`; without one they have
the same members except `mockThrow` (`failWith()` works everywhere). On Bun and `node:test`,
`returnSubject()` is rxjs's `Subject` once `/rxjs` is imported.

**Common mistake:** a Vitest suite that imports only `/nestjs`, `/observer-spy` or `/rxjs` gets
`Property 'mockThrow' does not exist`, or a spy not assignable to a `MockInstance` annotation. Add
`import type {} from 'vitest-auto-spy';` to any one file.

Console spies — `installConsoleSpies()` replaces `console.debug` / `error` / `info` / `log` / `time` /
`timeEnd` / `trace` / `warn` with silent typed spies, named `console<Method>Spy`. Install them per test
and take them off after it — `useConsoleSpies()` registers exactly that pair in the enclosing `describe`:

```ts
import { useConsoleSpies } from 'vitest-auto-spy/console';

const { consoleInfoSpy } = useConsoleSpies();

expect(consoleInfoSpy).toHaveBeenCalledWith('done'); // the output is silenced, not printed
```

It registers them on the runner whose entry was imported — `/node` registers `node:test`'s hooks,
`/bun` Bun's, `/rstest` Rstest's — and on Vitest's own otherwise. The entry never imports `vitest`,
so it loads on every runner with no Vitest installed, and its declarations do not name `vitest` either. Under `vitest/require-hook`, spread
`autoSpy.hookRegisteringHelpers` into `allowedFunctionCalls` (§16). `consoleLines()` is everything
logged in call order across channels — `[['warn', 'deprecated'], ['info', 'done']]` — where
`consoleOutput()` groups per channel (§10).

The exported `consoleInfoSpy` & co. are the same objects; `restoreConsole()` keeps them and clears
their calls. **Do not rely on the import to install them**: it does so once per worker, so under
`isolate: false` the spies go on in whichever file imported them first and silence every later file
(`no-import-time-console-spies` reports it). Under `setupAutoSpy({ strayConsole })` the import installs
nothing at all.

The spies survive `vi.resetModules()`: the real methods are kept on one shared table, and a spy of
another module copy is never taken for an original.

Import order does not matter: imported before any runtime entry, `/console` builds nothing until
the first `installConsoleSpies()` / `useConsoleSpies()`, and the exported spies are live bindings
that pick them up. Prefer not to touch the real global? `createAutoMock<Console>()` gives a detached one.

### `trackNodeMocks` for `node:test` memory

`node:test` keeps every `mock.fn()` in one process-wide `MockTracker` for the life of the process.
On a long suite that is real memory. `trackNodeMocks()` puts this library's spies on a tracker it
owns and replaces it per test, so the memory stays near the baseline.

```ts
import { before } from 'node:test';
import { trackNodeMocks } from 'vitest-auto-spy/node';

before(() => trackNodeMocks()); // opt-in, idempotent, returns the undo

// by hand, for a concurrent suite: pruneNodeMocks() → how many were dropped; countNodeMocks() → how many are held
```

It never calls `mock.reset()` — that would restore and forget the `mock.fn()` the spec made itself —
and it never throws: the class is reached through the undocumented `mock.constructor`, so the
constructed tracker is probed first and any failure leaves spies on `node:test`'s own tracker.
Spies created **before** the call stay there too. `mock.reset()` in `afterEach` is the fallback.

**A `node:test` spy prints under its method name.** `mock.fn()` takes no name and has no
`mockName()`; the adapter names the implementation at creation, and `displayName` is set on the
mock alongside it. The name survives `mock.reset()`, `mock.restore()`,
`resetCalls()` and a `mockImplementation()` swap, and it is what `node:assert` diffs, what
`util.inspect()` prints and what this package's own messages read. `getMockName()` does not exist there: read `spy.method.name`. Nothing labels a
mock in `node:test`'s reporter output on its own. Full account:
<https://asdalexey.github.io/vitest-auto-spy/runtimes/node#spy-names>.

### Rstest

`vitest-auto-spy/rstest` drives the same core through `rstest.fn()` / `rstest.spyOn()`. Rstest
implements the Jest/Vitest mock surface, so **none of the `node:test` differences apply**:
`spy.method.mock.calls[0]` is a bare argument array, the `mockReturnValue` family is native, and
`gettersToSpyOn` / `settersToSpyOn` go through `rstest.spyOn(obj, 'prop', 'get' | 'set')` rather than
the redefinition fallback. `rstest.clearAllMocks()`, `rstest.resetAllMocks()` and the
`clearMocks: true` / `resetMocks: true` config keys reach spies built by `createSpyFromClass` — the
entry plants one sentinel mock for it, and there is nothing to enable.

Two things are not there. `vitest-auto-spy/setup` is wired to Vitest's hooks, so `setupAutoSpy()` and
the fake-timer helpers are Vitest-only — on Rstest, import `vitest-auto-spy/rstest` once in the setup
file, which is the part a setup file is for. `trackNodeMocks()` is `node:test`-only and is not needed:
Rstest drops its mock registry between files, like Vitest and Bun.

Reach for this entry when the suite already runs on Rstest (0.x), typically an Rspack project
reusing its bundler config for tests. Vitest stays the zero-config default. Full account:
<https://asdalexey.github.io/vitest-auto-spy/runtimes/rstest>.
