/**
 * The file-boundary repairs against the real window and document. The first block stands in for a
 * spec file that leaks; its `afterAll` is the boundary, and the block after it is the next file.
 */
import { describe, expect, it } from 'vitest';

import { setupAutoSpy } from './setup-auto-spy';

const EVENT = 'file-boundary-leftover';
const hits: string[] = [];
const realGetComputedStyle = globalThis.getComputedStyle;
const stub = (): CSSStyleDeclaration => realGetComputedStyle(document.body);

describe('a file that leaves a listener and a replaced global behind', () => {
  setupAutoSpy({ duplicateCopies: 'off', strayListeners: true, restoreGlobals: true });

  it('adds both and never takes them off', () => {
    document.addEventListener(EVENT, () => hits.push('leaked'));
    globalThis.getComputedStyle = stub;
    document.dispatchEvent(new Event(EVENT));

    expect(hits).toEqual(['leaked']);
    expect(globalThis.getComputedStyle).toBe(stub);
  });
});

describe('the file after it', () => {
  it('meets no listener the earlier file left on the document', () => {
    hits.length = 0;
    document.dispatchEvent(new Event(EVENT));

    expect(hits).toEqual([]);
  });

  it('meets the global as it was before the earlier file replaced it', () => {
    expect(globalThis.getComputedStyle).toBe(realGetComputedStyle);
  });
});
