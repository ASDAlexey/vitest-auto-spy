/**
 * Inversion-of-control seam that keeps the framework-agnostic core free of any
 * direct test-runner import.
 *
 * The single runtime dependency of the core used to be Vitest's `vi.fn()` /
 * `vi.spyOn()`. Those are now hidden behind the {@link MockAdapter} interface:
 * the core (`function-spy.ts`, `accessor-spy.ts`, the Angular accessor helper)
 * asks the registry for the active adapter instead of importing `vitest`.
 *
 * A public entry registers an adapter on import — `vitest-auto-spy` registers
 * the default {@link vitest-adapter Vitest adapter}, keeping the package
 * zero-config — while future entries (`vitest-auto-spy/bun`, `…/node`) register
 * their own adapter over the very same core. This is the same refactor spirit as
 * the rxjs decouple in `observable-support.ts`.
 */
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { registerPackageCopy } from './package-identity';
import type { Func } from './types';

// Every entry bundles this module, so importing any of them records which install of the library
// was loaded. `setupAutoSpy()` turns two recorded installs into an actionable failure instead of
// the order-dependent breakage that split spies produce.
registerPackageCopy();

/**
 * A host-runner mock function: a callable spy (Vitest `vi.fn()`, Bun `mock()`,
 * `node:test` `mock.fn()`). The host's own richer surface (`.mock`,
 * `mockReturnValue`, …) lives on the concrete object; the core treats it as a
 * plain callable and reads/resets it only through the adapter.
 */
export type MockFn = Func;

/**
 * The runtime-specific mock primitives the core needs. Each test runner ships
 * one implementation; the core never learns which.
 */
export interface MockAdapter {
  /** Create a mock function wrapping `implementation` (a no-op when omitted), optionally named for diagnostics. */
  createMockFn(implementation?: Func, name?: string): MockFn;
  /** Wrap the `get` accessor of `target[property]` with a spy, returning the mock. */
  spyOnGetter(target: object, property: string): MockFn;
  /** Wrap the `set` accessor of `target[property]` with a spy, returning the mock. */
  spyOnSetter(target: object, property: string): MockFn;
  /** The recorded argument tuples of a mock created by this adapter. */
  getCalls(mock: MockFn): readonly unknown[][];
  /** Reset a mock created by this adapter (clears its recorded calls and any configured implementation). */
  reset(mock: MockFn): void;
  /** Clear a mock's recorded calls only, preserving its implementation. */
  clear(mock: MockFn): void;
  /**
   * Re-install `implementation` as the mock's implementation, discarding any
   * host-level `mockReturnValue` / `mockImplementation` override. Used by
   * {@link resetAutoSpy} to revert a function spy to its library dispatch — a
   * plain `clear` (`mockClear`) cannot, and a full `reset` (`mockReset`) would
   * wipe the dispatch itself.
   */
  restoreImplementation(mock: MockFn, implementation: Func): void;
}

let registeredAdapter: MockAdapter | undefined;

/** Called once by a public entry on import to install the active mock adapter. */
export function registerMockAdapter(adapter: MockAdapter): void {
  registeredAdapter = adapter;
}

/**
 * Whether an entry has already registered an adapter. `useVitestAdapter()` checks
 * this before installing the default Vitest adapter, so importing a Vitest entry
 * never stomps a runtime adapter installed by `vitest-auto-spy/bun` / `…/node`.
 */
export function hasMockAdapter(): boolean {
  return registeredAdapter !== undefined;
}

/**
 * Forget the registered adapter.
 *
 * Internal — no public entry re-exports the registry. It exists because the registry is
 * *process-wide*: a spec that exercises the "nothing registered yet" path cannot rely on its file
 * being the first to touch it (under `isolate: false` every spec shares one module graph), so it
 * has to empty the registry itself and put the previous adapter back afterwards.
 */
export function resetMockAdapter(): void {
  registeredAdapter = undefined;
}

/** Which runner is loading the core, and the entry that registers its adapter. */
interface RuntimeEntry {
  runner: string;
  entry: string;
  where: string;
  link: string;
}

function detectRuntime(host: object): RuntimeEntry | undefined {
  const env: unknown = Reflect.get(Object(Reflect.get(host, 'process')), 'env');
  const envFlag = (name: string): unknown => Reflect.get(Object(env), name);

  if (envFlag('RSTEST') !== undefined) {
    return { runner: 'Rstest', entry: 'vitest-auto-spy/rstest', where: 'a `setupFiles` entry', link: DOCS_LINKS.installationRstest };
  }

  if (envFlag('VITEST') !== undefined || Reflect.get(host, '__vitest_worker__') !== undefined) {
    return { runner: 'Vitest', entry: 'vitest-auto-spy', where: 'the `setupFiles` entry', link: DOCS_LINKS.installationVitest };
  }

  if (Reflect.get(host, 'Bun') !== undefined) {
    return {
      runner: 'bun:test',
      entry: 'vitest-auto-spy/bun',
      where: 'a preload (bunfig.toml, [test] preload)',
      link: DOCS_LINKS.installationBun,
    };
  }

  const execArgv: unknown = Reflect.get(Object(Reflect.get(host, 'process')), 'execArgv');

  if (envFlag('NODE_TEST_CONTEXT') !== undefined || (Array.isArray(execArgv) && execArgv.includes('--test'))) {
    return {
      runner: 'node:test',
      entry: 'vitest-auto-spy/node',
      where: 'a file loaded with `--import`',
      link: DOCS_LINKS.installationNode,
    };
  }

  return undefined;
}

/**
 * The message for a spy built before any entry registered an adapter, naming the one import this
 * runner needs. `host` is a parameter so the spec can stand in for each runtime.
 */
export function missingAdapterMessage(host: object = globalThis): string {
  const runtime = detectRuntime(host);

  if (runtime === undefined) {
    return withDocs(
      '[vitest-auto-spy] No mock adapter registered: a spy was built before any runtime entry was imported. ' +
        "Import the entry for your runner first — 'vitest-auto-spy' (Vitest), 'vitest-auto-spy/bun', " +
        "'vitest-auto-spy/node' or 'vitest-auto-spy/rstest'.",
      DOCS_LINKS.installationEntries,
    );
  }

  return withDocs(
    `[vitest-auto-spy] No mock adapter registered: a spy was built before '${runtime.entry}' was imported. ` +
      `This is ${runtime.runner} — import the factories from '${runtime.entry}', in the spec or once in ${runtime.where}.`,
    runtime.link,
  );
}

/** The active mock adapter, throwing an actionable hint if no entry registered one. */
export function getMockAdapter(): MockAdapter {
  if (!registeredAdapter) {
    throw new Error(missingAdapterMessage());
  }

  return registeredAdapter;
}
