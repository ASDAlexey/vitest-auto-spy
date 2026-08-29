---
title: ESLint plugin
description: Nine flat-config lint rules that steer a suite onto the auto-spy helpers, versioned with the API they recommend.
---

# ESLint plugin

```js
// eslint.config.js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [{ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }];
```

Scope it to spec files yourself: every rule is about test code, and `Object.defineProperty` or an
object of `vi.fn()`s is perfectly reasonable in application code.

::: warning Flat config only
The legacy `.eslintrc` `plugins: ['…']` form resolves plugin names to `eslint-plugin-*` packages,
which a subpath export of this package can never be.
:::

## Rules

| Rule                           | Recommended | Fix       | Flags                                                                                 |
| ------------------------------ | :---------: | --------- | ------------------------------------------------------------------------------------- |
| `prefer-provide-auto-spy`      |   `warn`    | —         | a hand-rolled `useValue` **or** `useFactory` → `provideAutoSpy(Class)` / `provideAutoSpyForToken(TOKEN)` |
| `prefer-create-spy-from-class` |   `warn`    | —         | an object literal of two or more `vi.fn()`s → `createSpyFromClass` / `createAutoMock`, unless it is a factory's own seed |
| `prefer-inject-spy`            |   `warn`    | suggest   | `vi.spyOn(TestBed.inject(X), 'm')`, inline or via a `const` → `injectSpy(X).m`         |
| `no-object-define-property`    |   `error`   | suggest   | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp`              |
| `no-expect-in-subscribe`       |   `error`   | suggest   | `expect()` inside a `subscribe()` callback → `expectEmission` / `firstValueFrom`      |
| `no-shared-module-level-mock`  |   `error`   | —         | an **exported** value holding `vi.fn()`s → export a factory that returns it           |
| `no-mocked-for-spy`            |   `warn`    | `--fix`   | `Mocked<T>` in any type position → `Spy<T>`, import and all                            |
| `no-done-callback`             |   `error`   | —         | `it('x', (done) => …)` → `async` + an awaited assertion                               |
| `no-floating-assertion`        |   `error`   | —         | `expect()` in a `.then()` nobody awaits → `expect(await promise)`                     |

The five `error` rules are the ones that catch a test being _wrong_ rather than verbose.
`Object.defineProperty` leaves no way back — nothing restores the original descriptor, so the patch
leaks into the next file under `isolate: false`. An `expect()` inside `subscribe()` never runs if
the stream stays silent, leaving a green test that asserted nothing.

And an exported double is built once per **module**, not once per test:

```ts
// ❌ every importing spec shares these spies, for the whole worker
export const actionContext = { actions: { navigateToSection: vi.fn() } };

