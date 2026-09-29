/**
 * The behaviour every {@link MockAdapter} owes the core, written once and run against each adapter.
 *
 * It takes the runner's own `describe` / `it` and asserts with `node:assert`, so the same cases run
 * under Vitest against every adapter factory and under Bun, `node:test` and Rstest against the
 * adapter their entry really registers. What only one runner has stays in that adapter's own spec.
 */
import assert from 'node:assert/strict';

import type { MockAdapter } from './mock-adapter';
import { type SpyEngine, setSpyEngine } from './spy-engine';

/** The two registration functions the contract needs from a runner. */
export interface ContractRunner {
  describe(name: string, body: () => void): unknown;
  it(name: string, body: () => void): unknown;
}

/** One adapter to hold to the contract. */
export interface ContractSubject {
  name: string;
  adapter(): MockAdapter;
  /** The engine each case runs under; only the runner-shaped adapters read it. */
  engine?: SpyEngine;
}

interface Accessors {
  target: { value: number };
  reads: () => number;
  backing: () => number;
}

function accessorTarget(): Accessors {
  let backing = 5;
  let reads = 0;
  const target = {
    get value(): number {
      reads += 1;

      return backing;
    },
    set value(next: number) {
      backing = next;
    },
  };

  return { target, reads: () => reads, backing: () => backing };
}

const CASES: Record<string, (adapter: MockAdapter) => void> = {
  'createMockFn wraps the implementation, forwarding this and every argument': (adapter) => {
    const host = { tag: 'host' };
    const spy = adapter.createMockFn(function (this: typeof host, ...args: unknown[]): unknown {
      return [this.tag, ...args];
    });

    assert.deepEqual(spy.call(host, 1, 2), ['host', 1, 2]);
  },

  'createMockFn is a no-op without an implementation': (adapter) => {
    assert.equal(adapter.createMockFn()(), undefined);
  },

  'createMockFn takes a name without changing what the mock does': (adapter) => {
    const inc = adapter.createMockFn((value: number) => value + 1, 'inc');

    assert.equal(inc(1), 2);
    assert.deepEqual(adapter.getCalls(inc), [[1]]);
  },

  'getCalls returns every call as a bare argument tuple, in order': (adapter) => {
    const spy = adapter.createMockFn();

    assert.deepEqual(adapter.getCalls(spy), []);

    spy(1, 'a');
    spy();
    spy(2);

    assert.deepEqual(adapter.getCalls(spy), [[1, 'a'], [], [2]]);
  },

  'clear drops the calls and keeps the implementation': (adapter) => {
    const spy = adapter.createMockFn(() => 'original');

    assert.equal(spy('x'), 'original');

    adapter.restoreImplementation(spy, () => 'kept');
    adapter.clear(spy);

    assert.deepEqual(adapter.getCalls(spy), []);
    assert.equal(spy(), 'kept');
  },

  'reset drops the calls and the implementation installed over the original': (adapter) => {
    const spy = adapter.createMockFn(() => 'original');

    adapter.restoreImplementation(spy, () => 'override');
    spy('x');
    adapter.reset(spy);

    assert.deepEqual(adapter.getCalls(spy), []);
    assert.notEqual(spy(), 'override');
    assert.deepEqual(adapter.getCalls(spy), [[]]);
  },

  'restoreImplementation installs the given implementation': (adapter) => {
    const spy = adapter.createMockFn(() => 'original');

    assert.equal(spy(), 'original');

    adapter.restoreImplementation(spy, () => 'restored');

    assert.equal(spy(), 'restored');
  },

  'spyOnGetter records each read and calls through to the original getter': (adapter) => {
    const { target, reads } = accessorTarget();
    const getter = adapter.spyOnGetter(target, 'value');

    assert.equal(target.value, 5);
    assert.equal(reads(), 1);
    assert.deepEqual(adapter.getCalls(getter), [[]]);
  },

  'spyOnSetter records each write, calls through, and leaves the getter in place': (adapter) => {
    const { target, backing } = accessorTarget();
    const setter = adapter.spyOnSetter(target, 'value');

    target.value = 9;

    assert.equal(backing(), 9);
    assert.equal(target.value, 9);
    assert.deepEqual(adapter.getCalls(setter), [[9]]);
  },
};

/** Register the contract suite for `subject` on `runner`. */
export function describeMockAdapterContract({ describe, it }: ContractRunner, subject: ContractSubject): void {
  describe(`MockAdapter contract: ${subject.name}`, () => {
    for (const [title, body] of Object.entries(CASES)) {
      it(title, () => {
        const undo = setSpyEngine(subject.engine ?? 'auto-spy');

        try {
          body(subject.adapter());
        } finally {
          undo();
        }
      });
    }
  });
}
