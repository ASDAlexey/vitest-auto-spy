---
title: Editor diagnostics — WebStorm and VS Code
description: Underline the vitest-auto-spy anti-patterns while the spec is being written — the twelve shipped ESLint rules, shown natively by WebStorm and the other JetBrains IDEs, and by the ESLint extension in VS Code, Cursor and Windsurf.
---

# Editor diagnostics

A rule that fires in CI arrives an hour late. The shapes this library warns about — a spy declared
as the class, an `expect()` inside `subscribe()`, a `done` callback Vitest never calls — are all
cheap to fix while the cursor is still on the line and expensive to find afterwards, because every
one of them **passes**.

There is one channel, and it is already in the package:
[`vitest-auto-spy/eslint-plugin`](/utilities/eslint-plugin). Twelve rules over a real syntax tree,
with a fix or a suggestion where the rewrite is decidable — the same rules in the editor and in CI,
so nothing passes locally and fails on the build. No editor needs a plugin of this package's own;
it needs its ESLint integration switched on, which every IDE below has.

## WebStorm and the other JetBrains IDEs

WebStorm, IntelliJ IDEA Ultimate, PhpStorm, PyCharm Professional and RubyMine all run ESLint
natively, so the rules light up **inline, with no plugin to install** — the same twelve checks, in
the editor, in the Problems tool window, and under **Code → Inspect Code** for the whole project.

Install and configure once:

```bash
npm i -D vitest-auto-spy eslint
```

```js
// eslint.config.js — flat config, at the repository root
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    ...autoSpy.configs.recommended,
  },
];
```

Then in **Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint**, pick
**Automatic ESLint configuration** — WebStorm finds `eslint.config.js` and the local `eslint`
itself. Choose **Manual** only when the config lives outside the project root; there the fields that
matter are *ESLint package* (`node_modules/eslint`) and *Configuration file*.

Three things worth knowing, because each one looks like "the rules do not work":

- **Flat config only.** The legacy `.eslintrc` `plugins: ['vitest-auto-spy']` form resolves plugin
  names to `eslint-plugin-*` packages, which a subpath export of this package can never be. WebStorm
  supports flat config from 2023.3; on an older build, upgrade the IDE rather than the config.
- **Scope the block to spec files yourself.** `Object.defineProperty` and an object of `vi.fn()`s are
  perfectly reasonable in application code — every rule here is about test code.
- **The quick fixes are ESLint's.** `⌥⏎` on a highlighted line offers *ESLint: Fix current file* and,
  where a rule ships a suggestion, the individual rewrite. `no-mocked-for-spy` and `prefer-as-spy`
  fix on their own — both touch a type, so the worst a wrong one can do is fail to compile. The rest
  suggest, because the replacement changes behaviour and should be read before it is accepted.

Prefer to see everything at once during a migration? **Code → Inspect Code…** with the scope set to
the test sources lists every finding grouped by rule, which is the shape a "how much of this suite
still hand-rolls its doubles" question actually needs.

::: tip A native JetBrains plugin is not planned
A plugin in the JetBrains Marketplace would duplicate an integration the IDE already has, and would
then have to keep a second copy of twelve rules — in Kotlin — in step with the TypeScript ones.
Where the ESLint route genuinely cannot reach (a repository with no ESLint at all), the honest fix
is four lines of `eslint.config.js`, not a second implementation.
:::

## VS Code, Cursor, Windsurf, VSCodium

Install the [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
and the flat config above is enough: the same twelve rules, inline and in the Problems panel.

```jsonc
// .vscode/settings.json
{
  // Applies the two rules that fix on their own — `no-mocked-for-spy` and `prefer-as-spy` — when
  // the file is saved. The rest offer their rewrite as a suggestion on ⌘. instead, because each one
  // changes behaviour and should be read before it is accepted.
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },

  // Flat config is the default from ESLint 9; this line only matters on an older ESLint.
  "eslint.useFlatConfig": true
}
```

Cursor, Windsurf and VSCodium install that ESLint extension from Open VSX and read the same
`.vscode/settings.json`, so nothing about the setup changes there.

## What gets underlined

| Shape                                                  | Why it is wrong                                                                        | Rule                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| `expect()` inside `subscribe()`                        | a silent stream never runs the callback — the test passes having asserted nothing       | `no-expect-in-subscribe`      |
| `it('x', (done) => …)`                                 | Vitest passes a `TestContext`; the test passes having run almost none of its body       | `no-done-callback`            |
| a `.then()` chain that asserts and is never awaited    | the assertion lands after the test has finished, where nothing fails                    | `no-floating-assertion`       |
| `{ provide: X, useValue: { m: vi.fn() } }`             | `provideAutoSpy(X)` stays in step when the class grows a method                         | `prefer-provide-auto-spy`     |
| an object of `vi.fn()`s standing in for a class        | `createSpyFromClass(X)` reads the prototype instead of a list that goes stale            | `prefer-create-spy-from-class` |
| `TestBed.inject<X>()`, or a cast on the way out        | `injectSpy(X)` returns `Spy<X>` with no generic and no assertion                        | `prefer-inject-spy`           |
| `vi.mocked()` over something that is already a spy     | `Mocked<T>` loses `calledWith`, `resolveWith` and `nextWith` — auto-fixed                | `no-mocked-for-spy`           |
| `TestBed.inject(X) as Spy<X>`                          | the cast a `jest-auto-spies` suite carries everywhere stops compiling here — `asSpy(…)` makes the same claim without one, and is auto-fixed | `prefer-as-spy` |
| `Object.defineProperty` in a spec                      | nothing records the undo — `mockReadonlyProp` / `mockValueProp` do                      | `no-object-define-property`   |
| an exported module-level object of `vi.fn()`s          | under `isolate: false` every spec file shares one set of spies                          | `no-shared-module-level-mock` |
| the same token provided twice in one array             | the second provider silently replaces the first                                          | `no-overridden-provider`      |
| `TestBed.inject()` before an `override*` in the suite  | injecting instantiates the module, and every later override throws                       | `no-inject-before-override`   |

Each message ends with a link to the README recipe that shows the replacement, so the rule never
only says "don't". The full descriptions, severities and the reasoning behind which rules fix and
which only suggest are in [ESLint plugin](/utilities/eslint-plugin).

The shapes ESLint cannot see are covered where they surface instead: importing the wrong entry point
for the runner, or calling `nextWith` without `import 'vitest-auto-spy/rxjs'`, both throw at run time
with a message that names the fix and links the page — see
[Errors that name their own fix](/agents#errors-that-name-their-own-fix).
