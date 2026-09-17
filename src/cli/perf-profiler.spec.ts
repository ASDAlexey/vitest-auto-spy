/**
 * The worker half of the confirmation pass's profile, driven through a fake inspector session.
 *
 * Two things are pinned. The **protocol order** — the sampling interval has to be set after
 * `Profiler.enable` and before `Profiler.start`, or V8 ignores it and profiles at its 1 ms default —
 * and the **hand-over**: every file the worker writes is read once and removed, and a file that does
 * not parse, names no spec or carries no profile is removed too, because a leftover would be read
 * again by the next pass and attributed to whatever that pass measured.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeTextFile } from './fs-scan';
import type { FileHooks, InspectorSession } from './perf-profiler';
import { profileEachFile, takeProfiles } from './perf-profiler';
import { createTempRepo, removeTempRepos } from './temp-repo';

afterEach(() => {
  removeTempRepos();
});

const PROFILE = { nodes: [{ id: 1, callFrame: { functionName: '(root)', url: '' } }], samples: [1], timeDeltas: [500] };

interface Recorded {
  readonly session: InspectorSession;
  readonly calls: string[];
}

/** A session that answers every method, `Profiler.stop` with `stopResult`, and fails `failing` if named. */
const fakeSession = (stopResult: object | undefined, failing?: string): Recorded => {
  const calls: string[] = [];

  return {
    calls,
    session: {
      connect: () => calls.push('connect'),
      disconnect: () => calls.push('disconnect'),
      post: (method, params, callback) => {
        calls.push(`${method} ${JSON.stringify(params)}`);

        if (method === failing) {
          callback(new Error(`${method} refused`));

          return;
        }

        callback(null, method === 'Profiler.stop' ? stopResult : {});
      },
    },
  };
};

interface Captured {
  readonly hooks: FileHooks;
  before(): Promise<void>;
  after(): Promise<void>;
}

const captureHooks = (): Captured => {
  let before: () => Promise<void> = () => Promise.reject(new Error('beforeAll was not registered'));
  let after: () => Promise<void> = () => Promise.reject(new Error('afterAll was not registered'));

  return {
    hooks: {
      beforeAll: (fn) => {
        before = fn;
      },
      afterAll: (fn) => {
        after = fn;
      },
    },
    before: () => before(),
    after: () => after(),
  };
};

describe('profileEachFile', () => {
  it('sets the interval between enabling and starting, then stops, disconnects and leaves the profile for its file', async () => {
    const dir = join(createTempRepo({ 'profiles/': '' }), 'profiles');
    const { session, calls } = fakeSession({ profile: PROFILE });
    const captured = captureHooks();

    profileEachFile(captured.hooks, session, dir, () => '/repo/src/a.spec.ts');
    await captured.before();
    await captured.after();

    expect(calls).toEqual([
      'connect',
      'Profiler.enable {}',
      'Profiler.setSamplingInterval {"interval":500}',
      'Profiler.start {}',
      'Profiler.stop {}',
      'disconnect',
    ]);
    expect([...takeProfiles(dir)]).toEqual([['/repo/src/a.spec.ts', PROFILE]]);
  });

  it('writes a file that names no spec and carries no profile when neither is known, and the reader skips it', async () => {
    const dir = join(createTempRepo({ 'profiles/': '' }), 'profiles');
    const { session } = fakeSession(undefined);
    const captured = captureHooks();

    profileEachFile(captured.hooks, session, dir, () => undefined);
    await captured.before();
    await captured.after();

    expect(readdirSync(dir)).toHaveLength(1);
    expect(takeProfiles(dir).size).toBe(0);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('rejects the hook when the inspector refuses a method', async () => {
    const { session } = fakeSession({ profile: PROFILE }, 'Profiler.enable');
    const captured = captureHooks();

    profileEachFile(captured.hooks, session, createTempRepo({}), () => '/repo/src/a.spec.ts');

    await expect(captured.before()).rejects.toThrow('Profiler.enable refused');
  });
});

describe('takeProfiles', () => {
  it('returns nothing for a directory that was never created', () => {
    expect(takeProfiles(join(createTempRepo({}), 'missing')).size).toBe(0);
  });

  it('keeps a valid profile, skips every malformed one, and removes all of them', () => {
    const root = createTempRepo({ 'profiles/': '' });
    const dir = join(root, 'profiles');
    const write = (name: string, content: string): void => writeTextFile(join(dir, name), content);

    write('good.json', JSON.stringify({ file: '/repo/src/a.spec.ts', profile: PROFILE }));
    write('truncated.json', '{"file": "/repo/src/b.spec.ts", "prof');
    write('no-file.json', JSON.stringify({ profile: PROFILE }));
    write('empty-file.json', JSON.stringify({ file: '', profile: PROFILE }));
    write('not-a-profile.json', JSON.stringify({ file: '/repo/src/c.spec.ts', profile: { nodes: [], samples: [] } }));
    write('not-an-object.json', JSON.stringify([1, 2]));
    write('profile-not-an-object.json', JSON.stringify({ file: '/repo/src/d.spec.ts', profile: 'nope' }));
    write('nodes-not-an-array.json', JSON.stringify({ file: '/repo/src/e.spec.ts', profile: { ...PROFILE, nodes: {} } }));
    write('samples-not-an-array.json', JSON.stringify({ file: '/repo/src/f.spec.ts', profile: { ...PROFILE, samples: {} } }));

    expect([...takeProfiles(dir).keys()]).toEqual(['/repo/src/a.spec.ts']);
    expect(readdirSync(dir)).toEqual([]);
  });
});
