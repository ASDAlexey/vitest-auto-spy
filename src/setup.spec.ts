/**
 * `vitest-auto-spy/setup` — the entry registers the Vitest mock adapter on import, so a project
 * whose setup file only imports this entry can build spies without importing the core as well.
 */
import { describe, expect, it } from 'vitest';

import { getMockAdapter } from './lib/mock-adapter';
import { vitestMockAdapter } from './lib/vitest-adapter';
import { getSpyEngine, setSpyEngine } from './setup';

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
});
