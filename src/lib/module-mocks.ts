/**
 * The two halves of "the module mock did nothing": proving it applied, and giving it a shape the
 * code under test recognises.
 *
 * `vi.mock()` is the one piece of a ported suite that can fail *silently*. It is a compile-time
 * transform over the module graph, so it has nothing to say when the graph does not look the way
 * the spec assumes:
 *
 *  - **Under a bundler** — `@angular/build:unit-test`, `vite-node` fed a pre-built entry, any setup
 *    where Vitest receives a bundle rather than the source — a workspace alias or a barrel has
 *    already been inlined by the time the mock would be installed. The call is a no-op, the real
 *    implementation runs, and the test either passes for the wrong reason or fails somewhere
 *    unrelated to mocking.
 *  - **Under `isolate: false`** a built-in (`node:fs`) may already sit in the worker's graph,
 *    mocked for whichever file got there first — which makes the same spec pass or fail depending
 *    on run order.
 *
 * {@link assertMocked} turns both into a failure at the line that assumed the mock, naming the
 * specifier. {@link moduleNamespace} covers the other half: a factory whose result satisfies the
 * `mod.default ?? mod` interop probe that any CJS-and-ESM-capable dependency performs, and
 * optionally the Jest-shaped leniency where an export nobody stubbed reads as `undefined` instead
 * of throwing.
 */
import { DOCS_LINKS, withDocs } from './docs-links';

/**
 * Whether a value is a mock function of *some* runner.
 *
 * Every supported runner hangs its call record off a `mock` property (`vi.fn().mock.calls`,
 * `bun:test`'s `mock()`, `node:test`'s `mock.fn()`), and none of them shares a brand this package
 * could ask for by name — so the shape is what there is to check.
 */
function isRunnerMock(value: unknown): boolean {
  if (typeof value !== 'function') {
    return false;
  }

  // `Reflect.get` rather than a property read: the runners define `mock` as a non-enumerable
  // accessor, so a spread or an `Object.assign` probe would not see it at all.
  const mock: unknown = Reflect.get(value, 'mock');

  return typeof mock === 'object' && mock !== null;
}

/** Options for {@link assertMocked}. */
export interface AssertMockedOptions {
  /** The specifier the spec passed to `vi.mock`, quoted back in the failure. */
  specifier?: string;
  /**
   * Names that must be mocks, rather than "at least one export is".
   *
   * Worth naming when the factory stubs part of a module and re-exports the rest: without a list,
   * a factory that lost the one export the test drives still looks mocked.
   */
  exports?: readonly string[];
}

function describeTarget(specifier: string | undefined): string {
  return specifier === undefined ? 'the imported module' : `'${specifier}'`;
}

const SILENT_NO_OP_CAUSES =
  'A `vi.mock()` that does not apply reports nothing: under a bundler (`@angular/build:unit-test`, a ' +
  'pre-bundled `vite-node` entry) a workspace alias or a barrel is already inlined when the mock would be ' +
  'installed, and under `isolate: false` a module already in the worker graph keeps whichever mock got ' +
  'there first. Pass the dependency in through DI or an argument instead of mocking its module.';

/**
 * Fail now, naming the module, if the `vi.mock()` this spec relies on did not take effect.
 *
 * ```ts
 * import * as engine from '@app/pricing-engine';
 *
 * vi.mock('@app/pricing-engine');
 *
 * beforeEach(() => {
 *   assertMocked(engine, { specifier: '@app/pricing-engine', exports: ['createEngine'] });
 * });
 * ```
 *
 * @param namespace The module namespace object the spec imported.
 * @param options The specifier to name in the message, and the exports that must be mocks.
 * @returns `namespace`, so the check can wrap the import at the point of use.
 */
export function assertMocked<T extends object>(namespace: T, options: AssertMockedOptions = {}): T {
  const target = describeTarget(options.specifier);
  const required = options.exports;

  if (required) {
    const real = required.filter((name) => !isRunnerMock(Reflect.get(namespace, name)));

    if (real.length > 0) {
      throw new Error(
        withDocs(
          `[vitest-auto-spy] assertMocked(${target}): ${real.join(', ')} ${real.length === 1 ? 'is' : 'are'} not a mock, ` +
            `so the code under test is calling the real implementation. ${SILENT_NO_OP_CAUSES}`,
          DOCS_LINKS.moduleMocks,
        ),
      );
    }

    return namespace;
  }

  if (!Object.values(namespace).some(isRunnerMock)) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] assertMocked(${target}): nothing in the module namespace is a mock function, ` +
          `so the mock did not apply. ${SILENT_NO_OP_CAUSES}`,
        DOCS_LINKS.moduleMocks,
      ),
    );
  }

  return namespace;
}

/** Options for {@link moduleNamespace}. */
export interface ModuleNamespaceOptions {
  /**
   * Read an export the factory did not define as `undefined` instead of throwing. Default `false`.
   *
   * Vitest guards a factory result and fails on an unknown key (`No "x" export is defined on the
   * mock`), which is the better default: it catches a factory that drifted from the module. Jest
   * did not, so a suite ported from it can be reaching for exports it never stubbed — and there the
   * guard fails inside production code, several frames from the assertion that would have said
   * what the test actually wanted. Turn it on to port first and tighten later.
   */
  lenient?: boolean;
}

/** A module mock's exports, plus the `default` an interop probe looks for. */
export type ModuleNamespace<T extends object> = T & { default: T; __esModule: true };

/**
 * Build the object a `vi.mock` factory should return, with `default` and `__esModule` in place.
 *
 * ```ts
 * vi.mock('shaka-player', () => moduleNamespace({ Player: mockConstructor(() => playerStub) }));
 * ```
 *
 * The missing `default` is the failure this removes. Any dependency written to run as both CommonJS
 * and ESM probes itself with `mod.default ?? mod`, and a factory returning bare named exports makes
 * Vitest throw `No "default" export is defined on the mock` — from inside that dependency, with a
 * stack that names the library rather than the factory three lines up in the spec.
 *
 * @param exports What the mocked module exposes.
 * @param options See {@link ModuleNamespaceOptions.lenient}.
 */
export function moduleNamespace<T extends object>(exports: T, options: ModuleNamespaceOptions = {}): ModuleNamespace<T> {
  const namespace: ModuleNamespace<T> = { ...exports, default: exports, __esModule: true };

  if (!options.lenient) {
    return namespace;
  }

  return new Proxy(namespace, {
    // Vitest's own guard is `prop in factoryResult`, so leniency has to answer `has` — returning
    // the value from `get` alone would never be asked for.
    has: (target, property): boolean => Reflect.has(target, property) || isLenientKey(property),
    get: (target, property, receiver): unknown => (Reflect.has(target, property) ? Reflect.get(target, property, receiver) : undefined),
  });
}

/**
 * Which absent keys the lenient namespace claims to have.
 *
 * Symbols are excluded because the runtime asks for them to decide what the object *is* —
 * `Symbol.toStringTag`, `Symbol.iterator`, `Symbol.toPrimitive` — and answering "yes" to all of
 * them turns a namespace into something the host mis-handles. `then` is excluded for the same
 * reason and more sharply: `await import(…)` treats a thenable namespace as a promise to unwrap,
 * so claiming it would hang the import that loads the mock.
 */
function isLenientKey(property: string | symbol): boolean {
  return typeof property === 'string' && property !== 'then';
}
