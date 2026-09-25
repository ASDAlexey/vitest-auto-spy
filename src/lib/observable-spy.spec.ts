/**
 * A function spy owns one return-value container for its whole life, and the promise helpers
 * publish onto it flags (`_isRejectedPromise`, `valuesPerCalls`) that the dispatcher reads *before*
 * the plain value. These specs pin that the observable helpers take those leftovers down when they
 * publish, so the configuration written last is the one that answers — `rejectWith` used to win
 * forever, silently ignoring every `nextWith` after it.
 */
import { type Observable, firstValueFrom } from 'rxjs';
import { beforeAll, describe, expect, it } from 'vitest';

import { createSpyFromClass } from './create-spy-from-class';
import { createFunctionSpy } from './function-spy';
import { setMisconfigurationReaction } from './misconfiguration';
import { registerMockAdapter } from './mock-adapter';
import {
  addObservableHelpersToCalledWithObject,
  addObservableHelpersToFunctionSpy,
  createFunctionSpyStream,
  createObservablePropSpy,
} from './observable-spy';
import { registerObservableSupport } from './observable-support';
import { mockValueProp } from './prop-mock';
import { resetAutoSpy } from './reset-auto-spy';
import { vitestMockAdapter } from './vitest-adapter';

beforeAll(() => {
  registerMockAdapter(vitestMockAdapter);
  registerObservableSupport({
    addToFunctionSpy: addObservableHelpersToFunctionSpy,
    streamForFunctionSpy: createFunctionSpyStream,
    addToCalledWithObject: addObservableHelpersToCalledWithObject,
    createPropSpy: createObservablePropSpy,
  });
});

/** The promise helpers sit on every function spy; the typed surface only exposes them on a promise-returning one. */
interface PromiseHelpers {
  rejectWith(value?: unknown): void;
  resolveWithPerCall(configs: { delay?: number; value: unknown }[]): void;
}

/** A spy of a method the specs configure through both the promise and the observable helpers. */
function createMixedSpy(): PromiseHelpers & ReturnType<typeof createFunctionSpy<() => Observable<string>>> {
  return createFunctionSpy<() => Observable<string>>('load') as PromiseHelpers &
    ReturnType<typeof createFunctionSpy<() => Observable<string>>>;
}

describe('observable helpers, publishing over a previous configuration', () => {
  it('lets nextWith override an earlier rejectWith instead of being ignored', async () => {
    const load = createMixedSpy();

    load.rejectWith(new Error('stale'));
    load.nextWith('fresh');

    await expect(firstValueFrom(load())).resolves.toBe('fresh');
  });

  it('lets nextWith override an earlier per-call batch', async () => {
    const load = createMixedSpy();

    load.resolveWithPerCall([{ value: 'stale' }]);
    load.nextWith('fresh');

    await expect(firstValueFrom(load())).resolves.toBe('fresh');
  });

  it('lets nextWithPerCall override an earlier rejectWith', async () => {
    const load = createMixedSpy();

    load.rejectWith(new Error('stale'));
    load.nextWithPerCall([{ value: 'fresh' }]);

    await expect(firstValueFrom(load())).resolves.toBe('fresh');
  });

  it('does the same on a calledWith chain, which reuses one container across its own helpers', async () => {
    const load = createMixedSpy();
    const chain = load.calledWith();

    chain.nextWithPerCall([{ value: 'stale' }]);
    chain.nextWith('fresh');

    await expect(firstValueFrom(load())).resolves.toBe('fresh');
  });
});

