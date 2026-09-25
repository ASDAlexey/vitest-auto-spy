/**
 * `renderShallow` — bring a component up through the standard `TestBed`, without its children and
 * (by default) without its template.
 *
 * This is the copy-paste that a component-heavy suite grows on its own: `configureTestingModule` +
 * `NO_ERRORS_SCHEMA` + `overrideComponent` trimming `imports` + a blank template, repeated per
 * spec. Nothing here replaces `TestBed`; it is the same call sequence, made one line and given a
 * name. `fixture` is a real `ComponentFixture`, so every `@angular/core/testing` API still applies.
 *
 * The point is cost. A `TestBed.createComponent` pays for compiling the component's template and
 * instantiating the whole child subtree; a suite that asserts on TypeScript state only (no markup
 * assertions) buys nothing with that subtree. Blanking the template keeps lifecycle hooks, inputs,
 * signals and DI — everything such a spec actually reads.
 */
import {
  type Component,
  type EnvironmentProviders,
  type InputSignal,
  type InputSignalWithTransform,
  type ModelSignal,
  NO_ERRORS_SCHEMA,
  type Provider,
  type Type,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { resolveInputs } from './angular-inputs';
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';

/**
 * The value `componentRef.setInput` expects for a member — signal inputs are set with the value, not
 * the signal.
 *
 * The read type in the pattern is what makes a transform input work.
 * `input(false, { transform: booleanAttribute })` is an `InputSignalWithTransform<boolean, unknown>`,
 * and against a pattern whose read type is fixed to `unknown` that match **fails**: the node behind
 * the signal carries the read type in both directions, so a wider one is not a supertype, and
 * `never` matches nothing at all. The member fell through to itself, and the spec was told to pass
 * an `InputSignalWithTransform` where the component takes a boolean.
 */
type InputValue<Member> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the pattern has to match every instantiation, and only `any` does: the read type is invariant, so `unknown` matches none of the transform inputs and `never` matches nothing at all
  Member extends InputSignalWithTransform<any, infer Write>
    ? Write
    : Member extends InputSignal<infer Value>
      ? Value
      : Member extends ModelSignal<infer Value>
        ? Value
        : Member;

/** The inputs of a component, keyed as declared but typed as the values `setInput` takes. */
export type ComponentInputs<T> = { [Key in keyof T]?: InputValue<T[Key]> };

/** Options for {@link renderShallow}. */
export interface RenderShallowOptions<T> {
  /**
   * Providers for the testing module — `provideAutoSpy(SomeService)`, a `useValue` stub, and the
   * `provide*()` helpers (`provideHttpClient()`, `provideRouter()`, …) that return
   * `EnvironmentProviders`. They go to `TestBed` untouched, so anything `configureTestingModule`
   * accepts works here.
   */
  providers?: (EnvironmentProviders | Provider)[];
  /** Extra imports for the testing module (a routing stub, an `NgModule` the component needs). */
  imports?: unknown[];
  /**
   * Inputs to set through `componentRef.setInput` before the first change detection. Keyed by the
   * class field or by the public name, both resolve; a name the component does not declare is
   * refused here rather than answered with an `NG0303` nobody sees.
   */
  inputs?: ComponentInputs<T>;
  /**
   * Keep the real template instead of blanking it — for `viewChild`, content projection, host
   * bindings. The template's own pipes and directives stay resolvable; child components are still
   * dropped, which is what keeps the render shallow. Under JIT a child re-exported by an imported
   * `NgModule` survives, because the module is kept whole.
   *
   * Under **AOT** an imported `NgModule` is not in the compiled dependency list at all — ngtsc
   * resolves its exported scope and flattens the declarations into the list instead — so a
   * `standalone: false` pipe or directive is what arrives, and Angular refuses one of those in
   * `imports`. That case throws with the declaration named rather than letting Angular blame the
   * pipe's author; see the error for what to do instead.
   */
  keepTemplate?: boolean;
  /**
   * `NgModule`s to put back whole under `keepTemplate: true` — `ReactiveFormsModule`, `FormsModule`.
   * An AOT build flattens an imported module into its exported declarations, which Angular refuses in
   * `imports`; a module named here replaces every declaration it exports, so the scope is importable.
   */
  keepModules?: Type<unknown>[];
  /** Child components/directives/pipes to keep resolvable in the template (everything else is dropped). */
  keepChildren?: Type<unknown>[];
  /**
   * `false` drops the component's `hostDirectives`, and with them every service they inject — the
   * graph a shallow render exists to avoid. Default `true`: a host directive is part of the component,
   * not a child of it.
   */
  keepHostDirectives?: boolean;
  /** Stand-in template to render instead of a blank one (ignored when `keepTemplate` is set). */
  template?: string;
  /**
   * Runs after the testing module is configured and the component is trimmed, but before it is
   * created — the seam a spec needs when a field initializer or the constructor reads a dependency
   * it must first stub (`mockReadonlyProp(injectSpy(Store), 'items', signal([]))`). An
   * `overrideComponentProvider` goes before any `injectSpy` here: the first read of the injector
   * instantiates the module, and no override applies after it.
   */
  beforeCreate?: () => void;
  /** Run the first change detection (and therefore `ngOnInit`). Default `true`. */
  detectChanges?: boolean;
}

/** What {@link renderShallow} hands back: the real fixture plus its component instance. */
export interface ShallowRender<T> {
  fixture: ComponentFixture<T>;
  component: T;
}

/** Shared between calls: `TestBed` stores what it is given, it never writes back into these. */
const PERMISSIVE_SCHEMAS = [NO_ERRORS_SCHEMA];
const NOTHING: [] = [];

/** Whether Angular compiled this component as standalone (it then carries its own `imports`/`schemas`). */
function isStandalone(definition: unknown): definition is object {
  return typeof definition === 'object' && definition !== null && Reflect.get(definition, 'standalone') === true;
}

/** The three shapes a compiled `dependencies` is legally in: the flat list, a factory for it, or nothing. */
type CompiledImports = Type<unknown>[] | (() => Type<unknown>[]) | null | undefined;

/**
 * Everything a standalone component imports, as the compiler stored it on the definition.
 *
 * Which shape arrives is not a question of JIT against AOT. JIT always emits the factory; AOT emits
 * the **array**, and reaches for a factory only to break a cycle between two components, since
 * deferring the read is the whole point of one. A component that imports nothing carries `null`
 * (`defineComponent`: `standalone && dependencies || null`). Calling the array was a `TypeError`
 * under `keepTemplate: true` on every AOT-compiled component whose imports held no cycle.
 */
function importsOf(definition: object): Type<unknown>[] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `ɵcmp` carries no public type, and this shape is the compiler's own output for a standalone component.
  const dependencies = Reflect.get(definition, 'dependencies') as CompiledImports;
  const resolved = typeof dependencies === 'function' ? dependencies() : dependencies;

  return Array.isArray(resolved) ? resolved : NOTHING;
}

