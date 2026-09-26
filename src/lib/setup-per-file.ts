// Catches a setup module the runner evaluated once per worker instead of once per spec file: every
// file after the first then runs with none of the hooks, and nothing else in the run says so.
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { displayPath } from './message-text';
import { currentSpecFile } from './spec-file';
import { writeWarning } from './write-warning';

interface SetupRegistration {
  /** The spec file the latest setup-file call registered its hooks for. */
  file: string;
  /** The last spec file a test was seen in. */
  seen: string | undefined;
  warned: boolean;
}

declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpySetupRegistration__: SetupRegistration | undefined;
}

/** Exported for its spec. */
export function describeSetupOncePerWorker(registeredFor: string, running: string): string {
  return withDocs(
    `[vitest-auto-spy] setupAutoSpy() registered its hooks for ${displayPath(registeredFor)} and not for ${displayPath(running)}, ` +
      'which runs after it in the same worker: the setup module was evaluated once per worker rather than once per spec file, ' +
      'so every file after the first runs without the restores and guards, and fails somewhere unrelated.\n' +
      'The known cause is @angular/build:unit-test before 22.2.0 under --coverage. Upgrade @angular/build to 22.2.0, run coverage ' +
      'with --isolate, or call setupAutoSpy() at the top level of the setup file itself rather than from a module it imports. ' +
      'Said once per worker.',
    DOCS_LINKS.setupPerFile,
  );
}

/** Exported for its spec: the check a test of a new spec file triggers. */
export function noticeSpecFile(file: string, write: (message: string) => void = writeWarning): void {
  const registration = globalThis.__vitestAutoSpySetupRegistration__;

  if (registration === undefined || registration.seen === file) {
    return;
  }

  registration.seen = file;

  if (registration.file !== file && !registration.warned) {
    registration.warned = true;
    write(describeSetupOncePerWorker(registration.file, file));
  }
}

function testFileOf(task: unknown): string | undefined {
  if (Reflect.get(Object(task), 'type') !== 'test') {
    return undefined;
  }

  const file: unknown = Reflect.get(Object(Reflect.get(Object(task), 'file')), 'filepath');

  return typeof file === 'string' ? file : undefined;
}

/**
 * Turn the runner's `current` slot into an accessor that reports each test's spec file. The slot is
 * the one thing of the runner's this module still sees in a file whose setup never ran.
 * Exported for its spec; answers whether it could.
 */
export function watchCurrentTask(state: object, onTest: (file: string) => void): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(state, 'current');

  if (descriptor !== undefined && (descriptor.configurable !== true || !('value' in descriptor))) {
    return false;
  }

  let current: unknown = descriptor?.value;

  Object.defineProperty(state, 'current', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get: () => current,
    set: (task: unknown) => {
      current = task;
      const file = testFileOf(task);

      if (file !== undefined) {
        onTest(file);
      }
    },
  });

  return true;
}

/** Whether a configured setup file is on the stack, rather than a spec that called `setupAutoSpy()` itself. */
function calledFromSetupFile(worker: object): boolean {
  const setupFiles: unknown = Reflect.get(Object(Reflect.get(worker, 'config')), 'setupFiles');

  if (!Array.isArray(setupFiles) || setupFiles.length === 0) {
    return false;
  }

  const limit = Error.stackTraceLimit;

  Error.stackTraceLimit = 100;
  const stack = String(new Error().stack);

  Error.stackTraceLimit = limit;

  return setupFiles.some((file) => typeof file === 'string' && stack.includes(file));
}

/** Record the spec file a setup-file call registered its hooks for, and watch the worker's tests once. */
export function recordSetupRegistration(worker: unknown = Reflect.get(globalThis, '__vitest_worker__')): void {
  const file = currentSpecFile();

  if (typeof worker !== 'object' || worker === null || typeof file !== 'string' || !calledFromSetupFile(worker)) {
    return;
  }

  const existing = globalThis.__vitestAutoSpySetupRegistration__;

  if (existing !== undefined) {
    existing.file = file;

    return;
  }

  globalThis.__vitestAutoSpySetupRegistration__ = { file, seen: undefined, warned: false };
  watchCurrentTask(worker, (test) => noticeSpecFile(test));
}
