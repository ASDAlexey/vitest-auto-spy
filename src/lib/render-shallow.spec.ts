/**
 * `renderShallow` must stay a thin wrapper over `TestBed`: same fixture, same lifecycle, minus the
 * child subtree. These specs pin down what it strips (children, template, styles), what it keeps
 * (DI, inputs, `ngOnInit`, the real `ComponentFixture`) and the escape hatches for the cases where
 * a spec genuinely needs the template back.
 */
import {
  Component,
  Directive,
  ElementRef,
  Injectable,
  NgModule,
  OnInit,
  Pipe,
  type PipeTransform,
  type Type,
  inject,
  input,
  makeEnvironmentProviders,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { injectSpy, provideAutoSpy } from '../angular';
import { disableAngularDiagnostics, enableAngularDiagnostics } from '../angular-diagnostics';
import { renderShallow } from './render-shallow';

@Injectable({ providedIn: 'root' })
class LabelService {
  resolve(id: number): string {
    return `real-${id}`;
  }
}

@Component({ selector: 'app-aliased', template: '' })
class AliasedComponent {
  readonly heading = input('draft', { alias: 'title' });
}

let childInstances = 0;

@Component({ selector: 'app-child', template: '<p>child</p>' })
class ChildComponent {
  constructor() {
    childInstances += 1;
  }
}

@Component({
  selector: 'app-host',
  imports: [ChildComponent],
  template: '<app-child /><span>{{ label() }}</span>',
  styles: ['span { color: red; }'],
})
class HostComponent implements OnInit {
  readonly #labels = inject(LabelService);

  readonly id = input(0);
  readonly label = signal('idle');
  initialized = false;

  ngOnInit(): void {
    this.initialized = true;
    this.label.set(this.#labels.resolve(this.id()));
  }
}

@Component({ selector: 'app-legacy', template: '<app-child />', standalone: false })
class LegacyComponent {
  readonly name = 'legacy';
}

@Pipe({ name: 'shout' })
class ShoutPipe implements PipeTransform {
  transform(value: string): string {
    return `${value}!`;
  }
}

@Directive({ selector: '[appMark]' })
class MarkDirective {
  readonly host = inject(ElementRef<HTMLElement>).nativeElement;
}

@Component({
  selector: 'app-with-pipe',
  imports: [ShoutPipe],
  template: '{{ label | shout }}',
})
class WithPipeComponent {
  readonly label = 'hello';
}

@Component({ selector: 'app-bare', template: '<span>bare</span>' })
class BareComponent {}

@Component({
  selector: 'app-with-directive',
  imports: [MarkDirective],
  template: '<span appMark>marked</span>',
})
class WithDirectiveComponent {}

/** The vocabulary an NgModule owns: legal in a template, illegal in a standalone component's `imports`. */
@Pipe({ name: 'whisper', standalone: false })
class WhisperPipe implements PipeTransform {
  transform(value: string): string {
    return value.toLowerCase();
  }
}

@NgModule({ declarations: [WhisperPipe], exports: [WhisperPipe] })
class WhisperModule {}

@NgModule({})
class UnrelatedModule {}

@Component({
  selector: 'app-with-module-pipe',
  imports: [WhisperModule],
  template: '{{ label | whisper }}',
})
class WithModulePipeComponent {
  readonly label = 'HELLO';
}

beforeEach(() => {
  childInstances = 0;
});

describe('renderShallow', () => {
  it('creates the component without its template, styles or children, but with its lifecycle', () => {
    const { fixture, component } = renderShallow(HostComponent);

    expect(component.initialized).toBe(true);
    expect(childInstances).toBe(0);
    expect(fixture.nativeElement.textContent).toBe('');
    expect(fixture.componentInstance).toBe(component);
  });

  it('sets inputs before the first change detection', () => {
    const { component } = renderShallow(HostComponent, { inputs: { id: 42 } });

    expect(component.id()).toBe(42);
    expect(component.label()).toBe('real-42');
  });

  it('sets an aliased input by its class-field name, which is how the type is keyed', () => {
    // Angular answers the field name with an `NG0303` on the console and no value at all, so this
    // used to render the default — silently, and invisibly under a console stub.
    const { component } = renderShallow(AliasedComponent, { inputs: { heading: 'shipped' } });

    expect(component.heading()).toBe('shipped');
  });

  it('refuses an input the component does not declare, instead of setting nothing', () => {
    expect(() =>
      // @ts-expect-error — the type rejects it too; this is the runtime half, for a key built dynamically
      renderShallow(AliasedComponent, { inputs: { headingg: 'typo' } }),
    ).toThrow(/renderShallow: AliasedComponent declares no input named 'headingg'/);
  });

  it('skips the first change detection on request, leaving ngOnInit unrun', () => {
    const { component, fixture } = renderShallow(HostComponent, { detectChanges: false });

    expect(component.initialized).toBe(false);

    fixture.detectChanges();

    expect(component.initialized).toBe(true);
  });

  it('drops the host directives, and the graph they inject, on request', () => {
    @Injectable()
    class HeavyGraph {}

    @Directive({ selector: '[draggable-host]', standalone: true })
    class DraggableHost {
      readonly graph = inject(HeavyGraph);
    }

    @Component({ selector: 'player', standalone: true, template: '', hostDirectives: [DraggableHost] })
    class PlayerComponent {}

    expect(() => renderShallow(PlayerComponent)).toThrow(/HeavyGraph/);
    TestBed.resetTestingModule();

    const { fixture } = renderShallow(PlayerComponent, { keepHostDirectives: false });

    expect(fixture.debugElement.injector.get(DraggableHost, null)).toBeNull();
  });

  it('renders a stand-in template when one is given', () => {
    const { fixture } = renderShallow(HostComponent, { template: '<em>stub</em>' });

    expect(fixture.nativeElement.textContent).toBe('stub');
    expect(childInstances).toBe(0);
  });

  it('keeps the real template on request, still without instantiating children', () => {
    const { fixture } = renderShallow(HostComponent, { keepTemplate: true });

    expect(fixture.nativeElement.textContent).toContain('real-0');
    expect(childInstances).toBe(0);
  });

  it('keeps the pipes of the real template resolvable', () => {
    const { fixture } = renderShallow(WithPipeComponent, { keepTemplate: true });

    expect(fixture.nativeElement.textContent).toBe('hello!');
  });

  it('keeps the directives of the real template applied', () => {
    const { fixture } = renderShallow(WithDirectiveComponent, { keepTemplate: true });
    const span = fixture.debugElement.query(By.css('span'));

    expect(span.injector.get(MarkDirective, null)).not.toBeNull();
  });

  it('keeps a template that imports nothing at all', () => {
    const { fixture } = renderShallow(BareComponent, { keepTemplate: true });

    expect(fixture.nativeElement.textContent).toBe('bare');
  });

  it('keeps the children that are named explicitly', () => {
    renderShallow(HostComponent, { keepTemplate: true, keepChildren: [ChildComponent] });

    expect(childInstances).toBe(1);
  });

  it('wires providers, so the component reads spies from DI', () => {
    const { fixture, component } = renderShallow(HostComponent, {
      providers: [provideAutoSpy(LabelService)],
      detectChanges: false,
    });

    injectSpy(LabelService).resolve.mockReturnValue('stubbed');
    fixture.detectChanges();

    expect(component.label()).toBe('stubbed');
    expect(injectSpy(LabelService).resolve).toHaveBeenCalledWith(0);
  });

  it('takes EnvironmentProviders, the shape every Angular `provide*()` helper returns', () => {
    const { component } = renderShallow(HostComponent, {
      providers: [makeEnvironmentProviders([provideAutoSpy(LabelService)])],
      detectChanges: false,
    });

    injectSpy(LabelService).resolve.mockReturnValue('from-environment');
    component.ngOnInit();

    expect(component.label()).toBe('from-environment');
  });

  it('runs `beforeCreate` after the module is configured and before the component exists', () => {
    const order: string[] = [];

    const { component } = renderShallow(HostComponent, {
      providers: [provideAutoSpy(LabelService)],
      beforeCreate: () => {
        order.push('beforeCreate');
        injectSpy(LabelService).resolve.mockReturnValue('early');
      },
    });

    expect(order).toEqual(['beforeCreate']);
    expect(component.label()).toBe('early');
  });

  it('declares a non-standalone component instead of importing it', () => {
    const { component } = renderShallow(LegacyComponent);

    expect(component.name).toBe('legacy');
    expect(childInstances).toBe(0);
  });
});

/**
 * The shape `ɵcmp.dependencies` arrives in, forced onto a JIT-compiled definition.
 *
 * A suite cannot compile a component AOT, and JIT emits the factory and nothing else — so the array
 * and the `null` an AOT build produces are reachable here only by writing them onto the definition
 * the decorator left. The values themselves are the compiler's: the array is what the factory
 * returns, and `null` is what `defineComponent` stores for a component that imports nothing.
 */
function forceDependencyShape(component: Type<unknown>, shape: 'array' | 'none'): () => void {
  const definition = Reflect.get(component, 'ɵcmp') as Record<string, unknown>;
  const compiled = definition['dependencies'];
  const resolved: unknown = typeof compiled === 'function' ? (compiled as () => unknown)() : compiled;

  definition['dependencies'] = shape === 'array' ? resolved : null;

  return () => {
    definition['dependencies'] = compiled;
  };
}

describe('the shapes a compiled `dependencies` comes in', () => {
  it('keeps the template when the compiler emitted the imports as an array', () => {
    const restore = forceDependencyShape(HostComponent, 'array');

    try {
      const { fixture } = renderShallow(HostComponent, { keepTemplate: true });

      expect(fixture.nativeElement.textContent).toContain('real-0');
      expect(childInstances).toBe(0);
    } finally {
      restore();
    }
  });

  it('keeps a pipe of the template resolvable when the imports are an array', () => {
    const restore = forceDependencyShape(WithPipeComponent, 'array');

    try {
      const { fixture } = renderShallow(WithPipeComponent, { keepTemplate: true });

      expect(fixture.nativeElement.textContent).toBe('hello!');
    } finally {
      restore();
    }
  });

  it('keeps the template when the component imports nothing and carries no dependencies at all', () => {
    const restore = forceDependencyShape(BareComponent, 'none');

    try {
      const { fixture } = renderShallow(BareComponent, { keepTemplate: true });

      expect(fixture.nativeElement.textContent).toBe('bare');
    } finally {
      restore();
    }
  });

  it('still names the children that were asked for when the imports are an array', () => {
    const restore = forceDependencyShape(HostComponent, 'array');

    try {
      renderShallow(HostComponent, { keepTemplate: true, keepChildren: [ChildComponent] });

      expect(childInstances).toBe(1);
    } finally {
      restore();
    }
  });
});

@Component({
  selector: 'app-with-form',
  imports: [ReactiveFormsModule],
  template: '<input [formControl]="title" />',
})
class WithFormComponent {
  readonly title = new FormControl('draft');
}

/** What ngtsc flattens `ReactiveFormsModule` into: its exports, through the modules it re-exports. */
function reactiveFormsExports(module: unknown = ReactiveFormsModule, into: Set<unknown> = new Set()): Set<unknown> {
  const definition = Reflect.get(Object(module), 'ɵmod') as { exports: unknown } | undefined;
  const exported = typeof definition?.exports === 'function' ? (definition.exports as () => unknown[])() : definition?.exports;

  (Array.isArray(exported) ? exported : []).forEach((entry: unknown) => {
    into.add(entry);
    reactiveFormsExports(entry, into);
  });

  return into;
}

describe('a template dependency an NgModule declares', () => {
  /**
   * What ngtsc leaves behind, written onto a JIT definition.
   *
   * AOT resolves an imported NgModule at compile time and flattens its exported declarations into
   * `dependencies`; JIT keeps the module itself and resolves the scope at run time. So the list a
   * real AOT build hands `keptScope` — a `standalone: false` pipe, with no module beside it — is
   * reachable in this suite only by writing it.
   */
  function forceFlattenedScope(component: Type<unknown>, flattened: Type<unknown>[]): () => void {
    const definition = Reflect.get(component, 'ɵcmp') as Record<string, unknown>;
    const compiled = definition['dependencies'];

    definition['dependencies'] = flattened;

    return () => {
      definition['dependencies'] = compiled;
    };
  }

  it('refuses a kept template whose scope Angular would not take, and names the declaration', () => {
    const restore = forceFlattenedScope(WithModulePipeComponent, [WhisperPipe]);

    try {
      expect(() => renderShallow(WithModulePipeComponent, { keepTemplate: true })).toThrow(/WhisperPipe/);
      // The three things the message has to carry, because Angular's own names none of them: whose
      // call this was, that the declaration is not the thing to change, and what to do instead.
      expect(() => renderShallow(WithModulePipeComponent, { keepTemplate: true })).toThrow(/renderShallow\(WithModulePipeComponent/);
      expect(() => renderShallow(WithModulePipeComponent, { keepTemplate: true })).toThrow(
        /^\[vitest-auto-spy\] renderShallow\(WithModulePipeComponent, \{ keepTemplate: true \}\): WhisperPipe is declared by an NgModule, not standalone[^\n]*\nAn AOT build flattened that module away, so name it and it is put back whole: keepModules: \[<the NgModule that declares WhisperPipe>\]\.\nDocs: /,
      );
    } finally {
      restore();
    }
  });

  it('names the module when the spec imports the one that declares the refused pipe', () => {
    const restore = forceFlattenedScope(WithModulePipeComponent, [WhisperPipe]);

    try {
      expect(() => renderShallow(WithModulePipeComponent, { keepTemplate: true, imports: [UnrelatedModule, WhisperModule] })).toThrow(
        /WhisperPipe is declared by WhisperModule, not standalone[\s\S]*keepModules: \[WhisperModule\]\./,
      );
    } finally {
      restore();
    }
  });

  it('puts a module named in keepModules back in place of the declarations it exports', () => {
    const restore = forceFlattenedScope(WithModulePipeComponent, [WhisperPipe]);

    try {
      const { fixture } = renderShallow(WithModulePipeComponent, { keepTemplate: true, keepModules: [WhisperModule] });

      expect(fixture.nativeElement.textContent).toBe('hello');
    } finally {
      restore();
    }
  });

  const withExports = (exports: unknown, check: () => void): void => {
    const restore = forceFlattenedScope(WithModulePipeComponent, [WhisperPipe]);
    const definition = Reflect.get(WhisperModule, 'ɵmod') as Record<string, unknown>;
    const compiled = definition['exports'];

    definition['exports'] = exports;

    try {
      check();
    } finally {
      definition['exports'] = compiled;
      restore();
    }
  };

  it('reads the exports of a module the compiler stored as a factory', () => {
    withExports(
      () => [WhisperPipe],
      () => {
        const { fixture } = renderShallow(WithModulePipeComponent, { keepTemplate: true, keepModules: [WhisperModule] });

        expect(fixture.nativeElement.textContent).toBe('hello');
      },
    );
  });

  it('puts back only what a named module exports', () => {
    withExports(undefined, () => {
      expect(() => renderShallow(WithModulePipeComponent, { keepTemplate: true, keepModules: [WhisperModule] })).toThrow(/WhisperPipe/);
    });
  });

  it('keeps a reactive form bound when AOT flattened ReactiveFormsModule and the module is named', () => {
    const flattened = [...reactiveFormsExports()].filter((entry): entry is Type<unknown> => !Reflect.has(Object(entry), 'ɵmod'));
    const restore = forceFlattenedScope(WithFormComponent, flattened);

    try {
      expect(() => renderShallow(WithFormComponent, { keepTemplate: true })).toThrow(/DefaultValueAccessor/);

      const { fixture } = renderShallow(WithFormComponent, { keepTemplate: true, keepModules: [ReactiveFormsModule, FormsModule] });
      const field = fixture.nativeElement.querySelector('input') as HTMLInputElement;

      expect(field.value).toBe('draft');
    } finally {
      restore();
    }
  });

  it('says nothing when the module itself is what the list carries', () => {
    const restore = forceFlattenedScope(WithModulePipeComponent, [WhisperModule]);

    try {
      // An NgModule belongs in `imports` whatever it declares, so the JIT shape is not refused.
      const { fixture } = renderShallow(WithModulePipeComponent, { keepTemplate: true });

      expect(fixture.nativeElement.textContent).toBe('hello');
    } finally {
      restore();
    }
  });

  it('leaves a blanked template alone — nothing is being rebuilt there', () => {
    const restore = forceFlattenedScope(WithModulePipeComponent, [WhisperPipe]);

    try {
      const { component } = renderShallow(WithModulePipeComponent);

      expect(component.label).toBe('HELLO');
    } finally {
      restore();
    }
  });
});

describe('the schema it configures', () => {
  it('does not trip deadSchemas on a standalone component', () => {
    // The pair this guards: `enableAngularDiagnostics({ deadSchemas })` fails a module that carries a
    // schema next to a standalone component, and it is right to — so a `NO_ERRORS_SCHEMA` added here
    // unconditionally made two features of this package cancel each other out.
    enableAngularDiagnostics({ ngModuleScopes: false, pendingRequests: false, unspiedProviders: false });

    try {
      expect(() => renderShallow(HostComponent)).not.toThrow();
    } finally {
      disableAngularDiagnostics();
    }
  });
});

describe('keepTemplate on a module-declared component', () => {
  it('issues no override when there is nothing to change, so the compiled component stays as built', () => {
    TestBed.configureTestingModule({});
    const override = vi.spyOn(TestBed, 'overrideComponent');

    try {
      const { fixture } = renderShallow(LegacyComponent, { keepTemplate: true });

      expect(override).not.toHaveBeenCalled();
      expect(fixture.componentInstance).toBeInstanceOf(LegacyComponent);
    } finally {
      override.mockRestore();
    }
  });
});
