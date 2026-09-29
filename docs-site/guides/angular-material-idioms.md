---
title: Angular Material idioms, translated
description: The literal doubles Angular Material's own specs hand-write — a ScrollStrategy, MAT_ICON_LOCATION, MATERIAL_ANIMATIONS, ScrollDispatcher — rewritten with createAutoMock, provideAutoSpyForToken and provideAutoSpy, plus a partial double of a real service.
---

# Angular Material idioms, translated

Many component specs copy Angular Material's own specs, and those replace Material's services with
hand-written objects: `{ provide: X, useValue: { oneMethod: () => … } }`. `useValue` accepts
anything, so nothing checks that object. When the component starts calling another member, the test
fails deep inside Material. This page shows the typed replacement for each common case.

```ts
import { ScrollDispatcher } from '@angular/cdk/scrolling';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

import { StickyHeaderComponent } from './sticky-header.component';

it('subscribes to scroll events', () => {
  const scrolled = new Subject<void>();

  TestBed.configureTestingModule({
    imports: [StickyHeaderComponent],
    providers: [provideAutoSpy(ScrollDispatcher, { returns: { scrolled } })],
  });
  TestBed.createComponent(StickyHeaderComponent).detectChanges();

  scrolled.next(); // the user scrolled
  expect(injectSpy(ScrollDispatcher).scrolled).toHaveBeenCalled();
});
```

