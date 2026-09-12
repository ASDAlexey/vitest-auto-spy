/**
 * The claim is that these providers keep working through real Angular DI, so every test goes
 * through a `TestBed` and a component that injects the token and the ref — a provider that only
 * works when its factory is called by hand is not a provider.
 *
 * `@angular/material` is not installed here, and must not be: the classes below are transcribed
 * from `@angular/material/dialog`'s public typings, the members the double does not answer
 * included, because those are what the guard is measured against. The one deviation is Material's
 * `R = any` default, written `unknown` so the file needs no `any` disables.
 */
import { Component, InjectionToken, type Type, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Observable, filter, map } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { expectEmission, injectSpy, provideAutoSpy } from '../angular';
import { createMatDialogRef, injectMatDialogRef, provideMatDialogData, provideMatDialogRef } from './dialog-doubles';

interface DialogPosition {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
}

function notInstalled(member: string): Error {
  return new Error(`@angular/material is not installed; ${member} stands in for its declaration only.`);
}

class MatDialogRef<T, R = unknown> {
  componentInstance: T | null = null;
  disableClose: boolean | undefined = undefined;
  id = 'mat-mdc-dialog-0';

  close(_dialogResult?: R): void {
    throw notInstalled('MatDialogRef.close');
  }

  afterClosed(): Observable<R | undefined> {
    throw notInstalled('MatDialogRef.afterClosed');
  }

  beforeClosed(): Observable<R | undefined> {
    throw notInstalled('MatDialogRef.beforeClosed');
  }

  afterOpened(): Observable<void> {
    throw notInstalled('MatDialogRef.afterOpened');
  }

  backdropClick(): Observable<MouseEvent> {
    throw notInstalled('MatDialogRef.backdropClick');
  }

  keydownEvents(): Observable<KeyboardEvent> {
    throw notInstalled('MatDialogRef.keydownEvents');
  }

  updatePosition(_position?: DialogPosition): this {
    throw notInstalled('MatDialogRef.updatePosition');
  }

  updateSize(_width?: string, _height?: string): this {
    throw notInstalled('MatDialogRef.updateSize');
  }

  addPanelClass(_classes: string | string[]): this {
    throw notInstalled('MatDialogRef.addPanelClass');
  }

  getState(): number {
    throw notInstalled('MatDialogRef.getState');
  }
}

class MatDialog {
  open<T, R = unknown>(_component: Type<T>, _config?: { data?: unknown; disableClose?: boolean }): MatDialogRef<T, R> {
    throw notInstalled('MatDialog.open');
  }

  closeAll(): void {
    throw notInstalled('MatDialog.closeAll');
  }

  getDialogById(_id: string): MatDialogRef<unknown> | undefined {
    throw notInstalled('MatDialog.getDialogById');
  }
}

interface EditUserData {
  readonly id: number;
  readonly name: string;
}

// Material declares this one `InjectionToken<any>`; typed here so the component reads the data the
// way an application that named the type does.
const MAT_DIALOG_DATA = new InjectionToken<EditUserData>('MatMdcDialogData');

@Component({
  selector: 'vas-edit-user',
  standalone: true,
  template: `<span>{{ data.name }}</span>`,
})
class EditUserDialog {
  readonly data = inject(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef);

  save(): void {
    this.ref.close('saved');
  }

  lock(): void {
    this.ref.disableClose = true;
  }
}

@Component({
  selector: 'vas-watching-dialog',
  standalone: true,
  template: `<span>{{ outcome() }}</span>`,
})
class WatchingDialog {
  readonly outcome = signal('open');
  private readonly ref = inject(MatDialogRef);

  constructor() {
    this.ref
      .afterClosed()
      .pipe(map(String))
      .subscribe((result) => this.outcome.set(result));
  }

  discard(): void {
    this.ref.close('discarded');
  }
}

@Component({
  selector: 'vas-own-ref',
  standalone: true,
  template: '',
  providers: [provideMatDialogRef(MatDialogRef, { disableClose: true })],
})
class OwnRefComponent {}

@Component({
  selector: 'vas-user-list',
  standalone: true,
  template: `<button type="button" (click)="edit()">{{ outcome() }}</button>`,
})
class UserListComponent {
  readonly outcome = signal('none');
  private readonly dialog = inject(MatDialog);

  edit(): void {
    this.dialog
      .open<EditUserDialog, string>(EditUserDialog, { data: { id: 7, name: 'Ada' } })
      .afterClosed()
      .pipe(filter((result): result is string => result !== undefined))
      .subscribe((result) => this.outcome.set(result));
  }
}

function renderDialog(): EditUserDialog {
  TestBed.configureTestingModule({
    providers: [provideMatDialogData(MAT_DIALOG_DATA, { id: 7, name: 'Ada' }), provideMatDialogRef(MatDialogRef)],
  });

  const fixture = TestBed.createComponent(EditUserDialog);

  fixture.detectChanges();

  return fixture.componentInstance;
}

