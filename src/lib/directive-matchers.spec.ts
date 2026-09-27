import { Component, Directive, NgModule, TemplateRef, type Type, ViewContainerRef, inject } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { createDirectiveHost } from './directive-host';
import { registerDirectiveMatchers } from './directive-matchers';

@Directive({ selector: '[appHighlight]', standalone: false })
class HighlightDirective {}

@NgModule({ declarations: [HighlightDirective], exports: [HighlightDirective] })
class HighlightModule {}

@Directive({ selector: '[appLoner]' })
class LonerDirective {}

@Directive({ selector: '[appSkip]' })
class SkipDirective {
  readonly template = inject(TemplateRef);
}

@Directive({ selector: '[appRender]' })
class RenderDirective {
  constructor() {
    inject(ViewContainerRef).createEmbeddedView(inject(TemplateRef));
  }
}

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

  it('points a component under test at its hostDirectives and imports rather than at createDirectiveHost', () => {
    @Component({ selector: 'app-bare', template: '<span></span>' })
    class BareComponent {}

    const fixture = TestBed.createComponent(BareComponent);

    expect(() => expect(fixture).toHaveDirectiveApplied(LonerDirective)).toThrow(
      /^\[vitest-auto-spy\] expected LonerDirective to be applied, but it is not on BareComponent's host element or in its template\.\nTo apply it, list LonerDirective in BareComponent's hostDirectives if the component should carry it, or in its imports if its template uses it\.\nDocs: /,
    );
    expect(() => expect(fixture).toHaveDirectiveApplied(HighlightDirective)).toThrow(
      /To apply it, add the NgModule that declares HighlightDirective to BareComponent's imports if its template uses it\./,
    );
    expect(() => expect(fixture.debugElement.children[0]).toHaveDirectiveApplied(LonerDirective)).toThrow(
      /Build the host with createDirectiveHost/,
    );
  });

  it('keeps the createDirectiveHost hint for a directive fixture', () => {
    const fixture = TestBed.createDirective(LonerDirective, { tagName: 'section' });

    expect(() => expect(fixture).toHaveDirectiveApplied(HighlightDirective)).toThrow(/Build the host with createDirectiveHost/);
  });

  it('counts a host directive of the component a fixture is rooted at', () => {
    @Component({ selector: 'app-hosted', template: '', hostDirectives: [LonerDirective] })
    class HostedComponent {}

    const fixture = TestBed.createComponent(HostedComponent);

    expect(fixture).toHaveDirectiveApplied(LonerDirective);
  });
});

describe('toHaveDirectiveApplied on a structural directive', () => {
  it('finds `*dir` on the template anchor of a createDirectiveHost fixture', () => {
    const Host = createDirectiveHost({ template: '<div *appRender class="shown">shown</div>', scope: [RenderDirective] });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture).toHaveDirectiveApplied(RenderDirective);
    expect(fixture.debugElement).toHaveDirectiveApplied(RenderDirective);
    expect(fixture).not.toHaveDirectiveApplied(LonerDirective);
    expect(() => expect(fixture).not.toHaveDirectiveApplied(RenderDirective)).toThrow(
      /not to be applied, but it is on 1 template anchor\./,
    );
  });

  it('finds `<ng-template dir>` on a createDirectiveHost fixture', () => {
    const Host = createDirectiveHost({ template: '<ng-template appRender><span>shown</span></ng-template>', scope: [RenderDirective] });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture).toHaveDirectiveApplied(RenderDirective);
  });

  it('finds both forms in the template of a component under test', () => {
    @Component({
      selector: 'app-rendering',
      imports: [RenderDirective, LonerDirective],
      template: '<p appLoner></p><div *appRender>a</div><ng-template appRender><span>b</span></ng-template>',
    })
    class RenderingComponent {}

    const fixture = TestBed.createComponent(RenderingComponent);
    fixture.detectChanges();

    expect(fixture).toHaveDirectiveApplied(RenderDirective);
    expect(() => expect(fixture).not.toHaveDirectiveApplied(RenderDirective)).toThrow(/but it is on 2 template anchors\./);
    expect(() => expect(fixture).not.toHaveDirectiveApplied(LonerDirective)).toThrow(/but it is on 1 element\./);
  });

  it('tells a selector that names the rendered element to drop it for a template anchor', () => {
    const Host = createDirectiveHost({ template: '<div *appRender class="shown">shown</div>', scope: [RenderDirective] });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(() => expect(fixture).toHaveDirectiveApplied(RenderDirective, '.shown')).toThrow(
      /^\[vitest-auto-spy\] expected RenderDirective to be applied on '\.shown', but it is on a template anchor, not on an element — a structural directive sits on the comment Angular leaves in place of its template\.\nAssert it without a selector: expect\(fixture\)\.toHaveDirectiveApplied\(RenderDirective\)\.\nDocs: /,
    );
  });

  it('blames the structure, not detectChanges, when the directive rendered nothing the selector names', () => {
    const Host = createDirectiveHost({ template: '<div *appSkip class="off">x</div>', scope: [SkipDirective] });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(() => expect(fixture).toHaveDirectiveApplied(SkipDirective, '.off')).toThrow(
      /^\[vitest-auto-spy\] expected SkipDirective to be applied on '\.off', but it is on a template anchor, not on an element — a structural directive sits on the comment Angular leaves in place of its template, and the element that selector names exists only in a view the directive chose to render\.\nAssert it without a selector: expect\(fixture\)\.toHaveDirectiveApplied\(SkipDirective\)\.\nDocs: /,
    );
  });
});

