/**
 * Type-level tests for the Material dialog doubles.
 *
 * The runtime specs prove the double answers; what they cannot prove is the point of taking the
 * token and the ref class as arguments — that the data is checked against the token's own type and
 * the result against the `close()` of the class handed in, while nothing here imports
 * `@angular/material`. The classes below stand in for it exactly as a consumer's import would.
 */
import type { InjectionToken, Provider } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import {
  type DialogResult,
  type MatDialogRefDouble,
  createMatDialogRef,
  injectMatDialogRef,
  provideMatDialogData,
  provideMatDialogRef,
} from '../angular';

declare class MatDialogRef<T, R = unknown> {
  componentInstance: T;
  disableClose: boolean | undefined;
  close(dialogResult?: R): void;
  afterClosed(): { subscribe(next: (result: R | undefined) => void): void };
}

declare class EditUserDialog {}
declare class ConfirmDialogRef extends MatDialogRef<EditUserDialog, 'discarded' | 'saved'> {}

interface EditUserData {
  readonly id: number;
  readonly name: string;
}

// Material's own declaration, `any` and all — the reason the type argument is worth naming.
declare const MAT_DIALOG_DATA: InjectionToken<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- transcribed from @angular/material/dialog, where the token is `InjectionToken<any>`; a narrower stand-in would prove the opposite of what this file is about.
declare const EDIT_USER_DATA: InjectionToken<EditUserData>;

describe('provideMatDialogData', () => {
  it('is a provider, for a providers array as it is', () => {
    expectTypeOf(provideMatDialogData(EDIT_USER_DATA, { id: 7, name: 'Ada' })).toExtend<Provider>();
  });

  it("checks the data against the token's own type", () => {
    provideMatDialogData(EDIT_USER_DATA, { id: 7, name: 'Ada' });

    // @ts-expect-error — `id` is a number
    provideMatDialogData(EDIT_USER_DATA, { id: '7', name: 'Ada' });

    // @ts-expect-error — a component that reads `data.name` does not survive this
    provideMatDialogData(EDIT_USER_DATA, null);
  });

  it("checks it against the type argument when the token is Material's own `any`", () => {
    provideMatDialogData<EditUserData>(MAT_DIALOG_DATA, { id: 7, name: 'Ada' });

    // @ts-expect-error — nothing on EditUserData is called that
    provideMatDialogData<EditUserData>(MAT_DIALOG_DATA, { id: 7, nmae: 'Ada' });
  });
});

describe('provideMatDialogRef', () => {
  it('is a provider, with or without an init', () => {
    expectTypeOf(provideMatDialogRef(MatDialogRef)).toExtend<Provider>();
    expectTypeOf(provideMatDialogRef(ConfirmDialogRef, { disableClose: false })).toExtend<Provider>();
  });

  it("checks the seeded result against the ref class's own", () => {
    provideMatDialogRef(ConfirmDialogRef, { closedWith: 'saved' });

    // @ts-expect-error — the ref closes with 'saved' or 'discarded'
    provideMatDialogRef(ConfirmDialogRef, { closedWith: 'stored' });

    // @ts-expect-error — `disableClose` is the only other thing the init says
    provideMatDialogRef(ConfirmDialogRef, { afterClosed: () => undefined });
  });
});

describe('the double', () => {
  it('hands out something the code under test reads as the ref class it named', () => {
    expectTypeOf(createMatDialogRef(ConfirmDialogRef).ref).toEqualTypeOf<ConfirmDialogRef>();
    expectTypeOf(injectMatDialogRef(ConfirmDialogRef)).toEqualTypeOf<MatDialogRefDouble<ConfirmDialogRef>>();
    expectTypeOf(createMatDialogRef(MatDialogRef).ref.disableClose).toEqualTypeOf<boolean | undefined>();
  });

  it('reads the result off the class rather than being told it', () => {
    expectTypeOf<DialogResult<ConfirmDialogRef>>().toEqualTypeOf<'discarded' | 'saved'>();
    expectTypeOf<DialogResult<MatDialogRef<EditUserDialog>>>().toEqualTypeOf<unknown>();
  });

  it('types the close spy and the outside close by that result', () => {
    const dialog = createMatDialogRef(ConfirmDialogRef);

    dialog.close.calledWith('saved');
    dialog.emitClose('discarded');
    dialog.emitClose();

    // @ts-expect-error — the ref closes with 'saved' or 'discarded'
    dialog.emitClose('stored');

    // @ts-expect-error — `ref` is the double's own, not something to assign
    dialog.ref = createMatDialogRef(ConfirmDialogRef).ref;
  });
});
