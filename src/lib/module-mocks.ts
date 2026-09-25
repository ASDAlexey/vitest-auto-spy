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
import { defineHelper } from './define-helper';
import * as DOCS_LINKS from './docs-links';
import { createFunctionSpy } from './function-spy';
import { withDocs } from './message-link';
import type { Func } from './types';

/**
 * Whether a value is a mock function of *some* runner.
 *
 * Every supported runner hangs its call record off a `mock` property (`vi.fn().mock.calls`,
 * `bun:test`'s `mock()`, `node:test`'s `mock.fn()`), and none of them shares a brand this package
 * could ask for by name — so the shape is what there is to check.
 */
export function isRunnerMock(value: unknown): boolean {
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
   *
   * An **empty** list is rejected rather than accepted: `exports: []` — which is what
   * `Object.keys(stubs)` or a filtered constant produces when it comes out empty — used to take the
   * named-exports branch, find nothing to check and return, so the one call in the file whose job
   * is to prove the mock applied proved nothing.
   */
  exports?: readonly string[];
}

function describeTarget(specifier: string | undefined): string {
  return specifier === undefined ? 'the imported module' : `'${specifier}'`;
}

function isolateIsOff(): boolean {
  const config: unknown = Reflect.get(Object(Reflect.get(globalThis, '__vitest_worker__')), 'config');

  return Reflect.get(Object(config), 'isolate') === false;
}

/** The one cause that fits this run, with its fix. */
function notAppliedCause(): string {
  return isolateIsOff()
    ? 'This worker runs with `isolate: false`, so an earlier file had already loaded the module before this mock ' +
        'could apply — mock it in that file too, or run this file isolated.'
    : 'The code under test reaches the module through another path (a barrel, an alias, a bundled entry) — `vi.mock` ' +
        'the specifier it imports, or pass the dependency in as an argument or a provider.';
}

function mockCall(specifier: string | undefined): string {
  return specifier === undefined ? 'the `vi.mock()` for this module' : `the \`vi.mock('${specifier}')\` for this file`;
}

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
export const assertMocked = defineHelper(<T extends object>(namespace: T, options: AssertMockedOptions = {}): T => {
  const target = describeTarget(options.specifier);
  const required = options.exports;

  if (required?.length === 0) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] assertMocked(${target}): the \`exports\` list is empty, so this call cannot fail and ` +
          'proves nothing. Name the exports the test drives, or drop the option to check that at least one export is a mock.',
        DOCS_LINKS.moduleMocksAssert,
      ),
    );
  }

  if (required) {
    const real = required.filter((name) => !isRunnerMock(Reflect.get(namespace, name)));

    if (real.length > 0) {
      const [first] = real;
      const subject =
        real.length === 1
          ? `${String(first)} is the real ${typeof Reflect.get(namespace, String(first)) === 'function' ? 'function' : 'export'}`
          : `${real.join(', ')} are the real exports`;

      throw new Error(
        withDocs(
          `[vitest-auto-spy] assertMocked(${target}): ${subject} — ${mockCall(options.specifier)} did not apply. ${notAppliedCause()}`,
          DOCS_LINKS.moduleMocksNoOp,
        ),
      );
    }

    return namespace;
  }

  if (!Object.values(namespace).some(isRunnerMock)) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] assertMocked(${target}): no export is a mock — ${mockCall(options.specifier)} did not apply. ` +
          notAppliedCause(),
        DOCS_LINKS.moduleMocksNoOp,
      ),
    );
  }

  return namespace;
});

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
  /**
   * Turn every function export into a spy that runs the real function until the test configures it.
   * Default `false`. Pass the actual module — `moduleNamespace(await importOriginal(), { passthrough: true })`
   * — for Vitest's `{ spy: true }` with `calledWith` and `resolveWith` on top. Classes and values stay as they are.
   */
  passthrough?: boolean;
}

// A class is left real: calling it through a spy would drop `new`, and `mockConstructor` is the double for it.
function isPlainFunction(value: unknown): value is Func {
  return typeof value === 'function' && !Function.prototype.toString.call(value).startsWith('class');
}

function spyThrough<T extends object>(exports: T): T {
  const spied: T = { ...exports };

  Object.entries(spied).forEach(([name, value]: [string, unknown]) => {
    if (isPlainFunction(value)) {
      Reflect.set(
        spied,
        name,
        createFunctionSpy(name, { className: undefined, handle: (call) => Reflect.apply(value, undefined, call.args) }),
      );
    }
  });

  return spied;
}

/**
 * A module mock's exports, plus the `default` an interop probe looks for.
 *
 * A factory that spells out its own `default` keeps it: a module whose default export is the thing
 * under test (`dayjs`, a class from `shaka-player`) is the common case, and handing the interop probe
 * the namespace instead used to turn `default(…)` into `default is not a function` — the very failure
 * this helper exists to remove.
 */
export type ModuleNamespace<T extends object> = T & { default: T extends { default: infer Default } ? Default : T; __esModule: true };

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
 * @param given What the mocked module exposes.
 * @param options See {@link ModuleNamespaceOptions.lenient} and {@link ModuleNamespaceOptions.passthrough}.
 */
export function moduleNamespace<T extends object>(given: T, options: ModuleNamespaceOptions = {}): ModuleNamespace<T> {
  const exports = options.passthrough ? spyThrough(given) : given;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the conditional in `ModuleNamespace` says exactly this, and no literal can carry a type that depends on a runtime `in` check.
  const namespace = { ...exports, default: 'default' in exports ? exports.default : exports, __esModule: true } as ModuleNamespace<T>;

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
