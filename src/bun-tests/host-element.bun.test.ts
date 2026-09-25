/**
 * `hostElement` / `queryElement` are portable, so `vitest-auto-spy/bun-angular` publishes them too.
 * The check they make is `instanceof` against the DOM globals, and under `bun test` those come from
 * the preload's DOM rather than jsdom — this pins that the two agree on the fixture's elements.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'bun:test';

import { hostElement, queryElement, stable } from '../bun-angular';

@Component({ selector: 'app-bun-search', template: '<input name="q" /><a class="close">x</a>' })
class SearchComponent {}

describe('hostElement and queryElement on bun:test', () => {
  it('returns the host and a typed match', async () => {
    const fixture = TestBed.createComponent(SearchComponent);
    await stable(fixture);

    expect(hostElement(fixture)).toBe(fixture.nativeElement);
    expect(queryElement(fixture, 'input', HTMLInputElement).name).toBe('q');
  });

  it('refuses a match of the wrong type', async () => {
    const fixture = TestBed.createComponent(SearchComponent);
    await stable(fixture);

    expect(() => queryElement(fixture, '.close', HTMLButtonElement)).toThrow(
      /'\.close' matched <a\.close> \(HTMLAnchorElement\), not HTMLButtonElement/,
    );
  });
});
