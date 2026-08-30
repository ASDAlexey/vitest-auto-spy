/**
 * `fillMissingMembers` is exercised end-to-end through `createSpyFromClass({ fillMissing: true })`
 * in `auto-spy.spec.ts`; what is covered here is the one thing that path cannot show — the
 * strict-mode guard travelling into the members the wrapper mints.
 *
 * It is worth its own file rather than a case over there, because the combination is the one that
 * was wrong: a filled-in member is by definition one nobody configured, so a `strict: true` double
 * whose abstract members answered `undefined` in silence was strict everywhere except where the
 * question always has the same answer.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Mock } from 'vitest';

import { fillMissingMembers } from './fill-missing';
import { type UnstubbedGuard, resolveUnstubbedGuard } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { setupAutoSpy } from './setup-auto-spy';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

/** The guard a double resolves for itself, as `createSpyFromClass` does before assembling one. */
function guardFor(className: string, strict?: boolean): UnstubbedGuard {
  const guard = resolveUnstubbedGuard(className, { strict, onUnstubbedCall: undefined });

  if (!guard) {
    throw new Error('expected a guard');
  }

  return guard;
}

/** The guard `createSpyFromClass(X, { strict: true })` resolves and hands to each of its spies. */
function strictGuard(className: string): UnstubbedGuard {
  return guardFor(className, true);
}

/**
 * The suite-wide half, kept here rather than in `setup-auto-spy.spec.ts` because only one block per
 * file can arm it: `setupAutoSpy()` installs the default when the suite factory runs, during
 * collection, so a second armer in the same file would overwrite the first before either ran. The
 * pairing is the right one anyway — a filled-in member is the case where "nobody configured this"
 * is not an omission but the definition, so it is where a suite-wide handler has to reach.
 *
 * First in the file, and its `afterAll` releases the default before anything below runs.
 */
describe('a suite-wide onUnstubbedCall', () => {
  const seen: string[] = [];

  setupAutoSpy({
    duplicateCopies: 'off',
    restoreProps: false,
    onUnstubbedCall: ({ className, method }) => {
      seen.push(`${String(className)}.${method}`);

      return 'recorded';
    },
  });

  it('reaches a filled-in member, and its return value becomes the call result', () => {
    const filled = fillMissingMembers({}, guardFor('LocalStorage'));

    expect((filled['read'] as (key: string) => unknown)('token')).toBe('recorded');
    expect(seen).toEqual(['LocalStorage.read']);
  });
});

describe('fillMissingMembers', () => {
  it('mints a spy for a name the record does not carry, and caches it on the record', () => {
    const record: Record<string, unknown> = {};
    const filled = fillMissingMembers(record);
    const first = filled['read'];

    expect(typeof first).toBe('function');
    expect(filled['read']).toBe(first);
    expect(Object.keys(record)).toEqual(['read']);
  });

  it('gives a filled-in member the same strict guard the assembled record got', () => {
    const filled = fillMissingMembers({}, strictGuard('LocalStorage'));

    expect(() => (filled['read'] as (key: string) => unknown)('token')).toThrow(
      /Nothing configured LocalStorage\.read[\s\S]*Called as: LocalStorage\.read\('token'\)/,
    );
  });

  it('leaves a filled-in member configurable, so strict mode reports the omission rather than forbidding the member', () => {
    const filled = fillMissingMembers({}, strictGuard('LocalStorage'));
    const read = filled['read'] as Mock & ((key: string) => unknown);

    read.mockReturnValue('cached');

    expect(read('token')).toBe('cached');
  });

  it('stays non-strict when no guard is handed to it, which is every double that never asked', () => {
    const filled = fillMissingMembers({});

    expect((filled['read'] as (key: string) => unknown)('token')).toBeUndefined();
  });
});
