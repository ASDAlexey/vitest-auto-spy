/**
 * `spyOnVoidMethod` exists for the one strict-mode trap a void DOM method sets: the call this spy
 * is there to observe is also the call the strict guard would refuse, because nothing configured
 * the method. What is pinned here is that the packed seed removes the trap and the rest of the
 * event stays real.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { restoreSpiedInstance } from './create-spy-from-instance';
import { setDefaultStrictMode } from './function-spy';
import { registerMockAdapter } from './mock-adapter';
import { spyOnVoidMethod } from './spy-on-void-method';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
});

class FakeMouseEvent {
  defaultPrevented = false;

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {}

  type(): string {
    return 'click';
  }
}

const spied: object[] = [];

function track<T extends object>(instance: T): T {
  spied.push(instance);

  return instance;
}

afterEach(() => {
  spied.splice(0).forEach(restoreSpiedInstance);
  setDefaultStrictMode(undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('spyOnVoidMethod', () => {
  it('records the call and answers undefined', () => {
    const event = track(new FakeMouseEvent());

    const preventDefault = spyOnVoidMethod(event, 'preventDefault');

    expect(event.preventDefault()).toBeUndefined();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('does not run the real method', () => {
    const event = track(new FakeMouseEvent());

    spyOnVoidMethod(event, 'preventDefault');
    event.preventDefault();

    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps the answer undefined under a strict default', () => {
    setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });
    const event = track(new FakeMouseEvent());

    const preventDefault = spyOnVoidMethod(event, 'preventDefault');

    expect(event.preventDefault()).toBeUndefined();
    expect(preventDefault).toHaveBeenCalledWith();
  });

  it('leaves every other member the real one', () => {
    const event = track(new FakeMouseEvent());

    spyOnVoidMethod(event, 'preventDefault');

    expect(event.type()).toBe('click');
    expect(vi.isMockFunction(event.stopPropagation)).toBe(false);
  });

  it('is restored by restoreSpiedInstance like the factory it wraps', () => {
    const event = track(new FakeMouseEvent());

    spyOnVoidMethod(event, 'preventDefault');
    restoreSpiedInstance(event);

    expect(vi.isMockFunction(event.preventDefault)).toBe(false);
    event.preventDefault();

    expect(event.defaultPrevented).toBe(true);
  });
});
