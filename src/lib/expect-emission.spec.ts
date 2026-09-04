import { BehaviorSubject, Subject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type SubscribableLike,
  expectCompletion,
  expectEmission,
  expectEmissions,
  expectError,
  expectNoEmission,
  setEmissionTimeout,
} from './expect-emission';

/** Emit `value` on the next macrotask, the shape of a stream fed by an async source. */
function later<T>(value: T, delay = 1): Subject<T> {
  const subject = new Subject<T>();

  setTimeout(() => subject.next(value), delay);

  return subject;
}

describe('expectEmission', () => {
  it('resolves with the first value of a synchronous stream', async () => {
    await expect(expectEmission(of(7))).resolves.toBe(7);
  });

  it('resolves with the first value of an asynchronous stream', async () => {
    await expect(expectEmission(later('late'))).resolves.toBe('late');
  });

  it('resolves an `undefined` emission instead of treating it as "nothing arrived"', async () => {
    await expect(expectEmission(of(undefined))).resolves.toBeUndefined();
  });

  it('rejects, naming the stream, when nothing is emitted in time', async () => {
    await expect(expectEmission(new Subject<number>(), { timeout: 10, label: 'products$' })).rejects.toThrow(
      /products\$ did not emit within 10 ms \(0 emission\(s\) received\)/,
    );
  });

  it('rejects with the generic name when no label is given', async () => {
    await expect(expectEmission(new Subject<number>(), { timeout: 10 })).rejects.toThrow(/^the observable did not emit/);
  });

  it('rejects when the stream errors', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => source$.error('BOOM'), 1);

    await expect(expectEmission(source$, { timeout: 50 })).rejects.toThrow('the observable errored instead of emitting: BOOM');
  });

  it('rejects when the stream completes without emitting', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => source$.complete(), 1);

    await expect(expectEmission(source$, { timeout: 50 })).rejects.toThrow('completed after 0 emission(s), expected 1');
  });
});

describe('expectEmissions', () => {
  it('collects the requested number of values', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => {
      source$.next(1);
      source$.next(2);
      source$.next(3);
    }, 1);

    await expect(expectEmissions(source$, 2, { timeout: 50 })).resolves.toEqual([1, 2]);
  });

  it('rejects when the stream completes early, reporting how many arrived', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => {
      source$.next(1);
      source$.complete();
    }, 1);

    await expect(expectEmissions(source$, 3, { timeout: 50 })).rejects.toThrow('completed after 1 emission(s), expected 3');
  });
});

describe('under fake timers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('still times out: the watchdog is the real clock, not the faked one', async () => {
    vi.useFakeTimers();

    await expect(expectEmission(new Subject<number>(), { timeout: 10, label: 'saved$' })).rejects.toThrow(
      /saved\$ did not emit within 10 ms/,
    );
  });

  it('still resolves a stream a spec advances by hand', async () => {
    vi.useFakeTimers();

    const source$ = new Subject<number>();

    setTimeout(() => source$.next(3), 5_000);

    const emission = expectEmission(source$, { timeout: 200 });

    vi.advanceTimersByTime(5_000);

    await expect(emission).resolves.toBe(3);
  });
});

describe('expectNoEmission', () => {
  it('resolves when the stream stays silent', async () => {
    await expect(expectNoEmission(new Subject<number>(), { timeout: 5 })).resolves.toBeUndefined();
  });

  it('rejects, printing the value, when the stream does emit', async () => {
    await expect(expectNoEmission(of({ id: 1 }), { timeout: 5, label: 'saved$' })).rejects.toThrow(
      'saved$ emitted {id:1} but was expected to stay silent.',
    );
  });

  it('prints a value that references itself, instead of dying on it', async () => {
    const node: { id: number; self?: unknown } = { id: 1 };
    node.self = node;

    // A component, a DOM node or a store slice — the values a spec actually asserts silence on.
    await expect(expectNoEmission(of(node), { timeout: 5, label: 'saved$' })).rejects.toThrow(
      'saved$ emitted {id:1,self:[Circular]} but was expected to stay silent.',
    );
  });

  it('cancels the quiet window when the source settles the promise first', async () => {
    let unsubscribes = 0;

    const source$: SubscribableLike<number> = {
      subscribe: (observer) => {
        observer.next?.(1);

        return {
          unsubscribe: () => {
            unsubscribes += 1;
          },
        };
      },
    };

    await expect(expectNoEmission(source$, { timeout: 5 })).rejects.toThrow(/stay silent/);

    const settled = unsubscribes;

    await new Promise((resolve) => setTimeout(resolve, 20));

    // An uncancelled window would stop the collector a second time here — and in a real suite it
    // would do that inside whichever file happened to be running by then.
    expect(unsubscribes).toBe(settled);
  });

  it('defaults the quiet window to a single macrotask', async () => {
    await expect(expectNoEmission(new Subject<number>())).resolves.toBeUndefined();
  });
});

