/**
 * Anchoring a failure to the stack taken at helper entry.
 *
 * Two things have to hold. The rewrite must land on the caller's frame — the whole point is that a
 * failure built inside a `subscribe` callback stops reporting `expect-emission.ts` as the location —
 * and it must never touch an error this package did not create, because `expectError` hands the
 * stream's own error straight back and a moved stack there would name a line that had nothing to do
 * with it.
 *
 * `anchorOf` and the `host` argument are the seams: a spec cannot uninstall `Error.captureStackTrace`
 * on the real global without breaking every other test in the file, and no runtime this package
 * supports can be asked for an empty stack on demand.
 */
import { describe, expect, it } from 'vitest';

import { anchorOf, captureAnchor, ownFailure } from './error-anchor';
import type { StackAnchor } from './error-anchor';

/** The first frame of a stack, empty when there is none. */
function firstFrame(error: Error): string {
  return (error.stack ?? '').split('\n').find((line) => line.trimStart().startsWith('at ')) ?? '';
}

/** The line number a V8 frame points at. */
function lineOf(frame: string): number {
  return Number(/:(\d+):\d+\)?$/.exec(frame)?.[1]);
}

/** Stands in for an emission helper: it captures at its own entry, naming itself as the boundary. */
function helper(): StackAnchor {
  return captureAnchor(helper);
}

/** The same, on a runtime whose `Error` has no `captureStackTrace` — Bun's JSC, `node:test` on JSC. */
function helperWithoutCapture(): StackAnchor {
  return captureAnchor(helperWithoutCapture, {});
}

describe('captureAnchor', () => {
  it('starts the stack at the line that called the helper', () => {
    const callSite = new Error();
    const anchor = helper();

    const failure = anchor(ownFailure('did not emit'));

    expect(firstFrame(failure)).toContain('error-anchor.spec.ts');
    expect(lineOf(firstFrame(failure))).toBe(lineOf(firstFrame(callSite)) + 1);
  });

  it('keeps the failure a plain Error, message and cause included', () => {
    const cause = new Error('root');
    const failure = helper()(ownFailure('wrapper', { cause }));

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe('wrapper');
    expect(failure.cause).toBe(cause);
    // The brand is bookkeeping; an enumerable one would reach every reporter diff.
    expect(Object.getOwnPropertySymbols(failure).map((brand) => Object.getOwnPropertyDescriptor(failure, brand)?.enumerable)).toEqual([
      false,
    ]);
  });

  it('hands back an error it did not create, stack and all', () => {
    const foreign = new Error('thrown by the code under test');
    const before = foreign.stack;

    expect(helper()(foreign)).toBe(foreign);
    expect(foreign.stack).toBe(before);
  });

  it('trims by name where `Error.captureStackTrace` is missing', () => {
    const failure = helperWithoutCapture()(ownFailure('did not emit'));

    expect(firstFrame(failure)).toContain('error-anchor.spec.ts');
    expect(firstFrame(failure)).not.toContain('helperWithoutCapture');
  });

  it('trims nothing for an anonymous boundary rather than dropping an arbitrary frame', () => {
    const anonymous = Object.defineProperty((): void => undefined, 'name', { value: '' });
    const failure = captureAnchor(anonymous, {})(ownFailure('did not emit'));

    expect(firstFrame(failure)).toContain('error-anchor.ts');
  });
});

describe('anchorOf', () => {
  it('leaves the failure alone when the runtime hands back no stack', () => {
    const failure = ownFailure('did not emit');
    const before = failure.stack;

    expect(anchorOf(undefined, '')(failure).stack).toBe(before);
  });

  it('leaves it alone when the captured stack holds no frame', () => {
    const failure = ownFailure('did not emit');
    const before = failure.stack;

    expect(anchorOf('Error: nothing usable here', '')(failure).stack).toBe(before);
  });

  it('reads JSC frames, which carry no `at` and no header line', () => {
    const anchor = anchorOf('helper@/lib/expect-emission.js:1:1\nspec@/spec/orders.spec.ts:2:2', 'helper');

    expect(anchor(ownFailure('did not emit')).stack).toBe('Error: did not emit\nspec@/spec/orders.spec.ts:2:2');
  });

  it('keeps every frame when the boundary is not among them', () => {
    const anchor = anchorOf('    at somewhere (/a.js:1:1)', 'notOnThisStack');

    expect(anchor(ownFailure('did not emit')).stack).toBe('Error: did not emit\n    at somewhere (/a.js:1:1)');
  });
});
