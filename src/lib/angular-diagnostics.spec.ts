/**
 * The group has to be loud where a spec was silently wrong and silent everywhere else, so each
 * member is proved twice: the configuration that must fail, and the neighbouring one that must not
 * — a providers-only NgModule import, a schema next to real `declarations`, a suite that never
 * configured HTTP testing at all. The false positives are what would make a project turn the whole
 * group back off.
 */
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpClientTestingModule, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Injectable, InjectionToken, NO_ERRORS_SCHEMA, NgModule, inject } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest';

import '../angular';
import { injectSpy } from './angular';
import { provideAutoSpy, provideAutoSpyForToken } from './angular';
import {
  assertNoPendingRequests,
  assertNoShadowedProviders,
  disableAngularDiagnostics,
  enableAngularDiagnostics,
} from './angular-diagnostics';
import { overrideComponentProvider } from './angular-overrides';
import { createAutoMock } from './auto-mock';

@Injectable()
class RealService {
  load(): string {
    return 'real';
  }
}

@Component({ selector: 'vas-diagnosed', standalone: true, template: '' })
class DiagnosedComponent {}

@Component({ selector: 'vas-declared-diagnosed', standalone: false, template: '' })
class DeclaredDiagnosedComponent {}

@NgModule({})
class EmptyModule {}

@NgModule({})
class SecondEmptyModule {}

@NgModule({ providers: [RealService] })
class ProvidersOnlyModule {}

@NgModule({ declarations: [DeclaredDiagnosedComponent] })
class DeclaringModule {}

/** The shape every suite of any size has: one shared testing module, with the HTTP one inside it. */
@NgModule({
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- nesting the deprecated module is the point: this is how a shared testing module carries HTTP testing.
  imports: [HttpClientTestingModule],
})
class SharedTestingModule {}

@NgModule({ imports: [SharedTestingModule] })
class DeeperTestingModule {}

/** An `imports` entry that looks like a component and has no class name — a minified bundle's version of one. */
const NAMELESS_COMPONENT = { ɵcmp: {} };

/**
 * The shape `shadowedProviders` exists for: a component that declares its own provider, so the
 * module-level double is never consulted and the component talks to the real service.
 */
@Component({ selector: 'vas-own-providers', standalone: true, template: '', providers: [RealService] })
class OwnProvidersComponent {
  readonly service = inject(RealService);
}

/** A token double loses the same way a class double does, and reads differently in the failure. */
const GREETER = new InjectionToken<{ hello(): string }>('GREETER');

@Component({
  selector: 'vas-own-token',
  standalone: true,
  template: '',
  providers: [{ provide: GREETER, useValue: { hello: (): string => 'real' } }],
})
class OwnTokenComponent {
  readonly greeter = inject(GREETER);
}

@Component({
  selector: 'vas-own-string-token',
  standalone: true,
  template: '',
  providers: [{ provide: 'GREETING', useValue: { hello: (): string => 'real' } }],
})
class OwnStringTokenComponent {}

/** The same component without the declaration — the module-level double reaches this one. */
@Component({ selector: 'vas-module-providers', standalone: true, template: '' })
class ModuleProvidersComponent {
  readonly service = inject(RealService);
}

