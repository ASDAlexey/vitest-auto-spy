/**
 * Type-level tests for the rxjs seam — the half of it a consumer *without* the observable layer
 * sees.
 *
 * This program is the point. `tsconfig.types.json` includes the type tests and the sources' `.d.ts`
 * and nothing else, and nothing here imports `../rxjs`, so `AutoSpyRxjsTypes` is unaugmented
 * exactly as it is in a React / Vue / Svelte / Node consumer's program. The augmented half is
 * asserted in `lib/types.spec.ts`, which is compiled by `npm run typecheck` in the `src/**` program
 * where `../rxjs` *is* present — one shape per program, because a module augmentation is
 * program-wide and the two cannot be checked in one.
 *
 * What is being defended: `dist/types-*.d.ts` used to open with
 * `import { Observable, Subject } from 'rxjs'`, which pulled 189 rxjs `.d.ts` files into every
 * consumer's program (303 files against 114 for the same fixture today) and raised `TS2307` for
 * anyone without the optional peer and `skipLibCheck: false`. `import type` was measured and fixes
 * neither half. `scripts/check-dist.mjs` keeps the reference out of the build; these keep the
 * *meaning* — detection still has to fire on an rxjs `Observable` and still has to miss the things
 * that are not one.
 */
import { EMPTY, type Observable, type Subject } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';

import { createAutoMock } from '../auto-spy';
import type { ObservableLike, Spy, SubjectLike, SubjectOf } from '../auto-spy';

interface Catalogue {
  items$: Observable<string[]>;
  load(id: number): Observable<string>;
  save(id: number): Promise<void>;
}

/** Subscribable, but not an observable: `OutputEmitterRef` and `EventTarget` have this shape. */
interface ListenerOnly {
  subscribe(next: (value: number) => void): { unsubscribe(): void };
}

interface NotAnObservable {
  emitter: ListenerOnly;
  rows: string[];
  ready(): boolean;
}

describe('structural detection', () => {
  it('still picks the observable bundle for an rxjs `Observable`, with no rxjs named in the declarations', () => {
    const catalogue = createAutoMock<Catalogue>();

    expectTypeOf(catalogue.load.nextWith).parameter(0).toEqualTypeOf<string | undefined>();
    expectTypeOf(catalogue.items$.nextWith).parameter(0).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(catalogue.save.resolveWith).parameter(0).toEqualTypeOf<undefined | void>();
  });

  it('leaves a subscribe-only emitter alone', () => {
    const model = createAutoMock<NotAnObservable>();

    // `OutputEmitterRef` speaks `subscribe(callback)` and nothing else. Widening detection to
    // `subscribe` would have made every Angular `output()` an observable property; keying it on
    // `forEach` is what keeps that from happening.
    expectTypeOf(model.emitter).toEqualTypeOf<ListenerOnly>();
    expectTypeOf(model.rows).toEqualTypeOf<string[]>();
  });

  it('accepts an rxjs `Observable` where `ObservableLike` is asked for', () => {
    expectTypeOf(EMPTY).toExtend<ObservableLike<never>>();
  });
});

describe('`SubjectOf<T>` without the observable layer', () => {
  it('falls back to the structural `SubjectLike`, not to rxjs', () => {
    expectTypeOf<SubjectOf<string>>().toEqualTypeOf<SubjectLike<string>>();
  });

  it('still drives the stream, which is what the helper is for', () => {
    const catalogue = createAutoMock<Catalogue>();
    const subject = catalogue.load.returnSubject();

    expectTypeOf(subject.next).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(subject.complete).toEqualTypeOf<() => void>();
    expectTypeOf(catalogue.load.nextWithPerCall()).toEqualTypeOf<SubjectLike<string>[]>();
  });

  it('does not hand back something assignable to an rxjs `Subject`', () => {
    // The break this major is for. `Subject` is nominal — `private currentObservers` — so no
    // hand-written stand-in is assignable *to* it, and a suite that annotates the result has to
    // put `import 'vitest-auto-spy/rxjs'` somewhere its `tsconfig` can see.
    expectTypeOf<SubjectOf<string>>().not.toExtend<Subject<string>>();
  });

  it('types a spy the same way whether or not the layer is loaded, apart from the subject', () => {
    expectTypeOf<Spy<Catalogue>['load']['nextWith']>().toEqualTypeOf<(value?: string) => void>();
  });
});
