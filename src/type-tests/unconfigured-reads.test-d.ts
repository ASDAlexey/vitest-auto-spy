/**
 * Type-level tests for the read side of strict mode: `onUnstubbedRead` on every factory that builds a
 * double, and `unconfiguredReads` / `onUnstubbedRead` on `setupAutoSpy`. What a handler receives is
 * the part a caller writes code against, so it is pinned field by field.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { type UnstubbedRead, type UnstubbedReadHandler, createAutoMock, createSpyFromClass } from '../auto-spy';
// `/setup` reads a global the `/console` entry declares; this program has to see the declaration too.
import type {} from '../console';
import { type UnconfiguredReadsReaction, setupAutoSpy } from '../setup';

class Router {
  get url(): string {
    return '/';
  }

  navigate(): boolean {
    return true;
  }
}

describe('onUnstubbedRead', () => {
  it('hands the handler the class, the member, its kind and the count', () => {
    createSpyFromClass(Router, {
      gettersToSpyOn: ['url'],
      onUnstubbedRead: (read) => {
        expectTypeOf(read).toEqualTypeOf<UnstubbedRead>();
        expectTypeOf(read.className).toEqualTypeOf<string | undefined>();
        expectTypeOf(read.member).toEqualTypeOf<string>();
        expectTypeOf(read.kind).toEqualTypeOf<'getter' | 'observable'>();
        expectTypeOf(read.count).toEqualTypeOf<number>();
      },
    });
  });

  it('is accepted by the type-driven factory, and its result is ignored', () => {
    const record: UnstubbedReadHandler = ({ member }) => member.length;

    createAutoMock<Router>(undefined, { strict: true, onUnstubbedRead: record });
    expectTypeOf<UnstubbedReadHandler>().returns.toEqualTypeOf<void>();
  });
});

describe('setupAutoSpy', () => {
  it('grades the report like every other guard', () => {
    expectTypeOf<UnconfiguredReadsReaction>().toEqualTypeOf<'off' | 'throw' | 'warn'>();

    setupAutoSpy({ strict: true, unconfiguredReads: 'warn', onUnstubbedRead: ({ className }) => className });

    // @ts-expect-error — not a grade
    setupAutoSpy({ unconfiguredReads: 'fail' });
  });
});
