/**
 * `setInputs` replaces `componentRef.setInput` plus a wait, so these specs pin both halves: the
 * values arrive, and the fixture has finished reacting to them by the time the promise resolves —
 * the part a hand-written `setInput` leaves out. The rest is the guard on the names, which turns a
 * typo from a console line nobody reads into a failure at the call that caused it.
 */
import { Component, effect, input, model, signal, untracked } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { expectEmission } from './expect-emission';
import { mockValueProp } from './prop-mock';
import { renderShallow } from './render-shallow';
import { setInputs } from './set-inputs';

@Component({ selector: 'app-counter', template: '' })
class CounterComponent {
  readonly step = input(1);
  readonly label = input('idle');
  readonly total = model(0);
  readonly runs = signal(0);

  constructor() {
    // `step` is the only dependency: the total is written untracked, so the effect settles in one
    // pass instead of chasing its own write.
    effect(() => {
      const step = this.step();

      untracked(() => {
        this.total.set(step * 10);
        this.runs.update((runs) => runs + 1);
      });
    });
  }
}

@Component({ selector: 'app-alias', template: '' })
class AliasComponent {
  readonly heading = input('draft', { alias: 'title' });
}

@Component({ selector: 'app-plain', template: '' })
class PlainComponent {
  readonly state = signal('idle');
}

describe('setInputs', () => {
  it('sets every input it is given', async () => {
    const { fixture, component } = renderShallow(CounterComponent);

    await setInputs(fixture, { step: 5, label: 'busy' });

    expect(component.step()).toBe(5);
    expect(component.label()).toBe('busy');
  });

  it('writes a model() input by its value, like any other input', async () => {
    const { fixture, component } = renderShallow(CounterComponent);

    await setInputs(fixture, { total: 42 });

    expect(component.total()).toBe(42);
  });

  it('flushes the effects the new value starts, so the model has already emitted', async () => {
    const { fixture, component } = renderShallow(CounterComponent);
    const emitted = expectEmission(component.total, { timeout: 200 });

    await setInputs(fixture, { step: 3 });

    await expect(emitted).resolves.toBe(30);
    expect(component.runs()).toBe(2);
  });

  it('takes an aliased input under either name', async () => {
    const { fixture, component } = renderShallow(AliasComponent);

    await setInputs(fixture, { heading: 'shipped' });

    expect(component.heading()).toBe('shipped');
  });

  it('passes its options to stable, so a spec driving two fixtures can name them', async () => {
    const { fixture } = renderShallow(CounterComponent);
    const restore = mockValueProp(fixture, 'whenStable', () => new Promise<void>(() => undefined));

    await expect(setInputs(fixture, { step: 2 }, { timeout: 30, label: 'the counter fixture' })).rejects.toThrow(
      /the counter fixture was still unstable after 30 ms/,
    );

    restore();
  });

  it('refuses a name the component does not declare, listing the ones it does', async () => {
    const { fixture } = renderShallow(CounterComponent);

    await expect(
      // @ts-expect-error — the type rejects it too; this is the runtime half, for a value the spec built dynamically
      setInputs(fixture, { steps: 5 }),
    ).rejects.toThrow(/CounterComponent declares no input named 'steps'\. Its inputs are 'step', 'label', 'total'\./);
  });

  it('sets nothing at all when one name out of several is unknown', async () => {
    const { fixture, component } = renderShallow(CounterComponent);

    await expect(
      // @ts-expect-error — `missing` is not an input, and the two valid keys must not be applied either
      setInputs(fixture, { label: 'busy', total: 9, missing: true }),
    ).rejects.toThrow(/'missing'/);

    expect(component.label()).toBe('idle');
    expect(component.total()).toBe(10);
  });

  it('says the component has no inputs at all when that is the reason', async () => {
    const { fixture } = renderShallow(PlainComponent);

    await expect(
      // @ts-expect-error — a signal the component owns is not an input, and this is where that shows
      setInputs(fixture, { state: 'busy' }),
    ).rejects.toThrow(/PlainComponent declares no input named 'state'\. It declares no inputs at all\./);
  });
});
