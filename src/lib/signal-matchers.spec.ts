/**
 * `toHaveSignalValue` has to do two things a plain `expect(sig()).toBe(…)` cannot: keep the signal
 * itself in the failure message, and refuse a value that is not a signal — the "forgot the
 * parentheses" mistake that `toBeTruthy()` silently rewards.
 */
import { computed, signal } from '@angular/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { registerSignalMatchers } from './signal-matchers';

beforeAll(() => {
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
});
