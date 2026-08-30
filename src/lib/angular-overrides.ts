/**
 * Overriding what a *component* provides, and the diagnostic for the bundle that makes it necessary.
 *
 * `provideAutoSpy` registers a provider on the testing module, and a testing-module provider loses
 * to one the component declares in its own `@Component.providers` — route-scoped services,
 * per-component stores, `provideX()` helpers. Nothing reports the loss: the spec configures a spy,
 * the component keeps the real service, and the assertion fails somewhere else entirely.
 *
 * The documented answer is `TestBed.overrideProvider(Token, { useValue: spy })`, and it has two
 * traps of its own.
 *
 * The first is a silent no-op. `overrideProvider(Service, provideAutoSpy(Service))` passes a
 * *provider* where `{ useValue }` is expected; Angular neither throws nor warns, and the test runs
 * against the real service. {@link overrideAutoSpy} exists so that the value handed to
 * `overrideProvider` cannot be the wrong shape.
 *
 * The second is that `overrideProvider` only reaches a component the TestBed compiler knows about.
 * A standalone component instantiated through a parent's template is not in the testing module's
 * `imports`, so the override never applies to it. {@link overrideComponentProvider} queues the
 * component as well — which is also what keeps people away from `overrideComponent`, whose JIT
 * recompilation blanks the component's whole dependency scope under an AOT bundle (see
 * {@link assertNgModuleScopes}).
 *
 * Queuing the component removes the *usual* cause of a silent no-op; it does not prove the override
 * landed. So {@link overrideComponentProvider} also checks, on the next `TestBed.createComponent`,
 * that the component's own injector really answers with the spy — see {@link verifyOnNextCreate}
 * for why that check is always on rather than an opt-in diagnostic.
 *
 * The same AOT bundle is behind the two assertions at the end of the file.
 * {@link assertNgModuleScopes} covers the module whose scope the bundler stripped;
 * {@link assertComponentDefIntact} covers the component whose own definition was built while the
 * chunk holding one of its providers had not run yet. Neither fixes a build — both replace a stack
 * inside `@angular/core` with a line naming the thing that is missing.
 */
import { type Type, isStandalone } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { createSpyFromClass } from './create-spy-from-class';
import { DOCS_LINKS, withDocs } from './docs-links';
import { type LooseTestBedMethod, readTestBedMethod } from './testbed-diagnostics';
import type { ClassSpyConfiguration, ClassType, OnlyMethodKeysOf, Spy } from './types';

/** The `{ useValue }` shape `TestBed.overrideProvider` expects, carrying an auto-spy. */
export interface AutoSpyOverride<T> {
  useValue: Spy<T>;
}

/**
 * An auto-spy wrapped as a `TestBed.overrideProvider` value.
 *
 * ```ts
 * const payments = overrideAutoSpy(PaymentMethodService);
 *
 * TestBed.configureTestingModule({ imports: [CheckoutComponent] }).overrideProvider(PaymentMethodService, payments);
 * payments.useValue.charge.resolveWith({ ok: true });
 * ```
 *
 * Use it — not `provideAutoSpy` — whenever the dependency is declared in a component's own
 * `providers`, because a module-level provider does not win there.
 */
export function overrideAutoSpy<T>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): AutoSpyOverride<T> {
  return { useValue: createSpyFromClass(ObjectClass, methodsToSpyOnOrConfig) };
}

/**
 * Replace a dependency a component declares in its own `providers`, and make sure the override can
 * reach it.
 *
 * Queues `component` with the TestBed compiler — as an import when it is standalone, as a
 * declaration otherwise — because `overrideProvider` is applied while a component is compiled, and
 * a component the testing module never mentions is never compiled by it.
 *
 * ```ts
 * const menu = overrideComponentProvider(CatalogPageComponent, NavigationBuilderService);
 *
 * menu.build.mockReturnValue([]);                 // the component's own provider is now the spy
 * const fixture = TestBed.createComponent(HostComponent);
 * ```
 *
 * Do not reach for `TestBed.overrideComponent` here: it forces a JIT recompilation of the
 * component, and in an AOT test bundle that recompilation resolves its directives and pipes from a
 * runtime scope the bundler has stripped — leaving the component with none of them.
 */
