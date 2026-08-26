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

/** The value `componentRef.setInput` expects for a member — signal inputs are set with the value, not the signal. */
type InputValue<Member> =
  Member extends InputSignalWithTransform<unknown, infer Write>
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
  /** Keep the real template instead of blanking it — for `viewChild`, content projection, host bindings. */
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

/** Whether Angular compiled this component as standalone (it then carries its own `imports`/`schemas`). */
function isStandalone(component: Type<unknown>): boolean {
  const definition: unknown = Reflect.get(component, 'ɵcmp');

  return typeof definition === 'object' && definition !== null && Reflect.get(definition, 'standalone') === true;
}

/** The metadata patch that strips the subtree: blank template, no child imports, permissive schema. */
function buildOverride<T>(component: Type<T>, options: RenderShallowOptions<T>): Partial<Component> {
  const override: Partial<Component> = {};

  if (isStandalone(component)) {
    override.imports = options.keepChildren ?? [];
    override.schemas = [NO_ERRORS_SCHEMA];
  }

  if (!options.keepTemplate) {
    override.template = options.template ?? '';
    // A blanked template renders nothing, so the component's styles are pure cost.
    override.styles = [];
  }

  return override;
}

function applyInputs<T>(fixture: ComponentFixture<T>, inputs: ComponentInputs<T> | undefined): void {
  Object.entries(inputs ?? {}).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
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
  const standalone = isStandalone(component);

  TestBed.configureTestingModule({
    imports: standalone ? [component, ...(options.imports ?? [])] : (options.imports ?? []),
    declarations: standalone ? [] : [component],
    providers: options.providers ?? [],
    schemas: [NO_ERRORS_SCHEMA],
  });

  TestBed.overrideComponent(component, { set: buildOverride(component, options) });
  options.beforeCreate?.();

  const fixture = TestBed.createComponent(component);
  applyInputs(fixture, options.inputs);

  if (options.detectChanges ?? true) {
    fixture.detectChanges();
  }

  return { fixture, component: fixture.componentInstance };
}
