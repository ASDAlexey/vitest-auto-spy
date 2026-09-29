/**
 * What the `mock*Prop` journal has to survive: a patch that cannot be put back.
 *
 * Restoring is teardown, and teardown that gives up half-way is worse than none — the patches it
 * did not reach stay on objects that outlive the file. The sweep therefore continues past a failure,
 * empties the journal either way, and reports everything it could not undo in one message.
 *
 * The rest of the helpers' behaviour is covered from the public entry in `src/auto-spy.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useConsoleSpies } from './console-spy';
import { registerMockAdapter } from './mock-adapter';
import { beginPropEpoch, countMockedProps, mockValueProp, reportPropsOutsideHooks, restoreMockedProps } from './prop-mock';
import { SEALED_VALUE_DESCRIPTOR } from './prop-mock.mock';
import { vitestMockAdapter } from './vitest-adapter';

registerMockAdapter(vitestMockAdapter);

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
    Object.defineProperty(sealed, 'value', SEALED_VALUE_DESCRIPTOR);

    expect(() => restoreMockedProps()).toThrow(
      /could not put 1 patched property back; every other patch was restored:\n {2}- 'value' on an object: TypeError[\s\S]*Docs: .*#_7-naming/,
    );

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
    Object.defineProperty(first, 'value', SEALED_VALUE_DESCRIPTOR);
    Object.defineProperty(second, 'value', SEALED_VALUE_DESCRIPTOR);

    expect(() => restoreMockedProps()).toThrow(/could not put 2 patched properties back/);
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

  it('keeps neither the object nor the descriptor once undone, and compacts the journal as undos pile up', () => {
    const journal = (): { slots: { patch: unknown }[]; undone: number } => {
      const value: unknown = Reflect.get(globalThis, '__vitestAutoSpyPropJournal__');

      return value as { slots: { patch: unknown }[]; undone: number };
    };
    const hosts = [{ value: 0 }, { value: 1 }, { value: 2 }, { value: 3 }];
    const undos = hosts.map((host) => mockValueProp(host, 'value', -1));

    undos[1]?.();

    expect(journal().slots).toHaveLength(4);
    expect(journal().slots[1]?.patch).toBeUndefined();
    expect(countMockedProps()).toBe(3);

    undos[2]?.();
    undos[0]?.();

    expect(journal().slots).toHaveLength(1);
    expect(journal().undone).toBe(0);
    expect(countMockedProps()).toBe(1);
    expect(hosts.map((host) => host.value)).toEqual([0, 1, 2, -1]);

    restoreMockedProps();
    expect(hosts[3]?.value).toBe(3);
  });

  it('puts a twice-patched property back to its original after a compaction in between', () => {
    const host = { value: 'real' };
    const unrelated = [{ value: 1 }, { value: 2 }, { value: 3 }].map((object) => mockValueProp(object, 'value', 0));

    mockValueProp(host, 'value', 'first');
    mockValueProp(host, 'value', 'second');
    unrelated.forEach((undo) => undo());

    restoreMockedProps();
    expect(host.value).toBe('real');
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

    Object.defineProperty(host, 'value', { value: 'real', writable: false, configurable: false });

    return host;
  }

  it('says what was attempted, on what, and what to do instead', () => {
    expect(() => mockValueProp(sealed(), 'value', 'patched')).toThrow(
      /Cannot mock the property 'value': it is not configurable[\s\S]*The target is a plain object\.\nHand the code under test a copy \(\{ \.\.\.object \}\) and patch that, or a double built with createAutoMock<T>\(\)\.\nDocs: .*auto-mock-by-type$/,
    );
  });

  it('names the class prototype a patch it could not put back was made on', () => {
    class Cart {
      total(): number {
        return 0;
      }
    }

    mockValueProp(Cart.prototype, 'total', () => 1);
    Object.defineProperty(Cart.prototype, 'total', { value: () => 2, configurable: false });

    expect(() => restoreMockedProps()).toThrow('  - Cart.prototype.total: TypeError');
  });

  it('suggests a double that spies the getter, for a locked field of a class instance', () => {
    class Settings {
      readonly region = 'eu';
    }

    const settings = new Settings();

    Object.defineProperty(settings, 'region', { value: 'eu', writable: false, configurable: false });

    expect(() => mockValueProp(settings, 'region', 'us')).toThrow(
      "Build a double instead of patching the real instance: createSpyFromClass(Settings, { gettersToSpyOn: ['region'] }).",
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
 * `Array.prototype.length` is `{ writable: true, configurable: false }` — forcing `configurable:
 * true`, as every other value patch does, is what used to make this throw `Cannot redefine property`
 * for any array-length write, even though the runtime allows changing the value of a
 * writable-but-non-configurable data property outright.
 */