describe('toHaveDirectiveApplied on a directive the host has in scope', () => {
  function render(template: string, scope: readonly Type<unknown>[]): ComponentFixture<unknown> {
    const Host = createDirectiveHost({ template, scope });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    return fixture;
  }

  it('blames a selector that matches nothing, printing it, rather than the scope the spec already set', () => {
    @Directive({ selector: '[appFlagX]' })
    class FlagDirective {}

    const fixture = render('<div *appFlag="true">shown</div>', [FlagDirective]);

    expect(() => expect(fixture).toHaveDirectiveApplied(FlagDirective)).toThrow(
      /^\[vitest-auto-spy\] expected FlagDirective to be applied, but it is not on any element of this fixture, though it is in the host's scope — so its selector '\[appFlagX\]' matches nothing the template renders\.\nCheck that selector against the template/,
    );
  });

  it('prints element, attribute value and class parts, and every alternative', () => {
    @Directive({ selector: 'input[type=text].wide, .alt' })
    class WideDirective {}

    const fixture = render('<span></span>', [WideDirective]);

    expect(() => expect(fixture).toHaveDirectiveApplied(WideDirective)).toThrow(
      /its selector 'input\[type="text"\]\.wide, \.alt' matches nothing/,
    );
  });

  it('leaves out a :not() selector it would print wrong', () => {
    @Directive({ selector: 'div:not(.skip)' })
    class NotDirective {}

    const fixture = render('<span></span>', [NotDirective]);

    expect(() => expect(fixture).toHaveDirectiveApplied(NotDirective)).toThrow(/so its selector matches nothing the template renders/);
  });

  it('prints no selector for a definition it cannot read one from', () => {
    class NoDefinition {}
    class BadSelector {
      static ɵdir = { selectors: ['[appBad]'] };
    }
    class FakeHost {
      static ɵcmp = { directiveDefs: () => [{ type: NoDefinition }, { type: BadSelector }] };
    }

    const root = { componentInstance: new FakeHost(), providerTokens: [], queryAll: () => [], queryAllNodes: () => [] };

    expect(() => expect(root).toHaveDirectiveApplied(NoDefinition)).toThrow(/so its selector matches nothing/);
    expect(() => expect(root).toHaveDirectiveApplied(BadSelector)).toThrow(/so its selector matches nothing/);
  });

  it('says where the directive is when the selector names another element', () => {
    const fixture = render('<div appLoner></div><span></span>', [LonerDirective]);

    expect(() => expect(fixture).toHaveDirectiveApplied(LonerDirective, 'span')).toThrow(
      /expected LonerDirective to be applied on 'span', but it is on 1 element that selector does not match\.\nCheck the selector against the template, or drop it: expect\(fixture\)\.toHaveDirectiveApplied\(LonerDirective\)\./,
    );
  });
});

describe('toHaveDirectiveApplied class names', () => {
  it("takes the bundler's leading underscore off a decorated class", () => {
    @Directive({ selector: '[appStray]' })
    class _StrayDirective {}

    @Component({ selector: 'app-renamed', template: '<span></span>' })
    class _RenamedComponent {}

    const fixture = TestBed.createComponent(_RenamedComponent);

    expect(() => expect(fixture).toHaveDirectiveApplied(_StrayDirective)).toThrow(
      /^\[vitest-auto-spy\] expected StrayDirective to be applied, but it is not on RenamedComponent's host element or in its template\.\nTo apply it, list StrayDirective in RenamedComponent's hostDirectives/,
    );
  });
});
