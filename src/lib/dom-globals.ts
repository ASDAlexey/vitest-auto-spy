/**
 * Install browser globals into a runtime that has none.
 *
 * Vitest picks a DOM environment from config (`environment: 'jsdom'`); `bun test` has no such
 * setting — the documented path is a preload that patches `globalThis` before the first test file
 * loads. Angular's `TestBed` needs exactly that and nothing more: `@angular/*` modules import fine
 * without a DOM, and only `platformBrowserTesting()` onwards touches `document`.
 *
 * Nothing here imports a DOM implementation. Each {@link DomRegistrar} is built from an injected
 * loader, so this module stays free of optional peers (`jsdom`, `@happy-dom/global-registrator`),
 * runs under Vitest against fakes, and lets a consumer supply its own DOM in the same shape.
 */
import { DOCS_LINKS, withDocs } from './docs-links';

/** A named strategy that installs browser globals, or throws if its implementation is missing. */
export interface DomRegistrar {
  readonly name: string;
  readonly install: () => Promise<void> | void;
}

/** How {@link registerDomGlobals} decides whether — and with what — to install a DOM. */
export interface RegisterDomGlobalsOptions {
  /** Tried in order; the first one that installs without throwing wins. */
  registrars?: readonly DomRegistrar[];
  /** Detects an existing DOM. Defaults to "`globalThis.document` is defined". */
  hasDom?: () => boolean;
}

/** Keys copied even when the target already defines them — a stale `window` breaks everything after it. */
const FORCED_GLOBALS: readonly string[] = ['window', 'document', 'navigator', 'location', 'history'];