export function overrideComponentProvider<T>(
  component: Type<unknown>,
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[],
): Spy<T> {
  const override = overrideAutoSpy(ObjectClass, methodsToSpyOnOrConfig);

  TestBed.configureTestingModule(isStandalone(component) ? { imports: [component] } : { declarations: [component] });
  TestBed.overrideProvider(ObjectClass, override);
  verifyOnNextCreate({ component, token: ObjectClass, spy: override.useValue });

  return override.useValue;
}

/** The `DebugElement` surface the verification walks, read structurally so no `@angular/platform-browser` import is needed. */
interface DebugElementLike {
  componentInstance: unknown;
  injector: { get(token: unknown, notFoundValue?: unknown): unknown };
  query(predicate: (element: DebugElementLike) => boolean): DebugElementLike | null;
}

/** The `ComponentFixture` surface the verification reads. */
interface FixtureLike {
  componentInstance: unknown;
  debugElement: DebugElementLike;
}

/** One queued check: this component, asked for this token, must answer with this spy. */
interface PendingVerification {
  component: Type<unknown>;
  token: ClassType<unknown>;
  spy: unknown;
}

const pendingVerifications: PendingVerification[] = [];
let createComponentWrapper: LooseTestBedMethod | undefined;

/** The injector the component itself resolves through: the fixture's own, or the one of the element hosting it. */
function injectorOf(fixture: FixtureLike, component: Type<unknown>): DebugElementLike['injector'] | undefined {
  const root = fixture.debugElement;

  if (root.componentInstance instanceof component) {
    return root.injector;
  }

  const hosted = root.query((element) => element.componentInstance instanceof component);

  return hosted ? hosted.injector : undefined;
}

/** How the injector's answer reads in the failure: a class name where there is one, the value otherwise. */
function describeResolved(resolved: unknown): string {
  const constructorName: unknown = readProperty(readProperty(resolved, 'constructor'), 'name');

  return typeof constructorName === 'string' && constructorName.length > 0 ? `a ${constructorName} instance` : String(resolved);
}

function verify(fixture: FixtureLike, { component, token, spy }: PendingVerification): void {
  const injector = injectorOf(fixture, component);

  // The component this fixture never rendered — behind an `@if`, on a lazy route, or simply a
  // different host. There is nothing to check yet, and guessing would fail a correct spec.
  if (!injector) {
    return;
  }

  const resolved = injector.get(token, null);

  if (resolved === spy) {
    return;
  }

  throw new Error(
    withDocs(
      `[vitest-auto-spy] overrideComponentProvider(${component.name}, ${token.name}): the override did not apply.\n` +
        `${component.name} resolved ${token.name} to ${describeResolved(resolved)}, not the spy this call created — so every ` +
        'assertion about that spy is about an object the component never used.\n' +
        `Check that ${token.name} is the token ${component.name} injects (a component that injects a base class or an ` +
        'InjectionToken needs *that* token here, not the implementation class), and that nothing re-configured the testing ' +
        'module with a competing provider afterwards.',
      DOCS_LINKS.angularOverrides,
    ),
  );
}

/**
 * Check the queued overrides against the next fixture, then get out of the way.
 *
 * Always on, not a member of `enableAngularDiagnostics`: this helper's entire reason to exist is
 * that the documented alternative fails silently, so an override it did not actually apply is a bug
 * in the helper rather than an optional extra. It also cannot fire on a spec that never called
 * `overrideComponentProvider`, and it stays silent when the component was not rendered — the two
 * properties that make the group opt-in do not apply here.
 */
function verifyOnNextCreate(entry: PendingVerification): void {
  const original = createComponentWrapper ? undefined : readTestBedMethod('createComponent');

  // A running Angular without `createComponent` cannot be hooked; nothing is queued either, so the
  // helper degrades to "no verification" rather than to a stale check on the next fixture.
  if (!createComponentWrapper && !original) {
    return;
  }

  pendingVerifications.push(entry);

  if (!original) {
    return;
  }

  createComponentWrapper = function verifying(this: unknown, ...args: unknown[]): unknown {
    const fixture = original.apply(this, args);
    const queued = [...pendingVerifications];

    // Fire once and get out of the way: the check belongs to the fixture this call built, and a
    // wrapper left installed would run against a later spec's unrelated component.
    Reflect.set(TestBed, 'createComponent', original);
    createComponentWrapper = undefined;
    pendingVerifications.length = 0;

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `createComponent` returns a `ComponentFixture`; only the two members `FixtureLike` names are ever read.
    queued.forEach((pending) => verify(fixture as FixtureLike, pending));

    return fixture;
  };

  Reflect.set(TestBed, 'createComponent', createComponentWrapper);
}