describe('enableAngularDiagnostics', () => {
  enableAngularDiagnostics();

  afterAll(disableAngularDiagnostics);

  it('fails a schema that has nothing to apply to, and leaves a live one alone', () => {
    expect(() => TestBed.configureTestingModule({ imports: [DiagnosedComponent], schemas: [NO_ERRORS_SCHEMA] })).toThrow(
      /1 schema\(s\) that can never apply[\s\S]*DiagnosedComponent[\s\S]*still unresolved/,
    );
    expect(() => TestBed.configureTestingModule({ imports: [NAMELESS_COMPONENT] as never, schemas: [NO_ERRORS_SCHEMA] })).toThrow(
      /\[object Object\]/,
    );
    expect(() => TestBed.configureTestingModule({ declarations: [DeclaredDiagnosedComponent], schemas: [NO_ERRORS_SCHEMA] })).not.toThrow();
    expect(() => TestBed.configureTestingModule({ imports: [DiagnosedComponent] })).not.toThrow();
    expect(() => TestBed.configureTestingModule({ imports: [ProvidersOnlyModule], schemas: [NO_ERRORS_SCHEMA] })).not.toThrow();
  });

  it('judges the configuration Angular ends up with, not one call of it', () => {
    // `TestBedCompiler` accumulates the calls, so neither of these is the configuration: the schema
    // applies to the component declared by the first call, and judging the second one alone failed a
    // spec that was right.
    TestBed.configureTestingModule({ declarations: [DeclaredDiagnosedComponent] });

    expect(() => TestBed.configureTestingModule({ imports: [DiagnosedComponent], schemas: [NO_ERRORS_SCHEMA] })).not.toThrow();

    TestBed.resetTestingModule();

    // And the reverse order, which judging one call at a time let through in silence.
    TestBed.configureTestingModule({ schemas: [NO_ERRORS_SCHEMA] });

    expect(() => TestBed.configureTestingModule({ imports: [DiagnosedComponent] })).toThrow(/1 schema\(s\) that can never apply/);

    TestBed.resetTestingModule();
  });

  it('fails an NgModule import that contributes nothing, and never a providers-only one', () => {
    expect(() => TestBed.configureTestingModule({ imports: [EmptyModule] })).toThrow(
      /ngModuleScopes: EmptyModule is imported into the testing module but contributes nothing/,
    );
    expect(() => TestBed.configureTestingModule({ imports: [ProvidersOnlyModule, DeclaringModule] })).not.toThrow();
  });

  it('names every dead import in one line, with the fix', () => {
    expect(() => TestBed.configureTestingModule({ imports: [EmptyModule, SecondEmptyModule] })).toThrow(
      /^\[vitest-auto-spy\] ngModuleScopes: EmptyModule and SecondEmptyModule are imported into the testing module but contribute nothing — this test bundle dropped their ɵɵsetNgModuleScope, so their directives are missing \(NG0303\/NG0304\)\.\nImport the directives they export directly, or declare them in the TestBed\.\nDocs: .*#ngmodulescopes$/,
    );
  });

  it('raises the injectSpy warning to a failure, and lowers it again when that member is off', () => {
    TestBed.configureTestingModule({ providers: [RealService] });

    expect(() => injectSpy(RealService)).toThrow(/injectSpy\(RealService\): got a real RealService/);

    enableAngularDiagnostics({ deadSchemas: false, ngModuleScopes: false, pendingRequests: false, unspiedProviders: false });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    injectSpy(RealService);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('got a real RealService'));

    warn.mockRestore();
    enableAngularDiagnostics();
  });

  it('fails a test that ends with an unflushed request, naming every one of them', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

    const http = TestBed.inject(HttpClient);

    http.get('/api/users').subscribe();
    http.post('/api/orders', {}).subscribe();

    expect(assertNoPendingRequests).toThrow(
      /2 requests were never answered \(when assertNoPendingRequests\(\) ran\): GET \/api\/users, POST \/api\/orders\.[\s\S]*controller\.expectOne\('\/api\/users'\)\.flush\(body\)/,
    );
  });

  it('names the verb in the answer when two open requests share a URL', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

    const http = TestBed.inject(HttpClient);

    http.post('/api/users', {}).subscribe();
    http.get('/api/users').subscribe();

    expect(assertNoPendingRequests).toThrow(
      /Answer each in the spec: controller\.expectOne\(\{ method: 'POST', url: '\/api\/users' \}\)\.flush\(body\)\./,
    );
  });

  it('holds a cancelled request against the test unless asked not to', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

    const http = TestBed.inject(HttpClient);

    http.get('/api/cancelled').subscribe().unsubscribe();

    expect(assertNoPendingRequests).toThrow(
      /GET \/api\/cancelled was never answered[\s\S]*pass assertNoPendingRequests\(\{ ignoreCancelled: true \}\)/,
    );

    http.get('/api/cancelled-again').subscribe().unsubscribe();
    http.get('/api/waiting').subscribe();

    expect(() => assertNoPendingRequests({ ignoreCancelled: true })).toThrow(/GET \/api\/waiting was never answered/);
  });

  it('ignores cancelled requests at teardown when the group was enabled with ignoreCancelled', () => {
    enableAngularDiagnostics({ pendingRequests: { ignoreCancelled: true } });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

    const http = TestBed.inject(HttpClient);

    http.get('/api/snapshot-cancelled').subscribe().unsubscribe();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(HttpClient).get('/api/still-open').subscribe();

    expect(assertNoPendingRequests).toThrow(/GET \/api\/still-open was never answered/);
    expect(() => assertNoPendingRequests({ ignoreCancelled: false })).not.toThrow();

    TestBed.inject(HttpClient).get('/api/cancelled-at-teardown').subscribe().unsubscribe();
    onTestFinished(() => enableAngularDiagnostics());
  });

  it('finds the controller behind the legacy HttpClientTestingModule too', () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the deprecated module is the point: a suite that still imports it must still be diagnosed.
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    TestBed.inject(HttpClient).get('/legacy').subscribe();

    expect(assertNoPendingRequests).toThrow(/GET \/legacy/);
  });

  it('finds the controller inside a shared module that only imports the HTTP one', () => {
    // One level deep was all the search did, so the token was not found, and `pendingRequests`
    // turned itself off for every suite with a shared testing module — without a word.
    TestBed.configureTestingModule({ imports: [DeeperTestingModule] });
    TestBed.inject(HttpClient).get('/nested').subscribe();

    expect(assertNoPendingRequests).toThrow(/GET \/nested/);
  });

  it('keeps the requests of every module a test built, across two resets', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(HttpClient).get('/api/first').subscribe();
    TestBed.resetTestingModule();

    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(HttpClient).get('/api/second').subscribe();
    TestBed.resetTestingModule();

    // The second snapshot used to overwrite the first, so the first module's request was reported
    // by nobody at all.
    expect(assertNoPendingRequests).toThrow(/GET \/api\/first, GET \/api\/second/);
  });

  it('inspects a configuration made through the instance, which used to bypass every check', () => {
    // `getTestBed().configureTestingModule(…)` reached none of the four inspectors: the wrapper was
    // on the static, and every static is a delegate to this instance.
    expect(() => getTestBed().configureTestingModule({ imports: [EmptyModule] })).toThrow(
      /ngModuleScopes: EmptyModule is imported into the testing module but contributes nothing/,
    );
  });

  it('reports through the snapshot taken while the testing module was being torn down', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(HttpClient).get('/api/torn-down').subscribe();
    TestBed.resetTestingModule();

    expect(assertNoPendingRequests).toThrow(/GET \/api\/torn-down/);
  });

  it('stays quiet for a suite with no HTTP testing, and for a module that is already gone', () => {
    TestBed.configureTestingModule({ providers: [RealService] });

    expect(assertNoPendingRequests).not.toThrow();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.resetTestingModule();

    expect(assertNoPendingRequests).not.toThrow();
  });

  it('can be switched off twice and on again from inside a test', () => {
    disableAngularDiagnostics();
    disableAngularDiagnostics();
    enableAngularDiagnostics();

    expect(() => TestBed.configureTestingModule({ imports: [EmptyModule] })).toThrow(/EmptyModule is imported into the testing module/);
  });

  it('checks nothing while every member is switched off', () => {
    enableAngularDiagnostics({ deadSchemas: false, ngModuleScopes: false, pendingRequests: false, unspiedProviders: false });

    expect(() =>
      TestBed.configureTestingModule({
        imports: [EmptyModule, DiagnosedComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
        schemas: [NO_ERRORS_SCHEMA],
      }),
    ).not.toThrow();

    TestBed.inject(HttpClient).get('/ignored').subscribe();

    expect(assertNoPendingRequests).not.toThrow();

    enableAngularDiagnostics();
  });

  /**
   * Measured shape: of 71 component specs whose subject declares its own `providers`, 43 registered
   * the same token on the module and 7 did nothing else — the double records nothing, the component
   * uses the real service, and an assertion that the double was not called passes for the wrong
   * reason.
   */
  describe('shadowedProviders', () => {
    it('fails when the component resolves the real service instead of the module-level double', () => {
      TestBed.configureTestingModule({ imports: [OwnProvidersComponent], providers: [provideAutoSpy(RealService)] });

      expect(() => TestBed.createComponent(OwnProvidersComponent)).toThrow(
        /^\[vitest-auto-spy\] OwnProvidersComponent declares its own providers, so 1 double on the testing module never reached it: RealService → a RealService instance\.\n[^\n]*\nReplace the module-level registration with overrideComponentProvider\(OwnProvidersComponent, RealService\)\.\nDocs: /,
      );
    });

    it('inspects a fixture built through the instance', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [OwnProvidersComponent], providers: [provideAutoSpy(RealService)] });

      expect(() => getTestBed().createComponent(OwnProvidersComponent)).toThrow(/declares its own providers/);
    });

    it('says nothing when the double does reach the component', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [ModuleProvidersComponent], providers: [provideAutoSpy(RealService)] });

      expect(() => TestBed.createComponent(ModuleProvidersComponent)).not.toThrow();
    });

    it('says nothing when the spec put a double where the component looks', () => {
      // The 36 specs of that suite that had already handled it: whatever the component resolves is
      // itself a double, so the question has been decided and the answer is deliberate.
      TestBed.resetTestingModule();
      overrideComponentProvider(OwnProvidersComponent, RealService);

      expect(() => TestBed.createComponent(OwnProvidersComponent)).not.toThrow();
    });

    it('names an InjectionToken by what it calls itself, since it has no class name', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [OwnTokenComponent], providers: [provideAutoSpyForToken(GREETER)] });

      expect(() => TestBed.createComponent(OwnTokenComponent)).toThrow(
        /InjectionToken GREETER →[\s\S]*with TestBed\.overrideProvider\(GREETER, provideAutoSpyForToken\(GREETER\)\)\./,
      );
    });

    it('names a string token as it is written', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [OwnStringTokenComponent],
        providers: [{ provide: 'GREETING', useValue: createAutoMock<{ hello(): string }>() }],
      });

      expect(() => TestBed.createComponent(OwnStringTokenComponent)).toThrow(
        /overrideProvider\(GREETING, provideAutoSpyForToken\(GREETING\)\)/,
      );
    });

    it('checks nothing when the member is switched off', () => {
      enableAngularDiagnostics({ shadowedProviders: false });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [OwnProvidersComponent], providers: [provideAutoSpy(RealService)] });

      expect(() => TestBed.createComponent(OwnProvidersComponent)).not.toThrow();

      enableAngularDiagnostics();
    });

    it('says nothing when the fixture never rendered that component', () => {
      // Reached directly because `TestBed.createComponent` cannot produce it: the class it is handed
      // is always the fixture's root. A spec's own render helper can, which is why the check is
      // callable on its own.
      expect(() =>
        assertNoShadowedProviders(class Absent {}, { debugElement: { componentInstance: {}, query: () => null } }),
      ).not.toThrow();
      expect(() => assertNoShadowedProviders('not a class', {})).not.toThrow();
    });

    it('says nothing about a token the component never asks for, or a plain provider', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [OwnProvidersComponent],
        providers: [{ provide: 'PLAIN', useValue: 'not a double' }],
      });

      expect(() => TestBed.createComponent(OwnProvidersComponent)).not.toThrow();
    });
  });

  // Last on purpose: it leaves the group off, so the per-test hook registered above runs once with
  // nothing to check — the state a suite is in after `disableAngularDiagnostics()`.
  it('checks nothing once the group is off, and neither does the hook it left behind', () => {
    disableAngularDiagnostics();

    expect(() => TestBed.configureTestingModule({ imports: [EmptyModule, DiagnosedComponent], schemas: [NO_ERRORS_SCHEMA] })).not.toThrow();
  });

  it('leaves an explicit check with no controller to read while the group is off', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(HttpClient).get('/api/cancelled-while-off').subscribe().unsubscribe();

    expect(assertNoPendingRequests).not.toThrow();
  });
});
