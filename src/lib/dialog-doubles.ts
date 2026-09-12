/**
 * `provideMatDialogData()` / `provideMatDialogRef()` — the Material dialog providers a suite writes
 * by hand, without `@angular/material` becoming a dependency of this package.
 *
 * 36 of them across two private suites are the same three shapes: `useValue: null` or a data object
 * on `MAT_DIALOG_DATA`, `{ close: vi.fn() }` on `MatDialogRef`, and a spy on `MatDialog`. The middle
 * one is where they break. `close` is the only member anybody wrote, so the component that
 * subscribes to `afterClosed()` fails with "is not a function", and the repair written next to it —
 * `afterClosed: () => of('saved')` — answers before anything closed the dialog: the spec then passes
 * whether or not the component ever called `close()`.
 *
 * **Material is not a dependency here and must not become one.** This package ships no runtime
 * dependencies at all, and the dialog is one component library's shape, not Angular's. So the token
 * and the ref class are arguments: nothing in this file imports `@angular/material`, while the data
 * is still typed against the token the spec passed and the result against the `close()` of the class
 * it passed.
 *
 * rxjs is imported here and nowhere else under `vitest-auto-spy/angular`, deliberately: a component
 * pipes `afterClosed()`, so the stream has to be a real `Observable` rather than something
 * subscribable. `@angular/core` has rxjs as a peer dependency of its own, so a suite that can import
 * this entry already has it.
 */
import type { AbstractType, FactoryProvider, InjectionToken, Injector, ValueProvider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Observable, ReplaySubject } from 'rxjs';

import { DOCS_LINKS, withDocs } from './docs-links';
import { createFunctionSpy } from './function-spy';
import type { AddSpyMethodsByReturnTypes } from './types';

/** The half of Material's `MatDialogRef` a double stands in for: how the dialog closes. */
export interface DialogRefLike {
  close(result?: never): void;
}

/**
 * The result of the ref class handed in — the `R` of Material's `MatDialogRef<T, R>`.
 *
 * Read off `close()` rather than declared here, so a ref that names its result
 * (`class ConfirmRef extends MatDialogRef<ConfirmDialog, 'saved' | 'discarded'>`) has `closedWith`
 * checked against it without this file ever seeing Material's own types.
 */
export type DialogResult<Ref> = Ref extends { close(result?: infer R): void } ? R : never;

/**
 * The dialog component the ref was opened for — the `T` of Material's `MatDialogRef<T, R>`.
 *
 * Read off the class's own `componentInstance`, so a stand-in is checked against the component the
 * ref names while `@angular/material` stays unimported here.
 */
export type DialogComponent<Ref> = Ref extends { componentInstance: infer T } ? NonNullable<T> : never;

/** Where the ref double starts. */
export interface MatDialogRefInit<Ref extends DialogRefLike> {
  /**
   * The result `afterClosed()` answers with no component involved — for the ref a spied
   * `dialog.open()` hands back. A dismissal closes with `undefined`, which this field cannot say;
   * `emitClose()` is how a spec expresses that one.
   */
  closedWith?: DialogResult<Ref>;
  /** `ref.disableClose`, which components both read and write. Default `undefined`, as Material leaves it. */
  disableClose?: boolean;
  /**
   * What `ref.componentInstance` answers — the members of the dialog component the opener drives it
   * through, a `save` emitter and an `isSaving` signal being the usual pair. Left out, reading it
   * throws by name rather than handing the opener `undefined`.
   */
  componentInstance?: Partial<DialogComponent<Ref>>;
}

/** The handle a spec drives the dialog through. The ref itself keeps the class's own shape. */
export interface MatDialogRefDouble<Ref extends DialogRefLike> {
  /** The value every injector hands out for the ref class — and what a spied `dialog.open()` answers. */
  readonly ref: Ref;
  /** The spied `close()`, the very function the ref carries: the component's close is asserted through it. */
  readonly close: AddSpyMethodsByReturnTypes<(result?: DialogResult<Ref>) => void>;
  /** Close it from outside, the way the user does: the streams move and the spy records nothing. */
  emitClose(result?: DialogResult<Ref>): void;
}

