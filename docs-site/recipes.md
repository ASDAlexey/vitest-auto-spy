---
title: Spec patterns
description: The shapes a large Angular suite actually converged on — provideAutoSpy configuration, signal mocking, observable properties, and the traps that only surface at scale.
---

# Spec patterns

The API reference says what each helper does. This page says which ones you will actually reach for,
in what order, and what breaks at scale — measured against a private Angular 22 zoneless suite of
roughly 370 spec files that has been on this library since early versions.

The distribution is lopsided, and worth knowing before you learn the whole surface:

| Helper                                             | Spec files using it |
| -------------------------------------------------- | ------------------: |
| [`provideAutoSpy`](/adapters/angular)               |                 371 |
| [`injectSpy`](/adapters/angular)                    |                 308 |
| [`mockReadonlyProp`](/adapters/angular#signal-readonly-property-mocking) |           127 |
| [`mockValueProp`](/adapters/angular#signal-readonly-property-mocking)    |           104 |
| `instanceMethodsToSpyOn`                            |                 103 |
| `observablePropsToSpyOn`                            |                  79 |
| [console spies](/utilities/console)                 |                  68 |
| [`createSpyFromClass`](/core/create-spy-from-class) |                  41 |

Two things follow. **`createSpyFromClass` is the exception, not the rule** — in an Angular app the
spy almost always arrives through DI. And **`instanceMethodsToSpyOn` is not an edge case**: in a
signals codebase it appears in more than a quarter of all spec files, because `signal()` and
`computed()` fields are exactly the callables prototype discovery cannot see.

## The canonical service spec

```ts
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { injectSpy, provideAutoSpy, type Spy } from 'vitest-auto-spy/angular';

describe('TaskService', () => {
  let projects: Spy<ProjectStore>;
  let feed: Spy<NewsFeedService>;
  let service: TaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // plain service — every prototype method is spied, nothing to configure
        provideAutoSpy(NotificationService),
        // signals and computed live on the INSTANCE, so they are named explicitly
        provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] }),
        // Observable *properties* are named too — methods returning one are not
        provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] }),
      ],
    });

    projects = injectSpy(ProjectStore);
    feed = injectSpy(NewsFeedService);

    // seed the defaults every test needs, once
    feed.connected$.nextWith(true);
    projects.save.mockReturnValue(of(true));

    service = TestBed.inject(TaskService);
  });

  it('saves through the store', () => {
    service.save(task);

    expect(projects.save).toHaveBeenCalledWith(task);
  });
});
```

Four conventions carry most of the value:

1. **One `configureTestingModule` per `describe`.** Reconfiguring per `it()` pays for module
   compilation on every test; it is the single largest avoidable cost in an Angular suite.
2. **Declare each spy as `Spy<T>`, resolve it with `injectSpy`.** Never as `T` — `Spy<T>` is a mapped
   type and drops private members ([why](/core/spy-typing)).
3. **Seed defaults in `beforeEach`, override in the test.** A method that returns an `Observable` and
   is never configured returns `undefined`, and the failure surfaces far from its cause.
4. **`provideAutoSpy` is lazy by default**, so listing a wide service costs nothing for the methods a
   test never touches.

## Signals

A signal is a callable field on the instance, which puts it in two places at once. Which helper you
need depends on whether you are mocking a **dependency** or the **class under test**.

```ts
// a DEPENDENCY's signal — name it, and the spy is a mock you configure like any other
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] });
injectSpy(ProjectStore).current.mockReturnValue({ id: 1 });

// the CLASS UNDER TEST's own signal / computed / input — replace the field with a real signal
mockReadonlyProp(component, 'selected', signal(true));
mockReadonlyProp(component, 'items', signal([]));
mockReadonlyProp(component, 'host', signal({ nativeElement: element }));
```

`mockReadonlyProp(target, key, signal(value))` is the workhorse — a real signal, so anything
`computed()` downstream of it recomputes correctly, which a `vi.fn()` returning a value would not do.
For a value that has to change during the test, `mockSignalProp` is that pair in one call and hands
back the writable half:

```ts
const selected = mockSignalProp(component, 'selected', false);

selected.set(true); // every computed reading it updates
```

It also removes the temptation to reach for `component.selected` and call `.set` on it — `Signal<T>`
has no `set`, so that only type-checks behind an assertion.

Use `mockReadonlyPropGetter` when the value must be recomputed on each read rather than replaced, and
`mockValueProp` for an ordinary writable field.

::: warning `vi.restoreAllMocks()` does not undo these
They redefine property descriptors, which the runner's spy registry knows nothing about. Wire
[`setupAutoSpy()`](/utilities/setup) — it registers `restoreMockedProps()` in a global `afterEach`.
Without it, a patch on a global, a prototype or a singleton leaks into the next file under
`isolate: false`.
:::

## Observable properties vs. observable methods

The distinction trips people up because the names look the same:

```ts
class NewsFeedService {
  readonly connected$ = new BehaviorSubject(false); // a PROPERTY  → observablePropsToSpyOn
  watch(id: number): Observable<Item> {}            // a METHOD    → nothing to configure
}

provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] });

feed.connected$.nextWith(true);     // the property, driven by the helpers
feed.watch.nextWith(item);          // the method, spied automatically
```

A method that returns an `Observable` is discovered on the prototype like any other, and gets the
observable helpers from its **return type**. Only properties need naming — nothing on the prototype
points at them.

Both need the rxjs layer loaded once, in your setup file:

```ts
import 'vitest-auto-spy/rxjs';
```

Without it, `nextWith` throws with an error saying exactly that.

## Reaching a spy that `injectSpy` cannot

`injectSpy(X)` reads the **global** `TestBed` injector. A provider declared on the component itself
(`@Component({ providers: [...] })`) lives in the element injector, which `TestBed.inject` never
sees. Go through the fixture and re-view the result:

```ts
import { asSpy } from 'vitest-auto-spy';

const player = asSpy(fixture.debugElement.injector.get(PlayerService));

player.play.mockReturnValue(true);
```

The mirror direction — handing a spy to a plain function typed against the real class — is
[`asInstance`](/core/spy-typing):

```ts
expect(isEnabled(asInstance(featureFlags))).toBe(true);
```

Both are the same object at runtime. Reach for them only at these boundaries; a suite that needs one
in every file has declared its variables as `T` instead of `Spy<T>`.

## ngrx signals

A `signalStore()` puts everything on the **instance**, so prototype discovery finds nothing at all:

```ts
// either name every member you touch…
provideAutoSpy(TaskStore, { instanceMethodsToSpyOn: ['entities', 'isLoading', 'load'] });

// …or skip the class and mock from the type, which needs no prototype
const store = createAutoMock<TaskStore>();
```

`createAutoMock<T>()` is usually the better trade for a store: every accessed member becomes a spy
lazily, so nothing has to be listed and the list cannot fall behind the store.

An `rxMethod` is a function with a `destroy` property, which a bare mock does not have — build it
explicitly, or the component's cleanup throws:

```ts
const load = Object.assign(vi.fn(), { destroy: vi.fn() });
```

## Effects

Prefer not to replace `effect()` by mocking `@angular/core`. It is possible under the Angular
unit-test builder — the mock that fails is the one whose factory uses object spread, and the
failure (`Cannot access '__vi_import_N__' before initialization`) names neither spread nor the
factory; see [module mocks under the unit-test builder](/adapters/angular#module-mocks-under-the-unit-test-builder).
It is still the more brittle half of the trade.

Assert the effect's **result** instead: set the signals it reads, let it run, and check what it
produced.

```ts
mockReadonlyProp(component, 'state', signal(State.Selected));

await stable(fixture); // flush effects, then await the fixture

expect(component.icon()).toBe('favouritesFilled');
```

[`stable(fixture)`](/adapters/angular#zoneless-waiting) is the one to reach for:
`fixture.detectChanges()` runs a single change-detection pass and does **not** flush pending effects,
so an assertion right after it reads state that has not finished computing. `flushEffects()` is the
no-fixture half, for services and stores. The wait is bounded — 2000 ms by default, then it throws
the cause instead of leaving the runner to report a file-level timeout.

### A component that loads through `httpResource()`

```ts
const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

flushEffects(); // the request is issued here — not when the resource was created
TestBed.inject(HttpTestingController).expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

expect(products.value()).toEqual([product]);
```

[`settleResource`](/adapters/angular#resources-httpresource-and-resource) is one wait for
`httpResource()`, `resource()` and `rxResource()`, which each need a different number of turns.
Asserting before it reads the resource's _default_ value and passes, which is the failure mode worth
knowing: a green test proving nothing until the day the default changes.

When the effect will never go dirty on its own — because its trigger is now a static signal —
`runEffect` runs that one body directly:

```ts
runEffect(component.highlightEffect); // current signal values, no scheduler involved
```

## Observers the component constructs itself

`IntersectionObserver`, `ResizeObserver` and `MutationObserver` are built inside the code under test
and kept private, so the only handle a spec has is the global constructor. Replacing it by hand goes
wrong twice: the stub is never taken off (and the next file inherits it under `isolate: false`), and
the instance is reached through a `static last` that outlives the spec just as badly.

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy';

const observers = stubIntersectionObserver();

fixture.detectChanges(); // the directive constructs its observer

observers.last.emit([intersectionEntry(fixture.nativeElement, true)]);
await fixture.whenStable();
```

The stub installs through `mockValueProp`, so `restoreMockedProps()` — which `setupAutoSpy()`
already runs — puts the real constructor back. `emit()` takes a **batch**, because a fast scroll
delivers several entries in one call and code assuming one entry per call is a real bug worth
reaching.

## Timers that outlive their file

This one only appears at scale, and it appears as a failure in an **innocent** file.

With `isolate: false` every spec file in a worker shares one environment. A `setTimeout` a component
schedules and never clears keeps running after its file is done; the callback then fires while the
next file is mid-test, against mocks and a DOM that no longer match. `requestAnimationFrame` matters
just as much in a zoneless app — Angular's change-detection scheduler races a `setTimeout` against a
frame callback, so a destroyed component can still have one queued.

Symptoms, all reported against the wrong file:

- `Schedulers cannot synchronously execute watches while scheduling`
- `signal read during notification phase`
- an unhandled rejection naming a component the failing file never imported

One option covers it — it wraps the schedulers once, records every handle, and cancels the survivors
in `afterAll`:

```ts
// vitest.setup.ts
setupAutoSpy({ strayTimers: true });
```

The pieces are exported too, for a suite that wants the sweep somewhere else or wants a leak to
**fail** rather than be tidied away:

```ts
import { cancelStrayTimers, countStrayTimers, trackStrayTimers } from 'vitest-auto-spy/setup';

trackStrayTimers(); // once, as early as the setup file runs — idempotent
afterEach(() => expect(countStrayTimers()).toBe(0)); // treat a leak as a failure
afterAll(() => cancelStrayTimers()); // …or just sweep, and log the count it returns
```

If you are on `isolate: false`, assume you need this before you need it.

## A green run that still exits 1

happy-dom implements `fetch`; jsdom does not. Move a suite from one to the other and a component
that pulls a remote asset starts issuing real requests. Nothing asserts on them, so every test still
passes — and then the runner tears the environment down, the in-flight requests abort, and the
aborts arrive as unhandled rejections *after* the summary:

```text
 Test Files  260 passed (260)
      Tests  2257 passed (2257)

Vitest caught 8 unhandled errors during the test run.
DOMException [AbortError]: The operation was aborted.
```

Exit code 1, and no test named — because no test failed.

```ts
setupAutoSpy({ blockNetwork: true });
```

`fetch` then rejects immediately, naming the URL that was requested, and the code under test takes
exactly the branch it would take for a failed request. `XMLHttpRequest` and `navigator.sendBeacon`
go the same way — jsdom implements XHR in full, and a library that never left it (an ad player
pinging VAST trackers, say) reaches the internet from a suite that thought it was blocked. For a
suite whose outbound requests are pings nobody reads the response of, answer them instead of
failing them:

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } });
```

## Fake timers

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers(); // once per describe — pairs install with restore

it('debounces', async () => {
  component.search('query');

  await advanceTimers(300); // advance AND drain the microtasks the advance queues
  await stable(fixture);

  expect(api.search).toHaveBeenCalledWith('query');
});
```

`vi.advanceTimersByTime()` alone leaves the promise chain the timer resolved still pending, which is
what makes a timer assertion read like a race. `advanceTimers()` closes that gap.

## Console

Import the entry once and assert on the exported spies; the output is silenced rather than printed.

```ts
import { consoleErrorSpy } from 'vitest-auto-spy/console';

service.handle(brokenPayload);

expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('parse'));
```

Never add a second `vi.spyOn(console, 'error')` on top: whichever patch wins depends on import order,
and the assertion then runs against a spy that never intercepted the call.

## An array assertion that says nothing

```ts
import { diffByField } from 'vitest-auto-spy';

const sent = analytics.send.mock.calls.map(([event]) => event);

expect(diffByField(sent, expectedEvents)).toBeUndefined();
```

Comparing collected records against an expected list is the ordinary shape of a test for anything
that accumulates — an analytics queue, an audit log, a command history. And the ordinary cause of a
mismatch is not "the wrong element" but "one field moved in all of them": a timestamp, an id, a
counter.

That is the failure the reporter renders worst. It collapses the objects, so what arrives is
`expected [ { event_timestamp: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]` — nine elements,
one changed field, nothing on screen to say which, and a `console.dir(…, { depth: null })` and two
more runs to find out. `diffByField` answers it directly:

```text
9 of 9 elements differ.
  `event_timestamp` differs in all 9: actual 1 everywhere, expected 2, 3, 4, 5, 6, 7, …
```

"Everywhere" against a run of expected values is the tell: under fake timers every `Date.now()`
inside one test answers the same, so a spec about **order** or **duration** needs
[`useCountingClock()`](/utilities/event-loop#usecountingclock-options) rather than a frozen clock.

## What not to do

| ❌                                                          | ✅                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------- |
| a hand-written `{ provide: X, useValue: { a: vi.fn() } }`     | `provideAutoSpy(X)`                                            |
| `vi.spyOn(TestBed.inject(X), 'method')`                       | `injectSpy(X).method`                                          |
| `Object.defineProperty(service, 'ready', { value: true })`    | `mockReadonlyProp(service, 'ready', true)`                     |
| `let s: MyService = createSpyFromClass(MyService)`             | `let s: Spy<MyService>`                                        |
| `source$.subscribe(v => expect(v).toBe(1))`                    | `await expect(expectEmission(source$)).resolves.toBe(1)`       |
| `expect(component.total).toBeTruthy()` on a signal             | `expect(component.total).toHaveSignalValue(3)`                 |
| `configureTestingModule` inside every `it()`                   | one per `describe`                                             |
| `methodsToSpyOn` used to *restrict* the set                    | `onlyMethodsToSpyOn` restricts; `methodsToSpyOn` adds           |

Row five is the one worth being convinced of rather than told: the same false assertion written
four ways against four streams, and [the run that leaves every `subscribe` form
green](/core/observable-assertions#measured-four-forms-against-four-streams).

The first three are enforceable — [the ESLint plugin](/utilities/eslint-plugin) has a rule for each.
Scope it to spec files: an object of `vi.fn()`s is perfectly reasonable in application code.
