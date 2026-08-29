import { Subject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type SubscribableLike, expectEmission, expectEmissions, expectNoEmission } from './expect-emission';

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
