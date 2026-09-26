# vitest-auto-spy — Observable assertions

Part of the agent reference [`AGENTS.md`](../AGENTS.md), which maps every section to its file. Section numbers are shared with it.

## 8. Observable assertions (core entry — no rxjs needed)

`expect()` inside a `subscribe()` callback is the classic green-but-empty test: if the stream never
emits, the callback never runs and nothing is asserted. Invert it — **the assertion is the `await`**:

```ts
import { expectAllEmissions, expectCompletion, expectEmission, expectEmissions, expectError, expectNoEmission } from 'vitest-auto-spy';

await expect(expectEmission(component.visible$)).resolves.toBe(true); // the first VALUE, not a list
await expect(expectEmission(tasks$)).resolves.toEqual({ id: 1 }); // the task itself, not `[task]`
await expect(expectEmissions(source$, 3)).resolves.toEqual([1, 2, 3]); // the list is this one
await expectNoEmission(source$, { timeout: 50 });
await expectCompletion(service.purgeCache()); // "it finished" — the value is not the point
await expect(expectAllEmissions(source$)).resolves.toEqual([1, 2]); // every value, and none after
```

Options: `{ timeout, label }`. `timeout` defaults to `1000` ms (`0` for `expectNoEmission`, whose
wait is a quiet window rather than a watchdog). `0` and `Infinity` both mean **no watchdog** — the
wait then runs to the runner's own test timeout, which is the trade. The source is duck-typed, so rxjs `Observable`s,
`Subject`s, Angular `toObservable()` results, Angular `output()` (`OutputEmitterRef`, whose
`subscribe` takes a bare callback) and hand-rolled subscribables all work — and every helper infers
the emitted type, so `expectEmission(of(1))` is a `Promise<number>`.

**A `void` stream calls its listener with one argument, `undefined`.** `output<void>().emit()` and
`Subject<void>.next()` both do, so a `vi.fn()` subscribed to one records `[undefined]`, and
`expect(listener).toHaveBeenCalledExactlyOnceWith()` fails on `[] vs [undefined]` — the form a
`prefer-called-with` autofix used to write. The assertion is the emission itself:
`await expect(expectEmission(component.closed)).resolves.toBeUndefined()`, or
`subscribeSpyTo(subject$).getValuesLength()` to count. A listener kept anyway is typed
`vi.fn<() => void>()` (`(value: void) => void` trips `no-invalid-void-type`) and asserted
`toHaveBeenCalledExactlyOnceWith(undefined)`.

`expectCompletion` is the one to reach for on a stream whose value is not the point — a save, a
purge, an `Observable<void>`, a `Subject` a teardown closes. `firstValueFrom` rejects such a stream
with rxjs's `EmptyError`, and the workaround people arrive at,
`lastValueFrom(x, { defaultValue: undefined })`, reads as though the default were the interesting
part. Emissions do not fail it: it asserts termination, nothing about what came before.

**To assert that production code pushed into a stream, do not use `observablePropsToSpyOn`.** That
option points the other way: it gives the spec `nextWith` so it can _feed_ the double. When the
question is whether the code under test called `next` on a property, the double needs a real
`Subject` and a spy on its method:

```ts
const forceRequery$ = new Subject<number>();

mockValueProp(state, 'reloadAndSeekTo$', forceRequery$);
const next = spyOnOwnMethod(forceRequery$, 'next');

service.seek(1000);
expect(next).toHaveBeenCalledWith(1000);
```

`spyOnOwnMethod` is the same record-and-call-through a bare `vi.spyOn` gives, and it is the form to
reach for when a preset bans `vi.spyOn` outright (`no-restricted-properties`): the emission still
reaches subscribers, because the real `next` runs.

`Spy<T>` types an Observable property as `AddObservableSpyMethods<O> & T[K]`, so `next` is there on
the type either way — which is exactly why this is worth saying: the code compiles against the spy
surface and asserts nothing.

**When the error _is_ the assertion, use `expectError`.** The other helpers wrap a stream failure in
a new `Error` whose message names the stream — right for reporting an unexpected failure, useless
when the failure is the subject. `expectError` resolves _with_ the error, exactly as it was thrown:

```ts
await expect(expectError(service.load())).resolves.toBe(originalError);
expect(await expectError(process$)).toBeInstanceOf(UpstreamStatusError);
expect((await expectError(account$)) as Error).toHaveProperty('message', 'websso fail');
```

It waits for the error however late it arrives, and fails — naming the stream — if the stream
completes or stays quiet instead. The wrapped failures of the other helpers now also carry the
original on `cause`, so `rejects.toMatchObject({ cause: original })` works; prefer `expectError`,
which needs no unwrapping. `firstValueFrom(source$).rejects` remains fine too.

**Which emission counts** — `skip` and `until`, for the stream whose first value is always stale:

```ts
await expect(expectEmission(isXl$, { skip: 1 })).resolves.toBe(true); // a shareReplay / BehaviorSubject
await expect(expectEmission(currentParams$, { until: (p) => p.channelId === expected })).resolves.toEqual(…);
```

Both say in the assertion what `source$.pipe(skip(1))` / `pipe(filter(…))` say in the source, and
they keep the diagnosis: emissions that do not match are still counted, so a failure reads
`4 emission(s) received` rather than `0` and tells "the wrong thing fired" apart from "nothing
fired".

