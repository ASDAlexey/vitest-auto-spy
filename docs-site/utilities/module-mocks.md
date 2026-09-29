---
title: Module mocks that did nothing
description: assertMocked proves a vi.mock() applied, moduleNamespace gives a mock factory the shape libraries expect, and adoptMock adds calledWith and resolveWith to the mocks it built.
---

# Module mocks that did nothing

`vi.mock()` can fail silently: when a bundler has already inlined the module, the mock does nothing
and prints no warning. These three helpers make module mocks safe:

- `assertMocked` fails the test when a `vi.mock()` did not apply;
- `moduleNamespace` gives a mock factory the shape libraries expect (`default`, `__esModule`);
- `adoptMock` adds `calledWith`, `resolveWith` and the other helpers to a mock a factory built.

```ts
import { adoptMock, assertMocked } from 'vitest-auto-spy';

import * as api from './api';
import { greet } from './greeting';

vi.mock('./api', () => ({ loadUser: vi.fn() }));

beforeEach(() => {
  assertMocked(api, { specifier: './api', exports: ['loadUser'] });
});

it('greets the user it loaded', async () => {
  adoptMock(api.loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

  await expect(greet(7)).resolves.toBe('Hello, Ada');
});
```

## `assertMocked(namespace, options?)`

Checks that a module mock applied, and fails at that line, naming the module, if it did not. Returns
the namespace. Call it in `beforeEach`, or right after a dynamic import, so a failure is reported as
a test failure.

```ts
import * as engine from '@app/pricing-engine';

vi.mock('@app/pricing-engine');

beforeEach(() => {
  assertMocked(engine, { specifier: '@app/pricing-engine', exports: ['createEngine'] });
});
```

| Option      | Type       | Default                       | Meaning                                                 |
| ----------- | ---------- | ----------------------------- | ------------------------------------------------------- |
| `specifier` | `string`   | —                             | The path you passed to `vi.mock`, quoted in the failure |
| `exports`   | `string[]` | at least one export is a mock | Every listed export must be a runner mock               |

Without `exports`, it checks that at least one export is a mock. List `exports` when your factory
mocks part of a module and re-exports the rest: otherwise a factory that forgot to mock the export
your test uses still passes the check.

The failure names the export that stayed real and the likely cause:

```text
[vitest-auto-spy] assertMocked('./api'): loadUser is the real function — the `vi.mock('./api')` for
this file did not apply. The code under test reaches the module through another path (a barrel, an
alias, a bundled entry) — `vi.mock` the specifier it imports, or pass the dependency in as an argument
or a provider.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/module-mocks#the-two-ways-vi-mock-becomes-a-no-op
```

**Common mistake:** `exports: []`. That often comes from an empty `Object.keys(stubs)`. An empty list
would check nothing, so it is rejected with an error.

### The two ways `vi.mock` becomes a no-op

- **A bundler already inlined the module.** Under `@angular/build:unit-test`, or `vite-node` given a
  pre-built entry, a workspace alias (`@scope/lib`) or a barrel file is already part of the bundle.
  There is nothing left for the mock to replace, and no warning is printed.
- **`isolate: false`, and the module is already loaded in the worker.** A built-in such as `node:fs`
  keeps whichever mock reached it first. The same spec passes or fails depending on file order. A run
  that is green locally and red in CI, at a different file each time, is this.

