/**
 * `createChangeDetectorRefDouble()` — a `ChangeDetectorRef` whose four methods are spies answering
 * `undefined`, configured as such so a `strict` suite does not fail on them.
 *
 * `createSpyFromClass(ChangeDetectorRef)` finds nothing: the class is abstract and its prototype is
 * empty, so the hand-written `{ markForCheck: vi.fn() }` is what suites use — knowing one member of
 * four. The limit of either is Angular's, and worth stating: a component, directive or pipe that
 * **the template instantiates** gets its `ChangeDetectorRef` from its view, never from a provider, so
 * `provideChangeDetectorRefDouble()` reaches only what is built through an environment injector —
 * `TestBed.runInInjectionContext(() => new FormatPipe())`, a service, or a class built with `new`.
 */
import { ChangeDetectorRef, type FactoryProvider } from '@angular/core';

import { createSpyFromClass } from './create-spy-from-class';
import type { Spy } from './types';

const METHODS = ['markForCheck', 'detach', 'detectChanges', 'reattach'] as const;

/**
 * The double without a `TestBed`.
 *
 * ```ts
 * const cdr = createChangeDetectorRefDouble();
 * const pipe = new RelativeTimePipe(cdr);
 *
 * pipe.transform(date);
 *
 * expect(cdr.markForCheck).toHaveBeenCalledTimes(1);
 * ```
 */
export function createChangeDetectorRefDouble(): Spy<ChangeDetectorRef> {
  return createSpyFromClass(ChangeDetectorRef, { methodsToSpyOn: [...METHODS], returnsUndefined: [...METHODS] });
}

/**
 * Provide the double under `ChangeDetectorRef` for what an environment injector builds; see the
 * module note for why a template-instantiated class never receives it.
 *
 * ```ts
 * TestBed.configureTestingModule({ providers: [provideChangeDetectorRefDouble()] });
 * const pipe = TestBed.runInInjectionContext(() => new RelativeTimePipe());
 *
 * expect(injectSpy(ChangeDetectorRef).markForCheck).toHaveBeenCalled();
 * ```
 */
export function provideChangeDetectorRefDouble(): FactoryProvider {
  return { provide: ChangeDetectorRef, useFactory: createChangeDetectorRefDouble };
}
