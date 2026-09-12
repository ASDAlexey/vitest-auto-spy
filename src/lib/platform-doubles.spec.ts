/**
 * The claim is "everything the overrides did not name is still the real jsdom object", so every
 * test that asserts an override also asserts a neighbour that was not overridden — and reads it
 * back off `globalThis` rather than off a value written here, which is what would still pass if the
 * double had quietly stopped forwarding.
 */
import { Component, DOCUMENT, InjectionToken, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { createDocumentDouble, createWindowDouble, provideDocumentDouble, provideWindowDouble } from './platform-doubles';

interface AppWindow extends Window {
  appBuildId: string;
}

const WINDOW = new InjectionToken<AppWindow>('WINDOW', {
  factory: (): AppWindow => globalThis.window as unknown as AppWindow,
});

@Component({
  selector: 'vas-viewport',
  standalone: true,
  template: `<span>{{ label }}</span>`,
})
class ViewportComponent {
  private readonly win = inject(WINDOW);

  readonly label = `${this.win.screen.width} of ${this.win.screen.colorDepth} at ${this.win.location.href}`;
}

@Component({
  selector: 'vas-anchor',
  standalone: true,
  template: '',
})
class AnchorComponent {
  private readonly doc = inject(DOCUMENT);

  readonly state = this.doc.visibilityState;
  readonly created = this.doc.createElement('section').tagName;
}

describe('createWindowDouble', () => {
  it('answers the overridden member and leaves its neighbours to the real window', () => {
    const win = createWindowDouble({ innerWidth: 375 });

    expect(win.innerWidth).toBe(375);
    expect(win.innerHeight).toBe(globalThis.window.innerHeight);
    expect(win.location.href).toBe(globalThis.window.location.href);
  });

  it('merges a slice into a nested object instead of replacing it', () => {
    const win = createWindowDouble({ screen: { width: 1920, height: 1080 } });

    expect(win.screen.width).toBe(1920);
    expect(win.screen.height).toBe(1080);
    expect(win.screen.colorDepth).toBe(globalThis.screen.colorDepth);
  });

  it('hands out the same nested object every time, so an identity comparison holds', () => {
    const win = createWindowDouble({ screen: { width: 1920 } });

    expect(win.screen).toBe(win.screen);
  });

  it('replaces rather than merges when the override is not a plain object', () => {
    const matchMedia = vi.fn();
    const win = createWindowDouble({ matchMedia, name: 'checkout' });

    expect(win.matchMedia).toBe(matchMedia);
    expect(win.name).toBe('checkout');
  });

  it('accepts a null-prototype record as a slice', () => {
    const screen: Partial<Screen> = Object.assign(Object.create(null), { width: 800 });
    const win = createWindowDouble({ screen });

    expect(win.screen.width).toBe(800);
    expect(win.screen.colorDepth).toBe(globalThis.screen.colorDepth);
  });

  it('takes a slice over a member the environment does not have as the value itself', () => {
    const win = createWindowDouble<AppWindow & { featureFlags: Record<string, boolean> }>({ featureFlags: { checkout: true } });

    expect(win.featureFlags).toEqual({ checkout: true });
  });

  it('binds methods to the real window, and hands out the same function twice', () => {
    const win = createWindowDouble({ innerWidth: 375 });

    expect(win.getComputedStyle(globalThis.document.body).display).toBe('block');
    expect(win.addEventListener).toBe(win.addEventListener);
  });

  it('keeps a write off the real window', () => {
    const real = globalThis.window.innerWidth;
    const win = createWindowDouble({ innerWidth: 375 });

    Object.assign(win, { scrollY: 40, innerWidth: 1234 });

    expect(win.scrollY).toBe(40);
    expect(win.innerWidth).toBe(1234);
    expect(globalThis.window.scrollY).toBe(0);
    expect(globalThis.window.innerWidth).toBe(real);
  });

  it('rebuilds a slice after the whole member was written over', () => {
    const win = createWindowDouble({ screen: { width: 1920 } });

    expect(win.screen.width).toBe(1920);

    Object.assign(win, { screen: { width: 640 } });

    expect(win.screen.width).toBe(640);
    expect(win.screen.colorDepth).toBe(globalThis.screen.colorDepth);
  });

  it('drops an override on delete and falls back to the real member, off the real window', () => {
    const win = createWindowDouble({ screen: { width: 1920 }, name: 'checkout' });

    expect(Reflect.deleteProperty(win, 'name')).toBe(true);
    expect(Reflect.deleteProperty(win, 'screen')).toBe(true);

    expect(win.name).toBe(globalThis.window.name);
    expect(win.screen.width).toBe(globalThis.screen.width);
    expect(Object.hasOwn(globalThis.window, 'name')).toBe(true);
  });

  it('reports an added member to a feature check, and still forwards the real ones', () => {
    const win = createWindowDouble<AppWindow>({ appBuildId: '2026.09.12' });

    expect('appBuildId' in win).toBe(true);
    expect('getComputedStyle' in win).toBe(true);
    expect('nothingIsHere' in win).toBe(false);
  });

  it('is the real window when nothing was overridden', () => {
    const win = createWindowDouble();

    expect(win.innerWidth).toBe(globalThis.window.innerWidth);
  });
});

describe('createDocumentDouble', () => {
  it('replaces the member the spec named and keeps the prototype methods working', () => {
    const querySelector = vi.fn().mockReturnValue(null);
    const doc = createDocumentDouble({ querySelector });

    expect(doc.querySelector('a')).toBeNull();
    expect(querySelector).toHaveBeenCalledWith('a');
    expect(doc.createElement('div').tagName).toBe('DIV');
    expect(doc.defaultView).toBe(globalThis.document.defaultView);
  });

  it('is the real document when nothing was overridden', () => {
    const doc = createDocumentDouble();

    expect(doc.title).toBe(globalThis.document.title);
  });
});

describe('provideWindowDouble', () => {
  it('reaches a component through real DI, merged over the real window', () => {
    TestBed.configureTestingModule({ providers: [provideWindowDouble(WINDOW, { screen: { width: 1920 } })] });

    const component = TestBed.createComponent(ViewportComponent).componentInstance;

    expect(component.label).toBe(`1920 of ${globalThis.screen.colorDepth} at ${globalThis.window.location.href}`);
  });

  it("builds a double per injector, so one test never inherits another one's writes", () => {
    const provider = provideWindowDouble(WINDOW, { innerWidth: 375 });

    TestBed.configureTestingModule({ providers: [provider] });

    const first = TestBed.inject(WINDOW);

    Object.assign(first, { innerWidth: 1024 });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provider] });

    expect(TestBed.inject(WINDOW).innerWidth).toBe(375);
  });

  it('takes no overrides at all', () => {
    TestBed.configureTestingModule({ providers: [provideWindowDouble(WINDOW)] });

    expect(TestBed.inject(WINDOW).location.href).toBe(globalThis.window.location.href);
  });
});

describe('provideDocumentDouble', () => {
  it("defaults to Angular's DOCUMENT and still renders through the real document", () => {
    TestBed.configureTestingModule({ providers: [provideDocumentDouble({ visibilityState: 'hidden' })] });

    const component = TestBed.createComponent(AnchorComponent).componentInstance;

    expect(component.state).toBe('hidden');
    expect(component.created).toBe('SECTION');
    expect(globalThis.document.visibilityState).toBe('visible');
  });

  it('takes an application token instead, and no overrides', () => {
    const APP_DOCUMENT = new InjectionToken<Document>('APP_DOCUMENT');

    TestBed.configureTestingModule({ providers: [provideDocumentDouble({}, APP_DOCUMENT)] });

    expect(TestBed.inject(APP_DOCUMENT).title).toBe(globalThis.document.title);
  });

  it('takes no arguments at all', () => {
    TestBed.configureTestingModule({ providers: [provideDocumentDouble()] });

    expect(TestBed.inject(DOCUMENT).title).toBe(globalThis.document.title);
  });
});
