---
title: Constructor doubles
description: mockConstructor and stubConstructor build a stand-in the code under test can call with new, which a vi.fn() with an arrow function cannot be.
---

# Constructor doubles

Use these helpers when your code calls `new` on something you want to replace: `new Image()` for a
tracking pixel, `new Worker()`, `new WebSocket()`, a payment widget or a player SDK. A `vi.fn()` with
an arrow function cannot stand in for a constructor; these can.

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

Under Jest, `jest.fn().mockImplementation(() => instance)` worked with `new`. Vitest calls the
implementation on `new` only if the implementation itself can be constructed, and an arrow function
cannot. The call is recorded, the body never runs, and `new` returns an empty object. Vitest prints a
warning to stderr ("the mock did not use 'function' or 'class' in its implementation"), but it is far
from the failure.

You then see one of two things, and neither points at the spec:

- `TypeError: (cb) => {…} is not a constructor`, with a stack in your app code;
- a test that passes for the wrong reason: the empty object has no methods, a call on it throws
  inside a `try`, the `catch` logs, and `expect(logger.err).toHaveBeenCalledWith(expect.any(Error))`
  is satisfied.

## `mockConstructor(factory, name?)`

Returns a mock that also works with `new`. Every normal mock feature still works
(`toHaveBeenCalledWith`, `mockClear`, `mock.calls`), and `new` runs your factory.

```ts
import { mockConstructor, mockValueProp } from 'vitest-auto-spy';

const LicenseClient = mockConstructor<LicenseClient>(() => ({ prepareRequest: vi.fn() }));

mockValueProp(shaka.net, 'LicenseClient', LicenseClient);
player.load(url);

expect(LicenseClient).toHaveBeenCalledWith('widevine');
expect(LicenseClient.instances[0].prepareRequest).toHaveBeenCalled();
```

| Parameter | Type             | Default             | Meaning                                               |
| --------- | ---------------- | ------------------- | ----------------------------------------------------- |
| `factory` | `(...args) => T` | —                   | Builds one instance; receives the `new` arguments     |
| `name`    | `string`         | `'mockConstructor'` | Shown in assertion output and in this helper's errors |

- **`instances`** (for example `Image.instances`) holds what the factory produced, in construction
  order. `mockClear()` does not empty it, so you can still assert on objects after clearing the calls.
  This is the helper's own list; the runner's `mock.instances` is separate and is cleared as usual.
- **Called without `new`, it throws**, naming the file and line of the call that lost the `new`.
- **The factory must return an object.** `new` throws away a primitive return value, so a factory
  that returns one fails right away with the fix: return the instance from the factory.

**Common mistake:** `vi.fn(() => instance)` as a constructor. It records the call but `new` returns
an empty object. Use `mockConstructor(() => instance)`.

## `stubConstructor(target, property, factory)`

The same double, put on a global (or on any object) and removed again after the test.

```ts
import { stubConstructor } from 'vitest-auto-spy';

const Widget = stubConstructor(window, 'PaymentSdk', (params: PayParams) => ({ render: vi.fn() }));
```

It is installed through [`mockValueProp`](/utilities/setup), so `restoreMockedProps()` puts the real
constructor back. `setupAutoSpy()` already runs that after every test. That is the difference from a
hand-written `vi.stubGlobal`: with `isolate: false`, a stub nobody removes is inherited by the next
file in the worker and fails there.

For `IntersectionObserver`, `ResizeObserver` and `MutationObserver`, use the ready-made
[observer stubs](/utilities/observer-stubs) instead.

## Which of the three

| You have                           | Use                                             | Import from                 |
| ---------------------------------- | ----------------------------------------------- | --------------------------- |
| a real class at runtime            | `createSpyClass(Foo)`; instances are auto-spies | `vitest-auto-spy`           |
| only a type, or a hand-built shape | `mockConstructor<T>(() => shape)`               | `vitest-auto-spy`           |
| the constructor lives on a global  | `stubConstructor(globalThis, 'Image', factory)` | `vitest-auto-spy`           |
| one of the three DOM observers     | `stubIntersectionObserver()` and friends        | `vitest-auto-spy/dom-stubs` |
| `AbortController`                  | `stubAbortController()`                         | `vitest-auto-spy/dom-stubs` |

`createSpyClass(Foo)` replaces the constructor only. If your code also reads statics from the class
(`Foo.isSupported()`, `Foo.create()`, `Foo.VERSION`), pass `{ statics: true }` as its third argument.
What each kind of static becomes: [Bridging `Spy<T>` and `T`](/core/spy-typing).

### A constructor that is a member of a double

You need none of the three when your code reaches the class **through a dependency** the spec already
replaces, as in `new this.sdk.Client(key)`. A spied member works with `new`: the call is recorded,
and your code receives a fresh instance or whatever you configured for those arguments.

```ts
import { createAutoMock } from 'vitest-auto-spy';

const sdk = createAutoMock<Sdk>();

service.connect(); // `new this.sdk.Client(key)` inside

expect(sdk.Client).toHaveBeenCalledWith(key);
```

The three helpers are for a constructor your code reaches **directly**: a global it names, an import
it calls, or a real class whose instances should be auto-spies.

## `stubAbortController()`

Replaces `AbortController` and `AbortSignal` with versions that work under jsdom. Use it when a
component uses `addEventListener(…, { signal })` and a jsdom test fails with:

```
TypeError: 'addEventListener' called on an object that is not a valid instance of EventTarget
```

```ts
import { stubAbortController } from 'vitest-auto-spy/dom-stubs';

beforeEach(() => {
  stubAbortController();
});
```

The error has three parties and names none of them. Vitest puts Node's `AbortController` over the
jsdom globals, so a signal is a Node `EventTarget`. zone.js then calls jsdom's `addEventListener`
with that signal, and jsdom rejects it. The replacement extends the `EventTarget` of the current
environment, which all three accept. It is installed as a property patch, so it is removed after the
test with everything else.

**Common mistake:** installing it in `beforeAll`. It is removed after the first test; install it in
`beforeEach`.

### The statics, too

`AbortSignal.abort()`, `AbortSignal.timeout()` and `AbortSignal.any()` work on the stub too:

```ts
vi.useFakeTimers();
stubAbortController();

const request = client.load(); // fetch(url, { signal: AbortSignal.timeout(5_000) })

vi.advanceTimersByTime(5_000);

await expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
```

`timeout()` aborts through `setTimeout`, so fake timers drive it like the real one. A timeout aborts
with a `DOMException` named `TimeoutError`; every other abort uses one named `AbortError`. Your code
can branch on that name, as with the real platform.
