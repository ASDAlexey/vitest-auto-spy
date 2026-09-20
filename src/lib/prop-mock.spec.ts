/**
 * What the `mock*Prop` journal has to survive: a patch that cannot be put back.
 *
 * Restoring is teardown, and teardown that gives up half-way is worse than none — the patches it
 * did not reach stay on objects that outlive the file. The sweep therefore continues past a failure,
 * empties the journal either way, and reports everything it could not undo in one message.
 *
 * The rest of the helpers' behaviour is covered from the public entry in `src/auto-spy.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { beginPropEpoch, countMockedProps, mockValueProp, reportPropsOutsideHooks, restoreMockedProps } from './prop-mock';

describe('restoreMockedProps, when a patch cannot be undone', () => {
  // The journal is process-wide; a failing sweep in one test must not colour the next.
  afterEach(() => {
    restoreMockedProps();
  });

  it('restores the rest, empties the journal and names the property it could not put back', () => {
    const restorable = { value: 'real' };
    const sealed = { value: 'real' };

    mockValueProp(restorable, 'value', 'patched');
    mockValueProp(sealed, 'value', 'patched');
    // What `guardGlobals` exists to catch: a redefinition that seals a property the library still
    // holds the original descriptor for, so nothing can ever put that descriptor back.
    Object.defineProperty(sealed, 'value', { value: 'sealed', configurable: false });

    expect(() => restoreMockedProps()).toThrow(/could not put 1 of the patched properties back[\s\S]*- value: TypeError/);

    // Swept newest first, so the sealed patch failed before this one was even reached.
    expect(restorable.value).toBe('real');
    expect(sealed.value).toBe('sealed');
    expect(countMockedProps()).toBe(0);
    expect(() => restoreMockedProps()).not.toThrow();
  });

  it('reports every failure of the sweep, not just the first', () => {
    const first = { value: 'real' };
    const second = { value: 'real' };

    mockValueProp(first, 'value', 'patched');
    mockValueProp(second, 'value', 'patched');
    Object.defineProperty(first, 'value', { value: 'sealed', configurable: false });
    Object.defineProperty(second, 'value', { value: 'sealed', configurable: false });

    expect(() => restoreMockedProps()).toThrow(/could not put 2 of the patched properties back/);
  });
});

describe('the undo of a single patch', () => {
  it('is not counted or swept a second time', () => {
    const host = { a: 'real-a', b: 'real-b' };
    const undoA = mockValueProp(host, 'a', 'mocked-a');

    mockValueProp(host, 'b', 'mocked-b');
    expect(countMockedProps()).toBe(2);

    undoA();
    expect(countMockedProps()).toBe(1);

    undoA();
    expect(countMockedProps()).toBe(1);

    restoreMockedProps();
    expect(host).toEqual({ a: 'real-a', b: 'real-b' });
    expect(countMockedProps()).toBe(0);
  });
});

/**
 * A property the runtime refuses to replace at all — the other half of the same seam.
 *
 * The accessor spies behind the adapter have explained this failure for a while; the `mock*Prop`
 * helpers reach the same `Object.defineProperty` and used to hand the bare
 * `TypeError: Cannot redefine property: x` straight back. Worse, the journal already held the patch
 * by then, so the next sweep tried to undo something that never happened.
 */
describe('a property that refuses to be replaced', () => {
  function sealed(): { value: string } {
    const host = { value: 'real' };

    Object.defineProperty(host, 'value', { value: 'real', configurable: false });

    return host;
  }

  it('says what was attempted, on what, and what to do instead', () => {
    expect(() => mockValueProp(sealed(), 'value', 'patched')).toThrow(
      /Cannot mock the property 'value': it is not configurable[\s\S]*Give the code under test a real seam/,
    );
  });

  it('names the target, so the reader knows what they are looking at', () => {
    expect(() => mockValueProp(Object.freeze({ value: 'real' }), 'value', 'patched')).toThrow(/The target is a frozen object/);
  });

  it('leaves nothing in the journal, because the entry is only made once the define succeeds', () => {
    expect(countMockedProps()).toBe(0);
    expect(() => mockValueProp(sealed(), 'value', 'patched')).toThrow();

    expect(countMockedProps()).toBe(0);
    expect(() => restoreMockedProps()).not.toThrow();
  });

  it('re-throws anything that is not the runtime refusing to redefine', () => {
    // A host whose `defineProperty` fails for its own reasons: the guard must not dress that up as
    // a story about bundled modules and seams.
    const host = new Proxy(
      { value: 'real' },
      {
        defineProperty: (): never => {
          throw new RangeError('boom');
        },
      },
    );

    expect(() => mockValueProp(host, 'value', 'patched')).toThrow(RangeError);
    expect(countMockedProps()).toBe(0);
  });
});

