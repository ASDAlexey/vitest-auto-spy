/**
 * `adoptMock` on Rstest's own `rstest.fn()`, including the run-wide reset that goes through the
 * mock's own `mockReset`.
 */
import { describe, expect, it, rstest } from '@rstest/core';

import { adoptMock, moduleNamespace } from '../rstest';

describe('adoptMock on Rstest', () => {
  it('takes over a mock in place, keeping its calls and its implementation', () => {
    const load = rstest.fn((id: number) => `real ${id}`);

    load(0);

    const adopted = adoptMock(load);

    expect(adopted).toBe(load);
    expect(load(1)).toBe('real 1');

    adopted.calledWith(2).mockReturnValue('two');

    expect(load(2)).toBe('two');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps the configuration through rstest.resetAllMocks()', () => {
    const load = rstest.fn<(id: number) => string>();

    adoptMock(load).calledWith(1).mockReturnValue('one');
    rstest.resetAllMocks();

    expect(load(1)).toBe('one');
  });

  it('runs the kept implementation and a passthrough export with the receiver of the call', () => {
    const label = rstest.fn(function label(this: { name: string }): string {
      return this.name;
    });

    adoptMock(label);

    const namespace = moduleNamespace(
      {
        shout(this: { name: string }): string {
          return this.name.toUpperCase();
        },
      },
      { passthrough: true },
    );

    const ada = { name: 'ada', label };

    expect(ada.label()).toBe('ada');
    expect(namespace.shout.call({ name: 'ada' })).toBe('ADA');
  });
});
