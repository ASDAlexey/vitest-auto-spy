import { Component, ElementRef, computed, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { mockElementRefProp } from '../angular-doubles';
import { restoreMockedProps } from './prop-mock';
import { registerSignalMatchers } from './signal-matchers';

beforeAll(() => registerSignalMatchers());

@Component({ template: '' })
class OptionalQuery {
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
}

@Component({ template: '' })
class RequiredQuery {
  readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
}

@Component({ template: '<button #trigger></button>{{ label() }}' })
class LiveQuery {
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly label = computed(() => this.trigger()?.nativeElement.tagName);
}

afterEach(() => {
  restoreMockedProps();
  vi.unstubAllGlobals();
});

describe('mockElementRefProp', () => {
  it.each([OptionalQuery, RequiredQuery])('installs a stub on $name and restores the original query', (componentType) => {
    const fixture = TestBed.createComponent(componentType);
    const component = fixture.componentInstance;
    const original = component.trigger;
    const trigger = mockElementRefProp(component, 'trigger');

    component.trigger()?.nativeElement.focus();

    expect(trigger.focus).toHaveBeenCalledExactlyOnceWith();
    expect(component.trigger()).toBe(trigger.ref);
    expect(trigger.ref.nativeElement).toBe(trigger.element);
    expect(trigger.query()).toBe(trigger.ref);

    fixture.detectChanges();
    expect(component.trigger()).toBe(trigger.ref);

    restoreMockedProps();
    expect(component.trigger).toBe(original);
  });

  it('accepts element options and drives later optional query values', () => {
    const component = TestBed.createComponent(OptionalQuery).componentInstance;
    const trigger = mockElementRefProp(component, 'trigger', {
      elementClass: HTMLButtonElement,
      tagName: 'button',
      attributes: { id: 'trigger' },
      overrides: { disabled: true },
    });

    expect(trigger.element).toBeInstanceOf(HTMLButtonElement);
    expect(trigger.element.tagName).toBe('BUTTON');
    expect(trigger.element.disabled).toBe(true);
    expect(trigger.element.id).toBe('trigger');

    trigger.query.set(undefined);
    expect(component.trigger).toHaveSignalValue(undefined);
    trigger.query.set(trigger.ref);
    expect(component.trigger()).toBe(trigger.ref);
  });

  it('keeps an existing writable signal and its dependents reactive', () => {
    const original = signal<ElementRef<HTMLElement> | undefined>(undefined);
    const holder = { trigger: original };
    const focused = computed(() => holder.trigger()?.nativeElement);
    expect(focused).toHaveSignalValue(undefined);

    const trigger = mockElementRefProp(holder, 'trigger');

    expect(holder.trigger).toBe(original);
    expect(focused()).toBe(trigger.element);
  });

  it('rejects a live query without changing its original reference', () => {
    const fixture = TestBed.createComponent(LiveQuery);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const original = component.trigger;
    const element = component.trigger()?.nativeElement;

    expect(() => mockElementRefProp(component, 'trigger')).toThrow('already read');

    fixture.detectChanges();
    expect(component.trigger).toBe(original);
    expect(component.trigger()?.nativeElement).toBe(element);
    expect(component.label).toHaveSignalValue('BUTTON');
  });

  it('works without global HTMLElement or creating DOM nodes or a TestBed', () => {
    vi.stubGlobal('HTMLElement', undefined);
    const createElement = vi.spyOn(document, 'createElement');
    const holder = { trigger: signal<ElementRef<HTMLElement> | undefined>(undefined) };
    const trigger = mockElementRefProp(holder, 'trigger');

    holder.trigger()?.nativeElement.focus();

    expect(trigger.focus).toHaveBeenCalledExactlyOnceWith();
    expect(createElement).not.toHaveBeenCalled();
    createElement.mockRestore();
  });
});
