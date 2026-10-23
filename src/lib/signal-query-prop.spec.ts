import { Component, ElementRef, computed, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import '../angular';
import { createElementStub } from './element-stub';
import { restoreMockedProps } from './prop-mock';
import { registerSignalMatchers } from './signal-matchers';
import { mockSignalProp } from './signal-prop';

beforeAll(() => registerSignalMatchers());
afterEach(() => restoreMockedProps());

@Component({ selector: 'vas-optional-query', template: '' })
class OptionalQueryComponent {
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  focusTrigger(): void {
    this.trigger()?.nativeElement.focus();
  }
}

@Component({ selector: 'vas-required-query', template: '' })
class RequiredQueryComponent {
  readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  focusTrigger(): void {
    this.trigger().nativeElement.focus();
  }
}

@Component({ selector: 'vas-live-query', template: '<button #trigger></button>{{ label() }}' })
class LiveQueryComponent {
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly label = computed(() => this.trigger()?.nativeElement.tagName);
}

describe('mockSignalProp with Angular view queries', () => {
  it.each([OptionalQueryComponent, RequiredQueryComponent])(
    'drives an unresolved $name query and restores its signal identity',
    (componentType) => {
      const fixture = TestBed.createComponent(componentType);
      const component = fixture.componentInstance;
      const original = component.trigger;
      const first = createElementStub<HTMLButtonElement>();
      const second = createElementStub<HTMLButtonElement>();
      const trigger = mockSignalProp(component, 'trigger', new ElementRef(first.element));

      component.focusTrigger();

      expect(first.focus).toHaveBeenCalledExactlyOnceWith();

      trigger.set(new ElementRef(second.element));
      fixture.detectChanges();
      component.focusTrigger();

      expect(first.focus).toHaveBeenCalledTimes(1);
      expect(second.focus).toHaveBeenCalledExactlyOnceWith();
      expect(component.trigger()).toBe(trigger());

      restoreMockedProps();

      expect(component.trigger).toBe(original);
    },
  );

  it('patches an optional query after rendering when it has no live consumer', () => {
    const fixture = TestBed.createComponent(OptionalQueryComponent);
    fixture.detectChanges();
    const stub = createElementStub<HTMLButtonElement>();
    const replacement = new ElementRef(stub.element);

    mockSignalProp(fixture.componentInstance, 'trigger', replacement);
    fixture.detectChanges();
    fixture.componentInstance.focusTrigger();

    expect(fixture.componentInstance.trigger()).toBe(replacement);
    expect(stub.focus).toHaveBeenCalledExactlyOnceWith();
  });

  it('rejects a query consumed by a live computed without replacing it or breaking its dependencies', () => {
    const fixture = TestBed.createComponent(LiveQueryComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const original = component.trigger;
    const element = component.trigger()?.nativeElement;
    const stub = createElementStub<HTMLButtonElement>();

    expect(() => mockSignalProp(component, 'trigger', new ElementRef(stub.element))).toThrow('already read');

    fixture.detectChanges();

    expect(component.trigger).toBe(original);
    expect(component.trigger()?.nativeElement).toBe(element);
    expect(component.label).toHaveSignalValue('BUTTON');
    expect(fixture.nativeElement.textContent).toBe('BUTTON');
    expect(stub.focus).not.toHaveBeenCalled();
  });
});
