/**
 * The claim is "one URL, and everything a component reads about the router derives from it", so the
 * specs read `url`, `routerState` and `events` after every move, and drive the double through a
 * real `TestBed` rather than calling the factory — an Angular provider that only works outside DI
 * is not a provider.
 */
import { Component, Injector, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router, RouterLink, provideRouter } from '@angular/router';
import { filter, map } from 'rxjs';
import { describe, expect, it } from 'vitest';

import '../angular';
import { provideActivatedRoute } from './angular-router';
import { createRouterDouble, injectRouterDouble, provideRouterDouble } from './router-double';

@Component({
  selector: 'vas-nav',
  standalone: true,
  template: `<span>{{ arrived() }} from {{ router.url }}</span>`,
})
class NavComponent {
  readonly router = inject(Router);
  readonly arrived = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: 'nowhere' },
  );

  checkout(): Promise<boolean> {
    return this.router.navigate(['/checkout'], { queryParams: { step: '1' } });
  }
}

@Component({
  selector: 'vas-own-router',
  standalone: true,
  template: '',
  providers: [provideRouterDouble({ url: '/own' })],
})
class OwnRouterComponent {}

@Component({
  selector: 'vas-linked',
  standalone: true,
  imports: [RouterLink],
  template: `<a [routerLink]="['reviews']" [queryParams]="{ page: '2' }">reviews</a>`,
})
class LinkedComponent {}

describe('createRouterDouble — where the router starts', () => {
  it('stands at the root until the spec moves it', () => {
    const { router } = createRouterDouble();

    expect(router.url).toBe('/');
    expect(router.routerState.snapshot.url).toBe('/');
  });

  it('serializes the URL it was given the way the router reports its own', () => {
    expect(createRouterDouble({ url: 'products/7?tab=reviews#specs' }).router.url).toBe('/products/7?tab=reviews#specs');
  });

  it('hands the root route the query parameters and the fragment of that URL', () => {
    const { router } = createRouterDouble({ url: '/products/7?tab=reviews#specs' });

    expect(router.routerState.root.snapshot.queryParams).toEqual({ tab: 'reviews' });
    expect(router.routerState.root.snapshot.fragment).toBe('specs');
    expect(router.routerState.root.snapshot.url).toEqual([]);
  });

  it('starts its events at the NavigationEnd that put it there', () => {
    const { router } = createRouterDouble({ url: '/products/7' });
    const seen: NavigationEnd[] = [];

    router.events.subscribe((event) => seen.push(event as NavigationEnd));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(NavigationEnd);
    expect(seen[0]?.urlAfterRedirects).toBe('/products/7');
  });
});

describe('setUrl', () => {
  it('moves the URL, the router state and the root route together', () => {
    const double = createRouterDouble();

    double.setUrl('/products/7?tab=reviews');

    expect(double.router.url).toBe('/products/7?tab=reviews');
    expect(double.router.routerState.snapshot.url).toBe('/products/7?tab=reviews');
    expect(double.router.routerState.root.snapshot.queryParams).toEqual({ tab: 'reviews' });
  });

  it('replaces the router state snapshot, as a navigation does', () => {
    const double = createRouterDouble();
    const before = double.router.routerState.snapshot;

    double.setUrl('/products/7');

    expect(double.router.routerState.snapshot).not.toBe(before);
    expect(before.url).toBe('/');
  });

  it('says nothing on events: moving the URL is not a navigation', () => {
    const double = createRouterDouble();
    const seen: string[] = [];

    double.router.events.subscribe((event) => seen.push(event.toString()));
    double.setUrl('/products/7');

    expect(seen).toHaveLength(1);
  });
});

