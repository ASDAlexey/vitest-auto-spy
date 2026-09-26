---
title: ESLint rules
description: A reference section for each of the forty-nine rules — what it reports, what it decides on, why it is in recommended, where it reports working code, and why its severity is what it is.
---

# ESLint rules

One section per rule, with a stable anchor, so a config can point at the rule it turns down:

```js
// eslint.config.js
{
  // https://asdalexey.github.io/vitest-auto-spy/utilities/eslint-rules#no-bare-called-with
  'vitest-auto-spy/no-bare-called-with': 'error',
}
```

**This is not the setup page.** [ESLint plugin](/utilities/eslint-plugin) is how the plugin is
wired in — the config block, the `files` glob, the recipe for landing it on a large suite without a
red CI, tables that give each rule one line, and [what the whole plugin costs to
run](/utilities/eslint-plugin). This page is the other half: for a report that has already arrived,
what the rule decided on, when it stays silent, and where it is wrong about your project. Nothing
here has to be read in order.

**The message and this page split the work.** A message names what the rule found in your file —
the class, the token, the member, the call — says in one sentence why it breaks, and gives the one
repair that fits. It ends with `Docs:` and the link to the rule's section below, which is also the
rule's `meta.docs.url`, so an editor links it from the rule name. Everything longer — the other
repairs, the cases the rule cannot see, the measurements — is in that section.

Every section answers the same six questions:

- **Reports** — what counts as a finding.
- **Decides on** — the evidence: the shape of the AST, a name, the whole file, or the type checker.
  This is what tells you when the rule will stay quiet and when it will be wrong.
- **Finding, and the repair** — one shape, before and after.
- **Why it is recommended** — the concrete failure a suite gets without it. Not "this is tidier".
- **Limits** — where it reports working code, and what quiets it.
- **Severity** — and why that one.

<!-- The id is frozen on purpose: configs already point at #the-twenty-five-rules. Keep it when the rule count changes. -->

## The forty-nine rules {#the-twenty-five-rules}

Grouped by subject, the same grouping the [setup page](/utilities/eslint-plugin) uses. Every rule is
an `error` except eight.

