---
title: Observable assertions
description: expectEmission, expectEmissions, expectNoEmission, expectCompletion and expectError - assertions on a stream that fail when the stream stays silent.
---

# Observable assertions

`expect(...)` inside a `subscribe()` callback passes when the stream never emits: the callback never
runs, so nothing is checked. These helpers turn the wait itself into the assertion. You `await` them,
and they fail with a clear message if the stream stays silent, errors or completes early.

```ts
import { expectEmission, expectError } from 'vitest-auto-spy';

it('updates the total', async () => {
  const total = expectEmission(cart.total$, { skip: 1 }); // start waiting first; skip the current value
  cart.add(item);
  await expect(total).resolves.toBe(42);
});

it('refuses to check out an empty cart', async () => {
  const error = await expectError(cart.checkout());
  expect(error).toEqual(new Error('empty cart'));
});
```

The helpers come from the main `vitest-auto-spy` import and need no rxjs at runtime.

| Helper                                   | Resolves with                          | Fails when                                                                  |
| ---------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `expectEmission(source$, opts?)`         | the first value                        | nothing arrives in time, the stream errors, or it completes empty           |
| `expectEmissions(source$, count, opts?)` | the first `count` values as an array   | fewer than `count` arrive in time, the stream errors, or it completes short |
| `expectAllEmissions(source$, opts?)`     | every value, once the stream completes | the stream does not complete in time, or it errors                          |
| `expectNoEmission(source$, opts?)`       | `void`                                 | anything is emitted while it should stay silent                             |
| `expectNoEmissionSync(source$, opts?)`   | nothing (returns `void`, throws)       | anything arrives while it subscribes and runs `advance`                     |
| `expectCompletion(source$, opts?)`       | `void`                                 | the stream is still running when the timeout expires, or it errors          |
| `expectError(source$, opts?)`            | the error, exactly as thrown           | the stream completes or stays quiet instead of failing                      |

```ts
await expect(expectEmission(component.visible$)).resolves.toBe(true); // the first value, not a list
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]); // a list of three
await expectNoEmission(source$, { timeout: 50 }); // silence for 50 ms
await expectCompletion(service.purgeCache()); // the stream finishes
```