/** A component import is a piece of the subtree; a directive, a pipe or a module is template vocabulary. */
function isChildComponent(dependency: Type<unknown>): boolean {
  return Reflect.get(dependency, 'ɵcmp') !== undefined;
}

/** The three definition keys a template dependency can carry; an `NgModule` (`ɵmod`) is none of them. */
const DECLARATION_KEYS = ['ɵcmp', 'ɵdir', 'ɵpipe'] as const;

/**
 * The name of a dependency Angular will refuse in `imports`, when that is what this one is.
 *
 * Only a declaration can be refused: an `NgModule` belongs in `imports` whatever it declares, and
 * anything carrying no definition at all is not ours to judge.
 */
function refusedInImports(dependency: Type<unknown>): string | undefined {
  if (Reflect.get(dependency, 'ɵmod') !== undefined) {
    return undefined;
  }

  const definition = DECLARATION_KEYS.map((key) => Reflect.get(dependency, key)).find((value) => value !== undefined);

  return definition !== undefined && Reflect.get(definition, 'standalone') !== true ? dependency.name : undefined;
}

/**
 * Refuse a kept scope Angular cannot accept, naming the declaration and the reason.
 *
 * Without this the failure is Angular's own — `The "X" pipe, imported from "Y", is not standalone.
 * Does the pipe have the standalone: false flag?` — which reads as an instruction to go and change
 * that pipe. It is not: the pipe is fine, and under JIT this very call works. The list it came from
 * is the AOT one, where the `NgModule` that declares it has already been flattened away, so the
 * scope simply cannot be rebuilt from what the definition carries.
 */
