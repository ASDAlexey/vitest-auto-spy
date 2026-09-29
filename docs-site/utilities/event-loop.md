---
title: Waiting and the clock
description: flushEventLoop, flushEventLoopUntil and settleDynamicImport wait for work a promise cannot; mockSystemTime and useCountingClock control what Date says.
---

# Waiting and the clock

These helpers wait for work that `await Promise.resolve()` cannot reach, and control what the clock
says. Use them when a test clicks something that loads code with `import()`, waits for an SDK to get
ready, or asserts on a date.

```ts
import { settleDynamicImport } from 'vitest-auto-spy';

it('opens the profile dialog', async () => {
  fixture.debugElement.query(By.css('.open')).nativeElement.click(); // production: await import(…)
  await settleDynamicImport(() => import('./profile-select.modal'));

  expect(dialog.open).toHaveBeenCalled();
});
```

`flushEventLoop`, `flushEventLoopUntil` and `settleDynamicImport` come from `vitest-auto-spy`. The
clock helpers come from `vitest-auto-spy/setup`.

## Four queues

Code under test can leave four different kinds of work pending. If the test waits on the wrong one,
the failure message does not tell you which one it should have been. Pick the helper by what is
pending ("CD" is Angular change detection):

| What is pending                                   | What drives it                                     | What does **not**                         |
| ------------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| change detection                                  | `fixture.detectChanges()`                          | an `await` alone                          |
| effects, `afterNextRender`, then CD               | `await stable(fixture)`                            | `detectChanges()` alone                   |
| timers, debounces, polling                        | `await advanceTimers(ms)`                          | `await Promise.resolve()`                 |
| a dynamic `import()`, native `async` in a library | `await flushEventLoop()` / `settleDynamicImport()` | `tick()`, `flushMicrotasks()`, microtasks |

Each row is a separate mechanism, so one kind of wait does not cover another.

## `flushEventLoop(turns?)`

Lets the runtime run for one or more real event-loop turns. It works the same with fake timers on,
and it does not move the clock.

```ts
import { flushEventLoop } from 'vitest-auto-spy';

service.start(); // calls a native async function inside node_modules
await flushEventLoop();

expect(service.ready).toBe(true);
```

| Parameter | Type     | Default | Meaning                           |
| --------- | -------- | ------- | --------------------------------- |
| `turns`   | `number` | `1`     | How many event-loop turns to give |

Why the usual tricks do not work:

- `await Promise.resolve()` only runs microtasks. A dynamic `import()` and a native `async` function
  inside `node_modules` continue on a task, so they never move.
- Under fake timers, `setTimeout` is fake, so scheduling through it does nothing.
- `await vi.advanceTimersByTimeAsync(0)` works, but reads as "move the timers" in a test with no
  timers. The next reader deletes it as noise.

