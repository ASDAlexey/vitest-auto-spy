/**
 * `Symbol.dispose` is installed before anything reads it.
 *
 * The branch that matters in the field cannot be reached by running the suite on a modern runtime:
 * Node 24 has `Symbol.dispose` natively in every realm, so importing this module there takes the
 * "already present" path. The missing-symbol path — Node 22 under `jsdom`, where the realm is a bare
 * `vm` context and `using` throws `TypeError: Symbol.dispose is not defined.` — is exercised against
 * a stand-in `Symbol` object, which is why `installDisposeSymbol` takes its host as an argument.
 */
import { describe, expect, it } from 'vitest';

import { DISPOSE, NODE_DISPOSE_KEY, installDisposeSymbol } from './dispose-symbol';

describe('installDisposeSymbol', () => {
  it('leaves a realm that already has `Symbol.dispose` alone', () => {
    const host = { dispose: Symbol('existing') };

    expect(installDisposeSymbol(host)).toBe(host.dispose);
  });

  it('defines the registry shim when the realm has none, in the shape of a well-known symbol', () => {
    const host: { dispose?: symbol } = {};

    const installed = installDisposeSymbol(host);

    // The registry, not a fresh `Symbol()`: `Symbol.for` is shared by every realm of the agent, so
    // the shim *is* the symbol Node 22 patched onto its own main realm.
    expect(installed).toBe(Symbol.for(NODE_DISPOSE_KEY));
    expect(host.dispose).toBe(installed);

    expect(Object.getOwnPropertyDescriptor(host, 'dispose')).toEqual({
      value: installed,
      enumerable: false,
      configurable: true,
      writable: false,
    });
  });

  it('is idempotent: the second call reads back what the first defined', () => {
    const host: { dispose?: symbol } = {};

    expect(installDisposeSymbol(host)).toBe(installDisposeSymbol(host));
  });
});

describe('DISPOSE', () => {
  it('is the key `using` resolves in this realm', () => {
    // Importing the module is what guarantees the global exists — on Node 22 under `jsdom` it did
    // not, and `tslib.__addDisposableResource` threw before it ever looked at the double.
    expect(typeof Symbol.dispose).toBe('symbol');
    expect(DISPOSE).toBe(Symbol.dispose);
  });
});