describe('expectCompletion', () => {
  it('resolves when a stream that never emits completes', async () => {
    const source$ = new Subject<void>();

    setTimeout(() => source$.complete(), 1);

    await expect(expectCompletion(source$, { timeout: 50 })).resolves.toBeUndefined();
  });

  it('resolves for a stream that emits and then completes — termination is the assertion', async () => {
    await expect(expectCompletion(of(1, 2, 3), { timeout: 50 })).resolves.toBeUndefined();
  });

  it('rejects, naming the stream, when it keeps running', async () => {
    await expect(expectCompletion(new Subject<void>(), { timeout: 10, label: 'purged$' })).rejects.toThrow(
      /purged\$ did not complete within 10 ms \(0 emission\(s\) received\)/,
    );
  });

  it('counts the emissions it saw in the timeout message', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => source$.next(1), 1);

    await expect(expectCompletion(source$, { timeout: 20 })).rejects.toThrow(/did not complete within 20 ms \(1 emission\(s\) received\)/);
  });

  it('rejects with "instead of completing", not the emission wording', async () => {
    const source$ = new Subject<void>();

    setTimeout(() => source$.error('BOOM'), 1);

    await expect(expectCompletion(source$, { timeout: 50 })).rejects.toThrow('the observable errored instead of completing: BOOM');
  });
});

describe('the emitted type is inferred, not widened to `unknown`', () => {
  /**
   * These assignments are the test: an inference regression compiles and passes at runtime, so the
   * only place it can fail is `tsc`. `Promise<unknown>` is not assignable to `Promise<number>`,
   * which is exactly what `expectEmission(of(1))` used to produce — silently, until somebody read a
   * field off the awaited value.
   */
  it('infers the value of an rxjs Observable', async () => {
    const first: Promise<number> = expectEmission(of(1));
    const many: Promise<number[]> = expectEmissions(of(1, 2), 2);

    // Reading a field is the failure the report described (`TS2339` on `unknown`).
    const account: { id: number } = await expectEmission(of({ id: 7 }));

    await expect(first).resolves.toBe(1);
    await expect(many).resolves.toEqual([1, 2]);
    expect(account.id).toBe(7);
  });

  it('infers the value of a Subject a spec pushes into', async () => {
    const pending: Promise<string> = expectEmission(later('late'));

    await expect(pending).resolves.toBe('late');
  });

  it('still infers from a hand-rolled observer-only source, which takes the second overload', async () => {
    const source$: SubscribableLike<boolean> = {
      subscribe: (observer) => {
        observer.next?.(true);

        return { unsubscribe: () => undefined };
      },
    };

    const pending: Promise<boolean> = expectEmission(source$);

    await expect(pending).resolves.toBe(true);
  });

  it('infers from the single-signature `subscribe` rxjs 8 leaves behind', async () => {
    // rxjs 8 drops the deprecated positional overload, so the source has one signature where rxjs 7
    // has two — a different pairing inside the compiler, and the case a fix tested only against the
    // installed rxjs would miss.
    interface Rxjs8Observable<T> {
      subscribe(
        observerOrNext?:
          ((value: T) => void) | Partial<{ complete: () => void; error: (error: unknown) => void; next: (value: T) => void }> | null,
      ): { unsubscribe(): void };
    }

    const source$: Rxjs8Observable<number> = of(9);
    const pending: Promise<number> = expectEmission(source$);

    await expect(pending).resolves.toBe(9);
  });
});

