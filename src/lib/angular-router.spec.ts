/**
 * The claim is "the streams and the snapshot cannot disagree, and the route is Angular's own", so
 * the specs read both halves after every change and compare the double with a real
 * `new ActivatedRoute()` rather than with a list of names written here — a future Angular that adds
 * or renames a member fails this file instead of shipping a double that lacks it.
 */
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, type Params, Router, UrlSegment, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, type Observable, firstValueFrom, map } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { assertRouteWiring, createActivatedRoute, injectActivatedRoute, provideActivatedRoute } from './angular-router';

function current<T>(source: Observable<T>): Promise<T> {
  return firstValueFrom(source);
}

function record(source: Observable<unknown>, into: string[], label: string): void {
  let first = true;

  source.subscribe(() => {
    if (!first) {
      into.push(label);
    }

    first = false;
  });
}

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

@Component({
  selector: 'vas-product',
  standalone: true,
  template: `<span>product {{ id() }}</span>`,
})
class ProductComponent {
  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id'))));
}

@Component({
  selector: 'vas-routed',
  standalone: true,
  template: '',
  providers: [provideActivatedRoute({ params: { id: 'own' } })],
})
class RoutedComponent {}

describe('createActivatedRoute — the shape', () => {
  it("is an instance of Angular's ActivatedRoute, with exactly the own keys a real one has", () => {
    const { route } = createActivatedRoute({ params: { id: '7' } });

    expect(route).toBeInstanceOf(ActivatedRoute);
    expect(Object.getPrototypeOf(route)).toBe(ActivatedRoute.prototype);
    expect(sortedKeys(route)).toEqual(sortedKeys(new ActivatedRoute()));
  });

  it('has an ActivatedRouteSnapshot with exactly the own keys a real one has', () => {
    const { route } = createActivatedRoute();

    expect(route.snapshot).toBeInstanceOf(ActivatedRouteSnapshot);
    expect(sortedKeys(route.snapshot)).toEqual(sortedKeys(new ActivatedRouteSnapshot()));
  });

  it('answers every member of both prototypes without throwing, including ones added after this was written', () => {
    const { route } = createActivatedRoute({ url: 'products/7' });

    for (const [target, prototype] of [
      [route, ActivatedRoute.prototype],
      [route.snapshot, ActivatedRouteSnapshot.prototype],
    ] as const) {
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const member: unknown = Reflect.get(target, name);

        expect(() => (typeof member === 'function' && name !== 'constructor' ? Reflect.apply(member, target, []) : member)).not.toThrow();
      }
    }
  });

  it('is a one-node tree: its own root, with no parent and no children', () => {
    const { route } = createActivatedRoute();

    expect(route.root).toBe(route);
    expect(route.parent).toBeNull();
    expect(route.firstChild).toBeNull();
    expect(route.children).toEqual([]);
    expect(route.pathFromRoot).toEqual([route]);
    expect(route.snapshot.root).toBe(route.snapshot);
    expect(route.snapshot.parent).toBeNull();
    expect(route.snapshot.pathFromRoot).toEqual([route.snapshot]);
  });

  it('defaults to the empty route a navigation without parameters produces', async () => {
    const { route } = createActivatedRoute();

    expect(route.snapshot.params).toEqual({});
    expect(route.snapshot.queryParams).toEqual({});
    expect(route.snapshot.data).toEqual({});
    expect(route.snapshot.fragment).toBeNull();
    expect(route.snapshot.url).toEqual([]);
    expect(route.outlet).toBe('primary');
    expect(route.component).toBeNull();
    expect(route.routeConfig).toBeNull();
    expect(await current(route.fragment)).toBeNull();
  });

  it('carries the fixed parts it was given', () => {
    const routeConfig = { path: 'products/:id', component: ProductComponent };
    const { route } = createActivatedRoute({ outlet: 'aside', component: ProductComponent, routeConfig, url: 'products/7' });

    expect(route.outlet).toBe('aside');
    expect(route.component).toBe(ProductComponent);
    expect(route.routeConfig).toBe(routeConfig);
    expect(route.snapshot.routeConfig).toBe(routeConfig);
    expect(route.snapshot.outlet).toBe('aside');
    expect(String(route)).toBe("Route(url:'products/7', path:'products/:id')");
  });
});

