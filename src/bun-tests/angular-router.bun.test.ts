/**
 * `vitest-auto-spy/angular-router` under `bun test`.
 *
 * The entry imports nothing from a test runner — no hooks, no adapter — so the same route double a
 * Vitest spec gets must come out of Bun's `TestBed` too, and move the same way.
 */
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { describe, expect, it } from 'bun:test';
import { map } from 'rxjs';

import { injectActivatedRoute, provideActivatedRoute } from '../angular-router';

@Component({ selector: 'app-product', template: '<b>product {{ id() }}</b>' })
class ProductComponent {
  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id'))));
}

describe('the ActivatedRoute double on bun:test', () => {
  it('drives a component through the TestBed, stream and snapshot together', () => {
    TestBed.configureTestingModule({ providers: [provideActivatedRoute({ params: { id: '7' } })] });

    const fixture = TestBed.createComponent(ProductComponent);

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('product 7');

    const route = injectActivatedRoute();

    route.setParams({ id: '8' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('product 8');
    expect(route.route.snapshot.paramMap.get('id')).toBe('8');
  });
});
