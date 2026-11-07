import { beforeAll, describe, expect, it } from 'vitest';

import { WITH_UNDEFINED_Q } from './args-map.differential.mock';
import { createFunctionSpy } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { vitestMockAdapter } from './vitest-adapter';

interface Pair {
  name: string;
  config: unknown[];
  call: unknown[];
}

class Point {
  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

class Status extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

const flag = Symbol('flag');
const shared = { tag: 'a' };

function cyclic(id: number): Record<string, unknown> {
  const node: Record<string, unknown> = { id };

  node['self'] = node;

  return node;
}

function sparse(): unknown[] {
  const array: unknown[] = [1];

  array[2] = 3;

  return array;
}

const CORPUS: Pair[] = [
  { name: 'same number', config: [1], call: [1] },
  { name: 'different number', config: [1], call: [2] },
  { name: '-0 against 0', config: [-0], call: [0] },
  { name: 'NaN against NaN', config: [Number.NaN], call: [Number.NaN] },
  { name: 'null against undefined', config: [null], call: [undefined] },
  { name: 'extra trailing undefined argument', config: [1], call: [1, undefined] },
  { name: 'string against boxed string', config: ['a'], call: [Object('a')] },
  { name: 'bigint', config: [10n], call: [10n] },
  { name: 'object key order', config: [{ id: 1, name: 'a' }], call: [{ name: 'a', id: 1 }] },
  { name: 'undefined property on the call', config: [{ id: 1 }], call: [{ id: 1, query: undefined }] },
  { name: 'undefined property on the config', config: [{ id: 1, query: undefined }], call: [{ id: 1 }] },
  { name: 'undefined properties under different names', config: [{ a: undefined }], call: [{ b: undefined }] },
  { name: 'undefined against null property', config: [WITH_UNDEFINED_Q], call: [{ id: 1, q: null }] },
  { name: 'nested undefined property', config: [{ user: { id: 1 } }], call: [{ user: { id: 1, role: undefined } }] },
  { name: 'undefined symbol property', config: [{ [flag]: undefined }], call: [{}] },
  { name: 'symbol property', config: [{ [flag]: 1 }], call: [{ [flag]: 1 }] },
  { name: 'different symbol property value', config: [{ [flag]: 1 }], call: [{ [flag]: 2 }] },
  { name: 'missing property', config: [{ id: 1, name: 'a' }], call: [{ id: 1 }] },
  { name: 'sparse against undefined element', config: [sparse()], call: [[1, undefined, 3]] },
  { name: 'undefined element against sparse', config: [[1, undefined, 3]], call: [sparse()] },
  { name: 'array length', config: [[1, undefined]], call: [[1]] },
  { name: 'array order', config: [[1, 2]], call: [[2, 1]] },
  { name: 'array against index record', config: [[1]], call: [{ 0: 1 }] },
  { name: 'boxed numbers with different values', config: [Object(1)], call: [Object(2)] },
  { name: 'boxed numbers with one value', config: [Object(1)], call: [Object(1)] },
  { name: 'boxed booleans', config: [Object(true)], call: [Object(false)] },
  { name: 'boxed strings', config: [Object('ab')], call: [Object('ac')] },
  { name: 'boxed string against index record', config: [Object('ab')], call: [{ 0: 'a', 1: 'b' }] },
  { name: 'boxed number against primitive', config: [Object(1)], call: [1] },
  { name: 'typed arrays of one class', config: [new Uint8Array([1, 2])], call: [new Uint8Array([1, 2])] },
  { name: 'typed arrays with different bytes', config: [new Uint8Array([1, 2])], call: [new Uint8Array([1, 3])] },
  { name: 'typed arrays of two classes', config: [new Uint8Array([1, 2])], call: [new Int8Array([1, 2])] },
  { name: 'typed array against plain array', config: [new Uint8Array([1])], call: [[1]] },
  { name: 'Date by time', config: [new Date(5)], call: [new Date(5)] },
  { name: 'Date with another time', config: [new Date(5)], call: [new Date(6)] },
  { name: 'invalid dates', config: [new Date(Number.NaN)], call: [new Date(Number.NaN)] },
  { name: 'RegExp', config: [/a/g], call: [/a/g] },
  { name: 'RegExp flags', config: [/a/g], call: [/a/i] },
  { name: 'URL by href', config: [new URL('https://a.test/x')], call: [new URL('https://a.test/x')] },
  { name: 'URL with another href', config: [new URL('https://a.test/x')], call: [new URL('https://a.test/y')] },
  { name: 'Error by message', config: [new Error('a')], call: [new Error('a')] },
  { name: 'Error with another message', config: [new Error('a')], call: [new Error('b')] },
  { name: 'Error subclass fields', config: [new Status('a', 1)], call: [new Status('a', 2)] },
  {
    name: 'Map in any order',
    config: [
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    ],
    call: [
      new Map([
        ['b', 2],
        ['a', 1],
      ]),
    ],
  },
  { name: 'Map with another value', config: [new Map([['a', 1]])], call: [new Map([['a', 2]])] },
  { name: 'Map holding undefined properties', config: [new Map([['a', { id: 1 }]])], call: [new Map([['a', WITH_UNDEFINED_Q]])] },
  { name: 'Set in any order', config: [new Set([1, 2])], call: [new Set([2, 1])] },
  { name: 'Set with another member', config: [new Set([1, 2])], call: [new Set([1, 3])] },
  { name: 'Set of records with undefined properties', config: [new Set([{ id: 1 }])], call: [new Set([WITH_UNDEFINED_Q])] },
  { name: 'class instance against literal', config: [new Point(1, 2)], call: [{ x: 1, y: 2 }] },
  { name: 'class instances with other fields', config: [new Point(1, 2)], call: [new Point(1, 3)] },
  { name: 'shared subtree', config: [{ a: shared, b: shared }], call: [{ a: { tag: 'a' }, b: { tag: 'a' } }] },
  { name: 'cycles of one shape', config: [cyclic(1)], call: [cyclic(1)] },
  { name: 'cycles of different ids', config: [cyclic(1)], call: [cyclic(2)] },
  { name: 'prototype-less record', config: [Object.assign(Object.create(null) as object, { id: 1 })], call: [{ id: 1 }] },
  {
    name: 'getter against field',
    config: [{ id: 1 }],
    call: [
      {
        get id(): number {
          return 1;
        },
      },
    ],
  },
  { name: 'several arguments', config: [1, 'a', { id: 1 }], call: [1, 'a', WITH_UNDEFINED_Q] },
  { name: 'several arguments with one apart', config: [1, 'a', { id: 1 }], call: [1, 'b', { id: 1 }] },
  { name: 'quote inside a string', config: ["it's"], call: ["it's"] },
  { name: 'key that looks like structure', config: [{ 'a:1,b': 2 }], call: [{ a: 1, b: 2 }] },
];

const HIT = Symbol('hit');

function runnerMatches(spy: unknown, config: unknown[]): boolean {
  try {
    expect(spy).toHaveBeenCalledWith(...config);

    return true;
  } catch {
    return false;
  }
}

function verdicts(config: unknown[], call: unknown[]): { ours: boolean; runner: boolean } {
  const spy = createFunctionSpy<(...args: unknown[]) => unknown>('target');

  spy.calledWith(...config).mockReturnValue(HIT);

  const ours = spy(...call) === HIT;

  return { ours, runner: runnerMatches(spy, config) };
}

describe('calledWith agrees with toHaveBeenCalledWith', () => {
  beforeAll(() => {
    registerMockAdapter(vitestMockAdapter);
  });

  it.each(CORPUS)('keyed config: $name', ({ config, call }) => {
    const { ours, runner } = verdicts(config, call);

    expect(ours).toBe(runner);
  });

  it.each(CORPUS)('structural config: $name', ({ config, call }) => {
    const { ours, runner } = verdicts([...config, expect.anything()], [...call, 0]);

    expect(ours).toBe(runner);
  });

  it('covers both verdicts', () => {
    const results = CORPUS.map(({ config, call }) => verdicts(config, call).runner);

    expect(results).toContain(true);
    expect(results).toContain(false);
  });
});
