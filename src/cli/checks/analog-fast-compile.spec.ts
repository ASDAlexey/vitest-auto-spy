import { afterEach, describe, expect, it } from 'vitest';

import { readProfile } from '../profile';
import type { Finding } from '../report';
import { createTempRepo, removeTempRepos } from '../temp-repo';
import { checkAnalogFastCompile, constructorInjectedClasses, needsTypeToken, splitParameters } from './analog-fast-compile';
import { buildGraph } from './graph';

afterEach(() => {
  removeTempRepos();
});

const FAST =
  "import angular from '@analogjs/vite-plugin-angular';\nexport default defineConfig({ plugins: [angular({ fastCompile: true })] });\n";

const CART = [
  "import { Injectable } from '@angular/core';",
  '@Injectable({ providedIn: "root" })',
  'export class CartService {',
  '  constructor(private readonly tax: TaxService) {}',
  '}',
].join('\n');

const findingsIn = (files: Record<string, string>): Finding[] => {
  const profile = readProfile(createTempRepo({ 'package.json': '{}', ...files }));

  return checkAnalogFastCompile(buildGraph(profile));
};

describe('constructorInjectedClasses', () => {
  it('names an @Injectable class whose constructor takes a required parameter', () => {
    expect(constructorInjectedClasses(CART)).toEqual(['CartService']);
    expect(constructorInjectedClasses('@Service() abstract class Store { constructor(http: Http) {} }')).toEqual(['Store']);
  });

  it('ignores classes Angular can build without a constructor token', () => {
    const text = [
      '@Injectable() export class Fields { readonly tax = inject(Tax); }',
      '@Injectable() export class Defaults { constructor(readonly tax = inject(Tax)) {} }',
      '@Injectable() export class Empty { constructor() {} }',
      '@Injectable() export class Tokens { constructor(@Inject(Tax) tax: Tax, @Optional() @Inject(RATE) rate: number) {} }',
      '@Injectable() export class Nested { run() { this.constructor(1); } }',
      "@Component({ selector: 'app-x', template: '' }) export class Cmp { constructor(tax: Tax) {} }",
      "const quoted = '@Injectable() class Quoted { constructor(tax: Tax) {} }';",
      '// @Injectable() class Commented { constructor(tax: Tax) {} }',
      '@Injectable() export const notAClass = 1;',
      '@Injectable( class Broken {',
      '@Injectable() class Unterminated { constructor(tax: Tax) {',
    ].join('\n');

    expect(constructorInjectedClasses(text)).toEqual([]);
    expect(constructorInjectedClasses('export class Plain { constructor(tax: Tax) {} }')).toEqual([]);
  });

  it('finds the constructor after members with bodies of their own', () => {
    const text =
      '@Injectable()\nexport class Late {\n  readonly map = { a: "constructor(x: X)" };\n  get x() { return 1; }\n  constructor(@Inject(TOKEN) value: string, @Optional() tax: Tax) {}\n}';

    expect(constructorInjectedClasses(text)).toEqual(['Late']);
  });
});

describe('parameter lists', () => {
  it('splits at top-level commas only, through type arguments and arrow types', () => {
    expect(splitParameters('a: Map<string, number>, b: (x: A, y: B) => void, c: { d: 1, e: 2 }, ')).toEqual([
      'a: Map<string, number>',
      'b: (x: A, y: B) => void',
      'c: { d: 1, e: 2 }',
    ]);
  });

  it('reads a top-level `=` as a default, an arrow as a type and `@Inject` as a token', () => {
    expect(needsTypeToken('@Inject(Tax) readonly tax: Tax')).toBe(false);
    expect(needsTypeToken('@Optional() readonly tax: Tax')).toBe(true);
    expect(needsTypeToken('cb: (x: A) => void')).toBe(true);
    expect(needsTypeToken('m: Array<Map<a, b>>')).toBe(true);
    expect(needsTypeToken('m: Map<a, b> = new Map()')).toBe(false);
    expect(needsTypeToken('opts: { a: number } = { a: 1 }')).toBe(false);
  });
});

describe('checkAnalogFastCompile', () => {
  it('warns once per JIT fastCompile config and lists each constructor-injected class', () => {
    const findings = findingsIn({ 'vite.config.ts': FAST, 'src/cart.service.ts': CART });

    expect(findings).toEqual([
      expect.objectContaining({
        check: 'analog-fast-compile-ctor-injection',
        severity: 'warning',
        file: 'vite.config.ts',
        details: ['src/cart.service.ts: CartService'],
      }),
    ]);
    expect(findings[0]?.message).toContain('1 `@Injectable` class takes constructor parameters known only by their type');
    expect(findings[0]?.message).toContain('NG0202');
    expect(findings[0]?.fix).toContain('inject()');
  });

  it('caps the list and counts the rest', () => {
    const services = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [`src/s${String(index).padStart(2, '0')}.service.ts`, CART]),
    );
    const [finding] = findingsIn({ 'vitest.config.mts': FAST, ...services });

    expect(finding?.message).toContain('12 `@Injectable` classes take');
    expect(finding?.details).toHaveLength(11);
    expect(finding?.details?.at(-1)).toBe('… and 2 more');
  });

  it('stays silent when fastCompile is off, runs AOT, or nothing is constructor-injected', () => {
    expect(findingsIn({ 'vite.config.ts': FAST.replace('true', 'false'), 'src/cart.service.ts': CART })).toEqual([]);
    expect(
      findingsIn({ 'vite.config.ts': FAST.replace('fastCompile: true', 'fastCompile: true, jit: false'), 'src/cart.service.ts': CART }),
    ).toEqual([]);
    expect(findingsIn({ 'vite.config.ts': FAST, 'src/cart.service.ts': CART.replace('private readonly tax: TaxService', '') })).toEqual([]);
    expect(findingsIn({ 'src/cart.service.ts': CART })).toEqual([]);
  });
});
