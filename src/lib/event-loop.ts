/**
 * One turn of the *real* event loop, even when the clock is faked.
 *
 * A suite carried over from Jest almost always runs with fake timers on for every test (Jest had
 * `fakeTimers.enableGlobally`, and the ported setup file reproduces it). That leaves no obvious way
 * to say "let the runtime breathe once":
 *
 *  - `await Promise.resolve()` — any number of times — only drains microtasks. It never advances a
 *    dynamic `import()`, and it never advances a native `async` function inside `node_modules`,
 *    because both of those continue on a *macrotask*.
 *  - `setTimeout` is the fake one, so scheduling through it schedules nothing.
 *  - `vi.advanceTimersByTimeAsync(0)` does work, but it reads as "move the timers" in a test that
 *    has no timers, so the next person deletes it as noise — which is exactly what happened to the
 *    hand-rolled version of this helper in the suite that motivated it.
 *
 * {@link flushEventLoop} says what it does and does not touch the clock: it schedules through
 * `MessageChannel`, which no fake-timer implementation replaces, and falls back to the `setTimeout`
 * captured when this module was first evaluated. Nothing here imports the runner, so it works the
 * same on Vitest, Bun and `node:test`.
 */

/**
 * Captured at module evaluation, i.e. during the import phase — before any `beforeEach` has had a
 * chance to install fakes. It is the fallback for a runtime with no `MessageChannel`.
 */
const nativeSetTimeout = globalThis.setTimeout;

function scheduleMacrotask(resume: () => void): void {
  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel();

    channel.port1.onmessage = (): void => {
      // Both ports have to be closed or the channel keeps the event loop (and the worker) alive.
      channel.port1.close();
      channel.port2.close();
      resume();
    };

    channel.port2.postMessage(undefined);

    return;
  }

  nativeSetTimeout(resume, 0);
}

/**
 * Give the runtime `turns` real event-loop turns, whatever the timers are doing.
 *
 * Reach for it when the thing being awaited crosses out of the zone / out of the test's own
 * promise chain: a dynamic `import()` triggered by production code, an Angular `httpResource()` /
 * `resource()` delivering its first value, a native `async` function inside a dependency.
 *
 * ```ts
 * component.openModal();          // production code does `await import('./modal')`
 * await flushEventLoop();
 * expect(modal.open).toHaveBeenCalled();
 * ```
 *
 * It yields a *task* turn (a `postMessage` task), which is what module loading and native `async`
 * continuations need. It deliberately does not run pending `setTimeout` callbacks — those are a
 * different task source, and a helper that also fired timers would be `advanceTimersByTime` under
 * another name.
 *
 * @param turns How many turns to take. One is enough for a single hand-off; raise it when a chain
 *   hands off more than once (a promise resolved from another promise's macrotask continuation).
 */
export async function flushEventLoop(turns = 1): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise<void>(scheduleMacrotask);
  }
}

/** Options for {@link flushEventLoopUntil}. */
export interface FlushUntilOptions {
  /** How many real turns to spend before giving up. Default 20. */
  turns?: number;
  /** What was being waited for, quoted in the failure — `'the resource to leave loading'`. */
  label?: string;
}

/**
 * Take real event-loop turns until `isDone()` says so, then stop — or fail saying it never did.
 *
 * The shape behind every hand-rolled "settle" helper: an Angular `httpResource()` / `resource()` /
 * `rxResource` leaving `loading`, a lazily-loaded chunk becoming reachable, an SDK reporting itself
 * ready. Written by hand it is a fixed number of turns, tuned by trial until the suite goes green —
 * which is both slower than it needs to be (it always waits the maximum) and quietly fragile (one
 * more hand-off in a dependency and the number is wrong again).
 *
 * ```ts
 * const products = TestBed.runInInjectionContext(() => httpResource(() => '/api/products'));
 *
 * await flushEventLoopUntil(() => products.status() !== 'loading', { label: 'the product resource' });
 * expect(products.value()).toEqual([product]);
 * ```
 *
 * The budget is what separates this from a `while (true)`: a condition that never becomes true is
 * the normal way for this to be used wrongly — the request was never made, the stub never resolved
 * — and a test that hangs until the runner's timeout reports the file, not the wait.
 *
 * @param isDone Checked before the first turn, then after every turn.
 * @param options Turn budget and the label used in the failure.
 */
export async function flushEventLoopUntil(isDone: () => boolean, options: FlushUntilOptions = {}): Promise<void> {
  const turns = options.turns ?? 20;

  for (let turn = 0; turn <= turns; turn += 1) {
    // Checked first, so a condition that is already true costs nothing — the common case once the
    // stub resolves synchronously.
    if (isDone()) {
      return;
    }

    await flushEventLoop();
  }

  const what = options.label ?? 'the condition';

  throw new Error(
    `[vitest-auto-spy] flushEventLoopUntil: ${what} was still not ready after ${turns} real event-loop turns. ` +
      'Three causes, in the order they turn out to be true. The work started but a dynamic `import()` had not finished: a cold ' +
      'chunk takes more turns than this budget, and the giveaway is that only the *first* such test in a file fails while the ' +
      'rest pass off the module cache — which reads as a flake. Await the module instead of counting turns: ' +
      '`await settleDynamicImport(() => import("./thing"))`. Or the work never started (the call under test did not run, or its ' +
      'stub was never configured). Or it is waiting on a timer rather than on the event loop — timers stay frozen here, and ' +
      'only `advanceTimers()` moves them.',
  );
}

/**
 * Load a module the way the code under test does, then let its continuation run.
 *
 * Two situations, one mechanism. Production code that does `await import('./thing')` on a click
 * leaves the spec with no promise to await — awaiting the *same* specifier here resolves against
 * the same module instance, and the following real turns let the component's own continuation
 * drain. The second situation is a bundled Angular suite where a symbol re-exported through a
 * barrel reads as `undefined` until its chunk has been evaluated; awaiting the import is what
 * evaluates it.
 *
 * ```ts
 * fixture.debugElement.query(By.css('button')).nativeElement.click();
 * await settleDynamicImport(() => import('./profile-select.modal'));
 * expect(dialog.open).toHaveBeenCalled();
 * ```
 *
 * `fakeAsync` / `tick()` / `flushMicrotasks()` cannot replace this: they drive Angular's zone
 * queues, and the module loader is not one of them.
 *
 * @param load The same `() => import(...)` the code under test performs.
 * @param turns Real event-loop turns to take after the module resolved. Default 1.
 * @returns The module namespace, so the spec can also read what it just made sure exists.
 */
export async function settleDynamicImport<T>(load: () => Promise<T>, turns = 1): Promise<T> {
  const loaded = await load();

  await flushEventLoop(turns);

  return loaded;
}
