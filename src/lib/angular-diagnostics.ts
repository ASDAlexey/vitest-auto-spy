/**
 * `enableAngularDiagnostics()` — four silent Angular-testing failures, turned into loud ones.
 *
 * Each member of this group has the same shape: something a spec wrote does nothing, nothing says
 * so, and the test passes for a reason its author did not intend. They are grouped rather than
 * shipped as four helpers because they are one decision — "this suite would rather fail than pass
 * by accident" — taken once, in a setup file, and because three of the four need the same hook into
 * `TestBed.configureTestingModule` that the timing diagnostics already install.
 *
 * ```ts
 * // vitest.setup.ts — after the Angular test environment is initialised
 * import { enableAngularDiagnostics } from 'vitest-auto-spy/angular';
 *
 * enableAngularDiagnostics();                           // all four
 * enableAngularDiagnostics({ pendingRequests: false }); // or pick
 * ```
 *
 * Opt-in, unlike `overrideComponentProvider`'s own check: these apply to every spec in a suite,
 * including ones written long before the group existed, and turning a passing suite red is a
 * decision that belongs to the project rather than to a library import.
 *
 * Call it where the per-file hooks belong — the setup file, or a `describe` — after the Angular test
 * environment is set up. The `afterEach` order does not matter: every reset snapshots the open requests.
 */
import { getTestBed } from '@angular/core/testing';
import { afterEach, beforeEach } from 'vitest';

import { failOnUnspiedProvider } from './angular';
import { assertNgModuleScopes, componentInjector, describeResolved, isDeadNgModuleImport, readProperty } from './angular-overrides';
import { DOCS_LINKS, withDocs } from './docs-links';
import { isAutoSpyLike } from './spy-mark';
import { instrumentTestBed, onComponentCreated, onTestingModuleConfigured, verifyOnTeardown } from './testbed-diagnostics';
import { beforeTestBedReset } from './testbed-reset';

/** Which checks {@link enableAngularDiagnostics} installs. Every member defaults to `true`. */
export interface AngularDiagnosticsOptions {
  /**
   * Fail when a testing module imports an NgModule that contributes nothing at runtime — the AOT
   * bundle that dropped `ɵɵsetNgModuleScope`, checked automatically instead of by hand.
   */
  ngModuleScopes?: boolean;
  /** Fail when `schemas` are configured next to a standalone component, where they can never apply. */
  deadSchemas?: boolean;
  /** Fail — rather than warn — when `injectSpy` finds a real instance where a spy was expected. */
  unspiedProviders?: boolean;
  /** Fail a test that ends with unflushed `HttpTestingController` requests. */
  pendingRequests?: boolean;
  /**
   * Fail when a double registered on the testing module loses to the component's own `providers`,
   * so the component under test is running against the real service.
   */
  shadowedProviders?: boolean;
}

/** Read a config key as a list, whatever the caller passed. */
function readList(config: unknown, key: string): unknown[] {
  const value = readProperty(config, key);

  return Array.isArray(value) ? value : [];
}

/** A component class, i.e. an `imports` entry that carries its own dependency scope rather than a module's. */
function isComponentClass(value: unknown): boolean {
  return readProperty(value, 'ɵcmp') !== undefined;
}

function className(value: unknown): string {
  const name = readProperty(value, 'name');

  return typeof name === 'string' ? name : String(value);
}

/** `ngModuleScopes`: hand the existing check the imports that cannot be anything but a mistake. */
function checkNgModuleScopes(config: unknown): void {
  assertNgModuleScopes(...readList(config, 'imports').filter(isDeadNgModuleImport));
}

/**
 * `deadSchemas`: a schema with nothing to apply to.
 *
 * Schemas are a property of the testing module's `declarations`. A configuration that declares
 * nothing and imports standalone components has therefore configured a no-op — the element or
 * attribute the schema was meant to excuse is still unresolved, and the spec is passing over a
 * template that never rendered what it was supposed to.
 */
