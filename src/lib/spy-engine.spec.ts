import { afterEach, describe, expect, it } from 'vitest';

import { getSpyEngine, setSpyEngine } from './spy-engine';

describe('setSpyEngine', () => {
  afterEach(() => {
    setSpyEngine('auto-spy');
  });

  it('hands back an undo that restores the engine it replaced', () => {
    const undo = setSpyEngine('runner');

    expect(getSpyEngine()).toBe('runner');

    undo();
    expect(getSpyEngine()).toBe('auto-spy');
  });

  it('undoes to the engine in place when it was called, so nested switches unwind in order', () => {
    const undoOuter = setSpyEngine('runner');
    const undoInner = setSpyEngine('auto-spy');

    undoInner();
    expect(getSpyEngine()).toBe('runner');

    undoOuter();
    expect(getSpyEngine()).toBe('auto-spy');
  });
});
