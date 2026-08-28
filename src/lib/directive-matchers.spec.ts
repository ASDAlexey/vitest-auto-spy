import { Directive, NgModule } from '@angular/core';
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

    expect(() => expect(fixture).toHaveDirectiveApplied(HighlightDirective)).toThrow(/ɵɵsetNgModuleScope/);
    expect(() => expect(fixture).toHaveDirectiveApplied(HighlightDirective)).toThrow(/createDirectiveHost/);
  });

  it('says so when the directive is standalone', () => {
    const Host = createDirectiveHost({ template: '<div appLoner></div>' });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(() => expect(fixture).toHaveDirectiveApplied(LonerDirective)).toThrow(/standalone, so it belongs in the host component’s own/);
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
    expect(() => expect('a string').toHaveDirectiveApplied(HighlightDirective)).toThrow(/expected a ComponentFixture or a DebugElement/);
    // An object, but not one that can be queried — a `nativeElement` handed over by mistake.
    expect(() => expect({ tagName: 'DIV' }).toHaveDirectiveApplied(HighlightDirective)).toThrow(
      /expected a ComponentFixture or a DebugElement/,
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
