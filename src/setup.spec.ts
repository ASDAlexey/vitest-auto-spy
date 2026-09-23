/**
 * `vitest-auto-spy/setup` — the entry registers the Vitest mock adapter on import, so a project
 * whose setup file only imports this entry can build spies without importing the core as well.
 */
import { describe, expect, it } from 'vitest';

import { getMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';
import { getSpyEngine, isAngularUnitTestBuilder, setSpyEngine } from './setup';

describe('vitest-auto-spy/setup', () => {
  it('registers the Vitest mock adapter on import', () => {
    expect(getMockAdapter()).toBe(vitestMockAdapter);
  });

  it('re-exports the spy engine controls', () => {
    expect(getSpyEngine()).toBe('auto-spy');

    setSpyEngine('runner');
    expect(getSpyEngine()).toBe('runner');

    setSpyEngine('auto-spy');
  });

  it('tells a setup file shared with plain Vitest that the Angular unit-test builder is running it', () => {
    const marker = Symbol.for('@angular/cli/vitest-mock-patch');

    expect(isAngularUnitTestBuilder()).toBe(false);

    Reflect.set(globalThis, marker, true);

    try {
      expect(isAngularUnitTestBuilder()).toBe(true);
    } finally {
      Reflect.deleteProperty(globalThis, marker);
    }
  });
});
