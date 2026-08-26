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

## `advanceTimers(ms?)`

`vi.advanceTimersByTime()` plus the step that is easy to miss.

Advancing runs the timer callbacks synchronously — but whatever they *queue* is still sitting in
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

`ms` defaults to `0`: the "run everything already due, then flush microtasks" step, which is what a
`setTimeout(fn, 0)` or a resolved-promise chain needs.

On real timers it throws a message naming the fix, rather than letting Vitest fail deeper in with
"timers are not mocked".

::: tip Angular
Pair it with [`stable(fixture)`](../adapters/angular#zoneless-waiting): `advanceTimers` moves the
clock, `stable` flushes the effects and change detection the clock set off.
:::
