/**
 * A token's registration is only worth having if `provideAutoSpyForToken` reads it the way
 * `provideAutoSpy` reads a class's: the call site stays additive over it, and `returns` stays a
 * default the spec can still build on. The registry is process-wide, so every test clears it.
 */
import { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Observable, firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import '../angular';
import '../rxjs';
import { injectSpy, provideAutoSpy, provideAutoSpyForToken } from './angular';
import { clearAutoSpyDefaults, registerAutoSpyDefaults } from './angular-spy-defaults';
import { takeStrictViolations } from './function-spy';

interface ChannelLogger {
  info(message: string): void;
}

interface AppLogger {
  level: string;
  info(message: string): void;
  err(message: string): void;
  channel(name: string): ChannelLogger;
}

interface Navigation {
  activeRow$: Observable<number>;
  setFocus(id: string): void;
  focused(): string | undefined;
}

const LOGGER = new InjectionToken<AppLogger>('LOGGER');
const NAVIGATION = new InjectionToken<Navigation>('NAVIGATION');

class RouterLike {
  navigate(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

afterEach(() => {
  clearAutoSpyDefaults();
  takeStrictViolations();
});

function logger(overrides?: Partial<AppLogger>, config?: Parameters<typeof provideAutoSpyForToken<AppLogger>>[2]): AppLogger {
  TestBed.configureTestingModule({ providers: [provideAutoSpyForToken<AppLogger>(LOGGER, overrides, config)] });

  return TestBed.inject(LOGGER);
}

describe('registerAutoSpyDefaults with an InjectionToken', () => {
  it('composes the token double from the registration alone', () => {
    registerAutoSpyDefaults(LOGGER, {
      strict: true,
      returns: { info: undefined },
      selfReturning: ['channel'],
      overrides: { level: 'debug' },
    });

    const log = logger();

    log.channel('auth').info('signed in');

    expect(log.level).toBe('debug');
    expect(injectSpy(LOGGER).info).toHaveBeenCalledWith('signed in');
    expect(() => log.err('boom')).toThrow('Nothing configured InjectionToken LOGGER.err, and strict mode is on.');
    expect(takeStrictViolations()).toHaveLength(1);
  });

  it('merges the call site over the registration: lists unioned, seeds and returns key by key', async () => {
    registerAutoSpyDefaults(NAVIGATION, { observablePropsToSpyOn: ['activeRow$'], returns: { setFocus: undefined, focused: 'a' } });

    TestBed.configureTestingModule({
      providers: [provideAutoSpyForToken(NAVIGATION, undefined, { strict: true, returns: { focused: 'b' } })],
    });

    const navigation = injectSpy(NAVIGATION);

    navigation.activeRow$.nextWith(3);

    await expect(firstValueFrom(navigation.activeRow$)).resolves.toBe(3);
    expect(navigation.setFocus('x')).toBeUndefined();
    expect(navigation.focused()).toBe('b');
  });

  it('merges a seed argument key by key over the registered seeds', () => {
    const rows = of(1);

    registerAutoSpyDefaults(NAVIGATION, { overrides: { activeRow$: of(0) } });
    registerAutoSpyDefaults(LOGGER, { overrides: { level: 'debug' } });

    TestBed.configureTestingModule({
      providers: [provideAutoSpyForToken(NAVIGATION, { activeRow$: rows }), provideAutoSpyForToken(LOGGER, undefined, { name: 'app log' })],
    });

    expect(TestBed.inject(NAVIGATION).activeRow$).toBe(rows);
    expect(TestBed.inject(LOGGER).level).toBe('debug');
  });

  it('keeps a registered return value a default that a later calledWith wins over', () => {
    registerAutoSpyDefaults(NAVIGATION, { returns: { focused: 'default' } });

    TestBed.configureTestingModule({ providers: [provideAutoSpyForToken(NAVIGATION)] });

    const navigation = injectSpy(NAVIGATION);

    navigation.focused.calledWith().mockReturnValue('configured');

    expect(navigation.focused()).toBe('configured');
  });

  it('lets the call site take a registered link out of the chain through returns', () => {
    const channel = { info: (): void => undefined };

    registerAutoSpyDefaults(LOGGER, { selfReturning: ['channel'] });

    expect(logger(undefined, { returns: { channel } }).channel('auth')).toBe(channel);
  });

  it('names the double in a strict report by a registered name rather than the token description', () => {
    registerAutoSpyDefaults(LOGGER, { strict: true, name: 'registered log' });

    expect(() => logger().err('boom')).toThrow('Nothing configured registered log.err');
    expect(takeStrictViolations()).toHaveLength(1);
  });

  it('replaces a second registration for the same token rather than merging it', () => {
    registerAutoSpyDefaults(LOGGER, { overrides: { level: 'debug' } });
    registerAutoSpyDefaults(LOGGER, { selfReturning: ['channel'] });

    const log = logger();

    expect(log.channel('auth')).toBe(log);
    expect(typeof log.level).toBe('function');
  });

  it('takes class rows and token rows in one table, over the registry provideAutoSpy reads too', async () => {
    registerAutoSpyDefaults([
      [RouterLike, { returns: { navigate: Promise.resolve(true) } }],
      [LOGGER, { selfReturning: ['channel'] }],
    ]);

    TestBed.configureTestingModule({ providers: [provideAutoSpy(RouterLike, { strict: true }), provideAutoSpyForToken(LOGGER)] });

    const log = TestBed.inject(LOGGER);

    await expect(TestBed.inject(RouterLike).navigate()).resolves.toBe(true);
    expect(log.channel('auth')).toBe(log);
  });

  it('drops one token, leaving the others, or the lot', () => {
    registerAutoSpyDefaults(LOGGER, { overrides: { level: 'debug' } });
    registerAutoSpyDefaults(RouterLike, { strict: true });

    clearAutoSpyDefaults(LOGGER);

    expect(typeof logger().level).toBe('function');
    expect(() => provideAutoSpy(RouterLike).useValue.navigate()).toThrow('Nothing configured RouterLike.navigate');
    expect(takeStrictViolations()).toHaveLength(1);

    clearAutoSpyDefaults();

    expect(provideAutoSpy(RouterLike).useValue.navigate()).toBeUndefined();
  });
});
