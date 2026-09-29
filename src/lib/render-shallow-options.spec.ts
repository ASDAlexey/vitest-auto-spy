/**
 * The options that reach past the component: what `prepareShallow` adds rather than replaces, where a
 * kept child of a `standalone: false` component goes, the metadata handed to `configureTestingModule`
 * untouched, and the two failures `renderShallow` names instead of passing Angular's own words on.
 */
import { CUSTOM_ELEMENTS_SCHEMA, Component, Injectable, NO_ERRORS_SCHEMA, NgModule, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { injectSpy, provideAutoSpy } from '../angular';
import { prepareShallow, renderShallow } from './render-shallow';

@Injectable({ providedIn: 'root' })
class GreetingService {
  greet(): string {
    return 'real';
  }
}

@Injectable({ providedIn: 'root' })
class FarewellService {
  leave(): string {
    return 'real';
  }
}

@Component({ selector: 'app-greeter', template: '' })
class GreeterComponent {
  readonly greeting = inject(GreetingService);
  readonly farewell = inject(FarewellService);
}

@Component({ selector: 'app-badge', template: '<b>badge</b>' })
class BadgeComponent {}

@Component({ selector: 'app-legacy-badge', template: '<i>legacy badge</i>', standalone: false })
class LegacyBadgeComponent {}

@Component({
  selector: 'app-legacy-card',
  template: '<app-badge /><app-legacy-badge />',
  standalone: false,
})
class LegacyCardComponent {}

@NgModule({})
class ExtraModule {}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prepareShallow create({ extraProviders, extraImports })', () => {
  it('adds extraProviders after the prepared ones instead of replacing them', () => {
    const prepare = prepareShallow(GreeterComponent, { providers: [provideAutoSpy(GreetingService)] });

    const { component } = prepare.create({ extraProviders: [provideAutoSpy(FarewellService)] });

    expect(component.greeting).toBe(injectSpy(GreetingService));
    expect(component.farewell).toBe(injectSpy(FarewellService));
  });

  it('still replaces the prepared providers outright when `providers` is passed', () => {
    const prepare = prepareShallow(GreeterComponent, { providers: [provideAutoSpy(GreetingService)] });

    const { component } = prepare.create({ providers: [provideAutoSpy(FarewellService)] });

    expect(component.greeting).toBeInstanceOf(GreetingService);
    expect(component.farewell).toBe(injectSpy(FarewellService));
  });

  it('adds extraProviders when nothing was prepared', () => {
    const { component } = prepareShallow(GreeterComponent).create({ extraProviders: [provideAutoSpy(GreetingService)] });

    expect(component.greeting).toBe(injectSpy(GreetingService));
  });

  it('adds extraImports after the prepared imports, and onto none', () => {
    const configure = vi.spyOn(TestBed, 'configureTestingModule');

    prepareShallow(GreeterComponent, { imports: [ExtraModule] }).create({ extraImports: [ExtraModule] });
    TestBed.resetTestingModule();
    prepareShallow(GreeterComponent).create({ extraImports: [ExtraModule] });

    expect(configure.mock.calls.map(([metadata]) => metadata?.imports)).toEqual([
      [GreeterComponent, ExtraModule, ExtraModule],
      [GreeterComponent, ExtraModule],
    ]);
  });
});

describe('keepChildren on a standalone: false component', () => {
  it('imports a standalone child and declares a module-less one, so both render', () => {
    const { fixture } = renderShallow(LegacyCardComponent, {
      keepTemplate: true,
      keepChildren: [BadgeComponent, LegacyBadgeComponent],
    });
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('app-badge')?.textContent).toBe('badge');
    expect(element.querySelector('app-legacy-badge')?.textContent).toBe('legacy badge');
  });

  it('leaves every child out without keepChildren', () => {
    const { fixture } = renderShallow(LegacyCardComponent, { keepTemplate: true });
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('app-badge')?.textContent).toBe('');
  });
});

describe('the testBed option', () => {
  it('passes the rest of the metadata to configureTestingModule untouched', () => {
    const configure = vi.spyOn(TestBed, 'configureTestingModule');

    renderShallow(GreeterComponent, {
      testBed: { errorOnUnknownElements: true, teardown: { destroyAfterEach: true } },
    });

    expect(configure).toHaveBeenCalledWith(expect.objectContaining({ errorOnUnknownElements: true, teardown: { destroyAfterEach: true } }));
    expect(configure.mock.calls[0]?.[0]).not.toHaveProperty('schemas');
  });

  it('adds schemas to the permissive one a standalone: false component gets', () => {
    const configure = vi.spyOn(TestBed, 'configureTestingModule');

    renderShallow(LegacyCardComponent, { testBed: { schemas: [CUSTOM_ELEMENTS_SCHEMA] } });

    expect(configure.mock.calls[0]?.[0]?.schemas).toEqual([NO_ERRORS_SCHEMA, CUSTOM_ELEMENTS_SCHEMA]);
  });

  it('hands a standalone component the schemas it was given', () => {
    const configure = vi.spyOn(TestBed, 'configureTestingModule');

    renderShallow(GreeterComponent, { testBed: { schemas: [CUSTOM_ELEMENTS_SCHEMA] } });

    expect(configure.mock.calls[0]?.[0]?.schemas).toEqual([CUSTOM_ELEMENTS_SCHEMA]);
  });
});

describe('a testing module already instantiated', () => {
  it('names renderShallow and beforeCreate instead of Angular’s bare refusal', () => {
    TestBed.inject(GreetingService);

    let thrown: unknown;

    try {
      renderShallow(GreeterComponent);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toContain('renderShallow(GreeterComponent): the testing module was already instantiated');
    expect(String(thrown)).toContain('beforeCreate');
    expect((thrown as Error).cause).toBeInstanceOf(Error);
  });

  it('passes any other failure of the configuration through as it was', () => {
    const failure = new Error('something else');

    vi.spyOn(TestBed, 'configureTestingModule').mockImplementation(() => {
      throw failure;
    });

    expect(() => renderShallow(GreeterComponent)).toThrow(failure);
  });

  it('passes a thrown non-Error through as it was', () => {
    vi.spyOn(TestBed, 'configureTestingModule').mockImplementation(() => {
      throw 'not an error';
    });

    expect(() => renderShallow(GreeterComponent)).toThrow('not an error');
  });
});

describe('a TestBed nobody initialized', () => {
  const testBedsBefore = globalThis.__vitestAutoSpyTestBeds__;

  // An earlier file's vi.resetModules() would turn the answer into the module-reset one.
  beforeEach(() => {
    globalThis.__vitestAutoSpyTestBeds__ = undefined;
  });

  afterEach(() => {
    globalThis.__vitestAutoSpyTestBeds__ = testBedsBefore;
  });

  it('names the two-copies cause when createComponent says initTestEnvironment was never called', () => {
    vi.spyOn(TestBed, 'createComponent').mockImplementation(() => {
      throw new Error('Need to call TestBed.initTestEnvironment() first');
    });

    expect(() => renderShallow(GreeterComponent)).toThrow(/renderShallow\(GreeterComponent\)[\s\S]*server: \{ deps: \{ inline/);
  });
});
