/**
 * The `jasmine` namespace is a compatibility promise: a spec that says `jasmine.objectContaining`,
 * `jasmine.clock().tick(…)` or `jasmine.createSpyObj(…)` keeps working after the only edit is an
 * added import. These specs check each member against the Vitest primitive it forwards to, and pin
 * the two places where the forwarding cannot be exact — `DEFAULT_TIMEOUT_INTERVAL`, which has no
 * runtime equivalent, and `createSpy`'s two-argument form.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useConsoleSpies } from '../console';
import { enableJasmineCompat } from './enable-jasmine';
import type { JasmineCustomMatcherFactory } from './jasmine-custom-matchers';
import { jasmine, resetTimeoutIntervalWarning } from './jasmine-global';
import { resetJasmineMatchers } from './jasmine-matchers';
import { resetJasmineSupport } from './jasmine-support';
import { setMisconfigurationReaction } from './misconfiguration';
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

/** The write under test: jasmine's setter warns, or throws, and keeps the value it had. */
function writeTimeoutInterval(value: number): void {
  // eslint-disable-next-line vitest-auto-spy/no-hand-assigned-global -- the setter's reaction to this write is what the tests assert
  jasmine.DEFAULT_TIMEOUT_INTERVAL = value;
}

describe('the jasmine namespace', () => {
  const { consoleWarnSpy } = useConsoleSpies();

  beforeAll(() => {
    registerMockAdapter(vitestMockAdapter);
    enableJasmineCompat();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    resetJasmineSupport();
    resetJasmineMatchers();
    resetTimeoutIntervalWarning();
  });

  describe('matchers with an expect.* twin', () => {
    it('forwards each one verbatim', () => {
      expect({ id: 1, name: 'a', tags: ['x'], note: 'hello', other: 2 }).toEqual({
        id: jasmine.any(Number),
        name: jasmine.stringContaining('a'),
        tags: jasmine.arrayContaining(['x']),
        note: jasmine.stringMatching(/^hell/),
        other: jasmine.anything(),
      });
      expect({ id: 1, extra: true }).toEqual(jasmine.objectContaining({ id: 1 }));
    });
  });

  describe('clock()', () => {
    it('installs, ticks, mocks the date and uninstalls', () => {
      jasmine.clock().install();

      const ran = vi.fn();
      setTimeout(ran, 100);

      jasmine.clock().tick(99);
      expect(ran).not.toHaveBeenCalled();

      jasmine.clock().tick(1);
      expect(ran).toHaveBeenCalledOnce();

      jasmine.clock().mockDate(new Date('2020-01-01T00:00:00.000Z'));
      expect(new Date().toISOString()).toBe('2020-01-01T00:00:00.000Z');

      jasmine.clock().uninstall();
    });

    it('leaves Date real, as jasmine does, until mockDate asks for it', () => {
      jasmine.clock().install();

      const before = Date.now();

      jasmine.clock().tick(10_000);

      // jasmine's install() replaces the schedulers only, so a spec measuring elapsed time or a TTL
      // keeps reading the wall clock; ticking the timers must not move it.
      expect(Date.now() - before).toBeLessThan(10_000);

      jasmine.clock().mockDate(new Date('2020-01-01T00:00:00.000Z'));

      expect(new Date().toISOString()).toBe('2020-01-01T00:00:00.000Z');

      jasmine.clock().uninstall();
    });

    it('says so when taking Date over drops callbacks that were already scheduled', () => {
      jasmine.clock().install();
      setTimeout(() => undefined, 100);
      jasmine.clock().mockDate(new Date('2020-01-01T00:00:00.000Z'));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/took Date over after \d+ callbacks? had already been scheduled[\s\S]*#clock-install-leaves-date-real$/),
      );

      jasmine.clock().uninstall();
    });

    it('counts the dropped callbacks', () => {
      jasmine.clock().install();
      setTimeout(() => undefined, 100);
      setTimeout(() => undefined, 200);
      jasmine.clock().mockDate(new Date('2020-01-01T00:00:00.000Z'));

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('took Date over after 2 callbacks had already been scheduled'));
      jasmine.clock().uninstall();
    });

    it('mocks the date on its own, with no clock installed at all, warning once where jasmine would throw', () => {
      resetTimeoutIntervalWarning();
      jasmine.clock().mockDate(new Date('2021-02-03T00:00:00.000Z'));

      expect(new Date().toISOString()).toBe('2021-02-03T00:00:00.000Z');
      expect(vi.isFakeTimers()).toBe(false);

      vi.useRealTimers();
      jasmine.clock().mockDate(new Date('2021-02-04T00:00:00.000Z'));
      vi.useRealTimers();

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /mockDate\(\) ran with no clock installed[\s\S]*will throw in the next major[\s\S]*#clock-install-leaves-date-real$/,
        ),
      );
    });

    it('fails at the call under the throw grade, every time', () => {
      setMisconfigurationReaction('throw');

      try {
        expect(() => jasmine.clock().mockDate()).toThrow(/ran with no clock installed/);
        expect(() => jasmine.clock().mockDate()).toThrow(/ran with no clock installed/);
      } finally {
        setMisconfigurationReaction(undefined);
      }
    });

    it('stays quiet when a clock is installed', () => {
      resetTimeoutIntervalWarning();
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date('2021-02-03T00:00:00.000Z'));
      jasmine.clock().uninstall();

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('defaults mockDate to now, and returns the same handle from install so a call can be chained', () => {
      expect(jasmine.clock().install()).toBe(jasmine.clock());

      jasmine.clock().mockDate();
      expect(new Date().getTime()).toBeTypeOf('number');

      jasmine.clock().uninstall();
    });

    it('withMock installs for the body and uninstalls even when the body throws', () => {
      let insideWasFake = false;

      jasmine.clock().withMock(() => {
        insideWasFake = vi.isFakeTimers();
      });

      expect(insideWasFake).toBe(true);
      expect(vi.isFakeTimers()).toBe(false);

      expect(() =>
        jasmine.clock().withMock(() => {
          throw new Error('inside');
        }),
      ).toThrow('inside');
      expect(vi.isFakeTimers()).toBe(false);
    });
  });

  describe('createSpy', () => {
    it('stubs by default and reports the name it was given', () => {
      const spy = jasmine.createSpy('load');

      expect(spy(1)).toBeUndefined();
      expect(spy).toHaveBeenCalledWith(1);
    });

    it('falls back to a placeholder name when none is given', () => {
      expect(jasmine.createSpy().getMockName()).toBe('unknown');
    });

    it('routes callThrough to the original when one is given, and still stubs until then', () => {
      const original = (value: number): number => value * 2;
      const spy = jasmine.createSpy('double', original);

      expect(spy(3)).toBeUndefined();

      spy.and.callThrough();
      expect(spy(3)).toBe(6);
    });
  });

  describe('createSpy without the namespaces installed', () => {
    it('still builds a spy, and simply has no .and to route callThrough through', () => {
      resetJasmineSupport();

      const spy = jasmine.createSpy('double', (value: number) => value * 2);

      expect(spy(3)).toBeUndefined();
      expect((spy as unknown as { and?: unknown }).and).toBeUndefined();

      enableJasmineCompat();
    });
  });

  describe('createSpyObj', () => {
    it('is the same factory the entry exports', () => {
      const store = jasmine.createSpyObj('store', ['load']);

      expect(typeof store.load).toBe('function');
    });
  });

  describe('matcher registration', () => {
    it('registers addMatchers through expect.extend and addCustomEqualityTester through addEqualityTesters', () => {
      const extend = vi.spyOn(expect, 'extend').mockImplementation(() => expect);
      const testers = vi.spyOn(expect, 'addEqualityTesters').mockImplementation(() => undefined);
      const tester = (): undefined => undefined;

      jasmine.addMatchers({ toBeAnything: () => ({ compare: () => ({ pass: true }) }) });
      jasmine.addCustomEqualityTester(tester);

      expect(extend).toHaveBeenCalledWith({ toBeAnything: expect.any(Function) });
      expect(testers).toHaveBeenCalledWith([tester]);
    });
  });

  describe('addMatchers with jasmine-shaped matchers', () => {
    beforeAll(() => {
      jasmine.addMatchers({
        toBeJasmineFoo: () => ({
          compare: (actual: unknown) => ({ pass: actual === 'foo', message: `expected ${String(actual)} to be foo` }),
        }),
        toEqualJasmineWithDefault: (util) => ({
          compare: (actual: unknown, expected: unknown) => ({ pass: util.equals(actual, expected) }),
        }),
        toHaveJasmineLazyMessage: () => ({
          compare: () => ({ pass: false, message: (): string => 'lazy message' }),
        }),
        toBeJasmineEven: () => ({
          compare: (actual: number) => ({ pass: actual % 2 === 0, message: 'odd' }),
          negativeCompare: (actual: number) => ({ pass: actual % 2 !== 0, message: 'even, from negativeCompare' }),
        }),
        toContainJasmine: (util) => ({
          compare: (actual: unknown, needle: unknown) => ({ pass: util.contains(actual, needle) }),
        }),
        toEqualJasmineLoosely: (util, customEqualityTesters) => ({
          compare: (actual: unknown, expected: unknown) => ({
            pass: Array.isArray(customEqualityTesters) && util.equals(actual, expected, [() => true]),
          }),
        }),
      });
      jasmine.addMatchers({
        toBeJasmineVitestShaped(received: unknown) {
          return { pass: received === 1, message: (): string => 'vitest-shaped' };
        },
      });
    });

    interface CustomAssertions {
      toBeJasmineFoo(): void;
      toEqualJasmineWithDefault(expected: unknown): void;
      toHaveJasmineLazyMessage(): void;
      toBeJasmineEven(): void;
      toContainJasmine(needle: unknown): void;
      toEqualJasmineLoosely(expected: unknown): void;
      toBeJasmineVitestShaped(): void;
    }

    function assert(value: unknown, negated = false): CustomAssertions {
      const assertion = expect(value);

      return (negated ? assertion.not : assertion) as unknown as CustomAssertions;
    }

    it('runs compare and reports its string message', () => {
      assert('foo').toBeJasmineFoo();

      expect(() => assert('bar').toBeJasmineFoo()).toThrow('expected bar to be foo');
    });

    it('reads a message function, and builds jasmine’s default message when there is none', () => {
      expect(() => assert(1).toHaveJasmineLazyMessage()).toThrow('lazy message');
      assert({ id: 1 }).toEqualJasmineWithDefault({ id: 1 });

      expect(() => assert('bar').toEqualJasmineWithDefault('foo')).toThrow('Expected "bar" to equal jasmine with default "foo".');
      expect(() => assert('foo', true).toEqualJasmineWithDefault('foo')).toThrow('Expected "foo" not to equal jasmine with default "foo".');
    });

    it('negates compare under .not when there is no negativeCompare', () => {
      assert('bar', true).toBeJasmineFoo();

      expect(() => assert('foo', true).toBeJasmineFoo()).toThrow('expected foo to be foo');
    });

    it('runs negativeCompare under .not when the matcher has one', () => {
      assert(3, true).toBeJasmineEven();

      expect(() => assert(4, true).toBeJasmineEven()).toThrow('even, from negativeCompare');
      expect(() => assert(3).toBeJasmineEven()).toThrow('odd');
    });

    it('hands the factory a matchersUtil whose contains reads arrays, sets and strings', () => {
      assert([{ id: 1 }]).toContainJasmine({ id: 1 });
      assert(new Set([2])).toContainJasmine(2);
      assert('haystack').toContainJasmine('st');
      assert(42, true).toContainJasmine(4);
      assert('haystack', true).toContainJasmine(1);
    });

    it('lets matchersUtil.equals take the custom testers a matcher passes it', () => {
      assert(1).toEqualJasmineLoosely(2);
    });

    it('hands back what a factory returns once it stops building a jasmine matcher', () => {
      let calls = 0;

      jasmine.addMatchers({
        // A factory on its first call and a Vitest matcher afterwards: no real matcher does this.
        toBeJasmineFickle: ((): unknown => {
          calls += 1;

          return calls === 1 ? { compare: () => ({ pass: false }) } : { pass: true, message: (): string => '' };
        }) as JasmineCustomMatcherFactory,
      });

      (expect(1) as unknown as { toBeJasmineFickle(): void }).toBeJasmineFickle();
    });

    it('passes a matcher already in Vitest’s shape through unchanged', () => {
      assert(1).toBeJasmineVitestShaped();
      assert(1).toBeJasmineVitestShaped();

      expect(() => assert(2).toBeJasmineVitestShaped()).toThrow('vitest-shaped');
    });
  });

  // The second test runs with the warning latch the first one tripped.
  describe('DEFAULT_TIMEOUT_INTERVAL', { shuffle: false }, () => {
    it('reads jasmine’s default and warns once when written, naming both Vitest settings', () => {
      expect(jasmine.DEFAULT_TIMEOUT_INTERVAL).toBe(5000);

      writeTimeoutInterval(30000);
      writeTimeoutInterval(40000);

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain(
        'jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000 has no runtime equivalent under Vitest and was ignored: Vitest reads its timeouts from config, once. Set `test.testTimeout: 30000` and `test.hookTimeout: 30000`',
      );
      // The write is ignored, which is exactly what the warning says.
      expect(jasmine.DEFAULT_TIMEOUT_INTERVAL).toBe(5000);
    });

    it('fails every write under misconfiguration: throw, the latch notwithstanding', () => {
      // The test above has already tripped the latch the printed grade stops at.
      writeTimeoutInterval(30000);
      globalThis.__vitestAutoSpyMisconfiguration__ = 'throw';

      try {
        expect(() => writeTimeoutInterval(40000)).toThrow(/has no runtime equivalent/);
      } finally {
        globalThis.__vitestAutoSpyMisconfiguration__ = undefined;
      }

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });
});
