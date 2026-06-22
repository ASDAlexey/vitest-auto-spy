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
  wrappedValue: Promise<any> | Observable<any>;
  delay?: number;
}

/** What a spy returns when invoked (unless overridden by a `calledWith` match). */
export interface ReturnValueContainer {
  value: any;
  _isRejectedPromise?: boolean;
  valuesPerCalls?: PerCallValue[];
}

/** Backing object for a `calledWith` / `mustBeCalledWith` chain. */
export interface CalledWithObject {
  wasConfigured: boolean;
  argsToValuesMap: ArgsMap;
  [extra: string]: any;
}
