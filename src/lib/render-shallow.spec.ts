/**
 * `renderShallow` must stay a thin wrapper over `TestBed`: same fixture, same lifecycle, minus the
 * child subtree. These specs pin down what it strips (children, template, styles), what it keeps
 * (DI, inputs, `ngOnInit`, the real `ComponentFixture`) and the escape hatches for the cases where
 * a spec genuinely needs the template back.
 */
import { Component, Injectable, OnInit, inject, input, makeEnvironmentProviders, signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { injectSpy, provideAutoSpy } from '../angular';
import { renderShallow } from './render-shallow';

@Injectable({ providedIn: 'root' })
class LabelService {
  resolve(id: number): string {
    return `real-${id}`;
  }
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

  it('skips the first change detection on request, leaving ngOnInit unrun', () => {
    const { component, fixture } = renderShallow(HostComponent, { detectChanges: false });

    expect(component.initialized).toBe(false);

    fixture.detectChanges();

    expect(component.initialized).toBe(true);
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
