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
handler runs.

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
per `flush()`; `frames.flushAll()` runs such a chain until nothing is pending (and throws after 1000
rounds, on a loop that never stops). A `cancelAnimationFrame` for a handle the stub did not issue — a
native frame requested before it was installed, such as zoneless Angular's scheduler frame — is
passed on to the real `cancelAnimationFrame`, so installing the stub after the render leaks no timer.
The stub's own handles start above 2^30, so assert a cancel against the handle it
issued — `expect(frames.cancelAnimationFrame).toHaveBeenLastCalledWith(frames.lastHandle)`, or the
value `requestAnimationFrame` returned — never against a literal such as `1`. A callback that throws stops `flush()` (or propagates out of `requestAnimationFrame`
in `'immediate'` mode); pass `onError: (error) => { … }` to intercept it instead — rethrow from
inside to keep the default for an error you did not mean to swallow. `stubElementRect` returns a real
`DOMRect` per call, edges derived, plus the installed spy as `.getBoundingClientRect` for
`expect(stub.getBoundingClientRect).toHaveBeenCalled()`, and the return value is still callable as the
undo. The box is the spy's creation implementation, so `vi.resetAllMocks()` / `mockReset()` mid-test
keeps it on both spy engines; Bun's `mockReset()` drops it (re-stub after a reset there). Both go through `mockValueProp`, so `restoreMockedProps()` (and `setupAutoSpy()` between tests)
takes them off; `frames.restore()` does it sooner.

### An element for `ElementRef` — `createElementStub`

A directive or a DOM-touching service is tested through calls on a stub element, with no rendered
host. The spies keep state: `contains` answers what `add` put in, `getAttribute` what `setAttribute`
wrote, and `dispatchEvent` reaches the listeners.

```ts
import { createElementStub } from 'vitest-auto-spy/dom-stubs';

const host = createElementStub({ classes: ['card'] }); // also tagName, attributes, style, overrides

TestBed.configureTestingModule({ providers: [{ provide: ElementRef, useValue: new ElementRef(host.element) }] });
const directive = TestBed.runInInjectionContext(() => new HighlightDirective());

directive.onEnter();

expect(host.classList.add).toHaveBeenCalledWith('highlighted');
expect(host.classes()).toEqual(['card', 'highlighted']); // attributes(), styles(), listenerCount(type) too
host.emit('mouseleave'); // fires the listeners; records nothing on dispatchEvent
```

For `instanceof` checks, pass `elementClass`:

```ts
const input = createElementStub({ elementClass: HTMLInputElement, tagName: 'input', overrides: { value: '15' } });

expect(input.element).toBeInstanceOf(HTMLInputElement);
expect(input.element.value).toBe('15'); // inferred as HTMLInputElement
```

`elementClass?: { readonly prototype: T }` defaults to none and infers `T` from the class.
It uses the prototype without calling the constructor. `tagName` remains independent and defaults to `'div'`.
The supplied class adds no implementations. Configure missing properties and methods, such as `value` or `select`, in `overrides`.
Existing stub methods, such as `focus`, remain usable. Reading an unconfigured class member throws with its name.

### `mockElementRefProp` — an element for a signal query

Replace an optional or required `ElementRef` signal query and get the element spies in one call.
For example, `component.dateTrigger` has type `Signal<ElementRef<HTMLButtonElement> | undefined>`.
Its `focusTrigger()` method calls `focus()` on the queried element.

```ts
import { mockElementRefProp } from 'vitest-auto-spy/angular/doubles';

const trigger = mockElementRefProp(component, 'dateTrigger', {
  elementClass: HTMLButtonElement,
  tagName: 'button',
});
component.focusTrigger();
expect(trigger.focus).toHaveBeenCalledExactlyOnceWith();
```

This replaces a local element factory followed by `mockSignalProp(component, 'dateTrigger', new ElementRef(element))`.
The query determines the element type. Options are those of `createElementStub` and cannot change that type.
The handle also returns `ref` (the installed `ElementRef`) and `query` (a writable test signal).
Use `trigger.query.set(undefined)` to represent a missing optional query; required queries reject `undefined` in TypeScript.
Queries returning component or directive instances, and `viewChildren`, need `mockSignalProp` instead.

Patch before rendering a template, effect, or `computed` that consumes the original query.
Patching an already consumed query throws. This helper creates no rendered element and does not resolve Angular queries.
`setupAutoSpy()` restores the original query after each test. Without it, add cleanup:

```ts
import { afterEach } from 'vitest';
import { restoreMockedProps } from 'vitest-auto-spy';

afterEach(() => restoreMockedProps());
```

Reading an `HTMLElement` member the stub does not implement throws with the member's name — pass it
in `overrides: { offsetWidth: 120, querySelector: vi.fn() }`. `createElementStub` itself patches nothing and needs no cleanup.

### Events for direct handler calls

Use `createDomEvent` to supply readonly targets without a cast or `Object.defineProperty` in each test.
Here, `component.onBlur()` reads `currentTarget` and removes the `active` class.

```ts
import { createDomEvent, createElementStub, createInputEvent } from 'vitest-auto-spy/dom-stubs';

const input = createElementStub({ tagName: 'input', classes: ['active'] });
component.onBlur(createDomEvent('blur', { currentTarget: input.element }));
expect(input.classes()).toEqual([]);

component.onInput(createInputEvent('15'));
expect(component.value()).toBe('15');
```

`createDomEvent(type, init?)` returns a native `Event`. `bubbles` and `cancelable` default to `true`.
The optional `target` and `currentTarget` stay fixed. For propagation tests, omit them and dispatch on a real DOM element.

`createInputEvent(value, init?)` returns an `Event` of type `'input'` with an input stub as `target`.
It supports `instanceof HTMLInputElement` when that class exists. The supplied value wins over `init.element.overrides.value`.
Pass stub options through `element`, for example `{ element: { overrides: { disabled: true } } }`.
Pass other native event flags directly in `init`.

**Common mistake:** expecting `data`, `inputType`, or a browser input event constructor check to work.
This helper returns `Event`, not `InputEvent`. Use a native `InputEvent` when testing those browser features.

### Text paste and drop events

Replace local clipboard and drag event factories when a handler only reads plain text.
Here, `onPaste` and `onDrop` read the text and cancel the event.

```ts
import { createDropEvent, createPasteEvent } from 'vitest-auto-spy/dom-stubs';

const paste = createPasteEvent('15');
component.onPaste(paste);
expect(paste.defaultPrevented).toBe(true);

component.onDrop(createDropEvent('20'));
expect(component.value()).toBe('20');
```

Both accept `(text: string | null, init?: EventInit)` and default to bubbling, cancelable events.
`null` gives `clipboardData: null` or `dataTransfer: null`, so you can test absent data.
`getData('text')` and `getData('text/plain')` return the supplied text, ignoring case; other formats return `''`.
`types` is a readonly `['text/plain']` array. These events can also be dispatched on DOM elements.

The transfer supports only `getData()` and `types`. Reading `files`, `items`, `setData`, or any other transfer member throws.
These are native `Event` instances with the text transfer property added.
They need no `ClipboardEvent`, `DragEvent`, or `DataTransfer` constructor and do not pass those constructor checks.
For files, coordinates, transfer writes, or browser drag behavior, supply your own event.

### The members the DOM environment leaves out — `fillMissingDomApis`

Once in the setup file, before `setupAutoSpy()`: it fills `PointerEvent`, a no-op `ResizeObserver`,
no-op `scrollTo` / `scrollBy` / `scrollIntoView` on elements and `window` (jsdom's own only log
"Not implemented") and `document.doctype` — only what is missing, safe to run twice, and it returns
the names it filled. `{ cheapComputedStyle: true }` replaces `getComputedStyle` with one that answers
the inline style only: fast, and silent for a pseudo-element. Filled before the snapshot, these
globals are never blamed on a test by the global-patch guard.

```ts
// vitest.setup.ts
import { fillMissingDomApis } from 'vitest-auto-spy/dom-stubs';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

fillMissingDomApis();
setupAutoSpy();
```

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
gives the probing dependency `dayjsStub`. Only a factory without one gets
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
Every function export runs for real — with the call's receiver as `this`, here and in `adoptMock`'s
fall-through — and is recorded until configured; classes and values stay real;
calls one export makes to another inside the module are not recorded. A `vi.spyOn` / `{ spy: true }`
mock calls an original it does not report, so adopting it makes an unconfigured call answer
`undefined`; `node:test`'s `mock.fn()` is refused.

There is no `mockModule(…)` helper here, and there cannot be: Vitest hoists the literal `vi.mock`
call, so a wrapper around it would be hoisted as a call to a function that does not exist yet. Share
a fixture between the factory and the tests with `vi.hoisted()`.
