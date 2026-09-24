---
title: Module mocks that did nothing
description: assertMocked, moduleNamespace and adoptMock — prove a vi.mock() applied under a bundler, give its factory the shape an interop probe recognises, and configure the mocks it built with calledWith.
---

# Module mocks that did nothing

```ts
import { adoptMock, assertMocked, moduleNamespace } from 'vitest-auto-spy';
```

`vi.mock()` is the one piece of a ported suite that can fail **silently**. It is a transform over
the module graph, so it has nothing to say when the graph is not what the spec assumed — and what
follows is either a test passing for the wrong reason or a failure with no connection to mocking.

## `assertMocked(namespace, options?)`

```ts
import * as engine from '@app/pricing-engine';

vi.mock('@app/pricing-engine');

beforeEach(() => {
  assertMocked(engine, { specifier: '@app/pricing-engine', exports: ['createEngine'] });
});
```

Fails at the line that assumed the mock, naming the module. Without `exports` it checks that _some_
export is a runner mock; with it, that each named one is — which is what a factory that stubs part
of a module and re-exports the rest needs, since a factory that lost the one export the test drives
still looks mocked from the outside.

An **empty** `exports` list is refused rather than accepted. `exports: []` — which is what
`Object.keys(stubs)` or a filtered constant produces when it comes out empty — used to take the
named-exports branch, find nothing to check and return, so the one call in the file whose job is to
prove the mock applied proved nothing.

### The two ways `vi.mock` becomes a no-op

**A bundler already inlined the module.** Under `@angular/build:unit-test`, or `vite-node` handed a
pre-built entry, a workspace alias (`@scope/lib`) or a barrel is part of the bundle by the time the
mock would be installed. There is nothing left to intercept. No warning is printed.

**`isolate: false` and a module already in the worker graph.** A built-in such as `node:fs` keeps
whichever mock reached it first, so the same spec passes or fails depending on the order the worker
picked up the files. A run that is green locally and red in CI, at a different file each time, is
this.

Neither has a fix inside `vi.mock`. What works is not mocking the module at all: pass the dependency
in — a TestBed provider, a constructor argument, a function parameter — and stub the value.
`assertMocked` is what turns the silent case into a sentence, so that conclusion is reached in one
run rather than three.

## Provide a real seam

The silent `vi.mock` has a loud twin, and it is the one people hit _next_ — after the mock does
nothing, the natural move is to reach for a spy instead:

```ts
import * as appMetrics from '@app/domain-metrics';

vi.spyOn(appMetrics, 'injectAppMetrics'); // TypeError: Cannot redefine property: injectAppMetrics
```

Same cause, opposite symptom. Once a bundler has inlined the barrel, its exports are live bindings
on a module namespace object: not configurable, not writable, not replaceable by `vi.spyOn`,
`jest.spyOn`, `Object.defineProperty` or anything else. There is no spy library that can win this,
and the `TypeError` says none of that — it names the property and stops.

A `vi.spyOn` written by hand in a spec is not something this package can see, so that one still
reports the bare `TypeError`. Everywhere the redefinition goes through the library the same failure
is re-thrown with the whole sentence, naming the property, what the target actually is, and the way
out — that is the accessor spies (an `observablePropsToSpyOn` / getter-setter spy taken on an
auto-spy) and the `mock*Prop` helpers alike:

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

`mockValueProp` / `mockReadonlyProp` word the first line for what they do
(`Cannot mock the property 'x': it is not configurable, so it cannot be redefined.`) and share the
rest. They also leave nothing behind: the undo journal is written only once the redefinition has
succeeded, so a refused patch cannot come back a second time as a `restoreMockedProps()` teardown
failure for something that never happened.

**The seam is a change to the code under test, not to the test.** Three shapes, cheapest first:

```ts
// 1. Inject it. The consumer takes the dependency from DI, so the spec supplies a double.
readonly #metrics = inject(AppMetrics);
// spec: TestBed.configureTestingModule({ providers: [provideAutoSpy(AppMetrics)] });

// 2. Pass it in. A free function that takes its collaborator as an argument needs no mocking at all.
export function priceBasket(items: Item[], rate: RateLookup): number { … }
// spec: priceBasket(items, () => 1.2);

// 3. Own the indirection. Re-export the third-party call through a class you control,
//    and let every caller — and every spec — go through that.
@Service()
export class MetricsGateway {
  track(event: string): void {
    injectAppMetrics().track(event);
  }
}
```

All three survive the bundler, because none of them depends on the module graph having a boundary
where the spec wants one. That is the point: `vi.mock` and `vi.spyOn` on a module both bet on a
boundary the build is free to remove, and a seam you wrote yourself is one the build has to keep.

Once the dependency is injected, [`trackInjections`](/utilities/track-injections) is what asserts
_which_ collaborators the entry point actually asked for — the question the barrel mock was usually
standing in for.

## `moduleNamespace(exports, options?)`

```ts
vi.mock('shaka-player', () => moduleNamespace({ Player: mockConstructor(() => playerStub) }));
```

Returns `{ ...exports, default, __esModule: true }` — the shape any dependency written to run as
both CommonJS and ESM probes for with `mod.default ?? mod`. `default` is the whole namespace, unless
the factory spelled one out.

The missing `default` is the failure this removes. A factory returning bare named exports makes
Vitest throw `No "default" export is defined on the mock` **from inside that dependency**, with a
stack that names the library rather than the factory three lines up in the spec.

### A module whose default export _is_ the dependency

A date library, a player, a generated client — plenty of packages export one callable as their
default, and that is the thing the spec stubs:

```ts
const format = vi.fn(() => 'Monday');

vi.mock('dayjs', () => moduleNamespace({ default: vi.fn(() => ({ format })) }));
```

The `default` the factory wrote is the `default` the namespace carries. Replacing it with the
namespace object is what turned `default(…)` into `default is not a function` inside the dependency
— the same failure this helper exists to remove, arriving from the other side. `ModuleNamespace<T>`
is typed to match: `default` is the type of the `default` the factory declared where there is one,
and the namespace otherwise.

### `lenient`

```ts
vi.mock('shaka-player', () => moduleNamespace({ Player }, { lenient: true }));
```

Reads an export the factory did not define as `undefined` instead of throwing.

The strict default is the better one: it catches a factory that has drifted from the module it
stands in for. But Jest did not throw, so a suite ported from it can be reaching for exports it
never stubbed — and there the guard fails inside production code, several frames from the assertion
that would have said what the test actually wanted. Turn leniency on to port first and tighten
later.

`then` and symbol keys are never claimed, whatever the mode: a namespace that answers to `then`
would be treated as a promise by `await import(…)` and never resolve.

### `passthrough`

```ts
vi.mock('./api', async (importOriginal) => moduleNamespace(await importOriginal<typeof import('./api')>(), { passthrough: true }));
```

