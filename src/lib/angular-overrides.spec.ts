/**
 * `overrideAutoSpy` / `overrideComponentProvider` cover the dependency a *component* declares, which
 * a testing-module provider cannot replace; `assertNgModuleScopes` covers the AOT bundle that makes
 * an imported NgModule contribute nothing.
 */
import { Component, Injectable, NgModule, inject } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import '../angular';
import {
  assertComponentDefIntact,
  assertNgModuleScopes,
  componentInjector,
  installResetWrapper,
  overrideAutoSpy,
  overrideComponentProvider,
} from './angular-overrides';
import { mockValueProp } from './prop-mock';

@Injectable()
class NavigationBuilderService {
  build(): string[] {
    return ['real'];
  }
}

@Component({
  selector: 'vas-menu-host',
  standalone: true,
  template: '{{ items.join(",") }}',
  providers: [NavigationBuilderService],
})
class MenuHostComponent {
  readonly items = inject(NavigationBuilderService).build();
}

@Component({ selector: 'vas-declared-host', standalone: false, template: '' })
class DeclaredHostComponent {
  readonly menu = inject(NavigationBuilderService);
}

@Injectable()
class UnrelatedService {
  ping(): string {
    return 'real';
  }
}

@Component({
  selector: 'vas-nesting-host',
  standalone: true,
  imports: [MenuHostComponent],
  template: '<vas-menu-host />',
})
class NestingHostComponent {}

@Component({ selector: 'vas-unrelated', standalone: true, template: '' })
class UnrelatedComponent {}

@NgModule({})
class EmptyScopeModule {}

@NgModule({ providers: [{ provide: 'SCOPE_FLAG', useValue: true }] })
class ScopeWithProvidersModule {}

@NgModule({ declarations: [DeclaredHostComponent] })
class DeclaringModule {}

describe('overrideAutoSpy', () => {
  it('produces the { useValue } shape overrideProvider expects', () => {
    const override = overrideAutoSpy(NavigationBuilderService);

    override.useValue.build.mockReturnValue(['spied']);

    expect(Object.keys(override)).toEqual(['useValue']);
    expect(override.useValue.build()).toEqual(['spied']);
  });

  it('forwards the spy configuration', () => {
    const override = overrideAutoSpy(NavigationBuilderService, { onlyMethodsToSpyOn: ['build'] });

    expect(typeof override.useValue.build).toBe('function');
  });
});

