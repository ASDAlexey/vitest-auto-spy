/**
 * The claim is "Angular's own recording fake, in the family shape" — so the specs read the journal
 * and the state through the public surface a component uses (`path()`, `getState()`,
 * `onUrlChange()`), not through the private fields, and the errors are asserted by the sentence a
 * reader meets, not by a matcher on a substring.
 */
import { Location, LocationStrategy } from '@angular/common';
import { MockLocationStrategy, SpyLocation } from '@angular/common/testing';
import { Component, Injector, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import '../angular';
import { provideAutoSpy } from './angular';
import { createLocationDouble, injectLocationDouble, provideLocationDouble } from './location-double';

@Component({
  selector: 'vas-whereami',
  standalone: true,
  template: `<span>{{ where }}</span>`,
})
class WhereAmI {
  private readonly location = inject(Location);

  readonly where = this.location.path();
}

describe('provideLocationDouble', () => {
  it('provides the SpyLocation and the MockLocationStrategy Angular ships', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

    expect(TestBed.inject(Location)).toBeInstanceOf(SpyLocation);
    expect(TestBed.inject(LocationStrategy)).toBeInstanceOf(MockLocationStrategy);
  });

  it('hands every injector a double of its own', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

    const elsewhere = Injector.create({ providers: [...provideLocationDouble()] });

    expect(injectLocationDouble()).not.toBe(injectLocationDouble(elsewhere));
  });

  it('moves a state the component reads back', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

    const location = injectLocationDouble();

    location.go('/reports', 'tab=7', { from: 'menu' });

    expect(location.path()).toBe('/reports?tab=7');
    expect(location.getState()).toEqual({ from: 'menu' });
    expect(location.urlChanges).toEqual(['/reports?tab=7']);
  });

  it('reads through DI in a component', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

    expect(TestBed.createComponent(WhereAmI).componentInstance.where).toBe('');
  });

  it('reads the double from an injector it is given', () => {
    const injector = Injector.create({ providers: [...provideLocationDouble()] });

    expect(injectLocationDouble(injector)).toBeInstanceOf(SpyLocation);
  });
});

describe('the history the double keeps', () => {
  it('answers the back button, and tells the subscribers rather than the journal', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

    const location = injectLocationDouble();
    const pops: string[] = [];

    location.subscribe((event) => pops.push(`${event.type} ${event.url}`));
    location.go('/away');
    location.back();

    expect(location.path()).toBe('');
    expect(location.urlChanges).toEqual(['/away']);
    expect(pops).toEqual(['popstate ']);
  });

  it('does not journal a move that lands where it already stood', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

    const location = injectLocationDouble();

    location.go('/once');
    location.go('/once');

    expect(location.urlChanges).toEqual(['/once']);
  });
});

/** The real `Location` over the strategy the double pairs with — the reference the double has to agree with. */
function realLocation(): Location {
  TestBed.configureTestingModule({ providers: [{ provide: LocationStrategy, useClass: MockLocationStrategy }] });

  return TestBed.inject(Location);
}

/**
 * What a caller reads back after each step, on either `Location`. No `back()`: the real `Location`
 * over `MockLocationStrategy` rebuilds the previous URL from its journal, `replace: ` prefix included.
 */
function readBack(location: Location): string[] {
  location.go('/reports', 'tab=7');
  const afterGo = location.path();

  location.replaceState('/reports', 'tab=8&sort=asc');

  return [afterGo, location.path(), String(location.isCurrentPathEqualTo('/reports', 'tab=8&sort=asc'))];
}

describe('path() agrees with the real Location', () => {
  it('answers the query go() and replaceState() were given, as the real Location does', () => {
    const expected = readBack(realLocation());

    TestBed.resetTestingModule();

    expect(expected).toEqual(['/reports?tab=7', '/reports?tab=8&sort=asc', 'true']);
    expect(readBack(createLocationDouble())).toEqual(expected);
  });

  it('keeps a query that arrived inside the path, the way the router writes it', () => {
    const location = createLocationDouble();

    location.go('/search?q=cats');

    expect(location.path()).toBe('/search?q=cats');
    expect(location.urlChanges).toEqual(['/search?q=cats']);
  });

  it('keeps the query across the back button, and tells the popstate subscribers', () => {
    const location = createLocationDouble();
    const pops: string[] = [];

    location.go('/a', 'x=1');
    location.go('/b');
    location.subscribe((event) => pops.push(String(event.url)));
    location.back();

    expect(location.path()).toBe('/a?x=1');
    expect(pops).toEqual(['/a?x=1']);
  });

  it('names the Angular internal it reads when the history is not where it was', () => {
    const location = createLocationDouble();

    Object.defineProperty(location, '_history', { value: undefined });

    expect(() => location.path()).toThrow(/no longer carries SpyLocation#_history/);
  });
});

describe('the browser half of the contract', () => {
  it('simulateUrlPop tells the onUrlChange listeners', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

    const location = injectLocationDouble();
    const seen: string[] = [];

    location.onUrlChange((url, state) => seen.push(`${url} ${state === undefined ? 'no state' : 'state'}`));
    location.simulateUrlPop('/restored');

    expect(seen).toEqual(['/restored no state']);
  });

  it('simulateHashChange records the round trip a hash change makes', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble()] });

    const location = injectLocationDouble();

    location.simulateHashChange('/section');

    expect(location.path()).toBe('/section');
    expect(location.urlChanges).toEqual(['hash: /section']);
  });
});

describe('injectLocationDouble failures', () => {
  it('names the provider that won when it is not the double', () => {
    TestBed.configureTestingModule({
      providers: [provideLocationDouble(), { provide: Location, useValue: { path: () => '/other' } }],
    });

    expect(() => injectLocationDouble()).toThrow(
      'the Location here is a plain object, not the SpyLocation provideLocationDouble() provides',
    );
  });

  it('names an auto-spy that won over the double', () => {
    TestBed.configureTestingModule({ providers: [provideLocationDouble(), provideAutoSpy(Location)] });

    expect(() => injectLocationDouble()).toThrow('the Location here is an auto-spy, not the SpyLocation');
  });

  it('names the real Location a TestBed without the double hands out', () => {
    expect(() => injectLocationDouble()).toThrow('the Location here is an instance of Location');
  });

  it('says so when an injector has no Location at all', () => {
    const injector = Injector.create({ providers: [] });

    expect(() => injectLocationDouble(injector)).toThrow('nothing provides Location here');
  });
});

describe('createLocationDouble', () => {
  it('keeps the journal without a TestBed', () => {
    const location = createLocationDouble();

    location.go('/standalone');

    expect(location.path()).toBe('/standalone');
    expect(location.urlChanges).toEqual(['/standalone']);
  });
});