It does not run pending `setTimeout` callbacks; use [`advanceTimers`](./fake-timers#advancetimers-ms)
for those.

**Common mistake:** using it for Angular's `httpResource()`, `resource()` or `rxResource`. Those need
a change-detection tick, not an event-loop turn. Use
[`settleResource()`](../adapters/angular#resources-httpresource-and-resource).

## `flushEventLoopUntil(isDone, options?)`

Gives real event-loop turns until `isDone()` returns `true`, then stops. If it never does, the test
fails with your `label` in the message. Use it for "wait until X is ready": a lazily loaded chunk, an
SDK handshake, a queue draining.

```ts
import { flushEventLoopUntil } from 'vitest-auto-spy';

client.warmUp();

await flushEventLoopUntil(() => client.isReady(), { label: 'the SDK handshake' });

expect(client.session()).toBeDefined();
```

| Option      | Type     | Default           | Meaning                                               |
| ----------- | -------- | ----------------- | ----------------------------------------------------- |
| `turns`     | `number` | `20`              | How many turns to try before failing                  |
| `timeoutMs` | `number` | —                 | Poll the real clock every 10 ms for this long instead |
| `label`     | `string` | `'the condition'` | What you were waiting for, quoted in the failure      |

`isDone` must be synchronous. It is checked before the first turn and after every turn. `turns` and `timeoutMs` cannot be
combined; the options type rejects the pair.

When the condition never holds, the failure names what to check:

```text
[vitest-auto-spy] flushEventLoopUntil: the SDK handshake was still not ready after 20 real event-loop
turns. No timer is pending: if it waits on a dynamic import(), await it instead:
`await settleDynamicImport(() => import('./thing'))`; otherwise the call under test never ran, or its
stub was never configured.
Docs: https://asdalexey.github.io/vitest-auto-spy/utilities/event-loop#flusheventloopuntil-isdone-options
```

If fake timers have callbacks queued, the second sentence says so instead:

```text
… 3 callbacks wait on the fake clock, and this helper never advances it — advance it instead:
`await advanceTimers(ms)`.
```

**Common mistake: only the first test in a file fails.** The code is waiting on a dynamic
`import()`. The first time, the chunk is cold and needs more turns than the budget; later tests hit
the module cache. It is not a flaky test. Await the module with
[`settleDynamicImport`](#settledynamicimport-load-turns) instead of counting turns.

::: warning Not for an Angular resource
`flushEventLoopUntil` never runs change detection, and an `httpResource` sends no request until
change detection runs. Awaited this way, it uses up the whole budget with zero requests made. Use
[`settleResource()`](../adapters/angular#resources-httpresource-and-resource) from
`vitest-auto-spy/angular`.
:::

### A time budget, for real I/O

For real I/O (an HTTP round-trip to a server your spec started, a child process exiting, a file
watcher firing), use `timeoutMs`. Such work takes milliseconds, and a turn budget is the wrong unit.

```ts
await server.listen(0);
void request(server.url('/health'));

await flushEventLoopUntil(() => server.requests.length > 0, { timeoutMs: 1000, label: 'the health check' });
```

It checks the condition every 10 ms on the real clock. Fake timers neither freeze nor speed it up.
The failure says `after 1000 ms of real time`. It replaces a hand-written `waitFor(predicate, ms)`.

## `settleDynamicImport(load, turns?)`

Awaits a dynamic `import()` and then gives real event-loop turns. Returns the module.

```ts
import { settleDynamicImport } from 'vitest-auto-spy';

const module = await settleDynamicImport(() => import('@scope/lazy-feature'));
```

| Parameter | Type               | Default | Meaning                                       |
| --------- | ------------------ | ------- | --------------------------------------------- |
| `load`    | `() => Promise<T>` | —       | The same `import()` your code under test runs |
| `turns`   | `number`           | `1`     | Event-loop turns to give after the import     |

Use it in two cases:

- **Your code runs `await import('./thing')` on a click**, so the spec has no promise to await.
  The `import()` runs in your spec, so write the path relative to the spec file. It resolves to the
  same module your code loaded, and the turns that follow let your component's own code continue.
- **A bundled Angular suite reads a re-exported symbol as `undefined`** until its chunk has loaded.
  Awaiting the import loads it. The name also tells the next reader why the line is there.

**Common mistake:** spinning `await Promise.resolve()` instead. The tests go green, the code
continues after teardown, and the run ends with `NG0205: Injector has already been destroyed` under
"Unhandled Errors", no failing test, and a non-zero exit code.

The lint rule [`prefer-settle-dynamic-import`](/utilities/eslint-rules#prefer-settle-dynamic-import)
reports a bare `await import('…')` in a spec and offers this wrap as a fix.

## The clock

```ts
import { mockNow, mockSystemTime, useCountingClock, withSystemTime } from 'vitest-auto-spy/setup';
```

### `mockSystemTime(time)` and `withSystemTime(time, body)`

Set the current date for a test. Use them whenever an assertion contains a date. Without a fixed
date, the expected value comes from `new Date()`, and the test starts failing by itself days later.

```ts
import { withSystemTime } from 'vitest-auto-spy/setup';

it('shows the renewal date', async () => {
  await withSystemTime('2025-04-30T00:00:00Z', async () => {
    await expect(subscription.renewalLabel()).resolves.toBe('renews 30.05.25');
  });
});
```

- `withSystemTime(time, body)` runs `body` at that time and puts the clock back afterwards, also when
  `body` fails. `body` may be sync or async; it returns a promise of what `body` returns. Create the
  component inside `body` if it reads the date when it is created.
- `time` is a `Date`, a timestamp or a date string, as for `vi.setSystemTime`. A string is parsed like
  `new Date(string)`; end it with `Z` for UTC.
- `mockSystemTime(time)` sets the time and returns an undo function. Call the undo yourself, for
  example in `afterEach`.
- With fake timers already installed, they move the fake clock and leave the fakes on. If your spec
  advanced the fake clock inside the block, that advance is kept after it.
- Without fake timers, they fake only `Date`; timers stay real. The undo removes those fakes.
- Calling the undo twice does nothing more.

**Common mistake:** porting `jest.spyOn(global, 'Date')`. Fake timers already own that global, so it
throws `Date is not a constructor` from inside your app code, with no mention of timers.

`advanceTimers()` does not work on these `Date`-only fakes: see
[Fake timers](/utilities/fake-timers).

### `useCountingClock(options?)`

Makes `Date.now()` return 1, 2, 3, … instead of the time. It resets before every test. Use it when a
spec asserts on order or duration: analytics batches, tracing spans, a rate limiter, a TTL cache.
Without it, every call in one test under fake timers gets the same "now", and such a spec has
nothing to assert on.

```ts
import { useCountingClock } from 'vitest-auto-spy/setup';

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

| Option  | Type     | Default | Meaning                              |
| ------- | -------- | ------- | ------------------------------------ |
| `start` | `number` | `1`     | The first value `Date.now()` returns |
| `step`  | `number` | `1`     | Added on every read                  |

The returned clock has `value` (what the next `Date.now()` returns) and `reset()` (start over from
`start`). Call `useCountingClock` at `describe` level; it registers its own hooks.

### `mockNow(source)`

Replaces `Date.now` with your function before every test in the block and restores it after. Call it
at `describe` level. `useCountingClock` is built on it.

```ts
import { mockNow } from 'vitest-auto-spy/setup';

describe('AnalyticsQueue', () => {
  let tick = 0;

  mockNow(() => (tick += 1));
});
```

**Common mistake:** patching `Date.now` by hand in a suite with fake timers on everywhere.
`vi.useFakeTimers()` installs a new `Date` each time, so a patch made once is left on an object
nothing reads. `mockNow` and `useCountingClock` patch the live `Date` before each test and undo it
exactly.

## A watchdog is not on your clock, and not on your zone

Some helpers fail by timing out on purpose: [`expectEmission` and its
family](/core/observable-assertions), and [`stable`](/adapters/angular). Their timeout stays real:

- **Fake timers do not stop it.** They read the timer functions once, at import, so
  `vi.useFakeTimers()` cannot freeze them. The failure stays "the stream did not emit" instead of
  "the test timed out".
- **zone.js does not capture it.** They use the original `setTimeout` that zone.js keeps aside. A
  timeout armed inside `fakeAsync` stays on real time, and `tick()` cannot expire it.

Everything else your spec schedules belongs to the zone, which is the point of
[running under one](/utilities/zone).
