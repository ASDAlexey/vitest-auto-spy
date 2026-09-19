/**
 * Type-level tests for `mockDeep`: an array member is typed as an array of deep mocks — which the
 * runtime now builds — and `fallbackMockImplementation` takes whatever a spec naturally writes.
 */
import { describe, expectTypeOf, it, vi } from 'vitest';

import { type DeepMockProxy, type MockDeepOptions, asInstance, mockDeep } from '../auto-spy';

interface Item {
  title: string;
  load(id: number): string;
}

interface Page {
  items: Item[];
  matrix: Item[][];
}

describe('mockDeep — array members', () => {
  it('types an array member as an array of deep mocks', () => {
    const page = mockDeep<Page>();

    type Element = (typeof page.items)[number];
    type Cell = (typeof page.matrix)[number][number];

    expectTypeOf(page.items).toExtend<readonly DeepMockProxy<Item>[]>();
    expectTypeOf(page.items.length).toEqualTypeOf<number>();
    expectTypeOf<Element['title']>().toEqualTypeOf<string>();
    expectTypeOf<Element['load']['mockReturnValue']>().toBeFunction();
    expectTypeOf<Cell['load']['calledWith']>().toBeFunction();
  });

  it('keeps Array.prototype on it, typed over the deep elements', () => {
    const page = mockDeep<Page>();

    expectTypeOf(page.items.map((item) => item.load(1))).toEqualTypeOf<string[]>();
  });
});

describe('mockDeep — fallbackMockImplementation', () => {
  it('accepts a throwing fallback, a typed one, and a runner mock', () => {
    mockDeep<Page>(
      {},
      {
        fallbackMockImplementation: () => {
          throw new Error('not mocked');
        },
      },
    );
    mockDeep<Page>({}, { fallbackMockImplementation: (id: number) => id });
    mockDeep<Page>({}, { fallbackMockImplementation: vi.fn(), selfReturning: true });
  });

  it('is a function or nothing', () => {
    expectTypeOf<MockDeepOptions['fallbackMockImplementation']>().toEqualTypeOf<((...args: unknown[]) => unknown) | undefined>();

    // @ts-expect-error — a value is not an implementation.
    mockDeep<Page>({}, { fallbackMockImplementation: 'not mocked' });
  });

  it('is refused in the overrides, where a migrated `mockDeep<T>({ fallbackMockImplementation })` puts it', () => {
    // @ts-expect-error — the first argument seeds members of `Page`; options are the second.
    mockDeep<Page>({ fallbackMockImplementation: () => undefined });
  });
});

describe('mockDeep — a method that runs a callback with the client', () => {
  interface Db {
    user: { count(): Promise<number> };
    transaction<R>(run: (tx: Db) => Promise<R>): Promise<R>;
  }

  it('hands the mock to the callback through mockImplementation and asInstance', () => {
    const db = mockDeep<Db>();

    db.transaction.mockImplementation((run) => run(asInstance(db)));

    expectTypeOf(db.transaction).parameter(0).parameter(0).toEqualTypeOf<Db>();
  });
});
