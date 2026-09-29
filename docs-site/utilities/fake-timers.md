---
title: Fake timers
description: setupFakeTimers installs fake timers for a describe and removes them after each test; advanceTimers moves the clock and waits for the promises the timers started.
---

# Fake timers

Use these helpers to test a debounce, a poll or a retry without waiting in real time.
`setupFakeTimers()` turns fake timers on for a `describe` and always turns them off again.
`advanceTimers(ms)` moves the clock and waits for the promises the timer callbacks started.

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

## `setupFakeTimers(config?)`

Installs fake timers in a `beforeEach` and removes them in an `afterEach`. Call it inside a
`describe` or at the top of a spec file.

```ts
setupFakeTimers(); // Vitest's default set of fakes
setupFakeTimers({ toFake: ['setTimeout'] }); // fake only setTimeout; Date stays real
```

| Parameter              | Type                        | Default | Meaning                                                                                        |
| ---------------------- | --------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `config`               | `vi.useFakeTimers()` config | —       | Passed as is to `vi.useFakeTimers()`                                                           |
| `options.betweenTests` | `boolean`                   | `false` | Keeps the clock fake between tests too; see [below](#between-the-tests-as-well-—-betweentests) |

Why one call instead of your own two hooks:

- **You cannot forget the removal.** A fake clock left behind leaks into later files in the same
  worker. There it shows up as an unrelated test hanging on a `setTimeout` that never fires.
- **Installing or removing twice is safe.** A nested `describe` can call `setupFakeTimers` again
  without breaking the next file.
- **Deleted timer globals come back.** Under happy-dom, `vi.useRealTimers()` deletes `Date` instead
  of restoring it. The `afterEach` puts it back. Details:
  [Test-run hygiene](./setup#_6-putting-back-timer-globals-the-fakes-took-with-them).

**A config always takes effect.** If you pass a config, your fakes are installed even when fakes are
already running: in a nested `describe`, under
[`globalFakeTimers`](./setup#fake-timers-for-the-whole-run), or after `mockSystemTime()`. A call
**without** a config uses the fakes already running, because an outer `describe` or a global setup
owns the clock.

**Common mistake:** calling `vi.useRealTimers()` in the file to get out of fake timers. The rest of
the file still expects fake timers, and with `betweenTests` or `globalFakeTimers` so does the rest of
the run. Narrow `toFake` instead.

### Taking `setImmediate` out of `toFake`

By default, Vitest fakes every timer except `process.nextTick` and `queueMicrotask`. In Node, the
faked set includes `setImmediate`, which also matters outside timer code.

Express ends an unmatched request through `setImmediate`. With the clock frozen, that callback never
runs, so a request that should return `404` hangs until the runner gives up:

```text
Test timed out in 30000ms
```

That looks like a hung socket, not a routing mistake. **If your spec drives a real HTTP handler,
take `setImmediate` out of `toFake`.** List the timers you want faked; the rest stay real:

```ts
setupFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
```

If only one test in the file needs fake timers, you can instead leave the file on real timers and
wrap that test in [`withFakeTimers`](#one-test-—-withfaketimers-fn-config).

For the whole run, pass the same object to [`setupAutoSpy`](./setup#fake-timers-for-the-whole-run):

```ts
setupAutoSpy({ globalFakeTimers: { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] } });
```

## `advanceTimers(ms?)`

Moves fake timers forward by `ms`, then waits until the promises the timer callbacks started have
settled. Always `await` it.

```ts
import { advanceTimers } from 'vitest-auto-spy/setup';

// Fails like a race in the code under test:
vi.advanceTimersByTime(300);
expect(search.query).toHaveBeenCalled();

// Waits for what the callback queued:
await advanceTimers(300);
expect(search.query).toHaveBeenCalled();
```

`vi.advanceTimersByTime()` runs the timer callbacks, but what they queue (a resolved promise, an
`await` continuation, an rxjs `delay()`) has not run yet on the next line. `advanceTimers` waits for
all of it, including a long `.then()` chain and a timer scheduled from a promise. Timers due within
`ms` run in order, and the promises they start settle before the next timer runs, so
`await advanceTimers(10_000)` runs a 5-second interval twice.

| Parameter | Type     | Default | Meaning                                                      |
| --------- | -------- | ------- | ------------------------------------------------------------ |
| `ms`      | `number` | `0`     | How far to move the clock; `0` runs only what is already due |

`advanceTimers()` with no argument is the step a `setTimeout(fn, 0)` or a resolved promise chain
needs.

**Common mistake:** calling it on real timers, or after `mockSystemTime()` alone (that fakes only
`Date`). It throws and tells you to call `setupFakeTimers()`:

```text
[vitest-auto-spy] advanceTimers() requires fake timers, and the timers in this test are real. Call setupFakeTimers() once in the setup file, or vi.useFakeTimers() in this test.
```

::: tip Angular
Pair it with [`stable(fixture)`](../adapters/angular#zoneless-waiting): `advanceTimers` moves the
clock, `stable` runs the effects and change detection that followed.
:::

## One test — `withFakeTimers(fn, config?)`

Runs one function on fake timers and restores real timers however it ends: returned, thrown or
rejected. Use it when only one test in a file needs a clock.

```ts
import { advanceTimers, withFakeTimers } from 'vitest-auto-spy/setup';

it('retries after a second', () =>
  withFakeTimers(async () => {
    poller.start(); // fetches once right away
    await advanceTimers(1_000); // the retry fires
    expect(api.fetch).toHaveBeenCalledTimes(2);
  }));
```

- It returns what `fn` returns, or a promise for an async `fn`.
- `config` goes to `vi.useFakeTimers()`, as for `setupFakeTimers`.
- Inside `setupFakeTimers()` or [`globalFakeTimers`](./setup#fake-timers-for-the-whole-run), it runs
  on the fakes already installed and leaves them on.
- If `mockSystemTime()` is active, it starts at the mocked time and ends on real timers.

**Common mistake:** passing a `config` to `withFakeTimers` in a `describe` that already has
`setupFakeTimers()`. It throws, because the installed clock could not be put back afterwards. Drop
the `config`.

## Between the tests as well — `betweenTests`

Keeps the clock fake in the gaps between tests, like Jest's `fakeTimers.enableGlobally`. Use it for
a suite ported from Jest that relied on that setting.

```ts
setupFakeTimers(undefined, { betweenTests: true });
```

Without it, a `beforeAll` in a nested `describe` runs on real timers: it runs after the previous
test's `afterEach` removed the fakes. If it advances an animation clock, it fails with
`A function to advance timers was called but the timers APIs are not mocked`.

With it, the fakes are installed again right after each `afterEach` removes them, and removed for
good in `afterAll`. So they never outlive the file. Each test still starts with an empty timer queue.

It is off by default: a call inside a `describe` should leave the clock as it found it.

For the whole run, use [`setupAutoSpy({ globalFakeTimers: true })`](./setup#fake-timers-for-the-whole-run),
which turns `betweenTests` on for you.

## Freezing the clock alone

To set only the current time, use
[`mockSystemTime(time)` and `withSystemTime(time, body)`](./event-loop). With fake timers installed,
they move the fake clock. Without them, they fake `Date` only and leave timers real.

Either way, the clock goes back afterwards. If your spec advanced the fake clock inside the block,
that advance is kept: a block that moved the clock by a minute leaves it a minute later than before
the block.

::: warning `countStrayTimers()` is blind under fake timers
`vi.useFakeTimers()` puts its own `setTimeout` over the [stray-timer](./setup) tracking, so nothing
the fake clock schedules is counted. `expect(countStrayTimers()).toBe(0)` proves nothing in a file on
a frozen clock. The `strayTimers` option does not work together with `globalFakeTimers` or `setupFakeTimers`.
For the fake clock's own queue, use `vi.getTimerCount()`.
:::
