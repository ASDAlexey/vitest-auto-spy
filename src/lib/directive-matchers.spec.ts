import { Component, Directive, NgModule } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { createDirectiveHost } from './directive-host';
import { registerDirectiveMatchers } from './directive-matchers';

@Directive({ selector: '[appHighlight]', standalone: false })
class HighlightDirective {}

@NgModule({ declarations: [HighlightDirective], exports: [HighlightDirective] })
class HighlightModule {}

@Directive({ selector: '[appLoner]' })
class LonerDirective {}

beforeAll(registerDirectiveMatchers);

describe('toHaveDirectiveApplied', () => {
  it('passes when the directive is on the element', () => {
    const Host = createDirectiveHost({ template: '<div appHighlight></div>', scope: [HighlightModule] });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture).toHaveDirectiveApplied(HighlightDirective);
    expect(fixture).toHaveDirectiveApplied(HighlightDirective, 'div');
    expect(fixture.debugElement).toHaveDirectiveApplied(HighlightDirective);
  });

  it('explains the NgModule case, which reports as three unrelated errors', () => {
    // No `scope`: the bare attribute produces no Angular error at all — the silent form.
    const Host = createDirectiveHost({ template: '<div appHighlight></div>' });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(() => expect(fixture).toHaveDirectiveApplied(HighlightDirective)).toThrow(
      /^\[vitest-auto-spy\] expected HighlightDirective to be applied, but it is not on any element of this fixture — HighlightDirective is declared by an NgModule[^\n]*\nBuild the host with createDirectiveHost\(\{ template, scope: \[ItsModule\] \}\)\.\nDocs: /,
    );
    expect(() => expect(fixture).toHaveDirectiveApplied(HighlightDirective)).not.toThrow(/NO_ERRORS_SCHEMA/);
  });

  it('says so when the directive is standalone', () => {
    const Host = createDirectiveHost({ template: '<div appLoner></div>' });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(() => expect(fixture).toHaveDirectiveApplied(LonerDirective)).toThrow(
      /LonerDirective is standalone, so only the host component's own imports put it in scope\.\n.*scope: \[LonerDirective\]/,
    );
  });

  it('separates "no such element" from "no such directive"', () => {
    const Host = createDirectiveHost({ template: '<div appHighlight></div>', scope: [HighlightModule] });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(() => expect(fixture).toHaveDirectiveApplied(HighlightDirective, 'span')).toThrow(/no element matches that selector/);
  });

  it('negates, and rejects something that is neither a fixture nor a DebugElement', () => {
    const Host = createDirectiveHost({ template: '<div></div>', scope: [HighlightModule] });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture).not.toHaveDirectiveApplied(HighlightDirective);
    expect(() => expect('a string').toHaveDirectiveApplied(HighlightDirective)).toThrow(
      /toHaveDirectiveApplied: expected a ComponentFixture, a DirectiveFixture or a DebugElement, received string\.\nPass the fixture itself/,
    );
    expect(() => expect(null).toHaveDirectiveApplied(HighlightDirective)).toThrow(/received null\./);
    expect(() => expect(document.createElement('div')).toHaveDirectiveApplied(HighlightDirective)).toThrow(/received a HTMLDivElement\./);
    // An object, but not one that can be queried — a `nativeElement` handed over by mistake.
    expect(() => expect({ tagName: 'DIV' }).toHaveDirectiveApplied(HighlightDirective)).toThrow(
      /expected a ComponentFixture, a DirectiveFixture or a DebugElement/,
    );
  });

  it('refuses something that is not a fixture under `.not` as well', () => {
    // `{ pass: false }` for a wrong argument is a pass under `.not`: `expect(undefined)` then
    // reported that the directive is not applied, about nothing at all.
    expect(() => expect(undefined).not.toHaveDirectiveApplied(HighlightDirective)).toThrow(
      /expected a ComponentFixture, a DirectiveFixture or a DebugElement/,
    );
  });

  it('reports the negated case when the directive is there', () => {
    const Host = createDirectiveHost({ template: '<div appHighlight></div>', scope: [HighlightModule] });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(() => expect(fixture).not.toHaveDirectiveApplied(HighlightDirective)).toThrow(/not to be applied, but it is on 1 element/);
  });
});

describe('toHaveDirectiveApplied on a TestBed.createDirective fixture', () => {
  it('finds the directive on the host element the fixture is rooted at', () => {
    const fixture = TestBed.createDirective(LonerDirective, { tagName: 'section' });

    expect(fixture).toHaveDirectiveApplied(LonerDirective);
    expect(fixture).toHaveDirectiveApplied(LonerDirective, 'section');
    expect(fixture).not.toHaveDirectiveApplied(HighlightDirective);
    expect(() => expect(fixture).not.toHaveDirectiveApplied(LonerDirective)).toThrow(/not to be applied, but it is on 1 element/);
  });

  it('counts a host directive of the component a fixture is rooted at', () => {
    @Component({ selector: 'app-hosted', template: '', hostDirectives: [LonerDirective] })
    class HostedComponent {}

    const fixture = TestBed.createComponent(HostedComponent);

    expect(fixture).toHaveDirectiveApplied(LonerDirective);
  });
});