describe('a source whose `subscribe` takes a callback, not an observer', () => {
  /**
   * Angular's `output()`. `OutputEmitterRef.subscribe(callback)` stores whatever it is given and
   * calls it on `emit`, inside a `try/catch` that routes the failure to Angular's `ErrorHandler` —
   * so handing it an observer object produced no error the spec could see, only a hang until the
   * watchdog fired.
   */
  class OutputEmitterRefLike<T> {
    private listeners: ((value: T) => void)[] = [];

    subscribe(callback: (value: T) => void): { unsubscribe(): void } {
      this.listeners.push(callback);

      return {
        unsubscribe: () => {
          this.listeners = this.listeners.filter((listener) => listener !== callback);
        },
      };
    }

    emit(value: T): void {
      for (const listener of [...this.listeners]) {
        try {
          listener(value);
        } catch {
          // Angular swallows it into the injector's ErrorHandler — which is what made the failure
          // a timeout rather than a `TypeError`.
        }
      }
    }
  }

  it('resolves, and infers the emitted type', async () => {
    const selectionChange = new OutputEmitterRefLike<{ id: number }>();
    const pending: Promise<{ id: number }> = expectEmission(selectionChange, { timeout: 200 });

    selectionChange.emit({ id: 7 });

    const selected = await pending;

    expect(selected.id).toBe(7);
  });

  it('unsubscribes once it has what it needs', async () => {
    const changes = new OutputEmitterRefLike<number>();
    const pending = expectEmission(changes, { timeout: 200 });

    changes.emit(1);
    await expect(pending).resolves.toBe(1);

    // A listener left behind would run inside whatever test came next.
    expect(() => changes.emit(2)).not.toThrow();
  });

  it('serves `expectNoEmission` and `expectCompletion` too', async () => {
    const changes = new OutputEmitterRefLike<number>();

    await expect(expectNoEmission(changes, { timeout: 5 })).resolves.toBeUndefined();
    // An output never completes, so this is the failure branch — reached through the same contract.
    await expect(expectCompletion(changes, { timeout: 10, label: 'changes' })).rejects.toThrow(/changes did not complete/);
  });

  it('keeps the error branch working for rxjs, which reads a function argument as `next` only', async () => {
    // The reason the hybrid observer is not handed to everything: rxjs would take it as `next` and
    // drop `error`, turning a stream that errors into a timeout.
    const source$ = new Subject<number>();

    setTimeout(() => source$.error('BOOM'), 1);

    await expect(expectEmission(source$, { timeout: 50 })).rejects.toThrow('errored instead of emitting: BOOM');
  });
});

describe('setEmissionTimeout', () => {
  afterEach(() => {
    setEmissionTimeout(1_000);
  });

  it('changes the wait a call that names no timeout uses', async () => {
    setEmissionTimeout(10);

    const started = Date.now();

    await expect(expectEmission(new Subject<number>(), { label: 'quiet$' })).rejects.toThrow(/quiet\$ did not emit within 10 ms/);

    // The point of the knob: a failing assertion under global fake timers no longer spends the
    // default real second before it reports.
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('is what `expectCompletion` reads too', async () => {
    setEmissionTimeout(10);

    await expect(expectCompletion(new Subject<void>())).rejects.toThrow(/did not complete within 10 ms/);
  });

  it('leaves the quiet window of `expectNoEmission` alone — that one is not a watchdog', async () => {
    setEmissionTimeout(10_000);

    // Still one macrotask, not ten seconds.
    await expect(expectNoEmission(new Subject<number>())).resolves.toBeUndefined();
  });
});

describe('expectError', () => {
  class UdmsStatusError extends Error {}

  it('resolves with the error itself, so identity survives', async () => {
    const original = new UdmsStatusError('websso fail');
    const source$ = new Subject<number>();

    setTimeout(() => source$.error(original), 1);

    // The three assertions the wrapping helpers cannot make.
    await expect(expectError(source$, { timeout: 50 })).resolves.toBe(original);
  });

  it('keeps the class and the exact message reachable', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => source$.error(new UdmsStatusError('websso fail')), 1);

    const error = await expectError(source$, { timeout: 50 });

    expect(error).toBeInstanceOf(UdmsStatusError);
    expect(error).toHaveProperty('message', 'websso fail');
  });

  it('waits for an error that arrives after an emission', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => {
      source$.next(1);
      source$.error('late');
    }, 1);

    await expect(expectError(source$, { timeout: 50 })).resolves.toBe('late');
  });

  it('rejects when the stream completes instead, naming what that usually means', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => source$.complete(), 1);

    await expect(expectError(source$, { timeout: 50, label: 'load$' })).rejects.toThrow(
      /load\$ completed after 0 emission\(s\) without erroring/,
    );
  });

  it('rejects when the stream does neither in time', async () => {
    await expect(expectError(new Subject<number>(), { timeout: 10, label: 'load$' })).rejects.toThrow(
      /load\$ did not error within 10 ms \(0 emission\(s\) received\)/,
    );
  });
});

