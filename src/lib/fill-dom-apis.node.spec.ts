// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { fillMissingDomApis } from './fill-dom-apis';

describe('fillMissingDomApis in a node environment', () => {
  it('does nothing where the runtime has no document', () => {
    expect(fillMissingDomApis()).toEqual([]);
    expect(Reflect.get(globalThis, 'ResizeObserver')).toBeUndefined();
  });
});
