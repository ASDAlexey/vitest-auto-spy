/**
 * The group's per-test hooks, where they belong and in which order they run: once per file under
 * `isolate: false`, and whichever way `sequence.hooks` orders them against the suite's own resets.
 */
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Injectable, InjectionToken, inject } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import '../angular';
import { provideAutoSpy } from './angular';
import { disableAngularDiagnostics, enableAngularDiagnostics } from './angular-diagnostics';
import { mockValueProp } from './prop-mock';

@Injectable()
class RealService {
  load(): string {
    return 'real';
  }
}

@Component({ selector: 'vas-hooks-own-providers', standalone: true, template: '', providers: [RealService] })
class OwnProvidersComponent {
  readonly service = inject(RealService);
}

const MISSING_CONFIG = new InjectionToken<string>('MISSING_CONFIG');

/** A root service the test never provides and cannot build: resolving it throws NG0201. */
@Injectable({ providedIn: 'root' })
class RootNavigation {
  readonly config = inject(MISSING_CONFIG);
}

@Component({ selector: 'vas-hooks-plain', standalone: true, template: '' })
class PlainComponent {}

function openRequest(url: string): void {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.inject(HttpClient).get(url).subscribe();
}

/** A reset the snapshotting wrapper cannot see — the only way left for a remembered double to go stale. */
function resetBehindTheWrapper(): void {
  const testBed = getTestBed();

  Reflect.apply(Reflect.get(Object.getPrototypeOf(testBed), 'resetTestingModule'), testBed, []);
}

// Collection enables the group for every block before any test runs, so it is switched off once, at the end.
afterAll(disableAngularDiagnostics);

/**
 * The consumer's own reset is registered before the group, as a setup file registers it. Under
 * `'list'` it therefore runs first, and the check used to read — and rebuild — a module already gone.
 */
describe.each(['list', 'stack'] as const)('pendingRequests with sequence.hooks: %s', (hooks) => {
  afterEach(() => {
    getTestBed().resetTestingModule();
  });

  enableAngularDiagnostics();

  beforeAll(() => {
    vi.setConfig({ sequence: { hooks } });
  });

  afterAll(() => {
    vi.resetConfig();
  });

  it.fails('still reports a request the reset took down with the module', () => {
    openRequest('/api/reset-first');
  });

  it('lets the next test configure the module', () => {
    expect(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] })).not.toThrow();
  });
});

// Every block below enables the group again: before the fix only the first call registered hooks,
// which under `isolate: false` meant only the first spec file of a worker had them.
describe('another block that enables the group', () => {
  enableAngularDiagnostics();

  it.fails('fails a test that leaves a request open', () => {
    openRequest('/api/first-block');
  });
});

describe('a third block that enables the group', () => {
  enableAngularDiagnostics();

  it.fails('has hooks of its own, so a request left open still fails the test', () => {
    openRequest('/api/second-block');
  });

  it('forgets the doubles of a module that was reset and configured without them', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(RealService)] });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [OwnProvidersComponent], providers: [RealService] });

    expect(() => TestBed.createComponent(OwnProvidersComponent)).not.toThrow();
  });

  it('forgets them on the instance reset path too', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(RealService)] });
    getTestBed().resetTestingModule();
    TestBed.configureTestingModule({ imports: [OwnProvidersComponent] });

    expect(() => TestBed.createComponent(OwnProvidersComponent)).not.toThrow();
  });

  it('never builds a real root service to compare a stale double against', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(RootNavigation)] });
    resetBehindTheWrapper();
    TestBed.configureTestingModule({ imports: [PlainComponent] });

    expect(() => TestBed.createComponent(PlainComponent)).not.toThrow();
  });

  it('says nothing when a later provider replaced the double on the module', () => {
    TestBed.configureTestingModule({ imports: [OwnProvidersComponent], providers: [provideAutoSpy(RealService)] });
    TestBed.overrideProvider(RealService, { useValue: { load: (): string => 'deliberate' } });

    expect(() => TestBed.createComponent(OwnProvidersComponent)).not.toThrow();
  });
});

describe('a block that enables the group twice', () => {
  enableAngularDiagnostics();
  enableAngularDiagnostics();

  it.fails('still fails a test that leaves a request open', () => {
    openRequest('/api/twice');
  });

  it('left the next test a module it can configure', () => {
    expect(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] })).not.toThrow();
  });
});

describe('a TestBed with no resetTestingModule of its own', () => {
  it('installs no snapshot on it', () => {
    const testBed = getTestBed();
    const restore = mockValueProp(testBed, 'resetTestingModule', undefined);

    enableAngularDiagnostics();

    expect(Reflect.get(testBed, 'resetTestingModule')).toBeUndefined();

    restore();
  });
});
