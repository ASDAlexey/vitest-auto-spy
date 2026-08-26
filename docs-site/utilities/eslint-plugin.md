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

The two `error` rules are the ones that catch a test being _wrong_ rather than verbose:
`Object.defineProperty` leaves no way back — nothing restores the original descriptor, so the patch
leaks into the next file under `isolate: false` — and an `expect()` inside `subscribe()` never runs
if the stream stays silent, leaving a green test that asserted nothing.

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
