---
title: Editor diagnostics — WebStorm and VS Code
description: See the vitest-auto-spy lint rules underlined while you write a spec, in WebStorm and other JetBrains IDEs, and through the ESLint extension in VS Code, Cursor and Windsurf.
---

# Editor diagnostics

The library's lint rules can underline mistakes in your editor while you type, instead of in CI an
hour later. They catch shapes that **pass** but test nothing: an `expect()` inside `subscribe()`, a
`done` callback Vitest never calls, a spy typed as the class.

You need no editor plugin from this package. The rules ship as
[`vitest-auto-spy/eslint-plugin`](/utilities/eslint-plugin), and every editor below already runs
ESLint. The same rules run in the editor and in CI, so nothing passes locally and fails on the build.

Set it up once:

```bash
npm i -D vitest-auto-spy eslint typescript-eslint
```

```js
// eslint.config.js — flat config, at the repository root
import tseslint from 'typescript-eslint';
import autoSpy from 'vitest-auto-spy/eslint-plugin';

export default [
  ...tseslint.configs.recommended,
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    ...autoSpy.configs.recommended,
  },
];
```

`typescript-eslint` lets ESLint read `.ts` files. If you already have an ESLint config, add only the
spec-file block, after your other blocks. `autoSpy.configs.recommended` is one object with
`plugins` and `rules` and no `files`, so the `files` list next to it decides where the rules apply. More setups: [ESLint plugin](/utilities/eslint-plugin).

Then turn on ESLint in your editor, as below.

## WebStorm and the other JetBrains IDEs

WebStorm, IntelliJ IDEA Ultimate, PhpStorm, PyCharm Professional and RubyMine run ESLint themselves.
So the rules show inline, in the Problems tool window, and under **Code → Inspect Code**, with no
plugin to install.

In **Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint**, pick
**Automatic ESLint configuration**. WebStorm then finds `eslint.config.js` and the local `eslint`.
Choose **Manual** only when the config lives outside the project root; then set _ESLint package_
(`node_modules/eslint`) and _Configuration file_.

Three things that look like "the rules do not work":

- **Use flat config (`eslint.config.js`).** The old `.eslintrc` form `plugins: ['vitest-auto-spy']`
  looks for a package named `eslint-plugin-*`, and this plugin is a subpath of `vitest-auto-spy`
  instead. WebStorm supports flat config from 2023.3; on an older build, upgrade the IDE.
- **Limit the block to spec files**, as in the `files` list above. `Object.defineProperty` or an
  object of `vi.fn()`s is fine in app code; every rule here is about test code.
- **Quick fixes come from ESLint.** `⌥⏎` on a highlighted line offers _ESLint: Fix current file_ and,
  where a rule has a suggestion, that single rewrite. Rules whose rewrite is safe fix on their own;
  the rest only suggest, because the change affects behaviour and you should read it first.

During a migration, **Code → Inspect Code…** with the scope set to your test sources lists every
finding grouped by rule.

::: tip No separate JetBrains plugin
A Marketplace plugin would duplicate what the IDE already does through ESLint, and would need a
second copy of every rule. If a repository has no ESLint at all, add the `eslint.config.js` above.
:::

## VS Code, Cursor, Windsurf, VSCodium

Install the [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).
With the config above, the rules show inline and in the Problems panel.

```jsonc
// .vscode/settings.json
{
  // Apply the rules that fix on their own when you save the file ("explicit": on a manual save,
  // not on auto-save). The rest offer their rewrite on ⌘. as a suggestion, to read first.
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },

  // Needed only on ESLint 8; harmless on ESLint 9 and later, where flat config is the default.
  "eslint.useFlatConfig": true,
}
```

Cursor, Windsurf and VSCodium install the same ESLint extension from Open VSX and read the same
`.vscode/settings.json`.

## What gets underlined

| Shape                                                        | Why it is wrong                                                                                                                        | Rule                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `expect()` inside `subscribe()`                              | a silent stream never runs the callback, so the test passes having asserted nothing                                                    | `no-expect-in-subscribe`          |
| `it('x', (done) => …)`, and `done.fail(…)`                   | Vitest passes a `TestContext`, not `done`; the test passes having run almost none of its body                                          | `no-done-callback`                |
| a `.then()` chain that asserts and is never awaited          | the assertion runs after the test has finished, where nothing fails                                                                    | `no-floating-assertion`           |
| `{ provide: X, useValue: { m: vi.fn() } }`                   | `provideAutoSpy(X)` stays in step when the class gets a new method                                                                     | `prefer-provide-auto-spy`         |
| an object of `vi.fn()`s standing in for a class              | `createSpyFromClass(X)` reads the class instead of a list that goes stale                                                              | `prefer-create-spy-from-class`    |
| `TestBed.inject<X>()`, or a cast on the way out              | `injectSpy(X)` returns `Spy<X>` with no generic and no cast                                                                            | `prefer-inject-spy`               |
| `vi.mocked()` over something that is already a spy           | `Mocked<T>` loses `calledWith`, `resolveWith` and `nextWith`; fixed automatically                                                      | `no-mocked-for-spy`               |
| `TestBed.inject(X) as Spy<X>`                                | with this library that cast does not compile; `asSpy(…)` says the same without a cast, and is fixed automatically                      | `prefer-as-spy`                   |
| `Object.defineProperty` in a spec                            | nothing records the undo; `mockReadonlyProp` / `mockValueProp` do                                                                      | `no-object-define-property`       |
| an exported module-level object of `vi.fn()`s                | under `isolate: false` every spec file shares one set of spies                                                                         | `no-shared-module-level-mock`     |
| the same token provided twice in one array                   | the second provider silently replaces the first                                                                                        | `no-overridden-provider`          |
| `TestBed.inject()` before an `override*` in the suite        | injecting creates the module, and every later override throws                                                                          | `no-inject-before-override`       |
| `spyOn(o, 'm')`, `jasmine.*`, `fail(`, `.withContext(`       | Jasmine's `spyOn` stubs while `vi.spyOn` calls the real method, so a rename silently changes behaviour; the rest are `ReferenceError`s | `no-jasmine-globals`              |
| `.and` / `.calls` / `.withArgs` with nothing installing them | these come from `vitest-auto-spy/jasmine`; without it the line reads `undefined`                                                       | `jasmine-namespace-without-entry` |
| `spy.calls.saveArgumentsByValue()`                           | it does nothing here, so the spec starts asserting on state after mutation                                                             | `no-save-arguments-by-value`      |

The last three are for a suite [migrating off `jasmine-auto-spies`](/migrating-jasmine).

**Common mistake during that migration:** keeping `prefer-native-spy-api` (a rule that replaces the
Jasmine-style bridge calls with native Vitest ones) on from day one. It reports
working bridge code, so at first it underlines every line of the shim. Set it to `'off'` for a
while, and turn it back on for the last step: the migration is done when it is silent.

Each message names what it found and the one fix, and ends with `Docs:` and a link to the rule's
section of [ESLint rules](/utilities/eslint-rules). Full descriptions and severities are in
[ESLint plugin](/utilities/eslint-plugin).

Mistakes ESLint cannot see are reported when the test runs: importing the wrong entry point for your
runner, or calling `nextWith` without `import 'vitest-auto-spy/rxjs'`. Both throw with a message that
names the fix and links the page; see
[Errors that name their own fix](/agents#errors-that-name-their-own-fix).
