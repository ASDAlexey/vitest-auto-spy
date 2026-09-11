/**
 * The recording is driven on a stand-in console wherever the assertion is about what was recorded:
 * a guard armed on the real one fails the very test that asserts about it. The wiring through
 * `setupAutoSpy` is covered at the end, with `it.fails` for the tests whose teardown must throw.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { mockValueProp } from './prop-mock';
import { setupAutoSpy } from './setup-auto-spy';
import {
  armConsoleGuard,
  callerFrame,
  describeOutput,
  describeStrayConsole,
  finishConsoleFile,
  guardStrayConsole,
  openConsoleWindow,
  reportTestConsole,
  resolveStrayConsole,
  restoreConsoleMethods,
  stopGuardingConsole,
  watchStrayConsole,
} from './stray-console';

/** A console with a recorder per method, standing in for the one the runner intercepts. */
function standInConsole(): { host: Record<string, unknown>; written: string[] } {
  const written: string[] = [];
  const host: Record<string, unknown> = {};

  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'assert', 'group', 'table', 'time']) {
    host[method] = (...args: unknown[]): void => {
      written.push(`${method}: ${args.map(String).join(' ')}`);
    };
  }

  return { host, written };
}

function call(host: Record<string, unknown>, method: string, ...args: unknown[]): void {
  const fn: unknown = host[method];

  if (typeof fn === 'function') {
    Reflect.apply(fn, host, args);
  }
}

function thrownBy(run: () => void): string {
  try {
    run();
  } catch (error) {
    return String(error);
  }

  return '';
}

// The guard forwards what it records; silenced here, before anything arms it, so the run stays quiet.
const realConsole = { error: console.error, info: console.info, warn: console.warn };

Object.assign(console, { error: () => undefined, info: () => undefined, warn: () => undefined });

afterAll(() => {
  stopGuardingConsole();
  Object.assign(console, realConsole);
});

describe('resolveStrayConsole', () => {
  it('reads a bare reaction, an object with defaults, and nothing at all', () => {
    expect(resolveStrayConsole(undefined)).toEqual({ reaction: 'off', allow: [] });
    expect(resolveStrayConsole('warn')).toEqual({ reaction: 'warn', allow: [] });
    expect(resolveStrayConsole({ allow: ['noise'] })).toEqual({ reaction: 'throw', allow: ['noise'] });
    expect(resolveStrayConsole({ reaction: 'warn' })).toEqual({ reaction: 'warn', allow: [] });
  });
});

describe('describeOutput', () => {
  it('joins the arguments the way a reader would recognise them', () => {
    const circular: Record<string, unknown> = {};

    circular['self'] = circular;

    expect(describeOutput('error', ['failed', new TypeError('boom'), { id: 1 }, undefined, circular])).toBe(
      'failed TypeError: boom {"id":1} undefined [object Object]',
    );
  });

  it('writes nothing for a passing assert or a group without a label', () => {
    expect(describeOutput('assert', [true, 'fine'])).toBeUndefined();
    expect(describeOutput('group', [])).toBeUndefined();
    expect(describeOutput('groupCollapsed', [])).toBeUndefined();
    expect(describeOutput('assert', [false, 'broken'])).toBe('Assertion failed broken');
    expect(describeOutput('group', ['section'])).toBe('section');
  });

  it('quotes three lines at most, and cuts a long one', () => {
    const text = describeOutput('log', [`${'x'.repeat(250)}\nsecond\nthird\nfourth`]);

    expect(text?.split('\n')).toEqual([`${'x'.repeat(200)}…`, 'second', 'third']);
  });
});

describe('callerFrame', () => {
  const stackOf = (stack: string) => ({
    captureStackTrace(target: object): void {
      Reflect.set(target, 'stack', stack);
    },
  });

  it('prefers the first frame outside dependencies', () => {
    const stack = 'Error\n    at log (node_modules/pkg/index.js:1:1)\n    at load (src/cart.ts:12:5)';

    expect(callerFrame(undefined, stackOf(stack))).toBe('at load (src/cart.ts:12:5)');
  });

  it('falls back to the direct caller when every frame is a dependency, and says so when there is none', () => {
    expect(callerFrame(undefined, stackOf('Error\n    at x (node:internal/a:1:1)'))).toBe('at x (node:internal/a:1:1)');
    expect(callerFrame(undefined, stackOf('Error'))).toBe('at <unknown>');
  });

  it('reads the stack as it is on a runtime without captureStackTrace', () => {
    expect(callerFrame(undefined, {})).toMatch(/^at /);
  });
});