**`advance` closes the window between subscribing and awaiting.** A stream driven by a
`debounceTime`, a retry or a poll needs the clock moved _after_ something is listening, and `await`
gives control away before the next statement runs:

```ts
await expect(expectEmission(purchased$, { advance: () => vi.runAllTimers() })).resolves.toBe(false);
```

That replaces the fragile shape people arrive at — hold the promise, advance, then await — which
breaks silently the moment somebody adds an `await` one line above it. It is a callback rather than
an `advanceTimers: true` flag because these helpers are in the core entry, which contains no test
runner: only the spec knows whether it is on `vi`, `bun:test` or `node:test`. A throw out of
`advance` — or out of an `until` predicate — is reported as itself and tears the subscription down,
rather than being lost while the wait runs on to the timeout.

**These helpers subscribe as a subscriber, so a synchronous source stops at the value that settles
the wait.** `expectEmission(from([1, 2, 3]).pipe(tap(spy)))` calls `tap` once, not three times, so
`expect(spy).toHaveBeenCalledTimes(1)` is honest and a `finalize` runs at the stop; before, the
producer ran to completion before anything could unsubscribe, and an endless synchronous source
(`of(1).pipe(repeat())`) hung the worker instead of resolving. `expectEmissions(source$, 3)` stops
at the third. A source that cannot be subscribed to at all is reported by name now, with a separate
hint when what was passed is a promise.

`expectEmissions(source$, 0)` throws at the call — a count below 1 is not something a stream can
satisfy, and the message names `expectNoEmission` instead. A suite that wrote
`expectEmissions(s, expected.length)` with an empty expectation is the one this changes.

**The watchdog runs on real time, on purpose — even under fake timers, and even under zone.js.** A
virtual one would race the timers the spec advances: `expectEmission(source$, { timeout: 200 })`
followed by `vi.advanceTimersByTime(5_000)` would fire at 200 virtual ms and reject the stream the
spec was about to advance into. Inside `fakeAsync` that used to happen anyway, because zone.js
patches the global `setTimeout` and the watchdog was scheduled onto the virtual queue: a
`tick(1_500)` towards a `debounceTime(2_000)` rejected the wait it was advancing. The timer is taken
from `__zone_symbol__setTimeout` now, so it is outside the zone and `tick()` cannot reach it.

The cost is that in a suite with global fake timers a _failing_ assertion spends a real second. Do
**not** answer that with `{ timeout: 0 }` at every call site — that disables the watchdog, and the
next silent stream hangs to the runner's own timeout with nothing useful in the message. Lower the
default once instead:

```ts
// vitest.setup.ts
import { setEmissionTimeout } from 'vitest-auto-spy';
import { setupAutoSpy } from 'vitest-auto-spy/setup';

setupAutoSpy({ globalFakeTimers: true });
setEmissionTimeout(100); // the clock is frozen; a real second buys nothing
```

`setEmissionTimeout` takes `0` (no watchdog) and `Infinity` (the same), and **throws** on `NaN` and
on a negative number rather than installing a default that fails every wait. The commonest way to
reach it is arithmetic: `setEmissionTimeout(Number(process.env.EMISSION_TIMEOUT))` with the variable
unset.

**The code frame these failures open is the spec line, not this package.** The helpers build their
error inside a `subscribe` or timer callback, so the stack is captured at helper entry and pinned on
when the failure is finally built; only errors these helpers make themselves are re-anchored, and
the error `expectError` resolves with keeps the stack of the code under test. Do not wrap them in
`vi.defineHelper` — its `__VITEST_HELPER__` frame lands last and Vitest then drops the stack whole.

**`expectEmission` subscribes when you call it, not when you await it**, and that is load-bearing
rather than an implementation detail. It is what converts the test whose source has to be poked
_after_ somebody is listening — a router event, a `Subject` the spec pushes into, anything that
does not replay:

```ts
const breadcrumbs = expectEmission(service.buildDynamicBreadcrumbs({ root })); // subscribed already

router.events.nextWith(navigationEnd); // …so this emission is not missed

await expect(breadcrumbs).resolves.toEqual([…]);
```

`firstValueFrom` cannot do this half: it also subscribes eagerly, but there is nowhere to put the
line that triggers the source, because the `await` is the same statement as the subscription — so
the test deadlocks against a source that only emits once something pokes it. Hold the promise
first, poke, then await.

### `createLog()` — the order between the spies

```ts
const log = createLog<'drop-cache' | 'flush-telemetry' | 'stop-engine'>();

engine.onShutdown(log.fn('drop-cache'));
engine.onShutdown(log.fn('stop-engine'));
engine.onShutdown(log.fn('flush-telemetry'));

engine.shutdown();

expect(log.result()).toBe('drop-cache; flush-telemetry; stop-engine'); // fails with the real order
```

Emission helpers answer a sequence _within one source_. The order of calls **across** collaborators
is the gap `toHaveBeenCalled` papers over — three green checks that would accept the sequence
backwards — and `toHaveBeenCalledBefore` covers pairwise. One journal the code under test writes into
(`add`, `fn(value)` for a labelled callback, `clear`, `items`, `result()`) makes the sequence a
single comparable value; `T` is a string union so a step nobody declared is a compile error. In
Angular, provide it and let the component report its own lifecycle:
`providers: [{ provide: PANEL_LOG, useValue: log }]`. Ported from Angular's own `Log`, which the
framework keeps three copies of.
