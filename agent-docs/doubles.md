# vitest-auto-spy — Doubles for what the code builds itself

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 12. Doubles for what the code builds itself

Production code that does `new Foo()` cannot be served by a `vi.fn()`. Vitest only forwards `new` to
an implementation that is itself constructible, and **an arrow function is not**: the call is
recorded, the body never runs, `new` hands back an empty object. The warning Vitest prints
("the mock did not use 'function' or 'class'") is nowhere near the failure, which arrives as
`TypeError: (cb) => {…} is not a constructor` with a stack **in production code** — or as a green
test for the wrong reason, when the resulting `undefined` is swallowed by a `catch`.

```ts
import { createSpyClass, mockConstructor, stubConstructor } from 'vitest-auto-spy';

// a real class exists                    → full auto-spy instances
mockValueProp(globalThis, 'Worker', createSpyClass(BackgroundWorker));

// only a type / a shape exists           → a runner mock that is also a constructor
const LicenseClient = mockConstructor<LicenseClient>(() => ({ prepareRequest: vi.fn() }));

// it lives on a global (or any object)   → the same, installed and auto-restored
const Image = stubConstructor(globalThis, 'Image', () => ({ src: '' }));

tracker.ping();
expect(Image).toHaveBeenCalledTimes(1);
expect(Image.instances[0].src).toBe('https://tns.example/hit');
```

`mockConstructor` stays a runner mock, so `toHaveBeenCalledWith` / `mockClear` work as usual, and it
throws a named error if it is ever called **without** `new`. `stubConstructor` installs through
`mockValueProp`, so `restoreMockedProps()` puts the platform's constructor back.

**Static members are opt-in — `createSpyClass(Class, config, { statics: true })`.** Production code
that reaches the class rather than an instance (`BackgroundWorker.isSupported()`,
`Client.fromToken(t)`, a `VERSION` constant) finds nothing on the double otherwise, and the failure
is a `TypeError` on the class, not on the spy:

```ts
const WorkerSpy = createSpyClass(BackgroundWorker, undefined, { statics: true });

WorkerSpy.isSupported.mockReturnValue(true); // needs a cast — see below
```

What the option copies, walking the class's own prototype chain so inherited statics come too: a
static **function** becomes a full spy of its own, a static **data member** is copied by value, and a
static **accessor** is skipped and never evaluated — a getter that reads configuration or touches the
network must not run because a double was built. `prototype`, `length`, `name`, `caller`,
`arguments` and the double's own `calls` / `instances` are never overwritten. It is off by default
for that last reason: a class with a static named `calls` would otherwise shadow the construction
log. **The statics are not typed** — the return type is still `ConstructorSpy<T>`, so reading one
needs a cast at the spec; type them and this note goes.

For the three observers, prefer the purpose-built stubs (§13). For a `Worker` the code builds with
`new Worker(new URL(…, import.meta.url))`, prefer `stubWorker({ respond })` from `/dom-stubs`: an
`EventTarget` whose listeners all receive the reply, answered on a microtask after `postMessage`
returns, with `last.messages`, `last.emit(data)` and `last.fail(error)` on the handle. For `AbortController` — which breaks
in a jsdom run for a reason involving none of the three parties in the stack trace — use
`stubAbortController()`.

The stub carries `AbortSignal.abort()`, `AbortSignal.timeout()` and `AbortSignal.any()` as well —
the three statics are how modern code makes a signal without a controller, `fetch(url, { signal:
AbortSignal.timeout(5_000) })` most of all. `timeout()` aborts through `setTimeout`, so
`vi.useFakeTimers()` drives it exactly as it drives the platform's, and it aborts with a
`TimeoutError` rather than an `AbortError` because that is the distinction the platform draws. A
signal's `reason` is the platform's `DOMException`, so code branching on
`signal.reason.name === 'AbortError'` takes the same branch it takes in a browser.

### `<video>` and `<audio>`

jsdom implements them as a shell: `play()` throws, `duration` is `NaN` and is an accessor with no
setter, `canPlayType()` answers `''` for everything, `readyState` never leaves 0, `error` is not on
the prototype. `stubMediaElement()` patches the prototype (so it covers an element production code
creates itself) and, crucially, **fires the event that goes with each change** — production code
listens for `durationchange` / `timeupdate` / `ended`, and assigning the field alone leaves those
handlers unrun:

```ts
const media = stubMediaElement({ duration: 120 });

media.set(video, { readyState: 1 }); // → loadedmetadata
media.set(video, { currentTime: 119 }); // → timeupdate
media.set(video, { ended: true }); // → pause, then ended — and the element is paused
expect(media.play).toHaveBeenCalledTimes(1);
```

State is per element, so an ad and the content report different durations — and per **install**, so
an element held in module scope or left in the document under `isolate: false` takes the new
install's `duration` rather than the previous one's. `set({ ended: true })` pauses the element and
fires `pause` before `ended`, as the platform does: an element that is both ended and playing is a
state no browser produces, and a player listening for `pause` was never told.

`currentTime` is a get/set pair, so a player restarting itself with `video.currentTime = 0` reaches
the record and fires `timeupdate` too — `media.set()` is not the only way in, and the component's own
handler runs where it used to stay unrun while the assertion read the new value.

### `localStorage` and `sessionStorage`

Do not write a `TestingStorage` class per project. `stubWebStorage()` installs an in-memory `Storage`
for this test — `getItem` / `setItem` / `removeItem` / `clear` / `key` / `length`, string coercion
as the platform does it — and `snapshot()` is the plain record to assert on:

