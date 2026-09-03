/**
 * `vitest-auto-spy/rxjs` — the optional rxjs-powered observable layer.
 *
 * ```ts
 * import 'vitest-auto-spy/rxjs'; // once, e.g. in your test setup
 * ```
 *
 * Importing this module registers the observable spy helpers with the
 * framework-agnostic core (via inversion of control), enabling
 * `observablePropsToSpyOn`, `nextWith`, `nextWithValues`, `throwWith`,
 * `complete`, `returnSubject`, `nextWithPerCall`, … on spies created through
 * `createSpyFromClass`. Without this import the core stays completely free of any
 * runtime rxjs dependency.
 *
 * It also re-exports {@link createObservableWithValues} and the observable type
 * surface for convenience.
 *
 * **This module is also where rxjs enters the type system, and the only one.** The core's
 * declarations name no rxjs type — see `ObservableLike` in `lib/types.ts` for the measurement that
 * forced it — so `returnSubject()` is typed `SubjectOf<T>`, which is a structural `SubjectLike<T>`
 * until the augmentation below merges rxjs's own `Subject<T>` into `AutoSpyRxjsTypes`. Importing
 * this module is what registers the helpers at runtime *and* what makes them rxjs-typed; the two
 * cannot drift apart, because it is one import.
 */
import type { Subject } from 'rxjs';

import { addObservableHelpersToCalledWithObject, addObservableHelpersToFunctionSpy, createObservablePropSpy } from './lib/observable-spy';
import { registerObservableSupport } from './lib/observable-support';

declare module 'vitest-auto-spy' {
  interface AutoSpyRxjsTypes<T> {
    subject: Subject<T>;
  }
}

registerObservableSupport({
  addToFunctionSpy: addObservableHelpersToFunctionSpy,
  addToCalledWithObject: addObservableHelpersToCalledWithObject,
  createPropSpy: createObservablePropSpy,
});

export { createObservableWithValues } from './lib/observable-spy';

export type {
  AddObservableSpyMethods,
  CompleteValueConfig,
  ErrorValueConfig,
  NextValueConfig,
  ValueConfig,
  ValueConfigPerCall,
} from './lib/types';