describe('createActivatedRoute — one source of truth', () => {
  it('starts every stream and the snapshot from the same values', async () => {
    const init = { params: { id: '7' }, queryParams: { tab: 'reviews' }, data: { title: 'Chair' }, fragment: 'top' };
    const { route } = createActivatedRoute(init);

    expect(await current(route.params)).toBe(route.snapshot.params);
    expect(await current(route.queryParams)).toBe(route.snapshot.queryParams);
    expect(await current(route.data)).toBe(route.snapshot.data);
    expect(await current(route.fragment)).toBe(route.snapshot.fragment);
    expect(await current(route.url)).toBe(route.snapshot.url);
    expect(route.snapshot.params).toEqual(init.params);
    expect((await current(route.paramMap)).get('id')).toBe('7');
    expect(route.snapshot.paramMap.get('id')).toBe('7');
    expect((await current(route.queryParamMap)).get('tab')).toBe('reviews');
    expect(route.snapshot.queryParamMap.get('tab')).toBe('reviews');
    expect(route.snapshot.fragment).toBe('top');
  });

  it('reads multi-valued parameters through the ParamMap Angular builds', () => {
    expect(createActivatedRoute({ params: { a: ['1', '2'] } }).route.snapshot.paramMap.getAll('a')).toEqual(
      convertToParamMap({ a: ['1', '2'] }).getAll('a'),
    );
  });

  it('splits a string URL into segments, and takes UrlSegments as they are', () => {
    const segments = [new UrlSegment('products', { color: 'red' })];

    expect(createActivatedRoute({ url: '/products/7/' }).route.snapshot.url.map((segment) => segment.path)).toEqual(['products', '7']);
    expect(createActivatedRoute({ url: segments }).route.snapshot.url).toBe(segments);
  });

  it('moves the stream and the snapshot together, snapshot first', () => {
    const double = createActivatedRoute({ params: { id: '7' } });
    const seen: [Params, Params][] = [];

    double.route.params.subscribe((params) => seen.push([params, double.route.snapshot.params]));
    double.setParams({ id: '8' });

    expect(seen).toEqual([
      [{ id: '7' }, { id: '7' }],
      [{ id: '8' }, { id: '8' }],
    ]);
    expect(double.route.snapshot.paramMap.get('id')).toBe('8');
  });

  it('replaces the snapshot on every change, the way a navigation does', () => {
    const double = createActivatedRoute();
    const before = double.route.snapshot;

    double.setFragment('reviews');

    expect(double.route.snapshot).not.toBe(before);
    expect(before.fragment).toBeNull();
    expect(double.route.snapshot.root).toBe(double.route.snapshot);
  });

  it('gives every setter its own part and leaves the others alone', async () => {
    const double = createActivatedRoute({ params: { id: '7' }, queryParams: { tab: 'a' } });

    double.setQueryParams({ tab: 'b' });
    double.setData({ title: 'Chair' });
    double.setFragment('specs');
    double.setUrl('products/7');

    expect(double.route.snapshot.params).toEqual({ id: '7' });
    expect((await current(double.route.queryParamMap)).get('tab')).toBe('b');
    expect(await current(double.route.data)).toEqual({ title: 'Chair' });
    expect(await current(double.route.fragment)).toBe('specs');
    expect((await current(double.route.url)).map((segment) => segment.path)).toEqual(['products', '7']);
    expect(double.route.snapshot.data).toEqual({ title: 'Chair' });
  });

  it('keeps a fragment that is set back to null', async () => {
    const double = createActivatedRoute({ fragment: 'top' });

    double.set({ fragment: null });

    expect(double.route.snapshot.fragment).toBeNull();
    expect(await current(double.route.fragment)).toBeNull();
  });

  it('emits each changed stream once, in the order the router emits them after a navigation', () => {
    const double = createActivatedRoute();
    const order: string[] = [];

    record(double.route.queryParams, order, 'queryParams');
    record(double.route.fragment, order, 'fragment');
    record(double.route.params, order, 'params');
    record(double.route.url, order, 'url');
    record(double.route.data, order, 'data');

    double.set({ data: { a: 1 }, url: 'x', params: { id: '1' }, fragment: 'f', queryParams: { q: '1' } });

    expect(order).toEqual(['queryParams', 'fragment', 'params', 'url', 'data']);
  });
});

