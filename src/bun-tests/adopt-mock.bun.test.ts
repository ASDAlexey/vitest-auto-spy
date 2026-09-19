/**
 * `adoptMock` on Bun's own `mock()`: the mock a `mock.module` factory would build keeps its history,
 * and answers what it answered before until the test configures it.
 */
import { describe, expect, it, mock } from 'bun:test';

import { adoptMock, resetAutoSpy } from '../bun';

describe('adoptMock on bun:test', () => {
  it('takes over a mock in place, keeping its calls and its implementation', () => {
    const load = mock((id: number) => `real ${id}`);

    load(0);

    const adopted = adoptMock(load);

    expect(Object.is(adopted, load)).toBe(true);
    expect(load(1)).toBe('real 1');

    adopted.calledWith(2).mockReturnValue('two');

    expect(load(2)).toBe('two');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('reverts to the previous implementation on resetAutoSpy', () => {
    const load = mock((id: number) => `real ${id}`);

    adoptMock(load).calledWith(5).mockReturnValue('five');

    expect(load(5)).toBe('five');

    resetAutoSpy(load);

    expect(load(5)).toBe('real 5');
  });
});