describe('the guard on a stand-in console', () => {
  let console$: ReturnType<typeof standInConsole>;
  let armedForRealConsole: typeof globalThis.__vitestAutoSpyStrayConsole__;

  beforeEach(() => {
    console$ = standInConsole();
    armedForRealConsole = globalThis.__vitestAutoSpyStrayConsole__;
  });

  afterEach(() => {
    // Only a guard this block armed comes off: the one on the real console belongs to the blocks below.
    if (globalThis.__vitestAutoSpyStrayConsole__ !== armedForRealConsole) {
      stopGuardingConsole();
    }

    globalThis.__vitestAutoSpyStrayConsole__ = armedForRealConsole;
  });

  it('forwards every call, and records only what writes', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'log', 'hello');
    call(console$.host, 'assert', true, 'fine');
    call(console$.host, 'time', 'label');

    expect(console$.written).toEqual(['log: hello', 'assert: true fine', 'time: label']);
    expect(thrownBy(() => reportTestConsole(guard))).toMatch(/wrote to the console 1 time\(s\)[\s\S]*console\.log: hello/);
  });

  it('lets allowed output through, by substring or by pattern, however the pattern is flagged', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: ['Download the devtools', /^noise \d+$/g] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'info', 'Download the devtools for a better experience');
    call(console$.host, 'warn', 'noise 1');
    call(console$.host, 'warn', 'noise 2');

    expect(() => reportTestConsole(guard)).not.toThrow();
  });

  it('quotes five calls and counts the rest', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    openConsoleWindow(guard);

    for (let index = 0; index < 7; index += 1) {
      call(console$.host, 'debug', `line ${index}`);
    }

    const message = thrownBy(() => reportTestConsole(guard));

    expect(message).toContain('7 time(s)');
    expect(message).toContain('line 4');
    expect(message).not.toContain('line 5');
    expect(message).toContain('… and 2 more');
  });

  it('prints instead of failing under the warn grade, through the console it wrapped', () => {
    const guard = armConsoleGuard({ reaction: 'warn', allow: [] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'error', 'unexpected');
    reportTestConsole(guard);

    expect(console$.written.at(-1)).toMatch(/^warn: \[vitest-auto-spy\] ".*" wrote to the console 1 time\(s\)/);
  });

  it('falls back to stderr under the warn grade when the wrapped console has no warn', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    delete console$.host['warn'];

    const guard = armConsoleGuard({ reaction: 'warn', allow: [] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'error', 'unexpected');
    reportTestConsole(guard);

    expect(write).toHaveBeenCalledWith(expect.stringContaining('nothing absorbed it'));
    write.mockRestore();
  });

  it('puts back what a test left on the console, and nothing it did not change', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);
    const sentinel = console$.host['error'];
    const silent = (): void => undefined;

    openConsoleWindow(guard);
    console$.host['error'] = silent;
    call(console$.host, 'error', 'absorbed');
    restoreConsoleMethods(guard);

    expect(console$.host['error']).toBe(sentinel);
    expect(() => reportTestConsole(guard)).not.toThrow();
  });

  it('reports output outside any test against the file, with the test a skipped teardown left behind', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    call(console$.host, 'log', 'while importing');
    openConsoleWindow(guard);
    call(console$.host, 'warn', 'inside a test whose afterEach never ran');
    openConsoleWindow(guard);

    const message = thrownBy(() => finishConsoleFile(guard));

    expect(message).toMatch(/stray-console\.spec\.ts wrote to the console 2 time\(s\) outside any test/);
    expect(message).toContain('console.log: while importing');
    expect(message).toMatch(/console\.warn \(during ".*"\): inside a test whose afterEach never ran/);
  });

  it('stops recording once the file is over, and puts the console back to the wrappers', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);
    const sentinel = console$.host['log'];

    console$.host['log'] = (): void => undefined;
    finishConsoleFile(guard);
    call(console$.host, 'log', 'between files');

    expect(console$.host['log']).toBe(sentinel);
    expect(() => finishConsoleFile(guard)).not.toThrow();
  });

  it('writes the file-level report to stderr under the warn grade', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const guard = armConsoleGuard({ reaction: 'warn', allow: [] }, console$.host);

    call(console$.host, 'log', 'while importing');
    finishConsoleFile(guard);

    expect(write).toHaveBeenCalledWith(expect.stringContaining('outside any test'));
    write.mockRestore();
  });

  it('names "this file", and an empty test, when the runner reports neither', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);
    const key: PropertyKey = 'getState';
    const restore = mockValueProp(expect, key, () => ({}));

    openConsoleWindow(guard);
    call(console$.host, 'log', 'in a nameless test');

    const test = thrownBy(() => reportTestConsole(guard));

    call(console$.host, 'log', 'outside');

    const file = thrownBy(() => finishConsoleFile(guard));

    restore();

    expect(test).toContain('"" wrote to the console');
    expect(file).toContain('this file wrote to the console');
  });

  it('arms once per console, takes installed console spies off first, and reuses the wrappers', () => {
    const detach = vi.fn();

    globalThis.__vitestAutoSpyDetachConsoleSpies__ = detach;

    const first = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);
    const again = armConsoleGuard({ reaction: 'warn', allow: ['x'] }, console$.host);

    globalThis.__vitestAutoSpyDetachConsoleSpies__ = undefined;

    expect(again).toBe(first);
    expect(first.reaction).toBe('warn');
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('adds the console-entry advice once that entry is loaded in the worker', () => {
    const reset = vi.fn();

    globalThis.__vitestAutoSpyResetConsoleSpies__ = reset;

    const message = describeStrayConsole({ calls: [], total: 1 }, 'a test');

    globalThis.__vitestAutoSpyResetConsoleSpies__ = undefined;

    expect(message).toMatch(/importing a spy installs nothing/);
    expect(describeStrayConsole({ calls: [], total: 1 }, undefined)).not.toMatch(/importing a spy installs nothing/);
  });

  it('forgets a guard that was never armed without complaint', () => {
    globalThis.__vitestAutoSpyStrayConsole__ = undefined;
    stopGuardingConsole();

    expect(globalThis.__vitestAutoSpyStrayConsole__).toBeUndefined();
  });
});

