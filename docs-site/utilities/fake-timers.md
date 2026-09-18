---
title: Fake timers
description: setupFakeTimers pairs install with restore, and advanceTimers drains the microtasks a bare advance leaves pending.
---

# Fake timers

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

describe('SearchComponent', () => {
  setupFakeTimers();

  it('debounces the query', async () => {
    component.onInput('ab');
    await advanceTimers(300);
    expect(search.query).toHaveBeenCalledWith('ab');
  });
});
```

Two pieces of boilerplate every suite that tests a debounce, a poll or a retry ends up writing, and
the one bug that hides in them.

## `setupFakeTimers(config?)`

Installs the clock in a `beforeEach` and gives it back in an `afterEach`.

Written as two separate hooks, the second is the one a suite forgets — and a frozen clock left
behind leaks into every later file in the same worker, where it surfaces as an unrelated test
hanging on a `setTimeout` that never fires. Pairing them in one call is the whole point.

Both hooks are guarded. Installing or uninstalling twice does not round-trip: a suite that drives
the clock itself, or a nested `describe` that calls this helper again, otherwise reaches a second
`vi.useRealTimers()` — and that one leaves the environment without `clearInterval`, which explodes
during teardown of whichever file happens to run next.

The `afterEach` also puts back any timer global that uninstalling removed rather than restored.
Under happy-dom `Date` is inherited from the environment's realm, so `vi.useRealTimers()` deletes
it instead of reassigning; with `isolate: false` the next file then dies inside Vitest's own
`useFakeTimers`. See [test-run hygiene](./setup#_6-putting-back-timer-globals-the-fakes-took-with-them)
for the whole story, including the standalone `restoreTimerGlobals()`.

The optional `config` is forwarded verbatim to `vi.useFakeTimers()`, typed off Vitest's own
signature so it tracks whatever the installed version accepts:

```ts
setupFakeTimers({ toFake: ['setTimeout'] }); // leave Date and queueMicrotask real
```

**A config is installed, not merely offered.** A call that was given one takes the clock over even
where fakes are already running: a nested `describe` inside a file that armed its own set, a
`describe` under [`globalFakeTimers`](./setup#fake-timers-for-the-whole-run), or a file whose
`beforeAll` called `mockSystemTime()` and so faked nothing but `Date`. Those are the cases where
deferring to whoever got there first means doing the opposite of what the caller asked — with
`Date`-only fakes in place, `setTimeout` stayed real and `advanceTimers(100)` passed having advanced
nothing at all. A call with **no** config of its own still defers, as it always has: an outer
`describe` or a global setup owns the clock and knows what it wanted.

### Taking `setImmediate` out of `toFake`

Vitest's default `toFake` is _every_ timer the environment has except `process.nextTick` and
`queueMicrotask` (Vitest 4.1.9). In Node that includes `setImmediate`, and `setImmediate` is the one
whose absence is felt well outside timer code.

Express's router ends an unmatched request through `setImmediate(done, layerError)`
(`router/index.js:203`). With the clock frozen that callback is queued and never drained, so a
request that should come back `404` sits there until the runner gives up:

```text
Test timed out in 30000ms
```

Nobody reading that on an HTTP call goes looking for a routing mistake — the natural reading is a
hung socket, and the actual defect is three layers away. **A suite that drives a real HTTP handler
wants `setImmediate` out of `toFake`.** Name the ones you want; anything not listed stays real:

```ts
setupFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
```

For a whole run, the same object goes to
[`setupAutoSpy`](./setup#fake-timers-for-the-whole-run):

```ts
setupAutoSpy({ globalFakeTimers: { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] } });
```

Narrowing `toFake` is the fix; `vi.useRealTimers()` inside the file is not. It un-arms the clock the
rest of the file — and, with `betweenTests` or `globalFakeTimers`, the rest of the run — is written
against, and the guarded arming above exists so that reaching for it does not also take teardown
down with it, not to make it a supported way out.

## Between the tests as well — `betweenTests`

```ts
setupFakeTimers(undefined, { betweenTests: true });
```

Off by default, because a scoped call belongs to its `describe` and has to leave the clock as it
found it. Turned on, the clock stays fake in the gaps _between_ tests too — which is what Jest's
`fakeTimers.enableGlobally` did, and what a suite ported from it was written against.

Arming in `beforeEach` alone does not reproduce that, and the gap is not hypothetical: a `beforeAll`
inside a **nested** `describe` runs _after_ the previous test's `afterEach`, so it meets whatever
that hook left behind. A block that prepares its samples there — driving an animation clock with
`vi.advanceTimersByTimeAsync`, say — fails with `A function to advance timers was called but the
timers APIs are not mocked`, in a set whose own tests never touch a timer.

So the fakes are re-armed in `afterEach` right after they come off, and taken off for good in
`afterAll` — the boundary that matters under `isolate: false`, where a clock outliving its file
would meet the next one's imports. Every test still starts fresh: the uninstall discards whatever
the previous one scheduled.

For a whole run, [`setupAutoSpy({ globalFakeTimers: true })`](./setup#fake-timers-for-the-whole-run)
turns this on from the setup file — that option exists for exactly this case and passes
`betweenTests` itself.

## `advanceTimers(ms?)`

`vi.advanceTimersByTime()` plus the step that is easy to miss.

Advancing runs the timer callbacks synchronously — but whatever they _queue_ is still sitting in
the microtask queue when the next line executes: a resolved promise, an `await` continuation, an
RxJS `delay()` handing control back. The assertion then reads state from before the callback
finished, and the test fails in a way that reads like a race in the code under test.

```ts
// Fails like a race in the code under test:
vi.advanceTimersByTime(300);
expect(search.query).toHaveBeenCalled();

