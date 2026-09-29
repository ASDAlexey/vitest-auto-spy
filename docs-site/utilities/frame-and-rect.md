---
title: Frames and element boxes
description: stubAnimationFrame runs requestAnimationFrame when the spec says, and stubElementRect makes getBoundingClientRect report a box; both are put back after the test.
---

# Frames and element boxes

Two stubs for code that measures elements or waits for the next frame. jsdom and happy-dom lay
nothing out, so every element measures 0 × 0, and they run frames on their own timers.

- `stubAnimationFrame()` runs `requestAnimationFrame` callbacks when your spec says so.
- `stubElementRect()` makes one element's `getBoundingClientRect()` return the box you give.

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

Both are removed after each test. A hand-written `window.requestAnimationFrame = …` or a partial
object returned from `getBoundingClientRect` leaks into the next file under `isolate: false`.

## `stubAnimationFrame(options?)`

Replaces `requestAnimationFrame` and `cancelAnimationFrame` with spies whose timing your spec decides.

| Option    | Type                        | Default                | Meaning                                                         |
| --------- | --------------------------- | ---------------------- | --------------------------------------------------------------- |
| `mode`    | `'immediate'` \| `'queued'` | `'immediate'`          | When a requested frame runs; see below                          |
| `onError` | `(error) => void`           | —                      | Called with what a callback threw, instead of throwing it       |
| `view`    | `object` \| `null`          | `document.defaultView` | Also patch this window object; `null` patches `globalThis` only |

| `mode`        | A requested frame runs                                           |
| ------------- | ---------------------------------------------------------------- |
| `'immediate'` | before `requestAnimationFrame` returns, with `performance.now()` |
| `'queued'`    | on `flush(timestamp?)`, with the same timestamp for every frame  |

The returned handle:

| Member                                          | What it is                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pending`                                       | How many requested frames have not run                                                             |
| `flush(timestamp?)`                             | Runs every frame requested so far, as one browser frame; timestamp defaults to `performance.now()` |
| `flushAll(timestamp?)`                          | Runs frames until none is pending, including frames requested from inside a frame                  |
| `lastHandle`                                    | The handle the latest `requestAnimationFrame` call returned; `undefined` before the first          |
| `requestAnimationFrame`, `cancelAnimationFrame` | The installed spies, typed `Mock<RequestAnimationFrameFn>` / `Mock<CancelAnimationFrameFn>`        |
| `restore()`                                     | Puts the previous globals back and drops what is pending, before the test ends                     |

Rules worth knowing:

- **A frame requested inside a running frame waits for the next `flush()`**, in both modes, as in a
  browser. An animation loop moves one step per `flush()`. In `'immediate'` mode the first step runs
  right away, and a frame requested from inside it does not run immediately as well.
- **A frame cancelled by an earlier callback in the same `flush()` does not run.**
- **`flushAll()` stops after 1000 rounds** and throws. Only a loop that never stops requesting frames
  gets there; step it with `flush()` instead.
- **A callback that throws stops the flush.** The frames after it stay pending, and the next `flush()`
  runs them. With `onError`, the error goes to your function instead (in `'immediate'` mode, instead
  of out of `requestAnimationFrame`). Rethrow inside it for errors you did not mean to swallow:

```ts
const frames = stubAnimationFrame({
  onError: (error) => {
    if (!isExpectedReentrancy(error)) {
      throw error;
    }
  },
});
```

**Common mistake:** asserting a cancel against a literal handle such as `1`. Handles start above
2^30, so compare with `lastHandle`:

```ts
expect(frames.cancelAnimationFrame).toHaveBeenLastCalledWith(frames.lastHandle);
```

Handles start that high so the stub can tell its own from the environment's. A cancel for a handle the
stub did not issue goes to the real `cancelAnimationFrame`. This matters when you install the stub
after a render: zoneless Angular may already have a real frame pending, and its cancel still reaches
it.

## `stubElementRect(element, rect?)`

Makes `element.getBoundingClientRect()` return a box. `rect` is a `DOMRectInit`: `x`, `y`, `width`
and `height`, each `0` when left out.

```ts
stubElementRect(mapContainer, { width: 800, height: 600 });

mapContainer.getBoundingClientRect(); // DOMRect { x: 0, y: 0, width: 800, height: 600, right: 800, bottom: 600, … }
```

- Every call returns a new `DOMRect`, as the browser does. `top`, `right`, `bottom` and `left` always
  match the four numbers.
- Only this element is patched; other elements still report zeros.
- It returns an undo function. The undo also carries the installed spy as `.getBoundingClientRect`,
  to assert that the measurement happened:

```ts
const stub = stubElementRect(settingsTab, { width: 240 });

component.selectTab('settings');

expect(stub.getBoundingClientRect).toHaveBeenCalled();
```

`vi.resetAllMocks()` or `mockReset()` during a test clears the calls and keeps the box, whichever
spy engine you use. The same holds for the `stubAnimationFrame` spies.

**Common mistake on Bun:** there, `mockReset()` drops the box, and the element returns `undefined`.
Call `stubElementRect` again after a reset.

## Taking them off

Both install through `mockValueProp`. `restoreMockedProps()`, which `setupAutoSpy()` runs after every
test, puts back the previous globals and the element's own method.

Install them in `beforeEach` or in the test. A call in `beforeAll` or a `describe` body is removed
after the first test and is gone for the rest.

`stubAnimationFrame` also patches `document.defaultView` when it is a separate object from
`globalThis`, as under happy-dom. `view: null` patches `globalThis` only.
