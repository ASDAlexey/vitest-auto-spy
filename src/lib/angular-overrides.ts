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
import { TestBed, getTestBed } from '@angular/core/testing';

import { createSpyFromClass } from './create-spy-from-class';
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';
import { isAutoSpyLike } from './spy-mark';
import { instrumentTestBed, onComponentCreated, readTestBedMethod } from './testbed-diagnostics';
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
 *
 * `T` comes from the class alone, as in `provideAutoSpy` — a generic class keeps its default.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see `provideAutoSpy`: read only while the generic class argument is deferred.
export function overrideAutoSpy<T = any>(
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: NoInfer<ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[]>,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see `provideAutoSpy`: read only while the generic class argument is deferred.
export function overrideComponentProvider<T = any>(
  component: Type<unknown>,
  ObjectClass: ClassType<T>,
  methodsToSpyOnOrConfig?: NoInfer<ClassSpyConfiguration<T> | OnlyMethodKeysOf<T>[]>,
): Spy<T> {
  const override = overrideAutoSpy(ObjectClass, methodsToSpyOnOrConfig);

  try {
    TestBed.configureTestingModule(isStandalone(component) ? { imports: [component] } : { declarations: [component] });
    TestBed.overrideProvider(ObjectClass, override);
  } catch (error) {
    throw explainLateOverride(error, component, ObjectClass);
  }

  verifyOnNextCreate({ component, token: ObjectClass, spy: override.useValue });

  return override.useValue;
}

function explainLateOverride(error: unknown, component: Type<unknown>, token: ClassType<unknown>): unknown {
  if (!(error instanceof Error) || !error.message.includes('already been instantiated')) {
    return error;
  }

  return new Error(
    withDocs(
      `[vitest-auto-spy] overrideComponentProvider(${component.name}, ${token.name}) ran after the testing module was ` +
        'instantiated, and Angular accepts no override past that point. Something read the injector first — a ' +
        '`TestBed.inject`, an `injectSpy`, a `createComponent` — earlier in this test or in the same `beforeCreate`. ' +
        'Override first, then inject.',
      DOCS_LINKS.angularOverrideLate,
    ),
    { cause: error },
  );
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
let removeCreateInspector: (() => void) | undefined;
let resetWrapperInstalled = false;

/**
 * Drop everything a previous test queued and never consumed, and take the wrapper back off.
 *
 * A test that calls {@link overrideComponentProvider} but never renders (an `@if` branch not taken,
 * a spec that only asserts on a service) used to leave its entry and the wrapper installed through
 * `resetTestingModule`; the next test that *did* render then verified the stale entry against its
 * own fixture — resolving the token to this test's spy, comparing it with the previous test's, and
 * failing with a false "the override did not apply".
 */
function dropStaleQueueState(): void {
  pendingVerifications.length = 0;
  removeCreateInspector?.();
  removeCreateInspector = undefined;
}

/**
 * Clear the queue when the framework resets the module — the one moment between tests we can see.
 *
 * Wrapped on the `TestBed` *instance*, not the exported static: the framework's cleanup hook calls
 * the instance's `resetTestingModule()` directly, so a static wrapper never sees it. `getTestBed()`
 * is the public way to that instance and returns exactly the `INSTANCE` the statics delegate to.
 */
function wrapResetTestingModule(): void {
  if (resetWrapperInstalled) {
    return;
  }

  resetWrapperInstalled = installResetWrapper(getTestBed());
}

/**
 * The host-agnostic half of {@link wrapResetTestingModule}, exported so a spec can hand it a host
 * that has no `resetTestingModule` — the shape a future Angular could hand production. Returns
 * whether the wrapper went on; a host without the method is left exactly as it was.
 */
export function installResetWrapper(instance: unknown): boolean {
  const original = readProperty(instance, 'resetTestingModule');

  if (typeof original !== 'function') {
    return false;
  }

  const wrapper = function flushing(this: unknown, ...args: unknown[]): unknown {
    dropStaleQueueState();

    return original.apply(this, args);
  };

  Reflect.set(Object(instance), 'resetTestingModule', wrapper);

  return true;
}

/** The injector the component itself resolves through: the fixture's own, or the one of the element hosting it. */
function injectorOf(fixture: FixtureLike, component: Type<unknown>): DebugElementLike['injector'] | undefined {
  const root = fixture.debugElement;

  if (root.componentInstance instanceof component) {
    return root.injector;
  }

  const hosted = root.query((element) => element.componentInstance instanceof component);

  return hosted ? hosted.injector : undefined;
}

/**
 * The injector a component resolves through, from the fixture that built it.
 *
 * Exported because two checks ask the same question from opposite directions — this file's own
 * "did my override apply", and the diagnostics group's "did my module-level double lose to the
 * component's own provider" — and a second copy of the walk would be a second place for the
 * `@if`-never-rendered case to be forgotten.
 */
export function componentInjector(fixture: unknown, component: unknown): DebugElementLike['injector'] | undefined {
  if (typeof component !== 'function') {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `createComponent` returns a `ComponentFixture` and takes a component class; only the members `FixtureLike` and `Type` name are read off either.
  return injectorOf(fixture as FixtureLike, component as Type<unknown>);
}

/** How the injector's answer reads in the failure: a class name where there is one, the value otherwise. */
export function describeResolved(resolved: unknown): string {
  const constructorName: unknown = readProperty(readProperty(resolved, 'constructor'), 'name');

  return typeof constructorName === 'string' && constructorName.length > 0 ? `a ${constructorName} instance` : String(resolved);
}

function verify(fixture: unknown, { component, token, spy }: PendingVerification): void {
  const injector = componentInjector(fixture, component);

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
      `[vitest-auto-spy] overrideComponentProvider(${component.name}, ${token.name}): the override did not apply — ` +
        `${component.name} resolved ${token.name} to ${describeResolved(resolved)}, not the spy this call returned.\n` +
        explainMissedOverride(token, resolved),
      DOCS_LINKS.angularOverrideApplied,
    ),
  );
}

/** The one cause the resolved value points at, and its fix. */
function explainMissedOverride(token: ClassType<unknown>, resolved: unknown): string {
  const later = isAutoSpyLike(resolved) ? 'a different double' : 'the real service';

  return (
    `It got ${later} because something configured ${token.name} again after this call — a later ` +
    'TestBed.overrideProvider or configureTestingModule. Keep overrideComponentProvider as the last word on it.'
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
  // A running Angular without `createComponent` cannot be hooked; nothing is queued either, so the
  // helper degrades to "no verification" rather than to a stale check on the next fixture.
  if (readTestBedMethod('createComponent') === undefined) {
    return;
  }

  // Through the shared seam rather than a second wrapper of this file's own: two wrappers on one
  // method leave the order of the two checks to whichever installed last, and `getTestBed()
  // .createComponent(X)` reached neither of them.
  instrumentTestBed();
  pendingVerifications.push(entry);
  wrapResetTestingModule();

  removeCreateInspector ??= onComponentCreated((_component, fixture) => {
    const queued = [...pendingVerifications];

    // Fire once and get out of the way: the check belongs to the fixture this call built, and an
    // inspector left registered would run against a later spec's unrelated component.
    dropStaleQueueState();
    queued.forEach((pending) => verify(fixture, pending));
  });
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
 * An absent list, or one that nests nothing but empty lists.
 *
 * Nesting rather than a `length === 0` because the compiler nests: the `ɵinj.imports` of
 * `@NgModule({})` is `[[], []]` — the module's own imports and exports, both empty — which a plain
 * `length === 0` reads as two entries and calls a contribution. Recursive rather than
 * `flat(Infinity).length === 0`, which answers the same question by allocating the flattened array
 * first; this runs on every import of every `configureTestingModule` in the run.
 */
function isEmptyList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((entry) => Array.isArray(entry) && isEmptyList(entry)));
}

/**
 * Verdicts, keyed by the module definition rather than by the module.
 *
 * `TestBed` recompiles an overridden module by defining a **new** `ɵmod`, so an entry here can only
 * ever be read for the definition it was computed from. The other half of the verdict comes from
 * `ɵinj`, which `TestBed` mutates in place — but only to replace providers that are already there,
 * and a module reaching this cache with no providers at all has nothing to replace.
 */
const deadModuleVerdicts = new WeakMap<object, boolean>();

/** Whether a module's declarations and exports are both empty — the looser half of {@link isDeadNgModuleImport}. */
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
  const definition = readProperty(module, 'ɵmod');

  if (typeof definition !== 'object' || definition === null) {
    return false;
  }

  const cached = deadModuleVerdicts.get(definition);

  if (cached !== undefined) {
    return cached;
  }

  const injector = readProperty(module, 'ɵinj');
  const dead =
    isEmptyList(readProperty(definition, 'declarations')) &&
    isEmptyList(readProperty(definition, 'exports')) &&
    isEmptyList(readProperty(injector, 'providers')) &&
    isEmptyList(readProperty(injector, 'imports'));

  deadModuleVerdicts.set(definition, dead);

  return dead;
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
            (component === undefined
              ? 'The import resolved to nothing: the chunk that defines it had not run yet, which a barrel split across ' +
                'chunks causes. Import it from its own file rather than through the barrel.'
              : 'It is not a component or directive; pass the @Component or @Directive class itself.'),
          DOCS_LINKS.angularComponentDefIntact,
        ),
      );
    }

    const holes: string[] = [];

    DEFINITION_LISTS.forEach((list) => collectHoles(readProperty(found.definition, list), `${named}.${found.key}.${list}`, holes));

    if (holes.length > 0) {
      throw new Error(
        withDocs(
          `[vitest-auto-spy] ${holes.join(', ')} ${holes.length === 1 ? 'is' : 'are'} undefined.\n` +
            `${named} baked that list in when its file ran, before the chunk holding the symbol had run — an uninitialised ` +
            'barrel chunk, which Angular reports later as "Cannot read properties of undefined (reading \'provide\')".\n' +
            `In ${named}'s source, import the symbol at that position from its own file rather than through the barrel.`,
          DOCS_LINKS.angularComponentDefIntact,
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
  const empty = modules.filter(hasEmptyRuntimeScope);

  if (empty.length === 0) {
    return;
  }

  const names = empty.map(moduleName);
  const withProviders = empty.filter((module) => !isEmptyList(readProperty(readProperty(module, 'ɵinj'), 'providers'))).map(moduleName);
  const providersNote =
    withProviders.length === 0
      ? ''
      : `\n${listed(withProviders)} ${withProviders.length === 1 ? 'has' : 'have'} providers of ${withProviders.length === 1 ? 'its' : 'their'} own; ` +
        'a providers-only module declares nothing on purpose, so leave it out of this call.';

  throw new Error(
    withDocs(
      `[vitest-auto-spy] assertNgModuleScopes(): ${listed(names)} ${names.length === 1 ? 'has' : 'have'} an empty runtime scope — ` +
        `this test bundle dropped ${names.length === 1 ? 'its' : 'their'} ɵɵsetNgModuleScope, so importing ` +
        `${names.length === 1 ? 'it' : 'them'} into the TestBed brings no directives, components or pipes (NG0303/NG0304).\n` +
        'Import the declarations the spec needs directly, or declare them in the TestBed.' +
        providersNote,
      DOCS_LINKS.angularNgModuleScopes,
    ),
  );
}

/** `A`, `A and B`, `A, B and C`. */
function listed(names: readonly string[]): string {
  return names.length === 1 ? String(names[0]) : `${names.slice(0, -1).join(', ')} and ${String(names.at(-1))}`;
}

/**
 * The report `enableAngularDiagnostics({ ngModuleScopes })` gives for the imports
 * {@link isDeadNgModuleImport} picked out — modules with no providers either, so the providers-only
 * reading {@link assertNgModuleScopes} has to allow for is already ruled out here.
 */
export function failDeadNgModuleImports(modules: readonly unknown[]): void {
  if (modules.length === 0) {
    return;
  }

  const names = modules.map(moduleName);
  const one = names.length === 1;

  throw new Error(
    withDocs(
      `[vitest-auto-spy] ngModuleScopes: ${listed(names)} ${one ? 'is' : 'are'} imported into the testing module but ` +
        `contribute${one ? 's' : ''} nothing — this test bundle dropped ${one ? 'its' : 'their'} ɵɵsetNgModuleScope, so ` +
        `${one ? 'its' : 'their'} directives are missing (NG0303/NG0304).\n` +
        `Import the directives ${one ? 'it exports' : 'they export'} directly, or declare them in the TestBed.`,
      DOCS_LINKS.angularNgModuleScopesAuto,
    ),
  );
}