// ✅ one set per caller
export const createActionContext = () => ({ actions: { navigateToSection: vi.fn() } });
```

Under `isolate: false` a module is evaluated once per worker, so every importing file shares one
object. `clearMocks: true` does reach the spies inside it — [measured](#no-shared-module-level-mock-one-module-two-files) — and
clears their calls; what it cannot clear is the state the fixture keeps next to them, which crosses
from whichever file ran first into all the rest. The rule
stops at every function boundary, so the factory form — the fix — is not flagged along with the
problem. Scope it to fixture modules and spec files alike; a spec file
[should export nothing at all](/utilities/setup#shared-fixtures-are-functions-not-constants).

And a `done` parameter is not a style question. Vitest passes a callable `TestContext` there, so
calling it throws — `done() callback is deprecated, use promise instead` on Vitest 4, [measured
below](#no-done-callback-what-the-first-parameter-actually-is). That is the harmless case. In the
shape a Jasmine suite is actually full of, the call sits at the bottom of a callback, the body
returns `undefined` before it runs, and the test **passes** having run almost none of itself. Four such tests sat green for years in the suite this
rule came from; nothing but a type-checker ever noticed, and only indirectly.

And a promise chain nobody awaits is the same failure as `subscribe()`, one queue over.
`compileComponents().then(() => expect(…))` as a statement of its own runs its callback after the
test that wrote it has finished, so the assertion cannot fail it — and under zone.js the resulting
rejection is drained into `console.error` rather than reported, leaving a green test and a line of
stderr. The rule looks only at the _immediately_ enclosing callback, because that is the scope where
awaiting the chain is the actual fix: an `expect()` parked in a `subscribe()` or a `setTimeout()`
inside the `.then()` is left to `no-expect-in-subscribe` and to
[`setupAutoSpy({ strayRejections: true })`](/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed),
which catches at runtime what no selector can see.

`no-mocked-for-spy` is a `warn` because `Mocked<T>` has legitimate uses next to `vi.mocked()`; what
it flags is the declaration form, where the assignment then fails with a list of private field names
that says nothing about the real cause.

## Two things these rules learned the hard way

**A configured spy is still a spy.** `vi.fn()` and `vi.fn().mockReturnValue(of([]))` are the same
double, one of them tuned — but the check behind `prefer-provide-auto-spy` and
`prefer-create-spy-from-class` read the immediate callee and stopped, so it saw the bare form and
missed every configured one. In one `providers` array that meant the double on one line was flagged
and the one on the next was not:

```ts
{ provide: A, useValue: { getProductCardData: vi.fn() } },              // flagged
{ provide: B, useValue: {                                              // silent, until now
    getProducts: vi.fn().mockReturnValue(of([])),
    getProductById: vi.fn().mockReturnValue(of(null)),
} },
```

Exactly backwards: the more a hand-rolled double has been tuned, the further it has drifted from the
class it stands in for, and the more it was worth reporting. The chain is now unwound to the call
that created the mock, however long it is.

**A token is not a class.** `prefer-provide-auto-spy` used to recommend `provideAutoSpy(Token)` for
everything, and on an `InjectionToken` that advice does not compile — `provideAutoSpy` reads a class
prototype, and a token has none. Three migration batches reported it independently; in one of them
six of eight reports were on tokens. The rule now tells the two apart — by the declaration when
`new InjectionToken(…)` is within the resolver's reach, by the `SCREAMING_SNAKE_CASE` spelling
otherwise — and names `provideAutoSpyForToken(TOKEN)` for a token, while the class message mentions
the token form too.

## `no-expect-in-subscribe` reports one shape and three different edits

Five migration batches split this work by hand, and the proportions move per *file*, not per suite:
110 of 111 places were a mechanical inversion in one, 36 of 119 in another. Reading one message for
all of them is what cost the time, so the rule now says which of the three it is looking at.

```ts
// 1. the subscription is the last thing the test does — invert it
const value = await firstValueFrom(source$);
expect(value).toBe(1);

// 2. something after it is what makes the stream emit — hold the promise instead.
//    `await firstValueFrom(...)` deadlocks here: the await never returns, so the trigger
//    never runs. `expectEmission` subscribes when you call it, not when you await it.
const emission = expectEmission(service.getCurrentLevel());
httpMock.expectOne(url).flush(payload);
await expect(emission).resolves.toEqual(payload);

// 3. the assertion is in the failure branch — `expectEmission` resolves on a value
await expect(firstValueFrom(source$)).rejects.toBeInstanceOf(UdmsStatusError);
```

The signal for the second is entirely syntactic: there is another statement after the one holding
the `subscribe`. The third is which handler the assertion sits in, positional or named — and it is
worth saying that `subscribe({ next: () => expect.unreachable(…), error: (e) => expect(e).toBe(err) })`
collapses to the single `rejects` line as well, because guarding against an emission is what
`rejects` already does.

It also reads assertions the callback reaches through a helper:

```ts
const assertShape = (data: Content): void => {
  expect(data.items).toHaveLength(3);
};

