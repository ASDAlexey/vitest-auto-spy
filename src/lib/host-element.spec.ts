/**
 * The helpers exist so a strict-typed spec can reach its DOM without a cast, which only holds if
 * the runtime check is real: a miss and an element of the wrong kind have to fail at the call, and
 * the message has to name what was asked for and what was found.
 */
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { hostElement, queryElement } from './host-element';

@Component({
  selector: 'app-dialog',
  template: '<a class="close primary" href="#">x</a><input name="q" /><svg><circle /></svg>',
})
class DialogComponent {}

function render<T>(component: new () => T): ReturnType<typeof TestBed.createComponent<T>> {
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();

  return fixture;
}

describe('hostElement', () => {
  it('returns the fixture host as an HTMLElement', () => {
    const fixture = render(DialogComponent);

    const host = hostElement(fixture);

    expect(host).toBe(fixture.nativeElement);
    expect(host.querySelector('input')).not.toBeNull();
  });

  it('reads a DebugElement the same way', () => {
    const fixture = render(DialogComponent);

    expect(hostElement(fixture.debugElement.query(By.css('input')), HTMLInputElement).name).toBe('q');
  });

  it('returns the element as the type it is asked for', () => {
    const svg = render(DialogComponent).debugElement.query(By.css('svg'));

    expect(hostElement(svg, SVGSVGElement)).toBe(svg.nativeElement);
  });

  it('refuses an element that is not an instance of the requested type', () => {
    const svg = render(DialogComponent).debugElement.query(By.css('svg'));

    expect(() => hostElement(svg)).toThrow(new TypeError('hostElement: the host is <svg> (SVGSVGElement), not HTMLElement.'));
  });

  it.each([
    ['null', null],
    ['string', '<app-dialog>'],
  ])('refuses a nativeElement of %s', (description, nativeElement) => {
    expect(() => hostElement({ nativeElement })).toThrow(
      `hostElement: expected a ComponentFixture, a DebugElement or an Element, received a nativeElement of ${description}.`,
    );
  });
});

describe('queryElement', () => {
  it('returns the first match as an HTMLElement', () => {
    const fixture = render(DialogComponent);

    expect(queryElement(fixture, '.close').getAttribute('href')).toBe('#');
  });

  it('returns the match as the element type it is asked for', () => {
    const fixture = render(DialogComponent);

    expect(queryElement(fixture, 'input', HTMLInputElement).name).toBe('q');
    expect(queryElement(fixture, 'circle', SVGElement).tagName).toBe('circle');
  });

  it('queries under an element found earlier', () => {
    const fixture = render(DialogComponent);

    expect(queryElement(queryElement(fixture, 'svg', SVGSVGElement), 'circle', Element).tagName).toBe('circle');
  });

  it('names the selector and the host when nothing matches', () => {
    const fixture = render(DialogComponent);

    expect(() => queryElement(fixture, '.missing')).toThrow(
      /^queryElement: no element matches '\.missing' inside <div> \(HTMLDivElement\)\./,
    );
  });

  it('names what the selector matched when it is not the requested type', () => {
    const fixture = render(DialogComponent);

    expect(() => queryElement(fixture, '.close', HTMLButtonElement)).toThrow(
      new TypeError("queryElement: '.close' matched <a.close.primary> (HTMLAnchorElement), not HTMLButtonElement."),
    );
  });

  it('refuses a source without an element', () => {
    expect(() => queryElement({ nativeElement: undefined }, 'a')).toThrow(/^queryElement: expected a ComponentFixture/);
  });
});
