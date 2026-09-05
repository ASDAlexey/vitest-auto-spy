---
title: ESLint plugin
description: Nineteen flat-config lint rules that steer a suite onto the auto-spy helpers, grouped by subject, every one an error by default, with the dial documented and the false-positive cases named.
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

**How this page is laid out.** [Adding it](#adding-it-to-your-project) is the four things a first
config needs. [Which apply to you](#which-of-the-twenty-apply-to-you) answers the question a
Vitest-only project asks — four of the twenty are about a dialect you may not speak.
[Rules](#rules) is the reference table, in five groups. [Tuning](#tuning-it-for-your-project) is
every dial, including the three rules that can report on correct code. Everything after that is
_why_ — one section per rule, for when a report has arrived and you want to know what it saved you
from.

## Adding it to your project

Nothing to install — the plugin is a subpath of the package you already have, so it is always on the
version of the API it recommends.

### 1. The config block

`configs.recommended` is a plain object with two keys, `plugins` and `rules`, and spreading it is
all the wiring there is. Put it **after** your other configs so its severities are the ones that
survive:

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    ...autoSpy.configs.recommended,
  },
];
```

### 2. The `files` glob is not optional

There is no default glob, and that is deliberate: only you know where your specs live. Get it wrong
in the two directions and the failures look nothing alike — too **narrow** and the plugin is silently
inert (the commonest support question, and `npx eslint --print-config path/to/a.spec.ts` settles it
in one command); too **wide** and `no-object-define-property` starts reporting on application code
that is entitled to call it.

Common shapes:

```js
files: ['**/*.spec.ts'],                                  // Angular, Karma-era layout
files: ['**/*.test.ts', '**/*.test.tsx'],                 // React / Vue / Node
files: ['**/*.{spec,test}.{ts,tsx}', '**/test/**/*.ts'],  // both, plus a test folder
```

In a monorepo, one block at the root covers every package as long as the glob is not anchored —
`'**/*.spec.ts'` matches `packages/*/src/**` fine. Add a second block only where one package's specs
need different severities.

### 3. No type information required

Every rule is syntactic: they read the file's own AST and never ask the type checker. So the plugin
works with `parserOptions.project` unset, adds nothing measurable to lint time, and does not need
your specs to be in a `tsconfig` — which matters in the repositories where they are not.

The cost of that is the honest limit of [the three rules that can report on correct
code](#the-three-rules-that-can-report-on-correct-code): what a rule cannot see in one file, it
cannot know.

### 4. What the first run looks like

Every rule is an `error`, so on an existing suite the first run is likely to be red — that is the
point of the default, not a misconfiguration. Two things make the first pass short:

```bash
npx eslint . --fix          # prefer-as-spy, no-mocked-for-spy and prefer-native-spy-api rewrite themselves
npx eslint . --format stylish | tail -30   # the summary tells you which rule dominates
```

Whatever is left is either a real finding or a rule you would rather not enforce yet. Both are
answered below.

## Which of the twenty apply to you

Reasonable question if you came straight to Vitest and have never written a line of Jasmine: **four
of these rules are about a dialect you do not speak.** They are still on, and the reason is not
principle — it is that they cannot fire on your code.

| You are                                    | What the plugin does for you                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| writing Vitest, never used Jasmine or Jest | the fifteen core rules work; **the four jasmine rules are inert** — leave them on and never see them |
| migrating off `jest-auto-spies` / Jest     | the core rules do the work, `no-done-callback` and `prefer-as-spy` most of it                        |
| migrating off `jasmine-auto-spies`         | all twenty, with `prefer-native-spy-api` set to `'off'` until the bridge is gone                   |

### If you never used Jasmine

Each of the four keys on syntax a Vitest suite does not contain, so there is nothing for them to
report:

| Rule                              | Keys on                                                                          | In your suite                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `no-jasmine-globals`              | `jasmine.*` and the bare globals `spyOn(`, `spyOnProperty(`, `fail(`, `pending(` | you write `vi.spyOn` and `expect.fail`; the bare forms are a `ReferenceError` under Vitest, so they do not exist |
| `jasmine-namespace-without-entry` | `.and` / `.calls` / `.withArgs` **on a spy this library built**                  | you write `.mockReturnValue`, `.mock.calls` and `calledWith`                                                     |
| `no-save-arguments-by-value`      | `spy.calls.saveArgumentsByValue()`                                               | jasmine's own API; no Vitest suite has the call                                                                  |
| `prefer-native-spy-api`           | the same `.and` / `.calls` namespaces                                            | same as above                                                                                                    |

So turning them off is allowed and buys nothing measurable — a rule with no matching node does no
work beyond the AST visit every rule already makes. If you would rather see a shorter config anyway:

```js
export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules,
      // we have never used jasmine; these four have nothing to say here
      'vitest-auto-spy/no-jasmine-globals': 'off',
      'vitest-auto-spy/jasmine-namespace-without-entry': 'off',
      'vitest-auto-spy/no-save-arguments-by-value': 'off',
      'vitest-auto-spy/prefer-native-spy-api': 'off',
    },
  },
];
```

::: warning One of them used to fire on a Vitest suite anyway — fixed in 4.0.0
`jasmine-namespace-without-entry` matched `spy.mock.calls[0]`, `spy.mock.calls.length` and
`spy.mock.calls[0]?.[0]` — the way every Vitest suite reads its recorded arguments. The member is
named `calls`, the `[0]` makes it read _through_, and the chain walks down to one of this library's
factories, which was all three conditions the rule had. Bare `spy.mock.calls` passed while
`spy.mock.calls[0]` was reported, a difference no message could explain, and at `warn` nobody chased
it. The rule now refuses any namespace hanging off `.mock`, which is the runner's bookkeeping and
never jasmine's.
:::

### If you are coming from Jest

There is no separate Jest rule set, because most of what a Jest suite has to unlearn is already in
the core fifteen — these are the ones that carry a migration:

| Rule                           | What it catches in a Jest suite                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-done-callback`             | `it('x', (done) => …)`. Vitest passes a callable `TestContext` there, so `done()` throws — and where it sits at the bottom of a callback the test [passes having run almost none of itself](#no-done-callback-%E2%80%94-what-the-first-parameter-actually-is) |
| `prefer-as-spy`                | `TestBed.inject(X) as Spy<X>`, written once per double in a `jest-auto-spies` suite and `TS2352` under this library — [the commonest compile error a migrated Angular suite produces](/migrating#reading-a-spy-back-out-of-the-container)                     |
| `no-mocked-for-spy`            | `Mocked<T>` declarations, which demand the private fields a spy does not have                                                                                                                                                                                 |
| `no-shared-module-level-mock`  | an exported `{ save: jest.fn() }` fixture — one object per **worker** under `isolate: false`, not one per test                                                                                                                                                |
| `prefer-create-spy-from-class` | the object-of-`fn()`s double, which drifts from the class the day it grows a method                                                                                                                                                                           |
| `no-floating-assertion`        | `expect()` in a `.then()` nobody awaits                                                                                                                                                                                                                       |

`no-jasmine-globals` is worth leaving on here too, and not for the reason the name suggests: Jest ran
on **jest-jasmine2** until Jest 27, and that runner installed `spyOn`, `fail` and `pending` as
globals — so a suite old enough to predate `jest-circus` really can contain them. The dangerous one
is `spyOn`: jasmine's installs a stub, `vi.spyOn` calls through, so the rename compiles, the spec
runs, and the code under test starts talking to its collaborator for real.

The bulk edit is a command rather than a lint pass — `npx vitest-auto-spy codemod --from jest`
(`--from jasmine` for the other dialect, and the default `auto` reads each file and applies the set
that file needs). See [Migrating from jest-auto-spies](/migrating).

### If you are coming from Jasmine

All twenty apply, and the four in the last group are the ones written for you. Two are pure
diagnosis — `no-jasmine-globals` and `no-save-arguments-by-value` name silent behaviour changes that
survive a rename — and `jasmine-namespace-without-entry` catches the spy built before the layer was
installed. The fourth, `prefer-native-spy-api`, reports the bridge itself, so it is the one line of
config a migration wants until the suite is green:

```js
'vitest-auto-spy/prefer-native-spy-api': 'off', // delete this for the last mile
```

The bulk edit is `npx vitest-auto-spy codemod --from jasmine`, which does what the rule declines to
autofix. See [Migrating from jasmine-auto-spies](/migrating-jasmine).

## Rules

Every rule is an `error`. Until 4.0.0 this table was a graded mix of `error` / `warn` / `off`, which
meant the plugin decided how much each project cared; a `warn` that nothing reads is `off` with extra
output, and which findings block a merge is a project's call, not a library's. Turning one down is
[one line](#turn-one-rule-down).

The **Without it** column is what the run does when the rule is not there, and it is the reason the
list is worth reading rather than skimming: over half of these guard against a test that is _green
and wrong_, which is the only failure mode a suite cannot report on itself. Eleven of them were
[probed](#measured-what-each-rule-is-worth); the rest are read off the source and marked _(by
construction)_.

### Assertions that never run

The test passes because the assertion was never reached — the stream stayed silent, the promise was
never awaited, the callback returned first.

| Rule                                                                                            | Flags                                                                                         | Fix     | Without it |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------- | :--------: |
| [`no-expect-in-subscribe`](#no-expect-in-subscribe-reports-one-shape-and-three-different-edits) | `expect()` inside a `subscribe()` callback → `expectEmission` / `firstValueFrom`              | suggest |   green    |
| [`no-floating-assertion`](#an-assertion-in-a-then-nobody-awaits)                                | `expect()` in a `.then()` nobody awaits → `expect(await promise)`                             | —       |   green    |
| [`no-done-callback`](#a-done-parameter-is-not-a-style-question)                                 | `it('x', (done) => …)` → `async` + an awaited assertion, and `done.fail(…)` at the call site  | —       |   green    |
| [`no-bare-called-with`](#no-bare-called-with-%E2%80%94-one-word-two-opposite-meanings)          | `spy.m.calledWith(1);` as a statement of its own — a stub nobody continued, asserting nothing | —       |   green    |

### Doubles, and the modules that hold them

Not about a single test but about what one file leaves behind for the next.

| Rule                                                                                                 | Flags                                                                                                                    | Fix     |       Without it        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- | :---------------------: |
| [`prefer-create-spy-from-class`](#two-things-these-rules-learned-the-hard-way)                       | an object literal of two or more `vi.fn()`s → `createSpyFromClass` / `createAutoMock`, unless it is a factory's own seed | —       |           red           |
| [`no-shared-module-level-mock`](#a-double-built-once-per-worker-not-once-per-test)                   | an **exported** value holding `vi.fn()`s → export a factory that returns it                                              | —       |          green          |
| [`no-object-define-property`](#no-object-define-property-%E2%80%94-nothing-puts-the-descriptor-back) | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp`                                                 | suggest |          green          |
| [`no-import-time-spread`](#the-spread-that-only-fails-under-a-bundler)                               | `export const x = [...Imported]` at module scope → a `TypeError` while the bundle loads                                  | suggest | red _(by construction)_ |

### Angular DI and the TestBed

Five ways a provider ends up not being the double the spec thinks it registered.

| Rule                                                                                               | Flags                                                                                                                    | Fix     |       Without it        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- | :---------------------: |
| [`prefer-provide-auto-spy`](#two-things-these-rules-learned-the-hard-way)                          | a hand-rolled `useValue` **or** `useFactory` → `provideAutoSpy(Class)` / `provideAutoSpyForToken(TOKEN)`                 | —       |           red           |
| [`prefer-inject-spy`](#the-three-prefer-rules-%E2%80%94-drift-and-one-line-that-undoes-a-provider) | `vi.spyOn(TestBed.inject(X), 'm')`, inline or via a `const` → `injectSpy(X).m`                                           | suggest |           red           |
| [`no-unregistered-inject-spy`](#the-spy-that-only-the-compiler-can-see)                            | `injectSpy(X)` for a token this file never registered → the real instance, whose spy helpers exist only for the compiler | —       | red _(by construction)_ |
| [`prefer-render-shallow`](#the-render-nobody-reads)                                                | `TestBed.createComponent` in a file that never reads the template → `renderShallow(X)`                                  | suggest |          green          |
| [`no-overridden-provider`](#two-providers-one-token)                                               | two providers for one token in one array → the earlier one never runs; the exact duplicate can be deleted                | suggest |          green          |
| [`no-inject-before-override`](#the-trap-this-plugin-s-own-advice-sets)                             | `TestBed.inject()` in a hook, in a suite that still calls `override*`                                                    | —       |           red           |

### Types

The two whose absence the compiler reports — loudly, but in the vocabulary of the class rather than
of the mistake.

| Rule                                       | Flags                                                                                                                                      | Fix               |         Without it          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | :-------------------------: |
| [`no-mocked-for-spy`](#the-two-type-rules) | `Mocked<T>` in any type position → `Spy<T>`, import and all — a suggestion where the value assigned is not one of this library's factories | `--fix` / suggest |           compile           |
| [`prefer-as-spy`](#the-two-type-rules)     | `TestBed.inject(X) as Spy<X>` → `asSpy(TestBed.inject(X))`, import and all                                                                 | `--fix`           | compile _(by construction)_ |

### Coming off jasmine

Written for a suite that has not arrived yet — one running on
[`vitest-auto-spy/jasmine`](/migrating-jasmine), or one that thinks it is. **Inert in a suite that
never used jasmine** — see [which apply to you](#if-you-never-used-jasmine).

| Rule                                                                                                            | Flags                                                                                                            | Fix               |         Without it         |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------- | :------------------------: |
| [`no-jasmine-globals`](#no-jasmine-globals-%E2%80%94-the-one-that-pays-for-itself-on-the-first-run)             | `jasmine.*`, bare `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, and `.withContext(` | —                 | green _(the `spyOn` case)_ |
| [`jasmine-namespace-without-entry`](#jasmine-namespace-without-entry-%E2%80%94-the-one-that-needs-setupmodules) | `.and` / `.calls` / `.withArgs` on a library spy in a file that installs the compatibility layer nowhere         | —                 |  red _(by construction)_   |
| [`no-save-arguments-by-value`](#no-save-arguments-by-value-%E2%80%94-the-purest-silent-case-on-this-page)       | `spy.calls.saveArgumentsByValue()` — a no-op here, so the spec silently asserts on post-mutation state           | —                 | green _(by construction)_  |
| [`prefer-native-spy-api`](#prefer-native-spy-api-%E2%80%94-the-one-to-switch-off-while-you-migrate)             | `.and` / `.calls` where the spy's own API says the same thing — the last mile off the jasmine shim               | `--fix` / suggest | — _(reports working code)_ |

## Tuning it for your project

The config is a plain object, so every dial is one line in **your** `eslint.config.js` — nothing
here needs a fork or a wrapper.

### Turn one rule down

```js
export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules,
      'vitest-auto-spy/prefer-provide-auto-spy': 'warn', // report it, do not block the merge
      'vitest-auto-spy/prefer-create-spy-from-class': 'off', // not our house style
    },
  },
];
```

Spread `autoSpy.configs.recommended.rules` before your overrides — a bare `rules` key next to the
spread config **replaces** the whole map rather than merging into it, and the result is a config with
two rules in it and no error to say so.

### Land it on a large existing suite without a red CI

Take the findings as warnings first, fix them in batches, then delete the block:

```js
const asWarnings = Object.fromEntries(Object.keys(autoSpy.configs.recommended.rules).map((rule) => [rule, 'warn']));

export default [
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: { ...autoSpy.configs.recommended.rules, ...asWarnings },
  },
];
```

A middle road that ages better: keep every rule at `error` and put the not-yet-fixed files behind a
second block with the offending rules `off` in it. A shrinking list of paths is visible progress; a
suite-wide `warn` is a decision nobody revisits.

### The three rules that can report on correct code

Every rule here is syntactic, and three of them are asked a question one file cannot always answer.
They are still errors — being wrong about your project is fixable in one line, and each line is
below — but these are the ones to look at first if the first run surprises you.

| Rule                              | When it is wrong about you                                                                                                                                                | The line that fixes it                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `jasmine-namespace-without-entry` | `enableJasmineCompat()` lives in a Vitest `setupFiles` entry that no spec imports, so a file using `.and` looks like a file with no layer installed                       | `['error', { setupModules: ['./test-setup'] }]`                                |
| `no-unregistered-inject-spy`      | the file registers some doubles in a shape the rule reads **and** obtains another through a helper it does not follow — a shared `beforeEach` that configures the TestBed | no option; a scoped `'off'` or a per-line disable                              |
| `prefer-native-spy-api`           | you are **mid-migration** off `jasmine-auto-spies`; it reports working bridge code, so on day one it fires on every line of the bridge                                    | `'off'` until the suite is green, then `'error'` and `--fix` for the last mile |

Only the first has an option, and there `setupModules` is the fix rather than the severity: it tells
the rule where the layer is installed and it stops guessing. Importing an entry that _cannot_ load
the jasmine one (`vitest-auto-spy/bun`, `…/node`) silences it for that file too.

`no-unregistered-inject-spy` needs no option in most projects because it is **already** conservative:
it says nothing unless the file calls `provideAutoSpy` at least once, and it goes quiet the moment it
meets something it cannot read — a spread or an unknown provider factory in `providers`,
`createWithAutoSpies`, `renderShallow`, or `TestBed.overrideProvider`. What survives that filter is
usually a real finding: `injectSpy(X)` handing back the real service, with spy helpers that are there
for the compiler and throw on the first `.mockReturnValue(…)`.

### Silence one line, not one rule

```ts
// eslint-disable-next-line vitest-auto-spy/no-object-define-property -- the property is a getter on a frozen host object
Object.defineProperty(target, 'clientWidth', { value: 100 });
```

Worth preferring over a config-level `off` wherever the exception is genuinely local: the rule keeps
working for the other four hundred files, and the comment records why this one is different.

### Check what actually applies

```bash
npx eslint --print-config src/app/cart.spec.ts | grep vitest-auto-spy
```

If that prints nothing, the `files` glob does not match — which is the same symptom as "the plugin
found no problems", and the reason to check it before concluding the suite is clean.

### Rule options

`prefer-render-shallow` takes one, and it turns a cost finding into a policy:

```js
'vitest-auto-spy/prefer-render-shallow': ['error', { templates: 'never' }],
```

`'as-needed'` — the default — reports only a render whose template nothing reads. `'never'` reports
every `TestBed.createComponent` and every `keepTemplate: true`, for a project that has decided markup
belongs to e2e. It costs a 100 % coverage threshold on components; the measurement is in
[the render nobody reads](#the-render-nobody-reads).

`prefer-create-spy-from-class` takes one:

```js
'vitest-auto-spy/prefer-create-spy-from-class': ['error', { minRunnerFns: 1 }],
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
const api = mockDeep<Api>({ api: { load: vi.fn(), save: vi.fn() } }); // ✅ nor at any depth
```

Anything inside a call to `autoMocked`, `createAutoMock`, `createMock`, `createSpyClass`,
`createSpyFromClass`, `mockConstructor`, `mockDeep`, `provideAutoSpy` or `provideAutoSpyForToken`
is exempt. `prefer-provide-auto-spy` needs no such exemption: a `useValue` a factory built is a
call, and it only ever looked at object literals.

### Picking rules by hand

Skip `configs.recommended` entirely and name the rules you want — the plugin object is exported on
its own, so this is a supported shape rather than a workaround. Prefer
[Tuning it for your project](#tuning-it-for-your-project) if you want the whole set with a few dials
turned; prefer this if you want a short list and nothing else:

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  {
    files: ['**/*.spec.ts'],
    plugins: { 'vitest-auto-spy': autoSpy },
    rules: {
      'vitest-auto-spy/no-expect-in-subscribe': 'error',
      'vitest-auto-spy/no-done-callback': 'error',
    },
  },
];
```

Every message ends with a link to the matching recipe in the README's
[How to mock](https://github.com/ASDAlexey/vitest-auto-spy#how-to-mock) section: a rule that only
says "don't" moves the problem rather than solving it. The rules travel with the API they
recommend, so they are versioned together and stop being re-written in every project that installs
the package.

## Why the rules exist

One section per rule, in the order of the table above, for when a report has arrived and the question
is what it saved you from. The [four jasmine rules](#the-four-jasmine-rules) have their own section
after this one; the [measurements](#measured-what-each-rule-is-worth) that back the _Without it_
column are at the end.

### `no-bare-called-with` — one word, two opposite meanings

`calledWith` is this library's **stub** configurator. Since Vitest 4.1 it is also, in chai's
bundle, an **assertion**:

```ts
expect(fn).to.have.been.calledWith('example'); // chai: checks that the call happened
cart.checkout.calledWith(1); // this library: configures what a call answers
```

The second line asserts nothing. It registers "for the argument `1`, answer `undefined`" — which is
what an unconfigured spy already does — so the test passes whether or not `checkout` was ever
called. The rule reports it and names both repairs: continue the chain
(`.mockReturnValue(v)`, `.resolveWith(v)`, `.nextWith(v)`, `.failWith(err)`), or assert with
`expect(spy.method).toHaveBeenCalledWith(...)`. Chains rooted at `expect(...)` are left alone, so
chai's own form never trips it.

`mustBeCalledWith` on its own gets a different message, because it is wrong in a different way: with
nothing configured for the arguments it was given, it rejects **every** call — the matching one
included.

### `no-expect-in-subscribe` reports one shape and three different edits

Five migration batches split this work by hand, and the proportions move per _file_, not per suite:
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
shape. A helper declared _inside_ the callback is counted once, not twice.

### An assertion in a `.then()` nobody awaits

`no-floating-assertion` catches the same failure as `no-expect-in-subscribe`, one queue over.
`compileComponents().then(() => expect(…))` as a statement of its own runs its callback after the
test that wrote it has finished, so the assertion cannot fail it — and under zone.js the resulting
rejection is drained into `console.error` rather than reported, leaving a green test and a line of
stderr. The rule looks only at the _immediately_ enclosing callback, because that is the scope where
awaiting the chain is the actual fix: an `expect()` parked in a `subscribe()` or a `setTimeout()`
inside the `.then()` is left to `no-expect-in-subscribe` and to
[`setupAutoSpy({ strayRejections: true })`](/utilities/setup#_8-failing-on-a-rejection-zone-js-swallowed),
which catches at runtime what no selector can see.

### A `done` parameter is not a style question

Vitest passes a callable `TestContext` as the first parameter of a test, so calling it throws —
`done() callback is deprecated, use promise instead` on Vitest 4,
[measured below](#no-done-callback-%E2%80%94-what-the-first-parameter-actually-is). That is the
harmless case. In the
shape a Jasmine suite is actually full of, the call sits at the bottom of a callback, the body
returns `undefined` before it runs, and the test **passes** having run almost none of itself. Four such tests sat green for years in the suite this
rule came from; nothing but a type-checker ever noticed, and only indirectly.

### A double built once per worker, not once per test

`no-shared-module-level-mock` exists because an exported double is built once per **module**, not
once per test:

```ts
// ❌ every importing spec shares these spies, for the whole worker
export const actionContext = { actions: { navigateToSection: vi.fn() } };

