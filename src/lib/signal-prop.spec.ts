import { Injectable, type Signal, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import '../angular';
import { injectSpy, provideAutoSpy } from './angular';
import { restoreMockedProps } from './prop-mock';
import { mockSignalProp } from './signal-prop';

@Injectable({ providedIn: 'root' })
class CounterService {
  readonly count: Signal<number> = signal(0);

  reset(): void {
    /* prototype method, so the auto-spy finds it */
  }
}

describe('mockSignalProp', () => {
  afterEach(() => {
    restoreMockedProps();
    TestBed.resetTestingModule();
  });

  it('replaces the property with a signal the spec can write', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(CounterService)] });

    const service = injectSpy(CounterService);
    const count = mockSignalProp(service, 'count', 7);

    expect(service.count()).toBe(7);

    count.set(42);

    expect(service.count()).toBe(42);
  });

  it('stays reactive, so a computed downstream recomputes', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(CounterService)] });

    const service = injectSpy(CounterService);
    const count = mockSignalProp(service, 'count', 1);
    const label = computed(() => `${service.count()} items`);

    expect(label()).toBe('1 items');

    count.update((value) => value + 1);

    expect(label()).toBe('2 items');
  });

  it('is undone by restoreMockedProps', () => {
    const service = new CounterService();

    mockSignalProp(service, 'count', 5);

    expect(service.count()).toBe(5);

    restoreMockedProps();

    expect(service.count()).toBe(0);
  });
});
