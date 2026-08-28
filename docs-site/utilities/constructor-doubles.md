---
title: Constructor doubles
description: mockConstructor and stubConstructor — a test double the code under test can call with `new`, because a vi.fn() cannot be one.
---

# Constructor doubles

```ts
import { stubConstructor } from 'vitest-auto-spy';

it('fires the tracking pixel', () => {
  const Image = stubConstructor(globalThis, 'Image', () => ({ src: '' }));

  tracker.ping();

  expect(Image).toHaveBeenCalledTimes(1);
  expect(Image.instances[0].src).toBe('https://tns.example/hit');
});
```

## The mistake this replaces

`jest.fn().mockImplementation(() => instance)` served `new` under Jest, so every suite old enough to
have mocked a global constructor carries that shape: `new Image()` for a tracking pixel, `new
Worker()`, `new WebSocket()`, `new Audio()`, a payment widget or a player SDK published as a global
class.

Vitest only forwards `new` to an implementation that is **itself constructible**, and an arrow
function is not. The call is recorded, the body never runs, and `new` hands back an empty object.
Vitest prints a warning on stderr — "the mock did not use 'function' or 'class' in its
implementation" — but it is not adjacent to the failure, and in a monorepo run it is one line among
thousands.

What arrives instead is one of two things, and neither points at the spec:

- `TypeError: (cb) => {…} is not a constructor`, with a stack **in production code** and the source
  of the arrow printed in the message but nothing saying that the arrow is the problem;
- a green test for the wrong reason: the empty object has no methods, the call throws inside a
  `try`, the `catch` logs, and `expect(logger.err).toHaveBeenCalledWith(expect.any(Error))` is
  satisfied.

## `mockConstructor(factory, name?)`

Returns a runner mock that is also a constructor. Everything a mock can do still applies —
`toHaveBeenCalledWith`, `mockClear`, `mock.calls` — and `new` reaches the factory.

```ts
import { mockConstructor } from 'vitest-auto-spy';

const LicenseClient = mockConstructor<LicenseClient>(() => ({ prepareRequest: vi.fn() }));

mockValueProp(shaka.net, 'LicenseClient', LicenseClient);
player.load(url);

expect(LicenseClient).toHaveBeenCalledWith('widevine');
expect(LicenseClient.instances[0].prepareRequest).toHaveBeenCalled();
```

- **`instances`** collects what the factory produced, in construction order. It is owned by the
  helper rather than read off the runner, so `mockClear()` does not empty it — clearing the call
  record and forgetting objects a spec still asserts against are different wishes, and the runner's
  own `mock.instances` covers the first one.
- **Called without `new`, it throws by name.** Today the only way to learn that a double was used
  wrongly is a `TypeError` several frames into somebody else's code.
- **The factory must return an object.** JavaScript discards a primitive returned from `new`, so a
  factory that returns one would hand the code under test something the spec never configured; that
  is reported immediately instead.

## `stubConstructor(target, property, factory)`

The same double, installed on a global (or on any object) and taken off again for you.

```ts
const Widget = stubConstructor(window, 'MTSPay', (params: PayParams) => ({ render: vi.fn() }));
```

Installation goes through [`mockValueProp`](/utilities/setup), so `restoreMockedProps()` — which
`setupAutoSpy()` already runs after every test — puts the real constructor back. That is the
difference from a hand-written `vi.stubGlobal`: with `isolate: false` a stub that is never removed
is inherited by the next file in the worker and fails there.

This is the generalisation of the [observer stubs](/utilities/observer-stubs) to everything else the
platform publishes as a class and production code constructs directly.

## Which of the three

| You have                             | Use                                              |
| ------------------------------------ | ------------------------------------------------ |
| a real class at runtime              | `createSpyClass(Foo)` — instances are auto-spies |
| only a type, or a hand-built shape   | `mockConstructor<T>(() => shape)`                |
| the constructor lives on a global    | `stubConstructor(globalThis, 'Image', factory)`  |
| it is one of the three DOM observers | `stubIntersectionObserver()` and friends         |
| it is `AbortController`              | `stubAbortController()`                          |

## `stubAbortController()`

`element.addEventListener('pointerdown', handler, { signal })` is the recommended way to detach
listeners since Angular 16, and it fails in a jsdom run with a message that names none of the three
parties responsible:

```
TypeError: 'addEventListener' called on an object that is not a valid instance of EventTarget
```

Vitest lays Node's fetch family over the jsdom globals, so a signal is a _Node_ `EventTarget`;
zone.js registers the abort listener through jsdom's own `addEventListener` with that signal as the
receiver; jsdom brand-checks the receiver and refuses. jsdom raises it, Node caused it, zone.js
triggered it, and the component under test is blamed.

```ts
import { stubAbortController } from 'vitest-auto-spy';

beforeEach(() => {
  stubAbortController();
});
```

The replacement extends whichever `EventTarget` belongs to the current realm, which is the one thing
all three parties agree on. It is registered as a property patch, so it comes off with everything
else.