function assertScopeIsImportable(component: Type<unknown>, kept: Type<unknown>[], candidates: readonly unknown[]): void {
  const refused = kept.filter((dependency) => refusedInImports(dependency) !== undefined);

  if (refused.length === 0) {
    return;
  }

  const names = refused.map((dependency) => dependency.name);
  const owners = [...new Set(refused.map((dependency) => declaringModule(dependency, candidates)))];
  const [owner] = owners;
  const fix =
    owners.length === 1 && owner !== undefined
      ? `keepModules: [${owner}]`
      : `keepModules: [<the NgModule that declares ${String(names[0])}>]`;

  throw new Error(
    withDocs(
      `[vitest-auto-spy] renderShallow(${component.name}, { keepTemplate: true }): ${names.join(', ')} ` +
        `${names.length === 1 ? 'is' : 'are'} declared by ${owner === undefined || owners.length > 1 ? 'an NgModule' : owner}, ` +
        'not standalone, and Angular takes only standalone declarations and NgModules in `imports`.\n' +
        `An AOT build flattened that module away, so name it and it is put back whole: ${fix}.`,
      DOCS_LINKS.angularKeepTemplate,
    ),
  );
}

/** The module among the spec's own `imports` whose exported scope carries `dependency`, by name. */
function declaringModule(dependency: unknown, candidates: readonly unknown[]): string | undefined {
  return candidates
    .filter((candidate): candidate is Type<unknown> => typeof candidate === 'function')
    .find((candidate) => {
      const scope = new Set<unknown>();

      exportedScope(candidate, scope, new Set());

      return scope.has(dependency);
    })?.name;
}

/** A definition list the compiler stored either as the array or as a factory for it. */
function unwrapList(value: unknown): unknown[] {
  const resolved: unknown = typeof value === 'function' ? Reflect.apply(value, undefined, []) : value;

  return Array.isArray(resolved) ? resolved : NOTHING;
}

/** Everything an `NgModule` exports, through the modules it re-exports: what AOT flattens it into. */
function exportedScope(module: unknown, into: Set<unknown>, visited: Set<unknown>): void {
  const definition: unknown = Reflect.get(Object(module), 'ɵmod');

  if (definition === undefined || visited.has(module)) {
    return;
  }

  visited.add(module);
  unwrapList(Reflect.get(Object(definition), 'exports')).forEach((exported) => {
    into.add(exported);
    exportedScope(exported, into, visited);
  });
}

/** The kept list with each named module standing in for the declarations it exports. */
function withModulesRestored(kept: Type<unknown>[], modules: Type<unknown>[]): Type<unknown>[] {
  if (modules.length === 0) {
    return kept;
  }

  const covered = new Set<unknown>();
  const visited = new Set<unknown>();

  modules.forEach((module) => exportedScope(module, covered, visited));

  return [...kept.filter((dependency) => !covered.has(dependency)), ...modules];
}

/**
 * The imports a kept template still needs: its own, minus the children, plus the ones named to stay.
 *
 * A child re-exported by an imported `NgModule` survives this under JIT — the module is kept whole,
 * because dropping it would take the pipes and directives it exports with it. Under AOT there is no
 * module in the list to keep, and {@link assertScopeIsImportable} says so rather than letting
 * Angular refuse a flattened declaration with a message aimed at its author.
 */
