/**
 * The file-boundary repairs against the real window and document. The first block stands in for a
 * spec file that leaks; its `afterAll` is the boundary, and the block after it is the next file.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { setupAutoSpy } from './setup-auto-spy';
import { stopGuardingConsole } from './stray-console';
import { countStrayTimers, trackStrayTimers } from './stray-timers';

const { boundaryErrors } = vi.hoisted(() => ({ boundaryErrors: [] as unknown[] }));

// The spec's own hooks keep the real afterAll; only the library's are wrapped, so a boundary that throws is read, not failed on.
vi.mock('vitest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vitest')>();

  return {
    ...actual,
    afterAll: (fn: () => void) =>
      actual.afterAll(() => {
        try {
          fn();
        } catch (error) {
          boundaryErrors.push(error);
        }
      }),
  };
});

const EVENT = 'file-boundary-leftover';
const hits: string[] = [];
const realGetComputedStyle = globalThis.getComputedStyle;
const stub = (): CSSStyleDeclaration => realGetComputedStyle(document.body);

describe('a file that leaves a listener and a replaced global behind', () => {
  setupAutoSpy({ duplicateCopies: 'off', strayListeners: true, restoreGlobals: true });

  it('adds both and never takes them off', () => {
    document.addEventListener(EVENT, () => hits.push('leaked'));
    globalThis.getComputedStyle = stub;
    document.dispatchEvent(new Event(EVENT));

    expect(hits).toEqual(['leaked']);
    expect(globalThis.getComputedStyle).toBe(stub);
  });
});

describe('the file after it', () => {
  it('meets no listener the earlier file left on the document', () => {
    hits.length = 0;
    document.dispatchEvent(new Event(EVENT));

    expect(hits).toEqual([]);
  });

  it('meets the global as it was before the earlier file replaced it', () => {
    expect(globalThis.getComputedStyle).toBe(realGetComputedStyle);
  });
});

const reported: string[] = [];
const fired: string[] = [];

describe('a file that leaves a timer and a listener behind, with both reports on', () => {
  setupAutoSpy({
    duplicateCopies: 'off',
    restoreProps: false,
    strayTimers: true,
    onStrayTimers: ({ cancelled }) => reported.push(`timers ${cancelled}`),
    strayListeners: true,
    onStrayListeners: ({ removed }) => reported.push(`listeners ${removed}, timers left ${countStrayTimers()}`),
  });

  it('leaks both', () => {
    setTimeout(() => fired.push('timer'), 30);
    document.addEventListener(EVENT, () => undefined);

    expect(countStrayTimers()).toBeGreaterThan(0);
  });
});

describe('the file after the one that leaked a timer and a listener', () => {
  it('had the timer cancelled before any report ran, and heard both reports', async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(reported).toEqual(['listeners 1, timers left 0', 'timers 1']);
    expect(fired).toEqual([]);
  });
});

const thrownFired: string[] = [];

describe('a file that leaves a timer and a listener behind, with both reports set to throw', () => {
  setupAutoSpy({
    duplicateCopies: 'off',
    restoreProps: false,
    strayTimers: true,
    onStrayTimers: 'throw',
    strayListeners: true,
    onStrayListeners: 'throw',
  });

  it('leaks both', () => {
    setTimeout(() => thrownFired.push('timer'), 30);
    document.addEventListener(EVENT, () => undefined);

    expect(boundaryErrors).toEqual([]);
  });
});

describe('the file after the one whose reports both threw', () => {
  afterAll(() => {
    trackStrayTimers()();
  });

  it('failed with both errors together and had the timer cancelled first', async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(thrownFired).toEqual([]);
    expect(boundaryErrors).toHaveLength(1);
    expect(boundaryErrors[0]).toBeInstanceOf(AggregateError);

    const { errors, message } = boundaryErrors[0] as AggregateError;

    expect(message).toMatch(
      /^\[vitest-auto-spy\] 2 file-end checks failed when src\/lib\/setup-auto-spy-file-boundary\.spec\.ts ended:\n\n1\. /,
    );
    expect(errors.map((error: Error) => error.message.split('\n')[0])).toEqual([
      '[vitest-auto-spy] src/lib/setup-auto-spy-file-boundary.spec.ts left 1 window/document listener attached when it ended:',
      '[vitest-auto-spy] src/lib/setup-auto-spy-file-boundary.spec.ts left 1 timer pending when it ended:',
    ]);
    expect((errors[1] as Error).message).toContain(
      'scheduled in "a file that leaves a timer and a listener behind, with both reports set to throw > leaks both"',
    );
  });
});

// Silenced before the guard wraps it, and put back by the block after, once the boundary has run.
const realWarn = console.warn;

describe('a file that prints while it is collected and leaves a timer, with both reports set to throw', () => {
  console.warn = (): void => undefined;
  setupAutoSpy({ duplicateCopies: 'off', restoreProps: false, strayConsole: 'throw', strayTimers: true, onStrayTimers: 'throw' });
  console.warn('printed while the file was collected');

  beforeAll(() => {
    boundaryErrors.length = 0;
    // The block before took the tracking off after this one was collected.
    trackStrayTimers();
  });

  it('leaves a timer', () => {
    setTimeout(() => undefined, 30);

    expect(boundaryErrors).toEqual([]);
  });
});

describe('the file after the one whose timer report threw first', () => {
  afterAll(() => {
    stopGuardingConsole();
    console.warn = realWarn;
    trackStrayTimers()();
  });

  it('still reported the console output, against the file that wrote it', () => {
    expect(boundaryErrors).toHaveLength(1);

    const { errors } = boundaryErrors[0] as AggregateError;
    const [timers, output] = errors.map((error: Error) => error.message);

    expect(timers).toMatch(/left 1 timer pending when it ended/);
    expect(output).toMatch(
      /^\[vitest-auto-spy\] src\/lib\/setup-auto-spy-file-boundary\.spec\.ts wrote to console\.warn 1 time while the file was being imported/,
    );
    expect(output).toContain('printed while the file was collected');
  });
});