source$.subscribe((data) => assertShape(data)); // still an assertion that may never run
```

One step through a name bound in the same file, which needs no type information and covers the
shape. A helper declared *inside* the callback is counted once, not twice.

## Options

`prefer-create-spy-from-class` takes one:

```js
'vitest-auto-spy/prefer-create-spy-from-class': ['warn', { minRunnerFns: 1 }],
```

The default is `2`, and the reason is what the rule cannot see: an object holding one `vi.fn()` is
indistinguishable from an options bag with a callback in it, and the rule fires on every object
literal in a file. Seven batches nonetheless tripped over the asymmetry — two doubles on adjacent
lines, one flagged and one not — so the threshold is named in the message and configurable here. The
case those reports were actually about is covered from the side that can prove it:
`prefer-provide-auto-spy` has a `provide:` next to the object, so it fires at **one**, and since it
learnt to follow a name to the `const` above the TestBed it reaches the same doubles.

A rule must not punish its own fix, and `prefer-create-spy-from-class` used to. The object handed
to one of this library's factories is a **seed**, not a hand-rolled double, and there is no other
form it could take:

```ts
const xhr = createAutoMock<XhrLike>({ send: vi.fn(), abort: vi.fn() }); // ✅ never flagged
const api = mockDeep<Api>({ api: { load: vi.fn(), save: vi.fn() } });   // ✅ nor at any depth
```

Anything inside a call to `autoMocked`, `createAutoMock`, `createMock`, `createSpyClass`,
`createSpyFromClass`, `mockConstructor`, `mockDeep`, `provideAutoSpy` or `provideAutoSpyForToken`
is exempt. `prefer-provide-auto-spy` needs no such exemption: a `useValue` a factory built is a
call, and it only ever looked at object literals.

## Which rules fix, and why so few

One of the nine rewrites the source on its own, three offer the rewrite as a suggestion, and the
split is about what a wrong guess costs rather than about how hard the rewrite is.

`no-mocked-for-spy` touches nothing but a **declaration**. Get it wrong and the file stops
compiling — the loudest and cheapest failure a codebase has — so it is the one rule that runs under
`--fix`, and it does the whole edit:

```ts
// before
import { Mocked } from 'vitest';
let cart: Mocked<CartService>;

// after --fix
import type { Spy } from 'vitest-auto-spy';
let cart: Spy<CartService>;
```

The `Mocked` import goes when the rename orphans it — with the declaration when it was the last
specifier, out of the braces when it was not. And the rule stands back where it cannot prove the
rename: a `Mocked` the file declares itself is not Vitest's, a `Spy` already bound to something
else is not free, and `Mocked<{ total: Mock }>` asks a different question of the type system than
`Spy<T>` answers. Those are still reported, without a fix.

The other three change **behaviour**, which is exactly what they are for, and that is why they only
suggest. Whether `injectSpy(X)` finds a spy at all is decided by a `provideAutoSpy(X)` that usually
lives in another file. `mockValueProp` leaves the property writable and configurable where
`Object.defineProperty` sealed it — and the suggestion picks the helper the descriptor asks for,
`mockValueProp` for a `{ value }` and `mockReadonlyPropGetter` for a `{ get }`. And
`no-expect-in-subscribe` rewrites a whole test:

```ts
// ❌ what a mechanical migration off Jasmine's done callback produced
it('maps the products', () =>
  new Promise<void>((done) => {
    service.getProducts(id).subscribe((products) => {
      expect(products).toEqual(expected);
      done();
    });
  }));

