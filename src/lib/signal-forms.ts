/**
 * `createForm()` / `toHaveFieldErrors` — Angular's signal forms in a spec, past the two things that
 * make the first one hard to write.
 *
 * **The injection context.** `form()` injects, so calling it in a `beforeEach` throws
 * `NG0203: The Injector token injection failed` — a message about `inject()` that never mentions
 * forms, and the repair (`{ injector: TestBed.inject(Injector) }`, or a
 * `TestBed.runInInjectionContext` around it) is the first thing every spec has to learn. Angular's
 * own testing guide calls the isolated schema test the default way to test a form, so this is the
 * step between a reader and the recommended pattern; `createForm()` is that step taken.
 *
 * **Reading the errors back.** `field().errors()` answers `RequiredValidationError` instances, not
 * `{ kind, message }` objects: they carry a `fieldTree` back-reference, so a `toEqual([{ kind:
 * 'required' }])` fails on a property nobody wrote, and every suite ends up with
 * `errors().some((error) => error.kind === 'required')` — which passes just as happily when the
 * field has three other errors nobody expected. `toHaveFieldErrors` compares the whole set by
 * `kind` (and `message` where the spec names one) and prints both sides when it does not match.
 *
 * The entry is narrow on purpose: this is the only file of the package that reaches
 * `@angular/forms`, which stays an optional peer paid for by the suites that import it.
 */
import { Injector, type WritableSignal, isSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type FieldTree, type SchemaOrSchemaFn, form, isFieldTree } from '@angular/forms/signals';
import { expect } from 'vitest';

import { DOCS_LINKS, withDocs } from './docs-links';

/** Where a form is built, when the `TestBed`'s own injector is not the one the spec wants. */
export interface CreateFormOptions {
  /**
   * The injector `form()` runs in. Defaults to the `TestBed`'s — pass
   * `fixture.debugElement.injector` when a validator injects something a component provides.
   */
  injector?: Injector;
}

/** One error as a spec names it: the kind alone, or the kind with the message it must carry. */
export type FieldErrorMatch = string | { kind: string; message?: string };

/** A `ValidationError` reduced to what a spec asserts on. */
interface FieldError {
  kind: string;
  message?: string;
}

/** What a matcher hands back to the runner. */
interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

// Chai's `Assertion`, not Vitest's `Matchers`: `Matchers` is `<T>` on Vitest 4 and `<R, T>` on
// Vitest 5, and declaration merging demands an exact type-parameter match — this one merges on both.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Chai publishes `Assertion` inside a namespace; merging into it is the only way in.
  namespace Chai {
    interface Assertion {
      /** Compare the whole of a field's `errors()` with the kinds (and messages) the spec names. */
      toHaveFieldErrors(expected: FieldErrorMatch | readonly FieldErrorMatch[]): void;
    }
  }
}

function modelOf<TModel>(source: TModel | WritableSignal<TModel>): WritableSignal<TModel> {
  if (!isSignal(source)) {
    return signal(source);
  }

  if (typeof Reflect.get(source, 'set') !== 'function') {
    throw new Error(
      withDocs(
        '[vitest-auto-spy] createForm(): a form writes back into its model, so the model has to be a writable signal — a ' +
          'computed() or an input() cannot be one. Pass signal(initialValue), or the initial value itself.',
        DOCS_LINKS.signalForms,
      ),
    );
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `isSignal` narrows to `Signal<unknown>`, which loses the model type the overloads were given; the `set` check above is what makes it writable.
  return source as WritableSignal<TModel>;
}

/**
 * Build a real signal form in the `TestBed`'s injection context.
 *
 * ```ts
 * const user = createForm({ email: '', name: '' }, (path) => {
 *   required(path.email, { message: 'Email is required' });
 *   minLength(path.name, 2);
 * });
 *
 * expect(user.email).toHaveFieldErrors([{ kind: 'required', message: 'Email is required' }]);
 *
 * user.email().value.set('ada@example.test');
 *
 * expect(user.email).toHaveFieldErrors([]);
 * ```
 *
 * Pass the model as a `signal()` when the spec asserts on it directly; pass the plain value and the
 * signal is made here, since `form().value()` reads it back either way. Everything else is
 * Angular's own: the tree, the states, the validators, the schema.
 */
export function createForm<TModel>(
  model: WritableSignal<TModel>,
  schema?: SchemaOrSchemaFn<TModel>,
  options?: CreateFormOptions,
): FieldTree<TModel>;
/** From the initial value, for the isolated schema test that never needs the model signal itself. */
export function createForm<TModel>(initialValue: TModel, schema?: SchemaOrSchemaFn<TModel>, options?: CreateFormOptions): FieldTree<TModel>;
export function createForm<TModel>(
  source: TModel | WritableSignal<TModel>,
  schema?: SchemaOrSchemaFn<TModel>,
  options: CreateFormOptions = {},
): FieldTree<TModel> {
  const model = modelOf(source);
  const injector = options.injector ?? TestBed.inject(Injector);

  return schema === undefined ? form(model, { injector }) : form(model, schema, { injector });
}

function asFieldError(value: unknown): FieldError | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const kind: unknown = Reflect.get(value, 'kind');

  if (typeof kind !== 'string') {
    return undefined;
  }

  const message: unknown = Reflect.get(value, 'message');

  return typeof message === 'string' ? { kind, message } : { kind };
}

