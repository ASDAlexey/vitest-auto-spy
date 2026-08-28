---
title: Observer stubs
description: stubIntersectionObserver and friends — replace an observer the component constructs itself with one the spec drives, and get the real global back automatically.
---

# Observer stubs

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy';

it('reveals the card once it scrolls into view', async () => {
  const observers = stubIntersectionObserver();
  const fixture = TestBed.createComponent(RevealHost);

  fixture.detectChanges(); // the directive constructs its observer

  observers.last.emit([intersectionEntry(fixture.nativeElement, true)]);
  await fixture.whenStable();

  expect(fixture.nativeElement.classList).toContain('is-visible');
});
```

`IntersectionObserver`, `ResizeObserver` and `MutationObserver` share a shape that makes them
awkward to test. The code under test constructs the observer itself, keeps the instance private,
and the only thing a spec can reach is the global constructor. So the spec has to intercept the
construction, remember the callback, and invoke it with entries it builds by hand — forty lines
that say nothing about the component, and that every project writes again.

Two details make the hand-rolled version go wrong rather than merely be tedious.

## The stub nobody takes off

A spec that assigns `globalThis.IntersectionObserver` directly leaves it there. With
`isolate: false` the next file in the worker inherits it and fails on something unrelated —
`.observe is not a function`, or an assertion that never fires — pointing at innocent code.

Installation here goes through `mockValueProp`, so `restoreMockedProps()` — which
[`setupAutoSpy()`](./setup) already runs after every test — puts the real constructor back with no
teardown of your own.

## The instance reached through a static field

`MockObserver.last` is the usual trick, and it is shared mutable state that survives the file just
like the stub does: the observer one spec constructed is still there for the next one to find.

Here the handle returned by the installer owns the instances, so nothing outlives the spec that
made it. Reaching for `last` when the code under test constructed nothing throws and says so,
rather than failing three lines later against `undefined`:

```text
[vitest-auto-spy] stubObserver('IntersectionObserver'): the code under test has not constructed an
IntersectionObserver. Render the component (or run the effect) before reaching for `last`, and
check that the stub was installed before the construction rather than after it.
```

## The handle

```ts
const observers = stubResizeObserver();

observers.instances; // every observer constructed since the stub went in, in order
observers.last; // the newest — the usual case, where a component builds exactly one
```

Each instance exposes what a spec asserts on and what it drives:

| Member          | What it is                                                             |
| --------------- | ---------------------------------------------------------------------- |
| `targets`       | everything passed to `observe`, with `unobserve`/`disconnect` applied  |
| `observe`       | the spy — for asserting _that_ something was observed, and with what   |
| `unobserve`     | the spy                                                                |
| `disconnect`    | the spy                                                                |
| `disconnected`  | whether teardown ran — the readable form of asserting on `disconnect`  |
| `emit(entries)` | invoke the callback with one batch, exactly as the browser delivers it |

`emit` takes an array rather than a single entry on purpose. A fast scroll or a resize storm
delivers several at once, and code that assumes one entry per call is a real bug this makes
reachable:

```ts
observers.last.emit([intersectionEntry(first, false), intersectionEntry(second, true)]);
```

## Building entries

`intersectionEntry(target, isIntersecting, overrides?)` fills in the fields nothing reads.
`intersectionRatio` is derived rather than accepted, because the two disagreeing is not a state the
browser produces — a spec that sets them apart is testing something that cannot happen.

```ts
intersectionEntry(element, true);
intersectionEntry(element, true, { boundingClientRect: new DOMRect(0, 0, 200, 100) });
```

The rect fields are left out unless asked for. Fabricating four `DOMRectReadOnly`s for an assertion
that looks at `isIntersecting` would be ceremony, not fidelity — and `overrides` supplies whatever
a particular component does read.

For `ResizeObserver` and `MutationObserver` the entries stay yours, since what a component reads
from them varies too much to guess:

```ts
observers.last.emit([{ contentRect: { width: 320 } } as ResizeObserverEntry]);
```

## The installers

| Function                     | Global replaced           |
| ---------------------------- | ------------------------- |
| `stubIntersectionObserver()` | `IntersectionObserver`    |
| `stubResizeObserver()`       | `ResizeObserver`          |
| `stubMutationObserver()`     | `MutationObserver`        |
| `stubObserver(name)`         | any of the three, by name |

All four are exported from the core entry — nothing here is Angular-specific, and the spies come
from whichever [runtime adapter](../runtimes/vitest) is registered, so they work on Bun and
`node:test` too.

::: tip Zoneless Angular
`emit` runs the component's callback synchronously; the change detection it schedules does not.
Follow it with `await fixture.whenStable()` or [`stable(fixture)`](../adapters/angular#zoneless-waiting).
:::

## Install it in `beforeEach`, never in `beforeAll`

A shared setup file's root `beforeEach` runs **after** a file's `beforeAll`. So a stub installed in
`beforeAll` is overwritten by the setup file's default observer before the first test even starts,
and the symptom is `expected "vi.fn()" to be called 2 times, but got 0 times` in a file where the
mock class sits ten lines above the assertion.

The rule that pairs with "do not assign `globalThis.IntersectionObserver` by hand" is therefore: and
do not install it in `beforeAll` either.

## `autoEmit` — everything is visible, immediately

```ts
stubIntersectionObserver({ autoEmit: true });
```

The default stub is inert, which is right when the spec wants to choose the moment of intersection.
It is wrong for a suite carried over from Jest, where the global mock fired its callback with
`isIntersecting: true` synchronously from `observe()`, so lazily-loading shelves and cards fetched
their data during `detectChanges()`. Against an inert observer those specs quietly assert on a
component that never loaded anything, and fail with something unrelated to intersection — one option
here instead of rewriting every spec.

`stubObserver` takes the general form, where the entry is yours to build:

```ts
stubObserver<ResizeObserverEntry, Element>('ResizeObserver', {
  autoEmit: (target) => resizeEntry(target, { width: 320 }),
});
```

## `options` — what the constructor was given

```ts
new IntersectionObserver(callback, { rootMargin: '-20% 0px -70% 0px' });

expect(observers.last.options).toEqual({ rootMargin: '-20% 0px -70% 0px' });
```

A component that builds one observer per configuration is asserting a contract — "one observer per
unique root margin" — and without this the only thing a spec can count is the number of
constructions, which is a weaker statement about a different thing.

## Building entries

```ts
import { intersectionEntry, mutationRecord, resizeEntry } from 'vitest-auto-spy';

observers.last.emit([intersectionEntry(element, true)]);
observers.last.emit([mutationRecord(host, { addedNodes: [span] })]);
observers.last.emit([resizeEntry(host, { width: 320, height: 200 })]);
```

`IntersectionObserverEntry` has seven required fields of which production code usually reads one, and
the types cannot be narrowed away — parameter contravariance blocks it, so the alternative is a
double type assertion in every spec.

`MutationRecord` is worse: it cannot be written as an object literal at all, because `addedNodes` and
`removedNodes` are `NodeList`s. The obvious construction — append the nodes to a `DocumentFragment`
and take its `childNodes` — is the one to avoid, because appending **moves** a node: a spec that
passes an element it had just rendered silently tears that element out of the fixture, and the
assertion that follows fails on a DOM the test itself broke. `mutationRecord()` builds a list that
supports indexing, `item()`, `forEach`, `for…of`, `entries`/`keys`/`values` — and moves nothing.
