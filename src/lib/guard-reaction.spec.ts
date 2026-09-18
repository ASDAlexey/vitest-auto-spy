/**
 * The channel every `'warn'` grade writes through.
 *
 * It exists because `strayConsole` watches `console.warn`, which is where the library's own reports
 * went: a suite running both failed on the advice it had just been given, quoted three truncated
 * lines of it, and pointed at a frame inside `dist/`. The guard's wrapper is stepped over; anything
 * else on the console — a spy the test installed — is not.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { libraryWarn, reactToFindings } from './guard-reaction';

/** A stand-in for the stray-console guard, in the shape `libraryWarn` reads. */
function armedGuard(sentinel: unknown, original: unknown): void {
  Reflect.set(globalThis, '__vitestAutoSpyStrayConsole__', {
    host: console,
    originals: new Map([['warn', original]]),
    sentinels: new Map([['warn', sentinel]]),
  });
}

describe('libraryWarn', () => {
  const real = console.warn;

  afterEach(() => {
    Reflect.set(globalThis, '__vitestAutoSpyStrayConsole__', undefined);
    console.warn = real;
  });

  it('writes to console.warn where nothing is guarding it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    libraryWarn('[vitest-auto-spy] a finding');

    expect(warn).toHaveBeenCalledWith('[vitest-auto-spy] a finding');
    warn.mockRestore();
  });

  it('steps over the stray-console wrapper, so its own report is not stray output', () => {
    const absorbed: string[] = [];
    const original = (message: string): void => {
      absorbed.push(message);
    };
    const sentinel = (): void => {
      absorbed.push('recorded as stray');
    };

    console.warn = sentinel;
    armedGuard(sentinel, original);

    libraryWarn('[vitest-auto-spy] a finding');

    expect(absorbed).toEqual(['[vitest-auto-spy] a finding']);
  });

  it('lets a spy the test installed over the wrapper absorb it, as it absorbs any other output', () => {
    const sentinel = (): void => undefined;

    armedGuard(sentinel, () => undefined);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    libraryWarn('[vitest-auto-spy] a finding');

    expect(warn).toHaveBeenCalledWith('[vitest-auto-spy] a finding');
    warn.mockRestore();
  });

  it('falls back to the console where the guard kept no original', () => {
    const sentinel = (): void => undefined;

    console.warn = sentinel;
    armedGuard(sentinel, undefined);

    const written: string[] = [];

    console.warn = (message: string): void => {
      written.push(message);
    };

    libraryWarn('[vitest-auto-spy] a finding');

    expect(written).toEqual(['[vitest-auto-spy] a finding']);
  });
});

describe('reactToFindings', () => {
  it('says nothing when nothing was found, throws them joined, or prints them', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    reactToFindings([], 'throw');
    expect(warn).not.toHaveBeenCalled();

    expect(() => reactToFindings(['first', 'second'], 'throw')).toThrow('first\nsecond');

    reactToFindings(['first'], 'warn');
    expect(warn).toHaveBeenCalledWith('first');
    warn.mockRestore();
  });
});
