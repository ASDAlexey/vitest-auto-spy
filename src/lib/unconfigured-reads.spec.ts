/**
 * A strict double's getter nobody configured answers `undefined`, and its observable property nobody
 * fed never emits. What is pinned here is which of those reach the report, which count as configured,
 * and that a stream fed after the subscription is not a finding.
 */
import { type Observable, of } from 'rxjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../index';
import '../rxjs';
import { createAutoMock } from './auto-mock';
import { createSpyFromClass } from './create-spy-from-class';
import { createSpyFromInstance, restoreSpiedInstance } from './create-spy-from-instance';
import { setDefaultStrictMode } from './function-spy';
import { mockReadonlyProp, restoreMockedProps } from './prop-mock';
import { setupAutoSpy } from './setup-auto-spy';
import { clearAutoSpyDefaults, registerAutoSpyDefaults } from './spy-defaults';
import type { Spy, UnstubbedRead } from './types';
import { openReadWindow, reportUnconfiguredReads, resolveReadGuard, setUnconfiguredReadsDefault } from './unconfigured-reads';

class Settings {
  get theme(): string {
    return 'light';
  }

  set theme(_value: string) {
    /* real */
  }

  get locale(): string {
    return 'en';
  }

  load(): number {
    return 1;
  }
}

class Feed {
  items$: Observable<number> = of(1);

  refresh(): void {
    /* real */
  }
}

const strictSettings = (): Spy<Settings> => createSpyFromClass(Settings, { strict: true, gettersToSpyOn: ['theme', 'locale'] });

const strictFeed = (): Spy<Feed> => createSpyFromClass(Feed, { strict: true, observablePropsToSpyOn: ['items$'] });

/**
 * The one block in this file that arms the report through `setupAutoSpy`, and first on purpose: the
 * grade is set while the file is collected and released in this block's `afterAll`.
 */
describe('setupAutoSpy({ unconfiguredReads })', () => {
  // Kept in an array: the runner may clear a spy's calls between tests, and the report lands after one.
  const warnings: unknown[] = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation((message) => void warnings.push(message));

  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, unconfiguredReads: 'warn' });

  afterAll(() => {
    warn.mockRestore();
  });

  describe("with a read in the spec's own hook", () => {
    let settings: Spy<Settings>;

    beforeEach(() => {
      settings = strictSettings();
      // Inside the counted window: a spec's own hook is where most suites run the code under test.
      void settings.theme;
    });

    it('and two more in the test body', () => {
      expect(settings.theme).toBeUndefined();
      expect(settings.theme).toBeUndefined();
    });
  });

  it('reported the three reads together once that test ended', () => {
    expect(warnings).toEqual([
      expect.stringContaining('[vitest-auto-spy] Settings.theme was read 3 times and nothing configured it, and strict mode is on.'),
    ]);
    warnings.length = 0;
  });

  it('lets a test subscribe to a stream and feed it afterwards', () => {
    const feed = strictFeed();
    const seen: number[] = [];

    feed.items$.subscribe((value) => seen.push(value));
    feed.items$.nextWith(7);

    expect(seen).toEqual([7]);
  });

  it('and does not report that stream', () => {
    expect(warnings).toEqual([]);
  });
});

describe('after the block that armed it', () => {
  it('finds the report released, so a strict double tracks nothing', () => {
    expect(resolveReadGuard('Settings', { strict: true })).toBeUndefined();
  });
});

/** The report armed by hand, with a test window open around every test. */
function armForEachTest(): void {
  beforeEach(() => {
    setUnconfiguredReadsDefault(true, undefined);
    openReadWindow();
  });

  afterEach(() => {
    reportUnconfiguredReads('off');
    setUnconfiguredReadsDefault(false, undefined);
    setDefaultStrictMode(undefined);
    restoreMockedProps();
    clearAutoSpyDefaults(Settings);
  });
}

