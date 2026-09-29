/**
 * The channel every `'warn'` grade writes through.
 *
 * It exists because `strayConsole` watches `console.warn`, which is where the library's own reports
 * went: a suite running both failed on the advice it had just been given, quoted three truncated
 * lines of it, and pointed at a frame inside `dist/`. The guard's wrapper is stepped over; anything
 * else on the console — a spy the test installed — is not.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { useConsoleSpies } from './console-spy';
import { libraryWarn, reactToFindings } from './guard-reaction';
import { registerMockAdapter } from './mock-adapter';
import { mockValueProp } from './prop-mock';
import { vitestMockAdapter } from './vitest-adapter';

// At load, not in `beforeAll`: `useConsoleSpies()` builds its spies while the describes are collected.
registerMockAdapter(vitestMockAdapter);

/** A stand-in for the stray-console guard, in the shape `libraryWarn` reads. */
function armedGuard(sentinel: unknown, original: unknown): void {
  Reflect.set(globalThis, '__vitestAutoSpyStrayConsole__', {
    host: console,
    originals: new Map([['warn', original]]),
    sentinels: new Map([['warn', sentinel]]),
  });
}

describe('libraryWarn', () => {
  const { consoleWarnSpy } = useConsoleSpies();

  afterEach(() => {
    Reflect.set(globalThis, '__vitestAutoSpyStrayConsole__', undefined);
  });

  it('writes to console.warn where nothing is guarding it', () => {
    libraryWarn('[vitest-auto-spy] a finding');

    expect(consoleWarnSpy).toHaveBeenCalledWith('[vitest-auto-spy] a finding');
  });

  it('steps over the stray-console wrapper, so its own report is not stray output', () => {
    const absorbed: string[] = [];
    const original = (message: string): void => {
      absorbed.push(message);
    };
    const sentinel = (): void => {
      absorbed.push('recorded as stray');
    };
    const restore = mockValueProp(console, 'warn', sentinel);

    armedGuard(sentinel, original);

    try {
      libraryWarn('[vitest-auto-spy] a finding');
    } finally {
      restore();
    }

    expect(absorbed).toEqual(['[vitest-auto-spy] a finding']);
  });

  it('lets a spy the test installed over the wrapper absorb it, as it absorbs any other output', () => {
    armedGuard(
      () => undefined,
      () => undefined,
    );

    libraryWarn('[vitest-auto-spy] a finding');

    expect(consoleWarnSpy).toHaveBeenCalledWith('[vitest-auto-spy] a finding');
  });

  it('falls back to the console where the guard kept no original', () => {
    const sentinel = (): void => undefined;
    const written: string[] = [];

    armedGuard(sentinel, undefined);

    const restore = mockValueProp(console, 'warn', (message: string): void => {
      written.push(message);
    });

    try {
      libraryWarn('[vitest-auto-spy] a finding');
    } finally {
      restore();
    }

    expect(written).toEqual(['[vitest-auto-spy] a finding']);
  });
});

describe('reactToFindings', () => {
  const { consoleWarnSpy } = useConsoleSpies();

  it('says nothing when nothing was found, throws them joined, or prints them', () => {
    reactToFindings([], 'throw');
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    expect(() => reactToFindings(['first', 'second'], 'throw')).toThrow('first\nsecond');

    reactToFindings(['first'], 'warn');
    expect(consoleWarnSpy).toHaveBeenCalledWith('first');
  });
});
