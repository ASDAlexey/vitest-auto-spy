---
title: Observable assertions
description: expectEmission, expectEmissions, expectNoEmission and expectCompletion — assertions that fail when the stream stays silent.
---

# Observable assertions

`expect(...)` inside a `subscribe()` callback is the most common way to write a test that passes
while asserting nothing: if the stream never emits, the callback never runs, no expectation is
evaluated and the test is green and empty. These helpers invert that — **the assertion is the
`await`**.

```ts
import { expectCompletion, expectEmission, expectEmissions, expectError, expectNoEmission } from 'vitest-auto-spy';

await expect(expectEmission(component.visible$)).resolves.toBe(true); // the first VALUE, not a list
await expect(expectEmission(tasks$)).resolves.toEqual({ id: 1 }); // the task itself, not `[task]`
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]); // the list is this one
await expectNoEmission(source$, { timeout: 50 }); // asserts silence
await expectCompletion(service.purgeCache()); // asserts termination
```

| Helper                                   | Resolves with                        | Rejects when                                                                |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `expectEmission(source$, opts?)`         | the first value                      | nothing arrives in time, the stream errors, or it completes empty           |
| `expectEmissions(source$, count, opts?)` | the first `count` values as an array | fewer than `count` arrive in time, the stream errors, or it completes short |
| `expectNoEmission(source$, opts?)`       | `void`                               | anything is emitted while it should stay silent                             |
| `expectCompletion(source$, opts?)`       | `void`                               | the stream is still running when the timeout expires, or it errors          |
| `expectError(source$, opts?)`            | the error, unwrapped                 | the stream completes or stays quiet instead of failing                      |

