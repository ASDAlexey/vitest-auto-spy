/**
 * The detector for a setup module the runner evaluated once per worker. A real reproduction needs a
 * second spec file in the same worker, so the pieces are driven here on a hand-built worker state.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { describeSetupOncePerWorker, noticeSpecFile, recordSetupRegistration, watchCurrentTask } from './setup-per-file';

const THIS_FILE = expect.getState().testPath ?? '';

afterEach(() => {
  globalThis.__vitestAutoSpySetupRegistration__ = undefined;
});

describe('describeSetupOncePerWorker', () => {
  it('names both files, the builder and the ways out', () => {
    const message = describeSetupOncePerWorker('/repo/src/a.spec.ts', '/repo/src/b.spec.ts');

    expect(message).toMatch(/^\[vitest-auto-spy\] setupAutoSpy\(\) registered its hooks for \S*a\.spec\.ts and not for \S*b\.spec\.ts/);
    expect(message).toContain('@angular/build:unit-test before 22.2.0 under --coverage');
    expect(message).toMatch(
      /--isolate[\s\S]*top level of the setup file itself[\s\S]*Said once per worker\.\nDocs: \S+#the-hooks-belong-to-the-file-this-call-ran-in$/,
    );
  });
});

describe('noticeSpecFile', () => {
  it('says nothing before any setup-file call, nor for the file the call registered for', () => {
    const written: string[] = [];

    noticeSpecFile('/b.spec.ts', (message) => written.push(message));
    globalThis.__vitestAutoSpySetupRegistration__ = { file: '/a.spec.ts', seen: undefined, warned: false };
    noticeSpecFile('/a.spec.ts', (message) => written.push(message));
    noticeSpecFile('/a.spec.ts', (message) => written.push(message));

    expect(written).toEqual([]);
  });

  it('warns once per worker for a file that runs without its own registration', () => {
    const written: string[] = [];

    globalThis.__vitestAutoSpySetupRegistration__ = { file: '/a.spec.ts', seen: '/a.spec.ts', warned: false };
    noticeSpecFile('/b.spec.ts', (message) => written.push(message));
    noticeSpecFile('/c.spec.ts', (message) => written.push(message));

    expect(written).toHaveLength(1);
    expect(written[0]).toContain('registered its hooks for /a.spec.ts and not for /b.spec.ts');
  });
});

describe('watchCurrentTask', () => {
  it("reports each test's spec file as the runner sets it, and keeps the value readable", () => {
    const state: { current?: unknown } = { current: undefined };
    const files: string[] = [];
    const test = { type: 'test', file: { filepath: '/a.spec.ts' } };

    expect(watchCurrentTask(state, (file) => files.push(file))).toBe(true);

    state.current = { type: 'suite', file: { filepath: '/a.spec.ts' } };
    state.current = test;
    state.current = { type: 'test', file: {} };

    expect(files).toEqual(['/a.spec.ts']);
    expect(state.current).toEqual({ type: 'test', file: {} });
    expect(Object.keys(state)).toEqual(['current']);
  });

  it('installs on a state that has no slot yet', () => {
    const state: { current?: unknown } = {};

    expect(watchCurrentTask(state, () => undefined)).toBe(true);
    expect(state.current).toBeUndefined();
  });

  it('leaves a slot alone that is already an accessor, or cannot be redefined', () => {
    const accessor = Object.defineProperty({}, 'current', { configurable: true, get: () => undefined });
    const frozen = Object.freeze({ current: undefined });

    expect(watchCurrentTask(accessor, () => undefined)).toBe(false);
    expect(watchCurrentTask(frozen, () => undefined)).toBe(false);
  });
});

describe('recordSetupRegistration', () => {
  it('records nothing for a call a spec made, nor without a worker', () => {
    recordSetupRegistration({ config: { setupFiles: ['/elsewhere/setup.ts'] } });
    recordSetupRegistration({ config: { setupFiles: [] } });
    recordSetupRegistration({});
    recordSetupRegistration(undefined);

    expect(globalThis.__vitestAutoSpySetupRegistration__).toBeUndefined();
  });

  it('records the file a setup-file call registered for, once, and moves it along with each later call', () => {
    // This spec stands in for the setup file: it is on the stack, which is what the check looks for.
    const worker: { config: object; current?: unknown } = { config: { setupFiles: [7, THIS_FILE] }, current: undefined };

    recordSetupRegistration(worker);

    expect(globalThis.__vitestAutoSpySetupRegistration__).toEqual({ file: THIS_FILE, seen: undefined, warned: false });

    worker.current = { type: 'test', file: { filepath: THIS_FILE } };
    recordSetupRegistration(worker);

    expect(globalThis.__vitestAutoSpySetupRegistration__).toEqual({ file: THIS_FILE, seen: THIS_FILE, warned: false });
  });
});
