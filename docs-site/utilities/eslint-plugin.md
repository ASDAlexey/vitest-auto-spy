---
title: ESLint plugin
description: Fifty-six lint rules for spec files. They catch tests that pass without checking anything, doubles that drift from the real class, and setup that leaks between tests. Flat config, part of the package.
---

# ESLint plugin

The plugin finds test code that passes while checking nothing, and hand-written doubles that drift
from the class they replace. It is part of `vitest-auto-spy`, so there is nothing else to install.
Add it to `eslint.config.js` for your spec files:

```js
// eslint.config.js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [{ files: ['**/*.spec.ts'], ...autoSpy.configs.recommended }];
```

The plugin needs flat config (`eslint.config.js`). The legacy `.eslintrc` format cannot load it: it
looks for a package named `eslint-plugin-*`, and this plugin is a subpath of another package.

Each rule has its own section in [ESLint rules](/utilities/eslint-rules): what it reports, a
before/after example, its options, and when to turn it off. This page covers setup and tuning.

## Adding it to your project

### 1. The config block

Spread one of the ready configs into a block for your spec files. In flat config a later block
overrides an earlier one, so put this block **after** your other configs:

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

Each config is a plain object with two keys, `plugins` and `rules`. Spreading it into your block
brings both keys with it.

| Config                | What it turns on                                   | Use it when                                                                                                     |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `configs.recommended` | all 56 rules: 45 at `error`, 11 at `warn`          | you start with the plugin; this is the default                                                                  |
| `configs.strict`      | all 56 rules at `error`                            | your specs are clean, and every finding should stop the build                                                   |
| `configs.typeErrors`  | `prefer-as-spy` and `no-mocked-for-spy` at `error` | together with `recommended`, in the [large-project recipe](#land-it-on-a-large-existing-suite-without-a-red-ci) |

Both `typeErrors` rules are already `error` in `recommended`. You need `typeErrors` only in the
recipe that lowers every rule to `warn` and then raises these two back; see
[Land it on a large existing suite without a red CI](#land-it-on-a-large-existing-suite-without-a-red-ci).

Some rules report nothing until they know how your project builds and runs tests:

- [`no-compile-components`](/utilities/eslint-rules#no-compile-components) waits for its `builder`
  option.
- [`no-redundant-mock-reset`](/utilities/eslint-rules#no-redundant-mock-reset) waits for its options,
  or for a Vitest config it can find and read.
- [`no-relative-mock-under-builder`](/utilities/eslint-rules#no-relative-mock-under-builder) waits for
  its option, or for an Angular unit-test builder target in `angular.json`, `project.json` or
  `nx.json` that runs the file.

### 2. The `files` glob is not optional

The plugin has no default glob, because only you know where your specs live. A wrong glob fails in
one of two ways:

- **Too narrow:** the plugin checks nothing and reports nothing. This is the most common setup
  problem. [Check what actually applies](#check-what-actually-applies) with one command.
- **Too wide:** rules start reporting application code. For example, `Object.defineProperty` is fine
  in application code, but `no-object-define-property` reports it.

Common globs:

```js
files: ['**/*.spec.ts'],                                  // Angular
files: ['**/*.test.ts', '**/*.test.tsx'],                 // React / Vue / Node
files: ['**/*.{spec,test}.{ts,tsx}', '**/test/**/*.ts'],  // both, plus a test folder
```

In a monorepo, one block at the root covers every package if the glob starts with `**/`:
`'**/*.spec.ts'` matches `packages/*/src/**` too. Add a second block only for a package whose specs
need different severities.

### 3. Type information: only four rules need it {#_3-type-information-is-optional-and-one-rule-wants-it}

Fifty-two rules read only the file itself. They work without `parserOptions.project`, add no
noticeable lint time, and work even when your specs are not in any `tsconfig`.

Four rules read TypeScript types:
[`no-private-member-access`](/utilities/eslint-rules#no-private-member-access),
[`no-mistyped-use-value`](/utilities/eslint-rules#no-mistyped-use-value),
[`no-unknown-use-value-key`](/utilities/eslint-rules#no-unknown-use-value-key) and
[`prefer-to-have-signal-value`](/utilities/eslint-rules#prefer-to-have-signal-value). Without type
information they report nothing. The one exception is the `Object.getPrototypeOf` check of
`no-private-member-access`, which works either way.

To turn the four on, give the parser your project, where your specs are already in a `tsconfig`:

```js
languageOptions: {
  parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
},
```

### 4. What the first run looks like

On an existing project, expect the first run to be red. Forty-five rules are `error`, and that is
the intended default.

Eleven rules are `warn`. They show up in the output but do not fail the build:

- **A cost, not a defect:** [`prefer-render-shallow`](/utilities/eslint-rules#prefer-render-shallow).
- **Evidence is a guess from one file:**
  [`no-stub-class-double`](/utilities/eslint-rules#no-stub-class-double),
  [`no-structural-double`](/utilities/eslint-rules#no-structural-double),
  [`no-instance-lifecycle-spy`](/utilities/eslint-rules#no-instance-lifecycle-spy).
- **The fix is a migration, not a one-line swap:**
  [`prefer-create-mock`](/utilities/eslint-rules#prefer-create-mock),
  [`prefer-set-inputs`](/utilities/eslint-rules#prefer-set-inputs),
  [`no-unasserted-argument`](/utilities/eslint-rules#no-unasserted-argument),
  [`no-real-wait-in-test`](/utilities/eslint-rules#no-real-wait-in-test).
- **A shorter or clearer spelling of correct code:**
  [`prefer-spy-on-own-method`](/utilities/eslint-rules#prefer-spy-on-own-method),
  [`prefer-to-have-signal-value`](/utilities/eslint-rules#prefer-to-have-signal-value).
- **Only the author knows the fix:**
  [`no-unasserted-console-spy`](/utilities/eslint-rules#no-unasserted-console-spy).

A rule that reads one file cannot know everything about your project, so three rules can report
correct code. If a finding looks wrong, check
[The three rules that can report on correct code](#the-three-rules-that-can-report-on-correct-code).

Two commands make the first pass short:

```bash
npx eslint . --fix                         # rules with an autofix rewrite the code themselves
npx eslint . --format stylish | tail -30   # the summary shows which rule reports the most
```

What is left is either a real finding or a rule you do not want yet. [Tuning it for your
project](#tuning-it-for-your-project) covers both. If the first run is too large to fix at once,
follow [Land it on a large existing suite without a red CI](#land-it-on-a-large-existing-suite-without-a-red-ci).

## Which rules apply to you {#which-of-the-twenty-apply-to-you}

Four rules are about Jasmine. If you never used Jasmine, they cannot fire on your code, so you can
leave them on.

| You are                                    | What the plugin does for you                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| writing Vitest, never used Jasmine or Jest | the 52 core rules work; the four Jasmine rules never fire                                          |
| moving off `jest-auto-spies` / Jest        | the core rules do the work; `no-done-callback` and `prefer-as-spy` catch the most                  |
| moving off `jasmine-auto-spies`            | all 56 rules; set `prefer-native-spy-api` to `'off'` until the Jasmine compatibility layer is gone |

### If you never used Jasmine

Each Jasmine rule looks for code a Vitest suite does not contain:

| Rule                              | Looks for                                                                        | In your specs                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `no-jasmine-globals`              | `jasmine.*` and the bare globals `spyOn(`, `spyOnProperty(`, `fail(`, `pending(` | you write `vi.spyOn` and `expect.fail`; the bare forms throw `ReferenceError` under Vitest |
| `jasmine-namespace-without-entry` | `.and` / `.calls` / `.withArgs` on a spy this library built                      | you write `.mockReturnValue`, `.mock.calls` and `calledWith`                               |
| `no-save-arguments-by-value`      | `spy.calls.saveArgumentsByValue()`                                               | a Jasmine-only API; Vitest code never calls it                                             |
| `prefer-native-spy-api`           | the same `.and` / `.calls` namespaces                                            | same as above                                                                              |

`jasmine-namespace-without-entry` ignores anything under `.mock`, so `spy.mock.calls[0]` is never
reported.

Turning the four off is allowed, but it saves nothing: a rule with nothing to match does no extra
work. If you prefer a shorter config anyway:

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

### If you are coming from Jest

There is no separate Jest rule set. These core rules catch most of what a Jest suite has to change:

| Rule                           | What it catches in a Jest suite                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-done-callback`             | `it('x', (done) => …)`. Vitest passes a context object there, so `done()` throws. When the call sits inside a callback, the test [passes without running](/utilities/eslint-rules#no-done-callback) |
| `prefer-as-spy`                | `TestBed.inject(X) as Spy<X>`. It fails with `TS2352` under this library, and it is [the most common compile error after an Angular migration](/migrating#reading-a-spy-back-out-of-the-container)  |
| `no-mocked-for-spy`            | `Mocked<T>` declarations, which require private fields a spy does not have                                                                                                                          |
| `no-shared-module-level-mock`  | an exported `{ save: jest.fn() }` fixture. Under `isolate: false` (test files share modules within a worker) it is one object per worker, not per test                                              |
| `prefer-create-spy-from-class` | an object of `fn()`s used as a double. It falls behind the class as soon as the class gets a new method                                                                                             |
| `no-floating-assertion`        | `expect()` in a `.then()` nobody awaits                                                                                                                                                             |

Keep `no-jasmine-globals` on here too. Before Jest 27, Jest ran on `jest-jasmine2`, which installed
`spyOn`, `fail` and `pending` as globals, so an old Jest suite can contain them. `spyOn` is the
dangerous one: Jasmine's version replaces the method, while `vi.spyOn` calls the real method. After a
plain rename, the spec compiles and runs, and the code under test talks to the real collaborator.

For the bulk edit, run the codemod instead of a lint pass: `npx vitest-auto-spy codemod --from jest`.
`--from jasmine` handles the other dialect, and the default `auto` picks the right set per file. See
[Migrating from jest-auto-spies](/migrating).

### If you are coming from Jasmine

All 56 rules apply, and the four Jasmine rules are written for you:

- `no-jasmine-globals` and `no-save-arguments-by-value` report behaviour that silently changes after
  a rename.
- `jasmine-namespace-without-entry` reports a spy built before the compatibility layer was
  installed.
- `prefer-native-spy-api` reports the compatibility layer itself. Turn it off while you migrate:

```js
'vitest-auto-spy/prefer-native-spy-api': 'off', // delete this for the last mile
```

For the bulk edit, run `npx vitest-auto-spy codemod --from jasmine`. It also does the rewrites the
rule does not autofix. See [Migrating from jasmine-auto-spies](/migrating-jasmine).

## Tuning it for your project

Each config is a plain object, so every setting below is one line in **your** `eslint.config.js`.

### Land it on a large existing suite without a red CI

On a large existing project, the first run can report hundreds of findings. This recipe keeps CI
green while you fix them, and still fails on findings that are compile errors.

1. Run `npx eslint . --fix` once. It fixes most findings of the two type-error rules
   (`prefer-as-spy` and `no-mocked-for-spy`), which step 2 keeps at `error`. Fix the rest of those
   by hand; your editor offers each fix as a suggestion. `--fix` applies the autofix of every
   fixable rule, not only these two, so review the diff before you commit it.
2. Lower every rule to `warn`, then raise the type-error rules back with `configs.typeErrors`:

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import autoSpy from 'vitest-auto-spy/eslint-plugin';

const asWarnings = Object.fromEntries(Object.keys(autoSpy.configs.recommended.rules).map((rule) => [rule, 'warn']));

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.spec.ts'],
    ...autoSpy.configs.recommended,
    rules: {
      ...autoSpy.configs.recommended.rules,
      ...asWarnings,
      ...autoSpy.configs.typeErrors.rules, // the findings that are compile errors stay errors
      'vitest-auto-spy/prefer-create-spy-from-class': 'off', // your own changes go after the spreads
    },
  },
];
```

3. Fix the warnings in batches. When they are gone, delete `asWarnings` and the `typeErrors` line.

Warnings do not fail `eslint` unless you run it with `--max-warnings`. If your CI passes
`--max-warnings 0`, drop that flag while you use this recipe. Put your own rule changes after the
last spread, as in the example, or the spreads overwrite them.

Before you downgrade everything, look at what the first run really contains:

- The eleven `warn` rules are already warnings. `prefer-render-shallow` is often the loudest rule on
  a component project, so check how much of the first run it accounts for.
- `no-compile-components`, `no-redundant-mock-reset` and `no-relative-mock-under-builder` stay
  silent until their option (or, for the last two, your config or a builder target) tells them how
  your project runs.
- What remains is mostly rules about a test being wrong. A red CI is what those are for.

**An alternative that holds up better over time,** when the failing files fit in a list you can
maintain by hand: keep every rule at its
default, and turn the failing rules `off` only for the files you have not fixed yet. A shrinking list
of paths shows progress. A project-wide `warn` tends to stay forever.

```js
export default [
  { files: ['**/*.spec.ts'], ...autoSpy.configs.recommended },
  {
    files: ['src/app/legacy/**/*.spec.ts', 'src/app/cart/cart.component.spec.ts'], // not fixed yet
    rules: { 'vitest-auto-spy/prefer-provide-auto-spy': 'off', 'vitest-auto-spy/no-done-callback': 'off' },
  },
];
```

**Why exactly these two stay at `error`.** The set is not "the important rules"; that choice is
yours. It is the rules whose findings **do not compile**:

- `TestBed.inject(X) as Spy<X>` fails with `TS2352`.
- `let s: Mocked<T>` fails with `TS2322`.

Every other rule reports code that compiles and runs, so fixing it in batches is a real plan. For
these two it is not: the build is already red. A migrated `jest-auto-spies` file often has ten such
casts, one per injected double. Under a blanket `warn` it lints clean, then fails the type check with
ten errors that mention `accessorSpies` (a property that `Spy<T>` adds) and never mention the rule.
Both rules have `--fix`, so keeping them at `error` costs one `eslint --fix` run.

Today the set is `prefer-as-spy` and `no-mocked-for-spy`, the two from the [Types](#types) table.
Spread the config instead of copying the two names: the package keeps the list current, and a copy
in your config goes stale without warning.

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

Spread `autoSpy.configs.recommended.rules` first, then your overrides; in an object, a later key
wins. `...autoSpy.configs.recommended` already brings a `rules` key, and a `rules` key you write
after it **replaces** that whole map. Without the inner spread you get a config with only your two
rules in it, and no error tells you so.

To raise a `warn` rule to `error`, use the same line: `'vitest-auto-spy/prefer-render-shallow': 'error'`.

### The three rules that can report on correct code

These three rules answer a question that one file cannot always answer. They are still `error`,
because each has a one-line fix when it is wrong about your project. If the first run surprises you,
look at these first.

| Rule                              | When it is wrong about you                                                                                                                       | The line that fixes it                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `jasmine-namespace-without-entry` | `enableJasmineCompat()` runs in a Vitest `setupFiles` entry that no spec imports, so a file using `.and` looks like it has no layer              | `['error', { setupModules: ['./test-setup'] }]`                                |
| `no-unregistered-inject-spy`      | the file registers some doubles in a way the rule reads, **and** gets another through a helper it does not follow, such as a shared `beforeEach` | no option; a scoped `'off'` or a per-line disable                              |
| `prefer-native-spy-api`           | you are **in the middle of** moving off `jasmine-auto-spies`; it reports working compatibility code on every line                                | `'off'` until the suite is green, then `'error'` and `--fix` for the last mile |

`setupModules` tells `jasmine-namespace-without-entry` where the layer is installed, so it stops
guessing. Importing `vitest-auto-spy/bun`, `…/node` or `…/rstest` also silences it for that file.
Those entry points cannot load `vitest-auto-spy/jasmine`, so on those runtimes the layer always comes
from a setup file.

`no-unregistered-inject-spy` rarely needs anything, because it is already cautious. It says nothing
unless the file calls `provideAutoSpy` at least once. It also goes quiet when it meets something it
cannot read: a spread or an unknown provider factory in `providers`, `createWithAutoSpies`,
`renderShallow`, or `TestBed.overrideProvider`. What is left is usually a real finding:
`injectSpy(X)` returns the real service, and its spy helpers throw on the first
`.mockReturnValue(…)`.

### Silence one line, not one rule

```ts
// eslint-disable-next-line vitest-auto-spy/no-object-define-property -- the property is a getter on a frozen host object
Object.defineProperty(target, 'clientWidth', { value: 100 });
```

Prefer this to turning the rule `off` when the exception is local. The rule keeps working for every
other file, and the comment records why this line is different.

### Check what actually applies

```bash
npx eslint --print-config src/app/cart.spec.ts | grep vitest-auto-spy
```

If this prints nothing, the `files` glob does not match that file. That looks the same as "the
plugin found no problems", so check it before you conclude the specs are clean.

### Alongside `vitest/expect-expect`

The two do not overlap. `expect-expect` reports a test with **no** assertion. This plugin reports an
assertion that is there but checks nothing. Run both.

Configure `assertFunctionNames` with patterns, not with a list of names:

```js
'vitest/expect-expect': ['error', { assertFunctionNames: ['expect*', 'assert*', '**.expect*'] }],
```

- `expect*` covers `expectEmission`, `expectEmissions`, `expectNoEmission`, `expectCompletion` and
  `expectError` from this package, plus your own `expect…` helpers.
- `assert*` covers `assertNoPendingRequests`, `assertNoShadowedProviders` and `assertMocked`.
- `**.expect*` covers a helper called through an object.

A list of names has to grow with every new helper. It can also break outright: in one suite an
assertion helper was called `find`, and listing `find` accepts every `Array.prototype.find` as an
assertion. The patterns above produced **zero** false positives over 1759 spec files.

### Alongside `vitest/require-hook`

`require-hook` reports any call in a `describe` body or at the top of a spec that is not a hook. It
cannot know that `useConsoleSpies()` or `setupFakeTimers()` register hooks themselves. The plugin
exports the list of such helpers: every public function of this package that calls `beforeEach`,
`afterEach`, `beforeAll` or `afterAll`. A test in this package checks the list, so a new helper cannot
be missing from it.

```js
import autoSpy from 'vitest-auto-spy/eslint-plugin';

'vitest/require-hook': ['error', { allowedFunctionCalls: [...autoSpy.hookRegisteringHelpers] }],
```

Calls that register no hook, such as `registerSignalMatchers()` and `trackStrayTimers()`, are not in
the list. If you call them at the top of a linted file, add them after the spread.

### Rule options

Ten rules take options. Each rule's section in [ESLint rules](/utilities/eslint-rules) has the full
options table.

| Rule                                                                                         | Options                                                                | What they do                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`prefer-create-spy-from-class`](/utilities/eslint-rules#prefer-create-spy-from-class)       | `minRunnerFns` (default `2`)                                           | how many `vi.fn()`s make an object a double                                                                                     |
| [`no-stub-class-double`](/utilities/eslint-rules#no-stub-class-double)                       | `minRunnerFns` (default `1`)                                           | how many `vi.fn()` fields make a class a double                                                                                 |
| [`no-structural-double`](/utilities/eslint-rules#no-structural-double)                       | `minRunnerFns` (default `2`)                                           | reports only below this count; keep it equal to `prefer-create-spy-from-class`, or raise it (say, to `100`) if that rule is off |
| [`prefer-render-shallow`](/utilities/eslint-rules#prefer-render-shallow)                     | `templates`: `'as-needed'` (default) or `'never'`                      | `'never'` bans real templates in unit specs                                                                                     |
| [`prefer-inject-spy`](/utilities/eslint-rules#prefer-inject-spy)                             | `ignoreTokens`                                                         | tokens whose injected instance stays real                                                                                       |
| [`no-real-component-provider`](/utilities/eslint-rules#no-real-component-provider)           | `ignoreTokens`, `childInjectors` (default `false`)                     | tokens to skip; also read child injectors                                                                                       |
| [`no-redundant-mock-reset`](/utilities/eslint-rules#no-redundant-mock-reset)                 | `clearMocks`, `mockReset`, `restoreMocks`, `configFile`, `configFlags` | what the runner resets between tests                                                                                            |
| [`no-compile-components`](/utilities/eslint-rules#no-compile-components)                     | `builder: 'inline-resources'`, `ignoreComponents`                      | says the builder inlines templates; the rule is silent without it                                                               |
| [`no-relative-mock-under-builder`](/utilities/eslint-rules#no-relative-mock-under-builder)   | `builder: 'unit-test'`                                                 | says the Angular unit-test builder runs these specs, when the rule cannot find the target itself                                |
| [`jasmine-namespace-without-entry`](/utilities/eslint-rules#jasmine-namespace-without-entry) | `setupModules`                                                         | setup files that install the Jasmine compatibility layer                                                                        |

The array form sets the severity too. `['error', { templates: 'never' }]` raises
`prefer-render-shallow` from `warn`, its severity in `recommended`, to `error`. Write
`['warn', { … }]` to keep it at `warn`.

```js
'vitest-auto-spy/prefer-render-shallow': ['error', { templates: 'never' }],
'vitest-auto-spy/no-compile-components': ['error', { builder: 'inline-resources' }],
'vitest-auto-spy/no-redundant-mock-reset': ['error', { clearMocks: true, restoreMocks: true }],
```

### Picking rules by hand

You can skip `configs.recommended` and list only the rules you want. The plugin object is exported
on its own, so this is a supported setup. Use [Tuning it for your project](#tuning-it-for-your-project)
if you want the whole set with a few changes. Use this if you want a short list:

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

### What a message contains

Every message:

1. names what the rule found in this file: the class, token, member or call;
2. says in one sentence why it breaks;
3. gives one fix;
4. ends with `Docs:` and a link to the rule's section in [ESLint rules](/utilities/eslint-rules).

That link is also the rule's `meta.docs.url`, so your editor links the rule name to it. The rules
ship with the API they recommend, so they always match the version you have installed.

## Rules

The tables below give each rule one line. The rule name links to its full section in
[ESLint rules](/utilities/eslint-rules).

- **Default:** the severity in `configs.recommended`. [Turn one rule down](#turn-one-rule-down) to
  change it.
- **Fix:** `--fix` means `eslint --fix` rewrites the code. _suggestion_ means your editor offers the
  rewrite and you accept it by hand. [Which rules fix, and why so few](#which-rules-fix-and-why-so-few)
  explains the split.
- **Without it:** what the test run shows if the rule is off. _green_ is the bad case: the broken
  test still passes, and nothing else tells you. _red_ means the run fails, but with a less helpful
  message.
  _compile_ means the type check fails. _—_ means the rule reports dead code or a cost, not a failure.
  _(by construction)_ means the value follows from how the runner and the code work, and was not
  checked with a [probe run](#measured-what-each-rule-is-worth).

### Assertions that never run

The test passes because the assertion never ran, or ran but could not fail. For example, the stream
stayed silent, or nobody awaited the promise.

| Rule                                                                                   | Reports                                                                                                         | Default | Fix        | Without it |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------- | ---------- | :--------: |
| [`no-expect-in-subscribe`](/utilities/eslint-rules#no-expect-in-subscribe)             | `expect()` inside a `subscribe()` callback → `expectEmission` / `firstValueFrom`                                | `error` | suggestion |   green    |
| [`no-vacuous-absence-assertion`](/utilities/eslint-rules#no-vacuous-absence-assertion) | a test whose every assertion also holds when the stream sends nothing → `expectNoEmission` / `expectEmission`   | `error` | —          |   green    |
| [`no-floating-assertion`](/utilities/eslint-rules#no-floating-assertion)               | `expect()` in a `.then()` nobody awaits → `expect(await promise)`                                               | `error` | —          |   green    |
| [`no-done-callback`](/utilities/eslint-rules#no-done-callback)                         | `it('x', (done) => …)` and `done.fail(…)` → an `async` test with an awaited assertion                           | `error` | —          |   green    |
| [`no-bare-called-with`](/utilities/eslint-rules#no-bare-called-with)                   | `spy.m.calledWith(1);` on its own line: an unfinished stub that asserts nothing                                 | `error` | —          |   green    |
| [`no-constant-expect`](/utilities/eslint-rules#no-constant-expect)                     | `expect(true).toBe(true)`: a value written in the spec that decides the matcher                                 | `error` | —          |   green    |
| [`no-redundant-smoke-test`](/utilities/eslint-rules#no-redundant-smoke-test)           | `it('should create', () => expect(pipe).toBeTruthy())` next to tests that already build the subject → delete it | `error` | suggestion |   green    |
| [`prefer-settle-dynamic-import`](/utilities/eslint-rules#prefer-settle-dynamic-import) | `await import('./thing')` in a test body → `await settleDynamicImport(() => import('./thing'))`                 | `error` | suggestion |   green    |
| [`no-real-wait-in-test`](/utilities/eslint-rules#no-real-wait-in-test)                 | `await new Promise((r) => setTimeout(r, 300))`: a real sleep → `advanceTimers(300)` or `vi.waitFor(…)`          | `warn`  | —          |   green    |
| [`no-self-called-spy`](/utilities/eslint-rules#no-self-called-spy)                     | the test calls the spied method itself, then asserts it was called → call the real trigger                      | `error` | —          |   green    |
| [`no-unasserted-argument`](/utilities/eslint-rules#no-unasserted-argument)             | a bare `toHaveBeenCalled()` where the file shows the arguments matter → `toHaveBeenCalledWith(…)`               | `warn`  | —          |     —      |

### Doubles, and the modules that hold them

These rules are about what one file leaves behind for the next one.

| Rule                                                                                           | Reports                                                                                                                         | Default | Fix                       |       Without it        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------- | :---------------------: |
| [`prefer-create-spy-from-class`](/utilities/eslint-rules#prefer-create-spy-from-class)         | an object of two or more `vi.fn()`s → `createSpyFromClass` / `createAutoMock`                                                   | `error` | —                         |           red           |
| [`no-stub-class-double`](/utilities/eslint-rules#no-stub-class-double)                         | a class whose fields are `vi.fn()`s → `createSpyFromClass` / `provideAutoSpy`                                                   | `warn`  | —                         |           red           |
| [`no-structural-double`](/utilities/eslint-rules#no-structural-double)                         | an object of `vi.fn()`s whose declared type is `{ load: Mock }` → `createAutoMock<T>()`                                         | `warn`  | —                         |           red           |
| [`prefer-spy-on-own-method`](/utilities/eslint-rules#prefer-spy-on-own-method)                 | a one-method `createSpyFromInstance` → `spyOnOwnMethod(x, 'm')` / `spyOnVoidMethod(x, 'm')`                                     | `warn`  | `--fix` / suggestion      |          green          |
| [`no-shared-module-level-mock`](/utilities/eslint-rules#no-shared-module-level-mock)           | an **exported** value holding `vi.fn()`s → export a factory that returns it                                                     | `error` | —                         |          green          |
| [`no-outer-binding-in-mock-factory`](/utilities/eslint-rules#no-outer-binding-in-mock-factory) | a `vi.mock` factory that reads a top-level `const` / `let` / `class` → declare it with `vi.hoisted`                             | `error` | —                         |           red           |
| [`no-object-define-property`](/utilities/eslint-rules#no-object-define-property)               | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp`                                                        | `error` | suggestion                |          green          |
| [`no-import-time-spread`](/utilities/eslint-rules#no-import-time-spread)                       | `export const x = [...Imported]` at module scope: a `TypeError`, or an empty object, when a bundle loads                        | `error` | suggestion                | red _(by construction)_ |
| [`prefer-observer-stub`](/utilities/eslint-rules#prefer-observer-stub)                         | a hand-written `IntersectionObserver` / `ResizeObserver` / `MutationObserver` global → `stubIntersectionObserver()` and friends | `error` | —                         |          green          |
| [`no-hand-assigned-global`](/utilities/eslint-rules#no-hand-assigned-global)                   | `global.fetch = vi.fn(…)` with no restore → `mockValueProp` / `vi.stubGlobal` / `blockNetwork()`                                | `error` | `--fix` (imported object) |          green          |
| [`prefer-stub-response`](/utilities/eslint-rules#prefer-stub-response)                         | an object cast to `Response`, or `createMock<Response>(…)` → `stubResponse({ body })`                                           | `error` | —                         |          green          |
| [`no-redundant-mock-reset`](/utilities/eslint-rules#no-redundant-mock-reset)                   | a reset in a hook that the runner already does between tests → delete it; silent until it knows the runner's flags              | `error` | `--fix` / suggestion      |            —            |

### Angular DI and the TestBed

These rules catch a provider, or a spy on the component, that is not what the spec thinks it
registered.

| Rule                                                                                       | Reports                                                                                                                                  | Default | Fix        |        Without it         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | :-----------------------: |
| [`prefer-provide-auto-spy`](/utilities/eslint-rules#prefer-provide-auto-spy)               | a hand-written `useValue` / `useFactory` / `useClass` / `useExisting` double → `provideAutoSpy(Class)` / `provideAutoSpyForToken(TOKEN)` | `error` | `--fix`    |            red            |
| [`prefer-provide-activated-route`](/utilities/eslint-rules#prefer-provide-activated-route) | a hand-built `ActivatedRoute`, or `provideAutoSpy(ActivatedRoute)` → `provideActivatedRoute({ … })`                                      | `error` | —          |            red            |
| [`prefer-inject-spy`](/utilities/eslint-rules#prefer-inject-spy)                           | `vi.spyOn(TestBed.inject(X), 'm')` → `injectSpy(X).m`                                                                                    | `error` | suggestion |            red            |
| [`no-unregistered-inject-spy`](/utilities/eslint-rules#no-unregistered-inject-spy)         | `injectSpy(X)` for a token this file never registered: you get the real instance                                                         | `error` | —          |  red _(by construction)_  |
| [`no-real-component-provider`](/utilities/eslint-rules#no-real-component-provider)         | a component-level provider read from the fixture while nothing replaced it → `overrideComponentProvider(Component, X)`                   | `error` | —          |             —             |
| [`prefer-render-shallow`](/utilities/eslint-rules#prefer-render-shallow)                   | `TestBed.createComponent` in a file that never reads the template → `renderShallow(X)`                                                   | `warn`  | suggestion |           green           |
| [`prefer-set-inputs`](/utilities/eslint-rules#prefer-set-inputs)                           | `fixture.componentRef.setInput('title', v)` → `await setInputs(fixture, { title: v })`                                                   | `warn`  | suggestion |           green           |
| [`prefer-to-have-signal-value`](/utilities/eslint-rules#prefer-to-have-signal-value)       | `expect(component.total()).toBe(3)` → `expect(component.total).toHaveSignalValue(3)`; **needs types**                                    | `warn`  | `--fix`    |            red            |
| [`no-overridden-provider`](/utilities/eslint-rules#no-overridden-provider)                 | two providers for one token, or one that `TestBed.overrideProvider` replaces: the earlier one never runs                                 | `error` | suggestion |           green           |
| [`no-inject-before-override`](/utilities/eslint-rules#no-inject-before-override)           | `TestBed.inject()` / `injectSpy()` / `renderShallow()` in a hook, in a suite that still calls `override*`                                | `error` | —          |            red            |
| [`no-dead-schemas`](/utilities/eslint-rules#no-dead-schemas)                               | `schemas` on a testing module that declares nothing: the schema applies to nothing                                                       | `error` | —          | green _(by construction)_ |
| [`no-mistyped-use-value`](/utilities/eslint-rules#no-mistyped-use-value)                   | a `useValue` that does not fit the primitive type its token declares; **needs types**                                                    | `error` | —          | green _(by construction)_ |
| [`no-unknown-use-value-key`](/utilities/eslint-rules#no-unknown-use-value-key)             | a key in an object `useValue` that the provided type does not have; **needs types**                                                      | `error` | —          | green _(by construction)_ |
| [`no-instance-lifecycle-spy`](/utilities/eslint-rules#no-instance-lifecycle-spy)           | `vi.spyOn(component, 'ngOnInit')`: Angular never calls a hook spy on the instance                                                        | `warn`  | —          |    green _(the stub)_     |
| [`no-compile-components`](/utilities/eslint-rules#no-compile-components)                   | `compileComponents()` under a builder that inlines templates; silent until `{ builder: 'inline-resources' }`                             | `error` | suggestion |     — _(a dead line)_     |
| [`no-relative-mock-under-builder`](/utilities/eslint-rules#no-relative-mock-under-builder) | `vi.mock('./x')` in a spec that `@angular/build:unit-test` runs → `provideAutoSpy(X)` / `overrideComponentProvider`                      | `error` | —          |            red            |
| [`no-disabled-testbed-teardown`](/utilities/eslint-rules#no-disabled-testbed-teardown)     | `teardown: { destroyAfterEach: false }` → delete it; each fixture outlives its test                                                      | `error` | —          |           green           |
| [`no-sync-testbed-await`](/utilities/eslint-rules#no-sync-testbed-await)                   | `await` on `configureTestingModule` / `override*` / `createComponent`, which return no promise                                           | `error` | suggestion |    — _(a dead await)_     |

### Reaching past the public surface

These rules report tests that read private members of the class under test.

| Rule                                                                           | Reports                                                                                                                    | Default | Fix        |        Without it         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | :-----------------------: |
| [`no-private-member-access`](/utilities/eslint-rules#no-private-member-access) | `instance['privateMember']`, `(instance as any).privateMember`, `vi.spyOn(Object.getPrototypeOf(x), 'm')`; **needs types** | `error` | —          | green _(by construction)_ |
| [`no-reflect-member-access`](/utilities/eslint-rules#no-reflect-member-access) | `Reflect.get(component, 'x')` / `Reflect.set(service, 'x', v)`: the same thing with a key no compiler checks               | `error` | suggestion | green _(by construction)_ |

### Types

Two rules report a cast or type the compiler rejects with a confusing message. Three report code
that switches the compiler off: a cast over a fixture, a cast over a spy method, and a comment over a
stub.

| Rule                                                                                   | Reports                                                                                        | Default | Fix                  |         Without it          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------- | -------------------- | :-------------------------: |
| [`no-mocked-for-spy`](/utilities/eslint-rules#no-mocked-for-spy)                       | `Mocked<T>` in a type position → `Spy<T>`, with the import                                     | `error` | `--fix` / suggestion |           compile           |
| [`prefer-as-spy`](/utilities/eslint-rules#prefer-as-spy)                               | `TestBed.inject(X) as Spy<X>` → `asSpy(TestBed.inject(X))`, with the import                    | `error` | `--fix`              | compile _(by construction)_ |
| [`prefer-create-mock`](/utilities/eslint-rules#prefer-create-mock)                     | an object literal under `as SomeType` → `createMock<SomeType>({ … })`                          | `warn`  | suggestion           |              —              |
| [`no-mock-cast`](/utilities/eslint-rules#no-mock-cast)                                 | `TestBed.inject(S).m as Mock` → `injectSpy(S).m`                                               | `error` | suggestion           |              —              |
| [`no-ts-expect-error-on-double`](/utilities/eslint-rules#no-ts-expect-error-on-double) | `@ts-expect-error` / `@ts-ignore` above a spy's `nextWith`, `mockReturnValue`, `calledWith(…)` | `error` | —                    |            green            |

### The console

These rules report console output that no console spy will see. They are the lint-time partner of
[`setupAutoSpy({ strayConsole })`](/utilities/setup), which fails the test at run time.

| Rule                                                                                   | Reports                                                                                                          | Default | Fix        |        Without it         |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------- | ---------- | :-----------------------: |
| [`no-passthrough-console-spy`](/utilities/eslint-rules#no-passthrough-console-spy)     | `vi.spyOn(console, 'error')` with no implementation: it still prints → `installConsoleSpies()`                   | `error` | suggestion | green _(by construction)_ |
| [`no-console-in-spec`](/utilities/eslint-rules#no-console-in-spec)                     | a spec that calls `console.x(…)`, or assigns `console.x = …` without putting it back                             | `error` | —          | green _(by construction)_ |
| [`no-import-time-console-spies`](/utilities/eslint-rules#no-import-time-console-spies) | an import of `vitest-auto-spy/console` in a file that never calls `installConsoleSpies()` or `useConsoleSpies()` | `error` | —          | green _(by construction)_ |
| [`no-unasserted-console-spy`](/utilities/eslint-rules#no-unasserted-console-spy)       | a console spy the file never asserts on → assert on it, or let `useConsoleSpies()` silence the console           | `warn`  | —          |           green           |

### Coming off jasmine

These rules are for a suite that still runs on [`vitest-auto-spy/jasmine`](/migrating-jasmine), or
still contains Jasmine code. **They never fire in a suite that never used Jasmine**; see
[If you never used Jasmine](#if-you-never-used-jasmine).

| Rule                                                                                         | Reports                                                                                                      | Default | Fix                  |         Without it         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- | -------------------- | :------------------------: |
| [`no-jasmine-globals`](/utilities/eslint-rules#no-jasmine-globals)                           | `jasmine.*`, bare `spyOn(` / `spyOnProperty(` / `spyOnAllFunctions(` / `fail(` / `pending(`, `.withContext(` | `error` | —                    | green _(the `spyOn` case)_ |
| [`jasmine-namespace-without-entry`](/utilities/eslint-rules#jasmine-namespace-without-entry) | `.and` / `.calls` / `.withArgs` on a library spy in a file that never installs the compatibility layer       | `error` | —                    |  red _(by construction)_   |
| [`no-save-arguments-by-value`](/utilities/eslint-rules#no-save-arguments-by-value)           | `spy.calls.saveArgumentsByValue()`: it does nothing here, so the spec asserts on changed state               | `error` | —                    | green _(by construction)_  |
| [`prefer-native-spy-api`](/utilities/eslint-rules#prefer-native-spy-api)                     | `.and` / `.calls` where the spy's own API does the same                                                      | `error` | `--fix` / suggestion | — _(reports working code)_ |

## Which rules fix, and why so few

Eight of the 56 rules rewrite code under `--fix`. Nineteen offer the rewrite as an editor suggestion
that you accept by hand: four of them also have `--fix` for some shapes (in the table below), and
fifteen offer only a suggestion. The split depends on what a wrong guess costs, not on how hard the rewrite
is.

| Rule                          | `--fix`                                                                                      | Suggestion      |
| ----------------------------- | -------------------------------------------------------------------------------------------- | --------------- |
| `prefer-as-spy`               | always                                                                                       | —               |
| `no-mocked-for-spy`           | a parameter, return type or cast; a variable whose value comes from this library's factories | other variables |
| `prefer-provide-auto-spy`     | yes                                                                                          | —               |
| `prefer-to-have-signal-value` | yes                                                                                          | —               |
| `no-hand-assigned-global`     | a value written into an imported object                                                      | —               |
| `no-redundant-mock-reset`     | a reset the runner provably already did                                                      | the other cases |
| `prefer-spy-on-own-method`    | the exact shapes                                                                             | the rest        |
| `prefer-native-spy-api`       | when the spy provably comes from this library                                                | everywhere else |

Fifteen rules offer only a suggestion: `no-expect-in-subscribe`, `prefer-inject-spy`,
`no-object-define-property`, `no-overridden-provider`, `no-reflect-member-access`,
`no-import-time-spread`, `prefer-render-shallow`, `prefer-settle-dynamic-import`,
`prefer-create-mock`, `no-mock-cast`, `no-passthrough-console-spy`, `no-compile-components`,
`no-sync-testbed-await`, `no-redundant-smoke-test` and `prefer-set-inputs`.

**A fix runs unattended, so it must be safe to be wrong.** A rule gets `--fix` when a wrong rewrite
fails loudly, or cannot happen:

- `no-mocked-for-spy` and `prefer-as-spy` change only types. A wrong rewrite stops the file from
  compiling, which is the loudest and cheapest failure there is.
- `prefer-as-spy` keeps your own cast: `asSpy` is a typed identity function, so the new line asserts
  exactly what the old one did.

**A suggestion is for a rewrite that changes behaviour.** You see the diff and accept it one call at
a time:

- Whether `injectSpy(X)` finds a spy depends on a `provideAutoSpy(X)` that usually lives in another
  file.
- `mockValueProp` leaves the property writable where `Object.defineProperty` sealed it.
- `no-expect-in-subscribe` rewrites a whole test.
- `no-overridden-provider` deletes a provider line; `no-import-time-spread` turns a constant into a
  function, and every use needs a `()`.

**No fix at all** where the repair spans the file, not one node. `createSpyFromClass` needs a class
the object literal never names. `provideAutoSpy` drops the return values the `useValue` set up.
`Object.defineProperties` becomes one `mockValueProp` per entry.

Each rule's section in [ESLint rules](/utilities/eslint-rules) says exactly when its fix or
suggestion is offered, and which shapes it leaves alone.

## Measured: what each rule is worth

The _Without it_ column in [Rules](#rules) comes from real runs. Each rule got one probe spec with
an assertion that cannot be true. The probes ran on Vitest 4.1.9, with `isolate: false` where it
matters and under zone.js for the zone half.

| Rule                           | Without the rule, the run says                                                                                                                                                               | Verdict |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----: |
| `no-expect-in-subscribe`       | nothing: [4 of 4 forms green across 4 stream behaviours](/core/observable-assertions#measured-four-forms-against-four-streams)                                                               |  green  |
| `no-done-callback`             | nothing, when `done()` sits in a callback: the body returns `undefined`, the test ends, the assertion runs after it                                                                          |  green  |
| `no-floating-assertion`        | zoneless: `Unhandled Rejection`, exit 1, no test named. Under zone.js: one of two rejections disappears                                                                                      |  green  |
| `no-bare-called-with`          | nothing: the spy answers `undefined` for those arguments, as before, and the test asserts no call                                                                                            |  green  |
| `no-shared-module-level-mock`  | nothing: the fixture's own state crosses files under `isolate: false`                                                                                                                        |  green  |
| `no-object-define-property`    | nothing in the file that patched; the **next** file reads the patched value                                                                                                                  |  green  |
| `no-mocked-for-spy`            | `TS2322 … missing the following properties from type 'CartService': http, cache`                                                                                                             | compile |
| `prefer-create-spy-from-class` | `TypeError: cart.applyCoupon is not a function`                                                                                                                                              |   red   |
| `prefer-provide-auto-spy`      | the same, one DI step away                                                                                                                                                                   |   red   |
| `prefer-inject-spy`            | `spy.getPlans.nextWith is not a function`                                                                                                                                                    |   red   |
| `no-inject-before-override`    | `Cannot override provider when the test module has already been instantiated. Make sure you are not using \`inject\` before \`overrideProvider\``                                            |   red   |
| `no-overridden-provider`       | nothing, when the hand-written double happens to answer. Read back with `injectSpy`, the run is red, and [`injectSpy` says why](/adapters/angular#injectspy-says-when-it-got-the-real-thing) |  green  |

Seven of these twelve guard against a test that is **green and wrong**. A test run cannot report that
failure on its own. Four guard against a red test whose message is already clear, and one against a
compile error.

This column is evidence, not severity. The config does not set severity from it; how loud a
finding is belongs to your project. The eleven `warn` rules are graded on other grounds, listed in
[What the first run looks like](#_4-what-the-first-run-looks-like).

The four Jasmine rules were not probed this way, because their subject is a migration, not runner
behaviour. Two of them are green by construction: `saveArgumentsByValue()` does nothing here, and
`vi.spyOn` calling the real method is documented Vitest behaviour.

`no-overridden-provider` is the one whose verdict depends on the rest of the file. With
`TestBed.inject` and assertions against the hand-written double, everything passes, while the
`provideAutoSpy` above it never ran.

### What the plugin costs to run

The whole `recommended` config adds little to lint time: **56 ms** over 173 spec files, and **68 ms**
over a single 1.7 MB spec. More measurements are on the [Performance](/core/performance) page.
