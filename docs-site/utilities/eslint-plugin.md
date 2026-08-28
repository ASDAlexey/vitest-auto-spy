---
title: ESLint plugin
description: Eight flat-config lint rules that steer a suite onto the auto-spy helpers, versioned with the API they recommend.
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

| Rule                           | Recommended | Flags                                                                                 |
| ------------------------------ | :---------: | ------------------------------------------------------------------------------------- |
| `prefer-provide-auto-spy`      |   `warn`    | `{ provide: X, useValue: { a: vi.fn() } }` → `provideAutoSpy(X)`                      |
| `prefer-create-spy-from-class` |   `warn`    | an object literal of two or more `vi.fn()`s → `createSpyFromClass` / `createAutoMock` |
| `prefer-inject-spy`            |   `warn`    | `vi.spyOn(TestBed.inject(X), 'm')` → `injectSpy(X)`                                   |
| `no-object-define-property`    |   `error`   | `Object.defineProperty` in a spec → `mockReadonlyProp` / `mockValueProp`              |
| `no-expect-in-subscribe`       |   `error`   | `expect()` inside a `subscribe()` callback → `expectEmission`                         |
| `no-shared-module-level-mock`  |   `error`   | an **exported** value holding `vi.fn()`s → export a factory that returns it           |
| `no-mocked-for-spy`            |   `warn`    | `let s: Mocked<T>` → `Spy<T>`                                                        |
| `no-done-callback`             |   `error`   | `it('x', (done) => …)` → `async` + an awaited assertion                               |

The three `error` rules are the ones that catch a test being _wrong_ rather than verbose.
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

Under `isolate: false` a module is evaluated once per worker, the spies are registered against
whichever file imported first, and every other file's `clearMocks` never reaches them. The rule
stops at every function boundary, so the factory form — the fix — is not flagged along with the
problem. Scope it to fixture modules and spec files alike; a spec file
[should export nothing at all](/utilities/setup#shared-fixtures-are-functions-not-constants).

And a `done` parameter is not a style question. Vitest passes a `TestContext` there, so calling it
throws `TestContext is not a function` — inside a promise nobody awaits, which means the test
**passes** having run almost none of its body. Four such tests sat green for years in the suite this
rule came from; nothing but a type-checker ever noticed, and only indirectly.

`no-mocked-for-spy` is a `warn` because `Mocked<T>` has legitimate uses next to `vi.mocked()`; what
it flags is the declaration form, where the assignment then fails with a list of private field names
that says nothing about the real cause.

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
