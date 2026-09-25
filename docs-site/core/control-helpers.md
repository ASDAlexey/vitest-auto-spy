---
title: Control helpers
description: calledWith, mustBeCalledWith, resolveWith, nextWith and the rest — the helpers each spied method earns from its return type.
---

# Control helpers

Each spied method gets helpers chosen by its return type. `calledWith` / `mustBeCalledWith`
dispatch by argument, and the type-specific helpers configure the result.

::: tip Key order does not matter
Arguments are matched by a serialized key, and object keys are sorted before it is built — so
`calledWith({ id: 1, name: 'a' })` matches a call made with `{ name: 'a', id: 1 }`. The two are
the same argument, and the order a literal happened to be written in is not something a test
should depend on. A `Map` and a `Set` are read the same way: `calledWith(new Set([1, 2]))` answers a
call made with `new Set([2, 1])`, because insertion order is not part of what either one holds.
:::

## Synchronous methods

```ts
// standard vi.fn() API works as-is
myService.getName.mockReturnValue('Fake Name');

// return a value only for specific arguments
myService.getName.calledWith(1).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBeUndefined();

// throw if called with the "wrong" arguments
myService.getName.mustBeCalledWith(1).mockReturnValue('Fake Name');
expect(() => myService.getName(2)).toThrow();
```

::: warning The first line and the second do not layer — the later one wins outright
`mockReturnValue` and its family (`mockImplementation`, `mockResolvedValue`, `mockRejectedValue`,
`mockThrow`, `mockReturnThis`) install an implementation on the host mock, and the dispatch that
reads a `calledWith` chain **is** the implementation they replace. So a `mockReturnValue` written
after a chain turns every call into that one value, and a chain opened after a `mockReturnValue` is
never consulted. Neither fails, which leaves the spec green on a branch nobody configured, so both
orders are reported as a misconfiguration — a warning, or a throw under
[`setupAutoSpy({ misconfiguration: 'throw' })`](/utilities/setup) and the `strict` preset.

