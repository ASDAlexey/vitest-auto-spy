/**
 * `provideDomSanitizerDouble()` — a `DomSanitizer` whose every method is a spy, answering the way the
 * real one answers where that matters to the code under test.
 *
 * `createSpyFromClass(DomSanitizer)` finds nothing to spy on: the class is abstract and its methods
 * are declared, not defined, so the prototype is empty. The hand-written replacement is
 * `{ bypassSecurityTrustHtml: (v) => v }`, which hands the template a plain string where Angular
 * expects a `SafeHtml` — and a binding that took the string passes a spec the application fails.
 *
 * So the `bypassSecurityTrust*` spies return Angular's own safe values, built by the same core
 * functions the real sanitizer calls, and `sanitize` unwraps them — including the "Required a safe
 * HTML, got a Style" refusal for a value bound in the wrong context. What the double does not do is
 * strip markup from a plain string: it answers the string as given, so a spec asserts on exactly what
 * the code under test passed. A spec about the stripping itself wants the real sanitizer.
 */
import * as angularCore from '@angular/core';
import { type FactoryProvider, SecurityContext } from '@angular/core';
import { DomSanitizer, type SafeValue } from '@angular/platform-browser';

import { angularInternalsError } from './angular-internals-error';
import { createSpyFromClass } from './create-spy-from-class';
import { getMockAdapter } from './mock-adapter';
import type { Func, Spy } from './types';

const METHODS = [
  'sanitize',
  'bypassSecurityTrustHtml',
  'bypassSecurityTrustStyle',
  'bypassSecurityTrustScript',
  'bypassSecurityTrustUrl',
  'bypassSecurityTrustResourceUrl',
] as const;

/** The bypass type a context accepts, spelled as Angular's `BypassType` spells it. */
function expectedBypass(context: SecurityContext): string | undefined {
  switch (context) {
    case SecurityContext.HTML:
      return 'HTML';
    case SecurityContext.STYLE:
      return 'Style';
    case SecurityContext.SCRIPT:
      return 'Script';
    case SecurityContext.URL:
      return 'URL';
    case SecurityContext.RESOURCE_URL:
      return 'ResourceURL';
    default:
      return undefined;
  }
}

type Bypass = Exclude<(typeof METHODS)[number], 'sanitize'>;

/** The core functions the real sanitizer calls, found by name on the module rather than linked. */
export interface SanitizationInternals {
  bypass: Record<Bypass, Func>;
  bypassType: (value: unknown) => string | null;
  unwrap: (value: unknown) => string;
  securityUrl: string;
}

const BYPASS_EXPORTS: Record<Bypass, string> = {
  bypassSecurityTrustHtml: 'ɵbypassSanitizationTrustHtml',
  bypassSecurityTrustStyle: 'ɵbypassSanitizationTrustStyle',
  bypassSecurityTrustScript: 'ɵbypassSanitizationTrustScript',
  bypassSecurityTrustUrl: 'ɵbypassSanitizationTrustUrl',
  bypassSecurityTrustResourceUrl: 'ɵbypassSanitizationTrustResourceUrl',
};

function isFunction(value: unknown): value is Func {
  return typeof value === 'function';
}

// Named imports of these would be a link-time dependency on private exports: an Angular that drops one
// would fail every entry that bundles this file at import, not the one spec that builds the double.
export function readSanitizationInternals(angular: object): SanitizationInternals {
  const names = [...Object.values(BYPASS_EXPORTS), 'ɵgetSanitizationBypassType', 'ɵunwrapSafeValue'];
  const missing = names.filter((name) => !isFunction(Reflect.get(angular, name)));

  if (missing.length > 0) {
    throw angularInternalsError(
      missing.join(', '),
      "`createDomSanitizerDouble()` / `provideDomSanitizerDouble()` build Angular's own safe values with them and cannot " +
        'answer without them; provide `DomSanitizer` yourself until then.',
    );
  }

  const read = (name: string): Func => Reflect.get(angular, name);
  const url: unknown = Reflect.get(angular, 'ɵXSS_SECURITY_URL');
  const bypass = Object.fromEntries(Object.entries(BYPASS_EXPORTS).map(([method, name]) => [method, read(name)]));

  return {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- built from the keys of `BYPASS_EXPORTS`, which is typed by the same record.
    bypass: bypass as Record<Bypass, Func>,
    bypassType: read('ɵgetSanitizationBypassType'),
    unwrap: read('ɵunwrapSafeValue'),
    securityUrl: typeof url === 'string' ? url : 'https://angular.dev/best-practices/security',
  };
}

let cached: SanitizationInternals | undefined;

function sanitizationInternals(): SanitizationInternals {
  cached ??= readSanitizationInternals(angularCore);

  return cached;
}

function sanitize(context: SecurityContext, value: SafeValue | string | null): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const internals = sanitizationInternals();
  const actual = internals.bypassType(value);

  if (actual === null) {
    return String(value);
  }

  const expected = expectedBypass(context);
  // A resource URL is also a URL — the one widening Angular's own check allows.
  const accepted = expected === undefined || actual === expected || (expected === 'URL' && actual === 'ResourceURL');

  if (!accepted) {
    throw new Error(`Required a safe ${expected}, got a ${actual} (see ${internals.securityUrl})`);
  }

  return internals.unwrap(value);
}

/**
 * The `DomSanitizer` double without a `TestBed` — for a class built with `new`, or a pipe built in
 * `TestBed.runInInjectionContext`.
 *
 * ```ts
 * const sanitizer = createDomSanitizerDouble();
 * const pipe = new SafeHtmlPipe(sanitizer);
 *
 * pipe.transform('<b>hi</b>');
 *
 * expect(sanitizer.bypassSecurityTrustHtml).toHaveBeenCalledWith('<b>hi</b>');
 * ```
 */
export function createDomSanitizerDouble(): Spy<DomSanitizer> {
  const { bypass } = sanitizationInternals();
  const double = createSpyFromClass(DomSanitizer, [...METHODS]);
  const adapter = getMockAdapter();

  adapter.restoreImplementation(double.sanitize, sanitize);

  for (const [method, implementation] of Object.entries(bypass)) {
    adapter.restoreImplementation(Reflect.get(double, method), implementation);
  }

  return double;
}

/**
 * Provide the double under `DomSanitizer`; `injectSpy(DomSanitizer)` hands it back.
 *
 * ```ts
 * TestBed.configureTestingModule({ providers: [provideDomSanitizerDouble()] });
 *
 * expect(injectSpy(DomSanitizer).bypassSecurityTrustResourceUrl).toHaveBeenCalledWith(videoUrl);
 * ```
 *
 * A factory, so every injector builds its own and no test inherits another's calls.
 */
export function provideDomSanitizerDouble(): FactoryProvider {
  return { provide: DomSanitizer, useFactory: createDomSanitizerDouble };
}
