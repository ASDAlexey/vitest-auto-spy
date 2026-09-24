/**
 * Type-level tests for the one-method instance helpers: the call hands back that method's own
 * `Spy<T>[Method]` — helpers and argument checks included — and accepts a method key only, the
 * same list `onlyMethodsToSpyOn` checks.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { spyOnOwnMethod, spyOnVoidMethod } from '../auto-spy';
import type { Spy } from '../auto-spy';

class Player {
  readonly label: string = '';

  seek(positionMs: number): number {
    return positionMs;
  }
}

declare const clickEvent: {
  type: string;
  preventDefault(): void;
  stopPropagation(): void;
};

describe('spyOnOwnMethod', () => {
  it('hands back the one method as its own spy', () => {
    const seek = spyOnOwnMethod(new Player(), 'seek');

    expectTypeOf(seek).toEqualTypeOf<Spy<Player>['seek']>();
    expectTypeOf(seek).toBeCallableWith(1000);
    expectTypeOf(seek.calledWith(1000)).toBeObject();
  });

  it('takes method keys only', () => {
    const player = new Player();

    // @ts-expect-error -- `label` is a property, not a method
    spyOnOwnMethod(player, 'label');
    // @ts-expect-error -- no such member
    spyOnOwnMethod(player, 'play');
  });
});

describe('spyOnVoidMethod', () => {
  it('hands back the void method as its own spy', () => {
    const preventDefault = spyOnVoidMethod(clickEvent, 'preventDefault');

    expectTypeOf(preventDefault).toEqualTypeOf<Spy<typeof clickEvent>['preventDefault']>();
  });

  it('takes method keys only', () => {
    // @ts-expect-error -- `type` is a property, not a method
    spyOnVoidMethod(clickEvent, 'type');
  });
});
