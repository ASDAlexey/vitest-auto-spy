import { describe, expect, it } from 'vitest';

import { count, currentTask, displayFrame, displayPath, sourceClassName, taskName } from './message-text';
import { mockValueProp } from './prop-mock';

/** The slice of Vitest's worker state these messages read. */
interface WorkerState {
  config: { root?: string };
  current?: unknown;
}

const worker: WorkerState = Reflect.get(globalThis, '__vitest_worker__');

describe('message text', () => {
  it('counts in the singular and the plural', () => {
    expect(count(1, 'timer')).toBe('1 timer');
    expect(count(3, 'timer')).toBe('3 timers');
    expect(count(2, 'property', 'properties')).toBe('2 properties');
  });

  it('takes a bundler rename off a class name and leaves a source name alone', () => {
    expect(sourceClassName('_CartService')).toBe('CartService');
    expect(sourceClassName('CartService$1')).toBe('CartService');
    expect(sourceClassName('_private_helper')).toBe('_private_helper');
    expect(sourceClassName('CartService')).toBe('CartService');
  });

  it('prints a path relative to the runner root, and leaves a path outside it alone', () => {
    expect(displayPath('/repo/src/a.spec.ts', '/repo/')).toBe('src/a.spec.ts');
    expect(displayPath('/elsewhere/a.ts', '/repo')).toBe('/elsewhere/a.ts');
    expect(displayPath('/repo/a.ts', undefined)).toBe('/repo/a.ts');
    expect(displayPath(expect.getState().testPath ?? '')).toBe('src/lib/message-text.spec.ts');
  });

  it('makes every path in a frame relative', () => {
    expect(displayFrame('at load (/repo/src/cart.ts:12:5)', '/repo')).toBe('at load (src/cart.ts:12:5)');
    expect(displayFrame('at /repo/a.ts:1:1', undefined)).toBe('at /repo/a.ts:1:1');
    expect(displayFrame(`at ${expect.getState().testPath ?? ''}:1:1`)).toBe('at src/lib/message-text.spec.ts:1:1');
  });

  it('names the running test the way the runner does', () => {
    const task = currentTask();

    expect(task && taskName(task)).toBe(expect.getState().currentTestName);
    expect(taskName({ name: 'loads', suite: { name: 'cart', suite: { name: 'cart.spec.ts', filepath: '/repo/cart.spec.ts' } } })).toBe(
      'cart > loads',
    );
  });

  it('leaves paths absolute when no runner root is known', () => {
    const restore = mockValueProp(worker.config, 'root', undefined);

    try {
      expect(displayPath('/repo/a.ts')).toBe('/repo/a.ts');
    } finally {
      restore();
    }
  });

  it('knows no test outside one', () => {
    const restore = mockValueProp(worker, 'current', { type: 'suite' });

    try {
      expect(currentTask()).toBeUndefined();
    } finally {
      restore();
    }
  });
});
