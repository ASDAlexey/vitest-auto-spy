/**
 * The `as Spy<X>` cast a migrated suite carries, checked from both sides. The fix is a
 * transposition, so the whole rewrite is asserted character for character.
 */
import { type LintMessage } from 'eslint';
import { describe, expect, it } from 'vitest';

import { fixRule, runRule } from './run-rule';

const RULE = 'prefer-as-spy';

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

describe('prefer-as-spy', () => {
  it('flags the cast a migrated suite carries in every file', () => {
    expect(lint('devices = TestBed.inject(DeviceListService) as Spy<DeviceListService>;')).toEqual(['vitest-auto-spy/prefer-as-spy']);
    // Not only next to `TestBed.inject`: the cast is the report, wherever the value came from.
    expect(lint('const cart = injector.get(CartService) as Spy<CartService>;')).toHaveLength(1);
    expect(lint('(component.cart as Spy<CartService>).total.mockReturnValue(1);')).toHaveLength(1);
  });

  it('leaves everything that is not a cast to this library’s Spy alone', () => {
    expect(lint('const cart = asSpy(TestBed.inject(CartService));')).toEqual([]);
    expect(lint('const cart = TestBed.inject(CartService) as CartService;')).toEqual([]);
    expect(lint('let cart: Spy<CartService>;')).toEqual([]);
    // A `Spy` the file declares itself is somebody else's type, and there is nothing to say about a
    // cast to it — unlike a `Mocked<T>` declaration, which is wrong whoever owns the name.
    expect(lint('type Spy<T> = T;\nconst cart = TestBed.inject(CartService) as Spy<CartService>;')).toEqual([]);
  });

  it('rewrites the cast as the call and brings the asSpy import with it', () => {
    expect(autofix('devices = TestBed.inject(DeviceListService) as Spy<DeviceListService>;')).toBe(
      "import { asSpy } from 'vitest-auto-spy';\ndevices = asSpy<DeviceListService>(TestBed.inject(DeviceListService));",
    );
  });

  it('carries the type arguments across verbatim, the second one included', () => {
    // `Spy<T, Options>` and `asSpy<T, Options>` take the same parameter list, so the rewrite is a
    // transposition — the overload option survives it, where inference would silently drop it.
    expect(
      autofix("import { asSpy } from 'vitest-auto-spy';\nconst c = TestBed.inject(Cinemas) as Spy<Cinemas, { overload: 'first' }>;"),
    ).toBe("import { asSpy } from 'vitest-auto-spy';\nconst c = asSpy<Cinemas, { overload: 'first' }>(TestBed.inject(Cinemas));");
    // Nothing to carry: a bare `Spy` names no type, and the call infers what the cast could not say.
    expect(autofix("import { asSpy } from 'vitest-auto-spy';\nconst cart = service as Spy;")).toBe(
      "import { asSpy } from 'vitest-auto-spy';\nconst cart = asSpy(service);",
    );
  });

  it('takes the orphaned Spy import with it, and only once it is orphaned', () => {
    // The cast was the last thing naming the type.
    expect(autofix("import type { Spy } from 'vitest-auto-spy';\nconst cart = TestBed.inject(Cart) as Spy<Cart>;")).toBe(
      "import { asSpy } from 'vitest-auto-spy';\n\nconst cart = asSpy<Cart>(TestBed.inject(Cart));",
    );
    // The declaration above still names it, so the import stays.
    expect(autofix("import type { Spy } from 'vitest-auto-spy';\nlet cart: Spy<Cart>;\ncart = TestBed.inject(Cart) as Spy<Cart>;")).toBe(
      "import { asSpy } from 'vitest-auto-spy';\nimport type { Spy } from 'vitest-auto-spy';\nlet cart: Spy<Cart>;\ncart = asSpy<Cart>(TestBed.inject(Cart));",
    );
  });

  it('does not add an asSpy import the file already has', () => {
    expect(autofix("import { asSpy } from 'vitest-auto-spy';\nconst cart = service as Spy<Cart>;")).toBe(
      "import { asSpy } from 'vitest-auto-spy';\nconst cart = asSpy<Cart>(service);",
    );
  });

  it('reports without fixing when the name is already something else here', () => {
    expect(autofix('const asSpy = 1;\nconst cart = service as Spy<Cart>;')).toBe('const asSpy = 1;\nconst cart = service as Spy<Cart>;');
    expect(lint('const asSpy = 1;\nconst cart = service as Spy<Cart>;')).toHaveLength(1);
  });

  it('unwraps the `as unknown` hop only where the value is provably the instance', () => {
    // `TestBed.inject(X)` returns `X` by construction: the `as unknown` was there to silence TS2352.
    expect(autofix("import { asSpy } from 'vitest-auto-spy';\nconst cart = TestBed.inject(Cart) as unknown as Spy<Cart>;")).toBe(
      "import { asSpy } from 'vitest-auto-spy';\nconst cart = asSpy<Cart>(TestBed.inject(Cart));",
    );
    // Anywhere else the hop through `unknown` says the value is *not* a `Cart`, so `asSpy<Cart>(…)`
    // would not compile — that shape wants a real double, and this rule stays out of it.
    expect(lint('const cart = {} as unknown as Spy<Cart>;')).toEqual([]);
    expect(lint('const cart = TestBed.get(Cart) as unknown as Spy<Cart>;')).toEqual([]);
    expect(lint('const cart = (service as CartService) as Spy<Cart>;')).toEqual([]);
  });
});
