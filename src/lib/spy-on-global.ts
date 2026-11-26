import { createFunctionSpy } from './function-spy';
import { mockValueProp } from './prop-mock';
import type { Func, FunctionSpy, OnlyMethodKeysOf } from './types';

type Globals = typeof globalThis;

export function spyOnGlobal<K extends OnlyMethodKeysOf<Globals>>(key: K): FunctionSpy<Extract<Globals[K], Func>> {
  const spy = createFunctionSpy<Extract<Globals[K], Func>>(key);

  mockValueProp(globalThis, key, spy);

  return spy;
}