/**
 * The errors of whatever the spec put in `expect()` — a field tree (`form.email`) or the state it
 * answers with (`form.email()`), because both read naturally and only one of them is a function.
 */
function errorsOf(received: unknown): FieldError[] | undefined {
  const state: unknown = isFieldTree(received) ? received() : received;

  if (typeof state !== 'object' || state === null) {
    return undefined;
  }

  const errors: unknown = Reflect.get(state, 'errors');

  if (!isSignal(errors)) {
    return undefined;
  }

  const current: unknown = errors();

  if (!Array.isArray(current)) {
    return undefined;
  }

  const named = current.map(asFieldError);

  return named.every((error): error is FieldError => error !== undefined) ? named : undefined;
}

function expectedErrors(expected: FieldErrorMatch | readonly FieldErrorMatch[]): FieldError[] {
  const list = Array.isArray(expected) ? expected : [expected];

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- `Array.isArray` widens a `readonly FieldErrorMatch[]` to `any[]`, which loses the element type the branch above just established.
  return (list as readonly FieldErrorMatch[]).map((entry) => (typeof entry === 'string' ? { kind: entry } : entry));
}

/** A message is compared only where the spec named one, so `'required'` alone still matches. */
function isSameError(actual: FieldError, expected: FieldError): boolean {
  return actual.kind === expected.kind && (expected.message === undefined || actual.message === expected.message);
}

/** Every expected error matched by one actual error, and none left over — order does not count. */
function hasSameErrors(actual: readonly FieldError[], expected: readonly FieldError[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }

  const left = [...actual];

  return expected.every((want) => {
    const index = left.findIndex((have) => isSameError(have, want));

    if (index === -1) {
      return false;
    }

    left.splice(index, 1);

    return true;
  });
}

function printErrors(errors: readonly FieldError[]): string {
  return errors.length === 0
    ? 'no errors'
    : errors.map((error) => (error.message === undefined ? error.kind : `${error.kind} (${error.message})`)).join(', ');
}

/**
 * Register {@link Chai.Assertion.toHaveFieldErrors} with the runner. Call once, from your setup file.
 *
 * @example
 * ```ts
 * registerFormMatchers(); // once, in the setup file
 *
 * expect(user.email).toHaveFieldErrors(['required']);
 * expect(user.email()).toHaveFieldErrors([]); // the state reads as well as the tree
 * ```
 */
export function registerFormMatchers(): void {
  expect.extend({
    toHaveFieldErrors(received: unknown, expected: FieldErrorMatch | readonly FieldErrorMatch[]): MatcherResult {
      const actual = errorsOf(received);

      if (actual === undefined) {
        throw new Error(
          withDocs(
            `[vitest-auto-spy] toHaveFieldErrors: expected a field of a signal form — form.email or form.email() — received ${this.utils.printReceived(received)}.`,
            DOCS_LINKS.signalForms,
          ),
        );
      }

      const want = expectedErrors(expected);
      const pass = hasSameErrors(actual, want);

      return {
        pass,
        actual,
        expected: want,
        message: (): string => `expected the field ${pass ? 'not ' : ''}to have ${printErrors(want)}, got ${printErrors(actual)}`,
      };
    },
  });
}