// ✅ what accepting the suggestion produces
it('maps the products', async () => {
  const products = await firstValueFrom(service.getProducts(id));

  expect(products).toEqual(expected);
});
```

That one template was 111 of the 133 violations in a batch of 22 migrated files, so it is worth the
recogniser. It is offered only for the exact frame above — one `subscribe` statement in the promise
executor, one block-bodied callback, `done` mentioned once and called last — because anything else
in the executor is usually the statement that *triggers* the source, and that has to run while
something is already listening. An editor offers all three; a human accepts them.

The remaining five have no per-node edit to offer. `createSpyFromClass` needs the class an object
literal never names, `provideAutoSpy` discards the return values the `useValue` body was setting
up, and `Object.defineProperties` is one `mockValueProp` statement per entry. Each of those is an
edit across a file, not across a node.

## Measured: what each rule is worth

Every rationale above is a claim about what a run does, so each one was run. Vitest 4.1.9, this
repository's own configs — the default project, `vitest.shared-env.config.mts` for `isolate: false`,
the zone project for the zone.js half — with one probe spec per rule, each containing an assertion
that cannot be true.

| Rule | Without it, the run says | Verdict |
| --- | --- | :-: |
| `no-expect-in-subscribe` | nothing — [4 of 4 forms green across 4 stream behaviours](/core/observable-assertions#measured-four-forms-against-four-streams) | green |
| `no-done-callback` | nothing, when `done()` sits in a callback: the body returns `undefined`, the test ends, the assertion lands after it | green |
| `no-floating-assertion` | zoneless: `Unhandled Rejection`, exit 1, no test named. Under zone.js: one of two rejections vanishes entirely | green |
| `no-shared-module-level-mock` | nothing — the fixture's own state crosses files under `isolate: false` | green |
| `no-object-define-property` | nothing in the file that patched; the **next** file reads the patched value | green |
| `no-mocked-for-spy` | `TS2322 … missing the following properties from type 'CartService': http, cache` | compile |
| `prefer-create-spy-from-class` | `TypeError: cart.applyPromo is not a function` | red |
| `prefer-provide-auto-spy` | the same, one DI hop away | red |
| `prefer-inject-spy` | `spy.getPlans.nextWith is not a function` | red |

The column that matters is the last one. Five rules guard against a test that is **green and wrong**,
which is the only failure mode a suite cannot report on itself; three guard against a red test whose
message is already clear; one is a compiler error. Severity in `configs.recommended` follows exactly
that split.

### `no-done-callback` — what the first parameter actually is

The parameter is not `undefined` and not a plain object. Vitest 4 passes a **callable** `TestContext`:

```text
typeof done                → 'function'
Object.keys(done)          → signal, task, skip, annotate, onTestFailed, onTestFinished
done()                     → Error: done() callback is deprecated, use promise instead
```

So the synchronous call is caught, loudly and by name. That is the shape nobody writes. The shape
every Jasmine suite is full of puts `done()` at the bottom of a callback:

```ts
it('loads', (done) => {
  setTimeout(() => {
    expect(1).toBe(999); // ← throws here, so done() is never even reached
    done();
  }, 0);
});
```

The body returns `undefined`, so the test is over before the timer fires. Measured: **green**, with
the `AssertionError` arriving afterwards as one of the run's unhandled errors, and the deprecation
error never reached at all. The rule exists because the loud case is the rare one.

### `no-floating-assertion` — three runners, three different silences

The same two tests — an `expect()` in a `.then()` nobody awaits, and an `async` helper called without
`await` — under three configurations:

| | tests | what the runner reports |
| --- | :-: | --- |
| zoneless | **2 passed** | 2 `Unhandled Rejection`, exit 1, neither attributed to a test |
| zone.js | **2 passed** | 1 error — zone.js drained the other into `console.error` |
| zone.js + `setupAutoSpy({ strayRejections: true })` | **1 failed \| 1 passed** | the swallowed one is now a named failure on the right test |

Read down the middle column: the assertion is false in every row and the test is green in every row
but the last. `strayRejections` is what turns the case no selector can see — an `expect()` parked in a
`setTimeout` inside the `.then()` — back into a failure with a test name on it.

### `no-shared-module-level-mock` — one module, two files

The fixture carries a stable id, so there is no need to argue about whether the module is shared:

```ts
// probe fixture, imported by two spec files
export const analytics = { sent: [] as string[], track: vi.fn((e: string) => analytics.sent.push(e)) };
export const moduleLoadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```

```text
isolate: true    file 1: load=…-mdncyn     file 2: load=…-ywp3q0   sent=[]
isolate: false   file 1: load=…-n0v4yh     file 2: load=…-n0v4yh   sent=[from-file-1]
```

Same id, so one evaluation, and file 2 reads what file 1 pushed. Note **what** leaked: not the spy's
calls — `clearMocks: true` does reach a module-level `vi.fn()` and does clear them, three separate
probes said so. What leaks is everything else a fixture holds next to its spies, which is why the fix
is a factory rather than a `beforeEach` that clears harder. Which file runs first is the runner's
choice, so the failure arrives as flakiness.

### `no-object-define-property` — nothing puts the descriptor back

One file patches a global the way a spec usually does, then calls everything the runner offers for
undoing things:

```ts
Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

