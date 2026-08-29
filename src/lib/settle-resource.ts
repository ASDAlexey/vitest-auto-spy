/**
 * `settleResource` — one wait for `httpResource()`, `resource()` and `rxResource()`.
 *
 * Angular's resource primitives need a *different* wait each, and neither of them is the one a spec
 * reaches for. Measured against Angular 21.2.17 on a zoneless TestBed:
 *
 *  - `httpResource()` created through `runInInjectionContext` issues **no request at all** until
 *    something ticks. After `TestBed.tick()` there is exactly one pending request; after
 *    `flush(payload)` the resource still reports `loading` with its default value, and needs one
 *    more microtask to reach `resolved`.
 *  - a plain `resource()` with an async loader needs **two** rounds of the same thing.
 *
 * Two waits for one concept, and getting either wrong produces the same failure — an assertion
 * against the resource's *default* value, which is a passing test asserting nothing until the day
 * the default changes. This helper is the loop both converge under: tick, let one microtask run,
 * look at `status()`, up to a budget, then fail naming what never settled.
 *
 * `flushEventLoopUntil` claims this use case in its own docstring and cannot serve it — it takes
 * real event-loop turns and never ticks, so a resource whose request has not been issued yet
 * finishes the budget having issued nothing.
 */
import { DOCS_LINKS, withDocs } from './docs-links';
import { flushEffects } from './zoneless';

/**
 * The slice of Angular's `ResourceRef` this helper reads.
 *
 * Duck-typed on purpose, like every other Angular helper here: `status()` is the whole contract, so
 * this works with `httpResource`, `resource`, `rxResource`, a `linkedSignal` wrapper over one, and
 * with {@link mockResourceProp}-style hand-built doubles.
 */
export interface ResourceStatusLike {
  status(): string;
}

/**
 * The two statuses that mean work is still in flight.
 *
 * Everything else settles the wait, `error` and `idle` included: a resource whose request threw has
 * finished, and one whose `request()` returned `undefined` was never going to start. Waiting for
 * either would be waiting for something that cannot happen, and the budget failure would then blame
 * the spec for a resource that is behaving exactly as written.
 */
const PENDING_STATUSES: ReadonlySet<string> = new Set(['loading', 'reloading']);

/** Options for {@link settleResource}. */
export interface SettleResourceOptions {
  /** How many tick + microtask rounds to spend before giving up. Default 20. */
  turns?: number;
  /** What was being waited for, quoted in the failure — `'the product resource'`. */
  label?: string;
}

/**
 * Tick until the resource leaves `loading`, then stop — or fail saying it never did.
 *
 * ```ts
 * const products = TestBed.runInInjectionContext(() => httpResource<Product[]>(() => '/api/products'));
 *
 * flushEffects();                                             // the request is issued here, not on creation
 * httpTesting.expectOne('/api/products').flush([product]);
 * await settleResource(products, { label: 'the product resource' });
 *
 * expect(products.value()).toEqual([product]);
 * ```
 *
 * **The `flushEffects()` before the flush is not optional and this helper cannot replace it.** An
 * `httpResource` makes no request until something ticks, so there is nothing for `expectOne` to
 * find until then — and awaiting *this* first would spend the whole budget on a resource that
 * stays `loading` for a reason no amount of waiting fixes, then fail. One tick to get the request
 * out, the spec's own flush, then one wait to take delivery. A plain `resource()` needs no flush
 * and so needs no tick either: `await settleResource(data)` is the whole of it.
 *
 * The budget is what separates this from a `while (true)`. A resource that never settles is the
 * normal way to use this wrongly — the request was never flushed — and a test that hangs until the
 * runner's timeout reports the *file*, not the wait.
 *
 * @param target Anything with a `status()` — an `httpResource`, `resource`, `rxResource` or a double.
 * @param options Turn budget and the label used in the failure.
 */
export async function settleResource(target: ResourceStatusLike, options: SettleResourceOptions = {}): Promise<void> {
  const turns = options.turns ?? 20;

  for (let turn = 0; turn <= turns; turn += 1) {
    // Checked first, so an already-settled resource costs nothing and a spec may await it twice
    // without thinking about it.
    if (!PENDING_STATUSES.has(target.status())) {
      return;
    }

    flushEffects();
    // One microtask, which is the hand-off the tick alone does not cover: the request's promise
    // continuation runs here, and it is what moves `status()` off `loading`.
    await Promise.resolve();
  }

  const what = options.label ?? 'the resource';

  throw new Error(
    withDocs(
      `[vitest-auto-spy] settleResource: ${what} was still '${target.status()}' after ${turns} rounds of tick + microtask. ` +
        'A resource stays loading until its request completes, and under `provideHttpClientTesting` nothing but the spec can ' +
        'complete one — flush it first (`TestBed.inject(HttpTestingController).expectOne(url).flush(body)`), then await this ' +
        'again. If there is no request to flush, the resource never started: its `request()` computation reads a signal the ' +
        'test never set, or the injection context it was created in was discarded. And if the loader resolves on a *timer* ' +
        'rather than a promise, no number of turns will do it — `advanceTimers()` is what moves those.',
      DOCS_LINKS.angular,
    ),
  );
}
