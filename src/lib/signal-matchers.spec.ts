/**
 * `toHaveSignalValue` has to do two things a plain `expect(sig()).toBe(…)` cannot: keep the signal
 * itself in the failure message, and refuse a value that is not a signal — the "forgot the
 * parentheses" mistake that `toBeTruthy()` silently rewards.
 */
import { computed, signal } from '@angular/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { createFunctionSpy } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { registerSignalMatchers } from './signal-matchers';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
  registerSignalMatchers();
});

describe('toHaveSignalValue', () => {
  it('compares the value behind a signal, deeply', () => {
    const items = signal([{ id: 1 }]);

    expect(items).toHaveSignalValue([{ id: 1 }]);
    expect(computed(() => items().length)).toHaveSignalValue(1);
  });

  it('negates', () => {
    expect(signal('idle')).not.toHaveSignalValue('ready');
  });

  it('reports the expected and the actual value on failure', () => {
    expect(() => expect(signal('idle')).toHaveSignalValue('ready')).toThrow(/expected signal to have value.+ready/s);
  });

  it('reports the negated failure too', () => {
    expect(() => expect(signal('idle')).not.toHaveSignalValue('idle')).toThrow(/expected signal not to have value/);
  });

  it('rejects a value that is not a signal', () => {
    expect(() => expect('idle').toHaveSignalValue('idle')).toThrow(/expected a signal \(a zero-argument getter\)/);
  });

  it('reads a plain zero-argument getter', () => {
    expect(() => 3).toHaveSignalValue(3);
  });

  it('rejects a spy without calling it', () => {
    const load = createFunctionSpy<() => void>('load');

    expect(() => expect(load).toHaveSignalValue(undefined)).toThrow(/expected a signal .+ received a spy/s);
    expect(load).toHaveBeenCalledTimes(0);
  });

  it('rejects a spy that carries the jasmine surface instead', () => {
    const load = Object.assign(() => undefined, { calls: { count: (): number => 0 } });

    expect(() => expect(load).toHaveSignalValue(undefined)).toThrow(/mockSignalProp\(\)/);
  });

  it('refuses a spy through `.not` as well', () => {
    expect(() => expect(createFunctionSpy<() => void>('load')).not.toHaveSignalValue(3)).toThrow(/received a spy/);
  });
});