vi.restoreAllMocks();
vi.resetAllMocks();
vi.unstubAllGlobals();
```

```text
after every restore the runner offers: onLine=false   ← same file
onLine=false                                          ← the next file
after restoreMockedProps: onLine=true                 ← mockValueProp, run on its own
```

The third line is the fix, and it is measured on its own for a reason: run it **after** the
`defineProperty` file in the same worker and it reads `false` too. The original descriptor was gone
before the correct helper ever saw the property — a suite cannot recover from this one file-by-file,
which is what makes it an `error` rather than a `warn`.

### The three `prefer-*` rules — drift, and one line that undoes a provider

A hand-written double is correct on the day it is written. The class then grows a method:

```text
F1  hand-written { total: vi.fn() }        → TypeError: cart.applyPromo is not a function
F2  createSpyFromClass(CartService)        → follows the class, no edit
```

And the type system does not help, because the double never satisfied the class in the first place —
which is what the `as unknown as CartService` in front of it is hiding:

```text
TS2741: Property 'rate' is missing in type '{ total: Mock<Procedure>; add: Mock<Procedure>; }'
        but required in type 'CartService'.
```

`no-mocked-for-spy` is the same message one step over. `Mocked<T>` demands the private fields a spy
does not have, and says so in the vocabulary of the class rather than of the mistake:

```text
TS2322: Type 'Spy<CartService, SpyOptions>' is not assignable to type 'Mocked<CartService>'.
        Type 'Spy<CartService, SpyOptions>' is missing the following properties
        from type 'CartService': http, cache
```

Nothing in that names `Mocked`, which is why the rule fixes the declaration rather than explaining
the error.

`prefer-inject-spy` is the sharpest of the three, because it is one line that quietly undoes a
provider:

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(BillingPlansService)] });

const service = TestBed.inject(BillingPlansService);
vi.spyOn(service, 'getPlans'); // ← replaces the auto-spy's method with a plain vi.fn()

injectSpy(BillingPlansService).getPlans.nextWith(['PRO']);
// TypeError: spy.getPlans.nextWith is not a function
```

The provider is still an auto-spy; the method on it is no longer one, so every observable and promise
helper on it is gone. Read the same dependency with `injectSpy(BillingPlansService)` and `nextWith` works —
that is the second probe, and it emits `["PRO"]`.

## Picking rules by hand

`configs.recommended` is a plain flat-config object, so the severities are yours to change:

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  {
    files: ['**/*.spec.ts'],
    plugins: { 'vitest-auto-spy': autoSpy },
    rules: {
      'vitest-auto-spy/no-expect-in-subscribe': 'error',
      'vitest-auto-spy/prefer-provide-auto-spy': 'off',
    },
  },
];
```

Every message ends with a link to the matching recipe in the README's
[How to mock](https://github.com/ASDAlexey/vitest-auto-spy#how-to-mock) section: a rule that only
says "don't" moves the problem rather than solving it. The rules travel with the API they
recommend, so they are versioned together and stop being re-written in every project that installs
the package.
