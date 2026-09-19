/**
 * A member read with a numeric key is an array. The types have always said so — `DeepMockProxy<T>`
 * maps `Item[]` to an array of deep mocks — while the runtime handed back a function node whose
 * `length` was an arity and whose `map` was a spy returning `undefined`.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { mockDeep } from './mock-deep';
import { resetAutoSpy } from './reset-auto-spy';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

/** An element read by index; the index always materialises, so `undefined` here is a failure. */
function at<T>(list: readonly T[], index: number): T {
  const element = list[index];

  if (element === undefined) {
    throw new Error(`nothing at ${index}`);
  }

  return element;
}

interface Item {
  title: string;
  load(id: number): string;
}

interface Page {
  items: Item[];
  matrix: { inner: string }[][];
  byCode: Record<string, Item>;
}

describe('mockDeep — arrays', () => {
  it('turns the member into a real array on its first index read', () => {
    const page = mockDeep<Page>();

    at(page.items, 0).load.mockReturnValue('loaded');

    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items).toHaveLength(1);
    expect(at(page.items, 0).load(1)).toBe('loaded');
    expect(vi.isMockFunction(at(page.items, 0))).toBe(true);
  });

  it('keeps each element one stable deep node', () => {
    const page = mockDeep<Page>();

    expect(at(page.items, 0)).toBe(at(page.items, 0));
    expect(at(page.items, 0).load).toBe(at(page.items, 0).load);
    expect(at(page.items, 0)).not.toBe(at(page.items, 1));
  });

  it('answers Array.prototype and iteration from the array, not as child spies', () => {
    const page = mockDeep<Page>();

    at(page.items, 0).load.mockReturnValue('a');
    at(page.items, 1).load.mockReturnValue('b');

    expect(page.items.map((item) => item.load(1))).toEqual(['a', 'b']);
    expect(page.items.filter((item) => item.load(1) === 'b')).toEqual([at(page.items, 1)]);
    expect([...page.items]).toEqual([at(page.items, 0), at(page.items, 1)]);
    expect(vi.isMockFunction(page.items.map)).toBe(false);

    const seen: string[] = [];

    for (const item of page.items) {
      seen.push(item.load(2));
    }

    expect(seen).toEqual(['a', 'b']);
  });

  it('compares equal to an array of the same elements', () => {
    const page = mockDeep<Page>();
    const first = at(page.items, 0);

    expect(page.items).toEqual([first]);
    expect(page.items).toStrictEqual([first]);
  });

  it('builds nested arrays as arrays too', () => {
    const page = mockDeep<Page>();

    at(at(page.matrix, 0), 1).inner = 'cell';

    expect(Array.isArray(page.matrix)).toBe(true);
    expect(Array.isArray(at(page.matrix, 0))).toBe(true);
    expect(at(page.matrix, 0)).toHaveLength(2);
    expect(at(at(page.matrix, 0), 1).inner).toBe('cell');
  });

  it('grows to one past the highest index read, and fills a skipped index when anything reaches it', () => {
    const page = mockDeep<Page>();

    at(page.items, 2).load.mockReturnValue('third');

    expect(page.items).toHaveLength(3);
    expect(Object.hasOwn(page.items, 0)).toBe(false);
    expect(0 in page.items).toBe(true);
    expect(3 in page.items).toBe(false);
    expect('map' in page.items).toBe(true);
    expect(page.items.map((item) => item.load(1))).toEqual([undefined, undefined, 'third']);
    expect(Object.hasOwn(page.items, 0)).toBe(true);
  });

  it('takes writes as an array does', () => {
    const page = mockDeep<Page>();
    const plain: Item = { title: 'plain', load: () => 'x' };

    at(page.items, 0).title = 'node';
    (page.items as unknown as Item[]).push(plain);
    Reflect.set(page.items, 0, plain);

    expect(page.items).toEqual([plain, plain]);
  });

  it('names each element after its index, so a failure says which one', () => {
    const page = mockDeep<Page>();

    expect(at(page.items, 3).load.getMockName()).toBe('mockDeep.items[3].load');
  });

  it('carries Symbol.dispose, so `using` on the array resets its elements', () => {
    const page = mockDeep<Page>();

    at(page.items, 0).load.mockReturnValue('configured');

    {
      using items = page.items;

      expect(at(items, 0).load(1)).toBe('configured');
    }

    expect(at(page.items, 0).load(1)).toBeUndefined();
  });

  it('is reset with the tree it hangs from', () => {
    const page = mockDeep<Page>();

    at(at(page.matrix, 0), 0).inner = 'kept';
    at(page.items, 0).load.mockReturnValue('configured');
    at(page.items, 0).load(1);

    resetAutoSpy(page);

    expect(at(page.items, 0).load).not.toHaveBeenCalled();
    expect(at(page.items, 0).load(1)).toBeUndefined();
    // A reset reverts spies; seeded values and the array's length stay, as they do on any node.
    expect(page.items).toHaveLength(1);
  });

  it('passes selfReturning down to the elements', () => {
    interface Chain {
      steps: { next(): Chain }[];
    }

    const chain = mockDeep<Chain>({}, { selfReturning: true });
    const step = at(chain.steps, 0);

    expect(step.next()).toBe(step.next);
  });
});

