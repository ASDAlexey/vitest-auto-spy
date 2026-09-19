/**
 * The Angular half of `passthrough`: a service taken from a real TestBed injector and spied in place
 * has to keep its dependencies, its signals, its `ɵprov` and its teardown, or "observe without
 * replacing" is only true outside the framework it is for.
 */
import { Component, Injectable, type OnDestroy, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createSpyFromInstance, restoreSpiedInstance } from '../index';
import { setDefaultStrictMode } from './function-spy';

const destroyed: string[] = [];

@Injectable({ providedIn: 'root' })
class PriceFormatter {
  format(amount: number): string {
    return `EUR ${amount}`;
  }
}

@Injectable({ providedIn: 'root' })
class CartService implements OnDestroy {
  readonly #formatter = inject(PriceFormatter);

  readonly prices = signal<number[]>([]);

  add(price: number): string {
    this.prices.update((prices) => [...prices, price]);

    return this.#formatter.format(this.total());
  }

  total(): number {
    return this.prices().reduce((sum, price) => sum + price, 0);
  }

  checkout(): Promise<string> {
    return Promise.resolve(`charged ${this.total()}`);
  }

  ngOnDestroy(): void {
    destroyed.push('cart');
  }
}

@Component({ selector: 'app-cart', template: '<p>{{ label() }}</p>' })
class CartComponent {
  readonly cart = inject(CartService);

  readonly label = signal('');

  addOne(): void {
    this.label.set(this.cart.add(5));
  }
}

// A suite-wide strict default, as `setupAutoSpy({ strict: true })` installs it: passthrough has to win over it.
beforeAll(() => {
  setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });
});

afterAll(() => {
  setDefaultStrictMode(undefined);
});

// Cleared before rather than after: the TestBed teardown that fills it runs after every spec hook.
beforeEach(() => {
  destroyed.splice(0);
});

function spiedCart(): CartService {
  return TestBed.inject(CartService);
}

describe('createSpyFromInstance passthrough on a TestBed service', () => {
  it('keeps the real DI graph working and records the calls the component made', () => {
    const cart = createSpyFromInstance(spiedCart(), { passthrough: true });
    const fixture = TestBed.createComponent(CartComponent);

    fixture.componentInstance.addOne();
    fixture.detectChanges();

    expect(fixture.componentInstance.cart).toBe(cart);
    expect(fixture.nativeElement.textContent).toContain('EUR 5');
    expect(cart.add).toHaveBeenCalledWith(5);
    expect(cart.total).toHaveBeenCalledTimes(1);
    expect(cart.prices()).toEqual([5]);
  });

  it('replaces only the method the test configured', async () => {
    const cart = createSpyFromInstance(spiedCart(), { passthrough: true });

    cart.checkout.resolveWith('declined');

    expect(cart.add(3)).toBe('EUR 3');
    await expect(cart.checkout()).resolves.toBe('declined');
  });

  it('leaves the class, its ɵprov and the next injector untouched', () => {
    const provider: unknown = Reflect.get(CartService, 'ɵprov');
    const cart = createSpyFromInstance(spiedCart(), { passthrough: true });

    expect(Reflect.get(CartService, 'ɵprov')).toBe(provider);
    expect(TestBed.inject(CartService)).toBe(cart);
    expect(Object.prototype.hasOwnProperty.call(CartService.prototype.add, 'mock')).toBe(false);

    TestBed.resetTestingModule();

    const fresh = TestBed.inject(CartService);

    expect(fresh).not.toBe(cart);
    expect(Object.prototype.hasOwnProperty.call(fresh, 'add')).toBe(false);
  });

  it('runs the real ngOnDestroy when TestBed tears the injector down', () => {
    createSpyFromInstance(spiedCart(), { passthrough: true });

    TestBed.resetTestingModule();

    expect(destroyed).toEqual(['cart']);
  });

  it('is real again after restoreSpiedInstance, inside the same injector', () => {
    const service = spiedCart();

    createSpyFromInstance(service, { passthrough: true });
    restoreSpiedInstance(service);

    expect(Object.prototype.hasOwnProperty.call(service, 'add')).toBe(false);
    expect(service.add(2)).toBe('EUR 2');
  });
});
