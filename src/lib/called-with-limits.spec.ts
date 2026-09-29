import { beforeEach, describe, expect, it } from 'vitest';

import { useConsoleSpies } from './console-spy';
import { createFunctionSpy, resetLenientMissHint } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

registerMockAdapter(vitestMockAdapter);

describe('calledWith(…).once() / .times(n)', () => {
  it('answers the next matching call only, then falls back to the spy default', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(1).once().mockReturnValue('first');

    expect([load(1), load(1)]).toEqual(['first', undefined]);
  });

  it('falls back to what the same arguments answered before', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(1).mockReturnValue('base');
    load.calledWith(1).once().returnValue('first');

    expect([load(1), load(1), load(1)]).toEqual(['first', 'base', 'base']);
  });

  it('consumes stacked answers last-configured first', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(1).times(2).mockReturnValue('two');
    load.calledWith(1).once().mockReturnValue('one');

    expect([load(1), load(1), load(1), load(1)]).toEqual(['one', 'two', 'two', undefined]);
  });

  it('lets an unlimited answer configured afterwards replace the stack', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(1).once().mockReturnValue('once');
    load.calledWith(1).mockReturnValue('always');

    expect([load(1), load(1)]).toEqual(['always', 'always']);
  });

  it('throws once through failWith', () => {
    const load = createFunctionSpy<(id: number) => string>('load');
    const error = new Error('down');

    load.calledWith(1).once().failWith(error);

    expect(() => load(1)).toThrow(error);
    expect(load(1)).toBeUndefined();
  });

  it('stacks over an asymmetric config registered for the same matcher', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.calledWith(expect.any(Number)).mockReturnValue('any');
    load.calledWith(expect.any(Number)).once().mockReturnValue('first');

    expect([load(5), load(6)]).toEqual(['first', 'any']);
  });

  it('fails a mustBeCalledWith call past its count', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    load.mustBeCalledWith(1).once().mockReturnValue('first');

    expect(load(1)).toBe('first');
    expect(() => load(1)).toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses times(%s)', (count) => {
    const load = createFunctionSpy<(id: number) => string>('load');

    expect(() => load.calledWith(1).times(count)).toThrow(RangeError);
    expect(() => load.calledWith(1).times(count)).toThrow(`positive whole number of calls, got ${String(count)}`);
  });
});

describe('the lenient calledWith miss hint', () => {
  const { consoleWarnSpy } = useConsoleSpies();
  const warnings = (): string[] => consoleWarnSpy.mock.calls.map(([message]) => String(message));

  beforeEach(() => {
    resetLenientMissHint();
  });

  it('names the call and the configs once, the first time a call of a configured arity misses', () => {
    const load = createFunctionSpy<(id: unknown) => string>('load');

    load.calledWith(1).mockReturnValue('one');

    expect(load('1')).toBeUndefined();
    expect(load(2)).toBeUndefined();
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain("[vitest-auto-spy] load('1') matched none of its calledWith() configs ([1]) and answered undefined.");
    expect(warnings()[0]).toContain('use mustBeCalledWith() to fail on one');
    expect(warnings()[0]).toContain(
      'Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#cause-and-effect-why-calledwith-and-not-mockreturnvalue',
    );
  });

  it('lists at most three configs', () => {
    const load = createFunctionSpy<(id: number) => string>('load');

    for (const id of [1, 2, 3, 4]) {
      load.calledWith(id).mockReturnValue(String(id));
    }

    load(5);

    expect(warnings()[0]).toContain('configs ([1], [2], [3], …)');
  });

  it('stays quiet on a miss of another arity, over a default, and once a limited answer is used up', () => {
    const load = createFunctionSpy<(...args: unknown[]) => string>('load');

    load.calledWith(1).mockReturnValue('one');
    load(1, 2);
    load();

    const withDefault = createFunctionSpy<(id: number) => string>('withDefault');

    withDefault.calledWith(1).mockReturnValue('one');
    withDefault.failWith(new Error('default'));

    expect(() => withDefault(2)).toThrow('default');

    const limited = createFunctionSpy<(id: number) => string>('limited');

    limited.calledWith(1).once().mockReturnValue('one');
    limited(1);
    limited(1);

    expect(warnings()).toEqual([]);
  });

  it('counts an asymmetric config of the same arity', () => {
    const load = createFunctionSpy<(id: unknown, flag: boolean) => string>('load');

    load.calledWith(expect.any(Number), true).mockReturnValue('one');
    load('x', true);

    expect(warnings()).toHaveLength(1);
  });
});
