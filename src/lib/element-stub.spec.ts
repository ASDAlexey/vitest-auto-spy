/**
 * The stub's claim is state behind the spies: what one member wrote, another reads back. Every test
 * asserts both the call and the state it left, and the directive at the bottom goes through a real
 * `ElementRef` in a `TestBed`, which is the use it exists for.
 */
import { Directive, ElementRef, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import '../index';
import { createElementStub } from './element-stub';

@Directive({ selector: '[vasHighlight]', standalone: true })
class HighlightDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  enter(): void {
    this.host.nativeElement.classList.add('highlighted');
    this.host.nativeElement.style.setProperty('outline', '1px solid');
  }
}

describe('createElementStub', () => {
  it('answers the element basics from the options', () => {
    const stub = createElementStub({ tagName: 'SECTION', attributes: { id: 'hero', role: 'banner' } });

    expect(stub.element.tagName).toBe('SECTION');
    expect(stub.element.nodeName).toBe('SECTION');
    expect(stub.element.localName).toBe('section');
    expect(stub.element.nodeType).toBe(1);
    expect(stub.element.id).toBe('hero');
    expect(createElementStub().element.tagName).toBe('DIV');
    expect(createElementStub().element.id).toBe('');
  });

  it('keeps classes behind the classList spies', () => {
    const stub = createElementStub({ classes: ['card'] });
    const { classList } = stub.element;

    classList.add('active', 'wide');
    classList.remove('wide');

    expect(stub.classList.add).toHaveBeenCalledWith('active', 'wide');
    expect(classList.contains('active')).toBe(true);
    expect(classList.toggle('active')).toBe(false);
    expect(classList.toggle('open')).toBe(true);
    expect(classList.toggle('open', true)).toBe(true);
    expect(classList.replace('card', 'tile')).toBe(true);
    expect(classList.replace('missing', 'x')).toBe(false);
    expect(stub.classes()).toEqual(['tile', 'open']);
    expect(classList).toHaveLength(2);
    expect(classList.value).toBe('tile open');
    expect([...classList]).toEqual(['tile', 'open']);
    expect(stub.element.className).toBe('tile open');

    stub.element.className = ' a  b ';

    expect(stub.classes()).toEqual(['a', 'b']);
    expect(stub.classList.toggle).toHaveBeenCalledTimes(3);
  });

  it('keeps inline styles from setProperty and from plain writes alike', () => {
    const stub = createElementStub({ style: { 'background-color': 'red', '--gap': '4px' } });
    const { style } = stub.element;

    style.width = '10px';
    style.setProperty('margin-top', '2px');

    expect(style.getPropertyValue('background-color')).toBe('red');
    expect(style.backgroundColor).toBe('red');
    expect(style.marginTop).toBe('2px');
    expect(style.height).toBe('');
    expect(style.getPropertyValue('color')).toBe('');
    expect(style.getPropertyValue('--gap')).toBe('4px');
    expect(stub.styles()).toEqual({ 'background-color': 'red', '--gap': '4px', width: '10px', 'margin-top': '2px' });
    expect(style.removeProperty('width')).toBe('10px');
    expect(style.removeProperty('width')).toBe('');

    style.setProperty('margin-top', null);
    style.setProperty('--gap', '');

    expect(stub.styles()).toEqual({ 'background-color': 'red' });
    expect(stub.style.setProperty).toHaveBeenCalledWith('margin-top', '2px');
    expect(stub.style.getPropertyValue).toHaveBeenCalledTimes(3);
    expect(stub.style.removeProperty).toHaveBeenCalledTimes(2);
  });

  it('keeps attributes behind the attribute spies', () => {
    const stub = createElementStub();
    const { element } = stub;

    element.setAttribute('aria-expanded', 'true');
    element.id = 'menu';

    expect(element.getAttribute('aria-expanded')).toBe('true');
    expect(element.getAttribute('missing')).toBeNull();
    expect(element.hasAttribute('id')).toBe(true);
    expect(element.toggleAttribute('hidden')).toBe(true);
    expect(element.getAttribute('hidden')).toBe('');
    expect(element.toggleAttribute('hidden')).toBe(false);
    expect(element.toggleAttribute('aria-expanded', true)).toBe(true);

    element.removeAttribute('id');

    expect(stub.attributes()).toEqual({ 'aria-expanded': 'true' });
    expect(element.getAttributeNames()).toEqual(['aria-expanded']);
    expect(stub.setAttribute).toHaveBeenCalledWith('aria-expanded', 'true');
    expect(stub.getAttribute).toHaveBeenCalledTimes(3);
    expect(stub.hasAttribute).toHaveBeenCalledWith('id');
    expect(stub.removeAttribute).toHaveBeenCalledWith('id');
    expect(stub.toggleAttribute).toHaveBeenCalledTimes(3);
  });

  it('delivers events to the listeners, once and abort included', () => {
    const stub = createElementStub();
    const { element } = stub;
    const onClick = vi.fn();
    const onceOnly = vi.fn();
    const handler = { handleEvent: vi.fn() };
    const controller = new AbortController();
    const aborted = vi.fn();

    element.addEventListener('click', onClick);
    element.addEventListener('click', onClick);
    element.addEventListener('click', onceOnly, { once: true });
    element.addEventListener('click', handler, true);
    element.addEventListener('click', aborted, { signal: controller.signal });
    Reflect.apply(element.addEventListener, element, ['click', null]);
    controller.abort();

    expect(stub.listenerCount('click')).toBe(3);
    expect(stub.emit('click')).toBe(true);
    expect(stub.dispatchEvent).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.contexts[0]).toBe(element);
    expect(handler.handleEvent).toHaveBeenCalledTimes(1);
    expect(stub.listenerCount('click')).toBe(2);

    element.click();

    expect(onceOnly).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(aborted).not.toHaveBeenCalled();

    const cancelled = new Event('submit', { cancelable: true });

    element.addEventListener('submit', (event) => event.preventDefault());

    expect(element.dispatchEvent(cancelled)).toBe(false);
    expect(stub.dispatchEvent).toHaveBeenCalledWith(cancelled);

    element.removeEventListener('click', onClick);
    element.removeEventListener('keydown', onClick);

    expect(stub.listenerCount('click')).toBe(1);
    expect(stub.listenerCount('keydown')).toBe(0);
    expect(stub.listenerCount('scroll')).toBe(0);
    expect(stub.emit(new Event('focus'))).toBe(true);
    expect(stub.removeEventListener).toHaveBeenCalledTimes(2);
    expect(stub.addEventListener).toHaveBeenCalledTimes(7);
    expect(stub.click).toHaveBeenCalledTimes(1);
  });

  it('records focus and blur, and answers contains and isEqualNode for itself', () => {
    const stub = createElementStub();

    stub.element.focus();
    stub.element.blur();

    expect(stub.focus).toHaveBeenCalledTimes(1);
    expect(stub.blur).toHaveBeenCalledTimes(1);
    expect(stub.element.contains(stub.element)).toBe(true);
    expect(stub.element.contains(null)).toBe(false);
    expect(stub.element.isEqualNode(stub.element)).toBe(true);
  });

  it('answers the overrides, and throws by name for an HTMLElement member it lacks', () => {
    const stub = createElementStub<HTMLInputElement>({ tagName: 'input', overrides: { offsetWidth: 120, value: 'hi' } });

    expect(stub.element.offsetWidth).toBe(120);
    expect(stub.element.value).toBe('hi');
    expect(() => stub.element.getBoundingClientRect()).toThrow(
      /read <input>\.getBoundingClientRect, which the stub does not implement.+overrides: \{ getBoundingClientRect: … \}/s,
    );
    // eslint-disable-next-line vitest-auto-spy/no-reflect-member-access -- a name HTMLElement does not declare is the input under test
    expect(Reflect.get(stub.element, 'notADomMember')).toBeUndefined();
    expect(Reflect.get(stub.element, Symbol.iterator)).toBeUndefined();
  });

  it('builds without a DOM, with the guard off', () => {
    vi.stubGlobal('HTMLElement', undefined);

    try {
      const stub = createElementStub();

      expect(stub.element.getBoundingClientRect).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reaches a directive through ElementRef', () => {
    const host = createElementStub({ classes: ['card'] });

    TestBed.configureTestingModule({ providers: [{ provide: ElementRef, useValue: new ElementRef(host.element) }] });

    const directive = TestBed.runInInjectionContext(() => new HighlightDirective());

    directive.enter();

    expect(host.classList.add).toHaveBeenCalledWith('highlighted');
    expect(host.classes()).toEqual(['card', 'highlighted']);
    expect(host.styles()).toEqual({ outline: '1px solid' });
  });
});
