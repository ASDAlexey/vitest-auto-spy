/**
 * `registerSignalMatchers({ strict: true })` flips the default of one registration, so a suite gets
 * the `toStrictEqual` semantics without repeating `{ strict: true }` on every assertion. A spec of
 * its own because the plain registration of `signal-matchers.spec.ts` shares the runner's `expect`.
 */
import { signal } from '@angular/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { registerMockAdapter } from './mock-adapter';
import { registerSignalMatchers } from './signal-matchers';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
  registerSignalMatchers({ strict: true });
});

describe('registerSignalMatchers strict by default', () => {
  it('compares every assertion like toStrictEqual', () => {
    class Point {
      constructor(readonly x: number) {}
    }

    expect(signal({ color: undefined })).not.toHaveSignalValue({});
    expect(signal(new Point(1))).not.toHaveSignalValue({ x: 1 });
    expect(signal(new Point(1))).toHaveSignalValue(new Point(1));
    expect(signal(null)).toHaveSignalValue(null);
  });

  it('lets a single assertion opt back into the loose comparison', () => {
    expect(signal({ color: undefined })).toHaveSignalValue({}, { strict: false });
  });

  it('keeps refusing things that are not signals', () => {
    expect(() => expect(3).toHaveSignalValue(3)).toThrow(/expected a signal/);
  });
});
