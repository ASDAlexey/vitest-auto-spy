import { describe, expect, it } from 'vitest';

import {
  describeMadeIn,
  describeStrayListener,
  describeStrayTimer,
  madeIn,
  strayListenersError,
  strayTimersError,
  strayTimersReport,
} from './stray-failure';
import type { StrayListener } from './stray-listeners';
import type { StrayTimer } from './stray-timers';

function withCurrent<T>(current: unknown, run: () => T): T {
  const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
  const saved: unknown = Reflect.get(Object(worker), 'current');

  Reflect.set(Object(worker), 'current', current);

  try {
    return run();
  } finally {
    Reflect.set(Object(worker), 'current', saved);
  }
}

describe('madeIn', () => {
  it('keeps the running test itself, and names its full path only when asked', () => {
    const where = madeIn();

    expect(describeMadeIn(where)).toEqual({ test: 'madeIn > keeps the running test itself, and names its full path only when asked' });
  });

  it('tells the import of a file from a hook by whether the file has started running', () => {
    expect(withCurrent({ type: 'suite', filepath: '/a.spec.ts' }, madeIn)).toBe('import');
    expect(withCurrent({ type: 'suite', result: { state: 'run' } }, madeIn)).toBe('hook');
    expect(withCurrent(undefined, madeIn)).toBeUndefined();
    expect(describeMadeIn('hook')).toEqual({ outsideTest: 'hook' });
    expect(describeMadeIn(undefined)).toEqual({});
  });
});

describe('describeStrayTimer and describeStrayListener', () => {
  const timer: StrayTimer = {
    kind: 'timeout',
    delay: 5000,
    file: '/r/a.spec.ts',
    frames: ['at /r/a.spec.ts:11:32'],
    test: 'cart > leaves a timer',
  };

  it('names the scheduler, the delay, the test and the first frame', () => {
    expect(describeStrayTimer(timer, '/r/a.spec.ts')).toBe(
      'setTimeout 5000 ms, scheduled in "cart > leaves a timer" at /r/a.spec.ts:11:32',
    );
    expect(
      describeStrayTimer({ kind: 'interval', delay: 10, file: '/r/b.spec.ts', frames: [], outsideTest: 'import' }, '/r/a.spec.ts'),
    ).toBe('setInterval 10 ms, scheduled while the file was imported, in /r/b.spec.ts');
    expect(describeStrayTimer({ kind: 'frame', file: undefined, frames: [], outsideTest: 'hook' })).toBe(
      'requestAnimationFrame, scheduled outside any test (a beforeAll, an afterAll or a late callback), outside any spec file',
    );
  });

  it('names the listener by type and target, and the test that added it', () => {
    const listener: StrayListener = { type: 'keydown', target: 'document', file: '/r/a.spec.ts', frames: [], test: 'dialog > opens' };

    expect(describeStrayListener(listener, '/r/a.spec.ts')).toBe('keydown on document, added in "dialog > opens"');
  });
});

describe('the file-end reports', () => {
  const inTest: StrayTimer = {
    kind: 'timeout',
    delay: 5000,
    file: '/r/a.spec.ts',
    frames: ['at /r/a.spec.ts:11:32'],
    test: 'cart > leaves a timer',
  };

  it('leads with the file and the count, and points a timer from a test back at that test', () => {
    const error = strayTimersError(1, [inTest]);

    expect(error.message).toBe(
      '[vitest-auto-spy] /r/a.spec.ts left 1 timer pending when it ended:\n' +
        '  - setTimeout 5000 ms, scheduled in "cart > leaves a timer" at /r/a.spec.ts:11:32\n' +
        'It was cancelled so it cannot fire in the next file. Clear it in the test that scheduled it — clearTimeout, unsubscribe, ' +
        'fixture.destroy() — or run it out with fake timers before the test ends.\n' +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#_4-cancelling-timers-that-outlive-their-file',
    );
  });

  it('caps the list for a warning and counts the rest, and names the running file when the timers disagree', () => {
    const report = strayTimersReport(3, [inTest, { ...inTest, file: '/r/b.spec.ts' }], 1);

    expect(report).toMatch(/^\[vitest-auto-spy\] src\/lib\/stray-failure\.spec\.ts left 3 timers pending when it ended:\n/);
    expect(report).toContain('  … and 2 more\n');
  });

  it('says "a spec file" when neither the timers nor the runner name one', () => {
    const report = withCurrent(undefined, () => {
      const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
      const filepath: unknown = Reflect.get(Object(worker), 'filepath');

      Reflect.set(Object(worker), 'filepath', undefined);

      try {
        return strayTimersReport(2, []);
      } finally {
        Reflect.set(Object(worker), 'filepath', filepath);
      }
    });

    expect(report).toMatch(/^\[vitest-auto-spy\] A spec file left 2 timers pending when it ended\.\nThey were cancelled/);
  });

  it('asks for each listener to be removed where it was added', () => {
    const listener: StrayListener = { type: 'resize', target: 'globalThis', file: '/r/a.spec.ts', frames: [], outsideTest: 'import' };
    const one = strayListenersError(1, [{ ...listener, test: 't' }]);
    const two = strayListenersError(2, [listener, listener]);

    expect(one.message).toContain('left 1 window/document listener attached when it ended:\n  - resize on globalThis, added in "t"\n');
    expect(one.message).toContain('It was removed so it cannot fire in the next file. Remove it in the test that added it —');
    expect(two.message).toContain('They were removed so none can fire in the next file. Remove each where it was added —');
    expect(two.message).toMatch(/\nDocs: \S+#_19-listeners-that-outlive-their-file$/);
  });
});
