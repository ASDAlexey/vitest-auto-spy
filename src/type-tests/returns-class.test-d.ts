import { InjectionToken } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';

import { provideAutoSpy, provideAutoSpyForToken } from '../angular';
import {
  type AutoMocked,
  type Spy,
  asSpy,
  autoMocked,
  createAutoMock,
  createSpyFromClass,
  createSpyFromInstance,
  innerDouble,
  registerAutoSpyDefaults,
} from '../auto-spy';

class Report {
  render(): string {
    return '';
  }
}

class Invoice {
  total(): number {
    return 0;
  }
}

class ReportFactory {
  readonly title = '';

  create(_title: string): Report {
    return new Report();
  }
}

class SnackBarRef {
  dismiss(): void {}
}

class SnackBar {
  open(_message: string): SnackBarRef {
    return new SnackBarRef();
  }
}

class Ref<C> {
  instance!: C;
  close(): void {}
}

class Popup {
  open<C>(_component: new () => C): Ref<C> {
    return new Ref<C>();
  }
}

class Banner {
  shown = true;
}

interface Stream {
  close(): void;
  send(data: string): number;
}

describe('returnsClass', () => {
  it('names a method and the class its double is built from, on every factory', () => {
    expectTypeOf(createSpyFromClass(ReportFactory, { returnsClass: { create: Report } })).toEqualTypeOf<Spy<ReportFactory>>();
    createSpyFromInstance(new ReportFactory(), { returnsClass: { create: Report } });
    createAutoMock<ReportFactory>(undefined, { returnsClass: { create: Report } });
    registerAutoSpyDefaults(ReportFactory, { returnsClass: { create: Report } });
    provideAutoSpy(ReportFactory, { returnsClass: { create: Report } });
    provideAutoSpyForToken(new InjectionToken<ReportFactory>('REPORTS'), undefined, { returnsClass: { create: Report } });
  });

  it('reaches the inner double through asSpy', () => {
    const factory = createSpyFromClass(ReportFactory, { returnsClass: { create: Report } });

    expectTypeOf(asSpy(factory.create('a'))).toEqualTypeOf<Spy<Report>>();
  });

  it('pairs the class with the configuration its double is built with, typed against that class', () => {
    createSpyFromClass(SnackBar, { returnsClass: { open: [SnackBarRef, { returnsUndefined: ['dismiss'] }] } });
    createAutoMock<SnackBar>({ returnsClass: { open: [SnackBarRef, { strict: true, returnsUndefined: ['dismiss'] }] } });
    provideAutoSpy(SnackBar, { returnsClass: { open: [SnackBarRef, { returnsUndefined: ['dismiss'] }] } });

    // @ts-expect-error -- `close` is not a method of SnackBarRef
    createSpyFromClass(SnackBar, { returnsClass: { open: [SnackBarRef, { returnsUndefined: ['close'] }] } });
    // @ts-expect-error -- `open` returns a SnackBarRef
    createSpyFromClass(SnackBar, { returnsClass: { open: [Report, {}] } });
  });

  it('reads the inner double through innerDouble, for a method only', () => {
    const factory = createSpyFromClass(ReportFactory, { returnsClass: { create: Report } });

    expectTypeOf(innerDouble(factory, 'create')).toEqualTypeOf<Spy<Report>>();
    expectTypeOf(innerDouble(createAutoMock<SnackBar>(), 'open')).toEqualTypeOf<Spy<SnackBarRef>>();

    // @ts-expect-error -- `title` is data
    innerDouble(factory, 'title');
  });

  it('reads a generic method with the type named, and needs it named to leave the checked form', () => {
    const popup = createSpyFromClass(Popup, { returnsClass: { open: Ref } });

    expectTypeOf(innerDouble(popup, 'open')).toEqualTypeOf<Spy<Ref<unknown>>>();
    expectTypeOf(innerDouble<Ref<Banner>>(popup, 'open')).toEqualTypeOf<Spy<Ref<Banner>>>();
    expectTypeOf(innerDouble<Ref<Banner>>(popup, 'open').instance).toEqualTypeOf<Banner>();

    // @ts-expect-error -- without a type argument the key is checked against the double
    innerDouble(popup, 'missing');
  });

  it('takes a builder whose result is the method return type', () => {
    const built = createSpyFromClass(Ref<Banner>);

    createSpyFromClass(Popup, { returnsClass: { open: { build: () => built } } });
    createAutoMock<SnackBar>({ returnsClass: { open: { build: () => createSpyFromClass(SnackBarRef) } } });
    provideAutoSpy(SnackBar, { returnsClass: { open: { build: () => new SnackBarRef() } } });

    // @ts-expect-error -- `open` returns a SnackBarRef
    createSpyFromClass(SnackBar, { returnsClass: { open: { build: () => new Report() } } });
  });

  it('rejects a class the method does not return, and a member that is not a method', () => {
    // @ts-expect-error -- `create` returns a Report
    createSpyFromClass(ReportFactory, { returnsClass: { create: Invoice } });
    // @ts-expect-error -- `title` is data
    createSpyFromClass(ReportFactory, { returnsClass: { title: Report } });
  });
});

describe('createAutoMock — configuration alone', () => {
  it('takes a configuration naming a list option as the only argument', () => {
    expectTypeOf(createAutoMock<Stream>({ returnsUndefined: ['close'] })).toEqualTypeOf<Spy<Stream>>();
    expectTypeOf(createAutoMock<Stream>({ strict: true, selfReturning: ['close'], returns: { send: 1 } })).toEqualTypeOf<Spy<Stream>>();
    expectTypeOf(autoMocked<Stream>({ returnsUndefined: ['close'] })).toEqualTypeOf<AutoMocked<Stream>>();
  });

  it('keeps a seed a seed', () => {
    expectTypeOf(createAutoMock<Stream>({ send: () => 1 })).toEqualTypeOf<Spy<Stream>>();
  });

  it('rejects a configuration naming no list option, which the runtime would read as a seed', () => {
    // @ts-expect-error -- `{ strict: true }` alone is a seed; pass it second
    createAutoMock<Stream>({ strict: true });
  });

  it('checks the names in the configuration against the type', () => {
    // @ts-expect-error -- `open` is not a method of Stream
    createAutoMock<Stream>({ returnsUndefined: ['open'] });
  });
});