function checkDeadSchemas(config: unknown): void {
  const schemas = readList(config, 'schemas');

  if (schemas.length === 0 || readList(config, 'declarations').length > 0) {
    return;
  }

  const components = readList(config, 'imports').filter(isComponentClass).map(className);

  if (components.length === 0) {
    return;
  }

  throw new Error(
    withDocs(
      `[vitest-auto-spy] enableAngularDiagnostics({ deadSchemas }): configureTestingModule was given ${schemas.length} schema(s) ` +
        `that can never apply. The module declares nothing, and ${components.join(', ')} carries its own dependency scope.\n` +
        'Nothing is being silenced here: whatever the schema was added for is still unresolved, and the template renders ' +
        'without it.\n' +
        "Drop the `schemas` entry, then put the missing directive, component or pipe into the standalone component's own " +
        '`imports` — or render it through a standalone host built with `createDirectiveHost({ template, scope: [...] })`.',
      DOCS_LINKS.angularDiagnostics,
    ),
  );
}

/**
 * `pendingRequests`, without a new peer dependency.
 *
 * `@angular/common/http/testing` is not a peer of this package and is not going to become one for a
 * diagnostic. It does not have to be: `provideHttpClientTesting()` is an `EnvironmentProviders`
 * wrapper (`ɵproviders`) around a plain provider list that names the token, and
 * `HttpClientTestingModule` keeps the same list on its `ɵinj`. Both arrive inside the config this
 * hook already sees, so the token is read out of the caller's own configuration — and a project
 * without the package configures neither, which is exactly the silent no-op an optional
 * integration should be.
 */
const HTTP_TESTING_CONTROLLER = 'HttpTestingController';

/** Flatten a provider list: nested arrays, and the `ɵproviders` of an `EnvironmentProviders` wrapper. */
function forEachProvider(value: unknown, visit: (provider: unknown) => void): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => forEachProvider(entry, visit));

    return;
  }

  const wrapped = readProperty(value, 'ɵproviders');

  if (wrapped === undefined) {
    visit(value);

    return;
  }

  forEachProvider(wrapped, visit);
}

/** The same walk, materialised — for the callers that search the list rather than fold over it. */
function flattenProviders(value: unknown, into: unknown[]): void {
  forEachProvider(value, (provider) => into.push(provider));
}

function findControllerToken(providers: unknown): unknown {
  const flat: unknown[] = [];

  flattenProviders(providers, flat);

  return flat
    .map((provider) => readProperty(provider, 'provide'))
    .find((token) => typeof token === 'function' && token.name === HTTP_TESTING_CONTROLLER);
}

/** The token, from `providers: [provideHttpClientTesting()]` or from `imports: [HttpClientTestingModule]`. */
function readControllerToken(config: unknown): unknown {
  const fromProviders = findControllerToken(readProperty(config, 'providers'));

  if (fromProviders !== undefined) {
    return fromProviders;
  }

  return readList(config, 'imports')
    .map((imported) => findControllerToken(readProperty(readProperty(imported, 'ɵinj'), 'providers')))
    .find((token) => token !== undefined);
}

/** One open request, as it reads in the failure. */
function describeRequest(open: unknown): string {
  const request = readProperty(open, 'request');

  return `${String(readProperty(request, 'method'))} ${String(readProperty(request, 'urlWithParams'))}`;
}

/**
 * The requests the controller is still holding.
 *
 * `match(() => true)` both lists them and takes them, which is what stops one unflushed request
 * being reported twice by two hooks that both looked.
 */
