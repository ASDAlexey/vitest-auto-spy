/**
 * `createComponentStub` — a stand-in for a child component, directive or pipe, built from the real
 * one's compiled definition so the two cannot drift apart.
 *
 * The hand-written stub is a class in the spec that restates the child's selector, inputs and
 * outputs. Nothing checks the copy: rename an input on the real child and the stub keeps the old
 * name, the parent's binding goes to a property nobody declared, and the spec either stays green
 * over a template that no longer binds, or fails with `NG0303` pointing at the stub. Reading the
 * definition — `ɵcmp`, `ɵdir`, `ɵpipe` — keeps the selector, the input and output names, the aliases
 * and `exportAs` in step with the class by construction.
 *
 * `renderShallow` is the other half, not a substitute: it drops a component's children, which is
 * right when nothing reads the template, and keeps none of their bindings. A stub is for the spec
 * that does read the template and wants the child's slot there without the child.
 */
import { Component, Directive, EventEmitter, Input, Output, Pipe, type Type, input, model } from '@angular/core';

import { DOCS_LINKS, withDocs } from './docs-links';

/** `SelectorFlags` from Angular's selector matcher: what the entries after a flag describe. */
const NOT = 0b0001;
const ATTRIBUTE = 0b0010;
const CLASS = 0b1000;

/** `InputFlags.SignalBased`: the input is an `input()` / `model()` field, not a decorated property. */
const SIGNAL_BASED = 0b0001;

let stubCount = 0;

/** One compiled selector: a tag name, then attribute pairs and class names separated by flags. */
type CompiledSelector = readonly (number | string)[];

/** The part of a directive or component definition a stub is built from. */
interface CompiledDirective {
  selectors: readonly CompiledSelector[];
  inputs: Readonly<Record<string, readonly [property: string, flags: number, transform: ((value: unknown) => unknown) | null]>>;
  outputs: Readonly<Record<string, string>>;
  exportAs: readonly string[] | null;
  ngContentSelectors?: readonly string[];
}

/** The part of a pipe definition a stub is built from. */
interface CompiledPipe {
  name: string;
  pure: boolean;
}

/** Options for {@link createComponentStub}. */
export interface ComponentStubOptions {
  /**
   * The stub component's template. Defaults to one `<ng-content>` per slot the real component
   * projects, so content the parent projects into the child still renders — and still answers a
   * query. Ignored for a directive or a pipe.
   */
  template?: string;
}

/**
 * Build a standalone stand-in for a component, directive or pipe, from its compiled definition.
 *
 * ```ts
 * const ChartStub = createComponentStub(ChartComponent);
 *
 * TestBed.configureTestingModule({ imports: [DashboardComponent] });
 * TestBed.overrideComponent(DashboardComponent, { remove: { imports: [ChartComponent] }, add: { imports: [ChartStub] } });
 *
 * const fixture = TestBed.createComponent(DashboardComponent);
 * fixture.detectChanges();
 *
 * const chart = fixture.debugElement.query(By.directive(ChartStub)).componentInstance;
 * expect(chart.series()).toEqual([1, 2, 3]); // a signal input stays a signal input
 * chart.pointSelected.emit(2);               // an output the parent listens to
 * ```
 *
 * What is copied: the selector, every input under its public name (a signal input or `model()` as
 * a signal, a decorator input as a property, its transform included), every output as an
 * `EventEmitter` (a model's change event is the model itself), `exportAs`, and for a pipe its name
 * and purity. Nothing else is: no template, no host bindings, no providers, no lifecycle hooks, no
 * queries — a stub renders only the content projected into it and answers nothing it was not given.
 *
 * With `renderShallow`, keep the parent's template and name the stub as the child to keep:
 * `renderShallow(DashboardComponent, { keepTemplate: true, keepChildren: [ChartStub] })`.
 *
 * @param real The class to stand in for; it must carry a compiled definition.
 * @param overrides Members every stub instance starts with — a method the parent calls through a
 *   `viewChild`, a pipe's `transform` (identity by default). Copied per instance, after the inputs
 *   and outputs are created, so an override of one of those replaces it.
 * @param options {@link ComponentStubOptions}.
 */
