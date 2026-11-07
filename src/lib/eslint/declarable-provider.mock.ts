export const DECLARABLE_FIXTURES: Readonly<Record<string, string>> = {
  'angular.d.ts': `declare module '@angular/core' {
    export function Directive(metadata: object): ClassDecorator;
    export function Component(metadata: object): ClassDecorator;
  }`,
  'declarations.ts': `import { Directive as AngularDirective, Component } from '@angular/core';
    @AngularDirective({}) export class FocusDirective {}
    @Component({}) export class PanelComponent {}
    export class CompiledDirective { static ɵdir: unknown; }
    export class CompiledComponent { static ɵcmp: unknown; }
    export class CartService {}
    export class UndecoratedDirective {}
    function Directive(_metadata: object): ClassDecorator { return () => undefined; }
    @Directive({}) export class LookalikeDirective {}`,
  'imported.spec.ts': `import { FocusDirective as Focus, PanelComponent, CompiledDirective, CompiledComponent } from './declarations';
    const providers = [
      { provide: Focus, useValue: createSpyFromClass(Focus) },
      { provide: PanelComponent, useValue: createSpyFromClass(PanelComponent) },
      { provide: CompiledDirective, useValue: createSpyFromClass(CompiledDirective) },
      { provide: CompiledComponent, useValue: createSpyFromClass(CompiledComponent) },
      { provide: Focus, useValue: { init: vi.fn() } },
    ];
    TestBed.overrideProvider(Focus, { useValue: { init: vi.fn() } });`,
  'services.spec.ts': `import { CartService, UndecoratedDirective, LookalikeDirective } from './declarations';
    const providers = [
      { provide: CartService, useValue: createSpyFromClass(CartService) },
      { provide: UndecoratedDirective, useValue: createSpyFromClass(UndecoratedDirective) },
      { provide: LookalikeDirective, useValue: createSpyFromClass(LookalikeDirective) },
    ];`,
  'mixed.spec.ts': `import { createSpyFromClass } from 'vitest-auto-spy';
    import { FocusDirective, CartService } from './declarations';
    const providers = [
      { provide: FocusDirective, useValue: createSpyFromClass(FocusDirective) },
      { provide: CartService, useValue: createSpyFromClass(CartService) },
    ];`,
};
