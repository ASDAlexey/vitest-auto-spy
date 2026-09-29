/**
 * Every test puts back exactly what it found — the fills land on `globalThis` and `Element.prototype`,
 * which outlive the test — and asserts both halves of the rule: what was missing is filled, and what
 * the environment implements is left alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConsoleSpies } from './console-spy';
import { fillMissingDomApis } from './fill-dom-apis';
import { registerMockAdapter } from './mock-adapter';
import { mockValueProp, restoreMockedProps } from './prop-mock';
import { vitestMockAdapter } from './vitest-adapter';

registerMockAdapter(vitestMockAdapter);

const { consoleErrorSpy } = useConsoleSpies();

const GLOBAL_NAMES = ['PointerEvent', 'ResizeObserver', 'scroll', 'scrollTo', 'scrollBy', 'getComputedStyle'] as const;
const ELEMENT_NAMES = ['scrollTo', 'scrollBy', 'scrollIntoView'] as const;

let saved: { owner: object; name: string; descriptor: PropertyDescriptor | undefined }[] = [];
let savedDoctype: DocumentType | null = null;

function setDoctype(doctype: DocumentType | null): void {
  if (document.doctype) {
    document.removeChild(document.doctype);
  }

  if (doctype) {
    document.insertBefore(doctype, document.firstChild);
  }
}

beforeEach(() => {
  savedDoctype = document.doctype;
  saved = [
    ...GLOBAL_NAMES.map((name) => ({ owner: globalThis, name, descriptor: Object.getOwnPropertyDescriptor(globalThis, name) })),
    ...ELEMENT_NAMES.map((name) => ({
      owner: Element.prototype,
      name,
      descriptor: Object.getOwnPropertyDescriptor(Element.prototype, name),
    })),
  ];
});

afterEach(() => {
  vi.unstubAllGlobals();

  for (const { owner, name, descriptor } of saved) {
    Reflect.deleteProperty(owner, name);

    if (descriptor !== undefined) {
      // eslint-disable-next-line vitest-auto-spy/no-object-define-property -- puts back the descriptor fillMissingDomApis() replaced, which no prop-mock journal saw
      Object.defineProperty(owner, name, descriptor);
    }
  }

  restoreMockedProps();
  setDoctype(savedDoctype);
});

function remove(owner: object, name: string): void {
  Reflect.deleteProperty(owner, name);
}

const onJsdom = navigator.userAgent.includes('jsdom');

describe('fillMissingDomApis', () => {
  it('fills every member the environment is missing, and nothing on a second call', () => {
    remove(globalThis, 'PointerEvent');
    remove(globalThis, 'ResizeObserver');

    for (const name of ELEMENT_NAMES) {
      remove(Element.prototype, name);
    }

    for (const name of ['scroll', 'scrollTo', 'scrollBy']) {
      vi.stubGlobal(name, undefined);
    }

    setDoctype(document.implementation.createDocumentType('html', '', ''));

    const filled = fillMissingDomApis();

    expect(filled).toEqual([
      'PointerEvent',
      'ResizeObserver',
      'Element.prototype.scrollTo',
      'Element.prototype.scrollBy',
      'Element.prototype.scrollIntoView',
      'window.scroll',
      'window.scrollTo',
      'window.scrollBy',
    ]);
    expect(fillMissingDomApis()).toEqual([]);
  });

  it.runIf(onJsdom)('treats the window scroll methods jsdom only logs "Not implemented" from as missing', () => {
    expect(fillMissingDomApis()).toEqual(expect.arrayContaining(['window.scroll', 'window.scrollTo', 'window.scrollBy']));
  });

  it.skipIf(onJsdom)('keeps the window scroll methods an environment other than jsdom implements', () => {
    expect(fillMissingDomApis().filter((name) => name.startsWith('window.'))).toEqual([]);
  });

  it('builds a PointerEvent over the realm MouseEvent, with the pointer defaults', () => {
    remove(globalThis, 'PointerEvent');
    fillMissingDomApis();

    const event = new PointerEvent('pointerdown', { clientX: 4, pointerId: 7, pointerType: 'pen', isPrimary: true, pressure: 0.5 });
    const plain = new PointerEvent('pointerup');

    expect(event).toBeInstanceOf(MouseEvent);
    expect(PointerEvent.name).toBe('PointerEvent');
    expect(event.clientX).toBe(4);
    expect(event).toMatchObject({ pointerId: 7, pointerType: 'pen', isPrimary: true, pressure: 0.5 });
    expect(plain).toMatchObject({
      pointerId: 0,
      width: 1,
      height: 1,
      pressure: 0,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      altitudeAngle: Math.PI / 2,
      azimuthAngle: 0,
      pointerType: '',
      isPrimary: false,
      persistentDeviceId: 0,
    });
    expect(
      new PointerEvent('x', {
        width: 2,
        height: 3,
        tangentialPressure: 1,
        tiltX: 1,
        tiltY: 2,
        twist: 3,
        altitudeAngle: 1,
        azimuthAngle: 2,
      }),
    ).toMatchObject({ width: 2, height: 3, tangentialPressure: 1, tiltX: 1, tiltY: 2, twist: 3, altitudeAngle: 1, azimuthAngle: 2 });
    expect(event.getCoalescedEvents()).toEqual([]);
    expect(event.getPredictedEvents()).toEqual([]);
  });

  it('leaves PointerEvent out when there is no MouseEvent to build it on', () => {
    remove(globalThis, 'PointerEvent');
    vi.stubGlobal('MouseEvent', undefined);

    expect(fillMissingDomApis()).not.toContain('PointerEvent');
  });

  it('fills a ResizeObserver whose methods do nothing', () => {
    remove(globalThis, 'ResizeObserver');
    fillMissingDomApis();

    const observer = new ResizeObserver(() => undefined);

    expect(ResizeObserver.name).toBe('ResizeObserver');
    expect(() => {
      observer.observe(document.body);
      observer.unobserve(document.body);
      observer.disconnect();
    }).not.toThrow();
  });

  it('fills the window methods jsdom hands out bound, as Vitest does under threads and forks', () => {
    vi.stubGlobal('scrollTo', function (): void {}.bind(globalThis));
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/27.0.0' });

    expect(fillMissingDomApis()).toContain('window.scrollTo');
  });

  it('fills a window method the environment does not define at all', () => {
    vi.stubGlobal('scrollBy', undefined);

    expect(fillMissingDomApis()).toContain('window.scrollBy');
  });

  it('keeps a bound window method outside jsdom, and a named one anywhere', () => {
    vi.stubGlobal('scrollBy', function scrollBy(): void {}.bind(globalThis));
    vi.stubGlobal('scrollTo', function (): void {}.bind(globalThis));
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 happy-dom' });

    const filled = fillMissingDomApis();

    expect(filled).not.toContain('window.scrollTo');
    expect(filled).not.toContain('window.scrollBy');
  });

  it('makes scrolling a silent no-op, on elements and on window', () => {
    fillMissingDomApis();

    const element = document.createElement('div');

    element.scrollTo(0, 10);
    element.scrollBy(0, 10);
    element.scrollIntoView();
    window.scroll(0, 1);
    window.scrollTo(0, 1);
    window.scrollBy(0, 1);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('keeps a member the environment implements', () => {
    const own = (): void => undefined;

    mockValueProp(Element.prototype, 'scrollIntoView', own);
    vi.stubGlobal('scrollTo', own);

    const filled = fillMissingDomApis();

    expect(filled).not.toContain('Element.prototype.scrollIntoView');
    expect(filled).not.toContain('window.scrollTo');
    expect(Element.prototype.scrollIntoView).toBe(own);
  });

  it('fills a configurable member, so a spec can still replace it', () => {
    fillMissingDomApis();

    expect(Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')).toMatchObject({ configurable: true, writable: true });
  });

  it('keeps the environment getComputedStyle unless the cheap one is asked for', () => {
    const real = window.getComputedStyle;

    expect(fillMissingDomApis()).not.toContain('getComputedStyle');
    expect(window.getComputedStyle).toBe(real);
    expect(fillMissingDomApis({ cheapComputedStyle: true })).toContain('getComputedStyle');
    expect(fillMissingDomApis({ cheapComputedStyle: true })).toEqual([]);
  });

  it('answers the inline style from the cheap getComputedStyle, pseudo-element or not', () => {
    fillMissingDomApis({ cheapComputedStyle: true });

    const element = document.createElement('div');

    element.style.width = '10px';

    expect(getComputedStyle(element).getPropertyValue('width')).toBe('10px');
    expect(getComputedStyle(element, '::before').width).toBe('10px');
    expect(getComputedStyle(document.createElementNS('http://www.w3.org/2000/svg', 'svg')).cssText).toBe('');
    // eslint-disable-next-line vitest-auto-spy/prefer-create-mock -- an object with no style at all is the input under test
    expect(getComputedStyle({} as Element).cssText).toBe('');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('fills getComputedStyle when the environment has none', () => {
    vi.stubGlobal('getComputedStyle', undefined);

    expect(fillMissingDomApis()).toContain('getComputedStyle');
  });

  it('inserts a doctype when the document has none, and only then', () => {
    setDoctype(document.implementation.createDocumentType('html', '', ''));

    expect(fillMissingDomApis()).not.toContain('document.doctype');

    setDoctype(null);

    expect(fillMissingDomApis()).toContain('document.doctype');
    expect(document.doctype?.name).toBe('html');
    expect(document.firstChild).toBe(document.doctype);
  });

  it('skips the element methods when the realm has no Element', () => {
    vi.stubGlobal('Element', undefined);

    expect(fillMissingDomApis().some((name) => name.startsWith('Element.'))).toBe(false);
  });
});