describe('an unconfigured getter', () => {
  armForEachTest();

  it('is reported with the class, the member and the count', () => {
    const settings = strictSettings();

    void settings.theme;
    void settings.theme;
    void settings.locale;

    expect(() => reportUnconfiguredReads('throw')).toThrow(
      new RegExp(
        String.raw`Settings\.theme was read 2 times and nothing configured it, and strict mode is on\.\n` +
          String.raw`\[vitest-auto-spy\] Settings\.locale was read 1 time[\s\S]*mockReturnValue\(undefined\)[\s\S]*Docs: .*#reads-nobody-configured`,
      ),
    );
  });

  it('answers undefined without throwing, so a formatter can read it', () => {
    expect(strictSettings().theme).toBeUndefined();
  });

  it.each([
    ['mockReturnValue', (settings: Spy<Settings>): unknown => settings.accessorSpies.getters.theme.mockReturnValue('dark')],
    ['mockImplementation', (settings: Spy<Settings>): unknown => settings.accessorSpies.getters.theme.mockImplementation(() => 'dark')],
    ['mockReadonlyProp', (settings: Spy<Settings>): unknown => mockReadonlyProp(settings, 'theme', 'dark')],
  ])('is configured by %s', (_name, configure) => {
    const settings = createSpyFromClass(Settings, { strict: true, gettersToSpyOn: ['theme'] });

    configure(settings);

    expect(settings.theme).toBe('dark');
    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
  });

  it('is configured by overrides', () => {
    const settings = createSpyFromClass(Settings, { strict: true, gettersToSpyOn: ['theme'], overrides: { theme: 'dark' } });

    expect(settings.theme).toBe('dark');
    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
  });

  it('is configured by a registered seed, and not by a registered list alone', () => {
    registerAutoSpyDefaults(Settings, { gettersToSpyOn: ['theme', 'locale'], overrides: { theme: 'dark' } });

    const settings = createSpyFromClass(Settings, { strict: true });

    expect(settings.theme).toBe('dark');
    expect(settings.locale).toBeUndefined();
    expect(() => reportUnconfiguredReads('throw')).toThrow(/^\[vitest-auto-spy\] Settings\.locale was read 1 time/);
  });

  it('counts the read after a mockReturnValueOnce ran out, and the read after a mockReset', () => {
    const settings = strictSettings();

    settings.accessorSpies.getters.theme.mockReturnValueOnce('dark');
    void settings.theme;
    void settings.theme;
    settings.accessorSpies.getters.locale.mockReturnValue('ru');
    settings.accessorSpies.getters.locale.mockReset();
    void settings.locale;

    expect(() => reportUnconfiguredReads('throw')).toThrow(/theme was read 1 time[\s\S]*locale was read 1 time/);
  });

  it('is counted only while a test window is open', () => {
    const settings = strictSettings();

    reportUnconfiguredReads('throw');
    void settings.theme;
    openReadWindow();

    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
  });

  it('is not tracked on a double that is not strict', () => {
    void createSpyFromClass(Settings, { gettersToSpyOn: ['theme'] }).theme;

    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
  });

  it('is tracked on a double a suite-wide strict reaches, and not on one that opted out of it', () => {
    setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });

    void createSpyFromClass(Settings, { gettersToSpyOn: ['theme'] }).theme;
    void createSpyFromClass(Settings, { strict: false, gettersToSpyOn: ['locale'] }).locale;

    expect(() => reportUnconfiguredReads('throw')).toThrow(/Settings\.theme was read 1 time[^\n]*\.\nThe getter/);
  });

  it('is not tracked without the report, strict or not', () => {
    setUnconfiguredReadsDefault(false, undefined);

    void strictSettings().theme;

    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
  });

  it('prints under warn, and says nothing under off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    void strictSettings().theme;
    reportUnconfiguredReads('warn');
    openReadWindow();
    void strictSettings().theme;
    reportUnconfiguredReads('off');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Settings.theme was read 1 time'));
    warn.mockRestore();
  });

  it('is tracked on an instance spied in place', () => {
    const instance = new Settings();
    const spy = createSpyFromInstance(instance, { strict: true, gettersToSpyOn: ['locale'] });

    void spy.locale;

    expect(() => reportUnconfiguredReads('throw')).toThrow(/Settings\.locale was read 1 time/);
    restoreSpiedInstance(instance);
  });
});

