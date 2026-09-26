---
title: Frames and element boxes
description: stubAnimationFrame and stubElementRect — requestAnimationFrame on the spec's schedule, and a getBoundingClientRect that reports a box, both put back automatically.
---

# Frames and element boxes

```ts
import { stubAnimationFrame, stubElementRect } from 'vitest-auto-spy/dom-stubs';

it('scrolls the selected row into view after the next frame', () => {
  const frames = stubAnimationFrame({ mode: 'queued' });

  stubElementRect(viewport, { height: 300 });
  list.select(42);

  expect(frames.pending).toBe(1);

  frames.flush();

  expect(list.firstVisibleRow()).toBe(42);
});
```

jsdom and happy-dom lay nothing out and schedule frames on their own timers. Code that measures an
element or waits for a frame meets a spec that assigns `window.requestAnimationFrame` by hand and
returns a partial literal from `getBoundingClientRect`. Both leak into the next file under
`isolate: false`, and the literal passes for a `DOMRect` only because nothing reads the fields it
lacks.

## `stubAnimationFrame(options?)`

Replaces `requestAnimationFrame` and `cancelAnimationFrame` with spies whose timing the spec decides.

| `mode`                  | A requested frame runs                                           |
| ----------------------- | ---------------------------------------------------------------- |
| `'immediate'` (default) | before `requestAnimationFrame` returns, with `performance.now()` |
| `'queued'`              | on `flush(timestamp?)`, with the same timestamp for every frame  |

The handle:

- `pending` — how many requested frames have not run.
- `flush(timestamp?)` — run every frame requested so far, as one browser frame. The timestamp defaults
  to `performance.now()`. A frame cancelled by an earlier callback of the same flush does not run.
- `requestAnimationFrame` / `cancelAnimationFrame` — the installed spies, for
  `expect(frames.cancelAnimationFrame).toHaveBeenCalledWith(handle)`.
- `restore()` — put the previous globals back and drop what is pending, before the test ends.

**A frame requested from inside a running frame waits for the next `flush()`**, in both modes, as it
waits for the next frame in a browser. An animation loop that requests its own next frame therefore
advances one step per `flush()`; in `'immediate'` mode the first step runs on the spot and the loop
does not recurse.

A callback that throws stops the flush. The frames after it stay pending, and the next `flush()` runs
them. Pass `onError` to intercept the throw instead — called with whatever the callback threw, in
place of letting it propagate out of `flush()` (or, in `'immediate'` mode, out of
`requestAnimationFrame` itself); rethrow from inside it to keep the default for an error you did not
mean to swallow:

```ts
const frames = stubAnimationFrame({
  onError: (error) => {
    if (!isExpectedReentrancy(error)) {
      throw error;
    }
  },
});
```

## `stubElementRect(element, rect?)`

Makes `element.getBoundingClientRect()` return a box. The `rect` is a `DOMRectInit`: `x`, `y`,
`width` and `height`, each `0` when left out.

```ts
stubElementRect(mapContainer, { width: 800, height: 600 });

mapContainer.getBoundingClientRect(); // DOMRect { x: 0, y: 0, width: 800, height: 600, right: 800, bottom: 600, … }
```

Every call returns a fresh `DOMRect`, as the browser does, so `top`, `right`, `bottom` and `left`
always agree with the four numbers given. Only the element passed is patched; its siblings keep
answering zeros. The call returns the undo, which also carries the installed spy as
`.getBoundingClientRect`, for a test that must assert the measurement happened rather than only shape
its result:

```ts
const stub = stubElementRect(settingsTab, { width: 240 });

component.selectTab('settings');

expect(stub.getBoundingClientRect).toHaveBeenCalled();
```

The box is the implementation the spy was created with, so a `vi.resetAllMocks()` or `mockReset()`
in the middle of a test empties the calls and keeps the box, on both spy engines. Bun is the
exception: its `mockReset()` drops the implementation, and the element then answers `undefined` —
call `stubElementRect` again after a reset there. The same holds for the `stubAnimationFrame` spies.

## Taking them off

Both go through `mockValueProp`. `restoreMockedProps()`, which `setupAutoSpy()` runs after every test,
puts back the previous globals and the element's own method. Install them in `beforeEach` or in the
test. A call in `beforeAll` or a `describe` body is swept after the first test and gone for the rest.
`stubAnimationFrame` also patches `document.defaultView` when it is a separate object from
`globalThis`, as it is under happy-dom. `view: null` patches `globalThis` alone.
