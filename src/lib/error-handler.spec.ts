/**
 * The `mustBeCalledWith` failure message.
 *
 * It is the only diagnostic in the package a spec author reads *while* the spy is misbehaving, so
 * every branch of it is pinned here: one wanted call, several, none at all, and an actual call with
 * no arguments. The public re-export (`errorHandler` off the entry) is smoke-tested in
 * `src/auto-spy.spec.ts`; the wording lives here.
 */
import { describe, expect, it } from 'vitest';

import { ArgsMap } from './args-map';
import { errorHandler, splitRenderedArgs } from './error-handler';

/** The message of whatever `throwArgumentsError` threw — it always throws, so a miss is a failure. */
function messageOf(actualArgs: unknown[], functionName: string, configured?: ArgsMap, className?: string): string {
  try {
    errorHandler.throwArgumentsError(actualArgs, functionName, configured, className);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('throwArgumentsError returned instead of throwing');
}

describe('errorHandler.throwArgumentsError', () => {
  it('prints the one configured call next to the one that arrived', () => {
    const configured = new ArgsMap();
    configured.set([1, 'fast'], { value: 'ok' });

    expect(messageOf([1, 'slow'], 'load', configured, 'Loader')).toBe(
      "[vitest-auto-spy] Loader.load is set up with mustBeCalledWith, and this call matches none of its configs — argument 2: expected 'fast', got 'slow'.\n" +
        "Wanted: load(1,'fast')\n" +
        "Actual: load(1,'slow')\n" +
        'Fix the value the code under test passes, or configure this call too.\n' +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#what-a-mustbecalledwith-failure-prints',
    );
  });

  it('lists every configured call when there is more than one, matchers included', () => {
    const configured = new ArgsMap();
    configured.set([1, 'fast'], { value: 'ok' });
    configured.set([expect.any(Number), expect.stringContaining('a')], { value: 'ok' });

    expect(messageOf([9, 'zzz'], 'load', configured)).toContain(
      "Wanted (2 configured):\n  load(1,'fast')\n  load(Any<Number>,StringContaining)\nActual: load(9,'zzz')",
    );
  });

  it('falls back to the class name for a matcher that cannot describe itself', () => {
    const configured = new ArgsMap();
    configured.set([{ asymmetricMatch: (): boolean => false }], { value: 'ok' });

    expect(messageOf([1], 'load', configured)).toContain('Wanted: load([object Object])');
  });

  it('omits the wanted half when called without a map, and renders a no-argument call as ()', () => {
    expect(messageOf([], 'fn')).toBe(
      '[vitest-auto-spy] fn is set up with mustBeCalledWith, and this call matches none of its configs.\n' +
        'Actual: fn()\n' +
        'Fix the value the code under test passes, or configure this call too.\n' +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#what-a-mustbecalledwith-failure-prints',
    );
  });

  it('says how many arguments were wanted when the count differs', () => {
    const configured = new ArgsMap();
    configured.set([1, 'fast'], { value: 'ok' });

    expect(messageOf([1], 'load', configured)).toContain('matches none of its configs — expected 2 argument(s), got 1.');
  });

  it('points at the first differing argument inside nested values and quoted commas', () => {
    const configured = new ArgsMap();
    configured.set([{ tags: ['a', 'b'] }, "x,'y", 3], { value: 'ok' });

    expect(messageOf([{ tags: ['a', 'b'] }, "x,'y", 4], 'load', configured)).toContain('argument 3: expected 3, got 4.');
  });

  it('reads past an escaped quote inside a string argument', () => {
    expect(splitRenderedArgs("'it\\'s,x',2")).toEqual(["'it\\'s,x'", '2']);
    expect(splitRenderedArgs('')).toEqual([]);
  });

  it('says so when the renderings agree but the matcher did not', () => {
    const configured = new ArgsMap();
    configured.set([Symbol('id')], { value: 'ok' });

    expect(messageOf([Symbol('id')], 'load', configured)).toContain('the arguments render the same but did not match the config');
  });

  it('omits the wanted half when the map holds no configs at all', () => {
    expect(messageOf([1], 'fn', new ArgsMap())).not.toContain('Wanted');
  });
});
