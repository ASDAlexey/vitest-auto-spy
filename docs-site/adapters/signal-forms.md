---
title: Signal forms
description: createForm builds an Angular signal form inside a test without the NG0203 injection error; toHaveFieldErrors checks a field's validation errors in one line.
---

# Signal forms

`vitest-auto-spy/signal-forms` has two helpers for testing Angular signal forms (`form()` from
`@angular/forms/signals`). `createForm` builds a form in a test, so you can check your validation
rules without rendering a component. `toHaveFieldErrors` checks which validation errors a field has.

```ts
import { email, minLength, required } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { createForm } from 'vitest-auto-spy/signal-forms';

describe('sign-up form', () => {
  it('checks email and name', () => {
    const user = createForm({ email: '', name: 'A' }, (path) => {
      required(path.email);
      email(path.email);
      minLength(path.name, 2);
    });

    expect(user.email).toHaveFieldErrors('required');
    expect(user.name).toHaveFieldErrors('minLength');

    user.email().value.set('not-an-email');
    expect(user.email).toHaveFieldErrors('email');

    user.email().value.set('ada@example.test');
    expect(user.email).toHaveFieldErrors([]);
  });
});
```

In the example, `user` is the form. `user.email` is its `email` field. Calling a field gives its
**state**: `user.email()` has `value`, `errors()`, `dirty()` and the rest. `user()` is the state of
the whole form.

`createForm` uses `TestBed`'s injector, but you do not have to call
`TestBed.configureTestingModule`. On the `@angular/build:unit-test` builder, `createForm` needs no other setup.
On a plain `vitest.config.ts`, set up the Angular test environment first, as shown in
[Installation](/core/installation). Configure `TestBed` only if a validator injects a service.

## Set up the matcher

Add two things to your test setup file: the import, which gives `expect` the `toHaveFieldErrors`
type, and the `registerFormMatchers()` call, which makes the matcher work at run time:

```ts
// src/test-setup.ts
import { registerFormMatchers } from 'vitest-auto-spy/signal-forms';

registerFormMatchers();
```

List the file in `setupFiles`. With the Angular builder, that is the `test` target in `angular.json`:

```jsonc
// angular.json → projects.<app>.architect
"test": {
  "builder": "@angular/build:unit-test",
  "options": {
    "setupFiles": ["src/test-setup.ts"]
  }
}
```

On a plain Vitest config, use `test: { setupFiles: ['src/test-setup.ts'] }` in `vitest.config.ts`.

For the type to reach your specs, TypeScript must compile the setup file too. Add it to
`tsconfig.spec.json`:

```jsonc
// tsconfig.spec.json
"include": ["src/**/*.spec.ts", "src/**/*.d.ts", "src/test-setup.ts"]
```

**Requirements:** Angular 22 or newer, and `@angular/forms` installed (it is an optional peer
dependency that only `vitest-auto-spy/signal-forms` needs).

| Import                     | What it gives you                                        |
| -------------------------- | -------------------------------------------------------- |
| `createForm`               | a real signal form, built inside `TestBed`'s injector    |
| `registerFormMatchers`     | adds `expect(field).toHaveFieldErrors(…)` to Vitest      |
| `CreateFormOptions` (type) | the options object of `createForm`                       |
| `FieldErrorMatch` (type)   | one expected error: `'required'` or `{ kind, message? }` |

## Error kinds of Angular's validators

`toHaveFieldErrors` matches errors by `kind`. The built-in validators from `@angular/forms/signals`
use these kinds:

| Validator            | Kind          | On an empty value |
| -------------------- | ------------- | ----------------- |
| `required(path)`     | `'required'`  | reports the error |
| `email(path)`        | `'email'`     | stays silent      |
| `minLength(path, n)` | `'minLength'` | stays silent      |

So an empty email with `required` and `email` has one error, `required`.

## The injection context — `createForm`

`createForm` builds a signal form inside `TestBed`'s injector. Use it to test a form's validation
rules without rendering a component.

Why you need it: `form()` calls `inject()`. Called directly in a test or a `beforeEach`, it throws an
error that never mentions forms:

```
NG0203: The `Injector` token injection failed. `inject()` function must be called from an injection context…
```

`createForm` passes `TestBed`'s injector to `form()` for you.

```ts
import { signal } from '@angular/core';
import { required } from '@angular/forms/signals';
import { expect, it } from 'vitest';
import { createForm } from 'vitest-auto-spy/signal-forms';

it('writes the typed value into the model', () => {
  const model = signal({ email: '' });
  const user = createForm(model, (path) => required(path.email));

  user.email().value.set('ada@example.test');

  expect(model().email).toBe('ada@example.test');
});
```

| Call                                          | What it does                                                  |
| --------------------------------------------- | ------------------------------------------------------------- |
| `createForm(model, schema?, options?)`        | `form()` inside `TestBed`'s injector; `model` is a `signal()` |
| `createForm(initialValue, schema?, options?)` | the same, but `createForm` makes the model signal for you     |

| Option     | Type       | Default                    | Meaning                       |
| ---------- | ---------- | -------------------------- | ----------------------------- |
| `injector` | `Injector` | `TestBed.inject(Injector)` | the injector `form()` runs in |