describe('the wrapped failures carry the original on `cause`', () => {
  it('does so for an emission helper', async () => {
    const original = new Error('boom');
    const source$ = new Subject<number>();

    setTimeout(() => source$.error(original), 1);

    await expect(expectEmission(source$, { timeout: 50 })).rejects.toMatchObject({ cause: original });
  });

  it('does so for `expectCompletion`', async () => {
    const original = new Error('boom');
    const source$ = new Subject<void>();

    setTimeout(() => source$.error(original), 1);

    await expect(expectCompletion(source$, { timeout: 50 })).rejects.toMatchObject({ cause: original });
  });
});

describe('choosing which emission counts', () => {
  it('skips the stale first value of a replayed stream', async () => {
    const source$ = new BehaviorSubject('stale');

    setTimeout(() => source$.next('fresh'), 1);

    await expect(expectEmission(source$, { skip: 1, timeout: 50 })).resolves.toBe('fresh');
  });

  it('waits for the emission that satisfies the predicate', async () => {
    const source$ = new Subject<{ channelId: number }>();

    setTimeout(() => {
      source$.next({ channelId: 1 });
      source$.next({ channelId: 7 });
    }, 1);

    await expect(expectEmission(source$, { until: (params) => params.channelId === 7, timeout: 50 })).resolves.toEqual({ channelId: 7 });
  });

  it('counts every emission in the failure, not only the matching ones', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => {
      source$.next(1);
      source$.next(2);
    }, 1);

    // "2 arrived, none matched" is a different diagnosis from "nothing fired", and a
    // `pipe(filter(…))` in front of the helper loses it.
    await expect(expectEmission(source$, { until: (value) => value > 5, timeout: 20, label: 'ids$' })).rejects.toThrow(
      /ids\$ did not emit within 20 ms \(2 emission\(s\) received\)/,
    );
  });

  it('says it wanted a matching value when the stream completes short', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => {
      source$.next(1);
      source$.complete();
    }, 1);

    await expect(expectEmission(source$, { until: (value) => value > 5, timeout: 50 })).rejects.toThrow(
      'completed after 1 emission(s), expected 1 matching',
    );
  });

  it('collects several matching values', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => {
      source$.next(1);
      source$.next(6);
      source$.next(2);
      source$.next(7);
    }, 1);

    await expect(expectEmissions(source$, 2, { until: (value) => value > 5, timeout: 50 })).resolves.toEqual([6, 7]);
  });

  it('narrows what `expectNoEmission` objects to', async () => {
    const source$ = new Subject<number>();

    setTimeout(() => source$.next(1), 1);

    // Emissions that do not match are not a failure …
    await expect(expectNoEmission(source$, { until: (value) => value > 5, timeout: 20 })).resolves.toBeUndefined();
  });

  it('still reports the matching emission it was told to object to', async () => {
    await expect(expectNoEmission(of(1, 9), { until: (value) => value > 5, timeout: 5, label: 'ids$' })).rejects.toThrow(
      'ids$ emitted 9 but was expected to stay silent.',
    );
  });
});