// ✅ one set per caller
export const createActionContext = () => ({ actions: { navigateToSection: vi.fn() } });
```

Under `isolate: false` a module is evaluated once per worker, so every importing file shares one
object. `clearMocks: true` does reach the spies inside it — [measured](#no-shared-module-level-mock-%E2%80%94-one-module-two-files) — and
clears their calls; what it cannot clear is the state the fixture keeps next to them, which crosses
from whichever file ran first into all the rest. The rule
stops at every function boundary, so the factory form — the fix — is not flagged along with the
problem. Scope it to fixture modules and spec files alike; a spec file
[should export nothing at all](/utilities/setup#shared-fixtures-are-functions-not-constants).

### The spread that only fails under a bundler

`no-import-time-spread` exists for a `TypeError` raised while a spec bundle _loads_, on a tree whose
every test passes:

```
Spread syntax requires ...iterable[Symbol.iterator] to be a function
```

The shape is a module-scope spread whose operand is a value another module owns:

```ts
import { BaseEvents } from './base-events';

export const webosEvents = [...BaseEvents]; // ❌ safe under tsc, a TypeError inside a bundle
```

Under `tsc` and under a browser's ESM loader this cannot fail — a module never runs before its
dependency. Inside one bundle it can: the builder emits shared chunks, a chunk may be evaluated while
a binding it re-exports is still `undefined`, and `[...undefined]` throws. It is the same root cause
as the [barrel-initialisation note](/migrating) in the migration guide, but the symptom names neither
a module nor a barrel, so nothing connects the two.

The scan is worth having because the population it finds is small: an AST pass for module-level
spreads of an imported identifier found exactly **seven** sites in an 8 673-file workspace, two of
them spreading a workspace barrel. That is small enough to flag at the cursor, and it is decidable
from the imports in the same file.

::: warning The same message has a second cause the rule cannot see
`Spread syntax requires ...iterable[Symbol.iterator] to be a function` is also what a spec bundle
says when the **builder** has laid its entry points out differently, and then no spread in the source
is at fault at all. Measured on one shard of an Angular workspace, unchanged tree, three
configurations in a row: with `@angular/build:unit-test`'s own `isolate` key unset, 860 files green;
with `"isolate": false`, 39 files red with this message and **zero tests collected**; with
`"isolate": true`, 860 files green again. The runner-level `isolate` and the builder option of the
same name are not the same setting.

The tell is the test count. A module-scope spread that really is broken takes the file down _after_
the tests are collected; the builder case collects none, has no stack at all, and the list of failing
files does not repeat between runs. Read that as "not a spread" and leave the builder's `isolate` key
unset — let coverage turn isolation on — rather than writing `false`. Those numbers come from a
single series and are not reproduced here.
:::

Three things are deliberately not reported, because they run later than the module does:

```ts
export const make = () => [...BaseEvents]; // a function body
class Events {
  all = [...BaseEvents]; // an instance field — runs at construction
  static all = [...BaseEvents]; // …but a static one is flagged: it runs with the class declaration
}
```

And the operand has to be the imported binding itself. `[...BaseEvents.slice()]` is a call, and
whatever that throws is a different problem.

### Two things these rules learned the hard way

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

### The trap this plugin's own advice sets

`TestBed.inject()` and `TestBed.createComponent()` **instantiate** the testing module, and after
that every `TestBed.override*` throws. Migrating to `provideAutoSpy` walks people into it: a
hand-rolled `useValue` configured its return values inside the literal, and the replacement has
nowhere to put them, so the line goes into `beforeEach`.

```ts
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideAutoSpy(Api)] });
  asSpy(TestBed.inject(Api)).load.mockReturnValue(of(page)); // ❌ the module is now instantiated
});
```

Every `override*` in the suite then throws — including one written _above_ this line, inside a
`createComponent` helper the tests call. Found twice independently after a migration, once for
sixteen tests at a stroke. Two repairs, both in the message:

```ts
it('renders', () => {
  TestBed.overrideProvider(Other, { useValue: x });
  injectSpy(Api).load.mockReturnValue(of(page)); // ✅ configured after every override
});

