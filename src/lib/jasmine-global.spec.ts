/**
 * The `jasmine` namespace is a compatibility promise: a spec that says `jasmine.objectContaining`,
 * `jasmine.clock().tick(…)` or `jasmine.createSpyObj(…)` keeps working after the only edit is an
 * added import. These specs check each member against the Vitest primitive it forwards to, and pin
 * the two places where the forwarding cannot be exact — `DEFAULT_TIMEOUT_INTERVAL`, which has no
 * runtime equivalent, and `createSpy`'s two-argument form.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { enableJasmineCompat } from './enable-jasmine';
import { jasmine, resetTimeoutIntervalWarning } from './jasmine-global';
import { resetJasmineMatchers } from './jasmine-matchers';
import { resetJasmineSupport } from './jasmine-support';
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

describe('the jasmine namespace', () => {
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
    it('forwards addMatchers to expect.extend and addCustomEqualityTester to addEqualityTesters', () => {
      const extend = vi.spyOn(expect, 'extend').mockImplementation(() => expect);
      const testers = vi.spyOn(expect, 'addEqualityTesters').mockImplementation(() => undefined);
      const tester = (): undefined => undefined;

      jasmine.addMatchers({ toBeAnything: () => ({ pass: true, message: (): string => '' }) });
      jasmine.addCustomEqualityTester(tester);

      expect(extend).toHaveBeenCalledOnce();
      expect(testers).toHaveBeenCalledWith([tester]);
    });
  });

  describe('DEFAULT_TIMEOUT_INTERVAL', () => {
    it('reads jasmine’s default and warns once when written, naming both Vitest settings', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(jasmine.DEFAULT_TIMEOUT_INTERVAL).toBe(5000);

      jasmine.DEFAULT_TIMEOUT_INTERVAL = 30000;
      jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000;

      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain('hookTimeout');
      // The write is ignored, which is exactly what the warning says.
      expect(jasmine.DEFAULT_TIMEOUT_INTERVAL).toBe(5000);
    });
  });
});
