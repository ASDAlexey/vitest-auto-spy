/**
 * `overrideAutoSpy` / `overrideComponentProvider` cover the dependency a *component* declares, which
 * a testing-module provider cannot replace; `assertNgModuleScopes` covers the AOT bundle that makes
 * an imported NgModule contribute nothing.
 */
import { Component, Injectable, NgModule, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import '../angular';
import { assertNgModuleScopes, overrideAutoSpy, overrideComponentProvider } from './angular-overrides';

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