describe('emitNavigation', () => {
  it('builds the NavigationEnd for the URL it is given, and moves the URL with it', () => {
    const double = createRouterDouble();
    const seen: NavigationEnd[] = [];

    double.router.events.subscribe((event) => seen.push(event as NavigationEnd));
    double.emitNavigation('/products/8');

    expect(double.router.url).toBe('/products/8');
    expect(seen).toHaveLength(2);
    expect(seen[1]?.id).toBe(2);
    expect(seen[1]?.url).toBe('/products/8');
  });

  it('re-announces the current URL when given nothing', () => {
    const double = createRouterDouble({ url: '/products/7' });
    const seen: NavigationEnd[] = [];

    double.router.events.subscribe((event) => seen.push(event as NavigationEnd));
    double.emitNavigation();

    expect(seen[1]?.urlAfterRedirects).toBe('/products/7');
    expect(double.router.url).toBe('/products/7');
  });

  it('takes a NavigationEnd built by hand and follows its redirected URL', () => {
    const double = createRouterDouble();

    double.emitNavigation(new NavigationEnd(42, '/login?from=/admin', '/login'));

    expect(double.router.url).toBe('/login');
    expect(double.router.routerState.snapshot.url).toBe('/login');
  });

  it('passes any other event through without moving the URL', () => {
    const double = createRouterDouble({ url: '/products/7' });
    const seen: unknown[] = [];

    double.router.events.subscribe((event) => seen.push(event));
    double.emitNavigation(new NavigationStart(2, '/checkout'));

    expect(seen[1]).toBeInstanceOf(NavigationStart);
    expect(double.router.url).toBe('/products/7');
  });

  it('is still there for a subscriber that arrives afterwards', () => {
    const double = createRouterDouble();

    double.emitNavigation('/products/8');

    const seen: NavigationEnd[] = [];

    double.router.events.subscribe((event) => seen.push(event as NavigationEnd));

    expect(seen).toHaveLength(1);
    expect(seen[0]?.urlAfterRedirects).toBe('/products/8');
  });
});

describe('navigate and navigateByUrl', () => {
  it('resolve true, which is what a component that awaits them expects', async () => {
    const double = createRouterDouble();

    await expect(double.router.navigate(['/checkout'])).resolves.toBe(true);
    await expect(double.router.navigateByUrl('/checkout')).resolves.toBe(true);
  });

  it('record the call, and take a different answer from the spec', async () => {
    const double = createRouterDouble();

    double.navigate.resolveWith(false);

    await expect(double.router.navigate(['/checkout'], { queryParams: { step: '1' } })).resolves.toBe(false);
    expect(double.navigate).toHaveBeenCalledWith(['/checkout'], { queryParams: { step: '1' } });
  });

  it('leave the URL where it was: a navigation runs guards, a spy does not', async () => {
    const double = createRouterDouble({ url: '/products/7' });

    await double.router.navigateByUrl('/checkout');

    expect(double.router.url).toBe('/products/7');
    expect(double.navigateByUrl).toHaveBeenCalledWith('/checkout');
  });
});

describe('the URL work, done for real', () => {
  it("parses and serializes with the router's own serializer", () => {
    const { router } = createRouterDouble();

    expect(router.serializeUrl(router.parseUrl('/products/7?tab=reviews#specs'))).toBe('/products/7?tab=reviews#specs');
  });

  it('builds an absolute tree the way a redirecting guard does', () => {
    const { router } = createRouterDouble({ url: '/admin' });

    expect(router.serializeUrl(router.createUrlTree(['/login'], { queryParams: { from: '/admin' } }))).toBe('/login?from=%2Fadmin');
    expect(router.serializeUrl(router.createUrlTree(['/login']))).toBe('/login');
  });

  it('builds a tree relative to a route it is given', () => {
    TestBed.configureTestingModule({ providers: [provideActivatedRoute({ url: 'products/12' })] });

    const { router } = createRouterDouble();
    const tree = router.createUrlTree(['reviews'], { relativeTo: TestBed.inject(ActivatedRoute) });

    expect(router.serializeUrl(tree)).toBe('/products/12/reviews');
  });

  it('keeps or merges the current query parameters and fragment when asked', () => {
    const { router } = createRouterDouble({ url: '/products/7?tab=reviews#specs' });
    const preserved = router.createUrlTree(['/products/8'], { queryParamsHandling: 'preserve', preserveFragment: true });
    const merged = router.createUrlTree(['/products/8'], { queryParams: { page: '2' }, queryParamsHandling: 'merge' });

    expect(router.serializeUrl(preserved)).toBe('/products/8?tab=reviews#specs');
    expect(router.serializeUrl(merged)).toBe('/products/8?tab=reviews&page=2');
  });
});

