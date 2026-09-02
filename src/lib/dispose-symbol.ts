/**
 * The `Symbol.dispose` every double is keyed by — installed first when the realm does not have it.
 *
 * `using spy = createSpyFromClass(X)` needs `Symbol.dispose` to exist as a *global*, not merely as a
 * key this package agrees on: TypeScript downlevels `using` to `tslib.__addDisposableResource`,
 * which reads `Symbol.dispose` off the global `Symbol` and throws `TypeError: Symbol.dispose is not
 * defined.` before it ever looks at the resource. So a double that carries the hook is not enough.
 *
 * On Node 22 the global is missing in exactly the realm the tests run in. V8 12.4 has no explicit
 * resource management, so Node 22 supplies `Symbol.dispose` itself — as `Symbol.for('nodejs.dispose')`,
 * patched onto the main realm only. Vitest's `jsdom` / `happy-dom` environments put the *jsdom* realm's
 * intrinsics on `globalThis`, and that realm is a bare `vm` context: `Symbol.dispose` is `undefined`
 * there, `using` throws, and `spy[Symbol.dispose]` degrades into a property literally named
 * `"undefined"`. Node 24 has it natively in V8, in every realm, which is why the same suite passes
 * there and fails one version down.
 *
 * The shim is `Symbol.for('nodejs.dispose')` rather than a fresh `Symbol('Symbol.dispose')` on
 * purpose: the symbol registry is shared by every realm of an agent, so the shim *is* the symbol
 * Node 22 already uses in its main realm. A `FileHandle` disposed inside a jsdom test and a spy
 * disposed next to it then resolve the same key, and a second copy of this package installing the
 * shim in another realm agrees with the first instead of quietly using a different symbol.
 */

/** The key Node 22 registers its own `Symbol.dispose` under. */
export const NODE_DISPOSE_KEY = 'nodejs.dispose';

/**
 * Return `host.dispose`, defining the shim on `host` first if the realm has no `Symbol.dispose`.
 *
 * Takes the host rather than reaching for the global directly so both halves are reachable from a
 * spec: the branch that runs on a modern runtime is the one the suite executes, and the branch that
 * matters on Node 22 is exercised against a stand-in `Symbol` object.
 *
 * Defined `configurable`, so a harness that wants the realm back as it found it can delete it, and
 * non-enumerable and non-writable, which is the shape a native well-known symbol has.
 */
export function installDisposeSymbol(host: object): symbol {
  const existing: unknown = Reflect.get(host, 'dispose');

  if (typeof existing === 'symbol') {
    return existing;
  }

  const shim = Symbol.for(NODE_DISPOSE_KEY);

  Object.defineProperty(host, 'dispose', { value: shim, enumerable: false, configurable: true, writable: false });

  return shim;
}

/**
 * The dispose key this package defines on, and answers, on every double.
 *
 * Read it instead of `Symbol.dispose` in library code: the constant is what forces this module — and
 * with it the install above — to load before the first double is built.
 *
 * Typed as the well-known symbol rather than as a plain `symbol` so it can key a class member —
 * TypeScript accepts a computed member name only from a literal or `unique symbol` type, and
 * {@link ObserverSpy} declares its `[DISPOSE]()` that way.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `installDisposeSymbol` takes any host, so it can only promise `symbol`; called on the global `Symbol` it returns that realm's own `Symbol.dispose`, or the registered shim standing in for it. The `unique symbol` type is what lets the constant key a class member — see {@link DISPOSE}.
export const DISPOSE: typeof Symbol.dispose = installDisposeSymbol(Symbol) as typeof Symbol.dispose;