**Common mistake:** triggering the stream before you start waiting. A value emitted before the helper
subscribes is lost, and the wait fails with "the stream completed after 0 emissions" or times out. Call
the helper first, keep the promise, trigger, then `await` it (as in the first example). For a stream
that needs the clock moved, see [`advance`](#advance-—-the-window-between-subscribing-and-awaiting).

## Options

Every helper takes the same options object as its last argument:

| Option    | Default                             | Meaning                                                                                                                                             |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `timeout` | `1000` (`0` for `expectNoEmission`) | ms to wait for a value. In `expectNoEmission`: how long silence must hold; `0` means one macrotask. Elsewhere `0` or `Infinity` means no time limit |
| `label`   | none                                | the stream's name in the failure message, instead of `source$`                                                                                      |
| `skip`    | `0`                                 | ignore the first `N` emissions. A `BehaviorSubject` / `shareReplay` sends its current value on subscribe; `skip: 1` ignores it                      |
| `until`   | none                                | wait for the first emission that passes this predicate; the others are still counted in the failure                                                 |
| `advance` | none                                | a callback run once, after the subscription exists and before the promise is returned                                                               |

To change the default `timeout` for the whole run, call `setEmissionTimeout(ms)` in the setup file (see
[The watchdog runs on real time](#the-watchdog-runs-on-real-time-—-even-under-fake-timers)).

## The `await` is not optional

Each helper subscribes when you call it and reports through the promise. If you do not `await` it,
nobody closes the subscription, and the assertion never happens.

[`setupAutoSpy()`](/utilities/setup) closes every wait still open at the end of a test, before any
other cleanup, and names it:

```text
[vitest-auto-spy] "cart > saves" never awaited 1 emission wait (saved$), so its assertion never ran.
Await it, or return it from the test. Its subscription is torn down now.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/observable-assertions
```

The fix: `await` the call, or keep it in a variable and `await` that before the test ends. The promise
itself is left unsettled, because its test is over and nothing could catch a rejection.

## Choosing which emission counts

`skip` and `until` put the condition in the assertion instead of in the stream:

```ts
await expect(expectEmission(isXl$, { skip: 1 })).resolves.toBe(true); // a shareReplay / BehaviorSubject
await expect(expectEmission(params$, { until: (p) => p.channelId === expected })).resolves.toEqual(…);
await expect(expectEmissions(ids$, 2, { until: (id) => id > 5 })).resolves.toEqual([6, 7]);
```

`source$.pipe(skip(1))` or `pipe(filter(…))` would select the same values, but the failure would be
worse. With the options, values that do not match are still **counted**, so a timeout reads
`4 emissions within 1000 ms` rather than `0 received`. You can tell "the wrong thing fired" from
"nothing fired". The failure also mentions `skip`: `expected 1 after skipping 5`.

The predicate runs once per emission ([performance](/core/performance)).

**Common mistake:** `expectEmissions(source$, 0)`. It is refused at the call, because no stream can
satisfy a count below one. Watch for it when the count is computed, such as
`expectEmissions(source$, expected.length)` with an empty list. To assert silence, use
`expectNoEmission(source$)`.

## `expectCompletion` — when the value is not the point

Use it for a save, a purge, an `Observable<void>`, or a `Subject` that a teardown closes. `firstValueFrom`
rejects such a stream with rxjs's `EmptyError`.

```ts
import { expectCompletion } from 'vitest-auto-spy';

await expectCompletion(service.purgeCache());
await expectCompletion(closed$, { label: 'closed$', timeout: 2_000 });
```

Emitted values do not fail it: it checks only that the stream finished. To check that nothing was
emitted, use `expectNoEmission`.

`expectAllEmissions` also waits for completion, and resolves with **every** value. Use it for "emits
exactly these, and nothing after". `expectEmissions(source$, n)` cannot check that, because it stops
at `n`:

```ts
import { expectAllEmissions } from 'vitest-auto-spy';

await expect(expectAllEmissions(source$.pipe(trueMap()))).resolves.toEqual([true, true]);
```

`skip` and `until` pick which values are collected, as for the other helpers.

## `expectError` — when the failure is the subject

`expectError` resolves **with** the error, exactly as the stream threw it. Use it when the test is
about the error:

```ts
import { expectError } from 'vitest-auto-spy';

await expect(expectError(service.load())).resolves.toBe(originalError);
expect(await expectError(process$)).toBeInstanceOf(UpstreamStatusError);
```

- It waits for the error however late it comes. A stream that emits values first and then fails
  still resolves here.
- It fails, naming the stream, if the stream completes or stays quiet.

The other helpers wrap a stream error in a **new** `Error` that names the stream, so
`rejects.toBe(originalError)` fails against them. The original is on `cause`, so
`rejects.toMatchObject({ cause: original })` works, but `expectError` needs no unwrapping.
`firstValueFrom(source$).rejects` is also fine.

## `expectNoEmissionSync` — silence in a spec with no `await`

`expectNoEmissionSync(source$, { skip, until, advance, label })` checks silence without `await`. It
subscribes, runs `advance`, unsubscribes, and throws right there if anything arrived:

```ts
import { expectNoEmissionSync } from 'vitest-auto-spy';

store.dispatch(noop());
expectNoEmissionSync(store.saved$, { skip: 1 }); // skip the replayed value
```

- It proves silence only for what runs synchronously. A stream that emits on a timer needs the async
  `expectNoEmission`.
- A stream that completes counts as a pass.
- It takes every option except `timeout`. It fails like the async helpers on a stream error, a
  throwing `advance`, or a source that cannot be subscribed to.

## `advance` — the window between subscribing and awaiting

A stream driven by `debounceTime`, a retry or a poll needs the clock moved _after_ something is
listening. `advance` runs right after the helper subscribes:

```ts
await expect(expectEmission(purchased$, { advance: () => vi.runAllTimers() })).resolves.toBe(false);
```

Without it you would keep the promise in a variable, move the clock, then `await`. That works, but
breaks silently as soon as someone adds an `await` above it.

`advance` is a callback, not an `advanceTimers: true` flag, because Vitest, `bun:test` and `node:test`
move their clocks differently, and only your test knows which one it runs on.

If the callback throws, the wait fails with its own message, the original error on `cause`, and the
subscription is closed:

```
purchased$: the `advance` callback threw: Error: no fake timers installed
```

## Which sources work

Anything with a `subscribe` method works; nothing depends on rxjs at runtime. Two ways of subscribing
are accepted, and an Angular project needs both:

| Source                                                                  | `subscribe` takes  |
| ----------------------------------------------------------------------- | ------------------ |
| rxjs `Observable` / `Subject`, Angular `toObservable()`, `EventEmitter` | an observer object |
| Angular `output()` (`OutputEmitterRef`) and other callback APIs         | a plain callback   |

A source that cannot be subscribed to fails with the helper's own message:

```
saved$ is not subscribable ([1,2]). Pass the observable itself, not the value it emits, and check
that the spy feeding it was configured.
```

**Common mistake:** passing the value instead of the stream, or a member of a spy nobody configured.
A `Promise` gets its own message: `await` it directly, or pass the observable it came from. Passing
`firstValueFrom(source$)` by mistake is the usual case.

## The emitted type is inferred

`expectEmission(of(1))` is a `Promise<number>`, and `expectEmissions(of(1), 2)` is a
`Promise<number[]>`. This works through Angular's `toObservable()` and through a `Subject` too. No
type argument is needed.

## A synchronous source stops where the wait settles

The helpers can unsubscribe from inside the emission that settles them, as `firstValueFrom` does. So
a synchronous source stops producing values once the helper has what it needs:

```ts
import { from, of, repeat, tap } from 'rxjs';

const seen = vi.fn();

await expect(expectEmission(from([1, 2, 3, 4, 5]).pipe(tap(seen)))).resolves.toBe(1);
expect(seen).toHaveBeenCalledTimes(1); // one, not five

await expect(expectEmission(of(1).pipe(repeat()))).resolves.toBe(1); // an endless source, settled
```

- A `tap`, `finalize` or `defer` spy is **not** called for values after the accepted one. That is the
  number of calls a real subscriber would cause.
- `expectEmissions(source$, 3)` takes exactly three and stops.
- `expectNoEmission` fails on the first emission, without waiting for the rest of the sequence.

## Failure messages

Every failure starts with the call that failed (`expectEmission(saved$)`, or `expectEmission(source$)`
without a `label`), says what the stream did, and names the one thing to check:

```
[vitest-auto-spy] expectEmission(saved$): no value within 1000 ms (0 received). Nothing triggered the
stream — check the call that should make it emit, or the spy feeding it (`nextWith`).
Docs: https://asdalexey.github.io/vitest-auto-spy/core/observable-assertions#failure-messages
```

| What happened                             | What the message says                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| values arrived, but not the one asked for | counts them and shows the first five: `3 emissions (1, 2, 3) within 1000 ms, expected 1 matching`; points at `until`       |
| too few values                            | `the stream completed after 7 emissions (1, 2, 3, 4, 5, … 2 more), expected 9`                                             |
| did not finish in time                    | `did not complete within 20 ms (3 emissions received: 1, 2, 3)`                                                            |
| completed with nothing                    | the value was most likely emitted before the helper subscribed (see below)                                                 |
| the stream errored                        | quotes the error and points at [`expectError`](#expecterror-—-when-the-failure-is-the-subject); the original is on `cause` |
| `expectNoEmission` got a replayed value   | names it as a replay (`BehaviorSubject`, `shareReplay`, `startWith`) and suggests `{ skip: 1 }`                            |
| `expectNoEmission` got a later value      | puts it down to something the test ran                                                                                     |
| `skip` was set                            | `expected 1 after skipping 5`                                                                                              |
| the call itself was wrong                 | a source that is not subscribable, an `advance` that threw, `expectEmissions(source$, 0)` (see above)                      |

A stream that completes empty almost always emitted before anything listened:

```
[vitest-auto-spy] expectEmission(saved$): the stream completed after 0 emissions, expected 1. The value
was most likely emitted before this subscribed: start the wait first (hold the promise), then trigger.
```

Under fake timers a timeout adds one sentence, because a frozen clock is then the likeliest reason the
stream stayed quiet. With real timers it is not printed:

```
… Timers are fake and 2 callbacks wait on it: advance them inside the wait,
`{ advance: () => vi.advanceTimersByTime(ms) }` — this watchdog runs on real time and never advances them.
```

### The code frame opens your spec line

The failure points at the `await expectEmission(…)` line in your spec, not at library code. The helper
records the stack when you call it and attaches it to the failure it builds later.

Only the helpers' own errors get this. The error that `expectError` resolves with belongs to the code
under test and keeps its original stack, so it still points where the failure happened.

### The watchdog runs on real time — even under fake timers

The time limit uses the real clock, even when the test uses fake timers. The helper _is_ the
assertion, so a test must not be able to stop its clock. A fake-clock limit would also race the timers
the test advances: `expectEmission(source$, { timeout: 200 })` followed by
`vi.advanceTimersByTime(5_000)` would expire at 200 fake ms, before the value the test was advancing
towards.

The cost: with global fake timers, a _failing_ wait takes one real second to report. Do not answer that
with `{ timeout: 0 }` on every call; that removes the limit, and the next silent stream hangs until the
runner's own timeout with no useful message. Lower the default once instead:

```ts
// vitest.setup.ts
import { setEmissionTimeout } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ globalFakeTimers: true });
setEmissionTimeout(100); // the clock is frozen; a real second buys nothing
```

- `setEmissionTimeout` applies to the whole process. It does not affect `expectNoEmission`, whose wait
  is a quiet window, not a limit.
- It refuses `NaN` and negative numbers. `0` and `Infinity` turn the limit off on purpose.
- The timer API cannot wait longer than 2³¹−1 ms, so any non-finite `timeout` means "no limit", the
  same as `0`.

#### zone.js is the one faker a capture does not escape

The helpers keep the real `setTimeout` from import time, so `vi.useFakeTimers()` cannot stop the
limit. zone.js replaces `setTimeout` earlier, while it loads. So when zone.js is present, the helpers use
the original function that zone.js keeps under `__zone_symbol__setTimeout`. Inside `fakeAsync`, no
`tick()` can expire the limit either. Without zone.js nothing changes.

## No rxjs required

The helpers accept anything with a `subscribe` method, so they live in the main `vitest-auto-spy`
import and load no rxjs at runtime. They work with rxjs `Observable`s and `Subject`s, Angular
`toObservable()` results and hand-written subscribables.

The time limit uses the timer functions kept at import time, so `vi.useFakeTimers()` cannot silence it:
the failure stays "the stream did not emit", not "the test timed out". A synchronous source (`of(…)`,
a `BehaviorSubject`) settles and unsubscribes without starting the timer.

::: tip Lint it
The [`no-expect-in-subscribe`](../utilities/eslint-plugin) rule flags `expect()` inside a
`subscribe()` callback and points here. The hand-written form of `expectNoEmission` (a `let` the
callback fills, checked with `toEqual([])`) is what
[`no-vacuous-absence-assertion`](/utilities/eslint-rules#no-vacuous-absence-assertion) reports: it
passes whether the stream emitted an empty list or nothing at all.
:::

## Measured: four forms against four streams

In short: `expect()` inside `subscribe()` passed in all four cases below, although every assertion was
false. `await expectEmission` failed in all four and named the stream.

The test: one spec file, the same false assertion written four ways, run against four streams. One
emits the wrong value, one errors, one completes without emitting, and one never does anything.

```ts
const scenarios = {
  wrongValue: () => of(1),
  errors: () => throwError(() => new Error('boom')),
  completesEmpty: () => EMPTY,
  neverEmits: () => NEVER,
};

for (const [name, make] of Object.entries(scenarios)) {
  describe(name, () => {
    it('1. bare subscribe', () => {
      make().subscribe((v) => expect(v).toBe(999));
    });

    it(
      '2. new Promise(done) + subscribe',
      () =>
        new Promise<void>((done) => {
          make().subscribe((v) => {
            expect(v).toBe(999);
            done();
          });
        }),
      1200,
    );

    it('3. await firstValueFrom', async () => {
      expect(await firstValueFrom(make())).toBe(999);
    }, 1200);

    it('4. await expectEmission', async () => {
      expect(await expectEmission(make(), { label: 'source$', timeout: 300 })).toBe(999);
    }, 1200);
  });
}
```

Sixteen tests, each asserting something false. Twelve fail:

```text
 Test Files  1 failed (1)
      Tests  12 failed | 4 passed (16)
     Errors  4 errors
```

The four that pass are the four `bare subscribe` tests, one in every scenario.

|                           | `of(1)`: wrong value          | `throwError(boom)`                                                              | `EMPTY`                                                                        | `NEVER`                                                         |
| ------------------------- | ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1. bare `subscribe`       | **green** ⁽¹⁾                 | **green** ⁽¹⁾                                                                   | **green**                                                                      | **green**                                                       |
| 2. `new Promise(done)`    | `Test timed out in 1200ms`    | `Test timed out in 1200ms`                                                      | `Test timed out in 1200ms`                                                     | `Test timed out in 1200ms`                                      |
| 3. `await firstValueFrom` | `expected 1 to be 999` + diff | `Error: boom`                                                                   | `EmptyError: no elements in sequence`                                          | `Test timed out in 1200ms`                                      |
| 4. `await expectEmission` | `expected 1 to be 999` + diff | `expectEmission(source$): the stream errored instead of emitting: Error: boom…` | `expectEmission(source$): the stream completed after 0 emissions, expected 1…` | `expectEmission(source$): no value within 300 ms (0 received)…` |

Each column ranks the same way: form 1 says nothing, form 2 says only that time ran out, form 3 says
what happened, and form 4 says what happened **and to which stream**.

⁽¹⁾ These two are green, but not silent. `of(1)` is synchronous, so the assertion runs and throws,
inside a `subscribe` callback. rxjs rethrows it outside the test. It arrives after the summary,
attributed to whichever test happened to be running:

```text
⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯
Vitest caught 4 unhandled errors during the test run.
AssertionError: expected 1 to be 999
The latest test that might've caused the error is "2. new Promise(done) + subscribe".
```

The exit code is 1, but no failing test is named, and the test it does name is a different one. With
an **asynchronous** source (a `timer()` under fake timers, an `httpResource`, anything behind a
scheduler) it is worse: the callback never runs, nothing is thrown, and the file is quietly green.

### How to write it

```ts
// ❌ green whatever the stream does
service.collect().subscribe((result) => {
  expect(result).toEqual(expected);
});

// ❌ Jest's `done` callback, ported to Vitest: a hang instead of a diff
it('collects', () =>
  new Promise<void>((done) => {
    service.collect().subscribe((result) => {
      expect(result).toEqual(expected);
      done();
    });
  }));

// ✅ plain rxjs, when the source is synchronous or certain to emit
expect(await firstValueFrom(service.collect())).toEqual(expected);

// ✅ when it might not emit: the failure names the stream and costs the helper's timeout, not the test's
expect(await expectEmission(service.collect(), { label: 'collect()' })).toEqual(expected);
```

Both `✅` forms are correct. Use `firstValueFrom` whenever the stream is known to emit. It cannot
handle the `NEVER` column: the runner reports a bare timeout, with no stream named, after its default
5 000 ms. `EmptyError: no elements in sequence` has a similar problem: it is true, but does not say
which stream in the file was empty.

Both `❌` forms are caught by lint rules: [`no-expect-in-subscribe`](../utilities/eslint-plugin) and
[`no-done-callback`](../utilities/eslint-plugin).