export function createComponentStub<T>(real: Type<T>, overrides: Partial<T> = {}, options: ComponentStubOptions = {}): Type<Partial<T>> {
  const realName = typeof real === 'function' ? real.name : String(real);
  const name = `${realName}Stub`;
  const pipe = definition<CompiledPipe>(real, 'ɵpipe');

  if (pipe) {
    return Pipe({ name: pipe.name, pure: pipe.pure, standalone: true })(stubClass<T>(name, [], { transform: identity, ...overrides }));
  }

  const component = definition<CompiledDirective>(real, 'ɵcmp');
  const directive = component ?? definition<CompiledDirective>(real, 'ɵdir');

  if (!directive) {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] createComponentStub(): ${realName} carries no ɵcmp, ɵdir or ɵpipe to copy. Pass a ` +
          '@Component, @Directive or @Pipe class; for `undefined`, import it from its own file rather than a barrel.',
        DOCS_LINKS.angular,
      ),
    );
  }

  const selector = directive.selectors.map(stringifySelector).join(',');

  if (selector === '') {
    throw new Error(
      withDocs(
        `[vitest-auto-spy] createComponentStub(): ${realName} has no selector, so no template can match a stub of it.`,
        DOCS_LINKS.angular,
      ),
    );
  }

  const members = membersOf(directive);
  const Stub = stubClass<T>(name, members, overrides);
  const metadata = { selector, standalone: true, ...(directive.exportAs ? { exportAs: directive.exportAs.join(',') } : {}) };

  return component
    ? Component({ ...metadata, template: options.template ?? projectionTemplate(component.ngContentSelectors) })(Stub)
    : Directive(metadata)(Stub);
}

/** What a stub instance holds for one member: nothing until bound, a signal, or an emitter. */
type MemberKind = 'model' | 'output' | 'property' | 'signal';

/** A member the stub creates on every instance, and the decorators that declare it. */
interface StubMember {
  property: string;
  kind: MemberKind;
  inputAlias?: string;
  outputAlias?: string;
  transform?: (value: unknown) => unknown;
}

/**
 * Every input and output of the definition, one entry per class property.
 *
 * A `model()` shows up twice in a definition — a signal input and an output on the same property —
 * and is created once, as a model, so the stub keeps the two-way binding working.
 */
function membersOf(directive: CompiledDirective): StubMember[] {
  const members = new Map<string, StubMember>();

  Object.entries(directive.inputs).forEach(([alias, [property, flags, transform]]) => {
    const kind = (flags & SIGNAL_BASED) === 0 ? 'property' : 'signal';

    members.set(property, { property, kind, inputAlias: alias, ...(transform ? { transform } : {}) });
  });

  Object.entries(directive.outputs).forEach(([alias, property]) => {
    const input = members.get(property);

    members.set(property, input ? { ...input, kind: 'model', outputAlias: alias } : { property, kind: 'output', outputAlias: alias });
  });

  return [...members.values()];
}

/**
 * A fresh class for one stub, named after the real one so a failure message reads `ChartComponentStub`.
 *
 * Signal members are created in the constructor rather than as fields: `input()` and `model()` need
 * the injection context a directive's construction runs in, and there is no field syntax for a
 * member whose name is only known at run time.
 */
function stubClass<T>(name: string, members: StubMember[], seeds: object): Type<Partial<T>> {
  const created = members.filter((member) => member.kind !== 'property');
  const Stub = class {
    constructor() {
      created.forEach((member) => Reflect.set(this, member.property, createMember(member.kind)));
      Object.assign(this, { ...seeds });
    }
  };

  Object.defineProperty(Stub, 'name', { value: name });
  // Angular hashes the prototype's own names into a component's ID and warns (NG0912) when two
  // components share one — a stub of a template-only child, or the same child stubbed twice.
  Object.defineProperty(Stub.prototype, `ɵstub${(stubCount += 1)}`, { value: name });

  members.forEach((member) => declareMember(Stub.prototype, member));

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the members above are created from the definition at run time; `Partial<T>` is the honest compile-time description of an instance that holds some of the real class's members.
  return Stub as Type<Partial<T>>;
}

function createMember(kind: MemberKind): unknown {
  if (kind === 'model') {
    return model();
  }

  return kind === 'signal' ? input() : new EventEmitter();
}

/**
 * The property decorators JIT reads the stub's inputs and outputs from.
 *
 * `isSignal` is not in `Input`'s public options, and it is how Angular's own JIT transform declares
 * an `input()` field: without it the value would be assigned over the signal instead of into it.
 */
function declareMember(prototype: object, member: StubMember): void {
  if (member.inputAlias !== undefined) {
    const inputOptions = {
      alias: member.inputAlias,
      isSignal: member.kind !== 'property',
      ...(member.transform ? { transform: member.transform } : {}),
    };

    Input(inputOptions)(prototype, member.property);
  }

  if (member.outputAlias !== undefined) {
    Output(member.outputAlias)(prototype, member.property);
  }
}

/** One `<ng-content>` per projection slot, in the real component's order. */
function projectionTemplate(slots: readonly string[] = []): string {
  return slots.map((slot) => (slot === '*' ? '<ng-content></ng-content>' : `<ng-content select="${slot}"></ng-content>`)).join('');
}

/**
 * A compiled selector back as the string it was parsed from — Angular's own `stringifyCSSSelector`,
 * which is not exported. The JIT compiler parses the result into the same compiled form, which is
 * the property the spec pins.
 */
function stringifySelector(selector: CompiledSelector): string {
  let result = String(selector[0]);
  let chunk = '';
  let mode = ATTRIBUTE;
  let negated = false;

  for (let index = 1; index < selector.length; index++) {
    const entry = selector[index];

    if (typeof entry === 'number') {
      if (chunk !== '' && (entry & NOT) !== 0) {
        result += wrapNegated(negated, chunk);
        chunk = '';
      }

      mode = entry;
      negated ||= (mode & NOT) !== 0;
    } else if (mode & ATTRIBUTE) {
      const value = String(selector[++index]);

      chunk += `[${entry}${value.length > 0 ? `="${value}"` : ''}]`;
    } else {
      chunk += mode & CLASS ? `.${entry}` : ` ${entry}`;
    }
  }

  return chunk === '' ? result : result + wrapNegated(negated, chunk);
}

function wrapNegated(negated: boolean, chunk: string): string {
  return negated ? `:not(${chunk.trim()})` : chunk;
}

function definition<D>(type: unknown, key: 'ɵcmp' | 'ɵdir' | 'ɵpipe'): D | undefined {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a compiled definition carries no public type; the shape read here is the one the Angular versions this entry supports emit.
  return (typeof type === 'function' ? Reflect.get(type, key) : undefined) as D | undefined;
}

function identity(value: unknown): unknown {
  return value;
}
