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
  /** Inputs to set through `componentRef.setInput` before the first change detection. */
  inputs?: ComponentInputs<T>;
  /**
   * Keep the real template instead of blanking it — for `viewChild`, content projection, host
   * bindings. The template's own pipes and directives stay resolvable; child components are still
   * dropped, which is what keeps the render shallow. A child re-exported by an imported `NgModule`
   * is the one thing that survives, because the module is kept whole.
   */
  keepTemplate?: boolean;
  /** Child components/directives/pipes to keep resolvable in the template (everything else is dropped). */
  keepChildren?: Type<unknown>[];
  /** Stand-in template to render instead of a blank one (ignored when `keepTemplate` is set). */
  template?: string;
  /**
   * Runs after the testing module is configured and the component is trimmed, but before it is
   * created — the seam a spec needs when a field initializer or the constructor reads a dependency
   * it must first stub (`mockReadonlyProp(injectSpy(Store), 'items', signal([]))`).
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

/** How a JIT-compiled standalone component stores what it imports. */
type ImportsFactory = () => Type<unknown>[];

/**
 * Everything a standalone component imports, as the compiler stored it on the definition.
 *
 * JIT — the only mode `TestBed.overrideComponent` can work in, since it recompiles from the
 * decorator — always stores the list behind a factory, already flattened, empty when there is none.
 */
function importsOf(definition: object): Type<unknown>[] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `ɵcmp` carries no public type, and this shape is the compiler's own output for a standalone component.
  const dependencies = Reflect.get(definition, 'dependencies') as ImportsFactory;

  return dependencies();
}

/** A component import is a piece of the subtree; a directive, a pipe or a module is template vocabulary. */
function isChildComponent(dependency: Type<unknown>): boolean {
  return Reflect.get(dependency, 'ɵcmp') !== undefined;
}

/**
 * The imports a kept template still needs: its own, minus the children, plus the ones named to stay.
 *
 * A child re-exported by an imported `NgModule` survives this — the module is kept whole, because
 * dropping it would take the pipes and directives it exports with it.
 */
function keptScope<T>(definition: object, options: RenderShallowOptions<T>): Type<unknown>[] {
  const kept = importsOf(definition).filter((dependency) => !isChildComponent(dependency));

  kept.push(...(options.keepChildren ?? NOTHING));

  return kept;
}

/** The metadata patch that strips the subtree: blank template, no child imports, permissive schema. */
function buildOverride<T>(definition: unknown, options: RenderShallowOptions<T>): Partial<Component> {
  const override: Partial<Component> = {};

  if (isStandalone(definition)) {
    // With the template blanked the imports are dead weight and go; with the template kept they are
    // the vocabulary it is written in, and dropping them turns every pipe into `NG0302` and makes
    // every directive silently never apply.
    override.imports = options.keepTemplate ? keptScope(definition, options) : (options.keepChildren ?? NOTHING);
    override.schemas = PERMISSIVE_SCHEMAS;
  }

  if (!options.keepTemplate) {
    override.template = options.template ?? '';
    // A blanked template renders nothing, so the component's styles are pure cost.
    override.styles = NOTHING;
  }

  return override;
}

function applyInputs<T>(fixture: ComponentFixture<T>, inputs: ComponentInputs<T> | undefined): void {
  if (inputs === undefined) {
    return;
  }

  Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
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

  TestBed.overrideComponent(component, { set: buildOverride(definition, options) });
  options.beforeCreate?.();

  const fixture = TestBed.createComponent(component);
  applyInputs(fixture, options.inputs);

  if (options.detectChanges ?? true) {
    fixture.detectChanges();
  }

  return { fixture, component: fixture.componentInstance };
}
