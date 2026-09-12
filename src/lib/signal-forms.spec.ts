/**
 * The claim is that the form these helpers build is Angular's own, so every test asserts through
 * the real `FieldTree` — its validators, its `errors()`, its write-through to the model — rather
 * than through anything transcribed here. `@angular/forms` is a dev dependency of this package for
 * exactly that reason: a form double would prove nothing about the trap this entry exists for.
 */
import { Component, Injectable, Injector, computed, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type SchemaOrSchemaFn, form, minLength, pattern, required, validate } from '@angular/forms/signals';
import { beforeAll, describe, expect, it } from 'vitest';

import { createForm, registerFormMatchers } from './signal-forms';

interface Signup {
  email: string;
  name: string;
  age: number;
}

const EMPTY: Signup = { email: '', name: '', age: 0 };

const signupSchema: SchemaOrSchemaFn<Signup> = (path) => {
  required(path.email, { message: 'Email is required' });
  minLength(path.name, 2);
};

@Injectable()
class BannedNames {
  readonly names = ['root'];
}

@Component({
  selector: 'vas-signup',
  standalone: true,
  template: '',
  providers: [BannedNames],
})
class SignupComponent {}

beforeAll(() => {
  registerFormMatchers();
});

describe('createForm', () => {
  it('builds a form where form() can inject, which a bare call cannot', () => {
    const model = signal(EMPTY);

    expect(() => form(model)).toThrow(/NG0203/);

    const user = createForm(model, (path) => required(path.email));

    expect(
      user
        .email()
        .errors()
        .map((error) => error.kind),
    ).toEqual(['required']);
  });

  it('writes through to the model signal the spec passed', () => {
    const model = signal(EMPTY);
    const user = createForm(model);

    user.name().value.set('Ada');

    expect(model().name).toBe('Ada');
    expect(user().value()).toEqual({ email: '', name: 'Ada', age: 0 });
  });

  it('makes the model itself when handed a plain value', () => {
    const user = createForm(EMPTY, signupSchema);

    expect(user().valid()).toBe(false);

    user.email().value.set('ada@example.test');

    expect(user().value()).toEqual({ email: 'ada@example.test', name: '', age: 0 });
    expect(user().valid()).toBe(true);
  });

  it('takes no schema at all', () => {
    expect(createForm(EMPTY)().valid()).toBe(true);
  });

  it("runs in the injector it was given, so a validator reads a component's own providers", () => {
    TestBed.configureTestingModule({});

    const fixture = TestBed.createComponent(SignupComponent);
    const injector = fixture.debugElement.injector;
    const user = createForm(
      { email: '', name: 'root', age: 0 },
      (path) => {
        const banned = inject(BannedNames);

        validate(path.name, ({ value }) => (banned.names.includes(value()) ? { kind: 'banned' } : undefined));
      },
      { injector },
    );

    expect(
      user
        .name()
        .errors()
        .map((error) => error.kind),
    ).toEqual(['banned']);
  });

  it('refuses a signal it cannot write back into', () => {
    const source = signal(EMPTY);
    const derived = computed(() => source());

    expect(() => createForm(derived)).toThrow(/the model has to be a writable signal/);
  });

  it('defaults to the TestBed injector even when the spec configured a module', () => {
    TestBed.configureTestingModule({ providers: [BannedNames] });

    expect(createForm(EMPTY, undefined, {})).toBeTypeOf('function');
    expect(TestBed.inject(Injector)).toBeDefined();
  });
});

describe('toHaveFieldErrors', () => {
  it('reads a field tree and the state it answers with', () => {
    const user = createForm(EMPTY, signupSchema);

    expect(user.email).toHaveFieldErrors(['required']);
    expect(user.email()).toHaveFieldErrors(['required']);
  });

  it('takes a single kind without an array around it', () => {
    expect(createForm(EMPTY, signupSchema).email).toHaveFieldErrors('required');
  });

  it('matches the message where the spec names one, and ignores it where it does not', () => {
    const user = createForm(EMPTY, signupSchema);

    expect(user.email).toHaveFieldErrors([{ kind: 'required', message: 'Email is required' }]);
    expect(user.email).toHaveFieldErrors([{ kind: 'required' }]);
    expect(user.email).not.toHaveFieldErrors([{ kind: 'required', message: 'Something else' }]);
  });

  it('holds the whole set, so an error nobody expected fails', () => {
    const user = createForm({ ...EMPTY, name: 'a' }, (path) => {
      minLength(path.name, 2);
      pattern(path.name, /^[A-Z]/);
    });

    expect(user.name).not.toHaveFieldErrors(['minLength']);
    expect(user.name).toHaveFieldErrors(['minLength', 'pattern']);
    expect(user.name).toHaveFieldErrors(['pattern', 'minLength']);
  });

  it('passes on an empty list for a field that validates', () => {
    const user = createForm({ email: 'ada@example.test', name: 'Ada', age: 0 }, signupSchema);

    expect(user.email).toHaveFieldErrors([]);
    expect(user.name).toHaveFieldErrors([]);
  });

  it('follows the field as the value moves', () => {
    const user = createForm({ ...EMPTY, name: 'a' }, signupSchema);

    expect(user.name).toHaveFieldErrors(['minLength']);

    user.name().value.set('Ada');

    expect(user.name).toHaveFieldErrors([]);
  });

  it('reports both sides when the sets differ', () => {
    const user = createForm(EMPTY, signupSchema);

    expect(() => expect(user.email).toHaveFieldErrors(['email'])).toThrow(
      /expected the field to have email, got required \(Email is required\)/,
    );
    expect(() => expect(createForm({ ...EMPTY, name: 'a' }, signupSchema).name).not.toHaveFieldErrors(['minLength'])).toThrow(
      /expected the field not to have minLength/,
    );
    expect(() => expect(user.email).toHaveFieldErrors([])).toThrow(/to have no errors, got required/);
  });

  it('refuses anything that is not a field', () => {
    const notAField = /expected a field of a signal form/;

    expect(() => expect(signal(1)).toHaveFieldErrors([])).toThrow(notAField);
    expect(() => expect(null).toHaveFieldErrors([])).toThrow(notAField);
    expect(() => expect({ errors: [] }).toHaveFieldErrors([])).toThrow(notAField);
    expect(() => expect({ errors: signal('nope') }).toHaveFieldErrors([])).toThrow(notAField);
    expect(() => expect({ errors: signal([{ code: 'required' }]) }).toHaveFieldErrors([])).toThrow(notAField);
    expect(() => expect({ errors: signal(['required']) }).toHaveFieldErrors([])).toThrow(notAField);
  });

  it('reads a field state a spec built by hand, kind and message alike', () => {
    expect({ errors: signal([{ kind: 'required' }]) }).toHaveFieldErrors(['required']);
    expect({ errors: signal([{ kind: 'required', message: 'Email is required' }]) }).toHaveFieldErrors([
      { kind: 'required', message: 'Email is required' },
    ]);
  });
});
