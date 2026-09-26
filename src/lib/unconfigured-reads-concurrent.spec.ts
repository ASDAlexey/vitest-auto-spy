/**
 * Unconfigured reads under `test.concurrent`: a read carries nothing that says which test made it, so
 * what is pinned here is that no read is lost to a sibling's window and that one made while several
 * tests were in flight names them all instead of landing silently on one.
 */
import { type Observable, of } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../index';
import '../rxjs';
import { createSpyFromClass } from './create-spy-from-class';
import type { Spy } from './types';
import { openReadWindow, reportUnconfiguredReads, setUnconfiguredReadsDefault } from './unconfigured-reads';

class Settings {
  get theme(): string {
    return 'light';
  }

  get locale(): string {
    return 'en';
  }
}

class Feed {
  items$: Observable<number> = of(1);
}

const strictSettings = (): Spy<Settings> => createSpyFromClass(Settings, { strict: true, gettersToSpyOn: ['theme', 'locale'] });

function gate(): { promise: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { promise, open };
}

function concurrentContext(name: string, extra: object = {}): { task: object } {
  return { task: { name, concurrent: true, ...extra } };
}

function thrownBy(run: () => void): string {
  try {
    run();
  } catch (error) {
    return String(error);
  }

  return '';
}

describe('two test.concurrent windows that overlap', () => {
  const warnings: string[] = [];
  const reports: [test: string, printed: string[]][] = [];
  const firstReadAlone = gate();
  const secondOpened = gate();
  const overlapRead = gate();
  const firstClosed = gate();
  const warn = vi.spyOn(console, 'warn').mockImplementation((message: string) => void warnings.push(message));
  let shared: Spy<Settings>;
  let feed: Spy<Feed>;

  beforeAll(() => {
    setUnconfiguredReadsDefault(true, undefined);
    shared = strictSettings();
    feed = createSpyFromClass(Feed, { strict: true, observablePropsToSpyOn: ['items$'] });
  });

  afterAll(() => {
    setUnconfiguredReadsDefault(false, undefined);
    warn.mockRestore();
  });

  beforeEach(async (context) => {
    if (context.task.name === 'second') {
      // Opened only after the first test's lone read, which the old single window would have erased.
      await firstReadAlone.promise;
    }

    openReadWindow(context);
  });

  afterEach((context) => {
    const before = warnings.length;

    reportUnconfiguredReads('warn', context);

    if (context.task.concurrent === true) {
      reports.push([context.task.name, warnings.slice(before)]);
    }

    if (context.task.name === 'first') {
      firstClosed.open();
    }
  });

  it.concurrent('first', async () => {
    void strictSettings().locale;
    firstReadAlone.open();
    await secondOpened.promise;
    void shared.theme;
    feed.items$.subscribe();
    overlapRead.open();
  });

  it.concurrent('second', async () => {
    secondOpened.open();
    await overlapRead.promise;
    await firstClosed.promise;
    feed.items$.nextWith(1);
  });

  it("charges the lone read to the first test alone, and holds the overlap's for the last to finish", () => {
    expect(reports.map(([test, printed]) => [test, printed.length])).toEqual([
      ['first', 1],
      ['second', 1],
    ]);

    const firstPrinted = reports[0]?.[1] ?? [];
    const secondPrinted = reports[1]?.[1] ?? [];

    expect(firstPrinted[0]).toContain('Settings.locale was read 1 time');
    expect(firstPrinted[0]).not.toContain('concurrent');
    expect(firstPrinted[0]).not.toContain('theme');
    expect(secondPrinted[0]).toMatch(
      /Settings\.theme was read 1 time[^\n]*\n[^\n]*\nIt happened while 2 concurrent tests were in flight \("[^"]+", "[^"]+"\), and a read does not say which test made it; it is reported once, as the last of them finishes\./,
    );
    expect(secondPrinted[0]).toContain('"two test.concurrent windows that overlap > first"');
    expect(secondPrinted[0]).toContain('"two test.concurrent windows that overlap > second"');
  });

  it('never reports the stream the second test fed after the first had finished', () => {
    expect(warnings.join('\n')).not.toContain('items$');
  });
});

describe('the windows of concurrent tests, driven by hand', () => {
  beforeEach(() => {
    setUnconfiguredReadsDefault(true, undefined);
  });

  afterEach(() => {
    reportUnconfiguredReads('off');
    setUnconfiguredReadsDefault(false, undefined);
  });

  it('names every window a repeated read was made under, and reports it once', () => {
    const settings = strictSettings();
    const a = concurrentContext('a');
    const b = concurrentContext('b');
    const c = concurrentContext('c');

    openReadWindow(a);
    void settings.theme;
    openReadWindow(b);
    void settings.theme;
    reportUnconfiguredReads('throw', a);
    openReadWindow(c);
    void settings.theme;

    expect(() => reportUnconfiguredReads('throw', b)).not.toThrow();
    expect(thrownBy(() => reportUnconfiguredReads('throw', c))).toMatch(
      /Settings\.theme was read 3 times[\s\S]*while 3 concurrent tests were in flight \("a", "b", "c"\)/,
    );
  });

  it('drops a window whose test finished without reporting, with the reads only it could claim', () => {
    const settings = strictSettings();
    const stale = concurrentContext('stale');

    openReadWindow(stale);
    void settings.theme;
    Object.assign(stale.task, { result: { state: 'fail', duration: 1 } });

    const next = concurrentContext('next');

    openReadWindow(next);
    void settings.locale;

    expect(thrownBy(() => reportUnconfiguredReads('throw', next))).toMatch(
      /^Error: \[vitest-auto-spy\] Settings\.locale was read 1 time[^\n]*\n[^\n]*\nDocs/,
    );
  });

  it('starts a retried test from its own reads, not its earlier attempt', () => {
    const settings = strictSettings();
    const retried = concurrentContext('retried');

    openReadWindow(retried);
    void settings.theme;
    openReadWindow(retried);
    void settings.locale;

    expect(thrownBy(() => reportUnconfiguredReads('throw', retried))).not.toContain('theme');
  });

  it('lets a concurrent test step past a window that could not overlap it', () => {
    const settings = strictSettings();

    openReadWindow({ task: null });
    void settings.theme;
    openReadWindow({ task: { name: 'sequential', concurrent: false } });
    void settings.locale;

    const alone = concurrentContext('alone');

    openReadWindow(alone);

    expect(() => reportUnconfiguredReads('throw', alone)).not.toThrow();
  });
});
