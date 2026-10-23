import { describe, expect, it, vi } from 'vitest';

import { createDropEvent, createPasteEvent } from '../dom-stubs';

function transfer(event: ClipboardEvent | DragEvent): DataTransfer | null {
  return 'clipboardData' in event ? event.clipboardData : event.dataTransfer;
}

describe.each([
  {
    name: 'createPasteEvent',
    type: 'paste',
    create: createPasteEvent,
  },
  {
    name: 'createDropEvent',
    type: 'drop',
    create: createDropEvent,
  },
])('$name', ({ type, create }) => {
  it('carries plain text, including the legacy MIME alias and case-insensitive formats', () => {
    const event = create('15\n');
    const data = transfer(event);

    expect(event).toBeInstanceOf(Event);
    expect(event.type).toBe(type);
    expect(data?.getData('text/plain')).toBe('15\n');
    expect(data?.getData('text')).toBe('15\n');
    expect(data?.getData('TEXT/PLAIN')).toBe('15\n');
    expect(data?.getData('Text')).toBe('15\n');
    expect(data?.getData('text/html')).toBe('');
    expect(data?.types).toEqual(['text/plain']);
    expect(Object.isFrozen(data?.types)).toBe(true);
  });

  it('distinguishes empty text from absent transfer data', () => {
    expect(transfer(create(''))?.getData('text/plain')).toBe('');
    expect(transfer(create(''))?.types).toEqual(['text/plain']);
    expect(transfer(create(null))).toBeNull();
  });

  it('records native cancellation when a handler is called directly', () => {
    const event = create('invalid');

    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
  });

  it('bubbles from a real target and reports listener cancellation to dispatchEvent', () => {
    const parent = document.createElement('div');
    const child = document.createElement('input');
    const event = create('23');
    const listener = vi.fn((event: Event): void => {
      expect(event.target).toBe(child);
      expect(event.currentTarget).toBe(parent);
      event.preventDefault();
    });

    parent.append(child);
    parent.addEventListener(type, listener);

    expect(child.dispatchEvent(event)).toBe(false);
    expect(transfer(event)?.getData('text')).toBe('23');
    expect(listener).toHaveBeenCalledExactlyOnceWith(event);
    expect(event.defaultPrevented).toBe(true);
    expect(event.bubbles).toBe(true);
    expect(event.cancelable).toBe(true);
    expect(event.composed).toBe(false);
  });

  it('honors explicit event flags instead of forcing its defaults', () => {
    const parent = document.createElement('div');
    const child = document.createElement('input');
    const listener = vi.fn();
    const event = create('23', { bubbles: false, cancelable: false, composed: true });

    parent.append(child);
    parent.addEventListener(type, listener);
    event.preventDefault();

    expect(event.bubbles).toBe(false);
    expect(event.cancelable).toBe(false);
    expect(event.composed).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(child.dispatchEvent(event)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports unsupported transfer members by name instead of silently returning undefined', () => {
    const data = transfer(create('23'));

    expect(() => data?.files).toThrow('DataTransfer.files is not implemented');
    expect(() => data?.setData('text/plain', 'new')).toThrow('DataTransfer.setData is not implemented');
    expect(Reflect.get(Object(data), Symbol.iterator)).toBeUndefined();
    expect(Object.prototype.toString.call(data)).toBe('[object Object]');
  });

  it('does not share transfer data or cancellation state between events', () => {
    const first = create('first');
    const second = create('second');

    first.preventDefault();

    expect(second.defaultPrevented).toBe(false);
    expect(transfer(first)).not.toBe(transfer(second));
    expect(transfer(first)?.getData('text')).toBe('first');
    expect(transfer(second)?.getData('text')).toBe('second');
  });
});

it('works without ClipboardEvent, DragEvent and DataTransfer constructors', () => {
  vi.stubGlobal('ClipboardEvent', undefined);
  vi.stubGlobal('DragEvent', undefined);
  vi.stubGlobal('DataTransfer', undefined);

  try {
    expect(createPasteEvent('paste').clipboardData?.getData('text/plain')).toBe('paste');
    expect(createDropEvent('drop').dataTransfer?.getData('text/plain')).toBe('drop');
  } finally {
    vi.unstubAllGlobals();
  }
});
