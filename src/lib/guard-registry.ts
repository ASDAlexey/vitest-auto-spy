// Guards add steps to ordered lists instead of registering hooks: the runner charges a promise and a
// deadline timer per hook per test, so one `beforeEach` and one `afterEach` walk every list.
import { beforeEach } from 'vitest';

import type { TeardownStep } from './setup-teardown';

/** The part of the runner's test context the steps read. */
export interface HookContext {
  readonly task?: unknown;
}

export type OpenStep = (context: HookContext) => void;

export interface GuardRegistry {
  /** Run in order by the one `beforeEach`. */
  readonly open: OpenStep[];
  /** Run in order by the one `afterEach`; see `runTeardown` for how a throw is handled. */
  readonly teardown: TeardownStep[];
  /** The teardown steps that put the environment back, re-run by the net when the `afterEach` never started. */
  readonly restores: TeardownStep[];
}

/** Registered now, so the steps run ahead of every hook registered after this call, whenever they are added. */
export function createGuardRegistry(): GuardRegistry {
  const registry: GuardRegistry = { open: [], teardown: [], restores: [] };

  beforeEach((context) => {
    for (const step of registry.open) {
      step(context);
    }
  });

  return registry;
}

/** A teardown step the net re-runs as well. */
export function addRestore(registry: GuardRegistry, step: TeardownStep): void {
  registry.teardown.push(step);
  registry.restores.push(step);
}
