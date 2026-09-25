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
import * as DOCS_LINKS from './docs-links';
import { fakeClockBacklog } from './fake-clock-state';
import { withDocs } from './message-link';
import { count } from './message-text';

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
 * promise chain: a dynamic `import()` triggered by production code, a native `async` function
 * inside a dependency, a stub that resolves a turn later. Not an Angular `httpResource()` /
 * `resource()` — those need a *tick*, which is `settleResource()`, not this.
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

/** Options for {@link flushEventLoopUntil}: a budget in turns, or one in real milliseconds — not both. */
export type FlushUntilOptions =
  | {
      /**
       * Poll on the real clock for up to this long instead of counting turns — for a wait on real I/O
       * (a socket round-trip, a child process), which takes milliseconds rather than turns. Fake timers
       * do not slow it down or speed it up.
       */
      timeoutMs: number;
      turns?: never;
      label?: string;
    }
  | {
      /** How many real turns to spend before giving up. Default 20. */
      turns?: number;
      timeoutMs?: never;
      /** What was being waited for, quoted in the failure — `'the resource to leave loading'`. */
      label?: string;
    };

/** How often a {@link FlushUntilOptions.timeoutMs} wait checks its condition. */
const POLL_MS = 10;

async function pollUntil(isDone: () => boolean, timeoutMs: number): Promise<boolean> {
  for (let waited = 0; ; waited += POLL_MS) {
    if (isDone()) {
      return true;
    }

    if (waited >= timeoutMs) {
      return false;
    }

    await new Promise<void>((resume) => nativeSetTimeout(resume, Math.min(POLL_MS, timeoutMs - waited)));
  }
}

/** The one cause the clock can confirm, or the two it leaves when nothing waits on it. */
function stillWaitingOn(otherwise: string): string {
  const pending = fakeClockBacklog() ?? 0;

  if (pending > 0) {
    return (
      `${count(pending, 'callback')} ${pending === 1 ? 'waits' : 'wait'} on the fake clock, and this helper never advances it — ` +
      'advance it instead: `await advanceTimers(ms)`.'
    );
  }

  return `No timer is pending: ${otherwise}`;
}

function notReady(what: string, spent: string, otherwise: string): Error {
  return new Error(
    withDocs(
      `[vitest-auto-spy] flushEventLoopUntil: ${what} was still not ready after ${spent}. ${stillWaitingOn(otherwise)}`,
      DOCS_LINKS.eventLoopUntil,
    ),
  );
}

/**
 * Take real event-loop turns until `isDone()` says so, then stop — or fail saying it never did.
 *
 * The shape behind every hand-rolled "settle" helper: a lazily-loaded chunk becoming reachable, an
 * SDK reporting itself ready, a queue draining. Written by hand it is a fixed number of turns, tuned
 * by trial until the suite goes green — which is both slower than it needs to be (it always waits
 * the maximum) and quietly fragile (one more hand-off in a dependency and the number is wrong
 * again).
 *
 * ```ts
 * client.warmUp();
 *
 * await flushEventLoopUntil(() => client.isReady(), { label: 'the SDK handshake' });
 * expect(client.session()).toBeDefined();
 * ```
 *
 * **Not for an Angular resource** — use `settleResource()` from `vitest-auto-spy/angular` for that.
 * This helper takes real event-loop turns and never *ticks*, and an `httpResource()` issues no
 * request at all until something does: measured, a resource awaited here finishes the whole budget
 * having made zero requests, then fails saying the condition was never met. The docstring used to
 * claim that use case and show it as the example; it never worked.
 *
 * The budget is what separates this from a `while (true)`: a condition that never becomes true is
 * the normal way for this to be used wrongly — the request was never made, the stub never resolved
 * — and a test that hangs until the runner's timeout reports the file, not the wait.
 *
 * @param isDone Checked before the first turn, then after every turn.
 * A wait on real I/O — an HTTP round-trip to a server the spec started, a child process exiting —
 * takes milliseconds, not turns: `{ timeoutMs: 1000 }` polls the real clock instead, every 10 ms.
 *
 * @param options Turn budget, or `timeoutMs`, and the label used in the failure.
 */
export async function flushEventLoopUntil(isDone: () => boolean, options: FlushUntilOptions = {}): Promise<void> {
  if (options.timeoutMs !== undefined) {
    if (!(await pollUntil(isDone, options.timeoutMs))) {
      throw notReady(
        options.label ?? 'the condition',
        `${options.timeoutMs} ms of real time`,
        'either the work never started (the call under test did not run, the server was never listening), or it needs ' +
          'longer — raise `timeoutMs`.',
      );
    }

    return;
  }

  const turns = options.turns ?? 20;

  for (let turn = 0; turn <= turns; turn += 1) {
    // Checked first, so a condition that is already true costs nothing — the common case once the
    // stub resolves synchronously.
    if (isDone()) {
      return;
    }

    await flushEventLoop();
  }

  throw notReady(
    options.label ?? 'the condition',
    `${turns} real event-loop turns`,
    "if it waits on a dynamic import(), await it instead: `await settleDynamicImport(() => import('./thing'))`; " +
      'otherwise the call under test never ran, or its stub was never configured.',
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
