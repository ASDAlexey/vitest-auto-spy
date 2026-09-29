/**
 * The per-test hooks of whichever runner is loading the library.
 *
 * `/console` and `/nestjs` run on every runner, so neither may import `vitest`: on `node:test` and
 * Rstest it is usually not installed, and a static import fails before any code runs. Each runtime
 * entry registers its runner's hooks here instead; on Vitest the runner publishes its own module on
 * `globalThis`, which is where those entries find `vi` and the hooks when nothing registered them.
 */
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';

type Hook = () => void;

/** The two per-test hooks a helper that installs and restores something needs. */
export interface RunnerHooks {
  beforeEach(hook: Hook): unknown;
  afterEach(hook: Hook): unknown;
  /** A cleanup for the running test only; Bun registers it, Vitest publishes it, node:test has none. */
  onTestFinished?(hook: Hook): unknown;
}

// On `globalThis`: `/node` is a solo bundle and `/console` a chunked one, so module state is not shared.
declare global {
  // A `globalThis` augmentation has to be declared with `var`.
  var __vitestAutoSpyRunnerHooks__: RunnerHooks | undefined;
}

/** Called by a runtime entry on import. */
export function registerRunnerHooks(hooks: RunnerHooks): void {
  globalThis.__vitestAutoSpyRunnerHooks__ = hooks;
}

export function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function';
}

function hooksOf(host: unknown): RunnerHooks | undefined {
  const before: unknown = Reflect.get(Object(host), 'beforeEach');
  const after: unknown = Reflect.get(Object(host), 'afterEach');

  return isFunction(before) && isFunction(after) ? { beforeEach: before, afterEach: after } : undefined;
}

/**
 * The module Vitest's own worker publishes for `import.meta.vitest`, absent on every other runner.
 * `host` is a seam for the specs: a `threads` / `forks` worker defines it non-configurable, so no stub hides it.
 */
export function vitestModule(host: object): unknown {
  return Reflect.get(host, '__vitest_index__');
}

/** The registered hooks, else Vitest's, else the runner's globals (Bun, `globals: true`). */
export function getRunnerHooks(helper: string, host: object = globalThis): RunnerHooks {
  const hooks = globalThis.__vitestAutoSpyRunnerHooks__ ?? hooksOf(vitestModule(host)) ?? hooksOf(host);

  if (hooks === undefined) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] ${helper} found no beforeEach / afterEach to register. Import your runner's entry first ` +
          "('vitest-auto-spy/node', 'vitest-auto-spy/bun' or 'vitest-auto-spy/rstest'), or pair the install and " +
          "restore calls in your runner's own hooks.",
        DOCS_LINKS.installationEntries,
      ),
    );
  }

  return hooks;
}

function isHookRegistrar(value: unknown): value is (hook: Hook) => unknown {
  return typeof value === 'function';
}

/** The running test's `onTestFinished`: registered, else Vitest's, else a global one, else `undefined`. */
export function getTestFinishedHook(host: object = globalThis): ((hook: Hook) => unknown) | undefined {
  return [globalThis.__vitestAutoSpyRunnerHooks__, vitestModule(host), host]
    .map((source): unknown => Reflect.get(Object(source), 'onTestFinished'))
    .find(isHookRegistrar);
}