Every function export becomes a spy that runs the real function until the test configures it, and
records every call either way. It is Vitest's `vi.mock(path, { spy: true })` with this library's
helpers on top — `calledWith`, `mustBeCalledWith`, `resolveWith` — and the same rule as
[`createSpyFromInstance(obj, { passthrough: true })`](/core/create-spy-from-class#passthrough):

- **A configured export is handed over whole.** A `calledWith(7)` chain answers `undefined` for
  `loadUser(1)`, as on any other spy; it does not fall back to the real `loadUser`.
- **`resetAutoSpy(api)` hands the real function back.**
- **Classes and values stay as they are.** A class needs `new`, and the double for that is
  [`mockConstructor`](/utilities/constructor-doubles). Nested objects are not walked.

The exports are typed as the module's own functions, so reach the helpers through
[`adoptMock`](#adoptmock-mock-options), which hands a spy this library built back unchanged:

```ts
import { loadUser } from './api';

adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });
```

## `adoptMock(mock, options?)`

```ts
import { loadUser } from './api';
import { greet } from './greeting';

vi.mock('./api', () => ({ loadUser: vi.fn() }));

it('greets the user it loaded', async () => {
  adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });

  await expect(greet(7)).resolves.toBe('Hello, Ada');
});
```

A `vi.mock` factory builds its own `vi.fn()`s, and the spec gets them back typed as the real
functions: `mockResolvedValue` is there, `calledWith` and `resolveWith` are not. `adoptMock` takes
such a mock over **in place**. It is the same object — the code under test holds it through the
mocked module, so a copy would configure nothing — the calls it already recorded stay recorded, and
it comes back typed as a function spy of the export's own signature.

- **Nothing changes until the test configures it.** An unconfigured call answers what the mock
  answered before: the implementation it was built with (`vi.fn(impl)`), or `undefined`. Once
  configured, the configuration decides, as on every spy — an argument list no `calledWith`
  matches gets the spy's default.
- **The runner's resets keep it.** `vi.resetAllMocks()`, `mockReset: true` and `mockRestore()` clear
  the calls and leave the configuration, as they do on any spy this library builds.
  `resetAutoSpy(loadUser)` — or `resetAutoSpy(api)` on the namespace — drops the configuration and
  goes back to the mock's own implementation.
- **Adopting twice is harmless.** The same mock, or a spy this library built, comes back unchanged.
- **`name`** is what a `mustBeCalledWith` miss calls it. Default: the mock's own name.

A plain function is refused with a pointer to `assertMocked`: it means the module mock did not apply,
and configuring the real function would only move the silence one line down.

### Where it works

| Runner                  | Adopts  |                                                                                                                                                                                   |
| ----------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest `vi.fn()`        | yes     | The configuration survives `vi.resetAllMocks()`, `mockReset: true` and `mockRestore()`.                                                                                           |
| Rstest `rstest.fn()`    | yes     | Same, through `rstest.resetAllMocks()`.                                                                                                                                           |
| Bun `mock()`            | yes     | Bun's `mockReset` is read-only, so `jest.resetAllMocks()` drops the configuration — as it does on every spy this library builds on Bun. Reset with `resetAutoSpy`.                |
| `node:test` `mock.fn()` | refused | It cannot report its implementation, and `mock.restoreAll()` would put it back over the configuration without a word. Build the double with `createFunctionSpy` and pass that in. |

### A spy that calls through

`vi.spyOn(obj, 'method')` without an implementation, and every export of
`vi.mock(path, { spy: true })`, run an original they do not report: `getMockImplementation()` answers
`undefined`, the same as for a bare `vi.fn()`. Adopted, such a mock answers `undefined` to an
unconfigured call. To record calls, run the real code and configure one case, build the spies that
way from the start — [`passthrough`](#passthrough) for a module,
[`createSpyFromInstance(obj, { passthrough: true })`](/core/create-spy-from-class#passthrough) for an
object.

## `vi.doMock`, a dynamic import and `assertMocked`

`vi.mock` is hoisted above the imports, which is what makes it work and also why its factory cannot
see anything the test declares. `vi.doMock` is the way out: it is not hoisted, so it can differ per
test — and it applies only to what is imported **after** it. That makes it the quietest mock of all:
a static import at the top of the file already holds the real module, and nothing about it fails.

```ts
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

Three things carry the recipe:

- **Import the code under test after the `doMock` too.** `./greeting` imported at the top of the file
  bound the real `./api` before the test ran; `assertMocked` on the namespace cannot see that.
- **`vi.resetModules()` in `afterEach`,** so the next test's dynamic import evaluates the module
  again instead of handing back the one this test mocked.
- **`assertMocked` on the namespace the import returned.** Under a bundler `vi.doMock` is as silent
  as `vi.mock`, and this is the line that says so.

## What this does not do

A helper cannot make `vi.mock` hoist from inside another function, so there is no
`mockModule('x', factory)` here — Vitest hoists the literal `vi.mock` call, and a wrapper around it
would be hoisted as a call to a function that does not exist yet. When the factory and the tests
need to share a fixture, `vi.hoisted` is the mechanism:

```ts
const stripe = vi.hoisted(() => {
  const charge = vi.fn();

  return { charge, createClient: vi.fn(() => ({ charge })) };
});

vi.mock('stripe', () => moduleNamespace(stripe));
```
