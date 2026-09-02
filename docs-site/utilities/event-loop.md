---
title: Waiting and the clock
description: flushEventLoop, flushEventLoopUntil, settleDynamicImport, mockSystemTime and useCountingClock — four pending queues, and the tool that drives each.
---

# Waiting and the clock

```ts
import { flushEventLoop, settleDynamicImport } from 'vitest-auto-spy';

fixture.debugElement.query(By.css('.open')).nativeElement.click(); // production: await import(…)
await settleDynamicImport(() => import('./profile-select.modal'));

expect(dialog.open).toHaveBeenCalled();
```

## Four queues

Under Jest these were hard to tell apart, because `import()` was compiled to `require()` and fake
timers were usually global. Under Vitest with a real bundler they are four separate mechanisms, and
a test that waits on the wrong one fails with a message that names none of them.

| What is pending                               | What drives it                                     | What does **not**                         |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| change detection                              | `fixture.detectChanges()`                          | anything `await`ed                        |
| effects, `afterNextRender`, then CD           | `await stable(fixture)`                            | `detectChanges()` alone                   |
| timers, debounces, polling                    | `await advanceTimers(ms)`                          | `await Promise.resolve()`                 |
| a dynamic `import()`, native `async` in a dep | `await flushEventLoop()` / `settleDynamicImport()` | `tick()`, `flushMicrotasks()`, microtasks |

## `flushEventLoop(turns?)`

Gives the runtime real event-loop turns, whatever the timers are doing, without touching the clock.

A suite carried over from Jest usually runs with fake timers on for every test, and that leaves no
obvious way to say "let the runtime breathe once":

- `await Promise.resolve()`, any number of times, only drains microtasks. It never advances a
  dynamic `import()`, and it never advances a native `async` function inside `node_modules` —
  both continue on a task, not a microtask.
- `setTimeout` is the fake one, so scheduling through it schedules nothing.
- `await vi.advanceTimersByTimeAsync(0)` does work, but it reads as "move the timers" in a test that
  has no timers, so the next reader deletes it as noise. That is not hypothetical: it is what
  happened to the hand-rolled version of this helper in the suite that motivated it.

Internally it schedules a `MessageChannel` task, which no fake-timer implementation replaces. It
yields a _task_ turn, and deliberately does not run pending `setTimeout` callbacks — those are a
different task source, and a helper that fired them too would be `advanceTimersByTime` under another
name.

It is not the answer for `httpResource()` / `resource()` / `rxResource`, which need a
change-detection **tick** rather than an event-loop turn —
[`settleResource()`](../adapters/angular#resources-httpresource-and-resource) is that wait. What this
helper is right for is the case one step below: work whose delivery crosses the boundary between
zone-patched promises and native ones, where a fixed number of `await Promise.resolve()` calls is a
guess that happens to hold until it does not.

## `flushEventLoopUntil(isDone, options?)`

```ts
client.warmUp();

await flushEventLoopUntil(() => client.isReady(), { label: 'the SDK handshake' });

expect(client.session()).toBeDefined();
```

Takes real turns until the condition holds, then stops — the shape behind every hand-rolled
"settle" helper: a lazily-loaded chunk becoming reachable, an SDK reporting itself ready, a queue
draining.

::: warning Not for an Angular resource
This page used to show `httpResource()` here, and that example never worked. `flushEventLoopUntil`
takes event-loop turns and never **ticks**, and an `httpResource` issues no request at all until
something does — measured, a resource awaited this way finishes the whole budget having made zero
requests, then fails saying the condition was never met.
[`settleResource()`](../adapters/angular#resources-httpresource-and-resource) from
`vitest-auto-spy/angular` is that wait.
:::

Written by hand that is a fixed number of turns, tuned by trial until the suite goes green, which is
both slower than it needs to be (it always waits the maximum) and quietly fragile — one more
hand-off inside a dependency and the number is wrong again.

The turn budget (20 by default) is what separates this from a `while (true)`. A condition that never
becomes true is the normal way to use it wrongly — the request was never made, the stub was never
configured — and a test that hangs until the runner's timeout reports the file, not the wait. The
failure names the `label` instead:

```text
[vitest-auto-spy] flushEventLoopUntil: the SDK handshake was still not ready after 20 real
event-loop turns. Three causes, in the order they turn out to be true. The work started but a
dynamic `import()` had not finished … Or the work never started …. Or it is waiting on a timer
rather than on the event loop — timers stay frozen here, and only `advanceTimers()` moves them.
```

The first of the three is the one that costs the most time to diagnose, which is why it is named
first: a **cold** chunk takes more turns than the budget, and the giveaway is that only the _first_
such test in a file fails while every later one passes off the module cache. That reads as a flake,
and it is not — the answer is to await the module rather than count turns, with
[`settleDynamicImport`](#settledynamicimport-load-turns) below.

## `settleDynamicImport(load, turns?)`

```ts
const module = await settleDynamicImport(() => import('@scope/lazy-feature'));
```

Two situations, one mechanism.

Production code that does `await import('./thing')` on a click leaves the spec with no promise to
await. Awaiting the _same_ specifier here resolves against the same module instance, and the real
turns that follow let the component's own continuation drain.

The second is a bundled Angular suite where a symbol re-exported through a barrel reads as
`undefined` until its chunk has been evaluated. Awaiting the import is what evaluates it — and,
unlike a bare `await import('…')` with a comment, the name says why the line is there, which is what
keeps the next "remove the unused line" pass from deleting it.

Spinning `await Promise.resolve()` instead is worse than not waiting: the tests go green and the
continuation lands after teardown, producing eight `NG0205: Injector has already been destroyed`
entries under "Unhandled Errors", no failing test, and a non-zero exit code.

## The clock

```ts
import { mockSystemTime, useCountingClock, withSystemTime } from 'vitest-auto-spy/setup';
```

### `mockSystemTime(time)` and `withSystemTime(time, body)`

Freeze the clock whether or not fake timers are already running. With fakes installed this is
`vi.setSystemTime`; without them it installs `Date`-only fakes, so timers stay real.

**An assertion that contains a date must set the clock.** Otherwise the expected string is computed
from `new Date()`, and the test starts failing on its own some days after it was written — which
reads as a regression and is not one.

The ported `jest.spyOn(global, 'Date')` is not the way. Fake timers already own that global, so it
throws `Date is not a constructor` with a stack in production code and no mention of timers
anywhere.

### `useCountingClock(options?)`

```ts
describe('MetricsCollector', () => {
  const clock = useCountingClock();

  it('stamps each event with the next tick', () => {
    collector.push('a');
    collector.push('b');

    expect(sent()).toEqual([
      { name: 'a', at: 1 },
      { name: 'b', at: 2 },
    ]);
    expect(clock.value).toBe(3);
  });
});
```

Under fake timers every call inside one test reports the same "now", so a spec that asserts on
**order** or **duration** — analytics batches, tracing spans, a rate limiter, a TTL cache,
dedupe-by-time — cannot express its expectation at all.

Patching `Date.now` by hand does not survive a suite that keeps fakes on globally:
`vi.useFakeTimers()` installs a _fresh_ `Date` on every call, so a module-scope or `beforeAll` patch
is left sitting on an object nothing reads any more, and the naive undo (`afterEach(() => { Date.now
= saved })`) re-attaches a dead clock's `now` to the live one, where it breaks a later file.
`useCountingClock` and `mockNow` re-apply per test and hand the undo to `restoreMockedProps()`,
which recorded the exact object it patched.