/**
 * A patch is undone by the sweep after the test **during which it was applied**, whenever it was
 * created — so one written in a `describe` body or a `beforeAll` survives exactly one test. The
 * first passes, every test after it reads the real member, and the failure lands as
 * `… is not a function` nowhere near the line that caused it. Found in six files of one suite at
 * once during a bulk move onto `mockValueProp`, and the same shape as the `restoreMocks` defect that
 * took the accessor spies off a double: a helper put in the wrong hook stops applying, quietly.
 *
 * The report is a warning by default rather than a re-installation, and the reason is that
 * re-installing cannot be right in general: `restoreMockedProps` exists so a patch does not outlive
 * its file, and a patch that puts itself back on every test would defeat that under `isolate: false`
 * — where "the file it belongs to" is not something this module can observe.
 */
describe('a patch applied outside a per-test hook', () => {
  /** One sweep, with the epoch advanced in between — what a `describe`-body patch meets. */
  const sweepAfterANewTest = (patch: () => void): void => {
    patch();
    beginPropEpoch();
    restoreMockedProps();
  };

  afterEach(() => {
    reportPropsOutsideHooks('warn');
  });

  it('warns, naming the property and the hook to move it to', () => {
    const host = { value: 'real' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    sweepAfterANewTest(() => mockValueProp(host, 'value', 'patched'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('value — patched outside a per-test hook');
    expect(warn.mock.calls[0]?.[0]).toContain('`beforeEach`');

    warn.mockRestore();
  });

  it('says nothing about a patch made during the test that is now ending', () => {
    // The shape the report must never fire on, and the one every correct spec has.
    const host = { value: 'real' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    beginPropEpoch();
    mockValueProp(host, 'value', 'patched');
    restoreMockedProps();

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('names one object/property pair once, however many sweeps see it', () => {
    const host = { value: 'real' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    sweepAfterANewTest(() => mockValueProp(host, 'value', 'first'));
    sweepAfterANewTest(() => mockValueProp(host, 'value', 'second'));

    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it('names a shared object again in the next spec file, so which file shows it does not depend on run order', () => {
    const shared = { value: 'real' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
    const ownFile: unknown = Reflect.get(Object(worker), 'filepath');

    sweepAfterANewTest(() => mockValueProp(shared, 'value', 'first file'));
    Reflect.set(Object(worker), 'filepath', '/a/later.spec.ts');

    try {
      sweepAfterANewTest(() => mockValueProp(shared, 'value', 'second file'));
    } finally {
      Reflect.set(Object(worker), 'filepath', ownFile);
    }

    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  it('reports the same property name on a second object, which a name-keyed set would not', () => {
    // Under `isolate: false` two files of one worker patch a member of the same name on different
    // objects; silencing the second would be the blind spot this dedup is keyed to avoid.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    sweepAfterANewTest(() => mockValueProp({ value: 'real' }, 'value', 'patched'));
    sweepAfterANewTest(() => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(warn).toHaveBeenCalledTimes(2);

    warn.mockRestore();
  });

  it('throws instead, for a suite that would rather fail on the first test', () => {
    reportPropsOutsideHooks('throw');

    const host = { value: 'real' };

    expect(() => sweepAfterANewTest(() => mockValueProp(host, 'value', 'patched'))).toThrow(/patched outside a per-test hook/);
    // The sweep finished before the report, so the property is real again whatever the reaction.
    expect(host.value).toBe('real');
  });

  it('says nothing at all when the report is off', () => {
    reportPropsOutsideHooks('off');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    sweepAfterANewTest(() => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});

/**
 * The journal nobody sweeps: without `setupAutoSpy` — or a `restoreMockedProps()` of one's own in a
 * teardown hook — the entries of one spec file are still in it when the next file of the same worker
 * records. The patches stay on their objects, every entry pins its object and descriptor for the
 * rest of the worker, and the failure has no home: the next file reads a member somebody else
 * mocked. The report fires at the first patch that arriving file records, once per transition.
 */
describe('journal entries held across spec files', () => {
  const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
  const ownFile: unknown = Reflect.get(Object(worker), 'filepath');

  /** Record `patch` as if it ran in `file`, the way the worker's `filepath` says which file is running. */
  const inSpecFile = (file: unknown, patch: () => void): void => {
    Reflect.set(Object(worker), 'filepath', file);

    try {
      patch();
    } finally {
      Reflect.set(Object(worker), 'filepath', ownFile);
    }
  };

  // A leak from an earlier file of this worker (`isolate: false`) would otherwise be graded and
  // reported as this spec's when the cleanup here sweeps it.
  const sweepQuietly = (): void => {
    reportPropsOutsideHooks('off');
    restoreMockedProps();
    reportPropsOutsideHooks('warn');
  };

  beforeEach(sweepQuietly);
  afterEach(sweepQuietly);

  it("warns when the next file records over a journal still holding the previous file's patches", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    inSpecFile('/held/first.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/second.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('1 mock*Prop patch(es) from earlier spec files');
    expect(warn.mock.calls[0]?.[0]).toContain('most recently /held/first.spec.ts');
    expect(warn.mock.calls[0]?.[0]).toContain('restoreMockedProps()');
    expect(warn.mock.calls[0]?.[0]).toContain('setupAutoSpy');

    warn.mockRestore();
  });

  it('names the transition once, not once per patch the new file records', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    inSpecFile('/held/third.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/fourth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/fourth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it('says nothing when the journal was swept empty between the files', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    inSpecFile('/held/fifth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    // The teardown the report exists to suggest, doing its work between the two files.
    restoreMockedProps();
    expect(countMockedProps()).toBe(0);
    inSpecFile('/held/sixth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('says nothing about patches piling up inside one file', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    inSpecFile('/held/seventh.spec.ts', () => {
      mockValueProp({ value: 'real' }, 'value', 'patched');
      mockValueProp({ other: 'real' }, 'other', 'patched');
    });

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('warns again on the next transition, counting everything still held', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    inSpecFile('/held/eighth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/ninth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/tenth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]?.[0]).toContain('2 mock*Prop patch(es) from earlier spec files');
    expect(warn.mock.calls[1]?.[0]).toContain('most recently /held/ninth.spec.ts');

    warn.mockRestore();
  });

  it('names the previous file even when the runner never named it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    inSpecFile(undefined, () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    mockValueProp({ value: 'real' }, 'value', 'patched');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('a file this runner did not name');

    warn.mockRestore();
  });

  it('says nothing about a patch the previous file already took off through its own undo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const object = { value: 'real' };

    // The documented shape for a suite with no `setupAutoSpy`: the per-patch undo, called in the
    // file's own teardown. The entry is marked rather than spliced out, so the journal is still
    // non-empty — and the property is back on its object, which is what makes it not held.
    inSpecFile('/held/undone.spec.ts', () => {
      const restore = mockValueProp(object, 'value', 'patched');

      restore();
    });

    expect(countMockedProps()).toBe(0);

    inSpecFile('/held/after-undone.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(object.value).toBe('real');
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('counts only what is still in place when the previous file undid some of its patches', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    inSpecFile('/held/partial.spec.ts', () => {
      const restore = mockValueProp({ value: 'real' }, 'value', 'patched');

      restore();
      mockValueProp({ other: 'real' }, 'other', 'patched');
    });

    inSpecFile('/held/after-partial.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('1 mock*Prop patch(es) from earlier spec files');
    expect(warn.mock.calls[0]?.[0]).toContain('most recently /held/partial.spec.ts');

    warn.mockRestore();
  });
});
