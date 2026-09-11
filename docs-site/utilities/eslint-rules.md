---
title: ESLint rules
description: A reference section for each of the twenty-eight rules — what it reports, what it decides on, why it is in recommended, where it reports working code, and why its severity is what it is.
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
red CI, and tables that give each rule one line. This page is the other half: for a report that has
already arrived, what the rule decided on, when it stays silent, and where it is wrong about your
project. Nothing here has to be read in order.

Every section answers the same six questions:

- **Reports** — what counts as a finding.
- **Decides on** — the evidence: the shape of the AST, a name, the whole file, or the type checker.
  This is what tells you when the rule will stay quiet and when it will be wrong.
- **Finding, and the repair** — one shape, before and after.
- **Why it is recommended** — the concrete failure a suite gets without it. Not "this is tidier".
- **Limits** — where it reports working code, and what quiets it.
- **Severity** — and why that one.

## The twenty-eight rules {#the-twenty-five-rules}

Grouped by subject, the same grouping the [setup page](/utilities/eslint-plugin) uses. Every rule is
an `error` except three.

| Rule                                                              | In `recommended` | Reports                                                                                |
| ----------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| [`no-expect-in-subscribe`](#no-expect-in-subscribe)               | `error`          | `expect()` inside a `subscribe` callback — it runs only if the stream emits             |
| [`no-floating-assertion`](#no-floating-assertion)                 | `error`          | `expect()` in a `.then()` chain nothing awaits                                         |
| [`no-done-callback`](#no-done-callback)                           | `error`          | a named first parameter on a test or hook, and `done.fail(…)` beneath it                |
| [`no-bare-called-with`](#no-bare-called-with)                     | `error`          | `calledWith(…)` / `mustBeCalledWith(…)` as a statement of its own                      |
| [`prefer-create-spy-from-class`](#prefer-create-spy-from-class)   | `error`          | an object literal of two or more `vi.fn()`s                                            |
| [`no-stub-class-double`](#no-stub-class-double)                   | `warn`           | a class whose fields are `vi.fn()`s — the same double with a `new` in front of it       |
| [`no-structural-double`](#no-structural-double)                   | `warn`           | an object of `vi.fn()`s bound to a name declared as an object of Vitest `Mock`s        |
| [`no-shared-module-level-mock`](#no-shared-module-level-mock)     | `error`          | an **exported** value that builds `vi.fn()`s while the module loads                    |
| [`no-object-define-property`](#no-object-define-property)         | `error`          | `Object.defineProperty` / `defineProperties` in a spec                                 |
| [`no-import-time-spread`](#no-import-time-spread)                 | `error`          | a spread of an imported binding evaluated at module scope                              |
| [`prefer-observer-stub`](#prefer-observer-stub)                   | `error`          | an observer global replaced by hand or through the runner                               |
| [`no-passthrough-console-spy`](#no-passthrough-console-spy)       | `error`          | `vi.spyOn(console, m)` nothing gives an implementation — it calls through and prints    |
| [`no-console-in-spec`](#no-console-in-spec)                       | `error`          | a spec that calls a console method, or replaces one by assignment                      |
| [`no-import-time-console-spies`](#no-import-time-console-spies)   | `error`          | an import of `vitest-auto-spy/console` in a file that never calls `installConsoleSpies()` |
| [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)             | `error`          | a provider — or a `TestBed.overrideProvider` — that hand-rolls a service double        |
| [`prefer-inject-spy`](#prefer-inject-spy)                         | `error`          | `vi.spyOn` over the instance `TestBed.inject` handed back                              |
| [`no-unregistered-inject-spy`](#no-unregistered-inject-spy)       | `error`          | `injectSpy(X)` for a token this file never registered as an auto-spy                   |
| [`prefer-render-shallow`](#prefer-render-shallow)                 | `warn`           | `TestBed.createComponent` in a file that never reads the rendered template             |
| [`no-overridden-provider`](#no-overridden-provider)               | `error`          | a provider a later one, or a `TestBed.overrideProvider`, replaces                      |
| [`no-inject-before-override`](#no-inject-before-override)         | `error`          | an injection in a hook, in a suite that still calls `TestBed.override*`                |
| [`no-dead-schemas`](#no-dead-schemas)                             | `error`          | `schemas` on a testing module that declares nothing                                    |
| [`no-private-member-access`](#no-private-member-access)           | `error`          | a `private` / `protected` member reached through brackets, a cast, or the prototype     |
| [`no-mocked-for-spy`](#no-mocked-for-spy)                         | `error`          | `Mocked<T>` in a type position where the value is a spy                                |
| [`prefer-as-spy`](#prefer-as-spy)                                 | `error`          | `TestBed.inject(X) as Spy<X>` — a cast that no longer compiles                          |
| [`no-jasmine-globals`](#no-jasmine-globals)                       | `error`          | `jasmine.*`, bare `spyOn(` / `fail(` / `pending(`, and `.withContext(`                 |
| [`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry) | `error`      | `.and` / `.calls` / `.withArgs` in a file that installs the compatibility layer nowhere |
| [`no-save-arguments-by-value`](#no-save-arguments-by-value)       | `error`          | `spy.calls.saveArgumentsByValue()` — a no-op here                                      |
| [`prefer-native-spy-api`](#prefer-native-spy-api)                 | `error`          | `.and` / `.calls` where the spy's own API says the same thing                          |

Five of them have options: [`prefer-create-spy-from-class`](#prefer-create-spy-from-class),
[`no-stub-class-double`](#no-stub-class-double) and
[`no-structural-double`](#no-structural-double) (`minRunnerFns`),
[`prefer-render-shallow`](#prefer-render-shallow) (`templates`) and
[`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry) (`setupModules`). One of them
reads types: [`no-private-member-access`](#no-private-member-access). Two are also shipped as
`configs.typeErrors`, because their findings do not compile:
[`prefer-as-spy`](#prefer-as-spy) and [`no-mocked-for-spy`](#no-mocked-for-spy).

## no-expect-in-subscribe

**`error`** · suggestion · syntax only

**Reports.** An `expect()` that runs only if a stream emits — anywhere inside a `subscribe(…)`
callback, including assertions the callback reaches through a helper.

**Decides on.** Two selectors and a tally. Every `expect(…)` under a `…subscribe(…)` call counts,
and so does every call of a plain name under one: that name is resolved through the scope manager to
a function declared in the same file, and the `expect`s in its body are counted too — one step, no
type information. A helper declared *inside* the callback is skipped, because the first selector has
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

**Severity.** `error`. The finding is a test that passes while asserting nothing, and the repair is
mechanical for most of the population.

## no-floating-assertion

**`error`** · no fix · syntax only

**Reports.** An `expect()` inside a `.then()` / `.catch()` / `.finally()` callback whose chain is a
bare expression statement — nothing awaits it, returns it, stores it or passes it on.

**Decides on.** The walk *up* the chain, which is the whole of the check. In `p.then(a).catch(b)`
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
`beforeAll` / `beforeEach` / `afterAll` / `afterEach`, and — separately — a `.fail(…)` call on a
parameter it has already reported.

**Decides on.** The parameter's *form*, not its name. Vitest's own fixtures have to be destructured,
so a plain name in that position is a `done` carried over from Jest or Jasmine, whatever it is
called; `({ task })` and a zero-parameter callback are silent. The `done.fail(…)` half is resolved
through the scope manager to a parameter of a callback already in the reported set — `done` is what
the parameter is called in nine files out of ten and in none of the tenth, and a `fail` method on a
matcher bag or a domain object is somebody's API. The parameter is visited before the body, so the
set is complete by the time the `fail` is met.

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

**Limits.** A helper that genuinely takes one positional argument and is *called* as a hook is not a
shape the selector can tell apart, but the selector matches only the six runner names, so this is
narrow in practice. Nothing here reads the callback body, so a `done` that is declared and never
called is reported too — correctly, since the parameter is not what the runner passes.

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

## prefer-create-spy-from-class

**`error`** · no fix · syntax only · option `minRunnerFns`

**Reports.** An object literal with **two or more** direct properties whose value is a runner mock.

**Decides on.** A count of the object's own properties, not of its subtree: a value counts when it
unwraps to `vi.fn()` / `jest.fn()` — the walk goes down a configured chain, so
`vi.fn().mockReturnValue(of([]))` and `vi.fn().mockReturnValue(x).mockName('y')` both count. Nesting
needs no special handling because the rule fires on every object literal in the file, so an inner
object is judged on its own properties. Four shapes are subtracted:

- an object a provider's `useValue` hands to DI, whether it is written in the slot or one name away
  (5.5.0) — that is [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)'s line, and two reports on
  one double teach people to disable both. The name step matters because that rule follows a name
  *into* the slot: before this was read from both ends, a literal parked in a `const` drew a report
  from each of the two, one recommending `createSpyFromClass` and one `provideAutoSpy`;
- anything inside a call to `autoMocked`, `createAutoMock`, `createMock`, `createSpyClass`,
  `createSpyFromClass`, `mockConstructor`, `mockDeep`, `provideAutoSpy` or `provideAutoSpyForToken`,
  at any depth — that object is a **seed**, which is what the rule asked for;
- anything inside a `vi.mock()` / `vi.doMock()` factory, whose object replaces a module's *exports*
  rather than standing in for a service;
- an object under the threshold.

**Finding, and the repair.**

```ts
const cart = { total: vi.fn(), add: vi.fn() } as unknown as CartService; // ❌
```

```ts
const cart = createSpyFromClass(CartService);
```

**Why it is recommended.** A hand-written double only has the methods somebody remembered. The class
grows one, and the spec dies on `TypeError: cart.applyPromo is not a function` — in application
code, several frames from the object that is actually wrong. The type system does not catch it
either, because the double never satisfied the class in the first place; the
`as unknown as CartService` in front of it is what hides `TS2741: Property 'rate' is missing`.
`createSpyFromClass` reads the prototype and `createAutoMock<T>()` reads the type, so neither can
fall behind.

**Limits.** The default threshold of `2` is a real gap, and it is there because of what the rule
cannot see: an object holding one `vi.fn()` is indistinguishable from an options bag with a callback
in it (`{ onDone: vi.fn() }`), and this rule fires on every object literal in the file. The visible
cost is an asymmetry — two doubles on adjacent lines, one flagged and one not — which seven
migration batches tripped over, so the threshold is named in the message:

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
- a class with a non-empty **`implements`** clause, which *cannot* drift: add a member to the type
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
class NewCardServiceMock {
  getTrailerPlayUrl = vi.fn().mockReturnValue(of(url));
  load = vi.fn();
} // ❌

const mock = new NewCardServiceMock();
```

```ts
const mock = createSpyFromClass(NewCardService);
// or, where the double stands in for an interface or an abstract class:
const mock = createAutoMock<NewCardService>();
// and behind DI, the whole stub class goes away:
providers: [provideAutoSpy(NewCardService)];
```

**Why it is recommended.** The same drift as
[`prefer-create-spy-from-class`](#prefer-create-spy-from-class), and it is the same object with a
`new` in front of it: the class grows a method, the stub does not, and the spec dies on
`TypeError: mock.applyPromo is not a function` in application code. It is worth having as a rule of
its own because it was the *largest* family left in a suite running every `error` rule of
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
`PartialMock`. Which of them *means* a whole-object double is
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
answer is `provideAutoSpy(Card)`. The rule's own subject is a service *without* DI, so the carve-out
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
that crosses files. An exported *frozen constant* built from `vi.fn()`s on purpose (a stable
reference some registry compares by identity) has to be silenced per line.

**Severity.** `error`. Green and wrong, and the failure surfaces in a different file from the cause.

## no-object-define-property

**`error`** · suggestion · syntax only

**Reports.** Every `Object.defineProperty` and `Object.defineProperties` call in a linted file, with
a second, sharper message where the same property is redefined twice in the same block.

**Decides on.** Two selectors plus a tally keyed by *what* is patched: the enclosing function's
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
`beforeAll` that is meant to last the file. The message names the whole helper family
(`mockValueProp`, `mockReadonlyProp`, `mockReadonlyPropGetter`, `mockAccessorsProp`,
`stubConstructor`) so the reader can tell which case they are in, and a per-line disable with the
reason is the intended answer where none of them fits:

```ts
// eslint-disable-next-line vitest-auto-spy/no-object-define-property -- clientWidth is a getter on a frozen host object
Object.defineProperty(target, 'clientWidth', { value: 100 });
```

It is also the rule most sensitive to the `files` glob: `Object.defineProperty` in application code
is entirely reasonable, and a glob that is too wide starts reporting it.

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

export const webosEvents = [...BaseEvents]; // ❌ fine under tsc, a TypeError under a bundler
```

```ts
export const webosEvents = () => [...BaseEvents];
```

**Why it is recommended.** Under `tsc` and under a browser's ESM loader this cannot fail — a module
never runs before its dependency. Inside one bundle it can: the spec bundle emits shared chunks, a
chunk may be evaluated while a binding it re-exports is still `undefined`, and `[...undefined]`
throws `Spread syntax requires ...iterable[Symbol.iterator] to be a function` while the bundle
loads, on a tree whose every test passes. It is the same root cause as the barrel-initialisation
note in the [migration guide](/migrating), but the symptom names neither a module nor a barrel, so
nothing connects the two.

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

A definition's *kind* is read rather than its node, because a parameter's definition points at the
function it belongs to — reading the node calls every parameter a function, and
`function restore(original) { globalThis.ResizeObserver = original; }` was reported as installing a
double until a test pinned the restore silent.

`Object.defineProperty(globalThis, 'ResizeObserver', …)` is deliberately **not** one of the forms:
[`no-object-define-property`](#no-object-define-property) already reports every `defineProperty` in
a spec and names the same helper family, and two reports on one line saying the same thing is how a
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

**Limits.** A project that needs a *specific* observer implementation in a spec — a real polyfill, an
observer that records geometry the helper does not model — is reporting working code, and the answer
is a per-line disable. The three-name list is closed: a fourth observer global gets no report.

**Severity.** `error`. Green and wrong, and the damage crosses files.

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

**Limits.** A spec that spies on the console to watch what it prints *and* wants the output in the
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

**Severity.** `error`. It decides on a fact: a call on the global console writes, and an assignment
to it is never undone.

## no-import-time-console-spies

**`error`** · no fix · syntax only

**Reports.** An import of `vitest-auto-spy/console` — a bare side-effect import, a namespace import,
or a named import of any `console*Spy` constant — in a file that never calls `installConsoleSpies()`.

**Decides on.** The import declarations and every call in the file. A call to `installConsoleSpies`
anywhere — bare or as a member — means the file installs the spies itself and the import is only
where the names come from, so nothing is reported. An import of `installConsoleSpies`, the types or
`restoreConsole` alone does not lean on the import-time install and is left alone.

**Finding, and the repair.**

```ts
import { consoleErrorSpy } from 'vitest-auto-spy/console'; // ❌ installed by whichever file imported it first
```

```ts
import { type ConsoleSpies, installConsoleSpies, restoreConsole } from 'vitest-auto-spy/console';

let consoleSpies: ConsoleSpies;

beforeEach(() => {
  consoleSpies = installConsoleSpies(); // ✅ this file's tests, and nobody else's
});

afterEach(() => restoreConsole());
```

`installConsoleSpies()` once at the top of the file is the smaller repair when every test of the
file expects output. The exported constants and the bag are the same objects, so an existing
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

**`error`** · no fix · syntax only

**Reports.** A provider whose `useValue`, `useFactory`, `useClass` or `useExisting` hands DI a
hand-rolled service double — in a `providers` array, or through `TestBed.overrideProvider`.

**Decides on.** A `provide` key names the token (or, at an override call, argument 0 does), and the
double is read one of three ways round — which is the interesting part:

- **`useValue` is read up to the function boundary.** The value may be the object literal itself or
  a name, and a name is followed one step to the value the file settles it with — an initialiser
  (`const nav = { go: vi.fn() }`) or a single later assignment (`let nav; beforeEach(() => { nav = { go:
  vi.fn() }; })`). Both spellings had to be read, and each was measured on a suite that reported
  none of them: eight doubles declared above the TestBed and passed by name in one, and in another
  an entire 170-file shard whose every `provideAutoSpy` opportunity was the `beforeEach` form. From
  the *second* write on the name is left alone — what it holds at the use site then depends on run
  order, which no rule reading one file can decide. A single `vi.fn()` anywhere in that subtree is
  enough — one method is a service double when there is a `provide:` next to it — and the walk stops
  at every function, because a `vi.fn()` behind an arrow is created per call, which is the shape the
  rule steers towards.
- **`useFactory` is read *through* the function.** A factory's whole body is what DI ends up
  holding. Missing that let three layers of fiction hide behind one line —
  `useFactory: vi.fn().mockImplementation(() => ({ isKeyEnabled: vi.fn() }))`, a structural double
  with no relation to the class, and a double cast to make it fit.
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
providers: [provideAutoSpy(ConfigService, { overrides: { remoteConfig: { theme: 'dark' } } })];
// and for a token, which has no class to read:
providers: [provideAutoSpyForToken(LOGGER, { channel: vi.fn().mockReturnThis() })];
```

**Why it is recommended.** The same drift as
[`prefer-create-spy-from-class`](#prefer-create-spy-from-class), one DI hop away, and harder to
read: the failing line is in the component, the double is in the module configuration, and the type
system said nothing because a `useValue` is typed `any`.

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

**Where the rule does *not* run is worth checking before concluding it is blind.** One migration
shard reported ~100 `vi.fn()` invisible to the plugin across six shared `*.service.mock.ts` files, a
provider factory each: `export function providePaymentsMock(): Provider { return { provide: X,
useValue: new XMock() }; }`. The rule reads that perfectly — run over those 84 `*.mock.ts` files it
reports 9 in 9 — and the reason nothing appeared is that the consumer scopes this config to
`**/*.spec.ts`, as [the plugin page](./eslint-plugin.md) tells you to. A suite that keeps fixtures
next to the specs wants `['**/*.spec.ts', '**/*.mock.ts']`.

**Severity.** `error`, and it is the loudest rule here on a suite that has never run it: measured on
one consumer's 1759 spec files, 154 reports across 87 files — 100 `useValue`, 28 of them behind a
token, 20 stub classes and 6 at an override call. Most of that is the name-following: the same
doubles were previously reported, at `warn`, by [`no-structural-double`](#no-structural-double),
whose message recommends `createAutoMock<T>()` — the right answer for a double *without* DI and the
wrong one here. Nothing about the evidence is heuristic, which is what keeps this at `error`: every
one of those reports has a `provide:` or an override token beside it. Landing it on a suite this
size is [the gradual recipe](./eslint-plugin.md), not a severity change.

## prefer-inject-spy

**`error`** · suggestion · syntax only

**Reports.** `vi.spyOn(…)` over the instance DI handed back — inline (`vi.spyOn(TestBed.inject(X), 'm')`)
or in two steps, with the instance parked in a `const` first.

**Decides on.** The first argument is either a `TestBed.inject(…)` call or a name whose initialiser
is one, resolved in the scope the name is *used* in rather than the one it is declared in. The
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

**Limits.** An ordinary `vi.spyOn` over an object the spec owns is not reported, and neither is one
over a name the rule cannot prove came from `TestBed.inject`. The reverse case — a spec that
deliberately spies one method of a real service, having provided the real service on purpose — is
reported, and there a per-line disable stating that is the honest answer.

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

A token provided by hand — `{ provide: X, useValue: someObject }` — is recorded as *provided but
unreadable* and never reported. That is [`prefer-provide-auto-spy`](#prefer-provide-auto-spy)'s
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

**Reports.** Under the default `{ templates: 'as-needed' }`, a `TestBed.createComponent` in a file
where nothing reads the rendered template. Under `{ templates: 'never' }`, every
`TestBed.createComponent` and every `keepTemplate: true`.

**Decides on.** A substring scan of the **whole file**, not of the fixture the call returned. The
words are `nativeElement`, `debugElement`, `elementRef`, `querySelector`, `getComputedStyle`,
`triggerEventHandler`, `innerHTML`, `innerText`, `textContent`, `getAttribute`, `classList`,
`shadowRoot`, `By.css` and `By.directive`, matched as text rather than resolved. One read anywhere
silences the file.

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

Under `{ templates: 'never' }` the read scan is not run at all; the only exemption is a file that
mentions `createDirectiveHost`, because a directive attaches to an element and something has to
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

The suggestion (`TestBed.createComponent(X)` → `renderShallow(X).fixture`, with the import added)
is deliberately not a `--fix`. `renderShallow` calls `configureTestingModule` itself, adds
`NO_ERRORS_SCHEMA` and runs the first change detection: the right module for a spec that reads no
markup, but not the module the file had. A spec that already instantiated the module — any
`TestBed.inject` above the line — would start throwing *Cannot configure the test module when the
test module has already been instantiated*, and `--fix` runs unattended across a repository. It is
also offered only for the one-argument form: the two-argument form carries options `renderShallow`
spells differently, and dropping them would be silent damage.

**Severity.** `warn`, and the only one of the three graded severities that is graded on the *kind*
of finding rather than on the evidence behind it. Every other rule names something wrong or dead;
this one names a file that could render more cheaply, which is an architectural choice a suite makes
rather than a defect it has. At `error` the plugin would gate
that choice: **491 findings across 398 of one consumer's 1759 spec files** — a `recommended` that
exists to be overridden. `off` would be the wrong end of the same mistake, so the value is pinned
rather than merely kept below `error`.

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
- **`overriddenByBarerProvider`** — the survivor configures *less*. Configuration is counted by an
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
exemption that can be read off the source: an `override*` in the same hook body, *before* the
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
a helper call — is read as *present rather than empty*, because "cannot count" has to mean "there is
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
module *declares*; a standalone component brought in through `imports` carries its own scope and the
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

## no-private-member-access

**`error`** · no fix · **needs `parserOptions.project`** for two of its three forms

**Reports.** A `private` or `protected` member reached from a spec, in three spellings:
`instance['member']`, `(instance as any).member` (and the double-cast and decoy-interface variants),
and `vi.spyOn(Object.getPrototypeOf(instance), 'member')`.

**Decides on.** The type checker, and that **is** the rule. The same brackets are ordinary and
everywhere — `process.env['APP_KM_ENABLED']`, `dataset['error']`, `queryParams['id']`,
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

**Severity.** `error`. The finding is green and wrong in a way no run can report: a test that passes
today and fails on a rename no caller could have noticed.

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

| type | parameter | verdict |
| ---- | --------- | ------- |
| `Mocked<T>`, `MockedObject<T>` | any `T`, mapped member by member | **reported** — this is the whole-object double, and `Spy<T>` is what it should be |
| `Mock<T>`, `MockInstance<T>`, `MockedFunction<T>`, `MockedFunctionDeep<T>`, `PartialMock<T>` | `T extends Procedure \| Constructable` | not reported — `T` is a *function* type, so none of them can name a class in the first place; each types one `vi.fn()`, which is correct usage |
| `MockedClass<T>` | `T extends Constructable` | not reported — a mocked class **constructor**, whose counterpart here is `createSpyClass` / `mockConstructor`, not `Spy<T>` |
| `MockedObjectDeep<T>` | any `T`, mapped deeply | not reported — the deep double here is `mockDeep<T>()`, whose type is `DeepMockProxy<T>` rather than `Spy<T>` |

So a suite that types its doubles as `Mock` is not writing `Mocked<T>` in another spelling: it is
writing the *members* of a hand-built object type, and the shape worth reporting is the object type
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

- `x as Spy<T>` asserts that `x` *is* the spy, so the value is `x` and the rewrite is exact;
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

**Limits.** Neither helper is for the object *under test*: a service a spec exercises is not a
double, and typing it as the class is the repair there — which the rule cannot tell apart, so it
reports the cast either way. Where `asSpy` already names something else in the file the report
arrives without an edit.

**Severity.** `error`, and the second rule in `configs.typeErrors` for the same reason as
[`no-mocked-for-spy`](#no-mocked-for-spy): the finding is `TS2352`, so the build is already red.

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
  because the namespace hangs off a *method* of the double (`api.load.and.returnValue(…)`), and a
  name is followed through every write, initialiser included, since `let api: Spy<Api>` filled in a
  `beforeEach` is how most suites build their doubles;
- importing any entry that *cannot* load the jasmine one silences the file — `vitest-auto-spy/bun`,
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
import { createSpyFromClass } from 'vitest-auto-spy/jasmine'; // or install the layer
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
the problem. The spec asked for the arguments *as they were passed*; after the move it reads whatever
the code under test left in that object afterwards, so an assertion about the state at call time
silently becomes one about the state at assertion time, and it now passes or fails on a value nobody
wrote. There is no diff, no warning and no failing run to point at it — the purest silent case in the
plugin.

**Limits.** Inert unless the suite came from jasmine. `captureArg<T>()` is how to *reach* an
argument at all, and the message says so, but it keeps the same reference the assertion matched: it
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