Where both are wanted — one value for these arguments, another for everything else — the fallback
goes in the spy's own container, which a chain still wins over: the
[`returns`](/core/create-spy-from-class#returns-—-the-value-where-the-spy-is-built) option where the
double is built, or `resolveWith` / `nextWith` / `failWith` for a promise, a stream or a throw.
`mockReturnValue` is the right call when it is meant to be the whole answer.

```ts
provideAutoSpy(ProductsService, { returns: { find: FALLBACK } });
injectSpy(ProductsService).find.calledWith(7).mockReturnValue(SPECIFIC); // both live
```

The report comes from the library's own spy engine, so it is there on Vitest and Rstest and not
under `setSpyEngine('runner')`, on Bun or on `node:test` — those install their implementation inside
the runtime, where nothing here can see it. The `Once` family is never reported: its queue drains
back onto the dispatch, so it suspends the chain for a call rather than taking it away.
:::

### A chain kept in a variable

`calledWith` / `mustBeCalledWith` hand back a handle for **those** arguments, so a chain stored in a
variable stays bound to the list it was taken for however many chains are opened afterwards:

```ts
const one = myService.getName.calledWith(1);
const two = myService.getName.calledWith(2);

one.mockReturnValue('first');
two.mockReturnValue('second');

expect(myService.getName(1)).toBe('first');
expect(myService.getName(2)).toBe('second');
```

That is the shape to reach for when one argument list is configured in two places — a default in
`beforeEach` and the outcome in the test — or when a helper opens the chain and hands it back. Every
handle of one spy writes into the same argument map, so configuring a stored handle and naming the
same arguments again are the same write, and the later one wins as it always does.

### Making a call throw — `failWith`

```ts
// every call throws
cart.checkout.failWith(new HttpErrorResponse({ status: 500 }));
expect(() => cart.checkout(1)).toThrow();

// only these arguments throw; the rest answer normally
cart.checkout.calledWith(BAD_ID).failWith(new Error('unknown cart'));
cart.checkout.calledWith(GOOD_ID).mockReturnValue(receipt);
```

`failWith` is available on a spy of **any** return type, and on a `calledWith` /
`mustBeCalledWith` chain. It supersedes a `resolveWith`, `nextWith` or per-call batch configured
before it, and is superseded by one configured after — so what a call does never depends on the
order the spec happens to be written in. A `resetAutoSpy` drops it like any other configuration.

::: tip Why not `throwWith`
`throwWith` already means _error the stream_ on an observable spy. Every spy carries every helper
bundle at runtime — only the return type in `Spy<T>` tells them apart — so a shared name would mean
whichever bundle is attached last silently wins, on every spy in the run.
:::

::: info Compared with the runners
Vitest 4.1 added `mockThrow` / `mockThrowOnce`, which do the spy-level half. Bun and `node:test`
have neither, so `failWith` is what makes the same spec run on all three. And no runtime has an
equivalent of the second example above: `mockImplementation` replaces the whole dispatch, which is
the opposite of configuring one set of arguments.
:::

### What a `mustBeCalledWith` failure prints

The first line says which argument broke the match; below it, both sides, the way `td.explain` and
sinon print them — because the diagnosis is the comparison, not either half of it:

```
[vitest-auto-spy] getName is set up with mustBeCalledWith, and this call matches none of its configs — argument 1: expected 1, got 2.
Wanted: getName(1)
Actual: getName(2)
Fix the value the code under test passes, or configure this call too.
Docs: https://asdalexey.github.io/vitest-auto-spy/core/control-helpers#what-a-mustbecalledwith-failure-prints
```

Every configured call is listed when there is more than one, matchers included, so a config that
never matched is visible rather than inferred — and the first line then stops at the diagnosis, since
there is no single config to compare against:

```
Wanted (3 configured):
  getName(1)
  getName(2,'fast')
  getName(Any<Number>,StringContaining)
Actual: getName(9,'zzz')
```

A matcher nested in a config is printed where it sits — `save({id:Any<Number>,name:'a'})` — so the
line reads as the config was written, rather than as the matcher's own fields.

### Asymmetric matchers in `calledWith`

`calledWith` / `mustBeCalledWith` accept the same asymmetric matchers as `expect`
(`expect.any`, `expect.objectContaining`, `expect.stringMatching`, …), and they mean the same thing
**at any depth**: inside an object, inside an array, and as a key or a value of a `Map` or a `Set`.
A config carrying one anywhere is stored as a predicate and matched against the actual arguments at
call time, instead of by exact serialization.

```ts
myService.getName.calledWith(expect.any(Number)).mockReturnValue('Fake Name');
expect(myService.getName(1)).toBe('Fake Name');
expect(myService.getName(2)).toBe('Fake Name');

myService.save.calledWith(expect.objectContaining({ id: 1 })).mockReturnValue(true);
expect(myService.save({ id: 1, name: 'x' })).toBe(true);

// a matcher one level down, which is the ordinary shape of a payload assertion
myService.save.calledWith({ id: expect.any(Number), name: 'x' }).mockReturnValue(true);
myService.saveAll.calledWith([expect.any(String)]).mockReturnValue(true);
myService.index.calledWith(new Map([['id', expect.any(Number)]])).mockReturnValue(true);
```

An exact argument list is matched before any of them, and the matcher configs are tried in the
order they were registered — a narrow config written before a wide one keeps its calls.

Registering the **same** argument list again replaces the answer it gave before, exactly as it does
for exact arguments:

```ts
myService.getName.calledWith(expect.anything()).mockReturnValue('first');
myService.getName.calledWith(expect.anything()).mockReturnValue('second');
expect(myService.getName(1)).toBe('second');
```

Each `expect.anything()` call builds a new object, so "the same argument" cannot mean the same
instance: two matchers are the same when they accept the same values — same matcher class, same
sample, same inversion. That holds where the matcher sits nested, too: a second
`calledWith({ id: expect.any(Number) })` overrides the first rather than queueing behind it.
A hand-rolled `{ asymmetricMatch }` object is the exception. Its verdict lives in a closure that no
comparison can read, so two of them are always two configs, and only that very instance, registered
again, overrides.

### What counts as the same argument

Whatever a matcher does not decide is compared the way the runner's own `equals` compares it, in a
predicate config and in the serialized key alike:

| Argument      | Compared by                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `Map`, `Set`  | their contents, in any order                                                    |
| `Date`        | its time                                                                        |
| `RegExp`      | its source and flags                                                            |
| `Error`       | its name and message, plus the own enumerable fields a subclass adds            |
| a function    | identity — the same function object, never the same name                        |
| anything else | its own enumerable entries, symbol keys included; the prototype is not compared |

An instance whose whole state sits behind accessors or private fields — a `URL`, an `ArrayBuffer`, a
component — has no entries to compare with, so it is told apart by its class but not from another
instance of that class. Configure such an argument with a matcher (`expect.any(URL)`), or with the
field the code under test really varies.

::: warning Two arguments that used to share one key
Each of these was a single `calledWith` key: two different functions of one name (two anonymous
callbacks included), two `Error`s differing only in their message, an object whose key was written to
look like structure (`{ 'a:1,b': 2 }` against `{ a: 1, b: 2 }`), a field under a symbol key, and a
`Set` built in a different order. A spec that leaned on it — one anonymous callback collecting the
value configured for another — was green for a comparison it never made, and fails now. The failure
prints both argument lists, so the repair is in the config, not in the helper.
:::

## Cause and effect: why `calledWith` and not `mockReturnValue`

A stub is a statement about cause and effect: _given this input, the collaborator answers that_. A
`mockReturnValue` keeps the effect and drops the cause — the answer comes back whatever the code sent —
and that is how a test ends up passing when it should not:

```ts
function priceIn(rates: Rates, amount: number, currency: string): number {
  return amount * rates.rateFor('EUR'); // the bug: `currency` is ignored
}

rates.rateFor.mockReturnValue(2);
expect(priceIn(rates, 10, 'USD')).toBe(20); // green
```

The usual repair is a `toHaveBeenCalledWith('USD')` at the end of the test. It works, but it puts the
cause and the effect in two places: the answer is configured at the top, the condition it depended on
is checked at the bottom, and nothing ties them together — a trailing assertion that was never
written, or was written against the wrong spy, leaves the test exactly as green as before.

`calledWith` keeps both in one line. The answer exists only for the input it belongs to, so the wrong
input gets no answer, and the test fails at the behaviour it was checking:

```ts
rates.rateFor.calledWith('USD').mockReturnValue(2);
expect(priceIn(rates, 10, 'USD')).toBe(20); // fails: rateFor('EUR') answered undefined, the price is NaN
```

It is also the **looser** coupling of the two, which is the part that surprises people. An assertion
on the call pins down how the code talks to its collaborator — how many times, in which order, with
which exact arguments. An answer filtered by arguments only says that the result depends on the
input: the code may call once or three times, cache, or reorder, and the test does not care as long
as the right input produces the right output. Refactors that keep the behaviour keep the test green.

When a call with any other arguments is itself the bug, say so with `mustBeCalledWith`. The failure
then names the mismatch at the call, instead of surfacing as a `NaN` somewhere downstream:

```text
[vitest-auto-spy] rateFor is set up with mustBeCalledWith, and this call matches none of its configs — argument 1: expected 'USD', got 'EUR'.
Wanted: rateFor('USD')
Actual: rateFor('EUR')
```

An unconditional answer is still the right tool where there is no cause to tie it to: a method that
takes no arguments, or one whose arguments the test genuinely does not care about. And
`toHaveBeenCalledWith` is still the right assertion where the call _is_ the behaviour — a command
sent, an event logged, a request fired with nothing read back.

## Promise-returning methods — `resolveWith`

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await expect(myService.getProducts()).resolves.toEqual([{ name: 'Product 1' }]);

myService.getProducts.rejectWith('FAKE ERROR');

// per-call values, and conditional-by-args
myService.getProducts.resolveWithPerCall([{ value: ['a'] }, { value: ['b'] }]);
myService.getProducts.calledWith(1).resolveWith(['one']);
```

### Inspecting promise outcomes — `mock.settledResults` {#settled-results}

Every spied method exposes `mock.settledResults`: one index-aligned entry per call,
recording how that call's returned promise eventually settled. Vitest tracks this
natively; on Bun (`bun:test`) and `node:test` it is provided by a built-in polyfill,
so the surface is identical across all three runtimes.

```ts
myService.getProducts.resolveWith([{ name: 'Product 1' }]);
await myService.getProducts();
expect(myService.getProducts.mock.settledResults).toEqual([{ type: 'fulfilled', value: [{ name: 'Product 1' }] }]);

myService.getProducts.rejectWith('FAKE ERROR');
await myService.getProducts().catch(() => undefined);
expect(myService.getProducts.mock.settledResults).toContainEqual({ type: 'rejected', value: 'FAKE ERROR' });
```

Each entry is `{ type: 'fulfilled' | 'incomplete' | 'rejected', value }`. A call whose
promise is still pending is recorded as `incomplete` until it settles.

## Resetting spies — `clearAutoSpy` / `resetAutoSpy`

Reset every spy inside an assembled spy with one call, instead of reaching for
`mockClear` / `mockReset` on each method by hand. Both work on `createSpyFromClass`
spies and `createAutoMock` proxies, and cover method spies **and** accessor spies.

```ts
import { clearAutoSpy, resetAutoSpy } from 'vitest-auto-spy';

// clears recorded calls only — configured returns are kept
clearAutoSpy(myService);

// clears calls AND reverts configuration to pristine
resetAutoSpy(myService);
```

`resetAutoSpy` reverts both the library config (`calledWith` / `resolveWith` / `nextWith` / …) **and**
a bare return value set directly on a spy (`myService.getName.mockReturnValue('x')`) — after a reset
the method returns `undefined` again until reconfigured.

Two things live inside the host mock rather than in a library container, and they go with the rest:
a queued `mockReturnValueOnce` value, which no longer answers the first call after the reset, and
whatever an accessor spy was told to return (`accessorSpies.getters.theme.mockReturnValue('dark')`),
which no longer survives into the next test. That is what `vi.resetAllMocks()` does, per double —
so a spec that stacked a `Once` value before a `resetAutoSpy` and expected to collect it afterwards
reads `undefined` there and has to queue the value after the reset instead.

## Observable methods & properties — `nextWith`

Enabled by importing the rxjs layer once (`import 'vitest-auto-spy/rxjs';`). See
[Runtimes → RxJS](/runtimes/rxjs).

```ts
myService.getProducts$.nextWith([{ name: 'Product 1' }]); // emit, stream stays open
myService.getProducts$.nextOneTimeWith([{ name: 'X' }]); // emit once, then complete
myService.getProducts$.throwWith('FAKE ERROR'); // error the stream
myService.getProducts$.complete(); // complete the stream
```

### A precise sequence — `nextWithValues`

`nextWithValues(configs)` emits the entries **in order**, and stops at the first `{ complete: true }`.
Anything pushed onto the backing subject afterwards is merged in until that completion arrives.

```ts
myService.getProducts$.nextWithValues([
  { value: [{ name: 'Product 1' }] },
  { value: [{ name: 'Product 2' }], delay: 100 },
  { complete: true },
]);
```

#### `ValueConfig`

| Shape                    | Effect                                                |
| ------------------------ | ----------------------------------------------------- |
| `{ value, delay? }`      | emit `value` (after `delay` ms, if given)             |
| `{ errorValue, delay? }` | error the stream with `errorValue` (after `delay` ms) |
| `{ complete?, delay? }`  | complete the stream — `complete: false` emits nothing |

An entry is chosen by the **key it carries**, not by whether its value is truthy: `{ value: false }`,
`{ value: 0 }`, `{ value: '' }` and `{ value: null }` all emit, and so does a falsy `errorValue`. Up to
3.12.1 a truthiness check sat on top of that, so an ordinary boolean or counter stream emitted
nothing at all — and the symptom landed elsewhere, as a timed-out `expectEmission` or a component
still holding its initial state under a green assertion on the default.

`delay` is milliseconds and is applied with RxJS's own `delay()` / `timer()`, so under fake timers
you have to advance the clock: [`advanceTimers(ms)`](/utilities/fake-timers) does that **and**
drains the microtasks the emission queues.

### A fresh stream per call — `nextWithPerCall`

`nextWithPerCall(configs)` hands the **n-th call** the n-th entry, and returns one `ReplaySubject`
per entry so a test can push more values into a specific call later.

```ts
const [first$, second$] = myService.watch$.nextWithPerCall([{ value: 'a' }, { value: 'b', doNotComplete: true }]);

expect(await firstValueFrom(myService.watch$())).toBe('a');

// the second call's stream stays open, so it can be driven further
second$.next('b2');
```

Each per-call stream **completes after its first value** unless the entry sets
`doNotComplete: true`. `ValueConfigPerCall` is `{ value, delay?, doNotComplete? }`.

### Manual control — `returnSubject`

`returnSubject()` hands back the `ReplaySubject` behind the spy, for the cases the helpers do not
cover:

```ts
const subject = myService.getProducts$.returnSubject();

subject.next([{ name: 'Product 1' }]);
subject.error(new Error('boom'));
```

It is a `ReplaySubject`, so a subscriber that arrives late still sees the values already pushed.

Full reference, plus the standalone `createObservableWithValues` builder:
[Runtimes → RxJS](/runtimes/rxjs).