/** The members the double answers. Everything else the ref class declares throws by name. */
const COVERED = 'close(), afterClosed(), beforeClosed(), afterOpened(), disableClose and the componentInstance it was handed';

/**
 * Material declares these as class fields rather than on the prototype, so the guard below cannot
 * read them off the class and would hand the code under test `undefined` for every one of them.
 */
const FIELDS = ['componentInstance', 'componentRef', 'id'];

const doubles = new WeakMap<object, unknown>();

/**
 * Throw by name for a member of the real ref class the double does not have, rather than hand the
 * code under test `undefined` and fail a frame later on a property of it. The names come from the
 * class the spec passed, so the message is about whichever Material is installed there.
 */
function guardMissingMembers<Ref extends DialogRefLike>(RefClass: AbstractType<Ref>, double: object): Ref {
  const declared: ReadonlySet<string> = new Set([...Object.getOwnPropertyNames(RefClass.prototype), ...FIELDS]);
  const guarded = new Proxy(double, {
    get(target, key, receiver): unknown {
      if (typeof key === 'string' && !(key in target) && declared.has(key)) {
        const repair =
          key === 'componentInstance'
            ? `hand the component's stand-in to the double, provideMatDialogRef(${RefClass.name}, { componentInstance: { … } })`
            : 'backdropClick, keydownEvents, updateSize, updatePosition, getState, componentRef and id are the dialog doing ' +
              'its own work, which is the real MatDialogModule and a MatDialog that opens it';

        throw new Error(
          withDocs(
            `[vitest-auto-spy] provideMatDialogRef: the ${RefClass.name} double has no ${key}. It answers ${COVERED} — ${repair}.`,
            DOCS_LINKS.angular,
          ),
        );
      }

      return Reflect.get(target, key, receiver);
    },
  });

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the code under test sees the ref class's own type, and TypeScript cannot say "a MatDialogRef minus the members a test never calls"; the ones that are missing throw by name above rather than reading `undefined`.
  return guarded as Ref;
}

/**
 * Build a `MatDialogRef` double without a `TestBed` — for a class built with `new`, and for the ref
 * a spied `MatDialog.open()` has to answer.
 *
 * ```ts
 * const dialog = injectSpy(MatDialog);
 *
 * dialog.open.mockReturnValue(createMatDialogRef(MatDialogRef, { closedWith: 'saved' }).ref);
 * ```
 */
export function createMatDialogRef<Ref extends DialogRefLike>(
  RefClass: AbstractType<Ref>,
  init: MatDialogRefInit<Ref> = {},
): MatDialogRefDouble<Ref> {
  // Replayed, where Material's own is a plain `Subject`: an assertion usually subscribes after the
  // component has already closed the dialog, and a `Subject` has nothing left to say by then.
  const closed = new ReplaySubject<DialogResult<Ref> | undefined>(1);
  const opened = new ReplaySubject<void>(1);
  const closedStream = closed.asObservable();
  const openedStream = opened.asObservable();

  opened.next();
  opened.complete();

  const emitClose = (result?: DialogResult<Ref>): void => {
    closed.next(result);
    closed.complete();
  };
  const close = createFunctionSpy<(result?: DialogResult<Ref>) => void>(`${RefClass.name}.close`);

  close.mockImplementation(emitClose);

  if (init.closedWith !== undefined) {
    emitClose(init.closedWith);
  }

  const answered = {
    close,
    afterClosed: (): Observable<DialogResult<Ref> | undefined> => closedStream,
    beforeClosed: (): Observable<DialogResult<Ref> | undefined> => closedStream,
    afterOpened: (): Observable<void> => openedStream,
    disableClose: init.disableClose,
  };
  // Added rather than always present, so a ref nobody handed a component throws by name for it
  // instead of answering `undefined` to the opener that reaches through it.
  const ref = guardMissingMembers(
    RefClass,
    init.componentInstance === undefined ? answered : { ...answered, componentInstance: init.componentInstance },
  );
  const double: MatDialogRefDouble<Ref> = { ref, close, emitClose };

  doubles.set(ref, double);

  return double;
}