/**
 * Read one property off an unknown value without asserting its shape.
 *
 * An NgModule arrives here as its *class*, so `typeof` is `'function'` — the case a plain
 * `typeof value === 'object'` guard silently drops, taking the whole diagnostic with it.
 */
export function readProperty(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined;
  }

  return Reflect.get(value, key);
}

/**
 * An absent list, or one that flattens to nothing.
 *
 * Flattened rather than length-checked because the compiler nests: the `ɵinj.imports` of
 * `@NgModule({})` is `[[], []]` — the module's own imports and exports, both empty — which a plain
 * `length === 0` reads as two entries and calls a contribution.
 */
function isEmptyList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.flat(Infinity).length === 0);
}

function hasEmptyRuntimeScope(module: unknown): boolean {
  const definition = readProperty(module, 'ɵmod');

  if (definition === undefined) {
    return false;
  }

  return isEmptyList(readProperty(definition, 'declarations')) && isEmptyList(readProperty(definition, 'exports'));
}

/**
 * Whether importing `module` into a testing module contributes *nothing at all* at runtime.
 *
 * Stricter than {@link assertNgModuleScopes}'s own test, and deliberately: that one is called with
 * the modules a spec says it imports for their declarations, so an empty scope is enough to be
 * suspicious. The automatic check in `enableAngularDiagnostics` sees every import of every testing
 * module, where a **providers-only module** — `HttpClientTestingModule`, a `forRoot()` result, any
 * of the dozens a real suite imports — is legitimately scope-empty and would fail every file. A
 * module with no declarations, no exports, no providers and no imports of its own is the only case
 * that is a mistake no matter what it was imported for.
 */
export function isDeadNgModuleImport(module: unknown): boolean {
  if (!hasEmptyRuntimeScope(module)) {
    return false;
  }

  const injector = readProperty(module, 'ɵinj');

  return isEmptyList(readProperty(injector, 'providers')) && isEmptyList(readProperty(injector, 'imports'));
}

function moduleName(module: unknown): string {
  const name = readProperty(module, 'name');

  return typeof name === 'string' ? name : String(module);
}

/**
 * Where a component or directive definition keeps the lists that a half-loaded bundle leaves holes
 * in. `dependencies` is the flat scope the AOT compiler baked in; the two provider lists are what
 * the component contributes to its own injector.
 */
const DEFINITION_LISTS = ['providers', 'viewProviders', 'dependencies'] as const;

/**
 * Angular emits `dependencies` — and, in a cycle, the provider lists — as a thunk so that a forward
 * reference resolves at first read. Unwrapping it is how the check sees the same array the runtime
 * will; a thunk that throws is left alone, because that is a different failure with its own message.
 */
function resolveList(list: unknown): unknown {
  if (typeof list !== 'function') {
    return list;
  }

  try {
    const produced: unknown = Reflect.apply(list, undefined, []);

    return produced;
  } catch {
    return undefined;
  }
}

/** Every position in a (possibly nested) list whose entry never arrived, named by its path. */
function collectHoles(list: unknown, path: string, holes: string[]): void {
  const resolved = resolveList(list);

  if (!Array.isArray(resolved)) {
    return;
  }

  resolved.forEach((entry: unknown, index) => {
    const at = `${path}[${index}]`;

    if (entry === undefined || entry === null) {
      holes.push(at);
    } else if (Array.isArray(entry)) {
      collectHoles(entry, at, holes);
    }
  });
}

/** The compiled definition a type carries, whichever of the two decorators produced it. */
function definitionOf(type: unknown): { definition: unknown; key: string } | undefined {
  const component = readProperty(type, 'ɵcmp');

  if (component !== undefined) {
    return { definition: component, key: 'ɵcmp' };
  }

  const directive = readProperty(type, 'ɵdir');

  return directive === undefined ? undefined : { definition: directive, key: 'ɵdir' };
}