```ts
import { type WebStorageStub, stubWebStorage } from 'vitest-auto-spy/dom-stubs';

let local: WebStorageStub;

beforeEach(() => {
  local = stubWebStorage('localStorage', { items: { token: 'abc' } }); // or 'sessionStorage'
});

it('forgets the token on logout', () => {
  session.logout();
  expect(local.snapshot()).toEqual({});
});
```

Writes in the middle of a test go through `.storage`, the installed `Storage` itself:
`local.storage.setItem('token', 'xyz')`. The stub is not a `Storage`; `local.setItem` is a `TS2339`.

It goes through `mockValueProp`, so `restoreMockedProps()` (and `setupAutoSpy()` between tests) puts
the previous storage back; install it in `beforeEach`. It also lands on `document.defaultView` when
that is a separate object. It is not `restoreWebStorage()`: that one repairs a broken environment
once and leaves a working storage alone; this one replaces whatever is there, for one test, and
installs even in a `node` environment because the spec asked for it. Named-property access
(`localStorage.token`, `Object.keys(localStorage)`) does not see the items — read through the API.

### Animation frames and element boxes

Do not assign `window.requestAnimationFrame` by hand, and do not stub `getBoundingClientRect` with a
partial literal. Both have a stub on `/dom-stubs`:

```ts
import { stubAnimationFrame, stubElementRect } from 'vitest-auto-spy/dom-stubs';

beforeEach(() => {
  stubAnimationFrame(); // 'immediate': the callback runs before requestAnimationFrame returns
  stubElementRect(container, { width: 800, height: 600 }); // x / y default to 0
});

it('scrolls after the next frame', () => {
  const frames = stubAnimationFrame({ mode: 'queued' });

  list.scrollToSelected();
  expect(frames.pending).toBe(1);

  frames.flush(); // one frame; the timestamp defaults to performance.now()
  expect(list.scrolled).toBe(true);
});
```

`stubAnimationFrame` stubs `cancelAnimationFrame` too, and hands both spies back as
`frames.requestAnimationFrame` / `frames.cancelAnimationFrame`. A frame requested from inside a
running frame is queued in either mode, so a loop that requests its own next frame advances one step
per `flush()`. A callback that throws stops `flush()` (or propagates out of `requestAnimationFrame`
in `'immediate'` mode); pass `onError: (error) => { … }` to intercept it instead — rethrow from
inside to keep the default for an error you did not mean to swallow. `stubElementRect` returns a real
`DOMRect` per call, edges derived, plus the installed spy as `.getBoundingClientRect` for
`expect(stub.getBoundingClientRect).toHaveBeenCalled()`, and the return value is still callable as the
undo. The box is the spy's creation implementation, so `vi.resetAllMocks()` / `mockReset()` mid-test
keeps it on both spy engines; Bun's `mockReset()` drops it (re-stub after a reset there). Both go through `mockValueProp`, so `restoreMockedProps()` (and `setupAutoSpy()` between tests)
takes them off; `frames.restore()` does it sooner.

### A module mock that did nothing

`vi.mock()` is the one thing in a ported suite that fails **silently**. Under a bundler
(`@angular/build:unit-test`, a pre-built `vite-node` entry) a workspace alias or a barrel is already
inlined when the mock would be installed, so the real implementation runs and the test either passes
for the wrong reason or fails somewhere unrelated.

```ts
import * as engine from '@app/pricing-engine';

vi.mock('@app/pricing-engine');
beforeEach(() => assertMocked(engine, { specifier: '@app/pricing-engine', exports: ['createEngine'] }));
```

And when a mocked dependency probes itself with `mod.default ?? mod` — every package that ships both
CJS and ESM does — a factory of bare named exports throws `No "default" export is defined on the
mock` from **inside that dependency**. `moduleNamespace` is the shape it expects:

```ts
vi.mock('shaka-player', () => moduleNamespace({ Player: mockConstructor(() => playerStub) }));
```

A factory that spells out its own `default` **keeps it** — `moduleNamespace({ default: dayjsStub, utc })`
gives the probing dependency `dayjsStub`, where it used to be replaced by the namespace itself and
the default export silently became the wrong object. Only a factory without one gets
`default: <the namespace>`, which is the interop shape it was there for; the return type follows.

A factory's `vi.fn()` comes back typed as the real function, without `calledWith` or `resolveWith`.
`adoptMock` takes it over in place — same object, history kept, typed from the export's signature —
and an unconfigured call keeps answering what the mock answered before:

```ts
import { loadUser } from './api';

vi.mock('./api', () => ({ loadUser: vi.fn() }));
adoptMock(loadUser).calledWith(7).resolveWith({ id: 7, name: 'Ada' });
```

To keep the real module and configure one case, spy it through:
`vi.mock('./api', async (importOriginal) => moduleNamespace(await importOriginal(), { passthrough: true }))`.
Every function export runs for real and is recorded until configured; classes and values stay real;
calls one export makes to another inside the module are not recorded. A `vi.spyOn` / `{ spy: true }`
mock calls an original it does not report, so adopting it makes an unconfigured call answer
`undefined`; `node:test`'s `mock.fn()` is refused.

There is no `mockModule(…)` helper here, and there cannot be: Vitest hoists the literal `vi.mock`
call, so a wrapper around it would be hoisted as a call to a function that does not exist yet. Share
a fixture between the factory and the tests with `vi.hoisted()`.
