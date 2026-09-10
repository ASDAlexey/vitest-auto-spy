/**
 * The public core API on the real `node:test` runtime.
 *
 * `src/lib/node-adapter.spec.ts` proves the adapter *factory* against a stub, which is all Vitest
 * can do — `node:test` is a built-in Vitest cannot bundle. This file is the other half: the same
 * helpers a consumer imports from `vitest-auto-spy/node`, running on Node's own `mock.fn()` and
 * asserted with `node:assert`.
 *
 * The mock surface here is Node's, not Vitest's: a call is recorded as `{ arguments }` rather than
 * a bare array, there is no `mockReturnValue`, and the flat stub is `mock.mockImplementation()`.
 * `Spy<T>` types that surface after Vitest, so the few reads that touch it go through
 * {@link nodeMock}.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type Spy,
  asInstance,
  clearAutoSpy,
  createAutoMock,
  createFunctionSpy,
  createMock,
  createSpyFromClass,
  mockDeep,
  resetAutoSpy,
} from '../node';

interface NodeMockView {
  calls: { arguments: unknown[] }[];
  mockImplementation(implementation: (...args: never[]) => unknown): void;
}

function nodeMock(spy: unknown): NodeMockView {
  return (spy as { mock: NodeMockView }).mock;
}

function argumentsOf(spy: unknown): unknown[][] {
  return nodeMock(spy).calls.map((call) => call.arguments);
}

class InvoiceService {
  currency = 'EUR';

  total(id: number): number {
    return id * 2;
  }

  async fetch(id: number): Promise<string> {
    return `invoice-${id}`;
  }

  get locale(): string {
    return 'en-GB';
  }

  set locale(value: string) {
    this.currency = value;
  }
}

describe('createSpyFromClass on node:test', () => {
  it('records every call in the { arguments } shape node:test uses', () => {
    const invoices: Spy<InvoiceService> = createSpyFromClass(InvoiceService);

    invoices.total(1);
    invoices.total(2);

    assert.deepEqual(argumentsOf(invoices.total), [[1], [2]]);
  });

  it('answers through mockImplementation, the only flat stub node:test ships', () => {
    const invoices = createSpyFromClass(InvoiceService);

    nodeMock(invoices.total).mockImplementation(() => 99);

    assert.equal(invoices.total(1), 99);
  });

  it('dispatches on the arguments a calledWith chain names', () => {
    const invoices = createSpyFromClass(InvoiceService);

    invoices.total.calledWith(7).mockReturnValue(70);

    assert.equal(invoices.total(7), 70);
    assert.equal(invoices.total(8), undefined);
  });

  it('throws from mustBeCalledWith on any other arguments', () => {
    const invoices = createSpyFromClass(InvoiceService);

    invoices.total.mustBeCalledWith(1).returnValue(10);

    assert.equal(invoices.total(1), 10);
    assert.throws(() => invoices.total(2));
  });

  it('throws whatever failWith was given', () => {
    const invoices = createSpyFromClass(InvoiceService);

    invoices.total.failWith(new RangeError('no such invoice'));

    assert.throws(() => invoices.total(1), RangeError);
  });

  it('resolves, rejects, and polyfills the settledResults node:test does not track', async () => {
    const invoices = createSpyFromClass(InvoiceService);

    invoices.fetch.resolveWith('paid');
    assert.equal(await invoices.fetch(1), 'paid');
    assert.deepEqual(invoices.fetch.mock.settledResults, [{ type: 'fulfilled', value: 'paid' }]);

    invoices.fetch.rejectWith('gone');
    await assert.rejects(invoices.fetch(2), /gone/);
  });

  it('spies an accessor pair by redefining the property', () => {
    const invoices = createSpyFromClass(InvoiceService, { gettersToSpyOn: ['locale'], settersToSpyOn: ['locale'] });

    nodeMock(invoices.accessorSpies.getters.locale).mockImplementation(() => 'de-DE');
    assert.equal(invoices.locale, 'de-DE');

    invoices.locale = 'fr-FR';
    assert.deepEqual(argumentsOf(invoices.accessorSpies.setters.locale), [['fr-FR']]);
  });

  it('clears the calls of a whole double, then resets its configuration too', () => {
    const invoices = createSpyFromClass(InvoiceService);

    invoices.total.calledWith(1).mockReturnValue(10);
    invoices.total(1);

    clearAutoSpy(invoices);
    assert.deepEqual(argumentsOf(invoices.total), []);
    assert.equal(invoices.total(1), 10);

    resetAutoSpy(invoices);
    assert.equal(invoices.total(1), undefined);
  });

  it('hands the same object back as the instance type', () => {
    const invoices = createSpyFromClass(InvoiceService);

    assert.equal(asInstance(invoices), invoices);
  });
});

describe('type-driven doubles on node:test', () => {
  interface Ledger {
    entry(id: number): string;
    archive: { byYear: { count(): number } };
  }

  it('createAutoMock spies a method that exists only in the type', () => {
    const ledger = createAutoMock<Ledger>();

    ledger.entry.calledWith(1).mockReturnValue('opening');

    assert.equal(ledger.entry(1), 'opening');
    assert.deepEqual(argumentsOf(ledger.entry), [[1]]);
  });

  it('mockDeep answers through a chain of property reads', () => {
    const ledger = mockDeep<Ledger>();

    ledger.archive.byYear.count.calledWith().mockReturnValue(3);

    assert.equal(ledger.archive.byYear.count(), 3);
  });

  it('createMock hands back a plain object with no spies on it', () => {
    const row = createMock<{ id: number; label: string }>({ id: 4 });

    assert.equal(row.id, 4);
    assert.equal(row.label, undefined);
    assert.deepEqual(Object.keys(row), ['id']);
  });

  it('createFunctionSpy carries the promise helpers', async () => {
    const settle = createFunctionSpy<(id: number) => Promise<string>>('settle');

    settle.resolveWith('settled');

    assert.equal(await settle(9), 'settled');
    assert.deepEqual(argumentsOf(settle), [[9]]);
  });
});