describe('the members it does not have', () => {
  it('names the one the code under test reached for, and what the double covers', () => {
    const { router } = createRouterDouble();

    expect(() => router.lastSuccessfulNavigation).toThrow(/the Router double has no lastSuccessfulNavigation/);
    expect(() => router.initialNavigation()).toThrow(/It answers url, events, navigate/);
  });

  it('ends that message with the docs link', () => {
    const { router } = createRouterDouble();

    expect(() => router.resetConfig([])).toThrow(/Docs: https:\/\/asdalexey\.github\.io\/vitest-auto-spy\/adapters\/angular-router/);
  });

  it("stays quiet for anything Angular's Router does not declare", () => {
    const router = createRouterDouble().router as unknown as Record<string, unknown>;

    expect(router['whateverTheSuiteInvented']).toBeUndefined();
    expect((router as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
  });

  it('answers the lifecycle members Angular itself reads off a provided value', () => {
    const router = createRouterDouble().router as unknown as { ngOnDestroy(): void; dispose(): void };

    expect(() => {
      router.ngOnDestroy();
      router.dispose();
    }).not.toThrow();
  });
});

describe('provideRouterDouble', () => {
  it('drives a component that injects the Router, through a real TestBed', async () => {
    TestBed.configureTestingModule({ providers: [provideRouterDouble({ url: '/products/7' })] });

    const fixture = TestBed.createComponent(NavComponent);
    const router = injectRouterDouble();

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('/products/7 from /products/7');

    await expect(fixture.componentInstance.checkout()).resolves.toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/checkout'], { queryParams: { step: '1' } });

    router.emitNavigation(new NavigationEnd(2, '/checkout', '/checkout'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('/checkout from /checkout');
  });

  it('shows a URL the spec set without a navigation', () => {
    TestBed.configureTestingModule({ providers: [provideRouterDouble()] });

    const fixture = TestBed.createComponent(NavComponent);

    injectRouterDouble().setUrl('/products/9');
    fixture.detectChanges();

    expect(fixture.componentInstance.router.url).toBe('/products/9');
    expect(fixture.nativeElement.textContent).toContain('from /products/9');
  });

  it('builds a fresh router for every module, so a hoisted provider list carries no URL over', () => {
    const providers = [provideRouterDouble({ url: '/products/7' })];

    TestBed.configureTestingModule({ providers });
    injectRouterDouble().setUrl('/checkout');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers });

    expect(TestBed.inject(Router).url).toBe('/products/7');
  });

  it("reads a component's own provider through the injector it is given", () => {
    const fixture = TestBed.createComponent(OwnRouterComponent);

    expect(injectRouterDouble(fixture.debugElement.injector).router.url).toBe('/own');
  });

  it("resolves a routerLink in a template, because the URL work is the router's own", () => {
    TestBed.configureTestingModule({
      providers: [provideActivatedRoute({ url: 'products/12' }), provideRouterDouble({ url: '/products/12' })],
    });

    const fixture = TestBed.createComponent(LinkedComponent);

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/products/12/reviews?page=2');
  });
});

describe('injectRouterDouble — what it says when it cannot help', () => {
  it('names the missing provider in an injector that has none', () => {
    expect(() => injectRouterDouble(Injector.create({ providers: [] }))).toThrow(/nothing provides Router in the injector given/);
  });

  it("says which real router a TestBed without the double hands out, and that it is providedIn 'root'", () => {
    TestBed.configureTestingModule({});

    expect(() => injectRouterDouble()).toThrow(/the Router here is Angular's own, not one provideRouterDouble\(\) built/);
    expect(() => injectRouterDouble()).toThrow(/Router is providedIn 'root'/);
  });

  it('is not the one provideRouter() can take away, in either order', () => {
    TestBed.configureTestingModule({ providers: [provideRouterDouble({ url: '/first' }), provideRouter([])] });
    expect(injectRouterDouble().router.url).toBe('/first');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideRouterDouble({ url: '/last' })] });
    expect(injectRouterDouble().router.url).toBe('/last');
  });

  it('names a hand-written useValue', () => {
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { url: '/' } }] });

    expect(() => injectRouterDouble()).toThrow(/is a value written by hand/);
  });

  it('ends every message with the docs link', () => {
    TestBed.configureTestingModule({});

    expect(() => injectRouterDouble()).toThrow(/Docs: https:\/\/asdalexey\.github\.io\/vitest-auto-spy\/adapters\/angular-router/);
  });
});
