---
title: Observable assertions
description: expectEmission, expectEmissions and expectNoEmission — assertions that fail when the stream stays silent.
---

# Observable assertions

`expect(...)` inside a `subscribe()` callback is the most common way to write a test that passes
while asserting nothing: if the stream never emits, the callback never runs, no expectation is
evaluated and the test is green and empty. These helpers invert that — **the assertion is the
`await`**.

```ts
import { expectEmission, expectEmissions, expectNoEmission } from 'vitest-auto-spy';

await expect(expectEmission(component.visible$)).resolves.toEqual([task]);
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]);
await expectNoEmission(source$, { timeout: 50 }); // asserts silence
```

| Helper                                   | Resolves with                        | Rejects when                                                                |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `expectEmission(source$, opts?)`         | the first value                      | nothing arrives in time, the stream errors, or it completes empty           |
| `expectEmissions(source$, count, opts?)` | the first `count` values as an array | fewer than `count` arrive in time, the stream errors, or it completes short |
| `expectNoEmission(source$, opts?)`       | `void`                               | anything is emitted while it should stay silent                             |

## Options

| Option    | Default                             | Notes                                                                                                               |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `timeout` | `1000` (`0` for `expectNoEmission`) | Milliseconds to wait for a value — or, in `expectNoEmission`, how long silence must hold. `0` disables the watchdog |
| `label`   | —                                   | Name used in the failure message instead of the generic "the observable"                                            |

## Failure messages

A stream that stays quiet fails with the label and the timeout, one that errors fails with the
error, and one that completes empty says so:

```
saved$ did not emit within 1000 ms (0 emission(s) received). Either the stream never fired — check
the trigger and any provider spy feeding it — or it is slower than the timeout; raise it with
`{ timeout: … }`, or pass `{ timeout: 0 }` when running under fake timers.
```

```
saved$ completed after 0 emission(s), expected 1. A completed-but-empty stream is the usual sign
that the value was produced before the subscription.
```

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
