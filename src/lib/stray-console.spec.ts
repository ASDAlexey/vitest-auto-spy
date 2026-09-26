/**
 * The recording is driven on a stand-in console wherever the assertion is about what was recorded:
 * a guard armed on the real one fails the very test that asserts about it. The wiring through
 * `setupAutoSpy` is covered at the end, with `it.fails` for the tests whose teardown must throw.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../index';
import { mockValueProp } from './prop-mock';
import { setupAutoSpy } from './setup-auto-spy';
import {
  armConsoleGuard,
  callerFrame,
  closeConsoleFile,
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

  it('stops formatting once the report is full, and keeps counting', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);
    let reads = 0;
    const heavy = {
      get state(): string {
        reads += 1;

        return 'a store state nobody quotes';
      },
    };

    openConsoleWindow(guard);

    for (let i = 0; i < 8; i++) {
      call(console$.host, 'log', heavy);
    }

    // Five quoted, eight counted — and the three past the quota were never serialised.
    expect(reads).toBe(5);
    expect(thrownBy(() => reportTestConsole(guard))).toContain('wrote to the console 8 times');
  });

  it('keeps formatting past the quota while there is an allow list to match against', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: ['noise'] }, console$.host);

    openConsoleWindow(guard);

    for (let i = 0; i < 7; i++) {
      call(console$.host, 'log', i % 2 === 0 ? 'noise' : 'real output');
    }

    expect(thrownBy(() => reportTestConsole(guard))).toContain('wrote to console.log 3 times');

    // Past the quota the text is still built, because only it can answer the allow list — and the
    // call is counted without being quoted.
    openConsoleWindow(guard);

    for (let i = 0; i < 8; i++) {
      call(console$.host, 'log', 'real output');
    }

    const report = thrownBy(() => reportTestConsole(guard));

    expect(report).toContain('wrote to the console 8 times');
    expect(report).toContain('… and 3 more');
  });

  it('forwards every call, and records only what writes', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'log', 'hello');
    call(console$.host, 'assert', true, 'fine');
    call(console$.host, 'time', 'label');

    expect(console$.written).toEqual(['log: hello', 'assert: true fine', 'time: label']);
    expect(thrownBy(() => reportTestConsole(guard))).toMatch(
      /wrote to console\.log 1 time and nothing absorbed it:\n {2}- console\.log: hello/,
    );
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

    expect(message).toContain('wrote to the console 7 times');
    expect(message).toContain('line 4');
    expect(message).not.toContain('line 5');
    expect(message).toContain('… and 2 more');
  });

  it('prints instead of failing under the warn grade, through the console it wrapped', () => {
    const guard = armConsoleGuard({ reaction: 'warn', allow: [] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'error', 'unexpected');
    reportTestConsole(guard);

    expect(console$.written.at(-1)).toMatch(/^warn: \[vitest-auto-spy\] ".*" wrote to console\.error 1 time/);
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

    expect(message).toMatch(/^Error: \[vitest-auto-spy\] src\/lib\/stray-console\.spec\.ts wrote to the console 2 times outside any test/);
    expect(message).toContain('console.log (while importing): while importing');
    expect(message).toMatch(/console\.warn \(during ".*"\): inside a test whose afterEach never ran/);
    expect(message).toContain('before any hook — no spy can absorb it');
    expect(message).toContain('Absorb what the test expects — installConsoleSpies() in a beforeEach, then assert consoleWarnSpy');
    expect(message).toMatch(/\nDocs: \S+#_16-console-output-nothing-absorbed$/);
  });

  it('says the output came from the import, and gives the import advice alone', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    call(console$.host, 'warn', 'from a static block');

    const message = thrownBy(() => finishConsoleFile(guard));

    expect(message).toMatch(/wrote to console\.warn 1 time while the file was being imported and nothing absorbed it/);
    expect(message).toContain('console.warn: from a static block');
    expect(message).toMatch(
      /Written while src\/lib\/stray-console\.spec\.ts was evaluated, before any hook — no spy can absorb it; fix it at src\/lib\/stray-console\.spec\.ts:\d+:\d+\./,
    );
    expect(message).toContain('Under isolate: false it is reported on the first file of the worker that imports that module.');
    expect(message).not.toContain('allow');
    expect(message).not.toContain('Absorb what the test expects');
  });

  it('says the output came from a beforeAll', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    guard.outsidePhase = 'beforeAll';
    call(console$.host, 'log', 'seeding');

    const message = thrownBy(() => finishConsoleFile(guard));

    expect(message).toMatch(/1 time in a beforeAll, before the tests it prepares and nothing absorbed it/);
    expect(message).toContain('call installConsoleSpies() at the top of the file and assert on it');
  });

  it('says the output came after a test had ended, and starts the next file at its import again', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    openConsoleWindow(guard);
    reportTestConsole(guard);
    call(console$.host, 'error', 'late');

    const message = thrownBy(() => finishConsoleFile(guard));

    expect(message).toMatch(/1 time after a test had ended — from a callback that outlived it, or an afterAll —/);
    expect(message).toContain('Something the test started finished after it');
    expect(guard.outsidePhase).toBe('import');
  });

  it('keeps the generic subject once calls went unquoted, since their phase is unknown', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    for (let index = 0; index < 6; index += 1) {
      call(console$.host, 'log', `line ${String(index)}`);
    }

    const message = thrownBy(() => finishConsoleFile(guard));

    expect(message).toContain('outside any test');
    expect(message).toContain('console.log (while importing): line 0');
    expect(message).toContain('… and 1 more');
  });

  it('explains a recognised line from its whole text, past the part the report quotes', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);
    const padding = 'x'.repeat(300);

    call(console$.host, 'warn', `NG0303: ${padding} Find more at https://angular.dev/errors/NG0303`);
    call(console$.host, 'warn', 'NG0303: again Find more at https://angular.dev/errors/NG0303');

    const message = thrownBy(() => finishConsoleFile(guard));

    expect(message).toContain('Likely cause:\n  - Angular explains this error at https://angular.dev/errors/NG0303\n');
    expect(message.match(/Angular explains/g)).toHaveLength(1);
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

    expect(write).toHaveBeenCalledWith(expect.stringContaining('while the file was being imported'));
    write.mockRestore();
  });

  it('names "this file", and an empty test, when the runner reports neither', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);
    const key: PropertyKey = 'getState';
    const restore = mockValueProp(expect, key, () => ({}));
    const worker: unknown = Reflect.get(globalThis, '__vitest_worker__');
    const filepath: unknown = Reflect.get(Object(worker), 'filepath');

    Reflect.set(Object(worker), 'filepath', undefined);

    openConsoleWindow(guard);
    call(console$.host, 'log', 'in a nameless test');

    const test = thrownBy(() => reportTestConsole(guard));

    call(console$.host, 'log', 'outside');

    const file = thrownBy(() => finishConsoleFile(guard));

    restore();
    Reflect.set(Object(worker), 'filepath', filepath);

    expect(test).toContain('"" wrote to console.log');
    expect(file).toContain('this file wrote to console.log');
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

    expect(message).toMatch(/Importing vitest-auto-spy\/console installs nothing under strayConsole/);
    expect(message).toContain('installConsoleSpies() in a beforeEach, then assert its spies');
    expect(describeStrayConsole({ calls: [], total: 1 }, undefined)).not.toMatch(/installs nothing/);
  });

  it("reads a call recorded without a phase as a test's, and tags it with nothing", () => {
    const imported = { method: 'log', text: 'at import', frame: 'at a', test: undefined, phase: 'import' as const };
    const unphased = { method: 'log', text: 'by hand', frame: 'at b', test: undefined };
    const message = describeStrayConsole({ calls: [imported, unphased], total: 2 }, undefined, 'a.spec.ts');

    expect(message).toContain('console.log (while importing): at import');
    expect(message).toContain('console.log: by hand');
    expect(message).toContain('Absorb what the test expects');
  });

  it('names the spy that absorbs each method, and a silent vi.spyOn for a method the entry has none for', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'error', 'failed');
    call(console$.host, 'warn', 'careful');
    call(console$.host, 'table', 'rows');

    const message = thrownBy(() => reportTestConsole(guard));

    expect(message).toContain(
      'Absorb what the test expects — installConsoleSpies() in a beforeEach, then assert consoleErrorSpy and consoleWarnSpy; ' +
        "vi.spyOn(console, 'table').mockImplementation(() => undefined) — or fix the code if the output is a defect.",
    );
    expect(message).not.toContain('allow');
  });

  it('names only a silent vi.spyOn when no method written has an entry spy', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'table', 'rows');

    const message = thrownBy(() => reportTestConsole(guard));

    expect(message).toContain("Absorb what the test expects — vi.spyOn(console, 'table').mockImplementation(() => undefined) — or fix");
    expect(message).not.toContain('installConsoleSpies');
  });

  it('says a vi.spyOn with no implementation calls through, and nothing else, when that is what printed', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    openConsoleWindow(guard);
    vi.spyOn(console$.host as { error: () => void }, 'error');
    call(console$.host, 'error', 'still printed');
    restoreConsoleMethods(guard);

    const message = thrownBy(() => reportTestConsole(guard));

    expect(message).toContain("vi.spyOn(console, 'error') calls through — add .mockImplementation(() => undefined).");
    expect(message).not.toContain('Absorb');
  });

  it('keeps a link the cut dropped from a long line', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    openConsoleWindow(guard);
    call(console$.host, 'warn', `NG0912: ${'x'.repeat(250)} Find more at https://angular.dev/errors/NG0912.`);
    call(console$.host, 'warn', `short\n2\n3\n4 https://example.test/a`);

    const message = thrownBy(() => reportTestConsole(guard));

    expect(message).toContain(`${'x'.repeat(192)}… https://angular.dev/errors/NG0912\n`);
    expect(message).toContain('3 https://example.test/a\n');
  });

  it('offers the allow list only for a line a dependency wrote while it was imported', () => {
    const imported = (frame: string, text: string) => ({ method: 'warn', text, frame, test: undefined, phase: 'import' as const });
    const dependency = describeStrayConsole(
      { calls: [imported('at init (/app/node_modules/ui-kit/chip.js:3:7)', 'NG0912: collision')], total: 1 },
      undefined,
      '/app/a.spec.ts',
    );
    const generic = describeStrayConsole(
      { calls: [imported('at /app/node_modules/x/index.js:1:1', 'noise')], total: 1 },
      undefined,
      'a.spec.ts',
    );
    const unknown = describeStrayConsole({ calls: [imported('at <unknown>', 'noise')], total: 1 }, undefined, 'a.spec.ts');

    expect(dependency).toContain('Written while /app/node_modules/ui-kit/chip.js was evaluated');
    expect(dependency).toContain('That code is a dependency: `strayConsole: { allow: [/NG0912/] }` lets this line through.');
    expect(generic).toContain('`strayConsole: { allow: [/…/] }`');
    expect(unknown).toContain('Written while a module was evaluated, before any hook — no spy can absorb it; fix the line that wrote it.');
    expect(unknown).not.toContain('allow');
  });

  it('names the file each call came from, and says why a report landed on a later file', () => {
    const late = { method: 'log', text: 'late', frame: 'at a', test: undefined, phase: 'afterTest' as const, file: '/r/a.spec.ts' };
    const carried = describeStrayConsole({ calls: [late], total: 1 }, undefined, '/r/b.spec.ts');
    const mixed = describeStrayConsole(
      {
        calls: [
          late,
          { ...late, file: '/r/b.spec.ts', test: 't' },
          { method: 'log', text: 'late', frame: 'at a', test: undefined, phase: 'test' as const },
        ],
        total: 3,
      },
      undefined,
      '/r/b.spec.ts',
    );

    expect(carried).toMatch(/^\[vitest-auto-spy\] \/r\/a\.spec\.ts wrote to console\.log 1 time after a test had ended/);
    expect(carried).toContain('It is reported at the end of /r/b.spec.ts: the file-end check of /r/a.spec.ts did not run.');
    expect(mixed).toContain('console.log (after its test ended, in /r/a.spec.ts): late');
    expect(mixed).toContain('console.log (during "t"): late');
    expect(mixed).toContain('  - console.log: late\n');
    expect(mixed).not.toContain('It is reported at the end');
  });

  it('hands the file report to a caller that sweeps it, and nothing when the file wrote nothing', () => {
    const guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);

    expect(closeConsoleFile(guard)).toBeUndefined();

    guard.recording = true;
    call(console$.host, 'log', 'at import');

    const report = closeConsoleFile(guard);

    expect(thrownBy(() => report?.())).toContain('wrote to console.log 1 time while the file was being imported');
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

describe('a nested beforeAll that runs after a test of the file', () => {
  const console$ = standInConsole();
  let armed: typeof globalThis.__vitestAutoSpyStrayConsole__;
  let guard: ReturnType<typeof armConsoleGuard>;

  it('ends a test first', () => {
    armed = globalThis.__vitestAutoSpyStrayConsole__;
    guard = armConsoleGuard({ reaction: 'throw', allow: [] }, console$.host);
    openConsoleWindow(guard);
    reportTestConsole(guard);

    expect(guard.outsidePhase).toBe('afterTest');
  });

  describe('inner', () => {
    let message = '';

    beforeAll(() => {
      call(console$.host, 'log', 'seeding');
      message = thrownBy(() => finishConsoleFile(guard));
      stopGuardingConsole();
      globalThis.__vitestAutoSpyStrayConsole__ = armed;
    });

    it('is reported as a beforeAll, not as a callback after the test', () => {
      expect(message).toContain('1 time in a beforeAll, before the tests it prepares');
    });
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
