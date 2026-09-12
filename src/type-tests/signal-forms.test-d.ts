/**
 * Type-level tests for the signal-forms entry.
 *
 * The runtime spec proves the form is Angular's own; what it cannot prove is that the model type
 * survives both ways of handing it over — a `signal()` and a plain value — so that the schema is
 * checked against the model and the tree the helper answers with is the one `form()` would.
 */
import { signal } from '@angular/core';
import { type FieldTree, required } from '@angular/forms/signals';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { createForm } from '../signal-forms';

interface Signup {
  email: string;
  name: string;
}

describe('createForm', () => {
  it('reads the model type off the signal it was given', () => {
    expectTypeOf(createForm(signal<Signup>({ email: '', name: '' }))).toEqualTypeOf<FieldTree<Signup>>();
  });

  it('reads it off a plain value just the same', () => {
    expectTypeOf(createForm({ email: '', name: '' })).toEqualTypeOf<FieldTree<{ email: string; name: string }>>();
    expectTypeOf(createForm<Signup>({ email: '', name: '' })).toEqualTypeOf<FieldTree<Signup>>();
  });

  it('checks the schema against the model, whichever way the model arrived', () => {
    createForm(signal<Signup>({ email: '', name: '' }), (path) => required(path.email));
    createForm<Signup>({ email: '', name: '' }, (path) => required(path.name));

    // @ts-expect-error — nothing on the model is called that
    createForm<Signup>({ email: '', name: '' }, (path) => required(path.emial));
  });

  it('takes the injector, and nothing else, as options', () => {
    createForm({ email: '' }, undefined, {});

    // @ts-expect-error — `injector` is the only option there is
    createForm({ email: '' }, undefined, { runInInjectionContext: true });
  });
});

describe('toHaveFieldErrors', () => {
  it('takes one kind, a list of kinds, or the kinds with their messages', () => {
    const user = createForm<Signup>({ email: '', name: '' }, (path) => required(path.email));

    expect(user.email).toHaveFieldErrors('required');
    expect(user.email).toHaveFieldErrors(['required']);
    expect(user.email).toHaveFieldErrors([{ kind: 'required', message: 'Email is required' }]);
    expect(user.email()).toHaveFieldErrors([]);

    // @ts-expect-error — an error is named by its kind, not by a number
    expect(user.email).toHaveFieldErrors([7]);

    // @ts-expect-error — `kind` is what identifies an error; `code` is another library's word for it
    expect(user.email).toHaveFieldErrors([{ code: 'required' }]);
  });
});
