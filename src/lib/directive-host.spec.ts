/**
 * Both halves are asserted, because the point of the helper is that they disagree: the directive
 * has to be *applied* (runtime), and the host has to carry its own scope (compiler). The
 * `standalone: false` host is written out as a control — it is what a spec ported from
 * `jest-preset-angular` looks like, and it is the thing that stops working.
 */
import { Directive, Input, NgModule } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { createDirectiveHost } from './directive-host';

@Directive({ selector: '[appTruncate]', standalone: false })
class TruncateDirective {
  @Input() appTruncate = false;
  @Input() truncateText = '';

  get label(): string {
    return this.appTruncate ? this.truncateText.slice(0, 3) : this.truncateText;
  }
}

@NgModule({ declarations: [TruncateDirective], exports: [TruncateDirective] })
class DirectivesModule {}

describe('createDirectiveHost', () => {
  it('applies a directive that only an NgModule declares', () => {
    const Host = createDirectiveHost({
      template: '<div [appTruncate]="enabled" [truncateText]="text"></div>',
      scope: [DirectivesModule],
      props: { enabled: false, text: 'hello world' },
    });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const directive = fixture.debugElement.query(By.directive(TruncateDirective));

    expect(directive).not.toBeNull();
    expect(directive.injector.get(TruncateDirective).label).toBe('hello world');
  });

  it('types componentInstance from the props, and copies them per instance', () => {
    const Host = createDirectiveHost({
      template: '<div [appTruncate]="enabled" [truncateText]="text"></div>',
      scope: [DirectivesModule],
      props: { enabled: false, text: 'hello world' },
    });

    TestBed.configureTestingModule({ imports: [Host] });

    const first = TestBed.createComponent(Host);
    const second = TestBed.createComponent(Host);

    first.componentInstance.enabled = true;
    first.detectChanges();
    second.detectChanges();

    expect(first.debugElement.query(By.directive(TruncateDirective)).injector.get(TruncateDirective).label).toBe('hel');
    expect(second.debugElement.query(By.directive(TruncateDirective)).injector.get(TruncateDirective).label).toBe('hello world');
  });

  it('needs neither props nor scope', () => {
    const Host = createDirectiveHost({ template: '<span>bare</span>', selector: 'bare-host' });

    TestBed.configureTestingModule({ imports: [Host] });

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toBe('bare');
  });
});
