---
title: Media element stub
description: stubMediaElement — a <video> / <audio> that plays, reports a duration and fires the events a component listens for, which jsdom does not.
---

# Media element stub

```ts
import { stubMediaElement } from 'vitest-auto-spy';

const media = stubMediaElement({ duration: 120 });
```

jsdom implements the media elements as a shell, and every player, advertising or subtitle suite hits
the same list:

| What the code under test does    | What jsdom does                                    |
| -------------------------------- | -------------------------------------------------- |
| `await video.play()`             | throws `Not implemented: HTMLMediaElement.play()`  |
| `video.duration`                 | `NaN`, and it is an accessor — assigning it throws |
| `video.canPlayType('video/mp4')` | `''` for every type, so feature detection says no  |
| `video.readyState`               | `0`, forever                                       |
| `video.error`                    | not on the prototype at all                        |
| `video.load()`                   | nothing                                            |

So the spec writes forty lines of `Object.defineProperty` against `HTMLMediaElement.prototype` —
which leaks into the next file, because nothing takes it off again.

## Driving one

```ts
const fixture = TestBed.createComponent(PlayerComponent);
fixture.detectChanges();

const video = fixture.nativeElement.querySelector('video');

media.set(video, { readyState: 1 }); // fires `loadedmetadata`
media.set(video, { currentTime: 119 }); // fires `timeupdate`
media.set(video, { ended: true }); // fires `ended`

expect(media.play).toHaveBeenCalledTimes(1);
expect(component.finished()).toBe(true);
```

`set` is the part a hand-written patch usually gets wrong. Production code listens for
`durationchange` / `timeupdate` / `ended`; assigning the field alone leaves those handlers unrun, so
the component stays on its initial state while the assertion reads the element and sees the new
value — a disagreement that looks like a bug in the component.

| Field passed to `set` | Event dispatched |
| --------------------- | ---------------- |
| `duration`            | `durationchange` |
| `readyState` ≥ 1      | `loadedmetadata` |
| `currentTime`         | `timeupdate`     |
| `ended: true`         | `ended`          |
| a non-null `error`    | `error`          |

`ended: false` and `error: null` announce nothing: those clear a state, and the platform has no
event for that.

## State is per element

```ts
media.set(advert, { duration: 15 });

expect(advert.duration).toBe(15);
expect(content.duration).toBe(120); // the option's default
```

A patch that closes over one `duration` variable reports the same duration for the ad and for the
content — precisely the pair a player spec exists to tell apart. Every element gets its own record,
weakly keyed, and `media.state(element)` reads it back.

## `play`, `pause`, `load`, `canPlayType`

They are runner mocks shared by every media element, so every matcher applies:

```ts
expect(media.pause).toHaveBeenCalledTimes(1);
```

`play()` resolves a promise rather than returning `undefined` — production code routinely calls
`.catch()` on the result to swallow an autoplay rejection, and jsdom's `undefined` makes that line
throw. It also fires `play` and `playing`, since a component may wait for either.

`canPlayType` answers `'probably'` by default, and takes an implementation when one codec has to be
unsupported:

```ts
stubMediaElement({ canPlayType: (type) => (type.includes('vp9') ? '' : 'probably') });
```

## Installation and undo

The patch goes on `HTMLMediaElement.prototype`, so it also covers an element production code creates
itself with `document.createElement('video')` — the case a per-instance stub cannot reach. It is
installed through `mockValueProp` / `mockReadonlyPropGetter`, so `restoreMockedProps()` — which
[`setupAutoSpy()`](/utilities/setup) runs after every test — puts the real prototype back.

Install it in a `beforeEach`, or through
[`installPerTest`](/utilities/setup#reinstalling-a-stub-for-every-test): a stub installed once at
`describe` level is restored away after the first test.
