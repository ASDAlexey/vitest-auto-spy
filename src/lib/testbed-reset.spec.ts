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

// An earlier file of a shared worker may have wrapped it already (provideHttpTesting does), and marked the TestBed as wrapped.
const ownReset = Object.getOwnPropertyDescriptor(getTestBed(), 'resetTestingModule');

/** The wrapper is an own property of the singleton instance; the next spec file must not inherit it. */
function unwrap(): void {
  Reflect.deleteProperty(getTestBed(), 'resetTestingModule');

  if (ownReset) {
    // eslint-disable-next-line vitest-auto-spy/no-object-define-property -- puts back the wrapper an earlier file installed, which the tests here stack on
    Object.defineProperty(getTestBed(), 'resetTestingModule', ownReset);
  }
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

  it('keeps one wrapper per caller when another caller wrapped on top of it', () => {
    const owner = {};
    const seen: string[] = [];

    beforeTestBedReset(owner, () => seen.push('first'));
    beforeTestBedReset({}, () => seen.push('second'));
    beforeTestBedReset(owner, () => seen.push('first'));

    TestBed.resetTestingModule();

    expect(seen).toEqual(['second', 'first']);
  });

  it('wraps again once the wrapper was deleted off the TestBed, rather than trusting it is still there', () => {
    const owner = {};
    const seen: string[] = [];

    beforeTestBedReset(owner, () => seen.push('lost'));
    unwrap();
    beforeTestBedReset(owner, () => seen.push('snapshot'));

    TestBed.resetTestingModule();

    expect(seen).toEqual(['snapshot']);
  });

  it('leaves a TestBed alone whose resetTestingModule is not a method', () => {
    const seen: string[] = [];

    // eslint-disable-next-line vitest-auto-spy/no-reflect-member-access -- a TestBed without the method is the input under test, and no typed setter takes one
    Reflect.set(getTestBed(), 'resetTestingModule', undefined);
    beforeTestBedReset({}, () => seen.push('snapshot'));

    expect(getTestBed().resetTestingModule).toBeUndefined();
    unwrap();
    TestBed.resetTestingModule();
    expect(seen).toEqual([]);
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
