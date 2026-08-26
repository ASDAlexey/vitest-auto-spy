/**
 * Angular's `TestBed` under `bun test` — the reason `vitest-auto-spy/bun-angular` exists.
 *
 * The preload has already installed a DOM, registered the resource-inlining plugin and initialised
 * a zoneless test environment, so from here on a spec reads exactly like its Vitest counterpart.
 */
import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'bun:test';

import { createWithAutoSpies, injectSpy, provideAutoSpy, renderShallow, stable } from '../bun-angular';
import { GreetingComponent } from './fixtures/greeting.component';
import { GreetingService } from './fixtures/greeting.service';

@Component({ selector: 'app-inline', template: '<b>{{ label() }}</b>' })
class InlineComponent {
  readonly #greetings = inject(GreetingService);

  readonly label = signal('idle');

  reveal(): void {
    this.label.set(this.#greetings.currentName());
  }
}

class Dashboard {
  readonly #greetings = inject(GreetingService);

  title(): string {
    return `Hi ${this.#greetings.currentName()}`;
  }
}

describe('Angular DI on bun:test', () => {
  it('provides a spy through TestBed and reads it back with injectSpy', () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(GreetingService)] });

    const greetings = injectSpy(GreetingService);

    greetings.currentName.mockReturnValue('spied user');

    expect(TestBed.inject(GreetingService).currentName()).toBe('spied user');
  });

  it('resolves promise-returning methods through the same helpers', async () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(GreetingService)] });

    const greetings = injectSpy(GreetingService);

    greetings.loadName.resolveWith('awaited user');

    await expect(TestBed.inject(GreetingService).loadName()).resolves.toBe('awaited user');
  });

  it('builds a class with every dependency auto-spied', () => {
    const { instance, spies } = createWithAutoSpies(Dashboard);

    spies.get(GreetingService).currentName.mockReturnValue('auto user');

    expect(instance.title()).toBe('Hi auto user');
  });
});

describe('Angular rendering on bun:test', () => {
  it('compiles and renders a component with an inline template', async () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(GreetingService)] });

    injectSpy(GreetingService).currentName.mockReturnValue('rendered user');

    const fixture = TestBed.createComponent(InlineComponent);

    fixture.componentInstance.reveal();
    await stable(fixture);

    expect(fixture.nativeElement.textContent).toContain('rendered user');
  });

  it('compiles a component declared with templateUrl and styleUrls', async () => {
    TestBed.configureTestingModule({ providers: [provideAutoSpy(GreetingService)] });

    injectSpy(GreetingService).currentName.mockReturnValue('external user');

    const fixture = TestBed.createComponent(GreetingComponent);

    await stable(fixture);

    expect(fixture.nativeElement.textContent).toContain('Hello, external user!');
  });

  it('renders shallow, keeping DI and lifecycle but dropping the template', () => {
    const { component } = renderShallow(InlineComponent, {
      providers: [provideAutoSpy(GreetingService)],
    });

    injectSpy(GreetingService).currentName.mockReturnValue('shallow user');
    component.reveal();

    expect(component.label()).toBe('shallow user');
  });
});