describe('a property that is writable but not configurable', () => {
  it('mocks Array.prototype.length in place, and restores the length and the elements it deleted', () => {
    const items = [1, 2, 3];

    const restore = mockValueProp(items, 'length', 0);

    expect(items).toEqual([]);

    restore();
    expect(items).toEqual([1, 2, 3]);
    expect(Object.keys(items)).toEqual(['0', '1', '2']);
  });

  it('puts back only the truncated slots, keeping holes and the sweep path', () => {
    // eslint-disable-next-line no-sparse-arrays -- the hole is what the restore must not fill.
    const items = ['a', , 'c', 'd'];

    mockValueProp(items, 'length', 1);
    items[0] = 'changed';
    restoreMockedProps();

    expect(items).toHaveLength(4);
    expect(items[0]).toBe('changed');
    expect(1 in items).toBe(false);
    expect(items.slice(2)).toEqual(['c', 'd']);
  });

  it('snapshots nothing when the length grows', () => {
    const items = [1];

    const restore = mockValueProp(items, 'length', 3);

    expect(items).toHaveLength(3);

    restore();
    expect(items).toEqual([1]);
  });

  it('mocks any writable, non-configurable data property, not only length', () => {
    const host = { value: 'real' };

    Object.defineProperty(host, 'value', { value: 'real', writable: true, configurable: false });

    const restore = mockValueProp(host, 'value', 'patched');

    expect(host.value).toBe('patched');

    restore();
    expect(host.value).toBe('real');
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
  const { consoleWarnSpy } = useConsoleSpies();

  /** One sweep, with the epoch advanced in between — what a `describe`-body patch meets. */
  const sweepAfterANewTest = (patch: () => void): void => {
    patch();
    beginPropEpoch();
    restoreMockedProps();
  };

  afterEach(() => {
    reportPropsOutsideHooks('warn');
  });

  it('names each object as a spec would write it', () => {
    class Cart {
      static region = 'eu';
      readonly id = 1;
    }

    const anonymous = Object.assign((): undefined => undefined, { value: 1 });
    Object.defineProperty(anonymous, 'name', { value: '' });

    sweepAfterANewTest(() => {
      mockValueProp(Object.create(null) as object, 'bare', 1);
      mockValueProp(globalThis, 'patchedForTheReport', 1);
      mockValueProp(document, 'patchedForTheReport', 1);
      mockValueProp(Cart, 'region', 'us');
      mockValueProp(Cart.prototype, 'patchedForTheReport', 1);
      mockValueProp(new Cart(), 'id', 2);
      mockValueProp(anonymous, 'value', 2);
    });

    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain(
      "mockValueProp(…, 'value') on a function, mockValueProp(…, 'id') on a Cart, mockValueProp(Cart.prototype, 'patchedForTheReport'), " +
        "mockValueProp(Cart, 'region'), mockValueProp(document, 'patchedForTheReport'), mockValueProp(globalThis, 'patchedForTheReport'), mockValueProp(…, 'bare') on an object in ",
    );
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('took them off for good');
  });

  it('warns, naming the property and the hook to move it to', () => {
    const host = { value: 'real' };
    sweepAfterANewTest(() => mockValueProp(host, 'value', 'patched'));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toBe(
      "[vitest-auto-spy] mockValueProp(…, 'value') on an object in src/lib/prop-mock.spec.ts ran outside a per-test hook, " +
        'so the sweep after the first test took it off for good and every later test reads the real member.\n' +
        'Move the call into beforeEach, so it is applied again for each test.\n' +
        'Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/setup#a-patch-put-in-the-wrong-hook-stops-applying',
    );
    expect(consoleWarnSpy.mock.calls[0]?.[0]).not.toContain('**');
  });

  it('says nothing about a patch made during the test that is now ending', () => {
    // The shape the report must never fire on, and the one every correct spec has.
    const host = { value: 'real' };
    beginPropEpoch();
    mockValueProp(host, 'value', 'patched');
    restoreMockedProps();

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('names one object/property pair once, however many sweeps see it', () => {
    const host = { value: 'real' };
    sweepAfterANewTest(() => mockValueProp(host, 'value', 'first'));
    sweepAfterANewTest(() => mockValueProp(host, 'value', 'second'));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it('names a shared object again in the next spec file, so which file shows it does not depend on run order', () => {
    const shared = { value: 'real' };
    const worker: { filepath: unknown } = Reflect.get(globalThis, '__vitest_worker__');
    const ownFile = worker.filepath;

    sweepAfterANewTest(() => mockValueProp(shared, 'value', 'first file'));
    worker.filepath = '/a/later.spec.ts';

    try {
      sweepAfterANewTest(() => mockValueProp(shared, 'value', 'second file'));
    } finally {
      worker.filepath = ownFile;
    }

    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
  });

  it('reports the same property name on a second object, which a name-keyed set would not', () => {
    // Under `isolate: false` two files of one worker patch a member of the same name on different
    // objects; silencing the second would be the blind spot this dedup is keyed to avoid.
    sweepAfterANewTest(() => mockValueProp({ value: 'real' }, 'value', 'patched'));
    sweepAfterANewTest(() => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
  });

  it('throws instead, for a suite that would rather fail on the first test', () => {
    reportPropsOutsideHooks('throw');

    const host = { value: 'real' };

    expect(() => sweepAfterANewTest(() => mockValueProp(host, 'value', 'patched'))).toThrow(/ran outside a per-test hook/);
    // The sweep finished before the report, so the property is real again whatever the reaction.
    expect(host.value).toBe('real');
  });

  it('says nothing at all when the report is off', () => {
    reportPropsOutsideHooks('off');

    sweepAfterANewTest(() => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(consoleWarnSpy).not.toHaveBeenCalled();
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
  const { consoleWarnSpy } = useConsoleSpies();

  const worker: { filepath: unknown } = Reflect.get(globalThis, '__vitest_worker__');
  const ownFile = worker.filepath;

  /** Record `patch` as if it ran in `file`, the way the worker's `filepath` says which file is running. */
  const inSpecFile = (file: unknown, patch: () => void): void => {
    worker.filepath = file;

    try {
      patch();
    } finally {
      worker.filepath = ownFile;
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

  it('lists five of the held patches and counts the rest', () => {
    inSpecFile('/held/wide.spec.ts', () => {
      for (let index = 0; index < 7; index += 1) {
        mockValueProp({ value: 'real' }, 'value', 'patched');
      }
    });
    inSpecFile('/held/after-wide.spec.ts', () => mockValueProp(Object.create(null) as object, 'value', 'patched'));

    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain(
      `${Array.from({ length: 5 }, () => "'value' on an object").join(', ')} and 2 more.`,
    );
  });

  it("warns when the next file records over a journal still holding the previous file's patches", () => {
    inSpecFile('/held/first.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/second.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain(
      "1 mock*Prop patch from earlier spec files, most recently /held/first.spec.ts, is still in place while /held/second.spec.ts records another: 'value' on an object.",
    );
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('restoreMockedProps()');
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('setupAutoSpy');
  });

  it('names the transition once, not once per patch the new file records', () => {
    inSpecFile('/held/third.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/fourth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/fourth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the journal was swept empty between the files', () => {
    inSpecFile('/held/fifth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    // The teardown the report exists to suggest, doing its work between the two files.
    restoreMockedProps();
    expect(countMockedProps()).toBe(0);
    inSpecFile('/held/sixth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('says nothing about patches piling up inside one file', () => {
    inSpecFile('/held/seventh.spec.ts', () => {
      mockValueProp({ value: 'real' }, 'value', 'patched');
      mockValueProp({ other: 'real' }, 'other', 'patched');
    });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('warns again on the next transition, counting everything still held', () => {
    inSpecFile('/held/eighth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/ninth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    inSpecFile('/held/tenth.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy.mock.calls[1]?.[0]).toContain('2 mock*Prop patches from earlier spec files');
    expect(consoleWarnSpy.mock.calls[1]?.[0]).toContain('most recently /held/ninth.spec.ts');
  });

  it('names the previous file even when the runner never named it', () => {
    inSpecFile(undefined, () => mockValueProp({ value: 'real' }, 'value', 'patched'));
    mockValueProp({ value: 'real' }, 'value', 'patched');

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('a file this runner did not name');
  });

  it('says nothing about a patch the previous file already took off through its own undo', () => {
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
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('counts only what is still in place when the previous file undid some of its patches', () => {
    inSpecFile('/held/partial.spec.ts', () => {
      const restore = mockValueProp({ value: 'real' }, 'value', 'patched');

      restore();
      mockValueProp({ other: 'real' }, 'other', 'patched');
    });

    inSpecFile('/held/after-partial.spec.ts', () => mockValueProp({ value: 'real' }, 'value', 'patched'));

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('1 mock*Prop patch from earlier spec files');
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('most recently /held/partial.spec.ts');
  });
});
