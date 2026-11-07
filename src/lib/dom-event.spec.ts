import { describe, expect, it, vi } from 'vitest';

import '../dom-stubs';
import { createDomEvent, createInputEvent } from './dom-event';
import { createElementStub } from './element-stub';

describe('createDomEvent', () => {
  it('uses native cancellation and configurable event flags', () => {
    const event = createDomEvent('pointerdown');

    expect(event.type).toBe('pointerdown');
    expect(event.target).toBeNull();
    expect(event.currentTarget).toBeNull();
    expect(event.bubbles).toBe(true);
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);

    const passive = createDomEvent('input', { bubbles: false, cancelable: false, composed: true });

    passive.preventDefault();
    expect(passive.bubbles).toBe(false);
    expect(passive.composed).toBe(true);
    expect(passive.defaultPrevented).toBe(false);
  });

  it('sets explicit targets including null without patching a shared object', () => {
    const target = createElementStub().element;
    const host = createElementStub().element;
    const event = createDomEvent('pointerdown', { target, currentTarget: host });

    expect(event.target).toBe(target);
    expect(event.currentTarget).toBe(host);
    expect(createDomEvent('input', { target: null, currentTarget: null }).target).toBeNull();
    expect(createDomEvent('input').currentTarget).toBeNull();
  });

  it('lets native dispatch supply targets when they are omitted', () => {
    const target = document.createElement('button');
    const onEvent = vi.fn((event: Event) => {
      expect(event.target).toBe(target);
      expect(event.currentTarget).toBe(target);
      event.preventDefault();
    });

    target.addEventListener('click', onEvent);
    expect(target.dispatchEvent(createDomEvent('click'))).toBe(false);
    expect(onEvent).toHaveBeenCalledOnce();
  });
});

describe('createDomEvent with spy: true', () => {
  it('records the cancelling calls and still cancels the event', () => {
    const event = createDomEvent('keydown', { spy: true });

    event.preventDefault();
    event.stopPropagation();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('still stops the event from reaching the parent on a real dispatch', () => {
    const parent = document.createElement('div');
    const child = parent.appendChild(document.createElement('button'));
    const event = createDomEvent('click', { spy: true });
    const onParent = vi.fn();

    child.addEventListener('click', () => {
      event.stopPropagation();
    });
    parent.addEventListener('click', onParent);
    child.dispatchEvent(event);

    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onParent).not.toHaveBeenCalled();
  });

  it('stops other listeners through stopImmediatePropagation on a real dispatch', () => {
    const target = document.createElement('button');
    const event = createDomEvent('click', { spy: true });
    const later = vi.fn();

    target.addEventListener('click', () => {
      event.stopImmediatePropagation();
    });
    target.addEventListener('click', later);
    target.dispatchEvent(event);

    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(later).not.toHaveBeenCalled();
  });

  it('keeps targets and leaves an event without the option unspied', () => {
    const target = createElementStub().element;
    const spied = createDomEvent('blur', { spy: true, target, cancelable: false });

    spied.preventDefault();
    expect(spied.target).toBe(target);
    expect(spied.defaultPrevented).toBe(false);
    expect(Object.hasOwn(createDomEvent('blur', { spy: false }), 'preventDefault')).toBe(false);
  });
});

describe('createInputEvent', () => {
  it('replaces the local input-event factory with a typed input target', () => {
    const event = createInputEvent('12a');

    expect(event).toBeInstanceOf(Event);
    expect(event.type).toBe('input');
    expect(event.target).toBeInstanceOf(HTMLInputElement);
    expect(event.target.value).toBe('12a');
    expect(event.target.tagName).toBe('INPUT');
    expect(() => event.target.isConnected).toThrow('isConnected');
  });

  it('accepts input overrides and event flags while keeping the supplied value', () => {
    const focus = vi.fn();
    const event = createInputEvent('', {
      cancelable: false,
      element: { attributes: { id: 'hours' }, overrides: { disabled: true, value: 'ignored', focus } },
    });

    expect(event.target.value).toBe('');
    event.target.focus();
    event.target.value = '15';
    expect(focus).toHaveBeenCalledOnce();
    expect(event.target.value).toBe('15');
    expect(event.target.disabled).toBe(true);
    expect(event.target.id).toBe('hours');
    event.preventDefault();
    expect(event.defaultPrevented).toBe(false);
  });

  it('works without browser element constructors', () => {
    vi.stubGlobal('HTMLInputElement', undefined);
    vi.stubGlobal('HTMLElement', undefined);

    try {
      expect(createInputEvent('15').target.value).toBe('15');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
