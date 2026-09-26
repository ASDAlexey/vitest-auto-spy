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

// Vue / Pinia — provideAutoSpy(token, Class, methodsOrConfig?) returns a `global.provide` map
import { provideAutoSpy } from 'vitest-auto-spy/vue';
const provide = provideAutoSpy(UserServiceKey, UserService);
provide[UserServiceKey].getName.mockReturnValue('Ada');
mount(Greeting, { global: { provide } });
// a setup-store (`defineStore('x', () => …)`) is not a class — use createAutoMock<T>() there

// React / Svelte — the core API, re-exported with the right adapter registered
import { createSpyFromClass } from 'vitest-auto-spy/react';
```

Console spies — `installConsoleSpies()` replaces `console.debug` / `error` / `info` / `log` / `time` /
`timeEnd` / `trace` / `warn` with silent typed spies, named `console<Method>Spy`. Install them per test
and take them off after it:

```ts
import { type ConsoleSpies, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

let consoleSpies: ConsoleSpies;

beforeEach(() => {
  consoleSpies = installConsoleSpies();
});
afterEach(() => restoreConsole());

expect(consoleSpies.consoleInfoSpy).toHaveBeenCalledWith('done'); // the output is silenced, not printed
```

The exported `consoleInfoSpy` & co. are the same objects; `restoreConsole()` keeps them and clears
their calls. **Do not rely on the import to install them**: it does so once per worker, so under
`isolate: false` the spies go on in whichever file imported them first and silence every later file
(`no-import-time-console-spies` reports it). Under `setupAutoSpy({ strayConsole })` the import installs
nothing at all.

The spies survive `vi.resetModules()`. A fresh copy of the module used to record the previous copy's
spy as "the real `console.warn`", after which `restoreConsole()` installed that dead spy for the rest
of the worker and every log from then on went nowhere. The real methods are kept on one shared table
and a spy of another copy is refused as an original.

Import your runtime entry (`…/bun`, `…/node`) **before** `…/console`, or it registers the Vitest
adapter. Prefer not to touch the real global? `createAutoMock<Console>()` gives a detached one.
