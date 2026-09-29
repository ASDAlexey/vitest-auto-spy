/**
 * Where a runner-agnostic helper finds `beforeEach` / `afterEach`. The slot is worker-wide, so every
 * test puts back what it found.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAutoMock } from './auto-mock';
import { registerMockAdapter } from './mock-adapter';
import { type RunnerHooks, getRunnerHooks, registerRunnerHooks } from './runner-hooks';
import { vitestMockAdapter } from './vitest-adapter';

registerMockAdapter(vitestMockAdapter);

describe('getRunnerHooks', () => {
  let registered: RunnerHooks | undefined;

  beforeEach(() => {
    registered = globalThis.__vitestAutoSpyRunnerHooks__;
    globalThis.__vitestAutoSpyRunnerHooks__ = undefined;
  });

  afterEach(() => {
    globalThis.__vitestAutoSpyRunnerHooks__ = registered;
  });

  it('prefers the hooks a runtime entry registered', () => {
    const own = createAutoMock<RunnerHooks>();

    registerRunnerHooks(own);

    expect(getRunnerHooks('helper()')).toBe(own);
  });

  it("falls back to Vitest's own module", () => {
    const found = getRunnerHooks('helper()');

    expect(found.beforeEach).toBe(beforeEach);
    expect(found.afterEach).toBe(afterEach);
  });

  it("falls back to the runner's globals", () => {
    expect(getRunnerHooks('helper()', { beforeEach, afterEach }).beforeEach).toBe(beforeEach);
  });

  it('names the helper and the entries to import when no runner offers hooks', () => {
    expect(() => getRunnerHooks('useConsoleSpies()', { afterEach })).toThrow(
      "[vitest-auto-spy] useConsoleSpies() found no beforeEach / afterEach to register. Import your runner's entry first",
    );
  });
});
