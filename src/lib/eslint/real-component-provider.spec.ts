/** A component's own provider read from the fixture while the file never replaced it. */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { runRule } from './run-rule';

const RULE = 'no-real-component-provider';

function verify(code: string, options?: object): LintMessage[] {
  return runRule(RULE, code, { options });
}

function lint(code: string, options?: object): string[] {
  return verify(code, options).map((message) => message.ruleId ?? 'parse-error');
}

describe('no-real-component-provider', () => {
  const realStore = `
    import { CartStore } from './store/cart.store';

    TestBed.configureTestingModule({ imports: [CartComponent], providers: [provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(CartComponent);
    const store = () => fixture.debugElement.injector.get(CartStore);
  `;

  it('reports a component-level provider read back while nothing replaced it', () => {
    const [message] = verify(realStore);

    expect(lint(realStore)).toEqual([`vitest-auto-spy/${RULE}`]);
    expect(message?.message).toContain('overrideComponentProvider(CartComponent, CartStore)');
    expect(message?.message).toContain('const cartStore =');
  });

  it('reports the same read through componentRef', () => {
    const code = `
      const fixture = TestBed.createComponent(CartComponent);
      fixture.componentRef.injector.get(CartStore);
    `;

    expect(lint(code)).toEqual([`vitest-auto-spy/${RULE}`]);
  });

  it('names the placeholder component when the file creates more than one, or none', () => {
    const two = `
      TestBed.createComponent(CartComponent);
      const fixture = TestBed.createComponent(OtherComponent);
      fixture.debugElement.injector.get(CartStore);
    `;

    expect(verify(two)[0]?.message).toContain('overrideComponentProvider(Component, CartStore)');
    expect(verify('fixture.debugElement.injector.get(CartStore);')[0]?.message).toContain(
      'overrideComponentProvider(Component, CartStore)',
    );
  });

  it.each([
    ['overrideComponentProvider', 'overrideComponentProvider(CartComponent, CartStore);'],
    ['overrideProvider with overrideAutoSpy', 'TestBed.overrideProvider(CartStore, overrideAutoSpy(CartStore));'],
    ['overrideComponent', 'TestBed.overrideComponent(CartComponent, { set: { providers: [provideAutoSpy(CartStore)] } });'],
    ['a provider object', 'TestBed.configureTestingModule({ providers: [{ provide: CartStore, useValue: store }] });'],
    ['createSpyFromClass', 'const store = createSpyFromClass(CartStore);'],
  ])('accepts a token the file replaced through %s', (_label, statement) => {
    const code = `
      ${statement}
      const fixture = TestBed.createComponent(CartComponent);
      fixture.debugElement.injector.get(CartStore);
    `;

    expect(lint(code)).toEqual([]);
  });

  it('accepts a read the author already re-views as a spy', () => {
    const code = `
      const fixture = TestBed.createComponent(CartComponent);
      const store = asSpy(fixture.debugElement.injector.get(CartStore));
    `;

    expect(lint(code)).toEqual([]);
  });

  it('leaves framework tokens and the component itself alone', () => {
    const code = `
      import { ElementRef } from '@angular/core';
      import { NgControl } from '@angular/forms';

      const fixture = TestBed.createComponent(CartComponent);
      fixture.debugElement.injector.get(ElementRef);
      fixture.debugElement.injector.get(NgControl);
      fixture.debugElement.injector.get(CartComponent);
    `;

    expect(lint(code)).toEqual([]);
  });

  it.each([
    ['hostDirectives', "@Component({ template: '', hostDirectives: [ResizeDirective] }) class HostComponent {}"],
    ['imports', "@Component({ template: '<div appResize></div>', imports: [ResizeDirective] }) class HostComponent {}"],
    ['declarations', 'TestBed.configureTestingModule({ declarations: [ResizeDirective] });'],
  ])('leaves a directive the file renders through %s alone', (_label, statement) => {
    const code = `
      ${statement}
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentRef.injector.get(ResizeDirective);
    `;

    expect(lint(code)).toEqual([]);
  });

  it('does not read a child element injector, where a directive instance is a legitimate read', () => {
    const code = `
      const fixture = TestBed.createComponent(CartComponent);
      fixture.debugElement.query(By.directive(TooltipDirective)).injector.get(TooltipDirective);
    `;

    expect(lint(code)).toEqual([]);
  });

  describe('with childInjectors', () => {
    const options = { childInjectors: true };

    it('reports a service read through a queried child, naming the directive the query found', () => {
      const code = `
        const fixture = TestBed.createComponent(HostComponent);
        fixture.debugElement.query(By.directive(CartComponent)).injector.get(CartStore);
        fixture.debugElement.query(By.directive(CartComponent)).injector.get(CartComponent);
      `;
      const messages = verify(code, options);

      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toContain('overrideComponentProvider(CartComponent, CartStore)');
    });

    it.each([
      ['a css query', "fixture.debugElement.query(By.css('app-cart')).injector.get(CartStore);"],
      ['a query with no argument', 'fixture.debugElement.query().injector.get(CartStore);'],
      ['a queryAll element', "fixture.debugElement.queryAll(By.css('li'))[0].injector.get(CartStore);"],
      ['a child element', 'fixture.debugElement.children[1].injector.get(CartStore);'],
    ])('reports %s, with a placeholder component', (_label, statement) => {
      const code = `
        const fixture = TestBed.createComponent(HostComponent);
        ${statement}
      `;
      const messages = verify(code, options);

      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toContain('overrideComponentProvider(Component, CartStore)');
    });

    it('reads only element injectors, and names no component for a By.directive that names no class', () => {
      const code = `
        fixture.debugElement.query(By.directive(directives[0])).injector.get(CartStore);
        fixture.debugElement.nativeElement.injector.get(CartStore);
        fixture.debugElement.items[0].injector.get(CartStore);
        fixture.debugElement.children.first.injector.get(CartStore);
        fixture.debugElement.children[0].injector.get(TooltipDirective);
        fixture.debugElement.query(By.directive(TooltipDirective));
      `;

      expect(verify(code, options).map((message) => [message.line, message.message.includes('(Component, CartStore)')])).toEqual([
        [2, true],
      ]);
    });

    it('leaves a double the spec declares itself alone, however the child is reached', () => {
      const code = `
        @Component({ selector: 'app-footer', template: '' })
        class FooterDouble {}
        const BannerDouble = class {};

        describe('page', () => {
          class SidebarDouble {}

          it('reads the doubles', () => {
            const fixture = TestBed.createComponent(PageComponent);
            fixture.debugElement.query(By.css('app-footer')).children[0].injector.get(FooterDouble);
            fixture.debugElement.children[1].injector.get(BannerDouble);
            fixture.debugElement.queryAll(By.css('aside'))[0].injector.get(SidebarDouble);
            fixture.debugElement.injector.get(FooterDouble);
          });
        });
      `;

      expect(lint(code, options)).toEqual([]);
    });

    it('still reports the production class a spec-declared double extends or sits next to', () => {
      const code = `
        class FakeStore extends CartStore {}
        const Named = class Inner {};
        const { Shape } = class {};
        export default class {}
        TestBed.overrideComponent(CartComponent, { set: { providers: [{ provide: Store, useClass: class {} }] } });

        const fixture = TestBed.createComponent(HostComponent);
        fixture.debugElement.children[0].injector.get(FakeStore);
        fixture.debugElement.children[0].injector.get(Inner);
        fixture.debugElement.children[0].injector.get(Named);
        fixture.debugElement.children[0].injector.get(CartStore);
        fixture.debugElement.children[0].injector.get(Shape);
      `;

      expect(verify(code, options).map((message) => message.line)).toEqual([12, 13]);
    });
  });

  it('stays quiet in a file that builds its doubles through createWithAutoSpies', () => {
    const code = `
      const { fixture } = createWithAutoSpies(CartComponent, [CartStore]);
      fixture.debugElement.injector.get(CartStore);
    `;

    expect(lint(code)).toEqual([]);
  });

  it('honours ignoreTokens for a provider the spec means to keep real', () => {
    expect(lint(realStore, { ignoreTokens: ['CartStore'] })).toEqual([]);
  });

  it('ignores a get with a non-class argument or on an unrelated object', () => {
    const code = `
      fixture.debugElement.injector.get('token');
      fixture.debugElement.injector.get();
      cache.injector.get(CartStore);
      injector.get(CartStore);
      stores.get(CartStore);
      fixture.debugElement.get(CartStore);
      fixture.debugElement.injector.resolve(CartStore);
      fixture.debugElement.injector[get](CartStore);
    `;

    expect(lint(code)).toEqual([]);
  });
});