// Awaits the queue the callback filled:
await advanceTimers(300);
expect(search.query).toHaveBeenCalled();
```

That is why it is `async` — the return value must be awaited.

It drains the whole queue rather than a fixed couple of turns of it. A `.then().then().then()` chain
a timer callback started was otherwise left one level short, and a timer _scheduled_ from a promise
continuation never ran at all — which is the rxjs `delay()`, retry and poll shape this helper exists
for.

`ms` defaults to `0`: the "run everything already due, then flush microtasks" step, which is what a
`setTimeout(fn, 0)` or a resolved-promise chain needs.

On real timers it throws a message naming the fix, rather than letting Vitest fail deeper in with
"timers are not mocked". It refuses the same way when only the **clock** is faked:
`mockSystemTime()` installs `Date` alone, so there is nothing for the call to advance, and it used
to pass having done nothing. The error names `setupFakeTimers()` as what a test driving timers wants
instead.

::: tip Angular
Pair it with [`stable(fixture)`](../adapters/angular#zoneless-waiting): `advanceTimers` moves the
clock, `stable` flushes the effects and change detection the clock set off.
:::

## Freezing the clock alone

[`mockSystemTime(time)` and `withSystemTime(time, body)`](./event-loop) freeze the clock whether or
not fake timers are already running: with fakes installed they move the fake clock, without them
they install `Date`-only fakes and leave the timers real.

Either way the clock goes back afterwards — under fakes the suite installed too, where the undo was
a no-op and `withSystemTime`'s promise to restore "including on failure" reached nothing. Time the
spec advanced inside the block is kept rather than thrown away: the clock is put back to where it
would have been had the block not set it, not to the instant the block opened.

::: warning `countStrayTimers()` is blind under fake timers
`vi.useFakeTimers()` assigns its own `setTimeout` over the [stray-timer](./setup) wrappers, so every
timer the fake clock hands out bypasses the tracking. `expect(countStrayTimers()).toBe(0)` says
nothing at all about a file running on a frozen clock, and `strayTimers` does not compose with
`globalFakeTimers` or with this helper. `vi.getTimerCount()` is the fake clock's own backlog.
:::
