/**
 * `stable` / `flushEffects` exist because `fixture.detectChanges()` runs one pass and never flushes
 * effects. These specs assert exactly that difference: state that only an effect produces is
 * missing before the helper and present after it.
 */
import { Component, PendingTasks, effect, inject, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { mockValueProp } from './prop-mock';
import { renderShallow } from './render-shallow';
import { flushEffects, stable } from './zoneless';

@Component({ selector: 'app-effects', template: '' })
class EffectsComponent {
  readonly source = signal(0);
  readonly seen: number[] = [];

  constructor() {
    effect(() => this.seen.push(this.source()));
  }
}

@Component({ selector: 'app-throwing-effect', template: '' })
class ThrowingEffectComponent {
  readonly arm = signal(false);

  constructor() {
    effect(() => {
      if (this.arm()) {
        throw new Error('armed effect throws');
      }
    });
  }
}

/**
 * Unstable from a `PendingTasks` entry until a real timer arms a throwing effect, so the error
 * lands while `whenStable()` is pending — the moment TestBed's application error handler is
 * waiting to reject somebody.
 */
@Component({ selector: 'app-late-throwing-effect', template: '' })
class LateThrowingEffectComponent {
  readonly arm = signal(false);

  constructor() {
    effect(() => {
      if (this.arm()) {
        throw new Error('late effect throws');
      }
    });
    const removeTask = inject(PendingTasks).add();
    setTimeout(() => {
      this.arm.set(true);
      removeTask();
    }, 0);
  }
}

describe('stable', () => {
  it('flushes the effect a bare detectChanges() leaves pending', async () => {
    const { fixture, component } = renderShallow(EffectsComponent);

    component.source.set(5);

    expect(component.seen).not.toContain(5);

    await stable(fixture);

    expect(component.seen).toContain(5);
  });

  it('throws the cause when the fixture never stabilises, instead of hanging to the file timeout', async () => {
    const { fixture } = renderShallow(EffectsComponent);
    // A fixture whose `whenStable()` never settles is the shape of a pending HttpClient request
    // nobody flushed. Substituting the promise is how that is reproduced without one.
    const restore = mockValueProp(fixture, 'whenStable', () => new Promise<void>(() => undefined));

    await expect(stable(fixture, { timeout: 30, label: 'the products fixture' })).rejects.toThrow(
      /the products fixture was still unstable after 30 ms.*HttpTestingController/s,
    );

    restore();
  });

  it('names the fixture generically when no label is given', async () => {
    const { fixture } = renderShallow(EffectsComponent);
    const restore = mockValueProp(fixture, 'whenStable', () => new Promise<void>(() => undefined));

    await expect(stable(fixture, { timeout: 20 })).rejects.toThrow(/the fixture was still unstable after 20 ms/);

    restore();
  });

  it('says to advance the fake clock when callbacks wait on it', async () => {
    const { fixture } = renderShallow(EffectsComponent);
    const restore = mockValueProp(fixture, 'whenStable', () => new Promise<void>(() => undefined));

    vi.useFakeTimers();
    setTimeout(() => undefined, 100);

    try {
      await expect(stable(fixture, { timeout: 20 })).rejects.toThrow(
        /1 callback waits on the fake clock, holding Angular busy — advance it first: `await advanceTimers\(ms\)`\.\nDocs: \S+#zoneless-waiting$/,
      );
      setTimeout(() => undefined, 100);
      await expect(stable(fixture, { timeout: 20 })).rejects.toThrow(/2 callbacks wait on the fake clock/);
    } finally {
      vi.useRealTimers();
      restore();
    }
  });

  it('waits without a watchdog when the timeout is disabled', async () => {
    const { fixture, component } = renderShallow(EffectsComponent);

    component.source.set(11);
    await stable(fixture, { timeout: 0 });

    expect(component.seen).toContain(11);
  });

  it('rejects with the application error when an effect throws while effects flush', async () => {
    const { fixture, component } = renderShallow(ThrowingEffectComponent);

    component.arm.set(true);

    const rejection = await stable(fixture).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe('armed effect throws');
  });

  it('rejects with the application error that lands while it awaits, instead of hanging to the watchdog', async () => {
    const { fixture } = renderShallow(LateThrowingEffectComponent);

    const rejection = await stable(fixture).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe('late effect throws');
    expect((rejection as Error).message).not.toContain('[vitest-auto-spy]');
  });
});

describe('flushEffects', () => {
  it('runs pending effects synchronously, without a fixture to await', () => {
    const { component } = renderShallow(EffectsComponent);

    component.source.set(7);
    flushEffects();

    expect(component.seen).toContain(7);
  });
});
