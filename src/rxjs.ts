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
 */
import { addObservableHelpersToCalledWithObject, addObservableHelpersToFunctionSpy, createObservablePropSpy } from './lib/observable-spy';
import { registerObservableSupport } from './lib/observable-support';

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
