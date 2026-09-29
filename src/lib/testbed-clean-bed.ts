import { TestBed, getTestBed } from '@angular/core/testing';

import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { count, displayPath } from './message-text';
import { CLEAN_TEST_BED_CHECK } from './setup-clean-test-bed';
import { currentSpecFile } from './spec-file';

const fileEndResets = new Set<() => void>();

/** Per-file state some Angular helper keeps, dropped once the file is over whatever the bed looked like. */
export function onTestBedFileEnd(reset: () => void): void {
  fileEndResets.add(reset);
}

// Read at import, before any spec could spy on one: the fallback for a static whose spy cannot restore itself.
const staticBaseline = new Map(
  Object.entries(Object.getOwnPropertyDescriptors(TestBed)).map(([name, descriptor]): [string, unknown] => [name, descriptor.value]),
);

function isRunnerMock(value: unknown): value is { mockRestore?: () => void } {
  return typeof value === 'function' && typeof Reflect.get(value, 'mock') === 'object';
}

// Only a spy is reported: this package wraps instance methods with plain functions, and a setup file
// may wrap a static on purpose. Whatever a spy's own restore leaves in place goes to `fallback`.
function restoreSpies(target: object, label: string, fallback: (name: string) => void, findings: string[]): void {
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(target))) {
    const mock: unknown = descriptor.value;

    if (!isRunnerMock(mock)) {
      continue;
    }

    findings.push(`${label}.${name} is still a spy`);
    mock.mockRestore?.();

    if (Object.getOwnPropertyDescriptor(target, name)?.value === mock) {
      fallback(name);
    }
  }
}

function restoreStatic(name: string): void {
  const original = staticBaseline.get(name);

  if (typeof original === 'function') {
    Reflect.set(TestBed, name, original);
  } else {
    Reflect.deleteProperty(TestBed, name);
  }
}

function resetLeftoverModule(findings: string[]): void {
  const testBed = getTestBed();
  const fixtures: unknown = Reflect.get(testBed, '_activeFixtures');
  const live = Array.isArray(fixtures) ? fixtures.length : 0;
  const instantiated = Boolean(Reflect.get(testBed, '_testModuleRef'));

  if (!instantiated && live === 0) {
    return;
  }

  findings.push(
    [instantiated ? 'a testing module is still instantiated' : undefined, live > 0 ? `${count(live, 'fixture')} still alive` : undefined]
      .filter((part) => part !== undefined)
      .join(' and '),
  );

  try {
    TestBed.resetTestingModule();
  } catch (error) {
    findings.push(`resetting it threw: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Exported for its spec. */
export function describeDirtyTestBed(findings: readonly string[], file: unknown): string {
  const where = typeof file === 'string' ? displayPath(file) : 'This file';

  return withDocs(
    `[vitest-auto-spy] ${where} left the TestBed dirty: ${findings.join('; ')}. It has been reset now; under isolate: false ` +
      'the next file in this worker would have inherited it.\n' +
      "Reset after every test — Angular's own cleanup hook does that once a global afterEach exists (globals: true, " +
      'setupTestBed(), setupAngularTestEnv()) — and take spies off TestBed in the test that installed them (mockRestore(), ' +
      'vi.restoreAllMocks()).',
    DOCS_LINKS.setup,
  );
}

/** Put the bed back and say what was left on it, or `undefined` when it was clean. Never throws. */
export function cleanTestBed(): string | undefined {
  const findings: string[] = [];

  try {
    restoreSpies(TestBed, 'TestBed', restoreStatic, findings);
    restoreSpies(getTestBed(), 'getTestBed()', (name) => Reflect.deleteProperty(getTestBed(), name), findings);
    resetLeftoverModule(findings);
  } finally {
    fileEndResets.forEach((reset) => reset());
  }

  return findings.length === 0 ? undefined : describeDirtyTestBed(findings, currentSpecFile());
}

/** Hand `setupAutoSpy` the check through `globalThis`, so the core never imports Angular. */
export function armCleanTestBedCheck(): void {
  Reflect.set(globalThis, CLEAN_TEST_BED_CHECK, cleanTestBed);
}