describe('advance', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the callback once the subscription exists, closing the window a spec cannot reach', async () => {
    vi.useFakeTimers();

    const source$ = new Subject<boolean>();

    setTimeout(() => source$.next(false), 5_000);

    // Without this the `await` gives control away before the clock can be advanced, and the shape
    // people fall back to — hold the promise, advance, then await — breaks the moment somebody adds
    // an `await` one line above it.
    await expect(expectEmission(source$, { advance: () => vi.runAllTimers() })).resolves.toBe(false);
  });

  it('is not run when a synchronous source has already settled', async () => {
    let advanced = 0;

    await expect(expectEmission(of(1), { advance: () => (advanced += 1) })).resolves.toBe(1);

    // Advancing a clock into a stream nobody is listening to any more is how a stray timer outlives
    // the test.
    expect(advanced).toBe(0);
  });
});

describe('the failure points at the caller, not at the callback that built it', () => {
  /**
   * The regression this is the canary for: every failure here is constructed inside a `subscribe`
   * or timer callback, by which time the caller's frame is gone from the stack. Before the stack was
   * captured at helper entry the reporter's code frame opened `expect-emission.ts` — a file in
   * `node_modules` for everyone but this repo, and the first thing both a reader and an agent do
   * with such a location is go and read the wrong file.
   */
  function firstFrame(error: unknown): string {
    const stack = error instanceof Error ? (error.stack ?? '') : '';

    return stack.split('\n').find((line) => line.trimStart().startsWith('at ')) ?? '';
  }

  function lineOf(frame: string): number {
    return Number(/:(\d+):\d+\)?$/.exec(frame)?.[1]);
  }

  async function failureOf(pending: Promise<unknown>): Promise<Error> {
    return pending.then(
      () => new Error('the helper resolved, so there is no failure to inspect'),
      (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
    );
  }

  it('names the spec file and the exact line the helper was called on', async () => {
    const callSite = new Error();
    const pending = expectEmission(new Subject<number>(), { timeout: 5 });

    const failure = await failureOf(pending);

    expect(firstFrame(failure)).toContain('expect-emission.spec.ts');
    expect(lineOf(firstFrame(failure))).toBe(lineOf(firstFrame(callSite)) + 1);
  });

  it.each([
    ['expectEmission, timing out', () => expectEmission(new Subject<number>(), { timeout: 5 })],
    ['expectEmissions, cut short by completion', () => expectEmissions(of(1), 2, { timeout: 50 })],
    ['expectCompletion, on a stream that keeps running', () => expectCompletion(new Subject<void>(), { timeout: 5 })],
    ['expectNoEmission, on a stream that emits', () => expectNoEmission(of(1), { timeout: 5 })],
    ['expectError, on a stream that completes instead', () => expectError(of(1), { timeout: 50 })],
  ])('holds for %s', async (_case, start) => {
    const failure = await failureOf(start());

    expect(firstFrame(failure)).toContain('expect-emission.spec.ts');
    expect(firstFrame(failure)).not.toContain('src/lib/expect-emission.ts');
    expect(firstFrame(failure)).not.toContain('node_modules');
  });

  it('anchors the wrapper of a source error while leaving the original untouched', async () => {
    const original = new Error('boom');
    const stackBefore = original.stack;
    const source$ = new Subject<number>();

    setTimeout(() => source$.error(original), 1);

    const failure = await failureOf(expectEmission(source$, { timeout: 50 }));

    expect(failure.cause).toBe(original);
    expect(firstFrame(failure)).toContain('expect-emission.spec.ts');
    expect(original.stack).toBe(stackBefore);
  });

  it('hands `expectError` the error the stream threw with its own stack intact', async () => {
    const original = new Error('websso fail');
    const stackBefore = original.stack;
    const source$ = new Subject<number>();

    setTimeout(() => source$.error(original), 1);

    // Rewriting this one would be a lie: it was created by the code under test, not by a helper.
    await expect(expectError(source$, { timeout: 50 })).resolves.toBe(original);
    expect(original.stack).toBe(stackBefore);
  });
});
