/**
 * `setInputs` — change a component's inputs after it is rendered, and let Angular catch up.
 *
 * `renderShallow({ inputs })` covers the first values a component is given. Everything after it is
 * the same two lines in every component spec, written by hand: one
 * `fixture.componentRef.setInput(name, value)` per input, then a wait, because a zoneless fixture
 * recomputes nothing until something asks it to. The pair is easy to write and easy to half-write —
 * an assertion placed straight after `setInput` reads the state the *previous* value produced, and
 * the spec then fails on a number that was right one render ago.
 *
 * Names are checked before anything is set. `componentRef.setInput` answers a name the component
 * does not declare with an `NG0303` on the console and no change at all, so a typo, an input that
 * was renamed under a spec, or an alias used by its class-field name all land in the same place:
 * green `setInput` calls and an assertion that fails several lines later, on state nothing moved.
 */
import { type ComponentFixture } from '@angular/core/testing';

import { resolveInputs } from './angular-inputs';
import { type ComponentInputs } from './render-shallow';
import { type StableOptions, stable } from './zoneless';

/**
 * Set inputs on a rendered component, then wait for the fixture to settle.
 *
 * ```ts
 * const { fixture, component } = renderShallow(TaskListComponent, { inputs: { projectId: 42 } });
 *
 * await setInputs(fixture, { projectId: 7, filter: 'open' });
 * expect(component.visible()).toEqual([openTask]);
 * ```
 *
 * A signal input takes the value, not the signal — the same shape `renderShallow`'s `inputs` takes.
 * A `model()` is written here and read back through its output, which emits when the component
 * itself moves it: `expectEmission(component.total)` before the call, awaited after it.
 *
 * @param fixture The fixture whose component is being driven.
 * @param inputs Values keyed by input name — the field's or the alias's, both resolve, as does one a
 *   `hostDirectives` entry exposes. Every key is checked against the compiled definition before the
 *   first one is set, so a rejected call leaves the component exactly as it was.
 * @param options Passed to {@link stable} — `{ label }` when a spec drives more than one fixture.
 */
export async function setInputs<T>(fixture: ComponentFixture<T>, inputs: ComponentInputs<T>, options: StableOptions = {}): Promise<void> {
  resolveInputs('setInputs', fixture.componentRef.componentType, inputs).forEach(([name, value]) =>
    fixture.componentRef.setInput(name, value),
  );

  await stable(fixture, options);
}