describe('the backing subject does not outlive the configuration that filled it', () => {
  class AccountService {
    createTransition(): Observable<string> {
      throw new Error('not implemented in the double');
    }
  }

  /** Everything one subscription saw, without an `expect` inside a `subscribe` callback. */
  function record(source$: Observable<string>): { values: string[]; error?: unknown; completed: boolean } {
    const seen: { values: string[]; error?: unknown; completed: boolean } = { values: [], completed: false };

    source$.subscribe({
      next: (value) => seen.values.push(value),
      error: (error) => (seen.error = error),
      complete: () => (seen.completed = true),
    });

    return seen;
  }

  it('does not replay a previous configuration ahead of a `throwWith`', () => {
    // The quietest defect this library has had: the `ReplaySubject(1)` was created once per spy and
    // kept its buffer for the life of the spy, so a value configured for one test arrived first in
    // the next one — the code under test walked the SUCCESS branch on stale data, and the failure
    // the test was written for came one emission late, if at all.
    const service = createSpyFromClass(AccountService);
    const failure = new Error('boom');

    service.createTransition.nextWith('uri://stale');
    resetAutoSpy(service);
    service.createTransition.throwWith(failure);

    const seen = record(service.createTransition());

    expect(seen.values).toEqual([]);
    expect(seen.error).toBe(failure);
  });

  it('starts a new stream after `throwWith` closed the old one', () => {
    // `error()` and `complete()` close a Subject permanently, so every later `nextWith` pushed into
    // a dead subject and emitted nothing at all — silence where the spec had configured a value.
    const service = createSpyFromClass(AccountService);

    service.createTransition.throwWith(new Error('boom'));
    service.createTransition.nextWith('uri://after');

    expect(record(service.createTransition()).values).toEqual(['uri://after']);
  });

  it('starts a new stream after `complete()` too', () => {
    const service = createSpyFromClass(AccountService);

    service.createTransition.complete();
    service.createTransition.nextWith('uri://after');

    expect(record(service.createTransition()).values).toEqual(['uri://after']);
  });

  it('starts a new stream after `nextOneTimeWith`, which completes as well', () => {
    const service = createSpyFromClass(AccountService);

    service.createTransition.nextOneTimeWith('first');
    service.createTransition.nextOneTimeWith('second');

    expect(record(service.createTransition()).values).toEqual(['second']);
  });

  it('keeps "emit, then fail" working inside one test', () => {
    // The sequence the fix must not break: within a test both calls are one story, and only a
    // reset (or a terminal call) starts a new one.
    const service = createSpyFromClass(AccountService);
    const failure = new Error('later');

    service.createTransition.nextWith('a');
    service.createTransition.throwWith(failure);

    const seen = record(service.createTransition());

    expect(seen.values).toEqual(['a']);
    expect(seen.error).toBe(failure);
  });

  it('does the same for an observable property spy', () => {
    class Store {
      products$!: Observable<string>;
    }

    const store = createSpyFromClass(Store, { observablePropsToSpyOn: ['products$'] });

    store.products$.complete();
    store.products$.nextWith('after');

    expect(record(store.products$).values).toEqual(['after']);
  });

  it('starts a new stream after a spec closed the subject it was handed', () => {
    // `returnSubject()` hands the same subject to the spec, and AGENTS.md offers it "for anything
    // the helpers miss". A `complete()` called on it left the target believing the stream was open,
    // so the next `nextWith` pushed into a dead subject and its value was lost without a word.
    const service = createSpyFromClass(AccountService);

    service.createTransition.returnSubject().complete();
    service.createTransition.nextWith('uri://after');

    expect(record(service.createTransition()).values).toEqual(['uri://after']);
  });

  it('starts a new stream after a spec errored the subject it was handed', () => {
    const service = createSpyFromClass(AccountService);

    service.createTransition.returnSubject().error(new Error('closed by the spec'));
    service.createTransition.nextWith('uri://after');

    const seen = record(service.createTransition());

    expect(seen.values).toEqual(['uri://after']);
    expect(seen.error).toBeUndefined();
  });
});

describe('nextWithValues on a property somebody is already subscribed to', () => {
  class Feed {
    items$!: Observable<number>;
  }

  it('says so, once, instead of emitting into a stream nobody is on', () => {
    const feed = createSpyFromClass(Feed, { observablePropsToSpyOn: ['items$'] });
    const seen: number[] = [];
    const warnings: string[] = [];
    const restore = mockValueProp(console, 'warn', (line: string) => {
      warnings.push(line);
    });

    try {
      // The Angular shape: the component subscribed in `ngOnInit`, and the spec configures the feed
      // afterwards. `nextWithValues` publishes a *new* stream, which `defer` only reads for the
      // next subscription — so these values never reach the subscriber that is already there.
      feed.items$.subscribe((value) => seen.push(value));
      feed.items$.nextWithValues([{ value: 1 }, { value: 2 }]);
      feed.items$.nextWithValues([{ value: 3 }]);
    } finally {
      restore();
    }

    expect(seen).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('[vitest-auto-spy] items$.nextWithValues() ran after something subscribed to items$');
    expect(warnings[0]).toMatch(
      /Call nextWithValues\(\) before the code under test subscribes[\s\S]*\nDocs: \S+\/runtimes\/rxjs#nextwith-pushes-nextwithvalues-republishes$/,
    );
  });

  it('names the property it was built for, and throws on every late call under the throw grade', () => {
    const items$ = createObservablePropSpy<number>(undefined, 'Feed.items$');

    items$.subscribe(() => undefined);
    setMisconfigurationReaction('throw');

    try {
      expect(() => items$.nextWithValues([{ value: 1 }])).toThrow(
        '[vitest-auto-spy] Feed.items$.nextWithValues() ran after something subscribed to Feed.items$',
      );
      expect(() => items$.nextWithValues([{ value: 2 }])).toThrow('Feed.items$.nextWithValues()');
    } finally {
      setMisconfigurationReaction(undefined);
    }
  });

  it('falls back to a generic label for a property spy built without a name', () => {
    const items$ = createObservablePropSpy<number>();

    items$.subscribe(() => undefined);
    setMisconfigurationReaction('throw');

    try {
      expect(() => items$.nextWithValues([{ value: 1 }])).toThrow(
        '[vitest-auto-spy] this observable property.nextWithValues() ran after something subscribed to this observable property',
      );
    } finally {
      setMisconfigurationReaction(undefined);
    }
  });

  it('stays quiet when the property is configured before anybody subscribes', () => {
    const feed = createSpyFromClass(Feed, { observablePropsToSpyOn: ['items$'] });
    const warnings: string[] = [];
    const restore = mockValueProp(console, 'warn', (line: string) => {
      warnings.push(line);
    });

    try {
      feed.items$.nextWithValues([{ value: 1 }]);
    } finally {
      restore();
    }

    expect(warnings).toEqual([]);
  });

  it('stays quiet for a function spy, whose stream is read per call', () => {
    const load = createFunctionSpy<() => Observable<string>>('load');
    const warnings: string[] = [];
    const restore = mockValueProp(console, 'warn', (line: string) => {
      warnings.push(line);
    });

    try {
      load.returnSubject().subscribe(() => undefined);
      load.nextWithValues([{ value: 'a' }]);
    } finally {
      restore();
    }

    expect(warnings).toEqual([]);
  });
});