const api = () => injectSpy(Api); // ✅ or keep the access lazy, so that
//    instantiation happens in the first test
```

The check is deliberately **order-free**, because lexical order is not run order — the helper above
is the case that proves it. It asks whether the suite overrides at all, with the one exemption that
can be read off the source: an `override*` sitting in the same hook body ahead of the injection
really does run first. A suite calling `TestBed.resetTestingModule()` is exempt outright.

### Two providers, one token

Angular keeps the **last** provider registered for a token, so everything above it is dead. In a
testing module that is not tidiness:

```ts
providers: [
  provideAutoSpy(DisplaySettingsService), // ❌ never runs
  { provide: DisplaySettingsService, useValue: mockDisplaySettingsService }, // this is what DI hands out
];
```

Eight tokens in one spec file were registered both ways at once. It misleads from both sides: the
author believes there is an auto-spy and writes assertions against one, while the double actually
injected is the hand-rolled object drifting from the class — and whoever later comes to replace that
object sees `provideAutoSpy` beside it and reads the migration as already done.

Tokens are compared as written, not resolved: in a `providers` array a token appears by name, once,
next to the double it stands for, so there is nothing for a resolver to add.

#### The pair is classified, because the two halves are not the same defect

The first field data for this rule — 20 reports across an 8 673-file workspace — split in two, and
the rule now says which half it is looking at.

**Most were literal duplicates.** The same provider written twice, in the same words:

```ts
providers: [provideAutoSpy(KidsModeService), provideRouter([]), provideAutoSpy(KidsModeService)];
```

Angular had already ignored the first one, so deleting it cannot change what the test gets. That is
the one shape here that comes with an edit — offered as a **suggestion**, and never as `--fix`,
because a run that deletes lines of a `providers` array unattended is not something to discover in a
diff. The message names the token and the line the surviving copy is on.

**The rest are the interesting kind: the survivor is the _barer_ of the two.**

```ts
providers: [
  provideAutoSpy(AccountService, { gettersToSpyOn: ['plan'], instanceMethodsToSpyOn: ['refresh'] }),
  provideAutoSpy(AccountService), // ← this is the one DI hands out
];
```

Everything the first line configured is gone, and the assertions below run against a poorer spy
answering to the same name — the double the spec set up is not the double it got. There is nothing
to delete for you here, because which of the two to keep is the entire question, so the message says
that instead: move the configuration onto the surviving provider, or delete that one.

Anything that is neither — an auto-spy buried by a configured hand-rolled `useValue`, the
eight-tokens case above — keeps the original wording, plus the line number of the provider that wins.

**`multi: true` is exempt, and has to be.** Angular _accumulates_ multi providers for a token rather
than keeping the last, so a second one is not an override at all:

```ts
providers: [
  { provide: BEFORE_INIT, useValue: first, multi: true },
  { provide: BEFORE_INIT, useValue: second, multi: true }, // both run, in this order
];
```

A spec asserting that its hooks run in registration order needs both, and reporting either can only
be silenced with an `eslint-disable` over a working test. Mixing the two modes for one token stays a
report: Angular refuses that pair at runtime with
`Cannot mix multi providers and regular providers`, so it is a defect whichever half was meant. A
value the rule cannot resolve (`multi: flag`) is read as multi — a missed report costs nothing, a
false one costs a disable comment over correct code.

`prefer-provide-auto-spy` steps back from the same shape for a different reason: `provideAutoSpy`
builds one double for a token and takes no registration mode, so the replacement it would recommend
does not exist and following it would quietly turn an accumulating provider into an overriding one.

### The spy that only the compiler can see

`no-unregistered-inject-spy` reports an `injectSpy(X)` for a token nothing in the file registered as
an auto-spy:

```ts
TestBed.configureTestingModule({
  imports: [RouterTestingModule], // provides a real ActivatedRoute
  providers: [provideAutoSpy(UserService)],
});