The result is Angular's own `FieldTree`, not a wrapper. States, validators, the schema and writes
into the model all behave exactly as in the app.

- **Pass a `signal()` when you want to check the model.** The form writes every change into that
  signal. If you pass a plain value, `createForm` creates the signal for you. In both cases,
  `user().value()` returns the whole model.
- **A validator that calls `inject()`** gets its services from `TestBed`'s injector. Providers in
  `TestBed.configureTestingModule` are enough.
- **Pass `options.injector` when the service is in a component's own `providers`.** Create
  the component with `TestBed.createComponent`, then pass
  `{ injector: fixture.debugElement.injector }`.

**Common mistake:** passing a `computed()`, an `input()` or another read-only signal as the model. A
form writes into its model, so `createForm` throws:
`[vitest-auto-spy] createForm(): the model is a computed(), which cannot be written, and a form writes back into its model.`
Pass `signal(initialValue)` or the initial value itself.

## The errors — `toHaveFieldErrors`

`toHaveFieldErrors` checks that a field has exactly the errors you list: no more, no fewer. It
compares them by `kind`, and by `message` when you give one. Register it once with `registerFormMatchers()` (see the setup file above).

```ts
expect(user.email).toHaveFieldErrors(['required']); // exactly these kinds
expect(user.email).toHaveFieldErrors('required'); // one kind, no array needed
expect(user.email).toHaveFieldErrors([{ kind: 'minLength', message: 'Too short' }]); // kind and message
expect(user.email).toHaveFieldErrors([]); // no errors at all
```

How it compares:

- **The whole list, in any order.** If the field has two errors and you name one, the check fails.
  The failure prints both sides, for example
  `expected field 'email' to have required, got email`.
- **The message only when you name it.** `'required'` still matches after someone edits the error
  text. Write `{ kind, message }` when the wording matters.
- **A field or its state.** `expect(user.email)` and `expect(user.email())` are the same check.
  Any other value throws:
  `[vitest-auto-spy] toHaveFieldErrors: expected a field of a signal form — form.email or form.email() — received …`
  instead of passing.

Why not `toEqual`: `errors()` returns objects such as `RequiredValidationError`, not plain
`{ kind, message }`. Each one also has a `fieldTree` property that points back to its field. So a
plain `toEqual` fails on a property you never wrote:

```ts
expect(user.email().errors()).toEqual([{ kind: 'required' }]); // fails: `fieldTree` is not in the expected object
```

**Common mistake:** checking one error with
`errors().some((error) => error.kind === 'required')`. It still passes when the field has three
other errors you did not expect. Use `toHaveFieldErrors(['required'])`: it fails on extra errors.

For form fields, `registerFormMatchers()` is all you need. Matchers for plain signals come from a
different call, [`registerSignalMatchers()`](./angular#asserting-a-signal); add it only if you also
check plain signals.

## A form the component owns

When the component builds the form itself, test it through the component. You do not need
`createForm` here, because the component already built the form in its own injection context. The
matcher still works on the component's fields.

```ts
import { TestBed } from '@angular/core/testing';
import { expect, it } from 'vitest';
import { stable } from 'vitest-auto-spy/angular';

import { ReviewFormComponent } from './review-form.component';

it('accepts a tag', async () => {
  const fixture = TestBed.createComponent(ReviewFormComponent);

  fixture.componentInstance.form.tags().value.set(['angular']);

  await stable(fixture);

  expect(fixture.componentInstance.form.tags).toHaveFieldErrors([]);
  expect(fixture.componentInstance.form.tags().dirty()).toBe(true);
});
```

If the form reacts to component inputs, change them with
[`setInputs`](./angular#changing-an-input-mid-test).

## Custom controls

A custom control implements `FormValueControl<T>` or `FormCheckboxControl`. It is an ordinary
component: a `value = model<T>()` plus any state inputs it reads. You need no special helper; render
it with `renderShallow` and change its inputs with `setInputs`:

```ts
import { expect, it } from 'vitest';
import { renderShallow, setInputs } from 'vitest-auto-spy/angular';

import { PublishCheckboxComponent } from './publish-checkbox.component';

it('takes a value', async () => {
  const fixture = renderShallow(PublishCheckboxComponent, { inputs: { label: 'Published' } });

  await setInputs(fixture, { value: true });

  expect(fixture.componentInstance.value()).toBe(true);
});
```

## In depth

**Why test the schema without rendering.** Angular's own testing guide recommends the isolated
schema test as the default way to test a form; most forms need no rendering. Without `createForm`,
you would pass `{ injector: TestBed.inject(Injector) }` to `form()` yourself, or wrap the call in
`TestBed.runInInjectionContext`.

**Why `registerFormMatchers()` is a separate call.** Its types need `@angular/forms`, and
`registerSignalMatchers()` must work in projects without it.

**Why a `computed()` is refused.** A derived signal cannot take a write. Without the check,
`createForm` would treat it as a plain value, and every write from the form would be lost without an
error.

**Why there is no `FieldTree` stand-in.** A stand-in for a form would only help a component that
receives a form as an input. In the Angular projects this package is tested against, no component
does that: the component that owns a form builds it, and controls take a `value` model. If your
project passes forms as inputs, open an issue.
