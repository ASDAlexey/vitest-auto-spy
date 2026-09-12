---
title: Signal forms
description: createForm and toHaveFieldErrors — Angular's signal forms in a spec, past the injection context that makes form() throw NG0203 and past reading errors() by hand.
---

# Signal forms

Signal forms are stable since Angular 22, and a spec that touches one meets the same two things
every time — an error message about `inject()` that never mentions forms, and an `errors()` array
that does not compare the way it looks like it should. This entry is those two, and nothing else.

```ts
import { minLength, required } from '@angular/forms/signals';
import { createForm, registerFormMatchers } from 'vitest-auto-spy/signal-forms';

registerFormMatchers(); // once, in the setup file

const user = createForm({ email: '', name: '' }, (path) => {
  required(path.email, { message: 'Email is required' });
  minLength(path.name, 2);
});

expect(user.email).toHaveFieldErrors([{ kind: 'required', message: 'Email is required' }]);

user.email().value.set('ada@example.test');

expect(user.email).toHaveFieldErrors([]);
```

::: info `@angular/forms` is an optional peer, and this is the only entry that reaches it
Like `@angular/router` behind [`/angular-router`](./angular-router) and `@angular/common` behind
[`/angular-http`](./angular-http), the forms peer is paid for by the suites that import this entry.
`vitest-auto-spy/angular` keeps loading in a project that never installed it. Signal forms need
Angular 22 or newer; the package's own floor stays at 20.
:::

## The injection context — `createForm`

`form()` injects, so calling it in a `beforeEach` throws:

```
NG0203: The `Injector` token injection failed. `inject()` function must be called from an injection context…
```

Nothing in that message says "form", and the repair is either an options bag
(`{ injector: TestBed.inject(Injector) }`) or a `TestBed.runInInjectionContext` wrapped around the
call. Angular's own testing guide calls the isolated schema test the default way to test a form —
most forms need no rendering at all — so this is the step between a reader and the recommended
pattern. `createForm` is that step taken.

| Call                                          | Does                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `createForm(model, schema?, options?)`        | `form()` in the `TestBed`'s injection context; `model` is a `signal()` |
| `createForm(initialValue, schema?, options?)` | the same, with the model signal made for you                           |
| `registerFormMatchers()`                      | adds `expect(field).toHaveFieldErrors(…)` to the runner                |

What comes back is Angular's own `FieldTree`, with nothing wrapped or proxied: the states, the
validators, the schema and the write-through to the model are the framework's.

Three things to know:

- **The model is the source of truth, both ways.** `form()` writes into the signal it was given, so
  a spec that passes its own `signal()` can assert on it directly; pass the plain value instead and
  the signal is made here, because `user().value()` reads it back either way.
- **A `computed()` is refused by name.** A form writes into its model, and a derived signal cannot
  take a write — without the check it would be wrapped as a value and every write would vanish
  silently.
- **`options.injector` is for the validator that injects.** A schema is a function, so
  `inject(SomeService)` inside it resolves against whichever injector built the form. Pass
  `fixture.debugElement.injector` when the service is in a component's own `providers`.

## The errors — `toHaveFieldErrors`

`field().errors()` answers `RequiredValidationError` instances rather than `{ kind, message }`
objects, and each one carries a `fieldTree` back-reference to the field it came from. So the
assertion that looks right fails on a property nobody wrote:

```ts
expect(user.email().errors()).toEqual([{ kind: 'required' }]); // fails: `fieldTree` is not in the expected object
```

What suites write instead is `errors().some((error) => error.kind === 'required')`, which passes
just as happily when the field has three other errors nobody expected — a validator that started
firing is invisible to it.

```ts
expect(user.email).toHaveFieldErrors(['required']); // the whole set, by kind
expect(user.email).toHaveFieldErrors('required'); // one kind needs no array
expect(user.email).toHaveFieldErrors([{ kind: 'minLength', message: 'Too short' }]); // and its message
expect(user.email).toHaveFieldErrors([]); // nothing at all
```

- **The whole set is compared, order-free.** Two errors where the spec named one is a failure, and
  the message prints both sides by kind.
- **A message is compared only where the spec names one**, so `'required'` keeps matching after a
  copy edit, while a spec that cares about the wording says so.
- **A field tree and its state both read.** `expect(user.email)` and `expect(user.email())` are the
  same assertion — anything else fails with what it received rather than passing on `undefined`.
- **Register it once**, in the setup file, next to
  [`registerSignalMatchers()`](./angular#asserting-a-signal). The two are separate calls because this
  one's types reach `@angular/forms` and the other's must not.

## A form the component owns

The other half of a real suite: the component builds the form itself, so the spec drives it through
the component rather than building one.

```ts
const fixture = TestBed.createComponent(ReviewFormComponent);

fixture.componentInstance.form.tags().value.set([tag]);

await stable(fixture);

expect(fixture.componentInstance.form.tags).toHaveFieldErrors([]);
expect(fixture.componentInstance.form.tags().dirty()).toBe(true);
```

`createForm` has nothing to add there — the component already built the form in its own injection
context — but the matcher does, and so does
[`setInputs`](./angular#changing-an-input-mid-test) for the inputs the
form reacts to.

## Custom controls

A component implementing `FormValueControl<T>` or `FormCheckboxControl` is a plain component: the
contract is `value = model<T>()` plus whatever state inputs it reads. No double is needed, and none
is shipped — it is `renderShallow` and `setInputs`:

```ts
const fixture = renderShallow(PublishCheckboxComponent, { inputs: { label: 'Published' } });

await setInputs(fixture, { value: true });

expect(fixture.componentInstance.value()).toBe(true);
```

::: info There is no `FieldTree` double here, on purpose
A double would stand in for a form a component receives as an input — and across the suites this
package is measured against, no component takes one: forms are built by the component that owns
them, and controls take a `value` model instead. A double for a shape nobody writes is a shape
nobody tests. If yours is different, the issue tracker is the place — measured shapes are what this
package ships.
:::
