/**
 * The one failure no double library can work around, said in words that name the way out.
 *
 * `TypeError: Cannot redefine property: injectAppMetrics` is technically accurate and practically
 * useless: it names neither the object, nor the reason the property is locked, nor the one thing
 * that resolves it. Two seams in this package end in the same `Object.defineProperty` and therefore
 * in that same `TypeError` — the accessor spies behind {@link MockAdapter}, and the `mock*Prop`
 * helpers — so the explanation lives here once rather than in each of them.
 *
 * The reader arriving here has usually already spent a round on the quiet half of the same problem:
 * `vi.mock()` of the module whose export they are trying to replace is a **silent** no-op under a
 * bundler, and this is what they hit second.
 */
import * as DOCS_LINKS from './docs-links';
import { withDocs } from './message-link';

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
 * The module-namespace case, where no double library can help: the first paragraph says so, the
 * second gives the only repair, which is a change to the code under test rather than to the spec.
 */
const NAMESPACE_ADVICE =
  'An ES module namespace is what a bundler leaves behind once it has inlined a barrel or a workspace alias ' +
  '(`@angular/build:unit-test`, a pre-bundled `vite-node` entry): the export is a live binding, not a writable ' +
  'property, and no spy library — this one, `vi.spyOn`, `jest.spyOn` — can replace it. `vi.mock()` of the same ' +
  'module is the silent version of this failure, not the fix.\n' +
  'Give the code under test a real seam and spy on that: inject the dependency, pass it in as an argument, or ' +
  'reach it through a class or object your own code owns.';

function adviceFor(description: string, target: object, property: PropertyKey | undefined): [advice: string, link: string] {
  if (description === 'an ES module namespace') {
    return [NAMESPACE_ADVICE, DOCS_LINKS.realSeam];
  }

  if (description === 'a frozen object') {
    return [
      'A frozen object refuses every change. Hand the code under test a copy ({ ...object }) and spy on that, or a double built with createSpyFromClass.',
      DOCS_LINKS.createSpyFromClass,
    ];
  }

  if (description === 'a plain object') {
    return [
      'Hand the code under test a copy ({ ...object }) and patch that, or a double built with createAutoMock<T>().',
      DOCS_LINKS.autoMockByType,
    ];
  }

  const className = String(Reflect.get(Object(Reflect.get(target, 'constructor')), 'name'));
  const accessor = property !== undefined && typeof Reflect.get(target, property) !== 'function';
  const option = accessor ? `, { gettersToSpyOn: ['${String(property)}'] }` : '';

  return [
    `Build a double instead of patching the real instance: createSpyFromClass(${className}${option}).`,
    DOCS_LINKS.createSpyFromClassAccessorSpies,
  ];
}

/**
 * Build the replacement error.
 *
 * `lead` is the sentence that differs per seam — what was being attempted and on what — and is
 * written as a complete sentence by the caller, because "spy on the get accessor of X" and "replace
 * the property X" are not two values of one template.
 */
export function redefineFailure(lead: string, target: object, cause: unknown, property?: PropertyKey): Error {
  const description = describeSpyTarget(target);
  const [advice, link] = adviceFor(description, target, property);

  return new Error(withDocs(`[vitest-auto-spy] ${lead} The target is ${description}.\n${advice}`, link), { cause });
}
