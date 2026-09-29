/**
 * The double has to keep a real template working: a `bypassSecurityTrust*` result bound through
 * `[innerHTML]` / `[src]` renders, while every call stays on a spy the spec can assert.
 */
import { Component, SecurityContext, inject, signal } from '@angular/core';
import * as angularCore from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { injectSpy } from '../angular';
import { setDefaultStrictMode } from './function-spy';
import { createDomSanitizerDouble, provideDomSanitizerDouble, readSanitizationInternals } from './sanitizer-double';

@Component({
  selector: 'vas-rich-text',
  standalone: true,
  template: '<div [innerHTML]="html()"></div>',
})
class RichTextComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly html = signal<SafeHtml>(this.sanitizer.bypassSecurityTrustHtml('<b>bold</b>'));
}

describe('createDomSanitizerDouble', () => {
  it('returns Angular safe values from the bypass spies, and records the calls', () => {
    const sanitizer = createDomSanitizerDouble();
    const html = sanitizer.bypassSecurityTrustHtml('<i>x</i>');

    expect(sanitizer.bypassSecurityTrustHtml).toHaveBeenCalledWith('<i>x</i>');
    expect(sanitizer.sanitize(SecurityContext.HTML, html)).toBe('<i>x</i>');
    expect(sanitizer.sanitize(SecurityContext.STYLE, sanitizer.bypassSecurityTrustStyle('color: red'))).toBe('color: red');
    expect(sanitizer.sanitize(SecurityContext.SCRIPT, sanitizer.bypassSecurityTrustScript('run()'))).toBe('run()');
    expect(sanitizer.sanitize(SecurityContext.URL, sanitizer.bypassSecurityTrustUrl('/a'))).toBe('/a');
    expect(sanitizer.sanitize(SecurityContext.RESOURCE_URL, sanitizer.bypassSecurityTrustResourceUrl('/v.mp4'))).toBe('/v.mp4');
    expect(sanitizer.sanitize(SecurityContext.URL, sanitizer.bypassSecurityTrustResourceUrl('/r'))).toBe('/r');
    expect(sanitizer.sanitize(SecurityContext.NONE, html)).toBe('<i>x</i>');
    expect(sanitizer.sanitize).toHaveBeenCalledTimes(7);
  });

  it('answers a plain value as given and null for none', () => {
    const sanitizer = createDomSanitizerDouble();

    expect(sanitizer.sanitize(SecurityContext.HTML, '<script>x</script>')).toBe('<script>x</script>');
    expect(sanitizer.sanitize(SecurityContext.URL, null)).toBeNull();
  });

  it('refuses a safe value bound in the wrong context, as Angular does', () => {
    const sanitizer = createDomSanitizerDouble();

    expect(() => sanitizer.sanitize(SecurityContext.HTML, sanitizer.bypassSecurityTrustStyle('color: red'))).toThrow(
      /Required a safe HTML, got a Style/,
    );
  });

  it('counts as configured in a strict suite', () => {
    setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });

    try {
      expect(() => createDomSanitizerDouble().bypassSecurityTrustUrl('/a')).not.toThrow();
    } finally {
      setDefaultStrictMode(undefined);
    }
  });
});

describe('provideDomSanitizerDouble', () => {
  it('renders the bypassed value through a real template, spied', async () => {
    TestBed.configureTestingModule({ providers: [provideDomSanitizerDouble()] });

    const fixture = TestBed.createComponent(RichTextComponent);

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('div').innerHTML).toBe('<b>bold</b>');
    expect(injectSpy(DomSanitizer).bypassSecurityTrustHtml).toHaveBeenCalledWith('<b>bold</b>');
  });
});

describe('readSanitizationInternals', () => {
  it('names every internal an Angular without them is missing', () => {
    expect(() => readSanitizationInternals({ ɵunwrapSafeValue: () => '' })).toThrow(
      /no longer carries ɵbypassSanitizationTrustHtml, [^\n]*ɵgetSanitizationBypassType, which this package reads\.\n`createDomSanitizerDouble\(\)`/,
    );
  });

  it('falls back to the security guide when Angular stops exporting its link', () => {
    const { ɵXSS_SECURITY_URL: _url, ...withoutUrl } = angularCore;

    expect(readSanitizationInternals(withoutUrl).securityUrl).toBe('https://angular.dev/best-practices/security');
    expect(readSanitizationInternals(angularCore).securityUrl).toBe(angularCore.ɵXSS_SECURITY_URL);
  });
});
