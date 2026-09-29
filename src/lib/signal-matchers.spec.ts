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

  it('compares like toStrictEqual on request, and like toEqual by default', () => {
    class Point {
      constructor(readonly x: number) {}
    }

    expect(signal({ color: undefined })).toHaveSignalValue({});
    expect(signal({ color: undefined })).not.toHaveSignalValue({}, { strict: true });
    const holey: number[] = [];

    holey[1] = 1;

    expect(signal(holey)).not.toHaveSignalValue([undefined, 1], { strict: true });
    expect(signal(new Point(1))).toHaveSignalValue({ x: 1 });
    expect(signal(new Point(1))).not.toHaveSignalValue({ x: 1 }, { strict: true });
    expect(signal(new Point(1))).toHaveSignalValue(new Point(1), { strict: true });
    expect(signal([{ color: 'red' }])).toHaveSignalValue([{ color: 'red' }], { strict: true });
    expect(signal(null)).toHaveSignalValue(null, { strict: true });
    expect(() => expect(signal({ color: undefined })).toHaveSignalValue({}, { strict: true })).toThrow(
      /expected signal to have strictly equal value/,
    );
  });

  it('compares the members of a Set and the entries of a Map, as toEqual and toStrictEqual do', () => {
    expect(signal(new Set(['a']))).not.toHaveSignalValue(new Set(['b']));
    expect(signal(new Set(['a']))).not.toHaveSignalValue(new Set(['b']), { strict: true });
    expect(signal(new Set(['a']))).toHaveSignalValue(new Set(['a']), { strict: true });
    expect(signal(new Map([['a', 1]]))).not.toHaveSignalValue(new Map());
    expect(signal(new Map([['a', 1]]))).not.toHaveSignalValue(new Map([['a', 2]]), { strict: true });
    expect(signal(new Map([['a', { id: 1 }]]))).toHaveSignalValue(new Map([['a', { id: 1 }]]), { strict: true });
    expect(signal({ ids: new Set([1]) })).not.toHaveSignalValue({ ids: new Set([2]) });
    expect(signal({ ids: new Set([1]) })).not.toHaveSignalValue({ ids: new Set([2]) }, { strict: true });
    expect(signal({ ids: new Set([1]) })).toHaveSignalValue({ ids: new Set([1]) }, { strict: true });
  });

  it('keeps the strict checks inside a collection and on array buffers', () => {
    const holey: number[] = [];

    holey[1] = 1;

    expect(signal(new Set([holey]))).toHaveSignalValue(new Set([[undefined, 1]]));
    expect(signal(new Set([holey]))).not.toHaveSignalValue(new Set([[undefined, 1]]), { strict: true });
    expect(signal(new Uint8Array([1]).buffer)).not.toHaveSignalValue(new Uint8Array([2]).buffer, { strict: true });
    expect(signal(new Uint8Array([1]).buffer)).not.toHaveSignalValue(new Uint8Array([1, 2]).buffer, { strict: true });
    expect(signal(new Uint8Array([1]).buffer)).toHaveSignalValue(new Uint8Array([1]).buffer, { strict: true });
  });

  it('applies the equality testers registered with expect.addEqualityTesters, in both modes', () => {
    class Money {
      constructor(
        readonly cents: number,
        readonly label: string,
      ) {}
    }

    expect.addEqualityTesters([
      (a: unknown, b: unknown): boolean | undefined => (a instanceof Money && b instanceof Money ? a.cents === b.cents : undefined),
    ]);

    expect(signal(new Money(100, 'one'))).toHaveSignalValue(new Money(100, 'a dollar'));
    expect(signal(new Money(100, 'one'))).toHaveSignalValue(new Money(100, 'a dollar'), { strict: true });
    expect(signal(new Money(100, 'one'))).not.toHaveSignalValue(new Money(200, 'one'), { strict: true });
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

  it('names the copy mockSignalProp cannot reach, and the seed that can', () => {
    const count = createFunctionSpy<() => number>('count');

    expect(() => expect(count).toHaveSignalValue(3)).toThrow(
      /copied the member into a field of its own.+provideAutoSpy\(Store, \{ overrides: \{ count: signal\(value\) \} \}\)/s,
    );
  });

  it('refuses a spy through `.not` as well', () => {
    expect(() => expect(createFunctionSpy<() => void>('load')).not.toHaveSignalValue(3)).toThrow(/received a spy/);
  });
});
