/**
 * Every Angular internal this package reads, pinned in one place.
 *
 * The point is where the failure lands. Without this file an Angular that renames `_testModuleRef`
 * or reshapes `ɵcmp.inputs` turns a handful of behavioural specs red — or, worse, leaves them green
 * with one fewer check inside them. With it, the upgrade fails here, next to the name that moved.
 */
/* eslint-disable vitest-auto-spy/no-reflect-member-access -- these are Angular's private members, which have no typed surface to read them through */
import { Component, VERSION, input, signal, ɵSIGNAL } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assertAngularInternals, hasLiveConsumerLinks, resetAngularInternalsCheck } from './angular-internals';
import { angularInternalsError } from './angular-internals-error';
import { mockValueProp } from './prop-mock';

@Component({
  selector: 'app-pinned',
  template: '',
})
class PinnedComponent {
  readonly heading = input('draft', { alias: 'title' });
}

describe('the shapes this package reads off Angular', () => {
  it('passes the canary on the Angular this repository pins', () => {
    expect(() => assertAngularInternals('testModuleRef')).not.toThrow();
    expect(() => assertAngularInternals('reactiveNode')).not.toThrow();
  });

  it('TestBed keeps the live module under `_testModuleRef`', () => {
    expect('_testModuleRef' in getTestBed()).toBe(true);
  });

  it('every TestBed static delegates to the instance `getTestBed()` hands out', () => {
    // What makes one wrapper on the instance enough — and two wrappers a double count.
    expect(TestBed.createComponent).not.toBe(getTestBed().createComponent);
    expect(String(TestBed.createComponent)).toContain('INSTANCE.createComponent');
  });

  it('reads a live consumer off either list shape Angular 20+ has shipped', () => {
    expect(hasLiveConsumerLinks({ consumers: {} })).toBe(true);
    expect(hasLiveConsumerLinks({ consumers: undefined })).toBe(false);
    expect(hasLiveConsumerLinks({ liveConsumerNode: [{}] })).toBe(true);
    expect(hasLiveConsumerLinks({ liveConsumerNode: [] })).toBe(false);
    expect(hasLiveConsumerLinks({})).toBe(false);
  });

  it('a signal node carries `kind` and a consumer list', () => {
    const node: object = Object(Reflect.get(signal(0), ɵSIGNAL));

    expect(Reflect.get(node, 'kind')).toBe('signal');
    expect('consumers' in node).toBe(true);
    expect(Reflect.get(node, 'consumers')).toBeUndefined();
  });

  it('an input node is told apart by `applyValueToInputSignal`', () => {
    TestBed.configureTestingModule({ imports: [PinnedComponent] });

    // eslint-disable-next-line vitest-auto-spy/prefer-render-shallow -- the canary must not go through the helpers it guards
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
  beforeEach(() => {
    resetAngularInternalsCheck();
  });

  afterEach(() => {
    resetAngularInternalsCheck();
  });

  it('names the shape and the Angular version, and says what stops being checked', () => {
    const testBed = getTestBed();
    const removed: unknown = Reflect.get(testBed, '_testModuleRef');

    Reflect.deleteProperty(testBed, '_testModuleRef');
    resetAngularInternalsCheck();

    const thrown = (): void => assertAngularInternals('testModuleRef');

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

  it('keeps a moved TestBed shape from failing the signal helpers', () => {
    const testBed = getTestBed();
    const removed: unknown = Reflect.get(testBed, '_testModuleRef');

    Reflect.deleteProperty(testBed, '_testModuleRef');

    try {
      expect(() => assertAngularInternals('testModuleRef')).toThrow(/TestBed#_testModuleRef/);
      expect(() => assertAngularInternals('reactiveNode')).not.toThrow();
    } finally {
      Reflect.set(testBed, '_testModuleRef', removed);
    }
  });

  it('names the reactive node when neither consumer shape is there', () => {
    const prototype: object = Object.getPrototypeOf(Reflect.get(signal(0), ɵSIGNAL));
    // Only the journal entry matters; the delete below is the shape under test.
    const restore = mockValueProp(prototype, 'consumers', undefined);

    Reflect.deleteProperty(prototype, 'consumers');

    try {
      expect(() => assertAngularInternals('reactiveNode')).toThrow(/ReactiveNode#consumers \(or #liveConsumerNode\)/);
    } finally {
      restore();
    }
  });

  it('says a failure is not a spec to fix', () => {
    expect(angularInternalsError('a name', 'a consequence').message).toMatch(/Nothing here is fixable from a spec/);
  });
});