describe('mockDeep — arrays: what a spec said first wins', () => {
  it('leaves a seeded array alone', () => {
    const seeded: Item[] = [];
    const page = mockDeep<Page>({ items: seeded });

    expect(page.items).toBe(seeded);
    expect(page.items[0]).toBeUndefined();
  });

  it('leaves an assigned array alone', () => {
    const page = mockDeep<Page>();
    const assigned: Item[] = [{ title: 'a', load: () => 'a' }];

    Reflect.set(page, 'items', assigned);

    expect(page.items[0]).toBe(assigned[0]);
  });

  it('does not overwrite an assignment through a handle read before it', () => {
    const page = mockDeep<Page>();
    const handle = page.items;
    const assigned: Item[] = [];

    Reflect.set(page, 'items', assigned);
    void at(handle, 0);

    expect(page.items).toBe(assigned);
  });

  it('does not revive a deleted member through a handle read before the delete', () => {
    const page = mockDeep<Partial<Page>>();
    const handle = page.items;

    delete page.items;
    void handle?.[0];

    expect(page.items).toBeUndefined();
  });

  it('does not overwrite a replaced element through its old handle', () => {
    const page = mockDeep<Page>();
    const element = at(page.matrix, 0);
    const replacement = [{ inner: 'plain' }];

    Reflect.set(page.matrix, 0, replacement);
    void at(element, 0);

    expect(page.matrix[0]).toBe(replacement);
  });
});

describe('mockDeep — arrays: the handle read before the first index', () => {
  it('stays a node, and answers its indices from the same array', () => {
    const page = mockDeep<Page>();
    const handle = page.items;

    at(handle, 0).title = 'first';

    expect(Array.isArray(handle)).toBe(false);
    expect(Array.isArray(page.items)).toBe(true);
    expect(at(handle, 0)).toBe(at(page.items, 0));
    expect(at(page.items, 1)).toBe(at(handle, 1));
  });

  it('is what the root of a `mockDeep<T[]>()` is: indexable, not an array', () => {
    const list = mockDeep<Item[]>();

    at(list, 0).load.mockReturnValue('first');

    expect(Array.isArray(list)).toBe(false);
    expect(at(list, 0).load(1)).toBe('first');
  });
});

describe('mockDeep — keys that only look numeric', () => {
  it.each(['01', '-1', '1.5', '4294967295', '9e3'])('keeps %s a child node', (key) => {
    const page = mockDeep<Page>();
    const child: unknown = Reflect.get(page.byCode, key);

    expect(vi.isMockFunction(child)).toBe(true);
    expect(Array.isArray(page.byCode)).toBe(false);
  });

  it('turns the largest array index into an array element', () => {
    const page = mockDeep<Page>();

    void page.byCode['4294967294'];

    expect(Array.isArray(page.byCode)).toBe(true);
  });

  it('never iterates a node that was not read by index', () => {
    const page = mockDeep<Page>();

    expect(Reflect.get(page.byCode, Symbol.iterator)).toBeUndefined();
    expect(() => [...(page.byCode as unknown as Item[])]).toThrow(TypeError);
  });
});
