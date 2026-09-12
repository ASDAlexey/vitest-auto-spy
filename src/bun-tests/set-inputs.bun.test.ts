/**
 * `setInputs` is portable — no runner API in it — so `vitest-auto-spy/bun-angular` publishes it too.
 * These cases prove the entry really carries it and that the wait at the end works on Bun's zoneless
 * `TestBed`.
 *
 * The component under test binds with `@Input()` rather than `input()`: under `bun test` a component
 * is compiled just-in-time, and the JIT compiler never sees a signal input, so `setInput` reaches
 * nothing for one. That is the runtime's own gap, on `componentRef.setInput` itself, and it is the
 * reason the name check below reports what it does.
 */
import { Component, Input, signal } from '@angular/core';
import { describe, expect, it } from 'bun:test';

import { renderShallow, setInputs } from '../bun-angular';

@Component({ selector: 'app-bun-counter', template: '' })
class CounterComponent {
  readonly seen = signal<number[]>([]);

  @Input() set step(value: number) {
    this.seen.update((seen) => [...seen, value]);
  }
}

describe('setInputs on bun:test', () => {
  it('sets the input and settles the fixture', async () => {
    const { fixture, component } = renderShallow(CounterComponent);

    await setInputs(fixture, { step: 4 });

    expect(component.seen()).toEqual([4]);
  });

  it('refuses a name the component does not declare', async () => {
    const { fixture } = renderShallow(CounterComponent);

    await expect(
      // @ts-expect-error — the type rejects it as well; this is the runtime half
      setInputs(fixture, { steps: 4 }),
    ).rejects.toThrow(/declares no input named 'steps'/);
  });
});