`@angular/material` and `@angular/cdk` are not dependencies of this package. Every example imports
them in your own spec. For `MatDialog`, `MatDialogRef` and `MAT_DIALOG_DATA`, use the
[dialog doubles](/adapters/angular#the-material-dialog-without-material-as-a-dependency).

| Material's hand-written object                               | Replacement                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| a `ScrollStrategy` with one spied method and the rest no-ops | [`createAutoMock<ScrollStrategy>()`](#a-scrollstrategy) behind the token  |
| `MAT_ICON_LOCATION` as `{ getPathname: () => fakePath }`     | [`provideAutoSpyForToken`](#mat-icon-location) with `returns`             |
| `MATERIAL_ANIMATIONS` as `{ animationsDisabled: true }`      | [a typed value](#material-animations), checked against the token          |
| `ScrollDispatcher` as three methods, `scrolled()` a subject  | [`provideAutoSpy(ScrollDispatcher)`](#scrolldispatcher) with `returns`    |
| `spyOn(realService, 'method')`                               | [`createSpyFromInstance`](#a-partial-double-one-method-of-a-real-service) |

## A `ScrollStrategy`

`ScrollStrategy` (`@angular/cdk/overlay`) is an interface, so there is no class to build a spy
from. [`createAutoMock`](/core/auto-mock-by-type) builds one from the type instead. Material
components take a **factory** for the strategy through a token such as `MAT_MENU_SCROLL_STRATEGY`,
so the provider returns a function that returns the mock.

```ts
import { type ScrollStrategy } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { MAT_MENU_SCROLL_STRATEGY } from '@angular/material/menu';
import { createAutoMock } from 'vitest-auto-spy';

const strategy = createAutoMock<ScrollStrategy>();

TestBed.configureTestingModule({
  providers: [{ provide: MAT_MENU_SCROLL_STRATEGY, useValue: () => strategy }],
});

// … open the menu
expect(strategy.enable).toHaveBeenCalled();
```

Every member of the interface is a spy, typed as in `ScrollStrategy`. Create the mock inside the
test or its `beforeEach`, so each test gets a fresh one.

If the code asks `Overlay` for a strategy instead (`overlay.scrollStrategies.reposition()`), use the
[overlay double](/adapters/angular#platform-sanitizer-change-detector-and-cdk-overlay-doubles).

## `MAT_ICON_LOCATION`

`MAT_ICON_LOCATION` (`@angular/material/icon`) is a token typed with an interface. `MatIcon` calls
its one method, `getPathname`, to fix `url(#…)` links in SVG icons.
[`provideAutoSpyForToken`](/adapters/angular#a-dependency-behind-an-injectiontoken) builds the spy
from the token's type. Its arguments are the token, values for the interface's non-method
properties (`undefined` here: it has none) and options; `returns` in the options sets what a method answers, and the method
stays a spy.

```ts
import { TestBed } from '@angular/core/testing';
import { MAT_ICON_LOCATION } from '@angular/material/icon';
import { injectSpy, provideAutoSpyForToken } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({
  providers: [provideAutoSpyForToken(MAT_ICON_LOCATION, undefined, { returns: { getPathname: '/fake-path' } })],
});

// a test that needs another path overrides the answer:
injectSpy(MAT_ICON_LOCATION).getPathname.mockReturnValue('/another-path');
```

## `MATERIAL_ANIMATIONS`

`MATERIAL_ANIMATIONS` (`@angular/material/core`) holds settings, `{ animationsDisabled: true }`, not
a service. There is nothing to spy on, so keep the plain value. The only thing missing is a type
check, because `useValue` accepts anything. A two-line helper typed by the token adds it:

```ts
import { type InjectionToken, type ValueProvider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

function provideValue<T>(provide: InjectionToken<T>, useValue: T): ValueProvider {
  return { provide, useValue };
}

TestBed.configureTestingModule({
  providers: [provideValue(MATERIAL_ANIMATIONS, { animationsDisabled: true })],
});
```

A misspelt key now fails to compile. Without the check, animations silently stay on and every test
runs slower.

## `ScrollDispatcher`

`ScrollDispatcher` (`@angular/cdk/scrolling`) is a class, so `provideAutoSpy` reads every method
from it. Give the method the component listens to a `Subject` the test controls. The complete
example is at the top of this page.

- A component that listens through `ancestorScrolled()` takes the same setting:
  `returns: { ancestorScrolled: scrolled }`.
- With the [rxjs entry](/runtimes/rxjs) loaded, the spy can emit by itself:
  `injectSpy(ScrollDispatcher).scrolled.nextWith()`. Then you do not need the `Subject`.

## A partial double: one method of a real service

Material's specs keep a real service and spy on one method: `spyOn(liveAnnouncer, 'announce')`,
`spyOn(errorHandler, 'handleError')`. Here that is
[`createSpyFromInstance`](/adapters/angular#spying-a-real-service-without-replacing-it) with
`passthrough: true`. It patches the service instance in place, so call it after
`configureTestingModule` and before `createComponent`. With `passthrough: true` every method
still runs for real and records its calls. A method you give an answer (`resolveWith`,
`mockReturnValue`) stops calling the real code. Without `passthrough`, every method returns
`undefined` until you give it an answer.

```ts
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { createSpyFromInstance } from 'vitest-auto-spy';

const announcer = createSpyFromInstance(TestBed.inject(LiveAnnouncer), { passthrough: true });

announcer.announce.resolveWith(undefined); // optional: with this line the real announce does not run
component.save();

expect(announcer.announce).toHaveBeenCalledWith('Saved');
```

The component holds the same instance you patched, so there is nothing else to provide.
[`setupAutoSpy()`](/utilities/setup), called once in the Vitest setup file, restores the instance after
each test. Without it, call `restoreSpiedInstance(TestBed.inject(LiveAnnouncer))` from `vitest-auto-spy`
in an `afterEach`.

`createSpyFromInstance`, `createAutoMock` and `restoreSpiedInstance` come from `vitest-auto-spy`; the
Angular helpers (`provideAutoSpy`, `provideAutoSpyForToken`, `injectSpy`) come from
`vitest-auto-spy/angular`.

**Which one to use:**

- The hand-written object stands in for the whole service → [`provideAutoSpy`](/adapters/angular) or
  `provideAutoSpyForToken`.
- You spy on one method of the real service → `createSpyFromInstance`.

The lint rule [`prefer-provide-auto-spy`](/utilities/eslint-rules#prefer-provide-auto-spy) reports a
provider with a hand-written service object, so it finds the first kind for you.
