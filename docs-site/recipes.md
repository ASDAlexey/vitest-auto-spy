---
title: Spec patterns
description: Short recipes for everyday Angular specs - replacing a service in TestBed, setting signals and Observables, effects, timers, network, console and test data.
---

# Spec patterns

Short recipes for the tasks that come up in almost every Angular test set. Each one starts with the
task, then shows the code. The API pages explain every option; this page shows which helpers to
use for a given job.

Task guides with their own pages: [mocking classes](/guides/mocking-classes),
[mocking `localStorage`](/guides/mocking-local-storage), [mocking Prisma Client](/guides/mocking-prisma),
[Storybook stories](/guides/storybook-angular),
[testing without the DOM](/guides/testing-without-the-dom) and
[Angular Material idioms](/guides/angular-material-idioms).

## Test a service with its dependencies replaced

`TaskService` depends on three services. The spec replaces all three with spies and tests the real
`TaskService`. The Observable helpers need `import 'vitest-auto-spy/rxjs'` once in your setup file
(see [Installation](/core/installation#wiring-it-up)):

```ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Spy, injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

import { NewsFeedService } from './news-feed.service';
import { NotificationService } from './notification.service';
import { ProjectStore } from './project.store';
import { type Task, TaskService } from './task.service';

const task: Task = { id: 1, title: 'Write the docs' };

describe('TaskService', () => {
  let projects: Spy<ProjectStore>;
  let feed: Spy<NewsFeedService>;
  let service: TaskService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // a plain service: every method is spied, nothing to configure
        provideAutoSpy(NotificationService),
        // signal and computed fields live on the instance; name them in instanceMethodsToSpyOn
        provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] }),
        // Observable properties need naming; methods are found on their own
        provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] }),
      ],
    });

    projects = injectSpy(ProjectStore);
    feed = injectSpy(NewsFeedService);

    // answers every test needs, set once
    feed.connected$.nextWith(true); // an Observable property
    projects.save.mockReturnValue(of(true)); // a method returning an Observable
    projects.load.resolveWith([task]); // a method returning a Promise

    service = TestBed.inject(TaskService);
  });

  it('saves through the store', () => {
    service.save(task);

    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(projects.save).toHaveBeenCalledWith(task);
  });
});
```

Which helper sets the answer depends on the method's return type:

| The method returns | Set the answer with                                                    |
| ------------------ | ---------------------------------------------------------------------- |
| `Promise<T>`       | `resolveWith(value)`, `rejectWith(error)`                              |
| `Observable<T>`    | `nextWith(value)`, `throwWith(error)`, or `mockReturnValue(of(value))` |
| anything else      | `mockReturnValue(value)`, as with any Vitest mock                      |
| any of these       | `calledWith(...args).mockReturnValue(value)` per argument              |

Every spy also works with the usual Vitest matchers: `toHaveBeenCalledTimes`,
`toHaveBeenCalledWith` and the rest.

Four habits that pay off:

1. **Write `configureTestingModule` once, in the `describe`'s `beforeEach`**, not repeated inside each
   `it()` with a different setup. Changing the module per test forces Angular to compile it again,
   which is the largest avoidable cost in Angular specs.
2. **Declare each spy as `Spy<T>` and get it with `injectSpy`.** Not as `T`: `Spy<T>` leaves out
   private members, so it does not fit `T` ([why](/core/spy-typing)).
3. **Set default answers in `beforeEach`, change them in the test.** A spied method you never
   configured returns `undefined`. For a method the code subscribes to or awaits, the test then fails
   far from the cause.
4. **Spies are created lazily**, on first use. Replacing a service with many methods costs nothing for methods a
   test never calls.

## Set a signal on a dependency or on the component

A signal is a function stored in a field on the instance. The helper you need depends on whose signal
it is: a **dependency's**, or the **class you are testing**.

```ts
import { signal } from '@angular/core';
import { injectSpy, mockReadonlyProp, provideAutoSpy } from 'vitest-auto-spy/angular';

// a dependency's signal: name it, and configure it like any other spy
provideAutoSpy(ProjectStore, { instanceMethodsToSpyOn: ['current', 'isEmpty'] });
injectSpy(ProjectStore).current.mockReturnValue({ id: 1 });

// the tested component's own signal, computed or input: replace the field with a real signal
mockReadonlyProp(component, 'selected', signal(true));
mockReadonlyProp(component, 'items', signal([]));
mockReadonlyProp(component, 'host', signal({ nativeElement: element }));
```

`mockReadonlyProp(target, key, signal(value))` is the one you use most. It puts in a real signal, so
every `computed()` that reads it updates correctly. A `vi.fn()` that returns a value would not do
that. If the value must change during the test, use `mockSignalProp`. It returns a writable signal:

```ts
const selected = mockSignalProp(component, 'selected', false);

selected.set(true); // every computed reading it updates
```

You cannot call `.set` on `component.selected` directly: `Signal<T>` has no `set`, so that compiles
only with a cast. `mockSignalProp` gives you a signal you can set.

What `mockSignalProp` does depends on the member:

- a `signal()`, `model()` or `linkedSignal()` is written to, not replaced, so it works before and
  after the first render;
- a `computed()` is replaced, and that must happen before the first render. `mockSignalProp` throws
  if you are too late, instead of leaving the old value;
- an `input()` is refused. Set it with `fixture.componentRef.setInput(name, value)`.

Use `mockReadonlyPropGetter` when the value must be computed again on each read, and `mockValueProp`
for an ordinary writable field.

::: warning `vi.restoreAllMocks()` does not undo these
They redefine properties, and the runner does not track that. Call
[`setupAutoSpy()`](/utilities/setup) in your setup file: it runs `restoreMockedProps()` after every
test. Without it, under `isolate: false`, a change to a global, a prototype or a singleton leaks into
the next file.
:::

## Drive an Observable property or method

A property that holds an Observable and a method that returns one need different setup:

```ts
class NewsFeedService {
  readonly connected$ = new BehaviorSubject(false); // a PROPERTY  → observablePropsToSpyOn
  watch(id: number): Observable<Item> {} // a METHOD    → nothing to configure
}

provideAutoSpy(NewsFeedService, { observablePropsToSpyOn: ['connected$'] });

feed.connected$.nextWith(true); // the property, driven by the helpers
feed.watch.nextWith(item); // the method, spied automatically
```

A method that returns an `Observable` is found on the prototype like any other method. It gets the
Observable helpers from its **return type**. Only properties need naming, because the prototype does
not list them.

Both need the rxjs helpers, loaded once in your setup file:

```ts
import 'vitest-auto-spy/rxjs';
```

Without that import, `nextWith` throws an error that says so.

## Get a spy from a component-level provider

`injectSpy(X)` reads the **root** `TestBed` injector. A provider declared on the component itself
(`@Component({ providers: [...] })`) lives in the component's own injector, which `TestBed.inject`
never sees. Get it through the fixture and wrap the result with `asSpy`:

```ts
import { asSpy } from 'vitest-auto-spy';

const player = asSpy(fixture.debugElement.injector.get(PlayerService));

player.play.mockReturnValue(true);
```

The other direction, passing a spy to a function that expects the real class, is
[`asInstance`](/core/spy-typing):

```ts
expect(isEnabled(asInstance(featureFlags))).toBe(true);
```

Both return the same object; only the type changes. Use them only at such boundaries. If every file
needs one, the variables are declared as `T` instead of `Spy<T>`.

## Replace an ngrx signal store

A `signalStore()` puts all its members on the **instance**, so the prototype does not show them. For
a class built with `signalStore()`, the library turns on `fillMissing: true` by default. That option makes
every member you read answer with a spy, even one the class does not declare.

```ts
// every withMethods / withProps member answers with a spy
provideAutoSpy(TaskStore, { returns: { load: undefined } });

// …or skip the class and mock from the type, which needs no prototype
const store = createAutoMock<TaskStore>();
```

Use `createAutoMock<T>()` when you have no class. With a class, the default above means you list
nothing, so no list can fall behind the store.

An `rxMethod` is a function with a `destroy` property, which a bare mock does not have. Build it
yourself, or the component's cleanup throws:

```ts
const load = Object.assign(vi.fn(), { destroy: vi.fn() });
```

## Test what an effect produces

Do not replace `effect()` by mocking `@angular/core`. It can work under the Angular unit-test
builder, but it breaks easily. A mock factory that uses object spread fails with
`Cannot access '__vi_import_N__' before initialization`, and that message names neither. See
[module mocks under the unit-test builder](/guides/angular-unit-test-builder#module-mocks-under-the-unit-test-builder).

Check the effect's **result** instead: set the signals it reads, let it run, and check what it
produced.

```ts
import { signal } from '@angular/core';
import { mockReadonlyProp, stable } from 'vitest-auto-spy/angular';

mockReadonlyProp(component, 'state', signal(State.Selected));

await stable(fixture); // flush effects, then await the fixture

expect(component.icon()).toBe('favouritesFilled');
```

Use [`stable(fixture)`](/adapters/angular#zoneless-waiting). `fixture.detectChanges()` runs one
change-detection pass and does **not** run pending effects, so an assertion right after it reads
unfinished state. For services and stores without a fixture, use `flushEffects()`. The wait has a
limit, 2000 ms by default. After that it throws with the cause, instead of a timeout for the whole
file.

### Test a component that loads through `httpResource()`

```ts
const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));

flushEffects(); // the request is sent here, not when the resource was created
TestBed.inject(HttpTestingController).expectOne('/api/products').flush([product]);
await settleResource(products, { label: 'the product resource' });

expect(products.value()).toEqual([product]);
```

[`settleResource`](/adapters/angular#resources-httpresource-and-resource) waits for
`httpResource()`, `resource()` and `rxResource()` alike, although each needs a different number of
turns. An assertion before it reads the resource's _default_ value and may pass. That test is green
but proves nothing, until the day the default changes.

If the effect will not run again on its own, because the signal it reads no longer changes, run its
body directly with `runEffect`:

```ts
runEffect(component.highlightEffect); // runs now, with the current signal values
```

## Stub an observer the component creates

The code under test creates its own `IntersectionObserver`, `ResizeObserver` or `MutationObserver`
and keeps it private. The spec can reach only the global constructor. Replacing it by hand usually
goes wrong twice:

- the stub is never removed, and under `isolate: false` the next file inherits it;
- the instance is reached through a `static last` field that also outlives the spec.

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';

const observers = stubIntersectionObserver();

fixture.detectChanges(); // the directive constructs its observer

observers.last.emit([intersectionEntry(fixture.nativeElement, true)]);
await fixture.whenStable();
```

The stub is installed with `mockValueProp`, so `restoreMockedProps()` puts the real constructor back.
`setupAutoSpy()` already runs it after each test. `emit()` takes a **list** of entries, because a
fast scroll delivers several at once. Code that expects one entry per call has a real bug, and this
lets the test find it.

## Stop timers from leaking into the next file

This shows up in large test sets, as a failure in a file that did nothing wrong.

With `isolate: false` (a Vitest option; see the [Glossary](/glossary)), all spec files in a worker
share one environment. A component's `setTimeout`
that is never cleared keeps running after its file ends. The callback then fires in the middle of
the next file, against other mocks and another DOM. `requestAnimationFrame` matters as much in a
zoneless app. Angular's change detection races a `setTimeout` against a frame callback, so a
destroyed component can still have one queued.

The symptoms, all reported against the wrong file:

- `Schedulers cannot synchronously execute watches while scheduling`
- `signal read during notification phase`
- an unhandled rejection naming a component the failing file never imported

One option fixes it. It records every timer and cancels the ones still pending in `afterAll`:

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ strayTimers: true });
```

The pieces are exported too. Use them to run the cleanup somewhere else, or to make a leak **fail**
the test instead of being cleaned up:

```ts
import { cancelStrayTimers, countStrayTimers, trackStrayTimers } from 'vitest-auto-spy/setup';

trackStrayTimers(); // once, early in the setup file; safe to call twice
afterEach(() => expect(countStrayTimers()).toBe(0)); // treat a leak as a failure
afterAll(() => cancelStrayTimers()); // or just cancel them; returns how many
```

If you use `isolate: false`, turn this on before the first strange failure.

## Block real network requests

happy-dom implements `fetch`; jsdom does not. Move tests from jsdom to happy-dom, and a component
that loads a remote file starts sending real requests. Nothing checks them, so every test passes.
Then the runner shuts the environment down, the open requests abort, and the aborts arrive as
unhandled errors _after_ the summary:

```text
 Test Files  260 passed (260)
      Tests  2257 passed (2257)

Vitest caught 8 unhandled errors during the test run.
DOMException [AbortError]: The operation was aborted.
```

The run exits with code 1 and names no test, because no test failed. Block the network in the
setup file:

```ts
// vitest.setup.ts
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ blockNetwork: true });
```

`fetch` then rejects at once with the requested URL in the message. The code under test takes the
same path as for a failed request. `XMLHttpRequest` and `navigator.sendBeacon` are blocked too:
jsdom implements XHR in full, so a library that uses it (an ad player pinging trackers, say) would
still reach the internet. If those requests are pings whose response nobody reads, answer them with
an empty response instead of failing:

```ts
setupAutoSpy({ blockNetwork: { xhr: 'empty' } });
```

## Advance fake timers

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers(); // once per describe; installs fake timers and restores real ones

it('debounces', async () => {
  component.search('query');

  await advanceTimers(300); // advance, then run the promises the timers resolved
  await stable(fixture);

  expect(api.search).toHaveBeenCalledWith('query');
});
```

`vi.advanceTimersByTime()` alone leaves the promises that the timers resolved still pending. The
assertion then reads stale state. `advanceTimers()` waits for them too.

## Assert on console output

Import `vitest-auto-spy/console` and assert on its spies. The output is silenced, not printed.

```ts
import { consoleErrorSpy } from 'vitest-auto-spy/console';

service.handle(brokenPayload);

expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('parse'));
```

**Common mistake:** a second `vi.spyOn(console, 'error')` on top. Which one wins depends on import
order, and the assertion may check a spy that never saw the call.

## An argument the spec cannot spell

Some arguments cannot be written as a literal: a callback the code built, an options object put
together from three places, a `FormData`. `captureArg` catches the argument, so you can check it
afterwards.

```ts
import { captureArg } from 'vitest-auto-spy';

const options = captureArg<RequestInit>();

expect(fetchSpy).toHaveBeenCalledWith('/api/save', options);

expect(options.value.method).toBe('POST');
```

`.values` holds every value the captor was **offered**, not only the ones from matching calls. The
runner checks each recorded call argument by argument, left to right, and stops at the first
mismatch. A captor matches anything. So a captor to the left of an argument that later fails has
already recorded that call. A captor in the last position sees only calls that matched everything
before it.

If `.values` must hold only matches, give the captor a filter. It then decides the match itself and
records only what it accepts:

```ts
const post = captureArg<RequestInit>({ where: (value) => (value as RequestInit).method === 'POST' });

expect(fetchSpy).toHaveBeenCalledWith('/api/save', post);
expect(post.values).toHaveLength(1);
```

`captured` says the captor was offered something, not that the assertion passed. Rely on the
`expect` for pass or fail, and read the captor for what the call carried.

## Find the field that differs in a list of records

```ts
import { diffByField } from 'vitest-auto-spy/diagnostics';

const sent = analytics.send.mock.calls.map(([event]) => event);

expect(diffByField(sent, expectedEvents)).toBeUndefined();
```

Tests for anything that collects records compare a list against an expected list: an analytics
queue, an audit log, a command history. The usual mismatch is one field that changed in every
element: a timestamp, an id, a counter.

Vitest reports that badly. It collapses the objects and prints
`expected [ { event_timestamp: 1, …(5) }, …(8) ] to deeply equal [ { …(6) }, … ]`. Nine elements, one
changed field, and nothing says which. `diffByField` says it directly:

```text
9 of 9 elements differ.
  `event_timestamp` differs in all 9: actual 1 everywhere, expected 2, 3, 4, 5, 6, 7, …
```

An element that is **not** a plain record is compared whole and reported as `the element`. That
covers a `Date`, a `Map`, a `Set`, a `URL` and a class instance whose state sits behind getters.
Field-by-field comparison reads `Object.keys`, which is empty for all of them, and would find no
difference. Two records that differ only in a symbol-keyed field are reported the same way.

The word "everywhere" next to a range of expected values is a hint. Under fake timers every
`Date.now()` in one test returns the same value. A spec about **order** or **duration** needs
[`useCountingClock()`](/utilities/event-loop#usecountingclock-options) instead of a frozen clock.

## Share one test model across specs

A common pattern has nothing to do with spies: a model with seventeen required fields, pasted into
every spec that needs one. When the model changes, every copy has to change, and the copies drift.
The fix is one place for the defaults:

```ts
// article.fixture.ts
import { createFixtureFactory } from 'vitest-auto-spy';

export const anArticle = createFixtureFactory<Article>({
  id: '1',
  header: { title: '', subtitle: 'none' },
  tags: [],
  publishedAt: new Date(0),
});

// article-list.component.spec.ts
const draft = anArticle({ header: { title: 'Draft' } }); // header.subtitle survives
const tagged = anArticle({ tags: ['news'] }); // the array is replaced, not merged
```

Two things make this better than a copied literal:

- **The defaults are a complete `T`.** When the model drops a field, you get one compile error
  instead of eight silently wrong copies. `Partial<T>` and `as T` both hide that error.
- **Every call returns a new object.** A shared `const FIXTURE` changed in one test can decide the
  result of another. Under `isolate: false` that even crosses files.

The copy is deep through plain objects and arrays, and stops there. A `Date`, a `Map` or a class
instance is passed by reference, because rebuilding one would lose its prototype. For defaults that
_are_ a model instance with getters, use
[`withOverrides`](/utilities/fixtures#withoverrides-model-overrides-—-a-model-whose-getters-survive).

## Common mistakes

| ❌                                                         | ✅                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| a hand-written `{ provide: X, useValue: { a: vi.fn() } }`  | `provideAutoSpy(X)`                                           |
| the same 100-line model literal copied into eight specs    | one `createFixtureFactory<T>(defaults)`, called with the diff |
| `vi.spyOn(TestBed.inject(X), 'method')`                    | `injectSpy(X).method`                                         |
| `Object.defineProperty(service, 'ready', { value: true })` | `mockReadonlyProp(service, 'ready', true)`                    |
| `let s: MyService = createSpyFromClass(MyService)`         | `let s: Spy<MyService>`                                       |
| `source$.subscribe(v => expect(v).toBe(1))`                | `await expect(expectEmission(source$)).resolves.toBe(1)`      |
| `expect(component.total).toBeTruthy()` on a signal         | `expect(component.total).toHaveSignalValue(3)`                |
| `configureTestingModule` inside every `it()`               | one per `describe`                                            |
| `methodsToSpyOn` used to _restrict_ the set                | `onlyMethodsToSpyOn` restricts; `methodsToSpyOn` adds         |

Why the `subscribe` row matters: an assertion inside `subscribe` never runs if the stream emits
nothing, so the test passes. See [four forms against four streams](/core/observable-assertions#measured-four-forms-against-four-streams).

[The ESLint plugin](/utilities/eslint-plugin) has a rule for each of the first three rows. Enable it
for spec files only: an object of `vi.fn()` calls is fine in application code.

## In depth: which helpers a large test set uses

Counted in one Angular 22 zoneless project with about 370 spec files that has used this library
since early versions:

| Helper                                                                   | Spec files using it |
| ------------------------------------------------------------------------ | ------------------: |
| [`provideAutoSpy`](/adapters/angular)                                    |                 371 |
| [`injectSpy`](/adapters/angular)                                         |                 308 |
| [`mockReadonlyProp`](/adapters/angular#signal-readonly-property-mocking) |                 127 |
| [`mockValueProp`](/adapters/angular#signal-readonly-property-mocking)    |                 104 |
| `instanceMethodsToSpyOn`                                                 |                 103 |
| `observablePropsToSpyOn`                                                 |                  79 |
| [console spies](/utilities/console)                                      |                  68 |
| [`createSpyFromClass`](/core/create-spy-from-class)                      |                  41 |

Two conclusions. In an Angular app the spy almost always comes through DI, so `createSpyFromClass` is
the exception. And `instanceMethodsToSpyOn` is common: it appears in more than a quarter of the spec
files, because `signal()` and `computed()` fields are exactly what the prototype does not show.

Shared configuration repeats too. In another Angular project, `Router` was configured 23 different
ways across 109 spec files ([how often the options drift](/core/create-spy-from-class#how-often-the-options-drift)).
That is what
[`registerAutoSpyDefaults`](/core/create-spy-from-class#registerautospydefaults-—-the-composition-lives-with-the-class)
is for: register the configuration once in the setup file, and each spec adds only what differs.
