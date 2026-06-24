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

## Signal / readonly property mocking

```ts
import { mockReadonlyProp, mockReadonlyPropGetter, mockAccessorsProp } from 'vitest-auto-spy/angular';

mockReadonlyProp(service, 'isReady', true);              // static value (incl. signals)
mockReadonlyPropGetter(service, 'label', () => 'A');     // dynamic getter
mockAccessorsProp(service, 'theme');                     // spied get + set
```

<!-- TODO: expand — full TestBed setup file example and a zoneless vs zone.js note. -->