function defaultHasDom(): boolean {
  return typeof globalThis.document !== 'undefined';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Install a DOM into the current runtime, unless one is already there.
 *
 * @returns the name of the registrar that installed it, or `undefined` when a DOM already existed.
 * @throws when every registrar failed — the message names each one and why, because the fix is
 *   always "install the package you meant to use".
 *
 * @example
 * ```ts
 * // in a bun test preload
 * const installed = await registerDomGlobals();
 *
 * // installed === 'happy-dom' | 'jsdom' | undefined (a DOM was already present)
 * ```
 */
export async function registerDomGlobals(options: RegisterDomGlobalsOptions = {}): Promise<string | undefined> {
  const hasDom = options.hasDom ?? defaultHasDom;

  if (hasDom()) {
    return undefined;
  }

  const registrars = options.registrars ?? [];
  const failures: string[] = [];

  for (const registrar of registrars) {
    try {
      await registrar.install();

      return registrar.name;
    } catch (error) {
      failures.push(`  - ${registrar.name}: ${describeError(error)}`);
    }
  }

  throw new Error(
    withDocs(
      `vitest-auto-spy: no DOM could be installed, so Angular's TestBed cannot run.\n` +
        `Install one of the supported implementations (\`bun add -d @happy-dom/global-registrator\` or \`bun add -d jsdom\`).\n` +
        `Tried:\n${failures.join('\n') || '  - (no registrars were configured)'}`,
      DOCS_LINKS.bunAngular,
    ),
  );
}

/**
 * Copy a window object's properties onto a global-like target.
 *
 * {@link FORCED_GLOBALS} always overwrite; everything else is only filled in where the target has
 * no value yet, so a runtime built-in (`fetch`, `URL`, `AbortController`) keeps its native
 * implementation. A property the target refuses to accept is skipped rather than fatal — a locked
 * global is not worth failing a whole test run over.
 *
 * Skipped, but **not** in silence when it is one of {@link FORCED_GLOBALS}: those are the five the
 * DOM is useless without, so a refused `document` means the environment came up half-installed and
 * the first spec that touches it reports `document is not defined` — naming neither this helper nor
 * the property that refused. The rest stay quiet, because a host built-in keeping its own
 * implementation is the documented outcome rather than a problem.
 *
 * @example
 * ```ts
 * copyWindowGlobals(dom.window as unknown as Record<string, unknown>, globalThis as Record<string, unknown>);
 * ```
 */
export function copyWindowGlobals(source: Record<string, unknown>, target: Record<string, unknown>): void {
  const keys = [...FORCED_GLOBALS, ...Object.getOwnPropertyNames(source)];
  const refused: string[] = [];

  for (const key of keys) {
    if (key.startsWith('_')) {
      continue;
    }

    const value = source[key];

    if (value === undefined || (!FORCED_GLOBALS.includes(key) && target[key] !== undefined)) {
      continue;
    }

    try {
      Object.defineProperty(target, key, { value, configurable: true, writable: true, enumerable: true });
    } catch (error) {
      // A non-configurable global (frozen by the host) stays as it is.
      if (FORCED_GLOBALS.includes(key)) {
        refused.push(`${key} (${describeError(error)})`);
      }
    }
  }

  if (refused.length === 0) {
    return;
  }

  // eslint-disable-next-line no-console -- intentional dev-time environment warning; console.warn is allowed per CLAUDE.md.
  console.warn(
    withDocs(
      `[vitest-auto-spy] copyWindowGlobals: the host refused to redefine ${refused.join(', ')}. The DOM is only ` +
        `half-installed, and the failure will arrive later as "document is not defined" or an unrelated jsdom ` +
        `assertion, naming neither this helper nor the property. Something sealed that global before the preload ran.`,
      DOCS_LINKS.bunAngular,
    ),
  );
}

/** The `jsdom` shape {@link createJsdomRegistrar} needs — narrower than the package's own types. */
export interface JsdomModule {
  JSDOM: new (html: string, options?: Record<string, unknown>) => { window: Record<string, unknown> };
}

/** How {@link createJsdomRegistrar} builds and installs its window. */
export interface JsdomRegistrarOptions {
  /** Loads `jsdom`. Kept injectable so this module never depends on the optional peer. */
  load: () => Promise<JsdomModule>;
  /** Where the globals land — `globalThis` in a preload, a throwaway object in a test. */
  target: Record<string, unknown>;
  /** Document URL — Angular's router and `location`-reading code want a real origin. */
  url?: string;
}

/**
 * A {@link DomRegistrar} backed by `jsdom`, the implementation Vitest's `environment: 'jsdom'` uses.
 *
 * @example
 * ```ts
 * await registerDomGlobals({
 *   registrars: [createJsdomRegistrar({ load: () => import('jsdom'), target: globalThis, url: 'https://app.test/' })],
 * });
 * ```
 */
export function createJsdomRegistrar(options: JsdomRegistrarOptions): DomRegistrar {
  return {
    name: 'jsdom',
    install: async (): Promise<void> => {
      const { JSDOM } = await options.load();
      const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: options.url ?? 'http://localhost/',
        pretendToBeVisual: true,
      });

      copyWindowGlobals(dom.window, options.target);
    },
  };
}

/** The `@happy-dom/global-registrator` shape — a module that patches `globalThis` itself. */
export interface GlobalRegistratorModule {
  GlobalRegistrator: { register: () => Promise<void> | void };
}

/** How {@link createGlobalRegistratorRegistrar} loads its registrator. */
export interface GlobalRegistratorOptions {
  name: string;
  load: () => Promise<GlobalRegistratorModule>;
}

/**
 * A {@link DomRegistrar} backed by a self-registering module — the shape
 * `@happy-dom/global-registrator` exposes, and Bun's own documented way to get a DOM.
 *
 * @example
 * ```ts
 * await registerDomGlobals({
 *   registrars: [createGlobalRegistratorRegistrar({ load: () => import('@happy-dom/global-registrator') })],
 * });
 * ```
 */
export function createGlobalRegistratorRegistrar(options: GlobalRegistratorOptions): DomRegistrar {
  return {
    name: options.name,
    install: async (): Promise<void> => {
      const { GlobalRegistrator } = await options.load();

      await GlobalRegistrator.register();
    },
  };
}
