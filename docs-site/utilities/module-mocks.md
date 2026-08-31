---
title: Module mocks that did nothing
description: assertMocked and moduleNamespace — prove a vi.mock() applied under a bundler, and give its factory the shape an interop probe recognises.
---

# Module mocks that did nothing

```ts
import { assertMocked, moduleNamespace } from 'vitest-auto-spy';
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
import * as domainMetrics from '@app/domain-metrics';

vi.spyOn(domainMetrics, 'injectDomainMetrics'); // TypeError: Cannot redefine property: injectDomainMetrics
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
[vitest-auto-spy] Cannot spy on the 'get' accessor of 'injectDomainMetrics': the property is not
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
readonly #metrics = inject(DomainMetrics);
// spec: TestBed.configureTestingModule({ providers: [provideAutoSpy(DomainMetrics)] });

// 2. Pass it in. A free function that takes its collaborator as an argument needs no mocking at all.
export function priceBasket(items: Item[], rate: RateLookup): number { … }
// spec: priceBasket(items, () => 1.2);

// 3. Own the indirection. Re-export the third-party call through a class you control,
//    and let every caller — and every spec — go through that.
@Service()
export class MetricsGateway {
  track(event: string): void {
    injectDomainMetrics().track(event);
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

Returns `{ ...exports, default: exports, __esModule: true }` — the shape any dependency written to
run as both CommonJS and ESM probes for with `mod.default ?? mod`.

The missing `default` is the failure this removes. A factory returning bare named exports makes
Vitest throw `No "default" export is defined on the mock` **from inside that dependency**, with a
stack that names the library rather than the factory three lines up in the spec.

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
