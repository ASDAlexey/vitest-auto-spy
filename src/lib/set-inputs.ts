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
import { type Type } from '@angular/core';
import { type ComponentFixture } from '@angular/core/testing';

import { DOCS_LINKS, withDocs } from './docs-links';
import { type ComponentInputs } from './render-shallow';
import { type StableOptions, stable } from './zoneless';

/** The half of a compiled component definition this reads: public input name → the field behind it. */
interface CompiledInputs {
  inputs: Readonly<Record<string, readonly [property: string, ...rest: unknown[]]>>;
}

/**
 * Both spellings of every input, mapped to the one `setInput` answers to.
 *
 * An alias has two names — `heading = input('', { alias: 'title' })` is the `heading` field and the
 * `title` binding — and a spec has reason to use either: the type is keyed by the field, Angular by
 * the alias. The field pass goes first so that a name which is a field on one input and the public
 * name of another still resolves to the input that publishes it.
 */
function inputNames(component: Type<unknown>): Map<string, string> {
  const definition: CompiledInputs = Reflect.get(component, 'ɵcmp');
  const declared = Object.entries(definition.inputs);
  const names = new Map(declared.map(([publicName, [property]]) => [property, publicName]));

  declared.forEach(([publicName]) => names.set(publicName, publicName));

  return names;
}

function quote(names: string[]): string {
  return names.map((name) => `'${name}'`).join(', ');
}

function unknownInputsError(component: Type<unknown>, unknown: string[], declared: string[]): Error {
  const known = declared.length > 0 ? `Its inputs are ${quote(declared)}.` : 'It declares no inputs at all.';

  return new Error(
    withDocs(
      `[vitest-auto-spy] setInputs: ${component.name} declares no input named ${quote(unknown)}. ${known} ` +
        'Angular answers an undeclared name with an NG0303 on the console and leaves the component untouched, so the ' +
        'assertion fails later, on state nothing moved. A plain field is assigned on the component instance instead; ' +
        'a signal the component owns is set through the signal.',
      DOCS_LINKS.angular,
    ),
  );
}

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
 * @param inputs Values keyed by input name — the field's or the alias's, both resolve. Every key is
 *   checked against the compiled definition before the first one is set, so a rejected call leaves
 *   the component exactly as it was.
 * @param options Passed to {@link stable} — `{ label }` when a spec drives more than one fixture.
 */
export async function setInputs<T>(fixture: ComponentFixture<T>, inputs: ComponentInputs<T>, options: StableOptions = {}): Promise<void> {
  const names = inputNames(fixture.componentRef.componentType);
  const targets: [name: string, value: unknown][] = [];
  const unknown: string[] = [];

  Object.entries(inputs).forEach(([name, value]) => {
    const target = names.get(name);

    if (target === undefined) {
      unknown.push(name);
    } else {
      targets.push([target, value]);
    }
  });

  if (unknown.length > 0) {
    throw unknownInputsError(fixture.componentRef.componentType, unknown, [...new Set(names.values())]);
  }

  targets.forEach(([name, value]) => fixture.componentRef.setInput(name, value));

  await stable(fixture, options);
}
