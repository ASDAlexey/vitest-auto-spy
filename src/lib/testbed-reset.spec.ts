/**
 * The snapshot hook runs in front of `resetTestingModule`, which makes it the one place where a
 * failure costs the *next* test its clean module. So the property worth pinning is not what the hook
 * reads — that belongs to its callers — but that the reset happens whatever the hook does.
 */
import { Injectable } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { beforeTestBedReset } from './testbed-reset';

@Injectable()
class Nothing {}

/** The wrapper is an own property of the singleton instance; the next spec file must not inherit it. */
function unwrap(): void {
  Reflect.deleteProperty(getTestBed(), 'resetTestingModule');
}

describe('beforeTestBedReset', () => {
  afterEach(() => {
    unwrap();
    TestBed.resetTestingModule();
  });

  it('runs the snapshot before every reset, through the static method and the instance alike', () => {
    const seen: string[] = [];

    beforeTestBedReset(new WeakSet(), () => seen.push('snapshot'));

    TestBed.resetTestingModule();
    getTestBed().resetTestingModule();

    expect(seen).toEqual(['snapshot', 'snapshot']);
  });

  it('keeps one wrapper per caller', () => {
    const wrapped = new WeakSet<object>();
    const seen: string[] = [];

    beforeTestBedReset(wrapped, () => seen.push('snapshot'));
    beforeTestBedReset(wrapped, () => seen.push('snapshot'));

    TestBed.resetTestingModule();

    expect(seen).toEqual(['snapshot']);
  });

  it('resets the module even when the snapshot throws, so the next test can configure one', () => {
    beforeTestBedReset(new WeakSet(), () => {
      // The shape of it in the wild: a diagnostic reading a token out of an injector the test
      // destroyed, which answers `NG0205` rather than a controller.
      throw new Error('NG0205: Injector has already been destroyed.');
    });

    TestBed.configureTestingModule({ providers: [Nothing] });
    TestBed.inject(Nothing);

    expect(() => TestBed.resetTestingModule()).not.toThrow();
    expect(() => TestBed.configureTestingModule({ providers: [Nothing] })).not.toThrow();
  });
});
