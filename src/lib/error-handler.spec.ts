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
import { errorHandler } from './error-handler';

/** The message of whatever `throwArgumentsError` threw — it always throws, so a miss is a failure. */
function messageOf(actualArgs: unknown[], functionName: string, configured?: ArgsMap): string {
  try {
    errorHandler.throwArgumentsError(actualArgs, functionName, configured);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('throwArgumentsError returned instead of throwing');
}

describe('errorHandler.throwArgumentsError', () => {
  it('prints the one configured call next to the one that arrived', () => {
    const configured = new ArgsMap();
    configured.set([1, 'fast'], { value: 'ok' });

    expect(messageOf([2, 'slow'], 'load', configured)).toBe(
      "The function 'load' was configured with 'mustBeCalledWith' and expects to be called with specific arguments.\n" +
        "Wanted: load(1,'fast')\n" +
        "Actual: load(2,'slow')\n" +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers',
    );
  });

  it('lists every configured call when there is more than one, matchers included', () => {
    const configured = new ArgsMap();
    configured.set([1, 'fast'], { value: 'ok' });
    configured.set([expect.any(Number), expect.stringContaining('a')], { value: 'ok' });

    expect(messageOf([9, 'zzz'], 'load', configured)).toContain(
      'Wanted (2 configured):\n  load(1,\'fast\')\n  load(Any<Number>,StringContaining)\nActual: load(9,\'zzz\')',
    );
  });

  it('falls back to the class name for a matcher that cannot describe itself', () => {
    const configured = new ArgsMap();
    configured.set([{ asymmetricMatch: (): boolean => false }], { value: 'ok' });

    expect(messageOf([1], 'load', configured)).toContain('Wanted: load([object Object])');
  });

  it('omits the wanted half when called without a map, and renders a no-argument call as ()', () => {
    expect(messageOf([], 'fn')).toBe(
      "The function 'fn' was configured with 'mustBeCalledWith' and expects to be called with specific arguments.\n" +
        'Actual: fn()\n' +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers',
    );
  });

  it('omits the wanted half when the map holds no configs at all', () => {
    expect(messageOf([1], 'fn', new ArgsMap())).not.toContain('Wanted');
  });
});
