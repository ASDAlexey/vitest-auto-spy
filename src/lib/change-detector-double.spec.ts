/**
 * The double reaches what an environment injector builds, and — the limit worth pinning — never a
 * component the template instantiates, whose `ChangeDetectorRef` comes from its own view.
 */
import { ChangeDetectorRef, Component, Pipe, type PipeTransform, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { injectSpy } from '../angular';
import { createChangeDetectorRefDouble, provideChangeDetectorRefDouble } from './change-detector-double';
import { setDefaultStrictMode } from './function-spy';
import { renderShallow } from './render-shallow';

@Pipe({ name: 'vasTicking', standalone: true, pure: false })
class TickingPipe implements PipeTransform {
  private readonly cdr = inject(ChangeDetectorRef);

  transform(value: number): number {
    this.cdr.markForCheck();

    return value + 1;
  }
}

@Component({ selector: 'vas-ticking', standalone: true, template: '' })
class TickingComponent {
  readonly cdr = inject(ChangeDetectorRef);
}

afterEach(() => {
  setDefaultStrictMode(undefined);
});

describe('createChangeDetectorRefDouble', () => {
  it('spies on every method, answering undefined even in a strict suite', () => {
    setDefaultStrictMode({ strict: true, onUnstubbedCall: undefined });

    const cdr = createChangeDetectorRefDouble();

    cdr.markForCheck();
    cdr.detectChanges();
    cdr.detach();
    cdr.reattach();

    expect(cdr.markForCheck).toHaveBeenCalledTimes(1);
    expect(cdr.detectChanges).toHaveBeenCalledTimes(1);
    expect(cdr.detach).toHaveBeenCalledTimes(1);
    expect(cdr.reattach).toHaveBeenCalledTimes(1);
  });
});

describe('provideChangeDetectorRefDouble', () => {
  it('reaches a pipe built in the injection context', () => {
    TestBed.configureTestingModule({ providers: [provideChangeDetectorRefDouble()] });

    const pipe = TestBed.runInInjectionContext(() => new TickingPipe());

    expect(pipe.transform(1)).toBe(2);
    expect(injectSpy(ChangeDetectorRef).markForCheck).toHaveBeenCalledTimes(1);
  });

  it('does not reach a component the template instantiates', () => {
    const component = renderShallow(TickingComponent, { providers: [provideChangeDetectorRefDouble()] }).fixture.componentInstance;

    expect(component.cdr).not.toBe(TestBed.inject(ChangeDetectorRef));
  });
});
