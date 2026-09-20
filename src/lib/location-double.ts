/**
 * `provideLocationDouble()` / `injectLocationDouble()` — Angular's own `Location` double, one call.
 *
 * Where a route stops, `Location` begins: a spec that asserts where a redirect landed, or that the
 * back button asked the browser to move, writes `{ provide: Location, useValue: { path: vi.fn() } }` —
 * and the component reading `location.getState()`, or subscribing through `onUrlChange()`, falls
 * through the hole every hand-rolled double has: it answers the members its author thought of. The
 * same spec then patches `location.go` by hand, which is the journal nobody reads.
 *
 * Angular already ships the answer, and this is deliberately not a second one. `SpyLocation` keeps a
 * real history array with an index, so `go()`, `back()` and `historyGo()` move a state a component
 * can read back; `urlChanges` is the journal of every move, for the assertion; and
 * `simulateUrlPop()` / `simulateHashChange()` are the browser's half of the contract — the events no
 * test can cause by calling methods, because in an application the browser causes them. What the
 * entry adds is the family shape the route and the router already have: `provideLocationDouble()` in
 * one line, and an `injectLocationDouble()` whose errors name the provider that won.
 *
 * **A wrap, not a rival implementation, on purpose.** The URL family lives behind
 * `vitest-auto-spy/angular-router`: the route and the router double the classes of `@angular/router`,
 * and `@angular/router` itself depends on `@angular/common`, so the suites that import this entry
 * already have the package the double comes from. Re-implementing Angular's history semantics here
 * would be a second copy to fall out of step with the first.
 */
import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { type Injector, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DOCS_LINKS, withDocs } from './docs-links';

/** What `injectLocationDouble()` and `createLocationDouble()` hand back: Angular's own recording fake. */
export type LocationDouble = SpyLocation;

function describeInstance(instance: object): string {
  const prototype = Reflect.getPrototypeOf(instance);
  const owner: unknown = prototype === null || prototype === Object.prototype ? undefined : Reflect.get(prototype, 'constructor');

  return typeof owner === 'function' ? `an instance of ${owner.name}` : 'a plain object';
}

/**
 * The `Location` and `LocationStrategy` providers, for `TestBed.configureTestingModule` or a
 * component's `providers`.
 *
 * ```ts
 * TestBed.configureTestingModule({ providers: [provideLocationDouble()] });
 *
 * const location = injectLocationDouble();
 *
 * location.go('/reports/7'); // urlChanges records it; path() reads it back
 * location.simulateUrlPop('/'); // the popstate no method call can cause
 * ```
 *
 * Returns the provider pair Angular ships (`SpyLocation` for `Location`, `MockLocationStrategy` for
 * `LocationStrategy`) — a new array every call, so a list hoisted to a module constant still hands
 * each injector a double of its own.
 */
export function provideLocationDouble(): Provider[] {
  return [...provideLocationMocks()];
}

/**
 * The handle of the `SpyLocation` `provideLocationDouble()` put in the test's injector.
 *
 * Reads the `TestBed` by default; pass `fixture.debugElement.injector` when the double is in a
 * component's own `providers`.
 *
 * The failure it exists to prevent is the quiet one: `Location` is `providedIn: 'root'`, so a spec
 * that forgot the provider gets the platform's real `Location`, silently — every method answers,
 * `path()` returns `''`, and nothing a test does to it lands anywhere.
 */
export function injectLocationDouble(injector?: Injector): LocationDouble {
  const caller = '[vitest-auto-spy] injectLocationDouble()';
  const location: unknown =
    injector === undefined ? TestBed.inject(Location, null, { optional: true }) : injector.get(Location, null, { optional: true });

  if (location === null || location === undefined) {
    throw new Error(
      withDocs(`${caller}: nothing provides Location here. Add provideLocationDouble() to the providers.`, DOCS_LINKS.angularLocation),
    );
  }

  if (!(location instanceof SpyLocation)) {
    throw new Error(
      withDocs(
        `${caller}: the Location here is ${describeInstance(location)}, not the SpyLocation ` +
          'provideLocationDouble() provides. A later provider of Location won over it — list ' +
          'provideLocationDouble() last, or drop the other one.',
        DOCS_LINKS.angularLocation,
      ),
    );
  }

  return location;
}

/**
 * A `SpyLocation` without a `TestBed` — for a class constructed with `new`, or a guard handed the
 * `Location` as an argument.
 *
 * ```ts
 * const location = createLocationDouble();
 *
 * location.go('/away');
 * expect(location.urlChanges).toEqual(['/away']);
 * ```
 */
export function createLocationDouble(): LocationDouble {
  return new SpyLocation();
}
