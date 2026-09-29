// @vitest-environment node
import { describe, expect, it } from 'vitest';

import '../index';
import { createOverlayDouble } from './overlay-double';

class Overlay {
  create(): unknown {
    return undefined;
  }
}

describe('createOverlayDouble in a node environment', () => {
  it('opens a ref with no elements where there is no document', () => {
    const double = createOverlayDouble(Overlay);

    double.overlay.create();

    const { ref } = double.lastRef();

    ref.addPanelClass('open');

    expect(ref.overlayElement).toBeUndefined();
    expect(ref.hostElement).toBeUndefined();
  });
});