function keptScope<T>(component: Type<unknown>, definition: object, options: RenderShallowOptions<T>): Type<unknown>[] {
  const kept = withModulesRestored(
    importsOf(definition).filter((dependency) => !isChildComponent(dependency)),
    options.keepModules ?? NOTHING,
  );

  kept.push(...(options.keepChildren ?? NOTHING));
  assertScopeIsImportable(component, kept, options.imports ?? NOTHING);

  return kept;
}

/** The metadata patch that strips the subtree: blank template, no child imports, permissive schema. */
function buildOverride<T>(component: Type<unknown>, definition: unknown, options: RenderShallowOptions<T>): Partial<Component> {
  const override: Partial<Component> = {};

  if (isStandalone(definition)) {
    // With the template blanked the imports are dead weight and go; with the template kept they are
    // the vocabulary it is written in, and dropping them turns every pipe into `NG0302` and makes
    // every directive silently never apply.
    override.imports = options.keepTemplate ? keptScope(component, definition, options) : (options.keepChildren ?? NOTHING);
    override.schemas = PERMISSIVE_SCHEMAS;
  }

  if (options.keepHostDirectives === false) {
    override.hostDirectives = NOTHING;
  }

  if (!options.keepTemplate) {
    override.template = options.template ?? '';
    // A blanked template renders nothing, so the component's styles are pure cost.
    override.styles = NOTHING;
  }

  return override;
}

/**
 * The first values, through the same name resolution `setInputs` uses.
 *
 * `ComponentInputs<T>` is keyed by the class **field** and `setInput` answers to the **public**
 * name, so `heading = input('', { alias: 'title' })` passed straight through produced an `NG0303`
 * on the console and no value at all — invisible under a console stub, and a spec then asserting on
 * the default. A key no component declares was the same silence; it is a refusal now, as it has
 * always been one line away in `setInputs`.
 */
function applyInputs<T>(fixture: ComponentFixture<T>, inputs: ComponentInputs<T> | undefined): void {
  if (inputs === undefined) {
    return;
  }

  resolveInputs('renderShallow', fixture.componentRef.componentType, inputs).forEach(([name, value]) =>
    fixture.componentRef.setInput(name, value),
  );
}

/**
 * Configure a testing module for `component`, strip its children and create it.
 *
 * ```ts
 * const { fixture, component } = renderShallow(TaskListComponent, {
 *   providers: [provideAutoSpy(TaskService)],
 *   inputs: { projectId: 42 },
 * });
 * ```
 */
export function renderShallow<T>(component: Type<T>, options: RenderShallowOptions<T> = {}): ShallowRender<T> {
  const definition: unknown = Reflect.get(component, 'ɵcmp');
  const standalone = isStandalone(definition);

  TestBed.configureTestingModule({
    imports: standalone ? [component, ...(options.imports ?? [])] : (options.imports ?? []),
    declarations: standalone ? [] : [component],
    providers: options.providers ?? [],
    // Only where it can do something. A standalone component carries its own dependency scope, so a
    // module-level schema never reaches its template — and `enableAngularDiagnostics({ deadSchemas })`
    // is right to report one, which made these two features of the same package cancel each other out.
    ...(standalone ? {} : { schemas: PERMISSIVE_SCHEMAS }),
  });

  const override = buildOverride(component, definition, options);

  // An override recompiles the component under JIT for the rest of the file, and the AOT factory,
  // template and host-binding branches then drop out of coverage — so none is issued that changes nothing.
  if (Object.keys(override).length > 0) {
    TestBed.overrideComponent(component, { set: override });
  }
  options.beforeCreate?.();

  const fixture = TestBed.createComponent(component);
  applyInputs(fixture, options.inputs);

  if (options.detectChanges ?? true) {
    fixture.detectChanges();
  }

  return { fixture, component: fixture.componentInstance };
}
