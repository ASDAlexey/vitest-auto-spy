/**
 * `vitest-auto-spy/angular-router` under `bun test`.
 *
 * The entry imports nothing from a test runner — no hooks, no adapter — so the same route and
 * router doubles a Vitest spec gets must come out of Bun's `TestBed` too, and move the same way.
 * The router double also builds spies, which is the part that needs Bun's own `mock()` behind it.
 */
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { describe, expect, it } from 'bun:test';
import { filter, map } from 'rxjs';

import { injectActivatedRoute, injectRouterDouble, provideActivatedRoute, provideRouterDouble } from '../angular-router';

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

@Component({ selector: 'app-nav', template: '<b>{{ arrived() }}</b>' })
class NavComponent {
  readonly router = inject(Router);
  readonly arrived = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: 'nowhere' },
  );
}

describe('the Router double on bun:test', () => {
  it('drives a component through the TestBed, with spies built by Bun', async () => {
    TestBed.configureTestingModule({ providers: [provideRouterDouble({ url: '/products/7' })] });

    const fixture = TestBed.createComponent(NavComponent);
    const router = injectRouterDouble();

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('/products/7');

    expect(await router.router.navigate(['/checkout'])).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/checkout']);

    router.emitNavigation('/checkout');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('/checkout');
    expect(router.router.url).toBe('/checkout');
  });
});