describe('watchStrayConsole', () => {
  it('registers nothing when the reaction is off', () => {
    expect(watchStrayConsole('off')).toBeUndefined();
    expect(watchStrayConsole(undefined)).toBeUndefined();
  });
});

describe('guardStrayConsole, registered on its own', () => {
  guardStrayConsole('throw');

  it('absorbs what a silent spy takes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    console.warn('absorbed');
  });

  it.fails('fails a test that prints', () => {
    console.info('printed');
  });
});

describe('guardStrayConsole, off', () => {
  it('registers nothing, which is why it can be called from inside a test', () => {
    expect(() => guardStrayConsole('off')).not.toThrow();
  });
});

describe('setupAutoSpy({ strayConsole: "throw" })', () => {
  setupAutoSpy({ duplicateCopies: 'off', strayConsole: 'throw' });

  it.fails('fails the test that printed', () => {
    console.error('nobody asserted on this');
  });

  it.fails('counts a vi.spyOn with no implementation, which calls through and prints', () => {
    const spy = vi.spyOn(console, 'error');

    console.error('still printed');

    expect(spy).toHaveBeenCalled();
  });

  it('absorbs a vi.spyOn that replaces the implementation', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    console.error('absorbed');

    expect(spy).toHaveBeenCalledWith('absorbed');
  });

  it('absorbs the console-entry spies a test installs, and takes them off after it', async () => {
    const { consoleErrorSpy, installConsoleSpies } = await import('../console');

    expect(console.error).not.toBe(consoleErrorSpy);

    installConsoleSpies();
    console.error('absorbed by the entry');

    expect(consoleErrorSpy).toHaveBeenCalledWith('absorbed by the entry');
  });

  it('found the console-entry spies gone once that test was over', async () => {
    const { consoleErrorSpy } = await import('../console');

    expect(console.error).not.toBe(consoleErrorSpy);
  });

  it.fails('fails on a library warning, which is console output like any other', () => {
    console.warn('[vitest-auto-spy] a misconfiguration report');
  });
});
