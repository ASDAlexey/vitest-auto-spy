---
title: ESLint rules
description: One section per rule of the ESLint plugin - what it reports, a before and after example, its options, how to fix a report and when to turn the rule off.
---

# ESLint rules

This page has one section per rule of the [ESLint plugin](/utilities/eslint-plugin). Open it when a
report arrives: each section shows what the rule reports, a before/after example, the options, and
when to turn the rule off. Every section has a stable anchor, so a config can link to it:

```js
// eslint.config.js
{
  // https://asdalexey.github.io/vitest-auto-spy/utilities/eslint-rules#no-bare-called-with
  'vitest-auto-spy/no-bare-called-with': 'error',
}
```

Setup, the `files` glob and the recipe for a large existing project are on the
[plugin page](/utilities/eslint-plugin).

Every message names what the rule found in your file, says in one sentence why it breaks, and gives
one fix. It ends with `Docs:` and a link to the rule's section below. The link is also the rule's
`meta.docs.url`, so your editor links the rule name to it.

Each section below follows the same order:

1. The first line: default severity, whether there is a fix, and whether the rule needs type
   information.
2. What the rule reports, and why that is a problem.
3. A ❌ example and a ✅ example.
4. **Options**, **How to fix** and **When to disable**.
5. **How it decides**, collapsed: the exact matching, the evidence behind the rule, and why it has
   its severity. Open it when the rule surprises you.

<!-- The id is frozen on purpose: configs already point at #the-twenty-five-rules. Keep it when the rule count changes. -->

## The fifty-seven rules {#the-twenty-five-rules}

