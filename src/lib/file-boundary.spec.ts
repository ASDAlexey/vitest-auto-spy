/**
 * The order of the file-boundary repairs, pinned with the repairs themselves replaced by a log.
 * Each `describe` below installs the boundary; its `afterAll` runs when the block ends, so the block
 * after it reads what happened.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

import { installFileBoundary, reportStrayListeners, runFileBoundary } from './file-boundary';
import type { StrayListener } from './stray-listeners';

const { log, strays } = vi.hoisted(() => ({ log: [] as string[], strays: { removed: 0 } }));

vi.mock('./timer-globals', () => ({
  restoreTimerGlobals: (): void => {
    log.push('timer globals');
  },
}));

vi.mock('./storage-spy-restore', () => ({
  restoreStorageSpies: (): readonly string[] => {
    log.push('storage spies');

    return [];
  },
}));

vi.mock('./global-restore', () => ({
  captureGlobalBaseline: (): void => {
    log.push('capture globals');
  },
  restoreGlobals: (): readonly PropertyKey[] => {
    log.push('restore globals');

    return [];
  },
}));

const listener: StrayListener = { target: 'document', type: 'keydown', file: 'a.spec.ts', frames: [] };

vi.mock('./stray-listeners', () => ({
  trackStrayListeners: (): (() => void) => {
    log.push('track listeners');

    return () => undefined;
  },
  baselineStrayListeners: (): void => {
    log.push('baseline listeners');
  },
  describeStrayListeners: (): StrayListener[] => {
    log.push('describe listeners');

    return strays.removed > 0 ? [listener] : [];
  },
  removeStrayListeners: (): number => {
    log.push('remove listeners');

    return strays.removed;
  },
}));

const reports: unknown[] = [];

function takeLog(): string[] {
  return log.splice(0);
}

describe('with every repair on', () => {
  installFileBoundary({
    strayListeners: true,
    restoreGlobals: true,
    onStrayListeners: (report) => {
      log.push('report');
      reports.push(report);
    },
  });
  const armed = takeLog();

  it('installs the tracking and takes the snapshot while the file is collected, the baseline before the tests', () => {
    expect(armed).toEqual(['track listeners', 'capture globals']);
    expect(takeLog()).toEqual(['baseline listeners']);

    strays.removed = 1;
    vi.useFakeTimers();
  });
});

describe('after a file with every repair on', () => {
  afterAll(() => {
    strays.removed = 0;
  });

  it('took the fake clock off first, restored the globals last and reported after every repair', () => {
    expect(vi.isFakeTimers()).toBe(false);
    expect(takeLog()).toEqual(['timer globals', 'describe listeners', 'remove listeners', 'storage spies', 'restore globals', 'report']);
    expect(reports).toEqual([{ removed: 1, listeners: [listener] }]);
  });
});

describe('with a sweep handed in', () => {
  installFileBoundary({ strayListeners: true, onStrayListeners: () => log.push('listener report') }, [
    () => {
      log.push('sweep');

      return () => log.push('sweep report');
    },
    () => {
      log.push('silent sweep');

      return undefined;
    },
  ]);
  takeLog();

  it('arms the listener tracking', () => {
    expect(takeLog()).toEqual(['baseline listeners']);

    strays.removed = 1;
  });
});

describe('after a file with a sweep handed in', () => {
  afterAll(() => {
    strays.removed = 0;
  });

  it('ran the sweeps after the repairs and their reports after every repair', () => {
    expect(takeLog()).toEqual([
      'describe listeners',
      'remove listeners',
      'storage spies',
      'sweep',
      'silent sweep',
      'listener report',
      'sweep report',
    ]);
  });
});

describe('the boundary with a throwing report', () => {
  const failing = (message: string) => () => (): void => {
    log.push(`${message} report`);
    throw new Error(message);
  };

  it('still runs every repair and every report, and rethrows a lone error as it was', () => {
    const error = new Error('listeners');

    expect(() =>
      runFileBoundary([
        () => (): void => {
          throw error;
        },
        () => {
          log.push('timer sweep');

          return () => log.push('timer report');
        },
      ]),
    ).toThrow(error);
    expect(takeLog()).toEqual(['timer sweep', 'timer report']);
  });

  it('gathers several errors into one that names each of them', () => {
    let thrown: unknown;

    try {
      runFileBoundary([failing('listeners'), failing('timers')]);
    } catch (error) {
      thrown = error;
    }

    expect(takeLog()).toEqual(['listeners report', 'timers report']);
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([new Error('listeners'), new Error('timers')]);
    expect((thrown as AggregateError).message).toBe(
      '[vitest-auto-spy] 2 file-end checks failed when src/lib/file-boundary.spec.ts ended:\n\n1. listeners\n\n2. timers',
    );
  });

  it('gives each multi-line report its own block, Docs line included, and names a value that is not an Error', () => {
    const throwing = (value: unknown) => () => (): void => {
      throw value;
    };
    const report = '[vitest-auto-spy] a.spec.ts left 1 timer pending when it ended:\n  - setTimeout 5 ms\nDocs: https://x';

    expect(() => runFileBoundary([throwing('plain'), throwing(new Error(report))])).toThrow(
      '2 file-end checks failed when src/lib/file-boundary.spec.ts ended:\n\n1. plain\n\n' +
        '2. a.spec.ts left 1 timer pending when it ended:\n     - setTimeout 5 ms\n   Docs: https://x',
    );
  });

  it('says "the file" when the runner names none', () => {
    const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
    const filepath: unknown = Reflect.get(Object(worker), 'filepath');
    const failing = (): (() => void) => (): void => {
      throw new Error('x');
    };

    Reflect.set(Object(worker), 'filepath', undefined);

    try {
      expect(() => runFileBoundary([failing, failing])).toThrow('2 file-end checks failed when the file ended:');
    } finally {
      Reflect.set(Object(worker), 'filepath', filepath);
    }
  });
});

describe('with nothing left behind', () => {
  installFileBoundary({ strayListeners: true, onStrayListeners: (report) => reports.push(report) });
  const armed = takeLog();

  it('arms the listener tracking only', () => {
    expect(armed).toEqual(['track listeners']);
    expect(takeLog()).toEqual(['baseline listeners']);
  });
});

describe('after a file that left no listener behind', () => {
  it('swept, and did not call the handler', () => {
    expect(takeLog()).toEqual(['describe listeners', 'remove listeners', 'storage spies']);
    expect(reports).toHaveLength(1);
  });
});

describe('with a listener left behind and no handler', () => {
  installFileBoundary({ strayListeners: true });
  const armed = takeLog();

  it('arms the listener tracking', () => {
    expect(armed).toEqual(['track listeners']);
    expect(takeLog()).toEqual(['baseline listeners']);

    strays.removed = 2;
  });
});

describe('after a file with no handler', () => {
  afterAll(() => {
    strays.removed = 0;
  });

  it('removed the listeners quietly', () => {
    expect(takeLog()).toEqual(['describe listeners', 'remove listeners', 'storage spies']);
    expect(reports).toHaveLength(1);
  });
});

describe('with the global restore on and a real clock', () => {
  installFileBoundary({ restoreGlobals: true, restoreStorageSpies: false });
  const armed = takeLog();

  it('takes the snapshot', () => {
    expect(armed).toEqual(['capture globals']);
  });
});

describe('after a file that left the clock real', () => {
  it('still put the timer globals back before restoring the rest', () => {
    expect(vi.isFakeTimers()).toBe(false);
    expect(takeLog()).toEqual(['timer globals', 'restore globals']);
  });
});

describe('with the defaults', () => {
  installFileBoundary({});
  const armed = takeLog();

  it('neither tracks listeners nor snapshots the globals', () => {
    expect([...armed, ...takeLog()]).toEqual([]);
  });
});

describe('after a file with the defaults', () => {
  it('repaired the storage spies and nothing else', () => {
    expect(takeLog()).toEqual(['storage spies']);
  });
});

describe('with the storage repair turned off', () => {
  installFileBoundary({ restoreStorageSpies: false });
  const armed = takeLog();

  it('arms nothing', () => {
    expect([...armed, ...takeLog()]).toEqual([]);
  });
});

describe('after a file with every repair off', () => {
  it('ran nothing at the boundary', () => {
    expect(takeLog()).toEqual([]);
  });
});

describe('reportStrayListeners', () => {
  const stray: StrayListener = { target: 'document', type: 'keydown', file: '/a/dialog.spec.ts', frames: ['at open (src/dialog.ts:8:3)'] };

  it('calls nothing when nothing was removed', () => {
    const handler = vi.fn();

    reportStrayListeners(0, [], handler);
    reportStrayListeners(0, [], 'throw');

    expect(handler).not.toHaveBeenCalled();
  });

  it('fails the file with every stray named by type, target, file and first frame', () => {
    const bare: StrayListener = { target: 'globalThis', type: 'resize', file: undefined, frames: [] };

    expect(() => reportStrayListeners(2, [stray, bare], 'throw')).toThrow(
      '[vitest-auto-spy] src/lib/file-boundary.spec.ts left 2 window/document listeners attached when it ended:\n' +
        '  - keydown on document, in /a/dialog.spec.ts at open (src/dialog.ts:8:3)\n' +
        '  - resize on globalThis, outside any spec file\n' +
        'They were removed so none can fire in the next file. Remove each where it was added',
    );
  });
});