describe('provideMatDialogData', () => {
  it('hands the component the data it was given, under the application token', () => {
    TestBed.configureTestingModule({
      providers: [provideMatDialogData(MAT_DIALOG_DATA, { id: 7, name: 'Ada' }), provideMatDialogRef(MatDialogRef)],
    });

    const fixture = TestBed.createComponent(EditUserDialog);

    fixture.detectChanges();

    expect(fixture.componentInstance.data).toEqual({ id: 7, name: 'Ada' });
    expect(fixture.nativeElement.textContent).toContain('Ada');
  });
});

describe('provideMatDialogRef — the dialog component side', () => {
  it('records the close the component made and closes the stream with the same result', async () => {
    const component = renderDialog();
    const dialog = injectMatDialogRef(MatDialogRef);

    component.save();

    expect(dialog.close).toHaveBeenCalledWith('saved');
    await expect(expectEmission(dialog.ref.afterClosed())).resolves.toBe('saved');
  });

  it('reaches a component that subscribed before anything closed it', () => {
    TestBed.configureTestingModule({ providers: [provideMatDialogRef(MatDialogRef)] });

    const fixture = TestBed.createComponent(WatchingDialog);

    fixture.detectChanges();

    expect(fixture.componentInstance.outcome()).toBe('open');

    fixture.componentInstance.discard();

    expect(fixture.componentInstance.outcome()).toBe('discarded');
  });

  it('answers beforeClosed with the stream afterClosed answers with', async () => {
    const dialog = createMatDialogRef(MatDialogRef);

    dialog.emitClose('saved');

    expect(dialog.ref.beforeClosed()).toBe(dialog.ref.afterClosed());
    await expect(expectEmission(dialog.ref.beforeClosed())).resolves.toBe('saved');
  });

  it('has already opened: afterOpened emits and completes', async () => {
    const seen: string[] = [];

    createMatDialogRef(MatDialogRef)
      .ref.afterOpened()
      .subscribe({
        next: () => seen.push('opened'),
        complete: () => seen.push('completed'),
      });

    await Promise.resolve();

    expect(seen).toEqual(['opened', 'completed']);
  });

  it('carries disableClose and lets the component write it', () => {
    TestBed.configureTestingModule({
      providers: [
        provideMatDialogData(MAT_DIALOG_DATA, { id: 7, name: 'Ada' }),
        provideMatDialogRef(MatDialogRef, { disableClose: false }),
      ],
    });

    const component = TestBed.createComponent(EditUserDialog).componentInstance;

    expect(component.ref.disableClose).toBe(false);

    component.lock();

    expect(injectMatDialogRef(MatDialogRef).ref.disableClose).toBe(true);
  });

  it('dismisses without a result, and without a close the component never made', () => {
    const dialog = createMatDialogRef(MatDialogRef);
    const seen: unknown[] = [];

    dialog.ref.afterClosed().subscribe((result) => seen.push(result));
    dialog.emitClose();

    expect(seen).toEqual([undefined]);
    expect(dialog.close).not.toHaveBeenCalled();
  });
});

describe('the members the double does not have', () => {
  it('throws by name for one the real ref declares', () => {
    const { ref } = createMatDialogRef(MatDialogRef);

    expect(() => ref.keydownEvents()).toThrow(/the MatDialogRef double has no keydownEvents/);
    expect(() => ref.updateSize('40vw')).toThrow(/It answers close\(\), afterClosed\(\)/);
  });

  it('reads as undefined for a name the real ref does not declare either', () => {
    const { ref } = createMatDialogRef(MatDialogRef);

    expect(Reflect.get(ref, 'openedFromTheLeft')).toBeUndefined();
    expect(Reflect.get(ref, Symbol.iterator)).toBeUndefined();
  });
});

describe('the ref a spied MatDialog.open answers with', () => {
  it('carries the result the spec seeded, through the pipe the component wrote', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(MatDialog)] });

    const confirmed = createMatDialogRef(MatDialogRef, { closedWith: 'saved' });

    injectSpy(MatDialog).open.mockReturnValue(confirmed.ref);

    const fixture = TestBed.createComponent(UserListComponent);

    fixture.componentInstance.edit();

    expect(fixture.componentInstance.outcome()).toBe('saved');
    expect(injectSpy(MatDialog).open).toHaveBeenCalledWith(EditUserDialog, { data: { id: 7, name: 'Ada' } });
  });

  it('seeds the result without recording a close nobody called', () => {
    expect(createMatDialogRef(MatDialogRef, { closedWith: 'saved' }).close).not.toHaveBeenCalled();
  });
});

describe('injectMatDialogRef', () => {
  it("reads a component's own providers through its injector", () => {
    TestBed.configureTestingModule({});

    const fixture = TestBed.createComponent(OwnRefComponent);

    expect(injectMatDialogRef(MatDialogRef, fixture.debugElement.injector).ref.disableClose).toBe(true);
  });

  it('says so when nothing provides the ref at all', () => {
    TestBed.configureTestingModule({});

    expect(() => injectMatDialogRef(MatDialogRef)).toThrow(/nothing provides MatDialogRef in the injector given/);
  });

  it('says so when a later provider won over the double', () => {
    TestBed.configureTestingModule({
      providers: [provideMatDialogRef(MatDialogRef), { provide: MatDialogRef, useValue: { close: (): void => undefined } }],
    });

    expect(() => injectMatDialogRef(MatDialogRef)).toThrow(/is not one provideMatDialogRef\(\) built/);
  });
});
