/**
 * `Mocked<T>` where `Spy<T>` belongs, checked from both sides: the plain fix where the
 * declaration really is the whole edit, and the suggestion everywhere a rewrite cannot be proven.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

const RULE = 'no-mocked-for-spy';

/** Lint one snippet with only this rule enabled. */
function verify(code: string): LintMessage[] {
  return runRule(RULE, code);
}

/** The rule ids reported for a snippet. */
function lint(code: string): string[] {
  return verify(code).map((message) => message.ruleId ?? 'parse-error');
}

/** Run the rule the way `eslint --fix` does, repeated passes and all. */
function autofix(code: string): string {
  return fixRule(RULE, code).output;
}

/** What the editor would offer for the first report. */
function suggestionsFor(code: string): string[] {
  return (verify(code)[0]?.suggestions ?? []).map((suggestion) => suggestion.desc);
}

/** The source as it would read after accepting the first report's first suggestion. */
function applySuggestion(code: string): string {
  const suggestion = verify(code)[0]?.suggestions?.[0];

  if (!suggestion) {
    return code;
  }

  const [start, end] = suggestion.fix.range;

  return `${code.slice(0, start)}${suggestion.fix.text}${code.slice(end)}`;
}

describe('no-mocked-for-spy', () => {
  it('flags a variable declared as Vitest’s Mocked<T>', () => {
    expect(lint('let cart: Mocked<CartService>;')).toEqual(['vitest-auto-spy/no-mocked-for-spy']);
    expect(lint('let cart: MockedObject<CartService>;')).toHaveLength(1);
  });

  it('flags Mocked<T> wherever the type is written, not only on a let', () => {
    // In all eight reports of one batch the cast stood on the line after the declaration; fixing the
    // declaration and leaving the cast spelled `Mocked` is how one file ends up saying both.
    expect(lint('const http = {} as unknown as Mocked<HttpClient>;')).toHaveLength(1);
    expect(lint('function makeCart(): Mocked<CartService> { return cart; }')).toHaveLength(1);
    expect(lint('const use = (cart: Mocked<CartService>): void => cart.total();')).toHaveLength(1);
  });

  it('leaves the right declaration, and an unrelated call, alone', () => {
    expect(lint('let cart: Spy<CartService>;')).toEqual([]);
    expect(lint('const cart = vi.mocked(service);')).toEqual([]);
  });

  it('renames the type and brings the Spy import with it', () => {
    expect(autofix('let cart: Mocked<CartService>;')).toBe("import type { Spy } from 'vitest-auto-spy';\nlet cart: Spy<CartService>;");
  });

  it('takes the orphaned import with it, and only once it is orphaned', () => {
    // The last surviving specifier is the whole declaration.
    expect(autofix("import { Mocked } from 'vitest';\nlet cart: Mocked<CartService>;")).toBe(
      "import type { Spy } from 'vitest-auto-spy';\n\nlet cart: Spy<CartService>;",
    );
    // One of several: the list is re-printed without it.
    expect(autofix("import { Mocked, vi } from 'vitest';\nlet cart: Mocked<CartService>;")).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nimport { vi } from 'vitest';\nlet cart: Spy<CartService>;",
    );
    // Two declarations: the import goes on the pass that rewrites the last of them, and the `Spy`
    // import is added once — the second pass finds it already there.
    expect(autofix("import { Mocked } from 'vitest';\nlet a: Mocked<CartService>;\nlet b: Mocked<CartService>;")).toBe(
      "import type { Spy } from 'vitest-auto-spy';\n\nlet a: Spy<CartService>;\nlet b: Spy<CartService>;",
    );
  });

  it('renames but leaves the import where it cannot be cut cleanly', () => {
    // A default import is not a named specifier, so there is nothing to take out of the braces.
    expect(autofix("import Mocked from 'vitest';\nlet cart: Mocked<CartService>;")).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nimport Mocked from 'vitest';\nlet cart: Spy<CartService>;",
    );
    // Re-joining the survivors with commas would move the default import inside the braces.
    expect(autofix("import vitest, { Mocked } from 'vitest';\nlet cart: Mocked<CartService>;")).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nimport vitest, { Mocked } from 'vitest';\nlet cart: Spy<CartService>;",
    );
  });

  it('does not add a Spy import the file already has', () => {
    expect(autofix("import type { Spy } from 'vitest-auto-spy';\nlet cart: Mocked<CartService>;")).toBe(
      "import type { Spy } from 'vitest-auto-spy';\nlet cart: Spy<CartService>;",
    );
  });

  it('reports without fixing what it cannot prove', () => {
    // A `Mocked` this file declares is not Vitest’s.
    expect(autofix('type Mocked<T> = T;\nlet cart: Mocked<CartService>;')).toBe('type Mocked<T> = T;\nlet cart: Mocked<CartService>;');
    // `Spy<T>` reads a class or an interface; an object literal of `Mock`s is a different question.
    expect(autofix('let cart: Mocked<{ total: Mock }>;')).toBe('let cart: Mocked<{ total: Mock }>;');
    // No type argument at all.
    expect(autofix('let cart: Mocked;')).toBe('let cart: Mocked;');
    // `Spy` already means something else here.
    expect(autofix('const Spy = 1;\nlet cart: Mocked<CartService>;')).toBe('const Spy = 1;\nlet cart: Mocked<CartService>;');
    // …and each of those is still reported.
    expect(lint('let cart: Mocked;')).toHaveLength(1);
  });

  it('demotes the fix to a suggestion when what is assigned is not one of the library’s doubles', () => {
    // The shape that shipped uncompilable code: the declaration was rewritten, the object literal a
    // few lines below was not, `eslint --fix` reported clean and the type gate failed afterwards.
    const literal = 'let register: Mocked<Registry>;\nregister = { metrics: vi.fn() };';

    expect(autofix(literal)).toBe(literal);
    expect(suggestionsFor(literal)).toEqual([
      'Declare Spy<T> — and rebuild what is assigned to it, which Spy<T> will reject if it is a literal',
    ]);
    expect(applySuggestion(literal)).toContain('Spy<Registry>');

    // The annotation of the real report sat behind an intersection.
    const intersection = "let register: Mocked<Registry> & { contentType: string };\nregister = { contentType: 'x' };";

    expect(autofix(intersection)).toBe(intersection);

    // The same question one line up, when the declaration carries the literal itself.
    const initialised = 'let cart: Mocked<CartService> = { total: vi.fn() };';

    expect(autofix(initialised)).toBe(initialised);

    // A name assigned twice is only as safe as its worst assignment.
    const both = 'let cart: Mocked<CartService>;\ncart = createSpyFromClass(CartService);\ncart = { total: vi.fn() };';

    expect(autofix(both)).toBe(both);
  });

  it('keeps the plain fix where the declaration really is the whole edit', () => {
    // A value this library built is a `Spy<T>` already, so the rename cannot break the assignment.
    expect(autofix('let cart: Mocked<CartService>;\ncart = createSpyFromClass(CartService);')).toContain('let cart: Spy<CartService>;');
    expect(autofix('let cart: Mocked<CartService> = injectSpy(CartService);')).toContain('let cart: Spy<CartService>');
    // An assignment to a member says nothing about the name declared here.
    expect(autofix('let cart: Mocked<CartService>;\nstate.cart = { total: vi.fn() };')).toContain('let cart: Spy<CartService>;');
  });
});