describe('an observable property nobody fed', () => {
  armForEachTest();

  it('is reported per subscription', () => {
    const feed = strictFeed();

    feed.items$.subscribe();
    feed.items$.subscribe();

    expect(() => reportUnconfiguredReads('throw')).toThrow(
      /Feed\.items\$ was subscribed to 2 times and nothing fed it, and strict mode is on\./,
    );
  });

  it.each([
    ['nextWith', (feed: Spy<Feed>): unknown => feed.items$.nextWith(1)],
    ['returnSubject', (feed: Spy<Feed>): unknown => feed.items$.returnSubject()],
    ['complete', (feed: Spy<Feed>): unknown => feed.items$.complete()],
    ['throwWith', (feed: Spy<Feed>): unknown => feed.items$.throwWith(new Error('down'))],
  ])('is fed by %s, before the subscription or after it', (_name, feedIt) => {
    const early = strictFeed();
    const late = strictFeed();

    feedIt(early);
    early.items$.subscribe({ error: () => undefined });
    late.items$.subscribe({ error: () => undefined });
    feedIt(late);

    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
  });

  it('is not fed by an empty list of values', () => {
    const feed = strictFeed();

    feed.items$.nextWithValues([]);
    feed.items$.subscribe();

    expect(() => reportUnconfiguredReads('throw')).toThrow(/Feed\.items\$ was subscribed to 1 time/);
  });

  it('is named by the token on a type-driven double, and by the member alone without a name', () => {
    createAutoMock<Feed>(undefined, { strict: true, name: 'FEED', observablePropsToSpyOn: ['items$'] }).items$.subscribe();
    createAutoMock<Feed>(undefined, { strict: true, observablePropsToSpyOn: ['items$'] }).items$.subscribe();

    expect(() => reportUnconfiguredReads('throw')).toThrow(
      /FEED\.items\$ was subscribed to 1 time[^\n]*\n\[vitest-auto-spy\] items\$ was subscribed/,
    );
  });

  it('is not a spy at all once overrides seeds a real stream', () => {
    const seeded = createAutoMock<Feed>({ items$: of(3) }, { strict: true, observablePropsToSpyOn: ['items$'] });

    seeded.items$.subscribe();

    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
  });

  it('is tracked on an instance spied in place', () => {
    const instance = new Feed();

    createSpyFromInstance(instance, { strict: true, observablePropsToSpyOn: ['items$'] }).items$.subscribe();

    expect(() => reportUnconfiguredReads('throw')).toThrow(/Feed\.items\$ was subscribed to 1 time/);
    restoreSpiedInstance(instance);
  });
});

describe('onUnstubbedRead', () => {
  armForEachTest();

  it("takes the double's own findings instead of the report, after the test", () => {
    const reads: UnstubbedRead[] = [];
    const feed = createSpyFromClass(Feed, { observablePropsToSpyOn: ['items$'], onUnstubbedRead: (read) => reads.push(read) });
    const settings = createSpyFromClass(Settings, {
      strict: false,
      gettersToSpyOn: ['theme'],
      onUnstubbedRead: (read) => reads.push(read),
    });

    feed.items$.subscribe();
    void settings.theme;
    void settings.theme;

    expect(reads).toEqual([]);
    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
    expect(reads).toEqual([
      { className: 'Feed', member: 'items$', kind: 'observable', count: 1 },
      { className: 'Settings', member: 'theme', kind: 'getter', count: 2 },
    ]);
  });

  it('is called under off as well, since the grade is for the report', () => {
    const handler = vi.fn();

    void createSpyFromClass(Settings, { gettersToSpyOn: ['theme'], onUnstubbedRead: handler }).theme;
    reportUnconfiguredReads('off');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('suite-wide, takes every double that did not opt out — strict or not — ahead of the report', () => {
    const handler = vi.fn();

    setUnconfiguredReadsDefault(true, handler);

    void createSpyFromClass(Settings, { gettersToSpyOn: ['theme'] }).theme;
    void strictSettings().locale;
    void createSpyFromClass(Settings, { strict: false, gettersToSpyOn: ['theme'] }).theme;

    expect(() => reportUnconfiguredReads('throw')).not.toThrow();
    expect(handler.mock.calls).toEqual([
      [{ className: 'Settings', member: 'theme', kind: 'getter', count: 1 }],
      [{ className: 'Settings', member: 'locale', kind: 'getter', count: 1 }],
    ]);
  });

  it('is only called for what a test window saw', () => {
    const handler = vi.fn();
    const settings = createSpyFromClass(Settings, { gettersToSpyOn: ['theme'], onUnstubbedRead: handler });

    reportUnconfiguredReads('off');
    void settings.theme;
    reportUnconfiguredReads('off');

    expect(handler).not.toHaveBeenCalled();
  });
});