`vi.mock` cannot fix either. Stop mocking the module: pass the dependency in (a `TestBed` provider, a
constructor argument, a function parameter) and stub that value. See
[Provide a real seam](#provide-a-real-seam).

For the "green locally, red in CI" case, the failure blames the earlier file that loaded the module
first. Otherwise, it points at the path your code imports the module through.

## Provide a real seam

After `vi.mock` does nothing, the next attempt is usually `vi.spyOn` on the module. That fails loudly:

```ts
import * as appMetrics from '@app/domain-metrics';

vi.spyOn(appMetrics, 'injectAppMetrics'); // TypeError: Cannot redefine property: injectAppMetrics
```

It is the same cause. Once a bundler has inlined the module, its exports are read-only live bindings.
A live binding is a read-only link to the module's variable, not a normal object property. No spy
library can replace it: not `vi.spyOn`, not `jest.spyOn`, not `Object.defineProperty`.

When the redefinition goes through this library (accessor spies such as `observablePropsToSpyOn`, or
the `mock*Prop` helpers), you get the full explanation instead of the bare `TypeError`:

```
[vitest-auto-spy] Cannot spy on the 'get' accessor of 'injectAppMetrics': the property is not
configurable, so it cannot be redefined. The target is an ES module namespace.
An ES module namespace is what a bundler leaves behind once it has inlined a barrel or a workspace
alias (`@angular/build:unit-test`, a pre-bundled `vite-node` entry): the export is a live binding,
not a writable property, and no spy library — this one, `vi.spyOn`, `jest.spyOn` — can replace it.
`vi.mock()` of the same module is the silent version of this failure, not the fix.
Give the code under test a real seam and spy on that: inject the dependency, pass it in as an
argument, or reach it through a class or object your own code owns.
```

`mockValueProp` / `mockReadonlyProp` start with
`Cannot mock the property 'x': it is not configurable, so it cannot be redefined.` and share the
rest. A refused patch leaves nothing behind for `restoreMockedProps()` to undo.

**The fix is a change to the code under test, not to the test.** Three shapes, cheapest first:

```ts
// 1. Inject it. The consumer takes the dependency from DI, so the spec supplies a spy.
readonly #metrics = inject(AppMetrics);
// spec: TestBed.configureTestingModule({ providers: [provideAutoSpy(AppMetrics)] });

// 2. Pass it in. A function that takes its collaborator as an argument needs no mocking at all.
export function priceBasket(items: Item[], rate: RateLookup): number { … }
// spec: priceBasket(items, () => 1.2);

// 3. Own the indirection. Call the third-party function through a class you control,
//    and let every caller (and every spec) go through that class.
@Injectable({ providedIn: 'root' })
export class MetricsGateway {
  track(event: string): void {
    injectAppMetrics().track(event);
  }
}
```

All three survive the bundler. `vi.mock` and `vi.spyOn` on a module rely on a module boundary the
build may remove. A seam you wrote yourself is one the build has to keep.

Once the dependency is injected, [`trackInjections`](/utilities/track-injections) can assert which
dependencies your code actually asked for.

## `moduleNamespace(exports, options?)`

Wraps a mock factory's exports as `{ ...exports, default, __esModule: true }`. Use it in every
`vi.mock` factory for a library that runs as both CommonJS and ESM: such libraries read
`mod.default ?? mod`.

```ts
import { mockConstructor, moduleNamespace } from 'vitest-auto-spy';

vi.mock('shaka-player', () => moduleNamespace({ Player: mockConstructor(() => playerStub) }));
```

`default` is the whole namespace, unless your factory defines its own `default`.

| Option        | Type      | Default | Meaning                                                                       |
| ------------- | --------- | ------- | ----------------------------------------------------------------------------- |
| `lenient`     | `boolean` | `false` | An export the factory did not define reads as `undefined` instead of throwing |
| `passthrough` | `boolean` | `false` | Every function export becomes a spy that runs the real function               |

**Common mistake:** a factory that returns bare named exports. Vitest then throws
`No "default" export is defined on the mock` from inside the library, with a stack that names the
library instead of your factory.

### A module whose default export _is_ the dependency

Many packages export one function as their default: a date library, a player, a generated client.
Define `default` in the factory, and the namespace keeps it:

```ts
const format = vi.fn(() => 'Monday');

vi.mock('dayjs', () => moduleNamespace({ default: vi.fn(() => ({ format })) }));
```

`ModuleNamespace<T>` types `default` as the one your factory declared, or as the namespace
otherwise.

### `lenient`

Reads an export the factory did not define as `undefined` instead of throwing. Use it to port a Jest
suite first and tighten the factories later.

```ts
vi.mock('shaka-player', () => moduleNamespace({ Player }, { lenient: true }));
```

The strict default is better: it catches a factory that no longer matches its module. Jest did not
throw, though, so a ported suite may read exports it never stubbed. Then the error appears deep in
your app code, far from the test.

`then` and symbol keys always read as missing, in either mode: a namespace with a `then` would look
like a promise to `await import(…)`, which would never resolve.

### `passthrough`

Every function export becomes a spy that runs the real function until the test configures it. It
records every call either way. Pass the real module in:

```ts
vi.mock('./api', async (importOriginal) => moduleNamespace(await importOriginal<typeof import('./api')>(), { passthrough: true }));
```

It is Vitest's `vi.mock(path, { spy: true })` plus this library's helpers (`calledWith`,
`mustBeCalledWith`, `resolveWith`). It follows the same rules as
[`createSpyFromInstance(obj, { passthrough: true })`](/core/create-spy-from-class#passthrough):

- **A configured export no longer calls the real function.** A `calledWith(7)` setup answers
  `undefined` for `loadUser(1)`, as on any other spy.
- **`resetAutoSpy(api)` brings the real function back.**
- **The real function runs with the caller's `this`.** A method called as `api.load()` or through
  `.call(owner)` sees that `this`.
- **Classes and values stay as they are.** A class needs `new`; for that, use
  [`mockConstructor`](/utilities/constructor-doubles). Nested objects are not walked.

The exports keep the module's own function types. To reach the helpers, wrap an export with
[`adoptMock`](#adoptmock-mock-options), which returns a spy this library built unchanged:

```ts
import { loadUser } from './api';

adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });
```

## `adoptMock(mock, options?)`

Takes a mock that a `vi.mock` factory built and gives it this library's helpers (`calledWith`,
`resolveWith`, `mustBeCalledWith`, …). A factory's `vi.fn()` comes back typed as the real function,
so without it you only have `mockResolvedValue`.

```ts
import { adoptMock } from 'vitest-auto-spy';

import { loadUser } from './api';
import { greet } from './greeting';

vi.mock('./api', () => ({ loadUser: vi.fn() }));

it('greets the user it loaded', async () => {
  adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

  await expect(greet(7)).resolves.toBe('Hello, Ada');
});
```

| Option | Type     | Default         | Meaning                                       |
| ------ | -------- | --------------- | --------------------------------------------- |
| `name` | `string` | the mock's name | What a `mustBeCalledWith` miss calls this spy |

- **It is the same object, not a copy.** Your code holds this mock through the mocked module, so a
  copy would configure nothing. Calls it already recorded stay recorded. It comes back typed as a
  spy with the export's own signature.
- **Nothing changes until you configure it.** An unconfigured call answers what the mock answered
  before: the implementation it was built with (`vi.fn(impl)`), or `undefined`. Once configured, the
  configuration decides. Arguments no `calledWith` matches get `undefined`, unless the spy has a
  default answer.
- **Runner resets keep the configuration.** Unlike a plain `vi.fn()`, `vi.resetAllMocks()`,
  `mockReset: true` and `mockRestore()` clear only the calls and keep the configuration, as on every
  spy this library builds.
  `resetAutoSpy(loadUser)`, or `resetAutoSpy(api)` on the namespace, drops the configuration.
- **Adopting twice is harmless.** The same mock, or a spy this library built, comes back unchanged.

**Common mistake:** adopting a plain function. It is refused with a pointer to `assertMocked`: a
plain function means the module mock did not apply.

### Where it works

| Runner                  | Adopts  | Notes                                                                                                                                                             |
| ----------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest `vi.fn()`        | yes     | The configuration survives `vi.resetAllMocks()`, `mockReset: true` and `mockRestore()`.                                                                           |
| Rstest `rstest.fn()`    | yes     | Same, through `rstest.resetAllMocks()`.                                                                                                                           |
| Bun `mock()`            | yes     | Bun's `mockReset` is read-only, so `jest.resetAllMocks()` drops the configuration, as on every spy on Bun. Reset with `resetAutoSpy`.                             |
| `node:test` `mock.fn()` | refused | It cannot report its implementation, and `mock.restoreAll()` would silently overwrite the configuration. Build the spy with `createFunctionSpy` and pass that in. |

### A spy that calls through

`vi.spyOn(obj, 'method')` without an implementation, and every export of
`vi.mock(path, { spy: true })`, call the real function but do not expose it to the library. Adopted,
such a mock answers `undefined` to an unconfigured call.

If you want a spy that records calls, runs the real code, and lets you configure one case, build it
that way from the start: [`passthrough`](#passthrough) for a module,
[`createSpyFromInstance(obj, { passthrough: true })`](/core/create-spy-from-class#passthrough) for
an object.

## `vi.doMock`, a dynamic import and `assertMocked`

`vi.doMock` is not hoisted, so it can differ per test. It applies only to modules imported **after**
it. A static import at the top of the file already holds the real module, and nothing fails. Use
this recipe:

```ts
import { adoptMock, assertMocked } from 'vitest-auto-spy';

afterEach(() => {
  vi.doUnmock('./api');
  vi.resetModules();
});

it('greets the user it loaded', async () => {
  vi.doMock('./api', () => ({ loadUser: vi.fn() }));

  const api = assertMocked(await import('./api'), { specifier: './api', exports: ['loadUser'] });
  const { greet } = await import('./greeting');

  adoptMock(api.loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

  await expect(greet(7)).resolves.toBe('Hello, Ada');
});
```

1. **Import the code under test after `vi.doMock` too.** A top-level import of `./greeting` already
   bound the real `./api`, and `assertMocked` cannot see that.
2. **Call `vi.resetModules()` in `afterEach`,** so the next test's import loads the module again.
3. **Call `assertMocked` on the namespace the import returned.** Under a bundler, `vi.doMock` is as
   silent as `vi.mock`, and this line tells you.

## What this does not do

There is no `mockModule('x', factory)` helper. Vitest hoists the literal `vi.mock` call, and a
wrapper around it would be hoisted as a call to a function that does not exist yet. To share a
fixture between the factory and the tests, use `vi.hoisted`:

```ts
const stripe = vi.hoisted(() => {
  const charge = vi.fn();

  return { charge, createClient: vi.fn(() => ({ charge })) };
});

vi.mock('stripe', () => moduleNamespace(stripe));
```
