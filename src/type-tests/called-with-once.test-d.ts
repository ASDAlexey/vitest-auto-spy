import { describe, expectTypeOf, it } from 'vitest';

import { createSpyFromClass } from '../auto-spy';

class Catalog {
  label(_id: number): string {
    return '';
  }

  load(_id: number): Promise<string> {
    return Promise.resolve('');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the loose member the `any` bundle exists for.
  legacy(_id: number): any {
    return undefined;
  }
}

describe('calledWith(…).once() / .times(n)', () => {
  it('limits the sync helpers, typed against the return type', () => {
    const catalog = createSpyFromClass(Catalog);

    catalog.label.calledWith(1).once().mockReturnValue('one');
    catalog.label.calledWith(1).times(2).returnValue('two');
    catalog.label.mustBeCalledWith(1).once().failWith(new Error('down'));
    catalog.legacy.calledWith(1).once().mockReturnValue({ anything: true });

    // @ts-expect-error -- the value is typed against the method's return type
    catalog.label.calledWith(1).once().mockReturnValue(1);
    // @ts-expect-error -- `count` is a number
    catalog.label.calledWith(1).times('2');
  });

  it('does not chain a second limit', () => {
    const limited = createSpyFromClass(Catalog).label.calledWith(1).once();

    expectTypeOf(limited).not.toHaveProperty('once');
    expectTypeOf(limited).not.toHaveProperty('times');
  });

  it('is not offered on a promise chain', () => {
    const handle = createSpyFromClass(Catalog).load.calledWith(1);

    expectTypeOf(handle).not.toHaveProperty('once');
  });
});
