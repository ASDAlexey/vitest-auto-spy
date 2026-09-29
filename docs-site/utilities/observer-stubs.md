---
title: Observer stubs
description: stubIntersectionObserver and friends replace an observer the component creates itself with one the spec drives, and put the real global back after the test.
---

# Observer stubs

Use these stubs to test a component that creates its own `IntersectionObserver`, `ResizeObserver`
or `MutationObserver`. The stub records every observer the component creates and lets your spec fire
its callback. The real global comes back after each test.

```ts
import { intersectionEntry, stubIntersectionObserver } from 'vitest-auto-spy/dom-stubs';

it('reveals the card once it scrolls into view', async () => {
  const observers = stubIntersectionObserver();
  const fixture = TestBed.createComponent(RevealHost);

  fixture.detectChanges(); // the directive creates its observer

  observers.last.emit([intersectionEntry(fixture.nativeElement, true)]);
  await fixture.whenStable();

  expect(fixture.nativeElement.classList).toContain('is-visible');
});
```

Everything on this page is imported from `vitest-auto-spy/dom-stubs`. Nothing here is Angular-specific:
the spies come from the registered [runtime adapter](../runtimes/vitest), so the stubs also work on
Bun and `node:test`.

::: tip Zoneless Angular
`emit` runs the component's callback right away, but the change detection it schedules does not run
yet. Follow it with `await fixture.whenStable()` or [`stable(fixture)`](../adapters/angular#zoneless-waiting).
:::

## The installers

| Function                     | Global replaced           |
| ---------------------------- | ------------------------- |
| `stubIntersectionObserver()` | `IntersectionObserver`    |
| `stubResizeObserver()`       | `ResizeObserver`          |
| `stubMutationObserver()`     | `MutationObserver`        |
| `stubObserver(name)`         | any of the three, by name |

Each returns a [handle](#the-handle). Call it in `beforeEach` or in the test; see
[below](#install-it-in-beforeeach-never-in-beforeall).

## The handle

```ts
const observers = stubResizeObserver();

observers.instances; // every observer created since the stub went in, in order
observers.last; // the newest; the usual case, where a component creates exactly one
```

Each instance has what a spec asserts on and what it drives:

| Member          | What it is                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `targets`       | everything passed to `observe`, with `unobserve` / `disconnect` applied                                     |
| `observe`       | a spy, to assert that something was observed, and with what                                                 |
| `unobserve`     | a spy                                                                                                       |
| `disconnect`    | a spy                                                                                                       |
| `disconnected`  | whether teardown ran; easier to read than asserting on `disconnect`                                         |
| `emit(entries)` | calls the component's callback with one batch, as the browser does                                          |
| `options`       | the options the constructor received; see [below](#options-—-what-the-constructor-was-given)                |
| `host`          | the observer object your code holds (not a host element); see [below](#the-observer-the-callback-is-handed) |

`emit` takes an array, because a fast scroll or a resize delivers several entries at once. Code that
assumes one entry per call has a real bug, and this lets you reach it:

```ts
observers.last.emit([intersectionEntry(first, false), intersectionEntry(second, true)]);
```

**Common mistake:** reading `last` before the component has created an observer. It throws instead
of returning `undefined`:

```text
[vitest-auto-spy] stubObserver('IntersectionObserver'): the stub is installed, but the code under test
has not constructed a IntersectionObserver yet. Render the component (or run the effect) before
reaching for `last`.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/observer-stubs#the-handle
```

Render the component (`fixture.detectChanges()`) before you reach for `last`.

## Building entries

Helpers that build the entries `emit` delivers:

```ts
import { intersectionEntry, mutationRecord, resizeEntry } from 'vitest-auto-spy/dom-stubs';

observers.last.emit([intersectionEntry(element, true)]);
observers.last.emit([mutationRecord(host, { addedNodes: [span] })]);
observers.last.emit([resizeEntry(host, { width: 320, height: 200 })]);
```

| Helper                                                  | Builds                         |
| ------------------------------------------------------- | ------------------------------ |
| `intersectionEntry(target, isIntersecting, overrides?)` | an `IntersectionObserverEntry` |
| `resizeEntry(target, rect)`                             | a `ResizeObserverEntry`        |
| `mutationRecord(target, init)`                          | a `MutationRecord`             |

Why not write the entries by hand:

- `IntersectionObserverEntry` has seven required fields, and your code usually reads one. Without
  the helper, every spec needs a double type assertion.
- `MutationRecord` cannot be an object literal: `addedNodes` and `removedNodes` are `NodeList`s. The
  usual trick (append the nodes to a `DocumentFragment` and take `childNodes`) **moves** the nodes out
  of your fixture. `mutationRecord()` builds a list with indexing, `item()`, `forEach`, `for…of` and
  `entries` / `keys` / `values`, and moves nothing.

`intersectionEntry` fills in the fields nothing reads. It derives `intersectionRatio` from
`isIntersecting`, because the browser never reports them disagreeing. The rect fields are left out
unless you pass them in `overrides`: `boundingClientRect`, `intersectionRect` and `rootBounds` each
take a `DOMRect` or the numbers `{ x, y, width, height }`.

```ts
intersectionEntry(element, true);
intersectionEntry(element, true, { boundingClientRect: new DOMRect(0, 0, 200, 100) });
observers.last.emit([intersectionEntry(tooltip, true, { boundingClientRect: { x: 10, y: 20, width: 200, height: 100 } })]);
```

You can still write a `ResizeObserver` entry yourself when the component reads something unusual:

```ts
observers.last.emit([{ contentRect: { width: 320 } } as ResizeObserverEntry]);
```

## The observer the callback is handed

The callback's second argument is the object `new IntersectionObserver(…)` returned, the one your
code kept. Code often uses it:

```ts
new IntersectionObserver((entries, observer) => {
  observer.disconnect(); // or observer.takeRecords(), or `if (observer !== this.observer) return;`
});
```

On that object:

- `takeRecords()` is a spy that returns an empty list;
- `root`, `rootMargin` and `thresholds` come from the options the constructor received;
- `rootMargin` defaults to `'0px 0px 0px 0px'` and `thresholds` to `[0]`, as in the browser; a single
  number `threshold` becomes a one-element array.

`instances[i].host` (and `last.host`) is that same object, to compare with what the component holds:

```ts
expect(observers.last.host).toBe(component.observer);
```

## `options` — what the constructor was given

`options` is the second argument the component passed to the constructor. Use it when a component
creates one observer per configuration, for example one per root margin.

```ts
new IntersectionObserver(callback, { rootMargin: '-20% 0px -70% 0px' });

expect(observers.last.options).toEqual({ rootMargin: '-20% 0px -70% 0px' });
```

## `autoEmit` — everything is visible, immediately

With `autoEmit: true`, the stub calls the callback with `isIntersecting: true` as soon as the
component calls `observe()`. Use it for a suite ported from Jest whose global mock did that, so lazy
sections load during `detectChanges()`.

```ts
stubIntersectionObserver({ autoEmit: true });
```

The default stub stays silent until you call `emit`, which is right when the spec picks the moment of
intersection. Without `autoEmit`, a ported spec asserts on a component that never loaded anything,
and fails with an error that has nothing to do with intersection.

`stubObserver` takes a function instead, and you build the entry:

```ts
stubObserver<ResizeObserverEntry, Element>('ResizeObserver', {
  autoEmit: (target) => resizeEntry(target, { width: 320 }),
});
```

## Install it in `beforeEach`, never in `beforeAll`

Vitest runs a file's `beforeAll` once, before any `beforeEach`. So a root `beforeEach` in a shared
setup file runs **after** that `beforeAll`. If the setup file installs a default observer stub there, a stub
installed in `beforeAll` is replaced by it before the first test
starts. The symptom is `expected "vi.fn()" to be called 2 times, but got 0 times` with the stub ten
lines above the assertion.

For the same observer in every test of a file, use
[`installPerTest`](./setup#reinstalling-a-stub-for-every-test).

## The stub nobody takes off

The stub is installed through `mockValueProp`, so `restoreMockedProps()` puts the real constructor
back after each test. [`setupAutoSpy()`](./setup) already runs that; you write no teardown.

A spec that assigns `globalThis.IntersectionObserver` itself leaves it there. With `isolate: false`,
the next file in the worker inherits it and fails on something unrelated, such as
`.observe is not a function`.

## The instance reached through a static field

A hand-written mock often keeps the last instance in a static field (`MockObserver.last`). That
field survives the file just like the stub: the next spec finds the previous spec's observer. Here
the handle owns the instances, so nothing outlives the spec that made it.

## Replacing a hand-rolled global stub

```ts
// before — a cast, and a restore you have to remember
const original = global.IntersectionObserver;

global.IntersectionObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof IntersectionObserver;

afterEach(() => {
  global.IntersectionObserver = original;
});
```

```ts
// after
const observer = stubIntersectionObserver();
```

The one line gives you three things: a stub the spec can drive (`observer.emit(...)`), automatic
restore of the global, and correct types without `as unknown as`.

The lint rule [`prefer-observer-stub`](./eslint-rules#prefer-observer-stub)
reports the hand-written form in all three spellings: the assignment above,
`vi.stubGlobal('IntersectionObserver', Fake)` and `vi.spyOn(globalThis, 'ResizeObserver')`. It names
the helper to use instead, and it is an `error` in `configs.recommended`.
