/**
 * The symbol Angular hangs a signal's reactive node under, read structurally.
 *
 * `import { ɵSIGNAL } from '@angular/core'` is a link-time dependency on a private export: an
 * Angular major that renames or drops it fails the whole entry at import, before any helper runs.
 * A namespace lookup degrades to the symbol found on a signal itself, and after that to a key no
 * signal carries, so every read answers `undefined` and the internals canary names the Angular.
 */
import * as angularCore from '@angular/core';

export function findSignalSymbol(angular: object): symbol {
  const named: unknown = Reflect.get(angular, 'ɵSIGNAL');

  if (typeof named === 'symbol') {
    return named;
  }

  const create: unknown = Reflect.get(angular, 'signal');
  const probe: unknown = typeof create === 'function' ? create(0) : undefined;
  const carried = typeof probe === 'function' ? Object.getOwnPropertySymbols(probe)[0] : undefined;

  return carried ?? Symbol('ɵSIGNAL');
}

let cached: symbol | undefined;

export function signalSymbol(): symbol {
  cached ??= findSignalSymbol(angularCore);

  return cached;
}

export function readSignalSymbol(holder: object): unknown {
  return Reflect.get(holder, signalSymbol());
}
