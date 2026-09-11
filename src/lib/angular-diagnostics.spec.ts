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
import { TestBed } from '@angular/core/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';

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

@NgModule({ providers: [RealService] })
class ProvidersOnlyModule {}

@NgModule({ declarations: [DeclaredDiagnosedComponent] })
class DeclaringModule {}

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

  it('fails an NgModule import that contributes nothing, and never a providers-only one', () => {
    expect(() => TestBed.configureTestingModule({ imports: [EmptyModule] })).toThrow(/empty runtime scope: EmptyModule/);
    expect(() => TestBed.configureTestingModule({ imports: [ProvidersOnlyModule, DeclaringModule] })).not.toThrow();
  });

  it('raises the injectSpy warning to a failure, and lowers it again when that member is off', () => {
    TestBed.configureTestingModule({ providers: [RealService] });

    expect(() => injectSpy(RealService)).toThrow(/the injector returned a plain instance, not an auto-spy/);

    enableAngularDiagnostics({ deadSchemas: false, ngModuleScopes: false, pendingRequests: false, unspiedProviders: false });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    injectSpy(RealService);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not an auto-spy'));

    warn.mockRestore();
    enableAngularDiagnostics();
  });

  it('fails a test that ends with an unflushed request, naming every one of them', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });

    const http = TestBed.inject(HttpClient);

    http.get('/api/users').subscribe();
    http.post('/api/orders', {}).subscribe();

    expect(assertNoPendingRequests).toThrow(/2 unflushed HttpTestingController request\(s\): GET \/api\/users, POST \/api\/orders/);
  });

  it('finds the controller behind the legacy HttpClientTestingModule too', () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the deprecated module is the point: a suite that still imports it must still be diagnosed.
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    TestBed.inject(HttpClient).get('/legacy').subscribe();

    expect(assertNoPendingRequests).toThrow(/GET \/legacy/);
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

    expect(() => TestBed.configureTestingModule({ imports: [EmptyModule] })).toThrow(/empty runtime scope/);
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
        /OwnProvidersComponent declares its own providers[\s\S]*RealService → a RealService instance[\s\S]*overrideComponentProvider/,
      );
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

      expect(() => TestBed.createComponent(OwnTokenComponent)).toThrow(/InjectionToken GREETER →/);
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
});
