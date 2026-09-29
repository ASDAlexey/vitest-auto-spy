import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GuardRegistry } from './guard-registry';
import { timeGuardHooks } from './perf-meta';
import { runTeardown } from './setup-teardown';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const registryWith = (): GuardRegistry => ({ open: [() => undefined], teardown: [() => undefined], restores: [] });

const contextOf = (meta: Record<string, unknown>): { task: { meta: Record<string, unknown> } } => ({ task: { meta } });

describe('timeGuardHooks', () => {
  it('adds nothing to a run that is not being measured', () => {
    const registry = registryWith();

    vi.stubEnv('VITEST_AUTO_SPY_PERF_OUT', undefined);
    timeGuardHooks(registry);
    vi.stubEnv('VITEST_AUTO_SPY_PERF_OUT', '');
    timeGuardHooks(registry);

    expect(registry.open).toHaveLength(1);
    expect(registry.teardown).toHaveLength(1);
  });

  it('adds nothing where there is no process to read the variable from', () => {
    const registry = registryWith();

    vi.stubGlobal('process', undefined);
    timeGuardHooks(registry);
    vi.unstubAllGlobals();

    expect(registry.open).toHaveLength(1);
  });

  it('brackets both hooks under a measured run and sums their time into the test meta', () => {
    const registry = registryWith();
    const meta: Record<string, unknown> = {};
    const context = contextOf(meta);

    vi.stubEnv('VITEST_AUTO_SPY_PERF_OUT', '/tmp/perf.json');
    timeGuardHooks(registry);

    expect(registry.open).toHaveLength(3);
    expect(registry.teardown).toHaveLength(3);
    expect(registry.restores).toEqual([]);

    for (const step of registry.open) {
      step(context);
    }

    runTeardown(registry.teardown, context);

    expect(meta['autoSpyMs']).toBeGreaterThanOrEqual(0);
    expect(typeof meta['autoSpyMs']).toBe('number');
  });

  it('adds to a number already there and leaves a context without a task meta alone', () => {
    const registry = registryWith();
    const meta: Record<string, unknown> = { autoSpyMs: 1_000 };

    timeGuardHooks(registry, true);

    for (const step of registry.open) {
      step(contextOf(meta));
    }

    expect(meta['autoSpyMs']).toBeGreaterThanOrEqual(1_000);
    expect(() => {
      runTeardown(registry.teardown, undefined);
      runTeardown(registry.teardown, { task: null });
      runTeardown(registry.teardown, { task: { meta: null } });
      runTeardown(registry.teardown, contextOf({ autoSpyMs: 'x' }));
    }).not.toThrow();
  });
});
