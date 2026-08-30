/**
 * `overrideAutoSpy` / `overrideComponentProvider` cover the dependency a *component* declares, which
 * a testing-module provider cannot replace; `assertNgModuleScopes` covers the AOT bundle that makes
 * an imported NgModule contribute nothing.
 */
import { Component, Injectable, NgModule, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import '../angular';
import { assertComponentDefIntact, assertNgModuleScopes, overrideAutoSpy, overrideComponentProvider } from './angular-overrides';
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
      /the override did not apply[\s\S]*resolved .* to a NavigationBuilderService.* instance/,
    );
  });

  it('prints a non-object answer as it is', () => {
    // `DeclaredHostComponent` only injects the dependency, so the component itself survives being
    // handed a string and the check is what reports it.
    overrideComponentProvider(DeclaredHostComponent, NavigationBuilderService);
    TestBed.overrideProvider(NavigationBuilderService, { useValue: 'not-a-service' });

    expect(() => TestBed.createComponent(DeclaredHostComponent)).toThrow(/resolved .* to not-a-service/);
  });

  it('stays silent when the fixture does not contain the component at all', () => {
    const menu = overrideComponentProvider(MenuHostComponent, NavigationBuilderService);
    const unrelated = overrideComponentProvider(MenuHostComponent, UnrelatedService);

    TestBed.configureTestingModule({ imports: [UnrelatedComponent] });

    expect(() => TestBed.createComponent(UnrelatedComponent)).not.toThrow();
    expect(typeof menu.build).toBe('function');
    expect(typeof unrelated.ping).toBe('function');
  });

  it('queues nothing when the running TestBed has no createComponent to hook', () => {
    const createComponent: PropertyKey = 'createComponent';
    const restore = mockValueProp(TestBed, createComponent, undefined);
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
      /empty runtime scope: EmptyScopeModule[\s\S]*setNgModuleScope/,
    );
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

    expect(() => assertComponentDefIntact(half)).toThrow(/HoverMenuComponent\.ɵcmp\.providers\[0\] is undefined[\s\S]*barrel chunk/);
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
    expect(() => assertComponentDefIntact(MenuHostComponent, undefined)).toThrow(/argument 1 is undefined, which carries no ɵcmp or ɵdir/);
  });
});