/**
 * Fail before rendering when a component's own definition has holes in it.
 *
 * Providers are **baked into `ɵcmp` when the component's module executes**, not read at
 * `createComponent` time. So when a bundler splits a barrel into a chunk that has not run yet, the
 * definition is built with `undefined` where a provider or a scope dependency should be, and Angular
 * discovers it much later, from inside itself:
 *
 * ```
 * TypeError: Cannot read properties of undefined (reading 'provide')
 *   ❯ resolveProvider render3/di_setup.ts:95
 * ```
 *
 * The stack names neither the barrel, nor the symbol, nor the component — and the spec it breaks is
 * usually one nobody touched, because chunk boundaries move with file *contents*: editing a type in
 * a neighbouring file is enough. Both documented cures fail, too, and for the same reason: an
 * `await import()` in `beforeEach` is already too late, and a static import at the top of the spec
 * does not fix the order this bundler emits.
 *
 * ```ts
 * assertComponentDefIntact(HoverMenuComponent);
 * const fixture = TestBed.createComponent(HoverMenuComponent);
 * ```
 *
 * The same call answers the related `Cannot read properties of undefined (reading 'ɵcmp')` from
 * `imports: [Cmp]`, where the class reference itself is the thing that never arrived.
 *
 * This does not fix the build — that is a bundler configuration question — but it turns a
 * half-hour investigation into one line, and points it away from the spec.
 *
 * @param components The component (or directive) classes a spec is about to render or import.
 */
export function assertComponentDefIntact(...components: unknown[]): void {
  components.forEach((component, position) => {
    const named = moduleName(component);
    const found = definitionOf(component);

    if (!found) {
      throw new Error(
        withDocs(
          `[vitest-auto-spy] assertComponentDefIntact(): argument ${position} is ${named}, which carries no ɵcmp or ɵdir.\n` +
            'Either it is not a component or directive, or the chunk that defines it has not executed yet — the ' +
            'import resolved to nothing. A barrel split across chunks is the usual cause.',
          DOCS_LINKS.angularOverrides,
        ),
      );
    }

    const holes: string[] = [];

    DEFINITION_LISTS.forEach((list) => collectHoles(readProperty(found.definition, list), `${named}.${found.key}.${list}`, holes));

    if (holes.length > 0) {
      throw new Error(
        withDocs(
          `[vitest-auto-spy] ${holes.join(', ')} ${holes.length === 1 ? 'is' : 'are'} undefined.\n` +
            'A component bakes its providers and its scope into the definition when its module executes, so a hole ' +
            'there means the chunk holding that symbol had not run at that moment — an uninitialised barrel chunk. ' +
            'Angular reports this much later as "Cannot read properties of undefined (reading \'provide\')", from ' +
            'inside its own provider resolution.',
          DOCS_LINKS.angularOverrides,
        ),
      );
    }
  });
}

/**
 * Fail early when an NgModule imported into the TestBed contributes nothing at runtime.
 *
 * An AOT test bundle — which is what `@angular/build:unit-test` produces, and what a Jest suite
 * moving to the native builder starts getting — drops `ɵɵsetNgModuleScope`, the call that records a
 * module's `declarations` and `exports` for the runtime. Nothing notices while AOT is in charge,
 * because the flat list of dependencies is already baked into each `ɵcmp`. The TestBed is the one
 * consumer that reads the scope at runtime, so `imports: [DirectivesModule]` silently contributes
 * zero directives, and the failure arrives as any of:
 *
 * ```
 * NG0303: Can't bind to 'appTruncate' since it isn't a known property of 'div'
 * NG0301: Export of name 'focusable' not found!
 * NG0304: 'ui-smart-row' is not a known element
 * (nothing at all — an attribute directive simply never instantiates)
 * ```
 *
 * None of them names the module. Call this with the modules a spec imports *for their declarations*
 * and the diagnosis becomes one line.
 *
 * ```ts
 * assertNgModuleScopes(DirectivesModule, PipesModule);
 * TestBed.configureTestingModule({ imports: [DirectivesModule, PipesModule] });
 * ```
 *
 * A module that genuinely declares nothing — a providers-only module — also has an empty scope, so
 * only pass modules you expect to bring directives, components or pipes.
 */
export function assertNgModuleScopes(...modules: unknown[]): void {
  const empty = modules.filter(hasEmptyRuntimeScope).map(moduleName);

  if (empty.length === 0) {
    return;
  }

  throw new Error(
    withDocs(
      `[vitest-auto-spy] NgModule(s) with an empty runtime scope: ${empty.join(', ')}.\n` +
        'Either they declare nothing (a providers-only module — do not pass those here), or ' +
        '`ɵɵsetNgModuleScope` was not emitted into this test bundle, in which case importing them ' +
        'into the TestBed contributes no directives, components or pipes at all. Declare what the ' +
        'spec needs in the TestBed module directly.',
      DOCS_LINKS.angular,
    ),
  );
}
