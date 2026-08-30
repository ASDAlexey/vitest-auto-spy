/**
 * The one failure no double library can work around, said in words that name the way out.
 *
 * `TypeError: Cannot redefine property: injectDomainMetrics` is technically accurate and practically
 * useless: it names neither the object, nor the reason the property is locked, nor the one thing
 * that resolves it. Two seams in this package end in the same `Object.defineProperty` and therefore
 * in that same `TypeError` — the accessor spies behind {@link MockAdapter}, and the `mock*Prop`
 * helpers — so the explanation lives here once rather than in each of them.
 *
 * The reader arriving here has usually already spent a round on the quiet half of the same problem:
 * `vi.mock()` of the module whose export they are trying to replace is a **silent** no-op under a
 * bundler, and this is what they hit second.
 */
import { DOCS_LINKS, withDocs } from './docs-links';

/**
 * What every runtime says, and only that, when a property refuses to be redefined.
 *
 * Vitest's `vi.spyOn`, Bun's and `node:test`'s redefine path and a bare `Object.defineProperty` all
 * end in the same operation, so the same `TypeError` comes back from all of them. Matching on the
 * message is the only option — the error carries no code — but it is a message V8, JavaScriptCore
 * and SpiderMonkey all spell this way, and a miss only means the original error is re-thrown
 * untouched.
 */
const CANNOT_REDEFINE = 'Cannot redefine property';

/** Whether a thrown value is the runtime refusing to redefine a non-configurable property. */
export function isCannotRedefine(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes(CANNOT_REDEFINE);
}

/** What the target is, in the words that make the failure diagnosable. */
export function describeSpyTarget(target: object): string {
  if (Reflect.get(target, Symbol.toStringTag) === 'Module') {
    return 'an ES module namespace';
  }

  if (Object.isFrozen(target)) {
    return 'a frozen object';
  }

  const constructor: unknown = Reflect.get(target, 'constructor');
  const name = typeof constructor === 'function' ? constructor.name : undefined;

  return name === undefined || name === 'Object' ? 'a plain object' : `an instance of ${name}`;
}

/**
 * Everything true of the failure regardless of which seam ran into it.
 *
 * Kept as one string because both halves are load-bearing: the first paragraph tells the reader that
 * no library can help — including the one they are reading the message from — and the second gives
 * the only repair, which is a change to the code under test rather than to the spec.
 */
const REDEFINE_ADVICE =
  'An ES module namespace is what a bundler leaves behind once it has inlined a barrel or a workspace alias ' +
  '(`@angular/build:unit-test`, a pre-bundled `vite-node` entry): the export is a live binding, not a writable ' +
  'property, and no spy library — this one, `vi.spyOn`, `jest.spyOn` — can replace it. `vi.mock()` of the same ' +
  'module is the silent version of this failure, not the fix.\n' +
  'Give the code under test a real seam and spy on that: inject the dependency, pass it in as an argument, or ' +
  'reach it through a class or object your own code owns.';

/**
 * Build the replacement error.
 *
 * `lead` is the sentence that differs per seam — what was being attempted and on what — and is
 * written as a complete sentence by the caller, because "spy on the get accessor of X" and "replace
 * the property X" are not two values of one template.
 */
export function redefineFailure(lead: string, target: object, cause: unknown): Error {
  return new Error(
    withDocs(`[vitest-auto-spy] ${lead} The target is ${describeSpyTarget(target)}.\n${REDEFINE_ADVICE}`, DOCS_LINKS.realSeam),
    {
      cause,
    },
  );
}
