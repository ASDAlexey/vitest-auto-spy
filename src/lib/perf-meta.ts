import type { GuardRegistry } from './guard-registry';

/** Kept in sync with `AUTO_SPY_META_KEY` and `PERF_OUTPUT_ENV` in `src/cli/perf-data.ts`. */
const META_KEY = 'autoSpyMs';
const MEASURING_ENV = 'VITEST_AUTO_SPY_PERF_OUT';

// A teardown restores the spec's performance spy or fake timers before our stop step. Read both
// endpoints from the same original clock, as the TestBed diagnostics do, rather than subtracting
// a fake timestamp from the real worker uptime (or consuming the spec's mock return values).
const now: () => number = performance.now.bind(performance);

function measuring(): boolean {
  const target = globalThis.process?.env?.[MEASURING_ENV];

  return target !== undefined && target !== '';
}

function charge(context: unknown, ms: number): void {
  const task: unknown = Reflect.get(Object(context), 'task');
  const meta: unknown = typeof task === 'object' && task !== null ? Reflect.get(task, 'meta') : undefined;

  if (typeof meta === 'object' && meta !== null) {
    const before: unknown = Reflect.get(meta, META_KEY);

    Reflect.set(meta, META_KEY, (typeof before === 'number' ? before : 0) + ms);
  }
}

/**
 * Times the one `beforeEach` and the one `afterEach` into the test's `task.meta`, so `perf` can tell
 * the library's hooks from the test's own time. Only a measured run pays for it: elsewhere nothing is added.
 */
export function timeGuardHooks(registry: GuardRegistry, enabled: boolean = measuring()): void {
  if (!enabled) {
    return;
  }

  let started = 0;
  const start = (): void => {
    started = now();
  };
  const stop = (context: unknown): void => {
    charge(context, now() - started);
  };

  registry.open.unshift(start);
  registry.open.push(stop);
  registry.teardown.unshift(start);
  registry.teardown.push(stop);
}
