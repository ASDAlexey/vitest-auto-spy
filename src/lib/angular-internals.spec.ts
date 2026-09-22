/**
 * Every Angular internal this package reads, pinned in one place.
 *
 * The point is where the failure lands. Without this file an Angular that renames `_testModuleRef`
 * or reshapes `ɵcmp.inputs` turns a handful of behavioural specs red — or, worse, leaves them green
 * with one fewer check inside them. With it, the upgrade fails here, next to the name that moved.
 */
import { Component, VERSION, input, signal, ɵSIGNAL } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { assertAngularInternals, resetAngularInternalsCheck } from './angular-internals';
import { angularInternalsError } from './angular-internals-error';

@Component({
  selector: 'app-pinned',
  template: '',
})
class PinnedComponent {
  readonly heading = input('draft', { alias: 'title' });
}

describe('the shapes this package reads off Angular', () => {
  it('passes the canary on the Angular this repository pins', () => {
    expect(() => assertAngularInternals()).not.toThrow();
  });

  it('TestBed keeps the live module under `_testModuleRef`', () => {
    expect('_testModuleRef' in getTestBed()).toBe(true);
  });

  it('every TestBed static delegates to the instance `getTestBed()` hands out', () => {
    // What makes one wrapper on the instance enough — and two wrappers a double count.
    expect(TestBed.createComponent).not.toBe(getTestBed().createComponent);
    expect(String(TestBed.createComponent)).toContain('INSTANCE.createComponent');
  });

  it('a signal node carries `kind` and a consumer list', () => {
    const node: object = Object(Reflect.get(signal(0), ɵSIGNAL));

    expect(Reflect.get(node, 'kind')).toBe('signal');
    expect('consumers' in node).toBe(true);
    expect(Reflect.get(node, 'consumers')).toBeUndefined();
  });

  it('an input node is told apart by `applyValueToInputSignal`', () => {
    TestBed.configureTestingModule({ imports: [PinnedComponent] });

    const component = TestBed.createComponent(PinnedComponent).componentInstance;
    const node: object = Object(Reflect.get(component.heading, ɵSIGNAL));

    expect(typeof Reflect.get(node, 'applyValueToInputSignal')).toBe('function');
    expect(Reflect.get(node, 'kind')).toBe('signal');
  });

  it('`ɵcmp.inputs` maps the public name to a `[field, flags, transform]` tuple', () => {
    const inputs: Record<string, unknown> = Reflect.get(Reflect.get(PinnedComponent, 'ɵcmp'), 'inputs');

    expect(Object.keys(inputs)).toEqual(['title']);
    expect(inputs['title']).toEqual(['heading', expect.any(Number), null]);
  });
});

describe('assertAngularInternals', () => {
  afterEach(() => {
    resetAngularInternalsCheck();
  });

  it('names the shape and the Angular version, and says what stops being checked', () => {
    const testBed = getTestBed();
    const removed: unknown = Reflect.get(testBed, '_testModuleRef');

    Reflect.deleteProperty(testBed, '_testModuleRef');
    resetAngularInternalsCheck();

    const thrown = (): void => assertAngularInternals();

    try {
      expect(thrown).toThrow(/TestBed#_testModuleRef/);
      // Memoised: the probes describe the loaded Angular, which cannot change mid-worker — and a
      // second call must not decide the shapes are fine because the first one already looked.
      expect(thrown).toThrow(new RegExp(`@angular/core ${VERSION.full.replace(/\./gu, '\\.')}`, 'u'));
      expect(thrown).toThrow(/provideHttpTesting\(\{ verifyOnTeardown \}\)/);
    } finally {
      Reflect.set(testBed, '_testModuleRef', removed);
    }
  });

  it('says a failure is not a spec to fix', () => {
    expect(angularInternalsError('a name', 'a consequence').message).toMatch(/Nothing here is fixable from a spec/);
  });
});
