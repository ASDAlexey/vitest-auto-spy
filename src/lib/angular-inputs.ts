/**
 * One reading of a component's inputs, for every helper that sets one.
 *
 * `componentRef.setInput` answers to an input's **public** name, while `ComponentInputs<T>` is keyed
 * by the class field behind it and a spec may legitimately use either. Angular's reply to a name it
 * does not know is an `NG0303` on the console and no change at all, so every helper that skips the
 * translation loses an aliased input silently — and under a console stub loses the `NG0303` too,
 * leaving a green assertion over a default value.
 *
 * Reading `ɵcmp.inputs` in three places produced three answers to that: `setInputs` translated and
 * refused unknown names, `renderShallow` passed the spec's keys straight through, and neither knew
 * about an input a **host directive** exposes — which `setInput` accepts and which `ɵcmp.inputs`
 * does not list. This is the one reading all of them use.
 */
import { type Type } from '@angular/core';

import { angularInternalsError } from './angular-internals';
import { DOCS_LINKS, withDocs } from './docs-links';

/** The half of a compiled definition this reads: public input name → the field behind it. */
interface CompiledInputs {
  inputs: Readonly<Record<string, unknown>>;
}

/** The two definition keys a directive-ish class can carry. `ɵpipe` has no inputs to read. */
const DEFINITION_KEYS = ['ɵcmp', 'ɵdir'] as const;

function definitionOf(type: unknown): CompiledInputs | undefined {
  if (typeof type !== 'function') {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a compiled definition carries no public type; `inputs` is read key by key below.
  return DEFINITION_KEYS.map((key) => Reflect.get(type, key)).find((found) => found !== undefined) as CompiledInputs | undefined;
}

function quote(names: string[]): string {
  return names.map((name) => `'${name}'`).join(', ');
}

/**
 * The refusal for a class that carries no compiled component definition.
 *
 * Every other way this helper says no names what was passed and what to do about it; this one read
 * `ɵcmp` straight into `Object.entries` and died as `Cannot read properties of undefined (reading
 * 'inputs')`, a message with neither the component in it nor a repair. `createComponentStub` has
 * said the same thing properly since it shipped, and the two now read alike.
 */
function missingDefinitionError(caller: string, component: unknown): Error {
  const name = typeof component === 'function' ? component.name : String(component);

  return new Error(
    withDocs(
      `[vitest-auto-spy] ${caller}: ${name} carries no ɵcmp, so there are no inputs to set. The fixture must be ` +
        "a @Component's: a @Directive (ɵdir) takes its inputs through the host element that applies it, a @Pipe (ɵpipe) " +
        'has none, and a class Angular never compiled carries no definition at all. For `undefined`, import the ' +
        'component from its own file rather than from a barrel.',
      DOCS_LINKS.angular,
    ),
  );
}

function unknownInputsError(caller: string, component: Type<unknown>, unknown: string[], declared: string[]): Error {
  const known = declared.length > 0 ? `Its inputs are ${quote(declared)}.` : 'It declares no inputs at all.';

  return new Error(
    withDocs(
      `[vitest-auto-spy] ${caller}: ${component.name} declares no input named ${quote(unknown)}. ${known} ` +
        'Angular answers an undeclared name with an NG0303 on the console and leaves the component untouched, so the ' +
        'assertion fails later, on state nothing moved. A plain field is assigned on the component instance instead; ' +
        'a signal the component owns is set through the signal.',
      DOCS_LINKS.angular,
    ),
  );
}

/** The exposed names of one host-directive entry, in either shape the compiler emits. */
function exposedNames(inputs: unknown): string[] {
  if (Array.isArray(inputs)) {
    // The compiler's own flat pair list: inner public name, then the name it is exposed under.
    return inputs.filter((_entry, index) => index % 2 === 1).filter((name): name is string => typeof name === 'string');
  }

  return typeof inputs === 'object' && inputs !== null
    ? Object.values(inputs).filter((name): name is string => typeof name === 'string')
    : [];
}

/**
 * Inputs a host directive publishes through this one, which `ɵcmp.inputs` does not list.
 *
 * `hostDirectives: [{ directive: Tooltip, inputs: ['text'] }]` puts `text` on the host element, and
 * `componentRef.setInput('text', …)` sets it — the tNode collects the host's inputs and its host
 * directives' together. A check that read the component's own list alone refused a name Angular
 * accepts, with the flatly wrong message "It declares no inputs at all".
 *
 * Both shapes the runtime holds are read: the resolved `{ inner: exposed }` map of an eager list,
 * and the thunk a forward reference leaves in its place.
 */
function collectHostDirectiveInputs(definition: object, names: Map<string, string>, seen: Set<object>): void {
  const entries: unknown = Reflect.get(definition, 'hostDirectives');

  if (!Array.isArray(entries)) {
    return;
  }

  for (const entry of entries) {
    const configs: unknown = typeof entry === 'function' ? entry() : [entry];

    if (!Array.isArray(configs)) {
      continue;
    }

    for (const config of configs) {
      exposedNames(Reflect.get(Object(config), 'inputs')).forEach((name) => names.set(name, name));

      const nested = definitionOf(Reflect.get(Object(config), 'directive'));

      if (nested !== undefined && !seen.has(nested)) {
        seen.add(nested);
        collectHostDirectiveInputs(nested, names, seen);
      }
    }
  }
}

/**
 * Both spellings of every input, mapped to the one `setInput` answers to.
 *
 * An alias has two names — `heading = input('', { alias: 'title' })` is the `heading` field and the
 * `title` binding — and a spec has reason to use either: the type is keyed by the field, Angular by
 * the alias. The field pass goes first so that a name which is a field on one input and the public
 * name of another still resolves to the input that publishes it.
 */
export function inputNames(caller: string, component: Type<unknown>): Map<string, string> {
  const definition = definitionOf(component);

  if (!definition) {
    throw missingDefinitionError(caller, component);
  }

  const declared = Object.entries(definition.inputs);
  const names = new Map<string, string>();

  declared.forEach(([publicName, entry]) => {
    if (!Array.isArray(entry)) {
      throw angularInternalsError(
        'ɵcmp.inputs as [field, flags, transform] tuples',
        'Every helper that sets an input by its class-field name would map it to a wrong string, so the value would go ' +
          'to a name no component declares.',
      );
    }

    const [property] = entry;

    if (typeof property === 'string') {
      names.set(property, publicName);
    }
  });

  declared.forEach(([publicName]) => names.set(publicName, publicName));
  // The root definition goes into the seen set: two directives can carry each other as host
  // directives, and the walk has to end.
  collectHostDirectiveInputs(definition, names, new Set([definition]));

  return names;
}

/**
 * The `[publicName, value]` pairs to hand `componentRef.setInput`, or a refusal naming every key the
 * component does not declare.
 *
 * Every name is checked before the first value is set, so a rejected call leaves the component
 * exactly as it was.
 */
export function resolveInputs(caller: string, component: Type<unknown>, inputs: object): [name: string, value: unknown][] {
  const names = inputNames(caller, component);
  const targets: [name: string, value: unknown][] = [];
  const unknown: string[] = [];

  Object.entries(inputs).forEach(([name, value]: [string, unknown]) => {
    const target = names.get(name);

    if (target === undefined) {
      unknown.push(name);
    } else {
      targets.push([target, value]);
    }
  });

  if (unknown.length > 0) {
    throw unknownInputsError(caller, component, unknown, [...new Set(names.values())]);
  }

  return targets;
}
