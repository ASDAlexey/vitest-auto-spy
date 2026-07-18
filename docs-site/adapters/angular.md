# Angular

The `vitest-auto-spy/angular` entry adds `provideAutoSpy` — a shorthand for providing an auto-spy
in a `TestBed` — plus `injectSpy` and signal/readonly property mockers.

```ts
import { provideAutoSpy, injectSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [
    provideAutoSpy(MyService),
    // accepts the same second argument as createSpyFromClass
    provideAutoSpy(ApiService, { methodsToSpyOn: ['get', 'post'] }),
  ],
});

let myService: Spy<MyService>;

beforeEach(() => {
  myService = injectSpy(MyService);
});
```

The spies are change-detection agnostic, so they work in **both zoneless and zone.js** Angular
projects — nothing here touches `NgZone` or change detection. You still need the usual Vitest +
Angular wiring (`@analogjs/vite-plugin-angular` plus a TestBed setup file).

## Lazy spies by default

Angular tests typically spy a wide service but call only a couple of its methods per test, so
`provideAutoSpy` defaults to **lazy** spies: each method spy is built on first access instead of
eagerly up-front. On a wide service where a test touches two methods, spy assembly is roughly
**4× faster** (≈8× on a 20-method service) — the unused methods never pay the full spy-construction
cost. Everything else is unchanged: `Object.keys`, `vi.isMockFunction`, `calledWith`,
`resetAutoSpy` / `clearAutoSpy` all behave identically.

```ts
provideAutoSpy(WideService);                       // lazy — the fast default
provideAutoSpy(WideService, { lazySpies: false }); // opt out: build every spy eagerly
```

Only `provideAutoSpy` (the Angular entry) defaults to lazy; the framework-agnostic
`createSpyFromClass` still builds eagerly unless you pass `{ lazySpies: true }`.

## Signal / readonly property mocking

```ts
import { mockReadonlyProp, mockReadonlyPropGetter, mockAccessorsProp } from 'vitest-auto-spy/angular';

mockReadonlyProp(service, 'isReady', true);              // static value (incl. signals)
mockReadonlyPropGetter(service, 'label', () => 'A');     // dynamic getter
mockAccessorsProp(service, 'theme');                     // spied get + set
```

<!-- TODO: expand — full TestBed setup file example and a zoneless vs zone.js note. -->