The rules are grouped by subject, as on the [plugin page](/utilities/eslint-plugin#rules). Every
rule is `error` except eleven.

| Rule                                                                    | Default | Reports                                                                                                                                                    |
| ----------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`no-expect-in-subscribe`](#no-expect-in-subscribe)                     | `error` | `expect()` inside a `subscribe` callback — it runs only if the stream emits                                                                                |
| [`no-vacuous-absence-assertion`](#no-vacuous-absence-assertion)         | `error` | a test whose every assertion a stream that never emits already satisfies                                                                                   |
| [`no-floating-assertion`](#no-floating-assertion)                       | `error` | `expect()` in a `.then()` chain nothing awaits                                                                                                             |
| [`no-done-callback`](#no-done-callback)                                 | `error` | a `done` parameter in a test or hook, and `done.fail(…)`                                                                                                   |
| [`no-bare-called-with`](#no-bare-called-with)                           | `error` | `calledWith(…)` / `mustBeCalledWith(…)` as a statement of its own                                                                                          |
| [`no-constant-expect`](#no-constant-expect)                             | `error` | `expect(true).toBe(true)` — a value spelled out in the spec, under a matcher it decides                                                                    |
| [`no-redundant-smoke-test`](#no-redundant-smoke-test)                   | `error` | a test whose whole body asserts the subject exists, beside tests that already run its setup                                                                |
| [`no-self-called-spy`](#no-self-called-spy)                             | `error` | a test that calls the spied method itself and then asserts that it was called                                                                              |
| [`prefer-to-have-signal-value`](#prefer-to-have-signal-value)           | `warn`  | `expect(signal()).toBe(…)` — the value read inline, the signal's name lost from the failure                                                                |
| [`prefer-settle-dynamic-import`](#prefer-settle-dynamic-import)         | `error` | `await import('…')` in a test body — it waits for the module, not for the code under test                                                                  |
| [`no-real-wait-in-test`](#no-real-wait-in-test)                         | `warn`  | `new Promise((r) => setTimeout(r, N))` — a sleep on the real clock                                                                                         |
| [`no-inline-test-data`](#no-inline-test-data)                           | `warn`  | a data literal over 20 lines, or the same literal written three times in one file                                                                          |
| [`no-unasserted-argument`](#no-unasserted-argument)                     | `warn`  | a bare `toHaveBeenCalled()` where the file itself shows the arguments are what the test is about                                                           |
| [`prefer-create-mock`](#prefer-create-mock)                             | `warn`  | an object literal under `as SomeType` — a cast passes an excess key and a missing one                                                                      |
| [`no-mock-cast`](#no-mock-cast)                                         | `error` | `TestBed.inject(S).m as Mock` — `Mock` is `Mock<any>`, so the arguments stop being compared                                                                |
| [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)         | `error` | an object literal of two or more `vi.fn()`s                                                                                                                |
| [`no-stub-class-double`](#no-stub-class-double)                         | `warn`  | a class whose fields are `vi.fn()`s — the same double with a `new` in front of it                                                                          |
| [`no-structural-double`](#no-structural-double)                         | `warn`  | an object of `vi.fn()`s bound to a name declared as an object of Vitest `Mock`s                                                                            |
| [`prefer-spy-on-own-method`](#prefer-spy-on-own-method)                 | `warn`  | a `createSpyFromInstance` that spies one method and is read for it alone                                                                                   |
| [`no-shared-module-level-mock`](#no-shared-module-level-mock)           | `error` | an **exported** value that builds `vi.fn()`s while the module loads                                                                                        |
| [`no-outer-binding-in-mock-factory`](#no-outer-binding-in-mock-factory) | `error` | a `vi.mock` factory reading a top-level binding not declared through `vi.hoisted`                                                                          |
| [`no-object-define-property`](#no-object-define-property)               | `error` | `Object.defineProperty` / `defineProperties` in a spec                                                                                                     |
| [`no-import-time-spread`](#no-import-time-spread)                       | `error` | a spread of an imported binding evaluated at module scope                                                                                                  |
| [`prefer-observer-stub`](#prefer-observer-stub)                         | `error` | an observer global replaced by hand or through the runner                                                                                                  |
| [`no-hand-assigned-global`](#no-hand-assigned-global)                   | `error` | `global.fetch = vi.fn()`, `environment.x = …` — a value no teardown puts back                                                                              |
| [`prefer-stub-response`](#prefer-stub-response)                         | `error` | an object literal cast to `Response`, or `createMock<Response>(…)` — half a response                                                                       |
| [`no-redundant-mock-reset`](#no-redundant-mock-reset)                   | `error` | a mock reset in a hook the runner already performs between tests                                                                                           |
| [`prefer-provide-activated-route`](#prefer-provide-activated-route)     | `error` | an `ActivatedRoute` provided as a hand-built object, class or factory — half a route                                                                       |
| [`no-passthrough-console-spy`](#no-passthrough-console-spy)             | `error` | `vi.spyOn(console, m)` nothing gives an implementation — it calls through and prints                                                                       |
| [`no-unasserted-console-spy`](#no-unasserted-console-spy)               | `warn`  | a console spy the file only resets or configures, never asserts — `useConsoleSpies()` already silences                                                     |
| [`no-console-in-spec`](#no-console-in-spec)                             | `error` | a spec that calls a console method, or replaces one by assignment                                                                                          |
| [`no-import-time-console-spies`](#no-import-time-console-spies)         | `error` | an import of `vitest-auto-spy/console` in a file that never calls `installConsoleSpies()` or `useConsoleSpies()`                                           |
| [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)                   | `error` | a provider that hand-rolls a service double, or spells `provideAutoSpy` out                                                                                |
| [`prefer-inject-spy`](#prefer-inject-spy)                               | `error` | `vi.spyOn` over the instance `TestBed.inject` handed back                                                                                                  |
| [`no-unregistered-inject-spy`](#no-unregistered-inject-spy)             | `error` | `injectSpy(X)` for a token this file never registered as an auto-spy                                                                                       |
| [`no-real-component-provider`](#no-real-component-provider)             | `error` | a component's own provider read from the fixture while nothing in the file replaced it                                                                     |
| [`prefer-render-shallow`](#prefer-render-shallow)                       | `warn`  | `TestBed.createComponent` in a file that never reads the rendered template; under `{ templates: 'never' }`, any DOM read or template in the spec           |
| [`prefer-set-inputs`](#prefer-set-inputs)                               | `warn`  | a run of `fixture.componentRef.setInput(…)` — a name Angular checks against nothing                                                                        |
| [`no-overridden-provider`](#no-overridden-provider)                     | `error` | a provider a later one, or a `TestBed.overrideProvider`, replaces                                                                                          |
| [`no-inject-before-override`](#no-inject-before-override)               | `error` | an injection in a hook, in a suite that still calls `TestBed.override*` or `overrideComponentProvider`; an `injectSpy` above an override in `beforeCreate` |
| [`no-dead-schemas`](#no-dead-schemas)                                   | `error` | `schemas` on a testing module that declares nothing                                                                                                        |
| [`no-mistyped-use-value`](#no-mistyped-use-value)                       | `error` | a `useValue` that does not fit the primitive type its `InjectionToken` declares                                                                            |
| [`no-unknown-use-value-key`](#no-unknown-use-value-key)                 | `error` | a key of an object `useValue` the provided type does not have — keys only                                                                                  |
| [`no-instance-lifecycle-spy`](#no-instance-lifecycle-spy)               | `warn`  | `vi.spyOn(component, 'ngOnInit')` — a hook spy Angular never calls                                                                                         |
| [`no-compile-components`](#no-compile-components)                       | `error` | `compileComponents()` under a builder that inlines resources — silent until told so                                                                        |
| [`no-relative-mock-under-builder`](#no-relative-mock-under-builder)     | `error` | `vi.mock('./x')` in a spec `@angular/build:unit-test` runs — the builder throws on it; silent until one does                                               |
| [`no-disabled-testbed-teardown`](#no-disabled-testbed-teardown)         | `error` | `destroyAfterEach: false` — every fixture outlives its test                                                                                                |
| [`no-sync-testbed-await`](#no-sync-testbed-await)                       | `error` | `await` on a TestBed call that answers the TestBed or a fixture, never a promise                                                                           |
| [`no-private-member-access`](#no-private-member-access)                 | `error` | a `private` / `protected` member reached through brackets, a cast, or the prototype                                                                        |
| [`no-reflect-member-access`](#no-reflect-member-access)                 | `error` | `Reflect.get` / `Reflect.set` on a subject the test holds — a key no compiler checks                                                                       |
| [`no-mocked-for-spy`](#no-mocked-for-spy)                               | `error` | `Mocked<T>` in a type position where the value is a spy                                                                                                    |
| [`prefer-as-spy`](#prefer-as-spy)                                       | `error` | `TestBed.inject(X) as Spy<X>` — a cast that no longer compiles                                                                                             |
| [`no-ts-expect-error-on-double`](#no-ts-expect-error-on-double)         | `error` | `@ts-expect-error` / `@ts-ignore` above a double's `nextWith`, `mockReturnValue`, …                                                                        |
| [`no-jasmine-globals`](#no-jasmine-globals)                             | `error` | `jasmine.*`, bare `spyOn(` / `fail(` / `pending(`, and `.withContext(`                                                                                     |
| [`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry)   | `error` | `.and` / `.calls` / `.withArgs` in a file that installs the compatibility layer nowhere                                                                    |
| [`no-save-arguments-by-value`](#no-save-arguments-by-value)             | `error` | `spy.calls.saveArgumentsByValue()` — a no-op here                                                                                                          |
| [`prefer-native-spy-api`](#prefer-native-spy-api)                       | `error` | `.and` / `.calls` where the spy's own API says the same thing                                                                                              |

- **Ten rules take options:** [`prefer-create-spy-from-class`](#prefer-create-spy-from-class),
  [`no-stub-class-double`](#no-stub-class-double) and [`no-structural-double`](#no-structural-double)
  (`minRunnerFns`), [`prefer-render-shallow`](#prefer-render-shallow) (`templates`),
  [`prefer-inject-spy`](#prefer-inject-spy) (`ignoreTokens`),
  [`no-real-component-provider`](#no-real-component-provider) (`ignoreTokens`, `childInjectors`),
  [`no-redundant-mock-reset`](#no-redundant-mock-reset) (the runner's reset flags, `configFile`,
  `configFlags`), [`no-compile-components`](#no-compile-components) (`builder`, `ignoreComponents`),
  [`no-relative-mock-under-builder`](#no-relative-mock-under-builder) (`builder`) and
  [`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry) (`setupModules`).
- **Four rules need type information:** [`no-private-member-access`](#no-private-member-access),
  [`no-mistyped-use-value`](#no-mistyped-use-value),
  [`no-unknown-use-value-key`](#no-unknown-use-value-key) and
  [`prefer-to-have-signal-value`](#prefer-to-have-signal-value).
- **Two rules are also in `configs.typeErrors`,** because their findings do not compile:
  [`prefer-as-spy`](#prefer-as-spy) and [`no-mocked-for-spy`](#no-mocked-for-spy).

## no-expect-in-subscribe

**`error`** · suggestion · syntax only

Reports an `expect()` inside a `subscribe(…)` callback. That assertion runs only if the stream emits.
If the stream stays silent, the test passes without checking anything.

```ts
it('maps the products', () =>
  new Promise<void>((done) => {
    service.getProducts(id).subscribe((products) => {
      expect(products).toEqual(expected); // ❌ never runs if the stream stays silent
      done();
    });
  }));
```

```ts
import { firstValueFrom } from 'rxjs';

it('maps the products', async () => {
  const products = await firstValueFrom(service.getProducts(id)); // ✅ fails if nothing arrives

  expect(products).toEqual(expected);
});
```

**Options.** None.

**How to fix.** The message tells you which of three cases you have. Each needs a different edit:

```ts
// 1. invertible: the subscription is the last thing the test does. Await the value.
const value = await firstValueFrom(source$);
expect(value).toBe(1);

// 2. afterTrigger: a later statement makes the stream emit. Hold the promise first.
//    `await firstValueFrom(...)` would hang here: the trigger below it would never run.
//    `expectEmission` subscribes when you call it, not when you await it.
const emission = expectEmission(service.getCurrentLevel());
httpMock.expectOne(url).flush(payload);
await expect(emission).resolves.toEqual(payload);

// 3. inErrorHandler: the assertion is in the error branch. Assert the rejection.
await expect(firstValueFrom(source$)).rejects.toBeInstanceOf(UpstreamStatusError);
```

- If the stream emits several values and you meant to check each one, use
  `expectEmissions(source$, N)`.
- In the error case, also delete a `next: () => expect.unreachable(…)` guard next to the `error`
  callback. `await expect(firstValueFrom(source$)).rejects.toMatchObject({ status: 404 })` already
  fails when the stream succeeds.
- For the exact frame `it(name, () => new Promise((done) => …))`, your editor offers a suggestion
  that writes the rewrite. It uses `firstValueFrom` for a `next` handler and
  `lastValueFrom(src, { defaultValue: undefined })` for a `complete` handler, and adds the rxjs
  import.

**When to disable.** The rule reports the shape, not the mistake. It also reports a subscription to
a stream that surely emits, such as a `BehaviorSubject`, `of(…)`, or a `ReplaySubject` filled in the
same test. Rewrite those anyway; the assertion reads the same. Use a per-line disable when the
subscription itself is what you test, for example an unsubscribe check or a multicast count.

::: details How it decides
**What counts.** Every `expect(…)` under a `…subscribe(…)` call counts. So does a call of a plain name
under it: the rule finds that function in the same file and counts the `expect`s in its body. This is
one step deep and needs no type information. A helper declared _inside_ the callback is counted once,
not twice.

```ts
const assertShape = (data: Content): void => {
  expect(data.items).toHaveLength(3);
};

source$.subscribe((data) => assertShape(data)); // still an assertion that may never run
```

Reports are grouped per `subscribe`, so a callback with four assertions gets one message, not four.
One file of a real migration went from 44 messages to 23 this way.

**Which message you get** is also decided from syntax:

- **`inErrorHandler`**: the assertion is in the failure branch, positional (`subscribe(next, error)`)
  or named (`subscribe({ error })`). `subscribe({ next: () => expect.unreachable(…), error: (e) =>
expect(e).toBe(err) })` also becomes the single `rejects` line.
- **`afterTrigger`**: another statement follows the one that holds the `subscribe`, in the same
  block. That statement usually makes the stream emit (`req.flush(payload)`, `subject.next(…)`).
- **`invertible`**: neither, so the subscription is the last thing the test does.

The three were split because the right edit changes per file, not per project. Across five migration
batches, 110 of 111 places were a simple inversion in one file, and 36 of 119 in another.

**Why it is recommended.** A subscription that never fires is the purest green-and-wrong test. See
[four assertion forms against four stream behaviours](/core/observable-assertions): all four are
green when the stream emits nothing. Nothing in the run mentions it: no unhandled rejection, no
warning, no skipped test.

**Why a suggestion and not `--fix`.** The frame above was 111 of 133 findings in one batch of 22
migrated files, so it earns a recogniser. But the rewrite is equivalent only while the assertions are
the whole callback. A wrong rewrite leaves a test that still passes, which is the failure the rule
exists to catch. The suggestion is offered only when:

- the promise executor holds one `subscribe` statement and nothing else;
- there is one block-bodied callback, with one handler (not `subscribe({ next, complete })`);
- `done` is mentioned once and called last;
- the test callback does not take the Vitest context.

Anything else in the executor is usually the statement that triggers the source. It has to run while
something is already listening.

**Severity.** `error`. The finding is a test that passes while asserting nothing, and most fixes are
mechanical.
:::

## no-vacuous-absence-assertion

**`error`** · no fix · syntax and scope only

Reports a test where **every** assertion also holds when the stream sends nothing. Such a test cannot
tell "the result is empty" from "there is no result".

```ts
it('yields an empty list when no sub-genre resolved to an address', () => {
  let chips: GenreChip[] = [];

  load$(quickLinks).subscribe((result) => (chips = result)); // ❌ the test is green if this never runs

  expect(chips).toEqual([]);
  expect(catalog.getSectionById).not.toHaveBeenCalled();
});
```

```ts
it('asks for no shelf when no sub-genre resolved to an address', async () => {
  await expectNoEmission(load$(quickLinks)); // ✅ fails the moment something arrives

  expect(catalog.getSectionById).not.toHaveBeenCalled();
});
```

**Options.** None.

**How to fix.** Decide what the test claims:

- **Nothing arrives:** `await expectNoEmission(source$)`, as above.
- **An empty list arrives:** [`expectEmission`](/core/observable-assertions), which fails when nothing
  arrives:

```ts
expect(await expectEmission(load$(quickLinks))).toEqual([]);
```

**When to disable.** Rarely. The rule stays quiet as soon as one assertion in the test could fail on
a silent stream. It also skips any test that asserts through a helper of its own. Which findings block
a merge is one line of config.

::: details How it decides
The rule checks three facts, all in the file.

**1. The carrier.** A `const` / `let` declared inside this test, whose every write (besides the
declaration) sits inside a `subscribe` callback of the same test. Both forms count:
`subscribe((r) => (chips = r))` and `subscribe((r) => seen.push(r))`. A name bound to `vi.fn()` also
counts, if the test hands it to `subscribe` and never calls it itself.

**2. What silence leaves there.** The rule reads the initializer's source text (`'undefined'` for a
`let` with none). These matchers hold on silence:

- an equality matcher that repeats that text (`let chips = []` … `expect(chips).toEqual([])`);
- `toBeUndefined` / `not.toBeDefined` when the declaration holds `undefined`;
- `toBeNull` when it holds `null`;
- `toBeFalsy` / `not.toBeTruthy` when it holds any falsy literal;
- `toHaveLength(0)` when it holds `[]` or `''`;
- `not.toHaveBeenCalled` / `not.toHaveBeenCalledWith` / `toHaveBeenCalledTimes(0)` on any subject.

The reading is literal on purpose, not by matcher family. `toBeNull()` on a `let` with no initializer
does fail on silence, and is not reported.

**3. Nothing else in the test could fail.** Every other `expect()` in the test is weighed the same
way. One that a silent source could fail silences the rule. So does a call to `expectEmission`,
`expectEmissions`, `expectCompletion` or `expectError`: each times out on a source that never emits or
completes. This keeps the rule off the common shape "assert the absence, trigger the source, assert
the value".

**Limits.**

- A test that also asserts something positive is never reported, even if one line in it is vacuous.
- Only `expect()` counts as an assertion. `assert.exists(…)` and an awaited `expectCompletion(…)` do
  not keep the rule quiet.
- A test that asserts through its own helper is skipped: the rule cannot weigh the helper.
- A chain it cannot read to the end (`resolves`, `rejects`, a matcher taken as a value) counts as an
  assertion that can fail. That only makes the rule quieter.

**Why it is recommended.** It was proved by mutation, twice, on a 2 030-file Angular project. The
production source of the file above was replaced with one that never emits. Three sibling tests
failed, and this test stayed green. The same swap in a promo-banner service failed four tests and left
two green, both of this shape. Two tests further down that file capture into
`let chips: … | null = null` and assert `toEqual([])`, which _does_ fail on silence. The author knew
the idiom but did not apply it everywhere, which is what a linter is for. On that project the rule
reports **39 times across 33 files**: 22 written captures and 17 `vi.fn()`s handed to `subscribe`.

It is the other half of [`no-expect-in-subscribe`](#no-expect-in-subscribe). That rule reports the
assertion a silent stream never reaches. This one reports the assertion a silent stream satisfies.

**Why no fix and no suggestion.** The repair is five coordinated edits: delete the declaration,
replace the subscription with an awaited helper, drop the assertion, make the callback `async`, add an
import. `expectNoEmission` also asserts something _stronger_ than the line it replaces. A wrongly
accepted suggestion would turn a green test red, with a message about the helper instead of the code.
The message names the repair instead, like [`prefer-stub-response`](#prefer-stub-response).

**Severity.** `error`. The evidence is the declaration and the matchers, both in the file. The
finding is a test that proves nothing about the source it names. The fix is one test at a time, not a
migration. A large project will not reach zero at once; which findings block a merge stays one line
of config, as with [`prefer-settle-dynamic-import`](#prefer-settle-dynamic-import).
:::

## no-floating-assertion

**`error`** · no fix · syntax only

Reports an `expect()` inside a `.then()`, `.catch()` or `.finally()` callback when nothing awaits,
returns, stores or passes on the chain. The callback runs after the test has finished, so the
assertion cannot fail the test.

```ts
it('compiles', () => {
  TestBed.compileComponents().then(() => expect(fixture.componentInstance).toBeTruthy()); // ❌
});
```

```ts
it('compiles', async () => {
  await TestBed.compileComponents(); // ✅ the test waits, so the assertion can fail it

  expect(fixture.componentInstance).toBeTruthy();
});
```

**Options.** None.

**How to fix.** Make the test `async`, `await` the promise, and assert after the `await`.

**When to disable.** Almost never. The rule reports only what awaiting really fixes. An `expect()`
parked deeper, for example in a `setTimeout` inside the `.then()`, is not reported. For that case,
turn on [`setupAutoSpy({ strayRejections: true })`](/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed),
which catches at run time what no lint rule can see.

::: details How it decides
**The walk up the chain.** In `p.then(a).catch(b)`, the parent of `p.then(a)` is a member expression.
Only the last call in the chain has a parent that says whether anything uses the promise. So the rule
walks up to the end of the chain; reading the immediate parent would clear the first callback of every
chain with a second one.

**Only the immediately enclosing callback counts.** One callback deeper, awaiting the chain no longer
helps: it revives an assertion in the `.then()` body, not one parked in a `setTimeout` inside it.
Those deeper shapes are left to [`no-expect-in-subscribe`](#no-expect-in-subscribe) and to
`strayRejections`. A computed method name (`p[settle](…)`) is not surely a promise callback, so it is
left alone. A chain that asserts nothing is not reported, so the rule does not help against a
floating chain that only has a side effect.

**Why it is recommended.** What the run shows depends on the environment, and neither answer names
the test. The same two tests (an `expect()` in an unawaited `.then()`, and an `async` helper called
without `await`) in three setups:

|                                                     |          tests           | what the runner reports                                   |
| --------------------------------------------------- | :----------------------: | --------------------------------------------------------- |
| zoneless                                            |       **2 passed**       | 2 `Unhandled Rejection`, exit 1, neither linked to a test |
| zone.js                                             |       **2 passed**       | 1 error; zone.js moved the other into `console.error`     |
| zone.js + `setupAutoSpy({ strayRejections: true })` | **1 failed \| 1 passed** | the hidden one is now a named failure on the right test   |

The assertion is false in every row, and the test is green in every row but the last.

**Severity.** `error`. The test is green and wrong, and no diagnostic points at the spec.
:::

## no-done-callback

**`error`** · no fix · syntax only

Reports a `done`-style first parameter on `it` / `test` / `beforeAll` / `beforeEach` / `afterAll` /
`afterEach`, and `done.fail(…)` on it. Vitest passes its test context object in that place, and
calling it as `done()` throws an error. When that call sits inside a callback, nobody catches the
error, and the test **passes** having run almost none of itself.

```ts
it('loads', (done) => {
  service.load().subscribe((value) => {
    expect(value).toBe(1);
    done(); // ❌ TestContext is not a function
  });
});
```

```ts
import { firstValueFrom } from 'rxjs';

it('loads', async () => {
  expect(await firstValueFrom(service.load())).toBe(1); // ✅
});
```

**Options.** None.

**How to fix.** Make the test `async` and await an assertion, as above.

- For `done.fail(…)`, assert on the failure:
  `await expect(firstValueFrom(source$)).rejects.toMatchObject({ status: 404 })`.
- If the line marks a branch that must never run, write `expect.fail(message)`.

**When to disable.** Rarely. The parameter is fine when the body only reads members of it, such as
`ctx.skip()` or `ctx.task`; the rule already stays quiet then. A destructured parameter
(`({ task })`) and a callback with no parameter are never reported.

::: details How it decides
**What the parameter is.** Vitest 4 passes a **callable** `TestContext`:

```text
typeof done                → 'function'
Object.keys(done)          → signal, task, skip, annotate, onTestFailed, onTestFinished
done()                     → Error: done() callback is deprecated, use promise instead
```

A direct call fails at once, with a clear error. Almost nobody writes that. A Jasmine suite puts `done()` at
the bottom of a callback instead:

```ts
it('loads', (done) => {
  setTimeout(() => {
    expect(1).toBe(999); // ← throws here, so done() is never even reached
    done();
  }, 0);
});
```

The body returns `undefined`, so the test is over before the timer fires. Measured: **green**. The
`AssertionError` arrives later as one of the run's unhandled errors, and the deprecation error never
happens at all. Four such tests stayed green for years in the project this rule came from.

`done.fail(…)` is worse in the same way. `TestContext` has no `fail`, so the line throws
`done.fail is not a function`. It throws where it sits, which is almost always an `error` callback or
a `.catch()`. The rejection is unhandled, and the run is **green on the exact path that was supposed
to fail it**.

**How the rule tells `done` from a context.** It looks at the parameter's form and at what the body
does with it, never at its name:

- A destructuring pattern (`({ task })`) and a callback with no parameters are silent. A
  `test.extend` fixture has to be destructured.
- A plain name is the ambiguous case. Vitest passes `TestContext` there either way, and
  `(ctx) => ctx.skip()` is Vitest's own example.
- The rule stays quiet when **every** use of the name is a member read: `ctx.task`, `ctx.expect`,
  `ctx.onTestFinished`.
- It reports when the name is called (`done()`), handed to something that calls it
  (`.subscribe(done)`, `setTimeout(done)`), or never used at all.
- `.fail` is the one member read that is not a context use: `TestContext` has no such member. This is
  the rule's second message. It applies only to a parameter the rule has already reported, found
  through scope analysis. A `fail` method on some other object is somebody's API.

**Limits.** A helper that takes one positional argument and is called as a hook looks the same. The
rule matches only the six runner names, so this is rare. An unused parameter is reported on purpose:
an unused `done` is the shape the runner will never call, and an unused context can simply go. A name
read only through members is taken as a context, however it is spelled.

**Severity.** `error`. A test that passes without running is not something to read past in lint
output.
:::

## no-bare-called-with

**`error`** · no fix · syntax only

Reports `calledWith(…)` or `mustBeCalledWith(…)` written as a statement of its own. In this library
`calledWith` sets up a stub; on its own line it asserts nothing, so the test passes whether or not
the call happened.

```ts
cart.checkout.calledWith(1); // ❌ configures "answer undefined for 1", asserts nothing
```

```ts
cart.checkout.calledWith(1).mockReturnValue(receipt); // ✅ a finished stub
expect(cart.checkout).toHaveBeenCalledWith(1); // ✅ or an assertion, if that was the intent
```

**Options.** None.

**How to fix.** Pick what you meant:

- **A stub:** continue the chain with `.mockReturnValue(v)`, `.resolveWith(v)`, `.nextWith(v)` or
  `.failWith(err)`.
- **An assertion:** `expect(spy.method).toHaveBeenCalledWith(…)`.

**When to disable.** Not needed for chai: chains that start at `expect(…)` are never reported, so
`expect(fn).to.have.been.calledWith(x)` is fine. A `calledWith` chain stored in a variable and
continued later is not a bare statement either.

::: details How it decides
**Two meanings of one word.** `calledWith` is this library's **stub** configurator. Since Vitest 4.1,
chai's bundle also has `calledWith` as an **assertion**, for projects coming from sinon:

```ts
expect(fn).to.have.been.calledWith('example'); // chai: checks that the call happened
cart.checkout.calledWith(1); // this library: configures what a call answers
```

The rule tells them apart by walking the member chain down to its root. An assertion always starts at
a call to `expect`; a stub always starts at a spy. `mustBeCalledWith` needs no such check, because
chai has nothing with that name.

**Why it is recommended.** On its own, `calledWith(1)` registers "for the argument `1`, answer
`undefined`". An unconfigured spy already does that, so the test passes whether or not the call
happened. `mustBeCalledWith` on its own is wrong the other way. With nothing configured for its
arguments, it rejects **every** call, the matching one included. Its failure names the arguments, so
it reads like a mismatch rather than a missing `.mockReturnValue`. That is why it gets its own
message.

**Limits.** The rule cannot tell a stub you meant to finish from an assertion in the wrong
vocabulary, so the message names both fixes.

**Severity.** `error`. Green and wrong, and a one-word fix.
:::

## no-constant-expect

**`error`** · no fix · syntax only

Reports `expect(value)` when the value is written out in the spec, and the matcher's answer is
already fixed by that value. Such a test passes whatever the code does.

```ts
it('emits after the timeout', () => {
  cache.waitUntilReady().subscribe();
  vi.runOnlyPendingTimers();

  expect(true).toBe(true); // ❌ passes whatever the stream did
});
```

```ts
it('emits after the timeout', async () => {
  const emitted = expectEmission(cache.waitUntilReady(), { advance: () => vi.runOnlyPendingTimers() });

  await expect(emitted).resolves.toBeUndefined(); // ✅
});
```

**Options.** None.

**How to fix.** Assert on a value the code produced. If the line marks a branch the test must never
reach, such as `expect(true).toBe(false)` in an `error` callback, write
`expect.fail('the request should not fail')`. It says the same thing and names the branch.

**When to disable.** Not needed. The rule reads only values written in the spec, so it has no false
positives on real values.

::: details How it decides
**Two readings of the value**, one per kind of matcher. Any number of `.not` in between is allowed.

- `toBe`, `toEqual` and `toStrictEqual` are decided when **both** sides are constant. A constant is a
  literal, a template literal with no `${…}`, `undefined`, a unary operator over a constant, a
  function, arrow or class expression, or an array or object literal whose every element is one of
  those. A spread, a computed key, a getter or any name makes the value live.
- `toBeTruthy`, `toBeFalsy`, `toBeDefined`, `toBeUndefined`, `toBeNull` and `toBeNaN` are decided for
  those constants **and** for any object, array, function or class literal, whatever it holds. An
  object is never falsy, nullish or `NaN`.

Left alone:

- a chain through `.resolves` / `.rejects`;
- every other matcher: `expect(() => load()).toThrow()` passes an arrow on purpose;
- arithmetic: `expect(1 + 1).toBe(2)` is not evaluated;
- a constant behind a name: `const ok = true; expect(ok).toBe(true)`;
- `expect.soft(…)` and chai's `expect(x).to.be.true`.

Casts are read through.

**Why it is recommended.** [`vitest/expect-expect`](/utilities/eslint-plugin#alongside-vitest-expect-expect)
sees an `expect` and is satisfied. So a test whose only assertion is a constant is green in every
possible state of the code. On one Angular project of 1759 spec files the rule reported four times in
four files:

- a test named after a stream that never looked at it;
- a test kept after its feature was removed;
- two tests that import a barrel only so its lines count as covered.

`@vitest/eslint-plugin` (1.6) has no rule for this. Its `valid-expect` checks the shape of the call,
not what it receives.

**Severity.** `error`. The finding is a fact about the line: nothing the code does can change its
answer.
:::

## no-redundant-smoke-test

**`error`** · suggestion · syntax only

Reports a test that only checks the subject exists, such as `expect(pipe).toBeTruthy()`, when other
tests in the same block already build that subject. If the subject were broken, those tests would
fail first, so the smoke test adds nothing.

```ts
describe('IndicatorOffsetPipe', () => {
  let pipe: IndicatorOffsetPipe;

  beforeEach(() => {
    pipe = new IndicatorOffsetPipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy(); // ❌ green in every state of the code this file can reach
  });

  it('clamps a position past the right edge', () => {
    expect(pipe.transform(120, 100, 200)).toBeLessThanOrEqual(95);
  });
});
```

**Options.** None.

**How to fix.** Delete the test. The suggestion does it, including the blank line above. The test
below runs the same `beforeEach`, so a missing `pipe` fails **it** first, on `transform` of
undefined, which names what the spec was doing.

If building the subject really is what you test, assert on that instead. For example, a factory
that rejects a bad config:

```ts
it('refuses a config with no bucket', () => {
  expect(() => new Uploader({ bucket: '' })).toThrow('bucket is required'); // ✅
});
```

**When to disable.** A block whose only running test is the smoke test is never reported. The rule
does not check what the other tests build, so it also reports a smoke test whose siblings test a
**different** subject. That spec asserts the wrong thing, but know that the rule reads it this way.

::: details How it decides
The rule reads only the bodies of the block's tests.

- **A smoke test** is a body where each statement is `expect(x)` under `toBeTruthy`, `toBeDefined` or
  `toBeInstanceOf`, or under `toBeFalsy`, `toBeNull` or `toBeUndefined` behind a `.not`. One
  statement that does anything else (a call, a local, an `if`, a matcher that reads a value) and the
  test is left alone. An empty body is not a smoke test.
- **The value must be a reference to the subject**, not something the test computed. That means an
  identifier, a member chain with no call (`fixture.componentInstance`), or a call that only builds
  the subject with no arguments (`createService()`, `TestBed.inject(Token)`). Left alone:
  - a call with a value in it, a method or signal read, a DOM query, an expression over a collection.
    `expect(isRestrictedProfile(MEMBER_ROLE.CHILD)).toBeTruthy()` and
    `expect(el.querySelector('expand-card')).toBeTruthy()` are not smoke tests;
  - a DOM query behind a name: `expect(minimap()).not.toBeNull()`, where the file's own `minimap`
    helper calls `querySelector`, `query(All)`, `getElement*`, `closest`, `By.*` or
    `queryElement`, or a name bound once to such a result. That asserts which branch of the template
    rendered;
  - a builder under `toBeInstanceOf`: it asserts that two names resolve to each other, which is
    wiring.
- **A running test in the block must reach the subject the same way,** by the whole path, not just
  the first name. `expect(publicApi.FocusModule).toBeDefined()` next to a test of
  `publicApi.viewerSettings` shares only the word `publicApi`, so it is not reported. The same goes
  for a flag a `beforeAll` sets from an observable's `complete`, when the siblings read the collected
  values.
- **Which tests count:** the rest of its own block, and every test in blocks nested inside it. A
  skipped sibling (`it.skip`, `xit`, `it.todo`) proves nothing and does not count. A skipped smoke
  test is still reported.
- **A test in a nested block** is not weighed against the block above it. The outer tests do not run
  the inner `beforeEach`.
- A block whose only running test is this one is left alone. Such a spec is thin, but a rule that
  empties a file is no longer a lint rule.

**Limits.** Syntax only. An existence check behind a helper (`expectCreated(pipe)`) is not read, and
neither is one through `expect.soft`. `it.each([…])('…')` is read as one test.

**Why it is recommended.** The line cannot fail on its own, yet it looks like coverage. On one Angular
project of 1771 spec files: 569 reports in 540 files. 515 of them were titled `should create`,
`should be created` or `create an instance`: what `ng generate` writes into every new spec. On a
second project of 845 files: 97 reports in 87 files. On a third, of 127 files: one.
[`vitest/expect-expect`](/utilities/eslint-plugin#alongside-vitest-expect-expect) sees an `expect`
and is satisfied; `@vitest/eslint-plugin` (1.6) has no rule for this.

**Severity.** `error`. Nothing the code under test does can change the answer, and the fix is a
deletion.
:::

## no-self-called-spy

**`error`** · no fix · syntax and scope only

Reports a test that spies on a method, calls that method itself, and then asserts it was called. The
test makes its own assertion true, so it checks nothing about the code.

```ts
it('relays subscribeClick from children', () => {
  const emitSpy = vi.spyOn(component.subscribeClick, 'emit');
  component.subscribeClick.emit(payload); // ❌ the test makes its own assertion true
  expect(emitSpy).toHaveBeenCalledWith(payload);
});
```

```ts
it('relays subscribeClick from children', () => {
  const emitSpy = vi.spyOn(component.subscribeClick, 'emit');
  renderShallow(Parent).query(ChildComponent).subscribeClick.emit(payload); // ✅ the real trigger

  expect(emitSpy).toHaveBeenCalledWith(payload);
});
```

**Options.** None.

**How to fix.** Drive whatever should make the call: dispatch the DOM event, emit on the
collaborator's double, or call the public method that should relay it. The message carries the
whole repair.

**When to disable.** Not needed; the rule is quiet by design. It never reports:

- a call written **before** the spy: that is arrangement;
- a negated assertion, or `toHaveBeenCalledTimes(0)`;
- a call whose record `mockClear` / `mockReset` / `mockRestore` / `vi.clearAllMocks()` drops before
  the assertion;
- an assertion whose arguments differ from the ones the call passed;
- a spy installed in a hook, or a call from inside a callback.

::: details How it decides
**Three positions in one test body,** matched on the text of the object and the name of the member:
`vi.spyOn(obj, 'm')`, then a direct `obj.m(…)` by the test **after** it, then a positive
`toHaveBeenCalled*` on the same member. Order is the whole rule. In another order the same shapes are
normal arrangement: put the subject in a state, install the spy, then drive the production path.

**Why it is recommended.** The test above proves that `EventEmitter.emit` calls
`EventEmitter.emit`. Delete the `(subscribeClick)="…"` binding its title names, and it stays green.
It survives the removal of the behaviour it claims to check.

It is a quiet rule. On a 2 030-file project it reports **5 sites in 3 files**: three
`EventEmitter.emit` relays in one component spec, and two of the same shape elsewhere. It costs a
project nothing (no finding on a spec that drives the production path), and what it catches is a test
with no subject at all.

**Limits in detail.**

- "It was not called" is not made true by a call, so negated assertions are never reported.
- A reset between the call and the assertion means the spec itself says the assertion is about the
  production path. Five sites in one file of the measured project are exactly that.
- `expect(component.scale.set).toHaveBeenCalledWith(3)` after an arranging `component.scale.set(2)`
  cannot be satisfied by that line. The argument check compares source text, so it errs on the quiet
  side: the same value spelled two ways is let through.
- A spy in a **hook** is shared by every test of the block, and most of them drive the production
  path.
- A call from **inside a callback** is made by the code under test, not by the test.

**Why no fix and no suggestion.** There is no edit at the reported node. The fix depends on what the
test meant, which [`no-vacuous-absence-assertion`](#no-vacuous-absence-assertion) declines to guess
for the same reason.

**Severity.** `error`. The evidence is three lines of the file in one order, with no guessing, and
the finding is a test that proves nothing about the code it names.
:::

## prefer-create-spy-from-class

**`error`** · no fix · syntax only · option `minRunnerFns`

Reports an object literal with **two or more** properties whose value is `vi.fn()` / `jest.fn()`.
Such a hand-written double has only the methods somebody remembered. When the class gets a new
method, the double goes out of date.

```ts
const cart = { total: vi.fn(), add: vi.fn() } as unknown as CartService; // ❌
```

```ts
const cart = createSpyFromClass(CartService); // ✅ follows the class, no edit needed later
```

**Options.**

| Option         | Type                | Default | Meaning                                               |
| -------------- | ------------------- | ------- | ----------------------------------------------------- |
| `minRunnerFns` | integer, at least 1 | `2`     | how many `vi.fn()` properties make an object a double |

```js
'vitest-auto-spy/prefer-create-spy-from-class': ['error', { minRunnerFns: 1 }],
```

**How to fix.** Replace the object with `createSpyFromClass(Class)`, which reads the class, or with
`createAutoMock<T>()`, which reads the type. Use `createAutoMock<T>()` for an interface or an abstract
class. The message names the double, how many `vi.fn()`s it holds and which, and the
`createAutoMock<T>()` for the type its name declares.

A one-member object, such as a thenable `{ then: vi.fn() }`, has no class to read. For it the message
names `createMock<T>({ then: vi.fn() })`, which checks the key and the signature against `T`. A nested
`{ set: vi.fn() }` / `{ update: vi.fn() }` stands in for a signal, so its message names
`mockSignalProp` instead.

**When to disable.** If two doubles on neighbouring lines disagree (one reported, one not), check the
threshold first. With the default `2`, an object with one `vi.fn()` is not reported, because it looks
exactly like an options bag with a callback in it (`{ onDone: vi.fn() }`). Set `minRunnerFns: 1` if
you want those too. Also see what the rule already skips, below.

::: details How it decides
**The count.** The rule counts the object's own properties, not its subtree. A value counts when it
unwraps to `vi.fn()` / `jest.fn()`, however long the configured chain is:
`vi.fn().mockReturnValue(of([]))` and `vi.fn().mockReturnValue(x).mockName('y')` both count. The rule
fires on every object literal in the file, so an inner object is judged on its own properties. A
property also counts when its value is a name the file binds once to a `vi.fn()`: `{ load, save }`
over two `const … = vi.fn()`.

**What it skips:**

- an object a provider's `useValue` hands to DI, written in the slot or one name away. That is
  [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)'s case, and two reports on one double teach
  people to disable both;
- anything inside a call to `autoMocked`, `createActivatedRoute`, `createAutoMock`,
  `createComponentStub`, `createDirectiveHost`, `createDocumentDouble`, `createMock`,
  `createRouterDouble`, `createSpyClass`, `createSpyFromClass`, `createWindowDouble`,
  `mockConstructor`, `mockDeep`, `provideActivatedRoute`, `provideAutoSpy`,
  `provideAutoSpyForToken`, `provideDocumentDouble`, `provideRouterDouble` or
  `provideWindowDouble`, at any depth. That object is a **seed** (the overrides bag or per-instance
  values), which is what the rule asks for:

  ```ts
  const xhr = createAutoMock<XhrLike>({ send: vi.fn(), abort: vi.fn() }); // ✅ never reported
  const api = mockDeep<Api>({ api: { load: vi.fn(), save: vi.fn() } }); // ✅ nor at any depth
  ```

- anything inside a `vi.mock()` / `vi.doMock()` factory, whose object replaces a module's exports,
  and anything a `vi.hoisted()` callback returns: `vi.hoisted(() => ({ spawnMock: vi.fn() }))`;
- an options bag passed straight to a call or a `new`: exactly one `vi.fn()` next to at least one
  plain value, as in `service.openDialog({ elRef, options, onColorChange: vi.fn() })`. Only
  `{ minRunnerFns: 1 }` reaches this shape. Two mocks, a function value, or the same object stored in
  a `const` first are still reported. The same applies to a bag nested in a call argument,
  `render({ options: { slide, onClose } })`;
- anything inside `createFixture(…)` / `createFixtureFactory(…)`, such as
  `createFixture<Options>({ changeOptionsCallback: vi.fn() })`, which is already typed against the
  model;
- an RxJS observer passed straight to `subscribe(…)` or `tap(…)`:
  `source$.subscribe({ error: vi.fn() })`;
- a provider descriptor, meaning any object with a `provide:` key;
- the input map of `setInputs(fixture, { … })` and of `renderShallow(C, { inputs: { … } })`, which
  both check it against the component's inputs;
- a `return { preventDefault, stopPropagation }` of names only, where every spy in it is also read
  elsewhere: handles to spies a helper installed. A factory whose spies exist only in what it returns
  is still reported;
- an object under the threshold.

**One-member objects that are already typed are skipped too:**

- a one-member literal bound to a name with a declared type
  (`const parameters: Record<string, unknown> = { fn }`, at any depth), unless that type is itself an
  inline object type;
- one inside the value of `mockValueProp` / `mockReadonlyProp` / `mockSignalProp`;
- an argument of a helper declared in the same file, when the parameter is typed:
  `createDefaultOptions({ onChange: callback })` over
  `const createDefaultOptions = (overrides?: Partial<Options>) => …`.

An **imported** helper's parameter is out of reach for a syntax-only rule, so the same call is still
reported there. Wrap the literal in `createMock<Partial<Options>>(…)`, or bind it to a typed `const`.

**A configured spy is still a spy.** `vi.fn()` and `vi.fn().mockReturnValue(of([]))` are the same
double, one of them tuned. The rule unwinds the chain to the call that created the mock. The more a
hand-written double has been tuned, the further it has drifted from the class.

**Why it is recommended.** The class grows a method, and the spec dies in application code, several
frames away from the object that is wrong:

```text
F1  hand-written { total: vi.fn() }        → TypeError: cart.applyCoupon is not a function
F2  createSpyFromClass(CartService)        → follows the class, no edit
```

The type system does not catch it, because the double never matched the class. The
`as unknown as CartService` in front of it hides the error:

```text
TS2741: Property 'rate' is missing in type '{ total: Mock<Procedure>; add: Mock<Procedure>; }'
        but required in type 'CartService'.
```

`createSpyFromClass` reads the prototype and `createAutoMock<T>()` reads the type, so neither can
go out of date.

**Why the threshold is 2.** The rule cannot tell `{ onDone: vi.fn() }` from `{ load: vi.fn() }`, and
it runs on every object literal. The visible cost is two doubles on neighbouring lines, one reported
and one not; seven migration batches ran into it. The one-`vi.fn()` doubles are covered by rules that
have proof: [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) has a `provide:` next to the
object, [`no-structural-double`](#no-structural-double) has a declared type, and
[`no-stub-class-double`](#no-stub-class-double) reads the class form. All three fire at **one**.

**Severity.** `error`. Without the rule the test goes red, but the message names a method instead of
the double, and the fix is a rewrite of the double, not one line.
:::

## no-stub-class-double

**`warn`** · no fix · syntax only · option `minRunnerFns`

Reports a class whose own fields are `vi.fn()` / `jest.fn()`. It is the same hand-written double as
an object of `vi.fn()`s, with a `new` in front: when the real class gets a method, the stub falls
behind.

```ts
class PaymentCardServiceMock {
  getPreviewUrl = vi.fn().mockReturnValue(of(url));
  load = vi.fn();
} // ❌

const mock = new PaymentCardServiceMock();
```

```ts
const mock = createSpyFromClass(PaymentCardService); // ✅
// or, where the double stands in for an interface or an abstract class:
const mock = createAutoMock<PaymentCardService>();
// and behind DI, the whole stub class goes away:
providers: [provideAutoSpy(PaymentCardService)];
```

**Options.**

| Option         | Type                | Default | Meaning                                         |
| -------------- | ------------------- | ------- | ----------------------------------------------- |
| `minRunnerFns` | integer, at least 1 | `1`     | how many `vi.fn()` fields make a class a double |

**How to fix.** Delete the stub class and use `createSpyFromClass(Class)`, `createAutoMock<T>()`, or
`provideAutoSpy(Class)` in `providers`.

**When to disable.** The rule decides on a guess, so it ships as `warn`. Turn it off if you disagree
with the reading; [`prefer-create-spy-from-class`](#prefer-create-spy-from-class) keeps working.
Turn it up to `error` once your stubs are gone. It does not see:

- a stub class in a shared `*.mock.ts`: the declaration must be in the linted file;
- fields assigned in the constructor (`this.load = vi.fn()`).

::: details How it decides
**The count** reads the class's own initialized fields, and unwraps a configured chain:
`load = vi.fn().mockReturnValue(of(url))` counts. `static` fields count too: a `static` field of
`vi.fn()`s is the same double, built once per module. A field with no initializer, a computed key,
and a field assigned in the constructor do not count.

**Four kinds of class are skipped,** because a spec file has many classes that hold a `vi.fn()` and
are not service doubles:

- a **decorated** class: a test host or a testing module, whose `vi.fn()` fields are event handlers
  (`onChange = vi.fn()`);
- a class with a non-empty **`implements`** clause. It _cannot_ drift: add a member to the type and
  the stub stops compiling;
- a class that **`extends`** something. It inherits real behaviour, so `provideAutoSpy` is not its
  replacement;
- a class with **no name of its own**, a class expression in a property slot. That one replaces a
  module export that is then used as a DI token, and a token has to be a constructor. This covers
  both `vi.mock('m', () => ({ C: class { … } }))` and the object stored in a `const` that the factory
  only names.

**A class the same file hands to DI is skipped:** through `useClass:`, `useExisting:`,
`useValue: new StubMock()`, or a `TestBed.overrideProvider` descriptor that names it. That provider
is [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)'s case, at `error`, and it is where the fix
is written. This rule copies that rule's conditions exactly, `multi: true` included: where that rule
stays silent, this one reports.

**Why the count starts at one.** [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)
needs two, because `{ onDone: vi.fn() }` looks like `{ load: vi.fn() }`. Nobody writes an options bag
as a class. On one project of 1759 spec files, a threshold of two fields reports 6 classes and one
field reports 12; the six the higher threshold hid are all named `*Mock` or `Mock*`.

**The one false shape.** A non-decorated, non-extending local helper class holding one `vi.fn()`
callback is reported without being a service double. None existed in the measured project, and the
message names `createAutoMock<T>()`, which is still right if the class stands in for anything.

**Why it is recommended.** The same drift as `prefer-create-spy-from-class`: the spec dies on
`TypeError: mock.applyCoupon is not a function` in application code. It is its own rule because it
was the _largest_ family left in a project that ran every `error` rule with no `eslint-disable`: 112
`vi.fn()` fields in 46 classes across 32 files. `prefer-create-spy-from-class` matches object
literals, and a class declaration is not one.

**Severity.** `warn`, because of the evidence, not the finding. The defect is the one
`prefer-create-spy-from-class` reports at `error`. But that rule has a count it can defend, and this
one has a heuristic with four hand-picked exemptions. A project that disagrees must be able to turn
this off without losing the count-based rule. On one project of 1759 spec files it reports 10 times
in 7 files.
:::

## no-structural-double

**`warn`** · no fix · syntax only · option `minRunnerFns`

Reports an object of `vi.fn()`s assigned to a name whose **declared type** is an inline object type
with a Vitest mock member, such as `let card: { load: Mock }`. The declaration says the object stands
in for a type, and then the object writes that stand-in by hand, one method at a time. It goes out of
date when the type changes.

```ts
let devModeService: { devMode: Mock };

beforeEach(() => {
  devModeService = { devMode: vi.fn().mockReturnValue(true) }; // ❌
});
```

```ts
let devModeService: Spy<DevModeService>;

beforeEach(() => {
  devModeService = createAutoMock<DevModeService>(); // ✅ reads the type
  devModeService.devMode.mockReturnValue(true);
});
```

**Options.**

| Option         | Type                | Default | Meaning                                                                                     |
| -------------- | ------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `minRunnerFns` | integer, at least 1 | `2`     | the rule reports only **below** this count; keep it equal to `prefer-create-spy-from-class` |

**How to fix.** Declare the variable as `Spy<T>` and build it with `createAutoMock<T>()`.
`createAutoMock<T>()` also works where `provideAutoSpy` cannot, for an abstract class or an
interface. If the object goes into Angular DI, the fix is `provideAutoSpy(Class)`; that case is
reported by [`prefer-provide-auto-spy`](#prefer-provide-auto-spy).

**When to disable.** The evidence is a reading of the declaration, so the rule ships as `warn`. Turn
it off if you disagree; [`prefer-create-spy-from-class`](#prefer-create-spy-from-class) keeps working.
It never reports:

- a **bare** `let fn: Mock`: that is a plain callback, and `Mock` is its correct type;
- an `X.y as Mock` cast, which retypes a function that already exists;
- a double declared through an interface, a type alias, a `Record<…, Mock>` or an intersection;
- an object assigned to anything but a plain name (`state.svc = { … }`, a destructured binding, a
  parameter).

::: details How it decides
**The declaration is the evidence.** `prefer-create-spy-from-class` needs two `vi.fn()`s, because
`{ onDone: vi.fn() }` and `{ load: vi.fn() }` look the same. Writing `Mock` as a **member of an object
type** settles it: nobody annotates an options bag as `{ onDone: Mock }`. So this rule reports at a
single `vi.fn()`, as `prefer-provide-auto-spy` does when a `provide:` proves the point.

**The name is followed both ways a spec writes it:** the declarator's own annotation
(`const svc: { load: Mock } = { … }`), and an assignment back to the `let` that declared it. The
second is the one that matters. In the measured project, **not one** of 120 annotated doubles had an
initializer: each was `let x: { … };` at the top of the `describe` and `x = { … }` in a `beforeEach`.

**Any Vitest mock type counts as the member type:** `Mock`, `MockInstance`, `Mocked`, `MockedClass`,
`MockedFunction`, `MockedFunctionDeep`, `MockedObject`, `MockedObjectDeep`, `PartialMock`. Whichever
appears, it is the type of one **member**, and a member of a hand-written object type is a method
somebody remembered. Which of them means a whole-object double is
[`no-mocked-for-spy`](#no-mocked-for-spy)'s question.

**What it skips:**

- a double handed to Angular DI, a factory seed, and a `vi.mock()` factory, as
  `prefer-create-spy-from-class` does;
- anything at or above `prefer-create-spy-from-class`'s threshold. That rule already reports those at
  `error`, so one double never gets two reports. Both read the same `minRunnerFns`; if you change it,
  change it on both;
- a declaration wrapped in anything. `Mocked<{ load: Mock }>` is `no-mocked-for-spy`'s report. An
  intersection with real fields is the one shape where the object really is part configuration. An
  `interface` or `type` alias has no value in view, so there is nothing to point at.

**The DI skip is one name wide.** [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) follows a
name into a `useValue`, and this rule follows the same name back to its declaration. Otherwise the
shape below would get two reports that disagree about the fix:

```ts
let svc: { load: Mock };

beforeEach(() => {
  svc = { load: vi.fn() };
  TestBed.configureTestingModule({ providers: [{ provide: Card, useValue: svc }] });
});
```

Most annotated doubles turned out to be this shape. Of 115 candidates in the measured project,
**110** go to DI one name away. They belong to the provider rule, whose answer is
`provideAutoSpy(Card)`. What is left for this rule is 5 reports in 4 files.

**Why a bare `Mock` is never reported:** 109 of the 290 `Mock` references in the measured project were
plain callbacks.

**Severity.** `warn`, for the same reason as [`no-stub-class-double`](#no-stub-class-double): the
defect is real, but the evidence is a reading of a declaration, not a count, and nothing else in the
file proves the object is a stand-in. The severity was set on the evidence, not on the number of
reports.
:::

## prefer-spy-on-own-method

**`warn`** · `--fix` and suggestion · syntax only

Reports a `createSpyFromInstance` call that spies one method and is used for that method only. The
[`spyOnOwnMethod` and `spyOnVoidMethod`](/core/create-spy-from-class#spy-on-own-method) helpers say
the same thing in one call.

```ts
const seek = createSpyFromInstance(player, {
  onlyMethodsToSpyOn: ['seek'],
  passthrough: true,
}).seek; // ❌

let spy: Spy<Player>;
beforeEach(() => {
  spy = createSpyFromInstance(player, { onlyMethodsToSpyOn: ['seek'], passthrough: true }); // ❌
});
it('seeks', () => expect(spy.seek).toHaveBeenCalled());
```

```ts
const seek = spyOnOwnMethod(player, 'seek'); // ✅

let spy: Spy<Player>['seek'];
beforeEach(() => {
  spy = spyOnOwnMethod(player, 'seek'); // ✅
});
it('seeks', () => expect(spy).toHaveBeenCalled());
```

**Options.** None.

**How to fix.** The rule knows three shapes:

| Options passed                                             | Replace with                   | How        |
| ---------------------------------------------------------- | ------------------------------ | ---------- |
| `{ onlyMethodsToSpyOn: ['m'], passthrough: true }`         | `spyOnOwnMethod(target, 'm')`  | `--fix`    |
| `{ onlyMethodsToSpyOn: ['m'], returns: { m: undefined } }` | `spyOnVoidMethod(target, 'm')` | `--fix`    |
| `{ returns: { m: undefined } }` on a real event or element | `spyOnVoidMethod(target, 'm')` | suggestion |

`--fix` rewrites the call and turns every `name.m` read into `name`. It imports the helper next to the
factory: from the same entry point if that one exports the helper, otherwise from the adapter entry
point the file imports, or from the root. It drops the factory's import once the last use is gone.

- A `Spy<X>` annotation on the name becomes `Spy<X>['m']`, as a suggestion rather than a fix.
- Any other annotation, explicit type arguments, or a `spyOnOwnMethod` the file declares itself: the
  report comes without an edit.
- Several rewrites in one `--fix` pass can leave the `createSpyFromInstance` import unused. Your
  unused-import rule catches it.

**When to disable.** The call it reports is correct and does exactly what the helper does. It is a
shorter spelling, not a defect, so the rule is `warn`. The exact shapes have `--fix`, so turning it up
costs one `eslint --fix` run.

::: details How it decides
**"Used for that one method alone"** is one of four spellings, on one line or across ten:

- `.m` (or `['m']`) read off the call;
- `const { m } = …`;
- the call as a statement of its own;
- a name written once with the call and read only as `name.m`: a `const`, or a `let` that a
  `beforeEach` assigns.

**What stops a report:** a second method in the list; `methodsToSpyOn` (it adds to discovery instead
of replacing it); any other option; a spread; a result that is passed on, exported, written to as
`spy.m = …`, or read for another member.

**The bare void seed needs a real target,** read from the expression or one name away:

- `new MouseEvent(…)` and every global `…Event` constructor;
- `document` and `window`;
- `document.createElement(…)` / `createElementNS` / `createEvent` / `querySelector` /
  `getElementById`, and `document.body`;
- `fixture.nativeElement`, `….debugElement.nativeElement`, `….query(…).nativeElement`;
- `hostElement(…)` and `queryElement(…)`.

A double (`createAutoMock<Event>()`, `createSpyFromClass(Event)`, a cast literal, a name nothing in
the file settles) is never reported.

**Why the bare void seed is only a suggestion.** Without `onlyMethodsToSpyOn`, the factory spies
every other method of the target too. A test that relies on one of them being stubbed changes under
`spyOnVoidMethod`. That is also why a component instance is not on the list of real targets: its other
methods are the likeliest to be relied on.

**Why it is recommended.** The helpers exist because this call is common, and code written before
them has it everywhere. A text search misses every call split across lines. The project that asked
for this rule converted about sixty calls by hand, and the rule found ten more.

**Severity.** `warn`, like [`prefer-render-shallow`](#prefer-render-shallow): it names a shorter
spelling, not a defect.
:::

## no-shared-module-level-mock

**`error`** · no fix · syntax only

Reports an **exported** variable that builds `vi.fn()`s when the module loads. Every spec that
imports it shares one object. Under `isolate: false` that is one object per worker, so state leaks
from one test file into another.

```ts
export const cartFixture = { total: vi.fn(), add: vi.fn() }; // ❌ built once per module
```

```ts
export const createCartFixture = () => ({ total: vi.fn(), add: vi.fn() }); // ✅ one set per caller
```

**Options.** None.

**How to fix.** Export a factory, and call it in a `beforeEach` of every spec that used the shared
object. Each test then starts from fresh spies. A spec file itself
[should export nothing at all](/utilities/setup#shared-fixtures-are-functions-not-constants).

**When to disable.** An exported frozen constant built from `vi.fn()`s on purpose, for example a
stable reference that some registry compares by identity. Silence that one per line. Scope the rule to
fixture modules and spec files alike.

::: details How it decides
**What it reads:** the export declaration, and every `vi.fn()` in its initializer, stopping at
function boundaries. A `vi.fn()` behind an arrow is created per call, which is the fix, so the rule
does not look inside functions. A spy that never leaves the file is not reported.

A module-level `const` that is not exported is not reported either, though it has the same problem
once two `describe` blocks share it. The rule reads the export, because that is what crosses files.

**Why it is recommended.** Under `isolate: false` a module is evaluated once per **worker**. A probe
fixture with a module-load id, imported by two spec files, shows it:

```ts
// probe fixture, imported by two spec files
export const analytics = { sent: [] as string[], track: vi.fn((e: string) => analytics.sent.push(e)) };
export const moduleLoadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
```

```text
isolate: true    file 1: load=…-mdncyn     file 2: load=…-ywp3q0   sent=[]
isolate: false   file 1: load=…-n0v4yh     file 2: load=…-n0v4yh   sent=[from-file-1]
```

Same id means one evaluation, and file 2 reads what file 1 pushed. The spy's calls do not leak:
`clearMocks: true` reaches a module-level `vi.fn()` and clears them (three probes confirmed it). What
leaks is everything else the fixture holds next to its spies: a `Subject` that has already completed,
an array somebody pushed to, a stored `mockReturnValue`. That is why the fix is a factory, not a
`beforeEach` that clears harder. Which file runs first is the runner's choice, so the failure shows up
as flakiness in a file nobody edited.

**Severity.** `error`. Green and wrong, and the failure appears in a different file from the cause.
:::

## no-outer-binding-in-mock-factory

**`error`** · no fix · syntax only

Reports a `vi.mock(path, factory)` factory that reads a top-level `const` / `let` / `var` / `class`
not declared through `vi.hoisted`. Vitest moves every `vi.mock` above the imports, so the factory runs
before that declaration exists.

```ts
const user = { id: 1 };
vi.mock('./session', () => ({ current: user })); // ❌ Cannot access 'user' before initialization
```

```ts
const { user } = vi.hoisted(() => ({ user: { id: 1 } })); // ✅ hoisted with the mock
vi.mock('./session', () => ({ current: user }));
```

**Options.** None.

**How to fix.** Declare the value through `vi.hoisted`, as above. If the spec imports the module only
inside a test (`await import('./session')`), use `vi.doMock` instead: it is not hoisted, and the rule
does not report it.

**When to disable.** Not needed. Hoisting is a fact of the runner, not a guess about the file.

::: details How it decides
The factory runs as soon as the first import reaches the mocked module. Only reads that happen while
the factory runs count. A read inside a function the factory returns happens later, in a test, and is
fine. Function declarations and imports are not reported, and type positions are not reads.

**Why it is recommended.** The factory reads the binding before it exists. For a `const`, `let` or
`class` that is a `ReferenceError`. For a `var` it is a silent `undefined`, which the mocked module
then hands to the code under test.

**Severity.** `error`.
:::

## no-object-define-property

**`error`** · suggestion · syntax only

Reports every `Object.defineProperty` and `Object.defineProperties` call in a spec. Nothing puts the
original property back after the test, so the patch leaks into later tests and files.

```ts
Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }); // ❌
```

```ts
import { mockValueProp } from 'vitest-auto-spy';

mockValueProp(navigator, 'onLine', false); // ✅ undone by restoreMockedProps() after the test
```

**Options.** None.

**How to fix.** Use the helper that matches the descriptor; all of them are exported from
`vitest-auto-spy`. Drop `configurable: true`: the helper keeps the property configurable itself. Each patch is undone by `restoreMockedProps()`. `setupAutoSpy()` from
`vitest-auto-spy/setup` calls it after every test; without `setupAutoSpy()`, call
`restoreMockedProps()` in an `afterEach`. The suggestion picks the helper for you:

| Descriptor                                                 | Helper                   |
| ---------------------------------------------------------- | ------------------------ |
| `{ value }`                                                | `mockValueProp`          |
| `{ get }`                                                  | `mockReadonlyPropGetter` |
| with a `set`                                               | `mockAccessorsProp`      |
| a value built with `mockImplementation(function () { … })` | `stubConstructor`        |

Two cases the descriptor cannot show:

- A `Signal<T>` property: use `mockReadonlyProp(obj, key, signal(value))` with a real `signal`. A
  `vi.fn().mockReturnValue(value)` reads the same, but stops every `computed()` and `effect()`
  downstream from updating.
- A property missing because it is an instance field, not a prototype member: fix it where the spy is
  built, with `instanceMethodsToSpyOn` / `observablePropsToSpyOn`.

**When to disable.** When none of the helpers fits. Examples: a property on a frozen host object, a
descriptor the helpers do not reproduce, or a patch in a `beforeAll` meant to last the whole file.
Disable that line and write the reason:

```ts
// eslint-disable-next-line vitest-auto-spy/no-object-define-property -- clientWidth is a getter on a frozen host object
Object.defineProperty(target, 'clientWidth', { value: 100 });
```

This rule is the most sensitive to the `files` glob. `Object.defineProperty` is fine in application
code, and a glob that is too wide reports it.

::: details How it decides
**Two messages.** Every call gets the ordinary message. A second, sharper one (`manualRestore`)
appears when the same property is patched twice in the same block: a patch and a hand-written
restore. The rule matches patches by the enclosing function, the target's source text and the key's
source text. It uses text because `window` in two calls is two identifiers but one global. Two
patches in two different tests, or a `beforeEach` patch with an `afterEach` restore, get the ordinary
message.

**When the suggestion is offered.** It reads the **descriptor** and names the helper that reproduces
it exactly, so it often declines:

- `configurable` is the only companion key allowed, because making the property configurable again is
  the point of the change;
- `writable`, `enumerable` or a second meaningful key means no suggestion;
- `{ value: vi.fn().mockImplementation(function () { … }) }` gets none either: the code under test
  calls it with `new`, and the helper for that is `stubConstructor`;
- `defineProperties` never gets a suggestion: its replacement is one `mockValueProp` per entry.

**Why it is recommended.** One probe file patches `navigator.onLine`, then calls everything the runner
offers for undoing things:

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

The third line is the fix, measured on its own for a reason. Run it **after** the `defineProperty`
file in the same worker, and it reads `false` too: the original descriptor was gone before the helper
saw the property. A project cannot recover from this file by file. `Object.defineProperty` also
defaults `configurable` to `false`, so the patch seals the property for the rest of the worker.

**Severity.** `error`. The damage reaches beyond the file that caused it.
:::

## no-import-time-spread

**`error`** · suggestion · syntax only

Reports a spread of an imported value at module scope, which runs while the module is still loading.
Inside a test bundle the imported value can still be `undefined` at that moment. An array spread then
throws; an object spread silently produces `{}`.

```ts
import { BaseEvents } from './base-events';

export const platformEvents = [...BaseEvents]; // ❌ fine under tsc, a TypeError under a bundler
```

```ts
export const platformEvents = () => [...BaseEvents]; // ✅ runs later, when it is called
```

**Options.** None.

**How to fix.** Move the spread into a function, as above. The suggestion does this for a spread in a
variable initializer. After you accept it, every use of the name needs a `()`, and the type checker
lists each place to change. The other fix, inlining the constant so nothing is imported for this
line, cannot be written from one file.

**When to disable.** Most reports will be code that has never failed yet: the failure depends on how
the bundler splits chunks. The rule is on because the failure is expensive, not frequent. Nothing
inside a function body is reported, and neither is an instance field:

```ts
export const make = () => [...BaseEvents]; // a function body
class Events {
  all = [...BaseEvents]; // an instance field, runs at construction
  static all = [...BaseEvents]; // …but a static one is reported: it runs with the class declaration
}
```

The operand must be the imported name itself. `[...BaseEvents.slice()]` is a call, and whatever it
throws is a different problem.

::::: details How it decides
**Two questions, both answered without types:**

1. Is the spread operand a name this file **imported**? The rule resolves it through scope analysis
   to an import binding.
2. Does the spread run at import time? The rule walks up to the top of the module and stops at any
   function body or non-`static` class field. A `static` field is not a boundary: it runs when the
   class declaration runs.

**Why it is recommended.** Under `tsc`, and under a browser's ESM loader, this cannot fail: a module
never runs before its dependency. Inside one bundle it can. The builder emits shared chunks, a chunk
may run while a value it re-exports is still `undefined`, and `[...undefined]` throws while the bundle
loads, on a tree where every test passes:

```
Spread syntax requires ...iterable[Symbol.iterator] to be a function
```

It is the same root cause as the barrel-initialization note in the [migration guide](/migrating), but
the error names neither a module nor a barrel.

**An object spread is the quiet half, and gets its own message.** `[...undefined]` and
`f(...undefined)` throw; `{ ...undefined }` is `{}`. So the module loads, and the constant silently
lacks every key it meant to copy:

```ts
import { SectionItemType } from '@acme/api';

// ❌ nothing throws; `ItemType.COVER` simply reads `undefined` for the rest of the run
export const ItemType = { ...SectionItemType, ...LocalItemType } as const;
```

The messages are separate because a reader sent to look for `Spread syntax requires …` finds no such
error in the log and takes the report for a false positive. The object message says up front that
there is no error to find, and that the damage is a key reading `undefined`.

**How often it fires.** An AST scan of an 8 673-file workspace found exactly **seven** module-level
spreads of an imported name, two of them spreading a workspace barrel. Probing all seven cleared them:
none was the failure being chased at the time.

::: warning The same error has a second cause the rule cannot see
`Spread syntax requires ...iterable[Symbol.iterator] to be a function` also appears when the Angular
**builder** lays out its entry points differently, and then no spread in the source is at fault. On
one shard of an Angular workspace, with the same tree, three runs in a row:

- `@angular/build:unit-test`'s own `isolate` key unset: 860 files green;
- `"isolate": false`: 39 files red with this error and **zero tests collected**;
- `"isolate": true`: 860 files green again.

The runner's `isolate` and the builder option of the same name are different settings. The tell is
the test count. A real module-scope spread breaks the file _after_ its tests are collected. The
builder case collects none, has no stack, and the list of failing files changes between runs. Leave
the builder's `isolate` key unset (coverage turns isolation on) rather than writing `false`. These
numbers come from one series of runs.
:::

**Severity.** `error`. The failure is red by construction, but it arrives before any test runs, and
its message points at the bundler.
:::::

## prefer-observer-stub

**`error`** · no fix · syntax only

Reports `IntersectionObserver`, `ResizeObserver` or `MutationObserver` replaced with a hand-written
double. jsdom has none of the three, so specs write the same nineteen-line stub again and again. The
hand-written restore also breaks: it runs only if the test passes.

```ts
let original: typeof IntersectionObserver;

beforeEach(() => {
  disconnectSpy = vi.fn();
  original = global.IntersectionObserver;
  global.IntersectionObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      disconnectSpy();
    }
  } as unknown as typeof IntersectionObserver; // ❌
});

afterEach(() => {
  global.IntersectionObserver = original;
});
```

```ts
const observers = stubIntersectionObserver(); // ✅ undone after every test
// observers.last.emit([intersectionEntry({ isIntersecting: true })]) drives the callback
// observers.last.disconnected is what the disconnectSpy was for
```

**Options.** None.

**How to fix.** Call [`stubIntersectionObserver()`](/utilities/observer-stubs), or its
`ResizeObserver` / `MutationObserver` siblings, and delete the save and the restore. The handle it
returns covers what the hand-written stub was for:

- `observers.last.disconnected`: the teardown assertion;
- `observers.last.options`: the init object;
- `observers.last.targets`: what was observed;
- `observers.instances`: every observer, in construction order.

The `let original = …` and the `afterEach` that assigns it back go too.
`restoreMockedProps()` already puts the real constructor back.

**When to disable.** When a spec needs a _specific_ observer implementation: a real polyfill, or an
observer that records geometry the helper does not model. Use a per-line disable there. The list of
three names is closed: a fourth observer global gets no report.

::: details How it decides
**Three forms are reported:** an assignment to the global, `vi.stubGlobal('IntersectionObserver', …)`,
and `vi.spyOn(globalThis, 'MutationObserver')`. `vi.stubGlobal` counts because it is the same fake,
and `vi.unstubAllGlobals()` is off by default.

**The receiver must be the global object:** `global`, `globalThis`, `self` or `window`, with casts
stripped. An alias (`const g = globalThis`) is out of reach. The key may be dotted or a string.

**The value must be a double:** a class expression, a function, a runner mock, or a name that
resolves to one of those. That check keeps three real lines silent on purpose:

- `globalThis.IntersectionObserver = original`, the restore. The value is a name assigned twice, so
  the rule does not treat it as a double.
- `window.ResizeObserver = ResizeObserver` from a polyfill. The value came from an import, so it is a
  real implementation.
- A receiver that is not the global object. A fake `window` a spec builds and hands to the code under
  test is a value like any other.

The rule reads what _kind_ of definition a name has, not its node. A parameter's definition points
at its function, so reading the node would call every parameter a function.
`function restore(original) { globalThis.ResizeObserver = original; }` stays silent.

`Object.defineProperty(globalThis, 'ResizeObserver', …)` is **not** one of the forms.
[`no-object-define-property`](#no-object-define-property) already reports every `defineProperty` in a
spec and names a helper from the same family. Two reports on one line saying the same thing is how a
rule gets turned off.

**Why it is recommended.** There are two reasons, and the second one is a defect.

1. The nineteen lines are already written as a helper. The rule exists because the person writing
   them does not know that. One of the measured blocks had a comment saying there was no other way.
2. The restore. A restore written as the last statement of an `it` runs only if every assertion
   above it passed. The first red test leaves the stub installed for the rest of the file. Under
   `isolate: false` it also stays for every later file of the worker, and shows up as
   `observe is not a function` in a component nobody edited. The helper installs the stub through
   `mockValueProp`, and `restoreMockedProps()` takes it off; `setupAutoSpy()` runs that after every
   test.

The runner form has a failure of its own. `vi.fn().mockImplementation((cb) => ({ observe() {} }))`
is an arrow, and an arrow cannot be called with `new`. The `TypeError` lands in application code,
while the spec still looks correct.

On an Angular monorepo of 1 758 spec files, **16 places** replace one of the three globals by hand:
14 assignments and 2 `vi.spyOn(globalThis, 'MutationObserver')`. They sit across five libraries and
both applications. One hides behind a cast that a grep for `global.IntersectionObserver =` does not
find. The rule reports fifteen (the sixteenth is under a file-wide `/* eslint-disable */`).
**Fourteen of the fifteen are test code.** The last one is an SSR shim outside the spec glob, which
is why you scope the plugin to spec files. Three lines of that shape stay silent on purpose: the two
`afterEach` restores (the value is a name, not a double), and `window.ResizeObserver = ResizeObserver`
in an application module (the value came from an import).

**Severity.** `error`. Green and wrong, and the damage crosses files.
:::

## no-hand-assigned-global

**`error`** · `--fix` for a write into an imported object, no fix for a global · syntax and scope only

Reports a double assigned straight to a global, such as `global.fetch = vi.fn(…)`, when nothing in
the file puts the original back in a teardown hook. No runner cleanup reaches a bare assignment, so
the fake answers every later test of the file. It also reports any value written into an imported
object, such as `environment.production = true`.

```ts
beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve(user) })) as never; // ❌
});
```

```ts
beforeEach(() => {
  mockValueProp(
    globalThis,
    'fetch',
    vi.fn(async () => stubResponse({ body: user })),
  );
  // ✅ undo registered with restoreMockedProps(), which setupAutoSpy() runs after every test
});
```

**Options.** None.

**How to fix.** Use a helper that carries its own undo. The message names the one that fits the
global:

| Global                                                           | Helper                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch`                                                          | `mockValueProp(globalThis, 'fetch', vi.fn(async () => stubResponse({ body })))`, with [`stubResponse`](/utilities/setup#answering-a-stubbed-fetch-—-stubresponse) from `vitest-auto-spy/setup` |
| another lowercase name, such as `matchMedia`                     | `mockValueProp(globalThis, name, vi.fn(…))`                                                                                                                                                    |
| a capitalized name: `XMLHttpRequest`, `WebSocket`, `EventSource` | `stubConstructor(globalThis, name, …)`: the code calls it with `new`                                                                                                                           |
| `localStorage`, `sessionStorage`                                 | [`stubWebStorage()`](/utilities/setup#stub-web-storage)                                                                                                                                        |
| `Worker`                                                         | [`stubWorker({ respond })`](/utilities/worker-stub), which keeps the listener behaviour a hand-written stub loses                                                                              |

- A spec that only needs to stay off the network wants
  [`blockNetwork()`](/utilities/setup#_5-keeping-the-run-off-the-network) (or
  `setupAutoSpy({ blockNetwork: true })`) instead of a double. It closes `fetch`, `XMLHttpRequest`
  and `sendBeacon` for every test.
- `vi.stubGlobal(name, value)` with `unstubGlobals: true` in the Vitest config also restores the
  global.
- Or keep the assignment and restore the original in `afterEach`, `afterAll` or `onTestFinished`.
  That is correct and stays silent.

For an imported object, `--fix` writes `mockValueProp`:

```ts
it('uses the stand configs', () => {
  environment.useRemoteConfigs = true; // ❌
  mockValueProp(environment, 'useRemoteConfigs', true); // ✅ what --fix writes
});
```

**When to disable.** For a double that is meant to last the whole run, such as one a setup file
installs on purpose. Use a per-line disable there. The rule also cannot see a restore inside a helper
your hooks call; it reads only assignments and `delete`s written in the file.

::: details How it decides
**A global.** The rule reads the same way as [`prefer-observer-stub`](#prefer-observer-stub):

- the receiver is `global`, `globalThis`, `self` or `window`, with casts stripped. An alias
  (`const g = globalThis`) is out of reach;
- the key is dotted or a string literal;
- the value is a **double**: a runner mock (`vi.fn()` bare or configured), a class expression, a
  function, a name bound to one of those, or an object literal with a `vi.fn()` somewhere inside it.
  `window.localStorage = { getItem: vi.fn() }` counts.

Then the rule reads the whole file once, at the end, for a restore of the same global: an assignment
of a value that is not a double, or a `delete`. A restore inside `afterEach`, `afterAll` or
`onTestFinished` silences the report, because a hook runs whatever the assertions did. A restore
anywhere else, such as the last line of the `it`, gets its own `restoreInTest` message: the first red
assertion skips it.

The three observer globals are left to `prefer-observer-stub`, and
`Object.defineProperty(globalThis, …)` to [`no-object-define-property`](#no-object-define-property).
One line never draws two reports.

**An imported object.** The rule also reads `environment.production = true` in a spec: an assignment
(`=`, not `+=`) to a member of a name bound by a named or default import. The member may be dotted or
a string key, with casts stripped, directly or deeper down the chain (`config.feature.enabled`). The
module is cached for the worker, so **any** value is reported, not only a double. A restore in a
teardown hook silences it, as for a global. Not reported: a local, `this`, a computed key, and a
namespace object itself (`import * as env`: the object is sealed and the write throws).

**When `--fix` applies.** It rewrites the statement to `mockValueProp(environment, 'production', true)`.
If the file has no `mockValueProp` in scope, it imports it from the adapter entry point the file
already imports (`vitest-auto-spy/bun`, `/bun-angular`, `/node`, `/rstest`…). That way a spec on
another runner does not load Vitest's adapter. With no adapter import, it imports from
`vitest-auto-spy`; a `mockValueProp` imported from any other entry is used as it is. No fix is
offered:

- in `beforeAll` or a `describe` body: the cleanup after the first test would take the patch off for
  the rest of the file;
- for an assignment used as a value;
- in a file that declares its own `mockValueProp`.

**Why it is recommended.** A bare assignment is the one kind of mock no cleanup reaches:

- `vi.restoreAllMocks()` restores spies;
- `vi.unstubAllGlobals()` restores what `vi.stubGlobal` installed;
- `restoreMockedProps()` restores what went through `mockValueProp`.

The fake then answers every later test of the file. Under `isolate: false` it answers every later
file of the worker, where a component nobody edited starts getting a canned response.
`global.fetch = vi.fn(() => Promise.resolve({ json: () => … }))` is the first thing most `fetch`
tutorials show, and generated cheat sheets copy it without a restore.

**Severity.** `error`. The double outlives the test that installed it, and under `isolate: false` it
outlives the file.
:::

## prefer-stub-response

**`error`** · no fix · syntax only

Reports a `Response` written by hand for a stubbed `fetch`: an object literal cast to `Response`, or
`createMock<Response>(…)`. Every member its author did not think of answers `undefined`, so the code
under test can take a branch a real response never would.

```ts
vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => user } as Response); // ❌
```

```ts
vi.spyOn(globalThis, 'fetch').mockImplementation(async () => stubResponse({ body: user })); // ✅
```

**Options.** None.

**How to fix.** Build a real `Response` with
[`stubResponse`](/utilities/setup#answering-a-stubbed-fetch-—-stubresponse), as above. Every member is
then real.

**When to disable.** Not needed for a `Response` that is not the global one. An Express handler's
`Response`, or a generated client's envelope with the same name, is never reported: `stubResponse`
builds the wrong object for those.

::: details How it decides
**What is reported:**

- `{ ok: true, json: async () => data } as Response`;
- the double cast `as unknown as Response` (read through its nesting, so it is one report, not
  none);
- the angle-bracket form `<Response>{ … }`;
- `createMock<Response>(…)` / `createAutoMock<Response>(…)`.

**Two facts on the line decide it:** the type a cast names, and the type argument a helper gets.
No type information is needed, as for [`no-sync-testbed-await`](#no-sync-testbed-await).

**`Response` must resolve to the global.** A name the file imports
(`import { type Response } from 'express'`) or declares (a domain type of the same name) has a
definition, and is never reported. A binding with no definition is the global too: that is what
`languageOptions.globals` puts in scope for a project that declares its environment.

**Limits.** A double built behind a factory is out of reach, the same limit
[`no-structural-double`](#no-structural-double) has: `buildResponse()` returning the cast literal is
reported where the cast is written, and nowhere else. A `Response` assembled member by member on a
`const` with a type annotation is not a cast, and is not reported.

**Why it is recommended.** Once `fetch` is replaced, something has to be handed back, and every
tutorial shows a cast over two members. Everything else answers `undefined`: `status`, `statusText`,
`headers`, `url`, `text()`, `arrayBuffer()`, `clone()`. The cast makes that compile, and it also
hides it. The code under test reads one of those members, takes a branch on `undefined` the real
response could never produce, and the test is green on a path that does not exist. The strict preset
catches this defect on a double the library built. A plain object literal is not one, so nothing was
watching.

**Severity.** `error`. The evidence is the line, the fix is a helper this package includes, and
there is no migration: a project that already builds responses with `stubResponse` sees nothing.
:::

## prefer-settle-dynamic-import

**`error`** · suggestion · syntax only

Reports an `import()` the spec itself awaits in a test or a hook. When the code under test
lazy-loads a module on a click, awaiting the same `import()` waits for the module, but not for the
lines after the code's own `await`. The assertion then runs one turn too early.

```ts
// The click handler does `await import('./exit-from-app.component')` and then opens the dialog.
button.click();
await import('./exit-from-app.component'); // ❌ waits for the module, not for the handler
expect(dialog.open).toHaveBeenCalled();
```

```ts
button.click();
await settleDynamicImport(() => import('./exit-from-app.component')); // ✅
expect(dialog.open).toHaveBeenCalled();
```

**Options.** None.

**How to fix.** Wrap the import in
[`settleDynamicImport`](/utilities/event-loop#settledynamicimport-load-turns). It loads the module and
then runs `flushEventLoop(turns)`, which gives the code's continuation its turn. It returns the
module namespace, so `const { Thing } = await import(…)` keeps reading the same way. The suggestion
wraps the `import()` where it stands and adds the helper import, merging it into an existing
`vitest-auto-spy` import when there is one.

`fakeAsync`, `tick()` and `flushMicrotasks()` cannot replace it: they drive Angular's zone queues,
and the module loader is not one of them.

If the spec only reads the module's exports, a static `import` is the better fix. The
`settleDynamicImport` the message names still works there.

**When to disable.** Rarely; the rule reports only what one file can prove. Not reported:

- a spec-local `const load = async () => { await import('…'); }`: the same code is written whether
  the spec calls it or hands it to the code under test as a loader, and for the second the helper
  would be wrong advice;
- a callback something other than the runner calls, `it('x', waitForAsync(async () => …))`
  included;
- a namespace bound as the **first** statement of a test or hook, such as
  `const api = await import('./index')`. Nothing has run yet whose continuation could be pending. A
  static `import * as ns` is the better repair there.

::: details How it decides
**What is reported:** `await import('./thing')`, the destructured
`const { Thing } = await import('./thing')`, and `import('./thing').then(…)`.

**Two facts in the file decide it:**

1. what sits on the `import()`: an `await` parent, or a `.then` call;
2. which function it sits in. The report is made only where the innermost enclosing function is the
   runner's own callback: `it`, `test`, `beforeEach`, `beforeAll`, `afterEach`, `afterAll`, in their
   `.only`, `.skip` and `.each` forms.

No type information is needed, as for [`no-sync-testbed-await`](#no-sync-testbed-await).

That second fact settles every exemption. Each shape where the helper is the wrong advice puts a
function of its own between the callback and the import:

- a `vi.mock` / `vi.doMock` factory;
- a lazy route's `loadComponent` / `loadChildren` in a fixture the spec hands to the router;
- a callback the spec gives the code under test;
- `settleDynamicImport`'s own `() => import(…)`.

A module-scope `import()` has no enclosing callback at all.

**The first statement.** A bound namespace as the first statement of a test or hook is not reported
(for example `ns = await import('@scope/lib')` in a `beforeEach` that then spies on it). A bare
`await import(…)` in the same place is still reported: it can only be waiting for something a hook
started loading. After an arrangement line, as in `configure(…); const { run } = await import('./run')`,
the binding is reported. That line looks the same as the `button.click()` that starts the load, and
the rule cannot tell them apart.

**Why it is recommended.** The module registry is shared, so the spec's `import()` resolves against
the module the code under test is already loading. It does not wait for that code's own
continuation: the lines after _its_ `await`, which open the dialog, set the signal or navigate. Those
are queued behind the loader's microtask. The assertion reads the state one turn early. The test is
green only while the continuation is short enough to drain by accident, and it turns red the day
somebody adds a line. That is a flake with no bad line in it.

On an Angular monorepo of 2 030 spec files: **81 reports across 32 files**. What sat next to them is
the stronger evidence. Four reports in one file had a hand-written `await Promise.resolve()` under
the import: a `flushEventLoop(1)` spelled out. Eleven more sites of the same shape had been moved into
spec-local helpers: `flushCodeInputChunk`, `settleAccountPickerImport`, `settleModalImports`,
`settleModalComponentImport` and `flushLazyImport`, two of them with a loop of five
`await Promise.resolve()`. The project had rewritten this helper by hand eleven times. Those eleven
are exactly the spec-local shape the rule declines to read.

**Severity.** `error`. The evidence is the line, the fix is one line the rule offers as an edit, and
there is no migration to gate, unlike [`prefer-set-inputs`](#prefer-set-inputs). A large project will
not reach zero at once, and that is the argument for `error`: 81 one-line findings in 32 of 2 030
files, each a test that waits for the wrong thing.
:::

## no-real-wait-in-test

**`warn`** · no fix · syntax only

Reports a sleep on the real clock, such as `await new Promise((r) => setTimeout(r, 300))`. Every run
pays the delay, and it is a race: the code must finish within it, which it does on a laptop but not
always on a loaded CI runner.

```ts
await new Promise((r) => setTimeout(r, 300)); // ❌ every run pays 300 ms, a loaded CI can outlast it
expect(search.query).toHaveBeenCalledWith('ab');
```

```ts
import { advanceTimers, setupFakeTimers } from 'vitest-auto-spy/setup';

setupFakeTimers();

it('debounces', async () => {
  component.onInput('ab');
  await advanceTimers(300); // ✅ no real time passes
  expect(search.query).toHaveBeenCalledWith('ab');
});
```

**Options.** None.

**How to fix.** Move onto fake timers with `setupFakeTimers()` and `advanceTimers(ms)`, as above.
When you wait for an outcome rather than a duration, wait for the outcome: `await vi.waitFor(…)` or
`await fixture.whenStable()`.

**When to disable.** The sleep is a fact, but the fix changes every timer the test runs, so the rule
is `warn`. Move files onto fake timers one by one, then raise it to `error`.

::: details How it decides
**What counts as a sleep:**

- `new Promise((r) => setTimeout(r, N))` in any form where the executor's `resolve` reaches the
  timer: `window.` / `globalThis.` / `self.setTimeout`, `() => r()`;
- `setTimeout(N)` imported from `node:timers/promises`, under any local name.

A missing or `0` delay is a macrotask flush, and is left alone. A `sleep(ms)` helper is reported
once, where it is defined.

**Severity.** `warn`, graded on the fix, not the finding. The sleep on the real clock is exact. But
the fix is a move onto fake timers, which changes every timer the test runs. That is a migration you
take file by file, like [`prefer-set-inputs`](#prefer-set-inputs).
:::

## no-inline-test-data

**`warn`** · no fix · syntax only

Reports test data written inline in a spec: one literal longer than 20 lines, or the same literal
written three times or more. Move it to a `*.mock.ts` file next to the spec and import it. The test
then shows what it checks, and one edit updates every test that uses the value.

```ts
// order.service.spec.ts
service.save({ id: 1, status: 'paid' });
expect(api.post).toHaveBeenCalledWith({ id: 1, status: 'paid' });
expect(store.last()).toEqual({ id: 1, status: 'paid' }); // ❌ the third copy of the same order
```

```ts
// order.mock.ts
export const PAID_ORDER: Order = { id: 1, status: 'paid' };

// order.service.spec.ts
import { PAID_ORDER } from './order.mock';

service.save(PAID_ORDER);
expect(api.post).toHaveBeenCalledWith(PAID_ORDER); // ✅ one value, one place to change it
```

**Options.**

| Option      | Type     | Default | Meaning                                                                         |
| ----------- | -------- | ------- | ------------------------------------------------------------------------------- |
| `maxLines`  | `number` | `20`    | a data literal longer than this is reported, repeated or not                    |
| `repeats`   | `number` | `3`     | how many copies of the same literal in one file are reported                    |
| `minValues` | `number` | `2`     | how many values a literal needs before its copies count; `1` counts `{ id: 1 }` |

```js
'vitest-auto-spy/no-inline-test-data': ['warn', { maxLines: 10, repeats: 2 }],
```

**How to fix.** Export the value from `<name>.mock.ts` next to the spec. If tests need variations,
export a factory such as `createOrder(overrides)` instead of several copies.

**When to disable.** The rule is `warn`: a line count says where data should live, not that the test
is wrong. Move the data file by file, then raise the rule to `error`.

::: details How it decides
**What counts as data:** an object or array literal with no functions in it. These are not data and
are never reported:

- a testing module's wiring: `providers`, `imports`, `declarations` and the other module keys, and
  an object that holds one of them, such as the argument of `configureTestingModule`;
- a case table passed to `it.each` / `describe.each`;
- the return value of a `vi.mock` factory;
- a literal that holds a function, such as a hand-written double.

**Repeats** are compared by source text with whitespace ignored. A repeated literal needs at least
`minValues` values, one of them a string, number or boolean. So `[node]`, `{ property }` and
`{ method: 'GET' }` are not reported. A repeated literal is reported once, not once more for each
repeated piece inside it.

**Mock files are skipped:** `*.mock.ts`, `*.mocks.ts`, `*.fixture.ts`, `*.fixtures.ts` and files
under `__mocks__/`.

**Severity.** `warn`, graded on the evidence: size and repeat count suggest a move, and only the
author can name the value and pick the file.
:::

## prefer-create-mock

**`warn`** · suggestion · syntax only

Reports an object literal cast to a named type, such as `{ id: '1' } as Device`. A cast skips the
checks an assignment makes: an extra key passes, and a missing required field passes too. The fixture
can then pin a key the real type does not have.

```ts
// `Device` declares eight fields and `isOffline` is not one of them.
const device = { id: '1', name: 'TV', isOffline: false } as Device; // ❌
expect(service.rename).toHaveBeenCalledWith({ ...device, name: 'Box' });
```

```ts
const device = createMock<Device>({ id: '1', name: 'TV' }); // ✅ an extra key is now a compile error
expect(service.rename).toHaveBeenCalledWith({ ...device, name: 'Box' });
```

**Options.** None.

**How to fix.** Pick the first that applies:

1. The literal already sits in a typed slot (a call argument, a `nextWith`, a `mockReturnValue`, a
   typed `const`): delete the cast and let the slot check it.
2. Otherwise wrap it in `createMock<T>({ … })`. It takes a `DeepPartial<T>` and returns a value typed
   `T`. The suggestion does this and imports `createMock`.
3. The value is outside `T` on purpose (the `null` a backend sends, a payload that must reach a
   guard): write `outOfType<T>(…)`. It names the intent and is not reported.

A cast to `Partial<T>` in a slot that is already `Partial<T>` is usually just redundant; delete it.

**When to disable.** For a fixture that is invalid **on purpose**, such as
`linkType: 'INVALID_TYPE'` fed in to cover a fallback branch. The suggestion does not compile there,
which confirms it. Keep the cast with an `eslint-disable-next-line` that says why. The rule is `warn`
because accepting the suggestion lets the compiler read every fixture, and all drifted fixtures go
red the same day. Raise it once they are fixed.

::: details How it decides
**Two facts on the line:** the cast's operand is an object literal, and the type it names is a
reference. Both spellings count: `{ … } as Device` and `<Device>{ … }`. No type information is
needed, as for [`prefer-stub-response`](#prefer-stub-response) and
[`no-sync-testbed-await`](#no-sync-testbed-await).

**Nested casts are one finding,** reported on the outermost. `{ inner: { id: '1' } as Inner } as Outer`
draws a single report, and its suggestion unwraps the inner cast too: the `createMock` seed is
checked against `DeepPartial<Outer>` at every depth. A cast behind a function
(`make: () => ({ … }) as Item`) is not part of the seed and keeps its own report.

**How the suggestion adds the import.** It merges `createMock` into an existing `vitest-auto-spy`
import. Otherwise it writes a new line directly above the file's `vitest-auto-spy/*` imports, inside
the group `import/order` expects. Every fix and suggestion of the plugin that adds an import places it
the same way. It stays a suggestion, not `--fix`, because accepting it turns every drifted fixture
red.

**Where it stays silent:**

- `as const`, which narrows a literal instead of claiming a type;
- `as unknown` and `as any`, and the double cast `{ … } as unknown as T` built from them. The hop
  through `unknown` is there because the compiler refused the single cast, so `createMock<T>` would
  not compile either;
- a cast of anything that is not a literal: `raw as Device`, `load() as Device`,
  `[{ … }] as Device[]`;
- a cast to an inline object type, `{ … } as { id: string }`, which the compiler already reads;
- a literal inside one of this library's own factories: `createMock<Outer>({ inner: { … } as Inner })`,
  a `provideAutoSpyForToken` seed, a `provideRouterDouble` bag;
- type names another rule owns: `Response` ([`prefer-stub-response`](#prefer-stub-response)), `Spy`
  ([`prefer-as-spy`](#prefer-as-spy)) and Vitest's `Mock` / `Mocked` family
  ([`no-mocked-for-spy`](#no-mocked-for-spy), [`no-mock-cast`](#no-mock-cast)).

**Limits.** The rule reads no types, so it cannot tell a drifted fixture from one that happens to be
complete. It reports the cast, and the next type check decides which it was. A utility type
(`Partial<T>`, `Pick<T, …>`, `Record<…>`, `ReturnType<typeof f>`) is reported like any other.
`createMock<Partial<T>>({ … })` compiles and still checks the keys.

**Why it is recommended.** `as T` asks whether two types _overlap_, not whether the value is one of
them. So it passes both things an assignment refuses: the excess-property check is skipped, and a
required field the fixture never sets goes through too. Neither type check says anything, which is
the point of the cast. The object is then spread into the expected payload of a call assertion, or
handed to the code under test. The spec pins a key the contract does not have, or covers a branch the
real value could never reach. `createMock<T>` leaves unnamed fields `undefined` at run time, exactly
as the cast did, and the excess key becomes a compile error.

On an Angular monorepo of 2 032 spec files: **1 200 reports across 327 files**, naming 217 types.

- **None** of those literals contains a `vi.fn()`. So on that project this rule never reports the
  same line as [`prefer-create-spy-from-class`](#prefer-create-spy-from-class) or
  [`no-structural-double`](#no-structural-double): those are about collaborators, this one is about
  data.
- **529** reports sit in a slot that already has a type: a call argument, a `nextWith`, a
  `mockReturnValue`. There the cast only switches off the slot's own check, and deleting it is the
  first fix.
- 25 of the 1 200 cast to a utility type.

**Severity.** `warn`, graded on the fix, as [`prefer-set-inputs`](#prefer-set-inputs) is (not on
heuristics, like [`no-structural-double`](#no-structural-double)). The finding is exact: the literal
and the type it claims are both on the line. The migration is what is graded: on the project above it
is 1 200 sites in 327 files, which nobody lands in one branch. `off` would be the wrong end of the
same mistake, so the plugin sets `warn` instead of leaving it out. The gap to
[`no-mock-cast`](#no-mock-cast) (24 sites on the same project) is why the two rules of one family have
different severities.
:::

## no-mock-cast

**`error`** · suggestion · syntax only

Reports a cast to Vitest's `Mock` or `MockInstance` over a member, such as
`TestBed.inject(S).m as Mock`. `Mock` with no parameters is `Mock<any>`, so the cast removes the
method's signature: `toHaveBeenCalledWith` stops comparing argument types, and a wrong call still
passes.

```ts
(TestBed.inject(AppMetricsService).sendEvent as Mock).mockReturnValue(undefined); // ❌
expect(TestBed.inject(AppMetricsService).sendEvent).toHaveBeenCalledWith(payload);
```

```ts
injectSpy(AppMetricsService).sendEvent.mockReturnValue(undefined); // ✅ typed from the real signature
expect(injectSpy(AppMetricsService).sendEvent).toHaveBeenCalledWith(payload);
```

**Options.** None.

**How to fix.** A member of a double this library built is already a spy, typed from the real
signature. Read it as it is:

- `injectSpy(Service).method` for a double DI handed out. The suggestion writes this whenever the
  token is in view, and imports `injectSpy` from `vitest-auto-spy/angular`;
- `asSpy(double).method` for a double the test holds;
- `vi.mocked(object.method)` for a `vi.spyOn` spy, or a `vi.fn()` on another object.

If you added the cast because a value would not compile, look at the method. An overloaded method is
typed against its last signature; `Spy<Service, { overload: { method: 'first' } }>` picks the one the
code calls. A parameterized `Mock<[…], R>` writes the signature a second time, in a place nothing
keeps in sync.

**When to disable.** Not needed for a plain `fn as Mock` over a local `vi.fn()`, or for a `Mock` type
of your own: neither is reported.

::: details How it decides
**What is reported:** `TestBed.inject(Metrics).send as Mock`,
`(shelves.getByGid.mockReturnValue as Mock)(…)`, and the `<Mock>svc.load` form. A parameterized
`Mock<[string], void>` is reported too.

**Three checks:**

- the type name is `Mock` or `MockInstance`;
- the operand is a member access. A plain `fn as Mock` over a local `vi.fn()` is nobody's double;
- `Mock` resolves to a named import from `vitest`, `@rstest/core`, `bun:test` or `jest`, or to no
  binding at all (a project with ambient runner types). A `Mock` the file declares, or imports from
  anywhere else, is somebody's domain type.

**The worst form gets its own message.** `(shelves.getByGid.mockReturnValue as Mock)(of(shelf))`
casts the member that installs the answer. Then neither the value going in nor the method's return
type is checked. Every assertion downstream is about a value the real collaborator could not produce.

**Why a suggestion and not `--fix`.** The reason is not the type system. `injectSpy` returns the
double the container was _given_, so the rewrite is right only when that double is one this library
built. A spec that provided a hand-written `{ provide: X, useValue: { m: vi.fn() } }` would get a
run-time throw instead of a compile error. An unattended fix may not fail that way.
[`no-unregistered-inject-spy`](#no-unregistered-inject-spy) reports an accepted suggestion that
landed on such a double.

**Why it is recommended.** The cast does not _add_ spy methods; it removes the signature. From there
on `mockReturnValue` accepts anything, and `toHaveBeenCalledWith` compares nothing. The assertion
keeps passing when the code calls the method with the wrong arguments. The fix costs nothing: the
member already is a spy.

On an Angular monorepo of 2 032 spec files: **24 reports across 21 files**, 22 of the ordinary form
and 2 of the configuration form. Fifteen carry the `injectSpy` edit; the rest name the fix without
writing it.

**What the neighbouring rules do not cover.** [`no-mocked-for-spy`](#no-mocked-for-spy) reads a
`Mocked<T>` _declaration_, and [`prefer-as-spy`](#prefer-as-spy) a cast to `Spy<T>`. Both name a
whole double, and neither sees a `Mock` standing in for one member's signature.
[`no-structural-double`](#no-structural-double) wants a name declared as an object of `Mock`s, and
[`no-stub-class-double`](#no-stub-class-double) a class of `vi.fn()` fields. Both are about a double
being built. This rule is about an existing double read through a cast.

**Severity.** `error`. The evidence is the line, the fix is offered as an edit, and the number of
sites is small enough to clear in one sitting: 24 on a 2 032-file project, against 1 200 for
[`prefer-create-mock`](#prefer-create-mock).
:::

## no-redundant-mock-reset

**`error`** · `--fix` or suggestion · syntax only, plus your runner config

Reports a mock reset in a hook that the runner already performs between tests, such as
`vi.clearAllMocks()` at the top of a `beforeEach` under `clearMocks: true`. The line does nothing.
The rule is silent until it knows which reset flags your runner sets. It learns them from its
options, or by reading your `vitest.config.*` / `vite.config.*` as text.

```ts
beforeEach(() => {
  vi.clearAllMocks(); // ❌ under `clearMocks: true` the runner did exactly this a moment ago
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] }); // ✅
});
```

**Options.** Whether a reset is dead depends on the runner config, not on the spec. The options tell
the rule what the runner does:

| Option         | Type                                                    | Default | Meaning                                                                           |
| -------------- | ------------------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `clearMocks`   | `boolean`                                               | —       | the runner clears every mock between tests                                        |
| `mockReset`    | `boolean`                                               | —       | the runner resets every mock between tests                                        |
| `restoreMocks` | `boolean`                                               | —       | the runner restores `vi.spyOn` spies between tests                                |
| `configFile`   | `string`                                                | —       | a runner config the search cannot find; absolute or relative to where ESLint runs |
| `configFlags`  | `{ clearMocks?, mockReset?, restoreMocks? }` (booleans) | —       | flags a factory-built `configFile` sets beyond its text; requires `configFile`    |

With no options, the rule looks for a runner config itself (see _How it decides_). With neither an
option nor a config found, **it reports nothing**.

```js
'vitest-auto-spy/no-redundant-mock-reset': ['error', { clearMocks: true, restoreMocks: true }],
'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'tools/unit-test-bench/vitest-runner.config.ts' }],
'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'vitest.config.ts', configFlags: { clearMocks: true } }],
```

**How to fix.** Delete the line, and the hook with it if that was all the hook held. `--fix` does it
in a file with no other `beforeEach` and no `beforeAll`; elsewhere it is a suggestion. A statement
alone on its line takes the line with it.

**When to disable.** Rarely: the rule stays silent on a project it knows nothing about. Get the flags
right instead.

**If the rule stays silent** although your config has `clearMocks: true`, check these in order:

1. **The reset is not the first statement of the first `beforeEach`.** Anything that runs before it
   (an earlier statement, an outer `describe`'s `beforeEach`) may need the reset, so the rule does not
   report it.
2. **An Angular builder target also runs the spec.** `@angular/build:unit-test` without
   `runnerConfig` never reads `vitest.config.ts`, so that run uses Vitest's defaults. On Vitest 4
   `clearMocks` is off by default, so the reset is not redundant there. Set `runnerConfig` on the
   target, or move to Vitest 5, where `clearMocks` is on by default.
3. **The rule cannot find or read the config.** The search starts at the spec's folder and goes up.
   A config in another folder, or one built by a factory in another module, is not read. Name it with
   `configFile`, and add `configFlags` for what the factory sets.

- **Name only the flags the runner really sets.** `restoreMocks` is not a stronger `clearMocks`:
  `vi.restoreAllMocks()` reaches only the spies `vi.spyOn` installed, never a plain `vi.fn()`. Under
  `restoreMocks: true` alone, a `vi.clearAllMocks()` in a hook still does something. Passing a flag
  the runner does not set is the one way this rule deletes a line your tests need.
- **`setupAutoSpy({ restoreMocks })` is not the runner's `restoreMocks`.** The runner restores
  before each test; `setupAutoSpy` restores in an `afterEach`. Do not pass `{ restoreMocks: true }`
  to the rule because your setup file calls `setupAutoSpy({ restoreMocks: true })`. Only the runner
  config's flag says what happens between tests.

::: details How it decides
**What is reported.** `vi.clearAllMocks()`, `vi.resetAllMocks()`, `vi.restoreAllMocks()` and the
per-mock `mockClear()` / `mockReset()` / `mockRestore()`, where nothing the file wrote has run since
the runner's own reset. That means:

- the first statement of a `beforeEach` that no other `beforeEach` precedes; or
- a clear as the last statement of an `afterEach`.

**Finding the runner config.** With no options, the rule searches upward from the linted file's
directory for `vitest.config.*`, `vite.config.*` or `vitest-base.config.*` (the name that
`runnerConfig: true` of `@angular/build:unit-test` resolves). It reads the first one it finds **as
text**, looking for literal `clearMocks: true`, `mockReset: true` and `restoreMocks: true`. Nothing is
evaluated and no module is loaded: a lint run should not execute a project's config, and these three
values are literals in every config that sets them.

- **Options win.** Given at all, they are the answer, and the search is skipped. A project that does
  not want its disk read at lint time passes the flags as options.
- **`configFile`** names a config at a path the search does not look in, and it is read the same way.
  A flag written beside it wins over the file. A `configFile` that does not exist fails the lint run
  by name, instead of leaving the rule silent. For example, a runner config kept at
  `tools/unit-test-bench/vitest-runner.config.ts` for `@angular/build:unit-test` is missed by the
  search; `configFile` names it, which keeps the flags in the one file that sets them.

**The Vitest default for `clearMocks` depends on the version.** Up to Vitest 4 it is off; from
Vitest 5 it is on. The rule reads the installed major from the nearest
`node_modules/vitest/package.json` above the linted file.

- On Vitest 5 or later, a found config (or a `configFile`) without `clearMocks` counts it as on. A
  `vi.clearAllMocks()` or `mockClear()` opening the first `beforeEach` is then reported, and the
  message says the flag is the default.
- On Vitest 4 and older, or where no Vitest is found, an unnamed `clearMocks` is off.
- A `clearMocks` written as anything but a literal `true` (`false`, an expression) reads as off on
  every version.
- Flags written as the rule's options are not defaulted: what they leave out is off.

**A config built somewhere else is read only as far as its own text.** In
`export default createProjectConfig({ alias })`, or `mergeConfig(base, …)` with `base` in another
module, the flags live in a file the rule never opens. Its text names no `clearMocks`. So up to
Vitest 4 the flag reads as off and the rule is silent; from Vitest 5 it reads as the default (on),
even where the factory turns it off. `npx vitest-auto-spy doctor` flags such a `configFile` as
[`mock-reset-config-unread`](/utilities/cli#mock-reset-config-unread). Write what the factory sets as
`configFlags`. They are read as if the file wrote them: they win over its text, and they reach only
the runs that load that file (plain `vitest run`, and a builder target whose `runnerConfig` resolves
to it). A flag given as a direct option (`{ configFile, clearMocks: true }`) applies to every run
instead.

**A spec the Angular unit-test builder also runs counts only the flags that builder applies.**
`@angular/build:unit-test`, and `@nx/angular:unit-test` which delegates to it, give Vitest
`config: false` unless the target names a `runnerConfig`. The `vitest.config.ts` that `npx vitest`
reads is then never opened under `ng test` / `nx test`, and that run gets Vitest's defaults. The rule
finds the targets itself:

1. It walks up from the linted file to the workspace root (`angular.json`, `workspace.json` or
   `nx.json`).
2. It takes every target of either builder whose project root holds the file. The executor may come
   from `targetDefaults` in `nx.json`.
3. It resolves `runnerConfig` as the builder does: a path against the workspace root; `true` or `""`
   to the first `vitest-base.config.*` in the project root, then the workspace root; absent or
   `false` to no config at all.
4. Each configuration of the target that sets `runnerConfig` counts as one more run.

A reset is reported only where the found config (or `configFile`) performs it, **and** so does every
builder run found in steps 1–4:

| the config says      | a builder target without `runnerConfig` | reported                             |
| -------------------- | --------------------------------------- | ------------------------------------ |
| `restoreMocks: true` | Vitest's default: off                   | `vi.restoreAllMocks()`: **no**       |
| `mockReset: true`    | Vitest's default: off                   | `vi.resetAllMocks()`: **no**         |
| `clearMocks: true`   | on by default from Vitest 5             | `vi.clearAllMocks()`: yes, Vitest 5+ |

So on Vitest 5 or later a clear is still reported, because the builder run clears by default too. On
Vitest 4 it is not reported. A workspace with no such target, meaning any plain Vitest project, is
read as usual. Flags written as the rule's options apply to every run as written; the builder check
does not reduce them, so name only what each runner applies. `configFlags` apply only to the runs
that load their `configFile`. A workspace file that is not plain JSON contributes no target.

**The flag has to match the call, not the family.** The three options are not three grades of one
thing:

| the runner option | what the runner calls between tests | which mocks it reaches                    |
| ----------------- | ----------------------------------- | ----------------------------------------- |
| `clearMocks`      | `vi.clearAllMocks()`                | every mock; forgets the recorded calls    |
| `mockReset`       | `vi.resetAllMocks()`                | every mock; also drops the implementation |
| `restoreMocks`    | `vi.restoreAllMocks()`              | **only** the spies `vi.spyOn` installed   |

So `vi.restoreAllMocks()` in a hook is **not** redundant under `clearMocks: true` alone, and
`vi.clearAllMocks()` is not redundant under `restoreMocks: true` alone. The rule uses only two
provable overlaps:

- `resetAllMocks` resets every registered mock, which includes clearing it;
- `restoreMocks` covers a **per-mock** `mockClear` / `mockReset` / `mockRestore` where the file shows
  the receiver is a `vi.spyOn` spy: a `const spy = vi.spyOn(api, 'load')`, a `let` a hook fills once,
  or the call written inline. For a plain `vi.fn()`, or a name written more than once, nothing is
  reported.

`setupAutoSpy({ restoreMocks })` restores in an `afterEach`, while the runner restores in
`onBeforeTryTask`, before each test. A restore in a `beforeAll`, or ahead of the first test, is
covered by the runner's option and by nothing `setupAutoSpy` does.

**Why it looks so narrowly.** Vitest resets in `onBeforeTryTask`, which runs **before** every test's
`beforeEach` chain, and never after a test. Three consequences:

- **The reset undoes whatever ran first.** Between the runner's reset and a statement inside a
  `beforeEach`, the statements above it in the same hook have run. So has every `beforeEach` of an
  enclosing `describe`, wherever it is written, and every earlier one next to it. A spy one of them
  installed, or calls an arrangement made, are exactly what a `spy.mockRestore()` or `mockClear()`
  there removes. Deleting such a line failed tests in a real project. So a `beforeEach` reset is
  reported only as the first statement of a hook that no other `beforeEach` precedes. One inside a
  sibling `describe` does not count.
- **After a file's last test, nothing resets until the file is over.** Vitest calls
  `vi.restoreAllMocks()` once more at the file boundary, after every `afterAll`. Until then, the
  `afterEach` hooks of enclosing `describe`s and every `afterAll` (the setup file's too) run with the
  last test's spies still installed on `window`, `document` or a prototype. A restore or a reset in
  `afterEach` / `afterAll` takes them off, and is never reported. Only a clear, as the last statement
  of an `afterEach`, is.
- **`beforeAll` runs before the runner's first reset,** so a reset there protects the hook's own
  body and repeats nothing.

**A reset in the middle of a test body is never reported.** It separates one arrangement from the
next inside one test, and no runner option does that. One project has **445 such calls in 132
files**, and the rule is silent on all of them by construction: it reports only where the innermost
function around the call is the hook's own callback. A reset inside an `onTestFinished(…)` the hook
registers, inside an `if`, or inside a helper the hook calls is outside the rule too.

**Severity.** `error`, because of the silence: a project that has said nothing gets nothing reported,
so the rule cannot be wrong about a project it knows nothing about. Where it fires, the evidence is a
flag the project set and a call that repeats it, and the fix is a deletion the rule makes or offers.
The finding is pure cost (the line does nothing), which is the easiest kind of report to act on.
:::

## no-unasserted-argument

**`warn`** · no fix · syntax and scope only

Reports a bare `expect(spy).toHaveBeenCalled()` where the file itself shows the arguments matter:
another test pins the same spy with `toHaveBeenCalledWith`, or the test title says `with`. The test
checks that something ran, not what it was called with.

```ts
it('emits rowFocused with the host element', () => {
  component.onFocus();

  expect(component.rowFocused.emit).toHaveBeenCalled(); // ❌ "with the host element" is untested
});
```

```ts
expect(component.rowFocused.emit).toHaveBeenCalledWith(host.nativeElement); // ✅
```

**Options.** None.

**How to fix.** Name the arguments with `toHaveBeenCalledWith(…)`.

- `expect.objectContaining({ … })` and `expect.any(Type)` cover the part of an argument the test does
  not decide.
- `toHaveBeenCalledExactlyOnceWith(…)` when "once" is part of the claim.
- A double this package built takes [`mustBeCalledWith(…)`](/core/control-helpers) where it is
  configured, which fails at the call rather than after it.
- A method that takes no arguments has nothing to name. Pin the count instead:
  `toHaveBeenCalledOnce()` or `toHaveBeenCalledTimes(n)`.

**When to disable.** The finding is exact, but only the author knows the right argument list, so the
rule is `warn`. Raise it to `error` once you have answered the reports. Never reported:

- `expect(spy).not.toHaveBeenCalled()`: there are no arguments to name;
- `toHaveBeenCalledTimes`, `toHaveBeenCalledOnce` and the other counting matchers;
- a subject ending in `preventDefault`, `stopPropagation` or `stopImmediatePropagation`: those
  `Event` methods take no arguments.

::: details How it decides
Nothing outside the file, and nothing a type checker knows. There are two readings:

1. **The same subject is pinned with `toHaveBeenCalledWith` in another test of this file.** The author
   already wrote down that the arguments of that call are part of the contract; this is the place
   where they did not. A test that asserts both on the same subject is left alone: the arguments are
   checked there, and the bare line is merely redundant.
2. **The test title says `with`, and the body asserts nothing else.** Then the whole claim of the
   test is an argument list, and all it checks is that something ran. Any other assertion silences
   this reading, because it may be where the arguments are checked: an equality on a result, a count,
   or a chain the rule cannot read to the end (`resolves`, `rejects`). A `with` that is part of the
   asserted method's name is not read: `it('dismisses with action …')` over
   `expect(ref.dismissWithAction).toHaveBeenCalled()` names the method, not an argument list.

**Same subject** means the same source text passed to `expect()`, whitespace aside. So
`expect(api.load)` and `expect(loadSpy)` are two subjects, even when they are one spy. Names are read
through what they hold, because tests reuse generic names: a `spy` holding `vi.spyOn(obj, 'm')` is
that member, and a `vi.fn()` is only itself. So the `const spy = vi.spyOn(dialog, 'close')` of one
test is not the `const spy = vi.spyOn(logger, 'info')` of the next. The rule misses findings this way
but invents none.

A bare call next to an assertion on a result is silenced under the second reading, but not under
the first: there the file has already said the arguments of _that subject_ matter. The Event methods
are recognized by name, because the rule has no type information.

**Why it is narrow.** The blunt version exists: `vitest/prefer-called-with` reports **every** bare
`toHaveBeenCalled`. It is not in its plugin's `recommended`. On a 2032-file project it reports **1941
times across 360 files**, a number nobody acts on. The two readings above report **175 times in 90
files** on the same tree: 151 on the first reading and 24 on the second. Both are the file
disagreeing with itself, which is a finding. The other 1766 are a style opinion.

The strongest single pair on that project: two tests in one file with identical bodies, whose titles
differ only in which argument the call carries. The difference the titles promise does not exist in
the code, and nothing but this rule would say so.

**Severity.** `warn`, graded on what the fix needs, not on the evidence. Both readings are facts from
the file, like every `error` here. But the fix is the argument list the test should have named, and
the rule cannot supply it. Every `error` rule either carries an edit or names a helper; this one
carries a question for the author.
:::

## prefer-provide-activated-route

**`error`** · no fix · syntax only

Reports an `ActivatedRoute` provider that you built by hand, and `provideAutoSpy(ActivatedRoute)`.
A hand-built route knows only the half its author thought of, snapshot or streams. The component that
reads the other half gets `undefined`, and the test still passes.

```ts
// A lone snapshot: the component reading `route.params` gets `undefined`.
{ provide: ActivatedRoute, useValue: { snapshot: { queryParams: { ['q']: 'mock' } } } } // ❌

// An empty object: every read is `undefined`.
{ provide: ActivatedRoute, useValue: {} } // ❌

// A spy factory: the prototype has none of the instance fields a route keeps.
{ provide: ActivatedRoute, useValue: createSpyFromClass(ActivatedRoute, { observablePropsToSpyOn: ['queryParams'] }) } // ❌

// A factory assembling the halves one by one.
{
  provide: ActivatedRoute,
  useFactory: () => {
    const mock = { snapshot: { params: {} } };
    mockReadonlyPropGetter(mock, 'params', () => of({}));
    return mock;
  },
} // ❌
```

```ts
import { injectActivatedRoute, provideActivatedRoute } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({
  providers: [provideActivatedRoute({ params: { id: '1' } })], // ✅
});

const route = injectActivatedRoute();

route.setParams({ id: '2' }); // the streams emit, the snapshot already agrees
```

**Options.** None.

**How to fix.** Replace the reported provider with `provideActivatedRoute({ … })` from
`vitest-auto-spy/angular-router`. Drive the route in the test through the handle from
`injectActivatedRoute()`, as above.

**When to disable.**

- A spec that uses a real routed setup (`RouterTestingModule`, a real `Router` the spec navigates) has
  no route descriptor and is not reported.
- A spec that wants half a route on purpose: disable that line.
- A project class that happens to be called `ActivatedRoute` is reported too, because the rule reads
  the name. Rename one of the two.

::: details How it decides
**Five forms.** Four are slots of one provider descriptor: a `useValue` object (written in place or
stored in a name above the TestBed), a `useClass`, a `useFactory`, and a `useExisting`. The fifth is
the call `provideAutoSpy(ActivatedRoute)`. A spy reads the prototype, and every part of an
`ActivatedRoute` lives in an instance field, so that spy has none of them.

**The token** is the `provide:` value naming the class, read as written. The rule does not resolve
the declaration in another file.

**What it skips:** the library's own route. That is a descriptor that mentions
`createActivatedRoute(…)` anywhere inside it, or whose `useValue` is a name (plain, `.route` off one,
or destructured) declared or written once with that factory call.

**Why it is recommended.** `ActivatedRoute` is the one collaborator where the obvious mock is wrong
in a way a green test hides. The real class keeps `snapshot`, `params`, `queryParams`, `data`,
`fragment` and `url` in instance fields over one state record. A spec that sets `snapshot.params`
without emitting `params` tests a route no navigation can produce. `provideActivatedRoute()` builds
Angular's own class over one state record, so the halves cannot disagree. Its setters move them
together mid-test, in the order and with the equality a navigation uses. The example shapes above
come from a monorepo of 11 000+ spec files, where 42 hand-built route providers sit in 36 files.

**The two route rules agree.** [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) also reads the
`ActivatedRoute` token, in a provider descriptor and in `TestBed.overrideProvider`. For it, that rule
names `provideActivatedRoute()`, not `provideAutoSpy`. A descriptor both rules see gets two reports
of the same fix.

**Severity.** `error`. Every report has a `provide:` naming the route class next to it, so nothing is
guessed. What it reports is a double whose halves a passing test keeps apart.
:::

## no-passthrough-console-spy

**`error`** · suggestion · syntax only

Reports `vi.spyOn(console, 'error')` (or another method that writes) when nothing in the file gives
the spy an implementation. Such a spy records the call **and** still prints it. The spec looks as if
it silenced the console, so nobody looks for the noise.

```ts
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error'); // ❌ records the call, then prints it anyway
});
```

```ts
import { consoleErrorSpy, installConsoleSpies } from 'vitest-auto-spy/console';

beforeEach(() => {
  installConsoleSpies(); // ✅ silent, typed, taken off after the test under strayConsole
});

it('reports the failure', () => {
  service.load();

  expect(consoleErrorSpy).toHaveBeenCalledWith('load failed', expect.any(Error));
});
```

**Options.** None.

**How to fix.** Use `installConsoleSpies()` from `vitest-auto-spy/console`, as above. The smaller edit
is the suggestion: it appends `.mockImplementation(() => undefined)` to the `spyOn` call. It is a
suggestion, not a fix, because an implementation changes what the spy does, and that is your
decision.

**When to disable.** A spec that spies on the console to watch what it prints _and_ wants the output
in the log. Disable that line.

::: details How it decides
**What it matches:** `vi.spyOn(console, m)` or `jest.spyOn`, with `console`, `globalThis.console` or
`window.console` as the object, read without types.

**What settles it** (no report):

- a call chained straight onto the spy: `.mockImplementation(…)`, `.mockImplementationOnce(…)`,
  `.mockReturnValue(…)`, `.mockReturnValueOnce(…)`, after any number of `.mockName(…)`-style links;
- when the spy is stored in a name (a `const`, or a `let` a hook assigns), one of those four calls
  anywhere on that name. The rule follows the name through scope analysis. `expect(spy)`,
  `spy.mock.calls`, `spy.mockRestore()` and a direct call only read it;
- the spy passed to a helper, returned, aliased or put in an array. The rule cannot follow it there,
  so it stays silent.

**The method** must be a literal name the console writes through. `time`, `groupEnd` and
`countReset` write nothing, and a computed name is not knowable. A `console` the file declares itself
is not the global one and is left alone; a `console` your config lists under `globals` is checked.

**Why it is recommended.** A spy with no implementation calls through. Under
[`setupAutoSpy({ strayConsole })`](/utilities/setup), that fails the test as stray output. Without the
guard, it is the noise that buries the next real failure in the run log. On an Angular monorepo of
1 759 spec files the rule reports **0** times: its one `vi.spyOn(console, …)` already has an
implementation.

**Severity.** `error`. It decides on a fact: nothing in the file gives the spy an implementation, so
the output is there.
:::

## no-console-in-spec

**`error`** · no fix · syntax only

Reports a spec that calls a console method that writes, such as `console.log` or `console.error`, and
any assignment to a member of `console`. A call prints, so under `strayConsole` it fails the test. An
assignment is never undone, so it leaks into later files.

```ts
httpClient.get(url).subscribe({
  error: (error) => console.error(error), // ❌ the spec prints
});
```

```ts
httpClient.get(url).subscribe({ error: () => undefined }); // ✅ the failure is what the test arranged
```

**Options.** None.

**How to fix.**

- A debugging line left behind: delete it.
- Code under test that logs: absorb it with `installConsoleSpies()` and assert on the spy.
- An assignment: use a spy that is restored after the test.

```ts
console.warn = vi.fn(); // ❌ never put back
vi.spyOn(console, 'warn').mockImplementation(() => undefined); // ✅ restored after the test
```

You can also keep a replacement and make it safe: `installConsoleSpies()` from
`vitest-auto-spy/console` in a `beforeEach`, with `restoreConsole()` in an `afterEach`.

**When to disable.** Scope the rule to spec files. A CLI's own `console.log` is its output.

::: details How it decides
**Methods that write:** `log`, `info`, `warn`, `error`, `debug`, `trace`, `table`, `dir`, `dirxml`,
`group`, `groupCollapsed`, `timeLog`, `timeEnd`, `count`, `assert`.

**The object** must be the global `console`, also through `globalThis.console` / `window.console`. The
rule checks this through scope analysis: a `console` the file declares is somebody's fake and is left
alone. A computed member is not knowable and is skipped.

**Reads are never reported.** `expect(console.error).toHaveBeenCalled()` and
`register(console.warn)` mention the method without calling it. An assignment is reported whatever
the member, `console.time = …` included.

**Why it is recommended.** The call prints by definition, so under
[`setupAutoSpy({ strayConsole })`](/utilities/setup) it fails the test. The rule moves that failure to
the editor. The assignment is worse: nothing restores it, so under `isolate: false` every later file
of the worker gets a console that prints nothing. What that hides depends on which file ran first. On
an Angular monorepo of 1 759 spec files: **6 reports in 2 files**, each a `console.error` inside a
`subscribe` error callback, and no assignment anywhere.

**Severity.** `error`. A call on the global console writes, and an assignment to it is never undone.
:::

## no-import-time-console-spies

**`error`** · no fix · syntax only

Reports an import of `vitest-auto-spy/console` in a file that never calls `installConsoleSpies()` or
`useConsoleSpies()`. The import installs the spies once per worker, in whichever file imported them
first. They then silence every later file of that worker.

```ts
import { consoleErrorSpy } from 'vitest-auto-spy/console';

// ❌ installed by whichever file imported it first
```

```ts
import { useConsoleSpies } from 'vitest-auto-spy/console';

const { consoleErrorSpy } = useConsoleSpies(); // ✅ this file's tests, and nobody else's
```

**Options.** None.

**How to fix.** Call `useConsoleSpies()`, as above. It is `beforeEach(installConsoleSpies)` with
`afterEach(restoreConsole)`; on `node:test` and Rstest, write that pair yourself. Other options:

- `beforeAll` with `afterAll`, for a suite that shares one server or fixture across its tests;
- `installConsoleSpies()` once at the top of the file, when every test of the file expects output.

The exported constants and the returned object are the same spies, so an existing
`expect(consoleErrorSpy)` keeps working.

**When to disable.** A setup file that imports the entry to silence the console for the whole run on
purpose. It is not a spec, so scope the rule to spec files.

::: details How it decides
**What it reports:** a bare side-effect import, a namespace import, or a named import of any
`console*Spy` constant.

**What stops it:** a call to `installConsoleSpies` or `useConsoleSpies` anywhere in the file, bare, as
a member, or passed to a hook as `beforeAll(installConsoleSpies)`. The file then installs the spies
itself, and the import only supplies the names. An import of only `installConsoleSpies`, the types or
`restoreConsole` does not rely on the import-time install, so it is left alone.

**Why it is recommended.** The import installs the spies when the module is first evaluated. Under
`isolate: false` that is once per worker, and nothing in any file takes them off. What that hides
depends on file order. On an Angular monorepo of 1 759 spec files, 39 files import the entry and
**32** of them never call `installConsoleSpies()` (6 of the 32 are bare side-effect imports). When
three files started calling `restoreConsole()` in an `afterEach`, 12 tests in 5 other files failed,
and output that the global silence had hidden appeared in 7 files. Under
[`setupAutoSpy({ strayConsole })`](/utilities/setup) the import installs nothing at all, so the rule
and the guard agree about where the install belongs.

**Severity.** `error`. The import installs once per worker, and nothing in the file installs or
removes the spies.
:::

## no-unasserted-console-spy

**`warn`** · no fix · syntax only

Reports a console spy that the file installs but never asserts on. The spy swallows what the code
logged, and nobody reads it. That is the one place a spec can log an error and still pass.

```ts
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined); // ❌ silences, asserts nothing
});
```

```ts
const { consoleErrorSpy } = useConsoleSpies(); // every channel silenced, restored after each test

it('reports the failure', () => {
  service.load();
  expect(consoleErrorSpy).toHaveBeenCalledWith('boom'); // ✅
});
```

**Options.** None.

**How to fix.** Assert on the spy, at least with `expect(consoleErrorSpy).not.toHaveBeenCalled()`.
If you only wanted silence, delete the lines and let `useConsoleSpies()` do it. A spy imported from
`/console` and only reset in an `afterEach` is the same finding: resetting is already
`useConsoleSpies()`'s job.

**When to disable.** The rule is `warn` because only you know what the silenced channel should have
said. The evidence is exact, but the fix is a question for the author.

::: details How it decides
**What it reports:**

- a `vitest-auto-spy/console` spy, imported or destructured from `useConsoleSpies()` /
  `installConsoleSpies()` under any local name, whose every mention is a reset or an implementation:
  `mockClear`, `mockReset`, `mockRestore`, `mockImplementation`, `mockReturnValue`, `mockName`;
- a `vi.spyOn(console, m)` that gets an implementation and is held nowhere a test reads it.

**What it leaves alone:**

- a spy that still calls through. That is
  [`no-passthrough-console-spy`](#no-passthrough-console-spy)'s finding, so one line never gets two
  reports with two different fixes;
- a file that reads the console another way: `consoleOutput()`, `consoleLines()`,
  `expect(console.error)`, `vi.mocked(console.warn)`.

**Why it is recommended.** The code under test reported a failure, the spy swallowed it, and the test
asserted on something else.

**Severity.** `warn`. The evidence is exact, but only the author can answer what the silenced channel
should have said.
:::

## prefer-provide-auto-spy

**`error`** · `--fix` · syntax only

Reports a provider that hands Angular DI a hand-written service double through `useValue`,
`useFactory`, `useClass` or `useExisting`, in `providers` or in `TestBed.overrideProvider`. Such a
double goes out of date when the class changes, and the failure shows up in the component, one DI
step away. It also
reports `{ provide: X, useValue: createSpyFromClass(X, config) }`, which is `provideAutoSpy(X, config)`
written out.

```ts
providers: [{ provide: CartService, useValue: { total: vi.fn(), add: vi.fn() } }]; // ❌

class CartServiceMock {
  total = vi.fn().mockReturnValue(0);
  add = vi.fn();
}
providers: [{ provide: CartService, useClass: CartServiceMock }]; // ❌ and the stub class goes too
```

```ts
import { injectSpy, provideAutoSpy } from 'vitest-auto-spy/angular';

TestBed.configureTestingModule({ providers: [provideAutoSpy(CartService)] }); // ✅
injectSpy(CartService).total.mockReturnValue(3); // in beforeEach or in the test: set the answer
```

```ts
// a member the double must *be* rather than spy on goes in the options:
providers: [provideAutoSpy(ConfigService, { overrides: { flagsConfig: { theme: 'dark' } } })];
// and for a token, which has no class to read:
providers: [provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] })];
```

**Options.** None.

**How to fix.** The message names the replacement for what you provide:

| You provide         | Replace with                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| a class             | `provideAutoSpy(Class)`, and delete the stub class                             |
| an `InjectionToken` | `provideAutoSpyForToken(TOKEN)`: a token has no prototype for `provideAutoSpy` |
| `ActivatedRoute`    | `provideActivatedRoute()` from `vitest-auto-spy/angular-router`                |

- `{ provide: X, useValue: createSpyFromClass(X, config) }` has `--fix`: it becomes
  `provideAutoSpy(X, config)`.
- In `TestBed.overrideProvider(X, { … })`, pass the result of `provideAutoSpy` instead of the
  literal: `.overrideProvider(X, provideAutoSpy(X, { … }))`. `provideAutoSpy` returns
  `{ provide, useValue }`, and `overrideProvider` reads the `useValue` from it.
- A component that declares the token in its own `providers` cannot be reached by a module-level
  provider. There the override stays, and only what it hands over changes.

**When to disable.** Rarely; every report has a `provide:` or an override token next to it. On a
large project, land it with [the gradual recipe](/utilities/eslint-plugin#land-it-on-a-large-existing-suite-without-a-red-ci)
instead of changing its severity. Known gaps:

- The token check is a name test. A class written in `SCREAMING_CASE` is told to use
  `provideAutoSpyForToken`, and a token named like a class is told to use `provideAutoSpy`. The
  finding is right; one word of the advice is wrong.
- A double built by a local helper, or a `let` that two hooks write to, is not followed.
- A stub class in a shared `*.mock.ts` is not seen from the spec: the class must be declared in the
  linted file.
- A hand-written double handed to an override by name (`.overrideProvider(X, descriptor)`) is not
  reported. That shape is the same as `.overrideProvider(X, provideAutoSpy(X))`, which must not be
  reported.

::::: details How it decides
**The token** comes from the `provide` key, or from argument 0 at an override call. The double is read
four ways:

- **`useValue` is read up to the function boundary.** The value may be the object literal itself, or a
  name. A name is followed one step to the value the file gives it: an initializer
  (`const nav = { go: vi.fn() }`), or a single later assignment:

  ```ts
  let nav: { go: Mock };
  beforeEach(() => {
    nav = { go: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: NavService, useValue: nav }] });
  });
  ```

  From the _second_ write on, the name is left alone: what it holds at the use site then depends on
  run order. One `vi.fn()` anywhere in the value is enough, because a `provide:` next to it proves it
  is a service double. The walk stops at every function: a `vi.fn()` behind an arrow is created per
  call, which is the shape the rule steers towards. A property whose value is a name bound once to a
  `vi.fn()` counts too: `useValue: { open }` over `const open = vi.fn()`.

- **`useFactory` is read _through_ the function.** The factory's whole body is what DI ends up
  holding. For example, `useFactory: vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }))`
  hides a structural double with no relation to the class.
- **A `useValue` that calls `createSpyFromClass`** is judged by the class it reads, not by its
  contents. `provideAutoSpy(X, config)` returns exactly `{ provide: X, useValue:
createSpyFromClass(X, config) }`, so this literal is the long form of `provideAutoSpy(X, config)`. This
  is the one form with a **fix**: the literal becomes the call, the arguments move across as source
  text, `provideAutoSpy` is imported (into the existing `vitest-auto-spy/angular` import if there is
  one), and an orphaned `createSpyFromClass` import is dropped. The fix stands down where the rewrite
  is not a clean swap: explicit type arguments (`createSpyFromClass<T, Options>` takes two,
  `provideAutoSpy<T>` one), a third property in the literal, or a `provideAutoSpy` the file declares
  itself.
- **`useClass` and `useExisting` are read as a class the linted file declares**, and so is
  `useValue: new StubMock()`. One `vi.fn()` field is enough. A class the file does not declare
  (imported from a shared `*.mock.ts`, reached through a namespace) resolves to nothing and is not
  reported. The four exemptions of [`no-stub-class-double`](#no-stub-class-double) apply here too.
  `useClass` builds an instance per injector and `useExisting` aliases the token; the fix is the same
  for both, so they share a message.

**A configured spy is still a spy.** `vi.fn()` and `vi.fn().mockReturnValue(of([]))` are the same
double, one of them tuned. The chain is unwound to the call that created the mock, however long it
is. The more a hand-written double has been tuned, the further it has drifted from the class.

**`TestBed.overrideProvider`** is the same substitution from outside the array. On one project of
1759 spec files there are 61 override calls in 36 files; 33 hand over an object literal. A call whose
second argument is **not** an object literal is left alone: 28 of those 61 calls already use
`provideAutoSpy(X, { … })`. The override form gets its own message, because what differs there is
where the configuration goes, not which factory to use.

**Token or class.** A `new InjectionToken<…>(…)` initializer the resolver can reach settles it.
Otherwise the name decides: a token is nearly always imported, so `^[\dA-Z_]+$` is what is left to
read. The advice differs because `provideAutoSpy` reads a class prototype, a token has none, and the
advice would not compile. In three migration batches this mattered; in one of them 6 of 8 reports
were on tokens.

**`ActivatedRoute`** gets its own message. The class keeps `snapshot`, `params`, `queryParams`,
`data`, `fragment` and `url` in **instance** fields, so a spy built from its prototype has none of
them. That would be the same half-route the hand-written `useValue` was. The rule's reach does not
change for this token, only the advice. That form has no fix, because the replacement is a different
double, not the same one spelled shorter. It is the same fix
[`prefer-provide-activated-route`](#prefer-provide-activated-route) names, so both rules say one
thing.

**`multi: true` is skipped.** `provideAutoSpy` builds one double for a token and takes no registration
mode. Following the advice would quietly turn an accumulating provider into an overriding one, so
there is nothing to recommend.

**Silent on purpose:**

- `{ provide: LocalStorage, useValue: createSpyFromClass(BaseLocalStorage) }`. The token is an abstract
  class, and the spy reads an implementation of it: an abstract prototype has none of the methods the
  double needs, so `provideAutoSpy(LocalStorage)` would spy on nothing. There is no shorter spelling.
  In the measured project that is 51 sites in 41 files, all working code.
- A `createSpyFromClass` call stored in a name (`const cart = createSpyFromClass(Cart)`,
  `useValue: cart`). The double is configured through that name later, so the fix would be
  `provideAutoSpy(Cart)` plus an `injectSpy(Cart)` at every use: a rewrite of the file.
- A factory seed. A `useValue` built by one of this library's factories is a call, and the rule only
  reads object literals; a name it follows lands on that call and stops.

**Check where the rule runs before you conclude it is blind.** One migration shard had ~100 `vi.fn()`s
the plugin never reported, across six shared `*.service.mock.ts` files, each with a provider factory:
`export function providePaymentsMock(): Provider { return { provide: X, useValue: new XMock() }; }`.
The rule reads that fine: over those 84 `*.mock.ts` files it reports 9 in 9. Nothing appeared because
the project scoped the config to `**/*.spec.ts`, as [the plugin page](/utilities/eslint-plugin) says.
If you keep fixtures next to the specs, use `['**/*.spec.ts', '**/*.mock.ts']`.

**Why it is recommended.** The same drift as
[`prefer-create-spy-from-class`](#prefer-create-spy-from-class), one DI step away, and harder to read.
The failing line is in the component, the double is in the module configuration, and the type system
says nothing because `useValue` is typed `any`.

**Severity.** `error`. It is the loudest rule on a project that has never run it:

- on one project of 1771 spec files, already clean against `recommended`, the `createSpyFromClass`
  form alone adds **91 reports in 49 files**. All 91 are fixable, at most 8 per file, so one
  `eslint --fix` run clears them;
- on the same project's earlier 1759 spec files: **154 reports across 87 files**. That is 100
  `useValue`s (28 of them behind a token), 20 stub classes and 6 at an override call.

Most of that comes from following names. Those doubles are handed to DI one name away, where a
`provide:` settles the question, and the answer is `provideAutoSpy(X)`, not `createAutoMock<T>()`.
This is also why [`no-stub-class-double`](#no-stub-class-double) and
[`no-structural-double`](#no-structural-double) are separate rules at `warn`: they judge the doubles
that have no `provide:`, on a guess. Nothing here is a guess, which keeps this rule at `error`.
:::::

## prefer-inject-spy

**`error`** · suggestion · syntax only · option `ignoreTokens`

Reports `vi.spyOn` over the instance `TestBed.inject` returned. If that instance is an auto-spy,
`vi.spyOn` replaces its method with a plain `vi.fn()`. The spy helpers on that method are gone, and
the next `nextWith` throws.

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(BillingPlansService)] });

const service = TestBed.inject(BillingPlansService);
vi.spyOn(service, 'getPlans'); // ❌ replaces the auto-spy's method with a plain vi.fn()

injectSpy(BillingPlansService).getPlans.nextWith(['PRO']);
// TypeError: spy.getPlans.nextWith is not a function
```

```ts
injectSpy(BillingPlansService).getPlans.nextWith(['PRO']); // ✅ emits ["PRO"]
```

**Options.**

| Option         | Type       | Default | Meaning                                                                   |
| -------------- | ---------- | ------- | ------------------------------------------------------------------------- |
| `ignoreTokens` | `string[]` | `[]`    | more tokens whose injected instance stays real; adds to the built-in five |

```js
'vitest-auto-spy/prefer-inject-spy': ['error', { ignoreTokens: ['MapRendererService', 'WINDOW_REF'] }],
```

**How to fix.** Read the spy with `injectSpy(X).m`. Your editor offers this as a suggestion. It is
never `--fix`, because whether the token is really provided with `provideAutoSpy` is decided in
another file.

**When to disable.**

- If a token's real instance is the point for the whole project, add it to `ignoreTokens`.
- If one test spies on one method of a real service on purpose, disable that line.
- Tokens are compared as source text, so an aliased import (`import { DestroyRef as NgDestroyRef }`)
  misses the built-in list and is reported. Add the alias to `ignoreTokens`.

::: details How it decides
**What it matches.** The first argument of `vi.spyOn` is a `TestBed.inject(…)` call, or a name whose
initializer is one. The name is resolved in the scope where it is _used_. Both forms often sit on
neighbouring lines of one file:

```ts
vi.spyOn(TestBed.inject(X), 'm'); // inline
const service = TestBed.inject(X);
vi.spyOn(service, 'm'); // two steps
```

An ordinary `vi.spyOn` over an object the spec owns is not reported, and neither is one over a name
the rule cannot trace to `TestBed.inject`.

**When the suggestion is offered.** Only when nothing has to be invented:

- the `inject` call takes the token alone. `TestBed.inject(X, null, InjectFlags.Optional)` is not
  translated: `injectSpy` takes the token alone, and dropping the rest would change which instance
  comes back;
- the method name is a string literal that can be written after a dot;
- `injectSpy` is not already bound to something else in the file.

**The five built-in tokens.** The rule says nothing about `ApplicationRef`, `DestroyRef`,
`EnvironmentInjector`, `HttpClient` and `Injector`. For each, the advice is either impossible or
removes the reason the spec injected the object:

- `DestroyRef` cannot be replaced at all. It carries `__NG_ENV_ID__`, and `R3Injector.get()` answers
  `token[NG_ENV_ID](this)` on its first line, _before_ it reads its own records. So
  `{ provide: DestroyRef, useValue }` is accepted, ignored, and never mentioned again. It is the only
  class in `@angular/core` with that flag.
- `ApplicationRef` is the harness. `TestBed` drives change detection through it, and a spec that
  creates a component by hand reads the renderer from `ApplicationRef.injector`. What works is the
  real instance with `attachView` / `detachView` spied, so nothing is attached.
- `Injector` and `EnvironmentInjector` answer _other_ dependencies. Spied, `get()` returns a spy for
  every token resolved after it, and the replacement spreads to everything the code under test looks
  up lazily.
- `HttpClient` already has a framework double: `provideHttpClientTesting()` swaps the backend and
  gives the spec an `HttpTestingController`. A spy on `get` there reads the options the caller
  passed, on the way to a request the controller still flushes.

Node-injector tokens (`ElementRef`, `Renderer2`, `ChangeDetectorRef`) are not in the list on purpose.
`TestBed.inject()` cannot return any of them, so an entry would exempt a line nobody can write.

**Tokens are compared as source text**, as [`no-unregistered-inject-spy`](#no-unregistered-inject-spy)
does: a rule that reads one file has no identity to compare. `ignoreTokens` extends the built-in list
rather than replacing it.

**Why it is recommended.** It is one line that quietly undoes a provider. `vi.spyOn` replaces one
method and leaves the rest real. The provider is still an auto-spy, but the method on it is a plain
`vi.fn()`, so every observable and promise helper on it is gone. The error appears on a line that
reads like ordinary spy setup. Read the same dependency with `injectSpy(BillingPlansService)`, and
`nextWith` works.

**Severity.** `error`. Red without the rule, and the message points at the helper, not at the
`spyOn` that removed it.
:::

## no-unregistered-inject-spy

**`error`** · no fix · syntax only

Reports `injectSpy(X)` for a token that nothing in the file registered as an auto-spy. You get
whatever Angular DI already had, usually the real service. Its spy helpers exist only for the
compiler, so the first `.mockReturnValue(…)` throws.

```ts
TestBed.configureTestingModule({
  imports: [RouterTestingModule], // provides a real ActivatedRoute
  providers: [provideAutoSpy(UserService)],
});

const route = injectSpy(ActivatedRoute); // ❌ the real one, with spy helpers that are not there
```

```ts
providers: [provideAutoSpy(UserService), provideAutoSpy(ActivatedRoute)]; // ✅
// or say that the real one was the point:
const route = TestBed.inject(ActivatedRoute);
```

**Options.** None.

**How to fix.** Either register the token with `provideAutoSpy(X)`, or read it with
`TestBed.inject(X)` if the real implementation is what you want.

**When to disable.** This is one of the [three rules that can report on correct
code](/utilities/eslint-plugin#the-three-rules-that-can-report-on-correct-code), and it has no option.
It is wrong when the file registers some doubles in a way the rule reads, and gets another through a
helper it does not follow, such as a shared `beforeEach` in an imported test utility that configures
the TestBed. Use a scoped `'off'` or a per-line disable there.

::: details How it decides
**Registrations it counts:** a `provideAutoSpy(X)` call anywhere, and `{ provide: X, useValue: … }`
whose value is a call to `createAutoMock`, `createSpyFromClass`, `createMock` or `mockDeep`. Tokens
are compared as **source text**.

**It reports nothing unless all three hold,** because a false report here costs more than the warning
it replaces:

- the file calls `provideAutoSpy` at least once. Otherwise it configures DI in a way this rule does
  not model, and a missing token says nothing;
- no `providers` array holds a spread, a hole, or a provider factory other than `provideAutoSpy`.
  `providers: [...sharedMocks]` is the normal way to pull in shared mocks, and one unreadable entry
  hides an unknown number of tokens. So it silences the **file**, not one line;
- the file does not call `createWithAutoSpies`, `renderShallow` or `TestBed.overrideProvider`. Each
  registers doubles somewhere this scan does not look.

**What `providers` value it can read:** an array literal, or a `const` declared with one and never
changed (`const providers = […]` passed as `{ providers }` or under a quoted `'providers'` key). Any
other value (an import, a factory call, an array something pushes to) makes the file unreadable, and
nothing in it is reported.

**A token provided by hand** (`{ provide: X, useValue: someObject }`) is recorded as provided and never
reported. That is [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)'s shape, and two rules firing
on one line would only teach people to disable both.

**Why it is recommended.** `injectSpy` is declared to return `Spy<T>`. Every helper on the result
type-checks against that declaration, not against the value. So the helpers exist for `tsc` and are
missing at run time. The first `.mockReturnValue(…)` or `.calledWith(…)` lands on a real method and
throws a `TypeError`, on a line that reads like ordinary spy setup.

The library already says this at run time: `injectSpy` checks what the injector returned and warns
that it is a plain instance. But a warning on stderr does not fail the run. It scrolls past in a
project of a thousand files, and it appears only for tests that ran the line. In one monorepo, dozens
of spec files print it on every CI run, and nobody has acted on it. The check needs no type
information, so it belongs where the mistake is written.

**Why no fix and no suggestion.** The fix is either a provider this file does not have, or a
`TestBed.inject(X)` that says the real implementation was the point. Only you know which.

**Severity.** `error`. Red by construction when the line runs, and the type checker is on the wrong
side of it.
:::

## no-real-component-provider

**`error`** · no fix · syntax only · options `ignoreTokens`, `childInjectors`

Reports `fixture.debugElement.injector.get(X)` or `fixture.componentRef.injector.get(X)` for a token
that nothing in the file replaced with a double. You get the real provider from the component's own
`providers`, so the component spec runs the real store, HTTP calls and all.

```ts
@Component({ providers: [CartStore] })
class CartComponent {}

const fixture = TestBed.createComponent(CartComponent);
const store = fixture.debugElement.injector.get(CartStore); // ❌ the real store, HTTP and all
```

```ts
const store = overrideComponentProvider(CartComponent, CartStore); // ✅ before createComponent
const fixture = TestBed.createComponent(CartComponent);

store.load.mockReturnValue(of(items));
```

**Options.**

| Option           | Type       | Default | Meaning                                                                             |
| ---------------- | ---------- | ------- | ----------------------------------------------------------------------------------- |
| `ignoreTokens`   | `string[]` | `[]`    | tokens whose real provider the spec wants                                           |
| `childInjectors` | `boolean`  | `false` | also read `query(…).injector`, `queryAll(…)[i].injector` and `children[i].injector` |

```js
'vitest-auto-spy/no-real-component-provider': ['error', { childInjectors: true }],
```

**How to fix.** Replace the provider with `overrideComponentProvider(Component, X)` before
`createComponent`, and configure the returned spy. The message names the component: the class the
query found through `By.directive(…)`, or the one class the file passes to `createComponent`. When
there are several, it says `Component`.

**When to disable.**

- An integration test that renders the component with its real provider on purpose: list the token in
  `ignoreTokens`.
- A double installed by a helper in another file is invisible to the rule. Wrap the read in
  `asSpy(…)`: that documents it and silences the rule.

::: details How it decides
**The whole file, compared as source text.** A token counts as replaced when it is named in the
arguments of `provideAutoSpy`, `overrideAutoSpy`, `overrideComponentProvider`, `overrideProvider`,
`overrideComponent` or `createSpyFromClass`, or in the `provide` key of a provider object. A read
wrapped in `asSpy(…)` is taken as your word that the double exists.

**Never reported:**

- tokens imported from `@angular/*`;
- classes the file renders: passed to `createComponent`, or listed in `imports` / `declarations` /
  `hostDirectives`;
- every read in a file that calls `createWithAutoSpies`.

**Own injector by default.** Only the fixture's own injector is read. `debugElement.query(…).injector`
is a child, and asking it for a directive class is how a spec reaches that directive. With
`childInjectors: true`, the child reads count too, and every class named in `By.directive(…)` is
treated as rendered, so reading the directive itself stays quiet.

**Why it is recommended.** `injectSpy` cannot reach a provider declared on the component, so the spec
goes through the fixture. When nothing replaced the provider, the fixture returns the production
class. The component spec then drives the store through its real HTTP calls, flushes requests the
component never makes itself, and repeats the store's own spec under the component's name. One change
in the store turns three spec files red. On three projects with 1078 spec files: 5 reports, each a
store or service from the component's own `providers`.

**Severity.** `error`. The evidence is exact: the read and every place a replacement could be written
are in the file.
:::

## prefer-to-have-signal-value

**`warn`** · `--fix` · needs types

Reports `expect(signal()).toBe(…)` and similar matchers over a signal read inline. The failure then
names a value, not the signal. And the shape is one keystroke away from `expect(component.total).toBe(3)`,
which passes for every signal ever created.

```ts
expect(counter.total()).toBe(3); // ❌ the failure names "3", not the signal
expect(counter.total()).toStrictEqual(3); // ❌ same, and the fix keeps the strictness
```

```ts
expect(counter.total).toHaveSignalValue(3); // ✅
expect(counter.total).toHaveSignalValue(3, { strict: true }); // ✅
```

**Options.** None.

**How to fix.** `--fix` drops the parentheses and renames the matcher to `toHaveSignalValue`, the
matcher `registerSignalMatchers()` registers. It keeps `.not` where it is.

| Before                   | After                                    |
| ------------------------ | ---------------------------------------- |
| `toBe(v)` / `toEqual(v)` | `toHaveSignalValue(v)`                   |
| `toStrictEqual(v)`       | `toHaveSignalValue(v, { strict: true })` |
| `toBeNull()`             | `toHaveSignalValue(null)`                |
| `toBeUndefined()`        | `toHaveSignalValue(undefined)`           |

`toHaveSignalValue` names the signal in the failure. It also refuses anything that is not a
zero-argument getter, so forgetting the parentheses fails instead of passing. A received call with
its own type arguments is reported without a fix, because moving the text would drop them.

**When to disable.** The rule needs type information; without it, it reports nothing. It is `warn`
because the original assertion is correct: the matcher only fails more clearly.

::: details How it decides
**What it matches:** `toBe`, `toEqual`, `toStrictEqual`, `toBeNull` or `toBeUndefined`, `.not`
included, over a call the type checker resolves to a signal.

**A signal is recognised by its type, not its name:** callable, and carrying Angular's signal brand.
The checker spells that brand `__@SIGNAL@53`, with a trailing number that changes per program, so
`getProperty('ɵSIGNAL')` by plain name finds nothing. Methods, plain functions and getters are not
reported. Without type information the rule says nothing, rather than guessing from the name.

**An identity check is skipped.** `toBe` compares with `Object.is`, and `toHaveSignalValue` compares
deeply. `expect(list.items()).toBe(items)` asserts that the signal holds that very array; after a
rewrite it would pass for any equal copy. So a `toBe` is reported only when:

- the expected value is a primitive literal (`3`, `'on'`, `null`, `undefined`, a template with no
  expressions), or
- the signal's type is primitive: string, number, boolean, bigint, enum, their literals, `null`,
  `undefined`. `any` does not count.

Any other `toBe` is left alone, since no matcher over the signal keeps the identity.

**Why the fix is safe.** The matcher compares with the runner's deep equality, including nested
`Set`s and `Map`s by contents, on both the loose and the strict path. That makes the rewrite an
equivalence.

**Severity.** `warn`. It names a matcher that fails more clearly; the assertion it replaces is not
wrong.
:::

## prefer-render-shallow

**`warn`** · suggestion · syntax only · option `templates`

Reports `TestBed.createComponent` in a spec file that never reads the rendered template.
`createComponent` compiles the template and builds every child component, once per test. A spec that
only sets inputs and checks state pays for that and uses none of it. `renderShallow(X)` gives you the
same `TestBed` and the same real `ComponentFixture`, with the children dropped and the template blank.

```ts
const fixture = TestBed.createComponent(CartPage); // ❌ compiles the template, builds every child
fixture.componentRef.setInput('items', items);
fixture.detectChanges();

expect(fixture.componentInstance.total()).toBe(42);
```

```ts
const { fixture } = renderShallow(CartPage); // ✅
// same TestBed, same real ComponentFixture, children dropped and template blank;
// inputs, signals, lifecycle hooks and DI all stay
```

**Options.**

| Option      | Type                       | Default       | Meaning                                                                                  |
| ----------- | -------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `templates` | `'as-needed'` \| `'never'` | `'as-needed'` | `'as-needed'` reports a render nobody reads; `'never'` bans real templates in unit specs |

Under `'never'` the rule reports every `TestBed.createComponent` (whether or not the file reads the
DOM), every `keepTemplate: true`, every DOM read in the spec (once per statement), a `@Component`
declared in the spec with a `template` or `templateUrl`, and a `template:` passed to `renderShallow` /
`prepareShallow`. Each of these messages links to
[Testing without the DOM](/guides/testing-without-the-dom). The array form sets the severity too:

```js
'vitest-auto-spy/prefer-render-shallow': ['warn', { templates: 'never' }], // or 'error' to enforce it
```

**How to fix.** Replace the render with `renderShallow(X)` from `vitest-auto-spy/angular`. Before you
apply it across a project that gates on branch coverage, note that a shallow render moves the
component's AOT branches out of coverage for the rest of the file. Keep one real render per component
where those branches matter; see [renderShallow](/adapters/angular).

- If the component reads its own template through `viewChild`, `contentChild` or content projection,
  or its behaviour comes from its markup (an event binding, a `@defer` block), use
  `renderShallow(X, { keepTemplate: true })`. It keeps the template and still drops the children.
- If the constructor reads spy state and each test tunes the spies first, render per test and do the
  tuning in `beforeCreate`, which runs after the module is configured and before the constructor:

```ts
const render = (tune: () => void = () => undefined) =>
  renderShallow(SlidesComponent, {
    providers: [provideAutoSpy(StateService)],
    detectChanges: false,
    beforeCreate: () => {
      state = injectSpy(StateService);
      state.savedUi.mockReturnValue(DEFAULT_UI);
      tune();
    },
  });

it('restores the collapsed layout', () => {
  const { component } = render(() => state.savedUi.mockReturnValue(COLLAPSED_UI));
  // …
});
```

**The suggestion folds the setup** into one call. It is offered only for this shape, all in one
block:

```ts
TestBed.configureTestingModule({ imports: [CardComponent, RouterStub], providers: [provideAutoSpy(Api)] });
api = injectSpy(Api);
fixture = TestBed.createComponent(CardComponent);
fixture.detectChanges();
```

```ts
fixture = renderShallow(CardComponent, { imports: [RouterStub], providers: [provideAutoSpy(Api)] }).fixture;
api = injectSpy(Api);
```

- The literal may hold only `providers` and `imports`, and `imports` must list the component. The
  component is dropped from it.
- Only bare `v = injectSpy(…)` reads may sit between the two calls; they move below the render.
- A `fixture.detectChanges()` right under the render is absorbed. Without one, the call gets
  `detectChanges: false`, so nothing renders earlier than before.
- The import merges into an existing `vitest-auto-spy/angular` import.
- Any other shape gets the report without an edit: a chained `compileComponents()`, a key
  `renderShallow` spells differently, a configured spy between the calls, a comment the edit would
  delete, the two-argument `createComponent`.

**When to disable.** The rule reports a cost, not a defect. On a leaf component (no children) there
is nothing to save, so you can ignore the report there. A project that has decided to move onto
`renderShallow` can raise it to `'error'`.

:::: details How it decides
**What counts as reading the template.** The rule looks at the identifiers of the **whole file**, not
at the fixture the call returned. The words are `nativeElement`, `debugElement`, `elementRef`,
`hostElement`, `queryElement`, `querySelector`, `getComputedStyle`, `triggerEventHandler`,
`innerHTML`, `innerText`, `textContent`, `getAttribute`, `classList` and `shadowRoot`, matched inside
an identifier or member name (a `nativeElementOf()` helper counts too), plus `By.css` and
`By.directive`. One read anywhere silences the file.

Only code counts. A comment, a string or template literal, and a member the spec **declares** rather
than reads (the key of `{ getAttribute: 'nope' }`, a field or method of a fake class, an interface
member) read nothing, so they do not silence the file. A destructuring `const { nativeElement } =
fixture` and a computed `el['textContent']` are reads and do.

**Why the whole file.** A component spec often keeps the fixture in a `let`, fills it in `beforeEach`
and reads `debugElement` three helpers away. Following one variable would miss those, and a rule that
reports half of them is worse than none. So the rule **under-reports by design**: it never claims a
spec reads nothing when it does.

**One shape is subtracted first.** A spec that swaps `location` or `defaultView` provides a
`DOCUMENT` stand-in that delegates the rest to the real document:
`querySelector: document.querySelector.bind(document)`. Every key it copies is one of the words
above, which silenced the rule on exactly the file it exists for. Only the `name: document.name`
shape is dropped, and only where the two names match: that is a delegation and nothing else. A bare
`document.querySelector('.row')` still counts, because that is how a fixture attached to the document
is read.

**Under `{ templates: 'never' }`** the read scan does not run. The only exemption is a file whose code
calls or imports `createDirectiveHost`. A directive attaches to an element, so something has to render
that element. The host's template is the harness, not the markup under test, and banning it would ban
directive tests, including the way this package recommends. The exemption covers the host component
and the DOM reads: a directive test reads the element it attached to.

The message differs between the two settings. Under `'as-needed'` the rule found no template read,
and the message says so. Under `'never'` the rule does not look for reads at all. There, the file
reported most is usually the one that reads the template most, so the message states the policy
instead of a claim about the file.

**Know the cost of `'never'`.** On one project, `'never'` turned **18 of 40** tests in a component
spec red, and coverage fell from **100 % to 95.7 %**. Nothing was excluded from the report: with
`templateUrl` the compiled template maps back to the `.html`, which a `*.ts` coverage glob never
matched. What stopped running was ordinary TypeScript: the body of a method whose entry condition is
a `viewChild` the template supplies. That code is the component's own, so no coverage setting hides
it. A project that takes this option gives up a 100 % line threshold on its components.

**Why a suggestion and not `--fix`.** `renderShallow` calls `configureTestingModule` itself, adds
`NO_ERRORS_SCHEMA` and runs the first change detection. That is the right module for a spec that reads
no markup, but not the module the file had. A bare `TestBed.createComponent(X)` →
`renderShallow(X).fixture` swap kept the spec's own `configureTestingModule` in front of it and every
`injectSpy` between the two. Applied to 49 files, it broke 17 with _Cannot configure the test module
when the test module has already been instantiated_, and rendered early wherever no
`fixture.detectChanges()` followed. `--fix` runs unattended across a repository; a suggestion is
accepted one call at a time, with the diff in front of you.

**How much it saves.** On a leaf component, nothing: the two renders measure about the same, and
`overrideComponent` forces a JIT recompile the leaf did not pay before. The deeper the child tree,
the more it saves. Blanking the template alone is worth about **3.8×** on a component with 100
children. The measurements are on the [Performance](/core/performance) page.

**Severity.** `warn`, and pinned there. It is graded on the _kind_ of finding. Every other rule
names something wrong or dead; this one names a file that could render more cheaply, which is a
choice your project makes, not a defect. At `error` the plugin would force that choice: **491
findings across 398 of one project's 1759 spec files**, a first run everyone would answer with a
`warn` of their own. `off` would be the same mistake from the other end.
::::

## prefer-set-inputs

**`warn`** · suggestion · syntax only

Reports a run of `fixture.componentRef.setInput('name', value)` calls on one fixture. Angular checks
that name against nothing: a typo or a renamed input logs `NG0303` and changes nothing, and the test
fails later on unrelated state. `setInputs` checks every name first and types the values.

```ts
it('shows the updated title', async () => {
  fixture.componentRef.setInput('title', 'Hi'); // ❌ an unknown name is an NG0303 and no change
  fixture.componentRef.setInput('count', 2);
  fixture.detectChanges();

  expect(heading().textContent).toBe('Hi (2)');
});
```

```ts
it('shows the updated title', async () => {
  await setInputs(fixture, { title: 'Hi', count: 2 }); // ✅ every name resolved before the first write

  expect(heading().textContent).toBe('Hi (2)');
});
```

**Options.** None.

**How to fix.** Replace the run with one `await setInputs(fixture, { … })`. The suggestion does it:

- A `detectChanges()` directly under the run goes too: `setInputs` awaits `stable()`, which flushes
  effects and awaits the fixture, more than one change-detection pass.
- A `detectChanges(false)` stays: it skips the check-no-changes assertion, which `stable()` does
  not.
- The `await` makes the callback `async`. The suggestion writes that only into a callback the runner
  owns (`it`, `test`, `beforeEach` and the rest, spelled bare). Inside your own helper or a
  `waitForAsync(…)` wrapper, you get the report without the edit.
- If your lint forbids an `async` hook, keep the call in the test: a
  `const render = async () => { …; await setInputs(fixture, { … }); }`, awaited first in each `it`.

**When to disable.** Under zone.js, check each rewrite with a run. `setInputs` awaits `stable()`,
which starts with `TestBed.tick()`, and under zone.js that tick can re-enter the one the zone
schedules itself: `NG0101: ApplicationRef.tick is called recursively`. That is why this is a
suggestion, not `--fix`, and why the rule is `warn`. A zoneless project can raise it to `'error'`.

::: details How it decides
**One report per run,** on its first call. A `componentRef` bound once to `<fixture>.componentRef`
(`const componentRef = fixture.componentRef`, or a `let` a hook assigns) is followed to its fixture,
which the edit then names, as long as the fixture is the same binding where the call is.

**The rule reads only the call and the file:**

- The receiver must read as a `ComponentFixture`. `<name>.componentRef` carries most of that: a bare
  `ComponentRef` (what `ViewContainerRef.createComponent()` returns, where `setInputs` does not
  apply) has no `componentRef`. The name (`fixture`, `hostFixture`, `newFixture`) or the single value
  the file gives it (`TestBed.createComponent(X)`, `renderShallow(X).fixture`, `render(X)`) settles
  the rest. A receiver that neither settles is left alone.
- The input name must be a string literal. A computed name cannot be written as a key.
- The call must be a statement of its own. A result used anywhere is an effect the rule cannot
  account for.
- A run continues while the statements are adjacent, with no comment between them, on the same
  fixture, and name inputs the run has not set yet. **The same input twice ends the run:** the spec is
  saying "and now it changes", and merging them would duplicate a key.

**Why it is recommended.** A typo, an input renamed under the spec, or an alias written as its class
field name all end in green `setInput` calls and an assertion that fails later. On one Angular
project, taking the 650 calls the rule can rewrite turned **72 fixtures that had drifted from their
model into compile errors, across 21 files**: a `{}` for a `CardActionExtra`, a literal in an old
shape of an interface, an `imageUrl` for a model whose field is `imgUrl`.

**The zone.js cost, measured.** On a 1771-file project, accepting all 451 suggestions rewrites 126
files. 105 of them still type-check, and **57 of those 105 go from green to red**, each on
`NG0101: ApplicationRef.tick is called recursively`. It reproduces in two lines:
`componentRef.setInput(…)` followed by a bare `TestBed.tick()`, no helper and no `await`. Whether the
edit is a drop-in depends on a fact no spec file shows. In the same project, 53 of 504 findings sit in
a helper or `waitForAsync` and get no edit.

**Severity.** `warn`, graded on what the fix costs, not on the finding. The finding is a fact with no
guessing in it. But the rule reports **504 times across 140 files** on a project that is green under
every `error` rule, and adopting the fix is a migration you take file by file, like
[`prefer-render-shallow`](#prefer-render-shallow).
:::

## no-overridden-provider

**`error`** · suggestion (duplicates only) · syntax only

Reports a provider that a later provider for the same token replaces, in the same array or through
`TestBed.overrideProvider` in the same suite. Angular keeps the **last** provider for a token, so the
earlier one never runs. The spec then asserts against a double it does not have.

```ts
providers: [
  provideAutoSpy(DisplaySettingsService), // ❌ never runs
  { provide: DisplaySettingsService, useValue: mockDisplaySettings }, // this is what DI hands out
];
```

```ts
providers: [provideAutoSpy(DisplaySettingsService)]; // ✅ keep one
```

**Options.** None.

**How to fix.** The message tells you which case you have:

- **`duplicateProvider`:** the two providers are written identically. Delete the earlier one; Angular
  already ignored it. The suggestion does this. The message names the token and the line of the copy
  that survives.
- **`overriddenByBarerProvider`:** the survivor configures _less_ than the one it buries. Move the
  configuration onto the surviving provider, or delete the survivor. Nothing is deleted for you,
  because which one to keep is the whole question:

  ```ts
  providers: [
    provideAutoSpy(AccountService, { gettersToSpyOn: ['plan'], instanceMethodsToSpyOn: ['refresh'] }),
    provideAutoSpy(AccountService), // ← this is the one DI hands out
  ];
  ```

- **`noOverriddenProvider`:** two different providers; the later one wins. Keep the one you mean. The
  message gives the line of the winning provider.
- **`overriddenByTestBedOverride`:** a `TestBed.overrideProvider` for the same token replaces the
  provider. Delete the registration, or the override.

**When to disable.** `multi: true` providers are never reported: Angular collects all of them instead
of keeping the last. Nested `describe` overrides, overrides from a helper, and component-level
`providers` are not reported either (see below).

::: details How it decides
**One walk of the array, right to left.** The provider Angular keeps is the last one, so the first
registration met for a token survives, and everything met after it is dead. A token registered three
times reports the first two. Both shapes count as registrations: an object with a `provide` key, and a
call to `provideAutoSpy` / `provideAutoSpyForToken`.

**Tokens are compared as source text.** In a `providers` array a token is written once, by name, next
to its double. Two spellings of one token would be missed, and one spelling of two tokens would be a
false report; neither happens in practice.

**"Barer" is counted by option entries.** `provideAutoSpy(A, { gettersToSpyOn, instanceMethodsToSpyOn })`
scores 2 against a bare call's 0.

**The `TestBed.overrideProvider` case.** The registration is inside `configureTestingModule` and the
override is a later statement, so the rule collects both across the file and matches them at the end.
Order is not read: an override wins over a module provider whenever it runs. Three conditions keep it
narrow, each needed by a real project:

- **The same suite, compared by identity.** An override inside a nested `describe` replaces the
  provider only for that block. Every other test still gets the registration.
- **The override is written directly in a `beforeEach` / `beforeAll`,** so every test of the suite
  reaches it. One file overrides three tokens from a helper that 3 of its 34 tests call; for the other
  31 the registration is what ran.
- **Not a `providers` array under a decorator.** That array belongs to a component declared in the
  spec. Reaching a component-level provider is the documented use of `overrideProvider`.

A suite that calls `TestBed.resetTestingModule()` is exempt, as in
[`no-inject-before-override`](#no-inject-before-override). A registration the array already buried is
reported once, not twice.

**`multi: true`.** Angular **accumulates** multi providers, so a second one is not an override:

```ts
providers: [
  { provide: BEFORE_INIT, useValue: first, multi: true },
  { provide: BEFORE_INIT, useValue: second, multi: true }, // both run, in this order
];
```

A spec that asserts its hooks run in registration order needs both. `multi` is read as "present and
not written as `false`", so a flag the rule cannot resolve (`multi: isFeatureOn`) counts as multi. A
missed report costs nothing; a false one costs a disable comment over correct code. Mixing the two
modes for one token is still reported: Angular refuses that pair at run time with
`Cannot mix multi providers and regular providers`.

**Why it is recommended.** Both halves of the pair mislead. The author believes there is an auto-spy
and writes assertions for one (`calledWith`, a method the class has and the hand-written object does
not), while DI hands out the hand-written object. And whoever later migrates that object sees the
`provideAutoSpy` next to it and thinks the work is done. One spec file registered eight tokens both
ways at once. The result depends on the rest of the file: read the token back with `injectSpy` and
the run is red with [a diagnostic naming the cause](/adapters/angular); read it with `TestBed.inject`
and assert against the hand-written double, and everything passes while the `provideAutoSpy` never
ran.

The first field data (20 reports across an 8 673-file workspace) split in two: most were literal
duplicates, and the rest buried a configured provider under a barer one. That is why the messages
are split.

**Limits.** One array at a time, plus the override calls of the same suite. A token provided in
`configureTestingModule` and again in a component's own `providers` is a different problem;
[`assertNoShadowedProviders`](/adapters/angular-overrides) handles it. A `providers` array built by
concatenation, or a token spelled differently in two entries, is not compared. An override reached
through a helper is not matched; that keeps this case free of false reports.

**Why the duplicate edit is a suggestion.** A run that deletes lines of a `providers` array unattended
is not something to discover in a diff.

**Severity.** `error`. Green and wrong wherever the surviving double happens to answer. On one
project of 1759 spec files the override case reports 9 times in 5 files, each a configured
`provideAutoSpy(X, { … })` buried by a barer provider for the same token.
:::

## no-inject-before-override

**`error`** · no fix · syntax only

Reports a call that creates the testing module (`TestBed.inject()`, `injectSpy()`, `renderShallow()`
and others) inside a `beforeAll` or `beforeEach`, in a suite that also calls `TestBed.override*`. Once
the module is created, every `override*` throws.

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
  asSpy(TestBed.inject(Api)).load.mockReturnValue(of(page)); // ❌ the module is now instantiated
});

it('renders', () => {
  TestBed.overrideComponent(CartPage, { set: { imports: [] } }); // throws
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
});

it('renders', () => {
  TestBed.overrideComponent(CartPage, { set: { imports: [] } });
  injectSpy(Api).load.mockReturnValue(of(page)); // ✅ configured after every override
});
```

**Options.** None.

**How to fix.** Two ways, both in the message:

- Configure the spy inside the test, after every override, as above.
- Keep the access lazy, so the module is created in the first test:
  `const api = () => injectSpy(Api);`.

**When to disable.** The rule does not read order, so it also reports a suite where the order happens
to be fine. An example is an `override*` in a helper that is only called from a test that resets the
module first. The lazy access above silences the rule honestly.

::: details How it decides
**What creates the module:** `TestBed.inject`, `TestBed.createComponent`,
`TestBed.runInInjectionContext`, and this package's bare `injectSpy(…)` and `renderShallow(…)`.
**What overrides:** `overrideComponent`, `overrideDirective`, `overrideModule`, `overridePipe`,
`overrideProvider`, `overrideTemplateUsingTestingModule`, and this package's
`overrideComponentProvider`, which ends in `TestBed.overrideProvider`.

**Why order is not read.** Code order is not run order. An `override*` written above the hook, inside
a helper the tests call, still runs after the hook. So the rule asks "does this suite override at
all?", with one exception it can read from the source: an `override*` in the same hook body,
_before_ the injection, really does run first. A suite that calls `TestBed.resetTestingModule()` is
exempt: that is the documented way to reset the module.

**Inside `renderShallow`'s `beforeCreate`, order is read,** because that hook runs top to bottom before
the component is created. An `injectSpy` above an `overrideComponentProvider` (or any
`TestBed.override*`) in the same `beforeCreate` gets its own message, wherever the render sits. An
override inside the render's own `beforeCreate` runs before the render creates anything.

**Limits.** The `injectSpy` check matches a bare call only, so the two-argument
`injectSpy(moduleRef, token)` of `vitest-auto-spy/nestjs`, which reaches no `TestBed`, is not
reported.

**Why it is recommended.** Moving to `provideAutoSpy` leads people straight into this. A hand-written
`{ provide: X, useValue: { m: vi.fn(() => 1) } }` set its return values in the literal. Replace it
with `provideAutoSpy(X)`, as [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) asks, and there is
nowhere left to put them. The line lands in `beforeEach`, and every `override*` in the file fails with
`Cannot override provider when the test module has already been instantiated`. That includes an
override written _above_ the line, inside a `createComponent` helper the tests call. This was found
twice after migrations, once for sixteen tests at a time.

**Severity.** `error`. The run is red, and its message names the override instead of the hook that
broke it.
:::

## no-dead-schemas

**`error`** · no fix · syntax only

Reports `schemas` in `TestBed.configureTestingModule({ … })` when the file declares no components. A
schema only applies to the module's `declarations`. A standalone component brought in through
`imports` has its own scope, so the schema applies to nothing.

```ts
await TestBed.configureTestingModule({
  imports: [FooterComponent], // standalone, carries its own dependency scope
  schemas: [NO_ERRORS_SCHEMA], // ❌ applies to nothing
}).compileComponents();
```

```ts
await TestBed.configureTestingModule({
  imports: [FooterComponent], // ✅
}).compileComponents();
// then put the missing directive into the standalone component's own imports,
// or render it through createDirectiveHost({ template, scope: [...] })
```

**Options.** None.

**How to fix.** Delete the `schemas` entry. If something was unresolved, add the missing directive to
the standalone component's own `imports`, or render it through `createDirectiveHost`. Remove the
`NO_ERRORS_SCHEMA` import only when nothing else in the file uses it. Then run the file: a green lint
is not enough (see below).

**When to disable.** Not needed. Overrides are already out of scope: a schema added in
`TestBed.overrideComponent` or `overrideModule` is never reported.

::::: details How it decides
**The file decides, not the call.** Angular merges successive `configureTestingModule` calls before the
module is created, so `schemas` in one hook and `declarations` in another is one live configuration.
The rule collects every literal configuration and stays silent for the whole file once any of them
declares something. A list it cannot count (a spread, a name, a helper call) is read as _present_,
not empty; otherwise a live schema would be reported because the declarations came through a
variable. Only `TestBed.configureTestingModule` with an object literal is read.

**Overrides are out of scope on purpose,** and tests in this package pin it. A schema added there
makes up for a removal the spec made on purpose:

```ts
TestBed.overrideComponent(TicketQrCode, {
  remove: { imports: [QRCodeComponent] }, // draws on a canvas; jsdom cannot
  add: { schemas: [NO_ERRORS_SCHEMA] }, // so the element it left behind needs excusing
});
```

Take that schema away and the template stops compiling. Over one project, of 41 specs that combine an
override call with a schema, the rule reports none of the override blocks. On a standalone component,
a live schema shows up as interference with the component's own `imports` (`set: { imports: [] }`,
`set: { imports: [MockThing] }`, `remove: { imports: [X] }`), never as the module's `declarations`.

A `remove: { imports: … }` is **not** read as "this file declares something" either. In every such
file the module-level `schemas` was dead as well, and removing it left the specs green.

**Why it is recommended.** Nothing is silenced, so this is not a green-and-wrong test: whatever the
schema was added for is still unresolved. The cost is **a false sense of protection**.
`NO_ERRORS_SCHEMA` is the most common way to make `NG8001` go away, so a spec with it reads as
"unknown elements are excused here". The day somebody adds `declarations`, the same line starts
working, and a typo in a template quietly stops being an error. Over one Angular project: of 333
files mentioning a schema, **230 entries in 204 files** are dead.

It is the static twin of
[`enableAngularDiagnostics({ deadSchemas })`](/adapters/angular-diagnostics#deadschemas). The
diagnostic knows more (it can see that an `imports` entry really is a standalone component), but it
throws inside `it()`, so you get the list one red run at a time. The rule hands over all 204 files at
once, which is what a cleanup is planned from.

::: warning Check the removal with a run, not with a green lint
There is no autofix on purpose. Applied to one project, the rule cleaned **85 files and 107 entries
with no spec failing**. The one edit that went wrong went wrong silently: a `schemas:` line inside an
`overrideComponent` block was deleted along with the reported one, because the two lines read the
same. Six tests died on
`NG0303: Can't bind to 'collapsed' since it isn't a known property of 'present-button'`. Neither the
compiler nor ESLint said anything.
:::

**Severity.** `error`. Nothing breaks today; the rule lets you plan the cleanup once, instead of
finding it one template typo at a time.
:::::

## no-mistyped-use-value

**`error`** · no fix · **needs `parserOptions.project`**

Reports `{ provide: TOKEN, useValue }` when `TOKEN` is an `InjectionToken` of a primitive type and
the value does not fit that type. Angular types `useValue` as `any`, so nothing else checks it.

```ts
export const IS_PLATFORM_BROWSER = new InjectionToken<boolean>('IS_PLATFORM_BROWSER');

providers: [{ provide: IS_PLATFORM_BROWSER, useValue: {} }]; // ❌ compiles, and {} is truthy
providers: [{ provide: IS_PLATFORM_BROWSER, useValue: false }]; // ✅ the value the token declares
```

**Options.** None. The rule needs type information: `parserOptions.project` or `projectService`.

**How to fix.** Pass a value of the declared type. The message names the token and both types, for
example `IS_PLATFORM_BROWSER expects boolean, but useValue is {}`. Which value to pass is your
decision.

**When to disable.** Not needed. Object-typed tokens are out of scope on purpose: their `useValue` is
usually a partial fixture, and `createMock<T>()` is the typed tool for that. Their **keys** are
checked by [`no-unknown-use-value-key`](#no-unknown-use-value-key), which never compares values. A
class token (`provide: SomeService`) is left to [`prefer-provide-auto-spy`](#prefer-provide-auto-spy).

::: details How it decides
**Only the type checker decides.** The token's type must be named `InjectionToken`. Its type argument
is primitive-like when every member of the union is a string, number, boolean, bigint, an enum, a
literal of one of those, `null` or `undefined`. The checker is then asked whether the value's type is
assignable to it. Without a program, or on a TypeScript whose checker does not expose
`isTypeAssignableTo`, the rule says nothing rather than guessing. Only an object literal is read, so
`TestBed.overrideProvider(TOKEN, { useValue })` is not.

**Why it is recommended.** Whatever injects the token gets the value unchanged. An object where a
`boolean` is read is truthy, so the spec runs down the branch it meant to switch off, and still
passes. On one Angular monorepo: 259 providers of primitive-typed tokens across 179 spec files, 2 of
them mistyped, both this `{}` for a `boolean` token.

**Severity.** `error`. It decides on a fact: the checker says the value does not fit the declared
type. It is not in `configs.typeErrors`, because `useValue` is `any` and the finding compiles.
:::

## no-unknown-use-value-key

**`error`** · no fix · **needs `parserOptions.project`**

Reports each key of an object `useValue` that the provided type does not have. The provided type is
`T` for an `InjectionToken<T>`, or the instance type for a class. A misspelled or renamed key stays in
the fixture, the code reads the real member, and the spec stays green over a fixture nothing reads.

```ts
providers: [{ provide: ActivatedRoute, useValue: { queryParams$: of({ id: '1' }) } }]; // ❌ no such member
providers: [{ provide: ActivatedRoute, useValue: { queryParams: of({ id: '1' }) } }]; // ✅ the member the code reads
```

**Options.** None. The rule needs type information: `parserOptions.project` or `projectService`.

**How to fix.** Use the member's real name, or drop the key. The message names the key, the provided
type and the token. To have the compiler check the whole double, use
`provideAutoSpy(X, { overrides })`, `provideAutoSpyForToken(TOKEN, { … })` or `createMock<T>({ … })`.

**When to disable.** Not needed. The rule is silent where the type says nothing about keys: `any`,
`unknown`, `object`, `{}`, a primitive token (that is
[`no-mistyped-use-value`](#no-mistyped-use-value)'s case), an array, and any member with an index
signature, template-literal ones included.

::: details How it decides
**Keys only.** The provided type is split into its union members. `null`, `undefined` and other
primitive members are dropped. A key is known when any remaining member has a property of that name
(`getPropertyOfType`; private members and `Object.prototype`'s count). **Values are never compared.**
Whether `apiUrl: 42` fits a `string` is left out on purpose, because a `useValue` is normally a
partial fixture.

**Limits.** A spread adds no keys to the check, a computed key is skipped, and a `multi: true`
provider is left alone, because its value is one element of what the token hands out. Only a literal
written directly in `useValue` is read: not one behind a name, an `as`, or a
`TestBed.overrideProvider(X, { useValue })` descriptor. Without a program, or on a checker that lacks
`getPropertyOfType` / `getIndexInfosOfType`, it says nothing.

**Why it is recommended.** A project of about 1 760 spec files has about 870 object `useValue`
literals: 375 for class providers and 495 for tokens. A hand count over 434 class literals found two
keys the class does not have. One was `queryParams$` on `ActivatedRoute`, under a spec that passed.
Checking keys only keeps the findings at that level, instead of the hundreds a value check would
raise.

**Severity.** `error`. It decides on a fact: the checker says the type has no such member. It is not
in `configs.typeErrors`, because `useValue` is `any` and the finding compiles.
:::

## no-instance-lifecycle-spy

**`warn`** · no fix · syntax only

Reports `vi.spyOn(component, 'ngOnInit')` and the same for other lifecycle hooks, when the target is
an instance. Angular calls the hook it read from the class prototype when the component was created,
never a spy put on the instance later. So the assertion can never pass, and a stub never runs.

```ts
const fixture = TestBed.createComponent(CardComponent);
vi.spyOn(fixture.componentInstance, 'ngOnInit').mockImplementation(() => undefined); // ❌ never runs
fixture.detectChanges();
```

```ts
const init = vi.spyOn(CardComponent.prototype, 'ngOnInit').mockImplementation(() => undefined); // ✅
const fixture = TestBed.createComponent(CardComponent);
fixture.detectChanges();

expect(init).toHaveBeenCalledTimes(1);
```

**Options.** None.

**How to fix.** Spy on the prototype before the component is created, as above. Better still, assert
what the hook does instead of that it ran.

**When to disable.** An instance spy does work in two cases. The rule cannot tell them apart from one
file, so it is `warn`:

- the spec calls the hook itself, `component.ngOnInit()`, and then asserts on the spy;
- the injector destroys a **service** and calls its `ngOnDestroy` on the instance.

Use a per-line disable there.

::: details How it decides
**The call alone.** The rule reports `vi.spyOn(target, hook)` or `jest.spyOn(target, hook)` when
`hook` is a string literal naming `ngOnInit`, `ngOnDestroy`, `ngDoCheck`, `ngAfterContentInit`,
`ngAfterContentChecked`, `ngAfterViewInit` or `ngAfterViewChecked`, and `target` is not a prototype.
`X.prototype` and `Object.getPrototypeOf(x)` are prototypes and are left alone. `ngOnChanges` is not
on the list: Angular calls it as `this.ngOnChanges(changes)`, which does reach a spy on the instance.

**Why it is recommended.** `expect(component.ngOnInit).toHaveBeenCalled()` after
`fixture.detectChanges()` can never pass, and a `.mockImplementation` stub never runs. In one project,
the real `ngOnInit` kept running under a hook the spec believed it had stubbed.

**Severity.** `warn`: the rule decides on a guess, not a fact.
:::

## no-compile-components

**`error`** · suggestion · syntax only · **silent until `{ builder: 'inline-resources' }`**

Reports `compileComponents()` when your builder already inlines component templates and styles. The
call exists to fetch `templateUrl` / `styleUrls` at run time; under such a builder it waits for
nothing. The rule stays silent until you set the option.

```ts
beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [CardComponent] }).compileComponents(); // ❌ waits for nothing
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ imports: [CardComponent] }); // ✅
});
```

**Options.**

| Option             | Type                 | Default | Meaning                                                                             |
| ------------------ | -------------------- | ------- | ----------------------------------------------------------------------------------- |
| `builder`          | `'inline-resources'` | not set | says your builder inlines templates and styles; without it the rule reports nothing |
| `ignoreComponents` | `string[]`           | `[]`    | class names of components with a `@defer` block; a spec that names one is skipped   |

```js
'vitest-auto-spy/no-compile-components': ['error', { builder: 'inline-resources' }],
```

Builders that inline: the Angular CLI's test builders, `jest-preset-angular`, and this package's
[`bun-angular`](/runtimes/bun-angular) preload. Under a JIT setup that reads template files at run
time, the call is needed; do not set the option there.

**How to fix.** Delete the call. The suggestion does it. It drops the call, or the whole statement
when only `TestBed` is left. It also drops the `async` of a `beforeEach` / `beforeAll` / `afterEach` /
`afterAll` / `it` / `test` callback that awaits nothing else. It is offered only where the call is a
statement of its own. A `.then(…)` chain, a returned or stored promise, and a concise arrow body get the report
without an edit, because each uses the promise.

**When to disable.** Keep the call for a component whose template has a `@defer` block. Such a
component ships **async class metadata**, and `TestBed` resolves it in this very call, whatever the
builder did with the template. Without it the test fails:

```
Error: Component 'BackgroundContentComponent' has unresolved metadata.
Please call `await TestBed.compileComponents()` before running this test.
```

The rule cannot see this: the `@defer` is in the component's template, in another file. List those
components in `ignoreComponents`, which also suits a project that bans disable comments:

```js
'vitest-auto-spy/no-compile-components': ['error', { builder: 'inline-resources', ignoreComponents: ['CardComponent'] }],
```

Or keep the one call with a reason:

```ts
// eslint-disable-next-line vitest-auto-spy/no-compile-components -- @defer: async class metadata
await TestBed.compileComponents();
```

Also scope the option to the files the inlining builder compiles, if your project mixes builders.

::: details How it decides
**The option, then the call alone.** Once the option is set, the rule reports every
`….compileComponents()` call: on `TestBed`, on a `configureTestingModule(…)` chain, or on a name.
Whether the call does anything is a fact about the **build**, which no spec file shows. So the rule
waits for the option, the way the type-aware rules wait for a program.

**`ignoreComponents`.** A name is matched as a whole word anywhere in the spec, so a file that
imports the component to test something else is skipped too. The list is for the handful of `@defer`
components, not a catalogue.

**Why not narrow by the call's shape.** The files that broke happened to write
`await TestBed.compileComponents();` on its own line, not chained onto `configureTestingModule(…)`.
But that is a style difference, not evidence. A rule that skipped the standalone form would miss the
ordinary redundant call and still report a `@defer` spec written the chained way.

**Why it is recommended.** Not for speed: on a standalone AOT test bed the call costs 0.005 ms. It is
for what the line tells the next reader. Every hook that awaits it reads as "this spec loads templates
at run time", and every `async` it forces makes a synchronous setup look asynchronous. On one Angular
project of 1759 spec files the rule reports 449 calls in 411 files, 435 of them with the edit. On
another of 1862 spec files, 410 files call `compileComponents()`, and removing every call broke
exactly the `@defer` files.

**Why a suggestion and not `--fix`.** Dropping the `await` moves the next statement one microtask
earlier. The suggestion's own text also names the `@defer` exception, because a bulk edit reads that
text rather than the message.

**Severity.** `error`, and silent by default until you say which builder you have.
:::

## no-relative-mock-under-builder

**`error`** · no fix · syntax only · option `builder` · **silent until a builder runs the file**

Reports `vi.mock('./x')` and its relatives with a relative path, in a spec that the Angular
`@angular/build:unit-test` builder runs. The builder makes these calls throw on any path that starts
with `.` or `/`, and no builder option lifts that.

```ts
vi.mock('./cart.service'); // ❌ The "vi.mock" and related methods are not supported for relative imports
```

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(CartService)] }); // ✅
```

**Options.**

| Option    | Type          | Default | Meaning                                                                                  |
| --------- | ------------- | ------- | ---------------------------------------------------------------------------------------- |
| `builder` | `'unit-test'` | not set | says the unit-test builder runs these specs, when the rule cannot find the target itself |

```js
'vitest-auto-spy/no-relative-mock-under-builder': ['error', { builder: 'unit-test' }],
```

**How to fix.** Replace the dependency through `TestBed`, not through the module graph:
`provideAutoSpy(X)` in `providers`, or `overrideComponentProvider(Component, CartService)` for a
component's own provider. See
[A relative path is blocked, permanently](/guides/angular-unit-test-builder#a-relative-path-is-blocked-permanently).

**When to disable.** Not needed. A spec that only `npx vitest` runs may mock a relative path, and the
rule does not report it.

::: details How it decides
**What it reports:** `vi.mock`, `vi.doMock`, `vi.importMock`, `vi.unmock` or `vi.doUnmock` (on `vi` or
`vitest`) with a specifier that starts with `.` or `/`: a string, a static template literal, or
`import('…')`.

**Whether the builder runs the file.** The rule uses the same search as
[`no-redundant-mock-reset`](#no-redundant-mock-reset). It looks for an `@angular/build:unit-test` or
`@nx/angular:unit-test` target in `angular.json`, `workspace.json`, a `project.json`, or `nx.json`
`targetDefaults`, whose project contains the linted file. Where it finds none, it reports nothing.
Where the search cannot see your workspace, set `{ builder: 'unit-test' }`.

**Limits.** A tsconfig path alias (`@app/cart`) slips past the builder's check: no throw, and the mock
is silently ignored. It slips past this rule too, which does not read `paths`.

**Why it is recommended.** The line throws when the file is collected, and nothing lifts the guard.

**Severity.** `error`. Where it reports, the builder's own patch throws.
:::

## no-disabled-testbed-teardown

**`error`** · no fix · syntax only

Reports `destroyAfterEach: false`. With teardown off, a fixture outlives its test: `ngOnDestroy` never
runs, subscriptions and timers keep firing into later tests, and the DOM and memory grow with the
test run.

```ts
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
  teardown: { destroyAfterEach: false }, // ❌
});
```

```ts
getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting()); // ✅ Angular's default
```

**Options.** None.

**How to fix.** Delete the line; `true` is Angular's default since v13. Then fix the tests that fail:
they were reading a previous test's leftovers.

**When to disable.** Not needed. Note that a config scoped to `**/*.spec.ts` does not lint your setup
file. Add the setup file to this rule's `files`.

::: details How it decides
The rule reports `destroyAfterEach: false` wherever it is written: `initTestEnvironment` in a setup
file, or `teardown` on one `configureTestingModule`, quoted key included.

**Severity.** `error`. The literal is the evidence, and it is usually one line per project.
:::

## no-sync-testbed-await

**`error`** · suggestion · syntax only

Reports `await` in front of a TestBed call that returns the TestBed or a fixture, never a promise.
The `await` waits for nothing, and it makes the next reader look for an asynchronous setup that is
not there.

```ts
beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [CardComponent] }); // ❌ awaiting the TestBed
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ imports: [CardComponent] }); // ✅
});
```

**Options.** None.

**How to fix.** Remove the `await`, and the `async` of the callback if it now awaits nothing else. The
suggestion does both, for `beforeEach` / `beforeAll` / `afterEach` / `afterAll` / `it` / `test`.
Removing only the `await` would leave a hook that still looks asynchronous.

These TestBed calls really return a promise and keep their `await`: `compileComponents()`, and on a
fixture `whenStable()`, `whenRenderingDone()` and `getDeferBlocks()`.

**When to disable.** Not needed. `TestBed.inject(TOKEN)` and `TestBed.runInInjectionContext(fn)` are
never reported: each returns whatever the token or callback holds, which can be a promise.

::: details How it decides
**The calls:** `configureTestingModule`, `overrideComponent`, `overrideDirective`, `overrideModule`,
`overridePipe`, `overrideProvider`, `overrideTemplate`, `overrideTemplateUsingTestingModule` and
`resetTestingModule` return `TestBed` itself (that is what lets them chain). `createComponent` and
`getLastFixture` return the `ComponentFixture`. None is a thenable, so the rule needs no type
information.

**The receiver** can be `TestBed`, `getTestBed()`, a chain of those calls, or a name the file settles
to one of them. The rule walks the chain link by link, not just from its first word. Only members
that Angular declares as returning `TestBed` count as links. So `TestBed.inject(Api).createComponent(x)`
is not reported, even though it starts at `TestBed`: that `createComponent` is a collaborator's
method. A receiver the file cannot settle (a name assigned twice, a helper's return value) is left
alone.

**Why it is recommended.** The shape hides behind a call that really did return a promise. On an
Angular project of 1862 spec files, [`no-compile-components`](#no-compile-components) removed 448
`compileComponents()` calls from 410 files. Underneath were 18 `await`s on a value that was never a
promise, and 33 hooks left `async` with nothing to wait for. The cost is not the microtask. Every
reader takes an `await` as evidence that the setup is asynchronous.

The rule was then run over another project twice. Over its last commit (1759 spec files, 411 still
calling `compileComponents()`), it reports **14 times in 10 files**, each with the edit:
`await TestBed.resetTestingModule()`, and `configureTestingModule(…)` chains ending in
`overrideComponent` or `overrideProvider`. Over the same tree with the 448 calls removed and fixed, it
reports **nothing**. No false positive in 1759 files either way.

**Compared with `@typescript-eslint/await-thenable`.** That rule says "Unexpected `await` of a
non-Promise (non-"Thenable") value" and leaves you to work out why. It also needs
`parserOptions.project`, which not every project has. Run both and you get two reports on the same
line and column; either is one line of config away. The difference is the edit: the stock suggestion
removes the `await` and stops, so the hook stays `async`. `@typescript-eslint/require-await` then
reports it on the **next** run. It is silent before that, because the `async` function still contains
an `await`.

**Limits.** `TestBed.inject` and `TestBed.runInInjectionContext` are deliberately not reported; in the
project above, four `await TestBed.inject(…)` calls really do await a promise. Deciding those needs
the type checker, which is `await-thenable`'s job. A callback whose `async` the suggestion drops keeps
an explicit `: Promise<void>` return type if it had one, which then does not compile. That is why the
edit is a suggestion, like `no-compile-components`.

**Severity.** `error`. It decides on Angular's published signatures, not a guess, and the fix is
mechanical.
:::

## no-private-member-access

**`error`** · no fix · **needs `parserOptions.project`** for two of its three forms

Reports a spec that reads a `private` or `protected` member. The test then pins a member the class
never promised anyone: renaming it breaks only the test, and the test proves nothing about what a
caller can do.

```ts
expect(component['recalculate']()).toBe(3); // ❌
(component as any).recalculate(); // ❌
vi.spyOn(Object.getPrototypeOf(component), 'recalculate'); // ❌
```

```ts
component.onResize(); // ✅ the public call that reaches it
expect(component.total()).toBe(3); // ✅ and the effect it has
```

**Options.** None. Two of the three forms need type information: `parserOptions.project` or
`projectService`.

**How to fix.** Drive the member through the public API that uses it, and assert the effect.

- On a component, the rendered template is the public side that `protected` exists for:
  `renderShallow(Cmp)` and read the DOM.
- A `protected` signal a component passes to a child: render the child as a `createComponentStub` and
  read its input from the stub. A signal the spec has to drive: `mockSignalProp(component, 'x',
value)`, which reaches a `protected` signal.
- If nothing public reaches the member, the member should either be public, or move into a
  collaborator the spec can replace with a double.

There is deliberately no `readPrivate(instance, 'x')` helper: it would make legal exactly what the
rule is for.

**When to disable.** Without type information two of the three forms report nothing, which looks
exactly like a clean file. Run `npx eslint --print-config` on a spec before you conclude your specs
are clean. If a private member truly has no observable effect, a per-line disable that says why is
acceptable, and better than [`no-reflect-member-access`](#no-reflect-member-access)'s escape.

::: details How it decides
**Three forms:**

- `instance['member']`;
- `(instance as any).member`, and the double-cast and decoy-type variants:

  ```ts
  (service as any).privateMember;
  (service as unknown as { privateMember: T }).privateMember;
  (service as DecoyDeclaredInTheSpec).privateMember;
  ```

- `vi.spyOn(Object.getPrototypeOf(instance), 'member')`.

**The type checker is the rule.** The same brackets are normal and common:
`process.env['APP_FEATURE_ENABLED']`, `dataset['error']`, a route's `queryParams['id']`,
`req.headers['x-request-id']`, `form.controls['profileName']`, `errors?.['required']` are all index
signatures. So nothing is reported unless the checker resolves the name to a class member with one of
the two modifiers. Without type information the rule reports nothing, rather than falling back to
syntax: a type-aware rule that degrades to syntax is the noisy rule in disguise.

**How it resolves:**

- through the **object's type**, not through the element access itself, which answers nothing for
  `a['b']`;
- the member name comes from the **type** of the key, not the source text. `const KEY = 'secret';
card[KEY]` resolves like the inline string. `card[key]` where `key` is a plain `string` resolves to
  nothing and is an index read;
- the modifier is read as **text** from the TypeScript declaration. The ESTree `accessibility` field
  only covers the linted file, and the class under test is almost always declared in another file.
  A version built on it reported nothing on the real shape while passing every single-file test.

**Casts.** A **dotted** access is resolved only when a cast is in front of it. Without a cast the
compiler has already checked it, which also keeps the rule off every `a.b` in the file. A cast chain is
walked to the bottom: the middle of `service as unknown as { hidden: T }` is `unknown` and answers
nothing, so the rule reads the member from the expression that still carries the real type.

**The prototype form needs no types** and works without a program: `Object.getPrototypeOf` is typed
`any`, and reaching through it is unambiguous. It is also a worse double than it looks: it patches the
prototype, so every instance in the worker sees it, and only `vi.restoreAllMocks()` puts it back.

**Why it must read types, in numbers.** Over 1759 Angular spec files, a syntax-only version (every
`obj['literal']`) reports **511 sites in 85 files**. Of those, **324 in 45 files** resolve to a
`private` or `protected` member. The other **187 (37 %)** are correct code, and **41 of the 85 files
have no private access at all**. A plain grep is worse: about 1726 bracket reads for the same 324
findings. With the other two forms (50 casts in 10 files, 9 prototype spies), that is **383 findings
in 55 files**, 204 of them in two files.

**Why bracket access compiles.** It is not a loophole TypeScript forgot. Bracket access is how an
index signature is read, so the visibility check applies only to the dotted form.

**A crash the rule absorbs.** Asking the checker for a type also makes the compiler check the file,
and building one of its error messages can throw. On TypeScript 6.0.3, a message that names a symbol
from another module fails in `getLocalModuleSpecifier` when the program has neither `paths` nor
`baseUrl`. That is exactly the isolated program `@typescript-eslint/parser` falls back to in
single-run mode. The rule catches it and stays silent, because a rule that rethrows kills the whole
lint run and every other rule's findings.

**Severity.** `error`. Green and wrong in a way no run can report: a test that passes today and fails
on a rename no caller would notice.
:::

## no-reflect-member-access

**`error`** · suggestion on one of its three forms · syntax and scope only

Reports `Reflect.get(subject, 'member')` and `Reflect.set(subject, 'member', value)` with a string key,
where the subject is a value the spec holds: a component, a service, a fixture, a double. It is the
same escape as `component['x']`, but with a key that no compiler checks at all.

```ts
expect(Reflect.get(component, 'minDwellTime')()).toBe(0); // ❌ the key is a string nothing checks
Reflect.set(service, 'savedData', null); // ❌ and this does not even write the member
```

```ts
await setInputs(fixture, { seconds: 0 }); // ✅
expect(host.textContent).toContain('0 min'); // the public side the member exists for
```

**Options.** None.

**How to fix.** It depends on what the subject is. The message tells you which case you have:

- **The class under test:** drive the member through the public API, as in
  [`no-private-member-access`](#no-private-member-access).
- **A double this library built** (with `injectSpy`, `provideAutoSpy`, `provideAutoSpyForToken`,
  `createSpyFromClass` and the rest): use `mockValueProp(double, 'prop', value)`. It makes the same
  write and registers the undo with `restoreMockedProps()`. The suggestion writes it.
- **A fixture object the spec wrote:** put the key in the literal, where the compiler checks it. If
  the value is outside the declared type on purpose, to reach a fallback branch, cast the **value**:
  `{ linkType: value as Model['linkType'] }`. If your project bans type assertions
  (`@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`), use
  `mockValueProp(link, 'linkType', value)`: its loose overload accepts a value outside the declared
  type, and the write is undone after the test.
- **A private member with no observable effect at all:** `component['member']` under a
  `no-private-member-access` disable that says why is the lesser escape. The key stays where the
  compiler sees it.

**When to disable.** Not needed. A computed key is never reported (`Reflect.get(component, method)`
in a helper that takes the name as a parameter). Neither are `Reflect.apply`, `Reflect.has`,
`Reflect.deleteProperty` or `Reflect.construct`.

::: details How it decides
**The target.** A bare name must resolve to a declaration in the linted file that no `import` made.
Anything else, such as a member chain or a call result, is a value the file computed and counts as a
subject. A name the spec declares as `Window` or `typeof globalThis` (`let win: Window` holding an
injected `WINDOW`) is the environment under another name and is left alone, like `window`. A name an
`import` introduced is left alone too: a module namespace is nobody's subject, and patching one is
`vi.mock`'s job. A namespace the spec assigns to its own `let` through `await import(…)` is a local
binding and **is** reported. The key must be a string literal.

The rule asks no type checker, on purpose: this is the shape a project reaches for exactly where the
checker would have objected.

**Why it is recommended.** It is the second way around
[`no-private-member-access`](#no-private-member-access), and no compiler guards it.
`component['x']` at least keeps the member where a type-aware rule can resolve it.
`Reflect.get(component, 'x')` takes the name as an ordinary string argument typed `any`, so neither
the compiler, nor a template check, nor a strict `tsc` pass has an opinion. In the project this was
measured on, its own `no-restricted-syntax` ban on double casts named `Reflect.get` / `Reflect.set` as
the way out. The result: **214 sites in 50 of its 2 030 spec files**, 125 reads, 85 writes and 4 of
the double form.

**`Reflect.set` outlives what it tests.** It installs an **own** property over the prototype instead
of writing the member. Rename the field in production, and the spec still compiles, runs, and writes a
**dead** property nothing reads, while the `expect(spy).not.toHaveBeenCalled()` under it passes
forever. Two such sites were found in the measured project by reading, not running.

**The one edit.** `Reflect.set` on a library double patches it behind the library's back: no record,
no restore. The patch stays live for every later test of the file, and under `isolate: false` for
every later file of the worker. The fix is a suggestion rather than `--fix` for the same reason as
[`no-object-define-property`](#no-object-define-property): registering an undo changes what happens
between tests, which is the point, but still a change.

**Severity.** `error`, on purpose not lower than its twin. `no-private-member-access` is `error`; if
this rule were `warn`, `Reflect.get` would become the approved way to silence it. The evidence is all
in the line, and the fix is the one that rule names.
:::

## no-mocked-for-spy

**`error`** · `--fix` where the file settles it, suggestion otherwise · syntax only · in `configs.typeErrors`

Reports `Mocked<T>` or `MockedObject<T>` in any type position. `Mocked<T>` keeps `T`'s private
members, so assigning a spy to it fails to compile, with an error that lists private fields and never
mentions `Mocked`.

```ts
import { Mocked } from 'vitest';

let cart: Mocked<CartService>; // ❌ TS2322 once a spy is assigned
```

```ts
import type { Spy } from 'vitest-auto-spy';

let cart: Spy<CartService>; // ✅ what --fix writes
```

**Options.** None.

**How to fix.** Rename `Mocked` to `Spy`. `--fix` does it where it can prove the rename is the whole
edit; elsewhere your editor offers the same edit as a suggestion:

- **`--fix`:** an annotation on a parameter, a return type or a cast; and a variable whose every value
  comes from one of this library's factories: `asSpy`, `autoMocked`, `createAutoMock`, `createMock`,
  `createSpyClass`, `createSpyFromClass`, `injectSpy`, `mockConstructor`, `mockDeep`.
- **Suggestion:** a variable that also gets another value, such as an object literal. Accept it
  together with a fix at the creation site, usually `createAutoMock<T>()` instead of the literal.

The edit imports `Spy` when the name is free. It drops the `Mocked` import once nothing uses it: the
whole declaration when `Mocked` was the last name in it, otherwise just that name. With several
references, the import goes on the pass that rewrites the last one.

**When to disable.** Not needed. `Mocked<T>` next to `vi.mocked()` is left alone; the rule reports the
declaration whose assignment then fails. You get a report without an edit when:

- the file declares its own `Mocked` type (the message still names Vitest's);
- `Spy` already means something else in the file;
- the type argument is not a single named type: `Mocked<{ isKeyEnabled: Mock }>`. `Spy<T>` reads a
  class or an interface, and an object of `Mock`s asks a different question.

:::: details How it decides
**What it reads.** The identifier in a type reference, plus scope: whether the file declares its own
`Mocked` or `Spy`.

**Why the fix is narrow.** A declaration can be decided from the file; what the name is _assigned_ a
few lines below is a separate question. A real file showed the difference:

```ts
let register: Spy<Pick<Registry, 'metrics'>> & { contentType: string }; // ← what --fix wrote
register = { contentType: '…', metrics: vi.fn().mockResolvedValue(payload) }; // ← what it left
// TS2322: Type 'Mock<Procedure>' is not assignable to type
//   'AddSpyMethodsByReturnTypes<() => Promise<string>>'
```

`eslint --fix` reported clean, and the type check failed afterwards. That is the worst kind of
autofix failure: the rule's own check passes, so nothing points back at it. So the rule matches every
value the name gets (the initializer and every later assignment, by name). The plain fix is kept only
where each value comes from one of the library's factories, which already return a `Spy<T>`. The scan
is loose in one safe direction only: a same-named assignment in another scope can turn a fix into a
suggestion, never the reverse.

An annotation that belongs to no variable (a parameter, a return type, an `as` expression) has no
creation site in view and keeps the plain fix. This also stops `--fix` from rewriting a declaration
and leaving a cast below it still spelled `Mocked`.

**Why `--fix` is safe here at all.** The edit touches only a declaration. If it is wrong, the file
stops compiling, which is the loudest and cheapest failure there is.

**Why it is recommended.** The error names the class, not the mistake:

```text
TS2322: Type 'Spy<CartService, SpyOptions>' is not assignable to type 'Mocked<CartService>'.
        Type 'Spy<CartService, SpyOptions>' is missing the following properties
        from type 'CartService': http, cache
```

Nothing in it names `Mocked`, so the rule fixes the declaration instead of explaining the error.

**Two of Vitest's mock type names, and only two.** The dividing line is the type parameter, not the
spelling:

| type                                                                                         | parameter                              | verdict                                                                                                                  |
| -------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Mocked<T>`, `MockedObject<T>`                                                               | any `T`, mapped member by member       | **reported**: the whole-object double, which should be `Spy<T>`                                                          |
| `Mock<T>`, `MockInstance<T>`, `MockedFunction<T>`, `MockedFunctionDeep<T>`, `PartialMock<T>` | `T extends Procedure \| Constructable` | not reported: `T` is a _function_ type, so none can name a class; each types one `vi.fn()`, which is correct             |
| `MockedClass<T>`                                                                             | `T extends Constructable`              | not reported: a mocked class **constructor**; its counterpart here is `createSpyClass` / `mockConstructor`, not `Spy<T>` |
| `MockedObjectDeep<T>`                                                                        | any `T`, mapped deeply                 | not reported: the deep double here is `mockDeep<T>()`, typed `DeepMockProxy<T>`, not `Spy<T>`                            |

A project that types its doubles as `Mock` is not writing `Mocked<T>` another way. It is typing the
_members_ of a hand-built object type, and the shape worth reporting is that object type. That is
[`no-structural-double`](#no-structural-double). It is a separate rule because its finding
**compiles** (`let s: { load: Mock }` is legal), and everything in `configs.typeErrors` must be a
finding that does not.

**Severity.** `error`, and one of the two rules in `configs.typeErrors`. The finding does not compile
(`TS2322`, by construction), so "warn now, fix in batches" does not work: the build is already red.
::::

## prefer-as-spy

**`error`** · `--fix` · syntax only · in `configs.typeErrors`

Reports a cast to this library's `Spy<…>`, such as `TestBed.inject(X) as Spy<X>`. Under this library
that cast does not compile (`TS2352`). It is the most common compile error after moving an Angular
project off `jest-auto-spies`, which writes this line once per injected double.

```ts
const devices = TestBed.inject(DeviceListService) as Spy<DeviceListService>; // ❌ TS2352
```

```ts
const devices = asSpy(TestBed.inject(DeviceListService)); // ✅
const devices = injectSpy(DeviceListService); // ✅ the same, with the inject folded in
```

**Options.** None.

**How to fix.** Run `eslint --fix`. It rewrites the cast to `asSpy(…)`, imports `asSpy`, and drops a
`Spy` import the rewrite leaves unused. Type arguments are carried over:

```ts
// after --fix
import { asSpy } from 'vitest-auto-spy';

// before
hardwareService = TestBed.inject(DeviceListService) as Spy<DeviceListService>;

hardwareService = asSpy<DeviceListService>(TestBed.inject(DeviceListService));
```

**When to disable.** Not needed. The object _under test_ (a service the spec exercises, not a double)
should be typed as the class instead. The rule cannot tell the two apart, so it reports that cast
too. Where `asSpy` already names something else in the file, you get the report without an edit.

::: details How it decides
**What it reads.** A cast whose type is a reference spelled `Spy`, plus scope: a `Spy` the file
declares itself is somebody else's type, and the rule says nothing. Then the **value** the cast is
about:

- `x as Spy<T>` asserts that `x` _is_ the spy. The rewrite is exact.
- `x as unknown as Spy<T>` asserts the opposite: the hop through `unknown` is there because `x` and
  `T` are unrelated. `asSpy<T>(x)` would not type-check, so such a cast (for example
  `{} as unknown as Spy<CartService>`) is left alone; it wants a real double
  (`createAutoMock<T>()`), not a rename. One exception is fixed, hop and all:
  `TestBed.inject(X) as unknown as Spy<X>`. `TestBed.inject(X)` returns an `X` by construction, and
  the `as unknown` was only there to silence `TS2352`.

**Why `--fix` is safe.** The cast is your own claim that the value is a `Spy<X>`. `asSpy` is a typed
identity function, so the rewrite keeps that claim whole and changes only the spelling, at the type
level. Nothing about another file has to be known. A wrong fix fails to compile.

**Type arguments are carried over, not inferred.** `Spy<T, Options>` and `asSpy<T, Options>` take the
same parameters, so the line after the fix asserts exactly what the line before it did. That includes
`Spy<Cinemas, { overload: 'first' }>`, which inference would silently drop. Inference is also wrong on
a **generic** class: `TestBed.inject` returns `Service<any>`, and that `any` surfaces eight levels
down as a mismatch between `AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>`, with nothing
pointing at the spec.

**Why it is recommended.** `Spy<T>` adds `accessorSpies` and the per-method helpers, so neither type
overlaps the other enough, and the line fails with
`TS2352: Conversion of type 'X' to type 'Spy<X>' may be a mistake`. See
[the most common compile error a migrated Angular project produces](/migrating#reading-a-spy-back-out-of-the-container).
`asSpy` makes the same claim: the same object at run time, no cast.

**Why not part of `prefer-inject-spy`.** The two are neighbours, not the same.
[`prefer-inject-spy`](#prefer-inject-spy) reports a run-time defect whose fix is a provider in
another file. This rule reports a correct intention written in a way that no longer compiles, and
fixes it in place. Merging them would also make `meta.fixable` untrue, which ESLint reads per rule.

**Severity.** `error`, and the second rule in `configs.typeErrors`, for the same reason as
[`no-mocked-for-spy`](#no-mocked-for-spy): the finding is `TS2352`, so the build is already red.
:::

## no-ts-expect-error-on-double

**`error`** · no fix · syntax only

Reports `@ts-expect-error` or `@ts-ignore` above a double's configuration call, such as `nextWith`,
`mockReturnValue` or `calledWith(…)`. The one check a typed double gives you is that the stub matches
what the method declares. The directive switches it off for everything on the line.

```ts
// @ts-expect-error the spy picks the events overload, not the body the code reads
shelves.getShelf.nextWith(page); // ❌
```

```ts
let shelves: Spy<ShelvesClient, { overload: { getShelf: 'first' } }>; // ✅ the signature the code calls
shelves.getShelf.nextWith(page);
```

**Options.** None.

**How to fix.**

- **An overloaded method:** pick the signature with
  [`overload`](/core/spy-typing#overloads-parameters-reads-the-last-signature), as above.
- **No overload involved:** the fixture has the wrong shape. Check it against
  `ReturnType<X['method']>` (a `calledWith` argument against `Parameters<X['method']>`), and build a
  partial one with `createMock<…>()`.
- **A value outside the type on purpose,** for example an error object passed to `nextWith` to reach
  a default branch: wrap it in `outOfType<T>(…)` from `vitest-auto-spy`. It says so without a
  directive, and the rule does not report it:

```ts
reference.load.nextOneTimeWith(outOfType<Reference>(new HttpErrorResponse({ status: 500 })));
```

**When to disable.** If you keep the directive on purpose, say why in a per-line disable above it:

```ts
// eslint-disable-next-line vitest-auto-spy/no-ts-expect-error-on-double -- an error outside the union reaches the fallback
// @ts-expect-error
reference.load.nextOneTimeWith(new HttpErrorResponse({ status: 500 }));
```

::: details How it decides
**The calls:** `nextWith`, `nextOneTimeWith`, `nextWithValues`, `nextWithPerCall`, `resolveWith`,
`resolveWithPerCall`, `returnValue`, `mockReturnValue(Once)`, `mockResolvedValue(Once)`, `calledWith`
and `mustBeCalledWith`, called on a named method (`double.method.nextWith(…)`, or the same through a
`calledWith(…)` chain). The report sits on the directive.

**Comments and line numbers, read the way the compiler reads them.** The directive applies to the
line after the comment; a block comment is read from its last line. That line must be inside the
configuration call (the callee, or a fixture spread over several lines), but not inside a callback
passed to it, where the directive is about something else.

**Not read:** `rejectWith`, `failWith` and `throwWith` take `unknown`, so there is no stub shape to get
wrong. A double reached through a computed member, or a bare mock (`vi.fn().mockReturnValue(…)`),
names no method.

**A reason after the directive does not help.** The rule reports it anyway. A reason is where the
wrong diagnosis gets written down, and a codebase that requires one (as
`@typescript-eslint/ban-ts-comment` does by default) has one on every line.

**Why it is recommended.** On one Angular project of 1759 spec files: 34 directives in 15 files,
**every one with a reason**. Four sat on overloaded clients, which `overload` fixes. Seven blamed "the
collapsed generic" for a fixture that the real generic type rejects as well. Nineteen hid a fixture or
a production type that disagrees with the declared one. Four were deliberate.

**Severity.** `error`. It decides on a fact, a suppression over a double's configuration, and the one
right case has a one-line escape that records why.
:::

## no-jasmine-globals

**`error`** · no fix · syntax only

Reports the globals Jasmine's own runner installed, which nothing installs under Vitest: `jasmine.*`,
bare `spyOn(`, `spyOnProperty(`, `spyOnAllFunctions(`, `fail(`, `pending(`, and `.withContext(`. Most
of them fail loudly anyway. `spyOn` does not: renamed to `vi.spyOn`, it calls the real method instead
of replacing it.

```diff
- spyOn(analytics, 'track');        // jasmine: track() never runs
+ vi.spyOn(analytics, 'track');     // Vitest: track() runs on every call
```

```ts
vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // ✅ where the line meant "stub it"
provideAutoSpy(AnalyticsService); // ✅ better: stubs every method by construction
```

**Options.** None.

**How to fix.** Replace each global with its Vitest form. The message names it:

- `spyOn` that meant "stub it": `vi.spyOn(obj, 'm').mockImplementation(() => undefined)`, or
  `createSpyFromClass` / `provideAutoSpy`, which stub every method.
- `fail(…)`: `expect.fail(…)`.
- `jasmine.clock()`, reported per member: `install()` → `setupFakeTimers()`, `uninstall()` →
  `vi.useRealTimers()`, `tick(n)` → `await advanceTimers(ms)` (it also flushes the microtasks the
  timers queued), `mockDate(d)` → `mockSystemTime(date)`.
- A file that must run before you rewrite it can import `{ jasmine }` from `vitest-auto-spy/jasmine`.
  Its namespace forwards each member to the Vitest primitive.

For the bulk rewrite, run `npx vitest-auto-spy codemod --from jasmine`. See
[Migrating from jasmine-auto-spies](/migrating-jasmine).

**When to disable.** No need, even if you never used Jasmine: the rule cannot fire on code without
these names. Keep it on for an older Jest project too: before Jest 27, Jest ran on `jest-jasmine2`,
which installed `spyOn`, `fail` and `pending` as globals.

::: details How it decides
**A name, and whether the file has a binding for it.** A `jasmine` the file declares itself is left
alone. So is `import { spyOn } from 'bun:test'`: a different function with the same name, and the right
one on that runtime. The `jasmine.<member>` part is a lookup table. `createSpyObj` and `clock()` are
split off, because one report has to cover several calls: the clock message maps `install` /
`uninstall` / `tick` / `mockDate` at once.

**Why it is recommended.** Most of these globals fail on the first run with a `ReferenceError`. The
`spyOn` case does not. Jasmine's `spyOn` installs a **stub**; `vi.spyOn` **calls through**. The
rename compiles, the spec runs, and the code under test now really talks to its collaborator. That is
how a migrated project ends up making network calls, or passing on a value the real implementation
happened to return. `.withContext(` is in the same rule because
[Vitest's chai layer loses the message instead of throwing](/migrating-jasmine#withcontext-does-not-throw-it-loses-the-message).

**Severity.** `error`. One member of the set is green and wrong, and it is the most used one.
:::

## jasmine-namespace-without-entry

**`error`** · no fix · syntax only · option `setupModules`

Reports `.and`, `.calls` or `.withArgs` on a spy this file built, when the file never installs the
Jasmine compatibility layer. On a plain library spy `.and` is `undefined`, so the line throws with a
message that names neither the missing import nor the spy.

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const api = createSpyFromClass(Api);

api.load.and.returnValue(of(page)); // ❌ Cannot read properties of undefined (reading 'returnValue')
```

```ts
api.load.mockReturnValue(of(page)); // ✅ drop the namespace
```

```ts
import { createSpyFromClass } from 'vitest-auto-spy/jasmine';

// ✅ or install the layer
```

**Options.**

| Option         | Type       | Default | Meaning                                                                       |
| -------------- | ---------- | ------- | ----------------------------------------------------------------------------- |
| `setupModules` | `string[]` | `[]`    | setup modules that install the layer, for example a Vitest `setupFiles` entry |

```js
'vitest-auto-spy/jasmine-namespace-without-entry': ['error', { setupModules: ['./test-setup'] }],
```

**How to fix.** Use the spy's own API (`.mockReturnValue`, `.mock.calls`, `calledWith`), or import the
factory from `vitest-auto-spy/jasmine`, which installs `.and`, `.calls` and `.withArgs`. On a runtime
that cannot import that entry point, `enableJasmineCompat()` installs them.

**When to disable.** This rule can report a correct project: `enableJasmineCompat()` may run in a
Vitest `setupFiles` entry that no spec imports. Name that module in `setupModules`, and the rule stops
guessing. That is the fix, not a lower severity. Importing an entry point that cannot load the Jasmine
one (`vitest-auto-spy/bun`, `…/bun-angular`, `…/node`, `…/rstest`) also silences the file.

::: details How it decides
Whether the **project** installs the layer is not knowable from one file. So the rule only claims:
"this file uses a namespace on a spy **this file built**, and this file installs nothing". Three
narrowings make that answerable:

- **The receiver traces to one of this library's factories.** The walk goes down the member chain,
  because the namespace hangs off a _method_ of the double (`api.load.and.returnValue(…)`). A name is
  followed through every write, initializer included, since `let api: Spy<Api>` filled in a
  `beforeEach` is how most projects build their doubles.
- **An entry point that cannot load the Jasmine one silences the file:** `vitest-auto-spy/bun`,
  `…/bun-angular`, `…/node`, `…/rstest`. Those runtimes install the layer from a setup file, so
  reporting them would report the documented setup.
- **An `enableJasmineCompat()` call anywhere in the file silences it.** Reports wait until the whole
  file is read, because the call can sit below the first spy it equips.

`import type { Spy } from 'vitest-auto-spy/jasmine'` does **not** count: the compiler erases it, so it
installs nothing. A file that imports the type from the Jasmine entry and its factories from the core
one is exactly the shape the rule was written for.

**Two shapes are subtracted.** Anything under `.mock` is never a Jasmine namespace: `spy.mock.calls[0]`
is the runner's own record. A `.and` on a `withArgs(…)` call is reported at the `withArgs`, whose
message names the whole rewrite, so the chain does not produce two messages.

**Why it is recommended.** Red by construction, but the error sends you to look at the spy, not at the
missing import.

**Severity.** `error`, with an option for the one case where the rule is wrong about the project. A
warning nobody reads is no safety margin when the real fix is one option away.
:::

## no-save-arguments-by-value

**`error`** · no fix · syntax only

Reports `spy.calls.saveArgumentsByValue()`. Here it does nothing: Vitest, Bun and `node:test` keep a
reference to each argument, not a copy. The spec then asserts on whatever the code changed the object
to later, not on what was passed.

```ts
spy.calls.saveArgumentsByValue(); // ❌ a no-op; the arguments are still the same reference
expect(spy.calls.argsFor(0)[0]).toEqual({ status: 'pending' });
```

```ts
const seen: Payload[] = [];

spy.mockImplementation((payload) => {
  seen.push(structuredClone(payload)); // ✅ copy at the call site
});

expect(seen[0]).toEqual({ status: 'pending' });
```

**Options.** None.

**How to fix.** Copy the argument when the call happens, as above. `captureArg<T>()` lets you _reach_
an argument, but it keeps the same reference, so it does not fix the mutation.

**When to disable.** No need: the rule cannot fire unless your code came from Jasmine.

::: details How it decides
**The member chain alone:** a `.calls` namespace read through to a `saveArgumentsByValue(…)` call,
wherever `.calls` hangs off. No other API uses that name.

**Why it is a no-op.** Jasmine copies every call's arguments defensively. Vitest, Bun and `node:test`
keep the reference. Copying every argument of every call to match would slow down every spy in every
project.

**Why it is recommended.** Nothing throws, and that is the problem. The spec asked for the arguments
_as they were passed_. After the move it reads whatever the code under test left in that object, so
an assertion about the state at call time silently becomes one about the state at assertion time. It
passes or fails on a value nobody wrote. No diff, no warning, no failing run points at it. It is the
purest silent case in the plugin.

**Severity.** `error`. Green and wrong with no signal of any kind.
:::

## prefer-native-spy-api

**`error`** · `--fix` where the receiver is traceable, suggestion otherwise · syntax only

Reports a `.and` or `.calls` call that the spy's own API says directly. This is working code from the
Jasmine compatibility layer; the rule is the tool that finishes the migration.

```ts
api.load.and.returnValue(of(page)); // ❌ the compatibility layer speaking
api.load.calls.count();
api.load.withArgs(7).and.returnValue(of(other));
```

```ts
api.load.mockReturnValue(of(page)); // ✅
api.load.mock.calls.length;
api.load.calledWith(7).mockReturnValue(of(other));
```

**Options.** None.

**How to fix.** Run `eslint --fix`. It rewrites these, when the spy traces to one of this library's
factories:

| Jasmine                                | Native                              |
| -------------------------------------- | ----------------------------------- |
| `.and.returnValue(x)`                  | `.mockReturnValue(x)`               |
| `.and.callFake(f)`                     | `.mockImplementation(f)`            |
| `.and.nextWith(v)` and 9 other helpers | `.nextWith(v)` and so on            |
| `.withArgs(a).and.returnValue(v)`      | `.calledWith(a).mockReturnValue(v)` |
| `.calls.count()`                       | `.mock.calls.length`                |
| `.calls.reset()`                       | `.mockClear()`                      |
| `.calls.argsFor(i)`                    | `.mock.calls[i]`                    |

The ten delegated helpers are `nextWith`, `resolveWith`, `rejectWith`, `throwWith`, `complete`,
`returnSubject`, `nextWithValues`, `nextOneTimeWith`, `nextWithPerCall` and `resolveWithPerCall`.

Elsewhere the same edit is a suggestion: a `.calls` on someone else's object is someone else's method.
A rewrite that would delete a comment (`.and /* x */ .returnValue`, or a comment inside
`.calls.argsFor(…)`) is also a suggestion, even on a library spy, and says it drops the comment.

For the whole project in one pass, including what the rule does not rewrite, run
`npx vitest-auto-spy codemod --from jasmine`. See [Migrating from jasmine-auto-spies](/migrating-jasmine).

**When to disable.** While you migrate. On day one it fires on every line of the compatibility layer,
so turn it off until the tests are green:

```js
{ rules: { 'vitest-auto-spy/prefer-native-spy-api': 'off' } } // until the suite is green
```

Delete that line for the last mile. A silent run does not mean the layer is gone: `.and.callThrough()`
and `.calls.all()` are not reported. The honest check is whether you can delete the
`vitest-auto-spy/jasmine` import.

::: details How it decides
**A closed table of rewrites.** Each stays inside one call expression and keeps the receiver:

- two renames: `.and.returnValue` → `.mockReturnValue`, `.and.callFake` → `.mockImplementation`;
- ten delegated helpers, where `.and` only re-exposes something already on the spy;
- three bookkeeping calls: `.calls.count()`, `.calls.reset()`, `.calls.argsFor(i)`;
- a `withArgs(…)` receiver folds in: `spy.withArgs(a).and.returnValue(v)` →
  `spy.calledWith(a).mockReturnValue(v)`.

**Not in the table,** because no rename says the same thing:

- `.and.returnValues`, `.and.callThrough`, `.and.stub`, `.and.throwError`, `.and.resolveTo`;
- `.calls.mostRecent()` and `.calls.all()`: the native form is not one expression;
- `.calls.argsFor()` without an index: `mock.calls[undefined]` is not what the line meant.

**An optional link leaves the chain alone.** The replacement is built from the receiver's source text
plus a member name, so `spy?.and.returnValue(1)` would become `spy.mockReturnValue(1)`: the same call
with the guard silently removed.

**Why `--fix` only on a traceable spy.** The fix renames only the member (`and.returnValue` →
`mockReturnValue`, `withArgs` → `calledWith`), so the receiver, arguments and comments stay as
written. On a spy that does not trace to a library factory, `.calls.count()` may be someone else's
API.

**Why it is `error`.** It reports working code, so it differs from every other rule: it finishes a
migration. Most projects are not mid-migration, and those that are need one line. Shipping it `off`
and asking finished projects to turn it on would make it a rule nobody ever enables.
:::

## Related

- [ESLint plugin](/utilities/eslint-plugin): setup, the `files` glob, and how to add the plugin to a
  large existing project without a red CI.
- [Editor diagnostics](/utilities/editor-diagnostics): the same findings in your editor.
- [CLI: the codemod](/utilities/codemod): the bulk rewrite that the two Jasmine `--fix` rules finish.
- [Angular diagnostics](/adapters/angular-diagnostics): the run-time twin of
  [`no-dead-schemas`](#no-dead-schemas).