const route = injectSpy(ActivatedRoute); // ❌ the real one, with spy helpers that are not there
```

What comes back is whatever Angular DI already had — the real service, or an object an imported
testing module put there. The compiler has no objection, and that is the whole defect: `injectSpy`
is declared to return a `Spy<T>`, so every helper on it type-checks against that declaration rather
than against the value, and the helpers are therefore present for `tsc` and absent at run time. The
first `.mockReturnValue(…)` or `.calledWith(…)` lands on a real method and throws there, as a
`TypeError` on a line that reads like ordinary spy setup.

The library already says this at run time: `injectSpy` checks what the injector handed back and
warns that it is a plain instance. A warning on stderr is the weakest place to say it. It does not
fail the run, it scrolls past in a suite of a thousand files, and it arrives only for the tests that
actually executed the line — in one consumer monorepo dozens of spec files print it on every CI run
and it has never been acted on. Nothing about the check needs type information, so it belongs where
the mistake is written: the whole question is which tokens this file registered, and which token is
being asked for.

**The rule is quiet unless it can see the whole picture**, because a false positive here costs more
than the warning it replaces. It reports nothing when:

- the file never calls `provideAutoSpy` — then it configures DI in some way this does not model, and
  a token missing from the tally says nothing;
- any `providers` array holds a spread or a provider factory other than `provideAutoSpy`.
  `providers: [...sharedMocks]` is the ordinary way to pull in a shared mock module, and what it
  registers is out of sight. One unreadable entry hides an unknown number of tokens, so it silences
  the **file** rather than one line;
- the file calls `createWithAutoSpies`, `renderShallow` or `TestBed.overrideProvider`, each of which
  registers doubles somewhere this scan does not look.

A token provided by hand — `{ provide: X, useValue: someObject }` — is recorded as provided and left
alone. `prefer-provide-auto-spy` is the rule for that shape, and two rules firing on one line would
only teach people to disable both. A `useValue` that is a call to `createAutoMock`,
`createSpyFromClass`, `createMock` or `mockDeep` counts as a registration, the same as
`provideAutoSpy` does. Tokens are compared as source text, the way `no-overridden-provider` already
compares them, and there is no fix and no suggestion: the repair is either a provider this file does
not have, or a `TestBed.inject(X)` that says the real implementation was the point.

### The render nobody reads

`prefer-render-shallow` reports a `TestBed.createComponent` in a file where nothing ever reads the
rendered template — no `nativeElement`, no `debugElement`, no `By.css`, no `querySelector`. The code
works; the run is green either way. What the rule is about is the bill.

`TestBed.createComponent` compiles the component's template and instantiates the whole child
subtree. A spec that only sets inputs and asserts on signals or plain state buys nothing with that
subtree, and pays for it once per test. `renderShallow(X)` is the same `TestBed`, the same real
`ComponentFixture`, with the children dropped and the template blank — inputs, signals, lifecycle
hooks and DI all stay.

How much that saves is not a matter of opinion; `bench-angular/` measures it, and the numbers are
gated against a committed baseline. Per-test cycle, relative to `TestBed.createComponent`:

| Children the component renders | `renderShallow()`  |
| ------------------------------ | ------------------ |
| 0                              | level — see below  |
| 25                             | 0.57×              |
| 100                            | 0.24×              |
| 400                            | 0.05×              |

**Read the first row before the last one.** At zero children there is nothing to save and the two
measurements straddle 1.0 — that row is the noisiest in the benchmark (±16 % against ±3 % for the
100-child one), and `overrideComponent` forces a JIT recompile that a leaf component was not paying
for. The rule earns its place in a suite whose components render other components, and the deeper
the tree the more it earns. Blanking the template alone — the step from
`renderShallow({ keepTemplate: true })` to `renderShallow()` on the 100-child component — is worth
about **3.8×** on its own.

Two things the rule cannot see, both of which are the same fix:

- A component that reads its own template through `viewChild`, `contentChild` or content
  projection needs the template to exist. The rule reads the spec, not the component, so it will
  report this one; `renderShallow(X, { keepTemplate: true })` keeps the template and still drops the
  children.
- A component whose behaviour is driven from its own template — an event bound in the markup, a
  `@defer` block — is in the same position.

The question the rule asks is deliberately about the **file**, not about one fixture: a component
suite parks the fixture in a `let`, fills it in `beforeEach` and reads `debugElement` three helpers
away. One template read anywhere silences the whole file, so the rule under-reports rather than
guesses.

#### The rewrite is offered, not applied

The rule ships a **suggestion** — `TestBed.createComponent(X)` → `renderShallow(X).fixture`, with
the import added when the name is free — and deliberately no `--fix`. `renderShallow` calls
`configureTestingModule` itself, adds `NO_ERRORS_SCHEMA` and runs the first change detection: the
right module for a spec that reads no markup, but not the module the file had. `--fix` runs
unattended across a repository, and a spec that already instantiated the module — any
`TestBed.inject` above this line — would start throwing *Cannot configure the test module when the
test module has already been instantiated*. A suggestion is pressed one call at a time, with the
diff in front of you.

It is offered only for `TestBed.createComponent(X)` with the component alone. The two-argument form
carries options `renderShallow` spells differently, and a rewrite that dropped them would be silent
damage.

#### `{ templates: 'never' }` — the policy switch

The default is `'as-needed'`: report the render nobody reads. A project that has decided markup
belongs to e2e can say so instead, and then no spec renders a real template at all:

```js
'vitest-auto-spy/prefer-render-shallow': ['error', { templates: 'never' }],
```

Under `'never'` every `TestBed.createComponent` is reported whether or not the file reads the DOM,
and so is `keepTemplate: true`. One render is exempt: a host built by
[`createDirectiveHost`](/adapters/angular). A directive attaches to an element, so something has to
render that element — the host's template is the harness, not the markup under test, and banning it
would ban testing directives at all, including the way this package's own documentation recommends.

**Know the bill before you turn it on.** Measured on one consumer suite: `'never'` took **18 of 40**
tests in a component spec red and coverage from **100 % to 95.7 %**. Nothing was excluded from the
report — with `templateUrl` the compiled template maps back to the `.html`, which a `*.ts` coverage
glob never matched in the first place. What stopped executing was ordinary TypeScript: the body of a
method whose entry condition is a `viewChild` the template supplies. That code does not disappear
from the report when it stops running, and no coverage setting can hide it, because it is not
template code — it is the component's own. A project taking this option gives up a 100 % line
threshold on its components, and that is the trade, stated plainly.

### The two type rules

`no-mocked-for-spy` reports the **declaration** form, not every use: `Mocked<T>` still has a place
next to `vi.mocked()`, and the rule leaves that alone. What it is for is the declaration whose
assignment then fails with a list of private field names that says nothing about the real cause.

`prefer-as-spy` is the same question one line down, and it is the one a migration meets in bulk:
`devicesService = TestBed.inject(DeviceListService) as Spy<DeviceListService>` is written once per injected
double in a `jest-auto-spies` suite, and every one of them fails with `TS2352` under this library —
[the most common compile error a migrated Angular suite produces](/migrating#reading-a-spy-back-out-of-the-container).
`asSpy(...)` is the same assertion without the cast, so the rule fixes it under `--fix`.

## The four jasmine rules

They steer in the opposite direction from the rest of the plugin. The other fifteen push a Vitest
suite towards this library's API; these four are about a suite that has not arrived yet — one
running on [`vitest-auto-spy/jasmine`](/migrating-jasmine), or one that thinks it is.

### `no-jasmine-globals` — the one that pays for itself on the first run

`jasmine`, `spyOn`, `spyOnProperty`, `spyOnAllFunctions`, `fail` and `pending` are globals jasmine's
own runner installs. Nothing installs them here, so most of them fail loudly on the first run with a
`ReferenceError`. **One does not, and it is the reason this is a rule rather than a line in a
migration guide:**

```diff
- spyOn(analytics, 'track');        // jasmine: track() never runs
+ vi.spyOn(analytics, 'track');     // Vitest: track() runs on every call
```

jasmine's `spyOn` installs a **stub**; `vi.spyOn` **calls through**. The rename compiles, the spec
runs, and the code under test now really talks to its collaborator — which is how a migrated suite
ends up making network calls, or passing while asserting on a value the real implementation happened
to return. The message says `vi.spyOn(obj, 'm').mockImplementation(() => undefined)` where the
jasmine line meant "stub it", and points at `createSpyFromClass` / `provideAutoSpy`, which stub every
method by construction.

The rule extends the same courtesy every other rule here does to a name that turns out to be
somebody else's: a `jasmine` the file declares itself, or an `import { spyOn } from 'bun:test'` —
a different function with the same name, and the right one on that runtime — is left alone.
`.withContext(` is reported from the same rule, because
[Vitest's chai layer swallows it silently](/migrating-jasmine#withcontext-does-not-throw-it-loses-the-message)
rather than throwing.

### `jasmine-namespace-without-entry` — the one that needs `setupModules`

`.and`, `.calls` and `.withArgs` are not members of a spy this library builds; they are installed by
`vitest-auto-spy/jasmine`, or by `enableJasmineCompat()` on a runtime that cannot import it. A spy
built before that call has none of them, and the spec dies on
`Cannot read properties of undefined (reading 'returnValue')` — which names neither the missing
import nor the spy.

Whether the **project** installs the layer is not knowable from one file: the call usually sits in a
Vitest `setupFiles` entry that no spec imports. So the question is narrowed until one file can answer
it honestly — "this file uses a namespace on a spy **this file built**, and this file installs
nothing". That is still a narrowing, not a proof, and it is why this rule and
`no-unregistered-inject-spy` are the two that can report on a correct project. Until 4.0.0 the
answer to that was a `warn`; it is an `error` now, because a warning nothing reads is not a safety
margin, and the actual fix is one option away. Two escape hatches: importing any entry that _cannot_
load the jasmine one (`vitest-auto-spy/bun`, `…/node`, which necessarily install the layer from a
setup file) silences the file, and a project can name its own setup module:

```js
{
  rules: {
    'vitest-auto-spy/jasmine-namespace-without-entry': ['error', { setupModules: ['./test-setup'] }],
  },
}
```

### `no-save-arguments-by-value` — the purest silent case on this page

`spy.calls.saveArgumentsByValue()` is a **no-op** here, deliberately: jasmine copies every call's
arguments defensively, Vitest, Bun and `node:test` all keep the reference, and snapshotting every
argument of every call to match would tax every spy in the suite. The call still runs. Nothing
fails. And the spec, which asked for the arguments _as they were passed_, now reads whatever the code
under test left in the object afterwards — an assertion about the state at call time has become one
about the state at assertion time, with no diff, no warning and no failing run to point at it.

### `prefer-native-spy-api` — the one to switch off while you migrate

It reports code that **works**. The compatibility layer is what a suite runs on _while_ it is being
migrated, so on day one of a migration it fires on every line of the bridge. It shipped `off` until
4.0.0 for that reason; it is an `error` now, because most suites are not mid-migration and the ones
that are need exactly one line for as long as the bridge is needed:

```js
{ rules: { 'vitest-auto-spy/prefer-native-spy-api': 'off' } } // until the suite is green
```

Delete that line for the last mile, and the rule becomes the tool that finishes the job:

`eslint --fix` then does the renames whose receiver it can trace to one of this library's factories
— `.and.returnValue(x)` → `.mockReturnValue(x)`, `.and.callFake(f)` → `.mockImplementation(f)`,
`.and.nextWith(v)` → `.nextWith(v)` and the nine other delegated helpers,
`.withArgs(a).and.returnValue(v)` → `.calledWith(a).mockReturnValue(v)`, `.calls.count()` →
`.mock.calls.length`, `.calls.reset()` → `.mockClear()`, `.calls.argsFor(i)` → `.mock.calls[i]`.
Everywhere else the identical edit is offered as a **suggestion**, because a `.calls` on somebody
else's object is somebody else's method — the same licence
[`no-mocked-for-spy`](#which-rules-fix-and-why-so-few) draws.

Three things it deliberately will not rewrite. A strategy with no equivalent — `.and.returnValues`,
`.and.callThrough`, `.and.stub`, `.and.throwError`, `.and.resolveTo` — is not in its table at all,
because there is no rename that says the same thing. `.calls.mostRecent()` and `.calls.all()` are
out for the same reason: the native shape is not one expression. And a chain carrying an **optional
link** is left alone entirely — the replacement is built from the receiver's source text plus a
member name, so `spy?.and.returnValue(1)` would come back as `spy.mockReturnValue(1)`: the same call
with the guard silently removed.

`npx vitest-auto-spy codemod --from jasmine` does the whole suite in one pass, including the parts
this rule declines. See [Migrating from jasmine-auto-spies](/migrating-jasmine).

## Which rules fix, and why so few

Three of the twenty rewrite the source on their own, eight offer the rewrite as a suggestion, and
the split is about what a wrong guess costs rather than about how hard the rewrite is.

`no-mocked-for-spy` touches nothing but a **declaration**. Get it wrong and the file stops
compiling — the loudest and cheapest failure a codebase has — so it is one of the three rules that run
under `--fix`, and it does the whole edit:

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

::: warning "Decidable from the declaration" is not the same as "decidable from the file"
That licence was read too loosely once, and the rule shipped code that did not compile. A
declaration is decidable; what the name is _assigned_ a few lines below is a separate question:

```ts
let register: Spy<Pick<Registry, 'metrics'>> & { contentType: string }; // ← what --fix wrote
register = { contentType: '…', metrics: vi.fn().mockResolvedValue(payload) }; // ← what it left
// TS2322: Type 'Mock<Procedure>' is not assignable to type
//   'AddSpyMethodsByReturnTypes<() => Promise<string>>'
```

`eslint --fix` reported clean and the type gate failed afterwards — the worst shape an autofix has,
because the rule's own check passes and nothing points back at it. So the plain fix survives only
where the value came out of one of this library's own factories (`createSpyFromClass`,
`createAutoMock`, `createMock`, `mockDeep`, `injectSpy`, `asSpy`, …), which return a `Spy<T>`
already. Everywhere else the same edit is offered as a **suggestion**, to be accepted together with
the repair to the creation site — usually `createAutoMock<T>()` in place of the literal.

An annotation that belongs to no variable — a parameter, a return type, an `as` expression — keeps
the plain fix, which is also what stops `--fix` from rewriting a declaration and leaving the cast
beneath it still spelled `Mocked`.
:::

`prefer-as-spy` earns the same licence from the other end: the cast it reports is the developer's own
assertion that this value is a `Spy<X>`, and `asSpy` is a typed identity function — so the rewrite
keeps that assertion whole, changes nothing but how it is spelled, and lives entirely at the level of
types. Nothing has to be known about another file, because the rule decides nothing: the cast decided
it, and a wrong fix fails to compile.

```ts
// after --fix
import { asSpy } from 'vitest-auto-spy';

// before
devicesService = TestBed.inject(DeviceListService) as Spy<DeviceListService>;

devicesService = asSpy<DeviceListService>(TestBed.inject(DeviceListService));
```

The type arguments are carried across rather than left to inference. `Spy<T, Options>` and
`asSpy<T, Options>` take the same parameter list, so moving them is a transposition and the line
after the fix asserts exactly what the line before it did — including `Spy<Cinemas, { overload:
'first' }>`, which inference would silently drop. It also keeps the one case where inference is
actively wrong: on a **generic** class `TestBed.inject` answers `Service<any>`, and that `any`
surfaces eight levels down as a mismatch between `AddPromiseSpyMethods<unknown>` and
`WithMockReturnValue<…>`, with nothing in the message pointing at the spec.

Two shapes are left alone on purpose. A `Spy` the file declares itself is not this library's type,
and a cast that hops through `unknown` — `{} as unknown as Spy<CartService>` — says outright that the
value is _not_ a `CartService`, so `asSpy<CartService>(...)` could not compile; that shape wants a
real double (`createAutoMock<T>()`), not a rename. The one exception is
`TestBed.inject(X) as unknown as Spy<X>`, where the container returns `X` by construction and the
`as unknown` was only there to silence `TS2352` — that one is fixed, hop and all.

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
in the executor is usually the statement that _triggers_ the source, and that has to run while
something is already listening. An editor offers all three; a human accepts them.

`no-overridden-provider` and `no-import-time-spread` suggest for the same reason from the other end:
each has exactly one shape whose repair is local. For the first that is the verbatim duplicate,
where the deletion is provably inert ([above](#the-pair-is-classified-because-the-two-halves-are-not-the-same-defect));
for the second it is deferring the value:

```ts
// ❌ evaluated while the module loads — `[...undefined]` inside a bundle
export const webosEvents = [...BaseEvents];

// ✅ what accepting the suggestion produces; every use of the name gains a `()`
export const webosEvents = () => [...BaseEvents];
```

That last one is a suggestion in the strongest sense: accepting it makes the type checker name every
call site that has to change, which is precisely why no `--fix` may do it unattended. The other safe
repair — inlining the constant so nothing has to be imported for that line — cannot be written from
one file at all.

The remaining five have no per-node edit to offer. `createSpyFromClass` needs the class an object
literal never names, `provideAutoSpy` discards the return values the `useValue` body was setting
up, and `Object.defineProperties` is one `mockValueProp` statement per entry. Each of those is an
edit across a file, not across a node.

## Measured: what each rule is worth

Every rationale above is a claim about what a run does, so each one was run. Vitest 4.1.9, this
repository's own configs — the default project, `vitest.shared-env.config.mts` for `isolate: false`,
the zone project for the zone.js half — with one probe spec per rule, each containing an assertion
that cannot be true.

| Rule                           | Without it, the run says                                                                                                                                                                                                                                         | Verdict |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----: |
| `no-expect-in-subscribe`       | nothing — [4 of 4 forms green across 4 stream behaviours](/core/observable-assertions#measured-four-forms-against-four-streams)                                                                                                                                  |  green  |
| `no-done-callback`             | nothing, when `done()` sits in a callback: the body returns `undefined`, the test ends, the assertion lands after it                                                                                                                                             |  green  |
| `no-floating-assertion`        | zoneless: `Unhandled Rejection`, exit 1, no test named. Under zone.js: one of two rejections vanishes entirely                                                                                                                                                   |  green  |
| `no-bare-called-with`          | nothing — the spy answers `undefined` for those arguments, which is what it did before, and the test that meant to assert a call asserts none                                                                                                                    |  green  |
| `no-shared-module-level-mock`  | nothing — the fixture's own state crosses files under `isolate: false`                                                                                                                                                                                           |  green  |
| `no-object-define-property`    | nothing in the file that patched; the **next** file reads the patched value                                                                                                                                                                                      |  green  |
| `no-mocked-for-spy`            | `TS2322 … missing the following properties from type 'CartService': http, cache`                                                                                                                                                                                 | compile |
| `prefer-create-spy-from-class` | `TypeError: cart.applyPromo is not a function`                                                                                                                                                                                                                   |   red   |
| `prefer-provide-auto-spy`      | the same, one DI hop away                                                                                                                                                                                                                                        |   red   |
| `prefer-inject-spy`            | `spy.getPlans.nextWith is not a function`                                                                                                                                                                                                                        |   red   |
| `no-inject-before-override`    | `Cannot override provider when the test module has already been instantiated. Make sure you are not using \`inject\` before \`overrideProvider\``                                                                                                                |   red   |
| `no-overridden-provider`       | nothing, where the hand-rolled double happens to answer: the `provideAutoSpy` beside it is dead and the assertions pass. Read back with `injectSpy` instead, it is red — and [`injectSpy` says why](/adapters/angular#injectspy-says-when-it-got-the-real-thing) |  green  |

The column that matters is the last one. Six of the eleven probed here guard against a test that is
**green and wrong**, which is the only failure mode a suite cannot report on itself; four guard
against a red test whose message is already clear; one is a compiler error. That split is what the
_Without it_ column in [Rules](#rules) reports, and it used to be what severity followed too — until
4.0.0 graded the config `error` / `warn` / `off` along it. It does not any more: how loud a finding
is belongs to the project, and this table is the evidence for deciding rather than the decision.

The [four jasmine rules](#the-four-jasmine-rules) are not in this table because they were not probed
the same way — their subject is a migration, not a runner behaviour. Two of them belong on the green
side by construction and the source says so plainly: `saveArgumentsByValue()` is a function whose
body is `undefined`, and `vi.spyOn`'s call-through default is documented behaviour, not a defect.

`no-overridden-provider` is the one whose verdict depends on the rest of the file, which is why it
is worth having as a rule rather than a runtime check. Read the token back with `injectSpy` and the
run is red with a diagnostic naming the cause; read it back with `TestBed.inject` and assert against
the hand-rolled double, which is what the file that prompted this rule did, and everything passes
while the `provideAutoSpy` above it never ran.

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

`done.fail(…)` is reported too, at the call site rather than at the parameter. It is jasmine's
failure channel, and the `TestContext` Vitest passes has no `fail` on it, so the line throws
`done.fail is not a function` — and it throws _where it sits_, which is almost always an `error`
callback or a `.catch()`, i.e. inside a promise nobody awaits. The rejection is unhandled, the test
body returned long ago, and the run is **green on the exact path that was supposed to fail it**.
Assert on the failure instead:
`await expect(firstValueFrom(source$)).rejects.toMatchObject({ status: 404 })`, or
`expect.fail(message)` where the line is simply unreachable.

### `no-floating-assertion` — three runners, three different silences

The same two tests — an `expect()` in a `.then()` nobody awaits, and an `async` helper called without
`await` — under three configurations:

|                                                     |          tests           | what the runner reports                                       |
| --------------------------------------------------- | :----------------------: | ------------------------------------------------------------- |
| zoneless                                            |       **2 passed**       | 2 `Unhandled Rejection`, exit 1, neither attributed to a test |
| zone.js                                             |       **2 passed**       | 1 error — zone.js drained the other into `console.error`      |
| zone.js + `setupAutoSpy({ strayRejections: true })` | **1 failed \| 1 passed** | the swallowed one is now a named failure on the right test    |

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