describe('nextWithValues on a falsy value', () => {
  class Flags {
    isEnabled(): Observable<boolean> {
      throw new Error('not implemented in the double');
    }

    count(): Observable<number> {
      throw new Error('not implemented in the double');
    }
  }

  /** Everything one subscription saw, without an `expect` inside a `subscribe` callback. */
  function collect<T>(source$: Observable<T>): { values: T[]; error?: unknown; completed: boolean } {
    const seen: { values: T[]; error?: unknown; completed: boolean } = { values: [], completed: false };

    source$.subscribe({
      next: (value) => seen.values.push(value),
      error: (error) => (seen.error = error),
      complete: () => (seen.completed = true),
    });

    return seen;
  }

  it('emits `false`, which a truthiness check used to drop', () => {
    // `{ value: false }` is an ordinary boolean stream, and it emitted nothing at all: the entry was
    // mapped to EMPTY, so the subscriber kept its initial state and the test failed — if it failed —
    // somewhere else entirely.
    const flags = createSpyFromClass(Flags);

    flags.isEnabled.nextWithValues([{ value: false }]);

    expect(collect(flags.isEnabled()).values).toEqual([false]);
  });

  it('emits `0` and an empty string just the same', () => {
    const flags = createSpyFromClass(Flags);

    flags.count.nextWithValues([{ value: 0 }, { value: Number.NaN }]);

    expect(collect(flags.count()).values).toEqual([0, Number.NaN]);
  });

  it('honours a delay on a falsy value rather than skipping the entry', async () => {
    const flags = createSpyFromClass(Flags);

    flags.isEnabled.nextWithValues([{ delay: 1, value: false }]);

    const seen = collect(flags.isEnabled());

    expect(seen.values).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen.values).toEqual([false]);
  });

  it('throws a falsy error value instead of ignoring the entry', () => {
    const flags = createSpyFromClass(Flags);

    flags.isEnabled.nextWithValues([{ errorValue: '' }]);

    expect(collect(flags.isEnabled()).error).toBe('');
  });

  it('still treats an entry that is neither a value nor an error as nothing to emit', () => {
    // `{ complete: false }` carries no `value` and no `errorValue`, so it maps to EMPTY — the branch
    // the presence checks leave standing.
    const flags = createSpyFromClass(Flags);

    flags.isEnabled.nextWithValues([{ complete: false }, { value: true }]);

    expect(collect(flags.isEnabled()).values).toEqual([true]);
  });
});

/**
 * The stream helpers on a function spy are shared functions that find the spy's stream state
 * through its mark — one set for the run, not seven closures per method. A detached call has no
 * spy to configure and fails at the call, naming the helper.
 */
describe('stream helpers are methods of their spy', () => {
  it('refuses a helper destructured off its spy', () => {
    const load = createFunctionSpy<() => Observable<string>>('load');
    const { nextWith } = load;

    expect(() => nextWith('value')).toThrow(/nextWith was called off its spy/);
  });

  it('refuses a receiver that is not an object, or one that carries no stream state', () => {
    const load = createFunctionSpy<() => Observable<string>>('load');

    expect(() => load.complete.call(undefined)).toThrow(/complete was called off its spy/);
    expect(() => load.throwWith.call(null, new Error('x'))).toThrow(/throwWith was called off its spy/);
    expect(() => load.nextWithPerCall.call({}, [{ value: 'x' }])).toThrow(/nextWithPerCall was called off its spy/);
  });

  it('works once bound, and on a calledWith chain, where the helpers close over their target', async () => {
    const load = createFunctionSpy<(id: number) => Observable<string>>('load');
    const nextWith = load.nextWith.bind(load);

    nextWith('bound');
    load.calledWith(1).nextWith('chained');

    await expect(firstValueFrom(load(2))).resolves.toBe('bound');
    await expect(firstValueFrom(load(1))).resolves.toBe('chained');
  });
});
