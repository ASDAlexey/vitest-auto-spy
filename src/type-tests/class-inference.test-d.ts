/**
 * `T` comes from the class (or the instance), never from the configuration.
 *
 * An `overrides` object held in a variable — an `it.each` row, a shared fixture — is a supertype of
 * the class instance, so it used to win the inference: `createSpyFromClass(KeyboardEvent, {
 * overrides: keys, returnsUndefined: ['preventDefault'] })` typed the double as `Spy<typeof keys>`,
 * rejected `'preventDefault'` with TS2345 and lost every other member with TS2339. Each factory that
 * takes a class or an instance next to a configuration is pinned here.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createSpyClass, createSpyFromClass, createSpyFromInstance, registerAutoSpyDefaults } from '../auto-spy';
import type { Spy } from '../auto-spy';
import { createSpyFromClass as createJasmineSpyFromClass, provideAutoSpy as provideJasmineAutoSpy } from '../jasmine';
import { provideAutoSpy as provideAngularAutoSpy } from '../lib/angular';
import { provideAutoSpy as provideNestAutoSpy } from '../nestjs';
import { provideAutoSpy as provideVueAutoSpy } from '../vue';

class Basket {
  count = 0;

  get label(): string {
    return 'basket';
  }

  save(): void {}

  total(): number {
    return this.count;
  }
}

const keys = { key: 'k', metaKey: true, ctrlKey: false };
const basketState = { label: 'full', count: 2 };

describe('createSpyFromClass infers T from the class', () => {
  it('keeps a DOM event whole next to an overrides variable and returnsUndefined', () => {
    const event = createSpyFromClass(KeyboardEvent, { overrides: keys, returnsUndefined: ['preventDefault'] });

    expectTypeOf(event).toEqualTypeOf<Spy<KeyboardEvent>>();
    expectTypeOf(event.stopPropagation).toBeFunction();
  });

  it('keeps a DOM event whole next to an overrides literal', () => {
    const event = createSpyFromClass(KeyboardEvent, { overrides: { key: 'Enter' }, returnsUndefined: ['preventDefault'] });

    expectTypeOf(event).toEqualTypeOf<Spy<KeyboardEvent>>();
  });

  it('keeps a DOM element whole', () => {
    const state = { value: 'typed', checked: true };
    const input = createSpyFromClass(HTMLInputElement, { overrides: state, returnsUndefined: ['focus', 'select'] });

    expectTypeOf(input).toEqualTypeOf<Spy<HTMLInputElement>>();
  });

  it('keeps a plain class whole when overrides set a getter and a field', () => {
    const basket = createSpyFromClass(Basket, { overrides: basketState, returnsUndefined: ['save'] });

    expectTypeOf(basket).toEqualTypeOf<Spy<Basket>>();
    expectTypeOf(basket.total).returns.toEqualTypeOf<number>();
  });

  it('still takes the type argument spelled out', () => {
    expectTypeOf(createSpyFromClass<KeyboardEvent>(KeyboardEvent, { overrides: keys, returnsUndefined: ['preventDefault'] })).toEqualTypeOf<
      Spy<KeyboardEvent>
    >();
  });

  it('still checks the configuration against the class', () => {
    // @ts-expect-error -- 'label' is an accessor, not a method
    createSpyFromClass(Basket, { overrides: basketState, returnsUndefined: ['label'] });
    // @ts-expect-error -- `count` is a number on Basket
    createSpyFromClass(Basket, { overrides: { count: 'two' } });
    // @ts-expect-error -- KeyboardEvent has no `submit` method
    createSpyFromClass(KeyboardEvent, ['submit']);
  });
});

describe('the sibling factories infer T the same way', () => {
  it('createSpyFromInstance', () => {
    const basket = createSpyFromInstance(new Basket(), { overrides: basketState, returnsUndefined: ['save'] });

    expectTypeOf(basket).toEqualTypeOf<Spy<Basket>>();
  });

  it('createSpyClass and registerAutoSpyDefaults', () => {
    expectTypeOf(createSpyClass(Basket, { overrides: basketState, returnsUndefined: ['save'] }).instances).toEqualTypeOf<Spy<Basket>[]>();
    registerAutoSpyDefaults(Basket, { overrides: basketState, returnsUndefined: ['save'] });
  });

  it('provideAutoSpy on /angular, /nestjs, /vue and /jasmine', () => {
    expectTypeOf(provideAngularAutoSpy(Basket, { overrides: basketState, returnsUndefined: ['save'] }).useValue).toEqualTypeOf<
      Spy<Basket>
    >();
    expectTypeOf(provideNestAutoSpy(Basket, { overrides: basketState, returnsUndefined: ['save'] }).useValue).toEqualTypeOf<Spy<Basket>>();
    expectTypeOf(provideVueAutoSpy('basket', Basket, { overrides: basketState, returnsUndefined: ['save'] }).basket).toEqualTypeOf<
      Spy<Basket>
    >();
    expectTypeOf(
      provideJasmineAutoSpy(Basket, { overrides: basketState, returnsUndefined: ['save'] }).useValue.total,
    ).returns.toEqualTypeOf<number>();
  });

  it('createSpyFromClass on /jasmine', () => {
    expectTypeOf(
      createJasmineSpyFromClass(KeyboardEvent, { overrides: keys, returnsUndefined: ['preventDefault'] }).key,
    ).toEqualTypeOf<string>();
  });
});
