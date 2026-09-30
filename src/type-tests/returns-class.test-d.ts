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