describe('createActivatedRoute — emits only what changed', () => {
  it('says nothing for a value equal to the current one, as the router does', () => {
    const tags = Symbol('tags');
    const segments = [new UrlSegment('products', {})];
    const double = createActivatedRoute({ params: { ids: ['1', '2'] }, data: { [tags]: 1 }, url: segments, fragment: 'f' });
    const emitted: string[] = [];

    record(double.route.params, emitted, 'params');
    record(double.route.data, emitted, 'data');
    record(double.route.url, emitted, 'url');
    record(double.route.fragment, emitted, 'fragment');

    double.set({ params: { ids: ['2', '1'] }, data: { [tags]: 1 }, url: segments, fragment: 'f' });

    expect(emitted).toEqual([]);
  });

  it('emits for a changed key count, a changed array, a changed symbol key and a changed segment list', () => {
    const tags = Symbol('tags');
    const double = createActivatedRoute({ params: { ids: ['1'] }, data: { [tags]: 1 }, url: 'a' });
    const emitted: string[] = [];

    record(double.route.params, emitted, 'params');
    record(double.route.data, emitted, 'data');
    record(double.route.url, emitted, 'url');

    double.setParams({ ids: ['1', '2'] });
    double.setParams({ ids: ['1', '3'] });
    double.setParams({ ids: ['1', '3'], page: '2' });
    double.setData({ [tags]: 2 });
    double.setUrl('a/b');
    double.setUrl([new UrlSegment('a', { m: '1' }), new UrlSegment('b', {})]);

    expect(emitted).toEqual(['params', 'params', 'params', 'data', 'url', 'url']);
  });

  it('treats a string URL as new segments, as a navigation that re-parses the URL does', () => {
    const double = createActivatedRoute({ url: 'a' });
    const emitted: string[] = [];

    record(double.route.url, emitted, 'url');
    double.setUrl('a');

    expect(emitted).toHaveLength(1);
  });

  it('tolerates destructured setters', () => {
    const { route, setParams } = createActivatedRoute({ params: { id: '1' } });

    setParams({ id: '2' });

    expect(route.snapshot.params).toEqual({ id: '2' });
  });
});

describe('provideActivatedRoute', () => {
  it('drives a component that reads the route, through a real TestBed', () => {
    TestBed.configureTestingModule({ providers: [provideActivatedRoute({ params: { id: '7' } })] });

    const fixture = TestBed.createComponent(ProductComponent);

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('product 7');

    injectActivatedRoute().setParams({ id: '8' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('product 8');
  });

  it('builds a fresh route for every module, so a hoisted provider list carries no navigation over', () => {
    const providers = [provideActivatedRoute({ queryParams: { page: '1' } })];

    TestBed.configureTestingModule({ providers });
    injectActivatedRoute().setQueryParams({ page: '5' });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers });

    expect(TestBed.inject(ActivatedRoute).snapshot.queryParamMap.get('page')).toBe('1');
  });

  it('is a real route to the real Router: relativeTo resolves against its URL', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideActivatedRoute({ url: 'products/12' })] });

    const router = TestBed.inject(Router);
    const tree = router.createUrlTree(['reviews'], { relativeTo: injectActivatedRoute().route, queryParams: { page: '2' } });

    expect(router.serializeUrl(tree)).toBe('/products/12/reviews?page=2');
  });

  it("reads a component's own provider through the injector it is given", () => {
    const fixture = TestBed.createComponent(RoutedComponent);

    expect(injectActivatedRoute(fixture.debugElement.injector).route.snapshot.params).toEqual({ id: 'own' });
  });
});

describe('injectActivatedRoute — what it says when it cannot help', () => {
  it('names the missing provider', () => {
    TestBed.configureTestingModule({});

    expect(() => injectActivatedRoute()).toThrow(/nothing provides ActivatedRoute here/);
  });

  it("names a real router's route that won over the double", () => {
    TestBed.configureTestingModule({ providers: [provideActivatedRoute(), provideRouter([])] });

    expect(() => injectActivatedRoute()).toThrow(/is an instance of ActivatedRoute, not one provideActivatedRoute\(\) built/);
  });

  it('names a hand-written useValue', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: { snapshot: {} } }] });

    expect(() => injectActivatedRoute()).toThrow(/is a plain object/);
  });

  it('names a prototype-less value as a plain object too', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: Object.create(null) }] });

    expect(() => injectActivatedRoute()).toThrow(/is a plain object/);
  });

  it('ends every message with the docs link', () => {
    TestBed.configureTestingModule({});

    expect(() => injectActivatedRoute()).toThrow(/Docs: https:\/\/asdalexey\.github\.io\/vitest-auto-spy\/adapters\/angular-router/);
  });
});

describe('assertRouteWiring', () => {
  it('names the member a reordered constructor would have put in the wrong place', () => {
    const { route } = createActivatedRoute();
    const state = { params: {}, queryParams: {}, data: {}, fragment: null, url: [] };
    const streams = {
      params: new BehaviorSubject<Params>({}),
      queryParams: new BehaviorSubject<Params>({}),
      data: new BehaviorSubject<Params>({}),
      fragment: new BehaviorSubject<string | null>(null),
      url: new BehaviorSubject<UrlSegment[]>([]),
    };

    expect(() => assertRouteWiring(route, streams, state, { outlet: 'primary', component: null, routeConfig: null })).toThrow(
      /route\.params does not hold what the double passed in/,
    );
  });
});
