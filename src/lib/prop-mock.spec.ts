/**
 * What the `mock*Prop` journal has to survive: a patch that cannot be put back.
 *
 * Restoring is teardown, and teardown that gives up half-way is worse than none — the patches it
 * did not reach stay on objects that outlive the file. The sweep therefore continues past a failure,
 * empties the journal either way, and reports everything it could not undo in one message.
 *
 * The rest of the helpers' behaviour is covered from the public entry in `src/auto-spy.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

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
