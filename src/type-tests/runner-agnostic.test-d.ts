/**
 * Type-level tests for the runner-agnostic additions: `consoleLines()`, the undo `setSpyEngine`
 * hands back, and `createNestUnit` from the `node:test` and Bun entries.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { createNestUnit as bunCreateNestUnit } from '../bun';
import { type ConsoleChannel, type ConsoleLine, consoleLines } from '../console';
import { createNestUnit } from '../nestjs';
import type { NestUnit, createNestUnit as nodeCreateNestUnit } from '../node';
import { setSpyEngine } from '../setup';

describe('consoleLines', () => {
  it('lists each call as its channel followed by its arguments', () => {
    expectTypeOf(consoleLines).parameters.toEqualTypeOf<[]>();
    expectTypeOf(consoleLines()).toEqualTypeOf<ConsoleLine[]>();
    expectTypeOf<ConsoleLine[0]>().toEqualTypeOf<ConsoleChannel>();
    expectTypeOf<['warn', 'deprecated', { id: number }]>().toExtend<ConsoleLine>();
    expectTypeOf<['time', 'label']>().not.toExtend<ConsoleLine>();
  });
});

describe('setSpyEngine', () => {
  it('hands back an undo, which a caller may ignore', () => {
    expectTypeOf(setSpyEngine('runner')).toEqualTypeOf<() => void>();
    expectTypeOf(setSpyEngine).parameters.toEqualTypeOf<['auto-spy' | 'runner']>();
  });
});

describe('createNestUnit on every runner', () => {
  it('is the same function from /node, /bun and /nestjs', () => {
    expectTypeOf<typeof nodeCreateNestUnit>().toEqualTypeOf<typeof createNestUnit>();
    expectTypeOf<typeof bunCreateNestUnit>().toEqualTypeOf<typeof createNestUnit>();
    expectTypeOf<NestUnit<string>['unit']>().toEqualTypeOf<string>();
  });
});