The hand-written form of the third row — a `let` the `subscribe` callback fills, asserted with
`toEqual([])` against its own initialiser — is what
[`no-vacuous-absence-assertion`](/utilities/eslint-rules#no-vacuous-absence-assertion) reports: it
passes whether the stream emitted the empty list or emitted nothing, and `expectNoEmission` is the
half of that which fails when something arrives.

## The `await` is not optional

Each helper subscribes at the call and settles through the promise, so a call nobody awaits is a
subscription nobody closes and an assertion nobody made. That used to run on into the **next** test,
where a cold HTTP stream or `router.events` went on feeding it until its watchdog rejected —
unhandled, and blamed on a test that had nothing to do with it.

Every wait still open at the end of a test is therefore torn down by
[`setupAutoSpy()`](/utilities/setup), ahead of every other teardown step, and named:

```text
[vitest-auto-spy] 1 emission helper(s) were never awaited in this test (saved$). The subscription is
torn down now, but the assertion never ran.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/observable-assertions
```

Its promise is left unsettled rather than rejected — its test is over, and nothing is left to catch
it. The line is the repair: `await` the call, or hold it in a variable and await that before the
test ends.

## The emitted type is inferred

`expectEmission(of(1))` is a `Promise<number>`, and `expectEmissions(of(1), 2)` a `Promise<number[]>`
— including through Angular's `toObservable()` and through a `Subject` a spec pushes into. Up to
3.4.0 both came back as `Promise<unknown>`: the helper's parameter type matched rxjs's overloaded
`subscribe` in a way that inferred nothing, the call compiled, `resolves.toBe(1)` passed, and the
loss only showed up when somebody read a field off the awaited value. Nothing needs a manual type
argument any more.

## Which sources work

The source is duck-typed, so nothing here depends on rxjs at runtime. Two subscription contracts are
accepted, and both are needed in an Angular codebase:

| Source                                                                  | `subscribe` takes  |
| ----------------------------------------------------------------------- | ------------------ |
| rxjs `Observable` / `Subject`, Angular `toObservable()`, `EventEmitter` | an observer object |
| Angular `output()` — `OutputEmitterRef` — and other callback APIs       | a bare callback    |

The second one used to hang. `OutputEmitterRef.subscribe(callback)` stores whatever it is handed and
calls it on `emit()` inside a `try/catch` that routes failures to Angular's `ErrorHandler`, so
passing it an observer object produced no visible error at all — just
`await expectEmission(component.selectionChange)` waiting for the watchdog.

A source that cannot be subscribed to at all is reported as this helper's own failure, before rxjs
sees it:

```
saved$ is not subscribable ([1,2]). Pass the observable itself, not the value it emits, and check
that the spy feeding it was configured.
```

The two ways to get there are passing the value instead of the stream, and passing a member of a spy
nothing configured. A promise gets its own line — `await` it directly, or pass the observable it came
from — because `firstValueFrom(source$)` handed to a helper by mistake is the common version.

## A synchronous source stops where the wait settles

These helpers subscribe **as a subscriber**, not as a plain observer, so the subscription can be
closed from inside the emission that settles it. That is what `firstValueFrom` does, and it is what
makes the two synchronous cases behave:

```ts
const seen = vi.fn();

await expect(expectEmission(from([1, 2, 3, 4, 5]).pipe(tap(seen)))).resolves.toBe(1);
expect(seen).toHaveBeenCalledTimes(1); // one, not five

await expect(expectEmission(of(1).pipe(repeat()))).resolves.toBe(1); // an endless source, settled
```

Handed a plain observer, rxjs wraps it and hands the subscription back only once `subscribe` has
returned — which for `of`, `from`, `range` and anything with `repeat()` is after the whole sequence
has been produced. Everything the source emitted was then collected although one value was asked
for, every side effect after the accepted value ran, and an endless synchronous source spun inside
`subscribe` where no watchdog can reach it.

So a `tap`, `finalize` or `defer` spy is **not** called for the values after the accepted one. A spec
written against the old behaviour — asserting five `tap` calls where the helper asked for the first
value — now sees one, which is the number the production subscriber would have made.

`expectEmissions(source$, 3)` takes exactly three and stops there, and `expectNoEmission` is settled
by the first emission rather than by the end of the sequence.

## `expectCompletion` — when the value is not the point

A save, a purge, an `Observable<void>`, a `Subject` a teardown closes. `firstValueFrom` rejects such
a stream with rxjs's `EmptyError`, and the workaround people arrive at,
`lastValueFrom(source$, { defaultValue: undefined })`, reads as though the default were the
interesting part when the whole assertion is "it finished".

```ts
await expectCompletion(service.purgeCache());
await expectCompletion(closed$, { label: 'closed$', timeout: 2_000 });
```

Emissions do not fail it — it asserts termination and nothing about what came before. Use
`expectNoEmission` when silence is what matters.

## `expectError` — when the failure is the subject

The other helpers wrap a stream failure in a **new** `Error` whose message names the stream. That is
right for reporting a failure nobody expected, and useless when the failure is the thing under test:
`rejects.toBe(originalError)`, `rejects.toBeInstanceOf(UdmsStatusError)` and an exact
`expect(err.message).toBe('websso fail')` all fail against the wrapper.

`expectError` resolves **with** the error, exactly as it was thrown, so each of those is an ordinary
assertion:

```ts
await expect(expectError(service.load())).resolves.toBe(originalError);
expect(await expectError(process$)).toBeInstanceOf(UdmsStatusError);
```

It waits for the error however late it arrives — a stream that emits first and then fails still
settles here on the failure — and fails, naming the stream, if the stream completes or stays quiet
instead. The wrapped failures of the other helpers now also carry the original on `cause`, so
`rejects.toMatchObject({ cause: original })` works; prefer `expectError`, which needs no unwrapping.
`firstValueFrom(source$).rejects` remains fine too.

## Choosing which emission counts

`skip` and `until` put the interesting condition in the assertion instead of in the source.

```ts
await expect(expectEmission(isXl$, { skip: 1 })).resolves.toBe(true); // a shareReplay / BehaviorSubject
await expect(expectEmission(params$, { until: (p) => p.channelId === expected })).resolves.toEqual(…);
await expect(expectEmissions(ids$, 2, { until: (id) => id > 5 })).resolves.toEqual([6, 7]);
```

`source$.pipe(skip(1))` and `pipe(filter(…))` say the same thing and cost an rxjs import in a spec
whose whole point was that it needed none — but the real difference is the failure. Emissions that
do not match are still **counted**, so a timeout reads `4 emission(s) received` rather than `0`, and
"the wrong thing fired" stays distinguishable from "nothing fired". A `filter` in front of the helper
throws that away.

Both are decided once per emission, where the value arrives, so an emission-heavy wait costs the
predicate exactly one call per value — see [the performance page](/core/performance). `skip` is part
of the failure too: a wait told to skip five and given two reads
`expected 1 after skipping 5` rather than the bare `expected 1` that made two emissions sound like
plenty.

`expectEmissions(source$, 0)` is refused at the call, with the stack of the spec line that wrote it:
no count below one is something a stream can satisfy, and the wait could only ever have timed out.
Worth knowing for a spec that computes the count —
`expectEmissions(source$, expected.length)` over an empty expectation is that call. Assert silence
with `expectNoEmission(source$)`, which the refusal names.

## `advance` — the window between subscribing and awaiting

A stream driven by a `debounceTime`, a retry or a poll needs the clock moved _after_ something is
listening, and `await` gives control away before the next statement runs:

```ts
await expect(expectEmission(purchased$, { advance: () => vi.runAllTimers() })).resolves.toBe(false);
```

That replaces the shape specs arrive at otherwise — hold the promise in a variable, advance the
clock, then await it — which is correct and breaks silently the moment somebody adds an `await` one
line above it. It is a callback rather than an `advanceTimers: true` flag because these helpers live
in the **core** entry, which contains no test runner: `vi`, `bun:test` and `node:test` drive their
clocks differently, and only the spec knows which one it is on.

It is ordinary spec code — `vi.runAllTimers()`, `fixture.detectChanges()` — and it throws like
ordinary code. A throw rejects the wait as this helper's own failure, naming the callback and
carrying the original on `cause`, and the subscription is torn down with it:

```
purchased$: the `advance` callback threw: Error: no fake timers installed
```

Unguarded, that throw used to come out of the promise raw, with no anchor and no `label` — and for
`expectNoEmission`, whose watchdog is off, nothing closed the subscription for the rest of the run.

## Options

| Option    | Default                             | Notes                                                                                                               |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `timeout` | `1000` (`0` for `expectNoEmission`) | Milliseconds to wait for a value — or, in `expectNoEmission`, how long silence must hold. `0` disables the watchdog |
| `label`   | —                                   | Name used in the failure message instead of the generic "the observable"                                            |
| `skip`    | `0`                                 | Ignore the first `N` emissions — the stale first value of a `shareReplay` / `BehaviorSubject`                       |
| `until`   | —                                   | Wait for the first emission satisfying the predicate; the others are still counted in the failure                   |
| `advance` | —                                   | Run once, after the subscription exists and before the promise is handed back                                       |

`{ timeout: Infinity }` — any non-finite value — means "no watchdog", the same as `0`, and reads as
the intent it usually is: wait as long as the runner allows. The timer API tops out at 2³¹−1 ms and
truncates anything above that to 1 ms, so a wait asked for forever used to fail after one
millisecond.

### The watchdog runs on real time — even under fake timers

That is deliberate, and there are two reasons. The helper _is_ the assertion, so its clock must be
the one thing a spec cannot stop; and a virtual watchdog would race the timers the spec advances —
`expectEmission(source$, { timeout: 200 })` followed by `vi.advanceTimersByTime(5_000)` would fire at
200 virtual ms and reject the stream the spec was about to advance into.

The cost is that in a suite running under global fake timers a _failing_ assertion spends a real
second before it reports. Do not answer that with `{ timeout: 0 }` at every call site: that disables
the watchdog, and the next silent stream hangs until the runner's own timeout with no message worth
reading. Lower the default once instead:

```ts
// vitest.setup.ts
import { setEmissionTimeout } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ globalFakeTimers: true });
setEmissionTimeout(100); // the clock is frozen; a real second buys nothing
```

`setEmissionTimeout` is process-wide and does not touch `expectNoEmission`, whose wait is a quiet
window rather than a watchdog. It refuses `NaN` and a negative number: either one used to be
accepted and then silently disable every watchdog in the run — the failure the whole option exists
to prevent, installed by the line meant to tune it. `0` and `Infinity` are the two ways to ask for
that on purpose.

#### zone.js is the one faker a capture does not escape

Capturing `setTimeout` at import time is enough for `vi.useFakeTimers()`, which replaces the global
afterwards. It is not enough for zone.js, which replaces it while it loads — long before this
package — and whose replacement picks its scheduler from `Zone.current` at **call** time. The
watchdog therefore used to land in the virtual queue inside `fakeAsync`, where
`tick(1_500)` towards a `debounceTime(2_000)` rejected the very stream it was advancing.

zone.js keeps the untouched function under `__zone_symbol__setTimeout`, and that is the one the
watchdog takes when a zone is loaded. So the sentence above is now true under a zone as well: the
wait is real time, and no `tick()` a spec writes can expire it. Without zone.js nothing changes.

## Failure messages

A stream that stays quiet fails with the label and the timeout, one that errors fails with the
error, and one that completes empty says so:

```
saved$ did not emit within 1000 ms (0 emission(s) received). Either the stream never fired — check
the trigger and any provider spy feeding it — or it is slower than the timeout; raise it with
`{ timeout: … }`. This wait is real time even under fake timers, on purpose: a virtual watchdog would
race the timers your spec advances. Lower it with `setEmissionTimeout(100)` in the setup file rather
than disabling it with `{ timeout: 0 }`, which leaves the next silent stream with no message at all.
```

```
saved$ completed after 0 emission(s), expected 1. A completed-but-empty stream is the usual sign
that the value was produced before the subscription.
```

Three more say that the call itself was wrong rather than the stream: a source that is not
subscribable, an `advance` callback that threw, and `expectEmissions(source$, 0)`, which is refused
at the call. Each is shown with the option it belongs to, above. Where `skip` is in play the
expectation is spelled out too — `expected 1 after skipping 5`, rather than a bare `expected 1` over
a stream that emitted twice.

### The code frame opens your spec line

These helpers build their failure inside a `subscribe` or timer callback, long after the call
returned — so the stack the runner saw used to start in `node_modules/vitest-auto-spy/…` and carry
no spec frame at all, and the code frame in the report pointed at this package. The stack is now
captured at helper entry, before anything subscribes, and pinned onto the failure when it is finally
built, so the frame the reporter opens is the `await expectEmission(…)` line in your spec.

Only the errors these helpers make themselves are re-anchored. The error
[`expectError`](#expecterror-—-when-the-failure-is-the-subject) resolves with belongs to the code under
test and keeps the stack it was created with — rewriting that one would point the reader away from
where the failure actually happened.

`vi.defineHelper`, which covers a helper that throws while the caller's frame is still on the stack,
cannot serve these: its `__VITEST_HELPER__` frame ends up **last**, and Vitest's parser then drops
the whole stack, code frame included.

## Measured: four forms against four streams

The claim above — that `expect()` inside `subscribe()` is the most common way to write a test that
asserts nothing — is checkable, so here it is checked. One spec file, the same assertion written four
ways, run against four streams: one that emits the wrong value, one that errors, one that completes
without emitting, and one that never does anything.

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

Sixteen tests, every one of them asserting something that is false. Twelve fail:

```text
 Test Files  1 failed (1)
      Tests  12 failed | 4 passed (16)
     Errors  4 errors
```

The four that pass are the four `bare subscribe` rows — all of them, in every scenario.

|                           | `of(1)` — wrong value         | `throwError(boom)`                                 | `EMPTY`                                              | `NEVER`                               |
| ------------------------- | ----------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| 1. bare `subscribe`       | **green** ⁽¹⁾                 | **green** ⁽¹⁾                                      | **green**                                            | **green**                             |
| 2. `new Promise(done)`    | `Test timed out in 1200ms`    | `Test timed out in 1200ms`                         | `Test timed out in 1200ms`                           | `Test timed out in 1200ms`            |
| 3. `await firstValueFrom` | `expected 1 to be 999` + diff | `Error: boom`                                      | `EmptyError: no elements in sequence`                | `Test timed out in 1200ms`            |
| 4. `await expectEmission` | `expected 1 to be 999` + diff | `source$ errored instead of emitting: Error: boom` | `source$ completed after 0 emission(s), expected 1…` | `source$ did not emit within 300 ms…` |

Read the table by column and the ranking is the same in each: form 1 says nothing, form 2 says only
that time ran out, form 3 says what happened, form 4 says what happened **and to which stream**.

⁽¹⁾ Those two are green, not silent. `of(1)` is synchronous, so the assertion does run and does
throw — into a `subscribe` callback, from which rxjs re-throws it out of band. It arrives after the
summary, attributed to whichever test the runner happened to be on:

```text
⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯
Vitest caught 4 unhandled errors during the test run.
AssertionError: expected 1 to be 999
The latest test that might've caused the error is "2. new Promise(done) + subscribe".
```

Exit code 1, no failing test named, and the name it does print belongs to a different test. Then note
what makes the other two columns worse than that: as soon as the source is **asynchronous** — a
`timer()` under fake timers, an `httpResource`, anything behind a scheduler — the callback never runs
at all, nothing is thrown, and the file is entirely, quietly green. The synchronous case is the loud
one.

### How to write it

```ts
// ❌ green whatever the stream does
service.collect().subscribe((result) => {
  expect(result).toEqual(expected);
});

// ❌ Jest's `done` callback, transliterated for Vitest — buys a hang instead of a diff
it('collects', () =>
  new Promise<void>((done) => {
    service.collect().subscribe((result) => {
      expect(result).toEqual(expected);
      done();
    });
  }));

// ✅ plain rxjs, when the source is synchronous or certain to emit
expect(await firstValueFrom(service.collect())).toEqual(expected);

// ✅ when it might not emit — the failure then names the stream and costs the timeout, not the test's
expect(await expectEmission(service.collect(), { label: 'collect()' })).toEqual(expected);
```

The last two are both correct, and `firstValueFrom` is one rxjs import against a library helper — take
it whenever the stream is known to fire. What it cannot do is the `NEVER` column: it hands the runner
a bare timeout, the same failure a subscribe-based test gives, with no observable named and the
default 5 000 ms spent before it arrives. `EmptyError: no elements in sequence` has the same problem
one step down — true, and no help finding which of the four streams in the file was empty.

Both `❌` forms are lintable: [`no-expect-in-subscribe`](../utilities/eslint-plugin) catches the first
and [`no-done-callback`](../utilities/eslint-plugin) the second.

## No rxjs required

The source is duck-typed — anything with a `subscribe` method — so these live in the **core** entry
and pull in no rxjs at runtime. They work with rxjs `Observable`s and `Subject`s, Angular
`toObservable()` results, and hand-rolled subscribables alike.

The watchdog uses the timer functions captured at import time, so `vi.useFakeTimers()` cannot
silence it: the failure stays "the stream did not emit", not "the test timed out". A synchronous
source (`of(…)`, a `BehaviorSubject`) settles and unsubscribes without ever arming the timer.

::: tip Lint it
The [`no-expect-in-subscribe`](../utilities/eslint-plugin) rule flags `expect()` inside a
`subscribe()` callback and points here.
:::
