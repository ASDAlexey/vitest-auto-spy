/**
 * The order of the file-boundary repairs, pinned with the repairs themselves replaced by a log.
 * Each `describe` below installs the boundary; its `afterAll` runs when the block ends, so the block
 * after it reads what happened.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';

import { installFileBoundary, reportStrayListeners } from './file-boundary';
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
      "2 window/document listener(s) outlived the spec file that added them. setupAutoSpy removed them; onStrayListeners: 'throw' fails the file. " +
        'Remove each one where it was added:\n  - keydown on document from /a/dialog.spec.ts at open (src/dialog.ts:8:3)\n  - resize on globalThis from no spec file\nDocs:',
    );
  });
});