/**
 * The `MatDialogRef` provider, for `TestBed.configureTestingModule` or a component's `providers`.
 *
 * ```ts
 * TestBed.configureTestingModule({
 *   providers: [provideMatDialogRef(MatDialogRef, { disableClose: false }), provideMatDialogData(MAT_DIALOG_DATA, { id: 7 })],
 * });
 * ```
 *
 * The class is an argument because `@angular/material` is not a dependency of this package — it is
 * the DI token as well as the shape the double is measured against, so the spec's own
 * `MatDialogRef` import is the only place Material is named.
 *
 * A factory, so every injector builds its own: a provider array hoisted to a module constant never
 * carries one test's closed dialog into the next.
 */
export function provideMatDialogRef<Ref extends DialogRefLike>(
  RefClass: AbstractType<Ref>,
  init: MatDialogRefInit<Ref> = {},
): FactoryProvider {
  return { provide: RefClass, useFactory: (): Ref => createMatDialogRef(RefClass, init).ref };
}

/**
 * The dialog's data, under the token the application injects it from.
 *
 * ```ts
 * providers: [provideMatDialogData<EditUserData>(MAT_DIALOG_DATA, { id: 7, name: 'Ada' })];
 * ```
 *
 * A typed `{ provide, useValue }` and nothing more, which is the whole of what the hand-written one
 * is too — except that Material declares `MAT_DIALOG_DATA` as `InjectionToken<any>`, so the object
 * in `useValue: { id: 7 }` is checked against nothing at all and `useValue: null` compiles for a
 * component that reads `data.name`. Name the type argument and the data is checked against it; pass
 * an `InjectionToken<EditUserData>` of your own and it is checked without naming anything.
 *
 * The value is handed out as it is, so a component that writes to the data writes to the object the
 * spec passed — build it per test rather than hoisting it to a module constant.
 */
export function provideMatDialogData<T>(token: InjectionToken<T>, data: NoInfer<T>): ValueProvider {
  return { provide: token, useValue: data };
}

/**
 * The handle of the ref `provideMatDialogRef()` put in the test's injector.
 *
 * ```ts
 * const dialog = injectMatDialogRef(MatDialogRef);
 *
 * fixture.componentInstance.save();
 *
 * expect(dialog.close).toHaveBeenCalledWith('saved');
 * await expect(expectEmission(dialog.ref.afterClosed())).resolves.toBe('saved');
 * ```
 *
 * Reads the `TestBed` by default; pass `fixture.debugElement.injector` when the ref is in a
 * component's own `providers`.
 */
export function injectMatDialogRef<Ref extends DialogRefLike>(RefClass: AbstractType<Ref>, injector?: Injector): MatDialogRefDouble<Ref> {
  const caller = '[vitest-auto-spy] injectMatDialogRef()';
  const ref =
    injector === undefined ? TestBed.inject(RefClass, null, { optional: true }) : injector.get(RefClass, null, { optional: true });

  if (ref === null) {
    throw new Error(
      withDocs(
        `${caller}: nothing provides ${RefClass.name} in the injector given. Add provideMatDialogRef(${RefClass.name}) to its providers.`,
        DOCS_LINKS.angular,
      ),
    );
  }

  const double = doubles.get(ref);

  if (double === undefined) {
    throw new Error(
      withDocs(
        `${caller}: the ${RefClass.name} here is not one provideMatDialogRef() built. A later provider of it (a useValue, ` +
          'provideAutoSpy) won over the double — list provideMatDialogRef() last, or drop the other one.',
        DOCS_LINKS.angular,
      ),
    );
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the registry is keyed by ref object rather than by class, so its values cannot carry each double's own `Ref`; every entry was put there by `createMatDialogRef` for the ref just injected.
  return double as MatDialogRefDouble<Ref>;
}
