# vitest-auto-spy — Patching properties

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 9. Patching properties (and putting them back)

```ts
import { mockAccessorsProp, mockReadonlyProp, mockReadonlyPropGetter, mockValueProp, restoreMockedProps } from 'vitest-auto-spy';

mockReadonlyProp(service, 'isReady', true); // static value, signals included
mockReadonlyPropGetter(service, 'label', () => 'A'); // dynamic getter
mockValueProp(service, 'retries', 3); // plain writable value
mockAccessorsProp(service, 'theme'); // spied get + set

restoreMockedProps(); // put every patch back; each helper also returns its own undo
```

`vi.restoreAllMocks()` does **not** undo these — it knows about spies, not about redefined
properties. Never use bare `Object.defineProperty` in a spec: nothing restores the original
descriptor, and under `isolate: false` the patch leaks into the next file.

**They work on `createAutoMock` and `mockDeep` doubles too** — which they did not until 3.5.0.
Both are Proxies, all four helpers are built on `Object.defineProperty`, and neither Proxy trapped
it: the patch landed on the Proxy's own target, the `get` trap never looked there, nothing threw,
and the test carried on reading the old value. If you have seen a spec build a double by hand —
real getters plus a `createFunctionSpy` per method — this is usually why.

**The second overload is a normal tool, not a last resort.** Each helper has a checked overload
(`K extends keyof T`) and a `(object, property: PropertyKey, value: unknown)` one behind it, and
the JSDoc calls the latter the one for members the public type does not describe. In practice it
carries about half of the real calls, all of them legitimate. It cannot reach a JS `#private` field —
no property key can — and `'x' as keyof T` over one patches a new, unrelated key that nothing reads:

```ts
mockValueProp(router, 'routerState', { snapshot: { url: '/home' } }); // a partial fixture of a fat type
mockValueProp(window, 'AudioContext', undefined); // "this platform does not ship the API"
mockValueProp(transitionEvent, 'propertyName', 'opacity'); // a field a synthetic DOM event lacks
mockValueProp(spy, 'products$', new Subject()); // a member the double does not have at all
```

The last one is worth knowing on its own: patching a key the object never had **works and is undone
correctly** — the journal records the _absence_ of a descriptor and puts it back by deleting the
property. That is how you add an Observable member that `provideAutoSpy` did not create because
`observablePropsToSpyOn` was not passed.

What the second overload costs is the property-name check, so a typo in the name compiles. Nothing
checks the _value_ on either overload; that is deliberate, and the partial fixture above is why.

**A read the constructor does cannot be seeded by any of these.** They patch an object that already
exists, so the earliest they can run is after the double is built — and a component that reads
`service.paymentParams.offer` in a field initializer or in its constructor has already read it by the
time `TestBed.createComponent` returns:

```ts
fixture = TestBed.createComponent(PaymentComponent); // ← TypeError thrown here, inside the component
mockReadonlyProp(paymentService, 'paymentParams', params); // never reached
```

Nothing warns, because nothing of this library runs: the throw is a plain `TypeError` from the
component's own line, and the stack names the component rather than the seeding that is missing. The
only place early enough is the registration:

```ts
providers: [provideAutoSpy(PaymentService, { overrides: { paymentParams: params } })];
providers: [provideAutoSpyForToken(STATE_TOKEN, { snapshot })]; // a token's second argument does the same
```

Three migration shards found this independently, each of them after the failure had pointed at the
service. A `mock*Prop` after the render is right for everything a template or a method reads later —
which is most of them — and wrong only for a constructor-time read.

### Properties of DOM objects — the same helpers, and the reason to look for them

`document.fullscreenElement`, `document.visibilityState`, `document.cookie`, `navigator.userAgent`,
`element.scrollHeight`: half the patching a browser suite does is on objects, not on `globalThis`,
so the "globals go through `stubGlobal`" rule does not cover it. `mockValueProp` does — it is the
port of `jest.replaceProperty`, and a project that never used that one walks straight past it.

```ts
mockValueProp(document, 'fullscreenElement', videoElement);
mockValueProp(navigator, 'userAgent', 'Tizen 6.0');
mockValueProp(element, 'scrollHeight', 400);
```

The hand-written form fails in three ways that all surface in **someone else's file**:

- `Object.defineProperty(obj, key, { value })` defaults `configurable` to `false`, so the property
  can never be changed or removed again — for the rest of the worker;
- the undo is written as the last line of the test, so a failing assertion skips it;
- the real property is an **accessor on the prototype** (`document.fullscreenElement` is one), the
  patch writes a `value` over it, and "put the old descriptor back" is not the correct undo —
  deleting the own property is. `mockValueProp` records what was actually there and does the right
  one.
