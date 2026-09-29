import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest';

import { type RunnerHooks, getTestFinishedHook, registerRunnerHooks } from './runner-hooks';

describe('getTestFinishedHook', () => {
  let registered: RunnerHooks | undefined;

  beforeEach(() => {
    registered = globalThis.__vitestAutoSpyRunnerHooks__;
    globalThis.__vitestAutoSpyRunnerHooks__ = undefined;
  });

  afterEach(() => {
    globalThis.__vitestAutoSpyRunnerHooks__ = registered;
  });

  it('prefers the one a runtime entry registered, as the Bun entry does', () => {
    const own = (): void => undefined;

    registerRunnerHooks({ beforeEach, afterEach, onTestFinished: own });

    expect(getTestFinishedHook()).toBe(own);
  });

  it("falls back to Vitest's own module when the registered hooks have none", () => {
    registerRunnerHooks({ beforeEach, afterEach });

    expect(getTestFinishedHook()).toBe(onTestFinished);
  });

  it('falls back to a global one, and to nothing on a runner without it (node:test)', () => {
    const own = (): void => undefined;

    expect(getTestFinishedHook({ onTestFinished: own })).toBe(own);
    expect(getTestFinishedHook({})).toBeUndefined();
  });
});
