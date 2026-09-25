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
 *  - a loader resolving from a real timer, a `fetch` polyfill or an `rxResource` on `timer(0)` needs
 *    an event-loop turn, which no number of microtasks is.
 *
 * Two waits for one concept, and getting either wrong produces the same failure — an assertion
 * against the resource's *default* value, which is a passing test asserting nothing until the day
 * the default changes. This helper is the loop all of them converge under: tick, let one microtask
 * run, from the third round also yield the event loop, look at `status()`, up to a budget, then fail
 * naming what never settled.
 *
 * `flushEventLoopUntil` claims this use case in its own docstring and cannot serve it — it takes
 * real event-loop turns and never ticks, so a resource whose request has not been issued yet
 * finishes the budget having issued nothing.
 */
import * as DOCS_LINKS from './docs-links';
import { fakeClockBacklog } from './fake-clock-state';
import { withDocs } from './message-link';
import { count } from './message-text';
import { flushEffects } from './zoneless';

/**
 * The real timer, captured at import time for the same reason `zoneless.ts` captures it: the
 * event-loop turn below has to happen even when the spec installed `vi.useFakeTimers()`, and a faked
 * `setTimeout` never fires.
 */
const setTimer: typeof setTimeout = globalThis.setTimeout.bind(globalThis);

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
 * Everything else ends the wait, `error` included — a resource whose request threw has finished, and
 * `toHaveResourceError` is the assertion for it. `idle` ends the wait too, because waiting for a
 * resource that was never going to start is waiting for something that cannot happen; it then fails
 * on its own terms rather than by running the budget out.
 */
const PENDING_STATUSES: ReadonlySet<string> = new Set(['loading', 'reloading']);

/** How many rounds run on microtasks alone before each one also yields the event loop. */
const MICROTASK_ONLY_ROUNDS = 2;

/** Options for {@link settleResource}. */
export interface SettleResourceOptions {
  /** How many tick + microtask rounds to spend before giving up. Default 20. */
  turns?: number;
  /** What was being waited for, quoted in the failure — `'the product resource'`. */
  label?: string;
  /**
   * Accept `idle` as a settled status instead of failing on it. Default `false`.
   *
   * `idle` means the loader never ran, so every assertion after the wait reads the resource's
   * default value — the one mistake this helper exists to stop. Pass `true` when the idle state is
   * itself what the spec asserts.
   */
  allowIdle?: boolean;
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
 * runner's timeout reports the *file*, not the wait. `{ turns: 0 }` spends nothing and is the "check
 * and fail" form.
 *
 * A resource that ends up `idle` fails too, with its own message: `idle` is the state in which
 * `value()` is the default and no wait will ever change that.
 *
 * @param target Anything with a `status()` — an `httpResource`, `resource`, `rxResource` or a double.
 * @param options Turn budget, the label used in the failure, and whether `idle` is acceptable.
 */
export async function settleResource(target: ResourceStatusLike, options: SettleResourceOptions = {}): Promise<void> {
  const turns = options.turns ?? 20;

  // Read before anything is spent, so an already-settled resource costs nothing and a spec may await
  // it twice without thinking about it.
  let status = target.status();
  let spent = 0;

  while (PENDING_STATUSES.has(status)) {
    if (spent >= turns) {
      throw budgetError(status, spent, options.label);
    }

    flushEffects();
    // One microtask, which is the hand-off the tick alone does not cover: the request's promise
    // continuation runs here, and it is what moves `status()` off `loading`.
    await Promise.resolve();

    if (spent >= MICROTASK_ONLY_ROUNDS) {
      await new Promise<void>((resolve) => {
        setTimer(resolve, 0);
      });
    }

    spent += 1;
    status = target.status();
  }

  if (status === 'idle' && options.allowIdle !== true) {
    throw idleError(options.label);
  }
}

/** The budget failure — the flush that is missing, not "the test timed out". */
function budgetError(status: string, spent: number, label: string | undefined): Error {
  const what = label ?? 'the resource';

  const pending = fakeClockBacklog() ?? 0;
  const cause =
    pending > 0
      ? `${count(pending, 'callback')} ${pending === 1 ? 'waits' : 'wait'} on the fake clock, and no number of rounds moves ` +
        'it — advance it: `await advanceTimers(ms)`.'
      : 'Its request is not complete, and under `provideHttpClientTesting` only the spec completes one — flush it: ' +
        '`TestBed.inject(HttpTestingController).expectOne(url).flush(body)`, then await this again. With no request to ' +
        'flush, the injection context it was created in was discarded, or its fixture destroyed.';

  return new Error(
    withDocs(
      `[vitest-auto-spy] settleResource: ${what} was still '${status}' after ${count(spent, 'round')} of tick + microtask. ${cause}`,
      DOCS_LINKS.angularResources,
    ),
  );
}

/** The `idle` failure — the default-value trap this helper exists to prevent, named. */
function idleError(label: string | undefined): Error {
  const what = label ?? 'the resource';

  return new Error(
    withDocs(
      `[vitest-auto-spy] settleResource: ${what} never started — its status is 'idle', so the loader has not run and ` +
        '`value()` is still the default. Its `params()` returned `undefined`: set the signal it reads, `flushEffects()`, ' +
        'then await this. Pass `{ allowIdle: true }` if idle is what the spec asserts.',
      DOCS_LINKS.angularResources,
    ),
  );
}
