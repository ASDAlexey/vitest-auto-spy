/**
 * What the `mock*Prop` journal has to survive: a patch that cannot be put back.
 *
 * Restoring is teardown, and teardown that gives up half-way is worse than none — the patches it
 * did not reach stay on objects that outlive the file. The sweep therefore continues past a failure,
 * empties the journal either way, and reports everything it could not undo in one message.
 *
 * The rest of the helpers' behaviour is covered from the public entry in `src/auto-spy.spec.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { countMockedProps, mockValueProp, restoreMockedProps } from './prop-mock';

describe('restoreMockedProps, when a patch cannot be undone', () => {
  // The journal is process-wide; a failing sweep in one test must not colour the next.
  afterEach(() => {
    restoreMockedProps();
  });

  it('restores the rest, empties the journal and names the property it could not put back', () => {
    const restorable = { value: 'real' };
    const sealed = { value: 'real' };

    mockValueProp(restorable, 'value', 'patched');
    mockValueProp(sealed, 'value', 'patched');
    // What `guardGlobals` exists to catch: a redefinition that seals a property the library still
    // holds the original descriptor for, so nothing can ever put that descriptor back.
    Object.defineProperty(sealed, 'value', { value: 'sealed', configurable: false });

    expect(() => restoreMockedProps()).toThrow(/could not put 1 of the patched properties back[\s\S]*- value: TypeError/);

    // Swept newest first, so the sealed patch failed before this one was even reached.
    expect(restorable.value).toBe('real');
    expect(sealed.value).toBe('sealed');
    expect(countMockedProps()).toBe(0);
    expect(() => restoreMockedProps()).not.toThrow();
  });

  it('reports every failure of the sweep, not just the first', () => {
    const first = { value: 'real' };
    const second = { value: 'real' };

    mockValueProp(first, 'value', 'patched');
    mockValueProp(second, 'value', 'patched');
    Object.defineProperty(first, 'value', { value: 'sealed', configurable: false });
    Object.defineProperty(second, 'value', { value: 'sealed', configurable: false });

    expect(() => restoreMockedProps()).toThrow(/could not put 2 of the patched properties back/);
  });
});

describe('the undo of a single patch', () => {
  it('is not counted or swept a second time', () => {
    const host = { a: 'real-a', b: 'real-b' };
    const undoA = mockValueProp(host, 'a', 'mocked-a');

    mockValueProp(host, 'b', 'mocked-b');
    expect(countMockedProps()).toBe(2);

    undoA();
    expect(countMockedProps()).toBe(1);

    undoA();
    expect(countMockedProps()).toBe(1);

    restoreMockedProps();
    expect(host).toEqual({ a: 'real-a', b: 'real-b' });
    expect(countMockedProps()).toBe(0);
  });
});
