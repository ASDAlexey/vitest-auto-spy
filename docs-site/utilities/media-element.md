---
title: Media element stub
description: stubMediaElement makes video and audio elements play, report a duration and fire the events a component listens for, which jsdom does not do.
---

# Media element stub

`stubMediaElement()` makes `<video>` and `<audio>` elements work in a jsdom test: `play()`
resolves, `duration` has a value, and changing the state fires the events your component listens
for. Use it for player, advertising or subtitle components.

```ts
import { stubMediaElement } from 'vitest-auto-spy/dom-stubs';

let media: ReturnType<typeof stubMediaElement>;

beforeEach(() => {
  media = stubMediaElement({ duration: 120 });
});

it('marks the video finished', () => {
  const fixture = TestBed.createComponent(PlayerComponent);
  fixture.detectChanges();

  const video = fixture.nativeElement.querySelector('video');

  media.set(video, { ended: true }); // fires `pause`, then `ended`

  expect(media.play).toHaveBeenCalledTimes(1);
  expect(fixture.componentInstance.finished()).toBe(true);
});
```

Without it, jsdom gives you an empty shell:

| What the code under test does    | What jsdom does                                   |
| -------------------------------- | ------------------------------------------------- |
| `await video.play()`             | throws `Not implemented: HTMLMediaElement.play()` |
| `video.duration`                 | `NaN`, and assigning it throws                    |
| `video.canPlayType('video/mp4')` | `''` for every type, so feature detection says no |
| `video.readyState`               | `0`, forever                                      |
| `video.error`                    | not there at all                                  |
| `video.load()`                   | nothing                                           |

| Option        | Type                                  | Default            | Meaning                                          |
| ------------- | ------------------------------------- | ------------------ | ------------------------------------------------ |
| `duration`    | `number`                              | `0`                | Duration every element reports until you set one |
| `canPlayType` | `(type: string) => CanPlayTypeResult` | `() => 'probably'` | What `canPlayType(type)` answers                 |

**Common mistake:** installing it once in a `describe` body or `beforeAll`. It is removed after the
first test. Install it in `beforeEach`, as above, or use
[`installPerTest`](/utilities/setup#reinstalling-a-stub-for-every-test).

## Driving one

`media.set(element, state)` changes an element's state and fires the events the browser would fire.
Use it instead of assigning fields: your component's `durationchange`, `timeupdate` or `ended`
handlers only run when the event fires.

```ts
media.set(video, { readyState: 1 }); // fires `loadedmetadata`
media.set(video, { currentTime: 119 }); // fires `timeupdate`
media.set(video, { ended: true }); // fires `pause`, `ended`
```

| Field passed to `set` | Event dispatched |
| --------------------- | ---------------- |
| `duration`            | `durationchange` |
| `readyState` ≥ 1      | `loadedmetadata` |
| `currentTime`         | `timeupdate`     |
| `ended: true`         | `pause`, `ended` |
| a non-null `error`    | `error`          |

Several fields in one call fire several events, in the order of the table.

- `ended: false` and `error: null` fire nothing: they clear a state, and the browser has no event for
  that.
- `ended: true` also sets `paused` to `true` and fires `pause` before `ended`, as the browser does
  when media plays to the end. If you pass `paused` in the same call, your value is kept.
- `media.state(element)` returns the current state: `duration`, `currentTime`, `paused`, `ended`,
  `readyState` and `error`.

## Seeking the way the component does

A player that restarts assigns the field directly, and that works too:

```ts
component.restart(); // video.currentTime = 0

expect(media.state(video).currentTime).toBe(0);
expect(component.progress()).toBe(0); // its own `timeupdate` handler ran
```

Assigning `currentTime` fires `timeupdate`, exactly as `media.set(video, { currentTime: 0 })` does.

## State is per element

Each element has its own state, so an ad and the main video can report different durations:

```ts
media.set(advert, { duration: 15 });

expect(advert.duration).toBe(15);
expect(content.duration).toBe(120); // the option's default
```

`duration` starts at the `duration` option, or `0`. It is never `NaN`, so a component that waits for
a known length has one from the first read.

The state belongs to the current `stubMediaElement()` call. An element that outlives its test (kept
in a module variable, or left in `<body>` under `isolate: false`) starts again from the defaults of
the stub installed now.

## `play`, `pause`, `load`, `canPlayType`

They are mocks of your test runner (`vi.fn()` on Vitest), shared by every media element, so every matcher works:

```ts
expect(media.pause).toHaveBeenCalledTimes(1);
```

- `play()` returns a resolved promise, not `undefined`. Code often calls `.catch()` on it to ignore an
  autoplay error, and that line would throw on `undefined`. It also fires `play` and `playing`.
- `play.mock.instances[0]` tells you which element played.
- `canPlayType` answers `'probably'` by default. To make one codec unsupported, pass your own:

```ts
stubMediaElement({ canPlayType: (type) => (type.includes('vp9') ? '' : 'probably') });
```

## Installation and undo

The stub is installed on `HTMLMediaElement.prototype`. So it also covers an element your code
creates with `document.createElement('video')`, which a per-element stub could not reach.

It is installed through `mockValueProp` / `mockReadonlyPropGetter`, so `restoreMockedProps()` puts
the real prototype back after each test. [`setupAutoSpy()`](/utilities/setup) already runs that.
Without this, a hand-written `Object.defineProperty` on the prototype leaks into the next file.