| Rule                                                                  | In `recommended` | Reports                                                                                          |
| --------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| [`no-expect-in-subscribe`](#no-expect-in-subscribe)                   | `error`          | `expect()` inside a `subscribe` callback — it runs only if the stream emits                      |
| [`no-vacuous-absence-assertion`](#no-vacuous-absence-assertion)       | `error`          | a test whose every assertion a stream that never emits already satisfies                         |
| [`no-floating-assertion`](#no-floating-assertion)                     | `error`          | `expect()` in a `.then()` chain nothing awaits                                                   |
| [`no-done-callback`](#no-done-callback)                               | `error`          | a first parameter that is called, passed on or unused, and `done.fail(…)` beneath it             |
| [`no-bare-called-with`](#no-bare-called-with)                         | `error`          | `calledWith(…)` / `mustBeCalledWith(…)` as a statement of its own                                |
| [`no-constant-expect`](#no-constant-expect)                           | `error`          | `expect(true).toBe(true)` — a value spelled out in the spec, under a matcher it decides          |
| [`no-redundant-smoke-test`](#no-redundant-smoke-test)                 | `error`          | a test whose whole body asserts the subject exists, beside tests that already run its setup      |
| [`no-self-called-spy`](#no-self-called-spy)                           | `error`          | a test that calls the spied method itself and then asserts that it was called                    |
| [`prefer-settle-dynamic-import`](#prefer-settle-dynamic-import)       | `error`          | `await import('…')` in a test body — it waits for the module, not for the code under test        |
| [`no-unasserted-argument`](#no-unasserted-argument)                   | `warn`           | a bare `toHaveBeenCalled()` where the file itself shows the arguments are what the test is about |
| [`prefer-create-mock`](#prefer-create-mock)                           | `warn`           | an object literal under `as SomeType` — a cast passes an excess key and a missing one            |
| [`no-mock-cast`](#no-mock-cast)                                       | `error`          | `TestBed.inject(S).m as Mock` — `Mock` is `Mock<any>`, so the arguments stop being compared      |
| [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)       | `error`          | an object literal of two or more `vi.fn()`s                                                      |
| [`no-stub-class-double`](#no-stub-class-double)                       | `warn`           | a class whose fields are `vi.fn()`s — the same double with a `new` in front of it                |
| [`no-structural-double`](#no-structural-double)                       | `warn`           | an object of `vi.fn()`s bound to a name declared as an object of Vitest `Mock`s                  |
| [`prefer-spy-on-own-method`](#prefer-spy-on-own-method)               | `warn`           | a `createSpyFromInstance` that spies one method and is read for it alone                         |
| [`no-shared-module-level-mock`](#no-shared-module-level-mock)         | `error`          | an **exported** value that builds `vi.fn()`s while the module loads                              |
| [`no-object-define-property`](#no-object-define-property)             | `error`          | `Object.defineProperty` / `defineProperties` in a spec                                           |
| [`no-import-time-spread`](#no-import-time-spread)                     | `error`          | a spread of an imported binding evaluated at module scope                                        |
| [`prefer-observer-stub`](#prefer-observer-stub)                       | `error`          | an observer global replaced by hand or through the runner                                        |
| [`no-hand-assigned-global`](#no-hand-assigned-global)                 | `error`          | `global.fetch = vi.fn()`, `environment.x = …` — a value no teardown puts back                    |
| [`prefer-stub-response`](#prefer-stub-response)                       | `error`          | an object literal cast to `Response`, or `createMock<Response>(…)` — half a response             |
| [`no-redundant-mock-reset`](#no-redundant-mock-reset)                 | `error`          | a mock reset in a hook the runner already performs between tests                                 |
| [`prefer-provide-activated-route`](#prefer-provide-activated-route)   | `error`          | an `ActivatedRoute` provided as a hand-built object, class or factory — half a route             |
| [`no-passthrough-console-spy`](#no-passthrough-console-spy)           | `error`          | `vi.spyOn(console, m)` nothing gives an implementation — it calls through and prints             |
| [`no-console-in-spec`](#no-console-in-spec)                           | `error`          | a spec that calls a console method, or replaces one by assignment                                |
| [`no-import-time-console-spies`](#no-import-time-console-spies)       | `error`          | an import of `vitest-auto-spy/console` in a file that never calls `installConsoleSpies()`        |
| [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)                 | `error`          | a provider that hand-rolls a service double, or spells `provideAutoSpy` out                      |
| [`prefer-inject-spy`](#prefer-inject-spy)                             | `error`          | `vi.spyOn` over the instance `TestBed.inject` handed back                                        |
| [`no-unregistered-inject-spy`](#no-unregistered-inject-spy)           | `error`          | `injectSpy(X)` for a token this file never registered as an auto-spy                             |
| [`prefer-render-shallow`](#prefer-render-shallow)                     | `warn`           | `TestBed.createComponent` in a file that never reads the rendered template                       |
| [`prefer-set-inputs`](#prefer-set-inputs)                             | `warn`           | a run of `fixture.componentRef.setInput(…)` — a name Angular checks against nothing              |
| [`no-overridden-provider`](#no-overridden-provider)                   | `error`          | a provider a later one, or a `TestBed.overrideProvider`, replaces                                |
| [`no-inject-before-override`](#no-inject-before-override)             | `error`          | an injection in a hook, in a suite that still calls `TestBed.override*`                          |
| [`no-dead-schemas`](#no-dead-schemas)                                 | `error`          | `schemas` on a testing module that declares nothing                                              |
| [`no-mistyped-use-value`](#no-mistyped-use-value)                     | `error`          | a `useValue` that does not fit the primitive type its `InjectionToken` declares                  |
| [`no-unknown-use-value-key`](#no-unknown-use-value-key)               | `error`          | a key of an object `useValue` the provided type does not have — keys only                        |
| [`no-instance-lifecycle-spy`](#no-instance-lifecycle-spy)             | `warn`           | `vi.spyOn(component, 'ngOnInit')` — a hook spy Angular never calls                               |
| [`no-compile-components`](#no-compile-components)                     | `error`          | `compileComponents()` under a builder that inlines resources — silent until told so              |
| [`no-sync-testbed-await`](#no-sync-testbed-await)                     | `error`          | `await` on a TestBed call that answers the TestBed or a fixture, never a promise                 |
| [`no-private-member-access`](#no-private-member-access)               | `error`          | a `private` / `protected` member reached through brackets, a cast, or the prototype              |
| [`no-reflect-member-access`](#no-reflect-member-access)               | `error`          | `Reflect.get` / `Reflect.set` on a subject the test holds — a key no compiler checks             |
| [`no-mocked-for-spy`](#no-mocked-for-spy)                             | `error`          | `Mocked<T>` in a type position where the value is a spy                                          |
| [`prefer-as-spy`](#prefer-as-spy)                                     | `error`          | `TestBed.inject(X) as Spy<X>` — a cast that no longer compiles                                   |
| [`no-ts-expect-error-on-double`](#no-ts-expect-error-on-double)       | `error`          | `@ts-expect-error` / `@ts-ignore` above a double's `nextWith`, `mockReturnValue`, …              |
| [`no-jasmine-globals`](#no-jasmine-globals)                           | `error`          | `jasmine.*`, bare `spyOn(` / `fail(` / `pending(`, and `.withContext(`                           |
| [`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry) | `error`          | `.and` / `.calls` / `.withArgs` in a file that installs the compatibility layer nowhere          |
| [`no-save-arguments-by-value`](#no-save-arguments-by-value)           | `error`          | `spy.calls.saveArgumentsByValue()` — a no-op here                                                |
| [`prefer-native-spy-api`](#prefer-native-spy-api)                     | `error`          | `.and` / `.calls` where the spy's own API says the same thing                                    |

Six of them have options: [`prefer-create-spy-from-class`](#prefer-create-spy-from-class),
[`no-stub-class-double`](#no-stub-class-double) and
[`no-structural-double`](#no-structural-double) (`minRunnerFns`),
[`prefer-render-shallow`](#prefer-render-shallow) (`templates`),
[`no-compile-components`](#no-compile-components) (`builder`, without which it reports nothing) and
[`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry) (`setupModules`). Three of them
read types: [`no-private-member-access`](#no-private-member-access),
[`no-mistyped-use-value`](#no-mistyped-use-value) and
[`no-unknown-use-value-key`](#no-unknown-use-value-key). Two are also shipped as
`configs.typeErrors`, because their findings do not compile:
[`prefer-as-spy`](#prefer-as-spy) and [`no-mocked-for-spy`](#no-mocked-for-spy).

## no-expect-in-subscribe

**`error`** · suggestion · syntax only

**Reports.** An `expect()` that runs only if a stream emits — anywhere inside a `subscribe(…)`
callback, including assertions the callback reaches through a helper.

**Decides on.** Two selectors and a tally. Every `expect(…)` under a `…subscribe(…)` call counts,
and so does every call of a plain name under one: that name is resolved through the scope manager to
a function declared in the same file, and the `expect`s in its body are counted too — one step, no
type information. A helper declared _inside_ the callback is skipped, because the first selector has
already counted it. The reports are grouped per `subscribe` and emitted at `Program:exit`, so a
callback with four assertions is one message rather than four; one file of a real migration went
from 44 messages to 23 that way.

Which of three messages you get is also syntactic, and the three are three different edits:

- **`inErrorHandler`** — the assertion sits in the failure branch, positional (`subscribe(next, error)`)
  or named (`subscribe({ error })`).
- **`afterTrigger`** — another statement follows the one holding the `subscribe` in the same block.
  That statement is usually what makes the stream emit (`req.flush(payload)`, `subject.next(…)`),
  and inverting the subscription would deadlock.
- **`invertible`** — neither, so the subscription is the last thing the test does.

**Finding, and the repair.**

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
it('maps the products', async () => {
  const products = await firstValueFrom(service.getProducts(id));

  expect(products).toEqual(expected);
});
```

That exact frame — `it(name, () => new Promise((done) => …))` — accounted for 111 of the 133
findings in one batch of 22 migrated files, so it comes with a suggestion that writes the rewrite,
picking `firstValueFrom` for a `next` handler and `lastValueFrom(src, { defaultValue: undefined })`
for a `complete` one, and adding the rxjs import. It is never a `--fix`: the rewrite is equivalent
only while the assertions are the whole of what the callback does, and a wrong rewrite here leaves a
test that still passes, which is the failure the rule exists to catch.

**Why it is recommended.** A subscription that never fires is the purest green-and-wrong test there
is: [four assertion forms against four stream behaviours](/core/observable-assertions), all four
green when the stream emits nothing. Nothing in the run mentions it — no unhandled rejection, no
warning, no skipped test.

**Limits.** It reports the shape, not the mistake, so a spec that subscribes to a stream it has
already proved emits gets a report too — a `BehaviorSubject`, a `of(…)`, a `ReplaySubject` filled in
the same test. Those are worth rewriting anyway, because the assertion reads the same either way,
but a per-line disable is the honest answer where the subscription is the subject of the test (an
unsubscribe assertion, a multicast count). The suggestion declines every shape it cannot promise:
an executor that does anything besides subscribing, a `subscribe({ next, complete })` with two
handlers, a test callback that takes the Vitest context, a `done` mentioned more than once.

**What the message leaves out.** It quotes the source the subscription reads and names one repair per
branch. The rest: a stream that emits more than once, every emission of which was meant to be
checked, is `expectEmissions(source$, N)`; `afterTrigger` puts `expectEmission` first because it
subscribes when it is called, not when it is awaited; and in `inErrorHandler` a
`next: () => expect.unreachable(…)` guard beside the `error` callback goes too, because
`await expect(firstValueFrom(source$)).rejects.toMatchObject({ status: 404 })` already fails when the
stream succeeds.

**Severity.** `error`. The finding is a test that passes while asserting nothing, and the repair is
mechanical for most of the population.

## no-vacuous-absence-assertion

**`error`** · no fix · syntax and scope only

**Reports.** A test in which **every** assertion holds on the state "nothing happened" — where the
value under assertion is a variable the test declared and only a `subscribe` callback writes, or a
`vi.fn()` the test hands straight to `subscribe`.

**Decides on.** Three facts, all of them in the file.

- **The carrier.** A `const` / `let` declared inside this test whose every write, the declaration
  aside, sits inside a `subscribe` callback of the same test — the assignment form
  (`subscribe((r) => (chips = r))`) and the `push` form (`subscribe((r) => seen.push(r))`) both
  count — or a name bound to `vi.fn()` that the test hands to `subscribe` and calls nowhere itself.
- **What silence leaves there**, read as the source text of the initialiser (`'undefined'` for a
  `let` with none). An equality matcher repeating that text (`let chips = []` …
  `expect(chips).toEqual([])`) holds on silence; so do `toBeUndefined` / `not.toBeDefined` where the
  declaration holds `undefined`, `toBeNull` where it holds `null`, `toBeFalsy` / `not.toBeTruthy`
  where it holds any falsy literal, `toHaveLength(0)` where it holds `[]` or `''`, and
  `not.toHaveBeenCalled` / `not.toHaveBeenCalledWith` / `toHaveBeenCalledTimes(0)` on any subject.
  This is deliberately literal rather than by matcher family: `toBeNull()` on a `let` with no
  initialiser does fail on silence, and is not reported.
- **That nothing else in the test could fail.** Every other `expect()` in the test is weighed the
  same way, and a single one that a silent source could fail silences the rule. So does a call to
  this library's `expectEmission`, `expectEmissions`, `expectCompletion` or `expectError`, each of
  which times out on a source that never emits or completes.

**Finding, and the repair.**

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
  await expectNoEmission(load$(quickLinks));

  expect(catalog.getSectionById).not.toHaveBeenCalled();
});
```

…when silence is the claim, or [`expectEmission`](/core/observable-assertions) when the empty list
is:

```ts
expect(await expectEmission(load$(quickLinks))).toEqual([]);
```

**Why it is recommended.** Proved by mutation, twice, on a 2 030-file Angular suite. Replacing the
production source of the file above with one that never emits failed three of its siblings and left
this test green; the same swap in a promo-banner service failed four tests and left two, both of
this shape. Two tests further down that same file capture into `let chips: … | null = null`
and assert `toEqual([])`, which _does_ fail on silence — the author knew the idiom and did not apply
it everywhere, which is what a linter is for. On that suite the rule reports **39 times across 33
files**, 22 of them a written capture and 17 a `vi.fn()` handed to `subscribe`.

It is the other half of [`no-expect-in-subscribe`](#no-expect-in-subscribe): that one reports the
assertion a silent stream never reaches, this one the assertion a silent stream satisfies.

**Limits.** A test that also asserts something positive is never reported, even where one of its
lines is vacuous — the strongest single site on the consumer is a `let result: void | undefined`
capture beside three `toHaveBeenCalledWith` assertions, and it stays silent. Only `expect()` counts
as an assertion, so `assert.exists(…)` and an awaited `expectCompletion(…)` do not hold the rule
off. A test that reaches its assertions through a helper of its own is skipped entirely, since the
rule cannot weigh what the helper asserts. A chain it cannot read to the end — `resolves`,
`rejects`, a matcher taken as a value — counts as an assertion that can fail, which can only make
the rule quieter.

**Severity.** `error`. The evidence is the declaration and the matchers, both in the file; the
finding is a test that proves nothing about the source it names; and the repair is one test at a
time, not a migration. It does not arrive at zero on a large suite, and that is the same position
[`prefer-settle-dynamic-import`](#prefer-settle-dynamic-import) ships in: which findings block a
merge stays one line of config.

**No fix, and no suggestion.** The repair is not an edit at the reported node. It deletes the
declaration, replaces the subscription with an awaited helper, drops the assertion, makes the
callback `async` and adds an import — five coordinated edits — and `expectNoEmission` asserts
something _stronger_ than the line it replaces, so a wrongly accepted suggestion turns a green test
red with a message about the helper rather than about the code. The message names the repair
instead, which is what [`prefer-stub-response`](#prefer-stub-response) does for the same
reason.

## no-floating-assertion

**`error`** · no fix · syntax only

**Reports.** An `expect()` inside a `.then()` / `.catch()` / `.finally()` callback whose chain is a
bare expression statement — nothing awaits it, returns it, stores it or passes it on.

**Decides on.** The walk _up_ the chain, which is the whole of the check. In `p.then(a).catch(b)`
the parent of `p.then(a)` is a member expression, so only the last call in the chain has a parent
that says whether anything consumes the promise; reading the immediate parent would clear the first
callback of every chain that has a second one. The `expect` has to sit in the **immediately**
enclosing callback: one nested callback deeper the advice stops being true, because awaiting the
chain revives an assertion in the `.then()` body and not one parked in a `setTimeout` inside it.
A computed method name (`p[settle](…)`) is not knowably a promise callback and is left alone.

**Finding, and the repair.**

```ts
it('compiles', () => {
  TestBed.compileComponents().then(() => expect(fixture.componentInstance).toBeTruthy()); // ❌
});
```

```ts
it('compiles', async () => {
  await TestBed.compileComponents();

  expect(fixture.componentInstance).toBeTruthy();
});
```

**Why it is recommended.** The callback runs after the test that wrote it has finished, so the
assertion cannot fail it. What the run then says depends on the environment, and neither answer
names the test: zoneless, an `Unhandled Rejection` and exit 1 with no test named; under zone.js the
rejection is drained into `console.error`, and of two rejections one vanishes entirely.

**Limits.** It reports only what awaiting actually fixes, so the deferred-callback shapes are left to
[`no-expect-in-subscribe`](#no-expect-in-subscribe) and to
[`setupAutoSpy({ strayRejections: true })`](/utilities/setup), which catches at run time what no
selector can see. A chain that asserts nothing is not reported at all, which is correct and also
means the rule is no help against a floating chain with a side effect.

**Severity.** `error`. Green and wrong, with no diagnostic that points at the spec.

## no-done-callback

**`error`** · no fix · syntax only

**Reports.** Two things. A first parameter that is a plain identifier on `it` / `test` /
`beforeAll` / `beforeEach` / `afterAll` / `afterEach` **and is used as a callback rather than as a
context**, and — separately — a `.fail(…)` call on a parameter it has already reported.

**Decides on.** The parameter's form and then what the body does with it, never its name. A
destructuring pattern — `({ task })` — and a zero-parameter callback are silent outright, because a
`test.extend` fixture has to be destructured. A plain name is the ambiguous case: Vitest passes the
`TestContext` there whether or not it is taken apart, so `(ctx) => ctx.skip()` is its own
documentation's example and not a `done` at all. The rule reads the parameter's references in the
callback's own scope and stays quiet when **every** one of them is a member read — `ctx.task`,
`ctx.expect`, `ctx.onTestFinished`. It reports when the parameter is called (`done()`), handed to
something that will call it (`.subscribe(done)`, `setTimeout(done)`), or never used at all, since
none of those is a context being used. The one member read that is not a context is `.fail`, which
the `TestContext` has no member for — that is jasmine's failure channel and this rule's second
message. That half is resolved through the scope manager to a parameter of a callback already in the
reported set, because a `fail` method on a matcher bag or a domain object is somebody's API. The
parameter is visited before the body, so the set is complete by the time the `fail` is met.

**Finding, and the repair.**

```ts
it('loads', (done) => {
  service.load().subscribe((value) => {
    expect(value).toBe(1);
    done(); // ❌ TestContext is not a function
  });
});
```

```ts
it('loads', async () => {
  expect(await firstValueFrom(service.load())).toBe(1);
});
```

**Why it is recommended.** Vitest 4 passes a callable `TestContext` here, so `done()` throws — and
the throw lands inside a callback nobody awaits. The body returned long ago, the rejection is
unhandled, and the test **passes** having run almost none of itself. Four such tests sat green for
years in the suite this rule came from. `done.fail(…)` is worse in the same direction: the
`TestContext` has no `fail`, so the line throws `done.fail is not a function` — from an `error`
callback or a `.catch()`, i.e. on the exact path that was supposed to fail the test.

**Limits.** A helper that genuinely takes one positional argument and is _called_ as a hook is not a
shape the selector can tell apart, but the selector matches only the six runner names, so this is
narrow in practice. A parameter nothing in the body mentions is reported, deliberately: an unused
`done` is the shape the runner is not going to call, and a context nobody reads is a parameter that
can go. And a name read only through a member is taken as a context however it is spelled, so a
`done` that the body only ever reads a property off is silent — the read tells the rule nothing else
about it.

**What the message leaves out.** `doneFail` names the rejection matcher; where the line marks a
branch that must never run rather than a failure to assert on, `expect.fail(message)` says that.

**Severity.** `error`. A test that passes without running is not something a project can afford to
read past in lint output.

## no-bare-called-with

**`error`** · no fix · syntax only

**Reports.** `calledWith(…)` or `mustBeCalledWith(…)` as an expression statement of its own — a stub
nobody continued.

**Decides on.** The statement shape, plus the **root** of the member chain for `calledWith`. Since
Vitest 4.1 chai's bundle also spells `calledWith`, for suites arriving from sinon:
`expect(fn).to.have.been.calledWith(x)` is an assertion and is a bare statement by design. The two
are told apart by walking the chain down to its root — an assertion always begins at a call to
`expect`, a stub always begins at a spy. `mustBeCalledWith` gets no such guard, and that is not an
oversight: chai has nothing of that name, so a guard would be a branch no input can take.

**Finding, and the repair.**

```ts
cart.checkout.calledWith(1); // ❌ configures "answer undefined for 1", asserts nothing
```

```ts
cart.checkout.calledWith(1).mockReturnValue(receipt); // a stub, finished
expect(cart.checkout).toHaveBeenCalledWith(1); // or an assertion, if that was the intent
```

**Why it is recommended.** On its own the line registers "for the argument `1`, answer `undefined`",
which is what an unconfigured spy already did, so the test passes whether or not the call ever
happened. `mustBeCalledWith` on its own is wrong in the opposite direction: with nothing configured
for the arguments it was given it rejects **every** call, the matching one included, and the failure
it produces names the arguments it was handed — which reads like a mismatch rather than like a
missing `.mockReturnValue`.

**Limits.** The two messages are the whole of the rule's knowledge; it cannot tell a stub the author
meant to finish from an assertion written in the wrong vocabulary, so it names both repairs. A
`calledWith` chain assigned to a variable and continued later is not a bare statement and is not
reported.

**Severity.** `error`. Green and wrong, and a one-word repair.

## no-constant-expect

**`error`** · no fix · syntax only

**Reports.** `expect(value)` where the value is spelled out in the spec, followed — through any number
of `.not` — by a matcher whose answer that value already fixes.

**Decides on.** Two readings of the value, one per kind of matcher:

- `toBe`, `toEqual` and `toStrictEqual` are decided when **both** sides are constant: a literal, a
  template literal with no `${…}`, `undefined`, a unary operator over a constant, a function, arrow or
  class expression, or an array or object literal whose every element is one of those. A spread, a
  computed key, a getter or any name makes it live.
- `toBeTruthy`, `toBeFalsy`, `toBeDefined`, `toBeUndefined`, `toBeNull` and `toBeNaN` are decided for
  those constants **and** for any object, array, function or class literal whatever it holds — an
  object is never falsy, nullish or `NaN`.

A chain through `.resolves` / `.rejects` is left alone, and so is every other matcher —
`expect(() => load()).toThrow()` hands `expect` an arrow on purpose. Casts are read through. Arithmetic
is not evaluated: `expect(1 + 1).toBe(2)` is not reported.

**Finding, and the repair.**

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

  await expect(emitted).resolves.toBeUndefined();
});
```

A line that marks a branch the test must never reach — `expect(true).toBe(false)` in an `error`
callback — is reported too; `expect.fail('the request should not fail')` says the same thing and names
the branch.

**Why it is recommended.** [`vitest/expect-expect`](/utilities/eslint-plugin#alongside-vitest-expect-expect)
sees an `expect` and is satisfied, so a test whose only assertion is a constant is green in every
possible state of the code. Measured on one Angular suite of 1759 spec files: four reports in four
files — a test named after a stream that never looked at it, one kept after its feature was removed,
and two that import a barrel only so its lines count as covered. `@vitest/eslint-plugin` (1.6)
has no rule for this; its `valid-expect` checks the shape of the call, not what it is handed.

**Limits.** It reads only what is spelled out, so a constant reached through a name —
`const ok = true; expect(ok).toBe(true)` — is not reported. `expect.soft(…)` and chai's
`expect(x).to.be.true` are not read.

**Severity.** `error`. The finding is a fact about the line: nothing the code does can change its
answer.

## no-redundant-smoke-test

**`error`** · suggestion · syntax only

**Reports.** A test whose every statement asks whether one value is there — `expect(pipe).toBeTruthy()`,
`expect(service).toBeDefined()` — in a block that already has tests the runner will run.

**Decides on.** The bodies of the block's tests, and nothing else:

- A body counts as a smoke test when each of its statements is an `expect(x)` under `toBeTruthy`,
  `toBeDefined` or `toBeInstanceOf`, or under `toBeFalsy`, `toBeNull` or `toBeUndefined` behind a `.not`
  — the same question asked the other way round. One statement that does anything else — a call, a
  local, an `if`, a matcher that reads a value — and the test is left alone. An empty body is not a
  smoke test either.
- **The value has to be a reference to the subject, not one the test computed.** An identifier, a member
  chain with no call in it (`fixture.componentInstance`), or a call that only _builds_ the subject and
  takes nothing to do it — `createService()`, `TestBed.inject(Token)`. A call with a value in it, a
  method or signal read, a DOM query, an expression over a collection: all left alone, because the
  matcher cannot tell them apart from a subject and the assertion is the behaviour's only cover.
  `expect(isRestrictedProfile(MEMBER_ROLE.CHILD)).toBeTruthy()` and
  `expect(el.querySelector('expand-card')).toBeTruthy()` are not smoke tests. Neither is a DOM query
  behind a name: `expect(minimap()).not.toBeNull()` where the file's own `minimap` helper calls
  `querySelector`, `query(All)`, `getElement*`, `closest`, `By.*` or `queryElement`, or where a name is bound once to
  such a result. That asserts which branch of the template rendered. A builder under
  `toBeInstanceOf` is left alone too: that pairs two names and asserts they resolve to each other,
  which is wiring.
- **A running test in the block has to reach the subject the same way** — the claim the message makes
  out loud. The whole path, not the name it starts with: `expect(publicApi.FocusModule).toBeDefined()`
  beside a test checking `publicApi.viewerSettings` shares only the word `publicApi`, and the
  sibling would not have failed first. Likewise a flag a `beforeAll` sets from an observable's
  `complete` — `expect(completed).toBeTruthy()` — where the siblings read the values it collected.
- The tests it is weighed against are the ones that run the same setup: the rest of its own block, and
  every test the blocks nested inside it declare. A skipped sibling — `it.skip`, `xit`, `it.todo` —
  proves nothing, so it does not count; a skipped smoke test is still reported.
- A block whose only running test is this one is left alone: a spec that proves the subject can be
  constructed is thin, but a rule that empties a file has stopped being a lint rule.
- A test nested below the block is not weighed against the block above it — the outer tests do not run
  the inner `beforeEach`, so they cannot answer for a subject that one builds.

**Finding, and the repair.**

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

Delete it; the suggestion does, blank line above it included. The test below runs the same
`beforeEach`, so a `pipe` that came back nullish fails **it** first — on `transform` of undefined, which
names what the spec was doing when it happened.

Where building the subject really is what the spec is about, assert on that instead — a factory that
rejects a bad config, a constructor that reads an optional token:

```ts
it('refuses a config with no bucket', () => {
  expect(() => new Uploader({ bucket: '' })).toThrow('bucket is required');
});
```

**Why it is recommended.** The line cannot fail on its own, and it is the one line of a spec that looks
like coverage. Measured on one Angular suite of 1771 spec files: 569 reports in 540 files, 515 of them
titled `should create`, `should be created` or `create an instance` — what `ng generate` writes into
every new spec, kept while the file around it grew tests that already build the same subject. On a
second suite, 845 files: 97 reports in 87 files. On a third, 127 files: one.
[`vitest/expect-expect`](/utilities/eslint-plugin#alongside-vitest-expect-expect) sees an `expect` and
is satisfied; `@vitest/eslint-plugin` (1.6) has no rule for this.

**Limits.** Syntax only: an existence check behind a helper — `expectCreated(pipe)` — is not read, and
neither is one reached through `expect.soft`. It does not look at what the block builds, so a smoke
test whose siblings all test a **different** subject is reported too — that is a spec asserting the
wrong thing rather than a false report, but it is the reading to know about. `it.each([…])('…')` is
read as one test, whatever the table holds.

**Severity.** `error`. The finding is a fact about the file: nothing the code under test does can
change the answer, and the repair is a deletion.

## no-self-called-spy

**`error`** · no fix · syntax and scope only

**Reports.** Inside one test body: `vi.spyOn(obj, 'm')`, then a direct `obj.m(…)` written by the test
itself **after** it, then a positive `toHaveBeenCalled*` on that same member.

**Decides on.** Three positions in one test, matched on the text of the object and the name of the
member. Order is the whole rule: the same three shapes in another order are ordinary arrangement — a
spec that puts the subject into a state, installs the spy afterwards and then drives the production
path is doing exactly the right thing.

**Finding, and the repair.**

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
  renderShallow(Parent).query(ChildComponent).subscribeClick.emit(payload);

  expect(emitSpy).toHaveBeenCalledWith(payload);
});
```

**Why it is recommended.** The test above proves that `EventEmitter.emit` calls `EventEmitter.emit`.
Delete the `(subscribeClick)="…"` binding its title names and it stays green: it survives the removal
of the behaviour it claims to check, which is the one failure it cannot report.

**It is a quiet rule, and that is said out loud.** On the 2 030-file consumer it was measured against
it reports **5 sites in 3 files** — three `EventEmitter.emit` relays in one component spec and two
more of the same shape elsewhere. That is below the bar a count would set, and it is not what the
rule is in `recommended` for: what it costs a suite is nothing (no finding on a spec that drives the
production path), and what it catches is a test with no subject in it at all.

**Limits.** A **negated** assertion is never reported, nor `toHaveBeenCalledTimes(0)`: "it was not
called" is not made true by a call. Neither is a call whose record a `mockClear` / `mockReset` /
`mockRestore` / `vi.clearAllMocks()` drops before the assertion reads it — that is the spec saying in
its own text that the assertion is about the production path, and five sites in one file of the
measured consumer are exactly that. Nor an assertion whose arguments are not the ones the call
passed: `expect(component.scale.set).toHaveBeenCalledWith(3)` under an arranging
`component.scale.set(2)` cannot be satisfied by that line. The argument check compares source text,
so it errs quiet — the same value spelled two ways is a finding this rule lets through rather than a
report it has to defend. A spy installed in a **hook** is out of scope: it is shared by every test of
the block, and most of them drive the production path. A call from **inside a callback** is not the
test calling it; the code under test is.

**No fix, and no suggestion.** There is no edit at the reported node. The repair is to drive whatever
should make the call — dispatch the DOM event, emit on the collaborator's double, call the public
method that should relay — and that is a judgement about what the test meant, which
[`no-vacuous-absence-assertion`](#no-vacuous-absence-assertion) declines for the same reason. The
message carries the whole repair instead.

**What the message leaves out.** A call written before the spy is arrangement and is never
reported, and neither is `not.toHaveBeenCalled()`: both already tell the two outcomes apart.

**Severity.** `error`. The evidence is three lines of the file in one order, nothing is decided on a
heuristic, and what it reports is a test that proves nothing about the code it names.

## prefer-create-spy-from-class

**`error`** · no fix · syntax only · option `minRunnerFns`

**Reports.** An object literal with **two or more** direct properties whose value is a runner mock.

**Decides on.** A count of the object's own properties, not of its subtree: a value counts when it
unwraps to `vi.fn()` / `jest.fn()` — the walk goes down a configured chain, so
`vi.fn().mockReturnValue(of([]))` and `vi.fn().mockReturnValue(x).mockName('y')` both count. Nesting
needs no special handling because the rule fires on every object literal in the file, so an inner
object is judged on its own properties. These shapes are subtracted:

- an object a provider's `useValue` hands to DI, whether it is written in the slot or one name away
  (5.5.0) — that is [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)'s line, and two reports on
  one double teach people to disable both. The name step matters because that rule follows a name
  _into_ the slot: before this was read from both ends, a literal parked in a `const` drew a report
  from each of the two, one recommending `createSpyFromClass` and one `provideAutoSpy`;
- anything inside a call to `autoMocked`, `createActivatedRoute`, `createAutoMock`, `createComponentStub`,
  `createDirectiveHost`, `createDocumentDouble`, `createMock`, `createRouterDouble`,
  `createSpyClass`, `createSpyFromClass`, `createWindowDouble`, `mockConstructor`, `mockDeep`,
  `provideActivatedRoute`, `provideAutoSpy`, `provideAutoSpyForToken`, `provideDocumentDouble`,
  `provideRouterDouble` or `provideWindowDouble`,
  at any depth — that object is a **seed**, which is what the rule asked for;
- anything inside a `vi.mock()` / `vi.doMock()` factory, whose object replaces a module's _exports_
  rather than standing in for a service, and anything a `vi.hoisted()` callback returns — the bag
  that carries mocks into such a factory, `vi.hoisted(() => ({ spawnMock: vi.fn() }))`;
- an options bag handed straight to a call or a `new`: exactly one `vi.fn()` beside at least one
  plain value, as in `service.openDialog({ elRef, options, onColorChange: vi.fn() })`. Only
  `{ minRunnerFns: 1 }` reaches that shape, and it is a callback among arguments, not a double of a
  class. Two mocks, a function value, or the same object parked in a `const` first still report;
- anything inside a `createFixture(…)` / `createFixtureFactory(…)` call — the defaults or overrides
  of a model with a callback field, `createFixture<Options>({ changeOptionsCallback: vi.fn() })`,
  already typed against the model;
- an RxJS observer handed straight to `subscribe(…)` or `tap(…)`, as in
  `source$.subscribe({ error: vi.fn() })`;
- a provider descriptor — any object with a `provide:` key. `{ provide: CLOSE, useValue: close }`
  where the token's value is itself a function holds its double in the `useValue`, and the object
  around it is DI syntax;
- the input map of `setInputs(fixture, { … })` and of `renderShallow(C, { inputs: { … } })`, which
  both check it against the component's inputs;
- a `return { preventDefault, stopPropagation }` of names only, where every spy in it is also read
  somewhere else — handles to spies a helper installed, handed back for destructuring. A factory whose
  spies exist only in what it returns still reports;
- an options bag nested inside a call argument, `render({ options: { slide, onClose } })`, by the
  same one-mock-beside-a-value rule as the bag handed straight to the call;
- an object under the threshold. The message names the double, how many `vi.fn()`s it holds and
  which, and `createAutoMock<T>()` for the type its name declares. A property counts toward it when its value
  is a `vi.fn()` or a name the file binds once to one: `{ load, save }` over two `const … = vi.fn()`.

A one-member object — a thenable `{ then: vi.fn() }`, a holder for one callback — has no class for
`createSpyFromClass` to read, so its message names `createMock<T>({ then: vi.fn() })` instead, which
checks the key and the signature against `T`. Two exceptions: a one-member literal bound to a name
that declares a type (`const parameters: Record<string, unknown> = { fn }`, at any depth inside
it) or inside the value of `mockValueProp` / `mockReadonlyProp` / `mockSignalProp` is checked against
that type already and is not reported, unless the type is itself an inline object type; and a nested
`{ set: vi.fn() }` / `{ update: vi.fn() }` stands in for a signal, which `createMock<T>` cannot seed,
so its message names `mockSignalProp` instead. The same holds for an argument of a helper the same
file declares, when the parameter it lands in is typed —
`createDefaultOptions({ onChange: callback })` over
`const createDefaultOptions = (overrides?: Partial<Options>) => …` is not reported. An **imported**
helper's parameter is out of reach of a syntax-only rule, so the same call is still reported there:
wrap the literal in `createMock<Partial<Options>>(…)` or bind it to a typed `const`.

**Finding, and the repair.**

```ts
const cart = { total: vi.fn(), add: vi.fn() } as unknown as CartService; // ❌
```

```ts
const cart = createSpyFromClass(CartService);
```

**Why it is recommended.** A hand-written double only has the methods somebody remembered. The class
grows one, and the spec dies on `TypeError: cart.applyCoupon is not a function` — in application
code, several frames from the object that is actually wrong. The type system does not catch it
either, because the double never satisfied the class in the first place; the
`as unknown as CartService` in front of it is what hides `TS2741: Property 'rate' is missing`.
`createSpyFromClass` reads the prototype and `createAutoMock<T>()` reads the type, so neither can
fall behind.

**Limits.** The default threshold of `2` is a real gap, and it is there because of what the rule
cannot see: an object holding one `vi.fn()` is indistinguishable from an options bag with a callback
in it (`{ onDone: vi.fn() }`), and this rule fires on every object literal in the file. The visible
cost is an asymmetry — two doubles on adjacent lines, one flagged and one not — which seven
migration batches tripped over, so the threshold is the first thing to check when two neighbours
disagree:

```js
'vitest-auto-spy/prefer-create-spy-from-class': ['error', { minRunnerFns: 1 }],
```

The case those reports were actually about is covered from every side that can prove it:
[`prefer-provide-auto-spy`](#prefer-provide-auto-spy) has a `provide:` next to the object,
[`no-structural-double`](#no-structural-double) has a declaration saying the object stands in for a
type, and [`no-stub-class-double`](#no-stub-class-double) reads the class spelling of the same
double — all three fire at **one**.

**Severity.** `error`. Without the rule the failure is red, but its message names a method rather
than the double, and the repair is a rewrite of the double rather than a line.

## no-stub-class-double

**`warn`** · no fix · syntax only · option `minRunnerFns`

**Reports.** A class whose own fields are initialised with `vi.fn()` / `jest.fn()`.

**Decides on.** A count of the class's own initialised fields, and four subtractions. The count reads
`PropertyDefinition` nodes only, unwrapping a configured chain the same way the object rule does, so
`load = vi.fn().mockReturnValue(of(url))` counts; `static` counts too, because a `static` field of
`vi.fn()`s is the same double built once per module instead of once per instance. A field with no
initialiser, a computed key and a field assigned in the constructor are not counted.

The four subtractions are the design, because a spec file is full of classes that hold a `vi.fn()`
and are not service doubles:

- a **decorated** class — a test host or a testing module, whose `vi.fn()` fields are event handlers
  (`onChange = vi.fn()`);
- a class with a non-empty **`implements`** clause, which _cannot_ drift: add a member to the type
  and the stub stops compiling, so the failure the report would be claiming does not exist;
- a class that **`extends`** something, which inherits the real behaviour it is specialising, so
  `provideAutoSpy` is not its replacement;
- a class with **no name of its own** — a class expression in a property slot. That one replaces a
  module export, which is then used as a DI token, and a token has to be a constructor.
  `insideModuleMock` catches the inline spelling (`vi.mock('m', () => ({ C: class { … } }))`) and
  misses the one that costs, where the object is a `const` the factory merely names.

The count starts at **one**, where [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)
needs two, and the four subtractions are why: that threshold exists because `{ onDone: vi.fn() }`
cannot be told apart from `{ load: vi.fn() }`, and nobody writes an options bag as a class. Measured
both ways on one consumer's 1759 spec files — two fields reports 6, one field reports 12, and the six
the threshold hid are all named `*Mock` or `Mock*`.

A class the same file hands to DI is not reported here — through a `useClass:`, a `useExisting:`, a
`useValue: new StubMock()`, or a `TestBed.overrideProvider` whose descriptor names it (5.5.0). That
registration is [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)'s, at `error`, and it is the
site where the repair is written. The stand-down copies that rule's own conditions exactly,
`multi: true` included: where it stays silent, this one does not.

**Finding, and the repair.**

```ts
class PaymentCardServiceMock {
  getPreviewUrl = vi.fn().mockReturnValue(of(url));
  load = vi.fn();
} // ❌

const mock = new PaymentCardServiceMock();
```

```ts
const mock = createSpyFromClass(PaymentCardService);
// or, where the double stands in for an interface or an abstract class:
const mock = createAutoMock<PaymentCardService>();
// and behind DI, the whole stub class goes away:
providers: [provideAutoSpy(PaymentCardService)];
```

**Why it is recommended.** The same drift as
[`prefer-create-spy-from-class`](#prefer-create-spy-from-class), and it is the same object with a
`new` in front of it: the class grows a method, the stub does not, and the spec dies on
`TypeError: mock.applyCoupon is not a function` in application code. It is worth having as a rule of
its own because it was the _largest_ family left in a suite running every `error` rule of
`recommended` with no `eslint-disable` anywhere — 112 `vi.fn()` fields in 46 classes across 32 files,
reported by nothing, because `prefer-create-spy-from-class` matches an object literal and a class
declaration is not one.

**Limits.** A stub class in a shared `*.mock.ts` is invisible: the report needs the declaration in
the linted file. A stub whose fields are assigned in the constructor (`this.load = vi.fn()`) is not
counted. And the one shape that is reported without being a service double is a non-decorated,
non-extending local helper class holding a `vi.fn()` callback — none exists in the suite this was
measured on, and the message names `createAutoMock<T>()`, which is still the right answer if the
class stands in for anything at all.

**Severity.** `warn`, and the reason is the evidence rather than the finding. What it reports is a
defect, exactly the one `prefer-create-spy-from-class` reports at `error` — but that rule has a
count it can defend and this one has a heuristic with four hand-picked exemptions in it, and a
project that disagrees with the reading has to be able to switch it off without losing the rule that
reads a count. Measured before the severity was chosen: 12 reports across 8 of one consumer's 1759
spec files, 10 in 7 once the two stubs entering DI through a `useExisting:` moved to the provider
rule. Turn it up once the batch is done.

## no-structural-double

**`warn`** · no fix · syntax only · option `minRunnerFns`

**Reports.** An object literal of `vi.fn()`s bound to a name whose **declared type** is an inline
object type with a Vitest mock member — `let card: { load: Mock }`.

**Decides on.** The declaration, which is the evidence
[`prefer-create-spy-from-class`](#prefer-create-spy-from-class) does not have. That rule needs two
`vi.fn()`s because `{ onDone: vi.fn() }` and `{ load: vi.fn() }` are the same tree; writing `Mock`
as a **member of an object type** resolves the ambiguity, because nobody annotates an options bag
`{ onDone: Mock }`. So the report fires at a single `vi.fn()`, the same way
[`prefer-provide-auto-spy`](#prefer-provide-auto-spy) does when a `provide:` proves the point.

The name is followed in both directions a spec writes it. A declarator's own annotation
(`const svc: { load: Mock } = { … }`) and — the one that matters — an assignment back to the `let`
that declared it, because in the suite this was measured on **not one** of the 120 annotated doubles
carried an initialiser: every one is `let x: { … };` at the top of the `describe` and `x = { … }` in
a `beforeEach`.

Any of Vitest's mock type names counts as the member type: `Mock`, `MockInstance`, `Mocked`,
`MockedClass`, `MockedFunction`, `MockedFunctionDeep`, `MockedObject`, `MockedObjectDeep`,
`PartialMock`. Which of them _means_ a whole-object double is
[`no-mocked-for-spy`](#no-mocked-for-spy)'s question and does not apply here — whichever appears,
it appears as the type of one **member**, and a member of a hand-written object type is a method
somebody remembered.

Four shapes are subtracted, three of them the same ones the object rule subtracts (a double handed to
Angular DI, a factory seed, a `vi.mock()` factory) and one of its own: the rule sits **below**
`prefer-create-spy-from-class`'s threshold. At two `vi.fn()`s and up that rule already reports, at
`error`, and this one keeps quiet, so one double never draws two reports. Both read the same
`minRunnerFns`, so a project that moves the threshold moves it on both.

**The DI carve-out is one name wide** (5.5.0), not a look at the enclosing property, because
[`prefer-provide-auto-spy`](#prefer-provide-auto-spy) follows a name into a `useValue` and this rule
follows the same name back out to its declaration — a parent-only reading made the shape below two
reports rather than one, and the two disagree about the repair:

```ts
let svc: { load: Mock };

beforeEach(() => {
  svc = { load: vi.fn() };
  TestBed.configureTestingModule({ providers: [{ provide: Card, useValue: svc }] });
});
```

That is where most of them turned out to be. Of the 115 reports this rule made on the consumer it
was measured against, **110** are handed to DI one name away and belong to the provider rule, whose
answer is `provideAutoSpy(Card)`. The rule's own subject is a service _without_ DI, so the carve-out
is what it says it does; what is left is 5 reports in 4 files.

A declaration wrapped in anything is read as "no": `Mocked<{ load: Mock }>` is
[`no-mocked-for-spy`](#no-mocked-for-spy)'s report, an intersection carrying real fields alongside
the mocks is the one shape where the object genuinely is part configuration, and an `interface` or a
`type` alias describes a shape with no value in view, so there is no creation site to point at.

**Finding, and the repair.**

```ts
let devModeService: { devMode: Mock };

beforeEach(() => {
  devModeService = { devMode: vi.fn().mockReturnValue(true) }; // ❌
});
```

```ts
let devModeService: Spy<DevModeService>;

beforeEach(() => {
  devModeService = createAutoMock<DevModeService>();
  devModeService.devMode.mockReturnValue(true);
});
```

**Why it is recommended.** The declaration says the object stands in for a type, and then the object
hand-writes the stand-in one method at a time — so it drifts, and the annotation is what makes that
provable rather than a guess. `createAutoMock<T>()` reads the type and is also the answer where
`provideAutoSpy` cannot go at all, an abstract class or an interface having no constructor to read.

**Limits.** A **bare** `let fn: Mock` is never reported and must not be: that is a plain `vi.fn()`
callback, and `Mock` is its correct type — 109 of the 290 `Mock` references in the suite this was
measured on are that. Neither is an `X.y as Mock` cast, which retypes a function that already
exists. The rule reads one level of annotation and no more, so a double declared through an
interface, a type alias, a `Record<…, Mock>` or an intersection is not reported; and an object
assigned to something other than a plain name (`state.svc = { … }`, a destructured binding, a
parameter) has no declaration in view.

**Severity.** `warn`, for the same reason [`no-stub-class-double`](#no-stub-class-double) is: the
finding is a real defect, but the evidence is a reading of a declaration rather than a count, and
nothing else in the file proves the object is a stand-in. It looked like the loudest thing in this
release at 115 reports across 74 of one consumer's 1759 spec files; once the DI carve-out above went
in it is 5 in 4, and 110 of those doubles moved to `prefer-provide-auto-spy` at `error`, where a
`provide:` is the evidence. The severity did not change with the count, because the count was never
the argument for it — the evidence was.

## prefer-spy-on-own-method

**`warn`** · `--fix` and suggestion · syntax only

**Reports.** A `createSpyFromInstance(target, options)` call whose options are one of the two shapes
[`spyOnOwnMethod` and `spyOnVoidMethod`](/core/create-spy-from-class#spy-on-own-method) pack, and whose result is used
for that one method alone:

- `{ onlyMethodsToSpyOn: ['m'], passthrough: true }` → `spyOnOwnMethod(target, 'm')`;
- `{ onlyMethodsToSpyOn: ['m'], returns: { m: undefined } }` → `spyOnVoidMethod(target, 'm')`;
- `{ returns: { m: undefined } }` alone, on a real event or element → `spyOnVoidMethod(target, 'm')`.

"Used for that one method alone" is one of four spellings, on one line or across ten: `.m` (or
`['m']`) read off the call, `const { m } = …`, the call as a statement of its own, or a name written
once with the call and read only as `name.m` — a `const`, or a `let` a `beforeEach` assigns.

**Decides on.** The call and the reads of its result. A second method in the list, `methodsToSpyOn`
(which adds to discovery rather than replacing it), any other option, a spread, a result handed on,
exported, written to as `spy.m = …` or read for another member, and nothing is reported. The bare
void seed also needs the target to be real, read from the expression or one name away: `new
MouseEvent(…)` and every global `…Event` constructor, `document` and `window`,
`document.createElement(…)` / `createElementNS` / `createEvent` / `querySelector` / `getElementById`,
`document.body`, `fixture.nativeElement`, `….debugElement.nativeElement`,
`….query(…).nativeElement`, `hostElement(…)` and `queryElement(…)`. A double — `createAutoMock<Event>()`, `createSpyFromClass(Event)`, a cast
literal, a name nothing in the file settles — is never reported.

**Finding, and the repair.**

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

The first two shapes are exactly what the helpers do, so `--fix` applies them: the call, every
`name.m` read becoming `name`, the helper imported beside the factory (from the same entry when it
is one that exports the helper, otherwise from the adapter entry the file imports, and from the root
when it imports none) and the factory's import dropped once the
rewrite took its last use. A `Spy<X>` annotation on the name becomes `Spy<X>['m']` in a suggestion
rather than a fix; any other annotation, explicit type arguments, or a `spyOnOwnMethod` the file
declares itself leave the report without an edit.

**Why it is recommended.** The helpers exist because this call is the common one, and a suite
migrated before they existed carries it everywhere. A text search for it misses every call written
across lines — the consumer that asked for this rule converted about sixty by hand and found ten more
only here.

**Limits.** The bare void seed is a suggestion, not a fix: without `onlyMethodsToSpyOn`, discovery
spies every other method of the target too, and a test that relies on one of them being stubbed
changes under `spyOnVoidMethod`. That is also why a component instance is not on the list of real
targets — its other methods are the likeliest to be relied on. Several rewrites of one file in a
single `--fix` pass can leave the `createSpyFromInstance` import unused; a pass that rewrites the
last use removes it, and an unused-import rule the project runs catches the rest.

**Severity.** `warn`, for the reason [`prefer-render-shallow`](#prefer-render-shallow) is: the call it
reports is correct and does exactly what the helper does. The rule names a shorter spelling, not a
defect, and since the exact shapes carry a fix, turning it up is one `eslint --fix` away.

## no-shared-module-level-mock

**`error`** · no fix · syntax only

**Reports.** An **exported** variable whose initialiser builds a runner mock while the module is
being evaluated.

**Decides on.** The export declaration, plus the same subtree walk the other double rules use — with
the function boundary respected. A `vi.fn()` behind an arrow is created per call, which is the shape
the rule steers towards, so descending into functions would flag the fix along with the problem.
A spy that never leaves the file is not reported at all.

**Finding, and the repair.**

```ts
export const cartFixture = { total: vi.fn(), add: vi.fn() }; // ❌ built once per module
```

```ts
export const createCartFixture = () => ({ total: vi.fn(), add: vi.fn() });
```

**Why it is recommended.** Under `isolate: false` a module is evaluated once per **worker**, so
every importing spec shares the same object. Probed with a module-load id: with isolation the two
files print different ids, without it the same one, and file 2 reads what file 1 pushed. Note what
leaks and what does not — `clearMocks: true` does reach a module-level `vi.fn()` and does clear its
calls, three separate probes said so. What crosses files is everything else the fixture holds next
to its spies: a `Subject` that has already completed, an array somebody pushed to, a stored
`mockReturnValue`. Which file runs first is the runner's choice, so the failure arrives as
flakiness in a file nobody edited.

**Limits.** A module-level `const` that is not exported is silent, and it has the same problem the
moment two `describe` blocks in the file share it — the rule reads the export, which is the shape
that crosses files. An exported _frozen constant_ built from `vi.fn()`s on purpose (a stable
reference some registry compares by identity) has to be silenced per line.

**What the message leaves out.** The factory is the whole repair: `export const createCart = () =>
({ total: vi.fn() })`, called in a `beforeEach` of every spec that used the shared object, so each
test starts from fresh spies.

**Severity.** `error`. Green and wrong, and the failure surfaces in a different file from the cause.

## no-object-define-property

**`error`** · suggestion · syntax only

**Reports.** Every `Object.defineProperty` and `Object.defineProperties` call in a linted file, with
a second, sharper message where the same property is redefined twice in the same block.

**Decides on.** Two selectors plus a tally keyed by _what_ is patched: the enclosing function's
range, the target's source text and the key's source text. The key is text rather than nodes because
`window` in two calls is two identifiers and one global. Two patches of one property in one block
read as a patch and a hand-written restore (`manualRestore`); two patches in two different tests, or
a `beforeEach` patch paired with an `afterEach` restore, stay apart and get the ordinary message.
`defineProperties` always gets the ordinary message and no suggestion, because its replacement is
one `mockValueProp` per entry — several statements where there was one.

The suggestion reads the **descriptor** and names the helper that reproduces it exactly, which is
the reason it declines so often. `configurable` is the one companion key allowed to be present,
because making the property configurable again is the point of the change; `writable`, `enumerable`
or a second meaningful entry means the descriptor is left alone. A `{ value: vi.fn().mockImplementation(function () { … }) }`
is declined too: that is a mock the code under test calls with `new`, and the helper for it is
`stubConstructor`, not `mockValueProp`.

**Finding, and the repair.**

```ts
Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }); // ❌
```

```ts
mockValueProp(navigator, 'onLine', false); // undo registered with restoreMockedProps()
```

**Why it is recommended.** Nothing puts the descriptor back. Measured on one file that patches
`navigator.onLine` and then calls everything the runner offers — `vi.restoreAllMocks()`,
`vi.resetAllMocks()`, `vi.unstubAllGlobals()` — the property still reads `false` after all three,
and still reads `false` in the **next** file of the worker. `restoreMockedProps()` does restore it,
but only if the property was patched through one of the helpers: run it after the `defineProperty`
file in the same worker and the original descriptor is already gone. A suite cannot recover from
this file by file. `Object.defineProperty` also defaults `configurable` to `false`, so the patch
seals the property for the rest of the worker.

**Limits.** This is the rule most likely to be right about the mechanism and wrong about your line —
a property on a frozen host object, a descriptor the helpers do not reproduce, a patch inside a
`beforeAll` that is meant to last the file. The message names the helper the descriptor asks for —
`{ value }` is `mockValueProp`, `{ get }` is `mockReadonlyPropGetter`, a `set` is `mockAccessorsProp`,
a value built with `mockImplementation(function () { … })` is `stubConstructor` — and a per-line
disable with the reason is the intended answer where none of them fits:

```ts
// eslint-disable-next-line vitest-auto-spy/no-object-define-property -- clientWidth is a getter on a frozen host object
Object.defineProperty(target, 'clientWidth', { value: 100 });
```

It is also the rule most sensitive to the `files` glob: `Object.defineProperty` in application code
is entirely reasonable, and a glob that is too wide starts reporting it.

**What the message leaves out.** Two cases the descriptor cannot show. A `Signal<T>` property is
`mockReadonlyProp(obj, key, signal(value))` with a real `signal`: a `vi.fn().mockReturnValue(value)`
reads the same at the call site and stops every `computed()` and `effect()` downstream from
updating. And a property missing because it is an instance field rather than a prototype member is
repaired where the spy is built — `instanceMethodsToSpyOn` / `observablePropsToSpyOn` — not here.

**Severity.** `error`. The damage is not confined to the file that did it, which is what separates
this from a warning.

## no-import-time-spread

**`error`** · suggestion · syntax only

**Reports.** A spread of a binding another module owns, evaluated while this module is still
loading.

**Decides on.** Two questions, both answered without types. Is the spread operand a name this file
**imported** — resolved through the scope manager to an `ImportBinding`? And is the spread evaluated
at import time — a walk up to `Program` that stops at any function body or any non-`static` class
field. A `static` field is not a boundary: it really does run while the class declaration is
evaluated. Nothing inside a function body is reported, because that runs later, which is the whole
repair.

**Finding, and the repair.**

```ts
import { BaseEvents } from './base-events';

export const platformEvents = [...BaseEvents]; // ❌ fine under tsc, a TypeError under a bundler
```

```ts
export const platformEvents = () => [...BaseEvents];
```

**Why it is recommended.** Under `tsc` and under a browser's ESM loader this cannot fail — a module
never runs before its dependency. Inside one bundle it can: the spec bundle emits shared chunks, a
chunk may be evaluated while a binding it re-exports is still `undefined`, and `[...undefined]`
throws `Spread syntax requires ...iterable[Symbol.iterator] to be a function` while the bundle
loads, on a tree whose every test passes. It is the same root cause as the barrel-initialisation
note in the [migration guide](/migrating), but the symptom names neither a module nor a barrel, so
nothing connects the two.

**An object spread is the quiet half, and gets its own message.** `[...undefined]` and
`f(...undefined)` throw; `{ ...undefined }` is `{}`. So the object form raises nothing at all — the
module loads, and the constant it built is silently short of every key it meant to copy:

```ts
import { SectionItemType } from '@acme/api';

// ❌ `{ ...undefined }` is `{}`, so `ItemType.COVER` reads `undefined` for the rest of the run
export const ItemType = { ...SectionItemType, ...LocalItemType } as const;
```

The two are reported separately because the message is what the reader acts on: told to look for
`Spread syntax requires …` in an object spread, they find no such error anywhere in the log and
take the report for a false positive. The object message says up front that there is nothing to
find, and that the damage is a key reading `undefined`.

**Limits.** The population is small — seven sites in an 8 673-file workspace, two of them spreading a
workspace barrel — and probing all seven cleared them: none was the failure being chased at the
time. So this is a rule that will mostly report code that has never failed, and the argument for it
is the cost of the failure rather than its frequency. The suggestion is offered only for a spread
that is part of a variable initialiser, and it is a suggestion in the strongest sense: accepting it
makes every use of the name a call, so the type checker names each site that has to change. The
other repair — inline the constant so nothing has to be imported for this line — cannot be written
from one file.

**Severity.** `error`. The failure is red by construction, but it arrives before any test runs and
its message points at the bundler.

## prefer-observer-stub

**`error`** · no fix · syntax only

**Reports.** `IntersectionObserver`, `ResizeObserver` or `MutationObserver` replaced with a double.
Three forms: an assignment to the global, `vi.stubGlobal('IntersectionObserver', …)`, and
`vi.spyOn(globalThis, 'MutationObserver')`.

**Decides on.** The receiver has to be the global object — `global`, `globalThis`, `self` or
`window`, casts stripped; an alias (`const g = globalThis`) is out of reach and out of scope. The key
may be dotted or a string. And the value has to be a **double**, which is the whole of the rule's
discrimination: a class expression, a function, a runner mock, or a name that resolves to one of
those. That last step is where three real lines stay silent, each of them deliberately:

- `globalThis.IntersectionObserver = original` — the restore. The value is a name holding whatever
  was read out of the global, and `initializerOf` gives up on a name assigned twice, which is
  exactly that variable.
- `window.ResizeObserver = ResizeObserver` from a polyfill — the value came from an import, so it is
  a real implementation and application code doing what it should.
- a receiver that is not the global object: a fake `window` a spec builds and hands to the code
  under test is a value like any other.

A definition's _kind_ is read rather than its node, because a parameter's definition points at the
function it belongs to — reading the node calls every parameter a function, and
`function restore(original) { globalThis.ResizeObserver = original; }` was reported as installing a
double until a test pinned the restore silent.

`Object.defineProperty(globalThis, 'ResizeObserver', …)` is deliberately **not** one of the forms:
[`no-object-define-property`](#no-object-define-property) already reports every `defineProperty` in
a spec and names a helper from the same family, and two reports on one line saying the same thing is how a
rule gets switched off.

**Finding, and the repair.**

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
const observers = stubIntersectionObserver();
// observers.last.emit([intersectionEntry({ isIntersecting: true })]) drives the callback
// observers.last.disconnected is what the disconnectSpy was for
```

**Why it is recommended.** Two reasons, and the second one is the defect. The first is that the
nineteen lines above are already written — the rule exists because the person writing them does not
know that, and one of the blocks this was measured on carried a comment saying there was no other
way. The second is the restore. A restore written as the last statement of an `it` runs only if
every assertion above it passed, so the first red test leaves the stub installed for the rest of the
file and, under `isolate: false`, for every later file the worker picks up — where it surfaces as
`observe is not a function` in a component nobody edited. The helper's undo goes through
`mockValueProp` and comes off in `restoreMockedProps()`, which `setupAutoSpy()` already runs after
every test. The runner form has a failure of its own:
`vi.fn().mockImplementation((cb) => ({ observe() {} }))` is an arrow, an arrow cannot be called with
`new`, and the `TypeError` lands in application code with the spec still looking correct.

Measured over an Angular monorepo of 1 758 spec files: **16 places** replace one of the three globals
by hand — 14 assignments and 2 `vi.spyOn(globalThis, …)`, across five libraries and both
applications, one of them behind a cast that a grep for `global.IntersectionObserver =` does not
find. Fifteen are reported (the sixteenth is under a file-wide disable) and fourteen of the fifteen
are test code; the one that is not is an SSR shim outside the spec glob.

**Limits.** A project that needs a _specific_ observer implementation in a spec — a real polyfill, an
observer that records geometry the helper does not model — is reporting working code, and the answer
is a per-line disable. The three-name list is closed: a fourth observer global gets no report.

**What the message leaves out.** The handle the stub returns covers what the hand-rolled one was
written for: `observers.last.disconnected` is the teardown assertion, `observers.last.options` the
init object, `observers.last.targets` what was observed, and `observers.instances` every observer
in construction order. The `let original = …` and the `afterEach` that assigns it back go, since
`restoreMockedProps()` already puts the real constructor back.

**Severity.** `error`. Green and wrong, and the damage crosses files.

## no-hand-assigned-global

**`error`** · `--fix` for a write into an imported object, no fix for a global · syntax and scope only

**Reports.** A double assigned straight to a property of the global object —
`global.fetch = vi.fn(…)`, `window.matchMedia = vi.fn()`, `window.localStorage = { getItem: vi.fn() }`
— in a file where nothing puts the original back in a teardown hook. A restore written inside the
test instead of a hook gets a message of its own.

**Decides on.** The same reading as [`prefer-observer-stub`](#prefer-observer-stub): the receiver is
`global`, `globalThis`, `self` or `window`, casts stripped; the key is dotted or a string literal;
and the value is a **double** — a runner mock (`vi.fn()` bare or configured), a class expression, a
function, a name bound to one of those, or an object literal with a `vi.fn()` somewhere inside it.
Then the whole file is read once, at the end, for a restore of the same global: an assignment of a
value that is not a double, or a `delete`. A restore inside `afterEach`, `afterAll` or
`onTestFinished` silences the report, because a hook runs whatever the assertions did. A restore
anywhere else turns the report into the `restoreInTest` message.

The message depends on the global. A lowercase one — `fetch`, `matchMedia` — points at
`mockValueProp(globalThis, name, vi.fn(…))`; a capitalised one — `XMLHttpRequest`, `WebSocket`,
`EventSource` — is a constructor the code calls with `new`, and points at
`stubConstructor(globalThis, name, …)`. `localStorage` and `sessionStorage` point at
[`stubWebStorage()`](/utilities/setup#stub-web-storage), and `Worker` at
[`stubWorker({ respond })`](/utilities/worker-stub), which keeps the listener semantics a
hand-written worker stub loses. A spec that only needs to stay off the
network wants [`blockNetwork()`](/utilities/setup#_5-keeping-the-run-off-the-network) instead.

**Finding, and the repair.**

```ts
beforeEach(() => {
  global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve(user) })) as never; // ❌
});
```

```ts
beforeEach(() => {
  mockValueProp(globalThis, 'fetch', vi.fn().mockResolvedValue(Response.json(user)));
  // undo registered with restoreMockedProps(), which setupAutoSpy() runs after every test
});
```

**An imported object.** The same rule reads `environment.production = true` in a spec: an
assignment (`=`, not `+=`) to a member of a name bound by a named or default import, dotted or
through a string key, casts stripped, directly or further down the chain (`config.feature.enabled`).
The module is cached for the worker, so **any** value is reported, not only a double; a restore in a
teardown hook silences it as it does for a global. A local, `this`, a computed key and a namespace
object itself (`import * as env`; the object is sealed and the write throws) are not reported.

`--fix` rewrites the statement to `mockValueProp(environment, 'production', true)` and, when the file
has no `mockValueProp` in scope, imports it from the adapter entry the file already imports
(`vitest-auto-spy/bun`, `/bun-angular`, `/node`, `/rstest`…), so a spec on another runner does not
load Vitest's adapter, and from `vitest-auto-spy` when it imports none; one imported from any other
entry is used as it is. It fixes only a statement that runs in a test or a
`beforeEach`: in `beforeAll` or a `describe` body the sweep after the first test would take the patch
off for the rest of the file, so there the report comes without a fix. An assignment used as a value,
and a file that declares its own `mockValueProp`, are left unfixed too.

```ts
it('uses the stand configs', () => {
  environment.useRemoteConfigs = true; // ❌
  mockValueProp(environment, 'useRemoteConfigs', true); // ✅ what --fix writes
});
```

**Why it is recommended.** A bare assignment is the one kind of mock that none of the runner's
cleanups reaches. `vi.restoreAllMocks()` restores spies, `vi.unstubAllGlobals()` restores what
`vi.stubGlobal` installed, and `restoreMockedProps()` restores what went through `mockValueProp`. The
fake then answers every later test of the file, and under `isolate: false` every later file of the
worker, where a component nobody edited starts getting a canned response. This is the form most
`fetch` tutorials and generated cheat sheets show, usually with no restore.

**Limits.** An alias of the global object (`const g = globalThis`) is out of reach. So is a restore
that lives in a helper the spec calls from its hooks: the rule sees only assignments and `delete`s
written in the file. A per-line disable is the answer for a double that is meant to last the whole
run, such as one installed in a setup file on purpose. The three observer globals are left to
[`prefer-observer-stub`](#prefer-observer-stub), and `Object.defineProperty(globalThis, …)` to
[`no-object-define-property`](#no-object-define-property), so one line never draws two reports.

**What the message leaves out.** `vi.stubGlobal(name, value)` with `unstubGlobals: true` in the
Vitest config restores the global too, and a spec that only needs to stay off the network wants
`setupAutoSpy({ blockNetwork: true })` rather than a double.

**Severity.** `error`. The double outlives the test that installed it, and under `isolate: false` it
outlives the file.

## prefer-stub-response

**`error`** · no fix · syntax only

**Reports.** A `Response` written by hand for a stubbed `fetch`: an object literal cast to
`Response` — `{ ok: true, json: async () => data } as Response`, the double cast
`as unknown as Response`, or the angle-bracket `<Response>{ … }` — and a
`createMock<Response>(…)` / `createAutoMock<Response>(…)` call.

**Decides on.** Two facts written on the line: the type an assertion names, and the type argument a
helper is handed. Nothing here needs a program, which is what
[`no-sync-testbed-await`](#no-sync-testbed-await) relies on for the same reason. The cast is read
through its own nesting, so `as unknown as Response` is one report rather than none.

One discrimination keeps it honest: `Response` has to resolve to the **global**. A name the file
imports (`import { type Response } from 'express'`) or declares (a generated client's envelope, a
domain type of the same name) has a binding with a definition and is never reported — for those
`stubResponse` builds the wrong object, so naming it would be wrong advice. A binding with no
definitions is the global too, which is what `languageOptions.globals` puts in scope for a project
that declares its environment.

**Finding, and the repair.**

```ts
vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => user } as Response); // ❌
```

```ts
vi.spyOn(globalThis, 'fetch').mockImplementation(async () => stubResponse({ body: user }));
```

**Why it is recommended.** The literal answers the two or three members its author thought of and
`undefined` for every other one — `status`, `statusText`, `headers`, `url`, `text()`,
`arrayBuffer()`, `clone()`. The cast is what makes that compile, and it is also what hides it: the
code under test reads one of those, takes a branch on `undefined` that the real response could never
have produced, and the test is green on a path that does not exist. It is the defect the strict
preset exists to catch, except that a plain object literal is not a double the library knows about,
so no guard was watching. [`stubResponse`](/utilities/setup#answering-a-stubbed-fetch-—-stubresponse)
builds the platform's own `Response`, so every member is real.

**Limits.** A double built behind a factory is out of reach, the same limit
[`no-structural-double`](#no-structural-double) has: `buildResponse()` returning the cast literal is
reported where the cast is written and nowhere else. A `Response` assembled member by member onto a
`const` with a type annotation is not a cast and is not reported either.

**Severity.** `error`. The evidence is the line, the repair is a helper this package ships, and
there is no migration to gate — a suite that already builds its responses with `stubResponse` sees
nothing.

## prefer-settle-dynamic-import

**`error`** · suggestion · syntax only

**Reports.** A dynamic `import()` the spec itself waits for, written in a test body or a hook:
`await import('./thing')`, the destructured `const { Thing } = await import('./thing')`, and
`import('./thing').then(…)`.

**Decides on.** Two facts in the file. What is on the `import()` — an `await` parent, or a `.then`
member call — and which function it sits in: the report is made only where the innermost enclosing
function is the runner's own callback (`it`, `test`, `beforeEach`, `beforeAll`, `afterEach`,
`afterAll`, in their `.only`, `.skip` and `.each` spellings). No program, the same footing
[`no-sync-testbed-await`](#no-sync-testbed-await) stands on.

That one reading is what settles every exemption, because each shape where the helper is the wrong
advice puts a function of its own between the callback and the import: a `vi.mock` / `vi.doMock`
factory, a lazy route's `loadComponent` / `loadChildren` in a fixture the spec hands to the router,
a callback the spec gives the code under test, and `settleDynamicImport`'s own `() => import(…)`. A
module-scope `import()` has no enclosing callback at all.

**Finding, and the repair.**

```ts
// The click handler does `await import('./exit-from-app.component')` and then opens the dialog.
button.click();
await import('./exit-from-app.component'); // ❌
expect(dialog.open).toHaveBeenCalled();
```

```ts
button.click();
await settleDynamicImport(() => import('./exit-from-app.component'));
expect(dialog.open).toHaveBeenCalled();
```

The suggestion wraps the `import()` where it stands and adds the import of the helper, merging the
specifier into an existing `vitest-auto-spy` import when the file has one.

**Why it is recommended.** Awaiting the same specifier does wait for the **module** — the registry
is shared, so the spec's `import()` resolves against the instance the code under test is already
loading. It does not wait for that code's own continuation: the lines after _its_ `await`, which are
the ones that open the dialog, set the signal or navigate, are queued behind the loader's microtask.
The assertion therefore reads the state one turn early. Such a test is green only while the
continuation is short enough to have drained by accident, and it turns red the day somebody adds a
line to it — a flake with no bad line in it.
[`settleDynamicImport`](/utilities/event-loop#settledynamicimport-load-turns) is the same load
followed by `flushEventLoop(turns)`, which is the turn that continuation needs; `fakeAsync` /
`tick()` / `flushMicrotasks()` cannot stand in for it, because they drive Angular's zone queues and
the module loader is not one of them.

Measured on an Angular monorepo of 2 030 spec files: **81 reports across 32 files**, and what makes
the rule worth having is what sits beside them. Four of the reports in one file carry a hand-written
`await Promise.resolve()` under the import — a `flushEventLoop(1)` spelled out — and eleven more
sites of the same shape had already been moved into spec-local helpers called `flushCodeInputChunk`,
`settleAccountPickerImport`, `settleModalImports`, `settleModalComponentImport` and
`flushLazyImport`, two of them with a loop of five `await Promise.resolve()` under the import. The
suite had rewritten this helper by hand eleven times before the rule existed, which is also why the
limit below is a limit rather than a gap: those eleven are exactly the shape the rule declines to
read.

**Limits.** Two, and both are the same reading declining to guess. A spec-local
`const load = async () => { await import('…'); }` is **not** reported: a named function whose body
awaits an import is written identically whether the spec calls it itself or hands it to the code
under test as a loader, and for the second `settleDynamicImport` would be wrong advice — nothing in
the file settles which it is. And a callback something other than the runner invokes is out of
scope for the same reason, `it('x', waitForAsync(async () => …))` included. Neither is silent about
a defect the rule can prove; both are a rule that reports only what one file settles.

A namespace bound as the **first** statement of a test or a hook — `const api = await import('./index')`,
`ns = await import('@scope/lib')` in a `beforeEach` that then spies on it — is not reported either.
Nothing in that callback has run whose continuation could be pending: the spec is fetching a module
to read it, and the better repair is a static `import * as ns`. A bare `await import(…)` in the same
position is still reported, since it can only be waiting on something a hook set loading. Behind an
arrangement line — `configure(…); const { run } = await import('./run')` — the binding is reported:
that line is written the same way as the `button.click()` that sets the module loading, and the
rule cannot tell the two apart. Where the spec only reads the exports, the better repair is a static
`import`; the `settleDynamicImport` the message names still works there.

**Severity.** `error`. The evidence is the line, the repair is one line the rule offers as an edit,
and there is no migration to gate — adopting it is not a decision a suite takes file by file, the
way [`prefer-set-inputs`](#prefer-set-inputs) is. It does not arrive at zero on a large suite the
way [`prefer-stub-response`](#prefer-stub-response) did, and that is the argument for `error` rather
than against it: 81 one-line findings in 32 of 2 030 files, each of them a test that waits for the
wrong thing.

## prefer-create-mock

**`warn`** · suggestion · syntax only

**Reports.** An object literal under a cast to a named type, in either spelling:
`{ id: '1', isOffline: false } as Device` and `<Device>{ id: '1' }`.

**Decides on.** Two facts written on the line — the cast's operand is an object literal, and the
type it names is a reference. No program, the same footing
[`prefer-stub-response`](#prefer-stub-response) and [`no-sync-testbed-await`](#no-sync-testbed-await)
stand on.

**Finding, and the repair.**

```ts
// `Device` declares eight fields and `isOffline` is not one of them.
const device = { id: '1', name: 'TV', isOffline: false } as Device; // ❌
expect(service.rename).toHaveBeenCalledWith({ ...device, name: 'Box' });
```

```ts
const device = createMock<Device>({ id: '1', name: 'TV' });
expect(service.rename).toHaveBeenCalledWith({ ...device, name: 'Box' });
```

The suggestion wraps the literal where it stands and imports `createMock`, merging the specifier
into an existing `vitest-auto-spy` import when the file has one, and otherwise writing the new line
directly above the file's `vitest-auto-spy/*` imports, inside the group an `import/order` expects it
in. Every fix and suggestion of the plugin that adds an import places it the same way.

Nested fixture casts are one finding, reported on the outermost: `{ inner: { id: '1' } as Inner } as
Outer` draws a single report, and its suggestion unwraps the inner cast too, since the `createMock`
seed is checked against `DeepPartial<Outer>` at every depth. Before that, a literal left inside the
seed was exempt from the rule and stayed unchecked. A cast behind a function
(`make: () => ({ … }) as Item`) is not part of the seed and keeps its own report; `as const` and a
cast of anything but a literal are left as written. It stays a suggestion, not a `--fix` — see
`DECISIONS.md`, 2026-09-21.

**Why it is recommended.** A cast is not an assignment. `as T` asks whether the two types _overlap_,
not whether the value is one of them, so it passes both directions an assignment refuses: the
excess-property check is skipped, so a key `T` does not declare goes through, and a required field
the fixture never sets goes through too. Neither type gate says anything — that is the point of the
cast — and the object is then spread into the expected payload of a call assertion or handed to the
code under test, so the spec pins a key the contract does not have, or covers a branch the real
value could never reach. `createMock<T>` takes a `DeepPartial<T>` and answers a value typed `T`: the
fields it does not name stay `undefined` at run time exactly as they did under the cast, and the
excess key becomes a compile error on the literal.

Measured on an Angular monorepo of 2 032 spec files: **1 200 reports across 327 files**, naming 217
distinct types. Two facts from the same measurement are worth carrying. **None** of those 1 200
literals contains a `vi.fn()` — so on that suite the rule and the hand-rolled-double rules
([`prefer-create-spy-from-class`](#prefer-create-spy-from-class),
[`no-structural-double`](#no-structural-double)) never report the same line; they are about
collaborators and this one is about data. And **529** of the reports sit in a slot that already has
a type — a call argument, a `nextWith`, a `mockReturnValue` — where the cast is not load-bearing at
all but is switching off the check that slot would have done; there the first repair is to delete
the cast and let the slot check the literal, with `createMock<T>` for whatever partial is left.

**Where it stays silent.**

- `as const`, which narrows a literal rather than claiming a type for it.
- `as unknown` and `as any` — neither names a type to build a fixture of — and the double cast
  `{ … } as unknown as T` built from them. The hop through `unknown` is there precisely because the
  compiler refused the single cast, so `createMock<T>` would not compile either; it is a different
  finding, with a ban of its own in most consumers.
- A cast of anything that is not a literal: `raw as Device`, `load() as Device`, `[{ … }] as Device[]`.
- A cast to an inline object type, `{ … } as { id: string }`, which the compiler already reads.
- A literal inside one of this library's own factories — `createMock<Outer>({ inner: { … } as Inner })`,
  a `provideAutoSpyForToken` seed, a `provideRouterDouble` bag. The recommended shape must not be a
  violation of the rule that recommends it.
- The type names another rule owns: `Response` ([`prefer-stub-response`](#prefer-stub-response)),
  `Spy` ([`prefer-as-spy`](#prefer-as-spy)) and Vitest's `Mock` / `Mocked` family
  ([`no-mocked-for-spy`](#no-mocked-for-spy), [`no-mock-cast`](#no-mock-cast)). A line drawing two
  reports is a line a reader has to arbitrate.

**Limits.** The rule reads no types, so it cannot tell a fixture that has drifted from one that
happens to be complete — it reports the cast, and the compiler decides afterwards which of the two
it was. That is the trade: the report is cheap and the evidence arrives on the next type-check. A
type name that is a utility (`Partial<T>`, `Pick<T, …>`, `Record<…>`, `ReturnType<typeof f>` — 25 of
the 1 200 above) is reported like any other; `createMock<Partial<T>>({ … })` compiles and still
checks the keys, but a cast to `Partial<T>` in a slot that is already `Partial<T>` is usually just
redundant, and deleting it is the better repair. A fixture that is invalid **on purpose** — a
`linkType: 'INVALID_TYPE'` fed in to cover the fallback branch — is what the cast is for: the
suggestion does not compile there, which is the compiler confirming it, and the cast stays with an
`eslint-disable-next-line` that says why.

**What the message leaves out.** Where the literal already sits in a typed slot — an argument, a
`nextWith`, a typed `const` — the first repair is to delete the cast and let the slot check it. A value
outside `T` on purpose, the `null` a backend sends or a payload that has to reach a guard, is
`outOfType<T>(…)`, which names the intent and is not reported.

**Severity.** `warn`, and it is the repair that is graded rather than the evidence — the same
reading as [`prefer-set-inputs`](#prefer-set-inputs), not the heuristics behind
[`no-structural-double`](#no-structural-double). The finding is exact: the literal and the type it
claims are both on the line. What is graded is the migration. Accepting the suggestion lets the
compiler read that literal, so every fixture that has drifted turns red the same day, and on the
suite above that is 1 200 sites in 327 files — a first upgrade nobody lands in one branch. `off`
would be the wrong end of the same mistake, which is why the plugin pins `warn` rather than leaving
it unset.

## no-mock-cast

**`error`** · suggestion · syntax only

**Reports.** A cast to Vitest's `Mock` or `MockInstance` over a **member access**:
`TestBed.inject(Metrics).send as Mock`, `(shelves.getByGid.mockReturnValue as Mock)(…)`, and the
`<Mock>svc.load` spelling. A parameterised `Mock<[string], void>` reports too.

**Decides on.** The type name, the shape under it, and where the name comes from. The operand has to
be a member access — a plain `fn as Mock` over a local `vi.fn()` is nobody's double and is left
alone — and `Mock` has to resolve to a named import from `vitest`, `@rstest/core`, `bun:test` or
`jest`, or to no binding at all, which is what a project with ambient runner types has in scope. A
`Mock` the file declares, or imports from anywhere else, is somebody's domain type and is never
reported.

**Finding, and the repair.**

```ts
(TestBed.inject(AppMetricsService).sendEvent as Mock).mockReturnValue(undefined); // ❌
expect(TestBed.inject(AppMetricsService).sendEvent).toHaveBeenCalledWith(payload);
```

```ts
injectSpy(AppMetricsService).sendEvent.mockReturnValue(undefined);
expect(injectSpy(AppMetricsService).sendEvent).toHaveBeenCalledWith(payload);
```

The suggestion writes `injectSpy(Token).member` whenever the token is in view — the member chain
hanging off a `TestBed.inject(Token)` written in place, or off a name the file settled with one —
and imports `injectSpy` from `vitest-auto-spy/angular`. It is offered rather than applied, and the
reason is not the type system: `injectSpy` answers the double the container was _given_, so the
rewrite is only right when that double is one this library built. A spec that provided a hand-rolled
`{ provide: X, useValue: { m: vi.fn() } }` gets a run-time throw instead of a compile error, which
is the one failure mode an unattended fix may not have —
[`no-unregistered-inject-spy`](#no-unregistered-inject-spy) is what reports an accepted suggestion
that landed on such a double.

**Why it is recommended.** `Mock` with no parameters is `Mock<any>`. The cast does not _add_ the spy
surface, it removes the signature: from there on `mockReturnValue` accepts anything, and
`toHaveBeenCalledWith` compares nothing — the assertion keeps passing when the code under test calls
the method with the wrong arguments. That is the same drift 5.19.0 exposed from the other side when
`accessorSpies` became typed, and the repair costs nothing, because the member already _is_ a spy
and is already typed from the real signature.

The worst form gets its own message: `(shelves.getByGid.mockReturnValue as Mock)(of(shelf))` puts
the cast on the member that installs the answer, so neither the value going in nor the method's own
return type is checked by anything, and every assertion downstream is about a value the real
collaborator could not have produced.

Measured on an Angular monorepo of 2 032 spec files: **24 reports across 21 files** — 22 of the
ordinary form and 2 of the configuration form, 22 of the 24 under `libs/**`. Fifteen carry the
`injectSpy` edit; the rest name the repair without writing it.

**What the neighbours do not cover.** [`no-mocked-for-spy`](#no-mocked-for-spy) reads a `Mocked<T>`
_declaration_ and [`prefer-as-spy`](#prefer-as-spy) a cast to `Spy<T>` — both are about naming the
whole double's surface, and neither sees a `Mock` standing in for one member's signature.
[`no-structural-double`](#no-structural-double) wants a name declared as an object of `Mock`s, and
[`no-stub-class-double`](#no-stub-class-double) a class of `vi.fn()` fields; both are about a double
being built, where this one is about a double that already exists being read through a cast.

**What the message leaves out.** A member of a double this library built is already a spy typed
from the real signature: read it as it is — `injectSpy(Service).method` for one DI handed out,
`asSpy(double).method` for one the test holds. `vi.mocked(object.method)` is for a `vi.spyOn` spy or
a `vi.fn()` on something else. Where the cast went in because a value would not compile, look at the
method: an overloaded one is typed against its last signature, and
`Spy<Service, { overload: { method: 'first' } }>` picks the one the code calls. A parameterised
`Mock<[…], R>` is the signature written a second time, in a place nothing keeps in step.

**Severity.** `error`. The evidence is the line, the repair is offered as an edit, and the
population is small enough to clear in one sitting — 24 sites on a 2 032-file suite, against the
1 200 of [`prefer-create-mock`](#prefer-create-mock), which is why the two rules of one family are
graded differently.

## no-redundant-mock-reset

**`error`** · `--fix` where the deletion is provably a no-op, otherwise a suggestion · syntax, plus
the runner's configuration

**Reports.** A mock reset the runner is already configured to perform between tests —
`vi.clearAllMocks()`, `vi.resetAllMocks()`, `vi.restoreAllMocks()` and the per-mock `mockClear()` /
`mockReset()` / `mockRestore()` — where nothing the file wrote has run since the runner's own: the
first statement of a `beforeEach` that no other `beforeEach` precedes, or a clear as the last
statement of an `afterEach`.

**Decides on.** Two things, and the second one is what makes this rule different from every other
rule here.

- **The call**, read off the callee — nothing more.
- **What the runner resets**, which is not in the file being linted. The options come first:

  ```js
  'vitest-auto-spy/no-redundant-mock-reset': ['error', { clearMocks: true, restoreMocks: true }],
  ```

  Given at all, they are the answer. With no options the rule searches upwards from the linted
  file's directory for `vitest.config.*` / `vite.config.*` / `vitest-base.config.*` — the last is the
  name `runnerConfig: true` of `@angular/build:unit-test` resolves — and reads the first one it finds **as
  text**, looking for `clearMocks: true`, `mockReset: true` and `restoreMocks: true`. Nothing is
  evaluated and no module is loaded: a lint run has no business executing a project's config, and
  these three values are literals in every config that sets them. **With neither an option nor a
  config found, the rule reports nothing at all.**

  **A config that leaves `clearMocks` out gets Vitest's default for it, and that default depends on
  the version.** Up to Vitest 4 it is off; from Vitest 5 it is on. The rule reads the installed major
  from the nearest `node_modules/vitest/package.json` above the linted file: on Vitest 5 or later a
  found config (or a `configFile`) without `clearMocks` counts it on, so a `vi.clearAllMocks()` or a
  `mockClear()` opening the first `beforeEach` is reported, and the message says the flag is the
  default rather than something the config wrote. On Vitest 4 and older, or where no Vitest is found,
  nothing changes: an unnamed `clearMocks` is off. A `clearMocks` the config names as anything but a
  literal `true` — `false`, an expression — reads as off on every version. The flags written as the
  rule's options are not defaulted: what they leave out is off, whatever Vitest is installed.

  A runner config at a path the search does not look for is named instead, and read the same way:

  ```js
  'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'tools/unit-test-bench/vitest-runner.config.ts' }],
  ```

  The path is absolute or relative to the directory ESLint runs in; a flag written beside it wins
  over the file, and a `configFile` that does not exist fails the lint run by name rather than
  leaving the rule silent.

  **A config built somewhere else is read only as far as its own text.** In
  `export default createProjectConfig({ alias })`, or a `mergeConfig(base, …)` whose `base` lives in
  another module, the flags are set in a file the rule never opens. Its text names no `clearMocks`,
  so up to Vitest 4 the flag reads as off and the rule stays silent, and from Vitest 5 it reads as
  the default — on — even where the factory turns it off. `npx vitest-auto-spy doctor` notes a
  `configFile` like that as
  [`mock-reset-config-unread`](/utilities/cli#mock-reset-config-unread). Write what the factory sets
  beside the path:

  ```js
  'vitest-auto-spy/no-redundant-mock-reset': ['error', { configFile: 'vitest.config.ts', clearMocks: true }],
  ```

**The flag has to match the call, not the family.** The three options are not three grades of one
thing, and reading them that way is how a rule like this turns into a rule that deletes lines a
suite needs.

| the runner option | what the runner calls between tests | which mocks it reaches                    |
| ----------------- | ----------------------------------- | ----------------------------------------- |
| `clearMocks`      | `vi.clearAllMocks()`                | every mock — forgets the recorded calls   |
| `mockReset`       | `vi.resetAllMocks()`                | every mock — and drops the implementation |
| `restoreMocks`    | `vi.restoreAllMocks()`              | **only** the spies `vi.spyOn` installed   |

So `vi.restoreAllMocks()` in a hook is **not** redundant under `clearMocks: true` alone, and
`vi.clearAllMocks()` is not redundant under `restoreMocks: true` alone — `restoreAllMocks` walks the
originals `vi.spyOn` replaced and never sees a plain `vi.fn()`. Two subsumptions are provable and
are the only ones used: `resetAllMocks` resets every registered mock, which includes clearing it;
and `restoreMocks` covers a **per-mock** `mockClear` / `mockReset` / `mockRestore` where the file
shows the receiver is a `vi.spyOn` spy — a `const spy = vi.spyOn(api, 'load')`, a `let` a hook fills
once, or the call written inline. Where the receiver is a plain `vi.fn()`, or a name written more
than once, nothing is reported.

**`setupAutoSpy({ restoreMocks })` is not the runner's `restoreMocks`.** The runner restores in
`onBeforeTryTask`, before each test; `setupAutoSpy` restores in an `afterEach`, after it. They are
not interchangeable for this rule: a restore in a `beforeAll` or ahead of the first test is covered
by the runner's option and by nothing `setupAutoSpy` does. Do not pass `{ restoreMocks: true }` to
the rule because the setup file calls `setupAutoSpy({ restoreMocks: true })` — only the runner
config's flag says what happens between tests.

**Finding, and the repair.**

```ts
beforeEach(() => {
  vi.clearAllMocks(); // ❌ under `clearMocks: true` the runner did exactly this a moment ago
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
});
```

Delete the line, and the hook with it where that is all the hook held.

**Where it looks, and why so narrowly.** Vitest resets in `onBeforeTryTask`, which runs **before**
every test's `beforeEach` chain — and never after a test. Three consequences, each of them a report
5.23.0 made and this rule no longer does:

- **Whatever ran first is what the reset undoes.** Between the runner's reset and a statement inside
  a `beforeEach`, the statements above it in the same hook have run, and so has every `beforeEach`
  of an enclosing `describe` — wherever it is written — and every earlier one beside it. A spy one of
  them installed, or the calls an arrangement made, are exactly what a `spy.mockRestore()` or a
  `mockClear()` there takes away, and on the consumer below deleting such a line failed the tests
  under it. So a `beforeEach` reset is reported only as the first statement of a hook no other
  `beforeEach` precedes; one inside a sibling `describe` does not count.
- **After a file's last test nothing resets until the file is over.** Vitest calls
  `vi.restoreAllMocks()` once more at the file boundary, after every `afterAll` — so until then the
  `afterEach` hooks of enclosing `describe`s and every `afterAll`, the setup file's included, run
  with the last test's spies on `window`, `document` or a prototype still installed. A restore or a
  reset in `afterEach` / `afterAll` is what takes them off, and is never reported; only a clear, as
  the last statement of an `afterEach`, is.
- **`beforeAll` runs before the runner's first reset**, so a reset there protects the hook's own
  body and repeats nothing.

The edit is applied only in a file that holds no other `beforeEach` and no `beforeAll`; everything
else is a suggestion, which an editor shows and a human accepts. A statement alone on its line takes
the line with it.

**A reset in the middle of a test body is never reported.** That is a different thing entirely:
there the call separates one arrangement from the next inside one test, and no runner option does
that. The same suite holds **445 such calls in 132 files** and the rule is silent on every one of
them, by construction rather than by exception — the report is made only where the innermost
function around the call is the hook's own callback, so a reset inside an `onTestFinished(…)` the
hook registers, inside an `if`, or inside a helper the hook calls is outside the rule as well.

**Limits.** The search finds a runner config only where it is named the way the ecosystem names it.
The suite above keeps its runner config at `tools/unit-test-bench/vitest-runner.config.ts`, chosen
by the `@angular/build:unit-test` builder, so the search misses it entirely; `configFile` names it,
which keeps the flags in the one file that sets them instead of a copy in the lint config that has to
be kept in step by hand. A project that would rather not have its disk read at lint time passes the
flags as options, which skips the search.

**Severity.** `error`, and the argument is the silence: a project that has said nothing gets nothing
reported, so the rule cannot be wrong about a suite it knows nothing about. Where it does fire, the
evidence is a flag the project set and a call that repeats it, and the repair is a deletion the rule
either makes or offers. It is also the one rule here whose finding is pure cost — the line does
nothing — which is the easiest kind of report to act on.

## no-unasserted-argument

**`warn`** · no fix · syntax and scope only

**Reports.** A bare `expect(spy).toHaveBeenCalled()` in a test where the **file itself** shows the
arguments are the point, on one of two readings.

**Decides on.** Nothing outside the file, and nothing a type checker knows.

1. **The same subject is pinned with `toHaveBeenCalledWith` in another test of this file.** The
   author has already written down that the arguments of that call are part of the contract; this is
   the site where they did not. A test that asserts both on the same subject is left alone — there
   the arguments _are_ checked and the bare line is merely redundant.
2. **The title of the test says `with`, and the body asserts nothing else.** Then the whole of what
   the test claims is an argument list, and the whole of what it checks is that something ran. Any
   assertion that is not another bare `toHaveBeenCalled()` silences this reading, because that
   assertion may be where the arguments are checked — an equality on a result, a count, and a chain
   the rule cannot read to the end (`resolves`, `rejects`) all count. A `with` that belongs to the
   name of the asserted method is not read: `it('dismisses with action …')` over
   `expect(ref.dismissWithAction).toHaveBeenCalled()` names the method, not an argument list.

Two subjects are the same subject when the **source text** of what `expect()` was handed is the
same, whitespace aside. `expect(api.load)` and `expect(loadSpy)` are therefore two subjects even
where they are one spy. Two names are read through what they hold, because tests declare their own
under a generic name: a `spy` holding `vi.spyOn(obj, 'm')` is that member whatever the variable is
called, and a `vi.fn()` is nobody but itself — so the `const spy = vi.spyOn(dialog, 'close')` of one
test is not the `const spy = vi.spyOn(logger, 'info')` of the next. The rule misses findings that way
and invents none, which is the trade it is built on.

**Finding, and the repair.**

```ts
it('emits rowFocused with the host element', () => {
  component.onFocus();

  expect(component.rowFocused.emit).toHaveBeenCalled(); // ❌ "with the host element" is untested
});
```

```ts
expect(component.rowFocused.emit).toHaveBeenCalledWith(host.nativeElement);
```

`expect.objectContaining({ … })` and `expect.any(Type)` cover the part of an argument the test does
not decide, `toHaveBeenCalledExactlyOnceWith(…)` where once is part of the claim, and a double this
package built takes [`mustBeCalledWith(…)`](/core/control-helpers) at the point it is configured,
which fails at the call rather than after it. A method that takes no arguments has nothing to name;
pin the count instead, with `toHaveBeenCalledOnce()` or `toHaveBeenCalledTimes(n)`.

**Why it is narrow, and why that is the whole point.** The blunt version of this rule already
exists: `vitest/prefer-called-with` reports **every** bare `toHaveBeenCalled`. It is not in its
plugin's `recommended`, and on the 2032-file suite this one was measured against it reports **1941
times across 360 files** — a number nobody acts on and everybody turns off. The two readings above
report **175 times in 90 files** on the same tree: 151 on the first reading and 24 on the second.
Both are the file disagreeing with itself, which is a finding; the other 1766 are a style opinion,
which is not.

The strongest single pair on that suite is two tests in one file whose bodies are identical and
whose titles differ only in which argument the call is said to carry — the difference their titles
promise does not exist in the code, and nothing but this rule would say so.

**What is deliberately not reported.** `expect(spy).not.toHaveBeenCalled()`, which is a claim about
the call and not about its arguments — there are no arguments to name. `toHaveBeenCalledTimes`,
`toHaveBeenCalledOnce` and the other counting matchers, which assert something the bare one does
not. And a bare call standing beside an assertion on a result: under the second reading that
assertion silences the test outright, and under the first it does not, because the file has already
said the arguments of _that subject_ matter. Nor a subject whose last member is
`preventDefault`, `stopPropagation` or `stopImmediatePropagation`: those `Event` methods take no
arguments, so "…ignores events with `metaKey`" over `expect(event.preventDefault).toHaveBeenCalled()`
promises nothing the assertion could add. The rule has no type information, so it reads the name.

**Severity.** `warn`, and it is graded on what its repair needs rather than on its evidence. Both
readings are facts out of the file, the way every `error` here decides — but the repair is the
argument list the test should have named, and that is the one thing the rule cannot supply. Every
`error` in this plugin either carries an edit or names a helper; this one carries a question for the
author. A project that has answered them turns it up in the same line that turns the others down.

## prefer-provide-activated-route

**`error`** · no fix · syntax only

**Reports.** A provider of `ActivatedRoute` that is not the library's route. Five forms, and four of
them are slots of one descriptor: a `useValue` object (written in place or parked in a name above
the TestBed), a `useClass`, a `useFactory`, a `useExisting`. The fifth is a call:
`provideAutoSpy(ActivatedRoute)`, which reports for a reason of its own — a spy reads the prototype,
and every half of an `ActivatedRoute` lives in an instance field, so the spy has none of them.

**Decides on.** The `provide:` value naming the class, read as written — the same last resort the
token rules use, without a resolver round-trip to the file that declares it. The exemption is the
library's own spelling of the same route: a descriptor that mentions `createActivatedRoute(…)`
anywhere in its subtree, or whose `useValue` is a name — plain, `.route` off one, or destructured —
whose declaration or single write is that factory call.

**Finding, and the repair.** The shapes are transcribed from a monorepo of 11 000+ spec files where
42 providers of a hand-built route sit across 36 of them:

```ts
// A lone snapshot — the component reading `route.params` gets `undefined`.
{ provide: ActivatedRoute, useValue: { snapshot: { queryParams: { ['q']: 'mock' } } } }

// An empty object — a route whose every read is `undefined`.
{ provide: ActivatedRoute, useValue: {} }

// A spy factory — the prototype has none of the instance fields a route keeps.
{ provide: ActivatedRoute, useValue: createSpyFromClass(ActivatedRoute, { observablePropsToSpyOn: ['queryParams'] }) }

// A factory assembling the halves one by one.
{
  provide: ActivatedRoute,
  useFactory: () => {
    const mock = { snapshot: { params: {} } };
    mockReadonlyPropGetter(mock, 'params', () => of({}));
    return mock;
  },
}
```

The repair is a drop-in replacement of the reported line, and the handle is what drives the test:

```ts
import { injectActivatedRoute, provideActivatedRoute } from 'vitest-auto-spy/angular-router';

TestBed.configureTestingModule({
  providers: [provideActivatedRoute({ params: { id: '1' } })],
});

const route = injectActivatedRoute();

route.setParams({ id: '2' }); // the streams emit, the snapshot already agrees
```

**Why it is recommended.** `ActivatedRoute` is the one collaborator where the obvious mock is wrong
in a way a green test hides. The real class keeps `snapshot`, `params`, `queryParams`, `data`,
`fragment` and `url` in instance fields over one state record, and a hand-built double knows
whichever half its author read first — the component that reads the other half gets `undefined`,
and a spec that sets `snapshot.params` without emitting `params` tests a route no navigation can
produce. `provideActivatedRoute()` builds Angular's own class over one state record, so the halves
cannot disagree, and its setters move them together mid-test in the order and with the equality a
navigation uses.

**Limits.** A suite that provides a real routed setup — `RouterTestingModule`, a real `Router` the
spec navigates — does so without a descriptor for the route and is not reported. A spec that
deliberately wants half a route keeps it under a per-line disable. The rule reads the name, so a
project-local class that happens to be called `ActivatedRoute` is reported too; the answer there is
the same as for any name collision — rename one of them.

**The two route rules agree.** [`prefer-provide-auto-spy`](#prefer-provide-auto-spy) reads the
`ActivatedRoute` token as well — in a provider descriptor and in `TestBed.overrideProvider` — and on
it names `provideActivatedRoute()` rather than `provideAutoSpy`. A descriptor both rules see is two
reports of one repair, where it used to be two reports of opposite ones.

**Severity.** `error`. Every report has a `provide:` naming the route class beside it, so there is
no heuristic in the decision, and what it reports is a double whose halves a passing test keeps
apart.

## no-passthrough-console-spy

**`error`** · suggestion · syntax only

**Reports.** `vi.spyOn(console, m)` — or `jest.spyOn`, or `globalThis.console` / `window.console` as
the object — for a method that writes, whose spy nothing in the file gives an implementation.

**Decides on.** The chain and the name, both read without types. A call chained straight onto the
spy (`.mockImplementation(…)`, `.mockImplementationOnce(…)`, `.mockReturnValue(…)`,
`.mockReturnValueOnce(…)`, after any number of `.mockName(…)`-style links) settles it. When the spy
lands in a name — a `const`, or a `let` a hook assigns — every other mention of that name is read
through the scope manager: one of those four calls settles it, `expect(spy)`, `spy.mock.calls`,
`spy.mockRestore()` and a direct call only read it, and anything else — the spy passed to a helper,
returned, aliased, put in an array — is somewhere the rule cannot follow, so it stays silent. The
method has to be a literal the console writes through: `time`, `groupEnd` and `countReset` write
nothing, and a computed name is not knowable. A `console` the file declares itself is not the global
one and is left alone; a `console` the config lists under `globals` is.

**Finding, and the repair.**

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

The suggestion is the smaller edit — `.mockImplementation(() => undefined)` appended to the
`spyOn` call — and it is a suggestion rather than a fix because an implementation changes what the
spy does, which is a decision about the test.

**Why it is recommended.** A spy with no implementation calls through: the line is recorded **and**
printed. Under [`setupAutoSpy({ strayConsole })`](/utilities/setup) that fails the test as stray
output, and without the guard it is the noise that buries the next real failure in the run log. The
spec reads as though it silenced the console, which is why nobody goes looking.

**Limits.** A spec that spies on the console to watch what it prints _and_ wants the output in the
log is reporting working code; a per-line disable says so. Measured on an Angular monorepo of 1 759
spec files: **0** reports — the one `vi.spyOn(console, …)` it has already carries an implementation.

**Severity.** `error`. It decides on a fact, not a heuristic: nothing in the file gives the spy an
implementation, so the output is there.

## no-console-in-spec

**`error`** · no fix · syntax only

**Reports.** A call of a console method that writes — `log`, `info`, `warn`, `error`, `debug`,
`trace`, `table`, `dir`, `dirxml`, `group`, `groupCollapsed`, `timeLog`, `timeEnd`, `count`,
`assert` — on the global `console` (also through `globalThis.console` / `window.console`), and any
assignment to a member of it.

**Decides on.** The callee and the scope manager. The object has to be the global console — a
`console` the file declares is somebody's fake and is left alone — and a call has to name a method
that writes; a computed member is not knowable and is skipped. A mention that is not a call —
`expect(console.error).toHaveBeenCalled()`, `register(console.warn)` — is a read, and reads are never
reported. An assignment is reported whatever the member, `console.time = …` included.

**Finding, and the repair.**

```ts
httpClient.get(url).subscribe({
  error: (error) => console.error(error), // ❌ the spec prints
});
```

```ts
httpClient.get(url).subscribe({ error: () => undefined }); // ✅ the failure is what the test arranged
```

A spec that prints either left a debugging line behind — delete it — or is exercising code whose
logging it should absorb through `installConsoleSpies()` and assert on. And for an assignment:

```ts
console.warn = vi.fn(); // ❌ never put back
vi.spyOn(console, 'warn').mockImplementation(() => undefined); // ✅ restored after the test
```

**Why it is recommended.** The call prints by definition, so under
[`setupAutoSpy({ strayConsole })`](/utilities/setup) it fails the test; the rule moves that failure
to the editor. The assignment is the worse of the two: nothing restores it, so under `isolate: false`
every later file of the worker inherits a console that prints nothing, and what that hides depends on
which file ran first.

**Limits.** Scope it to spec files — a CLI's own `console.log` is its output. Measured on an Angular
monorepo of 1 759 spec files: **6 reports in 2 files**, every one a `console.error` inside a
`subscribe` error callback, and no assignment anywhere.

**What the message leaves out.** A replacement by assignment can also be kept and made safe:
`installConsoleSpies()` from `vitest-auto-spy/console` in a `beforeEach`, with `restoreConsole()` in
an `afterEach`.

**Severity.** `error`. It decides on a fact: a call on the global console writes, and an assignment
to it is never undone.

## no-import-time-console-spies

**`error`** · no fix · syntax only

**Reports.** An import of `vitest-auto-spy/console` — a bare side-effect import, a namespace import,
or a named import of any `console*Spy` constant — in a file that never calls `installConsoleSpies()`.

**Decides on.** The import declarations and every call in the file. A call to `installConsoleSpies`
anywhere — bare, as a member, or handed to a hook as `beforeAll(installConsoleSpies)` — means the file installs the spies itself and the import is only
where the names come from, so nothing is reported. An import of `installConsoleSpies`, the types or
`restoreConsole` alone does not lean on the import-time install and is left alone.

**Finding, and the repair.**

```ts
import { consoleErrorSpy } from 'vitest-auto-spy/console';

// ❌ installed by whichever file imported it first
```

```ts
import { type ConsoleSpies, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

let consoleSpies: ConsoleSpies;

beforeEach(() => {
  consoleSpies = installConsoleSpies(); // ✅ this file's tests, and nobody else's
});

afterEach(() => restoreConsole());
```

`beforeAll` with `afterAll` is the same repair for a suite that shares one server or fixture across
its tests, and `installConsoleSpies()` once at the top of the file is the smaller one when every test
of the file expects output. The exported constants and the bag are the same objects, so an existing
`expect(consoleErrorSpy)` keeps working.

**Why it is recommended.** The import installs the spies on the first evaluation of the module, and
under `isolate: false` that happens once per worker: the spies go on in whichever file imported
them first and silence every later file of the worker, and nothing in any of those files takes them
off. What that hides depends on file order. Measured on an Angular monorepo of 1 759 spec files: 39
files import the entry and **32** of them never call `installConsoleSpies()` (6 of the 32 are bare
side-effect imports). The moment three files started calling `restoreConsole()` in an `afterEach`,
12 tests in 5 other files failed and output the global silence had hidden surfaced in 7 files. Under
[`setupAutoSpy({ strayConsole })`](/utilities/setup) the import installs nothing at all, so the rule
and the guard agree about where the install belongs.

**Limits.** A setup file that imports the entry to silence the console for the whole run on purpose
is reporting working code; it is not a spec, so scope the rule to spec files.

**Severity.** `error`. It decides on a fact: the import installs once per worker, and nothing in
the file installs or removes the spies.

## prefer-provide-auto-spy

**`error`** · fix · syntax only

**Reports.** A provider whose `useValue`, `useFactory`, `useClass` or `useExisting` hands DI a
hand-rolled service double — in a `providers` array, or through `TestBed.overrideProvider` — and
`{ provide: X, useValue: createSpyFromClass(X, config) }`, which is `provideAutoSpy(X, config)`
written out.

**Decides on.** A `provide` key names the token (or, at an override call, argument 0 does), and the
double is read one of four ways round — which is the interesting part:

- **`useValue` is read up to the function boundary.** The value may be the object literal itself or
  a name, and a name is followed one step to the value the file settles it with — an initialiser
  (`const nav = { go: vi.fn() }`) or a single later assignment (`let nav; beforeEach(() => { nav = { go:
vi.fn() }; })`). Both spellings had to be read, and each was measured on a suite that reported
  none of them: eight doubles declared above the TestBed and passed by name in one, and in another
  an entire 170-file shard whose every `provideAutoSpy` opportunity was the `beforeEach` form. From
  the _second_ write on the name is left alone — what it holds at the use site then depends on run
  order, which no rule reading one file can decide. A single `vi.fn()` anywhere in that subtree is
  enough — one method is a service double when there is a `provide:` next to it — and the walk stops
  at every function, because a `vi.fn()` behind an arrow is created per call, which is the shape the
  rule steers towards. A property whose value is a name the file binds once to a `vi.fn()` counts
  too — `useValue: { open }` over `const open = vi.fn()`.
- **`useFactory` is read _through_ the function.** A factory's whole body is what DI ends up
  holding. Missing that let three layers of fiction hide behind one line —
  `useFactory: vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }))`, a structural double
  with no relation to the class, and a double cast to make it fit.
- **A `useValue` that calls `createSpyFromClass`** is read by the class it reads, not by what is in
  it. `provideAutoSpy(X, config)` returns `{ provide: X, useValue: createSpyFromClass(X,
config) }` and nothing else, so a literal spelling that out is the factory with the token written
  twice — and this is the one arm that carries a **fix**: the literal becomes the call, the
  arguments are carried across as source text, `provideAutoSpy` is imported (into the
  `vitest-auto-spy/angular` import the file already has, when it has one), and a `createSpyFromClass`
  import the rewrite orphans is dropped. The fix stands down where the rewrite would not be a
  transposition: explicit type arguments (`createSpyFromClass<T, Options>` takes two,
  `provideAutoSpy<T>` one), a third property in the literal, or a `provideAutoSpy` the file declares
  itself. A spy read from a **different** class is not reported at all — see _Limits_.
- **`useClass` and `useExisting` are read as a class the linted file declares** (5.5.0), and so is a
  `useValue: new StubMock()` — the same double instantiated by hand, which the object reading could
  never see because it answers for an `ObjectExpression` and a `new` expression is not one. One
  `vi.fn()` field is enough, for the same reason it is enough in a `useValue`: the `provide:` proves
  the class is a service double. A class the file does not declare — imported from a shared
  `*.mock.ts`, reached through a namespace — resolves to nothing and is not reported, and the four
  exemptions of [`no-stub-class-double`](#no-stub-class-double) apply here too. The two slots differ
  in what Angular constructs — `useClass` builds an instance per injector, `useExisting` aliases the
  token — and in neither case does that change the repair, which is why they share a message.

**`TestBed.overrideProvider(X, { … })` is the same substitution from outside the array**, and until
5.5.0 no rule here read it: the `provide:` key is not there, the token is argument 0. On one
consumer's 1759 spec files there are 61 override calls in 36 files, 33 of them handing over an
object literal. A call whose second argument is **not** an object literal is left entirely alone —
`.overrideProvider(X, provideAutoSpy(X, { … }))` is the idiom to aim for and 28 of those 61 calls
already are it, because `provideAutoSpy` returns `{ provide, useValue }` and `overrideProvider`
reads the `useValue` off it. That call site gets a message of its own, since what differs there is
not which factory to reach for but where the configuration goes, and one case is not a defect at
all: a component that declares the token in its own `providers` cannot be reached by a module-level
provider, so the override stays and only what it hands over changes.

Which of two messages you get turns on whether the thing provided is a **token**: settled outright
by a `new InjectionToken<…>(…)` initialiser the resolver can reach, and otherwise by the name — a
token is nearly always imported from the file that declares it, so `^[\dA-Z_]+$` is what is left to
read. This matters because the advice differs: `provideAutoSpy` reads a class prototype, a token has
none, and recommending it on one does not compile. Three migration batches got the wrong
recommendation before the split existed; in one of them 6 of 8 reports were on tokens.

**`ActivatedRoute` gets a message of its own.** Where the provider the rule was going to report —
in a `providers` array or at a `TestBed.overrideProvider` — provides `ActivatedRoute`, the repair it
names is `provideActivatedRoute()` from `vitest-auto-spy/angular-router`, not `provideAutoSpy`. The
reason is [`prefer-provide-activated-route`](#prefer-provide-activated-route)'s whole subject: the
class keeps `snapshot`, `params`, `queryParams`, `data`, `fragment` and `url` in **instance** fields,
so a spy built off its prototype has none of them and every read is `undefined` until the spec seeds
it one by one — the same half-route the hand-written `useValue` was. Nothing about the rule's reach
changes; it reports exactly the shapes it reported before and only the advice differs. That arm
carries no fix, because the replacement is a different double rather than the same one spelled
shorter.

A `multi: true` registration is exempt outright. `provideAutoSpy` builds one double for a token and
takes no registration mode, so the replacement would silently turn an accumulating provider into an
overriding one — there is nothing to recommend, so nothing is said.

**Finding, and the repair.**

```ts
providers: [{ provide: CartService, useValue: { total: vi.fn(), add: vi.fn() } }]; // ❌

class CartServiceMock {
  total = vi.fn().mockReturnValue(0);
  add = vi.fn();
}
providers: [{ provide: CartService, useClass: CartServiceMock }]; // ❌ — and the stub class goes too
```

```ts
providers: [provideAutoSpy(CartService)];
// a member the double must *be* rather than spy on goes in the options:
providers: [provideAutoSpy(ConfigService, { overrides: { flagsConfig: { theme: 'dark' } } })];
// and for a token, which has no class to read:
providers: [provideAutoSpyForToken(LOGGER, undefined, { selfReturning: ['channel'] })];
```

**Why it is recommended.** The same drift as
[`prefer-create-spy-from-class`](#prefer-create-spy-from-class), one DI hop away, and harder to
read: the failing line is in the component, the double is in the module configuration, and the type
system said nothing because a `useValue` is typed `any`.

**`{ provide: LocalStorage, useValue: createSpyFromClass(BaseLocalStorage) }` is silent on purpose.**
The token is an abstract class and the spy reads an implementation of it, because an abstract
prototype carries none of the methods the double needs — `provideAutoSpy(LocalStorage)` would spy
nothing at all. There is no shorter spelling of that provider, so there is nothing to report: on the
suite this arm was measured against it is 51 sites in 41 files, every one of them working code. A
call parked in a name (`const cart = createSpyFromClass(Cart)`, `useValue: cart`) is left alone for
a different reason — the double is configured through that name afterwards, so the repair is
`provideAutoSpy(Cart)` plus an `injectSpy(Cart)` at every use, which is a rewrite of the file.

**Limits.** The token heuristic is a name test, so a class written in SCREAMING_CASE is told to use
`provideAutoSpyForToken` and a token named like a class is told to use `provideAutoSpy` — both are
one word wrong in a message rather than a false finding. The `useValue` read follows a name exactly
one step and only while a single write settles it, so a double assembled by a local helper, or a
`let` two hooks write to, is not followed and not reported. The `useClass` read needs the class
declaration in the linted file: a stub class living in a shared `*.mock.ts` is provided the same way
and reported by nobody, which is the one part of this gap that stays open. The override arm reads
only a literal descriptor, so a hand-rolled double handed over by name
(`.overrideProvider(X, descriptor)`) is missed — deliberately, because the shape it shares with
`.overrideProvider(X, provideAutoSpy(X))` is exactly the one that must not be reported.

**Where the rule does _not_ run is worth checking before concluding it is blind.** One migration
shard reported ~100 `vi.fn()` invisible to the plugin across six shared `*.service.mock.ts` files, a
provider factory each: `export function providePaymentsMock(): Provider { return { provide: X,
useValue: new XMock() }; }`. The rule reads that perfectly — run over those 84 `*.mock.ts` files it
reports 9 in 9 — and the reason nothing appeared is that the consumer scopes this config to
`**/*.spec.ts`, as [the plugin page](./eslint-plugin.md) tells you to. A suite that keeps fixtures
next to the specs wants `['**/*.spec.ts', '**/*.mock.ts']`.

**Severity.** `error`, and it is the loudest rule here on a suite that has never run it: measured on
one consumer's 1771 spec files, the long-form arm alone adds **91 reports in 49 files** to a suite
that was already clean against `recommended` — all 91 fixable, at most 8 in one file, so
`eslint --fix` clears them in a single run. On that consumer's earlier 1759 spec files, 154 reports across 87 files — 100 `useValue`, 28 of them behind a
token, 20 stub classes and 6 at an override call. Most of that is the name-following: the same
doubles were previously reported, at `warn`, by [`no-structural-double`](#no-structural-double),
whose message recommends `createAutoMock<T>()` — the right answer for a double _without_ DI and the
wrong one here. Nothing about the evidence is heuristic, which is what keeps this at `error`: every
one of those reports has a `provide:` or an override token beside it. Landing it on a suite this
size is [the gradual recipe](./eslint-plugin.md), not a severity change.

## prefer-inject-spy

**`error`** · suggestion · syntax only

**Reports.** `vi.spyOn(…)` over the instance DI handed back — inline (`vi.spyOn(TestBed.inject(X), 'm')`)
or in two steps, with the instance parked in a `const` first.

**Decides on.** The first argument is either a `TestBed.inject(…)` call or a name whose initialiser
is one, resolved in the scope the name is _used_ in rather than the one it is declared in. The
two-step form is the common half of the pair: both were found on adjacent lines of one file, and
only the inline one used to be reported.

The suggestion is offered only when nothing has to be invented: the `inject` call takes the token
alone (`TestBed.inject(X, null, InjectFlags.Optional)` is not translated, because `injectSpy` takes
the token alone and dropping the rest would change which instance comes back), the method name is a
string literal that can be written after a dot, and `injectSpy` is not already bound to something
else. It is never a `--fix`: whether the token really is provided with `provideAutoSpy` is decided
in another file.

**Finding, and the repair.**

```ts
TestBed.configureTestingModule({ providers: [provideAutoSpy(BillingPlansService)] });

const service = TestBed.inject(BillingPlansService);
vi.spyOn(service, 'getPlans'); // ❌ replaces the auto-spy's method with a plain vi.fn()
```

```ts
injectSpy(BillingPlansService).getPlans.nextWith(['PRO']);
```

**Why it is recommended.** This is one line that quietly undoes a provider. `vi.spyOn` replaces one
method and leaves the rest real, and the method it installs is a plain `vi.fn()` — so the
per-method helpers the rest of the spec is written against are gone from that one method:
`TypeError: spy.getPlans.nextWith is not a function`, on a line that reads like ordinary spy setup.

**Tokens it says nothing about.** Five of them, and none is a matter of taste — for each one the
advice above is either impossible or it deletes the reason the spec injected the object:

- `DestroyRef` cannot be substituted at all. It carries `__NG_ENV_ID__`, and `R3Injector.get()`
  answers `token[NG_ENV_ID](this)` on its first line — _before_ it reads its own records — so
  `{ provide: DestroyRef, useValue }` is accepted, ignored, and never mentioned again. It is the
  only class in `@angular/core` carrying that flag, which is why the rest of this list is argued
  differently.
- `ApplicationRef` is the harness. `TestBed` drives change detection through it, and a spec that
  creates a component by hand reads the renderer out of `ApplicationRef.injector`. The shape that
  works is the real instance with `attachView` / `detachView` spied, so nothing is attached.
- `Injector` and `EnvironmentInjector` answer _other_ dependencies. Spied, `get()` returns a spy for
  every token resolved after it, and the substitution propagates to everything the code under test
  looks up lazily.
- `HttpClient` already has a framework double: `provideHttpClientTesting()` swaps the backend and
  hands the spec a `HttpTestingController`. A spy on `get` there reads the options the caller
  passed, on the way to a request the controller still flushes.

Node-injector tokens (`ElementRef`, `Renderer2`, `ChangeDetectorRef`) are deliberately absent:
`TestBed.inject()` cannot hand any of them back, so an entry would exempt a line nobody can write.

**Options.** One, and it extends that list rather than replacing it:

```js
'vitest-auto-spy/prefer-inject-spy': ['error', { ignoreTokens: ['MapRendererService', 'WINDOW_REF'] }],
```

Tokens are compared as **source text**, the way [`no-unregistered-inject-spy`](#no-unregistered-inject-spy)
compares them — a rule that reads one file has no identity to compare. An aliased import
(`import { DestroyRef as NgDestroyRef }`) therefore misses the built-in list and is reported; naming
it in `ignoreTokens` settles that.

**Limits.** An ordinary `vi.spyOn` over an object the spec owns is not reported, and neither is one
over a name the rule cannot prove came from `TestBed.inject`. The reverse case — a spec that
deliberately spies one method of a real service, having provided the real service on purpose — is
still reported. `ignoreTokens` is the answer when the reason belongs to the token and outlives this
one line; a per-line disable is the answer when it belongs to this one test.

**Severity.** `error`. Red without the rule, and the message points at the helper rather than at the
`spyOn` that removed it.

## no-unregistered-inject-spy

**`error`** · no fix · syntax only

**Reports.** `injectSpy(X)` for a token nothing in the file registered as an auto-spy.

**Decides on.** Name resolution over the whole file, and three preconditions that make it stay
quiet. Registrations counted: a `provideAutoSpy(X)` call anywhere, and a `{ provide: X, useValue: … }`
whose value is a call to `createAutoMock`, `createSpyFromClass`, `createMock` or `mockDeep`. Tokens
are compared as **source text**. Nothing is reported unless all three hold:

- the file calls `provideAutoSpy` at least once — otherwise it configures DI in some way this does
  not model, and a missing token says nothing;
- no `providers` array holds a spread, a hole, or a provider factory other than `provideAutoSpy`.
  `providers: [...sharedMocks]` is the ordinary way to pull in a shared mock module, and one
  unreadable entry hides an unknown number of tokens — so it silences the **file**, not the line;
- the file does not call `createWithAutoSpies`, `renderShallow` or `TestBed.overrideProvider`, each
  of which registers doubles somewhere this scan does not look.

A token provided by hand — `{ provide: X, useValue: someObject }` — is recorded as _provided but
unreadable_ and never reported. That is [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)'s
shape.

**Finding, and the repair.**

```ts
TestBed.configureTestingModule({
  imports: [RouterTestingModule], // provides a real ActivatedRoute
  providers: [provideAutoSpy(UserService)],
});

const route = injectSpy(ActivatedRoute); // ❌ the real one, with spy helpers that are not there
```

```ts
providers: [provideAutoSpy(UserService), provideAutoSpy(ActivatedRoute)];
// or say that the real one was the point:
const route = TestBed.inject(ActivatedRoute);
```

**Why it is recommended.** `injectSpy` is declared to return `Spy<T>`, so every helper on the result
type-checks against the declaration rather than against the value. The helpers are therefore present
for `tsc` and absent at run time, and the first `.mockReturnValue(…)` or `.calledWith(…)` throws on
a real method. The library does say this at run time — `injectSpy` checks what the injector handed
back and warns — but a warning on stderr does not fail a run, scrolls past in a suite of a thousand
files, and arrives only for the tests that executed the line. In one consumer monorepo dozens of
spec files print it on every CI run and it has never been acted on.

**Limits.** This is one of the rules that can report on a correct project, and it has **no option**.
The narrow case it cannot model is a file that registers some doubles in the readable shape and
obtains another through a helper this scan does not follow — a shared `beforeEach` in an imported
test utility that configures the TestBed. There the answer is a scoped `'off'` or a per-line
disable. Everything else that could hide a registration already silences the file, so what survives
the filter is usually a real finding.

**Severity.** `error`. Red by construction when the line executes, and the type checker is on the
wrong side of it.

## prefer-render-shallow

**`warn`** · suggestion · syntax only · option `templates`

A shallow render moves the component's AOT branches out of coverage for the rest of the file; see
[renderShallow](/adapters/angular) before applying the suggestion across a suite gated on branch
coverage, and keep one real render per component where those branches matter.

**Reports.** Under the default `{ templates: 'as-needed' }`, a `TestBed.createComponent` in a file
where nothing reads the rendered template. Under `{ templates: 'never' }`, every
`TestBed.createComponent` and every `keepTemplate: true`.

**Decides on.** The identifiers of the **whole file**, not the fixture the call returned. The words
are `nativeElement`, `debugElement`, `elementRef`, `hostElement`, `queryElement`, `querySelector`,
`getComputedStyle`, `triggerEventHandler`, `innerHTML`, `innerText`, `textContent`, `getAttribute`,
`classList` and `shadowRoot`, matched inside an identifier or member name (so a `nativeElementOf()`
helper counts too), plus `By.css` and `By.directive`. One read anywhere silences the file.

Only code counts. A comment, a string or template literal, and a member the spec **declares** rather
than reads — the key of `{ getAttribute: 'nope' }`, a field or method of a fake class, an interface
member — spell the word and read nothing, so none of them silences the file. A destructuring
`const { nativeElement } = fixture` and a computed `el['textContent']` are reads and do.

Asking the file rather than the fixture is deliberate. A component suite parks the fixture in a
`let`, fills it in `beforeEach` and reads `debugElement` three helpers away; following one variable
would miss those shapes, and a rule that reports on half of them is worse than one that reports on
none. So the rule **under-reports by construction** and never claims a spec reads nothing when it
does.

One shape is subtracted before the question is asked, because it silenced the rule on exactly the
file it exists for. A spec that swaps `location` or `defaultView` provides a `DOCUMENT` stand-in
delegating the rest to the real document — `querySelector: document.querySelector.bind(document)` —
and every key it copies over is one of the words above. Only the `name: document.name` shape is
dropped, and only where the two names match: that is a delegation and can be nothing else. A bare
`document.querySelector('.row')` still counts, because a fixture attached to the document is read
exactly that way.

Under `{ templates: 'never' }` the read scan is not run at all; the only exemption is a file whose
code calls or imports `createDirectiveHost`, because a directive attaches to an element and something has to
render that element.

**Finding, and the repair.**

```ts
const fixture = TestBed.createComponent(CartPage); // ❌ compiles the template, builds every child
fixture.componentRef.setInput('items', items);
fixture.detectChanges();

expect(fixture.componentInstance.total()).toBe(42);
```

```ts
const { fixture } = renderShallow(CartPage);
// same TestBed, same real ComponentFixture, children dropped and template blank;
// inputs, signals, lifecycle hooks and DI all stay
```

**Why it is recommended.** Not a defect — a bill. `TestBed.createComponent` compiles the template
and instantiates the whole child subtree once per test, and a spec that only sets inputs and asserts
on state buys nothing with it. Measured in `bench-angular/` against a committed baseline, per-test
cycle relative to `TestBed.createComponent`: **0.57×** at 25 children, **0.24×** at 100, **0.05×**
at 400. Blanking the template alone — the step from `renderShallow({ keepTemplate: true })` to
`renderShallow()` on the 100-child component — is worth about **3.8×** of that.

**Read the zero-children row before the others.** At zero children there is nothing to save; the two
measurements straddle 1.0 and that row is the noisiest in the benchmark (±16 % against ±3 % for the
100-child one), partly because `overrideComponent` forces a JIT recompile a leaf component was not
paying for. On a leaf component this report is worth ignoring.

**Limits.** Two things the rule cannot see, and both have the same answer. A component that reads its
own template through `viewChild`, `contentChild` or content projection needs the template to exist;
so does one whose behaviour is driven from its own markup — an event binding, a `@defer` block. The
rule reads the spec, not the component, so it reports these; `renderShallow(X, { keepTemplate: true })`
keeps the template and still drops the children.

The option turns a cost finding into a policy:

```js
'vitest-auto-spy/prefer-render-shallow': ['warn', { templates: 'never' }],
```

`'never'` is for a project that has decided markup belongs to e2e, and it reports the policy rather
than a claim about the file — under it the file reported loudest is usually the one that reads the
template hardest. **Know the bill before turning it on.** Measured on one consumer suite: `'never'`
took **18 of 40** tests in a component spec red and coverage from **100 % to 95.7 %**. Nothing fell
out of the report; what stopped executing was ordinary TypeScript — the body of a method whose entry
condition is a `viewChild` the template supplies. A project taking this option gives up a 100 % line
threshold on its components.

The suggestion **folds the setup** rather than swapping one call, and is deliberately not a
`--fix`. `renderShallow` calls `configureTestingModule` itself and runs the first change detection,
so a bare `TestBed.createComponent(X)` → `renderShallow(X).fixture` swap kept the spec's own
`configureTestingModule` in front of it and every `injectSpy` between the two: applied to 49 files
it broke 17 with _Cannot configure the test module when the test module has already been
instantiated_, and rendered early wherever no `fixture.detectChanges()` followed. It is offered
only for this shape, all in one block:

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

The literal may hold only `providers` and `imports`, and `imports` must list the component, which
is dropped from it. The only statements allowed between the two calls are bare `v = injectSpy(…)`
reads, and they move below the render. A `fixture.detectChanges()` directly under the render is
absorbed; without one the call gets `detectChanges: false`, so nothing renders earlier than it did.
The import merges into an existing `vitest-auto-spy/angular` import. Any other shape is reported
without an edit: a chained `compileComponents()`, a key `renderShallow` spells differently, a
configured spy between the calls, a comment the edit would delete, the two-argument
`createComponent`.

**Severity.** `warn`, and the only one of the three graded severities that is graded on the _kind_
of finding rather than on the evidence behind it. Every other rule names something wrong or dead;
this one names a file that could render more cheaply, which is an architectural choice a suite makes
rather than a defect it has. At `error` the plugin would gate
that choice: **491 findings across 398 of one consumer's 1759 spec files** — a `recommended` that
exists to be overridden. `off` would be the wrong end of the same mistake, so the value is pinned
rather than merely kept below `error`.

## prefer-set-inputs

**`warn`** · suggestion · syntax only

**Reports.** A run of `fixture.componentRef.setInput('name', value)` statements on one fixture — one
report for the run, on its first call. A `componentRef` the file binds once to `<fixture>.componentRef`
(`const componentRef = fixture.componentRef`, or a `let` a hook assigns) is followed to its fixture,
which the edit then names — as long as that fixture is the same binding where the call is.

**Decides on.** The shape of the call, and nothing outside the file:

- The receiver has to read as a `ComponentFixture`. `<name>.componentRef` carries most of that — a
  bare `ComponentRef`, which is what `ViewContainerRef.createComponent()` hands back and where
  `setInputs` does not apply, has no `componentRef` of its own — and the name (`fixture`,
  `hostFixture`, `newFixture`) or the single value the file gives it (`TestBed.createComponent(X)`,
  `renderShallow(X).fixture`, `render(X)`) carries the rest. A receiver neither settles is left alone.
- The input name has to be a string literal. A computed name is not a key a rewrite can spell.
- The call has to be a statement of its own: a result that goes anywhere is an effect this rule
  cannot account for.
- A run continues while the statements are adjacent with no comment between them, on the same
  fixture, and naming inputs the run has not set yet. **The same input twice ends it** — that is a
  spec saying "and now it changes", and merging the two into one literal is a duplicate key.

**Finding, and the repair.**

```ts
it('shows the updated title', async () => {
  fixture.componentRef.setInput('title', 'Hi'); // ❌ an unknown name is an NG0303 and no change
  fixture.componentRef.setInput('count', 2);
  fixture.detectChanges();

  expect(heading().textContent).toBe('Hi (2)');
});

it('shows the updated title', async () => {
  await setInputs(fixture, { title: 'Hi', count: 2 }); // ✅ every name resolved before the first write

  expect(heading().textContent).toBe('Hi (2)');
});
```

**Why it is recommended.** `componentRef.setInput` answers a name the component does not declare with
an `NG0303` on the console and **no change at all**, so a typo, an input renamed under the spec, or an
alias written as its class-field name all end in green `setInput` calls and an assertion that fails
several lines later, on state nothing moved. `setInputs` resolves every key against the compiled
definition before it writes the first one, and it types the value: on the Angular suite this was
measured against, taking the 650 calls it can rewrite turned **72 fixtures that had drifted from the
model they claim to be into compile errors, across 21 files** — a `{}` for a `CardActionExtra`, a
literal still written in the previous shape of an interface, an `imageUrl` for a model whose field is
`imgUrl`.

**Limits.** Three of them, and the first is the reason the edit is a suggestion rather than a `--fix`:

- **`setInputs` awaits `stable()`, which begins with `TestBed.tick()`**, and under zone.js that tick
  re-enters the one the zone schedules for itself. Measured on the 1771-file consumer: accepting all
  451 suggestions rewrites 126 files, 105 of which still type-check — and **57 of those 105 go from
  green to red**, every one on `NG0101: ApplicationRef.tick is called recursively`. Probed down to two
  lines there: `componentRef.setInput(…)` followed by a bare `TestBed.tick()`, no helper and no
  `await`, reproduces it. Whether the repair is a drop-in therefore depends on a fact no spec file
  shows, so it is offered one call at a time, next to the test that says whether it held.
- The `await` makes the enclosing callback `async`, which this rule will only write into a callback
  the runner owns — `it`, `test`, `beforeEach` and the rest, spelled bare. Inside a helper the spec
  declares, or a `waitForAsync(…)` wrapper, the report arrives without the edit: 53 of the 504
  findings on that suite.
- A `detectChanges()` directly under the run goes with it, because `stable()` flushes effects and
  awaits the fixture, which is strictly more than one change-detection pass. One carrying an argument
  stays: `detectChanges(false)` skips the check-no-changes assertion, which is not the pass `stable()`
  runs.

**Severity.** `warn`, and graded on what the repair costs rather than on what the report says. The
finding itself is a fact in the line — Angular checks that name against nothing — and it has no
heuristic in it. But the rule reports **504 times across 140 files** on a suite that is green under
every `error` rule here, and the mechanical repair is the one measured above: adopting it is a
migration a project takes file by file, which is the same reading that grades
[`prefer-render-shallow`](#prefer-render-shallow). A zoneless suite turns it up to `'error'` in the
one line everything else here is turned down in.

A suite whose lint forbids an `async` hook keeps the call in the test instead — a
`const render = async () => { …; await setInputs(fixture, { … }); }` awaited first thing in each
`it`.

## no-overridden-provider

**`error`** · suggestion (duplicates only) · syntax only

**Reports.** A provider that a later provider for the same token buries — in the same array, or from
a `TestBed.overrideProvider` call in the same suite. Four messages, because the halves of the field
data are not the same defect.

**Decides on.** One walk of the array, right to left, because the provider Angular keeps is the
last: the first registration met for a token is the survivor, and everything met afterwards is dead
and knows what buried it. A token registered three times reports the first two. Tokens are compared
as source text — two spellings of one token would be missed and one spelling of two tokens would be
a false positive, and neither happens in a `providers` array, where the token is written once by
name next to the double it stands for. Both shapes count as registrations: an object with a
`provide` key, and a call to `provideAutoSpy` / `provideAutoSpyForToken`.

Which message depends on how the two compare:

- **`duplicateProvider`** — the two are written identically. Deleting the earlier one cannot change
  behaviour, because Angular had already ignored it, so this is the one shape that comes with an
  edit (a suggestion, not a fix: deleting a line of a `providers` array is not something to discover
  in a diff).
- **`overriddenByBarerProvider`** — the survivor configures _less_. Configuration is counted by an
  options object's entries rather than as one thing, so `provideAutoSpy(A, { gettersToSpyOn, instanceMethodsToSpyOn })`
  scores 2 against a bare call's 0. Nothing can be deleted for you here, because which of the two to
  keep is the whole question.
- **`noOverriddenProvider`** — two different providers, and the later one wins.
- **`overriddenByTestBedOverride`** (5.5.0) — the buried provider survived its own array and is then
  replaced by a `TestBed.overrideProvider` for the same token. Order is not read at all: an override
  wins over a module provider whenever it runs, which is what makes this decidable from the source in
  the first place.

**The override arm is deliberately narrow, and each condition earned its place on the consumer's own
files.** The two halves are never in one expression — the registration is inside
`configureTestingModule`, the override a statement or a chained call after it — so they are collected
across the file and matched at the end, on three conditions:

- **the same suite, compared by identity.** An override inside a nested `describe` replaces the
  provider only for the tests of that block, so a registration in the enclosing suite is still what
  every other test gets and is not dead. The consumer has that exact shape.
- **the override must be written where every test of the suite reaches it** — directly in a
  `beforeEach` / `beforeAll`. One file registers three tokens and overrides each of them from a
  helper that three of its thirty-four tests call, and for the other thirty-one the registration is
  what ran.
- **not a `providers` array below a decorator**, which belongs to a component declared in the spec
  rather than to the testing module. Reaching a component-level provider is the documented use of
  `overrideProvider`, not a defect.

A suite that calls `TestBed.resetTestingModule()` is exempt outright, for the reason
[`no-inject-before-override`](#no-inject-before-override) exempts one, and a registration the array
itself already buried is reported once rather than twice.

`multi: true` is exempt, and has to be: Angular **accumulates** multi providers rather than keeping
the last, so a spec asserting that two `BEFORE_INIT` hooks run in registration order needs both and
either report could only be silenced with a disable over a working test. `multi` is read as "present
and not written as `false`", so an unresolvable flag (`multi: isFeatureOn`) is treated as multi — a
missed report costs nothing, a false one costs a disable comment. Mixing the two modes for one token
is still reported, because Angular refuses that pair at run time with
`Cannot mix multi providers and regular providers`.

**Finding, and the repair.**

```ts
providers: [
  provideAutoSpy(DisplaySettingsService), // ❌ never runs
  { provide: DisplaySettingsService, useValue: mockDisplaySettings }, // this is what DI hands out
];
```

```ts
providers: [provideAutoSpy(DisplaySettingsService)]; // keep one
```

**Why it is recommended.** Both halves of that pair mislead, in opposite directions. The author
believes they have an auto-spy and writes assertions against one — `calledWith`, a method the class
has and the hand-rolled object does not — while the double actually injected is the hand-rolled one.
And whoever comes to migrate the hand-rolled double sees the `provideAutoSpy` beside it and reads
the work as done. Eight tokens in one spec file were registered both ways at once. The verdict
depends on the rest of the file, which is why a rule is worth having rather than a runtime check:
read the token back with `injectSpy` and the run is red with
[a diagnostic naming the cause](/adapters/angular); read it back with `TestBed.inject` and assert
against the hand-rolled double — which is what the file that prompted this rule did — and everything
passes while the `provideAutoSpy` above it never ran.

**Limits.** One array at a time, plus the override calls of the same suite. A token provided in
`configureTestingModule` and again in a component's own `providers` is a different problem, and
[`assertNoShadowedProviders`](/adapters/angular-overrides) is the tool for it. A `providers` array
built by concatenation, or a token spelled differently in the two entries, is not compared. The
override arm reads only what a suite says lexically: an override reached through a helper is not
matched at all, which is the trade taken to keep the arm free of the one false positive it can have.

**Severity.** `error`. Green and wrong wherever the surviving double happens to answer, and the
override arm is small enough to land at that severity: measured on one consumer's 1759 spec files,
9 reports in 5 files, every one of them a configured `provideAutoSpy(X, { … })` buried by a barer
provider for the same token — the spy the spec set up is not the spy it got.

## no-inject-before-override

**`error`** · no fix · syntax only

**Reports.** A call that instantiates the testing module, written in a `beforeAll` or `beforeEach`,
in a suite that also calls one of `TestBed.override*`.

**Decides on.** Five spellings of the instantiation and six of the override, and a question that is
deliberately **order-free**. Instantiating: `TestBed.inject`, `TestBed.createComponent`,
`TestBed.runInInjectionContext`, and — this package's own — a bare `injectSpy(…)` or
`renderShallow(…)`. Leaving the last two out is what kept the rule silent on exactly the file the
rest of the plugin had just rewritten: an `injectSpy` in `beforeEach` above a
`TestBed.overrideComponent`, failing at run time and reported by nothing. Overriding:
`overrideComponent`, `overrideDirective`, `overrideModule`, `overridePipe`, `overrideProvider`,
`overrideTemplateUsingTestingModule`.

Lexical order is not run order — an `override*` written above the hook, inside a helper the tests
call, still runs after it — so the question asked is "does this suite override at all", with the one
exemption that can be read off the source: an `override*` in the same hook body, _before_ the
injection, really does run first. A suite that calls `TestBed.resetTestingModule()` is exempt
outright; that is the documented way to put the module back, and a spec using it has already thought
about this.

**Finding, and the repair.**

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
  injectSpy(Api).load.mockReturnValue(of(page)); // configured after every override
});
```

**Why it is recommended.** This is the trap the rest of the plugin walks people into, which is the
argument for a rule of its own. A hand-rolled `{ provide: X, useValue: { m: vi.fn(() => 1) } }`
configures its return values in the literal; replace it with `provideAutoSpy(X)` as
[`prefer-provide-auto-spy`](#prefer-provide-auto-spy) asks and there is nowhere left to put them, so
the line lands in `beforeEach` and every `override*` in the file stops working with
`Cannot override provider when the test module has already been instantiated`. Found twice
independently, once for sixteen tests at a stroke, both times after a migration.

**Limits.** Order-free means it reports a suite where the order happens to be fine — an `override*`
inside a helper that is only called from a test that resets the module first, for instance. Keeping
the access lazy (`const api = () => injectSpy(Api)`) moves the instantiation into the first test and
silences the rule honestly. The `injectSpy` selector matches a bare callee only, so the
two-argument `injectSpy(moduleRef, token)` of `vitest-auto-spy/nestjs` — which reaches no TestBed —
is not reported.

**Severity.** `error`. Red, and the message names the override rather than the hook that broke it.

## no-dead-schemas

**`error`** · no fix · syntax only

**Reports.** A `schemas` entry in a `TestBed.configureTestingModule({ … })` literal in a file whose
configurations declare nothing.

**Decides on.** The **file**, not the call. Angular merges successive `configureTestingModule` calls
before the module is instantiated, so `schemas` in one hook and `declarations` in another is a live
schema written in two statements; the rule collects every literal configuration and stays silent for
the whole file as soon as any of them declares something. A list it cannot count — a spread, a name,
a helper call — is read as _present rather than empty_, because "cannot count" has to mean "there is
one": the alternative is reporting a live schema because the declarations arrived through a variable.
Only `TestBed.configureTestingModule` with an object literal is read.

`TestBed.overrideComponent` and `overrideModule` are outside the rule entirely, and that is a
decision the tests pin. A schema added there is compensating a real removal the spec made on purpose,
and taking it away stops the template compiling. Checked over one suite: of 41 specs that combine an
override call with a schema, the rule reports none of the override blocks. Equally, a
`remove: { imports: … }` is **not** read as "this file declares something" — in every such file the
module-level `schemas` was dead as well, and removing it left the specs green.

**Finding, and the repair.**

```ts
await TestBed.configureTestingModule({
  imports: [FooterComponent], // standalone — carries its own dependency scope
  schemas: [NO_ERRORS_SCHEMA], // ❌ applies to nothing
}).compileComponents();
```

```ts
await TestBed.configureTestingModule({
  imports: [FooterComponent],
}).compileComponents();
// then put the missing directive into the standalone component's own imports,
// or render it through createDirectiveHost({ template, scope: [...] })
```

**Why it is recommended.** A schema is a property of the module's `declarations`. `NO_ERRORS_SCHEMA`
tells the compiler to stop complaining about unknown elements in the templates of the components the
module _declares_; a standalone component brought in through `imports` carries its own scope and the
schema never reaches it. So nothing is being silenced — whatever the schema was added for is still
unresolved — and this is not a green-and-wrong test. What the line costs is **a false sense of
protection**: `NO_ERRORS_SCHEMA` is the commonest way to make `NG8001` go away, so a spec carrying it
reads as "unknown elements are excused here" to everyone who opens it, and the day somebody adds
`declarations` the same line starts working and a typo in a template quietly stops being an error.
Measured over one Angular suite: of 333 files mentioning a schema, **230 entries in 204 files** are
dead.

It is the static twin of [`enableAngularDiagnostics({ deadSchemas })`](/adapters/angular-diagnostics),
and both are worth having. The diagnostic knows more — it can see that an `imports` entry really is
a standalone component — but it throws inside `it()`, so a suite yields its list one red run at a
time. The rule reads one object and hands over all 204 files at once, which is what a cleanup is
planned from.

**Limits.** There is no autofix on purpose, and this is the rule where that matters most. Applied to
one suite it cleaned **85 files and 107 entries with no spec failing** — and the one edit that went
wrong went wrong silently: a `schemas:` line inside an `overrideComponent` block was deleted along
with the reported one because the two read identically, and six tests died on
`NG0303: Can't bind to 'collapsed' since it isn't a known property`. Neither the compiler nor ESLint
had anything to say about it. Drop the `NO_ERRORS_SCHEMA` import only when nothing else in the file
still uses it, and verify with a run rather than with a green lint.

**Severity.** `error`. The finding is a dead line, so nothing breaks today; what it earns is the
cleanup being planned once instead of discovered a template typo at a time.

## no-mistyped-use-value

**`error`** · no fix · **needs `parserOptions.project`**

**Reports.** An object literal with a `provide` and a `useValue`, where `provide` is an
`InjectionToken<T>`, `T` is primitive-like, and the value is not assignable to `T`.

**Decides on.** The type checker, and nothing else. The token's type has to be named
`InjectionToken`; its first type argument is primitive-like when every member of the union is a
string, number, boolean, bigint, an enum, a literal of one of those, `null` or `undefined`. Then the
checker is asked whether the value's type is assignable to it. Without a program — no
`parserOptions.project` / `projectService` — or on a TypeScript whose checker does not expose
`isTypeAssignableTo`, the rule says nothing rather than guessing.

**Finding, and the repair.**

```ts
export const IS_PLATFORM_BROWSER = new InjectionToken<boolean>('IS_PLATFORM_BROWSER');

providers: [{ provide: IS_PLATFORM_BROWSER, useValue: {} }]; // ❌ compiles, and {} is truthy
providers: [{ provide: IS_PLATFORM_BROWSER, useValue: false }]; // ✅ the value the token declares
```

The message names the token and both types — `IS_PLATFORM_BROWSER expects boolean, but useValue is
{}` — because the repair is a value of the declared type, and which one is the spec's decision.

**Why it is recommended.** Angular types `useValue` as `any`, so nothing compares it with the
token, and whatever injects the token gets the value unchanged. An object where a `boolean` is read
is truthy: the spec runs down the branch it meant to switch off and still passes. Measured on an
Angular monorepo: 259 providers of primitive-typed tokens across 179 spec files, 2 of them mistyped —
both this `{}` for a `boolean` token.

**Limits.** Object-typed tokens are out of scope on purpose: their `useValue` is usually a partial
fixture, and `createMock<T>()` is the typed tool for that — reporting every one would be hundreds of
findings nobody should have to rewrite. Their **keys** are checked, by
[`no-unknown-use-value-key`](#no-unknown-use-value-key), which never compares values. A class token (`provide: SomeService`) is left to
[`prefer-provide-auto-spy`](#prefer-provide-auto-spy). Only an object literal is read, so
`TestBed.overrideProvider(TOKEN, { useValue })` is not.

**Severity.** `error`. It decides on a fact — the checker's answer that the value does not fit the
declared type. It is not in `configs.typeErrors`: `useValue` is `any`, so the finding compiles.

## no-unknown-use-value-key

**`error`** · no fix · **needs `parserOptions.project`**

**Reports.** Each key of an object literal handed to `useValue` that the provided type does not have
— `T` when `provide` is an `InjectionToken<T>`, the instance type when it is a class.

**Decides on.** The type checker, and keys only. The provided type is split into the members of a
union; `null`, `undefined` and other primitive members are dropped, and a key is known when any
remaining member has a property of that name (`getPropertyOfType` — private members and
`Object.prototype`'s count). The **values are never compared**: whether `apiUrl: 42` fits a `string`
is the broad form of the check, left out on purpose because a `useValue` is normally a partial
fixture.

**Finding, and the repair.**

```ts
providers: [{ provide: ActivatedRoute, useValue: { queryParams$: of({ id: '1' }) } }]; // ❌ no such member
providers: [{ provide: ActivatedRoute, useValue: { queryParams: of({ id: '1' }) } }]; // ✅ the member the code reads
```

The message names the key, the provided type and the token. The repair is the member's real name, or
dropping the key; where the double should be checked by the compiler in the first place,
`provideAutoSpy(X, { overrides })`, `provideAutoSpyForToken(TOKEN, { … })` and `createMock<T>({ … })`
all are.

**Why it is recommended.** Angular types `useValue` as `any`, so a literal's keys are compared with
nothing: a key renamed in production, or misspelled in the spec, stays in the fixture, the code under
test reads the real member, which the double does not have, and the spec is green over a fixture
nothing reads. A consumer suite of ~1 760 spec files carries about 870 object `useValue` literals —
375 for class providers, 495 for tokens. A hand count over 434 class literals found two keys the class
does not have, one of them `queryParams$` on `ActivatedRoute` under a spec that passed. Keys-only is
what keeps the rule at that order of findings rather than at the hundreds a value check would raise.

**Limits.** Silent where the type says nothing about keys: `any`, `unknown`, `object`, `{}`, a
primitive token (that is [`no-mistyped-use-value`](#no-mistyped-use-value)'s), an array, and any
member with an index signature — a template-literal one included. A spread contributes no keys to the
check, a computed key is skipped, and a `multi: true` provider is left alone, because the value is
then one element of what the token hands out. Only a literal written directly in `useValue` is read —
not one behind a name, an `as`, or a `TestBed.overrideProvider(X, { useValue })` descriptor. Without
a program, or on a checker that lacks `getPropertyOfType` / `getIndexInfosOfType`, it says nothing.

**Severity.** `error`. It decides on a fact — the checker's answer that the type has no such member.
Not in `configs.typeErrors`: `useValue` is `any`, so the finding compiles.

## no-instance-lifecycle-spy

**`warn`** · no fix · syntax only

**Reports.** `vi.spyOn(target, hook)` or `jest.spyOn(target, hook)`, where `hook` is a string literal
naming `ngOnInit`, `ngOnDestroy`, `ngDoCheck`, `ngAfterContentInit`, `ngAfterContentChecked`,
`ngAfterViewInit` or `ngAfterViewChecked`, and `target` is not a prototype.

**Decides on.** The call alone. `X.prototype` and `Object.getPrototypeOf(x)` as the target are
prototypes and are left alone. `ngOnChanges` is not in the list: Angular invokes it as
`this.ngOnChanges(changes)`, which does reach a spy on the instance.

**Finding, and the repair.**

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

Better still, assert what the hook does rather than that it ran.

**Why it is recommended.** A view calls the hook it read off the component class's prototype when
the component was created, never the property a spy installs on the instance afterwards. So
`expect(component.ngOnInit).toHaveBeenCalled()` after `fixture.detectChanges()` can never pass, and a
`.mockImplementation` stub never runs: in a consuming suite the real `ngOnInit` kept running under a
hook the spec believed it had stubbed.

**Limits.** An instance spy is reached when the spec calls the hook itself — `component.ngOnInit()`
followed by an assertion on the spy — and when the injector destroys a **service**, whose
`ngOnDestroy` it calls on the instance. One file's syntax cannot tell those from a component spy
Angular never calls.

**Severity.** `warn`, because of those limits: the rule decides on a heuristic, not a fact.

## no-compile-components

**`error`** · suggestion · syntax only · **silent until `{ builder: 'inline-resources' }`**

**Reports.** Every `….compileComponents()` call — on `TestBed`, on a `configureTestingModule(…)`
chain, on a name — once the option says the project's builder inlines component resources.

**Decides on.** The option, and then the call alone. Whether the call does anything is a fact about
the **build**, which no spec file shows: `compileComponents()` exists to fetch a component's
`templateUrl` / `styleUrls` at run time, so it is load-bearing under a JIT setup that reads those
files when the test runs, and a promise that is already settled under every builder that inlines
them first — the Angular CLI's test builders, `jest-preset-angular`, this package's
[`bun-angular`](/runtimes/bun-angular) preload. So the rule reports nothing until
the project says which it has:

```js
'vitest-auto-spy/no-compile-components': ['error', { builder: 'inline-resources' }],
```

**Finding, and the repair.**

```ts
beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [CardComponent] }).compileComponents(); // ❌ waits for nothing
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ imports: [CardComponent] });
});
```

The suggestion writes exactly that: it drops the call — the whole statement when only `TestBed` is
left in front of it — and the `async` of a `beforeEach` / `beforeAll` / `afterEach` / `afterAll` /
`it` / `test` callback that awaits nothing else. It is offered only where the call is a statement of
its own; a `.then(…)` chain, a returned or stored promise and a concise arrow body are reported with
no edit, because each one uses the promise.

**Why it is recommended.** Not for speed — measured on a standalone AOT bed the call costs 0.005 ms.
For what the line tells the next reader: every hook that awaits it reads as "this spec loads
templates at run time", and every `async` it forces makes a synchronous setup look asynchronous. On
one Angular suite of 1759 spec files it reports 449 calls in 411 files, 435 of them with the edit.

**The `@defer` exception, which the rule reports and cannot detect.** Inlined resources are not the
only thing `compileComponents()` settles. A component whose template holds a `@defer` block ships
**async class metadata**, and `TestBed` resolves that in this very call whatever the builder did with
the template — remove it and the test fails at run time:

```
Error: Component 'BackgroundContentComponent' has unresolved metadata.
Please call `await TestBed.compileComponents()` before running this test.
```

Measured on an Angular suite of 1862 spec files: 410 of them call `compileComponents()`, and after
removing every one of those calls exactly this class of file broke. Nothing in a spec shows it — the
`@defer` is in another file, the component's template, and this rule reads no types — so the call is
still reported there, and the message says so. List the `@defer` components by class name and a
spec that names one of them is left alone — the way out for a project that bans disable comments:

```js
'vitest-auto-spy/no-compile-components': ['error', { builder: 'inline-resources', ignoreComponents: ['CardComponent'] }],
```

or keep the one call with a reason on its own line:

```ts
// eslint-disable-next-line vitest-auto-spy/no-compile-components -- @defer: async class metadata
await TestBed.compileComponents();
```

A name is matched as a whole word anywhere in the spec, so a file that imports the component to
test something else is exempt too; the list is for the handful of `@defer` components, not a
catalogue.

Narrowing by the shape of the call was considered and rejected: the files that broke happened to
write `await TestBed.compileComponents();` on its own rather than chained onto
`configureTestingModule(…)`, but the two spellings are a style difference rather than evidence, and a
rule that skipped the standalone form would miss the ordinary redundant call and still report a
`@defer` spec written the chained way (`DECISIONS.md`, 2026-09-12).

**Limits.** It cannot tell a suite that mixes builders — one project inlining, another on a runtime
loader — so scope the option to the files the inlining builder compiles. It cannot see the `@defer`
exception above either. Dropping the `await` moves the next statement one microtask earlier, which is
why the edit is a suggestion, not a `--fix` — and why the suggestion's own text names the exception,
since a bulk edit reads that rather than the message.

**Severity.** `error`, and inert by default — the way the three type-aware rules wait for a program,
this one waits for the builder.

## no-sync-testbed-await

**`error`** · suggestion · syntax only

**Reports.** An `await` in front of a TestBed call that answers the TestBed or a fixture rather than
a promise — `configureTestingModule`, `overrideComponent`, `overrideDirective`, `overrideModule`,
`overridePipe`, `overrideProvider`, `overrideTemplate`, `overrideTemplateUsingTestingModule`,
`resetTestingModule`, `createComponent`, `getLastFixture` — whether the receiver is `TestBed`,
`getTestBed()`, a chain of those members, or a name the file settles to one of them.

**Decides on.** The member name, and Angular's own signatures behind it: those nine return `TestBed`
itself, which is exactly what lets the calls chain, and the other two return the `ComponentFixture`.
Nothing there is a thenable, so no type information is needed and the rule reports in a project that
has wired no program. The receiver is walked link by link rather than rooted by its first token, so
only members Angular declares as returning `TestBed` count as links — `TestBed.inject(Api)
.createComponent(x)` roots at `TestBed` too, and reading the root alone would report a collaborator's
method that happens to share a name.

**Finding, and the repair.**

```ts
beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [CardComponent] }); // ❌ awaiting the TestBed
});
```

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ imports: [CardComponent] });
});
```

The suggestion writes exactly that: the `await` goes, and with it the `async` of a `beforeEach` /
`beforeAll` / `afterEach` / `afterAll` / `it` / `test` callback that then awaits nothing else. Both
halves, because half the edit leaves a hook that still advertises an asynchronous setup.

**Why it is recommended.** Because the shape hides behind a call that really did return a promise.
Measured on an Angular suite of 1862 spec files: `no-compile-components` took 448
`compileComponents()` calls out of 410 files, and what surfaced underneath was 18 `await`s on a value
that was never a promise and 33 hooks left `async` with nothing to wait for. Both had been there all
along. The cost is not the microtask — it is that every reader after you takes an `await` as evidence
that the setup is asynchronous, and goes looking for what it waits for.

The rule was then run over that consumer twice. Over its last commit — 1759 spec files, 411 of them
still calling `compileComponents()` — it reports **14 times in 10 files**, every one with the edit:
`await TestBed.resetTestingModule()`, and `configureTestingModule(…)` chains ending in
`overrideComponent` or `overrideProvider` rather than in the promise. Over the same tree with the 448
calls removed and the awaits behind them fixed, it reports **nothing**, which is the other half of
the measurement: no false positive in 1759 files either way.

**Not the same report as `@typescript-eslint/await-thenable`, and it arrives without a program.** The
stock rule says "Unexpected `await` of a non-Promise (non-"Thenable") value" and leaves the reader to
work out why a TestBed call is not one; it also needs `parserOptions.project`, which the suites this
plugin was measured on do not all have. Run both and you get two reports on the same line and the
same column — measured, on the shape above — and either is one line of config away. What differs is
the edit: the stock suggestion removes the `await` and stops, so the hook stays `async`, and
`@typescript-eslint/require-await` then reports it on the **next** run. It is silent before that:
`require-await` asks whether an `async` function contains an `await` expression, and this one does —
the `await` is right there, waiting on nothing.

**Limits.** `TestBed.inject(TOKEN)` and `TestBed.runInInjectionContext(fn)` are deliberately not
reported: each answers whatever the token or the callback holds, which can be a promise, and in the
suite above four `await TestBed.inject(…)` calls really do await one. Deciding those needs the type
checker, which is `await-thenable`'s job. A receiver the file cannot settle — a name assigned twice,
a helper's return value — is left alone rather than guessed at. And a callback whose `async` the
suggestion drops keeps an explicit `: Promise<void>` return annotation if it had one, which then does
not compile; that is the same edit `no-compile-components` offers, and the same reason both are
suggestions rather than a `--fix`.

**What the message leaves out.** The TestBed calls that really return a promise keep their
`await`: `compileComponents()`, and on a fixture `whenStable()`, `whenRenderingDone()` and
`getDeferBlocks()`. `TestBed.inject(TOKEN)` and `TestBed.runInInjectionContext(fn)` are never
reported — each answers whatever the token or the callback holds.

**Severity.** `error`. The fact it decides on is Angular's published signature, not a heuristic, and
the repair is mechanical.

## no-private-member-access

**`error`** · no fix · **needs `parserOptions.project`** for two of its three forms

**Reports.** A `private` or `protected` member reached from a spec, in three spellings:
`instance['member']`, `(instance as any).member` (and the double-cast and decoy-interface variants),
and `vi.spyOn(Object.getPrototypeOf(instance), 'member')`.

**Decides on.** The type checker, and that **is** the rule. The same brackets are ordinary and
everywhere — `process.env['APP_FEATURE_ENABLED']`, `dataset['error']`, `queryParams['id']`,
`form.controls['profileName']` are index signatures — so nothing is reported unless the checker
resolves the name to a class member carrying one of the two modifiers. Without parser services the
rule reports nothing at all rather than guessing: a type-aware rule that degrades into a syntactic
one is the noisy rule wearing a hat.

Three details of the resolution are worth knowing, because they decide what it can see:

- resolution goes through the **object's type**, not through `getSymbolAtLocation` on the element
  access, which answers nothing for `a['b']` — the shape the rule exists for;
- the member name comes from the **type** of the key rather than from the source text, so
  `const KEY = 'secret'; card[KEY]` resolves like the inline string, and `card[key]` where `key` is
  a plain `string` resolves to nothing and is an index read;
- the modifier is read as **text** off the TypeScript declaration. The obvious alternative, ESTree's
  `accessibility` field, is only reachable through a map that covers the linted file alone — and the
  class under test is declared in another file nine times out of ten, so that version reported
  nothing on the shape the rule exists for while passing every single-file test written for it.

A **dotted** access is only resolved when there is a cast in front of it, because the compiler has
already checked the rest — which is also what keeps the rule off every `a.b` in the file. A cast
chain is walked all the way to the bottom: the middle of `service as unknown as { hidden: T }` is
`unknown` and answers nothing.

The prototype form needs no types and keeps working without a program: `Object.getPrototypeOf` is
typed `any`, so no checker would have an opinion on it, and reaching through it is unambiguous.

**Finding, and the repair.**

```ts
expect(component['recalculate']()).toBe(3); // ❌
(component as any).recalculate(); // ❌
vi.spyOn(Object.getPrototypeOf(component), 'recalculate'); // ❌
```

```ts
component.onResize(); // the public call that reaches it
expect(component.total()).toBe(3); // and the effect it has
```

**Why it is recommended.** Bracket access is not a loophole TypeScript forgot to close — it is how
an index signature is read, so the visibility check is deliberately spelled only on the dotted form.
A spec written the other way compiles, runs, and pins a member the class never promised anybody:
renaming it is a green refactor that turns red in a test file, and the test proves nothing about
what a caller can actually do. The prototype form is a worse double than it looks, too — it patches
the prototype, so every instance in the worker sees it, and `vi.restoreAllMocks()` is the only thing
that puts it back.

**Why it has to read types, in one number.** Measured over a 1759-file Angular spec corpus, a
syntax-only version — every `obj['literal']` — reports **511 sites in 85 files**. Of those, **324 in
45 files** resolve to a `private` or `protected` member; the other **187 (37 %)** are correct code
the rule must not touch, and **41 of the 85 files hold no private access at all**. A plain grep is
worse: ~1726 bracket reads against the same 324 findings. Counting the other two forms on the same
corpus: 50 casts in 10 files and 9 prototype spies — **383 findings in 55 files**, 204 of them in
two files.

**Limits.** Silence is the failure mode to expect. Without `parserOptions.project` or
`projectService` two of the three forms report nothing, and that is indistinguishable from a clean
file — so `npx eslint --print-config` on a spec is worth running before concluding the suite is
clean. Asking the checker for a type also makes the compiler check the file, and building one of its
error messages can throw: on TypeScript 6.0.3 a message that has to name a symbol from another
module dies in `getLocalModuleSpecifier` when the program carries neither `paths` nor `baseUrl` —
which is exactly the isolated program `@typescript-eslint/parser` falls back to in single-run mode.
The rule catches that and stays silent, because a rule that rethrows takes the whole lint run with
it and every other rule's findings go with it.

**There is deliberately no helper.** A `readPrivate(instance, 'x')` export would legitimise exactly
what the rule is for. The repair is never mechanical: drive the member through the public API that
uses it and assert the effect; on a component the rendered template is the other public surface, and
it is the one `protected` exists for. When nothing public reaches the member at all, that is a fact
about the design rather than a reason to step around the modifier.

**What the message leaves out.** On a component, the rendered template is the public surface
`protected` members exist for: `renderShallow(Cmp)` and read the DOM rather than the field. When
nothing public reaches the member, the member either wants to be public or wants to move into a
collaborator the spec can provide a double for.

**Severity.** `error`. The finding is green and wrong in a way no run can report: a test that passes
today and fails on a rename no caller could have noticed.

## no-reflect-member-access

**`error`** · suggestion on one of its three forms · syntax and scope only

**Reports.** `Reflect.get(subject, 'member')` and `Reflect.set(subject, 'member', value)` where the
key is a string literal and the subject is a value this file has in hand — a component, a service, a
fixture, a double.

**Decides on.** The binding behind the target, and the key. A bare identifier has to resolve to a
declaration of the linted file that no `import` made; anything else — a member chain, a call's
result — is a value the file computed and is read as a subject. A name the spec declares as `Window`
or `typeof globalThis` (`let win: Window` holding an injected `WINDOW`) is the environment under
another name and is left alone like `window`. The key has to be a string literal.
Nothing here asks the type checker, which is the point rather than a limitation: this is the shape a
suite reaches for precisely where the checker would have objected.

**Finding, and the repair.**

```ts
expect(Reflect.get(component, 'minDwellTime')()).toBe(0); // ❌ the key is a string nothing checks
Reflect.set(service, 'savedData', null); // ❌ and this does not even write the member
```

```ts
await setInputs(fixture, { seconds: 0 });
expect(host.textContent).toContain('0 min'); // the public surface the member exists for
```

**Why it is recommended.** It is the second door out of
[`no-private-member-access`](#no-private-member-access), and the one no compiler stands in.
`component['x']` at least keeps the member where a type-aware rule can resolve it;
`Reflect.get(component, 'x')` takes the name as an ordinary string argument, typed `any`, so neither
the compiler nor a template gate nor a strict `tsc` pass has an opinion about it. The consumer this
was measured on opened the door itself — its own `no-restricted-syntax` ban on double casts named
`Reflect.get` / `Reflect.set` as the way out — and arrived at **214 sites in 50 of its 2 030 spec
files**: 125 reads, 85 writes and 4 of the double form.

`Reflect.set` is the half that outlives what it tests. It installs an **own** property over the
prototype rather than writing the member, so renaming the field in production leaves the spec
compiling, running, and writing a **dead** property nothing reads, while the
`expect(spy).not.toHaveBeenCalled()` under it passes forever. Two such sites were found on the
measured consumer by reading them, not by running anything: the test survives the deletion of the
thing it was written for, which is the one failure no assertion in it can report.

**The third message, and the only edit.** `Reflect.set(double, 'prop', value)` where the name holds
something one of this library's factories built — `injectSpy`, `provideAutoSpy`,
`provideAutoSpyForToken`, `createSpyFromClass` and the rest — is patching a double behind the
library's back: no journal entry, no restore, so the patch is live for every later test of the file
and, under `isolate: false`, for every later file of the worker. That one is offered as a suggestion,
`mockValueProp(double, 'prop', value)`, which performs the same write and registers the undo with
`restoreMockedProps()`. It is a suggestion rather than a fix for the reason
[`no-object-define-property`](#no-object-define-property) is: registering an undo is a change between
tests, which is the point of the repair and still a change.

**A fixture gets a message of its own.** `Reflect.set(link, 'linkType', value)` where `link` holds an
object literal the spec wrote is not reaching past an API — the key belongs in the literal, where the
compiler checks it. Where the value is outside the declared type on purpose, to reach a fallback
branch, the message names the cast on the **value** (`{ linkType: value as Model['linkType'] }`),
which keeps the key checked. A project that bans assertions
(`@typescript-eslint/consistent-type-assertions: ['error', { assertionStyle: 'never' }]`) cannot
write that cast; for it the repair is `mockValueProp(link, 'linkType', value)`, whose loose
overload takes a value the declared type does not allow, and the write is restored after the test.
And where a private member has no observable effect at all,
`component['member']` under a `no-private-member-access` disable that says why is the lesser escape:
the key stays where the compiler sees it.

**Limits.** A computed key is never reported — `Reflect.get(component, method)` in a helper that
takes the name as a parameter is the one shape where the string is not a member written out in the
spec, and no advice here would repair it. Neither is `Reflect.apply`, `Reflect.has`,
`Reflect.deleteProperty` or `Reflect.construct`: only the two that read and write a member are the
bracket escape in another spelling. A name an `import` introduced is left alone as well, because a
module namespace is nobody's subject and patching one is `vi.mock`'s business — a namespace a spec
assigns to a `let` of its own through `await import(…)` is a local binding and **is** reported, which
is the binding talking rather than an exception.

**Severity.** `error`, and grading it below its twin would be the mistake. `no-private-member-access`
is an `error`; if this one were a `warn`, `Reflect.get` would be the sanctioned way to silence it,
and the rule would create the incentive it exists to remove. The evidence is entirely in the line, no
heuristic decides anything, and the repair is the same one that rule names.

A `protected` signal a component hands to a child reads back through that child: render the child as
a `createComponentStub` and read its input off the stub instance. One the spec has to drive is
`mockSignalProp(component, 'x', value)`, which reaches a `protected` signal.

## no-mocked-for-spy

**`error`** · `--fix` where the file settles it, suggestion otherwise · syntax only · in `configs.typeErrors`

**Reports.** `Mocked<T>` or `MockedObject<T>` in **any** type position — a `let` annotation, a
factory's return type, a helper's parameter, an `as unknown as Mocked<T>` cast.

**Decides on.** The identifier in a `TSTypeReference`, plus scope. A `Mocked` the file declares
itself is not Vitest's, whatever it is called, and `Spy` already meaning something else in the file
is the same problem from the other end — either one downgrades the report to a bare message with no
edit. Whether the type argument is a single named type is checked as well:
`Mocked<{ isKeyEnabled: Mock }>` is reported and never rewritten, because `Spy<T>` reads a class or
an interface and handing it an object literal of `Mock`s asks a different question of the type
system.

Whether the rename is the **whole** edit is a separate question, and it is the reason the rule
declares both a fix and suggestions. Every value the annotated name is ever given — the initialiser
and every later assignment, matched by name — has to come out of one of this library's own factories
(`asSpy`, `autoMocked`, `createAutoMock`, `createMock`, `createSpyClass`, `createSpyFromClass`,
`injectSpy`, `mockConstructor`, `mockDeep`). Where that holds, the rename is applied under `--fix`;
where it does not, the same edit is offered as a suggestion so a human can repair the creation site
with it. That narrowing was learnt from a real file:

```ts
let register: Mocked<Pick<Registry, 'metrics'>> & { contentType: string };
register = { contentType: '…', metrics: vi.fn().mockResolvedValue(payload) };
```

`eslint --fix` rewrote the first line, reported clean, and the type gate then failed on the second.
That is the worst shape an autofix has: the rule's own check passes, so nothing points back at it.
An annotation that belongs to no variable — a parameter, a return type, a cast — has no creation site
in view and keeps the plain fix.

The edit also imports `Spy` when the name is free and drops the `Mocked` import once nothing else
uses it; with several references the import is dropped on the pass that rewrites the last one,
because ESLint re-lints after every applied fix.

**Finding, and the repair.**

```ts
let cart: Mocked<CartService>; // ❌
```

```ts
let cart: Spy<CartService>;
```

**Why it is recommended.** `Mocked<T>` keeps `T`'s private members, so assigning a spy to it fails
with a list of private field names:

```text
TS2322: Type 'Spy<CartService, SpyOptions>' is not assignable to type 'Mocked<CartService>'.
        Type 'Spy<CartService, SpyOptions>' is missing the following properties
        from type 'CartService': http, cache
```

Nothing in that names `Mocked`, which is the whole point of the rule: it fixes the declaration
rather than explaining the error. `Mocked<T>` still has a place next to `vi.mocked()`, and the rule
leaves that alone — what it reports is the declaration whose assignment then fails.

**Limits.** A file that declares its own `Mocked` type gets a report it cannot act on mechanically,
which is correct — the declaration is wrong either way — but the message names Vitest's type. The
name-matched assignment scan is loose in one safe direction only: a same-named assignment in another
scope can demote a fix to a suggestion, never promote one.

**Two of Vitest's mock type names, and only two.** The other seven are not oversights, and the
dividing line is the type parameter rather than the spelling:

| type                                                                                         | parameter                              | verdict                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mocked<T>`, `MockedObject<T>`                                                               | any `T`, mapped member by member       | **reported** — this is the whole-object double, and `Spy<T>` is what it should be                                                              |
| `Mock<T>`, `MockInstance<T>`, `MockedFunction<T>`, `MockedFunctionDeep<T>`, `PartialMock<T>` | `T extends Procedure \| Constructable` | not reported — `T` is a _function_ type, so none of them can name a class in the first place; each types one `vi.fn()`, which is correct usage |
| `MockedClass<T>`                                                                             | `T extends Constructable`              | not reported — a mocked class **constructor**, whose counterpart here is `createSpyClass` / `mockConstructor`, not `Spy<T>`                    |
| `MockedObjectDeep<T>`                                                                        | any `T`, mapped deeply                 | not reported — the deep double here is `mockDeep<T>()`, whose type is `DeepMockProxy<T>` rather than `Spy<T>`                                  |

So a suite that types its doubles as `Mock` is not writing `Mocked<T>` in another spelling: it is
writing the _members_ of a hand-built object type, and the shape worth reporting is the object type
around them. That is [`no-structural-double`](#no-structural-double), which is a rule of its own
rather than an arm of this one because its finding **compiles** — `let s: { load: Mock }` is
perfectly legal — and everything in `configs.typeErrors` has to be a finding that does not.

**Severity.** `error`, and one of the two rules in `configs.typeErrors`. The finding does not
compile — `TS2322`, by construction rather than by luck — so "warn now, fix in batches" is not a
plan for it: the batch is the build, already red.

## prefer-as-spy

**`error`** · `--fix` · syntax only · in `configs.typeErrors`

**Reports.** A cast to this library's `Spy<…>` — `TestBed.inject(X) as Spy<X>`, and the
`as unknown as Spy<X>` hop where the value is provably the injected instance.

**Decides on.** A `TSAsExpression` whose type is a reference spelled `Spy`, and scope: a `Spy` the
file declares itself is not this library's and there is nothing to say about a cast to somebody
else's type. Then the **value** the assertion is about:

- `x as Spy<T>` asserts that `x` _is_ the spy, so the value is `x` and the rewrite is exact;
- `x as unknown as Spy<T>` asserts the opposite — the hop through `unknown` is there precisely
  because `x` and `T` have nothing to do with each other — so `asSpy<T>(x)` would be a call whose
  argument does not type-check. It is unwrapped in exactly one case: the value is a
  `TestBed.inject(X)` call, which answers an `X` by construction, and the `as unknown` was added to
  silence the very `TS2352` this rule is about. Everything else keeps its cast and its silence: a
  double cast over a hand-built object wants a real double, which is another rule's business.

The fix carries the type arguments across verbatim rather than leaving them to inference, because
`Spy<T, Options>` and `asSpy<T, Options>` take the same parameter list — so the line after the fix
asserts character for character what the line before it did. Inference is not that: on a generic
class `TestBed.inject` answers `Service<any>`, and the `any` surfaces eight levels down as a
mismatch between `AddPromiseSpyMethods<unknown>` and `WithMockReturnValue<…>` with nothing in the
message pointing back here. It also imports `asSpy` and drops a `Spy` import the rewrite orphans.

**Finding, and the repair.**

```ts
const devices = TestBed.inject(DeviceListService) as Spy<DeviceListService>; // ❌ TS2352
```

```ts
const devices = asSpy(TestBed.inject(DeviceListService));
const devices = injectSpy(DeviceListService); // the same, with the inject folded in
```

**Why it is recommended.** A cast is not how a spy comes back out of a container, and under this
library it does not even compile: `Spy<T>` adds `accessorSpies` and the per-method helpers, so
neither type sufficiently overlaps the other and the line fails with
`TS2352: Conversion of type 'X' to type 'Spy<X>' may be a mistake`. It is
[the most common compile error a migrated Angular suite produces](/migrating), because
`jest-auto-spies` suites carry that line once per injected double. `asSpy` makes exactly the same
assertion as a typed identity function — the same object at run time, the same claim, no cast.

It is a rule of its own rather than a branch inside [`prefer-inject-spy`](#prefer-inject-spy), and
the two are adjacent rather than the same. That rule reports a run-time defect whose repair is a
provider in another file; this one reports a correct intention spelled in a way that no longer
compiles, and repairs it in place. Fusing them would also cost the honesty of `meta.fixable`, which
ESLint reads per rule.

**Limits.** Neither helper is for the object _under test_: a service a spec exercises is not a
double, and typing it as the class is the repair there — which the rule cannot tell apart, so it
reports the cast either way. Where `asSpy` already names something else in the file the report
arrives without an edit.

**Severity.** `error`, and the second rule in `configs.typeErrors` for the same reason as
[`no-mocked-for-spy`](#no-mocked-for-spy): the finding is `TS2352`, so the build is already red.

## no-ts-expect-error-on-double

**`error`** · no fix · syntax only

**Reports.** A `@ts-expect-error` or `@ts-ignore` whose suppressed line belongs to a double's
configuration — `nextWith`, `nextOneTimeWith`, `nextWithValues`, `nextWithPerCall`, `resolveWith`,
`resolveWithPerCall`, `returnValue`, `mockReturnValue(Once)`, `mockResolvedValue(Once)`, `calledWith`
and `mustBeCalledWith`, called on a named method (`double.method.nextWith(…)`, or the same through a
`calledWith(…)` chain). The report sits on the directive.

**Decides on.** Comments and line numbers, the way the compiler reads them: the directive applies to
the line after the comment, and a block comment is read off its last line. That line has to fall
inside the configuration call — the callee or a fixture spread over several lines — but not inside a
callback handed to it, where the suppression is about something else. `rejectWith`, `failWith` and
`throwWith` are not read: their parameter is `unknown`, so there is no stub shape to get wrong and a
directive there silences something other than the double.

Whatever reason follows the directive, the rule reports it. That is the decision the rule turns on:
a reason is where the wrong diagnosis gets written down, and a codebase that requires one (as
`@typescript-eslint/ban-ts-comment` does by default) has one on every line.

**Finding, and the repair.**

```ts
// @ts-expect-error the spy picks the events overload, not the body the code reads
shelves.getShelf.nextWith(page); // ❌
```

```ts
let shelves: Spy<ShelvesClient, { overload: { getShelf: 'first' } }>; // ✅ the signature the code calls
shelves.getShelf.nextWith(page);
```

Where no overload is involved the fixture is the wrong shape: check it against
`ReturnType<X['method']>` — a `calledWith` argument against `Parameters<X['method']>` — and build a
partial one with `createMock<…>()`.

**Why it is recommended.** A typed double's one check is that the stub matches what the method
declares, and the directive switches it off for everything on the line. Measured on one Angular
suite of 1759 spec files: 34 directives in 15 files, **every one with a reason**. Four sat on
overloaded clients, which [`overload`](/core/spy-typing#overloads-parameters-reads-the-last-signature) repairs; seven blamed "the
collapsed generic" for a fixture the real generic instantiation rejects as well; nineteen hid a
fixture or a production type that disagrees with the declared one. Four were deliberate.

**Limits.** A value outside the declared type on purpose — an error object handed to `nextWith` to
reach a default branch — is correct code. `outOfType<T>(…)` from `vitest-auto-spy` says so without a
directive, and the rule does not read it:

```ts
reference.load.nextOneTimeWith(outOfType<Reference>(new HttpErrorResponse({ status: 500 })));
```

A project that keeps the directive says it in a per-line disable above it:

```ts
// eslint-disable-next-line vitest-auto-spy/no-ts-expect-error-on-double -- an error outside the union reaches the fallback
// @ts-expect-error
reference.load.nextOneTimeWith(new HttpErrorResponse({ status: 500 }));
```

A double reached through a computed member or a bare mock (`vi.fn().mockReturnValue(…)`) names no
method, and is not read.

**Severity.** `error`. It decides on a fact — a suppression over a double's configuration — and the
one case where the suppression is right has a one-line escape that records why.

## no-jasmine-globals

**`error`** · no fix · syntax only

**Reports.** The globals jasmine's own runner installed and nothing installs here: `jasmine.*`, and
bare `spyOn(`, `spyOnProperty(`, `spyOnAllFunctions(`, `fail(`, `pending(` — plus `.withContext(`,
which is jasmine's way of labelling an assertion.

**Decides on.** A name, and whether the file has a binding for it. A `jasmine` the file declares
itself is left alone, and so is `import { spyOn } from 'bun:test'` — a different function with the
same name, and the right one on that runtime. The `jasmine.<member>` half is a lookup table, with
`createSpyObj` and `clock()` split off because one report has to cover several calls: the clock
message maps `install` / `uninstall` / `tick` / `mockDate` in one go.

**Finding, and the repair.**

```diff
- spyOn(analytics, 'track');        // jasmine: track() never runs
+ vi.spyOn(analytics, 'track');     // Vitest: track() runs on every call
```

```ts
vi.spyOn(analytics, 'track').mockImplementation(() => undefined); // where the line meant "stub it"
provideAutoSpy(AnalyticsService); // better: stubs every method by construction
```

**Why it is recommended.** Most of these fail loudly on the first run with a `ReferenceError`, and a
rule would be redundant for them. **One does not, and it is why this is a rule rather than a note in
a migration guide:** jasmine's `spyOn` installs a **stub**, `vi.spyOn` **calls through**. The rename
compiles, the spec runs, and the code under test now really talks to its collaborator — which is how
a migrated suite ends up making network calls, or passing while asserting on a value the real
implementation happened to return. `.withContext(` is in the same rule because
[Vitest's chai layer loses the message rather than throwing](/migrating-jasmine).

**Limits.** Inert in a suite that never used jasmine — it cannot fire on code that does not use
those names, which is why it is on for everyone. The messages name the replacement rather than the
mechanism, so the loud cases are one rename each; the `spyOn` case is the one to read.

**What the message leaves out.** `jasmine.clock()` is reported per member, with the helper that
replaces it: `install()` → `setupFakeTimers()`, `uninstall()` → `vi.useRealTimers()`, `tick(n)` →
`await advanceTimers(ms)` (which also flushes the microtasks the timers queued), `mockDate(d)` →
`mockSystemTime(date)`. A file that has to run before it is rewritten imports `{ jasmine }` from
`vitest-auto-spy/jasmine`, whose namespace forwards each member to the Vitest primitive.

**Severity.** `error`. One member of the set is green and wrong, and it is the most-used one.

## jasmine-namespace-without-entry

**`error`** · no fix · syntax only · option `setupModules`

**Reports.** `.and`, `.calls` or `.withArgs` used on a spy this file built, in a file that installs
the compatibility layer nowhere.

**Decides on.** Three narrowings, each of them making an unanswerable question answerable. Whether
the **project** installs the layer is not knowable from one file: the call usually sits in a Vitest
`setupFiles` entry that no spec imports. So the rule only ever claims "this file uses a namespace on
a spy **this file built**, and this file installs nothing":

- the receiver has to trace to one of this library's factories — the walk goes down the member chain,
  because the namespace hangs off a _method_ of the double (`api.load.and.returnValue(…)`), and a
  name is followed through every write, initialiser included, since `let api: Spy<Api>` filled in a
  `beforeEach` is how most suites build their doubles;
- importing any entry that _cannot_ load the jasmine one silences the file — `vitest-auto-spy/bun`,
  `…/bun-angular`, `…/node`, `…/rstest`, whose runtimes necessarily install the layer from a setup
  file, so reporting them would be reporting the documented arrangement;
- an `enableJasmineCompat()` call anywhere in the file silences it, which is why the reports are held
  to `Program:exit`: the call can sit below the first spy it equips.

An `import type { Spy } from 'vitest-auto-spy/jasmine'` does **not** count — the compiler erases it,
so it installs nothing, and a file that imports the type from the jasmine entry and its factories
from the core one is the exact shape the rule was written for. Two shapes are subtracted for
precision: `spy.mock.calls[0]` is the runner's own bookkeeping and belongs to nobody here, and a
`.and` hanging off a `withArgs(…)` call is reported at the `withArgs`, whose message names the whole
rewrite, so the chain does not come back as two messages.

**Finding, and the repair.**

```ts
import { createSpyFromClass } from 'vitest-auto-spy';

const api = createSpyFromClass(Api);

api.load.and.returnValue(of(page)); // ❌ Cannot read properties of undefined (reading 'returnValue')
```

```ts
api.load.mockReturnValue(of(page)); // drop the namespace
```

```ts
import { createSpyFromClass } from 'vitest-auto-spy/jasmine';

// or install the layer
```

**Why it is recommended.** `.and` reads `undefined` on a spy this library built, so the line dies
with `Cannot read properties of undefined (reading 'returnValue')` — a message that names neither
the missing import nor the spy. Red by construction, but with a diagnostic that sends the reader
looking at the spy.

**Limits.** This is one of the rules that can report on a correct project, and the option is the fix
rather than the severity:

```js
'vitest-auto-spy/jasmine-namespace-without-entry': ['error', { setupModules: ['./test-setup'] }],
```

Name the module your project installs the layer from and the rule stops guessing. Until 4.0.0 the
answer to this was a `warn`, and that was the wrong shape: a warning nothing reads is not a safety
margin when the actual fix is one option away.

**Severity.** `error`. Red by construction where the line executes, with an option for the one case
where the rule is wrong about the project.

## no-save-arguments-by-value

**`error`** · no fix · syntax only

**Reports.** `spy.calls.saveArgumentsByValue()`, wherever the `.calls` namespace hangs off.

**Decides on.** The member chain alone: a `.calls` namespace read through to a
`saveArgumentsByValue(…)` call. There is nothing else to decide — the name belongs to jasmine and to
this library's compatibility layer, and no other API spells it.

**Finding, and the repair.**

```ts
spy.calls.saveArgumentsByValue(); // ❌ a no-op — the arguments are still the same reference
expect(spy.calls.argsFor(0)[0]).toEqual({ status: 'pending' });
```

```ts
const seen: Payload[] = [];

spy.mockImplementation((payload) => {
  seen.push(structuredClone(payload));
});

expect(seen[0]).toEqual({ status: 'pending' });
```

**Why it is recommended.** The call is a **no-op** here, and deliberately so: jasmine copies every
call's arguments defensively, Vitest, Bun and `node:test` all keep the reference, and snapshotting
every argument of every call to match that would tax every spy in the suite. Nothing throws — that is
the problem. The spec asked for the arguments _as they were passed_; after the move it reads whatever
the code under test left in that object afterwards, so an assertion about the state at call time
silently becomes one about the state at assertion time, and it now passes or fails on a value nobody
wrote. There is no diff, no warning and no failing run to point at it — the purest silent case in the
plugin.

**Limits.** Inert unless the suite came from jasmine. `captureArg<T>()` is how to _reach_ an
argument at all, but it keeps the same reference the assertion matched: it
repairs the reach, not the mutation. So the repair is always the copy at the call site, which is a
rewrite rather than a rename.

**Severity.** `error`. Green and wrong with no signal of any kind, which is the failure mode a suite
cannot report on itself.

## prefer-native-spy-api

**`error`** · `--fix` where the receiver is traceable, suggestion otherwise · syntax only

**Reports.** A `.and` or `.calls` call whose meaning this library spells itself — the renames that
end a migration off `jasmine-auto-spies`.

**Decides on.** A closed table of rewrites, each of which stays inside one call expression and keeps
the receiver. Two renames (`.and.returnValue` → `.mockReturnValue`, `.and.callFake` →
`.mockImplementation`), ten delegated helpers where `.and` only re-publishes something already on the
spy (`nextWith`, `resolveWith`, `rejectWith`, `throwWith`, `complete`, `returnSubject`,
`nextWithValues`, `nextOneTimeWith`, `nextWithPerCall`, `resolveWithPerCall`) and three bookkeeping
calls (`.calls.count()` → `.mock.calls.length`, `.calls.reset()` → `.mockClear()`,
`.calls.argsFor(i)` → `.mock.calls[i]`). A `withArgs(…)` receiver folds in:
`spy.withArgs(a).and.returnValue(v)` → `spy.calledWith(a).mockReturnValue(v)`.

The table is drawn as narrowly as it sounds. A strategy with no equivalent — `.and.returnValues`,
`.and.callThrough`, `.and.stub`, `.and.throwError`, `.and.resolveTo` — and a bookkeeping call whose
shape differs (`.calls.mostRecent()`, `.calls.all()`) are not in it at all, because there is no
rename that says the same thing. `.calls.argsFor()` without an index is declined too:
`mock.calls[undefined]` is not what the line meant. A chain carrying an optional link is left alone,
because the replacement is built from the receiver's source text plus a member name and
`spy?.and.returnValue(1)` would come back as `spy.mockReturnValue(1)` — the same call with the guard
silently removed.

The plain fix is spent only where the receiver traces to one of this library's factories;
`.calls.count()` on somebody else's object is somebody else's method, and there the same edit is
offered as a suggestion.

**Finding, and the repair.**

```ts
api.load.and.returnValue(of(page)); // ❌ the compatibility layer speaking
api.load.calls.count();
api.load.withArgs(7).and.returnValue(of(other));
```

```ts
api.load.mockReturnValue(of(page));
api.load.mock.calls.length;
api.load.calledWith(7).mockReturnValue(of(other));
```

**Why it is recommended.** It reports code that **works**, so the argument is different from every
other rule here: this is the tool that finishes a migration. `eslint --fix` does the traceable
renames in one pass and `npx vitest-auto-spy codemod --from jasmine` does the whole suite, after
which the `vitest-auto-spy/jasmine` import can be deleted — and the migration is over when the rule
is silent. It shipped `off` until 4.0.0 for exactly the reason below; it is on now because most
suites are not mid-migration, and the ones that are need one line.

**Limits.** On day one of a migration it fires on every line of the bridge, which is the one case
where the answer is the severity rather than an option:

```js
{ rules: { 'vitest-auto-spy/prefer-native-spy-api': 'off' } } // until the suite is green
```

Delete that line for the last mile. Anything outside the rewrite table is not reported at all, so a
silent run does not mean the bridge is gone — `.and.callThrough()` and `.calls.all()` survive it, and
the honest check for "is the layer still needed" is whether the `vitest-auto-spy/jasmine` import can
be removed.

**Severity.** `error`, with a documented `'off'` for the duration of a migration. The alternative —
shipping it `off` and asking projects that have finished to turn it on — is a rule nobody ever
enables.

## Related

- [ESLint plugin](/utilities/eslint-plugin) — installing it, the `files` glob, and the recipe for
  landing it on a large existing suite without a red CI.
- [Editor diagnostics](/utilities/editor-diagnostics) — the same findings inside an IDE.
- [CLI — the codemod](/utilities/codemod) — the bulk rewrite the two jasmine `--fix` rules finish.
- [Angular diagnostics](/adapters/angular-diagnostics) — the run-time twin of
  [`no-dead-schemas`](#no-dead-schemas).