function takeOpenRequests(controller: unknown): string[] {
  const match = readProperty(controller, 'match');

  if (typeof match !== 'function') {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `HttpTestingController#match` returns `TestRequest[]`; only `request.method` and `request.urlWithParams` are read off each entry, and both are read structurally.
  const open = Reflect.apply(match, controller, [(): boolean => true]) as unknown[];

  return open.map(describeRequest);
}

let controllerToken: unknown;
let openAtReset: string[] | undefined;

/** The one `TestBed` member read with a token of unknown type, declared structurally so it needs no assertion. */
interface InjectingTestBed {
  inject(token: unknown, notFoundValue: null): unknown;
}

/**
 * What the testing module answers for `token`, or `null` once it has been reset: `inject` on a reset
 * `TestBed` builds a fresh module, and the next `configureTestingModule` then refuses to run.
 */
function injectFromModule(token: unknown): unknown {
  const testBed: InjectingTestBed = getTestBed();

  return readProperty(testBed, '_testModuleRef') ? testBed.inject(token, null) : null;
}

function readOpenRequests(): string[] {
  return controllerToken === undefined ? [] : takeOpenRequests(injectFromModule(controllerToken));
}

/**
 * Fail when the `HttpTestingController` this test configured is still holding requests.
 *
 * `pendingRequests` runs this after every test; it is exported because the same question is worth
 * asking mid-test — after the arrange step, before the assertions that depend on it — and because
 * reading it takes the requests, so calling it yourself is not paid for twice.
 *
 * A no-op when the group is off, or when the test never configured HTTP testing at all.
 *
 * @example
 * ```ts
 * facade.load();
 * controller.expectOne('/api/users').flush([]);
 * assertNoPendingRequests(); // nothing else went out
 * ```
 */
export function assertNoPendingRequests(): void {
  const open = openAtReset ?? readOpenRequests();

  // One-shot, like `match()` itself: whoever reads the pending requests owns them, so the group's
  // own `afterEach` does not report the same two requests a second time.
  openAtReset = undefined;

  if (open.length === 0) {
    return;
  }

  throw new Error(
    withDocs(
      `[vitest-auto-spy] enableAngularDiagnostics({ pendingRequests }): the test ended with ${open.length} unflushed ` +
        `HttpTestingController request(s): ${open.join(', ')}.\n` +
        'Nothing answered them and nothing asserted them, so the code under test is still waiting on a response it never ' +
        'received — everything the spec expected to happen after that call did not happen here.\n' +
        "Flush each one (`controller.expectOne('/url').flush(body)`), or call `controller.verify()` in the spec where the " +
        'absence of a request is the thing being asserted.',
      DOCS_LINKS.angularDiagnostics,
    ),
  );
}

/**
 * `shadowedProviders`: the double the module registered, and the one the component actually got.
 *
 * A component that declares its own `providers` gets its own instance from its **node** injector,
 * and a `provideAutoSpy(X)` on the testing module never reaches it — the module injector is further
 * up the chain and is only consulted when the node injector has nothing. So the spec configures a
 * double, asserts on it, and the component talks to the real service the whole time. Nothing fails:
 * the double simply records no calls, and an assertion that it was *not* called passes for the
 * wrong reason.
 *
 * Measured in one Angular suite: of 71 component specs whose subject declares its own `providers`,
 * 43 register the same token on the module too — and 7 of those do nothing else, which is exactly
 * this failure. The repair is one line, {@link overrideComponentProvider}, which has existed since
 * 3.1.0 and had zero uses in that repository. That is the point of this check rather than a
 * shortcoming of the helper: the helper cannot be found from the symptom, because there is none.
 *
 * **Silent when the component's answer is itself a double.** A spec that reached for
 * `TestBed.overrideProvider`, `overrideComponentProvider` or a `viewProviders` double has decided
 * this question already, and its answer wins on purpose. Only a **real** instance is reported, which
 * is also what keeps the check off the 36 specs of that suite that had handled it one way or another.
 */
const moduleDoubles = new Map<unknown, unknown>();

const SELF_ONLY = { self: true };

/**
 * Remember one provider, if it registers a double under a token.
 *
 * Module-level rather than a closure inside {@link collectModuleDoubles}: that one runs on every
 * `configureTestingModule` of the run, and this way the walk allocates neither the flattened list
 * nor a visitor.
 */
function rememberModuleDouble(provider: unknown): void {
  const token = readProperty(provider, 'provide');
  const useValue = readProperty(provider, 'useValue');

  // A `multi` provider resolves to an array, which can never be the double itself — comparing
  // them would report every multi registration in the suite.
  if (token !== undefined && isAutoSpyLike(useValue) && readProperty(provider, 'multi') !== true) {
    moduleDoubles.set(token, useValue);
  }
}

/** Collect the doubles a configuration registers, keeping the last per token, as Angular does. */
function collectModuleDoubles(config: unknown): void {
  forEachProvider(readProperty(config, 'providers'), rememberModuleDouble);
}

/** How a token reads in the failure — its class name, or whatever an `InjectionToken` calls itself. */
function tokenName(token: unknown): string {
  const name = readProperty(token, 'name');

  return typeof name === 'string' && name.length > 0 ? name : String(token);
}

/**
 * Fail when a double this test registered on the testing module never reached `component`.
 *
 * `shadowedProviders` calls this on every fixture; it is exported for the same reason
 * {@link assertNoPendingRequests} is — a spec that builds its component through a helper of its own
 * can ask directly, and a check that can only be reached through one code path is a check that
 * stops running the day that path changes.
 *
 * A no-op when the fixture never rendered `component`, and when everything it resolved is a double.
 *
 * @example
 * ```ts
 * const fixture = renderThroughOurHelper(CartComponent);
 * assertNoShadowedProviders(CartComponent, fixture); // the doubles really are the ones in play
 * ```
 */
export function assertNoShadowedProviders(component: unknown, fixture: unknown): void {
  const injector = componentInjector(fixture, component);

  // Nothing to compare against: the fixture did not render this component (an `@if` branch not
  // taken, a different host), or `createComponent` was handed something that is not a class.
  if (!injector) {
    return;
  }

  // `self` asks the component's node alone: walking on to the root would build — and possibly fail to build — a
  // real service the test never asked for, for a token the component does not even declare.
  const shadowed = [...moduleDoubles]
    .map(([token, spy]) => ({ token, spy, resolved: Reflect.apply(injector.get, injector, [token, null, SELF_ONLY]) }))
    .filter(({ spy, resolved }) => resolved !== null && resolved !== spy && !isAutoSpyLike(resolved))
    // A double the module no longer answers with lost to a later provider or an override, not to the component.
    .filter(({ token, spy }) => injectFromModule(token) === spy);

  if (shadowed.length === 0) {
    return;
  }

  const named = shadowed.map(({ token, resolved }) => `${tokenName(token)} → ${describeResolved(resolved)}`);

  throw new Error(
    withDocs(
      `[vitest-auto-spy] enableAngularDiagnostics({ shadowedProviders }): ${className(component)} declares its own ` +
        `providers, so ${shadowed.length} double(s) registered on the testing module never reached it: ${named.join(', ')}.\n` +
        "A component-level provider is resolved by the component's node injector, which is consulted before the module " +
        'injector — so the component is running against the real service while the spec asserts on a double that records ' +
        'nothing. An assertion that the double was *not* called passes here for the wrong reason.\n' +
        `Replace the module-level registration with \`overrideComponentProvider(${className(component)}, ServiceClass)\` — the class, ` +
        'with an optional spy configuration as the third argument — which puts the double where the component looks and checks ' +
        'that it applied. Behind an `InjectionToken`, which it cannot take, `TestBed.overrideProvider(TOKEN, provideAutoSpyForToken(TOKEN))` ' +
        "reaches the component's own providers too.",
      DOCS_LINKS.angularDiagnostics,
    ),
  );
}

/** The active selection, or `undefined` when the group is off. Read by the hooks, so a second call replaces it. */
let active: Required<AngularDiagnosticsOptions> | undefined;
let removeInspector: (() => void) | undefined;
let removeComponentInspector: (() => void) | undefined;

// On the instance, which the static method, `getTestBed()` and Angular's cleanup hook all reset through; inert while the
// group is off, so it never has to be unlinked from under a wrapper installed after it.
const snapshottingInstances = new WeakSet<object>();

/** Snapshot the open requests and forget the module's doubles at every reset, whichever `afterEach` runs first. */
function wrapResetTestingModule(): void {
  beforeTestBedReset(snapshottingInstances, () => {
    if (active) {
      const open = readOpenRequests();

      if (open.length > 0) {
        openAtReset = open;
      }

      moduleDoubles.clear();
    }
  });
}

/** The test the per-test state was last reset for, so a second pair of hooks in one file does nothing twice. */
let preparedTest: object | undefined;

/** A call made while a test or one of its hooks runs cannot register hooks of its own. */
function insideTest(): boolean {
  return readProperty(readProperty(Reflect.get(globalThis, '__vitest_worker__'), 'current'), 'type') === 'test';
}

/**
 * Per call rather than per module: under `isolate: false` this module is evaluated once per worker
 * while the setup file calling it runs per spec file, so a once-only pair belonged to the first file.
 */
function registerPerTestHooks(): void {
  beforeEach(({ task }) => {
    if (preparedTest !== task) {
      preparedTest = task;
      controllerToken = undefined;
      openAtReset = undefined;
      moduleDoubles.clear();
    }
  });

  afterEach(({ task }) => {
    if (preparedTest !== task) {
      return;
    }

    // Cleared rather than kept, so a retry of the same test is prepared and verified again.
    preparedTest = undefined;

    if (active?.pendingRequests) {
      verifyOnTeardown(assertNoPendingRequests);
    }
  });
}

/**
 * Turn the group on. Every member defaults to `true`; pass `false` to leave one out.
 *
 * ```ts
 * enableAngularDiagnostics({ unspiedProviders: false }); // the other three
 * ```
 *
 * Calling it again replaces the previous selection rather than adding to it.
 */
export function enableAngularDiagnostics(options: AngularDiagnosticsOptions = {}): void {
  disableAngularDiagnostics();

  active = {
    ngModuleScopes: options.ngModuleScopes ?? true,
    deadSchemas: options.deadSchemas ?? true,
    unspiedProviders: options.unspiedProviders ?? true,
    pendingRequests: options.pendingRequests ?? true,
    shadowedProviders: options.shadowedProviders ?? true,
  };

  failOnUnspiedProvider(active.unspiedProviders);
  instrumentTestBed();

  // The inspector closes over *this* call's selection rather than reading the module-level one: a
  // later `enableAngularDiagnostics` removes this inspector and registers its own, so there is no
  // state here that can go stale — and no `undefined` case that could never happen.
  const selection = active;

  removeInspector = onTestingModuleConfigured((config) => {
    if (selection.deadSchemas) {
      checkDeadSchemas(config);
    }

    if (selection.ngModuleScopes) {
      checkNgModuleScopes(config);
    }

    if (selection.pendingRequests && controllerToken === undefined) {
      controllerToken = readControllerToken(config);
    }

    if (selection.shadowedProviders) {
      collectModuleDoubles(config);
    }
  });

  if (active.shadowedProviders) {
    removeComponentInspector = onComponentCreated(assertNoShadowedProviders);
  }

  wrapResetTestingModule();

  // The hooks read `active`, so a call from inside a test only re-configures the group.
  if (!insideTest()) {
    registerPerTestHooks();
  }
}

/**
 * Turn the group off: no more configuration inspection, and `injectSpy` warns again instead of
 * failing.
 *
 * The `TestBed` timing instrumentation is left in place — `enableTestBedDiagnostics` may be using
 * it, it is idempotent, and `disableTestBedDiagnostics()` is what removes it.
 */
export function disableAngularDiagnostics(): void {
  active = undefined;
  removeInspector?.();
  removeInspector = undefined;
  removeComponentInspector?.();
  removeComponentInspector = undefined;
  moduleDoubles.clear();
  controllerToken = undefined;
  openAtReset = undefined;
  failOnUnspiedProvider(false);
}