describe('overrideComponentProvider', () => {
  it('replaces a provider the component declares for itself', () => {
    const menu = overrideComponentProvider(MenuHostComponent, NavigationBuilderService);

    menu.build.mockReturnValue(['spied']);

    const fixture = TestBed.createComponent(MenuHostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('spied');
    expect(menu.build).toHaveBeenCalled();
  });

  it('names the inject that ran first when the module is already instantiated', () => {
    TestBed.configureTestingModule({ providers: [UnrelatedService] });
    TestBed.inject(UnrelatedService);

    expect(() => overrideComponentProvider(MenuHostComponent, NavigationBuilderService)).toThrow(
      /overrideComponentProvider\(MenuHostComponent, NavigationBuilderService\) ran after the testing module was instantiated[\s\S]*Override first, then inject/,
    );
  });

  it('passes any other failure through unchanged', () => {
    const boom = new Error('boom');
    const configure = vi.spyOn(TestBed, 'configureTestingModule').mockImplementation(() => {
      throw boom;
    });

    try {
      expect(() => overrideComponentProvider(MenuHostComponent, NavigationBuilderService)).toThrow(boom);
    } finally {
      configure.mockRestore();
    }
  });

  it('queues a non-standalone component as a declaration', () => {
    const menu = overrideComponentProvider(DeclaredHostComponent, NavigationBuilderService);

    menu.build.mockReturnValue([]);
    TestBed.configureTestingModule({ providers: [NavigationBuilderService] });

    const fixture = TestBed.createComponent(DeclaredHostComponent);

    expect(fixture.componentInstance.menu).toBe(menu);
  });

  it('verifies through the element that hosts the component, not only the fixture root', () => {
    const menu = overrideComponentProvider(MenuHostComponent, NavigationBuilderService);

    menu.build.mockReturnValue([]);
    TestBed.configureTestingModule({ imports: [NestingHostComponent] });
    TestBed.createComponent(NestingHostComponent);

    expect(menu.build).toHaveBeenCalled();
  });

  it('names what the injector answered with when the override did not apply', () => {
    const menu = overrideComponentProvider(MenuHostComponent, NavigationBuilderService);

    menu.build.mockReturnValue([]);
    // The case the helper cannot prevent: a later override for the same token wins, and the spy the
    // spec is about to assert on is not what the component resolves any more.
    TestBed.overrideProvider(NavigationBuilderService, { useValue: new NavigationBuilderService() });

    expect(() => TestBed.createComponent(MenuHostComponent)).toThrow(
      /the override did not apply[\s\S]*resolved .* to a NavigationBuilderService.* instance[\s\S]*It got the real service because/,
    );
  });

  it('prints a non-object answer as it is', () => {
    // `DeclaredHostComponent` only injects the dependency, so the component itself survives being
    // handed a string and the check is what reports it.
    overrideComponentProvider(DeclaredHostComponent, NavigationBuilderService);
    TestBed.overrideProvider(NavigationBuilderService, { useValue: 'not-a-service' });

    expect(() => TestBed.createComponent(DeclaredHostComponent)).toThrow(/resolved .* to not-a-service/);
  });

  it('says something configured the token again when the component got a different double', () => {
    overrideComponentProvider(DeclaredHostComponent, NavigationBuilderService);
    TestBed.overrideProvider(NavigationBuilderService, overrideAutoSpy(NavigationBuilderService));

    expect(() => TestBed.createComponent(DeclaredHostComponent)).toThrow(
      /\nIt got a different double because something configured NavigationBuilderService again after this call/,
    );
  });

  it('leaves nothing queued for the next test that renders', () => {
    // The original report's shape: a beforeEach applies the override for every test, and the first
    // test asserts on the spy alone — no fixture, so nothing consumes the entry or unwraps
    // `createComponent`. The reset between tests now drops both; the next test used to verify the
    // stale entry against its own fixture and fail with a false "the override did not apply".
    const menu = overrideComponentProvider(MenuHostComponent, NavigationBuilderService);

    menu.build.mockReturnValue([]);

    expect(menu.build).toBeDefined();
  });

  it('renders a component no override was queued for, with the platform provider back', () => {
    const fixture = TestBed.createComponent(MenuHostComponent);

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('real');
  });

  it('stays silent when the fixture does not contain the component at all', () => {
    const menu = overrideComponentProvider(MenuHostComponent, NavigationBuilderService);
    const unrelated = overrideComponentProvider(MenuHostComponent, UnrelatedService);

    TestBed.configureTestingModule({ imports: [UnrelatedComponent] });

    expect(() => TestBed.createComponent(UnrelatedComponent)).not.toThrow();
    expect(typeof menu.build).toBe('function');
    expect(typeof unrelated.ping).toBe('function');
  });

  it('verifies a fixture built through the instance, which used to bypass the check', () => {
    // `getTestBed().createComponent(X)` reaches the same seam now: a spec's own render helper often
    // holds the instance rather than the exported class, and the check simply did not happen there.
    overrideComponentProvider(DeclaredHostComponent, NavigationBuilderService);
    TestBed.overrideProvider(NavigationBuilderService, { useValue: 'not-a-service' });

    expect(() => getTestBed().createComponent(DeclaredHostComponent)).toThrow(/the override did not apply/);
  });

  it('queues nothing when the running TestBed has no createComponent to hook', () => {
    const createComponent: PropertyKey = 'createComponent';
    const restore = mockValueProp(getTestBed(), createComponent, undefined);
    const menu = overrideComponentProvider(MenuHostComponent, NavigationBuilderService);

    restore();
    menu.build.mockReturnValue(['unverified']);

    const fixture = TestBed.createComponent(MenuHostComponent);

    fixture.detectChanges();

    expect(fixture.componentInstance.items).toEqual(['unverified']);
  });
});

describe('assertNgModuleScopes', () => {
  it('accepts a module that declares something', () => {
    expect(() => assertNgModuleScopes(DeclaringModule)).not.toThrow();
  });

  it('names every module whose runtime scope is empty', () => {
    expect(() => assertNgModuleScopes(DeclaringModule, EmptyScopeModule)).toThrow(
      /^\[vitest-auto-spy\] assertNgModuleScopes\(\): EmptyScopeModule has an empty runtime scope — this test bundle dropped its ɵɵsetNgModuleScope[^\n]*\nImport the declarations the spec needs directly, or declare them in the TestBed\.\nDocs: /,
    );
  });

  it('says a module with providers of its own may be providers-only, and names every module in one line', () => {
    expect(() => assertNgModuleScopes(EmptyScopeModule, ScopeWithProvidersModule, DeclaringModule)).toThrow(
      /EmptyScopeModule and ScopeWithProvidersModule have an empty runtime scope — this test bundle dropped their[\s\S]*\nScopeWithProvidersModule has providers of its own; a providers-only module declares nothing on purpose/,
    );
    expect(() => assertNgModuleScopes(ScopeWithProvidersModule, ScopeWithProvidersModule)).toThrow(/have providers of their own/);
  });

  it('still describes a module definition that carries no class name', () => {
    // Not hypothetical in a minified bundle, where a class can lose its name entirely.
    expect(() => assertNgModuleScopes({ ɵmod: { declarations: [], exports: [] } })).toThrow(/\[object Object\]/);
  });

  it('ignores anything that is not an NgModule', () => {
    expect(() => assertNgModuleScopes(undefined, 'DirectivesModule', {})).not.toThrow();
  });
});

describe('assertComponentDefIntact', () => {
  it('accepts a component the compiler built whole', () => {
    expect(() => assertComponentDefIntact(MenuHostComponent, DeclaredHostComponent)).not.toThrow();
  });

  it('accepts a directive, which carries the same lists under ɵdir', () => {
    expect(() => assertComponentDefIntact({ ɵdir: { providers: [NavigationBuilderService] } })).not.toThrow();
  });

  it('names the exact position a provider never arrived at', () => {
    const half = { name: 'HoverMenuComponent', ɵcmp: { providers: [undefined], viewProviders: [], dependencies: [] } };

    expect(() => assertComponentDefIntact(half)).toThrow(
      /HoverMenuComponent\.ɵcmp\.providers\[0\] is undefined\.\n[^\n]*barrel chunk[^\n]*\nIn HoverMenuComponent's source, import the symbol at that position from its own file rather than through the barrel\./,
    );
  });

  it('reaches a hole nested inside a provider array, and reports every one it found', () => {
    const half = { name: 'CardComponent', ɵcmp: { viewProviders: [[NavigationBuilderService, null]], dependencies: [undefined] } };

    expect(() => assertComponentDefIntact(half)).toThrow(/viewProviders\[0\]\[1\], CardComponent\.ɵcmp\.dependencies\[0\] are undefined/);
  });

  it('unwraps the thunk Angular emits for a forward reference', () => {
    const lazy = { name: 'LazyComponent', ɵcmp: { dependencies: () => [undefined] } };

    expect(() => assertComponentDefIntact(lazy)).toThrow(/LazyComponent\.ɵcmp\.dependencies\[0\] is undefined/);
  });

  it('leaves a thunk that throws to the failure that already has a message', () => {
    const cyclic = {
      name: 'CyclicComponent',
      ɵcmp: {
        dependencies: () => {
          throw new Error('forward reference not resolved');
        },
      },
    };

    expect(() => assertComponentDefIntact(cyclic)).not.toThrow();
  });

  it('reports the class reference that itself never arrived', () => {
    expect(() => assertComponentDefIntact(MenuHostComponent, undefined)).toThrow(
      /argument 1 is undefined, which carries no ɵcmp or ɵdir\.\nThe import resolved to nothing[^\n]*Import it from its own file rather than through the barrel\./,
    );
  });

  it('asks for the class itself when it was handed something that is not one', () => {
    expect(() => assertComponentDefIntact(EmptyScopeModule)).toThrow(
      /argument 0 is EmptyScopeModule[^\n]*\nIt is not a component or directive; pass the @Component or @Directive class itself\./,
    );
  });
});

describe('componentInjector', () => {
  /**
   * The two "nothing to check" answers, taken directly because neither is reachable through
   * `TestBed.createComponent`: Angular throws on a non-class before the hook that asks this runs,
   * and a fixture whose root is a different component only happens inside a host.
   */
  it('answers nothing for a value that is not a component class', () => {
    expect(componentInjector({}, 'not a class')).toBeUndefined();
    expect(componentInjector({}, undefined)).toBeUndefined();
  });

  it('answers nothing when the fixture never rendered that component', () => {
    class Absent {}

    const fixture = {
      componentInstance: {},
      debugElement: { componentInstance: {}, injector: { get: (): null => null }, query: () => null },
    };

    expect(componentInjector(fixture, Absent)).toBeUndefined();
  });

  it('answers the injector of the element hosting it', () => {
    class Hosted {}

    const injector = { get: (): string => 'resolved' };
    const hosted = { componentInstance: new Hosted(), injector, query: (): null => null };
    const fixture = {
      componentInstance: {},
      debugElement: {
        componentInstance: {},
        injector: { get: (): null => null },
        query: (predicate: (element: typeof hosted) => boolean) => (predicate(hosted) ? hosted : null),
      },
    };

    expect(componentInjector(fixture, Hosted)).toBe(injector);
  });
});

describe('installResetWrapper', () => {
  it('wraps the host it is given and still calls through to its own reset', () => {
    const original = vi.fn();
    const host = { resetTestingModule: original };

    expect(installResetWrapper(host)).toBe(true);
    expect(host.resetTestingModule).not.toBe(original);

    host.resetTestingModule();

    expect(original).toHaveBeenCalledTimes(1);
  });

  it('leaves a host without the method untouched rather than throwing', () => {
    const host = {};

    expect(installResetWrapper(host)).toBe(false);
    expect(host).toEqual({});
  });
});
