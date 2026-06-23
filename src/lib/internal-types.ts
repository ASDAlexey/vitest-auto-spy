/**
 * Internal value containers — the mutable state behind a single function spy.
 *
 * Not part of the public API; consumed by the function/promise/observable spy
 * factories to decide what a spy returns when invoked.
 */
import type { Observable } from 'rxjs';

import type { ArgsMap } from './args-map';

/** A single pre-wrapped value used by the `*PerCall` helpers, consumed one per call. */
export interface PerCallValue {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a per-call value is an opaque Promise/Observable of arbitrary element type produced by the spy decorators; the element type is not known here.
  wrappedValue: Observable<any> | Promise<any>;
}

/** What a spy returns when invoked (unless overridden by a `calledWith` match). */
export interface ReturnValueContainer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- holds the raw fake value (sync value, Promise, or Observable) of arbitrary element type assembled dynamically by the spy decorators.
  value: any;
  _isRejectedPromise?: boolean;
  valuesPerCalls?: PerCallValue[];
}

/** Backing object for a `calledWith` / `mustBeCalledWith` chain. */
export interface CalledWithObject {
  wasConfigured: boolean;
  argsToValuesMap: ArgsMap;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the promise/observable decorators dynamically attach arbitrary helper methods (resolveWith, nextWith, …) onto this object; the index signature models that open, dynamically-assembled shape.
  [extra: string]: any;
}
