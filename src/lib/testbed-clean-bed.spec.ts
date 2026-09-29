/**
 * The file-end check `setupAutoSpy` runs on the `TestBed`: what counts as left dirty, that each thing
 * found is also put back, and that the per-file state of the Angular helpers is dropped either way.
 */
/* eslint-disable vitest-auto-spy/no-reflect-member-access -- stages the leftovers written behind the library's back that cleanTestBed exists to find and put back */
import { Component, Injector } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import './angular';
import { CLEAN_TEST_BED_CHECK } from './setup-clean-test-bed';
import { cleanTestBed, describeDirtyTestBed, onTestBedFileEnd } from './testbed-clean-bed';

@Component({ selector: 'app-leftover', template: '' })
class LeftoverComponent {}

const testBed = getTestBed();
// An earlier file of a shared worker may have wrapped it already (provideHttpTesting does), and marked the TestBed as wrapped.
const ownReset = Object.getOwnPropertyDescriptor(testBed, 'resetTestingModule');

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(testBed, 'resetTestingModule');
  Reflect.deleteProperty(testBed, 'strayMock');

  if (ownReset) {
    // eslint-disable-next-line vitest-auto-spy/no-object-define-property -- puts back the wrapper the tests below replace behind the library's back
    Object.defineProperty(testBed, 'resetTestingModule', ownReset);
  }
});

describe('cleanTestBed', () => {
  it('is armed on globalThis by the Angular helpers', () => {
    expect(Reflect.get(globalThis, CLEAN_TEST_BED_CHECK)).toBe(cleanTestBed);
  });

  it('says nothing about a clean bed', () => {
    expect(cleanTestBed()).toBeUndefined();
  });

  it('reports and resets a testing module left instantiated', () => {
    TestBed.inject(Injector);

    expect(cleanTestBed()).toContain('left the TestBed dirty: a testing module is still instantiated.');
    expect(Reflect.get(testBed, '_testModuleRef')).toBeNull();
  });

  it('counts the fixtures still alive, and destroys them', () => {
    // eslint-disable-next-line vitest-auto-spy/prefer-render-shallow -- a plain fixture left alive is the state under test
    const fixture = TestBed.createComponent(LeftoverComponent);
    const destroy = vi.spyOn(fixture, 'destroy');

    expect(cleanTestBed()).toContain('a testing module is still instantiated and 1 fixture still alive');
    expect(destroy).toHaveBeenCalled();
  });

  it('counts fixtures with no module behind them', () => {
    const fixtures = [{ destroy: vi.fn() }, { destroy: vi.fn() }];

    Reflect.set(testBed, '_activeFixtures', fixtures);

    expect(cleanTestBed()).toContain('dirty: 2 fixtures still alive.');
    expect(fixtures[0]?.destroy).toHaveBeenCalled();
  });

  it('reads no fixtures from an Angular that keeps them elsewhere', () => {
    const fixtures: unknown = Reflect.get(testBed, '_activeFixtures');

    Reflect.set(testBed, '_activeFixtures', undefined);

    try {
      expect(cleanTestBed()).toBeUndefined();
    } finally {
      Reflect.set(testBed, '_activeFixtures', fixtures);
    }
  });

  it('restores a TestBed static a spy still replaces', () => {
    const original = TestBed.inject;

    vi.spyOn(TestBed, 'inject');

    expect(cleanTestBed()).toContain('TestBed.inject is still a spy');
    expect(TestBed.inject).toBe(original);
  });

  it('puts back the original of a static whose mock cannot restore itself, and drops one that had none', () => {
    const original = TestBed.inject;

    Reflect.set(TestBed, 'inject', vi.fn());
    Reflect.set(TestBed, 'strayMock', vi.fn());

    expect(cleanTestBed()).toContain('TestBed.inject is still a spy; TestBed.strayMock is still a spy');
    expect(TestBed.inject).toBe(original);
    expect(Object.hasOwn(TestBed, 'strayMock')).toBe(false);
  });

  it('leaves a static a setup file wrapped with a plain function alone', () => {
    const original = TestBed.inject;
    const wrapped = (...args: Parameters<typeof original>): unknown => Reflect.apply(original, TestBed, args);

    Reflect.set(TestBed, 'inject', wrapped);

    try {
      expect(cleanTestBed()).toBeUndefined();
    } finally {
      Reflect.set(TestBed, 'inject', original);
    }
  });

  it('restores a spy left on the instance', () => {
    const spy = vi.spyOn(testBed, 'inject');

    expect(cleanTestBed()).toContain('getTestBed().inject is still a spy');
    expect(testBed.inject).not.toBe(spy);
    expect(Object.hasOwn(testBed, 'inject')).toBe(false);
  });

  it('removes a mock on the instance that has nothing to restore to', () => {
    const mock = Object.assign(() => undefined, { mock: {} });

    Reflect.set(testBed, 'strayMock', mock);

    expect(cleanTestBed()).toContain('getTestBed().strayMock is still a spy');
    expect(Object.hasOwn(testBed, 'strayMock')).toBe(false);
  });

  it('removes a vi.fn assigned onto the instance, which mockRestore leaves in place', () => {
    Reflect.set(testBed, 'strayMock', vi.fn());

    expect(cleanTestBed()).toContain('getTestBed().strayMock is still a spy');
    expect(Object.hasOwn(testBed, 'strayMock')).toBe(false);
  });

  it('reports a reset that throws instead of throwing itself', () => {
    TestBed.inject(Injector);
    Reflect.set(testBed, 'resetTestingModule', () => {
      throw new Error('teardown broke');
    });

    expect(cleanTestBed()).toContain('resetting it threw: teardown broke');
  });

  it('reports a thrown non-Error the same way', () => {
    TestBed.inject(Injector);
    Reflect.set(testBed, 'resetTestingModule', () => {
      throw 'broken';
    });

    expect(cleanTestBed()).toContain('resetting it threw: broken');
  });

  it('drops the registered per-file state whether or not anything was found', () => {
    const reset = vi.fn();

    onTestBedFileEnd(reset);
    cleanTestBed();

    expect(reset).toHaveBeenCalledOnce();
  });
});

describe('describeDirtyTestBed', () => {
  it('names the file, or says "This file" when the runner reports none', () => {
    expect(describeDirtyTestBed(['x'], '/abs/a.spec.ts')).toContain('/abs/a.spec.ts left the TestBed dirty: x.');
    expect(describeDirtyTestBed(['x', 'y'], undefined)).toMatch(/^\[vitest-auto-spy\] This file left the TestBed dirty: x; y\./);
  });
});
