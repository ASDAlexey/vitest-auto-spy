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
 */
import { type Type, isStandalone } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { createSpyFromClass } from './create-spy-from-class';
import { DOCS_LINKS, withDocs } from './docs-links';
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

  return override.useValue;
}

/**
 * Read one property off an unknown value without asserting its shape.
 *
 * An NgModule arrives here as its *class*, so `typeof` is `'function'` — the case a plain
 * `typeof value === 'object'` guard silently drops, taking the whole diagnostic with it.
 */
function readProperty(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined;
  }

  return Reflect.get(value, key);
}

function isEmptyList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

function hasEmptyRuntimeScope(module: unknown): boolean {
  const definition = readProperty(module, 'ɵmod');

  if (definition === undefined) {
    return false;
  }

  return isEmptyList(readProperty(definition, 'declarations')) && isEmptyList(readProperty(definition, 'exports'));
}

function moduleName(module: unknown): string {
  const name = readProperty(module, 'name');

  return typeof name === 'string' ? name : String(module);
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
