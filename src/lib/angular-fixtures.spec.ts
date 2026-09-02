/**
 * `extendWithAutoSpies` exists because of one ordering rule in `TestBed`, so that rule is what
 * these specs are about: several fixtures resolved independently must still end up inside a single
 * `configureTestingModule`, and the flag that guarantees "single" must not survive the test that
 * set it — a fixture object is built once per file and reused for every test in it.
 */
import { Injectable, InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { test as base, beforeEach, describe, expect, it } from 'vitest';

import '../angular';
import { extendWithAutoSpies } from './angular-fixtures';

interface Passcode {
  verify(code: string): boolean;
}

const PASSCODE = new InjectionToken<Passcode>('PASSCODE');

@Injectable()
class CartService {
  checkout(id: number): Promise<boolean> {
    return Promise.resolve(id > 0);
  }
}

@Injectable()
class ApiService {
  get(url: string): string {
    return `real ${url}`;
  }

  post(url: string): string {
    return `real ${url}`;
  }
}

const test = extendWithAutoSpies(base, {
  cart: CartService,
  api: [ApiService, { returns: { get: 'configured' } }],
  passcode: PASSCODE,
});

describe('extendWithAutoSpies', () => {
  test('injects a class fixture, already typed as a spy', async ({ cart }) => {
    cart.checkout.resolveWith(true);

    await expect(cart.checkout(1)).resolves.toBe(true);
    expect(cart.checkout).toHaveBeenCalledWith(1);
  });

  test('resolves several fixtures under one configureTestingModule', ({ cart, api }) => {
    api.get.mockReturnValue('stubbed');

    expect(api.get('/x')).toBe('stubbed');
    expect(cart.checkout).toBeDefined();
  });

  test('passes the per-entry configuration through to the double', ({ api }) => {
    // `{ returns: { get: … } }` is configuration only this entry carries: the double is still a spy,
    // and it already answers before the test says anything.
    expect(api.get('/x')).toBe('configured');
  });

  test('builds a token fixture from the token’s own type', ({ passcode }) => {
    passcode.verify.mockReturnValue(true);

    expect(passcode.verify('1234')).toBe(true);
  });

  test('hands the next test a fresh double, not the one the last test configured', ({ cart }) => {
    expect(cart.checkout).toHaveBeenCalledTimes(0);
  });
});

describe('extendWithAutoSpies — composition', () => {
  const withProvider = extendWithAutoSpies(
    base,
    { cart: CartService },
    { providers: [{ provide: ApiService, useValue: { get: (): string => 'explicit' } }] },
  );

  withProvider('registers the caller’s providers in the same module', ({ cart }) => {
    expect(cart.checkout).toBeDefined();
    expect(TestBed.inject(ApiService).get('/x')).toBe('explicit');
  });

  // A `beforeEach` may keep configuring the module: it runs before any fixture resolves, and
  // `configureTestingModule` accepts repeated calls right up until the first injection.
  describe('alongside a beforeEach that configures further', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [{ provide: PASSCODE, useValue: { verify: (): boolean => true } }] });
    });

    withProvider('leaves both sets of providers in place', ({ cart }) => {
      expect(cart.checkout).toBeDefined();
      expect(TestBed.inject(PASSCODE).verify('x')).toBe(true);
    });
  });
});

/**
 * The runner this needs is one minor above the peer range, and the failure without the check is the
 * worst kind: an older `extend` accepts the string, registers nonsense, and every test then dies on
 * `undefined` without a word about why. The probe is the arity of `extend` — see
 * `supportsBuilderExtend` — so the stand-ins below carry the arity of the real builds.
 */
describe('extendWithAutoSpies — runner check', () => {
  it('refuses an `extend` that takes fixtures as one object — Vitest 4.0 and below', () => {
    // Vitest ≤ 4.0: `taskFn.extend = function (fixtures) { … }`.
    const older = { extend: (fixtures: object): object => fixtures };

    // `as never`: the stand-in has the one member the check reads; the rest of `TestAPI` never comes into it.
    expect(() => extendWithAutoSpies(older as never, { cart: CartService })).toThrow(/needs Vitest 4\.1 or newer/);
  });

  it('names the docs page and the way back', () => {
    const older = { extend: (fixtures: object): object => fixtures };

    let message = '';

    try {
      extendWithAutoSpies(older as never, { cart: CartService });
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain('provideAutoSpy');
    expect(message).toContain('Docs: ');
  });

  it('accepts an `extend` with the builder arity, whatever else the object lacks', () => {
    // Vitest 4.1: `taskFn.extend = function (fixturesOrName, optionsOrFn, maybeFn) { … }`. Returning
    // `this`-less stand-in is enough: the check is the arity, and the loop only ever calls `extend`.
    const builder = { extend: (_name: string, _factory: unknown, _maybe?: unknown): object => builder };

    expect(() => extendWithAutoSpies(builder as never, { cart: CartService })).not.toThrow();
  });
});
